-- I6 INDUSTRY-KNOWLEDGE Part 1/2 — activate built-in aria_skills by business industry.
-- aria_skills has NO industry column, so the mapping is explicit here (mirrors
-- src/lib/aria/industry-skills.ts SKILL_INDUSTRIES). Universal skills enable for EVERY business
-- (including null-industry); industry-specific skills enable only where the industry matches.
-- Additive + idempotent: only sets enabled=true (never disables); re-running is a no-op.
update public.aria_skills s
set enabled = true
from public.businesses b
where s.business_id = b.id
  and s.built_in = true
  and s.enabled = false
  and (
    s.name in ('Accountant', 'Compliance officer', 'HR coach')                                          -- universal
    or (s.name = 'Inventory expert'     and b.industry = any (array['cafe','retail','gym','tradie','warehouse']))
    or (s.name = 'Marketing strategist' and b.industry = any (array['cafe','retail','gym','realestate']))
    or (s.name = 'Growth advisor'       and b.industry = any (array['cafe','retail','gym','tradie','realestate']))
  );
