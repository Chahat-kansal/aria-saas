-- TP-SEED — backfill the default day-one training pack for every existing business that lacks it.
-- NON-compliance only (systems + culture). Idempotent: each course is inserted only if a course
-- with the same title doesn't already exist for the business. Re-running is safe. Mirrors
-- src/lib/training/seed-default-pack.ts (the runtime path used for new businesses + onboarding).

do $$
declare b record;
declare cid uuid;
begin
  for b in select id, name, user_id from public.businesses loop
    -- 1. Run the POS (systems, game round 'pos') — the headline
    if not exists (select 1 from public.training_courses where business_id = b.id and title = 'Run the POS') then
      insert into public.training_courses (business_id, title, description, tier, role_tags, is_mandatory, pass_mark, est_minutes, expires_months, status, created_by)
      values (b.id, 'Run the POS', 'A hands-on game: build the order, take payment, give the right change. The fastest way to get someone confident on the till.', 'systems', '{}', true, 80, 10, null, 'published', b.user_id)
      returning id into cid;
      insert into public.training_lessons (course_id, business_id, sort_order, type, title, game_round, duration_seconds)
      values (cid, b.id, 0, 'game', 'Run the POS', 'pos', 600);
    end if;

    -- 2. Spot the Honest Answer (systems, game round 'truth')
    if not exists (select 1 from public.training_courses where business_id = b.id and title = 'Spot the Honest Answer') then
      insert into public.training_courses (business_id, title, description, tier, role_tags, is_mandatory, pass_mark, est_minutes, expires_months, status, created_by)
      values (b.id, 'Spot the Honest Answer', 'A quick game that teaches grounded thinking — only one statement matches the data.', 'systems', '{}', false, 80, 10, null, 'published', b.user_id)
      returning id into cid;
      insert into public.training_lessons (course_id, business_id, sort_order, type, title, game_round, duration_seconds)
      values (cid, b.id, 0, 'game', 'Spot the Honest Answer', 'truth', 600);
    end if;

    -- 3. Welcome to <business> (culture, acknowledge stub — owner editable)
    if not exists (select 1 from public.training_courses where business_id = b.id and title = 'Welcome to ' || coalesce(b.name, 'your business')) then
      insert into public.training_courses (business_id, title, description, tier, role_tags, is_mandatory, pass_mark, est_minutes, expires_months, status, created_by)
      values (b.id, 'Welcome to ' || coalesce(b.name, 'your business'), 'Your story, values and the standard you expect — an editable culture course for new starters.', 'culture', '{}', false, 80, 10, null, 'published', b.user_id)
      returning id into cid;
      insert into public.training_lessons (course_id, business_id, sort_order, type, title, content)
      values (cid, b.id, 0, 'acknowledge', 'Our story & how we work',
        'Welcome to the ' || coalesce(b.name, '') || ' team!' || chr(10) || chr(10) ||
        'This is your space to learn how we do things. Your manager will add our values, menu knowledge and day-to-day standards here.' || chr(10) || chr(10) ||
        'Tick below to confirm you''ve read this welcome.');
    end if;
  end loop;
end $$;
