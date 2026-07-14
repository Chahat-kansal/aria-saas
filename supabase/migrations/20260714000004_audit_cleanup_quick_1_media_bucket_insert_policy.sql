-- AUDIT-CLEANUP-QUICK-1 — the "media" storage bucket (public:true, used for genuinely public
-- marketing/social content — voiceover audio for reels, generated social images) had an INSERT
-- policy open to the fully anonymous 'public' role with NO auth.uid() check at all:
--   media_service_insert: roles={public}, with_check=(bucket_id = 'media')
-- Every real app write to this bucket (generate-image, generate-voiceover routes) already goes
-- through the service-role client, which bypasses RLS entirely — this policy served zero
-- legitimate purpose and was pure attack surface: anyone with the public anon key (exposed
-- client-side by design) could upload arbitrary files (up to 50MB, images/video/audio) directly to
-- Supabase Storage, bypassing the Next.js app entirely, and have them served publicly.
--
-- Tightened to require authentication, matching the pattern the sibling reel-scenes bucket already
-- uses ("reel scenes owner upload": with_check includes auth.uid() IS NOT NULL). Read access
-- (media_public_read) and the existing owner-scoped delete policy are untouched — this bucket is
-- meant to stay public-READ; only anonymous, unauthenticated WRITE is closed off.
--
-- The other three sensitivity categories AUDIT-CLEANUP-QUICK-1 asked about (business-private,
-- documents, exports) already exist as their own purpose-specific private buckets rather than
-- being mixed into "media" — confirmed via live storage.objects content (only 4 objects, all
-- voiceover/<business_id>/*.mp3) and storage.buckets (public=false already set on aria-exports,
-- receipt-ocr, reel-scenes, reports). No redundant new buckets created — see AUDIT-CLEANUP-QUICK-1
-- commit message for the full mapping.

DROP POLICY IF EXISTS "media_service_insert" ON storage.objects;

CREATE POLICY "media_authenticated_insert" ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'media' AND auth.uid() IS NOT NULL);
