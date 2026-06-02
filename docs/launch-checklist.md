# Aria OS Soft Launch Checklist

## 48 hours before

- [ ] Run `npx tsx scripts/smoke-test.ts` — all 10 checks green
- [ ] Verify Stripe is in live mode (not test mode)
- [ ] Verify Twilio sender ID approved for AU
- [ ] Verify Resend domain DNS records (SPF, DKIM, DMARC)
- [ ] Check Anthropic API key has sufficient credit for 100 businesses × 30 days
- [ ] Verify ariaos.site SSL cert expiry > 90 days
- [ ] Confirm Vercel Enhanced Builds is OFF (switch to Standard to save cost)
- [ ] Backup Supabase: Settings → Backups → Download latest

## Day of launch

- [ ] Run smoke test one final time
- [ ] Set `NEXT_PUBLIC_LAUNCH_MODE=true` in Vercel env vars
- [ ] Post to Aria's social accounts
- [ ] Monitor Vercel runtime logs for first hour (watch for 500s)
- [ ] Monitor Anthropic API dashboard for unusual spend
- [ ] Have Stripe dashboard open for first payment

## First 24 hours

- [ ] Check daily briefing cron ran at 9am AEST (check `cron_logs` table)
- [ ] Check signal engine ran (check `aria_ai_calls` for `signal_engine_synth`)
- [ ] Respond to any support tickets within 2 hours
- [ ] Check Sentry (if configured) for any new errors
- [ ] Verify at least one business completed onboarding end-to-end

## Week 1

- [ ] Review `aria_ai_calls` for unusual patterns or cost spikes
- [ ] Check council_cache hit rate: `SELECT COUNT(*) FROM council_cache WHERE expires_at > now()`
- [ ] Review `pos_sales` for any businesses with 0 sales (might need POS help)
- [ ] Send check-in email to all trial users on day 3