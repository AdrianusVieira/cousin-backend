-- note-query.sql
-- Single read-only query for the cou$in daily financial note.
-- Run via the Cousin MCP (mcp__cousin__db_query). Returns one row with a JSON
-- `payload` shaped for scripts/daily-financial-note.mjs --from-json.
-- Target date = yesterday in America/Sao_Paulo (computed in-SQL, no substitution
-- needed). To target a different day, replace the `d` CTE, e.g.
--   WITH d AS (SELECT DATE '2026-07-07' AS target)
WITH d AS (
  SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1) AS target
)
SELECT json_build_object(
  'date', (SELECT to_char(target,'YYYY-MM-DD') FROM d),
  'newTxns', coalesce((SELECT json_agg(r) FROM (
     SELECT t.id, t.amount::text AS amount, t.date::text AS date, t.method,
            t.description, t.from_type, t.from_id, t.to_type, t.to_id, t.category_id,
            t.installment_number, t.installment_total,
            CASE
              WHEN t.from_type='external' AND t.to_type='wallet' THEN 'moneyIn'
              WHEN t.from_type='wallet' AND t.to_type='external' THEN 'moneyOut'
              WHEN t.from_type='revenue' AND t.to_type='wallet' THEN 'revenueRealized'
              WHEN t.from_type='wallet' AND t.to_type='bill' THEN 'billPaid'
              WHEN t.from_type='wallet' AND t.to_type='wallet' AND t.from_id<>t.to_id THEN 'internalTransfer'
              WHEN t.from_type='wallet' AND t.to_type='wallet' AND t.from_id=t.to_id THEN 'manualAdjustment'
              ELSE 'unknown' END AS kind,
            CASE
              WHEN t.to_type='wallet' AND t.from_type IN ('external','revenue') THEN '+'
              WHEN t.from_type='wallet' AND t.to_type IN ('external','bill') THEN '-'
              ELSE '0' END AS sign
     FROM transactions t, d
     WHERE (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = d.target
     ORDER BY t.created_at ASC) r), '[]'::json),
  'bills', coalesce((SELECT json_agg(r) FROM (
     SELECT b.id,b.name,b.value::text AS value,b.term::text AS term,b.paid,
       ((b.paid AND NOT EXISTS(SELECT 1 FROM transactions x WHERE x.to_type='bill' AND x.to_id=b.id))
        OR (NOT b.paid AND b.term < d.target)) AS flagged
     FROM bills b, d) r), '[]'::json),
  'revenues', coalesce((SELECT json_agg(r) FROM (
     SELECT rv.id,rv.name,rv.value::text AS value,rv.term::text AS term,rv.received,
       ((rv.received AND NOT EXISTS(SELECT 1 FROM transactions x WHERE x.from_type='revenue' AND x.from_id=rv.id))
        OR (NOT rv.received AND rv.term < d.target)) AS flagged
     FROM revenues rv, d) r), '[]'::json),
  'wallets', coalesce((SELECT json_agg(r) FROM (SELECT id,name,balance::text AS balance,archived FROM wallets ORDER BY name) r), '[]'::json),
  'recurrences', coalesce((SELECT json_agg(r) FROM (
     SELECT rc.id,rc.is_variable,rc.interval_unit,rc.interval_value,rc.recurrent_day,
            rc.estimated_value::text AS estimated_value,
            to_char((rc.created_at AT TIME ZONE 'America/Sao_Paulo')::date,'YYYY-MM-DD') AS created_date,
            (EXISTS(SELECT 1 FROM bills b WHERE b.recurrence_id=rc.id) OR EXISTS(SELECT 1 FROM revenues r2 WHERE r2.recurrence_id=rc.id)) AS active
     FROM recurrences rc) r), '[]'::json),
  'dayFlow', (SELECT json_build_object(
       'in', coalesce(sum(CASE WHEN t.from_type IN ('external','revenue') AND t.to_type='wallet' THEN t.amount ELSE 0 END),0)::text,
       'out', coalesce(sum(CASE WHEN t.from_type='wallet' AND t.to_type IN ('external','bill') THEN t.amount ELSE 0 END),0)::text)
     FROM transactions t, d WHERE t.date=d.target AND NOT (t.from_type='wallet' AND t.to_type='wallet')),
  'dashboardTotals', json_build_object(
       'revenue', (SELECT coalesce(sum(value),0) FROM revenues,d WHERE term=d.target)::text,
       'outcome', (SELECT coalesce(sum(value),0) FROM bills,d WHERE term=d.target)::text),
  'pendingTotal', (SELECT coalesce(sum(amount),0)::text FROM transactions WHERE method='credit' AND settled=false),
  'pendingPerWallet', coalesce((SELECT json_agg(r) FROM (
       SELECT w.id AS wallet_id, w.name AS wallet_name, coalesce(sum(t.amount),0)::text AS total
       FROM transactions t JOIN wallets w ON w.id=t.from_id
       WHERE t.method='credit' AND t.settled=false GROUP BY w.id,w.name ORDER BY w.name) r), '[]'::json),
  'categories', coalesce((SELECT json_agg(r) FROM (SELECT id,name FROM categories) r), '[]'::json)
) AS payload;
