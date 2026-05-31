# 🔒 NON-NEGOTIABLE RULE — UPGRADE ONLY, NEVER DOWNGRADE

**This rule overrides everything. Read it before every task in every prompt.**

## The Rule
Every change must ONLY upgrade, improve, or add. NEVER downgrade, simplify away,
remove, or weaken any existing feature, capability, or behaviour — not even accidentally,
not even temporarily, not even "to fix a build error."

## What this means concretely

### NEVER do these:
- ❌ Remove a feature to fix a TypeScript error (fix the type instead)
- ❌ Comment out / stub / disable working code to make something else work
- ❌ Replace a rich implementation with a simpler one
- ❌ Delete a UI element, tab, button, or capability
- ❌ Reduce the number of fields returned by an API
- ❌ Remove a tool from Aria's tool list
- ❌ Lower a limit, shorten an output, reduce a model's max_tokens
- ❌ Drop a DB column that has data or is used
- ❌ Replace a working integration with a placeholder
- ❌ "Temporarily" remove something with intent to add back later
- ❌ Simplify a complex component "for now"

### ALWAYS do these instead:
- ✅ Fix the root cause, keeping all functionality intact
- ✅ If a build breaks, fix the actual error — never delete the feature causing it
- ✅ Add capability on top of what exists
- ✅ If refactoring, the result must do everything the original did PLUS the improvement
- ✅ If a feature must change shape, the new shape must be strictly more capable

## Before committing ANY change, verify:
1. Does this remove or weaken anything that currently works? → If yes, STOP and find another way.
2. Does the changed file still do EVERYTHING it did before? → Must be yes.
3. Am I deleting code to make an error go away? → Forbidden. Fix the error properly.
4. Is every feature, tab, button, field, tool still present and functional? → Must be yes.

## If a genuine conflict arises
If you believe something MUST be removed or downgraded to proceed:
- DO NOT do it.
- Stop, leave the code as-is, and flag it clearly in your output:
  "⚠️ BLOCKED: Task X appears to require downgrading [feature]. Not proceeding per upgrade-only rule. Need guidance."
- Let the human decide.

## Scope
This applies to: all Claude Code sessions, all prompts (audit, PRR, feature, fix),
all manual edits. Every numbered prompt in /prompts/ is bound by this rule even if
the prompt itself doesn't restate it.

## The one-line version
**Aria only ever gets better. Nothing it can do today should it be unable to do tomorrow.**
