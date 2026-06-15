-- TP-1 — TRAINING PLATFORM core schema (courses / lessons / quiz questions).
-- First sprint of the TP block. REUSES the existing cert/skill spine (staff_skills,
-- staff_member_skills) — a completed course GRANTS a staff_skills row via cert_skill_id.
-- RLS pattern copied EXACTLY from staff_skills_business_owner (single ALL policy,
-- business_id IN (select id from businesses where user_id = auth.uid())).
-- Enrolment / progress / staff "My Training" / cohort dashboard / Aria auto-draft are
-- LATER sprints (TP-2..TP-5). This migration is data model + owner authoring only.

-- ── training_courses ────────────────────────────────────────────────────────
create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  tier text check (tier in ('compliance','skill','systems','culture')),
  role_tags text[] not null default '{}',
  is_mandatory boolean not null default false,
  pass_mark int not null default 80,
  cert_skill_id uuid references public.staff_skills(id) on delete set null,
  est_minutes int,
  expires_months int,                       -- compliance refresh cadence; null = never expires
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── training_lessons ────────────────────────────────────────────────────────
create table if not exists public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sort_order int not null default 0,
  type text not null check (type in ('video','document','image','text','quiz','game','recipe','acknowledge')),
  title text,
  content text,                             -- text/markdown body OR document text
  url text,                                 -- media url (video/document/image)
  recipe_id uuid,                           -- for type='recipe'
  game_round text,                          -- for type='game'
  duration_seconds int,
  created_at timestamptz not null default now()
);

-- ── training_quiz_questions ─────────────────────────────────────────────────
create table if not exists public.training_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.training_lessons(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sort_order int not null default 0,
  question text not null,
  options jsonb not null default '[]'::jsonb,  -- array of {id,text}
  correct text,                                -- option id of the correct answer
  points int not null default 1,
  created_at timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_training_courses_business on public.training_courses(business_id);
create index if not exists idx_training_lessons_course on public.training_lessons(course_id);
create index if not exists idx_training_lessons_business on public.training_lessons(business_id);
create index if not exists idx_training_quiz_lesson on public.training_quiz_questions(lesson_id);
create index if not exists idx_training_quiz_business on public.training_quiz_questions(business_id);

-- ── RLS (exact staff_skills pattern: single ALL policy, owner-scoped) ────────
alter table public.training_courses enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_quiz_questions enable row level security;

drop policy if exists training_courses_business_owner on public.training_courses;
create policy training_courses_business_owner on public.training_courses
  for all using (business_id in (select id from public.businesses where user_id = auth.uid()));

drop policy if exists training_lessons_business_owner on public.training_lessons;
create policy training_lessons_business_owner on public.training_lessons
  for all using (business_id in (select id from public.businesses where user_id = auth.uid()));

drop policy if exists training_quiz_questions_business_owner on public.training_quiz_questions;
create policy training_quiz_questions_business_owner on public.training_quiz_questions
  for all using (business_id in (select id from public.businesses where user_id = auth.uid()));
