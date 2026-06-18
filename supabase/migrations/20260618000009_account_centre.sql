-- CX-ACCOUNT-CENTRE-1 — member identity fields + per-type notification prefs, and a member→business
-- block table (the inverse of community_blocked_visitors, so it never pollutes owners' block lists).
alter table public.community_members
  add column if not exists avatar_url text,
  add column if not exists bio text,
  add column if not exists notif_pref_likes boolean default true,
  add column if not exists notif_pref_comments boolean default true,
  add column if not exists notif_pref_followers boolean default true,
  add column if not exists notif_pref_new_posts boolean default true;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_members_bio_len') then
    alter table public.community_members add constraint community_members_bio_len check (char_length(bio) <= 160);
  end if;
end $$;

create table if not exists public.community_member_blocks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.community_members(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz default now(),
  unique (member_id, business_id)
);
-- RLS deny-all: only the service role (supabaseAdmin) bypasses; no anon/authenticated policies.
alter table public.community_member_blocks enable row level security;
