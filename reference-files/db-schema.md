# Tech Spec — Database Schema

**Target:** PostgreSQL (Supabase)
**Companion to:** `entities.md`, `glossary.md`

---

## Conventions

- `id` is `uuid` defaulting to `gen_random_uuid()`.
- All money is `numeric(14,2)`. Never `float`.
- All timestamps are `timestamptz`. `created_at` / `updated_at` are non-null; `updated_at` is maintained by a trigger.
- `archived` soft-delete only — no hard deletes on Wallet, Source, Category.
- Enum types are native Postgres `enum`s (cheaper than check constraints for fixed domains, and they show up in introspection / generated TS types).

---

## Extensions & helpers

```sql
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Generic updated_at maintenance. The only business logic that lives in the DB.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

---

## Enums

```sql
create type interval_unit   as enum ('day', 'week', 'month', 'year');
create type txn_method       as enum ('debit', 'credit');
create type txn_from_type    as enum ('wallet', 'external', 'revenue');
create type txn_to_type      as enum ('wallet', 'external', 'bill');
```

`from_type` and `to_type` are deliberately asymmetric: a Revenue can only be a source of money, a Bill only a destination. The enum encodes that — there is no valid transaction with `from_type = 'bill'`.

---

## Tables

### wallets

```sql
create table wallets (
  id          uuid primary key default gen_random_uuid(),
  name        varchar     not null,
  description varchar,
  balance     numeric(14,2) not null default 0,
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger wallets_updated_at before update on wallets
  for each row execute function set_updated_at();
```

### sources

```sql
create table sources (
  id          uuid primary key default gen_random_uuid(),
  name        varchar     not null,
  description varchar,
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger sources_updated_at before update on sources
  for each row execute function set_updated_at();
```

### categories

```sql
create table categories (
  id          uuid primary key default gen_random_uuid(),
  name        varchar     not null,
  description varchar,
  archived    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger categories_updated_at before update on categories
  for each row execute function set_updated_at();
```

### recurrences

```sql
create table recurrences (
  id              uuid primary key default gen_random_uuid(),
  is_variable     boolean       not null default false,
  interval_unit   interval_unit not null,
  interval_value  int           not null default 1 check (interval_value >= 1),
  recurrent_day   int           not null check (recurrent_day between 1 and 31),
  recurrent_month int           check (recurrent_month between 1 and 12),
  estimated_value numeric(14,2),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  -- recurrent_month is required only for yearly schedules
  constraint recurrence_month_required_for_year
    check (interval_unit <> 'year' or recurrent_month is not null)
);
create trigger recurrences_updated_at before update on recurrences
  for each row execute function set_updated_at();
```

`recurrent_day` stores the _intended_ day (e.g. 31). The scheduling job clamps to the last valid day of the target month at materialization time without ever rewriting this column.

### bills

```sql
create table bills (
  id            uuid primary key default gen_random_uuid(),
  name          varchar     not null,
  description   varchar,
  value         numeric(14,2) not null,
  term          date        not null,
  paid          boolean     not null default false,
  source_id     uuid        not null references sources(id),
  recurrence_id uuid        references recurrences(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index bills_source_id_idx     on bills (source_id);
create index bills_recurrence_id_idx on bills (recurrence_id);
create index bills_term_idx          on bills (term);
create trigger bills_updated_at before update on bills
  for each row execute function set_updated_at();
```

### revenues

```sql
create table revenues (
  id            uuid primary key default gen_random_uuid(),
  name          varchar     not null,
  description   varchar,
  value         numeric(14,2) not null,
  term          date        not null,
  received      boolean     not null default false,
  source_id     uuid        not null references sources(id),
  recurrence_id uuid        references recurrences(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index revenues_source_id_idx     on revenues (source_id);
create index revenues_recurrence_id_idx on revenues (recurrence_id);
create index revenues_term_idx          on revenues (term);
create trigger revenues_updated_at before update on revenues
  for each row execute function set_updated_at();
```

### transactions

```sql
create table transactions (
  id                 uuid primary key default gen_random_uuid(),
  amount             numeric(14,2) not null,
  date               date          not null,
  description        varchar,
  method             txn_method    not null,
  category_id        uuid          references categories(id),

  from_type          txn_from_type not null,
  from_id            uuid,                       -- no FK: polymorphic, see notes
  to_type            txn_to_type   not null,
  to_id              uuid,                       -- no FK: polymorphic, see notes

  installment_number int,
  installment_total  int,
  credit_group_id    uuid,
  settled            boolean       not null default true,
  term               date,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now(),

  -- from_id is null iff the counterparty is external
  constraint from_id_matches_type check (
    (from_type = 'external' and from_id is null) or
    (from_type <> 'external' and from_id is not null)
  ),
  -- to_id is null iff the counterparty is external
  constraint to_id_matches_type check (
    (to_type = 'external' and to_id is null) or
    (to_type <> 'external' and to_id is not null)
  ),
  -- settled is only meaningful for credit; debit is always settled
  constraint debit_is_settled check (method <> 'debit' or settled = true),
  -- term is a credit-only concept (statement date); debit has none
  constraint term_credit_only check (method <> 'debit' or term is null),
  -- credit_group_id only exists for real installment groups
  constraint credit_group_requires_installments check (
    credit_group_id is null or coalesce(installment_total, 1) > 1
  )
);

create index txn_date_idx        on transactions (date);
create index txn_from_idx        on transactions (from_type, from_id);
create index txn_to_idx          on transactions (to_type, to_id);
create index txn_category_idx    on transactions (category_id);
create index txn_credit_grp_idx  on transactions (credit_group_id);
-- statement grouping (Credit view): wallet + term + settlement
create index txn_credit_stmt_idx on transactions (to_id, term)
  where method = 'credit';

create trigger transactions_updated_at before update on transactions
  for each row execute function set_updated_at();
```

---

## Logic placement

What the DB enforces vs. what the BE owns. This is the part worth reviewing.

### Computed, never stored

- **`flagged`** (Bill / Revenue) — a derived view-model field, computed per query:
  `(paid and not has_linked_txn) or (not paid and term < current_date)`
  (and the `received` equivalent for revenues). Returned by the API, absent from the table.
- **Transaction sign** (`+`/`−`/blank) — derived from the `from`/`to` type combination at read time. Not a column.
- **Analytical meaning** (revenue realized / bill paid / internal transfer / manual adjustment) — derived from the `from`/`to` combination. The matrix in `glossary.md` is the lookup; it lives in the BE, not the schema.

### Application layer, inside a single DB transaction

- **Wallet balance** — adjusted only for `method = 'debit'`. On create: apply delta. On edit: reverse old, apply new. On delete: reverse. See the open call below.
- **Manual Adjustment** — editing a wallet's balance via the API generates a transaction with `from_type = to_type = 'wallet'` and `from_id = to_id = <wallet>` for the delta.
- **Installment expansion** — `installment_total > 1` generates N rows sharing a `credit_group_id`, dated one month apart, each carrying its `installment_number`.
- **Polymorphic referential integrity** — because `from_id` / `to_id` have no FK, the BE must validate that the referenced Wallet / Revenue / Bill exists and that the `from_type`→`to_type` pair is one of the six legal combinations before insert.

### Background job (scheduled)

- **Recurrence windowing** — maintains a rolling lookahead of materialized instances: 3 ahead for `day` / `week` / `month`, 1 ahead for `year`. Materializing an instance clamps `recurrent_day` to the month length. When a recurrence has no remaining instances it is auto-deleted (`on delete set null` then leaves the consumed Bill/Revenue rows intact, with `recurrence_id` nulled).
- **`estimated_value` recalculation** — recomputed when a new instance is materialized; used in projections only when `is_variable = true` (fixed recurrences project the exact `value`).

---

## One call worth your input: wallet balance

I've put balance maintenance in the **application layer** (inside a transaction), not in a DB trigger. Tradeoff:

- **App-level (chosen):** all money logic in one place, in TypeScript, unit-testable, version-controlled with the BE. Risk: a write that bypasses the BE (manual SQL, a second client) desyncs the balance.
- **DB trigger:** balance is correct no matter who writes, including direct Supabase access. Risk: core money logic split across two languages, harder to test, easy to forget when reasoning about the system.
  For a single-BE-owner setup the app-level choice is usually right. If you expect to ever mutate transactions from anywhere but this backend (Supabase dashboard, scripts, a second service), the trigger is the safer call. Tell me which assumption holds.
