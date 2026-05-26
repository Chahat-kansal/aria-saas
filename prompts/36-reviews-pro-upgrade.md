# Prompt 36 — Reviews Page Pro Upgrade

## Context
`src/app/dashboard/reviews/page.tsx` is 35KB. Shows Google reviews.
Must beat Birdeye and Podium for small business review management.

## Pre-edit checklist (MANDATORY)
1. Read full: `src/app/dashboard/reviews/page.tsx`
2. Read: `src/app/api/pos/sync-reviews/route.ts` or similar review sync route
3. Check DB: `pos_reviews` or `business_reviews` table columns
4. Read: `src/app/api/aria/competitor-watches/route.ts`

## Features to add

### 1. Sentiment timeline chart
Line chart showing average rating per week over last 12 weeks.
Use recharts LineChart.
Green line for your rating, grey dashed for competitor average.
Data: group reviews by week, average rating.

### 2. Keyword analysis
Two word clouds (use a simple frequency count, not an actual word cloud library):
- Top positive words (from 4-5 star reviews)
- Top negative words (from 1-2 star reviews)
Show as horizontal bar chart: word | count | colored bar.
Parse review text, strip common words (the, a, is, was, etc), count remaining.

### 3. Auto-response drafts
For each review without a response, show "Draft response" button.
On click: call `/api/aria/review-response` with review text and rating.
Returns AI-drafted response respecting: professional, warm, Australian English.
Show draft in editable textarea below review.
"Copy response" button — copies to clipboard so owner can paste into Google.
(We cannot auto-post to Google without their API — clipboard is the right approach.)

### 4. Review request sender
New section: "Request reviews from recent customers"
Shows last 20 customers with a purchase in last 7 days.
Checkbox select + "Send review request SMS" button.
SMS text: "Hi [name], thanks for visiting [business]! We'd love your feedback: [Google review link]"
Call existing SMS/Twilio infrastructure.
Store `review_link` on business (owner pastes their Google review URL in settings).

### 5. Rating comparison card  
Pull from `aria_competitor_watches` — show competitor names.
Display: Your rating vs top 3 competitors side by side.
Simple horizontal bars with ratings.
"What they do better" — pull from competitor review keywords.

## Execution
1. Read all pre-edit files
2. Build all features — no stubs
3. `npx tsc --noEmit` — fix ALL errors
4. `npm run build` — must pass
5. `git add src/app/dashboard/reviews/page.tsx && git commit -m "feat: reviews — sentiment timeline, keyword analysis, AI response drafts, review requests, competitor comparison" && git push`
