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
