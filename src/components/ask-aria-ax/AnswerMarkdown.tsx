'use client'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { segmentFigures, type ProvenanceInput } from '@/lib/aria/figure-provenance'
import { stabiliseStreamingMarkdown } from '@/lib/aria/markdown-stream'
import { toClipboardMarkdown } from '@/lib/aria/copy-markdown'
import { AriaArtifact } from '@/components/aria/AriaArtifact'
import {
  parseAriaResponse, reportArtifactParseFailures, hasArtifact,
} from '@/lib/aria/artifact-segments'

/**
 * S1 PHASE 8 — RENDERING AN ANSWER.
 *
 * Aria answers with numbers and lists constantly, and pipes-and-dashes made the whole product read
 * broken. This renders real markdown: tables as tables, code with a copy button, headings, lists.
 *
 * ── THE LIBRARY, AND WHY ───────────────────────────────────────────────────────────────────────
 * react-markdown 9 + remark-gfm 4, both ALREADY dependencies of this repo — no new supply chain.
 *
 * SANITISATION: react-markdown does not render raw HTML unless `rehype-raw` is added. It is not
 * added, and a test asserts it never is. So a `<script>` in model output is not "sanitised away" —
 * it is never HTML in the first place; it arrives as text and React escapes it. That is a stronger
 * guarantee than a filter, because there is no allowlist to get wrong.
 *
 * ── PROVENANCE OUTRANKS RENDERING ──────────────────────────────────────────────────────────────
 * The sprint is explicit: if rendering breaks provenance, provenance wins. So figures are not
 * segmented over the raw string and then handed to a parser — they are wrapped INSIDE every
 * text-bearing element the parser produces, table cells included. A number in a table keeps its
 * truth tier and its click-to-source exactly as one in a paragraph does.
 */

export interface AnswerMarkdownProps {
  text: string
  streaming?: boolean
  provenance?: ProvenanceInput
  /** Stable prefix so each figure's open/closed state is unique across messages. */
  idPrefix: string
  openSrc: string | null
  onToggleSrc: (id: string | null) => void
}

/** Replace the plain strings inside a rendered element with provenance-aware figure spans. */
function useFigureWrapper(
  provenance: ProvenanceInput,
  idPrefix: string,
  openSrc: string | null,
  onToggleSrc: (id: string | null) => void,
) {
  return useCallback((children: ReactNode): ReactNode => {
    let counter = 0
    const walk = (node: ReactNode): ReactNode => {
      if (typeof node === 'string') {
        const segs = segmentFigures(node, provenance)
        // no figures worth marking — return the string untouched so React can keep it as text
        if (!segs.some(s => s.kind === 'figure' && s.tier !== 'plain')) return node
        return segs.map((s, i) => {
          if (s.kind === 'text' || s.tier === 'plain') return <span key={i}>{s.text}</span>
          const id = idPrefix + ':' + (counter++)
          return (
            <span key={i} className="ax-fig">
              <span
                className={s.tier === 'estimated' ? 'n2 est' : 'n2'}
                role="button"
                tabIndex={0}
                onClick={() => onToggleSrc(openSrc === id ? null : id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSrc(openSrc === id ? null : id) }
                }}
              >{s.text}</span>
              {openSrc === id && s.source && (
                <span className={s.tier === 'estimated' ? 'src on est' : 'src on'}>
                  <b>Where this came from</b> · {s.source}
                </span>
              )}
            </span>
          )
        })
      }
      if (Array.isArray(node)) return node.map((n, i) => <span key={i}>{walk(n)}</span>)
      return node
    }
    return walk(children)
  }, [provenance, idPrefix, openSrc, onToggleSrc])
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const source = useMemo(() => extractText(children), [children])
  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(source); setCopied(true) } catch { setCopied(false) }
  }, [source])

  return (
    <div className="ax-code">
      <button className="ax-code-copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      {/* react-markdown already hands <pre> a <code> child. Wrapping it in a second <code>
          produced nested elements — caught by rendering it, not by reading it. */}
      <pre>{children}</pre>
    </div>
  )
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

export default function AnswerMarkdown({
  text, streaming, provenance, idPrefix, openSrc, onToggleSrc,
}: AnswerMarkdownProps) {
  const wrap = useFigureWrapper(provenance ?? {}, idPrefix, openSrc, onToggleSrc)

  /**
   * S9 PHASE 3 — ARTIFACTS RENDER HERE NOW, NOT ONLY ON `/classic`.
   *
   * Before this, an answer containing `<aria_artifact …>` printed its raw tag and JSON on the
   * default surface — the one every navigation entry point has sent owners to since S5. The
   * capability existed; it was just on the page nobody is routed to.
   *
   * WHILE STREAMING, ARTIFACTS ARE NOT SPLIT OUT. A half-arrived `<aria_artifact>` tag has no
   * closing tag yet, so the regex would not match it and the partial JSON would flash as prose
   * before becoming a chart. Streaming text renders as markdown (its existing behaviour, entirely
   * unchanged) and the artifacts appear when the answer settles. That is the same reasoning
   * stabiliseStreamingMarkdown already applies to half-written tables.
   */
  const parsed = useMemo(
    () => (streaming || !hasArtifact(text) ? null : parseAriaResponse(text)),
    [text, streaming],
  )

  // Telemetry, never during render: an effect fires once per distinct malformed payload.
  useEffect(() => {
    if (parsed?.failures.length) reportArtifactParseFailures(parsed.failures)
  }, [parsed])

  const source = useMemo(
    () => stabiliseStreamingMarkdown(toClipboardMarkdown(text), Boolean(streaming)),
    [text, streaming],
  )

  if (parsed) {
    return (
      <div className="ax-md">
        {parsed.segments.map((seg, i) => seg.kind === 'artifact'
          ? <AriaArtifact key={i} type={seg.type} title={seg.title} data={seg.data} />
          : (
            <AnswerMarkdown
              key={i}
              text={seg.content}
              provenance={provenance}
              idPrefix={idPrefix + ':s' + i}
              openSrc={openSrc}
              onToggleSrc={onToggleSrc}
            />
          ))}
      </div>
    )
  }

  return (
    <div className="ax-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // NO rehype-raw. Model output is never treated as HTML, so there is nothing to sanitise.
        components={{
          p: ({ children }) => <p>{wrap(children)}</p>,
          li: ({ children }) => <li>{wrap(children)}</li>,
          td: ({ children }) => <td>{wrap(children)}</td>,
          th: ({ children }) => <th>{wrap(children)}</th>,
          strong: ({ children }) => <strong>{wrap(children)}</strong>,
          em: ({ children }) => <em>{wrap(children)}</em>,
          h1: ({ children }) => <h4>{wrap(children)}</h4>,
          h2: ({ children }) => <h4>{wrap(children)}</h4>,
          h3: ({ children }) => <h5>{wrap(children)}</h5>,
          table: ({ children }) => <div className="ax-tablewrap"><table>{children}</table></div>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ children, href }) => (
            // Model-supplied links open in a new tab and cannot reach back into the app.
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
          ),
        }}
      >{source}</ReactMarkdown>
    </div>
  )
}
