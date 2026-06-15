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
