-- note-query.sql
-- Single read-only query for the cou$in daily financial note.
-- Run via the Cousin MCP (mcp__cousin__db_query). Returns one row with a JSON
-- `payload` shaped for scripts/daily-financial-note.mjs --from-json.
-- Target date = yesterday in America/Sao_Paulo (computed in-SQL, no substitution
-- needed). To target a different day, replace the `d` CTE, e.g.
--   WITH d AS (SELECT DATE '2026-07-07' AS target)
WITH d AS (
  SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1) AS target
),
-- Previous calendar month relative to the target date. When `target` is the
-- 1st of a month this is exactly "last month"; the renderer only emits the
-- month-in-review section when target is a first-of-month, so the window is
-- always a full calendar month there.
m AS (
  SELECT
    date_trunc('month', (SELECT target FROM d) - interval '1 day')::date AS mstart,
    (date_trunc('month', (SELECT target FROM d))::date - 1)              AS mend,
    (EXTRACT(DAY FROM (SELECT target FROM d)) = 1)                        AS is_first
)
SELECT json_build_object(
  'date', (SELECT to_char(target,'YYYY-MM-DD') FROM d),
  'newTxns', coalesce((SELECT json_agg(r) FROM (
     SELECT t.id, t.amount::text AS amount, t.date::text AS date, t.method,
            t.description, t.from_type, t.from_id, t.to_type, t.to_id, t.category_id,
            t.installment_number, t.installment_total,
            CASE
              WHEN t.from_type='external' AND t.to_type='wallet' THEN 'moneyIn'
              WHEN t.from_type='wallet' AND t.to_type='external' THEN 'moneyOut'
              WHEN t.from_type='revenue' AND t.to_type='wallet' THEN 'revenueRealized'
              WHEN t.from_type='wallet' AND t.to_type='bill' THEN 'billPaid'
              WHEN t.from_type='wallet' AND t.to_type='wallet' AND t.from_id<>t.to_id THEN 'internalTransfer'
              WHEN t.from_type='wallet' AND t.to_type='wallet' AND t.from_id=t.to_id THEN 'manualAdjustment'
              ELSE 'unknown' END AS kind,
            CASE
              WHEN t.to_type='wallet' AND t.from_type IN ('external','revenue') THEN '+'
              WHEN t.from_type='wallet' AND t.to_type IN ('external','bill') THEN '-'
              ELSE '0' END AS sign
     FROM transactions t, d
     WHERE (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = d.target
     ORDER BY t.created_at ASC) r), '[]'::json),
  -- Only bills that can affect any section: due on the target day, currently
  -- paid, or currently flagged. Anything else contributes nothing to the note
  -- or the snapshot, so it is omitted to keep the payload small.
  'bills', coalesce((SELECT json_agg(r) FROM (
     SELECT b.id,b.name,b.value::text AS value,b.term::text AS term,b.paid,
       ((b.paid AND NOT EXISTS(SELECT 1 FROM transactions x WHERE x.to_type='bill' AND x.to_id=b.id))
        OR (NOT b.paid AND b.term < d.target)) AS flagged
     FROM bills b, d
     WHERE b.paid OR b.term <= d.target) r), '[]'::json),
  'revenues', coalesce((SELECT json_agg(r) FROM (
     SELECT rv.id,rv.name,rv.value::text AS value,rv.term::text AS term,rv.received,
       ((rv.received AND NOT EXISTS(SELECT 1 FROM transactions x WHERE x.from_type='revenue' AND x.from_id=rv.id))
        OR (NOT rv.received AND rv.term < d.target)) AS flagged
     FROM revenues rv, d
     WHERE rv.received OR rv.term <= d.target) r), '[]'::json),
  'wallets', coalesce((SELECT json_agg(r) FROM (SELECT id,name,balance::text AS balance,archived FROM wallets ORDER BY name) r), '[]'::json),
  -- Full rows only for recurrences created on the target day (for the "created"
  -- list). Active detection/diff/snapshot use the compact id array below.
  'recurrences', coalesce((SELECT json_agg(r) FROM (
     SELECT rc.id,rc.is_variable,rc.interval_unit,rc.interval_value,rc.recurrent_day,
            rc.estimated_value::text AS estimated_value,
            to_char((rc.created_at AT TIME ZONE 'America/Sao_Paulo')::date,'YYYY-MM-DD') AS created_date,
            true AS active
     FROM recurrences rc, d
     WHERE (rc.created_at AT TIME ZONE 'America/Sao_Paulo')::date = d.target) r), '[]'::json),
  'activeRecurrenceIds', coalesce((SELECT json_agg(rc.id) FROM recurrences rc
     WHERE EXISTS(SELECT 1 FROM bills b WHERE b.recurrence_id=rc.id)
        OR EXISTS(SELECT 1 FROM revenues r2 WHERE r2.recurrence_id=rc.id)), '[]'::json),
  'dayFlow', (SELECT json_build_object(
       'in', coalesce(sum(CASE WHEN t.from_type IN ('external','revenue') AND t.to_type='wallet' THEN t.amount ELSE 0 END),0)::text,
       'out', coalesce(sum(CASE WHEN t.from_type='wallet' AND t.to_type IN ('external','bill') THEN t.amount ELSE 0 END),0)::text)
     FROM transactions t, d WHERE t.date=d.target AND NOT (t.from_type='wallet' AND t.to_type='wallet')),
  'dashboardTotals', json_build_object(
       'revenue', (SELECT coalesce(sum(value),0) FROM revenues,d WHERE term=d.target)::text,
       'outcome', (SELECT coalesce(sum(value),0) FROM bills,d WHERE term=d.target)::text),
  'pendingTotal', (SELECT coalesce(sum(amount),0)::text FROM transactions WHERE method='credit' AND settled=false),
  'pendingPerWallet', coalesce((SELECT json_agg(r) FROM (
       SELECT w.id AS wallet_id, w.name AS wallet_name, coalesce(sum(t.amount),0)::text AS total
       FROM transactions t JOIN wallets w ON w.id=t.from_id
       WHERE t.method='credit' AND t.settled=false GROUP BY w.id,w.name ORDER BY w.name) r), '[]'::json),
  'categories', coalesce((SELECT json_agg(r) FROM (SELECT id,name FROM categories) r), '[]'::json),
  -- Previous-month rollup. Cash-flow figures are actual transactions dated in
  -- the month (internal transfers / manual adjustments excluded, matching the
  -- daily dayFlow convention). Net/saving-rate are derived in the renderer.
  'monthSummary', (SELECT json_build_object(
     'month',        to_char(m.mstart,'YYYY-MM'),
     'monthStart',   to_char(m.mstart,'YYYY-MM-DD'),
     'monthEnd',     to_char(m.mend,'YYYY-MM-DD'),
     'isFirstOfMonth', m.is_first,
     'daysInMonth',  (m.mend - m.mstart + 1),
     'income', (SELECT coalesce(sum(t.amount),0) FROM transactions t
                 WHERE t.date BETWEEN m.mstart AND m.mend
                   AND t.to_type='wallet' AND t.from_type IN ('external','revenue'))::text,
     'outcome', (SELECT coalesce(sum(t.amount),0) FROM transactions t
                 WHERE t.date BETWEEN m.mstart AND m.mend
                   AND t.from_type='wallet' AND t.to_type IN ('external','bill'))::text,
     'billsPaid', (SELECT coalesce(sum(t.amount),0) FROM transactions t
                 WHERE t.date BETWEEN m.mstart AND m.mend
                   AND t.from_type='wallet' AND t.to_type='bill')::text,
     'txnCount', (SELECT count(*) FROM transactions t
                 WHERE t.date BETWEEN m.mstart AND m.mend),
     'outflowTxnCount', (SELECT count(*) FROM transactions t
                 WHERE t.date BETWEEN m.mstart AND m.mend
                   AND t.from_type='wallet' AND t.to_type IN ('external','bill')),
     'uncategorizedOut', (SELECT coalesce(sum(t.amount),0) FROM transactions t
                 WHERE t.date BETWEEN m.mstart AND m.mend
                   AND t.from_type='wallet' AND t.to_type IN ('external','bill')
                   AND t.category_id IS NULL)::text,
     'byCategory', coalesce((SELECT json_agg(r) FROM (
                 SELECT c.id AS category_id, c.name AS name,
                        sum(t.amount)::text AS total, count(*) AS cnt
                 FROM transactions t JOIN categories c ON c.id=t.category_id
                 WHERE t.date BETWEEN m.mstart AND m.mend
                   AND t.from_type='wallet' AND t.to_type IN ('external','bill')
                 GROUP BY c.id,c.name ORDER BY sum(t.amount) DESC) r), '[]'::json),
     'largestExpense', (SELECT json_build_object(
                 'amount', t.amount::text, 'description', t.description,
                 'date', t.date::text, 'method', t.method)
                 FROM transactions t
                 WHERE t.date BETWEEN m.mstart AND m.mend
                   AND t.from_type='wallet' AND t.to_type IN ('external','bill')
                 ORDER BY t.amount DESC LIMIT 1),
     'billsDueInMonth', (SELECT json_build_object(
                 'count', count(*), 'total', coalesce(sum(value),0)::text,
                 'paidCount', count(*) FILTER (WHERE paid),
                 'paidTotal', coalesce(sum(value) FILTER (WHERE paid),0)::text)
                 FROM bills WHERE term BETWEEN m.mstart AND m.mend),
     'revenuesDueInMonth', (SELECT json_build_object(
                 'count', count(*), 'total', coalesce(sum(value),0)::text,
                 'receivedCount', count(*) FILTER (WHERE received),
                 'receivedTotal', coalesce(sum(value) FILTER (WHERE received),0)::text)
                 FROM revenues WHERE term BETWEEN m.mstart AND m.mend),
     'patrimony', (SELECT coalesce(sum(balance),0) FROM wallets WHERE NOT archived)::text
   ) FROM m)
) AS payload;
