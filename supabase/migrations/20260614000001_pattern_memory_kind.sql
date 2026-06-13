-- PATTERN-MEMORY-1 (I3) PART 0 — allow kind='pattern' in aria_business_memory.
-- Patterns are durable, SQL-detected data distillations (source_type='signal'), distinct from the
-- conversation-extracted preference/fact/tried/decision/concern/goal kinds. chat-Claude applies this.
ALTER TABLE aria_business_memory DROP CONSTRAINT IF EXISTS aria_business_memory_kind_check;
ALTER TABLE aria_business_memory ADD CONSTRAINT aria_business_memory_kind_check
  CHECK (kind = ANY (ARRAY['preference', 'fact', 'tried', 'decision', 'concern', 'goal', 'pattern']));
