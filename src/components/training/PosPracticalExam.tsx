'use client'
import { useEffect, useMemo, useState } from 'react'

// TP-4 — SANDBOXED POS practical exam. ⚠️ SAFETY: this component writes NOTHING to any real
// table. It reads pos_products READ-ONLY (the only pos_ table it touches) to make the menu feel
// real, then runs scripted scenarios whose "sales / payments / change" are IN-MEMORY state only.
// The single DB write the whole feature makes happens OUTSIDE this component: the parent posts the
// final 0-100 score to the training completion path (training_lesson_progress). No live POS code
// is imported here — it is a dedicated surface, sandboxed by construction.

const CARD = '#ffffff', INK = '#1d2a24', MUTED = '#6b7d74', LINE = '#e6ece8'
const SAGE = '#7FB897', DEEP = '#2D5240', AMBER = '#BA7517', RED = '#E24B4A'
const money = (v: number) => '$' + Number(v).toFixed(2)
const rand = (n: number) => Math.floor(Math.random() * n)

interface Product { id: string; name: string; price: number; category?: string | null }
const FALLBACK: Product[] = [
  { id: 'fw', name: 'Flat White', price: 4.5 }, { id: 'lt', name: 'Latte', price: 4.8 },
  { id: 'cap', name: 'Cappuccino', price: 4.5 }, { id: 'lc', name: 'Long Black', price: 4.0 },
  { id: 'cr', name: 'Croissant', price: 5.0 }, { id: 'mf', name: 'Muffin', price: 4.2 },
  { id: 'ck', name: 'Cookie', price: 3.5 }, { id: 'sw', name: 'Sandwich', price: 9.0 },
]
const emojiFor = (p: Product) => {
  const n = (p.name + ' ' + (p.category ?? '')).toLowerCase()
  if (/coffee|latte|flat|cappu|espresso|long black|mocha/.test(n)) return '☕'
  if (/tea|chai|matcha/.test(n)) return '🍵'
  if (/croissant|pastry|muffin|cake|cookie|brownie|donut/.test(n)) return '🥐'
  if (/sandwich|roll|wrap|toast|bagel/.test(n)) return '🥪'
  if (/juice|smoothie|soda|drink|water/.test(n)) return '🧃'
  if (/salad|bowl/.test(n)) return '🥗'
  return '🍽️'
}

const btn = (bg: string, fg = '#0c130f'): React.CSSProperties => ({ padding: '10px 16px', borderRadius: 10, border: 'none', background: bg, color: fg, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' })
const choiceBtn = (state: 'idle' | 'right' | 'wrong'): React.CSSProperties => ({
  padding: '13px 15px', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
  border: `1.5px solid ${state === 'right' ? DEEP : state === 'wrong' ? RED : LINE}`,
  background: state === 'right' ? `${SAGE}22` : state === 'wrong' ? `${RED}12` : '#fff',
  color: state === 'wrong' ? RED : DEEP,
})

export default function PosPracticalExam({ onComplete }: { onComplete: (score: number) => void }) {
  const [products, setProducts] = useState<Product[] | null>(null)
  useEffect(() => {
    fetch('/api/staff/portal/training?menu=1')
      .then(r => r.json())
      .then(d => {
        const p = ((d.products ?? []) as Product[]).filter(x => Number(x.price) > 0).map(x => ({ ...x, price: Number(x.price) }))
        setProducts(p.length >= 4 ? p : FALLBACK)
      })
      .catch(() => setProducts(FALLBACK))
  }, [])
  if (!products) return <p style={{ marginTop: 10, fontSize: 12.5, color: MUTED }}>Loading the practice till…</p>
  return <Exam menu={products} onComplete={onComplete} />
}

type Result = { label: string; pass: boolean }

function Exam({ menu, onComplete }: { menu: Product[]; onComplete: (score: number) => void }) {
  const [step, setStep] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const [coach, setCoach] = useState('Aria: run the till like a real shift. Five scenarios — nothing here touches your real sales.')

  // Build the scenario specs once from the real menu.
  const scenarios = useMemo(() => buildScenarios(menu), [menu])
  const total = scenarios.length

  function record(label: string, pass: boolean, line: string) {
    setResults(r => [...r, { label, pass }])
    setCoach('Aria: ' + line)
    setTimeout(() => setStep(s => s + 1), 650)
  }

  if (step >= total) {
    const passed = results.filter(r => r.pass).length
    const score = Math.round((passed / total) * 100)
    return (
      <div style={{ marginTop: 12, background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 30 }}>{score >= 70 ? '🎉' : '💪'}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: DEEP, marginTop: 4 }}>{score}%</div>
        <div style={{ fontSize: 13, color: MUTED, margin: '4px 0 12px' }}>{passed} of {total} scenarios passed</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left', marginBottom: 14 }}>
          {results.map((r, i) => (
            <div key={i} style={{ fontSize: 12.5, color: r.pass ? DEEP : RED }}>{r.pass ? '✓' : '✗'} {r.label}</div>
          ))}
        </div>
        <button onClick={() => onComplete(score)} style={{ ...btn(SAGE), width: '100%' }}>Submit result</button>
      </div>
    )
  }

  const sc = scenarios[step]
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: AMBER, textTransform: 'uppercase' }}>Scenario {step + 1} of {total}</span>
        <div style={{ display: 'flex', gap: 4 }}>{scenarios.map((_s, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 99, background: i < results.length ? (results[i].pass ? SAGE : RED) : i === step ? AMBER : '#e1e7e3' }} />)}</div>
      </div>
      <div style={{ background: `${SAGE}12`, border: `1px solid ${SAGE}33`, borderRadius: 10, padding: '8px 11px', fontSize: 12.5, color: DEEP, marginBottom: 12 }}>{coach}</div>
      <ScenarioView key={step} spec={sc} onResult={(pass, line) => record(sc.title, pass, line)} setCoach={setCoach} />
    </div>
  )
}

// ───────────────────────── Scenario specs ─────────────────────────
type Scenario =
  | { kind: 'order'; title: string; want: Array<{ p: Product; qty: number }>; menu: Product[] }
  | { kind: 'choice'; title: string; prompt: string; panel: Array<{ n: string; l: string }>; options: number[]; correct: number; format: (v: number) => string; rightLine: string; wrongLine: string }
  | { kind: 'void'; title: string; ticket: Product[]; wrongIndex: number }

function buildScenarios(menu: Product[]): Scenario[] {
  const pick = (n: number) => { const pool = menu.slice(); const out: Product[] = []; for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(rand(pool.length), 1)[0]); return out }
  const near = (correct: number, deltas: number[]) => {
    const set = new Set<number>([correct]); deltas.forEach(d => { const v = +(correct + d).toFixed(2); if (v >= 0) set.add(v) })
    const arr = Array.from(set).slice(0, 4); if (!arr.includes(correct)) arr[0] = correct
    for (let i = arr.length - 1; i > 0; i--) { const j = rand(i + 1);[arr[i], arr[j]] = [arr[j], arr[i]] }
    return arr
  }

  // 1) Take an order
  const orderItems = pick(2).map(p => ({ p, qty: 1 + (Math.random() < 0.35 ? 1 : 0) }))

  // 2) Correct change
  const changeOrder = pick(2)
  const changeTotal = +changeOrder.reduce((s, p) => s + p.price, 0).toFixed(2)
  const note = [10, 20, 50].find(x => x >= Math.ceil(changeTotal)) ?? 50
  const change = +(note - changeTotal).toFixed(2)

  // 3) Split a bill evenly
  const splitOrder = pick(3)
  const splitTotal = +splitOrder.reduce((s, p) => s + p.price, 0).toFixed(2)
  const eachPays = +(splitTotal / 2).toFixed(2)

  // 4) Staff discount 20%
  const discItem = pick(1)[0]
  const discounted = +(discItem.price * 0.8).toFixed(2)

  // 5) Void the wrong item
  const voidOrder = pick(3)
  const extra = menu.find(m => !voidOrder.includes(m)) ?? menu[0]
  const ticket = [...voidOrder]
  const wrongIndex = rand(ticket.length + 1)
  ticket.splice(wrongIndex, 0, extra)

  return [
    { kind: 'order', title: 'Take the order', want: orderItems, menu },
    { kind: 'choice', title: 'Give correct change', prompt: `Customer pays ${money(note)} for a ${money(changeTotal)} order. How much change?`, panel: [{ n: money(changeTotal), l: 'Amount due' }, { n: money(note), l: 'Paid' }], options: near(change, [0.5, -0.5, 1, -1, 2]), correct: change, format: money, rightLine: 'Exact change — counted right.', wrongLine: `It was ${money(change)}: ${money(note)} − ${money(changeTotal)}.` },
    { kind: 'choice', title: 'Split the bill', prompt: `Split a ${money(splitTotal)} bill evenly between 2 people. What does each pay?`, panel: [{ n: money(splitTotal), l: 'Bill total' }, { n: '2', l: 'Ways' }], options: near(eachPays, [0.5, -0.5, 1, -1]), correct: eachPays, format: money, rightLine: 'Even split, spot on.', wrongLine: `Each pays ${money(eachPays)} — half of ${money(splitTotal)}.` },
    { kind: 'choice', title: 'Apply staff discount', prompt: `A ${discItem.name} is ${money(discItem.price)}. Apply the 20% staff discount — new price?`, panel: [{ n: money(discItem.price), l: discItem.name }, { n: '20% off', l: 'Staff rate' }], options: near(discounted, [0.5, -0.3, 1, 0.2]), correct: discounted, format: money, rightLine: 'Correct staff price.', wrongLine: `20% off ${money(discItem.price)} = ${money(discounted)}.` },
    { kind: 'void', title: 'Void the wrong item', ticket, wrongIndex },
  ]
}

// ───────────────────────── Scenario renderers ─────────────────────────
function ScenarioView({ spec, onResult, setCoach }: { spec: Scenario; onResult: (pass: boolean, line: string) => void; setCoach: (s: string) => void }) {
  if (spec.kind === 'order') return <OrderView spec={spec} onResult={onResult} setCoach={setCoach} />
  if (spec.kind === 'void') return <VoidView spec={spec} onResult={onResult} />
  return <ChoiceView spec={spec} onResult={onResult} />
}

const panelBox = (panel: Array<{ n: string; l: string }>) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
    {panel.map((s, i) => (
      <div key={i} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '8px 12px', flex: 1, minWidth: 110 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: DEEP }}>{s.n}</div>
        <div style={{ fontSize: 10.5, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.l}</div>
      </div>
    ))}
  </div>
)

function ChoiceView({ spec, onResult }: { spec: Extract<Scenario, { kind: 'choice' }>; onResult: (pass: boolean, line: string) => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <div>
      {panelBox(spec.panel)}
      <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 10 }}>{spec.prompt}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {spec.options.map((v, i) => {
          const state = picked == null ? 'idle' : Math.abs(v - spec.correct) < 0.001 ? 'right' : v === spec.options[picked] ? 'wrong' : 'idle'
          return (
            <button key={i} disabled={picked != null} style={choiceBtn(state as 'idle' | 'right' | 'wrong')}
              onClick={() => { setPicked(i); const ok = Math.abs(v - spec.correct) < 0.001; setTimeout(() => onResult(ok, ok ? spec.rightLine : spec.wrongLine), 600) }}>
              {spec.format(v)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OrderView({ spec, onResult, setCoach }: { spec: Extract<Scenario, { kind: 'order' }>; onResult: (pass: boolean, line: string) => void; setCoach: (s: string) => void }) {
  const [ticket, setTicket] = useState<Record<string, number>>({})
  const wantMap = useMemo(() => { const m: Record<string, number> = {}; spec.want.forEach(w => m[w.p.id] = w.qty); return m }, [spec])
  const matches = () => { const have = Object.keys(ticket).filter(id => ticket[id] > 0); const wk = Object.keys(wantMap); return have.length === wk.length && wk.every(id => ticket[id] === wantMap[id]) }
  const wantText = spec.want.map(w => `${w.qty}× ${w.p.name}`).join(', ')

  function tap(p: Product) {
    if (!wantMap[p.id]) setCoach('Aria: they didn\'t ask for that — tap it again to remove.')
    setTicket(t => ({ ...t, [p.id]: (t[p.id] ?? 0) + 1 }))
  }
  function dec(id: string) { setTicket(t => { const n = { ...t }; n[id] = (n[id] ?? 0) - 1; if (n[id] <= 0) delete n[id]; return n }) }

  return (
    <div>
      <div style={{ background: DEEP, color: '#fff', borderRadius: 12, padding: '11px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, opacity: .8, textTransform: 'uppercase', letterSpacing: '.1em' }}>Customer wants</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{wantText}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px,1fr))', gap: 7, marginBottom: 10 }}>
        {spec.menu.slice(0, 9).map(p => (
          <button key={p.id} onClick={() => tap(p)} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '9px 4px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 22 }}>{emojiFor(p)}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: INK, textAlign: 'center', lineHeight: 1.1 }}>{p.name}</span>
            <span style={{ fontSize: 10.5, color: AMBER, fontWeight: 700 }}>{money(p.price)}</span>
          </button>
        ))}
      </div>
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
        {Object.keys(ticket).filter(id => ticket[id] > 0).length === 0
          ? <div style={{ fontSize: 12.5, color: MUTED, fontStyle: 'italic', textAlign: 'center', padding: 6 }}>Tap items to build the ticket…</div>
          : Object.keys(ticket).filter(id => ticket[id] > 0).map(id => {
            const p = spec.menu.find(x => x.id === id)!
            return <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
              <span>{ticket[id]}× {p.name}</span>
              <span><span style={{ color: DEEP, fontWeight: 700, marginRight: 10 }}>{money(p.price * ticket[id])}</span><span onClick={() => dec(id)} style={{ color: RED, cursor: 'pointer', fontWeight: 700 }}>✕</span></span>
            </div>
          })}
      </div>
      <button onClick={() => onResult(true, 'That\'s the order — charged.')} disabled={!matches()} style={{ ...btn(matches() ? SAGE : '#dfe6e1', matches() ? '#0c130f' : MUTED), width: '100%', cursor: matches() ? 'pointer' : 'not-allowed' }}>Charge</button>
    </div>
  )
}

function VoidView({ spec, onResult }: { spec: Extract<Scenario, { kind: 'void' }>; onResult: (pass: boolean, line: string) => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  const wantText = spec.ticket.filter((_p, i) => i !== spec.wrongIndex).map(p => p.name).join(', ')
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>The customer ordered: <span style={{ color: DEEP }}>{wantText}</span></div>
      <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}>One extra item was rung up by mistake — tap it to void.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {spec.ticket.map((p, i) => {
          const isPick = picked === i
          const reveal = picked != null
          const isWrong = i === spec.wrongIndex
          const border = reveal && isWrong ? DEEP : reveal && isPick && !isWrong ? RED : LINE
          return (
            <button key={i} disabled={picked != null} onClick={() => { setPicked(i); const ok = i === spec.wrongIndex; setTimeout(() => onResult(ok, ok ? 'Right item voided — ticket fixed.' : `The extra was the ${spec.ticket[spec.wrongIndex].name}.`), 650) }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${border}`, background: reveal && isWrong ? `${SAGE}18` : '#fff', cursor: picked != null ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
              <span>{emojiFor(p)} {p.name}</span><span style={{ color: DEEP, fontWeight: 700 }}>{money(p.price)} {reveal && isWrong ? '· void' : ''}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
