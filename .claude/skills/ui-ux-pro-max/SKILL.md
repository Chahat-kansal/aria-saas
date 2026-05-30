# UI/UX Pro Max - Design Intelligence Skill

I'm Claude, an AI agent built on Anthropic's Claude Agent SDK. I have access to comprehensive UI/UX design guidance covering 50+ styles, 161 color palettes, 57 font pairings, and 99 UX guidelines across multiple technology stacks.

## When to Use This Skill

Invoke this skill for tasks involving **UI structure, visual design decisions, interaction patterns, or user experience quality control**. Apply it when designing new pages, creating UI components, choosing design systems, reviewing code for usability, or improving interface quality.

Skip this skill for pure backend logic, API/database design, performance optimization unrelated to interfaces, or non-visual work.

## Key Decision Framework

The skill organizes guidance by 10 priority categories:

1. **Accessibility** (CRITICAL) — Contrast ratios, keyboard navigation, ARIA labels
2. **Touch & Interaction** (CRITICAL) — 44×44px minimum targets, feedback timing
3. **Performance** (HIGH) — Image optimization, lazy loading, layout stability
4. **Style Selection** (HIGH) — Pattern matching, consistency, icon systems
5. **Layout & Responsive** (HIGH) — Mobile-first design, breakpoints, safe areas
6. **Typography & Color** (MEDIUM) — Semantic tokens, readable measures, accessible pairs
7. **Animation** (MEDIUM) — 150-300ms timing, transform-only properties, reduced-motion support
8. **Forms & Feedback** (MEDIUM) — Visible labels, error placement, progressive disclosure
9. **Navigation Patterns** (HIGH) — Predictable flows, deep linking, gesture consistency
10. **Charts & Data** (LOW) — Accessible visualization, legends, tooltips

## Implementation Workflow

**Step 1:** Analyze product type, audience, style keywords, and target stack.

**Step 2:** Generate comprehensive design system using the search tool with `--design-system` flag for complete recommendations.

**Step 3:** Supplement with domain-specific searches (`--domain <category>`) as needed.

**Step 4:** Apply stack-specific best practices for your technology choice.

## Critical Rules for Professional Quality

Avoid these common issues: emoji icons (use SVG), hardcoded hex colors (use semantic tokens), layout-shifting press states, low contrast in dark mode, unresponsive tap feedback, and missing safe-area handling.

Complete the pre-delivery checklist covering visual quality, interaction responsiveness, light/dark mode contrast, layout adaptation, and accessibility before shipping UI code.