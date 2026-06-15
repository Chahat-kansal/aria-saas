-- TP-4 — Training certificates + the 'practical' lesson type.
-- The practical exam is a SANDBOXED in-memory POS simulator (no real pos_* writes). The only
-- DB writes the feature makes are training_lesson_progress (the exam result, via TP-3's path)
-- and training_certificates (on full pass). This migration adds the certificate store and
-- extends the lesson-type CHECK additively (all existing types preserved).

-- ── Extend training_lessons.type to include 'practical' (additive) ──
alter table public.training_lessons drop constraint if exists training_lessons_type_check;
alter table public.training_lessons add constraint training_lessons_type_check
  check (type = any (array['video','document','image','text','quiz','game','recipe','acknowledge','practical']));

-- ── training_certificates ──
create table if not exists public.training_certificates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  enrolment_id uuid not null references public.training_enrolments(id) on delete cascade,
  cert_number text not null,
  staff_name text,
  course_title text,
  score int,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,                 -- from course.expires_months (null = never)
  skill_id uuid,
  unique (enrolment_id)                    -- one cert per enrolment (idempotent issue)
);

create index if not exists idx_tcert_business on public.training_certificates(business_id);
create index if not exists idx_tcert_staff on public.training_certificates(staff_member_id);

alter table public.training_certificates enable row level security;

-- Owner: full ALL via the business-owner pattern (copy TP-1).
drop policy if exists training_certificates_business_owner on public.training_certificates;
create policy training_certificates_business_owner on public.training_certificates
  for all using (business_id in (select id from public.businesses where user_id = auth.uid()));

-- Staff: read their OWN certificates (staff_members.user_id = auth.uid()).
drop policy if exists training_certificates_staff_select on public.training_certificates;
create policy training_certificates_staff_select on public.training_certificates
  for select using (staff_member_id in (select id from public.staff_members where user_id = auth.uid()));
