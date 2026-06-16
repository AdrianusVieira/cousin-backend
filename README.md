# cou$in — backend

REST API for **cou$in**, a personal (single-owner) finance tracker: wallets, bills,
revenues, transactions, and recurring schedules, plus aggregate views (dashboard,
credit statements, per-entity rollups).

**Stack:** Node.js 20+ · TypeScript (ESM) · Fastify · PostgreSQL (Supabase, accessed
directly with `pg`) · Zod for validation · Vitest for tests.

## Prerequisites

- Node.js >= 20
- pnpm (the repo pins `pnpm@9` via `packageManager`; run through `corepack pnpm ...`
  if pnpm isn't installed globally)
- A PostgreSQL database (Supabase or local)

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in the values
pnpm migrate           # apply DB migrations (requires DATABASE_URL)
pnpm dev               # start the dev server in watch mode
```

### Environment

| Variable              | Required | Default | Description                                                                 |
| --------------------- | :------: | ------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`        |   yes    | —       | Postgres connection string for the Supabase database.                       |
| `SUPABASE_JWT_SECRET` |   yes    | —       | Supabase JWT secret used to verify `Authorization: Bearer` tokens.          |
| `PORT`                |    no    | `3000`  | HTTP port.                                                                   |
| `CORS_ORIGIN`         |    no    | (any)   | Comma-separated allowed origins. Unset reflects any origin (fine for local dev / Bearer-token auth). |

Env vars are validated at startup with Zod (`src/config/env.ts`) — the process exits
if a required one is missing.

## Commands

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `pnpm dev`           | Dev server in watch mode (`tsx`).            |
| `pnpm build`         | Compile TypeScript to `dist/`.               |
| `pnpm start`         | Run the compiled server (`node dist/index.js`). |
| `pnpm typecheck`     | Type-check without emitting.                 |
| `pnpm lint`          | ESLint.                                      |
| `pnpm test`          | Run the full test suite once.                |
| `pnpm test:watch`    | Vitest in watch mode.                        |
| `pnpm migrate`       | Apply pending SQL migrations.                |

Run a single test file: `pnpm test src/lib/money.test.ts`.

## API

- Base path `/api`; JSON in/out, **camelCase** (the DB is snake_case — mapped at the
  boundary).
- Every `/api` request requires `Authorization: Bearer <supabase-jwt>`.
- Money is sent as **decimal strings** (`"1234.56"`), never JSON numbers.
- Resources: `bills`, `categories`, `credit`, `dashboard`, `recurrences`, `revenues`,
  `sources`, `transactions`, `wallets`. Only `GET /transactions` paginates (cursor-based);
  every other list is bounded by a `from`/`to` period and returned whole.
- Error envelope: `{ error: { code, message, fields? } }`. `409` = business-rule block,
  `422` = validation failure (with a `fields` map), plus standard `400/401/404`.

The full contract is in [`reference-files/api-contracts.md`](reference-files/api-contracts.md).
A Postman collection lives in [`postman/`](postman/).

### Health check

`GET /health` (unauthenticated) returns `{ "status": "ok" }` when the database is
reachable, or `503` otherwise. Use it as the platform liveness/readiness probe.

## Background jobs

A recurrence-windowing job (`src/jobs/recurrence-window.ts`) runs on startup and once
per day. It maintains a rolling lookahead of materialized Bill/Revenue instances,
recomputes `estimated_value` for variable recurrences, and auto-deletes exhausted
recurrences. Each recurrence is processed in isolation — one failure is logged and does
not abort the rest.

## Deployment

- Build with `pnpm build`, run with `pnpm start`.
- Apply migrations (`pnpm migrate`) as a release step before the new version serves
  traffic.
- The server handles `SIGTERM`/`SIGINT`: it stops the scheduled job, drains in-flight
  requests (`app.close()`), and closes the Postgres pool before exiting — so rolling
  deploys don't drop connections.
- Set `CORS_ORIGIN` to the frontend origin(s) in production.

## Architecture

The data model centers on a **polymorphic `transactions` table** whose `from`/`to`
endpoints reference wallets, revenues, or bills with no foreign keys — the backend owns
referential integrity. The authoritative design lives in
[`reference-files/`](reference-files/) (`entities.md`, `db-schema.md`,
`api-contracts.md`, `glossary.md`, `user-stories.md`), and
[`CLAUDE.md`](CLAUDE.md) summarizes the load-bearing rules (logic placement, the
transaction matrix, recurrence lifecycle).

Module layout (`src/modules/<entity>/`): `*.routes.ts` (Fastify + Zod) →
`*.service.ts` (business logic, DB transactions) → `*.repository.ts` (parameterized
SQL) → `*.types.ts` (row ↔ DTO mapping). Shared pure logic is in `src/lib/`.
