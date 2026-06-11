# S44 — TikTok Integration
STATUS: ABSENT | MODE: SOLO
Covers: prompts/65

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
Requires: TikTok for Business developer account + app approved for Content Posting API.
TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET must be in Vercel env.
Sibling-check: `%tiktok%`, `%social_connections%`

## CONSTRAINT CATALOGUE
Tables: social_connections (platform, access_token, is_active), social_posts
Run live SQL before any edit.

## Full implementation scope

### OAuth connect
- POST /api/integrations/tiktok/connect → TikTok OAuth flow
- Store access_token + platform='tiktok' in social_connections
- Callback: /api/integrations/tiktok/callback

### Content posting
- TikTok Creator API: post video to TikTok (requires video file URL)
- social_posts.platform = 'tiktok' → publish via TikTok API
- Extend /api/social/posts/[id]/publish to handle TikTok platform

### Analytics pull
- TikTok Analytics API: pull views, likes, shares, comments for published posts
- Update social_posts.impressions, likes, comments, shares (columns added via prior migration)

### TikTok-specific content generation
- "Generate TikTok reel concept" button in social studio
- Prompt: product + audience → short video script + hook line
- Use existing reel_concept + reel_script columns on social_posts

## Aria Intelligence Rule
- TikTok post published → aria_ai_calls log
- Post performance after 48h → if views < 100: upsertAriaAction 'TikTok post underperforming — consider boosting'

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] TikTok OAuth connect flow works; social_connections row created
- [ ] Schedule TikTok post → publishes at scheduled time; platform_post_id saved
- [ ] Analytics sync pulls views/likes/shares
- [ ] Reel concept generation works; reel_script column populated

## Push
SOLO mode — stop before push. Write reports/sprint-S44-report.md.
