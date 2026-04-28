import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBusinessSales, getBusinessCustomers, getBusinessItems } from '@/lib/business-data';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { message, conversation_history = [], business_id, include_data } = await req.json();
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'message required' }), { status: 400 });

  // Verify ownership
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, owner_name, industry, city, data_source')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();

  if (!business) return new Response(JSON.stringify({ error: 'Business not found' }), { status: 404 });

  const dataSource = (business.data_source ?? 'aria_pos') as 'square' | 'aria_pos';

  let businessContext = '';

  if (include_data && business_id) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const lastMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

    const [sales30, salesThisMonth, salesLastMonth, customers, items] = await Promise.all([
      getBusinessSales(business_id, thirtyDaysAgo, dataSource),
      getBusinessSales(business_id, thisMonthStart, dataSource),
      getBusinessSales(business_id, lastMonthStart, dataSource).then(s => s.filter(x => x.soldAt < thisMonthStart)),
      getBusinessCustomers(business_id, dataSource),
      getBusinessItems(business_id, dataSource),
    ]);

    const revThisMonth = salesThisMonth.reduce((s, x) => s + x.totalCents, 0);
    const revLastMonth = salesLastMonth.reduce((s, x) => s + x.totalCents, 0);
    const revChangePct = revLastMonth > 0 ? Math.round(((revThisMonth - revLastMonth) / revLastMonth) * 100) : 0;

    // Top products by revenue
    const productRevenue: Record<string, number> = {};
    for (const sale of sales30) {
      for (const li of sale.lineItems) {
        productRevenue[li.itemName] = (productRevenue[li.itemName] ?? 0) + li.priceCents * li.quantity;
      }
    }
    const topProducts = Object.entries(productRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, cents]) => `${name}: A$${(cents / 100).toFixed(0)}`);

    const lowStock = items.filter(i => i.reorderPoint > 0 && i.currentStock <= i.reorderPoint);
    const lapsed = customers.filter(c => !c.lastVisitAt || c.lastVisitAt < sixtyDaysAgo);
    const highChurn = customers.filter(c => c.churnRisk === 'high' || c.churnRisk === 'churned');

    businessContext = `
Business: ${business.name}, Industry: ${business.industry}, Location: ${business.city ?? 'Australia'}
Revenue this month: A$${(revThisMonth / 100).toFixed(0)} (${revChangePct > 0 ? '+' : ''}${revChangePct}% vs last month)
Top products by revenue (last 30 days): ${topProducts.join('; ') || 'No sales data'}
Low stock items: ${lowStock.length === 0 ? 'None' : lowStock.map(i => `${i.name} (${i.currentStock} left, reorder at ${i.reorderPoint})`).join('; ')}
Total customers: ${customers.length}, Lapsed 60+ days: ${lapsed.length}, High churn risk: ${highChurn.length}
Total products in catalogue: ${items.length}`.trim();
  }

  const systemPrompt = `You are Aria, the AI advisor for ${business.name}, a ${business.industry} business in Australia.
${businessContext ? `\nLIVE BUSINESS DATA:\n${businessContext}` : ''}

CAPABILITIES:
- Answer questions about sales, inventory, customers, and performance using the real data above
- Suggest specific actions based on actual numbers
- When a chart would help, include it at the END of your response in this exact format:

<chart>
{"type":"bar","title":"string","data":[{"label":"string","value":number,"color":"optional hex"}],"unit":"currency|count|percentage"}
</chart>

RULES:
- Only reference numbers from the business data above
- Use Australian English and A$ for currency
- Be specific and actionable, not generic
- If you don't have data to answer precisely, say so
- Keep responses concise — business owners are busy
- Never fabricate product names, customer names, or financial figures`;

  const messages: Anthropic.MessageParam[] = [
    ...conversation_history.slice(-10).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const claudeStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        });

        let fullText = '';
        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text;
            // Stream text but strip chart blocks from display
            const displayText = chunk.delta.text;
            if (displayText) send({ text: displayText });
          }
        }

        // Extract chart after full response
        const chartMatch = fullText.match(/<chart>([\s\S]*?)<\/chart>/);
        if (chartMatch) {
          try {
            const chartData = JSON.parse(chartMatch[1].trim());
            send({ chart: chartData });
          } catch { /* invalid chart JSON — skip */ }
        }

        send({ done: true });
      } catch (err: any) {
        send({ error: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
