-- INV-VELOCITY-1 — server-side per-product velocity aggregate over the REAL data window (completed only,
-- units = quantity − returned). Aggregating in SQL avoids the PostgREST row cap that truncated a JS fetch.
create or replace function velocity_aggregate(p_business uuid)
returns table (
  product_id uuid, product_name text, units numeric, this_half numeric, base_half numeric, revenue numeric,
  win_start timestamptz, win_end timestamptz
)
language sql stable security definer set search_path = public as $$
  with completed as (
    select si.product_id, si.product_name,
           (coalesce(si.quantity,0) - coalesce(si.returned_quantity,0))::numeric as net,
           coalesce(si.line_total,0)::numeric as line_total, s.created_at
    from pos_sale_items si
    join pos_sales s on s.id = si.sale_id
    where si.business_id = p_business and s.status = 'completed' and si.product_id is not null
  ),
  win as (select min(created_at) as ws, max(created_at) as we from completed),
  mid as (select ws, we, ws + (we - ws)/2 as wm from win)
  select c.product_id,
         max(c.product_name) as product_name,
         sum(c.net) as units,
         sum(c.net) filter (where c.created_at >= (select wm from mid)) as this_half,
         sum(c.net) filter (where c.created_at <  (select wm from mid)) as base_half,
         sum(c.line_total) as revenue,
         (select ws from win) as win_start,
         (select we from win) as win_end
  from completed c
  group by c.product_id;
$$;
