export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const DEFAULTS: Record<string, { title: string; category: string }[]> = {
  retail: [
    { title: 'ABN registered', category: 'Business Registration' },
    { title: 'GST registration', category: 'Business Registration' },
    { title: 'Business name registered', category: 'Business Registration' },
    { title: 'Public liability insurance', category: 'Insurance' },
    { title: 'Product liability insurance', category: 'Insurance' },
    { title: 'Workers compensation insurance', category: 'Insurance' },
    { title: 'Fair Work compliance', category: 'Employment' },
    { title: 'Staff contracts in place', category: 'Employment' },
    { title: 'Privacy policy displayed', category: 'Legal' },
    { title: 'Refund policy displayed', category: 'Legal' },
    { title: 'Fire safety compliance', category: 'Safety' },
    { title: 'First aid kit on premises', category: 'Safety' },
  ],
  cafe: [
    { title: 'Food business registration', category: 'Food Safety' },
    { title: 'Food Safety Supervisor certificate', category: 'Food Safety' },
    { title: 'Food safety management plan', category: 'Food Safety' },
    { title: 'Liquor licence (if applicable)', category: 'Licences' },
    { title: 'ABN registered', category: 'Business Registration' },
    { title: 'GST registration', category: 'Business Registration' },
    { title: 'Public liability insurance', category: 'Insurance' },
    { title: 'Workers compensation insurance', category: 'Insurance' },
    { title: 'Fire safety compliance', category: 'Safety' },
    { title: 'First aid kit on premises', category: 'Safety' },
    { title: 'Fair Work compliance', category: 'Employment' },
  ],
  visa: [
    { title: 'MARA registration current', category: 'Licences' },
    { title: 'Professional indemnity insurance current', category: 'Insurance' },
    { title: 'Public liability insurance', category: 'Insurance' },
    { title: 'Trust account maintained', category: 'Financial' },
    { title: 'CPD hours completed for year', category: 'Professional Development' },
    { title: 'Code of conduct compliance', category: 'Professional Standards' },
    { title: 'Client agreements signed', category: 'Client Management' },
    { title: 'File notes maintained', category: 'Client Management' },
    { title: 'Complaints process documented', category: 'Legal' },
    { title: 'Privacy policy in place', category: 'Legal' },
  ],
  tradie: [
    { title: 'Contractor licence current', category: 'Licences' },
    { title: 'Public liability insurance', category: 'Insurance' },
    { title: 'Workers compensation insurance', category: 'Insurance' },
    { title: 'Home building insurance (if applicable)', category: 'Insurance' },
    { title: 'ABN registered', category: 'Business Registration' },
    { title: 'GST registration', category: 'Business Registration' },
    { title: 'Safety induction completed', category: 'Safety' },
    { title: 'First aid kit on-site', category: 'Safety' },
    { title: 'Fair Work compliance', category: 'Employment' },
  ],
  salon: [
    { title: 'Council approval / health premises registration', category: 'Licences' },
    { title: 'Public liability insurance', category: 'Insurance' },
    { title: 'Workers compensation insurance', category: 'Insurance' },
    { title: 'ABN registered', category: 'Business Registration' },
    { title: 'GST registration', category: 'Business Registration' },
    { title: 'Chemical handling training', category: 'Safety' },
    { title: 'First aid kit on premises', category: 'Safety' },
    { title: 'Privacy policy in place', category: 'Legal' },
    { title: 'Fair Work compliance', category: 'Employment' },
  ],
  gym: [
    { title: 'Registration as fitness facility', category: 'Licences' },
    { title: 'Public liability insurance', category: 'Insurance' },
    { title: 'Professional indemnity insurance', category: 'Insurance' },
    { title: 'Workers compensation insurance', category: 'Insurance' },
    { title: 'ABN registered', category: 'Business Registration' },
    { title: 'First aid officer on premises', category: 'Safety' },
    { title: 'AED (defibrillator) on premises', category: 'Safety' },
    { title: 'Equipment safety checks logged', category: 'Safety' },
    { title: 'Fair Work compliance', category: 'Employment' },
    { title: 'Member contracts / waivers signed', category: 'Legal' },
  ],
};

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<{ id: string; industry: string } | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  const bid = active?.business_id ?? (await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.id;
  if (!bid) return null;
  const { data: biz } = await supabase.from('businesses').select('id, industry').eq('id', bid).single();
  return biz ? { id: biz.id, industry: biz.industry } : null;
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const biz = await getBid(supabase, user.id);
  if (!biz) return NextResponse.json({ items: [] });
  const { data } = await supabase.from('compliance_items').select('*').eq('business_id', biz.id).order('category').order('title');
  return NextResponse.json({ items: data ?? [], initialized: (data?.length ?? 0) > 0 });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const biz = await getBid(supabase, user.id);
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  // Initialize defaults for industry
  if (body.initialize) {
    const industry = biz.industry?.toLowerCase() ?? '';
    const key = Object.keys(DEFAULTS).find(k => industry.includes(k)) ?? 'retail';
    const defaults = DEFAULTS[key] ?? DEFAULTS.retail;
    const { data, error } = await supabase.from('compliance_items').insert(
      defaults.map(d => ({ ...d, business_id: biz.id, industry: biz.industry, is_completed: false }))
    ).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data });
  }
  // Add custom item
  const { data, error } = await supabase.from('compliance_items').insert({ ...body, business_id: biz.id, industry: biz.industry }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { is_completed } = await req.json();
  const { error } = await supabase.from('compliance_items').update({
    is_completed,
    completed_at: is_completed ? new Date().toISOString() : null,
  }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('aria/compliance', _GET)
export const POST = withErrorCapture('aria/compliance', _POST)
export const PATCH = withErrorCapture('aria/compliance', _PATCH)
