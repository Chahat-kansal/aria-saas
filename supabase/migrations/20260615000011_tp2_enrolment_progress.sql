-- TP-2 — Training enrolment + lesson progress, with DUAL-AUDIENCE RLS.
-- Owners assign courses (by role=staff_members.position, or manually); staff see + complete
-- their training; completion grants the cert into staff_member_skills.
-- Builds on TP-1 (training_courses/lessons/quiz_questions). The TP-1 owner policies are
-- LEFT INTACT — staff read policies here are ADDITIVE.

-- ── training_enrolments ─────────────────────────────────────────────────────
create table if not exists public.training_enrolments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','in_progress','complete')),
  progress_pct int not null default 0,
  score int,
  completed_at timestamptz,
  certified boolean not null default false,
  unique (course_id, staff_member_id)            -- idempotent assign: one enrolment per staff per course
);

-- ── training_lesson_progress ────────────────────────────────────────────────
create table if not exists public.training_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  enrolment_id uuid not null references public.training_enrolments(id) on delete cascade,
  lesson_id uuid not null references public.training_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  score int,
  unique (enrolment_id, lesson_id)               -- idempotent lesson completion
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_tenrol_business on public.training_enrolments(business_id);
create index if not exists idx_tenrol_course on public.training_enrolments(course_id);
create index if not exists idx_tenrol_staff on public.training_enrolments(staff_member_id);
create index if not exists idx_tlprog_business on public.training_lesson_progress(business_id);
create index if not exists idx_tlprog_enrol on public.training_lesson_progress(enrolment_id);

alter table public.training_enrolments enable row level security;
alter table public.training_lesson_progress enable row level security;

-- ── OWNER policies (copy TP-1 pattern: full ALL, business_id owner-scoped) ───
drop policy if exists training_enrolments_business_owner on public.training_enrolments;
create policy training_enrolments_business_owner on public.training_enrolments
  for all using (business_id in (select id from public.businesses where user_id = auth.uid()));

drop policy if exists training_lesson_progress_business_owner on public.training_lesson_progress;
create policy training_lesson_progress_business_owner on public.training_lesson_progress
  for all using (business_id in (select id from public.businesses where user_id = auth.uid()));

-- ── STAFF policies (portal: staff_members.user_id = auth.uid()) ─────────────
-- Staff read their own enrolments and may update them (progress rollup); they read + insert
-- their own lesson progress. Keyed on the staff_members rows they own.
drop policy if exists training_enrolments_staff_select on public.training_enrolments;
create policy training_enrolments_staff_select on public.training_enrolments
  for select using (staff_member_id in (select id from public.staff_members where user_id = auth.uid()));

drop policy if exists training_enrolments_staff_update on public.training_enrolments;
create policy training_enrolments_staff_update on public.training_enrolments
  for update using (staff_member_id in (select id from public.staff_members where user_id = auth.uid()))
  with check (staff_member_id in (select id from public.staff_members where user_id = auth.uid()));

drop policy if exists training_lesson_progress_staff_select on public.training_lesson_progress;
create policy training_lesson_progress_staff_select on public.training_lesson_progress
  for select using (
    enrolment_id in (
      select e.id from public.training_enrolments e
      where e.staff_member_id in (select id from public.staff_members where user_id = auth.uid())
    )
  );

drop policy if exists training_lesson_progress_staff_insert on public.training_lesson_progress;
create policy training_lesson_progress_staff_insert on public.training_lesson_progress
  for insert with check (
    enrolment_id in (
      select e.id from public.training_enrolments e
      where e.staff_member_id in (select id from public.staff_members where user_id = auth.uid())
    )
  );

-- ── STAFF READ on TP-1 tables (ADDITIVE — owner policy untouched) ───────────
-- Staff can read a course + its lessons ONLY if they are enrolled in that course.
-- quiz_questions is intentionally NOT exposed to staff in TP-2 (quiz play + server-side
-- scoring of `correct` is TP-3).
drop policy if exists training_courses_staff_enrolled_read on public.training_courses;
create policy training_courses_staff_enrolled_read on public.training_courses
  for select using (
    id in (
      select e.course_id from public.training_enrolments e
      where e.staff_member_id in (select id from public.staff_members where user_id = auth.uid())
    )
  );

drop policy if exists training_lessons_staff_enrolled_read on public.training_lessons
;
create policy training_lessons_staff_enrolled_read on public.training_lessons
  for select using (
    course_id in (
      select e.course_id from public.training_enrolments e
      where e.staff_member_id in (select id from public.staff_members where user_id = auth.uid())
    )
  );
