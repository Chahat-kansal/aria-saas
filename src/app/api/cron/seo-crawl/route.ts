export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { crawlSite } from '@/lib/seo/crawler';
import { auditPage, computeHealthScore } from '@/lib/seo/audit';

const CRON_SECRET = process.env.CRON_SECRET ?? '';
// Cap businesses per run so we stay under maxDuration
const BIZ_CAP = 5;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Load businesses with a non-empty website, ordered by oldest-audited first
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, website, name')
    .not('website', 'is', null)
    .neq('website', '')
    .eq('is_active', true)
    .limit(BIZ_CAP);

  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ ok: true, businesses_processed: 0 });
  }

  let businesses_processed = 0;

  for (const biz of businesses) {
    // Insert running audit row
    const { data: auditRow } = await supabaseAdmin
      .from('seo_audits')
      .insert({
        business_id: biz.id,
        status: 'running',
        started_at: new Date().toISOString(),
        pages_crawled: 0,
        issues_found: 0,
        issues_fixed: 0,
        health_score: 0,
      })
      .select('id')
      .single();

    const auditId = auditRow?.id as string | undefined;
    if (!auditId) continue;

    try {
      // Crawl the site
      const pages = await crawlSite(biz.website as string);

      // Insert seo_pages rows
      if (pages.length > 0) {
        await supabaseAdmin.from('seo_pages').insert(
          pages.map(p => ({
            business_id: biz.id,
            audit_id: auditId,
            url: p.url,
            http_status: p.http_status,
            title: p.title,
            title_length: p.title_length,
            meta_description: p.meta_description,
            meta_description_length: p.meta_description_length,
            h1_count: p.h1_count,
            word_count: p.word_count,
            images_total: p.images_total,
            images_missing_alt: p.images_missing_alt,
            has_schema: p.has_schema,
            load_ms: p.load_ms,
            crawled_at: new Date().toISOString(),
          }))
        );
      }

      // Collect all issues from all pages
      const allIssues: Array<{ page_url: string; issue_type: string; severity: string; title: string; detail: string }> = [];
      for (const page of pages) {
        const pageIssues = auditPage(page);
        for (const issue of pageIssues) {
          allIssues.push({ page_url: page.url, ...issue });
        }
      }

      // VERIFY LOOP: check applied issues
      const { data: appliedIssues } = await supabaseAdmin
        .from('seo_issues')
        .select('id, issue_type, page_url')
        .eq('business_id', biz.id)
        .eq('state', 'applied');

      let issuesFixed = 0;
      for (const applied of appliedIssues ?? []) {
        const stillPresent = allIssues.some(
          i => i.issue_type === applied.issue_type && i.page_url === applied.page_url
        );
        if (!stillPresent) {
          await supabaseAdmin
            .from('seo_issues')
            .update({ state: 'verified', verified_at: new Date().toISOString() })
            .eq('id', applied.id);
          issuesFixed++;
        }
      }

      // Skip issues already applied or verified for same type+url
      const { data: existingIssues } = await supabaseAdmin
        .from('seo_issues')
        .select('issue_type, page_url')
        .eq('business_id', biz.id)
        .in('state', ['applied', 'verified']);

      const skipSet = new Set(
        (existingIssues ?? []).map(i => i.issue_type + '|' + i.page_url)
      );

      const toInsert = allIssues.filter(
        i => !skipSet.has(i.issue_type + '|' + i.page_url)
      );

      if (toInsert.length > 0) {
        await supabaseAdmin.from('seo_issues').insert(
          toInsert.map(i => ({
            business_id: biz.id,
            audit_id: auditId,
            page_url: i.page_url,
            issue_type: i.issue_type,
            severity: i.severity,
            title: i.title,
            detail: i.detail,
            suggested_fix: null,
            fix_format: null,
            state: 'open',
          }))
        );
      }

      const healthScore = computeHealthScore(
        allIssues.map(i => ({ issue_type: i.issue_type, severity: i.severity as 'high' | 'medium' | 'low', title: i.title, detail: i.detail }))
      );

      await supabaseAdmin
        .from('seo_audits')
        .update({
          status: 'complete',
          finished_at: new Date().toISOString(),
          pages_crawled: pages.length,
          issues_found: toInsert.length,
          issues_fixed: issuesFixed,
          health_score: healthScore,
        })
        .eq('id', auditId);

      console.log(`[seo-crawl] ${biz.website}: ${pages.length} pages, ${toInsert.length} issues, score ${healthScore}`);
      businesses_processed++;
    } catch (e) {
      await supabaseAdmin
        .from('seo_audits')
        .update({
          status: 'failed',
          error_detail: String(e).slice(0, 300),
          finished_at: new Date().toISOString(),
        })
        .eq('id', auditId);
      console.log(`[seo-crawl] ${biz.website}: FAILED — ${String(e).slice(0, 100)}`);
    }
  }

  return NextResponse.json({ ok: true, businesses_processed });
}
