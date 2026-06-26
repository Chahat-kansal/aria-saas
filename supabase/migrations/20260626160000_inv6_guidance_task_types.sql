-- INV-6 — guidance. REUSE inventory_tasks (the Tanpin tasks table: title/hypothesis/priority/generated_by='aria').
-- Additive only: widen the task_type CHECK to admit the two new grounded signal types — 'velocity' (a fast mover
-- from product_performance_scores) and 'weather' (tomorrow's forecast × this business's own rain↔sales history).
-- The existing types (count|receive|waste|expiring|cycle_count) stay valid; no parallel table.

ALTER TABLE inventory_tasks DROP CONSTRAINT IF EXISTS inventory_tasks_task_type_check;
ALTER TABLE inventory_tasks ADD CONSTRAINT inventory_tasks_task_type_check
  CHECK (task_type IN ('count', 'receive', 'waste', 'expiring', 'cycle_count', 'velocity', 'weather'));
