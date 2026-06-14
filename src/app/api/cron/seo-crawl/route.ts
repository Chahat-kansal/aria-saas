export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { crawlSite } from '@/lib/seo/crawler';
import { analyzePage, computeHealthScore } from '@/lib/seo/audit';

// Cap businesses per run so we stay under maxDuration
const BIZ_CAP = 5;

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

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
      const { pages } = await crawlSite(biz.website as string);

      // Insert seo_pages rows
      if (pages.length > 0) {
        await supabaseAdmin.from('seo_pages').insert(
          pages.map(p => ({
            business_id: biz.id,
            audit_id: auditId,
            url: p.url,
            http_status: p.httpStatus,
            title: p.title,
            title_length: p.title?.length ?? 0,
            meta_description: p.metaDescription,
            meta_description_length: p.metaDescription?.length ?? 0,
            h1_count: p.h1s.length,
            word_count: p.wordCount,
            images_total: p.images.length,
            images_missing_alt: p.images.filter(i => !i.hasAlt).length,
            has_schema: p.hasJsonLd,
            load_ms: p.responseTimeMs,
            page_size_kb: p.pageSizeKb,
            depth: p.depth,
            parent_url: p.parentUrl,
            crawled_at: new Date().toISOString(),
          }))
        );
      }

      // Collect all issues from all pages
      const allIssues = pages.flatMap(page => analyzePage(page));

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

      const healthScore = computeHealthScore(allIssues);

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
