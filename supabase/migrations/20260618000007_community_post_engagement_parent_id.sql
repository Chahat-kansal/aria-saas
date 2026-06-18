-- CX-POLISH-3 — comment replies (max 1 level deep, Instagram-style). A reply is a comment row whose
-- parent_id points to the top-level comment it answers. Replies-to-replies are flattened to the
-- top-level parent in the API.
alter table public.community_post_engagement
  add column if not exists parent_id uuid references public.community_post_engagement(id) on delete cascade;

create index if not exists idx_community_post_engagement_parent_id
  on public.community_post_engagement(parent_id) where parent_id is not null;
