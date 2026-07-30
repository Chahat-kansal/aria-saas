-- ACCESS-MODEL-1 — linked staff identities + role-scoped access to the owner app.
--
-- ★ THIS IS A SECURITY CHANGE: it widens who can read a business's data. ★
--
-- WHY: the owner app was single-owner BY CONSTRUCTION — every policy on its read surface was
-- `business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())`, and pos_users carried
-- 0 rows with auth_user_id. No second person could log in or see anything. This creates the
-- subject (a linked auth identity with a role) and admits it to EXACTLY its scope.
--
-- ── BLAST-RADIUS DISCIPLINE (the security review, enumerated before any policy was written) ─────
-- 453 policies across 410 tables use the owner-only predicate. This migration widens EXACTLY 5:
--     aria_autopilot_actions   — the decision registry (Today / Decisions / jobs detail / chat)
--     aria_user_tasks          — the Jobs tab (delegated work)
--     profit_leaks             — Today's "only what's off" exceptions
--     manager_reviews          — the manager's own review record (MANAGER-AGENT-1)
--     autonomy_ledger          — what the manager did alone (MANAGER-AGENT-1)
-- The other ~405 stay owner-only. That is the CORRECT posture for a manager role, not an
-- incomplete migration: staff_pay_rates, payroll_runs, payroll_line_items, bank_accounts,
-- bank_transactions, supplier_price_lists, pos_product_costs, business_subscriptions, every
-- warehouse_* and xero_* table remain owner-eyes-only.
--
-- Deliberately NOT widened, served instead via service-role with a narrowed projection (RLS
-- bypassed, so widening would be pure exposure with no benefit):
--     businesses     — members get {id, slug, name, suburb} ONLY; never stripe_customer_id,
--                      stripe_subscription_id, plan, trial_ends_at, owner_email or ABN
--     staff_members  — count(*) only (the table carries pay-adjacent fields)
--     pos_sales / pos_products — count(*) only, for chip gating
--
-- ── OWNER ACCESS IS UNCHANGED ──────────────────────────────────────────────────────────────────
-- Every widened policy keeps its ORIGINAL owner clause verbatim and only appends `OR
-- is_business_member(business_id)`. An owner's access is therefore bit-for-bit what it was.
--
-- ── NO PRIVILEGE ESCALATION (the sprint's pass/fail) ────────────────────────────────────────────
-- "Owner" is businesses.user_id — a column on a table this migration does not touch and whose RLS
-- is not widened. A membership row lives in pos_users, whose own RLS policy (own_pos_users) stays
-- OWNER-ONLY, so a linked member cannot read, insert, or update membership rows at all — including
-- their own. There is therefore no path by which a member grants themselves a role, promotes
-- themselves, or becomes businesses.user_id. Membership and ownership are different columns on
-- different tables with different policies.

-- ── The membership primitive: pos_users.auth_user_id (column ALREADY EXISTS — extended, not new) ─
-- Preferred over a new business_members table because pos_users already models exactly what is
-- needed (business_id + role + a ~30-flag permissions jsonb + is_active) and already carries the
-- auth_user_id column; a parallel table would split "who is this person and what may they do"
-- across two sources of truth.
create unique index if not exists pos_users_auth_user_business_uniq
  on pos_users (auth_user_id, business_id) where auth_user_id is not null;
create index if not exists idx_pos_users_auth_lookup
  on pos_users (auth_user_id, business_id) where auth_user_id is not null and is_active;

-- ── The membership test ────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER is REQUIRED and is the safe choice here: pos_users' own RLS is owner-only, so a
-- member querying their own membership row would get zero rows and the check would always be false.
-- The function bypasses that to answer one boolean question. It returns NO data, takes only a
-- business id, and is pinned to a fixed search_path (SECURITY-P5's rule), so it cannot be used as
-- a data-exfiltration primitive.
--
-- 'owner' appears in the role list because a business may ALSO have a linked pos_users row with
-- role='owner' (a second owner-level operator); it never substitutes for businesses.user_id.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from pos_users
    where business_id = p_business_id
      and auth_user_id = auth.uid()
      and is_active
      and coalesce(role, '') in ('owner', 'manager')
  );
$function$;

-- SECURITY-P5 discipline: a new SECURITY DEFINER function must never keep its default PUBLIC grant.
-- `authenticated` MUST hold EXECUTE — RLS policies evaluate it as the calling user.
revoke execute on function public.is_business_member(uuid) from public, anon;
grant execute on function public.is_business_member(uuid) to authenticated, service_role;

-- ── THE 5 WIDENED POLICIES ─────────────────────────────────────────────────────────────────────
-- Each keeps its exact original owner clause and appends the membership test. Both (a) and (b)
-- from the brief are satisfied structurally: the predicate is evaluated per-row against THAT row's
-- own business_id, so a member of business A can never see a row of business B — the membership
-- test is inherently tenant-scoped, never global.

drop policy if exists own_autopilot on aria_autopilot_actions;
create policy own_autopilot on aria_autopilot_actions for all
  using (
    business_id in (select businesses.id from businesses where businesses.user_id = auth.uid())
    or public.is_business_member(business_id)
  );

drop policy if exists owner_app_own_tasks on aria_user_tasks;
create policy owner_app_own_tasks on aria_user_tasks for all
  using (
    business_id in (select businesses.id from businesses where businesses.user_id = auth.uid())
    or public.is_business_member(business_id)
  );
-- NOTE: aria_user_tasks also carries a second, older policy named "owner" with the identical
-- owner-only predicate. RLS policies are OR'd, so leaving it is harmless — but it would silently
-- keep the table owner-only-looking to a future reader. Widened to match so the surface is
-- consistent rather than half-migrated.
drop policy if exists owner on aria_user_tasks;
create policy owner on aria_user_tasks for all
  using (
    business_id in (select businesses.id from businesses where businesses.user_id = auth.uid())
    or public.is_business_member(business_id)
  );

drop policy if exists "Business owners can access their profit leaks" on profit_leaks;
create policy "Business owners can access their profit leaks" on profit_leaks for all
  using (
    business_id in (select businesses.id from businesses where businesses.user_id = auth.uid())
    or public.is_business_member(business_id)
  );

-- (a) CONFIRMED: both manager-agent tables scope to THIS business via the same per-row membership
-- test — a member of business A reading manager_reviews gets only business A's rows.
drop policy if exists manager_reviews_owner_read on manager_reviews;
create policy manager_reviews_owner_read on manager_reviews for select
  using (
    business_id in (select businesses.id from businesses where businesses.user_id = auth.uid())
    or public.is_business_member(business_id)
  );

drop policy if exists autonomy_ledger_owner_read on autonomy_ledger;
create policy autonomy_ledger_owner_read on autonomy_ledger for select
  using (
    business_id in (select businesses.id from businesses where businesses.user_id = auth.uid())
    or public.is_business_member(business_id)
  );

-- ── Revocation ─────────────────────────────────────────────────────────────────────────────────
-- Setting pos_users.is_active = false (or clearing auth_user_id) makes is_business_member() return
-- false on the very next query — access is zeroed immediately, with no cache to expire and no
-- session to wait out, because the test is evaluated inside every RLS check.
