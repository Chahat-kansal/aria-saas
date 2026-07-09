-- BUG1 fix (ONBOARD-FIX-1): businesses.slug must never be null — recurring incident
-- (Global Liquor, earlier Chahat) broke slug-routing for the CX app. Backfill any
-- remaining null slugs using the exact Sip Café pattern (slugify(name) + '-' + first
-- 6 chars of id), then lock it down with NOT NULL. businesses_slug_unique already
-- exists from 20260528000005_customer_hub.sql.

UPDATE businesses
SET slug = NULLIF(trim(both '-' from lower(regexp_replace(COALESCE(NULLIF(trim(name), ''), 'business'), '[^a-z0-9]+', '-', 'gi'))), '')
           || '-' || substr(id::text, 1, 6)
WHERE slug IS NULL;

ALTER TABLE businesses ALTER COLUMN slug SET NOT NULL;
