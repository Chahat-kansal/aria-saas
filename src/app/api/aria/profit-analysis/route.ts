import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { businessId } = await req.json();
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .eq('user_id', session.user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: bookings }, { data: customers }] = await Promise.all([
    supabase.from('bookings').select('date,value,status,source').eq('business_id', businessId).gte('date', ninetyDaysAgo),
    supabase.from('customers').select('visit_count,total_spend,last_visit,churn_risk').eq('business_id', businessId),
  ]);

  const totalRevenue = (bookings || []).reduce((s, b) => s + (b.value || 0), 0);
  const cancelledBookings = (bookings || []).filter(b => b.status === 'cancelled').length;
  const lapsedCustomers = (customers || []).filter(c => c.churn_risk !== 'low').length;
  const avgSpend = customers?.length
    ? (customers.reduce((s, c) => s + (c.total_spend || 0), 0) / customers.length).toFixed(2)
    : 0;

  const prompt = `You are a business analyst. Analyse this data for ${business.name} (${business.industry}) and identify profit leaks.

Data (last 90 days):
- Total revenue: $${totalRevenue}
- Total bookings: ${bookings?.length || 0}
- Cancelled bookings: ${cancelledBookings} (${bookings?.length ? Math.round(cancelledBookings / bookings.length * 100) : 0}%)
- Total customers: ${customers?.length || 0}
- At-risk customers (medium/high churn): ${lapsedCustomers}
- Average customer spend: $${avgSpend}
- Staff count: ${business.staff_count}
- Monthly revenue range: ${business.monthly_revenue}
- Biggest challenge: ${business.biggest_challenge}

Identify 3-5 specific profit leaks. For each, return a JSON array with:
[
  {
    "category": "category name",
    "description": "specific description of the leak",
    "monthly_loss": estimated monthly dollar loss as a number,
    "fix_suggestion": "specific actionable fix"
  }
]
Return ONLY the JSON array, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON found');

    const leaks: Array<{ category: string; description: string; monthly_loss: number; fix_suggestion: string }> = JSON.parse(jsonMatch[0]);

    // Save to Supabase
    const inserted = await supabase.from('profit_leaks').insert(
      leaks.map(l => ({
        business_id: businessId,
        category: l.category,
        description: l.description,
        monthly_loss: l.monthly_loss,
        fix_suggestion: l.fix_suggestion,
        status: 'detected',
      }))
    ).select();

    // Log activity
    await supabase.from('activity_log').insert({
      business_id: businessId,
      action_type: 'leak',
      description: `Aria detected ${leaks.length} profit leaks totalling $${leaks.reduce((s, l) => s + l.monthly_loss, 0).toLocaleString()}/mo`,
    });

    return NextResponse.json({ leaks: inserted.data || leaks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
