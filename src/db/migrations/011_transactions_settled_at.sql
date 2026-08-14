-- Settling a credit statement is the moment its money actually leaves the
-- wallet. `settled` alone has no timestamp, so a balance could never be
-- reconstructed for a past date; `settled_at` records when the money moved.
alter table transactions add column settled_at date;

-- Credit rows settled before this migration never debited a wallet, and the
-- stored balances already account for them. Stamping them keeps the
-- `settled_at is null` guard from debiting the same purchase twice.
update transactions
   set settled_at = coalesce(term, date)
 where method = 'credit'
   and settled = true;

-- settled_at is a credit-only concept: debit moves money on `date`.
alter table transactions add constraint settled_at_credit_only check (
  method <> 'debit' or settled_at is null
);

-- settled_at and settled are two views of the same fact and must not diverge.
alter table transactions add constraint settled_at_matches_settled check (
  method <> 'credit' or (settled = (settled_at is not null))
);

create index txn_settled_at_idx on transactions (settled_at)
  where method = 'credit';
