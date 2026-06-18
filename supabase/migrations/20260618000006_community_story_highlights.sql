-- CX-OWNER-TRUST-2 — owner-curated story highlights on the public community business profile.
-- post_ids point to is_story community_posts; managed via /api/community/owner/highlights and shown
-- by /api/community/businesses/[id]/profile.
create table if not exists public.community_story_highlights (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null check (char_length(title) <= 32),
  cover_url text,
  post_ids uuid[] not null default '{}',
  display_order integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_story_highlights_business
  on public.community_story_highlights (business_id, display_order);

-- RLS deny-all: only the service role (supabaseAdmin) bypasses; no anon/authenticated policies.
alter table public.community_story_highlights enable row level security;

comment on table public.community_story_highlights is 'CX-OWNER-TRUST-2: owner-curated story highlights shown on the public community business profile. post_ids point to is_story community_posts. Managed via /api/community/owner/highlights.';
