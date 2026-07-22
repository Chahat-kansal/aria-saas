-- INV-VELOCITY-1 — per-product, per-outlet velocity computed from stock_movements (real, reliable
-- data since INV-DECREMENT-FIX), rolling 7/28/90-day windows. New table rather than extending
-- product_performance_scores: that table's UNIQUE(business_id, product_id, scored_at) has no outlet
-- dimension and already has two independent writers (velocity.ts's whole-window half-split model,
-- menu-engineering-agent.ts's 4-hour-window model) — overloading it with a third, differently-
-- windowed concept would make an already-fragmented table worse. This is a clean, additive concern.
CREATE TABLE IF NOT EXISTS product_velocity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
  -- NULL = movements that predate per-outlet tagging and can't be honestly attributed to a specific
  -- outlet on a multi-outlet business (see movement-velocity.ts's "unattributed" handling). On a
  -- single-outlet business, the JS layer attributes them to that one outlet — unambiguous.
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL,
  history_state text NOT NULL DEFAULT 'no_history' CHECK (history_state IN ('has_history', 'no_history')),
  units_7d numeric NOT NULL DEFAULT 0,
  units_28d numeric NOT NULL DEFAULT 0,
  units_90d numeric NOT NULL DEFAULT 0,
  velocity_7d_per_day numeric,
  velocity_28d_per_day numeric,
  velocity_90d_per_day numeric,
  first_sale_movement_at timestamptz,
  last_sale_movement_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Day-bucketed computed_at (mirrors velocity.ts's own idempotency convention): re-running the same
-- day upserts; a new day adds a fresh snapshot. Split into two partial unique indexes because a plain
-- UNIQUE treats NULL outlet_id as always-distinct (which would let duplicate "unattributed" rows pile
-- up for the same product+day) — the second index closes that gap explicitly.
CREATE UNIQUE INDEX IF NOT EXISTS product_velocity_outlet_uniq
  ON product_velocity (business_id, product_id, outlet_id, computed_at) WHERE outlet_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_velocity_no_outlet_uniq
  ON product_velocity (business_id, product_id, computed_at) WHERE outlet_id IS NULL;
CREATE INDEX IF NOT EXISTS product_velocity_lookup ON product_velocity (business_id, product_id);

-- Aggregates stock_movements into per-(product, outlet) rolling-window unit totals. movement_type
-- filter is the whole point of this ticket: voids/refunds/returns are real, correctly-typed rows now
-- (INV-DECREMENT-FIX) and must NOT inflate a "how fast does this sell" figure the way a naive
-- sum(abs(quantity_added)) over all movement_types would. first/last scan ALL 'sale' history (not
-- window-limited) so a product that hasn't sold in 89 days doesn't get miscounted as fresh.
CREATE OR REPLACE FUNCTION public.movement_velocity_aggregate(p_business uuid)
RETURNS TABLE (
  product_id uuid,
  outlet_id uuid,
  units_7d numeric,
  units_28d numeric,
  units_90d numeric,
  first_sale_at timestamptz,
  last_sale_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    (sm.item_id)::uuid as product_id,
    sm.outlet_id,
    coalesce(sum(abs(sm.quantity_added)) filter (where sm.created_at >= now() - interval '7 days'), 0) as units_7d,
    coalesce(sum(abs(sm.quantity_added)) filter (where sm.created_at >= now() - interval '28 days'), 0) as units_28d,
    coalesce(sum(abs(sm.quantity_added)) filter (where sm.created_at >= now() - interval '90 days'), 0) as units_90d,
    min(sm.created_at) as first_sale_at,
    max(sm.created_at) as last_sale_at
  from stock_movements sm
  where sm.business_id = p_business
    and sm.movement_type = 'sale'
  group by sm.item_id, sm.outlet_id;
$function$;
