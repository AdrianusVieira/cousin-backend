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
