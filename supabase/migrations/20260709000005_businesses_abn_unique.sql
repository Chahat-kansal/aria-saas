-- ABN-UNIQUE: prevent duplicate-ABN businesses. Zero dup ABNs in prod today
-- (SELECT abn, count(*) ... HAVING count(*)>1 returned no rows — verified
-- before adding this constraint per RULE0's dedup-first requirement).
--
-- Built on a normalized (digits-only) expression rather than the raw column:
-- the one ABN currently stored ("48 696 344 939") has spaces, and onboarding
-- writes whatever the owner typed with no normalization — a raw-column unique
-- index would silently miss "48696344939" vs "48 696 344 939" as duplicates.
-- Partial (WHERE abn IS NOT NULL AND abn <> '') so incomplete-onboarding rows
-- with no ABN yet never collide.

CREATE UNIQUE INDEX IF NOT EXISTS businesses_abn_unique
ON businesses (regexp_replace(abn, '[^0-9]', '', 'g'))
WHERE abn IS NOT NULL AND abn <> '';
