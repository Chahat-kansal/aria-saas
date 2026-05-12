import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staff_id, business_id } = await req.json();
  if (!staff_id || !business_id) return NextResponse.json({ error: 'staff_id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: staff } = await supabase.from('staff_members')
    .select('first_name, last_name, visa_type, visa_subclass, visa_expiry_date, visa_work_restrictions, right_to_work_verified, passport_expiry_date, passport_country')
    .eq('id', staff_id)
    .eq('business_id', business_id)
    .single();

  if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

  // Return early if citizen/PR — no visa insight needed
  if (staff.visa_type === 'Australian Citizen' || staff.visa_type === 'Permanent Resident') {
    return NextResponse.json({
      insight: `${staff.first_name} is an ${staff.visa_type} with no work restrictions. No visa action required.`
    });
  }

  // Days until expiry
  const daysUntilExpiry = staff.visa_expiry_date
    ? Math.ceil((new Date(staff.visa_expiry_date).getTime() - Date.now()) / 86400000)
    : null;

  try {
    const msg = await trackAICall({ route: 'aria/staff-visa-insight', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'staff-visa-insight' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `You are Aria, an AI advisor for Australian businesses. Provide factual, helpful guidance about a staff member's visa situation in 2-4 plain English sentences. Note: you cannot give immigration legal advice — recommend consulting a registered migration agent for complex matters. Be specific and actionable.`,
      messages: [{
        role: 'user',
        content: `Staff member: ${staff.first_name} ${staff.last_name}
Visa type: ${staff.visa_type ?? 'Unknown'}${staff.visa_subclass ? ` (Subclass ${staff.visa_subclass})` : ''}
Visa expiry: ${staff.visa_expiry_date ?? 'Not recorded'}${daysUntilExpiry !== null ? ` (${daysUntilExpiry} days)` : ''}
Work restrictions: ${staff.visa_work_restrictions ?? 'None recorded'}
Right to work verified: ${staff.right_to_work_verified ? 'Yes' : 'No'}
Today: ${new Date().toISOString().split('T')[0]}

Provide a concise, actionable Aria insight about this staff member's visa situation.`,
      }],
    }));

    const insight = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: 'Unable to generate visa insight at this time.' });
  }
}

export const POST = withErrorCapture('aria/staff-visa-insight', _POST)
