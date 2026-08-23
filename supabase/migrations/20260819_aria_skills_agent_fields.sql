-- ARIA-AGENTS-1a · additive agent fields on aria_skills.
-- Existing columns already serve two roles: system_prompt_addition = instructions, enabled = is_active.
-- All new columns are NULLABLE with safe defaults, so existing rows and readers are unaffected.
-- share_token is RESERVED ONLY — V5 says sharing stays closed; no code may read or write it yet.
-- Reversal:
--   ALTER TABLE public.aria_skills DROP COLUMN kind, DROP COLUMN allowed_tools,
--     DROP COLUMN data_scope, DROP COLUMN share_token;

ALTER TABLE public.aria_skills
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'skill',
  ADD COLUMN IF NOT EXISTS allowed_tools text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS data_scope jsonb,
  ADD COLUMN IF NOT EXISTS share_token text;

ALTER TABLE public.aria_skills
  ADD CONSTRAINT aria_skills_kind_check CHECK (kind IN ('skill','agent'));

COMMENT ON COLUMN public.aria_skills.kind IS
  'skill = legacy persona addition (all 18 pre-existing rows); agent = owner-built agent (ARIA-AGENTS-1).';
COMMENT ON COLUMN public.aria_skills.allowed_tools IS
  'Tool allowlist for an agent. Empty array = read-only default. The EXECUTOR enforces this, never the model (V2).';
COMMENT ON COLUMN public.aria_skills.data_scope IS
  'Optional scoping hints for agent reads. Never a source of business_id — the rail resolves tenant server-side (V3).';
COMMENT ON COLUMN public.aria_skills.share_token IS
  'RESERVED — sharing is deliberately NOT built (V5). No code may read or write this column until a sanitise-and-preview step exists.';
