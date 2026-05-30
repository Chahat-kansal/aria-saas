# Prompt 112 — Community: Reel Upload + Go Live

Full Instagram/Facebook-style content creation for businesses.
Two major features in one sprint: (1) Reel upload with Vercel Blob, (2) Go Live with Mux + WebRTC + Supabase Realtime chat.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```

Read ALL of these before writing anything:
- src/app/community/page.tsx
- src/app/community/BottomNav.tsx
- src/app/community/reels/page.tsx
- src/app/api/community/reels/route.ts
- src/app/api/community/posts/route.ts (if exists)

---

## ENV VARS NEEDED (add to Vercel before running)
- BLOB_READ_WRITE_TOKEN — from Vercel dashboard → Storage → Blob → your store → .env.local tab
- MUX_TOKEN_ID — from dashboard.mux.com → Settings → Access Tokens
- MUX_TOKEN_SECRET — same
- NEXT_PUBLIC_MUX_ENV_KEY — from Mux → Environments (for the player)

Install packages:
```bash
npm i @vercel/blob @mux/mux-node @mux/mux-player-react
```

---

## PART 1 — REEL UPLOAD FLOW

### TASK 1 — Upload media API
Create src/app/api/community/upload-media/route.ts
```
export const runtime = 'nodejs'
export const maxDuration = 60
```

POST: multipart/form-data with fields:
- file: File (video/mp4, video/mov, video/webm, image/jpeg, image/png, image/webp)
- type: 'reel' | 'post' | 'story'
- business_id: string

Handler:
1. Auth check — user must own the business_id
2. Validate file type and size (video max 200MB, image max 10MB)
3. Upload to Vercel Blob:
```typescript
import { put } from '@vercel/blob'
const blob = await put(
  `community/${type}s/${business_id}/${Date.now()}-${file.name}`,
  file,
  { access: 'public', contentType: file.type }
)
return NextResponse.json({ url: blob.url, contentType: file.type })
```
4. Return { url, contentType }

Commit: "feat(community): upload-media API — video/image to Vercel Blob"

### TASK 2 — Create Post API
Create src/app/api/community/posts/route.ts (or update if exists)

POST body:
```typescript
{
  business_id: string
  post_type: 'update' | 'offer' | 'reel' | 'tip'
  title: string
  body: string
  media_url?: string        // from upload-media response
  thumbnail_url?: string    // user-picked cover frame URL
  is_story?: boolean
  scheduled_for?: string    // ISO datetime
}
```

Handler:
1. Auth + business ownership check
2. Insert into community_posts:
   - media_urls = [media_url, thumbnail_url].filter(Boolean) as jsonb
   - media_type = file is video ? 'reel' : 'image'
   - status = scheduled_for ? 'scheduled' : 'published'
   - published_at = scheduled_for ?? NOW()
   - is_story = is_story ?? false
   - expires_at = is_story ? NOW() + 24h : null
3. Return created post

Commit: "feat(community): create post API with scheduling + story support"

### TASK 3 — Mobile-first Create Post UI
Create src/app/community/create/page.tsx

This is a full-screen mobile flow, step-by-step like Instagram:

#### Step 1 — Pick type
Full screen, 4 big cards:
- 📸 Photo post
- 🎬 Reel (video)
- ⚡ Story (24h)
- 📢 Update/Offer (text only)

#### Step 2 — Pick media (for photo/reel/story)
```typescript
<input
  type="file"
  accept={type === 'reel' ? 'video/mp4,video/mov,video/webm' : 'image/*'}
  capture={'environment'} // opens camera on mobile
/>
```
- Show preview: video plays inline (muted, loop), image shows full-screen
- "Retake" button to pick again
- Upload starts immediately on file pick:
  - Show progress bar (use XMLHttpRequest for progress events)
  - Upload to POST /api/community/upload-media
  - Store returned URL in state
- For reels: allow picking a thumbnail (seek video + screenshot canvas frame)

#### Step 3 — Caption + details
- Title input (optional for reels, required for posts)
- Body textarea — multiline, auto-expands, whiteSpace: pre-wrap
- For offers: price field + CTA text
- Character count (500 max body)
- Schedule toggle: "Post now" | "Schedule" → datetime picker

#### Step 4 — Preview + Publish
- Full preview of how the post will look (PostCard component)
- "Publish now" button → POST /api/community/posts → redirect to /community
- Show confetti on success

Style: dark theme (#0a0a0f bg), Aria green accents (#7FB897), full-screen steps with swipe-forward feel. Back arrow on every step. Progress dots at top.

Add "+" create button to BottomNav — between market and search tabs:
```typescript
{ href: '/community/create', label: 'create', icon: PlusSquare, match: ... }
```

Commit: "feat(community): Instagram-style create post flow — photo/reel/story/update with Vercel Blob upload"

---

## PART 2 — GO LIVE

### TASK 4 — Mux live stream API
Install: npm i @mux/mux-node

Create src/app/api/community/live/route.ts

#### POST — start a live stream
```typescript
import Mux from '@mux/mux-node'
const mux = new Mux({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET })

const stream = await mux.video.liveStreams.create({
  playback_policy: ['public'],
  new_asset_settings: { playback_policy: ['public'] }, // auto-save as VOD
  reduced_latency: true,
})
```
Store in community_live_streams table (create via migration):
- id, business_id, mux_stream_id, mux_playback_id, mux_stream_key, status ('idle'|'active'|'ended'), title, started_at, ended_at, viewer_count, peak_viewers, vod_asset_id, created_at

Return: { stream_id, stream_key (RTMP), playback_id, rtmp_url: 'rtmps://global-live.mux.com:443/app' }

#### DELETE — end stream
Update status='ended', ended_at=NOW()
Disable the Mux stream: mux.video.liveStreams.disable(mux_stream_id)

#### GET — list active streams for community feed
Query community_live_streams where status IN ('idle', 'active') and business_id in followed businesses

Commit: "feat(community/live): Mux live stream create/end/list API"

### TASK 5 — Broadcaster UI (business side)
Create src/app/community/live/broadcast/page.tsx

Full-screen mobile broadcast UI:

Step 1 — Pre-live screen:
- Camera preview (getUserMedia({ video: true, audio: true }))
- Title input: "What are you going live about?"
- "Go Live" button

Step 2 — Live screen (after tapping Go Live):
- Call POST /api/community/live → get RTMP stream key
- Use WebRTC to stream to Mux via WHIP protocol:
```typescript
// WHIP endpoint for browser-to-Mux streaming (no RTMP needed on web)
const pc = new RTCPeerConnection()
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
stream.getTracks().forEach(track => pc.addTrack(track, stream))
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
// POST offer SDP to Mux WHIP endpoint
const resp = await fetch(
  `https://global-live.mux.com:443/app/${streamKey}/whip`,
  { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp }
)
const answer = await resp.text()
await pc.setRemoteDescription({ type: 'answer', sdp: answer })
```

Live overlay shows:
- 🔴 LIVE badge + duration timer
- Viewer count (poll GET /api/community/live/[id]/viewers every 10s)
- Real-time chat (Supabase Realtime — see Task 6)
- "End Live" button → DELETE /api/community/live → show replay stats (peak viewers, duration)
- After ending: Mux auto-generates VOD → save as a reel in community_posts

Commit: "feat(community/live): broadcaster UI — WebRTC WHIP to Mux + viewer count + end live"

### TASK 6 — Viewer UI
Create src/app/community/live/[stream_id]/page.tsx

Full-screen viewer experience:

- Mux Player for HLS playback:
```typescript
import MuxPlayer from '@mux/mux-player-react'
<MuxPlayer
  playbackId={playbackId}
  streamType="live"
  autoPlay
  muted={false}
  style={{ width: '100%', height: '100%' }}
/>
```
- 🔴 LIVE badge + viewer count
- Bottom chat overlay (last 5 messages visible, scrollable)
- Chat input: tap to type + send
- Business name + avatar top-left
- "Follow" button top-right

Live entry: when a business goes live, insert a post into community_posts with:
- post_type = 'live'
- title = stream title
- media_urls = ['mux:// + playbackId'] (custom scheme to identify as live)
- status = 'published'

The community feed PostCard detects 'live' post_type and shows a 🔴 LIVE badge instead of image.
Tapping the card navigates to /community/live/[stream_id].

Commit: "feat(community/live): viewer UI — Mux HLS player + live chat + viewer count"

### TASK 7 — Real-time chat (Supabase Realtime)
Create community_live_chat table:
```sql
CREATE TABLE community_live_chat (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id uuid REFERENCES community_live_streams(id) ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id),
  sender_name text NOT NULL,
  sender_avatar text,
  message text NOT NULL CHECK (char_length(message) <= 200),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE community_live_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON community_live_chat FOR SELECT USING (true);
CREATE POLICY "auth insert" ON community_live_chat FOR INSERT WITH CHECK (true);
```

Chat API:
- POST /api/community/live/[id]/chat — insert message
- Supabase Realtime subscription on client:
```typescript
supabase.channel('live-chat-' + streamId)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_live_chat', filter: 'stream_id=eq.' + streamId }, (payload) => {
    setMessages(prev => [...prev.slice(-99), payload.new])
  })
  .subscribe()
```

Host (business) can delete any message (moderation).

Commit: "feat(community/live): real-time chat via Supabase Realtime"

### TASK 8 — Live in feed + notifications
- When a business goes live: insert community_posts row with post_type='live'
- PostCard: detect post_type==='live' → show pulsing 🔴 LIVE overlay on thumbnail
- Feed auto-promotes live posts to top (sort: live first, then by published_at)
- Push notification (if push enabled): "🔴 [Business] is live now — tap to watch"
  Use existing push notification infrastructure

Update community feed API to put live posts first:
```sql
ORDER BY (post_type = 'live' AND status = 'published') DESC, published_at DESC
```

Commit: "feat(community/live): live posts surface at top of feed with LIVE badge + push notification"

---

## DB migrations needed (run via Supabase MCP or SQL editor)

```sql
-- Live streams table
CREATE TABLE community_live_streams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  mux_stream_id text NOT NULL,
  mux_playback_id text NOT NULL,
  mux_stream_key text NOT NULL,
  status text DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'ended')),
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  viewer_count integer DEFAULT 0,
  peak_viewers integer DEFAULT 0,
  vod_asset_id text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE community_live_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON community_live_streams FOR SELECT USING (true);
CREATE POLICY "owner write" ON community_live_streams FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

-- Live chat table
CREATE TABLE community_live_chat (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id uuid REFERENCES community_live_streams(id) ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id),
  sender_name text NOT NULL,
  sender_avatar text,
  message text NOT NULL CHECK (char_length(message) <= 200),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE community_live_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON community_live_chat FOR SELECT USING (true);
CREATE POLICY "auth insert" ON community_live_chat FOR INSERT WITH CHECK (true);
```

---

## Rules
- npx tsc --noEmit + npm run build before EVERY commit
- One commit per task (8 commits total)
- vercel.json: keep at 22 functions max, no sub-daily crons
- Model: claude-haiku-4-5-20251001 for any AI calls
- All DB amounts dollars not cents
- Mobile-first: every UI must work perfectly on 390px screen width
- Never touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Execution order
Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
Do NOT skip ahead. Each task depends on the previous.

## Before starting
Add these env vars to Vercel:
1. BLOB_READ_WRITE_TOKEN (Vercel dashboard → Storage → Blob)
2. MUX_TOKEN_ID (dashboard.mux.com → Settings → Access Tokens → Create)
3. MUX_TOKEN_SECRET (same)
4. NEXT_PUBLIC_MUX_ENV_KEY (Mux → Environments → your env → env key)
