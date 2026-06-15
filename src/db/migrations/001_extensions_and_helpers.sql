create extension if not exists pgcrypto;

-- Generic updated_at maintenance. The only business logic that lives in the DB.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
