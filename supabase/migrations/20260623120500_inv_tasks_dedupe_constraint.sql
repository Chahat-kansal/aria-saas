-- INV-STAFF-APP-2 fix — the partial unique index inv_tasks_dedupe cannot be inferred by PostgREST's
-- ON CONFLICT (error 42P10), so generateDailyTasks' idempotent upsert silently failed. Replace it with a
-- proper non-partial UNIQUE constraint using NULLS NOT DISTINCT (PG15+) so null outlet_id/product_id still
-- dedupe, and so PostgREST can target it by column list. Additive: same dedupe semantics, now enforceable.

drop index if exists inv_tasks_dedupe;

alter table inventory_tasks
  add constraint inv_tasks_dedupe_uq
  unique nulls not distinct (business_id, outlet_id, product_id, task_type, due_date);
