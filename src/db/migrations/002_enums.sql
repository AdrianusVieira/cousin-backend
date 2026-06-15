create type interval_unit as enum ('day', 'week', 'month', 'year');
create type txn_method as enum ('debit', 'credit');
create type txn_from_type as enum ('wallet', 'external', 'revenue');
create type txn_to_type as enum ('wallet', 'external', 'bill');
