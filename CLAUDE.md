# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Greenfield. The repo currently contains only `README.md` — **no source code, no `package.json`, no build/test tooling exists yet.** This is the backend for "cou$in", a personal (single-owner) finance-tracking app. The design is fully specified in companion docs (see "Source-of-truth specs"); implementation starts from those.

## Commands

No build system is configured yet, so there are no build/lint/test commands to run. Intended stack (per specs): **Node.js + TypeScript**, PostgreSQL via **Supabase**. When you scaffold the project, replace this section with the real install / dev / build / lint / typecheck / test (all + single) / DB-migration invocations. Do not infer commands until `package.json` and tooling exist.

## What this repo is

REST API backend for a personal finance tracker: wallets, bills, revenues, transactions, and recurring schedules, plus aggregate views (dashboard, credit statements, per-entity rollups).

- **This repo** implements `db-schema.md` + `api-contracts.md`.
- The frontend is a **separate** React / TanStack Query app, specified in `components-tree.md` / `ui-spec.md` / `design-system.md`. Treat those as the API consumer's concerns, not work for this repo.
- All design specs are committed under `reference-files/` and are the source of truth for implementation.

## Architecture

### The polymorphic transaction model (central concept)

`transactions` is the heart of the system. `from_id` / `to_id` are **polymorphic and have no foreign keys** — the BE owns referential integrity.

- `from_type ∈ {wallet, external, revenue}`, `to_type ∈ {wallet, external, bill}`. Deliberately asymmetric: a revenue can only *source* money, a bill can only *receive* it — there is no `from_type = bill`.
- `from_id` / `to_id` are NULL iff the corresponding type is `external` (DB check constraints enforce this).
- Exactly **six legal `from_type → to_type` combinations** exist (authoritative table in `reference-files/glossary.md`). Before any insert the BE must (1) verify the referenced wallet/revenue/bill row exists and (2) reject pairs outside this set → `422`. Each combination determines the transaction's `kind` and `sign`, both **computed at read time, never stored** (`+` = money enters a wallet, `−` = leaves, `null` = transfer/adjustment):

  | `from`   | `to`          | `kind`             | `sign` |
  | :------- | :------------ | :----------------- | :----- |
  | external | wallet        | `moneyIn`          | `+`    |
  | wallet   | external      | `moneyOut`         | `−`    |
  | revenue  | wallet        | `revenueRealized`  | `+`    |
  | wallet   | bill          | `billPaid`         | `−`    |
  | wallet   | wallet (diff) | `internalTransfer` | `null` |
  | wallet   | wallet (same) | `manualAdjustment` | `null` |

  The wallet→wallet pair splits on identity: different ids = internal transfer, same `from_id` = `to_id` = manual adjustment.

### Logic placement — the load-bearing decision

`db-schema.md` deliberately splits where each rule lives. Respect these boundaries:

**DB enforces only** column/check constraints and `updated_at` (via the `set_updated_at()` trigger). That trigger is the *only* business logic in the database.

**Computed by the BE at read time (never stored):**
- `flagged` on Bill/Revenue: `(paid && !hasLinkedTxn) || (!paid && term < today)` (and the `received` equivalent).
- Transaction `kind` and `sign` (from the from/to combination).
- `hasOpenItems` (Source), `hasLinkedTransaction` (Bill/Revenue), `active` (Recurrence).

**BE application layer, inside a single DB transaction:**
- **Wallet balance** — adjusted only for `method = 'debit'`. Create: apply delta. Edit: reverse old, apply new. Delete: reverse. *Open decision in the spec:* balance lives in the app layer (testable, one language) vs. a DB trigger (correct even on out-of-band writes). A non-BE write currently desyncs the balance — confirm the owner's intent before relying on either choice.
- **Manual Adjustment** — editing a wallet's balance generates a transaction with `from_type = to_type = 'wallet'`, `from_id = to_id = <that wallet>`, for the delta.
- **Installment expansion** — `installmentTotal > 1` generates N rows sharing a `credit_group_id`, dated one month apart, each carrying its `installment_number`.

**Scheduled background job:**
- **Recurrence windowing** — maintains a rolling lookahead of materialized Bill/Revenue instances: **3 ahead** for day/week/month, **1 ahead** for year. Clamp `recurrent_day` to the month length at materialization (never rewrite the column). When a recurrence has no remaining instances it is **auto-deleted**; consumed bill/revenue rows survive with `recurrence_id` nulled (`on delete set null`).
- **`estimated_value` recalculation** — recomputed on each materialization; used in projections only when `is_variable = true` (fixed recurrences project the exact `value`).

### Recurrence lifecycle

- `recurrent_day` is the *intended* day (e.g. 31), stored unclamped; scheduling clamps per month.
- Creating a Bill/Revenue with a `recurrence` payload: the BE **synchronously materializes the initial window**, then the scheduled job maintains it.
- Editing a recurrence **config** applies to **future instances only**. Editing one materialized **instance** (a Bill/Revenue row) affects only that row.
- Deactivate: preserves the current instance, detaches the config, generates nothing further.

## Data & API conventions

- **Base path** `/api`; JSON in/out. Auth is `Authorization: Bearer <supabase-jwt>` on every request.
- **Casing:** API is **camelCase**, DB is **snake_case** — the BE maps at the DB boundary.
- **Money is decimal strings** (`"1234.56"`), never JSON numbers. DB type is `numeric(14,2)`; never `float`.
- **Dates:** `ISODate` = `YYYY-MM-DD`; timestamps RFC 3339. Period filters `from` / `to` arrive as **concrete dates** — the FE resolves presets ("last 3 months") before calling; the BE never interprets preset names.
- **Soft-delete only** (`archived`) on Wallet / Source / Category — no hard deletes.
- **Pagination:** only `GET /transactions` paginates (cursor-based). Every other list is bounded by the period and returned whole.
- **Status codes carry meaning:** `409` = business-rule block (delete paid bill, archive source with open items); `422` = validation failure with a `fields` map driving inline form errors; plus standard `400/401/404`. Error envelope: `{ error: { code, message, fields? } }`.

## Entity invariants (quick reference)

- **Bill / Revenue:** `paid` / `received` is a manual toggle, fully **independent of transaction linking**. Delete is blocked (`409`) when `paid` / `received = true`.
- **Transaction:** `settled` is meaningful only for credit (always `true` for debit, enforced); `term` is credit-only (NULL for debit), defaulting to the 15th of the current month; `credit_group_id` exists only when `installmentTotal > 1`. Debit touches wallet balance; credit never does.
- **Source:** the *reason* behind a Bill/Revenue, not the transaction counterparty (e.g. the apartment, not the plumber). Archive blocked (`409`) while it has unpaid bills or unreceived revenues (`hasOpenItems`).
- **Wallet:** starts at balance 0; archived wallets are excluded from dashboard and selectors but retain full history.

## Source-of-truth specs

Authoritative design docs live in `reference-files/`:
- `entities.md` — data model / field-level constraints
- `db-schema.md` — PostgreSQL schema, constraints, and the logic-placement rationale
- `api-contracts.md` — REST endpoints, request/response shapes, computed fields
- `glossary.md` — domain definitions and the authoritative transaction from/to matrix
- `user-stories.md` — feature requirements and acceptance criteria
- Frontend-only (separate app): `components-tree.md`, `ui-spec.md`, `design-system.md`
