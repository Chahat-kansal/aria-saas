export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { z } from 'zod';
import { validateBody } from '@/lib/api/validate';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { createUser, createAuthLink, isConfigured } from '@/lib/integrations/basiq';

const ConnectSchema = z.object({ business_id: z.string().uuid() })

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isConfigured()) return NextResponse.json({ error: 'BASIQ_API_KEY not configured' }, { status: 500 });

  const parsed = await validateBody(req, ConnectSchema)
  if ('error' in parsed) return parsed.error
  const { business_id } = parsed.data

  const { data: biz } = await supabase.from('businesses')
    .select('id, basiq_user_id, email').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let basiqUserId = (biz.basiq_user_id as string | null) ?? null;
  if (!basiqUserId) {
    // Use the authenticated user's email as the primary source — it's always a
    // real verified email. Fall back to the businesses.email column only if the
    // user session somehow has no email (rare Google OAuth edge case).
    const email = user.email ?? (biz.email as string | null);
    if (!email) {
      return NextResponse.json({
        error: 'Please add an email address to your profile before connecting your bank.',
      }, { status: 400 });
    }
    // Basic format guard so Basiq never receives a malformed value.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({
        error: 'Your account email appears to be invalid. Please update it in your profile settings.',
      }, { status: 400 });
    }
    const created = await createUser(email);
    basiqUserId = created.id;
    await supabaseAdmin.from('businesses').update({ basiq_user_id: basiqUserId }).eq('id', business_id);
  }

  const link = await createAuthLink(basiqUserId, business_id);
  return NextResponse.json({ consent_url: link.url, basiq_user_id: basiqUserId, expires_at: link.expiresAt ?? null });
}

export const POST = withErrorCapture('integrations/basiq/connect', _POST);
