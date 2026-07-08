#!/usr/bin/env node
// daily-financial-note.mjs
// Renders a cou$in "financial daily note" (Obsidian markdown) for a target date
// and writes it to  <vault>/Personal/Financial/DailyNotes/<YYYY-MM-DD>.md
//
// Two data sources:
//   1. --from-json <file>  : read a JSON payload produced by the Cousin MCP
//                            (single query in scripts/note-query.sql). No DB
//                            connection is opened. This is how the scheduled
//                            task runs, because the MCP is what can reach the DB.
//   2. direct (fallback)   : connect to Supabase with `pg` using DATABASE_URL
//                            from .env (only works where the DB host is reachable).
//
// Change-detection strategy (per owner decision):
//   - "New that day"       -> created_at (in LOCAL_TZ) == target date
//   - "marked paid/received", "newly flagged", "deactivated recurrence",
//     "wallet balance delta" -> diff current state against the snapshot saved on
//     the previous run (.cousin-state.json alongside the notes).
//
// Usage:
//   node scripts/daily-financial-note.mjs [YYYY-MM-DD] [--from-json <file>] [--dry] [--no-state]
//     no date arg          -> "today" in LOCAL_TZ (payload.date overrides in --from-json mode)
//     --from-json <file>   : render from an MCP payload instead of connecting
//     --dry                : print the note to stdout; do not write files/snapshot
//     --no-state           : ignore/don't-write the snapshot (activity-only diff sections)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------------ config ---
const LOCAL_TZ = process.env.COUSIN_TZ || "America/Sao_Paulo"; // date attribution
const CURRENCY = process.env.COUSIN_CURRENCY || "BRL";
const LOCALE = process.env.COUSIN_LOCALE || "pt-BR";
const SUPABASE_REGION = process.env.COUSIN_SUPABASE_REGION || "sa-east-1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, ".."); // .../cousin-backend

// ---------------------------------------------------------------- helpers ---
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const NO_STATE = args.includes("--no-state");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const fromJsonIdx = args.indexOf("--from-json");
const FROM_JSON = fromJsonIdx >= 0 ? args[fromJsonIdx + 1] : null;

function todayInTz(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}
let D = dateArg || todayInTz(LOCAL_TZ);

const money = (v) =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY }).format(
    Number(v ?? 0),
  );
const signed = (v) => {
  const n = Number(v ?? 0);
  return (n >= 0 ? "+" : "") + money(n);
};

// Resolve the Obsidian vault (MyObsidian) mount. Both the Cousin repo and the
// vault are sibling mounts, so walk up to the shared mount root and look for
// MyObsidian. Falls back to COUSIN_NOTES_DIR if set.
function resolveNotesDir() {
  if (process.env.COUSIN_NOTES_DIR) return process.env.COUSIN_NOTES_DIR;
  let dir = BACKEND_DIR;
  for (let i = 0; i < 8; i++) {
    const parent = path.dirname(dir);
    if (fs.existsSync(path.join(parent, "MyObsidian"))) {
      return path.join(parent, "MyObsidian", "Personal", "Financial", "DailyNotes");
    }
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not locate the MyObsidian vault. Set COUSIN_NOTES_DIR to the DailyNotes folder.",
  );
}

// -------------------------------------------------------------- connection ---
// (Direct pg path — only used when --from-json is NOT supplied.)
function readEnvDatabaseUrl() {
  if (process.env.COUSIN_DB_URL) return process.env.COUSIN_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(BACKEND_DIR, ".env");
  const raw = fs.readFileSync(envPath, "utf8");
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL not found in .env");
  return m[1].trim();
}

function connectionCandidates(rawUrl) {
  const out = [];
  if (process.env.COUSIN_DB_URL) {
    out.push({ label: "COUSIN_DB_URL override", connectionString: process.env.COUSIN_DB_URL });
  }
  try {
    const u = new URL(rawUrl);
    const refMatch = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (refMatch) {
      const ref = refMatch[1];
      out.push({
        label: `session pooler (${SUPABASE_REGION})`,
        config: {
          host: `aws-0-${SUPABASE_REGION}.pooler.supabase.com`,
          port: 5432,
          user: `postgres.${ref}`,
          password: decodeURIComponent(u.password),
          database: (u.pathname || "/postgres").slice(1) || "postgres",
          ssl: { rejectUnauthorized: false },
        },
      });
    }
  } catch {
    /* ignore parse errors */
  }
  out.push({
    label: "raw DATABASE_URL",
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false },
  });
  return out;
}

async function connect() {
  const pg = (await import("pg")).default;
  const raw = readEnvDatabaseUrl();
  const candidates = connectionCandidates(raw);
  const errors = [];
  for (const c of candidates) {
    const client = c.config
      ? new pg.Client(c.config)
      : new pg.Client({ connectionString: c.connectionString, ssl: c.ssl });
    try {
      await client.connect();
      return { client, via: c.label };
    } catch (e) {
      errors.push(`  - ${c.label}: ${e.message}`);
      try {
        await client.end();
      } catch {}
    }
  }
  throw new Error(
    "Could not connect to the Supabase database. Tried:\n" +
      errors.join("\n") +
      "\n\nPrefer running via the Cousin MCP (--from-json). See scripts/note-query.sql.",
  );
}

const KIND_SQL = `case
  when t.from_type='external' and t.to_type='wallet' then 'moneyIn'
  when t.from_type='wallet'   and t.to_type='external' then 'moneyOut'
  when t.from_type='revenue'  and t.to_type='wallet' then 'revenueRealized'
  when t.from_type='wallet'   and t.to_type='bill' then 'billPaid'
  when t.from_type='wallet'   and t.to_type='wallet' and t.from_id<>t.to_id then 'internalTransfer'
  when t.from_type='wallet'   and t.to_type='wallet' and t.from_id=t.to_id then 'manualAdjustment'
  else 'unknown' end`;
const SIGN_SQL = `case
  when t.to_type='wallet' and t.from_type in ('external','revenue') then '+'
  when t.from_type='wallet' and t.to_type in ('external','bill') then '-'
  else '0' end`;

async function gather(db) {
  const q = (text, params) => db.query(text, params).then((r) => r.rows);
  const [
    newTxns, bills, revenues, wallets, recurrences,
    dayFlow, dashboardTotals, pendingTotal, pendingPerWallet, categories,
  ] = await Promise.all([
    q(`select t.id, t.amount::text as amount, t.date::text as date, t.method,
              t.description, t.from_type, t.from_id, t.to_type, t.to_id, t.category_id,
              t.installment_number, t.installment_total,
              ${KIND_SQL} as kind, ${SIGN_SQL} as sign
         from transactions t
        where (t.created_at at time zone $2)::date = $1::date
        order by t.created_at asc`, [D, LOCAL_TZ]),
    q(`select b.id, b.name, b.value::text as value, b.term::text as term, b.paid,
              b.source_id, b.recurrence_id,
              exists(select 1 from transactions x where x.to_type='bill' and x.to_id=b.id) as has_linked,
              ((b.paid and not exists(select 1 from transactions x where x.to_type='bill' and x.to_id=b.id))
               or (not b.paid and b.term < $1::date)) as flagged
         from bills b`, [D]),
    q(`select r.id, r.name, r.value::text as value, r.term::text as term, r.received,
              r.source_id, r.recurrence_id,
              exists(select 1 from transactions x where x.from_type='revenue' and x.from_id=r.id) as has_linked,
              ((r.received and not exists(select 1 from transactions x where x.from_type='revenue' and x.from_id=r.id))
               or (not r.received and r.term < $1::date)) as flagged
         from revenues r`, [D]),
    q(`select id, name, balance::text as balance, archived from wallets order by name asc`),
    q(`select rc.id, rc.is_variable, rc.interval_unit, rc.interval_value,
              rc.recurrent_day, rc.recurrent_month, rc.estimated_value::text as estimated_value,
              (rc.created_at at time zone $2)::date::text as created_date,
              (exists(select 1 from bills b where b.recurrence_id=rc.id)
               or exists(select 1 from revenues r where r.recurrence_id=rc.id)) as active
         from recurrences rc`, [D, LOCAL_TZ]),
    q(`select
         coalesce(sum(case when t.from_type in ('external','revenue') and t.to_type='wallet' then t.amount else 0 end),0)::text as "in",
         coalesce(sum(case when t.from_type='wallet' and t.to_type in ('external','bill') then t.amount else 0 end),0)::text as "out"
       from transactions t
       where t.date = $1::date and not (t.from_type='wallet' and t.to_type='wallet')`, [D]),
    q(`select
         (select coalesce(sum(value),0) from revenues where term=$1::date)::text as revenue,
         (select coalesce(sum(value),0) from bills where term=$1::date)::text as outcome`, [D]),
    q(`select coalesce(sum(amount),0)::text as total from transactions where method='credit' and settled=false`),
    q(`select w.id as wallet_id, w.name as wallet_name, coalesce(sum(t.amount),0)::text as total
         from transactions t join wallets w on w.id = t.from_id
        where t.method='credit' and t.settled=false
        group by w.id, w.name order by w.name asc`),
    q(`select id, name from categories`),
  ]);
  return {
    newTxns, bills, revenues, wallets, recurrences,
    dayFlow: dayFlow[0], dashboardTotals: dashboardTotals[0],
    pendingTotal: pendingTotal[0].total, pendingPerWallet, categories,
  };
}

// Fill in derived/default fields so both data sources feed render() identically.
function normalize(data) {
  data.newTxns ??= [];
  data.bills ??= [];
  data.revenues ??= [];
  data.wallets ??= [];
  data.recurrences ??= [];
  data.pendingPerWallet ??= [];
  data.categories ??= [];
  data.dayFlow ??= { in: "0", out: "0" };
  data.dashboardTotals ??= { revenue: "0", outcome: "0" };
  data.pendingTotal ??= "0";
  data.walletName = Object.fromEntries((data.wallets || []).map((w) => [w.id, w.name]));
  data.categoryName = Object.fromEntries((data.categories || []).map((c) => [c.id, c.name]));
  return data;
}

// -------------------------------------------------------------- snapshot ----
function loadSnapshot(dir) {
  const p = path.join(dir, ".cousin-state.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function buildSnapshot(data) {
  return {
    savedAt: new Date().toISOString(),
    date: D,
    walletBalances: Object.fromEntries(data.wallets.map((w) => [w.id, w.balance])),
    paidBillIds: data.bills.filter((b) => b.paid).map((b) => b.id),
    receivedRevenueIds: data.revenues.filter((r) => r.received).map((r) => r.id),
    flaggedBillIds: data.bills.filter((b) => b.flagged).map((b) => b.id),
    flaggedRevenueIds: data.revenues.filter((r) => r.flagged).map((r) => r.id),
    activeRecurrenceIds: data.recurrences.filter((rc) => rc.active).map((rc) => rc.id),
  };
}
function saveSnapshot(dir, snap) {
  fs.writeFileSync(path.join(dir, ".cousin-state.json"), JSON.stringify(snap, null, 2));
}

// ---------------------------------------------------------------- rendering --
const KIND_LABEL = {
  moneyIn: "Money in",
  moneyOut: "Money out",
  revenueRealized: "Revenue realized",
  billPaid: "Bill paid",
  internalTransfer: "Internal transfer",
  manualAdjustment: "Manual adjustment",
  unknown: "Unknown",
};
const KIND_ORDER = [
  "moneyIn", "revenueRealized", "moneyOut", "billPaid",
  "internalTransfer", "manualAdjustment", "unknown",
];

function txnCounterparty(t, data) {
  const who = (type, id) =>
    type === "external" ? "external" : data.walletName[id] ?? type;
  return `${who(t.from_type, t.from_id)} → ${who(t.to_type, t.to_id)}`;
}

export function render(data, prev) {
  const L = [];
  L.push(`# ${D} — Financial daily note`);
  L.push("");
  L.push("#Cousin");
  L.push("");

  L.push("## Activity that day");
  L.push("");
  L.push("### New transactions (recorded that day)");
  if (data.newTxns.length === 0) {
    L.push("_None recorded._");
  } else {
    const byKind = new Map();
    for (const t of data.newTxns) {
      if (!byKind.has(t.kind)) byKind.set(t.kind, []);
      byKind.get(t.kind).push(t);
    }
    for (const kind of KIND_ORDER) {
      const rows = byKind.get(kind);
      if (!rows || rows.length === 0) continue;
      const subtotal = rows.reduce((s, r) => s + Number(r.amount), 0);
      L.push(`**${KIND_LABEL[kind]}** — ${rows.length} txn, total ${money(subtotal)}`);
      for (const t of rows) {
        const sgn = t.sign === "0" ? "±" : t.sign;
        const cat = t.category_id ? ` · ${data.categoryName[t.category_id] || "?"}` : "";
        const inst =
          t.installment_total && t.installment_total > 1
            ? ` · installment ${t.installment_number}/${t.installment_total}`
            : "";
        const desc = t.description ? ` — ${t.description}` : "";
        L.push(`- ${sgn}${money(t.amount)} · ${t.method} · ${txnCounterparty(t, data)}${cat}${inst}${desc}`);
      }
      L.push("");
    }
  }
  L.push("");

  const adjustments = data.newTxns.filter((t) => t.kind === "manualAdjustment");
  L.push("### Manual adjustments (balance reconciliations)");
  if (adjustments.length === 0) {
    L.push("_None._");
  } else {
    for (const t of adjustments) {
      const w = data.walletName[t.from_id] || t.from_id;
      L.push(`- ${w}: ${money(t.amount)}${t.description ? ` — ${t.description}` : ""}`);
    }
  }
  L.push("");

  L.push("### Bills marked paid / Revenues marked received");
  if (!prev) {
    L.push("_No prior snapshot — baseline established this run; toggles will appear next run._");
  } else {
    const newlyPaid = data.bills.filter((b) => b.paid && !prev.paidBillIds.includes(b.id));
    const newlyReceived = data.revenues.filter(
      (r) => r.received && !prev.receivedRevenueIds.includes(r.id),
    );
    if (newlyPaid.length === 0 && newlyReceived.length === 0) {
      L.push("_No new paid/received toggles since last run._");
    } else {
      for (const b of newlyPaid) L.push(`- ✅ Bill paid: ${b.name} — ${money(b.value)} (term ${b.term})`);
      for (const r of newlyReceived) L.push(`- 💰 Revenue received: ${r.name} — ${money(r.value)} (term ${r.term})`);
    }
  }
  L.push("");

  L.push("### Recurrences created / deactivated");
  const createdRec = data.recurrences.filter((rc) => rc.created_date === D);
  const deactivated = prev
    ? prev.activeRecurrenceIds.filter((id) => !data.recurrences.some((rc) => rc.id === id && rc.active))
    : [];
  if (createdRec.length === 0 && deactivated.length === 0) {
    L.push("_No recurrence changes._");
  } else {
    for (const rc of createdRec) {
      const every =
        rc.interval_value > 1 ? `every ${rc.interval_value} ${rc.interval_unit}s` : `every ${rc.interval_unit}`;
      const est = rc.is_variable ? ` · variable, est. ${money(rc.estimated_value)}` : " · fixed";
      L.push(`- ➕ New recurrence: ${every}, day ${rc.recurrent_day}${est}`);
    }
    for (const id of deactivated) L.push(`- ➖ Recurrence deactivated/ended: ${id}`);
  }
  L.push("");

  L.push("## Due / state as of that day");
  L.push("");
  const billsDue = data.bills.filter((b) => b.term === D);
  L.push("### Bills due");
  if (billsDue.length === 0) L.push("_None due._");
  else for (const b of billsDue) L.push(`- ${b.paid ? "✅" : "⏳"} ${b.name} — ${money(b.value)}${b.paid ? " (paid)" : ""}`);
  L.push("");

  L.push("### Bills newly flagged");
  if (!prev) {
    L.push("_No prior snapshot — baseline established this run._");
  } else {
    const newlyFlagged = data.bills.filter((b) => b.flagged && !prev.flaggedBillIds.includes(b.id));
    if (newlyFlagged.length === 0) L.push("_None newly flagged._");
    else for (const b of newlyFlagged) L.push(`- 🚩 ${b.name} — ${money(b.value)} (term ${b.term})`);
  }
  L.push("");

  const revDue = data.revenues.filter((r) => r.term === D);
  L.push("### Revenues due");
  if (revDue.length === 0) L.push("_None due._");
  else for (const r of revDue) L.push(`- ${r.received ? "💰" : "⏳"} ${r.name} — ${money(r.value)}${r.received ? " (received)" : ""}`);
  L.push("");

  L.push("### Revenues newly flagged (overdue / unreceived)");
  if (!prev) {
    L.push("_No prior snapshot — baseline established this run._");
  } else {
    const newlyFlagged = data.revenues.filter((r) => r.flagged && !prev.flaggedRevenueIds.includes(r.id));
    if (newlyFlagged.length === 0) L.push("_None newly flagged._");
    else for (const r of newlyFlagged) L.push(`- 🚩 ${r.name} — ${money(r.value)} (term ${r.term})`);
  }
  L.push("");

  L.push("### Wallet balances");
  const active = data.wallets.filter((w) => !w.archived);
  if (active.length === 0) L.push("_No active wallets._");
  else
    for (const w of active) {
      let delta = "";
      if (prev && prev.walletBalances[w.id] !== undefined) {
        const dd = Number(w.balance) - Number(prev.walletBalances[w.id]);
        delta = Math.abs(dd) >= 0.005 ? ` (${signed(dd)} vs last run)` : " (no change)";
      }
      L.push(`- ${w.name}: ${money(w.balance)}${delta}`);
    }
  L.push("");

  L.push("## Rollups");
  L.push("");
  const inV = Number(data.dayFlow.in);
  const outV = Number(data.dayFlow.out);
  L.push(`- **Day net (transactions dated that day):** ${money(inV - outV)}  (in ${money(inV)} − out ${money(outV)})`);
  const dr = Number(data.dashboardTotals.revenue);
  const dout = Number(data.dashboardTotals.outcome);
  L.push(`- **Dashboard basis (terms dated that day):** net ${money(dr - dout)}  (revenue ${money(dr)} − outcome ${money(dout)})`);
  L.push(`- **Pending credit (running):** ${money(data.pendingTotal)}`);
  for (const p of data.pendingPerWallet) L.push(`  - ${p.wallet_name}: ${money(p.total)}`);
  L.push("");
  L.push(`> Generated ${new Date().toISOString()} · tz ${LOCAL_TZ}`);
  L.push("");
  return L.join("\n");
}

// -------------------------------------------------------------------- main ---
async function main() {
  const notesDir = resolveNotesDir();
  let data, via;
  if (FROM_JSON) {
    const payload = JSON.parse(fs.readFileSync(FROM_JSON, "utf8"));
    if (payload.date) D = payload.date;
    data = normalize(payload);
    via = "Cousin MCP payload";
  } else {
    const conn = await connect();
    via = conn.via;
    try {
      data = normalize(await gather(conn.client));
    } finally {
      await conn.client.end();
    }
  }

  const prev = NO_STATE ? null : loadSnapshot(notesDir);
  const note = render(data, prev);

  if (DRY) {
    process.stdout.write(note + "\n");
    console.error(`\n[dry-run] via ${via}; would write ${path.join(notesDir, D + ".md")}`);
    return;
  }
  fs.mkdirSync(notesDir, { recursive: true });
  const outPath = path.join(notesDir, `${D}.md`);
  fs.writeFileSync(outPath, note);
  if (!NO_STATE) saveSnapshot(notesDir, buildSnapshot(data));
  console.log(
    `Wrote ${outPath} (via ${via}). ` +
      `Txns that day: ${data.newTxns.length}; bills due: ${data.bills.filter((b) => b.term === D).length}; ` +
      `revenues due: ${data.revenues.filter((r) => r.term === D).length}.`,
  );
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch((e) => {
    console.error("daily-financial-note failed:", e.message);
    process.exit(1);
  });
}
