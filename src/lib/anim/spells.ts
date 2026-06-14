// SPELLS-1 — the "Design Spells" micro-animation library. 22 reusable, pure-CSS keyframe patterns.
// This sprint DEFINES the library only (it is NOT applied site-wide). Surfaces opt in by injecting
// `spellsCSS()` once and adding the `spell-<id>` class (optionally with `--spell-duration` / delay).
// Zero dependency (no framer-motion). Respects prefers-reduced-motion (animations disabled there).

export interface Spell {
  id: string
  label: string
  description: string
  /** @keyframes body (without the @keyframes wrapper) */
  keyframes: string
  /** the `animation` shorthand applied by `.spell-<id>` (duration is var-overridable) */
  animation: string
}

export const SPELLS: Spell[] = [
  { id: 'fade-in',        label: 'Fade In',        description: 'Simple opacity fade',                 keyframes: 'from{opacity:0}to{opacity:1}', animation: 'spell-fade-in var(--spell-duration,.4s) ease both' },
  { id: 'fade-in-up',     label: 'Fade In Up',     description: 'Rise + fade for cards/rows',          keyframes: 'from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}', animation: 'spell-fade-in-up var(--spell-duration,.45s) cubic-bezier(.22,1,.36,1) both' },
  { id: 'fade-in-down',   label: 'Fade In Down',   description: 'Drop + fade for menus/toasts',        keyframes: 'from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}', animation: 'spell-fade-in-down var(--spell-duration,.45s) cubic-bezier(.22,1,.36,1) both' },
  { id: 'scale-in',       label: 'Scale In',       description: 'Grow from 96% with fade',             keyframes: 'from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}', animation: 'spell-scale-in var(--spell-duration,.35s) cubic-bezier(.22,1,.36,1) both' },
  { id: 'pop-in',         label: 'Pop In',         description: 'Overshoot bounce for emphasis',       keyframes: '0%{opacity:0;transform:scale(.8)}60%{opacity:1;transform:scale(1.05)}100%{transform:scale(1)}', animation: 'spell-pop-in var(--spell-duration,.5s) cubic-bezier(.34,1.56,.64,1) both' },
  { id: 'slide-in-left',  label: 'Slide In Left',  description: 'Enter from the left',                 keyframes: 'from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:none}', animation: 'spell-slide-in-left var(--spell-duration,.45s) cubic-bezier(.22,1,.36,1) both' },
  { id: 'slide-in-right', label: 'Slide In Right', description: 'Enter from the right',                keyframes: 'from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}', animation: 'spell-slide-in-right var(--spell-duration,.45s) cubic-bezier(.22,1,.36,1) both' },
  { id: 'blur-in',        label: 'Blur In',        description: 'Defocus → focus reveal',              keyframes: 'from{opacity:0;filter:blur(8px)}to{opacity:1;filter:blur(0)}', animation: 'spell-blur-in var(--spell-duration,.5s) ease both' },
  { id: 'rotate-in',      label: 'Rotate In',      description: 'Slight rotation entrance',            keyframes: 'from{opacity:0;transform:rotate(-6deg) scale(.96)}to{opacity:1;transform:none}', animation: 'spell-rotate-in var(--spell-duration,.5s) cubic-bezier(.22,1,.36,1) both' },
  { id: 'flip-in',        label: 'Flip In',        description: '3D X-axis flip reveal',               keyframes: 'from{opacity:0;transform:perspective(600px) rotateX(-60deg)}to{opacity:1;transform:none}', animation: 'spell-flip-in var(--spell-duration,.6s) cubic-bezier(.22,1,.36,1) both' },
  { id: 'float',          label: 'Float',          description: 'Gentle idle hover (loop)',            keyframes: '0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}', animation: 'spell-float var(--spell-duration,3s) ease-in-out infinite' },
  { id: 'breathe',        label: 'Breathe',        description: 'Soft scale pulse (loop)',             keyframes: '0%,100%{transform:scale(1)}50%{transform:scale(1.03)}', animation: 'spell-breathe var(--spell-duration,4s) ease-in-out infinite' },
  { id: 'pulse',          label: 'Pulse',          description: 'Opacity heartbeat (loop)',            keyframes: '0%,100%{opacity:1}50%{opacity:.55}', animation: 'spell-pulse var(--spell-duration,1.6s) ease-in-out infinite' },
  { id: 'glow',          label: 'Glow',           description: 'Breathing sage glow (loop)',          keyframes: '0%,100%{box-shadow:0 0 0 0 rgba(127,184,151,0)}50%{box-shadow:0 0 18px 2px rgba(127,184,151,.45)}', animation: 'spell-glow var(--spell-duration,2.4s) ease-in-out infinite' },
  { id: 'shimmer',        label: 'Shimmer',        description: 'Skeleton/loading sweep (loop)',       keyframes: '0%{background-position:-180% 0}100%{background-position:180% 0}', animation: 'spell-shimmer var(--spell-duration,1.5s) linear infinite' },
  { id: 'bounce',         label: 'Bounce',         description: 'Attention bounce (loop)',             keyframes: '0%,20%,50%,80%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}60%{transform:translateY(-5px)}', animation: 'spell-bounce var(--spell-duration,1.4s) ease infinite' },
  { id: 'wobble',         label: 'Wobble',         description: 'Playful wobble (once)',               keyframes: '0%{transform:none}25%{transform:rotate(-3deg)}50%{transform:rotate(2deg)}75%{transform:rotate(-1deg)}100%{transform:none}', animation: 'spell-wobble var(--spell-duration,.7s) ease both' },
  { id: 'shake',          label: 'Shake',          description: 'Error shake (once)',                  keyframes: '0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}', animation: 'spell-shake var(--spell-duration,.5s) ease both' },
  { id: 'ripple',         label: 'Ripple',         description: 'Expanding ring (loop)',               keyframes: '0%{transform:scale(.6);opacity:.6}100%{transform:scale(1.6);opacity:0}', animation: 'spell-ripple var(--spell-duration,1.4s) ease-out infinite' },
  { id: 'count-up',       label: 'Count Up',       description: 'Number reveal slide (once)',          keyframes: 'from{opacity:0;transform:translateY(.5em)}to{opacity:1;transform:none}', animation: 'spell-count-up var(--spell-duration,.5s) cubic-bezier(.22,1,.36,1) both' },
  { id: 'gradient-shift', label: 'Gradient Shift', description: 'Aurora gradient drift (loop)',        keyframes: '0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}', animation: 'spell-gradient-shift var(--spell-duration,8s) ease infinite' },
  { id: 'reveal-clip',    label: 'Reveal Clip',    description: 'Wipe-in via clip-path (once)',        keyframes: 'from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}', animation: 'spell-reveal-clip var(--spell-duration,.6s) cubic-bezier(.22,1,.36,1) both' },
]

/**
 * One stylesheet for all spells: every `@keyframes spell-<id>` plus a `.spell-<id>` class.
 * Inject once per surface (e.g. a <style> tag). Animations are disabled under prefers-reduced-motion.
 */
export function spellsCSS(): string {
  const frames = SPELLS.map(s => `@keyframes spell-${s.id}{${s.keyframes}}`).join('')
  const classes = SPELLS.map(s => `.spell-${s.id}{animation:${s.animation}}`).join('')
  // shimmer/gradient helpers need a sized background; provided as opt-in utility classes
  const helpers = `.spell-shimmer{background-image:linear-gradient(90deg,rgba(255,255,255,0) 0,rgba(255,255,255,.18) 50%,rgba(255,255,255,0) 100%);background-size:200% 100%}.spell-gradient-shift{background-size:200% 200%}`
  return `${frames}${classes}${helpers}@media (prefers-reduced-motion: reduce){${SPELLS.map(s => `.spell-${s.id}`).join(',')}{animation:none!important}}`
}

/** The raw `animation` shorthand for a spell id (for inline style use), or '' if unknown. */
export function spell(id: string): string {
  return SPELLS.find(s => s.id === id)?.animation ?? ''
}
