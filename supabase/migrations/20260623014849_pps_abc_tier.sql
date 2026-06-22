-- INV-VELOCITY-1 — Pareto ABC tier lives in its own column because performance_tier carries a different
-- enum (star|plowhouse|puzzle|dog|normal, the menu-engineering quadrant). Additive, CHECK-guarded.
alter table product_performance_scores add column if not exists abc_tier text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='pps_abc_tier_check') then
    alter table product_performance_scores add constraint pps_abc_tier_check check (abc_tier in ('A','B','C','dead'));
  end if;
end $$;
