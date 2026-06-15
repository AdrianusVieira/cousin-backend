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
