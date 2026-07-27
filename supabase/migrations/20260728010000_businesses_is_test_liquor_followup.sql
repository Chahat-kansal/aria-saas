-- LAUNCH-PREP-1 — fresh sweep for %test%-named / %example.com%-owned businesses turned up a THIRD
-- one the original 20260726010000 migration missed: "Aria Test Liquor", same owner email
-- (aria-test-liquor@example.com) as the already-flagged stale "Sip (E2E Test)" (...0001) but a
-- distinct business id, created earlier the same day (2026-07-11 04:16 vs 15:19) — a second
-- artifact from the same old seeding run. Applied live via Supabase MCP on 2026-07-28; this file
-- brings git in sync with prod (RULE 10).
update businesses set is_test = true where id = 'd856814a-f410-4d02-9377-c49b7fc29363'; -- Aria Test Liquor
