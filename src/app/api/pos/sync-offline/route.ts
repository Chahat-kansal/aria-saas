export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { createSale, type CreateSaleItem } from '@/lib/pos/create-sale'
import { adaptLegacyQueuedSale, offlineIdempotencyKey, type QueuedSale } from '@/lib/pos-offline'

/**
 * POS-OFFLINE-1a — THE SYNC SWALLOW (G11).
 *
 * ── WHAT THIS ROUTE USED TO DO ──────────────────────────────────────────────────────────────────
 * It carried its own copy of the sale write (insert sale, insert items, decrement stock, bump
 * session totals) and, on any failure, ran `errors++; continue` before returning a success-shaped
 * `{ synced, errors }` with a 200. Three defects wearing one coat:
 *
 *   1. the Postgres error naming the bad column never reached a log;
 *   2. a partial failure was indistinguishable from a clean run;
 *   3. the till believed it, cleared the queue, and the sale ceased to exist.
 *
 * ── WHAT IT DOES NOW ────────────────────────────────────────────────────────────────────────────
 *   · per-item results, never a count: { synced: ref[], failed: {ref, reason}[], ok }
 *   · NON-2XX (207) whenever anything failed, so a lossy batch cannot look like a clean one
 *   · the real error is logged with its Postgres code and the ref it belongs to
 *   · replay goes through createSale() — the same path every online sale takes
 *
 * ── WHY REUSING createSale() IS THE POINT, NOT A TIDY-UP ────────────────────────────────────────
 * The bug that started this was `synced_from_offline` — a column that did not exist, written by a
 * raw insert built as an untyped object literal, which compiled happily and failed at runtime where
 * the swallow hid it. This route no longer names a pos_sales column at all. `CreateSaleParams` is a
 * closed TypeScript interface, so an invented field at this call site is now a `tsc` error, and tsc
 * gates every push. That is the class killed at compile time for this path.
 *
 * ⚠️ RESIDUAL, stated rather than implied: createSale() still assembles its own `salePayload` as
 * `Record<string, unknown>` (create-sale.ts:313), so the class is NOT yet dead inside that function.
 * Closing it needs regenerated Supabase types — see the run log; it could not be done in this
 * session because the CLI is unauthenticated and .env.local is not readable here.
 *
 * ── IDEMPOTENCY IS WHAT MAKES RETRY SAFE ────────────────────────────────────────────────────────
 * Retries now genuinely happen, so a replayed batch is the single most likely duplicate source in
 * the product. Each queued sale carries the `ref` minted when it was queued; the idempotency key is
 * derived from it the same way the till derives one, and the existing unique index
 * idx_pos_sales_biz_idempotency_key rejects the duplicate. Retry and idempotency ship together or
 * neither ships.
 */

interface SyncResult {
  synced: string[]
  failed: Array<{ ref: string; reason: string }>
  ok: boolean
}

/** Accepts a v2 queued sale, or upgrades a v1 one. Returns null if the row is unusable. */
function normalise(raw: unknown): QueuedSale | null {
  if (raw && typeof raw === 'object' && 'ref' in raw && 'body' in raw) return raw as QueuedSale
  return adaptLegacyQueuedSale((raw ?? {}) as Record<string, unknown>)
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { sales = [], business_id }: { sales: unknown[]; business_id?: string } = body;

  if (!Array.isArray(sales) || sales.length === 0) {
    return NextResponse.json({ synced: [], failed: [], ok: true } satisfies SyncResult);
  }

  // Verify business ownership — unchanged.
  let bid = business_id;
  if (!bid) {
    const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
    bid = biz?.id ?? undefined;
  } else {
    const { data: biz } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', user.id).maybeSingle();
    if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const result: SyncResult = { synced: [], failed: [], ok: true }

  for (const raw of sales) {
    const queued = normalise(raw)
    const ref = queued?.ref ?? ''

    // An unreadable row is REPORTED, not skipped in silence. Without a ref the till cannot even
    // match it to a queue entry, so it is named as unidentifiable rather than quietly dropped.
    if (!queued || !ref) {
      console.error('[sync-offline] unreadable queued sale:', JSON.stringify(raw)?.slice(0, 400))
      result.failed.push({ ref: ref || 'unidentifiable', reason: 'Queued sale could not be read' })
      continue
    }

    try {
      const items: CreateSaleItem[] = (queued.body.items ?? []).map(i => ({
        product_id: String(i.product_id ?? ''),
        product_name: i.product_name,
        quantity: Number(i.quantity) || 0,
        unit_price: Number(i.unit_price) || 0,
        line_total: Number(i.line_total) || 0,
        tax_rate: Number(i.tax_rate) || 10,
        discount_percent: Number(i.discount_percent) || 0,
      }))

      if (items.length === 0) {
        result.failed.push({ ref, reason: 'Queued sale has no items' })
        continue
      }

      const saleResult = await createSale(supabase, {
        businessId: bid,
        userId: user.id,
        items,
        customerId: queued.body.customer_id ?? null,
        paymentMethod: queued.body.payment_method,
        subtotal: Number(queued.body.subtotal) || 0,
        taxAmount: Number(queued.body.tax_amount) || 0,
        discountAmount: Number(queued.body.discount_amount) || 0,
        totalAmount: Number(queued.body.total_amount) || 0,
        cashTendered: queued.body.cash_tendered ?? null,
        changeGiven: queued.body.change_given ?? null,
        outletId: queued.body.outlet_id ?? null,
        sessionId: queued.body.session_id ?? null,
        status: 'completed',
        source: 'mobile_offline',
        idempotencyKey: offlineIdempotencyKey(bid, ref),
        synced: { fromOffline: true, queuedAt: queued.queued_at },
      })

      if (saleResult.error || !saleResult.sale) {
        // THE LINE THIS SPRINT EXISTS FOR. The real reason, attached to the ref it belongs to.
        console.error('[sync-offline] sale replay FAILED', JSON.stringify({
          ref, business_id: bid, reason: saleResult.error, status: saleResult.status, voided: saleResult.voided,
        }))
        result.failed.push({ ref, reason: saleResult.error ?? 'Sale could not be created' })
        continue
      }

      result.synced.push(ref)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      console.error('[sync-offline] sale replay THREW', JSON.stringify({
        ref, business_id: bid, code: err?.code ?? null, message: err?.message ?? String(e),
      }))
      result.failed.push({ ref, reason: err?.message ?? 'Unexpected error' })
    }
  }

  result.ok = result.failed.length === 0

  // 207 Multi-Status when anything failed: a batch that lost rows MUST NOT be distinguishable from
  // a clean one by a number nobody reads. The till keys off `synced`/`failed`, but the status code
  // means even a caller that only checks `r.ok` cannot mistake a lossy sync for a good one.
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}

export const POST = withErrorCapture('pos/sync-offline', _POST)
