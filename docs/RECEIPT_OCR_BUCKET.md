# Receipt OCR Storage Bucket

The Sprint A receipt OCR feature persists uploaded receipt images to a
private Supabase Storage bucket so owners can audit what was scanned and
re-run extraction if needed.

## Required setup (one-time per Supabase project)

1. Open Supabase dashboard → Storage → New bucket
2. Name: `receipt-ocr-scans`
3. Public: **NO** (private)
4. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
5. Max file size: `10485760` (10 MB)
6. Save

## What happens if the bucket is missing

`/api/aria/receipt-scan` logs a warning and skips persistence — the Claude
Vision call itself still works on the in-memory buffer. The extracted line
items are still returned to the client. Only the audit trail image is lost.

## Verification

After creating the bucket, upload a test receipt via the POS terminal's
"Scan receipt" button. Check Supabase Storage → receipt-ocr-scans — there
should be 1 file under `<business_id>/`.
