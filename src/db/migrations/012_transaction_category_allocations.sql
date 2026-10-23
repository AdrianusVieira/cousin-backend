create table transaction_category_allocations (
  transaction_id uuid not null references transactions(id) on delete cascade,
  category_id uuid not null references categories(id),
  amount numeric(14,2) not null,
  primary key (transaction_id, category_id)
);

create index txn_allocation_category_idx on transaction_category_allocations (category_id);

-- Preserve historical assignments, including signed balance adjustments.
insert into transaction_category_allocations (transaction_id, category_id, amount)
select id, category_id, amount from transactions where category_id is not null;

-- Allocations are the sole source of truth for transaction categorization.
alter table transactions drop column category_id;
