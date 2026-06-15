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
