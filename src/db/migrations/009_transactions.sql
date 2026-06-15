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
