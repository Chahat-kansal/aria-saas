-- CX-POLISH-1 — per-member community notifications.
-- new_post → every active follower of a business; new_like/new_comment/new_follower → the business
-- owner, but only if they have linked a community member account. Inserts are fire-and-forget from the
-- engagement/follows/posts routes (src/lib/community/notifications.ts).
create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.community_members(id) on delete cascade,
  type text not null check (type in ('new_post','new_like','new_comment','new_follower')),
  actor_member_id uuid references public.community_members(id) on delete set null,
  actor_business_id uuid references public.businesses(id) on delete set null,
  post_id uuid references public.community_posts(id) on delete cascade,
  read_at timestamptz default null,
  created_at timestamptz default now()
);

create index if not exists idx_community_notifications_member
  on public.community_notifications (member_id, read_at, created_at desc);

-- RLS deny-all: only the service role (supabaseAdmin) bypasses; no anon/authenticated policies.
alter table public.community_notifications enable row level security;

comment on table public.community_notifications is 'CX-POLISH-1: per-member community notifications (new_post to followers; new_like/new_comment/new_follower to the business owner if they linked a member account). Inserts are fire-and-forget from engagement/follows/posts routes.';
