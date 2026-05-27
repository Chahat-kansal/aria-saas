# Prompt 78 — Aria Community: Local Business Social Network + Marketplace
# (BUILD AFTER FRIDAY LIMIT RESET — large, multi-phase build)

## The vision
A full social network + marketplace for local businesses and their customers.
A customer joins ONCE and connects to every Aria business near them.
Facebook/Instagram + LinkedIn + a marketplace — but for local commerce.
Owners post (Aria drafts for them), upload reels/videos, run 24h offers.
Customers browse, follow, chat, and buy — payment in person, not online.

## Why this matters
- Free marketing for every business — Aria writes + posts + times it
- One customer signup connects them to all local Aria businesses
- Network effect — every new business makes the network more valuable
- Shared customer graph — makes Aria impossible to leave
- The marketplace gives customers a reason to open the app daily

## CRITICAL — privacy & consent (non-negotiable, build FIRST)
- Following a business is explicit opt-in, PER business
- Following the cafe does NOT consent the bottle shop to message you
- Each business reaches only its OWN followers
- Full Australian Privacy Act + Spam Act compliance — consent records, unsubscribe
- Customer can leave any business or the whole network anytime
- Push notifications require explicit per-device opt-in

## PHASE 1 — Identity + consent foundation
DB:
```sql
CREATE TABLE community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE, name text, phone text, avatar_url text,
  push_token text, push_enabled boolean DEFAULT false,
  joined_at timestamptz DEFAULT now()
);
CREATE TABLE community_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES community_members(id),
  business_id uuid REFERENCES businesses(id),
  followed_at timestamptz DEFAULT now(),
  consent_marketing boolean DEFAULT false,
  notifications_on boolean DEFAULT true,
  is_hidden boolean DEFAULT false,
  unfollowed_at timestamptz,
  UNIQUE(member_id, business_id)
);
```
Build: join flow, follow/unfollow with explicit consent.

## PHASE 2 — Posts, reels, videos, stories
DB:
```sql
CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  post_type text,  -- offer, new_stock, update, event, reel, video, story
  title text, body text,
  media_urls jsonb,        -- images, video, reel urls (Vercel Blob)
  media_type text,         -- image, video, reel
  is_story boolean DEFAULT false,
  expires_at timestamptz,  -- for 24h stories/offers
  ai_generated boolean DEFAULT true,
  scheduled_for timestamptz, published_at timestamptz,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE community_post_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES community_posts(id),
  member_id uuid REFERENCES community_members(id),
  engagement_type text,  -- like, comment, save, view, share
  comment_text text,
  created_at timestamptz DEFAULT now()
);
```
Build:
- Owner can post: text, images, VIDEOS, REELS (short vertical video)
- Media uploads to Vercel Blob
- 24-HOUR STORIES — is_story posts with expires_at = now + 24h
  ("Offer just for today" — auto-expires, shows in the stories row)
- Reels feed — vertical swipeable video, like TikTok/Instagram reels
- Aria still drafts text posts from real business data
- Owner posting dashboard: Post / Edit / Schedule, upload media

## PHASE 3 — The customer feed + LinkedIn/Facebook features
Build:
- Main feed — posts from followed businesses
- Stories row at top — 24h stories/offers
- Reels tab — vertical video feed
- Like / comment / save / share on every post
- HIDE A BUSINESS — customer can hide a specific business's posts
  (community_follows.is_hidden = true) without unfollowing
- Saved offers wallet
- From Facebook: stories, reactions, groups-style local feed, events
- From LinkedIn: business profiles with credibility (followers, posts, "verified local
  business" badge), professional business updates, business-to-business follows
  (businesses can follow and support each other)

## PHASE 4 — The marketplace (no online payment)
DB:
```sql
CREATE TABLE marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  product_id uuid REFERENCES pos_products(id),  -- optional link to POS product
  title text, description text, price numeric,
  media_urls jsonb, category text,
  status text DEFAULT 'active',  -- active, sold, hidden
  created_at timestamptz DEFAULT now()
);
CREATE TABLE marketplace_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES marketplace_listings(id),
  member_id uuid REFERENCES community_members(id),
  business_id uuid REFERENCES businesses(id),
  messages jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
```
Build:
- Owners add products to the marketplace (can pull from existing pos_products
  or create listing-only items)
- Customers browse the marketplace — grid, categories, search
- NO ONLINE PAYMENT — customer chats with the business to arrange the buy
  (pickup, pay in person). A chat thread per listing.
- "Message to buy" button → opens a chat with the business
- Business sees marketplace enquiries in their dashboard

## PHASE 5 — Search, notifications, discovery
Build:
- SEARCH — find businesses by name, category, location; find products in the marketplace
- PUSH NOTIFICATIONS — when a followed business posts, notify the customer
  (web push API — requires per-device opt-in; respect notifications_on per follow
  and is_hidden — hidden businesses never notify)
- Discover — nearby Aria businesses the customer doesn't follow yet
- New customer joins via one business → Aria suggests other local businesses
- The network compounds

## PHASE 6 — Aria as the autonomous marketer
- Aria drafts a week of posts per business from real data
- Suggests post timing from follower engagement patterns
- Owner approves in bulk or lets Aria auto-post within set rules
- Aria can draft reel/video captions, suggest what to film

## Build notes
- Needs a real customer base to be valuable — that's why it's post-launch
- Build phase by phase, each phase its own commit
- Privacy/consent (Phase 1) is the foundation — never skip or rush it
- Multi-session build — do not attempt in one prompt run
- Video/reels need Vercel Blob storage + a video player; reels = vertical autoplay
- Push notifications: use the Web Push API, store push_token per member

## When to build
After Friday limit reset. After the 3 profit features. After In-Store kiosk.
This is the long-term platform play — give it proper time, phase by phase.
