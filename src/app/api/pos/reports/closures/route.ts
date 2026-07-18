export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  try {
    const { data: sessions, error } = await supabase
      .from('pos_cash_sessions')
      .select('*')
      .eq('business_id', bid)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Compute per-session sales totals from actual sales (not NULL session columns)
    // INTEL-COMPUTE-3 — was neq('voided'), which still admits draft/refunded rows into a till
    // reconciliation figure (the exact class of bug the cash-up/pos-sales fix addressed last
    // sprint). status='completed' is the canonical filter.
    const sessionIds = (sessions ?? []).map(s => s.id);
    const { data: salesData } = sessionIds.length > 0 ? await supabase
      .from('pos_sales').select('session_id, payment_method, total_amount')
      .in('session_id', sessionIds).eq('status', 'completed') : { data: [] };

    const salesMap: Record<string, { cash: number; card: number; total: number; count: number }> = {};
    for (const sale of salesData ?? []) {
      const sid = sale.session_id as string;
      if (!sid) continue;
      if (!salesMap[sid]) salesMap[sid] = { cash: 0, card: 0, total: 0, count: 0 };
      const amt = Number(sale.total_amount ?? 0);
      const method = String(sale.payment_method ?? 'cash');
      salesMap[sid].total += amt;
      salesMap[sid].count += 1;
      if (method === 'cash') salesMap[sid].cash += amt;
      else salesMap[sid].card += amt;
    }

    const rows = (sessions ?? []).map(s => {
      const totals = salesMap[s.id] ?? { cash: 0, card: 0, total: 0, count: 0 };
      const openingFloat = Number(s.opening_float ?? 0);
      // Map to cent-based columns the closures page expects
      const open_float_cents    = Math.round(openingFloat * 100);
      const card_total_cents    = Math.round(totals.card * 100);
      const total_sales_cents   = Math.round(totals.total * 100);
      // actual_cash_cents already in DB; fall back to closing_float dollars → cents
      const counted_cash_cents  = s.actual_cash_cents != null
        ? Number(s.actual_cash_cents)
        : Math.round(Number(s.closing_float ?? 0) * 100);
      const expected_cash_cents = s.expected_cash_cents != null
        ? Number(s.expected_cash_cents)
        : Math.round((openingFloat + totals.cash) * 100);
      const variance_cents = s.variance_cents != null
        ? Number(s.variance_cents)
        : counted_cash_cents - expected_cash_cents;
      const opened = s.opened_at ? new Date(s.opened_at) : null;
      const closed = s.closed_at ? new Date(s.closed_at) : null;
      const duration_mins = opened && closed
        ? Math.round((closed.getTime() - opened.getTime()) / 60000) : null;
      return {
        ...s,
        open_float_cents,
        counted_cash_cents,
        expected_cash_cents,
        variance_cents,
        card_total_cents,
        eftpos_total_cents: card_total_cents,
        total_sales_cents,
        total_revenue: totals.total,
        transaction_count: totals.count,
        duration_mins,
      };
    });

    return NextResponse.json({ closures: rows, sessions: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = withBusinessContext('pos/reports/closures', _GET)
