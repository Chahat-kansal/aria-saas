import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { messages, business_id } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    let systemPrompt = `You are Aria, an expert AI business advisor for local Australian businesses. You help owners increase revenue, retain customers, reduce costs, and make smarter decisions. Be direct, specific, and always reference numbers when you can.`;

    if (business_id) {
      const { data: business } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', business_id)
        .eq('user_id', user.id)
        .single();

      if (business) {
        const today = new Date().toISOString().slice(0, 10);
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [
          { data: todaySales },
          { data: lowStock },
          { count: atRiskCount },
          { count: totalCustomers },
          { data: recentLeaks },
          { data: weekSales },
        ] = await Promise.all([
          supabase.from('pos_sales').select('total_amount, discount_amount, payment_method')
            .eq('business_id', business_id).eq('status', 'completed').gte('created_at', `${today}T00:00:00`),
          supabase.from('pos_products').select('name, stock_quantity, low_stock_threshold')
            .eq('business_id', business_id).eq('is_active', true)
            .not('stock_quantity', 'is', null)
            .lte('stock_quantity', 10).order('stock_quantity').limit(10),
          supabase.from('customers').select('id', { count: 'exact', head: true })
            .eq('business_id', business_id).lt('last_visit', sixtyDaysAgo),
          supabase.from('customers').select('id', { count: 'exact', head: true })
            .eq('business_id', business_id),
          supabase.from('profit_leaks').select('category, description, monthly_loss')
            .eq('business_id', business_id).neq('status', 'fixed').limit(3),
          supabase.from('pos_sales').select('total_amount')
            .eq('business_id', business_id).eq('status', 'completed').gte('created_at', sevenDaysAgo),
        ]);

        const todayRevenue   = (todaySales ?? []).reduce((s: number, r: { total_amount: number }) => s + (r.total_amount || 0), 0);
        const todayCount     = (todaySales ?? []).length;
        const todayDiscounts = (todaySales ?? []).reduce((s: number, r: { discount_amount: number }) => s + (r.discount_amount || 0), 0);
        const avgSale        = todayCount > 0 ? todayRevenue / todayCount : 0;
        const weekRevenue    = (weekSales ?? []).reduce((s: number, r: { total_amount: number }) => s + (r.total_amount || 0), 0);

        const lowStockLines = (lowStock ?? []).length === 0
          ? '- No low stock alerts'
          : (lowStock ?? []).map((p: { name: string; stock_quantity: number; low_stock_threshold: number }) =>
              `  • ${p.name}: ${p.stock_quantity} units left (threshold: ${p.low_stock_threshold ?? 5})`).join('\n');

        systemPrompt = `You are Aria, an expert AI business advisor for ${business.name}, a ${business.industry} business in ${business.city || 'Australia'}.

Business profile:
- Industry: ${business.industry}
- Location: ${business.city || 'Australia'}
- Plan: ${business.plan}
- Monthly revenue target: ${business.monthly_revenue || 'not specified'}
- Staff: ${business.staff_count || 'not specified'}
- Biggest challenge: ${business.biggest_challenge || 'growing the business'}

LIVE BUSINESS DATA (use these exact numbers in your answers):

TODAY:
- Revenue: $${todayRevenue.toFixed(2)} from ${todayCount} sale${todayCount !== 1 ? 's' : ''}
- Average sale: $${avgSale.toFixed(2)}
- Discounts given today: $${todayDiscounts.toFixed(2)}
- This week total: $${weekRevenue.toFixed(2)}

INVENTORY:
${lowStockLines}

CUSTOMERS:
- Total customers: ${totalCustomers ?? 0}
- At churn risk (60+ days inactive): ${atRiskCount ?? 0}${(recentLeaks ?? []).length > 0 ? `\n\nACTIVE PROFIT LEAKS:\n${(recentLeaks ?? []).map((l: { category: string; description: string; monthly_loss: number }) => `  • ${l.category}: -$${l.monthly_loss}/mo — ${l.description}`).join('\n')}` : ''}

Your role: help ${business.owner_name || 'the owner'} make more money and run a better business. Reference the exact numbers above when answering. Never say "I don't have access to your data." Be direct and actionable.`;
      }
    }

    const anthropic = new Anthropic({ apiKey });

    const formattedMessages = messages
      .filter((m: { role: string; content: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content),
      }));

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages: formattedMessages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const data = JSON.stringify({ text: chunk.delta.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (streamErr) {
          console.error('Stream error:', streamErr);
          controller.error(streamErr);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('Aria chat fatal error:', err);
    return NextResponse.json(
      { error: 'Chat failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}