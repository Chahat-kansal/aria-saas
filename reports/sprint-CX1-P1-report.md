# Sprint CX-1/P1 — Community Foundation
**Date:** 2026-06-11
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npx next build` → PASS

---

## What was built

| Deliverable | File | Status |
|---|---|---|
| Migration file (repo sync, SQL as comments) | `supabase/migrations/20260611_cx1_community_member_account_link.sql` | ✅ Created |
| `linkUserToMember()` + `resolveOrLinkMember()` | `src/lib/community/session.ts` | ✅ Added |
| Account upgrade endpoint | `src/app/api/community/account-link/route.ts` | ✅ Created |
| Singular follow URL per spec | `src/app/api/community/follow/route.ts` | ✅ Created (delegates to follows/) |
| DM API with privacy filter | `src/app/api/community/dm/route.ts` | ✅ Created |
| DM chat UI with Realtime | `src/app/community/dm/[businessId]/page.tsx` | ✅ Created |
| For Owners mode toggle | `src/app/community/page.tsx` | ✅ Updated |
| Account upgrade section | `src/app/community/me/page.tsx` | ✅ Updated |

---

## Feature breakdown

### 1. Anonymous session (requirement 1)
**Already existed** — `getCommunityMember()` / `createCommunityMember()` / `ensureCommunityMember()` in `session.ts`. Cookie-based, no signup required. All community browsing, following, and DM work anonymously.

### 2. Account upgrade (requirement 2)
- **`linkUserToMember(userId, memberId)`** — `UPDATE community_members SET user_id = userId WHERE id = memberId`. One-time link. Follows key on `members.id` — never re-keyed.
- **`resolveOrLinkMember(userId)`** — On sign-in: find member by `user_id` first (persists across devices); else link current session row.
- **`/api/community/account-link`** — GET (check link status) + POST (link auth user to session).
- **`/community/me`** — Shows "Create account / Sign in" form for anonymous members. After auth, calls `POST /api/community/account-link`.

### 3. Two modes (requirement 3)
- **Discover** — default mode, all users, curated community feed with StoriesRow.
- **For Owners** — shown only to authenticated users with an active business. Toggle appears as a segmented control at top of `/community`. Owners mode: links to `/dashboard/community`, `/dashboard/community/marketer`, `/dashboard/community/profile`.
- Detection: client-side `supabase.auth.getUser()` → `businesses` table query (RLS: own rows only).

### 4. Follow/unfollow API (requirement 4)
**Already existed** at `/api/community/follows` (plural). New **`/api/community/follow`** (singular, per spec) re-exports all four handlers (`GET`, `POST`, `PATCH`, `DELETE`) from the plural route. Consent log written on every follow/unfollow action (Australian Privacy Act compliance). Per-business opt-in, one business reaches only its own followers.

### 5. Business→business follow (requirement 5)
**Already existed** at `/api/community/owner/b2b-follows`.

### 6. Privacy filter (requirement 6 — NON-NEGOTIABLE)
**Already existed** at `src/lib/community/privacy-guard.ts` — layered normalisation + regex + optional Haiku second pass. Applied in DM route (`/api/community/dm`) before every INSERT. Flagged messages: logged to `community_message_log { session_token, business_id, flagged: true }`, rejected with `400`.

### 7. Realtime DM (requirement 7)
- **`/api/community/dm`** — GET: find/create `marketplace_chats` thread (listing_id=null signals DM). POST: privacy-filter → append to `messages` JSONB array → UPDATE thread row.
- **`/community/dm/[businessId]/page.tsx`** — Chat UI. On mount: GET thread. Realtime: `supabase.channel('dm:' + chatId).on('postgres_changes', { event: 'UPDATE', filter: 'id=eq.'+chatId }, ...)` — client receives updated messages array on each send.
- No third-party — pure Supabase Realtime (postgres_changes).

---

## DB schema used

| Table | Purpose |
|---|---|
| `community_members` | Anonymous identity (session_token) + `user_id` FK for account upgrade |
| `community_follows` | Follow graph, per-business, with unfollowed_at soft delete |
| `community_consent_log` | Audit log — EVERY follow/unfollow action |
| `community_message_log` | Privacy filter log — all DM attempts, flagged=true if blocked |
| `marketplace_chats` | DM threads (listing_id=null), messages as JSONB |
| `businesses` | Owner detection (user_id = auth.uid()) |

---

## Files pre-existing (not modified)

- `/api/community/follows/route.ts` — complete, unchanged
- `/api/community/session/route.ts` — complete, unchanged
- `/api/community/owner/b2b-follows/route.ts` — complete, unchanged
- `src/lib/community/privacy-guard.ts` — complete, unchanged

---

## Founder verify checklist

- [ ] **Anonymous browse** — open `/community` without login; posts load; no signup prompt
- [ ] **Follow without account** — follow a business from its page; community_follows row created + community_consent_log row created
- [ ] **Account upgrade** — go to `/community/me` (as anon member), click Upgrade, complete form → `community_members.user_id` set, accountLinked banner shown
- [ ] **Sign-in keeps follows** — sign out, sign back in → same community session resolved by user_id
- [ ] **For Owners toggle** — log in as a business owner, visit `/community`; Discover/For Owners tabs appear; For Owners shows dashboard links
- [ ] **DM send** — visit `/community/dm/[businessId]`, send a message; `marketplace_chats` row created with messages JSON
- [ ] **DM Realtime** — open two tabs at same DM URL; send from one; other tab updates live
- [ ] **Privacy filter blocks phone** — in DM, type "call me on 0412345678"; expect blocked=true response, message NOT stored
- [ ] **Privacy filter blocks email** — type "email me at name@gmail.com"; expect blocked=true

---

## Push instruction
```
git add supabase/migrations/20260611_cx1_community_member_account_link.sql \
  src/lib/community/session.ts \
  src/app/api/community/account-link/route.ts \
  src/app/api/community/follow/route.ts \
  src/app/api/community/dm/route.ts \
  src/app/community/dm/[businessId]/page.tsx \
  src/app/community/page.tsx \
  src/app/community/me/page.tsx \
  reports/sprint-CX1-P1-report.md
git commit -m "feat(cx1-p1): community foundation — account upgrade, singular follow URL, DM with Realtime + privacy filter, For Owners mode"
git push origin main
```
