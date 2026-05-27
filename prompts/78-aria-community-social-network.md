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

## CORE PRINCIPLE — anonymous browsing, identity only on the POS side
This is the defining design rule of Aria Community. Build everything around it.

- Customers browse Aria Community fully ANONYMOUSLY — no account, no signup, no
  login to scroll the feed, watch reels, see offers, or browse the marketplace.
- Chatting with a business uses an ANONYMOUS SESSION TOKEN — a device-based token,
  NOT an account. No name, no email, no password. It exists only so the chat thread
  persists (owner can reply, customer can return to the thread).
- The customer is anonymous to the platform AND to the business owner on Community.
- IDENTITY LIVES ONLY ON THE POS SIDE. A customer becomes a known person only when
  they walk into the shop and buy — that is where loyalty, win-back, membership,
  and pos_customers live. Community and POS identity are SEPARATE layers.
- community_members therefore stores only: an anonymous device/session token, an
  optional push_token, optional display nickname. NEVER required: real name, email,
  phone, address. Do not collect personal data on Community.

## PRIVACY GUARD — Aria blocks personal details in chat
To protect both the customer and the platform from privacy exposure:
- Every marketplace/business chat message passes through a privacy filter BEFORE
  it is delivered.
- If a message contains personal details — phone numbers, email addresses, home
  addresses, full names, payment card numbers — Aria BLOCKS that message.
- The sender sees a gentle notice: "To keep you safe, personal details can't be
  shared in chat. Arrange the rest in person at the shop."
- This protects customers (no personal data leaks to strangers) and protects the
  platform (less personal data handled = far less privacy/legal exposure).
- Use a combination of regex (phone/email/card patterns) + a light Haiku check for
  addresses and full names. Block before delivery, never after.
- Applies to BOTH directions — customer and business owner.

## UI / UX — this is make-or-break
Aria Community lives or dies on UI/UX. If it does not feel as polished as
Instagram, TikTok, or Facebook, customers will not use it. This is non-negotiable.
- Read /mnt/skills/user/ui-ux-pro-max/SKILL.md before building any Community UI
- Mobile-first — most customers browse on a phone. Design for the phone first.
- Best-in-class patterns: smooth scroll, instant feel, skeleton loaders, no jank
- Feed: clean, image-forward, generous spacing — like Instagram
- Reels: true full-screen vertical, swipe up/down, autoplay, tap to pause
- Stories: circular avatars at top, tap-through, progress bars — like Instagram stories
- Marketplace: clean product grid, big imagery, fast filtering
- Smooth transitions, tasteful micro-animations, never cluttered
- Financial Trust palette but warm and inviting — this faces consumers
- Every screen must feel premium. A clunky Community is a dead Community.
- Accessibility: readable contrast, tap targets >= 44px, works one-handed

## PHASE 1 — Identity + consent foundation
DB:
```sql
CREATE TABLE community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text UNIQUE,        -- anonymous device-based token, NOT an account
  nickname text,                    -- optional display name, never required
  push_token text, push_enabled boolean DEFAULT false,
  joined_at timestamptz DEFAULT now()
  -- NO email, NO real name, NO phone, NO address. Anonymous by design.
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
-- All chat messages pass the privacy filter before insert — see PRIVACY GUARD
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


## CROSS-POSTING — Community as a channel alongside Instagram, Facebook, Google
Aria Community must integrate into the existing dashboard `social` page as a
posting CHANNEL — so the owner writes ONE post and pushes it everywhere.
- In src/app/dashboard/social/page.tsx, add "Aria Community" as a channel
  alongside Instagram, Facebook, and Google Business Profile
- When the owner composes a post, they tick which channels to publish to —
  Instagram, Facebook, Google, Aria Community — any combination
- "Post everywhere" publishes the same post to all selected channels in one action
- Aria still drafts the post; the owner picks the channels and confirms
- Each channel keeps its own formatting (Community gets the rich post, Google gets
  a Business Profile update, etc.) — Aria adapts the post per channel
- The Community feed is just one more destination — but it is the only one Aria
  fully owns, so it always works even if other channel integrations are not connected

## DESIGN PRINCIPLE — borrowed patterns, ONE unified system
Aria Community should use proven interaction patterns from the best apps, but
draw ALL of them in a single coherent design language. Borrowed patterns, unified look.
- Feed/main post layout — pattern inspired by Instagram (image-forward, clean)
- Chat UI — pattern inspired by the latest WhatsApp (clean bubbles, simple)
- Profile layout — pattern inspired by Facebook (cover, info, content tabs)
- Owner dashboard — professional clarity inspired by LinkedIn
- Reels — full-screen vertical pattern inspired by TikTok
- BUT: one single colour accent, one font family, one spacing scale, one corner
  radius system, one motion language — applied consistently across ALL of the above.
- The goal: familiar patterns (zero learning curve) + one unified identity (feels
  like ONE app, not five stitched together).
- Read /mnt/skills/user/ui-ux-pro-max/SKILL.md and pick ONE style + ONE palette +
  ONE font pairing, then apply it to every screen without exception.
- Mobile-first. Every screen must feel like part of the same product.

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
