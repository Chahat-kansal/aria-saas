'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'

// INV-STAFF-APP-1 — staff inventory PWA. Phone-native shell, slug routing, per-staff PIN login, live Home
// tool-hub. Matches the locked staff-app HTML (light theme, dashboard tokens, Cormorant + Outfit). Data is
// live (stock value via INV-COST-1, order badge via INV-PAR-1, sold-today from real sales). Tasks/Reports/
// Review/Scan are wired nav targets, fully built in the next two prompts.

const T = {
  sage: '#7FB897', green: '#2D5240', sand: '#C9A37A', amber: '#BA7517', red: '#E24B4A',
  ink: '#111827', paper: '#F4F6F9', line: '#ECEEF3', muted: '#8A93A2',
  greenSoft: '#EAF2EC', sandSoft: '#F6EFE4', amberSoft: '#FBF1E1', redSoft: '#FCEBEA', sageSoft: '#EDF5F0', blueSoft: '#E7F0FA', violetSoft: '#EEEDFE',
}
const DISPLAY = "'Cormorant', Georgia, serif"
const BODY = "'Outfit', system-ui, sans-serif"
const AV_PALETTE = ['#185FA5', '#2D5240', '#C9A37A', '#7c5cbf', '#BA7517']
const money = (n: number) => `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const initials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
const firstName = (name: string) => name.split(' ')[0] ?? name
const greetWord = () => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening' }

interface Staff { id: string; name: string; role: string; color: string | null }
interface Outlet { id: string; name: string; is_default: boolean }
interface Boot { business: { id: string; name: string; slug: string }; outlets: Outlet[]; staff: Staff[] }
interface Home { staff: { id: string; name: string }; value_hero: { at_cost: number; at_retail: number; margin_pct: number | null; products_valued: number; products_total: number; uncosted: number }; mini_stats: { sold_today: number; tasks_open: number; to_review: number }; tile_badges: { order: number; expiring: number } }
interface Task { id: string; task_type: string; product_id: string | null; title: string; detail: string | null; hypothesis: string | null; priority: number; status: string; completed_by: string | null; product_name: string | null; product_sku: string | null; expected: number | null }
interface TasksData { acting: { id: string; name: string }; tasks: Task[]; pills: { accuracy: number | null; streak: number; left_today: number } }
interface Review { id: string; flag_type: string; status: string; product_id: string | null; product_name: string; product_sku: string | null; expected_value: number | null; actual_value: number | null; variance: number | null; staff_name: string; created_at: string }
interface ReviewData { acting: { id: string; name: string }; reviews: Review[]; counts: { open: number; resolved_today: number } }
interface ScanProduct { id: string; name: string; sku: string | null; price: number; on_hand: number; cost: number | null; cost_source: string; units_per_day: number; days_of_cover: number | null }
interface ScanMatch { id: string; name: string; sku: string | null; price: number; on_hand: number }
interface WasteItem { id: string; product_name: string; quantity: number; unit: string; reason: string; recorded_by: string; recorded_at: string; cost_cents: number | null }
interface WasteToday { acting: { id: string; name: string }; reasons: string[]; items: WasteItem[]; total_cost_cents: number; count: number }
interface AdjustRecent { id: string; product_id: string; product_name: string; delta: number; reason: string; adjusted_by: string; created_at: string; value_dollars: number | null }
interface AdjustData { acting: { id: string; name: string }; role: string; can_adjust: boolean; reasons: string[]; recent: AdjustRecent[] }
interface ReportSection { title: string; columns: string[]; rows: Array<Array<string | number>>; empty?: string; total_row?: Array<string | number> }
interface ReportKpis { stock_at_cost: number; stock_at_retail: number; units_sold: number; shrinkage_dollars: number }
interface ReportData { type: string; title: string; period: string; period_label: string; business_name: string; generated_at: string; kpis: ReportKpis | null; sections: ReportSection[]; note: string | null }
interface ReportLibItem { type: string; title: string; blurb: string }
interface ReportsResp { acting: { id: string; name: string }; library: ReportLibItem[]; report: ReportData }

const TILES = [
  { key: 'receive', label: 'Receive', sub: 'log a delivery', bg: 'greenSoft', stroke: '#0F6E56', d: 'M3 7h13v8H3zM16 10h3l2 3v2h-5M5.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z' },
  { key: 'count', label: 'Count', sub: 'stock count', bg: 'blueSoft', stroke: '#185FA5', d: 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9' },
  { key: 'waste', label: 'Waste', sub: 'log spoilage', bg: 'redSoft', stroke: '#A32D2D', d: 'M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13' },
  { key: 'transfer', label: 'Transfer', sub: 'between outlets', bg: 'amberSoft', stroke: '#854F0B', d: 'M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4' },
  { key: 'adjust', label: 'Adjust', sub: 'fix a count', bg: 'violetSoft', stroke: '#534AB7', d: 'M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z' },
  { key: 'order', label: 'Order', sub: 'reorder needs', bg: 'greenSoft', stroke: '#0F6E56', d: 'M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z', badge: 'order' as const },
  { key: 'expiring', label: 'Expiring', sub: 'expiry alerts', bg: 'amberSoft', stroke: '#854F0B', d: 'M12 7v5l3 2', circle: true, badge: 'expiring' as const },
  { key: 'scan', label: 'Scan', sub: 'look up item', bg: 'paper', stroke: '#5F5E5A', d: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10' },
  { key: 'tickets', label: 'Price tickets', sub: 'scan to print', bg: 'violetSoft', stroke: '#534AB7', d: 'M3 8h18v9H3zM7 8v9M7 12h.5M11 12h6M11 15h4' },
]

export default function InventoryStaffApp() {
  const slug = (useParams()?.slug as string) ?? ''
  const [boot, setBoot] = useState<Boot | null>(null)
  const [bootErr, setBootErr] = useState(false)
  const [stage, setStage] = useState<'loading' | 'pick' | 'pin' | 'app'>('loading')
  const [selStaff, setSelStaff] = useState<Staff | null>(null)
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<{ id: string; name: string } | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)
  const [home, setHome] = useState<Home | null>(null)
  const [homeState, setHomeState] = useState<'loading' | 'ok' | 'error' | 'empty'>('loading')
  const [tab, setTab] = useState<'home' | 'tasks' | 'reports' | 'review' | 'scan' | 'waste' | 'adjust' | 'tickets'>('home')
  const pinSubmitting = useRef(false)
  // Tasks screen state
  const [tasksData, setTasksData] = useState<TasksData | null>(null)
  const [tasksState, setTasksState] = useState<'loading' | 'ok' | 'error' | 'empty'>('loading')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [countVal, setCountVal] = useState(0)
  const [countMsg, setCountMsg] = useState<{ variance: number; review: boolean; time: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Review screen state
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [reviewState, setReviewState] = useState<'loading' | 'ok' | 'error' | 'empty'>('loading')
  const [actingReview, setActingReview] = useState<string | null>(null)
  // Scan screen state
  const [scanInput, setScanInput] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [scanResult, setScanResult] = useState<ScanProduct | null>(null)
  const [scanMatches, setScanMatches] = useState<ScanMatch[]>([])
  const [scanState, setScanState] = useState<'idle' | 'searching' | 'found' | 'notfound' | 'error'>('idle')
  const [scanNote, setScanNote] = useState('')
  const [scanCount, setScanCount] = useState<number | null>(null)
  const [scanCountMsg, setScanCountMsg] = useState<{ variance: number; review: boolean } | null>(null)
  const [scanCounting, setScanCounting] = useState(false)
  // Waste screen state
  const [wasteProduct, setWasteProduct] = useState<{ id: string; name: string; unit_cost: number | null; on_hand: number } | null>(null)
  const [wasteSearch, setWasteSearch] = useState('')
  const [wasteMatches, setWasteMatches] = useState<ScanMatch[]>([])
  const [wasteSearching, setWasteSearching] = useState(false)
  const [wasteQty, setWasteQty] = useState(1)
  const [wasteReason, setWasteReason] = useState('spoilage')
  const [wasteOther, setWasteOther] = useState('')
  const [wasteMsg, setWasteMsg] = useState<{ cost_cents: number | null; spike: boolean } | null>(null)
  const [wasteSubmitting, setWasteSubmitting] = useState(false)
  const [wasteToday, setWasteToday] = useState<WasteToday | null>(null)
  const [wasteTodayState, setWasteTodayState] = useState<'loading' | 'ok' | 'error' | 'empty'>('loading')
  // Adjust screen state
  const [adjustProduct, setAdjustProduct] = useState<{ id: string; name: string; unit_cost: number | null; on_hand: number } | null>(null)
  const [adjustSearch, setAdjustSearch] = useState('')
  const [adjustMatches, setAdjustMatches] = useState<ScanMatch[]>([])
  const [adjustSearching, setAdjustSearching] = useState(false)
  const [adjustMode, setAdjustMode] = useState<'set' | 'add' | 'remove'>('set')
  const [adjustValue, setAdjustValue] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustOther, setAdjustOther] = useState('')
  const [adjustMsg, setAdjustMsg] = useState<{ delta: number; new_on_hand: number | null } | null>(null)
  const [adjustErr, setAdjustErr] = useState('')
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)
  const [adjustData, setAdjustData] = useState<AdjustData | null>(null)
  const [adjustState, setAdjustState] = useState<'loading' | 'ok' | 'error'>('loading')
  // Reports screen state
  const [reportsResp, setReportsResp] = useState<ReportsResp | null>(null)
  const [reportsState, setReportsState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly'>('daily')
  // Price-tickets batch state
  const [ticketBatch, setTicketBatch] = useState<Array<{ id: string; name: string; price: number; was: number | null; promo: string | null; qty: number }>>([])
  const [ticketSearch, setTicketSearch] = useState('')
  const [ticketMatches, setTicketMatches] = useState<ScanMatch[]>([])
  const [ticketSearching, setTicketSearching] = useState(false)
  const [ticketName, setTicketName] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketMsg, setTicketMsg] = useState('')

  // PWA: register SW + inject per-slug manifest link + fonts.
  useEffect(() => {
    if (!slug) return
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/inventory-sw.js', { scope: '/inventory/' }).catch(() => {})
    const add = (rel: string, href: string, extra?: Record<string, string>) => {
      const l = document.createElement('link'); l.rel = rel; l.href = href; if (extra) Object.entries(extra).forEach(([k, v]) => l.setAttribute(k, v)); document.head.appendChild(l); return l
    }
    const m = add('manifest', `/api/inventory/app/${slug}/manifest`)
    const f1 = add('preconnect', 'https://fonts.googleapis.com')
    const f2 = add('stylesheet', 'https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@1,600&family=Outfit:wght@300;400;500;600;700&display=swap')
    return () => { [m, f1, f2].forEach(el => el.remove()) }
  }, [slug])

  const loadHome = useCallback(async (oid: string | null) => {
    setHomeState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/home${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setHomeState('error'); return }
      const d = await r.json() as Home
      setHome(d); setActing(d.staff)
      setHomeState(d.value_hero.products_total === 0 ? 'empty' : 'ok')
      setStage('app')
    } catch { setHomeState('error') }
  }, [slug])

  const loadTasks = useCallback(async (oid: string | null) => {
    setTasksState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/tasks${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setTasksState('error'); return }
      const d = await r.json() as TasksData
      setTasksData(d)
      setTasksState(d.tasks.length === 0 ? 'empty' : 'ok')
      // auto-activate the first open count/cycle_count task
      const first = d.tasks.find(t => t.status === 'open' && (t.task_type === 'count' || t.task_type === 'cycle_count') && t.product_id)
      setActiveId(first?.id ?? null)
      if (first) setCountVal(first.expected ?? 0)
      setCountMsg(null)
    } catch { setTasksState('error') }
  }, [slug])

  useEffect(() => { if (stage === 'app' && tab === 'tasks' && !tasksData) loadTasks(outletId) }, [stage, tab, tasksData, outletId, loadTasks])

  async function submitCount(task: Task) {
    if (!task.product_id) return
    setSubmitting(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/count`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: task.product_id, counted: countVal, task_id: task.id, outlet_id: outletId, product_name: task.product_name }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) {
        setCountMsg({ variance: d.variance, review: d.review_raised, time: new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase() })
        setTasksData(td => td ? { ...td, tasks: td.tasks.map(t => t.id === task.id ? { ...t, status: 'done', completed_by: acting?.id ?? null } : t) } : td)
      }
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  // ── Review queue ──
  const loadReview = useCallback(async (oid: string | null) => {
    setReviewState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/review${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setReviewState('error'); return }
      const d = await r.json() as ReviewData
      setReviewData(d)
      setReviewState(d.reviews.length === 0 ? 'empty' : 'ok')
    } catch { setReviewState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'review' && !reviewData) loadReview(outletId) }, [stage, tab, reviewData, outletId, loadReview])

  async function reviewAction(id: string, action: 'accept' | 'investigate' | 'dismiss') {
    setActingReview(id)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_id: id, action }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { await loadReview(outletId); loadHome(outletId) }
    } catch { /* ignore */ }
    setActingReview(null)
  }

  // ── Scan / lookup ──
  async function runScan(term: string, kind: 'barcode' | 'q') {
    if (!term.trim()) return
    setScanState('searching'); setScanNote(''); setScanResult(null); setScanMatches([]); setScanCount(null); setScanCountMsg(null)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?${kind}=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setScanState('error'); return }
      const d = await r.json()
      if (d.mode === 'barcode') {
        if (d.found) { setScanResult(d.product); setScanState('found') }
        else { setScanState('notfound'); setScanNote(`No barcode match for "${d.barcode}". Search by name or SKU instead.`) }
      } else if (d.mode === 'search') {
        if ((d.matches ?? []).length) { setScanMatches(d.matches); setScanState('found') }
        else { setScanState('notfound'); setScanNote(`Nothing matches "${d.query}".`) }
      }
    } catch { setScanState('error') }
  }
  async function pickMatch(id: string) {
    setScanState('searching'); setScanMatches([])
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?product_id=${id}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.found) { setScanResult(d.product); setScanState('found') } else { setScanState('notfound'); setScanNote('Could not load that item.') }
    } catch { setScanState('error') }
  }
  async function submitScanCount(product: ScanProduct) {
    if (scanCount == null) return
    setScanCounting(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/count`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: product.id, counted: scanCount, outlet_id: outletId, product_name: product.name }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setScanCountMsg({ variance: d.variance, review: d.review_raised }); loadHome(outletId) }
    } catch { /* ignore */ }
    setScanCounting(false)
  }

  // ── Waste ──
  const loadWasteToday = useCallback(async (oid: string | null) => {
    setWasteTodayState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/waste${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setWasteTodayState('error'); return }
      const d = await r.json() as WasteToday
      setWasteToday(d)
      setWasteTodayState(d.items.length === 0 ? 'empty' : 'ok')
    } catch { setWasteTodayState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'waste' && !wasteToday) loadWasteToday(outletId) }, [stage, tab, wasteToday, outletId, loadWasteToday])

  async function wasteSearchRun(term: string) {
    if (!term.trim()) return
    setWasteSearching(true); setWasteMatches([])
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?q=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'search') setWasteMatches(d.matches ?? [])
    } catch { /* ignore */ }
    setWasteSearching(false)
  }
  async function pickWasteProduct(id: string) {
    setWasteSearching(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?product_id=${id}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.found) { setWasteProduct({ id: d.product.id, name: d.product.name, unit_cost: d.product.cost, on_hand: d.product.on_hand }); setWasteQty(1); setWasteReason('spoilage'); setWasteOther(''); setWasteMsg(null); setWasteMatches([]); setWasteSearch('') }
    } catch { /* ignore */ }
    setWasteSearching(false)
  }
  async function submitWaste() {
    if (!wasteProduct) return
    setWasteSubmitting(true)
    try {
      const reason = wasteReason === 'other' ? (wasteOther.trim() || 'other') : wasteReason
      const r = await fetch(`/api/inventory/app/${slug}/waste`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: wasteProduct.id, product_name: wasteProduct.name, quantity: wasteQty, reason, outlet_id: outletId }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setWasteMsg({ cost_cents: d.cost_cents, spike: d.spike }); loadWasteToday(outletId); loadHome(outletId) }
    } catch { /* ignore */ }
    setWasteSubmitting(false)
  }

  // ── Adjust ──
  const loadAdjust = useCallback(async (oid: string | null) => {
    setAdjustState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/adjust${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setAdjustState('error'); return }
      const d = await r.json() as AdjustData
      setAdjustData(d); setAdjustState('ok')
    } catch { setAdjustState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'adjust' && !adjustData) loadAdjust(outletId) }, [stage, tab, adjustData, outletId, loadAdjust])

  async function adjustSearchRun(term: string) {
    if (!term.trim()) return
    setAdjustSearching(true); setAdjustMatches([])
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?q=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'search') setAdjustMatches(d.matches ?? [])
    } catch { /* ignore */ }
    setAdjustSearching(false)
  }
  async function pickAdjustProduct(id: string) {
    setAdjustSearching(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?product_id=${id}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.found) { setAdjustProduct({ id: d.product.id, name: d.product.name, unit_cost: d.product.cost, on_hand: d.product.on_hand }); setAdjustMode('set'); setAdjustValue(d.product.on_hand); setAdjustReason(''); setAdjustOther(''); setAdjustMsg(null); setAdjustErr(''); setAdjustMatches([]); setAdjustSearch('') }
    } catch { /* ignore */ }
    setAdjustSearching(false)
  }
  async function submitAdjust() {
    if (!adjustProduct) return
    if (!adjustReason) { setAdjustErr('Pick a reason — corrections need one.'); return }
    setAdjustSubmitting(true); setAdjustErr('')
    try {
      const reason = adjustReason === 'other' ? (adjustOther.trim() || 'other') : adjustReason
      const r = await fetch(`/api/inventory/app/${slug}/adjust`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: adjustProduct.id, product_name: adjustProduct.name, mode: adjustMode, value: adjustValue, reason, outlet_id: outletId }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setAdjustMsg({ delta: d.delta, new_on_hand: d.new_on_hand }); loadAdjust(outletId); loadHome(outletId) }
      else setAdjustErr(d.message ?? 'Could not apply the correction.')
    } catch { setAdjustErr('Something went wrong.') }
    setAdjustSubmitting(false)
  }

  // ── Price tickets (scan-to-batch) ──
  async function ticketSearchRun(term: string) {
    if (!term.trim()) return
    setTicketSearching(true); setTicketMatches([])
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?q=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'search') setTicketMatches(d.matches ?? [])
    } catch { /* ignore */ }
    setTicketSearching(false)
  }
  async function ticketAdd(id: string) {
    setTicketSearching(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?product_id=${id}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.found) {
        const p = d.product
        setTicketBatch(b => b.some(x => x.id === p.id) ? b.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x) : [...b, { id: p.id, name: p.name, price: p.ticket_price ?? p.price, was: p.was_price ?? null, promo: p.promo_label ?? null, qty: 1 }])
        setTicketMsg(''); setTicketMatches([]); setTicketSearch('')
      }
    } catch { /* ignore */ }
    setTicketSearching(false)
  }
  const ticketQty = (id: string, delta: number) => setTicketBatch(b => b.map(x => x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x))
  const ticketRemove = (id: string) => setTicketBatch(b => b.filter(x => x.id !== id))
  async function ticketSaveBatch() {
    if (!ticketName.trim() || ticketBatch.length === 0) return
    setTicketSaving(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/ticket-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ticketName.trim(), outlet_id: outletId, items: ticketBatch.map(x => ({ product_id: x.id, qty: x.qty })) }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setTicketMsg(`✓ Saved "${ticketName.trim()}" — ${d.item_count} item${d.item_count === 1 ? '' : 's'} queued. Print it from the dashboard Price Tickets page.`); setTicketBatch([]); setTicketName('') }
      else setTicketMsg(d.error ? `Couldn't save: ${d.error}` : 'Could not save the batch.')
    } catch { setTicketMsg('Something went wrong.') }
    setTicketSaving(false)
  }

  // ── Reports ──
  const loadReports = useCallback(async (period: 'daily' | 'weekly', oid: string | null) => {
    setReportsState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/report?type=sold_vs_stock&period=${period}${oid ? `&outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setReportsState('error'); return }
      const d = await r.json() as ReportsResp
      setReportsResp(d)
      const hasData = (d.report.kpis?.units_sold ?? 0) > 0 || (d.report.kpis?.stock_at_cost ?? 0) > 0 || d.report.sections.some(s => s.rows.length > 0)
      setReportsState(hasData ? 'ok' : 'empty')
    } catch { setReportsState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'reports') loadReports(reportPeriod, outletId) }, [stage, tab, reportPeriod, outletId, loadReports])
  function exportReport(type: string) {
    window.open(`/api/inventory/app/${slug}/report?type=${type}&period=${reportPeriod}${outletId ? `&outlet_id=${outletId}` : ''}&format=pdf`, '_blank')
  }

  // Bootstrap + resume session.
  useEffect(() => {
    if (!slug) return
    ;(async () => {
      try {
        const r = await fetch(`/api/inventory/app/${slug}`)
        if (!r.ok) { setBootErr(true); setStage('pick'); return }
        const b = await r.json() as Boot
        setBoot(b)
        const oid = b.outlets.find(o => o.is_default)?.id ?? b.outlets[0]?.id ?? null
        setOutletId(oid)
        // resume if a session cookie is still valid
        const h = await fetch(`/api/inventory/app/${slug}/home${oid ? `?outlet_id=${oid}` : ''}`)
        if (h.ok) { const d = await h.json() as Home; setHome(d); setActing(d.staff); setHomeState(d.value_hero.products_total === 0 ? 'empty' : 'ok'); setStage('app') }
        else setStage('pick')
      } catch { setBootErr(true); setStage('pick') }
    })()
  }, [slug])

  async function submitPin(p: string) {
    if (!selStaff || pinSubmitting.current) return
    pinSubmitting.current = true; setBusy(true); setPinErr('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: selStaff.id, pin: p }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setActing({ id: d.staff.id, name: d.staff.name }); setPin(''); await loadHome(outletId); setStage('app') }
      else { setPinErr('Incorrect PIN'); setPin(''); }
    } catch { setPinErr('Something went wrong') }
    setBusy(false); pinSubmitting.current = false
  }
  function pushDigit(n: string) {
    if (pin.length >= 4) return
    const next = pin + n; setPin(next); setPinErr('')
    if (next.length === 4) submitPin(next)
  }
  async function logout() {
    await fetch(`/api/inventory/app/${slug}/logout`, { method: 'POST' }).catch(() => {})
    setActing(null); setHome(null); setSelStaff(null); setPin(''); setStage('pick'); setTab('home')
  }

  const avColor = (s: Staff, i: number) => (s.color && s.color !== '#6366f1') ? s.color : AV_PALETTE[i % AV_PALETTE.length]

  // ── shells ──
  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100dvh', background: '#E7ECF1', display: 'flex', justifyContent: 'center', fontFamily: BODY, color: T.ink }}>
      <div style={{ width: '100%', maxWidth: 440, background: T.paper, minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 0 60px rgba(20,30,50,.12)' }}>{children}</div>
    </div>
  )
  const statusbar = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 22px 4px', fontSize: 12, fontWeight: 600 }}>
      <span>{new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
      <span style={{ color: T.muted }}>{boot?.business.name ?? 'Sip'} · PWA</span>
    </div>
  )
  const header = (mini?: boolean, title?: string, subtitle?: string) => (
    <div style={{ padding: mini ? '6px 20px 14px' : '6px 20px 16px', background: `linear-gradient(135deg, ${T.green}, #244236)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(127,184,151,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontStyle: 'italic', color: '#fff', fontSize: 20, fontWeight: 600 }}>{(boot?.business.name ?? 's')[0]?.toLowerCase()}</div>
        <div style={{ flex: 1, color: '#fff' }}>
          <b style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{boot?.business.name ?? 'Inventory'}</b>
          <span style={{ fontSize: 11.5, color: '#A9C3B4' }}>{subtitle ?? `ariaos.site/inventory/${slug}`}</span>
        </div>
        {acting && <div onClick={logout} title="Switch staff" style={{ width: 34, height: 34, borderRadius: '50%', background: T.sand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, border: '2px solid rgba(255,255,255,.3)', cursor: 'pointer' }}>{initials(acting.name)}</div>}
      </div>
      {!mini && acting && (
        <div style={{ marginTop: 15, color: '#fff' }}>
          <h1 style={{ fontSize: 21, fontWeight: 500 }}><span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 25, color: T.sage }}>{greetWord()},</span> {firstName(acting.name)}</h1>
          <p style={{ fontSize: 12, color: '#A9C3B4', marginTop: 2 }}>Everything inventory — in one app</p>
        </div>
      )}
      {mini && title && <div style={{ color: '#fff', marginTop: 14 }}><h1 style={{ fontSize: 20, fontWeight: 500 }}><span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 24, color: T.sage }}>{title}</span></h1><p style={{ fontSize: 11.5, color: '#A9C3B4', marginTop: 2 }}>{subtitle}</p></div>}
    </div>
  )
  const tabbar = (
    <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${T.line}`, display: 'flex', padding: '11px 0 max(22px, env(safe-area-inset-bottom))', zIndex: 20 }}>
      {([['home', 'Home', 'M3 11l9-8 9 8M5 10v10h14V10'], ['tasks', 'Tasks', 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11']] as const).map(([k, label, d]) => (
        <button key={k} onClick={() => setTab(k)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: tab === k ? T.green : T.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: BODY }}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d={d} /></svg><span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
        </button>
      ))}
      <button onClick={() => setTab('scan')} style={{ flex: 1, display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: T.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -22, boxShadow: '0 6px 16px rgba(45,82,64,.35)', border: '3px solid #fff' }}>
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" /></svg>
        </div>
      </button>
      {([['reports', 'Reports', 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'], ['review', 'Review', 'M12 2l9 4-9 4-9-4 9-4zM3 11l9 4 9-4M3 16l9 4 9-4']] as const).map(([k, label, d]) => (
        <button key={k} onClick={() => setTab(k)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: tab === k ? T.green : T.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: BODY }}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d={d} /></svg><span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
        </button>
      ))}
    </div>
  )

  // ── LOGIN: staff picker ──
  if (stage === 'loading') return shell(<>{statusbar}{header()}<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 13 }}>Loading…</div></>)

  if (stage === 'pick') return shell(
    <>
      {statusbar}{header()}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {bootErr && <p style={{ fontSize: 13, color: T.red, marginBottom: 12 }}>Couldn&apos;t load this store.</p>}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '4px 2px 14px' }}>Who&apos;s working?</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {(boot?.staff ?? []).map((s, i) => (
            <button key={s.id} onClick={() => { setSelStaff(s); setPin(''); setPinErr(''); setStage('pin') }}
              style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, cursor: 'pointer', fontFamily: BODY, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: avColor(s, i), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>{initials(s.name)}</div>
              <div style={{ textAlign: 'center' }}><b style={{ fontSize: 13.5, fontWeight: 600, display: 'block' }}>{s.name}</b><span style={{ fontSize: 11, color: T.muted, textTransform: 'capitalize' }}>{s.role}</span></div>
            </button>
          ))}
          {(!boot || boot.staff.length === 0) && <p style={{ gridColumn: '1/-1', fontSize: 13, color: T.muted }}>No staff set up yet.</p>}
        </div>
      </div>
    </>
  )

  // ── LOGIN: PIN entry ──
  if (stage === 'pin' && selStaff) return shell(
    <>
      {statusbar}{header()}
      <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button onClick={() => { setStage('pick'); setPin('') }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer', fontFamily: BODY }}>← Back</button>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: avColor(selStaff, 0), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, marginTop: 10 }}>{initials(selStaff.name)}</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 12 }}>Hi {firstName(selStaff.name)}</h2>
        <p style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>Enter your 4-digit PIN</p>
        <div style={{ display: 'flex', gap: 12, margin: '20px 0' }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < pin.length ? T.green : 'transparent', border: `2px solid ${i < pin.length ? T.green : T.line}`, transition: 'all 120ms' }} />)}
        </div>
        {pinErr && <p style={{ fontSize: 12.5, color: T.red, marginBottom: 10 }}>{pinErr}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 14 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => k === '' ? <div key={i} /> : (
            <button key={i} disabled={busy} onClick={() => k === 'del' ? setPin(p => p.slice(0, -1)) : pushDigit(k)}
              style={{ height: 64, borderRadius: 16, border: `1px solid ${T.line}`, background: '#fff', fontFamily: DISPLAY, fontStyle: 'italic', fontSize: k === 'del' ? 16 : 28, fontWeight: 600, color: T.ink, cursor: 'pointer' }}>{k === 'del' ? '⌫' : k}</button>
          ))}
        </div>
      </div>
    </>
  )

  // ── APP (logged in) ──
  const body = (children: React.ReactNode) => <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>{children}</div>
  const stub = (title: string, note: string) => shell(<>{statusbar}{header(true, title, note)}{body(
    <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>🧰</div><p style={{ fontSize: 16, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 6 }}>Coming in the next update</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>This screen is being built. Your acting session (<b>{acting?.name}</b>) carries through so every action is attributed to you.</p></div>
  )}{tabbar}</>)

  if (tab === 'tasks') {
    const pills = tasksData?.pills
    const open = (tasksData?.tasks ?? []).filter(t => t.status === 'open')
    const done = (tasksData?.tasks ?? []).filter(t => t.status === 'done')
    const active = (tasksData?.tasks ?? []).find(t => t.id === activeId && t.status === 'open')
    const variance = active ? countVal - (active.expected ?? 0) : 0
    const tasksHeader = (
      <div style={{ padding: '6px 20px 16px', background: `linear-gradient(135deg, ${T.green}, #244236)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(127,184,151,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontStyle: 'italic', color: '#fff', fontSize: 20, fontWeight: 600 }}>{(boot?.business.name ?? 's')[0]?.toLowerCase()}</div>
          <div style={{ flex: 1, color: '#fff' }}><b style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{boot?.business.name}</b><span style={{ fontSize: 11.5, color: '#A9C3B4' }}>ariaos.site/inventory/{slug}</span></div>
          {acting && <div onClick={logout} style={{ width: 34, height: 34, borderRadius: '50%', background: T.sand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, border: '2px solid rgba(255,255,255,.3)', cursor: 'pointer' }}>{initials(acting.name)}</div>}
        </div>
        <div style={{ marginTop: 15, color: '#fff' }}>
          <h1 style={{ fontSize: 21, fontWeight: 500 }}><span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 25, color: T.sage }}>Today,</span> {firstName(acting?.name ?? '')}</h1>
          <p style={{ fontSize: 12, color: '#A9C3B4', marginTop: 2 }}>{open.length} task{open.length === 1 ? '' : 's'} · Aria built your list from real sales</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {[[pills?.accuracy != null ? `${pills.accuracy}%` : 'new', 'count accuracy'], [String(pills?.streak ?? 0), 'day streak'], [String(pills?.left_today ?? open.length), 'left today']].map(([v, k]) => (
            <div key={k} style={{ flex: 1, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '9px 11px', color: '#fff' }}>
              <b style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 20, fontWeight: 600, display: 'block', lineHeight: 1 }}>{v}</b><span style={{ fontSize: 10, color: '#A9C3B4' }}>{k}</span>
            </div>
          ))}
        </div>
      </div>
    )
    const taskCard = (children: React.ReactNode, extra?: React.CSSProperties) => <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 14, marginBottom: 11, boxShadow: '0 1px 3px rgba(20,30,50,.03)', ...extra }}>{children}</div>
    const checkRow = (t: Task, isDone: boolean) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div onClick={() => { if (!isDone && (t.task_type === 'count' || t.task_type === 'cycle_count') && t.product_id) { setActiveId(t.id); setCountVal(t.expected ?? 0); setCountMsg(null) } }}
          style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${isDone ? T.sage : T.sage}`, background: isDone ? T.sage : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          {isDone && <svg width="14" height="14" fill="none" stroke="#fff" strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>}
        </div>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 14, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? T.muted : T.ink }}>{t.title}</b>
          {t.detail && <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{t.detail}</span>}
        </div>
      </div>
    )
    return shell(
      <>
        {statusbar}{tasksHeader}
        {body(
          tasksState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(4)].map((_, i) => <div key={i} style={{ height: i === 1 ? 220 : 56, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}` }} />)}</div>
          ) : tasksState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load your tasks</p><button onClick={() => loadTasks(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : tasksState === 'empty' ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>✓</div><p style={{ fontSize: 18, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 6 }}>No tasks today — you&apos;re clear</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>Aria didn&apos;t find anything that needs counting right now. New tasks appear as stock runs low or items near expiry.</p></div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 2px 10px' }}>
                <b style={{ fontSize: 14, fontWeight: 600 }}>Today&apos;s tasks</b>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: T.amber, background: T.amberSoft, padding: '3px 8px', borderRadius: 7 }}>🇯🇵 Tanpin Kanri</span>
              </div>
              {done.map(t => <div key={t.id}>{taskCard(checkRow(t, true))}</div>)}

              {/* ACTIVE COUNT CARD */}
              {active && (
                <>
                  <div style={{ margin: '4px 2px 10px', fontSize: 14, fontWeight: 600 }}>{active.title}</div>
                  {taskCard(
                    <>
                      {active.hypothesis && <div style={{ fontSize: 11.5, color: '#5A6472', background: T.sageSoft, borderRadius: 9, padding: '8px 11px', lineHeight: 1.45 }}><b style={{ color: T.green }}>Aria&apos;s hypothesis:</b> {active.hypothesis}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.ink, color: '#fff', borderRadius: 12, padding: '12px 14px', margin: '13px 0' }}>
                        <svg width="20" height="20" fill="none" stroke={T.sage} strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" /></svg>
                        <b style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{active.product_name}</b><span style={{ fontSize: 11, color: '#9aa3b2' }}>{active.product_sku ? `SKU ${active.product_sku}` : 'scanned'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '6px 0 14px' }}>
                        <button onClick={() => setCountVal(v => Math.max(0, v - 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 48, fontWeight: 600, minWidth: 70, textAlign: 'center', lineHeight: 1 }}>{countVal}</div>
                        <button onClick={() => setCountVal(v => v + 1)} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                      </div>
                      <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
                        {[['Aria expects', active.expected ?? 0, T.paper, T.ink], ['You counted', countVal, T.greenSoft, T.green], ['Variance', `${variance > 0 ? '+' : ''}${variance}`, variance === 0 ? T.greenSoft : T.redSoft, variance === 0 ? T.green : T.red]].map(([l, v, bg, col], i) => (
                          <div key={i} style={{ flex: 1, borderRadius: 12, padding: 11, textAlign: 'center', background: bg as string }}>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: T.muted }}>{l}</div>
                            <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 24, fontWeight: 600, marginTop: 3, color: col as string }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {variance !== 0 && !countMsg && (
                        <div style={{ fontSize: 11.5, color: T.red, background: T.redSoft, borderRadius: 10, padding: '10px 12px', lineHeight: 1.45, marginBottom: 13, display: 'flex', gap: 8 }}>
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4m0 4h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
                          <span>{Math.abs(variance)} units {variance < 0 ? 'short of' : 'over'} expected. This won&apos;t change stock — it goes to the owner&apos;s review queue to investigate (over-pour? unlogged waste?).</span>
                        </div>
                      )}
                      {!countMsg ? (
                        <button onClick={() => submitCount(active)} disabled={submitting} style={{ width: '100%', background: T.green, color: '#fff', border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Submitting…' : 'Submit count'}</button>
                      ) : (
                        <div style={{ width: '100%', background: T.sage, color: '#fff', borderRadius: 13, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{countMsg.review ? '✓ Sent to owner review' : '✓ Count matches — recorded'}</div>
                      )}
                      <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>Logged as <b style={{ color: T.green }}>{acting?.name}</b> · {countMsg?.time ?? new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()} · attribution is how Aria spots who counts accurately</div>
                    </>,
                    { border: `1.5px solid ${T.green}`, boxShadow: '0 6px 20px rgba(45,82,64,.1)' }
                  )}
                </>
              )}

              {/* UP NEXT */}
              {open.filter(t => t.id !== activeId).length > 0 && (
                <>
                  <div style={{ margin: '4px 2px 10px', fontSize: 14, fontWeight: 600 }}>Up next</div>
                  {open.filter(t => t.id !== activeId).map(t => <div key={t.id}>{taskCard(checkRow(t, false))}</div>)}
                </>
              )}
            </>
          )
        )}
        {tabbar}
      </>
    )
  }
  // ── REPORTS ──
  if (tab === 'reports') {
    const rep = reportsResp?.report
    const k = rep?.kpis
    const lib = reportsResp?.library ?? []
    const soldSection = rep?.sections.find(s => s.title.toLowerCase().startsWith('sold'))
    return shell(
      <>
        {statusbar}{header(true, 'Reports', 'Sold vs in-stock · PDF + email')}
        {body(
          <>
            <div style={{ display: 'flex', gap: 6, background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: 4, marginBottom: 14 }}>
              {(['daily', 'weekly'] as const).map(p => (
                <button key={p} onClick={() => setReportPeriod(p)} style={{ flex: 1, padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: BODY, fontSize: 13, fontWeight: 600, background: reportPeriod === p ? T.green : 'transparent', color: reportPeriod === p ? '#fff' : T.muted }}>{p === 'daily' ? 'Daily' : 'Weekly'}</button>
              ))}
            </div>

            {reportsState === 'loading' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: i === 0 ? 80 : 130, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}` }} />)}</div>
            ) : reportsState === 'error' ? (
              <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load reports</p><button onClick={() => loadReports(reportPeriod, outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
            ) : (
              <>
                {k && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
                    {([['Stock at cost', money(k.stock_at_cost), T.green], ['At retail', money(k.stock_at_retail), T.ink], ['Sold', String(k.units_sold), T.ink], ['Shrinkage', money(k.shrinkage_dollars), k.shrinkage_dollars > 0 ? T.red : T.ink]] as const).map(([l, v, col]) => (
                      <div key={l} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>{l}</div>
                        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 24, fontWeight: 600, color: col, marginTop: 3 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {reportsState === 'empty' && (
                  <div style={{ padding: 24, textAlign: 'center', background: '#fff', borderRadius: 14, border: `1px solid ${T.line}`, marginBottom: 14 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
                    <p style={{ fontSize: 14, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 3 }}>No data for this period yet</p>
                    <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>Once you make sales or log counts/waste, the figures appear here. You can still export any report below.</p>
                  </div>
                )}

                {soldSection && soldSection.rows.length > 0 && (
                  <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 14, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <b style={{ fontSize: 14, fontWeight: 600 }}>Sold vs on-hand</b>
                      <span style={{ fontSize: 11, color: T.muted }}>{rep?.period_label}</span>
                    </div>
                    <div style={{ display: 'flex', fontSize: 10, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '.3px', padding: '0 2px 6px' }}>
                      <span style={{ flex: 1 }}>Product</span><span style={{ width: 60, textAlign: 'right' }}>Sold</span><span style={{ width: 64, textAlign: 'right' }}>On hand</span>
                    </div>
                    {soldSection.rows.slice(0, 12).map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 2px', borderTop: `1px solid ${T.line}`, fontSize: 13 }}>
                        <span style={{ flex: 1, fontWeight: 600 }}>{r[0]}</span>
                        <span style={{ width: 60, textAlign: 'right', color: T.green, fontWeight: 600 }}>{r[1]}</span>
                        <span style={{ width: 64, textAlign: 'right' }}>{r[2]}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ margin: '4px 2px 10px', fontSize: 14, fontWeight: 600 }}>Report library</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {lib.map(item => (
                    <button key={item.type} onClick={() => exportReport(item.type)} style={{ textAlign: 'left', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '12px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{item.title}</b><div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4, marginTop: 1 }}>{item.blurb}</div></div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.green, background: T.greenSoft, borderRadius: 8, padding: '6px 10px', whiteSpace: 'nowrap' }}>PDF ↓</span>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>Tap a report to export a branded PDF. The owner can schedule any of these to auto-email daily or weekly from the dashboard.</div>
              </>
            )}
          </>
        )}
        {tabbar}
      </>
    )
  }

  // ── OWNER REVIEW QUEUE ──
  if (tab === 'review') {
    const reviews = reviewData?.reviews ?? []
    const counts = reviewData?.counts
    const flagMeta = (f: string) => ({
      count_variance: { label: 'Count variance', bg: T.redSoft, col: T.red },
      short_delivery: { label: 'Short delivery', bg: T.amberSoft, col: T.amber },
      waste_spike: { label: 'Waste spike', bg: T.redSoft, col: T.red },
      velocity_drop: { label: 'Velocity drop', bg: T.blueSoft, col: '#185FA5' },
    } as Record<string, { label: string; bg: string; col: string }>)[f] ?? { label: f.replace(/_/g, ' '), bg: T.paper, col: T.muted }
    const timeAgo = (iso: string) => {
      const m = (Date.now() - new Date(iso).getTime()) / 60000
      if (m < 60) return `${Math.max(1, Math.round(m))}m ago`
      if (m < 1440) return `${Math.round(m / 60)}h ago`
      return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    }
    const cell = (l: string, v: React.ReactNode, bg: string, col: string, i: number) => (
      <div key={i} style={{ flex: 1, borderRadius: 12, padding: 11, textAlign: 'center', background: bg }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: T.muted }}>{l}</div>
        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 24, fontWeight: 600, marginTop: 3, color: col }}>{v}</div>
      </div>
    )
    return shell(
      <>
        {statusbar}{header(true, 'Review', counts ? `${counts.open} open · ${counts.resolved_today} resolved today` : 'Owner review queue')}
        {body(
          reviewState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 170, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}` }} />)}</div>
          ) : reviewState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load the review queue</p><button onClick={() => loadReview(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : reviewState === 'empty' ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>✓</div><p style={{ fontSize: 18, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 6 }}>All clear — nothing to review</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>When a staff count doesn&apos;t match the book stock, it lands here for you to accept or investigate. Nothing changes your stock until you do.</p></div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: '#5A6472', background: T.sageSoft, borderRadius: 10, padding: '10px 12px', lineHeight: 1.45, marginBottom: 13, display: 'flex', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke={T.green} strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <span><b style={{ color: T.green }}>Nothing auto-corrects.</b> A count never moves stock. It only changes when <b>you</b> accept a variance here — logged against your name.</span>
              </div>
              {reviews.map(rv => {
                const fm = flagMeta(rv.flag_type)
                const v = rv.variance ?? 0
                const busy = actingReview === rv.id
                return (
                  <div key={rv.id} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 14, marginBottom: 11, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: fm.col, background: fm.bg, padding: '3px 9px', borderRadius: 7, textTransform: 'uppercase', letterSpacing: '.3px' }}>{fm.label}</span>
                      {rv.status === 'investigating' && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.amber, background: T.amberSoft, padding: '3px 8px', borderRadius: 7 }}>INVESTIGATING</span>}
                    </div>
                    <b style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{rv.product_name}</b>
                    {rv.product_sku && <span style={{ fontSize: 11, color: T.muted }}>SKU {rv.product_sku}</span>}
                    {(rv.expected_value != null || rv.actual_value != null) && (
                      <div style={{ display: 'flex', gap: 9, margin: '11px 0' }}>
                        {cell('Book stock', rv.expected_value ?? '—', T.paper, T.ink, 0)}
                        {cell('Counted', rv.actual_value ?? '—', T.greenSoft, T.green, 1)}
                        {cell('Variance', `${v > 0 ? '+' : ''}${v}`, v === 0 ? T.greenSoft : T.redSoft, v === 0 ? T.green : T.red, 2)}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>Raised by <b style={{ color: T.ink }}>{rv.staff_name}</b> · {timeAgo(rv.created_at)}{v !== 0 ? ` · ${Math.abs(v)} units ${v < 0 ? 'short' : 'over'}` : ''}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={busy} onClick={() => reviewAction(rv.id, 'accept')} style={{ flex: 1.5, background: T.green, color: '#fff', border: 0, borderRadius: 11, padding: '11px 6px', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : rv.flag_type === 'count_variance' ? 'Accept · adjust stock' : 'Accept'}</button>
                      {rv.status !== 'investigating' && <button disabled={busy} onClick={() => reviewAction(rv.id, 'investigate')} style={{ flex: 1, background: '#fff', color: T.amber, border: `1.5px solid ${T.amberSoft}`, borderRadius: 11, padding: '11px 6px', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Investigate</button>}
                      <button disabled={busy} onClick={() => reviewAction(rv.id, 'dismiss')} style={{ flex: 0.9, background: '#fff', color: T.muted, border: `1.5px solid ${T.line}`, borderRadius: 11, padding: '11px 6px', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
                    </div>
                    {rv.flag_type === 'count_variance' && rv.status !== 'investigating' && <div style={{ fontSize: 10, color: T.muted, marginTop: 8, textAlign: 'center', lineHeight: 1.4 }}>Accept moves stock to {rv.actual_value ?? '—'} and logs the adjustment to you.</div>}
                  </div>
                )
              })}
            </>
          )
        )}
        {tabbar}
      </>
    )
  }

  // ── SCAN / LOOKUP ──
  if (tab === 'scan') {
    const scanCell = (l: string, v: React.ReactNode, col: string, i: number) => (
      <div key={i} style={{ flex: 1, background: T.paper, borderRadius: 11, padding: '9px 8px', textAlign: 'center' }}>
        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 21, fontWeight: 600, lineHeight: 1, color: col }}>{v}</div>
        <div style={{ fontSize: 9.5, color: T.muted, marginTop: 3 }}>{l}</div>
      </div>
    )
    return shell(
      <>
        {statusbar}{header(true, 'Scan', 'Look up an item · live stock')}
        {body(
          <>
            <div style={{ background: T.ink, color: '#fff', borderRadius: 16, padding: 18, marginBottom: 13, textAlign: 'center' }}>
              <div style={{ width: 58, height: 58, borderRadius: 16, background: 'rgba(127,184,151,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <svg width="28" height="28" fill="none" stroke={T.sage} strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" /></svg>
              </div>
              <p style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 18 }}>Scan a barcode</p>
              <p style={{ fontSize: 11.5, color: '#9aa3b2', marginTop: 2, lineHeight: 1.5 }}>No camera here — type the barcode, or search by name below.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input value={scanInput} onChange={e => setScanInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runScan(scanInput, 'barcode') }} placeholder="Barcode…" inputMode="numeric"
                  style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontFamily: BODY, fontSize: 13, outline: 'none' }} />
                <button onClick={() => runScan(scanInput, 'barcode')} style={{ background: T.sage, color: '#0E1812', border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Look up</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 13 }}>
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runScan(searchInput, 'q') }} placeholder="Search by name or SKU…"
                style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: `1px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none' }} />
              <button onClick={() => runScan(searchInput, 'q')} style={{ background: T.green, color: '#fff', border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            </div>

            {scanState === 'idle' && <div style={{ padding: 28, textAlign: 'center', color: T.muted }}><p style={{ fontSize: 13, lineHeight: 1.6 }}>Look up any item to see its live on-hand, cost and how fast it sells.</p></div>}
            {scanState === 'searching' && <div style={{ height: 150, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}` }} />}
            {scanState === 'error' && <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Lookup failed. Try again.</div>}
            {scanState === 'notfound' && (
              <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.amberSoft}`, textAlign: 'center' }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>🔍</div>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No match</p>
                <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{scanNote}</p>
              </div>
            )}
            {scanState === 'found' && scanMatches.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {scanMatches.map(m => (
                  <button key={m.id} onClick={() => pickMatch(m.id)} style={{ textAlign: 'left', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '12px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</b><div style={{ fontSize: 11, color: T.muted }}>{m.sku ? `SKU ${m.sku} · ` : ''}{money(m.price)}</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: T.green }}>{m.on_hand}</div><div style={{ fontSize: 9.5, color: T.muted }}>on hand</div></div>
                  </button>
                ))}
              </div>
            )}
            {scanState === 'found' && scanResult && (
              <div style={{ background: '#fff', border: `1.5px solid ${T.green}`, borderRadius: 16, padding: 15, boxShadow: '0 6px 20px rgba(45,82,64,.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.ink, color: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 13 }}>
                  <svg width="20" height="20" fill="none" stroke={T.sage} strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" /></svg>
                  <b style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{scanResult.name}</b><span style={{ fontSize: 11, color: '#9aa3b2' }}>{scanResult.sku ? `SKU ${scanResult.sku}` : 'no SKU'}</span>
                </div>
                <div style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
                  {scanCell('on hand', scanResult.on_hand, T.green, 0)}
                  {scanCell('price', money(scanResult.price), T.ink, 1)}
                  {scanCell('unit cost', scanResult.cost != null ? money(scanResult.cost) : '—', T.ink, 2)}
                </div>
                <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
                  {scanCell('sells / day', scanResult.units_per_day, T.ink, 0)}
                  {scanCell('days cover', scanResult.days_of_cover != null ? scanResult.days_of_cover : '—', scanResult.days_of_cover != null && scanResult.days_of_cover < 7 ? T.red : T.ink, 1)}
                  {scanCell('cost basis', scanResult.cost_source, T.muted, 2)}
                </div>
                {scanCount == null ? (
                  <>
                    <button onClick={() => { setScanCount(scanResult.on_hand); setScanCountMsg(null) }} style={{ width: '100%', background: T.green, color: '#fff', border: 0, borderRadius: 13, padding: 13, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>Count this item</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setWasteProduct({ id: scanResult.id, name: scanResult.name, unit_cost: scanResult.cost, on_hand: scanResult.on_hand }); setWasteQty(1); setWasteReason('spoilage'); setWasteOther(''); setWasteMsg(null); setTab('waste') }} style={{ flex: 1, background: '#fff', color: T.red, border: `1.5px solid ${T.redSoft}`, borderRadius: 13, padding: 11, fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Log waste</button>
                      <button onClick={() => { setAdjustProduct({ id: scanResult.id, name: scanResult.name, unit_cost: scanResult.cost, on_hand: scanResult.on_hand }); setAdjustMode('set'); setAdjustValue(scanResult.on_hand); setAdjustReason(''); setAdjustOther(''); setAdjustMsg(null); setAdjustErr(''); setTab('adjust') }} style={{ flex: 1, background: '#fff', color: '#534AB7', border: `1.5px solid ${T.violetSoft}`, borderRadius: 13, padding: 11, fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Adjust</button>
                    </div>
                  </>
                ) : scanCountMsg ? (
                  <>
                    <div style={{ width: '100%', background: T.sage, color: '#fff', borderRadius: 13, padding: 13, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{scanCountMsg.review ? '✓ Sent to owner review' : '✓ Count matches — recorded'}</div>
                    <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>Logged as <b style={{ color: T.green }}>{acting?.name}</b> · stock unchanged{scanCountMsg.review ? ' — the owner reviews the variance' : ''}</div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '2px 0 12px' }}>
                      <button onClick={() => setScanCount(v => Math.max(0, (v ?? 0) - 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                      <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 44, fontWeight: 600, minWidth: 64, textAlign: 'center', lineHeight: 1 }}>{scanCount}</div>
                      <button onClick={() => setScanCount(v => (v ?? 0) + 1)} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                    </div>
                    <button onClick={() => submitScanCount(scanResult)} disabled={scanCounting} style={{ width: '100%', background: T.green, color: '#fff', border: 0, borderRadius: 13, padding: 13, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: scanCounting ? 0.6 : 1 }}>{scanCounting ? 'Submitting…' : 'Submit count'}</button>
                    <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>Counting won&apos;t change stock — a mismatch goes to the owner&apos;s review queue.</div>
                  </>
                )}
              </div>
            )}
          </>
        )}
        {tabbar}
      </>
    )
  }

  // ── WASTE ──
  if (tab === 'waste') {
    const reasons = wasteToday?.reasons ?? ['spoilage', 'breakage', 'expiry', 'over-pour', 'prep-error', 'other']
    const costOfWaste = wasteProduct?.unit_cost != null ? wasteProduct.unit_cost * wasteQty : null
    const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
    const reasonLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1).replace('-', ' ')
    return shell(
      <>
        {statusbar}{header(true, 'Waste', 'Log spoilage — this reduces stock')}
        {body(
          <>
            <div style={{ fontSize: 11.5, color: '#7a4a16', background: T.amberSoft, borderRadius: 10, padding: '10px 12px', lineHeight: 1.45, marginBottom: 13, display: 'flex', gap: 8 }}>
              <svg width="16" height="16" fill="none" stroke={T.amber} strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4m0 4h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
              <span><b style={{ color: T.amber }}>Waste reduces stock.</b> Unlike a count (which just checks), logging waste removes the units from on-hand — they&apos;re physically gone.</span>
            </div>

            {!wasteProduct ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={wasteSearch} onChange={e => setWasteSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') wasteSearchRun(wasteSearch) }} placeholder="Find the item you're wasting…"
                    style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: `1px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none' }} />
                  <button onClick={() => wasteSearchRun(wasteSearch)} style={{ background: T.green, color: '#fff', border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                </div>
                {wasteSearching ? <div style={{ height: 120, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}` }} />
                  : wasteMatches.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {wasteMatches.map(m => (
                        <button key={m.id} onClick={() => pickWasteProduct(m.id)} style={{ textAlign: 'left', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '12px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</b><div style={{ fontSize: 11, color: T.muted }}>{m.sku ? `SKU ${m.sku}` : 'no SKU'}</div></div>
                          <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: T.green }}>{m.on_hand}</div><div style={{ fontSize: 9.5, color: T.muted }}>on hand</div></div>
                        </button>
                      ))}
                    </div>
                  ) : <div style={{ padding: 24, textAlign: 'center', color: T.muted, fontSize: 13, lineHeight: 1.6 }}>Search for the item you&apos;re writing off — spoilage, breakage, expiry or a prep mistake.</div>}
              </>
            ) : wasteMsg ? (
              <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 15, marginBottom: 4 }}>
                <div style={{ width: '100%', background: T.sage, color: '#fff', borderRadius: 13, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>✓ Logged · stock updated</div>
                {wasteMsg.spike && <div style={{ fontSize: 11.5, color: T.red, background: T.redSoft, borderRadius: 10, padding: '10px 12px', lineHeight: 1.45, marginTop: 10, display: 'flex', gap: 8 }}><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 9v4m0 4h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg><span>Unusually high vs normal — flagged to the owner&apos;s review queue.</span></div>}
                <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>Logged as <b style={{ color: T.green }}>{acting?.name}</b> · {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}{wasteMsg.cost_cents != null ? ` · ${dollars(wasteMsg.cost_cents)} written off` : ''}</div>
                <button onClick={() => { setWasteProduct(null); setWasteMsg(null); setWasteSearch('') }} style={{ width: '100%', marginTop: 12, background: '#fff', color: T.green, border: `1.5px solid ${T.greenSoft}`, borderRadius: 12, padding: 12, fontFamily: BODY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Log another</button>
              </div>
            ) : (
              <div style={{ background: '#fff', border: `1.5px solid ${T.green}`, borderRadius: 16, padding: 15, boxShadow: '0 6px 20px rgba(45,82,64,.1)', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.ink, color: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 13 }}>
                  <svg width="20" height="20" fill="none" stroke={T.red} strokeWidth={2} viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                  <b style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{wasteProduct.name}</b><span style={{ fontSize: 11, color: '#9aa3b2' }}>{wasteProduct.on_hand} on hand</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '2px 0 14px' }}>
                  <button onClick={() => setWasteQty(v => Math.max(1, v - 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                  <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 44, fontWeight: 600, minWidth: 64, textAlign: 'center', lineHeight: 1 }}>{wasteQty}</div>
                  <button onClick={() => setWasteQty(v => Math.min(wasteProduct.on_hand || 9999, v + 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                  {reasons.map(r => (
                    <button key={r} onClick={() => setWasteReason(r)} style={{ fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: BODY, border: `1.5px solid ${wasteReason === r ? T.green : T.line}`, background: wasteReason === r ? T.greenSoft : '#fff', color: wasteReason === r ? T.green : T.muted }}>{reasonLabel(r)}</button>
                  ))}
                </div>
                {wasteReason === 'other' && <input value={wasteOther} onChange={e => setWasteOther(e.target.value)} placeholder="Describe the reason…" style={{ width: '100%', padding: '10px 12px', borderRadius: 11, border: `1px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none', marginBottom: 12 }} />}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.paper, borderRadius: 11, padding: '11px 13px', marginBottom: 13 }}>
                  <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Cost of waste</span>
                  <span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 22, fontWeight: 600, color: costOfWaste != null ? T.red : T.muted }}>{costOfWaste != null ? `$${costOfWaste.toFixed(2)}` : 'cost unknown'}</span>
                </div>
                <button onClick={submitWaste} disabled={wasteSubmitting} style={{ width: '100%', background: T.red, color: '#fff', border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: wasteSubmitting ? 0.6 : 1 }}>{wasteSubmitting ? 'Logging…' : `Log waste · −${wasteQty} from stock`}</button>
                <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>Removes {wasteQty} from {wasteProduct.name} ({wasteProduct.on_hand} → {Math.max(0, wasteProduct.on_hand - wasteQty)}) · logged as <b style={{ color: T.green }}>{acting?.name}</b></div>
                <button onClick={() => { setWasteProduct(null); setWasteMsg(null) }} style={{ width: '100%', marginTop: 9, background: 'none', color: T.muted, border: 'none', fontFamily: BODY, fontSize: 12.5, cursor: 'pointer' }}>← pick a different item</button>
              </div>
            )}

            <div style={{ margin: '18px 2px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 14, fontWeight: 600 }}>Waste today</b>
              {wasteTodayState === 'ok' && wasteToday && <span style={{ fontSize: 12.5, fontWeight: 700, color: T.red }}>{dollars(wasteToday.total_cost_cents)} lost</span>}
            </div>
            {wasteTodayState === 'loading' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{[...Array(2)].map((_, i) => <div key={i} style={{ height: 52, borderRadius: 13, background: '#fff', border: `1px solid ${T.line}` }} />)}</div>
            ) : wasteTodayState === 'error' ? (
              <div style={{ padding: 18, borderRadius: 14, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 13, fontWeight: 600, marginBottom: 9 }}>Couldn&apos;t load today&apos;s waste</p><button onClick={() => loadWasteToday(outletId)} style={{ padding: '7px 16px', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
            ) : wasteTodayState === 'empty' ? (
              <div style={{ padding: 28, textAlign: 'center', background: '#fff', borderRadius: 14, border: `1px solid ${T.line}` }}><div style={{ fontSize: 30, marginBottom: 6 }}>🌿</div><p style={{ fontSize: 14, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 3 }}>No waste logged today</p><p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>Nice — nothing written off yet. Anything you log here reduces stock and shows up for the owner.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {(wasteToday?.items ?? []).map(it => (
                  <div key={it.id} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{it.product_name}</b><div style={{ fontSize: 11, color: T.muted }}>−{it.quantity} · {reasonLabel(it.reason)} · {it.recorded_by}</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 18, fontWeight: 600, color: it.cost_cents != null ? T.red : T.muted }}>{it.cost_cents != null ? dollars(it.cost_cents) : '—'}</div><div style={{ fontSize: 9.5, color: T.muted }}>{new Date(it.recorded_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}</div></div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {tabbar}
      </>
    )
  }

  // ── ADJUST ──
  if (tab === 'adjust') {
    const ap = adjustProduct
    const reasons = adjustData?.reasons ?? ['found_stock', 'damaged', 'theft', 'supplier_error', 'data_correction', 'opening_balance', 'other']
    const canAdjust = adjustData?.can_adjust ?? false
    const recent = adjustData?.recent ?? []
    const reasonLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, ' ')
    const previewDelta = ap ? (adjustMode === 'set' ? Math.max(0, Math.round(adjustValue)) - ap.on_hand : adjustMode === 'add' ? Math.abs(Math.round(adjustValue)) : -Math.abs(Math.round(adjustValue))) : 0
    const previewNew = ap ? Math.max(0, ap.on_hand + previewDelta) : 0
    const valueImpact = ap && ap.unit_cost != null ? previewDelta * ap.unit_cost : null
    const setMode = (m: 'set' | 'add' | 'remove') => { setAdjustMode(m); setAdjustValue(m === 'set' ? (ap?.on_hand ?? 0) : 1); setAdjustErr('') }
    const recentList = (
      recent.length === 0
        ? <div style={{ padding: 26, textAlign: 'center', background: '#fff', borderRadius: 14, border: `1px solid ${T.line}` }}><div style={{ fontSize: 28, marginBottom: 6 }}>📋</div><p style={{ fontSize: 13.5, fontFamily: DISPLAY, fontStyle: 'italic' }}>No adjustments today</p><p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 2 }}>Manual corrections show here so every change to the book is transparent.</p></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{recent.map(a => (
          <div key={a.id} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{a.product_name}</b><div style={{ fontSize: 11, color: T.muted }}>{reasonLabel(a.reason)} · {a.adjusted_by}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 18, fontWeight: 600, color: a.delta < 0 ? T.red : T.green }}>{a.delta > 0 ? '+' : ''}{a.delta}</div><div style={{ fontSize: 9.5, color: T.muted }}>{a.value_dollars != null ? `${a.value_dollars < 0 ? '−' : '+'}$${Math.abs(a.value_dollars).toFixed(2)}` : new Date(a.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}</div></div>
          </div>
        ))}</div>
    )
    return shell(
      <>
        {statusbar}{header(true, 'Adjust', 'Manual stock correction')}
        {body(
          adjustState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: i === 0 ? 90 : 56, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}` }} />)}</div>
          ) : adjustState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load adjustments</p><button onClick={() => loadAdjust(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: '#43407a', background: T.violetSoft, borderRadius: 10, padding: '10px 12px', lineHeight: 1.45, marginBottom: 13, display: 'flex', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="#534AB7" strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path d="M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                <span><b style={{ color: '#534AB7' }}>This directly changes stock.</b> Use it to correct the book to reality for a known reason — found stock, damage, a supplier error or a data fix. Unlike a count, it moves on-hand immediately.</span>
              </div>

              {!canAdjust ? (
                <div style={{ background: '#fff', border: `1px solid ${T.amberSoft}`, borderRadius: 16, padding: 18, marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: T.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <svg width="22" height="22" fill="none" stroke={T.amber} strokeWidth={2} viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zM8 11V7a4 4 0 118 0v4" /></svg>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Manager approval needed</p>
                  <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>Stock corrections are limited to managers. You&apos;re signed in as <b style={{ color: T.ink }}>{acting?.name}</b> ({adjustData?.role ?? 'staff'}). Ask a manager to sign in and apply the correction — you can still see today&apos;s adjustments below.</p>
                </div>
              ) : !ap ? (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input value={adjustSearch} onChange={e => setAdjustSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') adjustSearchRun(adjustSearch) }} placeholder="Find the item to correct…"
                      style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: `1px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none' }} />
                    <button onClick={() => adjustSearchRun(adjustSearch)} style={{ background: T.green, color: '#fff', border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                  </div>
                  {adjustSearching ? <div style={{ height: 120, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}` }} />
                    : adjustMatches.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 4 }}>
                        {adjustMatches.map(m => (
                          <button key={m.id} onClick={() => pickAdjustProduct(m.id)} style={{ textAlign: 'left', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '12px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</b><div style={{ fontSize: 11, color: T.muted }}>{m.sku ? `SKU ${m.sku}` : 'no SKU'}</div></div>
                            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: T.green }}>{m.on_hand}</div><div style={{ fontSize: 9.5, color: T.muted }}>on hand</div></div>
                          </button>
                        ))}
                      </div>
                    ) : <div style={{ padding: 24, textAlign: 'center', color: T.muted, fontSize: 13, lineHeight: 1.6 }}>Search the item whose book count is wrong, then set it to the true number.</div>}
                </>
              ) : adjustMsg ? (
                <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 15, marginBottom: 4 }}>
                  <div style={{ width: '100%', background: T.sage, color: '#fff', borderRadius: 13, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>✓ Stock corrected</div>
                  <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>Adjusted by <b style={{ color: T.green }}>{acting?.name}</b> · {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()} · {adjustMsg.delta > 0 ? '+' : ''}{adjustMsg.delta} → now {adjustMsg.new_on_hand}</div>
                  <button onClick={() => { setAdjustProduct(null); setAdjustMsg(null); setAdjustSearch('') }} style={{ width: '100%', marginTop: 12, background: '#fff', color: T.green, border: `1.5px solid ${T.greenSoft}`, borderRadius: 12, padding: 12, fontFamily: BODY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Adjust another</button>
                </div>
              ) : (
                <div style={{ background: '#fff', border: `1.5px solid ${T.green}`, borderRadius: 16, padding: 15, boxShadow: '0 6px 20px rgba(45,82,64,.1)', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.ink, color: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 13 }}>
                    <b style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{ap.name}</b><span style={{ fontSize: 11, color: '#9aa3b2' }}>now {ap.on_hand} on hand</span>
                  </div>
                  <div style={{ display: 'flex', gap: 7, marginBottom: 13 }}>
                    {(['set', 'add', 'remove'] as const).map(m => (
                      <button key={m} onClick={() => setMode(m)} style={{ flex: 1, fontSize: 12.5, fontWeight: 600, padding: '9px 6px', borderRadius: 10, cursor: 'pointer', fontFamily: BODY, border: `1.5px solid ${adjustMode === m ? T.green : T.line}`, background: adjustMode === m ? T.greenSoft : '#fff', color: adjustMode === m ? T.green : T.muted }}>{m === 'set' ? 'Set to' : m === 'add' ? 'Add' : 'Remove'}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '2px 0 14px' }}>
                    <button onClick={() => setAdjustValue(v => Math.max(adjustMode === 'set' ? 0 : 1, Math.round(v) - 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                    <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 44, fontWeight: 600, minWidth: 64, textAlign: 'center', lineHeight: 1 }}>{Math.round(adjustValue)}</div>
                    <button onClick={() => setAdjustValue(v => Math.round(v) + 1)} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 7 }}>Reason (required)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                    {reasons.map(r => (
                      <button key={r} onClick={() => { setAdjustReason(r); setAdjustErr('') }} style={{ fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: BODY, border: `1.5px solid ${adjustReason === r ? T.green : T.line}`, background: adjustReason === r ? T.greenSoft : '#fff', color: adjustReason === r ? T.green : T.muted }}>{reasonLabel(r)}</button>
                    ))}
                  </div>
                  {adjustReason === 'other' && <input value={adjustOther} onChange={e => setAdjustOther(e.target.value)} placeholder="Describe the reason…" style={{ width: '100%', padding: '10px 12px', borderRadius: 11, border: `1px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none', marginBottom: 12 }} />}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.paper, borderRadius: 11, padding: '11px 13px', marginBottom: 13 }}>
                    <span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 19, fontWeight: 600 }}>{ap.on_hand} → {previewNew}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: previewDelta < 0 ? T.red : previewDelta > 0 ? T.green : T.muted }}>{previewDelta > 0 ? '+' : ''}{previewDelta}{valueImpact != null ? ` · ${valueImpact < 0 ? '−' : '+'}$${Math.abs(valueImpact).toFixed(2)}` : ''}</span>
                  </div>
                  {adjustErr && <p style={{ fontSize: 12, color: T.red, marginBottom: 10, textAlign: 'center' }}>{adjustErr}</p>}
                  <button onClick={submitAdjust} disabled={adjustSubmitting || previewDelta === 0} style={{ width: '100%', background: T.green, color: '#fff', border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (adjustSubmitting || previewDelta === 0) ? 0.5 : 1 }}>{adjustSubmitting ? 'Applying…' : previewDelta === 0 ? 'No change' : 'Apply correction'}</button>
                  <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>Moves {ap.name} to {previewNew} · attributed to <b style={{ color: T.green }}>{acting?.name}</b></div>
                  <button onClick={() => { setAdjustProduct(null); setAdjustMsg(null) }} style={{ width: '100%', marginTop: 9, background: 'none', color: T.muted, border: 'none', fontFamily: BODY, fontSize: 12.5, cursor: 'pointer' }}>← pick a different item</button>
                </div>
              )}

              <div style={{ margin: '18px 2px 10px', fontSize: 14, fontWeight: 600 }}>Adjustments today</div>
              {recentList}
            </>
          )
        )}
        {tabbar}
      </>
    )
  }

  // ── PRICE TICKETS (scan-to-batch) ──
  if (tab === 'tickets') {
    const totalCopies = ticketBatch.reduce((s, x) => s + x.qty, 0)
    return shell(
      <>
        {statusbar}{header(true, 'Price tickets', 'Scan items → save a print batch')}
        {body(
          <>
            <div style={{ fontSize: 11.5, color: '#43407a', background: T.violetSoft, borderRadius: 10, padding: '10px 12px', lineHeight: 1.45, marginBottom: 13 }}>
              Scan or search items to build a print batch. The owner picks a template and prints it from the dashboard. Prices are snapshotted now, so a later price change won&apos;t change what prints.
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={ticketSearch} onChange={e => setTicketSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ticketSearchRun(ticketSearch) }} placeholder="Scan or search by name / SKU…"
                style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: `1px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none' }} />
              <button onClick={() => ticketSearchRun(ticketSearch)} style={{ background: T.green, color: '#fff', border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Find</button>
            </div>

            {ticketSearching && <div style={{ height: 60, borderRadius: 13, background: '#fff', border: `1px solid ${T.line}`, marginBottom: 12 }} />}
            {ticketMatches.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {ticketMatches.map(m => (
                  <button key={m.id} onClick={() => ticketAdd(m.id)} style={{ textAlign: 'left', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '11px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</b><div style={{ fontSize: 11, color: T.muted }}>{m.sku ? `SKU ${m.sku} · ` : ''}{money(m.price)}</div></div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#534AB7', background: T.violetSoft, borderRadius: 8, padding: '5px 10px' }}>+ Add</span>
                  </button>
                ))}
              </div>
            )}

            {ticketMsg && <div style={{ fontSize: 12.5, color: T.green, background: T.greenSoft, borderRadius: 11, padding: '12px 14px', lineHeight: 1.45, marginBottom: 14, fontWeight: 500 }}>{ticketMsg}</div>}

            <div style={{ margin: '4px 2px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 14, fontWeight: 600 }}>This batch</b>
              {ticketBatch.length > 0 && <span style={{ fontSize: 11.5, color: T.muted }}>{ticketBatch.length} item{ticketBatch.length === 1 ? '' : 's'} · {totalCopies} ticket{totalCopies === 1 ? '' : 's'}</span>}
            </div>

            {ticketBatch.length === 0 ? (
              <div style={{ padding: 34, textAlign: 'center', background: '#fff', borderRadius: 14, border: `1px solid ${T.line}` }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>🏷️</div>
                <p style={{ fontSize: 15, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 3 }}>No items yet</p>
                <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>Search above and tap “Add” to start a price-ticket batch.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
                  {ticketBatch.map(it => (
                    <div key={it.id} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 13.5, fontWeight: 600 }}>{it.name}</b>
                        <div style={{ fontSize: 11, color: T.muted }}>{it.was != null ? <span><span style={{ textDecoration: 'line-through' }}>{money(it.was)}</span> {money(it.price)}{it.promo ? ` · ${it.promo}` : ''}</span> : money(it.price)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => ticketQty(it.id, -1)} style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 18, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                        <span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 19, fontWeight: 600, minWidth: 22, textAlign: 'center' }}>{it.qty}</span>
                        <button onClick={() => ticketQty(it.id, 1)} style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 18, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                        <button onClick={() => ticketRemove(it.id)} title="Remove" style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.redSoft}`, background: '#fff', fontSize: 14, color: T.red, cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <input value={ticketName} onChange={e => setTicketName(e.target.value)} placeholder="Name this batch (e.g. Friday specials)…"
                  style={{ width: '100%', padding: '11px 13px', borderRadius: 11, border: `1px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none', marginBottom: 10 }} />
                <button onClick={ticketSaveBatch} disabled={ticketSaving || !ticketName.trim()} style={{ width: '100%', background: T.green, color: '#fff', border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (ticketSaving || !ticketName.trim()) ? 0.5 : 1 }}>{ticketSaving ? 'Saving…' : `Save batch · ${totalCopies} ticket${totalCopies === 1 ? '' : 's'}`}</button>
                <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>Saved as <b style={{ color: T.green }}>{acting?.name}</b> · the owner prints it from the dashboard</div>
              </>
            )}
          </>
        )}
        {tabbar}
      </>
    )
  }

  // HOME
  const multiOutlet = (boot?.outlets.length ?? 0) > 1
  const vh = home?.value_hero
  const pct = vh && vh.products_total > 0 ? Math.round((vh.products_valued / vh.products_total) * 100) : 0

  return shell(
    <>
      {statusbar}{header()}
      {body(
        <>
          {multiOutlet && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${T.line}`, borderRadius: 11, padding: '9px 12px', marginBottom: 13, fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.sage }} />
              <select value={outletId ?? ''} onChange={e => { setOutletId(e.target.value); loadHome(e.target.value) }} style={{ border: 0, background: 'transparent', fontFamily: BODY, fontWeight: 600, fontSize: 12.5, flex: 1, outline: 0, color: T.ink }}>
                {boot!.outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <span style={{ fontSize: 9.5, color: T.muted, fontWeight: 600 }}>stock is per-outlet</span>
            </div>
          )}

          {/* VALUE HERO */}
          {homeState === 'loading' ? (
            <div style={{ height: 150, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}`, marginBottom: 13 }} />
          ) : homeState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center', marginBottom: 13 }}>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load your stock</p>
              <button onClick={() => loadHome(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: T.green, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button>
            </div>
          ) : homeState === 'empty' ? (
            <div style={{ padding: 28, borderRadius: 16, background: '#fff', border: `1px solid ${T.line}`, textAlign: 'center', marginBottom: 13 }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>📦</div>
              <p style={{ fontSize: 16, fontFamily: DISPLAY, fontStyle: 'italic', marginBottom: 4 }}>No products yet</p>
              <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>Add products in the dashboard and your live stock value will appear here.</p>
            </div>
          ) : vh && (
            <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 15, marginBottom: 13, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
              <div style={{ fontSize: 11, color: T.muted }}>Stock value on hand · at cost</div>
              <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 34, fontWeight: 600, color: T.green, lineHeight: 1.05, marginTop: 1 }}>{money(vh.at_cost)}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1 }}>at retail {money(vh.at_retail)}{vh.margin_pct != null ? ` · ${vh.margin_pct}% margin` : ''} · {vh.products_valued}/{vh.products_total} costed</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
                {[['sold today', String(home!.mini_stats.sold_today), T.ink], ['tasks open', String(home!.mini_stats.tasks_open), T.amber], ['to review', String(home!.mini_stats.to_review), T.red]].map(([k, v, col]) => (
                  <div key={k} style={{ flex: 1, background: T.paper, borderRadius: 11, padding: '8px 10px' }}>
                    <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 19, fontWeight: 600, lineHeight: 1, color: col as string }}>{v}</div>
                    <div style={{ fontSize: 9.5, color: T.muted, marginTop: 3 }}>{k}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOOL TILES */}
          <div style={{ margin: '6px 2px 10px', fontSize: 14, fontWeight: 600 }}>Inventory tools</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {TILES.map(t => {
              const badge = t.badge ? (home?.tile_badges[t.badge] ?? 0) : 0
              return (
                <div key={t.key} onClick={() => { if (t.key === 'count') setTab('tasks'); else if (t.key === 'scan') setTab('scan'); else if (t.key === 'waste') { setWasteProduct(null); setTab('waste') } else if (t.key === 'adjust') { setAdjustProduct(null); setTab('adjust') } else if (t.key === 'tickets') setTab('tickets') }}
                  style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, padding: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 9, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: (T as Record<string, string>)[t.bg], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" fill="none" stroke={t.stroke} strokeWidth={2} viewBox="0 0 24 24">{t.circle && <circle cx="12" cy="12" r="9" />}<path d={t.d} /></svg>
                  </div>
                  <b style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</b>
                  {t.badge && badge > 0
                    ? <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, background: T.amberSoft, padding: '1px 6px', borderRadius: 5, alignSelf: 'flex-start', marginTop: -4 }}>{badge} {t.key === 'order' ? 'to reorder' : 'today'}</span>
                    : <span style={{ fontSize: 10.5, color: T.muted, marginTop: -4 }}>{t.sub}</span>}
                </div>
              )
            })}
          </div>
        </>
      )}
      {tabbar}
    </>
  )
}
