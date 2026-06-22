-- INV-PAR-1 — lead time + review cycle are business-level knobs the par math needs but reorder_settings
-- lacked. Additive, sensible defaults, owner-editable. (buffer_weeks/default_reorder_qty already exist.)
alter table reorder_settings add column if not exists lead_time_days numeric not null default 3;
alter table reorder_settings add column if not exists review_cycle_days numeric not null default 7;
