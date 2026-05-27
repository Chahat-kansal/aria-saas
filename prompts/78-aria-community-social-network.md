# Prompt 78 — Aria Community: The Local Business Social Network
# (BUILD AFTER FRIDAY LIMIT RESET — this is a large, multi-phase build)

## The vision
A social network for local businesses and their customers.
A customer joins ONCE and is connected to every Aria business near them.
Like Facebook/Instagram but for local commerce — feed, profiles, follows, offers.
The owner never writes a post — Aria drafts them from real business data.

## Why this matters
- Free marketing for every business — Aria writes + posts + times it
- One customer signup connects them to all local Aria businesses
- Network effect — every new business makes the network more valuable
- Shared customer graph — this is what makes Aria impossible to leave
- Win-win: businesses get reach, customers get local offers

## CRITICAL — privacy and consent (non-negotiable)
- Following a business is explicit opt-in, PER business
- A customer following the café does NOT consent to the bottle shop messaging them
- Each business only ever reaches its OWN followers
- "Discover" can SHOW other businesses, but they must EARN the follow
- Full Australian Privacy Act + Spam Act compliance — unsubscribe, consent records
- Customer can leave any business or the whole network anytime
- This consent architecture must be built FIRST, before any feed feature

## PHASE 1 — Identity + consent foundation
DB:
```sql
CREATE TABLE community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE, name text, phone text,
  joined_at timestamptz DEFAULT now()
);
CREATE TABLE community_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES community_members(id),
  business_id uuid REFERENCES businesses(id),
  followed_at timestamptz DEFAULT now(),
  consent_marketing boolean DEFAULT false,
  unfollowed_at timestamptz,
  UNIQUE(member_id, business_id)
);
CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  post_type text,  -- offer, new_stock, update, event
  title text, body text, image_url text,
  ai_generated boolean DEFAULT true,
  scheduled_for timestamptz, published_at timestamptz,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE community_post_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES community_posts(id),
  member_id uuid REFERENCES community_members(id),
  engagement_type text,  -- like, comment, save, view
  comment_text text,
  created_at timestamptz DEFAULT now()
);
```
Build: join flow, follow/unfollow with explicit consent, profile records.

## PHASE 2 — Business profiles + owner posting
- Each business has a public profile page: cover, logo, bio, posts, follower count
- The follower's own loyalty status shows on the profile (stamps, tier)
- Owner posting dashboard: Aria drafts posts from real data (slow day → offer,
  new stock → announcement). Owner taps Post / Edit / Schedule.
- Aria picks optimal post time from follower engagement patterns.

## PHASE 3 — The customer feed
- Feed of posts from businesses the customer follows
- Stories row, like / comment / save offer
- "Discover" — nearby Aria businesses the customer doesn't follow yet
- Saved offers wallet

## PHASE 4 — Aria as the marketer
- Aria autonomously drafts a week of posts per business
- Suggests when to post, what to post, predicts reach
- Owner approves in bulk or lets Aria auto-post within set rules
- Cross-promotion: Aria can suggest "customers who like X café also like Y"

## PHASE 5 — Discovery + growth loop
- New customer joins via one business → Aria suggests other local businesses
- Businesses can see anonymised "X people near you are on Aria Community"
- The network compounds

## Build notes
- This needs a real customer base to be valuable — that's why it's post-launch
- Build phase by phase, each phase its own commit
- Privacy/consent (Phase 1) is the foundation — never skip or rush it
- This is a multi-session build — do not attempt in one prompt run

## When to build
After Friday limit reset. After the 3 profit features. After In-Store kiosk.
This is the long-term platform play — give it proper time.
