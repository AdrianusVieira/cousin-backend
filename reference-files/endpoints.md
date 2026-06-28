# API Endpoints

Generated from the route + schema files under `src/modules/`. This reflects what is
**actually implemented**, not just the spec. The authoritative request/response shapes
live in [`api-contracts.md`](api-contracts.md).

## Conventions

- **Base path:** all routes below are under `/api` (e.g. `GET /api/wallets`).
- **Auth:** every `/api` route requires `Authorization: Bearer <supabase-jwt>` (enforced
  by the `requireAuth` hook). `GET /health` is the only unauthenticated route.
- **Casing:** request/response bodies are camelCase; the DB boundary maps to snake_case.
- **Money:** decimal strings (`"1234.56"`), never JSON numbers.
- **Dates:** `from`/`to` query params are concrete `YYYY-MM-DD` dates; the FE resolves
  presets before calling.
- **Errors:** `{ error: { code, message, fields? } }`. `409` = business-rule block,
  `422` = validation failure (with `fields`), plus `400/401/404`.

## Operational

| Method | Path | Auth | Notes |
| :----- | :--- | :--: | :---- |
| `GET` | `/health` | no | `{ "status": "ok" }` when DB reachable, else `503`. Liveness/readiness probe. |

## Dashboard

| Method | Path | Query | Returns |
| :----- | :--- | :---- | :------ |
| `GET` | `/dashboard` | `from?`, `to?` | Aggregate revenue/outcome/net, savings rate + deltas, cash-flow series, pending credit per wallet. |

## Transactions

The polymorphic core. Only this list paginates (cursor-based).

| Method | Path | Query / Body | Returns |
| :----- | :--- | :----------- | :------ |
| `GET` | `/transactions` | `from?`, `to?`, `method?` (`all\|debit\|credit`), `category?` (uuid), `wallet?` (uuid), `cursor?`, `limit?` (default 50, max 200) | `{ summary, items, nextCursor }` |
| `POST` | `/transactions` | Body: discriminated on `method`. **debit** `{ method, amount, date, description?, categoryId?, fromType, fromId?, toType, toId? }`; **credit** `{ method, amount, date, description?, categoryId?, fromId, toType, toId?, term?, installmentTotal? }` | `201` with `Transaction[]` — N rows when `installmentTotal > 1`. Invalid from/to pair → `422`. |
| `GET` | `/transactions/:id` | — | `Transaction` |
| `PATCH` | `/transactions/:id` | Body: `amount?`, `date?`, `description?` (nullable), `categoryId?` (nullable) — ≥1 required | Editing one installment affects only that row. Adjusts wallet balance for debit. |
| `DELETE` | `/transactions/:id` | — | `204`. Reverses wallet-balance delta for debit. |

## Credit

| Method | Path | Query / Body | Returns |
| :----- | :--- | :----------- | :------ |
| `GET` | `/credit` | `from?`, `to?`, `status?` (`all\|settled\|unsettled`) | `{ summary, groups }` — groups keyed by wallet + term. |
| `POST` | `/credit/settle` | Body: `{ transactionIds: UUID[] }` (≥1) | Updated `Transaction[]`; sets `settled = true`. One id = row settle, many = group settle. |

## Bills

| Method | Path | Query / Body | Returns |
| :----- | :--- | :----------- | :------ |
| `GET` | `/bills` | `from?`, `to?`, `status?` (`all\|unpaid\|paid\|overdue`), `active?` (`true\|false`) | `{ summary, items }` |
| `POST` | `/bills` | Body: `{ name, value, term, sourceId, description?, recurrence? }` | `201` with `Bill`. With `recurrence`, synchronously materializes the initial window. |
| `GET` | `/bills/:id` | — | `{ bill, instances, linkedTransaction }` |
| `PATCH` | `/bills/:id` | Body: `name?`, `value?`, `term?`, `description?`, `paid?` — ≥1 required | Editing a recurrence instance affects only that instance. `paid` is a manual toggle. |
| `DELETE` | `/bills/:id` | — | `204`. `409 DELETE_BLOCKED` when `paid = true`. |

## Revenues

Structurally identical to Bills (`received` in place of `paid`).

| Method | Path | Query / Body | Returns |
| :----- | :--- | :----------- | :------ |
| `GET` | `/revenues` | `from?`, `to?`, `status?` (`all\|pending\|received\|overdue`), `active?` (`true\|false`) | `{ summary, items }` |
| `POST` | `/revenues` | Body: `{ name, value, term, sourceId, description?, recurrence? }` | `201` with `Revenue`. |
| `GET` | `/revenues/:id` | — | `{ revenue, instances, linkedTransaction }` |
| `PATCH` | `/revenues/:id` | Body: `name?`, `value?`, `term?`, `description?`, `received?` — ≥1 required | — |
| `DELETE` | `/revenues/:id` | — | `204`. `409` when `received = true`. |

## Recurrences

No create endpoint — recurrences are born from a Bill/Revenue.

| Method | Path | Query / Body | Returns |
| :----- | :--- | :----------- | :------ |
| `GET` | `/recurrences` | `from?`, `to?` | `{ summary, items }` (each item carries `name`, `type`, `nextInstance`). |
| `GET` | `/recurrences/:id` | — | `{ recurrence, name, type, instances, variance }` |
| `PATCH` | `/recurrences/:id` | Body: `intervalUnit?`, `intervalValue?`, `isVariable?`, `recurrentDay?`, `recurrentMonth?` (nullable) — ≥1 required | Config changes apply to **future** instances only. |
| `POST` | `/recurrences/:id/deactivate` | — | `204`. Preserves current instance, detaches config, generates nothing further. |

## Wallets

List is not period-scoped (patrimony is current).

| Method | Path | Query / Body | Returns |
| :----- | :--- | :----------- | :------ |
| `GET` | `/wallets` | `active?` (`true\|false`) | `{ summary, trend, items }` |
| `POST` | `/wallets` | Body: `{ name, description? }` | `201` with `Wallet`. Balance starts at 0. |
| `GET` | `/wallets/:id` | `from?`, `to?` | `{ wallet, summary, balanceSeries }` |
| `PATCH` | `/wallets/:id` | Body: `name?`, `description?`, `balance?` — ≥1 required | Editing `balance` generates a Manual Adjustment txn for the delta. |
| `POST` | `/wallets/:id/archive` | — | Excluded from dashboard & selectors; history preserved. |
| `POST` | `/wallets/:id/unarchive` | — | — |

The wallet-detail transactions table reuses `GET /transactions?wallet=:id`.

## Sources

| Method | Path | Query / Body | Returns |
| :----- | :--- | :----------- | :------ |
| `GET` | `/sources` | `from?`, `to?` | `{ items }` (each with `income`, `outcome`). |
| `POST` | `/sources` | Body: `{ name, description? }` | `201` with `Source`. |
| `GET` | `/sources/:id` | `from?`, `to?` | `{ source, summary, bills, revenues }` |
| `PATCH` | `/sources/:id` | Body: `name?`, `description?` — ≥1 required | — |
| `POST` | `/sources/:id/archive` | — | `409 ARCHIVE_BLOCKED` when `hasOpenItems = true`. |
| `POST` | `/sources/:id/unarchive` | — | — |

## Categories

| Method | Path | Query / Body | Returns |
| :----- | :--- | :----------- | :------ |
| `GET` | `/categories` | `from?`, `to?`, `active?` (`true\|false`) | `{ items }` (each with `income`, `outcome`). |
| `POST` | `/categories` | Body: `{ name, description? }` | `201` with `Category`. |
| `GET` | `/categories/:id` | `from?`, `to?` | `{ category, summary, breakdown }` |
| `PATCH` | `/categories/:id` | Body: `name?`, `description?` — ≥1 required | — |
| `POST` | `/categories/:id/archive` | — | Excluded from selectors; existing txns unaffected. |
| `POST` | `/categories/:id/unarchive` | — | — |

## Selector population

The transaction modal reuses list endpoints with `active=true` rather than bespoke
endpoints: `GET /wallets?active=true`, `GET /revenues?active=true` (referenceable as
`from`), `GET /bills?active=true` (referenceable as `to`), `GET /categories?active=true`.
