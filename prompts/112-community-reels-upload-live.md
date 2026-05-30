# Prompt 112 — Community: Reel Upload (Bunny Stream) + Ephemeral Go Live (Cloudflare Stream)

Full Instagram/Facebook-style content creation for businesses.
- Reels: upload to Bunny Stream (white-label, cheap, Australian CDN)
- Go Live: Cloudflare Stream Live (ephemeral — no recording, no storage, fully white-label)
- Real-time chat: Supabase Realtime

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
- src/app/community/theme.ts

## ENV VARS REQUIRED (must be in Vercel before running)
```
BUNNY_STREAM_API_KEY        # Bunny Stream → API → Stream API Key
BUNNY_STREAM_LIBRARY_ID     # Bunny Stream → your library → Library ID
BUNNY_STREAM_CDN_HOSTNAME   # Bunny Stream → your library → Pull Zone hostname (e.g. vz-abc123.b-cdn.net)
CLOUDFLARE_ACCOUNT_ID       # Cloudflare dashboard → right sidebar → Account ID
CLOUDFLARE_STREAM_API_TOKEN # Cloudflare → My Profile → API Tokens → Create Token → Stream:Edit
NEXT_PUBLIC_CLOUDFLARE_CUSTOMER_SUBDOMAIN  # Cloudflare Stream → your stream → customer subdomain (e.g. customer-abc123.cloudflarestream.com)
```

Install packages:
```bash
npm i @vercel/blob
```
No SDK needed for Bunny or Cloudflare — both use plain REST APIs.

---

## PART 1 — REEL UPLOAD (Bunny Stream)

### TASK 1 — Bunny Stream upload API
Create src/app/api/community/upload-media/route.ts
```
export const runtime = 'nodejs'
export const maxDuration = 60
```

POST: multipart/form-data
Fields: file (video/mp4, video/mov, video/webm, image/*), type ('reel'|'post'|'story'|'thumbnail'), business_id

Handler:
1. Auth + business ownership check
2. If type === 'reel' or file is video:
   - Step A: Create video object in Bunny Stream library
   ```
   POST https://video.bunnycdn.com/library/{LIBRARY_ID}/videos
   Headers: AccessKey: BUNNY_STREAM_API_KEY
   Body: { title: business_id + '-' + Date.now() }
   Response: { guid: string }
   ```
   - Step B: Upload video to Bunny Stream
   ```
   PUT https://video.bunnycdn.com/library/{LIBRARY_ID}/videos/{guid}
   Headers: AccessKey: BUNNY_STREAM_API_KEY, Content-Type: application/octet-stream
   Body: file buffer (await file.arrayBuffer())
   ```
   - Build CDN URL: https://{BUNNY_CDN_HOSTNAME}/{guid}/play_720p.mp4
   - Build thumbnail URL: https://{BUNNY_CDN_HOSTNAME}/{guid}/thumbnail.jpg
   - Return { url: cdnUrl, thumbnail_url: thumbnailUrl, type: 'video', guid }

3. If image:
   - Upload to Vercel Blob (images are small, Blob is fine):
   ```typescript
   import { put } from '@vercel/blob'
   const blob = await put(`community/${business_id}/${Date.now()}-${file.name}`, file, { access: 'public' })
   ```
   - Return { url: blob.url, type: 'image' }

Commit: "feat(community): upload-media API — videos to Bunny Stream, images to Vercel Blob"

### TASK 2 — Create Post API
Create src/app/api/community/posts/route.ts

POST body:
```typescript
{
  business_id: string
  post_type: 'update' | 'offer' | 'reel' | 'tip'
  title?: string
  body: string
  media_url?: string
  thumbnail_url?: string
  is_story?: boolean
  scheduled_for?: string
}
```

Handler:
1. Auth + ownership check
2. Insert into community_posts:
   - media_urls = [media_url, thumbnail_url].filter(Boolean) as jsonb
   - media_type = media_url contains video/bunnycdn ? 'reel' : 'image'
   - status = scheduled_for ? 'scheduled' : 'published'
   - published_at = scheduled_for ?? NOW()
   - is_story + expires_at (NOW()+24h if story)
3. Return created post

Commit: "feat(community): create post API with reel/story/scheduled support"

### TASK 3 — Mobile-first Create Post UI
Create src/app/community/create/page.tsx

Full-screen step-by-step flow:

#### Step 1 — Pick type (full screen, tap a card)
- 📸 Photo post
- 🎬 Reel (video)
- ⚡ Story (24h)
- 📢 Update / Offer

#### Step 2 — Pick media (photo/reel/story only)
```tsx
<input
  ref={fileRef}
  type="file"
  accept={type === 'reel' ? 'video/mp4,video/mov,video/webm,video/*' : 'image/*'}
  capture="environment"
  style={{ display: 'none' }}
  onChange={handleFilePick}
/>
```
- Tap anywhere → triggers file input (opens camera roll or camera on mobile)
- Preview: video plays muted looped fullscreen, image fills screen
- Upload starts immediately on pick — use XMLHttpRequest for progress:
```typescript
const xhr = new XMLHttpRequest()
xhr.upload.addEventListener('progress', (e) => {
  if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100))
})
xhr.open('POST', '/api/community/upload-media')
xhr.send(formData)
```
- Show progress bar (green, bottom of screen)
- On complete: store returned url + thumbnail_url in state, advance to Step 3

#### Step 3 — Caption + details
- Title input (optional for reels)
- Body textarea — multiline, auto-expand, whiteSpace: pre-wrap, 500 char max with counter
- For offers: price + CTA text field
- "Post now" vs "Schedule" toggle → datetime picker if scheduled
- Hashtag suggestions strip (tap to append)

#### Step 4 — Preview + Publish
- Full PostCard preview (reuse PostCard component)
- "Publish" button → POST /api/community/posts → on success redirect to /community with toast

Add "+" button to BottomNav between market and search:
- Icon: PlusSquare from lucide-react
- href: /community/create
- Style: lime/green accent, slightly larger than other tabs

Style rules:
- Background: #0a0a0f, accent: #7FB897
- Full-screen steps, progress dots at top (4 dots)
- Back arrow top-left on every step
- Safe area padding bottom (env(safe-area-inset-bottom))

Commit: "feat(community): Instagram-style create post — photo/reel/story/update with Bunny Stream upload progress"

### TASK 4 — Fix reels player for Bunny Stream URLs
Update src/app/community/reels/page.tsx:
- Bunny Stream URLs end in /play_720p.mp4 — video element plays these natively
- Add poster={thumbnail_url} (media_urls[1]) to video element
- Ensure crossOrigin is NOT set (Bunny CDN doesn't need it)
- Remove any CORS-related attributes that were added previously
- Add preload="metadata" + playsInline + loop + muted initially

Update src/app/community/PostCard.tsx:
- If media_type === 'reel': show thumbnail (media_urls[1]) as image with a play button overlay
- Tapping the card opens the reel viewer

Commit: "fix(community): reels player optimised for Bunny Stream CDN URLs"

---

## PART 2 — GO LIVE (Cloudflare Stream, ephemeral only)

### TASK 5 — Cloudflare Live Stream API
Create src/app/api/community/live/route.ts

#### POST — start live stream
```typescript
// Create a live input on Cloudflare Stream
const resp = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/live_inputs`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      meta: { name: `aria-live-${business_id}-${Date.now()}` },
      recording: { mode: 'off' },  // EPHEMERAL — no recording ever
      deleteRecordingAfterDays: 0,
    })
  }
)
const data = await resp.json()
// data.result.uid = stream UID
// data.result.webRTC.url = WHIP endpoint for browser broadcast
// data.result.playback.hls = HLS URL for viewers
```

Store in community_live_streams:
- mux_stream_id → cf_stream_uid (rename column or use as-is)
- mux_playback_id → cf_playback_hls (HLS URL)
- mux_stream_key → cf_whip_url (WHIP URL for broadcaster)
- status = 'active', started_at = NOW()

Also insert into community_posts:
- post_type = 'live'
- title = stream title
- media_urls = [cf_playback_hls] as jsonb
- status = 'published'

Return: { stream_id, whip_url, playback_hls, post_id }

#### DELETE — end live stream
```typescript
// Delete the live input from Cloudflare (ephemeral — gone forever)
await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/live_inputs/${cf_stream_uid}`,
  { method: 'DELETE', headers: { Authorization: `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}` } }
)
```
Update community_live_streams: status='ended', ended_at=NOW()
Update community_posts: status='ended' (remove from feed)

#### GET — list active streams
Query community_live_streams where status='active'
Return with business info for feed display

Commit: "feat(community/live): Cloudflare Stream ephemeral live — create/end, no recording ever"

### TASK 6 — Broadcaster UI (business side)
Create src/app/community/live/broadcast/page.tsx

Only accessible from /dashboard (business owner) — check auth, redirect if not business owner.

#### Pre-live screen
- Full screen dark (#0a0a0f)
- Camera preview (getUserMedia video+audio) filling screen
- Title input overlay at bottom
- 🔴 "Go Live" button (red, large, bottom center)
- Flip camera button (switch front/back)

#### Live screen (after tapping Go Live)
1. Call POST /api/community/live → get { whip_url, stream_id, post_id }
2. WebRTC WHIP broadcast to Cloudflare:
```typescript
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }]
})
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: true
})
stream.getTracks().forEach(track => pc.addTrack(track, stream))

// Trickle ICE not needed for WHIP
pc.addEventListener('icecandidate', e => { if (!e.candidate) sendOffer() })
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)

async function sendOffer() {
  const r = await fetch(whipUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: pc.localDescription!.sdp
  })
  const answerSdp = await r.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
}
```

Live overlay (on top of camera preview):
- Top-left: 🔴 LIVE + duration timer (counting up)
- Top-right: viewer count (poll GET /api/community/live/[id]/viewers every 10s)
- Bottom: chat messages scrolling up (last 5 visible) + chat input
- "End Live" button → confirms → DELETE /api/community/live → show stats screen

Stats screen after ending:
- Duration, peak viewers, total messages
- "Done" → back to /community/me

Commit: "feat(community/live): broadcaster UI — WebRTC WHIP to Cloudflare + live overlay + chat"

### TASK 7 — Viewer UI
Create src/app/community/live/[stream_id]/page.tsx

Full-screen viewer:
- HLS video player for Cloudflare Stream:
```tsx
// Use native HLS via video element (works on iOS Safari + Chrome Android)
<video
  ref={videoRef}
  src={playbackHls}  // Cloudflare HLS URL
  autoPlay
  playsInline
  controls={false}
  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
/>
```
Note: for browsers without native HLS support (desktop Chrome), dynamically import hls.js:
```typescript
if (!video.canPlayType('application/vnd.apple.mpegurl')) {
  const Hls = (await import('hls.js')).default
  const hls = new Hls()
  hls.loadSource(playbackHls)
  hls.attachMedia(video)
}
```
Install: npm i hls.js

Overlay:
- Top: business avatar + name + 🔴 LIVE + viewer count
- Bottom: chat overlay (last 5 messages) + text input + send button
- Tap video → toggle mute
- If stream ended (status='ended'): show "Live has ended" screen, redirect to /community after 3s

Commit: "feat(community/live): viewer UI — native HLS + hls.js fallback + chat overlay"

### TASK 8 — Real-time chat (Supabase Realtime)
Migration:
```sql
CREATE TABLE IF NOT EXISTS community_live_chat (
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

Create src/app/api/community/live/[id]/chat/route.ts
POST: { sender_name, message, business_id? } → insert row

Client Realtime subscription (both broadcaster and viewer):
```typescript
const channel = supabase.channel('live-' + streamId)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public',
    table: 'community_live_chat',
    filter: `stream_id=eq.${streamId}`
  }, payload => {
    setMessages(prev => [...prev.slice(-49), payload.new as ChatMessage])
  })
  .subscribe()
return () => { supabase.removeChannel(channel) }
```

Viewer count: increment on join, decrement on leave using Supabase Realtime presence:
```typescript
channel.track({ user: memberNickname ?? 'viewer' })
channel.on('presence', { event: 'sync' }, () => {
  const state = channel.presenceState()
  setViewerCount(Object.keys(state).length)
})
```

Commit: "feat(community/live): real-time chat + presence viewer count via Supabase Realtime"

### TASK 9 — Live in feed
- community_posts with post_type='live' and status='published' appear in feed
- PostCard: detect post_type==='live' → show pulsing red LIVE badge over thumbnail
- Feed API already boosts live posts (add to ORDER BY: live posts first)
- Tapping live card → navigates to /community/live/[stream_id]
- Add "Go Live" button to business dashboard community section → /community/live/broadcast

Update feed API order:
```sql
ORDER BY
  (post_type = 'live' AND status = 'published') DESC,
  followed DESC,
  published_at DESC
```

Commit: "feat(community/live): live posts at top of feed with pulsing LIVE badge"

---

## DB migration
```sql
CREATE TABLE IF NOT EXISTS community_live_streams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  cf_stream_uid text NOT NULL,
  cf_playback_hls text NOT NULL,
  cf_whip_url text NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  title text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  viewer_count integer DEFAULT 0,
  peak_viewers integer DEFAULT 0,
  community_post_id uuid REFERENCES community_posts(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE community_live_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON community_live_streams FOR SELECT USING (true);
CREATE POLICY "owner write" ON community_live_streams FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);
```
Run this via Supabase MCP before starting Task 5.

---

## Rules
- npx tsc --noEmit + npm run build before EVERY commit
- One commit per task (9 commits total)
- vercel.json: keep at 22 functions max, no sub-daily crons
- NO recording on Cloudflare — always pass recording: { mode: 'off' }
- Mobile-first: every UI must work on 390px screen
- All DB amounts dollars not cents
- Never touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Execution order
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
