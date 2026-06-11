# BRIEF-1 — Briefing System (all parts)
STATUS: DONE ✅ c0fbb7f7

Completed 2026-06-10. All tasks shipped in one commit.

## What was built

### Part 1 — upsertAriaAction dedup (9286df16)
- `upsertAriaAction` utility created in `src/lib/aria/upsert-aria-action.ts`
- Applied at all 17 insert sites across the codebase
- Prevents duplicate aria_actions rows from concurrent briefing runs

### Part 2 — Briefing surface fix (c0fbb7f7)
- `/api/aria/briefing` now checks `aria_daily_briefings` before running council
- `force=true` bypasses cache (used by manual refresh in AriaBriefingCard)
- Dashboard briefing card serves cached content instantly on load

### Part 3 — Generator improvements (c0fbb7f7)
- Revenue vs 28-35d daily average + $4,500/day target
- Top/bottom product movers (week vs prior week by revenue)
- Open-Meteo weather (uses businesses.lat/lng)
- AU RSS headlines (SmartCompany + ABC Business, 3 headlines, silent-fail)
- Anti-repetition: last 3 briefing leads sent to LLM as context
- MAX ONE pending aria_action recommendation per briefing
- Structured prefix prepended to parallel-agents output in aria_daily_briefings

### Stability fixes (c0fbb7f7)
- WebGL context-loss: `stopAriaSpeech()` moved to true-unmount useEffect only
- webglcontextrestored: re-applies setClearColor + setPixelRatio
- GPU pressure: antialias:false, powerPreference:default, setPixelRatio(min(dpr,1.5))
- TTS watchdog: clamp(3000+chars×150, 10000, 30000ms)
- Worker cancel: `{type:'cancel'}` posted before speechSynthesis fallback

## No further action needed.
