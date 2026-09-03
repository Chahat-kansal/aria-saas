'use client'
import { markFor, type PlanResult, type PlanStep } from '@/lib/aria/works/plan-shape'
// plan-shape, NOT plan: `plan.ts` reaches model-router and the Anthropic SDK, whose credentials
// module imports node:path — importing it from a client component fails the webpack build with
// UnhandledSchemeError. The mark still comes from the SAME markFor the server renders with.

/**
 * M11B PHASE 1 — THE PLAN, ON THE SURFACE.
 *
 * ── EVERY STEP CARRIES ITS MARK, AND THE MARK COMES FROM THE REGISTRY ──────────────────────────
 * `markFor` is the SAME function the server-side renderer uses, so what the owner reads here and
 * what is written into a report cannot drift. It is not re-derived from `needs_approval` in JSX,
 * which is how the two would fall out of step the first time either changed.
 *
 * A step Aria may not carry out has no unmarked state: `markFor` returns "NEEDS A PERSON", "NEEDS
 * YOU" or "NEEDS YOUR OK" for every one of them, and `plan-surface.test.ts` mutates the mark away
 * and requires the suite to go red.
 *
 * ── AND NOTHING HAS RUN ────────────────────────────────────────────────────────────────────────
 * The card says so in words. A plan is a proposal; M11B phase 2 is the approval and phase 3 is the
 * only thing that executes.
 */

export interface PlanCardProps {
  result: PlanResult
  /** Null when the plan was not persisted (a provider outage) — approval needs a row to claim. */
  planId: string | null
  /** From the stored row, so the card shows the DATABASE's state and not the client's guess. */
  status?: string | null
  onApprove?: (planId: string) => void
  approving?: boolean
}

const GREEN = '#7FB897'
const AMBER = '#f59e0b'

function markColour(step: PlanStep): string {
  return step.runnable_by_aria ? GREEN : AMBER
}

export default function PlanCard({ result, planId, status, onApprove, approving }: PlanCardProps) {
  if (!result.ok) {
    // THE HONEST REFUSAL. `unplannable_reason` is a column and this is the sentence in it — the
    // owner sees why, rather than the request disappearing. Half a plan presented as whole is the
    // failure this repo has found most often; a refusal shown plainly is not that.
    return (
      <div className="ax-plan" style={{ border: '1px solid rgba(245,158,11,0.35)', borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: AMBER }}>I can’t turn that into a plan.</div>
        <p style={{ fontSize: 12, marginTop: 6, color: 'rgba(255,255,255,0.6)' }}>{result.reason}</p>
      </div>
    )
  }

  const canApprove = Boolean(planId) && status === 'proposed' && typeof onApprove === 'function'

  return (
    <div className="ax-plan" style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 14 }}>
      {result.blocked_reason && (
        // FIRST, never a footnote.
        <p style={{ fontSize: 12, color: AMBER, margin: '0 0 10px' }}>⚠️ {result.blocked_reason}</p>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{result.title}</div>

      <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
        {result.steps.map(step => (
          <li key={step.index} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', minWidth: 16, fontVariantNumeric: 'tabular-nums' }}>
              {step.index}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{step.title}</div>
              {step.detail && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{step.detail}</div>
              )}
              {/* THE MARK. Never absent for a step Aria may not carry out. */}
              <div style={{ fontSize: 10, color: markColour(step), marginTop: 3, letterSpacing: '0.02em' }}>
                {markFor(step)}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          {status === 'proposed' || !status
            ? 'Nothing has run. This is the plan.'
            : 'Plan ' + status + '.'}
        </span>
        {canApprove && (
          <button
            onClick={() => onApprove!(planId!)}
            disabled={approving}
            style={{
              fontSize: 11, padding: '6px 12px', borderRadius: 999, cursor: approving ? 'default' : 'pointer',
              border: '1px solid rgba(127,184,151,0.45)', background: 'rgba(127,184,151,0.12)', color: GREEN,
              opacity: approving ? 0.5 : 1,
            }}
          >
            {approving ? 'Approving…' : 'Approve and run the safe steps'}
          </button>
        )}
      </div>
    </div>
  )
}
