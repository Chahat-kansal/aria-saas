# Prompt 216 — Social: Performance Analytics + Content Intelligence + Aria Learning

Read CLAUDE.md first. Read src/app/dashboard/social/page.tsx IN FULL — it's 1100 lines.
Note: it already has an analytics tab with analytics state and impressions/likes/comments/shares fields.
Note: BestTimesHeatmap and ContentCalendar components already exist.

## WHAT EXISTS
- Posts, library, calendar, inbox, analytics tabs
- Analytics state with summary.by_type, engagement_rate, top_post
- BestTimesHeatmap component
- Community mirror checkbox per post

## THE CONSTRAINT
Instagram/Facebook API access is not confirmed. Build analytics using:
1. Aria Community engagement data (we control this — likes, comments, saves on community posts)
2. Manual engagement entry (owner can enter Instagram metrics after posting)
3. AI analysis of content characteristics to predict performance

Do NOT depend on Meta Graph API. Build for what we have.

## TASK 1 — Community engagement analytics (real data we have)
Commit: "feat(social/analytics): community engagement analytics from Aria Community data"

Read the analytics tab render code in social/page.tsx. It currently loads from /api/social/analytics.
Enhance /api/social/analytics to also query community_posts for this business:
- COUNT by post type (reel vs image vs text)
- SUM(likes_count + comments_count + saves_count) per post
- Average engagement per type
- Best performing posts (top 5 by engagement)
- Best posting days/times based on community post created_at vs engagement

In the analytics tab UI, add:
- "Content performance" section: bar chart of avg engagement by type (reel, image, text)
- "Top 5 posts" list with engagement numbers
- "Best times to post" — enhance the existing BestTimesHeatmap with community data overlay
- If reels outperform images: "Your reels get {X}x more engagement than image posts — Aria will create more reels"

## TASK 2 — Manual Instagram metrics entry
Commit: "feat(social/analytics): manual metric entry for published posts"

On posts with status === 'published', add a "Log metrics" button (small, below the post).
Opens an inline form: Impressions | Likes | Comments | Shares | Saves (all number inputs).
PATCH /api/social/posts/{id}/metrics { impressions, likes, comments, shares, saves }
Store in social_posts table (add columns if missing via Supabase MCP migration).

Once metrics are logged, show them on the post card (small row of numbers).
Roll up into the analytics tab summary.

## TASK 3 — Aria content intelligence (learns from what works)
Commit: "feat(social/aria-learning): Aria learns from engagement and suggests better content"

After analytics are loaded, call GET /api/aria/social-intelligence?business_id=X.

This route:
1. Reads the last 30 community posts + their engagement
2. Reads any manual metrics logged
3. Uses haiku to generate 3 specific, data-backed content insights:
   - "Your Tuesday posts get 2.3x more engagement than Monday — post Tuesday morning"
   - "Posts with prices get 40% fewer likes but 3x more DM inquiries — keep using them"
   - "Reels under 30 seconds outperform longer ones in your community"
4. Returns { insights: string[], top_content_type: string, best_day: string, best_hour: number }

Show insights in the analytics tab as "What Aria learned" cards (1 per insight, sage-tinted).
Log to aria_ai_calls.

## TASK 4 — Content generation uses learned preferences
Commit: "feat(social/aria-learning): generated posts use Aria's learned preferences"

When generating a new post (the existing generate button), append to the prompt:
- top_content_type from social-intelligence
- best_day / best_hour as the suggested scheduled_for
- "Based on your past performance, {specific insight}"

This closes the loop: post → engage → Aria learns → next post is better.

## RULES
- Read the full 1100-line page before touching it. One commit per task.
- npx tsc --noEmit + npm run build before every commit.
- UPGRADE-ONLY. Keep all existing tabs and features.
- Do NOT remove BestTimesHeatmap or ContentCalendar — enhance them.
- haiku for AI calls.
