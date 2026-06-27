'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { P, JAKARTA, HARD_SHADOW, greetWord as pgreet, pipelDate, pfirst } from '@/lib/inventory/ui/pipel-tokens'
import { PipelStatusBar, PipelTopBar, PipelGreeting, PipelTitle, PipelBottomNav, PipelSegment, PipelSectionHead, PipelHero, PipelTile, PipelNeed, PipelButton, PipelStat, PIcon } from '@/components/inventory/ui/pipel'
import { PipelScanner } from '@/components/inventory/ui/PipelScanner'
import { enqueueWrite, allWrites, removeWrite, markFailed } from '@/lib/inventory/offline-queue'

// INV-STAFF-APP-1 — staff inventory PWA. Phone-native shell, slug routing, per-staff PIN login, live Home
// tool-hub. Matches the locked staff-app HTML (light theme, dashboard tokens, Cormorant + Outfit). Data is
// live (stock value via INV-COST-1, order badge via INV-PAR-1, sold-today from real sales). Tasks/Reports/
// Review/Scan are wired nav targets, fully built in the next two prompts.

// INV-PIPEL — the staff app's shared token map is repointed to the locked Pipel palette so every sub-screen
// adopts ink borders + lime accents + Jakarta numerals with no structural rewrite. Names are kept so existing
// inline styles resolve; values are Pipel. (green→ink, sage→lime, paper→soft inset, line→ink border.)
const T = {
  sage: P.lime, green: P.ink, sand: P.ink, amber: P.amber, red: P.red,
  ink: P.ink, paper: P.soft, line: P.ink, muted: P.muted,
  greenSoft: '#f1fbcf', sandSoft: P.soft, amberSoft: P.amberSoft, redSoft: P.redSoft, sageSoft: '#f1fbcf', blueSoft: '#eef3fb', violetSoft: '#f1eefb',
}
const DISPLAY = JAKARTA
const BODY = JAKARTA  // INV-PIPEL: body type is Plus Jakarta Sans across the whole staff app
const AV_PALETTE = ['#185FA5', '#2D5240', '#C9A37A', '#7c5cbf', '#BA7517']
const money = (n: number) => `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const initials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
const firstName = (name: string) => name.split(' ')[0] ?? name

// INV-PIPEL-4 — report-tile glyph + a live headline number drawn ONLY from the already-loaded KPIs (no new
// fetch): stock value → $ at cost, sold-vs-stock → units sold, shrinkage/waste → $ shrinkage. Others show their
// blurb. Grounded — never a fabricated figure.
const reportIcon = (type: string): string => (({
  sold_vs_stock: 'bar-chart', stock_value: 'dollar-sign', margin: 'percent', top_sellers: 'trending-up',
  shrinkage_waste: 'trash', dead_stock: 'archive', reorder: 'shopping-cart', days_cover: 'clock',
  count_accuracy: 'check-square', received_vs_ordered: 'truck', transfers: 'transfer', expiring: 'clock',
  movement_audit: 'activity',
} as Record<string, string>)[type] ?? 'bar-chart')
const reportLiveStat = (type: string, k: ReportKpis | null | undefined): { v: string; s: string } | null => {
  if (!k) return null
  if (type === 'stock_value') return { v: money(k.stock_at_cost), s: 'at cost' }
  if (type === 'sold_vs_stock') return { v: String(k.units_sold), s: 'units sold' }
  if (type === 'shrinkage_waste') return { v: money(k.shrinkage_dollars), s: 'shrinkage' }
  return null
}

interface Staff { id: string; name: string; role: string; color: string | null }
interface Outlet { id: string; name: string; is_default: boolean }
interface Boot { business: { id: string; name: string; slug: string }; outlets: Outlet[]; staff: Staff[] }
interface VisibleTile { id: string; label: string; sublabel: string; icon: string; route: string; badge?: string }
interface Home { staff: { id: string; name: string }; value_hero: { at_cost: number; at_retail: number; margin_pct: number | null; products_valued: number; products_total: number; uncosted: number }; mini_stats: { sold_today: number; tasks_open: number; to_review: number }; tile_badges: { order: number; expiring: number; receive: number }; visible_tiles?: VisibleTile[]; tile_industry?: string }
interface Task { id: string; task_type: string; product_id: string | null; title: string; detail: string | null; hypothesis: string | null; priority: number; status: string; completed_by: string | null; product_name: string | null; product_sku: string | null; expected: number | null }
interface TasksData { acting: { id: string; name: string }; tasks: Task[]; pills: { accuracy: number | null; streak: number; left_today: number } }
interface Review { id: string; flag_type: string; status: string; product_id: string | null; product_name: string; product_sku: string | null; expected_value: number | null; actual_value: number | null; variance: number | null; staff_name: string; created_at: string; evidence?: Record<string, unknown> }
interface ReviewData { acting: { id: string; name: string }; reviews: Review[]; counts: { open: number; resolved_today: number } }
interface ScanLocate { outlet_id: string; outlet_name: string; items_on_hand: number }
interface ScanProduct { id: string; name: string; sku: string | null; price: number; on_hand: number; cost: number | null; cost_source: string; units_per_day: number; days_of_cover: number | null; locate?: ScanLocate[] }
interface ScanMatch { id: string; name: string; sku: string | null; price: number; on_hand: number }
// INV-OFFLINE-2: in-session product catalog shape (cost_price from pos_products, not enriched).
interface CatalogProduct { id: string; name: string; sku: string | null; price: number; on_hand: number; cost_price: number | null }
interface WasteItem { id: string; product_name: string; quantity: number; unit: string; reason: string; recorded_by: string; recorded_at: string; cost_cents: number | null }
interface WasteToday { acting: { id: string; name: string }; reasons: string[]; items: WasteItem[]; total_cost_cents: number; count: number }
interface AdjustRecent { id: string; product_id: string; product_name: string; delta: number; reason: string; adjusted_by: string; created_at: string; value_dollars: number | null }
interface AdjustData { acting: { id: string; name: string }; role: string; can_adjust: boolean; reasons: string[]; recent: AdjustRecent[] }
interface ReportSection { title: string; columns: string[]; rows: Array<Array<string | number>>; empty?: string; total_row?: Array<string | number> }
interface ReportKpis { stock_at_cost: number; stock_at_retail: number; units_sold: number; shrinkage_dollars: number }
interface ReportData { type: string; title: string; period: string; period_label: string; business_name: string; generated_at: string; kpis: ReportKpis | null; sections: ReportSection[]; note: string | null }
interface ReportLibItem { type: string; title: string; blurb: string }
interface ReportsResp { acting: { id: string; name: string }; library: ReportLibItem[]; report: ReportData }
interface ReceiveLine { id: string; product_id: string; product_name: string; quantity_ordered: number; quantity_received: number | null; unit_cost: number | null; receive_status: string | null }
interface ReceivePO { id: string; order_number: string; status: string; total: number | null; expected_date: string | null; items: ReceiveLine[] }
interface RecentPO { id: string; order_number: string; total: number | null; received_at: string | null; received_by: string | null }
interface ReceiveData { acting: { id: string; name: string }; receivable: ReceivePO[]; recent: RecentPO[] }
interface TransferItem { id: string; product_id: string; product_name: string; quantity_approved: number; quantity_sent: number | null; quantity_received: number | null; variance_units: number | null }
interface TransferRow { id: string; status: string; from_outlet_id: string; to_outlet_id: string; from_name: string; to_name: string; total_cost: number | null; items: TransferItem[] }
interface TransferData { acting: { id: string; name: string }; outlet_count: number; transfers: TransferRow[] }
interface ExpBatch { id: string; product_id: string; product_name: string; outlet_id: string; outlet_name: string; batch_ref: string; quantity_remaining: number; expiry_date: string; days_left: number; bucket: 'expired' | 'urgent' | 'soon' | 'ok' }
interface ExpData { acting: { id: string; name: string }; counts: { expired: number; urgent: number; soon: number; ok: number }; batches: ExpBatch[] }

const TILES = [
  { key: 'receive', label: 'Receive', sub: 'log a delivery', bg: 'greenSoft', stroke: '#0F6E56', d: 'M3 7h13v8H3zM16 10h3l2 3v2h-5M5.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', badge: 'receive' as const },
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
  const [tab, setTab] = useState<'home' | 'tasks' | 'reports' | 'review' | 'scan' | 'waste' | 'adjust' | 'tickets' | 'receive' | 'transfer' | 'expiring' | 'stocktake' | 'order' | 'fresh' | 'loss'>('home')
  const pinSubmitting = useRef(false)
  // INV-OFFLINE — offline detection + a queue for the safe writes (waste/temp/count). Online path unchanged.
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [offlineToast, setOfflineToast] = useState('')
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
  // INV-SCAN-CAMERA — camera vs manual entry. cameraSupported is detected client-side (secure context + getUserMedia);
  // SSR/unsupported devices default to manual. cameraDenied notes a blocked permission so the fallback explains why.
  const [scanMode, setScanMode] = useState<'camera' | 'type'>('camera')
  const [cameraSupported, setCameraSupported] = useState(false)
  const [cameraDenied, setCameraDenied] = useState(false)
  useEffect(() => { setCameraSupported(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof window === 'undefined' || window.isSecureContext !== false)) }, [])
  // INV-1-FINISH — add-to-catalogue (barcode/search not found). notFoundCtx holds the prefill (barcode + any
  // Open Food Facts name/category); addForm is the editable form once the user chooses to add.
  const [notFoundCtx, setNotFoundCtx] = useState<{ barcode: string; name: string; category: string } | null>(null)
  const [addForm, setAddForm] = useState<{ name: string; category: string; price: string; cost: string; barcode: string } | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  const [addErr, setAddErr] = useState('')
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
  const [ticketCam, setTicketCam] = useState(false)  // INV-SCAN-CAMERA: camera scan into the ticket batch (search kept)
  // Receive screen state
  const [receiveData, setReceiveData] = useState<ReceiveData | null>(null)
  const [receiveState, setReceiveState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [openPo, setOpenPo] = useState<string | null>(null)
  const [recvQty, setRecvQty] = useState<Record<string, number>>({})
  const [recvExpiry, setRecvExpiry] = useState<Record<string, string>>({})
  const [recvNote, setRecvNote] = useState('')
  const [recvSubmitting, setRecvSubmitting] = useState(false)
  const [recvMsg, setRecvMsg] = useState('')
  // Transfer screen state
  const [transferData, setTransferData] = useState<TransferData | null>(null)
  const [transferState, setTransferState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [transferBusy, setTransferBusy] = useState<string | null>(null)
  const [transferMsg, setTransferMsg] = useState('')
  // Expiring screen state
  const [expData, setExpData] = useState<ExpData | null>(null)
  const [expState, setExpState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [expBusy, setExpBusy] = useState<string | null>(null)
  const [expMsg, setExpMsg] = useState('')
  // INV-4 — stocktake / cycle / perpetual counting
  interface CycleItem { product_id: string; name: string; abc_tier: 'A' | 'B' | 'C'; expected_qty: number; last_counted_at: string | null; days_since: number | null; due_score: number }
  interface StLine { product_id: string; product_name: string | null; expected_qty: number; counted_qty: number | null; variance_qty: number | null; variance_cents: number | null }
  const [stType, setStType] = useState<'full' | 'cycle' | 'perpetual' | null>(null)
  const [stSession, setStSession] = useState<{ id: string; count_type: string; status: string } | null>(null)
  const [stState, setStState] = useState<'pick' | 'loading' | 'active' | 'submitted'>('pick')
  const [stLines, setStLines] = useState<StLine[]>([])
  const [stCycle, setStCycle] = useState<CycleItem[]>([])
  const [stPick, setStPick] = useState<{ id: string; name: string; expected: number } | null>(null)
  const [stCountVal, setStCountVal] = useState(0)
  const [stRecountWarn, setStRecountWarn] = useState<string | null>(null)  // INV-DEPTH-COUNTING B: product name needing recount
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({})  // INV-DEPTH-COUNTING D: reason per review_id
  const [stPattern, setStPattern] = useState<string | null>(null)
  const [stSearch, setStSearch] = useState('')
  const [stMatches, setStMatches] = useState<ScanMatch[]>([])
  const [stBusy, setStBusy] = useState(false)
  const [stSummary, setStSummary] = useState<{ variances: number; reviews: number; total_cents: number; counted: number } | null>(null)
  // INV-5 — buying (reorder suggestions → draft PO → owner approve → send)
  interface BuyItem { product_id: string; name: string; on_hand: number; reorder_point: number; target_stock: number; suggested_qty: number; abc_tier: string; unit_cost: number | null; line_total: number | null; needs_cost: boolean }
  interface BuyGroup { supplier_id: string | null; supplier_name: string; needs_supplier: boolean; items: BuyItem[]; total: number }
  interface BuyPo { id: string; order_number: string; status: string; supplier_name: string; total: number | null; created_by: string | null }
  const [buyGroups, setBuyGroups] = useState<BuyGroup[]>([])
  const [buyPos, setBuyPos] = useState<BuyPo[]>([])
  const [buyState, setBuyState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [buyBusy, setBuyBusy] = useState<string | null>(null)
  const [buyMsg, setBuyMsg] = useState('')
  const [buyPo, setBuyPo] = useState<{ po: { id: string; order_number: string; status: string; total: number | null; created_by: string | null }; lines: Array<{ product_name: string; quantity_ordered: number; unit_cost: number | null; line_total: number | null }> } | null>(null)
  const [buyPermErr, setBuyPermErr] = useState('')
  // INV-6 — Pulse + Handover (guidance) on the Tasks screen
  interface PulseData { today_revenue: number; today_txns: number; baseline_avg: number; vs_baseline_pct: number | null; top_movers: Array<{ name: string; units: number }>; tasks_done: number; tasks_open: number; attention: { below_reorder: number; expiring: number; open_reviews: number }; top_waste_7d?: Array<{ name: string; cost_cents: number; reason: string }> }
  interface WeatherData { forecast_rain_pct: number | null; sufficient: boolean; matched_days: number; rain_days: number; dry_days: number; rain_lift_pct: number | null; reason: string | null }
  interface HandoverData { done: Array<{ title: string; type: string; by: string }>; open: Array<{ title: string; type: string; why: string | null }>; flagged: { open_reviews: number; expiring: number; below_reorder: number } }
  const [pulseData, setPulseData] = useState<PulseData | null>(null)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [handoverData, setHandoverData] = useState<HandoverData | null>(null)
  const [showHandover, setShowHandover] = useState(false)
  const [completingTask, setCompletingTask] = useState<string | null>(null)
  // INV-7 — fresh / production
  interface Recipe { id: string; name: string; serves: number; cost: number | null; ingredients: number; linked: number }
  interface MarkdownProp { product_id: string; name: string; expiry_date: string; days_left: number; current_price: number; discount_pct: number; marked_price: number; rule_name: string }
  interface DepLine { name: string; depleted: number; new_on_hand: number | null; value: number | null; fefo_batch: string | null }
  interface TempRecent { location: string; reading_c: number; passed: boolean; logged_at: string; by: string | null }
  const [freshTab, setFreshTab] = useState<'prep' | 'markdown' | 'temp'>('prep')
  const [freshRecipes, setFreshRecipes] = useState<Recipe[]>([])
  const [freshMarkdowns, setFreshMarkdowns] = useState<MarkdownProp[]>([])
  const [freshTemp, setFreshTemp] = useState<{ logged_today: boolean; failed_today: number; recent: TempRecent[] } | null>(null)
  const [freshState, setFreshState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [prepPick, setPrepPick] = useState<Recipe | null>(null)
  const [prepBatches, setPrepBatches] = useState(1)
  const [prepResult, setPrepResult] = useState<{ lines: DepLine[]; total_value: number } | null>(null)
  const [freshBusy, setFreshBusy] = useState(false)
  const [tempForm, setTempForm] = useState({ location: 'Fridge 1', reading: '', threshold: '5' })
  const [tempMsg, setTempMsg] = useState('')
  // INV-8 — loss & compliance
  interface Hold { id: string; product_id: string; item_name: string; quantity: number; reason: string; quarantined_by: string | null; value_at_risk: number | null }
  interface ShrinkData { period_days: number; total_dollars: number; by_category: Array<{ category: string; dollars: number; pct: number }>; top_products: Array<{ name: string; dollars: number }>; theft_signals: Array<{ name: string; fact: string }> }
  const [lossTab, setLossTab] = useState<'quarantine' | 'recall' | 'shrinkage'>('quarantine')
  const [lossHolds, setLossHolds] = useState<Hold[]>([])
  const [lossFailedTemps, setLossFailedTemps] = useState<Array<{ location: string; reading_c: number; logged_at: string }>>([])
  const [lossAtRisk, setLossAtRisk] = useState(0)
  const [lossShrink, setLossShrink] = useState<ShrinkData | null>(null)
  const [lossState, setLossState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [lossBusy, setLossBusy] = useState<string | null>(null)
  const [lossMsg, setLossMsg] = useState('')
  const [lossPermErr, setLossPermErr] = useState('')
  const [recallSearch, setRecallSearch] = useState('')
  const [recallMatches, setRecallMatches] = useState<ScanMatch[]>([])
  const [recallPick, setRecallPick] = useState<{ id: string; name: string } | null>(null)
  const [recallQty, setRecallQty] = useState(1)
  const [recallReason, setRecallReason] = useState('supplier recall')
  // INV-OFFLINE-2: React ref for in-session product catalog cache (survives tab switches, cleared on page reload).
  const productCatalogRef = useRef<CatalogProduct[]>([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [wasteFromCache, setWasteFromCache] = useState(false)
  const [adjustFromCache, setAdjustFromCache] = useState(false)
  const [ticketFromCache, setTicketFromCache] = useState(false)
  const [recallFromCache, setRecallFromCache] = useState(false)

  // PWA: register SW + inject per-slug manifest link + fonts.
  useEffect(() => {
    if (!slug) return
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/inventory-sw.js', { scope: '/inventory/' }).catch(() => {})
    const add = (rel: string, href: string, extra?: Record<string, string>) => {
      const l = document.createElement('link'); l.rel = rel; l.href = href; if (extra) Object.entries(extra).forEach(([k, v]) => l.setAttribute(k, v)); document.head.appendChild(l); return l
    }
    const m = add('manifest', `/api/inventory/app/${slug}/manifest`)
    const f1 = add('preconnect', 'https://fonts.googleapis.com')
    const f2 = add('stylesheet', 'https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@1,600&family=Outfit:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap')
    return () => { [m, f1, f2].forEach(el => el.remove()) }
  }, [slug])

  const loadHome = useCallback(async (oid: string | null) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setHomeState(s => (s === 'ok' || s === 'empty') ? s : 'error'); return } // INV-OFFLINE: keep last-loaded data, the banner explains offline
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

  // INV-OFFLINE-2: prefetch lightweight product catalog once per session (on app load while online).
  const prefetchCatalog = useCallback(async () => {
    if (productCatalogRef.current.length > 0) return
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?mode=catalog${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'catalog' && Array.isArray(d.products) && d.products.length > 0) {
        productCatalogRef.current = d.products as CatalogProduct[]
        setCatalogLoaded(true)
      }
    } catch { /* best-effort — offline at page load, catalog unavailable */ }
  }, [slug, outletId])

  const loadTasks = useCallback(async (oid: string | null) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setTasksState(s => (s === 'ok' || s === 'empty') ? s : 'error'); return } // INV-OFFLINE: keep last data offline
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
  // INV-OFFLINE-2: warm the catalog cache as soon as the app stage begins (online). One fetch, one ref write.
  useEffect(() => { if (stage === 'app' && online && productCatalogRef.current.length === 0) prefetchCatalog() }, [stage, online, prefetchCatalog])

  async function submitCount(task: Task) {
    if (!task.product_id) return
    const payload = { product_id: task.product_id, counted: countVal, task_id: task.id, outlet_id: outletId, product_name: task.product_name }
    if (!online) { // INV-OFFLINE — queue the count; variance/review computes on sync (a count is verification, not a stock move)
      const ok = await enqueueSafe(`/api/inventory/app/${slug}/count`, payload, `Count ${task.product_name ?? 'item'} = ${countVal}`)
      if (ok) { const v = countVal - (task.expected ?? 0); setCountMsg({ variance: v, review: v !== 0, time: 'offline' }); setTasksData(td => td ? { ...td, tasks: td.tasks.map(t => t.id === task.id ? { ...t, status: 'done', completed_by: acting?.id ?? null } : t) } : td) }
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/count`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) {
        setCountMsg({ variance: d.variance, review: d.review_raised, time: new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase() })
        setTasksData(td => td ? { ...td, tasks: td.tasks.map(t => t.id === task.id ? { ...t, status: 'done', completed_by: acting?.id ?? null } : t) } : td)
      }
    } catch (err) { if (err instanceof TypeError) await enqueueSafe(`/api/inventory/app/${slug}/count`, payload, `Count ${task.product_name ?? 'item'} = ${countVal}`) }
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

  async function reviewAction(id: string, action: 'accept' | 'investigate' | 'dismiss', reasonCode?: string) {
    if (!online) { blockOffline(); return } // accept moves stock — needs a connection
    setActingReview(id)
    try {
      const body: Record<string, string> = { review_id: id, action }
      if (action === 'accept' && reasonCode) body.reason_code = reasonCode
      const r = await fetch(`/api/inventory/app/${slug}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { await loadReview(outletId); loadHome(outletId) }
      else if (!r.ok && d.error === 'recount_required') { alert(d.message ?? 'A recount is required before accepting this variance.') }
    } catch { /* ignore */ }
    setActingReview(null)
  }

  // ── Scan / lookup ──
  async function runScan(term: string, kind: 'barcode' | 'q') {
    if (!term.trim()) return
    setScanState('searching'); setScanNote(''); setScanResult(null); setScanMatches([]); setScanCount(null); setScanCountMsg(null); setAddForm(null); setNotFoundCtx(null); setAddErr('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?${kind}=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setScanState('error'); return }
      const d = await r.json()
      if (d.mode === 'barcode') {
        if (d.found) { setScanResult(d.product); setScanState('found') }
        else { setScanState('notfound'); setScanNote(`No barcode match for "${d.barcode}". Add it below, or search by name.`); setNotFoundCtx({ barcode: String(d.barcode ?? term.trim()), name: d.external?.name ?? '', category: d.external?.category ?? '' }) }
      } else if (d.mode === 'search') {
        if ((d.matches ?? []).length) { setScanMatches(d.matches); setScanState('found') }
        else { setScanState('notfound'); setScanNote(`Nothing matches "${d.query}". Add it as a new product below.`); setNotFoundCtx({ barcode: '', name: String(d.query ?? term.trim()), category: '' }) }
      }
    } catch { setScanState('error') }
  }
  async function pickMatch(id: string) {
    setScanState('searching'); setScanMatches([]); setAddForm(null); setNotFoundCtx(null)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?product_id=${id}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.found) { setScanResult(d.product); setScanState('found') } else { setScanState('notfound'); setScanNote('Could not load that item.') }
    } catch { setScanState('error') }
  }
  // INV-1-FINISH — add-to-catalogue: open the form prefilled from the not-found context, then POST to the EXISTING
  // INV-1 add endpoint (POST /scan) and re-resolve the new product via pickMatch (→ normal price-check/locate card).
  function startAddProduct() {
    if (!notFoundCtx) return
    setAddForm({ name: notFoundCtx.name, category: notFoundCtx.category, price: '', cost: '', barcode: notFoundCtx.barcode }); setAddErr('')
  }
  async function submitAddProduct() {
    if (!addForm) return
    const name = addForm.name.trim(); const price = Number(addForm.price)
    if (!name) { setAddErr('Enter a product name.'); return }
    if (!(price > 0)) { setAddErr('Enter a retail price above $0.'); return }
    setAddBusy(true); setAddErr('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, category: addForm.category.trim() || undefined, price, cost_price: addForm.cost.trim() ? Number(addForm.cost) : undefined, barcode: addForm.barcode.trim() || undefined }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok && d.product?.id) { setScanInput(''); setSearchInput(''); setScanNote(''); await pickMatch(d.product.id as string) }
      else setAddErr(d.error ? `Couldn't add: ${d.error}` : 'Could not add the product.')
    } catch { setAddErr('Something went wrong.') }
    setAddBusy(false)
  }
  async function submitScanCount(product: ScanProduct) {
    if (scanCount == null) return
    const payload = { product_id: product.id, counted: scanCount, outlet_id: outletId, product_name: product.name }
    if (!online) { const ok = await enqueueSafe(`/api/inventory/app/${slug}/count`, payload, `Count ${product.name} = ${scanCount}`); if (ok) setScanCountMsg({ variance: scanCount - product.on_hand, review: scanCount - product.on_hand !== 0 }); return }
    setScanCounting(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/count`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setScanCountMsg({ variance: d.variance, review: d.review_raised }); loadHome(outletId) }
    } catch (err) { if (err instanceof TypeError) await enqueueSafe(`/api/inventory/app/${slug}/count`, payload, `Count ${product.name} = ${scanCount}`) }
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

  // INV-OFFLINE-2: client-side substring filter on the in-session catalog (name or SKU, up to 8 results).
  function catalogSearch(term: string): CatalogProduct[] {
    const t = term.trim().toLowerCase()
    return productCatalogRef.current.filter(p => p.name.toLowerCase().includes(t) || (p.sku ?? '').toLowerCase().includes(t)).slice(0, 8)
  }

  async function wasteSearchRun(term: string) {
    if (!term.trim()) return
    setWasteSearching(true); setWasteMatches([]); setWasteFromCache(false)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?q=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'search') setWasteMatches(d.matches ?? [])
      else if (d.offline) {
        const hits = catalogSearch(term)
        setWasteMatches(hits.map(p => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, on_hand: p.on_hand })))
        setWasteFromCache(true)
      }
    } catch { /* ignore */ }
    setWasteSearching(false)
  }
  async function pickWasteProduct(id: string) {
    setWasteSearching(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?product_id=${id}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.found) { setWasteProduct({ id: d.product.id, name: d.product.name, unit_cost: d.product.cost, on_hand: d.product.on_hand }); setWasteQty(1); setWasteReason('spoilage'); setWasteOther(''); setWasteMsg(null); setWasteMatches([]); setWasteSearch(''); setWasteFromCache(false) }
      else if (d.offline) { const p = productCatalogRef.current.find(x => x.id === id); if (p) { setWasteProduct({ id: p.id, name: p.name, unit_cost: p.cost_price, on_hand: p.on_hand }); setWasteQty(1); setWasteReason('spoilage'); setWasteOther(''); setWasteMsg(null); setWasteMatches([]); setWasteSearch(''); setWasteFromCache(false) } }
    } catch { /* ignore */ }
    setWasteSearching(false)
  }
  async function submitWaste() {
    if (!wasteProduct) return
    const reason = wasteReason === 'other' ? (wasteOther.trim() || 'other') : wasteReason
    const payload = { product_id: wasteProduct.id, product_name: wasteProduct.name, quantity: wasteQty, reason, outlet_id: outletId }
    if (!online) { const ok = await enqueueSafe(`/api/inventory/app/${slug}/waste`, payload, `Waste ${wasteProduct.name} ×${wasteQty}`); if (ok) setWasteMsg({ cost_cents: wasteProduct.unit_cost != null ? Math.round(wasteProduct.unit_cost * wasteQty * 100) : null, spike: false }); return }
    setWasteSubmitting(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/waste`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setWasteMsg({ cost_cents: d.cost_cents, spike: d.spike }); loadWasteToday(outletId); loadHome(outletId) }
    } catch (err) { if (err instanceof TypeError) await enqueueSafe(`/api/inventory/app/${slug}/waste`, payload, `Waste ${wasteProduct.name} ×${wasteQty}`) }
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
    setAdjustSearching(true); setAdjustMatches([]); setAdjustFromCache(false)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?q=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'search') setAdjustMatches(d.matches ?? [])
      else if (d.offline) {
        const hits = catalogSearch(term)
        setAdjustMatches(hits.map(p => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, on_hand: p.on_hand })))
        setAdjustFromCache(true)
      }
    } catch { /* ignore */ }
    setAdjustSearching(false)
  }
  async function pickAdjustProduct(id: string) {
    setAdjustSearching(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?product_id=${id}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.found) { setAdjustProduct({ id: d.product.id, name: d.product.name, unit_cost: d.product.cost, on_hand: d.product.on_hand }); setAdjustMode('set'); setAdjustValue(d.product.on_hand); setAdjustReason(''); setAdjustOther(''); setAdjustMsg(null); setAdjustErr(''); setAdjustMatches([]); setAdjustSearch(''); setAdjustFromCache(false) }
      else if (d.offline) { const p = productCatalogRef.current.find(x => x.id === id); if (p) { setAdjustProduct({ id: p.id, name: p.name, unit_cost: p.cost_price, on_hand: p.on_hand }); setAdjustMode('set'); setAdjustValue(p.on_hand); setAdjustReason(''); setAdjustOther(''); setAdjustMsg(null); setAdjustErr(''); setAdjustMatches([]); setAdjustSearch(''); setAdjustFromCache(false) } }
    } catch { /* ignore */ }
    setAdjustSearching(false)
  }
  async function submitAdjust() {
    if (!adjustProduct) return
    if (!online) { setAdjustErr('You’re offline — stock corrections need a connection.'); return }
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
    setTicketSearching(true); setTicketMatches([]); setTicketFromCache(false)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?q=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'search') setTicketMatches(d.matches ?? [])
      else if (d.offline) {
        const hits = catalogSearch(term)
        setTicketMatches(hits.map(p => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, on_hand: p.on_hand })))
        setTicketFromCache(true)
      }
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
      } else if (d.offline) {
        const p = productCatalogRef.current.find(x => x.id === id)
        if (p) { setTicketBatch(b => b.some(x => x.id === p.id) ? b.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x) : [...b, { id: p.id, name: p.name, price: p.price, was: null, promo: null, qty: 1 }]); setTicketMsg(''); setTicketMatches([]); setTicketSearch(''); setTicketFromCache(false) }
      }
    } catch { /* ignore */ }
    setTicketSearching(false)
  }
  // INV-SCAN-CAMERA — a camera decode resolves the barcode (scanLookup) then adds via the SAME ticketAdd flow.
  async function ticketScanDecode(barcode: string) {
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?barcode=${encodeURIComponent(barcode)}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'barcode' && d.found && d.product?.id) { await ticketAdd(d.product.id as string); setTicketMsg(`✓ Added ${d.product.name ?? 'item'} to the batch.`) }
      else setTicketMsg(`No catalogue match for ${barcode} — search by name instead.`)
    } catch { /* ignore */ }
  }
  const ticketQty = (id: string, delta: number) => setTicketBatch(b => b.map(x => x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x))
  const ticketRemove = (id: string) => setTicketBatch(b => b.filter(x => x.id !== id))
  async function ticketSaveBatch() {
    if (!ticketName.trim() || ticketBatch.length === 0) return
    if (!online) { setTicketMsg('You’re offline — saving a print batch needs a connection.'); return }
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

  // ── Receive (PO → delivery) ──
  const loadReceive = useCallback(async () => {
    setReceiveState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/receive`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setReceiveState('error'); return }
      const d = await r.json() as ReceiveData
      setReceiveData(d)
      setReceiveState(d.receivable.length === 0 && d.recent.length === 0 ? 'empty' : 'ok')
    } catch { setReceiveState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'receive' && !receiveData) loadReceive() }, [stage, tab, receiveData, loadReceive])
  function openReceivePo(po: ReceivePO) {
    setOpenPo(po.id)
    const q: Record<string, number> = {}; po.items.forEach(l => { q[l.id] = Math.round(Number(l.quantity_ordered) || 0) })
    setRecvQty(q); setRecvExpiry({}); setRecvNote(''); setRecvMsg('')
  }
  async function submitReceive(po: ReceivePO) {
    if (!online) { setRecvMsg('You’re offline — receiving a delivery needs a connection.'); return }
    setRecvSubmitting(true); setRecvMsg('')
    try {
      const lines = po.items.map(l => ({ line_id: l.id, product_id: l.product_id, received_qty: recvQty[l.id] ?? 0, expiry_date: recvExpiry[l.id] || undefined }))
      const r = await fetch(`/api/inventory/app/${slug}/receive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ po_id: po.id, outlet_id: outletId, note: recvNote || undefined, lines }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setRecvMsg(`✓ Received ${po.order_number} — stock updated.`); setOpenPo(null); setReceiveData(null); loadReceive(); loadHome(outletId) }
      else setRecvMsg(d.error ? `Couldn't receive: ${d.error}` : 'Could not receive this delivery.')
    } catch { setRecvMsg('Something went wrong.') }
    setRecvSubmitting(false)
  }

  // ── Transfer (between outlets) ──
  const loadTransfer = useCallback(async () => {
    setTransferState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/transfer`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setTransferState('error'); return }
      const d = await r.json() as TransferData
      setTransferData(d)
      setTransferState(d.transfers.length === 0 ? 'empty' : 'ok')
    } catch { setTransferState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'transfer' && !transferData) loadTransfer() }, [stage, tab, transferData, loadTransfer])
  async function transferAction(id: string, action: 'approve' | 'send' | 'receive') {
    if (!online) { setTransferMsg('You’re offline — transfers need a connection.'); return }
    setTransferBusy(id); setTransferMsg('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/transfer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transfer_id: id, action }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setTransferMsg(d.stock_changed ? `✓ ${action === 'send' ? 'Sent — stock left the origin outlet.' : 'Received — stock landed at the destination.'}` : d.idempotent ? 'Already done.' : '✓ Approved.'); setTransferData(null); loadTransfer(); loadHome(outletId) }
      else setTransferMsg(d.error ? `Couldn't ${action}: ${d.error}` : `Could not ${action}.`)
    } catch { setTransferMsg('Something went wrong.') }
    setTransferBusy(null)
  }

  // ── Expiring (batch buckets) ──
  const loadExpiring = useCallback(async () => {
    setExpState('loading')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/expiring`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setExpState('error'); return }
      const d = await r.json() as ExpData
      setExpData(d)
      setExpState(d.batches.length === 0 ? 'empty' : 'ok')
    } catch { setExpState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'expiring' && !expData) loadExpiring() }, [stage, tab, expData, loadExpiring])
  async function expiringAction(batchId: string, action: 'waste' | 'markdown') {
    if (!online) { setExpMsg('You’re offline — reconnect to action expiring stock.'); return }
    setExpBusy(batchId); setExpMsg('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/expiring`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: batchId, action }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setExpMsg(action === 'waste' ? (d.stock_changed ? `✓ Wasted ${d.wasted} — stock written off.` : 'Already cleared.') : '✓ Markdown flagged for the owner.'); setExpData(null); loadExpiring(); loadHome(outletId) }
      else setExpMsg(d.error ? `Couldn't ${action}: ${d.error}` : `Could not ${action}.`)
    } catch { setExpMsg('Something went wrong.') }
    setExpBusy(null)
  }

  // ── INV-4 stocktake / cycle / perpetual ──
  const loadStLines = useCallback(async (sessionId: string) => {
    try {
      const r = await fetch(`/api/inventory/app/${slug}/stocktake?session_id=${sessionId}`)
      if (r.ok) { const d = await r.json(); setStLines(d.lines ?? []) }
    } catch { /* ignore */ }
  }, [slug])
  const loadStCycle = useCallback(async (oid: string | null) => {
    try {
      const r = await fetch(`/api/inventory/app/${slug}/stocktake?cycle=1${oid ? `&outlet_id=${oid}` : ''}`)
      if (r.ok) { const d = await r.json(); setStCycle(d.cycle ?? []) }
    } catch { /* ignore */ }
  }, [slug])
  async function openStocktakeUi(type: 'full' | 'cycle' | 'perpetual') {
    setStBusy(true); setStType(type); setStState('loading'); setStSummary(null); setStPick(null); setStLines([]); setStCycle([])
    try {
      const r = await fetch(`/api/inventory/app/${slug}/stocktake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open', type, outlet_id: outletId }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.session) {
        setStSession({ id: d.session.id, count_type: d.session.count_type, status: d.session.status })
        await loadStLines(d.session.id)
        if (type === 'cycle') await loadStCycle(outletId)
        setStState('active')
      } else setStState('pick')
    } catch { setStState('pick') }
    setStBusy(false)
  }
  async function stSearchRun(term: string) {
    if (!term.trim()) return
    setStBusy(true); setStMatches([])
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?q=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'search') setStMatches(d.matches ?? [])
    } catch { /* ignore */ }
    setStBusy(false)
  }
  async function stPickProduct(id: string, name: string, expected: number) {
    setStPick({ id, name, expected }); setStCountVal(expected); setStMatches([]); setStSearch(''); setStPattern(null)
    try { const r = await fetch(`/api/inventory/app/${slug}/stocktake?pattern=${id}${outletId ? `&outlet_id=${outletId}` : ''}`); if (r.ok) { const d = await r.json(); setStPattern(d.pattern?.fact ?? null) } } catch { /* ignore */ }
  }
  async function stSubmitLine() {
    if (!stSession || !stPick) return
    setStBusy(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/stocktake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'count', session_id: stSession.id, product_id: stPick.id, counted: stCountVal }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) {
        const pickName = stPick.name
        const recountNeeded = d.line?.recount_required ?? false
        setStPick(null); await loadStLines(stSession.id); if (stType === 'cycle') await loadStCycle(outletId)
        setStRecountWarn(recountNeeded ? pickName : null)  // INV-DEPTH-COUNTING B
      }
    } catch { /* ignore */ }
    setStBusy(false)
  }
  async function stSubmitSession() {
    if (!stSession) return
    setStBusy(true)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/stocktake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', session_id: stSession.id }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.result) { setStSummary({ variances: d.result.variances, reviews: d.result.reviews_raised, total_cents: d.result.total_variance_cents, counted: d.result.lines_counted }); setStState('submitted'); loadHome(outletId) }
    } catch { /* ignore */ }
    setStBusy(false)
  }
  function resetStocktake() { setStType(null); setStSession(null); setStLines([]); setStCycle([]); setStPick(null); setStSummary(null); setStState('pick'); setStRecountWarn(null) }

  // ── INV-5 buying ──
  const loadBuying = useCallback(async (oid: string | null) => {
    setBuyState('loading'); setBuyPo(null)
    try {
      const [rg, rp] = await Promise.all([
        fetch(`/api/inventory/app/${slug}/buying?reorder=1${oid ? `&outlet_id=${oid}` : ''}`),
        fetch(`/api/inventory/app/${slug}/buying`),
      ])
      if (rg.status === 401 || rp.status === 401) { setStage('pick'); return }
      if (!rg.ok || !rp.ok) { setBuyState('error'); return }
      const dg = await rg.json(); const dp = await rp.json()
      setBuyGroups(dg.groups ?? []); setBuyPos(dp.pos ?? []); setBuyState('ok')
    } catch { setBuyState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'order') loadBuying(outletId) }, [stage, tab, outletId, loadBuying])
  async function draftFromGroup(g: BuyGroup) {
    if (g.needs_supplier || !g.supplier_id) return
    if (!online) { setBuyMsg('You’re offline — drafting a PO needs a connection.'); return }
    setBuyBusy(g.supplier_id); setBuyMsg('')
    try {
      const lines = g.items.map(i => ({ product_id: i.product_id, product_name: i.name, quantity: i.suggested_qty, unit_cost: i.unit_cost }))
      const r = await fetch(`/api/inventory/app/${slug}/buying`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'draft', supplier_id: g.supplier_id, lines }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.po) { setBuyMsg(`✓ Draft ${d.po.order_number} created — approve it below to send.`); loadBuying(outletId) }
      else setBuyMsg(d.error ? `Couldn’t draft: ${d.error}` : 'Could not create the draft.')
    } catch { setBuyMsg('Something went wrong.') }
    setBuyBusy(null)
  }
  async function openBuyPo(id: string) {
    setBuyPermErr('')
    try { const r = await fetch(`/api/inventory/app/${slug}/buying?po=${id}`); if (r.ok) { const d = await r.json(); setBuyPo({ po: d.po, lines: d.lines ?? [] }) } } catch { /* ignore */ }
  }
  async function approveBuyPo(id: string) {
    if (!online) { setBuyPermErr('You’re offline — a purchase order can’t be sent without a connection.'); return } // money: never queued
    setBuyBusy(id); setBuyPermErr('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/buying`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', po_id: id }) })
      const d = await r.json().catch(() => ({}))
      if (r.status === 403) { setBuyPermErr(d.message ?? 'A manager must approve this order.') }
      else if (r.ok) { setBuyMsg(d.idempotent ? 'Already sent.' : `✓ Approved & sent${d.channel === 'email' ? ` — emailed to ${d.supplier_email ?? 'the supplier'}` : ' (no supplier email — export a CSV from the dashboard)'}.`); setBuyPo(null); loadBuying(outletId) }
    } catch { setBuyPermErr('Something went wrong.') }
    setBuyBusy(null)
  }

  // ── INV-6 Pulse + Handover ──
  const loadPulse = useCallback(async (oid: string | null) => {
    try {
      const [rp, rh] = await Promise.all([
        fetch(`/api/inventory/app/${slug}/guidance${oid ? `?outlet_id=${oid}` : ''}`),
        fetch(`/api/inventory/app/${slug}/guidance?handover=1${oid ? `&outlet_id=${oid}` : ''}`),
      ])
      if (rp.ok) { const d = await rp.json(); setPulseData(d.pulse ?? null); setWeatherData(d.weather ?? null) }
      if (rh.ok) { const d = await rh.json(); setHandoverData(d.handover ?? null) }
    } catch { /* non-fatal — Pulse is a bonus view */ }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'tasks') loadPulse(outletId) }, [stage, tab, outletId, loadPulse])
  async function completeTaskUi(taskId: string) {
    setCompletingTask(taskId)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', task_id: taskId }) })
      if (r.ok) { setTasksData(td => td ? { ...td, tasks: td.tasks.map(t => t.id === taskId ? { ...t, status: 'done', completed_by: acting?.id ?? null } : t) } : td); loadPulse(outletId) }
    } catch { /* ignore */ }
    setCompletingTask(null)
  }

  // ── INV-7 fresh / production ──
  const loadFresh = useCallback(async (oid: string | null) => {
    setFreshState('loading'); setPrepPick(null); setPrepResult(null)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/fresh${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setFreshState('error'); return }
      const d = await r.json()
      setFreshRecipes(d.recipes ?? []); setFreshMarkdowns(d.markdowns?.proposals ?? []); setFreshTemp(d.temp ?? null); setFreshState('ok')
    } catch { setFreshState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'fresh') loadFresh(outletId) }, [stage, tab, outletId, loadFresh])
  async function prepRecipe() {
    if (!prepPick) return
    if (!online) { blockOffline(); return } // prep depletes stock — needs a connection
    setFreshBusy(true); setPrepResult(null)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/fresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prep', recipe_id: prepPick.id, batches: prepBatches, outlet_id: outletId }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.depleted) { setPrepResult({ lines: d.lines ?? [], total_value: d.total_value ?? 0 }); loadHome(outletId) }
      else setPrepResult({ lines: [], total_value: 0 })
    } catch { /* ignore */ }
    setFreshBusy(false)
  }
  async function logTempUi() {
    if (!tempForm.reading.trim()) return
    const payload = { action: 'log_temp', location: tempForm.location, reading_c: Number(tempForm.reading), threshold_c: tempForm.threshold.trim() ? Number(tempForm.threshold) : null, outlet_id: outletId }
    if (!online) { // INV-OFFLINE — queue the reading (note: it timestamps at sync time, not measurement time — see INV-OFFLINE-2)
      const ok = await enqueueSafe(`/api/inventory/app/${slug}/fresh`, payload, `Temp ${tempForm.location} ${tempForm.reading}°C`)
      if (ok) { const pass = !tempForm.threshold.trim() || Number(tempForm.reading) <= Number(tempForm.threshold); setTempMsg(pass ? `✓ ${tempForm.location} ${tempForm.reading}°C — saved offline.` : `⚠ ${tempForm.location} ${tempForm.reading}°C — ABOVE limit, saved offline.`); setTempForm(f => ({ ...f, reading: '' })) }
      return
    }
    setFreshBusy(true); setTempMsg('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/fresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setTempMsg(d.passed ? `✓ ${tempForm.location} ${tempForm.reading}°C — within safe range.` : `⚠ ${tempForm.location} ${tempForm.reading}°C — ABOVE the ${tempForm.threshold}°C limit. Flagged.`); setTempForm(f => ({ ...f, reading: '' })); loadFresh(outletId) }
    } catch (err) { if (err instanceof TypeError) await enqueueSafe(`/api/inventory/app/${slug}/fresh`, payload, `Temp ${tempForm.location} ${tempForm.reading}°C`) }
    setFreshBusy(false)
  }

  // ── INV-8 loss & compliance ──
  const loadLoss = useCallback(async (oid: string | null) => {
    setLossState('loading'); setRecallPick(null)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/loss${oid ? `?outlet_id=${oid}` : ''}`)
      if (r.status === 401) { setStage('pick'); return }
      if (!r.ok) { setLossState('error'); return }
      const d = await r.json()
      setLossHolds(d.quarantine?.holds ?? []); setLossFailedTemps(d.quarantine?.failed_temps ?? []); setLossAtRisk(d.quarantine?.total_at_risk ?? 0); setLossShrink(d.shrinkage ?? null); setLossState('ok')
    } catch { setLossState('error') }
  }, [slug])
  useEffect(() => { if (stage === 'app' && tab === 'loss') loadLoss(outletId) }, [stage, tab, outletId, loadLoss])
  async function recallSearchRun(term: string) {
    if (!term.trim()) return
    setLossBusy('search'); setRecallMatches([]); setRecallFromCache(false)
    try {
      const r = await fetch(`/api/inventory/app/${slug}/scan?q=${encodeURIComponent(term.trim())}${outletId ? `&outlet_id=${outletId}` : ''}`)
      const d = await r.json()
      if (d.mode === 'search') setRecallMatches(d.matches ?? [])
      else if (d.offline) {
        const hits = catalogSearch(term)
        setRecallMatches(hits.map(p => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, on_hand: p.on_hand })))
        setRecallFromCache(true)
      }
    } catch { /* ignore */ }
    setLossBusy(null)
  }
  async function placeRecall() {
    if (!recallPick) return
    if (!online) { setLossMsg('You’re offline — reconnect to place a hold.'); return }
    setLossBusy('recall'); setLossMsg('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/loss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'recall', product_id: recallPick.id, quantity: recallQty, reason: recallReason, outlet_id: outletId }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) { setLossMsg(`✓ ${recallPick.name} placed on hold (${recallQty}). Stock is not sellable until resolved.`); setRecallPick(null); setRecallMatches([]); setRecallSearch(''); setLossTab('quarantine'); loadLoss(outletId) }
      else setLossMsg('Could not place the hold.')
    } catch { setLossMsg('Something went wrong.') }
    setLossBusy(null)
  }
  async function resolveHoldUi(holdId: string, resolution: 'released' | 'disposed' | 'returned_to_supplier') {
    if (!online) { setLossPermErr('You’re offline — resolving a hold needs a connection.'); return }
    setLossBusy(holdId); setLossPermErr('')
    try {
      const r = await fetch(`/api/inventory/app/${slug}/loss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve', hold_id: holdId, resolution, outlet_id: outletId }) })
      const d = await r.json().catch(() => ({}))
      if (r.status === 403) setLossPermErr(d.message ?? 'A manager must resolve a hold.')
      else if (r.ok) { setLossMsg(resolution === 'released' ? '✓ Released — back to sellable.' : resolution === 'disposed' ? `✓ Disposed — written off${d.new_on_hand != null ? ` (now ${d.new_on_hand})` : ''}.` : '✓ Returned to supplier.'); loadLoss(outletId); loadHome(outletId) }
    } catch { setLossPermErr('Something went wrong.') }
    setLossBusy(null)
  }

  // ── INV-OFFLINE — detect offline, queue safe writes, replay on reconnect ──
  const refreshPending = useCallback(async () => { const w = await allWrites(); setPending(w.filter(x => x.status === 'pending').length) }, [])
  const replayQueue = useCallback(async () => {
    const w = (await allWrites()).filter(x => x.status === 'pending').sort((a, b) => a.client_ts - b.client_ts)
    if (w.length) {
      setSyncing(true); let failed = 0
      for (const e of w) {
        try {
          const r = await fetch(e.endpoint, { method: e.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e.payload) })
          if (r.ok) { const d = await r.json().catch(() => ({})); if (d && d.ok === false) { await markFailed(e.id!, (d.error as string) ?? 'rejected'); failed++ } else await removeWrite(e.id!) }
          else if (r.status >= 400 && r.status < 500 && r.status !== 401) { await markFailed(e.id!, `rejected (${r.status})`); failed++ }
          // 401 (session expired) / 5xx / network mid-sync → leave pending, retry next reconnect
        } catch { break } // a network blip mid-replay — stop, keep the rest pending
      }
      setSyncing(false); await refreshPending()
      setSyncMsg(failed ? `${failed} change${failed === 1 ? '' : 's'} couldn’t sync — review` : 'Synced ✓')
      setTimeout(() => setSyncMsg(''), 6000)
    }
    loadHome(outletId)
    if (tab === 'tasks') loadTasks(outletId)
    else if (tab === 'waste') loadWasteToday(outletId)
    else if (tab === 'reports') loadReports(reportPeriod, outletId)
    // Refresh catalog so on_hand values are fresh after sync.
    productCatalogRef.current = []; prefetchCatalog()
  }, [refreshPending, loadHome, loadTasks, loadWasteToday, loadReports, prefetchCatalog, tab, reportPeriod, outletId])
  useEffect(() => {
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine)
    refreshPending()
    const goOnline = () => { setOnline(true); replayQueue() }
    const goOffline = () => setOnline(false)
    if (typeof window !== 'undefined') { window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline) }
    return () => { if (typeof window !== 'undefined') { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) } }
  }, [refreshPending, replayQueue])
  // Queue a SAFE write (waste/temp/count) + optimistic toast. Returns false if it couldn't be persisted.
  const enqueueSafe = useCallback(async (endpoint: string, payload: unknown, label: string): Promise<boolean> => {
    const ok = await enqueueWrite({ endpoint, method: 'POST', payload, label, client_ts: Date.now() })
    if (ok) { await refreshPending(); setOfflineToast('✓ Saved offline — will sync when you reconnect'); setTimeout(() => setOfflineToast(''), 4000) }
    else { setOfflineToast('Couldn’t save offline on this device — reconnect to record it'); setTimeout(() => setOfflineToast(''), 5000) }
    return ok
  }, [refreshPending])
  // Block a NON-queueable write (money / stock move) when offline — clear message, never a silent fail.
  const blockOffline = useCallback(() => { setOfflineToast('You’re offline — reconnect to do this'); setTimeout(() => setOfflineToast(''), 4000) }, [])

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

  // ── shells (INV-PIPEL — Pipel chrome: ink-bordered phone, lime/ink top bar, time-aware greeting, fixed nav) ──
  // INV-OFFLINE — a global offline / pending-sync banner + a transient toast (queued-saved / blocked-offline).
  const offlineBanner = (!online || pending > 0 || syncing || syncMsg) ? (
    <div style={{ flexShrink: 0, padding: '8px 16px', textAlign: 'center', fontSize: 12, fontWeight: 700, lineHeight: 1.35,
      background: !online ? P.ink : syncMsg.includes('couldn') ? P.red : P.lime, color: !online ? P.lime : syncMsg.includes('couldn') ? '#fff' : P.ink }}>
      {!online
        ? (pending > 0 ? `Offline · ${pending} change${pending === 1 ? '' : 's'} waiting to sync` : 'You’re offline — counts, waste & temp logs save and sync when you reconnect')
        : syncing ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
          : syncMsg ? syncMsg
            : `${pending} change${pending === 1 ? '' : 's'} pending sync`}
    </div>
  ) : null
  const offlineToastEl = offlineToast ? (
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 92, zIndex: 50, background: P.ink, color: '#fff', borderRadius: 14, padding: '11px 14px', fontSize: 12.5, fontWeight: 700, textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>{offlineToast}</div>
  ) : null
  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100dvh', background: '#cfd2cc', display: 'flex', justifyContent: 'center', fontFamily: BODY, color: P.ink }}>
      <div style={{ width: '100%', maxWidth: 440, background: P.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 0 60px rgba(20,30,20,.18)' }}>{offlineBanner}{children}{offlineToastEl}</div>
    </div>
  )
  const statusbar = <PipelStatusBar right={`${boot?.business.name ?? 'Sip'} · PWA`} />
  const header = (mini?: boolean, title?: string, subtitle?: string) => (
    <>
      <PipelTopBar word={(boot?.business.name ?? 'sip').toLowerCase()} crest={((boot?.business.name ?? 'S')[0] ?? 'S').toUpperCase()} acting={acting} onSwitch={logout} />
      {!mini && acting && <PipelGreeting word={pgreet()} name={pfirst(acting.name)} dateLine={`${pipelDate()}${(boot?.outlets.length ?? 0) > 1 ? ' · stock is per-outlet' : ''}`} />}
      {mini && title && <PipelTitle title={title.toLowerCase()} subtitle={subtitle} />}
    </>
  )
  const tabbar = <PipelBottomNav active={tab} onHome={() => setTab('home')} onTasks={() => setTab('tasks')} onScan={() => setTab('scan')} onReports={() => setTab('reports')} onReview={() => setTab('review')} />

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
              style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, cursor: 'pointer', fontFamily: BODY, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
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
              style={{ height: 64, borderRadius: 16, border: `1.5px solid ${T.line}`, background: '#fff', fontFamily: DISPLAY, fontSize: k === 'del' ? 16 : 28, fontWeight: 600, color: T.ink, cursor: 'pointer' }}>{k === 'del' ? '⌫' : k}</button>
          ))}
        </div>
      </div>
    </>
  )

  // ── APP (logged in) ──
  const body = (children: React.ReactNode) => <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>{children}</div>
  const stub = (title: string, note: string) => shell(<>{statusbar}{header(true, title, note)}{body(
    <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>🧰</div><p style={{ fontSize: 16, fontFamily: DISPLAY, marginBottom: 6 }}>Coming in the next update</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>This screen is being built. Your acting session (<b>{acting?.name}</b>) carries through so every action is attributed to you.</p></div>
  )}{tabbar}</>)

  if (tab === 'tasks') {
    const pills = tasksData?.pills
    const open = (tasksData?.tasks ?? []).filter(t => t.status === 'open')
    const done = (tasksData?.tasks ?? []).filter(t => t.status === 'done')
    const active = (tasksData?.tasks ?? []).find(t => t.id === activeId && t.status === 'open')
    const variance = active ? countVal - (active.expected ?? 0) : 0
    const tasksHeader = (
      <>
        <PipelTopBar word={(boot?.business.name ?? 'sip').toLowerCase()} crest={((boot?.business.name ?? 'S')[0] ?? 'S').toUpperCase()} acting={acting} onSwitch={logout} />
        <PipelTitle title="today" subtitle={`${open.length} task${open.length === 1 ? '' : 's'} · Aria built your list from real sales`} />
        <div style={{ display: 'flex', gap: 9, margin: '12px 16px 2px' }}>
          {[[pills?.accuracy != null ? `${pills.accuracy}%` : 'new', 'count accuracy'], [String(pills?.streak ?? 0), 'day streak'], [String(pills?.left_today ?? open.length), 'left today']].map(([v, k]) => (
            <div key={k} style={{ flex: 1, background: P.bg, border: `1.5px solid ${P.ink}`, borderRadius: 16, padding: 11, textAlign: 'center' }}>
              <b style={{ fontSize: 22, fontWeight: 800, display: 'block', lineHeight: 1 }}>{v}</b><span style={{ fontSize: 10.5, color: P.muted, fontWeight: 600 }}>{k}</span>
            </div>
          ))}
        </div>
      </>
    )
    const taskCard = (children: React.ReactNode, extra?: React.CSSProperties) => <div style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 18, padding: 14, marginBottom: 11, ...extra }}>{children}</div>
    const checkRow = (t: Task, isDone: boolean) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div onClick={() => {
          if (isDone) return
          if ((t.task_type === 'count' || t.task_type === 'cycle_count') && t.product_id) { setActiveId(t.id); setCountVal(t.expected ?? 0); setCountMsg(null) }
          else completeTaskUi(t.id) // INV-6 — velocity/weather/expiring/receive complete here (attributed); count routes to the count card
        }}
          style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${P.ink}`, background: isDone ? P.lime : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: completingTask === t.id ? 0.5 : 1 }}>
          {isDone && <svg width="14" height="14" fill="none" stroke={P.ink} strokeWidth={3} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>}
        </div>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 14, fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? T.muted : T.ink }}>{t.title}</b>
          {(t.task_type === 'velocity' || t.task_type === 'weather') && t.hypothesis
            ? <span style={{ display: 'block', fontSize: 11.5, color: P.muted, marginTop: 2, lineHeight: 1.4 }}>{t.hypothesis}</span>
            : t.detail && <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{t.detail}</span>}
        </div>
        {!isDone && (t.task_type === 'velocity' || t.task_type === 'weather') && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 7, border: `1.5px solid ${P.ink}`, background: t.task_type === 'weather' ? '#fff' : P.lime, textTransform: 'uppercase' }}>{t.task_type}</span>}
      </div>
    )
    // INV-6 — Pulse snapshot (grounded, per-outlet) + Handover
    const pulseCard = pulseData && (
      <div style={{ background: P.ink, color: '#fff', borderRadius: 22, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div><div style={{ fontSize: 11, color: '#cfd2cc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>pulse · today</div><div style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.1, marginTop: 3 }}>${pulseData.today_revenue.toFixed(0)}</div></div>
          {pulseData.vs_baseline_pct != null && <span style={{ fontSize: 12, fontWeight: 800, color: pulseData.vs_baseline_pct < 0 ? P.red : P.lime }}>{pulseData.vs_baseline_pct > 0 ? '+' : ''}{pulseData.vs_baseline_pct}% vs avg</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9aa3b2', marginTop: 2 }}>{pulseData.today_txns} txns · baseline ${pulseData.baseline_avg.toFixed(0)}/day{pulseData.top_movers.length ? ` · top: ${pulseData.top_movers.map(m => m.name).slice(0, 2).join(', ')}` : ''}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
          {([['done', pulseData.tasks_done, P.lime], ['open', pulseData.tasks_open, '#fff'], ['low', pulseData.attention.below_reorder, P.lime], ['expiring', pulseData.attention.expiring, '#fff'], ['review', pulseData.attention.open_reviews, '#fff']] as const).map(([k, v, col]) => (
            <div key={k} style={{ flex: 1, textAlign: 'center' }}><div style={{ fontWeight: 800, fontSize: 18, color: col as string }}>{v}</div><div style={{ fontSize: 9, color: '#9aa3b2', marginTop: 1 }}>{k}</div></div>
          ))}
        </div>
        {weatherData && (
          <div style={{ fontSize: 10.5, color: '#cfd2cc', marginTop: 12, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.12)', lineHeight: 1.4 }}>
            ☂ rain {weatherData.forecast_rain_pct ?? '—'}% tomorrow · {weatherData.sufficient && weatherData.rain_lift_pct != null ? `your rain-day sales ${weatherData.rain_lift_pct >= 0 ? '+' : ''}${weatherData.rain_lift_pct}% (${weatherData.matched_days}d)` : `correlation: ${weatherData.reason ?? 'n/a'}`}
          </div>
        )}
        {pulseData.top_waste_7d != null && (
          <div style={{ fontSize: 10.5, color: '#cfd2cc', marginTop: 12, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.12)', lineHeight: 1.4 }}>
            <span style={{ color: '#9aa3b2', fontWeight: 600 }}>waste 7d:</span>
            {pulseData.top_waste_7d.length === 0
              ? <span style={{ color: '#9aa3b2' }}>{' '}nothing logged this week</span>
              : pulseData.top_waste_7d.map((w, i) => (
                  <span key={i}>{i > 0 ? ' · ' : ' '}{w.name} <span style={{ color: P.red }}>{`$${Math.round(w.cost_cents / 100)}`}</span></span>
                ))
            }
          </div>
        )}
      </div>
    )
    const handoverSection = handoverData && (
      <div style={{ marginTop: 18 }}>
        <button onClick={() => setShowHandover(s => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: `1.5px solid ${P.ink}`, borderRadius: 16, padding: '12px 14px', cursor: 'pointer', fontFamily: BODY }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>shift handover</span>
          <span style={{ fontSize: 11.5, color: P.muted, fontWeight: 600 }}>{handoverData.done.length} done · {handoverData.open.length} open {showHandover ? '▲' : '▼'}</span>
        </button>
        {showHandover && (
          <div style={{ background: '#fff', border: `1.5px solid ${P.ink}`, borderTop: 'none', borderRadius: '0 0 16px 16px', padding: 14, marginTop: -8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', margin: '2px 0 7px' }}>done this shift</div>
            {handoverData.done.length === 0 ? <div style={{ fontSize: 12, color: P.muted, marginBottom: 8 }}>Nothing completed yet.</div> : handoverData.done.map((d, i) => <div key={i} style={{ fontSize: 12.5, padding: '4px 0' }}>✓ {d.title} <span style={{ color: P.muted }}>· {d.by}</span></div>)}
            <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', margin: '11px 0 7px' }}>still open ({handoverData.open.length})</div>
            {handoverData.open.slice(0, 8).map((o, i) => <div key={i} style={{ fontSize: 12.5, padding: '4px 0' }}>○ {o.title} <span style={{ fontSize: 10, color: P.muted, border: `1px solid ${P.ink}`, borderRadius: 5, padding: '0 4px' }}>{o.type}</span></div>)}
            <div style={{ fontSize: 11.5, color: P.amber, fontWeight: 700, marginTop: 11, background: P.amberSoft, border: `1.5px solid ${P.amber}`, borderRadius: 10, padding: '8px 11px', lineHeight: 1.4 }}>⚑ next shift: {handoverData.flagged.below_reorder} to reorder · {handoverData.flagged.expiring} expiring · {handoverData.flagged.open_reviews} in review</div>
          </div>
        )}
      </div>
    )
    return shell(
      <>
        {statusbar}{tasksHeader}
        {body(
          <>
          {pulseCard}
          {tasksState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(4)].map((_, i) => <div key={i} style={{ height: i === 1 ? 220 : 56, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />)}</div>
          ) : tasksState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load your tasks</p><button onClick={() => loadTasks(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: P.lime, color: P.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : tasksState === 'empty' ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>✓</div><p style={{ fontSize: 18, fontFamily: DISPLAY, marginBottom: 6 }}>No tasks today — you&apos;re clear</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>Aria didn&apos;t find anything that needs counting right now. New tasks appear as stock runs low or items near expiry.</p></div>
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
                        <div style={{ fontFamily: DISPLAY, fontSize: 48, fontWeight: 600, minWidth: 70, textAlign: 'center', lineHeight: 1 }}>{countVal}</div>
                        <button onClick={() => setCountVal(v => v + 1)} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                      </div>
                      <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
                        {[['Aria expects', active.expected ?? 0, T.paper, T.ink], ['You counted', countVal, T.greenSoft, T.green], ['Variance', `${variance > 0 ? '+' : ''}${variance}`, variance === 0 ? T.greenSoft : T.redSoft, variance === 0 ? T.green : T.red]].map(([l, v, bg, col], i) => (
                          <div key={i} style={{ flex: 1, borderRadius: 12, padding: 11, textAlign: 'center', background: bg as string }}>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: T.muted }}>{l}</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, marginTop: 3, color: col as string }}>{v}</div>
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
                        <button onClick={() => submitCount(active)} disabled={submitting} style={{ width: '100%', background: P.lime, color: P.ink, border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Submitting…' : 'Submit count'}</button>
                      ) : (
                        <div style={{ width: '100%', background: P.lime, color: P.ink, borderRadius: 13, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{countMsg.review ? '✓ Sent to owner review' : '✓ Count matches — recorded'}</div>
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
          )}
          {handoverSection}
          </>
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
            <div style={{ marginBottom: 14 }}>
              <PipelSegment
                inset={false}
                options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
                value={reportPeriod}
                onChange={(v) => setReportPeriod(v)}
              />
            </div>

            {reportsState === 'loading' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: i === 0 ? 80 : 130, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />)}</div>
            ) : reportsState === 'error' ? (
              <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load reports</p><button onClick={() => loadReports(reportPeriod, outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: P.lime, color: P.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
            ) : (
              <>
                {k && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 14 }}>
                    <PipelStat n={money(k.stock_at_cost)} k="stock at cost" />
                    <PipelStat n={money(k.stock_at_retail)} k="at retail" />
                    <PipelStat n={String(k.units_sold)} k="units sold" />
                    <PipelStat n={money(k.shrinkage_dollars)} k="shrinkage" tone={k.shrinkage_dollars > 0 ? 'alert' : undefined} />
                  </div>
                )}

                {reportsState === 'empty' && (
                  <div style={{ padding: 24, textAlign: 'center', background: '#fff', borderRadius: 14, border: `1.5px solid ${T.line}`, marginBottom: 14 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
                    <p style={{ fontSize: 14, fontFamily: DISPLAY, marginBottom: 3 }}>No data for this period yet</p>
                    <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>Once you make sales or log counts/waste, the figures appear here. You can still export any report below.</p>
                  </div>
                )}

                {soldSection && soldSection.rows.length > 0 && (
                  <div style={{ background: '#fff', border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 16, marginBottom: 16, boxShadow: HARD_SHADOW }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <b style={{ fontSize: 15, fontWeight: 800 }}>sold vs on-hand</b>
                      <span style={{ fontSize: 11, color: P.muted, fontWeight: 600 }}>{rep?.period_label}</span>
                    </div>
                    <div style={{ display: 'flex', fontSize: 10, fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', padding: '0 2px 8px' }}>
                      <span style={{ flex: 1 }}>Product</span><span style={{ width: 60, textAlign: 'right' }}>Sold</span><span style={{ width: 64, textAlign: 'right' }}>On hand</span>
                    </div>
                    {soldSection.rows.slice(0, 12).map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '9px 2px', borderTop: `1.5px solid ${P.ink}`, fontSize: 13 }}>
                        <span style={{ flex: 1, fontWeight: 700 }}>{r[0]}</span>
                        <span style={{ width: 60, textAlign: 'right', fontWeight: 800 }}>{r[1]}</span>
                        <span style={{ width: 64, textAlign: 'right', fontWeight: 600 }}>{r[2]}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ margin: '4px 2px 12px', fontSize: 16, fontWeight: 800 }}>report library</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
                  {lib.map(item => {
                    const ls = reportLiveStat(item.type, k)
                    const variant = item.type === 'sold_vs_stock' ? 'featured' : item.type === 'shrinkage_waste' ? 'loss' : 'default'
                    return (
                      <PipelTile
                        key={item.type}
                        icon={reportIcon(item.type)}
                        label={item.title}
                        statValue={ls?.v}
                        statSuffix={ls ? ls.s : item.blurb}
                        variant={variant}
                        onClick={() => exportReport(item.type)}
                      />
                    )
                  })}
                </div>
                <div style={{ fontSize: 10.5, color: P.muted, textAlign: 'center', marginTop: 16, lineHeight: 1.5, fontWeight: 500 }}>Tap a report to export a branded PDF. The owner can schedule any of these to auto-email daily or weekly from the dashboard.</div>
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
        <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, marginTop: 3, color: col }}>{v}</div>
      </div>
    )
    return shell(
      <>
        {statusbar}{header(true, 'Review', counts ? `${counts.open} open · ${counts.resolved_today} resolved today` : 'Owner review queue')}
        {body(
          reviewState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 170, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />)}</div>
          ) : reviewState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load the review queue</p><button onClick={() => loadReview(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: P.lime, color: P.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : reviewState === 'empty' ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>✓</div><p style={{ fontSize: 18, fontFamily: DISPLAY, marginBottom: 6 }}>All clear — nothing to review</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>When a staff count doesn&apos;t match the book stock, it lands here for you to accept or investigate. Nothing changes your stock until you do.</p></div>
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
                  <div key={rv.id} style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 16, padding: 14, marginBottom: 11, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
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
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Raised by <b style={{ color: T.ink }}>{rv.staff_name}</b> · {timeAgo(rv.created_at)}{v !== 0 ? ` · ${Math.abs(v)} units ${v < 0 ? 'short' : 'over'}` : ''}</div>
                    {/* INV-DEPTH-COUNTING E: movement context — shown when stock moved during the count */}
                    {rv.flag_type === 'count_variance' && typeof rv.evidence?.movements_during_count === 'number' && (rv.evidence.movements_during_count as number) > 0 && (
                      <div style={{ fontSize: 10.5, color: T.amber, background: T.amberSoft, borderRadius: 9, padding: '6px 10px', marginBottom: 9, lineHeight: 1.4 }}>
                        &#9432; {rv.evidence.movements_during_count as number} stock movement{(rv.evidence.movements_during_count as number) > 1 ? 's' : ''} occurred while this count was open — may explain the variance.
                      </div>
                    )}
                    {/* INV-DEPTH-COUNTING B: recount required indicator */}
                    {rv.flag_type === 'count_variance' && rv.evidence?.recount_required === true && (
                      <div style={{ fontSize: 10.5, color: '#7A5C00', background: '#FEF9C3', border: '1px solid #F5C518', borderRadius: 9, padding: '6px 10px', marginBottom: 9, lineHeight: 1.4 }}>
                        &#9888; High variance — a second count is required before accepting.
                      </div>
                    )}
                    {/* INV-DEPTH-COUNTING D: reason code — optional, shown for count_variance accept */}
                    {rv.flag_type === 'count_variance' && (
                      <select value={reviewReasons[rv.id] ?? ''} onChange={e => setReviewReasons(prev => ({ ...prev, [rv.id]: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid ' + T.line, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 12, fontWeight: 500, marginBottom: 9, appearance: 'none', WebkitAppearance: 'none' }}>
                        <option value="">Reason (optional)</option>
                        <option value="mis_count">Mis-count</option>
                        <option value="receiving_error">Receiving error</option>
                        <option value="spoilage">Spoilage</option>
                        <option value="theft_suspected">Theft (suspected)</option>
                        <option value="supplier_short">Supplier short</option>
                        <option value="other">Other</option>
                      </select>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={busy} onClick={() => reviewAction(rv.id, 'accept', reviewReasons[rv.id] || undefined)} style={{ flex: 1.5, background: P.lime, color: P.ink, border: 0, borderRadius: 11, padding: '11px 6px', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : rv.flag_type === 'count_variance' ? 'Accept · adjust stock' : 'Accept'}</button>
                      {rv.status !== 'investigating' && <button disabled={busy} onClick={() => reviewAction(rv.id, 'investigate')} style={{ flex: 1, background: '#fff', color: T.amber, border: '1.5px solid ' + T.amberSoft, borderRadius: 11, padding: '11px 6px', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Investigate</button>}
                      <button disabled={busy} onClick={() => reviewAction(rv.id, 'dismiss')} style={{ flex: 0.9, background: '#fff', color: T.muted, border: '1.5px solid ' + T.line, borderRadius: 11, padding: '11px 6px', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
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
    const multiOutlet = (boot?.outlets.length ?? 0) > 1
    const field = (label: string, required: boolean, value: string, onChange: (v: string) => void, ph: string, dec?: boolean) => (
      <div style={{ marginBottom: 11 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: P.muted, marginBottom: 5 }}>{label}{required ? ' *' : ''}</div>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={ph} inputMode={dec ? 'decimal' : undefined}
          onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${P.lime}` }} onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
          style={{ width: '100%', padding: '11px 13px', borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', color: P.ink, fontFamily: BODY, fontSize: 14, outline: 'none' }} />
      </div>
    )
    return shell(
      <>
        {statusbar}{header(true, 'Scan', 'Look up an item · live stock')}
        {body(
          <>
            <div style={{ background: T.ink, color: '#fff', borderRadius: 16, padding: 18, marginBottom: 13, textAlign: 'center' }}>
              <div style={{ width: 58, height: 58, borderRadius: 16, background: 'rgba(217,245,78,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <svg width="28" height="28" fill="none" stroke={T.sage} strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" /></svg>
              </div>
              <p style={{ fontFamily: DISPLAY, fontSize: 18 }}>Scan a barcode</p>
              {scanMode === 'camera' && cameraSupported ? (
                <>
                  <p style={{ fontSize: 11.5, color: '#9aa3b2', marginTop: 2, lineHeight: 1.5 }}>Point the rear camera at a barcode.</p>
                  <PipelScanner active={scanMode === 'camera'} onDecode={t => runScan(t, 'barcode')} onDenied={() => { setScanMode('type'); setCameraDenied(true) }} />
                  <button onClick={() => setScanMode('type')} style={{ marginTop: 11, background: 'none', border: 'none', color: '#9aa3b2', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>type the barcode instead</button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 11.5, color: cameraDenied ? '#ffb4b2' : '#9aa3b2', marginTop: 2, lineHeight: 1.5 }}>{cameraDenied ? 'Camera blocked — type the barcode, or search by name below.' : 'Type the barcode, or search by name below.'}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input value={scanInput} onChange={e => setScanInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runScan(scanInput, 'barcode') }} placeholder="Barcode…" inputMode="numeric"
                      style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', fontFamily: BODY, fontSize: 13, outline: 'none' }} />
                    <button onClick={() => runScan(scanInput, 'barcode')} style={{ background: T.sage, color: '#0E1812', border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Look up</button>
                  </div>
                  {cameraSupported && <button onClick={() => { setScanMode('camera'); setCameraDenied(false) }} style={{ marginTop: 11, background: 'none', border: 'none', color: '#9aa3b2', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>{cameraDenied ? 'try the camera again' : 'use the camera'}</button>}
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 13 }}>
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runScan(searchInput, 'q') }} placeholder="Search by name or SKU…"
                style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none' }} />
              <button onClick={() => runScan(searchInput, 'q')} style={{ background: P.lime, color: P.ink, border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            </div>

            {scanState === 'idle' && <div style={{ padding: 28, textAlign: 'center', color: T.muted }}><p style={{ fontSize: 13, lineHeight: 1.6 }}>Look up any item to see its live on-hand, cost and how fast it sells.</p></div>}
            {scanState === 'searching' && <div style={{ height: 150, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />}
            {scanState === 'error' && <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Lookup failed. Try again.</div>}
            {scanState === 'notfound' && !addForm && (
              <div style={{ padding: 22, borderRadius: 22, background: '#fff', border: `1.5px solid ${P.ink}`, textAlign: 'center', boxShadow: HARD_SHADOW }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>🔍</div>
                <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>No match</p>
                <p style={{ fontSize: 12, color: P.muted, lineHeight: 1.5, fontWeight: 500, marginBottom: notFoundCtx ? 14 : 0 }}>{scanNote}</p>
                {notFoundCtx && <PipelButton onClick={startAddProduct}>+ Add to catalogue</PipelButton>}
              </div>
            )}
            {addForm && (
              <div style={{ padding: 16, borderRadius: 22, background: '#fff', border: `1.5px solid ${P.ink}`, boxShadow: HARD_SHADOW }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, border: `1.5px solid ${P.ink}`, background: P.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><PIcon name="plus-circle" size={22} /></div>
                  <div><div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.05 }}>add to catalogue</div><div style={{ fontSize: 11.5, color: P.muted, fontWeight: 500, marginTop: 2 }}>creates the product, then opens its price-check</div></div>
                </div>
                {field('Product name', true, addForm.name, v => setAddForm(f => f && ({ ...f, name: v })), 'e.g. Oat Milk 1L')}
                {field('Category', false, addForm.category, v => setAddForm(f => f && ({ ...f, category: v })), 'e.g. Milk')}
                {field('Retail price', true, addForm.price, v => setAddForm(f => f && ({ ...f, price: v })), '0.00', true)}
                {field('Unit cost (optional)', false, addForm.cost, v => setAddForm(f => f && ({ ...f, cost: v })), '0.00', true)}
                {field('Barcode (optional)', false, addForm.barcode, v => setAddForm(f => f && ({ ...f, barcode: v })), 'scanned code')}
                {addErr && <p style={{ fontSize: 12, color: P.red, fontWeight: 600, margin: '2px 0 10px' }}>{addErr}</p>}
                <PipelButton onClick={submitAddProduct} disabled={addBusy} style={{ marginTop: 4 }}>{addBusy ? 'Adding…' : 'Add product'}</PipelButton>
                <button onClick={() => { setAddForm(null); setAddErr('') }} style={{ width: '100%', marginTop: 9, background: 'none', color: P.muted, border: 'none', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>cancel</button>
              </div>
            )}
            {scanState === 'found' && scanMatches.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {scanMatches.map(m => (
                  <button key={m.id} onClick={() => pickMatch(m.id)} style={{ textAlign: 'left', background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 13, padding: '12px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</b><div style={{ fontSize: 11, color: T.muted }}>{m.sku ? `SKU ${m.sku} · ` : ''}{money(m.price)}</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: T.green }}>{m.on_hand}</div><div style={{ fontSize: 9.5, color: T.muted }}>on hand</div></div>
                  </button>
                ))}
              </div>
            )}
            {scanState === 'found' && scanResult && (
              <div style={{ background: '#fff', border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 16, boxShadow: HARD_SHADOW }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, border: `1.5px solid ${P.ink}`, background: P.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><PIcon name="scan" size={22} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.05 }}>{scanResult.name}</div>
                    <div style={{ fontSize: 11.5, color: P.muted, fontWeight: 600, marginTop: 2 }}>{scanResult.sku ? `SKU ${scanResult.sku}` : 'no SKU'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
                  <PipelStat n={scanResult.on_hand} k="on hand" />
                  <PipelStat n={money(scanResult.price)} k="price" />
                  <PipelStat n={scanResult.cost != null && scanResult.price > 0 ? `${Math.round(((scanResult.price - scanResult.cost) / scanResult.price) * 100)}%` : '—'} k="margin" />
                </div>
                <div style={{ display: 'flex', gap: 9, marginBottom: 4 }}>
                  <PipelStat n={scanResult.cost != null ? money(scanResult.cost) : '—'} k="unit cost" />
                  <PipelStat n={scanResult.units_per_day} k="sells / day" />
                  <PipelStat n={scanResult.days_of_cover != null ? scanResult.days_of_cover : '—'} k="days cover" tone={scanResult.days_of_cover != null && scanResult.days_of_cover < 7 ? 'alert' : undefined} />
                </div>
                <div style={{ fontSize: 10.5, color: P.muted, fontWeight: 600, textAlign: 'center', margin: '9px 0 12px' }}>cost basis · {scanResult.cost_source}</div>
                {multiOutlet && (scanResult.locate?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: 13 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 8px' }}>in stock by outlet</div>
                    {scanResult.locate!.map(l => (
                      <div key={l.outlet_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 13px', border: `1.5px solid ${P.ink}`, borderRadius: 14, marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{l.outlet_name.replace(/^\[TEST\]\s*/, '')}</span>
                        <span style={{ fontWeight: 800, fontSize: 16 }}>{l.items_on_hand}</span>
                      </div>
                    ))}
                  </div>
                )}
                {scanCount == null ? (
                  <>
                    <button onClick={() => { setScanCount(scanResult.on_hand); setScanCountMsg(null) }} style={{ width: '100%', background: P.lime, color: P.ink, border: 0, borderRadius: 13, padding: 13, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>Count this item</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setWasteProduct({ id: scanResult.id, name: scanResult.name, unit_cost: scanResult.cost, on_hand: scanResult.on_hand }); setWasteQty(1); setWasteReason('spoilage'); setWasteOther(''); setWasteMsg(null); setTab('waste') }} style={{ flex: 1, background: '#fff', color: T.red, border: `1.5px solid ${T.redSoft}`, borderRadius: 13, padding: 11, fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Log waste</button>
                      <button onClick={() => { setAdjustProduct({ id: scanResult.id, name: scanResult.name, unit_cost: scanResult.cost, on_hand: scanResult.on_hand }); setAdjustMode('set'); setAdjustValue(scanResult.on_hand); setAdjustReason(''); setAdjustOther(''); setAdjustMsg(null); setAdjustErr(''); setTab('adjust') }} style={{ flex: 1, background: '#fff', color: '#534AB7', border: `1.5px solid ${T.violetSoft}`, borderRadius: 13, padding: 11, fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Adjust</button>
                    </div>
                  </>
                ) : scanCountMsg ? (
                  <>
                    <div style={{ width: '100%', background: P.lime, color: P.ink, borderRadius: 13, padding: 13, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{scanCountMsg.review ? '✓ Sent to owner review' : '✓ Count matches — recorded'}</div>
                    <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>Logged as <b style={{ color: T.green }}>{acting?.name}</b> · stock unchanged{scanCountMsg.review ? ' — the owner reviews the variance' : ''}</div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '2px 0 12px' }}>
                      <button onClick={() => setScanCount(v => Math.max(0, (v ?? 0) - 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                      <div style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 600, minWidth: 64, textAlign: 'center', lineHeight: 1 }}>{scanCount}</div>
                      <button onClick={() => setScanCount(v => (v ?? 0) + 1)} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                    </div>
                    <button onClick={() => submitScanCount(scanResult)} disabled={scanCounting} style={{ width: '100%', background: P.lime, color: P.ink, border: 0, borderRadius: 13, padding: 13, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: scanCounting ? 0.6 : 1 }}>{scanCounting ? 'Submitting…' : 'Submit count'}</button>
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
    const reasons = wasteToday?.reasons ?? ['spoilage', 'prep_error', 'over_portion', 'breakage', 'expired', 'damaged', 'other']
    const costOfWaste = wasteProduct?.unit_cost != null ? wasteProduct.unit_cost * wasteQty : null
    const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
    const reasonLabel = (r: string) => ({ spoilage: 'Spoilage', prep_error: 'Prep error', over_portion: 'Over portion', breakage: 'Breakage', expired: 'Expired', damaged: 'Damaged', other: 'Other' } as Record<string, string>)[r] ?? r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, ' ')
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
                    style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none' }} />
                  <button onClick={() => wasteSearchRun(wasteSearch)} style={{ background: P.lime, color: P.ink, border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                </div>
                {wasteSearching ? <div style={{ height: 120, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />
                  : wasteMatches.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {wasteMatches.map(m => (
                          <button key={m.id} onClick={() => pickWasteProduct(m.id)} style={{ textAlign: 'left', background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 13, padding: '12px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</b><div style={{ fontSize: 11, color: T.muted }}>{m.sku ? `SKU ${m.sku}` : 'no SKU'}</div></div>
                            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: T.green }}>{m.on_hand}</div><div style={{ fontSize: 9.5, color: T.muted }}>on hand</div></div>
                          </button>
                        ))}
                      </div>
                      {wasteFromCache && <div style={{ fontSize: 11, color: T.amber, background: T.amberSoft, borderRadius: 9, padding: '8px 12px', marginTop: 8, lineHeight: 1.5 }}>⚡ Offline — saved catalog. Stock levels may be slightly stale.</div>}
                    </>
                  ) : !online && wasteSearch.trim() ? (
                    <div style={{ padding: 20, borderRadius: 14, background: T.amberSoft, border: '1.5px solid ' + T.amber, textAlign: 'center', fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>You&apos;re offline — open this tab while connected to enable offline search.</div>
                  ) : <div style={{ padding: 24, textAlign: 'center', color: T.muted, fontSize: 13, lineHeight: 1.6 }}>Search for the item you&apos;re writing off — spoilage, breakage, expiry or a prep mistake.</div>}
              </>
            ) : wasteMsg ? (
              <div style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 16, padding: 15, marginBottom: 4 }}>
                <div style={{ width: '100%', background: P.lime, color: P.ink, borderRadius: 13, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>✓ Logged · stock updated</div>
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
                  <div style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 600, minWidth: 64, textAlign: 'center', lineHeight: 1 }}>{wasteQty}</div>
                  <button onClick={() => setWasteQty(v => Math.min(wasteProduct.on_hand || 9999, v + 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                  {reasons.map(r => (
                    <button key={r} onClick={() => setWasteReason(r)} style={{ fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: BODY, border: `1.5px solid ${wasteReason === r ? T.green : T.line}`, background: wasteReason === r ? T.greenSoft : '#fff', color: wasteReason === r ? T.green : T.muted }}>{reasonLabel(r)}</button>
                  ))}
                </div>
                {wasteReason === 'other' && <input value={wasteOther} onChange={e => setWasteOther(e.target.value)} placeholder="Describe the reason…" style={{ width: '100%', padding: '10px 12px', borderRadius: 11, border: `1.5px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none', marginBottom: 12 }} />}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.paper, borderRadius: 11, padding: '11px 13px', marginBottom: 13 }}>
                  <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Cost of waste</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: costOfWaste != null ? T.red : T.muted }}>{costOfWaste != null ? `$${costOfWaste.toFixed(2)}` : 'cost unknown'}</span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{[...Array(2)].map((_, i) => <div key={i} style={{ height: 52, borderRadius: 13, background: '#fff', border: `1.5px solid ${T.line}` }} />)}</div>
            ) : wasteTodayState === 'error' ? (
              <div style={{ padding: 18, borderRadius: 14, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 13, fontWeight: 600, marginBottom: 9 }}>Couldn&apos;t load today&apos;s waste</p><button onClick={() => loadWasteToday(outletId)} style={{ padding: '7px 16px', borderRadius: 10, border: 'none', background: P.lime, color: P.ink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
            ) : wasteTodayState === 'empty' ? (
              <div style={{ padding: 28, textAlign: 'center', background: '#fff', borderRadius: 14, border: `1.5px solid ${T.line}` }}><div style={{ fontSize: 30, marginBottom: 6 }}>🌿</div><p style={{ fontSize: 14, fontFamily: DISPLAY, marginBottom: 3 }}>No waste logged today</p><p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>Nice — nothing written off yet. Anything you log here reduces stock and shows up for the owner.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {(wasteToday?.items ?? []).map(it => (
                  <div key={it.id} style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 13, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{it.product_name}</b><div style={{ fontSize: 11, color: T.muted }}>−{it.quantity} · {reasonLabel(it.reason)} · {it.recorded_by}</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: it.cost_cents != null ? T.red : T.muted }}>{it.cost_cents != null ? dollars(it.cost_cents) : '—'}</div><div style={{ fontSize: 9.5, color: T.muted }}>{new Date(it.recorded_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}</div></div>
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
        ? <div style={{ padding: 26, textAlign: 'center', background: '#fff', borderRadius: 14, border: `1.5px solid ${T.line}` }}><div style={{ fontSize: 28, marginBottom: 6 }}>📋</div><p style={{ fontSize: 13.5, fontFamily: DISPLAY }}>No adjustments today</p><p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 2 }}>Manual corrections show here so every change to the book is transparent.</p></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{recent.map(a => (
          <div key={a.id} style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 13, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{a.product_name}</b><div style={{ fontSize: 11, color: T.muted }}>{reasonLabel(a.reason)} · {a.adjusted_by}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: a.delta < 0 ? T.red : T.green }}>{a.delta > 0 ? '+' : ''}{a.delta}</div><div style={{ fontSize: 9.5, color: T.muted }}>{a.value_dollars != null ? `${a.value_dollars < 0 ? '−' : '+'}$${Math.abs(a.value_dollars).toFixed(2)}` : new Date(a.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}</div></div>
          </div>
        ))}</div>
    )
    return shell(
      <>
        {statusbar}{header(true, 'Adjust', 'Manual stock correction')}
        {body(
          adjustState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: i === 0 ? 90 : 56, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />)}</div>
          ) : adjustState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load adjustments</p><button onClick={() => loadAdjust(outletId)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: P.lime, color: P.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
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
                      style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none' }} />
                    <button onClick={() => adjustSearchRun(adjustSearch)} style={{ background: P.lime, color: P.ink, border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                  </div>
                  {adjustSearching ? <div style={{ height: 120, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />
                    : adjustMatches.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 4 }}>
                          {adjustMatches.map(m => (
                            <button key={m.id} onClick={() => pickAdjustProduct(m.id)} style={{ textAlign: 'left', background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 13, padding: '12px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</b><div style={{ fontSize: 11, color: T.muted }}>{m.sku ? `SKU ${m.sku}` : 'no SKU'}</div></div>
                              <div style={{ textAlign: 'right' }}><div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: T.green }}>{m.on_hand}</div><div style={{ fontSize: 9.5, color: T.muted }}>on hand</div></div>
                            </button>
                          ))}
                        </div>
                        {adjustFromCache && <div style={{ fontSize: 11, color: T.amber, background: T.amberSoft, borderRadius: 9, padding: '8px 12px', marginTop: 4, lineHeight: 1.5 }}>⚡ Offline — saved catalog. Stock levels may be slightly stale.</div>}
                      </>
                    ) : !online && adjustSearch.trim() ? (
                      <div style={{ padding: 20, borderRadius: 14, background: T.amberSoft, border: '1.5px solid ' + T.amber, textAlign: 'center', fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>You&apos;re offline — open this tab while connected to enable offline search.</div>
                    ) : <div style={{ padding: 24, textAlign: 'center', color: T.muted, fontSize: 13, lineHeight: 1.6 }}>Search the item whose book count is wrong, then set it to the true number.</div>}
                </>
              ) : adjustMsg ? (
                <div style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 16, padding: 15, marginBottom: 4 }}>
                  <div style={{ width: '100%', background: P.lime, color: P.ink, borderRadius: 13, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>✓ Stock corrected</div>
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
                    <div style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 600, minWidth: 64, textAlign: 'center', lineHeight: 1 }}>{Math.round(adjustValue)}</div>
                    <button onClick={() => setAdjustValue(v => Math.round(v) + 1)} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 24, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 7 }}>Reason (required)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                    {reasons.map(r => (
                      <button key={r} onClick={() => { setAdjustReason(r); setAdjustErr('') }} style={{ fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: BODY, border: `1.5px solid ${adjustReason === r ? T.green : T.line}`, background: adjustReason === r ? T.greenSoft : '#fff', color: adjustReason === r ? T.green : T.muted }}>{reasonLabel(r)}</button>
                    ))}
                  </div>
                  {adjustReason === 'other' && <input value={adjustOther} onChange={e => setAdjustOther(e.target.value)} placeholder="Describe the reason…" style={{ width: '100%', padding: '10px 12px', borderRadius: 11, border: `1.5px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none', marginBottom: 12 }} />}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.paper, borderRadius: 11, padding: '11px 13px', marginBottom: 13 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600 }}>{ap.on_hand} → {previewNew}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: previewDelta < 0 ? T.red : previewDelta > 0 ? T.green : T.muted }}>{previewDelta > 0 ? '+' : ''}{previewDelta}{valueImpact != null ? ` · ${valueImpact < 0 ? '−' : '+'}$${Math.abs(valueImpact).toFixed(2)}` : ''}</span>
                  </div>
                  {adjustErr && <p style={{ fontSize: 12, color: T.red, marginBottom: 10, textAlign: 'center' }}>{adjustErr}</p>}
                  <button onClick={submitAdjust} disabled={adjustSubmitting || previewDelta === 0} style={{ width: '100%', background: P.lime, color: P.ink, border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (adjustSubmitting || previewDelta === 0) ? 0.5 : 1 }}>{adjustSubmitting ? 'Applying…' : previewDelta === 0 ? 'No change' : 'Apply correction'}</button>
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
              {cameraSupported ? 'Scan with the camera, or search by name — both add to the print batch.' : 'Search by name to build the print batch.'} The owner picks a template and prints it from the dashboard. Prices are snapshotted now, so a later price change won&apos;t change what prints.
            </div>

            {cameraSupported && (
              <div style={{ marginBottom: 12 }}>
                <button onClick={() => setTicketCam(c => !c)} style={{ width: '100%', background: ticketCam ? '#fff' : P.lime, color: P.ink, border: `1.5px solid ${P.ink}`, borderRadius: 12, padding: 11, fontFamily: BODY, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{ticketCam ? 'Stop camera' : '📷 Scan with camera'}</button>
                {ticketCam && <div style={{ marginTop: 10 }}><PipelScanner active={ticketCam} onDecode={ticketScanDecode} onDenied={() => { setTicketCam(false); setTicketMsg('Camera blocked — search by name instead.') }} /></div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={ticketSearch} onChange={e => setTicketSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ticketSearchRun(ticketSearch) }} placeholder="Search by name / SKU…"
                style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none' }} />
              <button onClick={() => ticketSearchRun(ticketSearch)} style={{ background: P.lime, color: P.ink, border: 0, borderRadius: 11, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Find</button>
            </div>

            {ticketSearching && <div style={{ height: 60, borderRadius: 13, background: '#fff', border: `1.5px solid ${T.line}`, marginBottom: 12 }} />}
            {ticketMatches.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: ticketFromCache ? 4 : 14 }}>
                {ticketMatches.map(m => (
                  <button key={m.id} onClick={() => ticketAdd(m.id)} style={{ textAlign: 'left', background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 13, padding: '11px 14px', cursor: 'pointer', fontFamily: BODY, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</b><div style={{ fontSize: 11, color: T.muted }}>{m.sku ? `SKU ${m.sku} · ` : ''}{money(m.price)}</div></div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#534AB7', background: T.violetSoft, borderRadius: 8, padding: '5px 10px' }}>+ Add</span>
                  </button>
                ))}
              </div>
            )}
            {ticketFromCache && ticketMatches.length > 0 && <div style={{ fontSize: 11, color: T.amber, background: T.amberSoft, borderRadius: 9, padding: '8px 12px', marginBottom: 10, lineHeight: 1.5 }}>⚡ Offline — saved catalog. Prices may be slightly stale.</div>}
            {!ticketSearching && ticketMatches.length === 0 && !online && ticketSearch.trim() && <div style={{ padding: 16, borderRadius: 12, background: T.amberSoft, border: '1.5px solid ' + T.amber, textAlign: 'center', fontSize: 12.5, color: T.ink, lineHeight: 1.6, marginBottom: 12 }}>You&apos;re offline — open this tab while connected to enable offline search.</div>}

            {ticketMsg && <div style={{ fontSize: 12.5, color: T.green, background: T.greenSoft, borderRadius: 11, padding: '12px 14px', lineHeight: 1.45, marginBottom: 14, fontWeight: 500 }}>{ticketMsg}</div>}

            <div style={{ margin: '4px 2px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 14, fontWeight: 600 }}>This batch</b>
              {ticketBatch.length > 0 && <span style={{ fontSize: 11.5, color: T.muted }}>{ticketBatch.length} item{ticketBatch.length === 1 ? '' : 's'} · {totalCopies} ticket{totalCopies === 1 ? '' : 's'}</span>}
            </div>

            {ticketBatch.length === 0 ? (
              <div style={{ padding: 34, textAlign: 'center', background: '#fff', borderRadius: 14, border: `1.5px solid ${T.line}` }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>🏷️</div>
                <p style={{ fontSize: 15, fontFamily: DISPLAY, marginBottom: 3 }}>No items yet</p>
                <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>Search above and tap “Add” to start a price-ticket batch.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
                  {ticketBatch.map(it => (
                    <div key={it.id} style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 13, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 13.5, fontWeight: 600 }}>{it.name}</b>
                        <div style={{ fontSize: 11, color: T.muted }}>{it.was != null ? <span><span style={{ textDecoration: 'line-through' }}>{money(it.was)}</span> {money(it.price)}{it.promo ? ` · ${it.promo}` : ''}</span> : money(it.price)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => ticketQty(it.id, -1)} style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 18, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                        <span style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, minWidth: 22, textAlign: 'center' }}>{it.qty}</span>
                        <button onClick={() => ticketQty(it.id, 1)} style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 18, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                        <button onClick={() => ticketRemove(it.id)} title="Remove" style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.redSoft}`, background: '#fff', fontSize: 14, color: T.red, cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <input value={ticketName} onChange={e => setTicketName(e.target.value)} placeholder="Name this batch (e.g. Friday specials)…"
                  style={{ width: '100%', padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none', marginBottom: 10 }} />
                <button onClick={ticketSaveBatch} disabled={ticketSaving || !ticketName.trim()} style={{ width: '100%', background: P.lime, color: P.ink, border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (ticketSaving || !ticketName.trim()) ? 0.5 : 1 }}>{ticketSaving ? 'Saving…' : `Save batch · ${totalCopies} ticket${totalCopies === 1 ? '' : 's'}`}</button>
                <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>Saved as <b style={{ color: T.green }}>{acting?.name}</b> · the owner prints it from the dashboard</div>
              </>
            )}
          </>
        )}
        {tabbar}
      </>
    )
  }

  // ── RECEIVE (PO → delivery) ──
  if (tab === 'receive') {
    const po = receiveData?.receivable.find(p => p.id === openPo) ?? null
    const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'
    return shell(
      <>
        {statusbar}{header(true, 'Receive', 'Log a delivery against a PO')}
        {body(
          receiveState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 70, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />)}</div>
          ) : receiveState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load deliveries</p><button onClick={() => { setReceiveData(null); loadReceive() }} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: P.lime, color: P.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : po ? (
            // ── open PO: enter received quantities ──
            <>
              <button onClick={() => setOpenPo(null)} style={{ background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer', fontFamily: BODY, marginBottom: 8 }}>← All deliveries</button>
              <div style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 16, padding: 15, marginBottom: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <b style={{ fontSize: 16, fontWeight: 600 }}>{po.order_number}</b>
                  <span style={{ fontSize: 11.5, color: T.muted }}>expected {fmtDate(po.expected_date)}</span>
                </div>
                <p style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>Default to ordered qty. Edit any line for a partial or over-delivery; add an expiry date to track a batch.</p>
              </div>
              {po.items.map(l => {
                const q = recvQty[l.id] ?? 0
                const diff = q - (Number(l.quantity_ordered) || 0)
                return (
                  <div key={l.id} style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 14, padding: 13, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <b style={{ fontSize: 13.5, fontWeight: 600 }}>{l.product_name}</b>
                      <span style={{ fontSize: 11, color: T.muted }}>ordered {l.quantity_ordered}{l.unit_cost != null ? ` · ${money(l.unit_cost)}/u` : ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', margin: '11px 0 6px' }}>
                      <button onClick={() => setRecvQty(s => ({ ...s, [l.id]: Math.max(0, (s[l.id] ?? 0) - 1) }))} style={{ width: 42, height: 42, borderRadius: 13, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 22, fontWeight: 600, color: T.green, cursor: 'pointer' }}>−</button>
                      <input value={q} onChange={e => setRecvQty(s => ({ ...s, [l.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} inputMode="numeric" style={{ fontFamily: DISPLAY, fontSize: 38, fontWeight: 600, width: 72, textAlign: 'center', border: 'none', outline: 'none', color: T.ink }} />
                      <button onClick={() => setRecvQty(s => ({ ...s, [l.id]: (s[l.id] ?? 0) + 1 }))} style={{ width: 42, height: 42, borderRadius: 13, border: `1.5px solid ${T.line}`, background: '#fff', fontSize: 22, fontWeight: 600, color: T.green, cursor: 'pointer' }}>+</button>
                    </div>
                    {diff !== 0 && <div style={{ fontSize: 11, textAlign: 'center', color: diff < 0 ? T.amber : T.green, marginBottom: 6 }}>{diff < 0 ? `${Math.abs(diff)} short of ordered` : `${diff} over ordered`}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: T.muted, whiteSpace: 'nowrap' }}>Expiry (optional)</span>
                      <input type="date" value={recvExpiry[l.id] ?? ''} onChange={e => setRecvExpiry(s => ({ ...s, [l.id]: e.target.value }))} style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: `1.5px solid ${T.line}`, background: T.paper, color: T.ink, fontFamily: BODY, fontSize: 12.5, outline: 'none' }} />
                    </div>
                  </div>
                )
              })}
              <textarea value={recvNote} onChange={e => setRecvNote(e.target.value)} placeholder="Note (optional) — e.g. one box damaged…" rows={2} style={{ width: '100%', padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${T.line}`, background: '#fff', color: T.ink, fontFamily: BODY, fontSize: 13, outline: 'none', marginBottom: 10, resize: 'vertical' }} />
              {recvMsg && <p style={{ fontSize: 12.5, color: recvMsg.startsWith('✓') ? T.green : T.red, marginBottom: 10 }}>{recvMsg}</p>}
              <button onClick={() => submitReceive(po)} disabled={recvSubmitting} style={{ width: '100%', background: P.lime, color: P.ink, border: 0, borderRadius: 13, padding: 14, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: recvSubmitting ? 0.6 : 1 }}>{recvSubmitting ? 'Receiving…' : 'Confirm delivery'}</button>
              <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>Received as <b style={{ color: T.green }}>{acting?.name}</b> · increments stock, captures cost, opens a batch.</div>
            </>
          ) : receiveState === 'empty' ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>📦</div><p style={{ fontSize: 18, fontFamily: DISPLAY, marginBottom: 6 }}>No deliveries waiting</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>When a purchase order is sent to a supplier it appears here to receive. Create POs from the dashboard.</p></div>
          ) : (
            <>
              <div style={{ margin: '2px 2px 10px', fontSize: 14, fontWeight: 600 }}>Awaiting receipt</div>
              {(receiveData?.receivable ?? []).map(p => (
                <button key={p.id} onClick={() => openReceivePo(p)} style={{ width: '100%', textAlign: 'left', background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 10, cursor: 'pointer', fontFamily: BODY, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div><b style={{ fontSize: 14, fontWeight: 600 }}>{p.order_number}</b><div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{p.items.length} line{p.items.length === 1 ? '' : 's'} · expected {fmtDate(p.expected_date)}</div></div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.green, background: T.greenSoft, borderRadius: 8, padding: '6px 11px', whiteSpace: 'nowrap' }}>Receive →</span>
                </button>
              ))}
              {(receiveData?.recent ?? []).length > 0 && (
                <>
                  <div style={{ margin: '14px 2px 10px', fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>Recently received</div>
                  {(receiveData?.recent ?? []).map(p => (
                    <div key={p.id} style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 12, padding: '11px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><b style={{ fontSize: 13, fontWeight: 600 }}>{p.order_number}</b><div style={{ fontSize: 11, color: T.muted }}>by {p.received_by ?? '—'} · {fmtDate(p.received_at)}</div></div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.sage, background: T.sageSoft, borderRadius: 7, padding: '4px 9px' }}>✓ done</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )
        )}
        {tabbar}
      </>
    )
  }

  // ── TRANSFER (between outlets) ──
  if (tab === 'transfer') {
    const stageMeta = (s: string) => ({
      draft: { label: 'Draft', bg: T.paper, col: T.muted }, requested: { label: 'Requested', bg: T.blueSoft, col: '#185FA5' },
      approved: { label: 'Approved', bg: T.violetSoft, col: '#534AB7' }, in_transit: { label: 'In transit', bg: T.amberSoft, col: T.amber },
      received: { label: 'Received', bg: T.sageSoft, col: T.green },
    } as Record<string, { label: string; bg: string; col: string }>)[s] ?? { label: s.replace(/_/g, ' '), bg: T.paper, col: T.muted }
    const nextAction = (s: string): { action: 'approve' | 'send' | 'receive'; label: string } | null =>
      s === 'draft' || s === 'requested' ? { action: 'approve', label: 'Approve' }
      : s === 'approved' ? { action: 'send', label: 'Send · ship stock' }
      : s === 'in_transit' ? { action: 'receive', label: 'Receive · land stock' } : null
    return shell(
      <>
        {statusbar}{header(true, 'Transfer', 'Move stock between outlets')}
        {body(
          transferState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(2)].map((_, i) => <div key={i} style={{ height: 150, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />)}</div>
          ) : transferState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load transfers</p><button onClick={() => { setTransferData(null); loadTransfer() }} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: P.lime, color: P.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : transferState === 'empty' ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>🔁</div><p style={{ fontSize: 18, fontFamily: DISPLAY, marginBottom: 6 }}>No transfers right now</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>Create a stock transfer between outlets from the dashboard. It walks through approve → send → receive here.</p></div>
          ) : (
            <>
              {transferMsg && <p style={{ fontSize: 12.5, color: transferMsg.startsWith('✓') ? T.green : T.red, marginBottom: 12, background: transferMsg.startsWith('✓') ? T.sageSoft : T.redSoft, borderRadius: 10, padding: '10px 12px' }}>{transferMsg}</p>}
              {(transferData?.transfers ?? []).map(tr => {
                const sm = stageMeta(tr.status)
                const na = nextAction(tr.status)
                const busy = transferBusy === tr.id
                return (
                  <div key={tr.id} style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderRadius: 16, padding: 14, marginBottom: 11, boxShadow: '0 1px 3px rgba(20,30,50,.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{tr.from_name} <span style={{ color: T.muted }}>→</span> {tr.to_name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sm.col, background: sm.bg, padding: '3px 9px', borderRadius: 7, textTransform: 'uppercase', letterSpacing: '.3px' }}>{sm.label}</span>
                    </div>
                    {tr.items.map(it => (
                      <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 2px', borderTop: `1.5px solid ${T.line}`, fontSize: 12.5 }}>
                        <span style={{ flex: 1 }}>{it.product_name}</span>
                        <span style={{ color: T.muted }}>{tr.status === 'received' && it.quantity_received != null ? `${it.quantity_received} received` : tr.status === 'in_transit' && it.quantity_sent != null ? `${it.quantity_sent} sent` : `${it.quantity_approved} qty`}</span>
                      </div>
                    ))}
                    {na ? (
                      <button disabled={busy} onClick={() => transferAction(tr.id, na.action)} style={{ width: '100%', marginTop: 11, background: P.lime, color: P.ink, border: 0, borderRadius: 12, padding: 12, fontFamily: BODY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : na.label}</button>
                    ) : (
                      <div style={{ width: '100%', marginTop: 11, background: T.sageSoft, color: T.green, borderRadius: 12, padding: 12, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>✓ Completed</div>
                    )}
                  </div>
                )
              })}
              <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>Each step is logged to <b style={{ color: T.green }}>{acting?.name}</b>. Sending decrements the origin; receiving increments the destination.</div>
            </>
          )
        )}
        {tabbar}
      </>
    )
  }

  // ── EXPIRING (batch buckets) ──
  if (tab === 'expiring') {
    const bucketMeta = (b: string) => ({
      expired: { label: 'Expired', bg: T.redSoft, col: T.red }, urgent: { label: '≤3 days', bg: T.redSoft, col: T.red },
      soon: { label: '≤14 days', bg: T.amberSoft, col: T.amber }, ok: { label: 'OK', bg: T.sageSoft, col: T.green },
    } as Record<string, { label: string; bg: string; col: string }>)[b] ?? { label: b, bg: T.paper, col: T.muted }
    const c = expData?.counts
    return shell(
      <>
        {statusbar}{header(true, 'Expiring', 'Batches nearing expiry')}
        {body(
          expState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 90, borderRadius: 16, background: '#fff', border: `1.5px solid ${T.line}` }} />)}</div>
          ) : expState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${T.redSoft}`, textAlign: 'center' }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Couldn&apos;t load expiring stock</p><button onClick={() => { setExpData(null); loadExpiring() }} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: P.lime, color: P.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>Try again</button></div>
          ) : expState === 'empty' ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 38, marginBottom: 10 }}>🌿</div><p style={{ fontSize: 18, fontFamily: DISPLAY, marginBottom: 6 }}>Nothing tracked for expiry</p><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>Batches with an expiry date appear here as they near their use-by. Add an expiry when receiving a delivery.</p></div>
          ) : (
            <>
              {c && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 13 }}>
                  {([['expired', c.expired], ['urgent', c.urgent], ['soon', c.soon]] as const).map(([b, n]) => {
                    const m = bucketMeta(b)
                    return <div key={b} style={{ flex: 1, background: m.bg, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}><div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: m.col, lineHeight: 1 }}>{n}</div><div style={{ fontSize: 9.5, color: T.muted, marginTop: 3 }}>{m.label}</div></div>
                  })}
                </div>
              )}
              {expMsg && <p style={{ fontSize: 12.5, color: expMsg.startsWith('✓') ? T.green : T.red, marginBottom: 12, background: expMsg.startsWith('✓') ? T.sageSoft : T.redSoft, borderRadius: 10, padding: '10px 12px' }}>{expMsg}</p>}
              {(expData?.batches ?? []).map(b => {
                const m = bucketMeta(b.bucket)
                const busy = expBusy === b.id
                return (
                  <div key={b.id} style={{ background: '#fff', border: `1.5px solid ${T.line}`, borderLeft: `3px solid ${m.col}`, borderRadius: 14, padding: 13, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <b style={{ fontSize: 14, fontWeight: 600 }}>{b.product_name}</b>
                      <span style={{ fontSize: 11, fontWeight: 700, color: m.col }}>{b.days_left < 0 ? `${Math.abs(b.days_left)}d ago` : `${b.days_left}d left`}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{b.batch_ref} · {b.quantity_remaining} left · {b.outlet_name} · use-by {new Date(`${b.expiry_date}T00:00:00+10:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                      <button disabled={busy} onClick={() => expiringAction(b.id, 'waste')} style={{ flex: 1, background: '#fff', color: T.red, border: `1.5px solid ${T.redSoft}`, borderRadius: 11, padding: '10px 6px', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : 'Waste'}</button>
                      <button disabled={busy} onClick={() => expiringAction(b.id, 'markdown')} style={{ flex: 1, background: '#fff', color: T.amber, border: `1.5px solid ${T.amberSoft}`, borderRadius: 11, padding: '10px 6px', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Markdown</button>
                    </div>
                  </div>
                )
              })}
              <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>Waste writes the batch off (decrements stock, logged to <b style={{ color: T.green }}>{acting?.name}</b>). Markdown flags it for the owner — no price change.</div>
            </>
          )
        )}
        {tabbar}
      </>
    )
  }

  // ── STOCKTAKE / CYCLE / PERPETUAL (INV-4) ──
  if (tab === 'stocktake') {
    const outletName = boot?.outlets.find(o => o.id === outletId)?.name.replace(/^\[TEST\]\s*/, '') ?? ''
    const modes: Array<{ k: 'full' | 'cycle' | 'perpetual'; icon: string; label: string; sub: string }> = [
      { k: 'full', icon: 'check-square', label: 'Full stocktake', sub: 'count everything in this outlet' },
      { k: 'cycle', icon: 'trending-up', label: 'ABC cycle count', sub: 'today’s smart subset — A items first' },
      { k: 'perpetual', icon: 'scan', label: 'Spot count', sub: 'quick single-item accuracy check' },
    ]
    const countedIds = new Set(stLines.filter(l => l.counted_qty != null).map(l => l.product_id))
    const varChip = (v: number | null, cents: number | null) => {
      const n = Number(v) || 0
      const col = n === 0 ? P.muted : n < 0 ? P.red : P.ink
      const txt = n === 0 ? 'match' : `${n > 0 ? '+' : ''}${n}`
      return <span style={{ fontWeight: 800, fontSize: 13, color: col }}>{txt}{n !== 0 && cents != null ? ` · ${cents < 0 ? '−' : '+'}$${Math.abs(cents / 100).toFixed(2)}` : ''}</span>
    }
    return shell(
      <>
        {statusbar}{header(true, 'stocktake', outletName ? `counting · ${outletName}` : 'counting verifies truth')}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px' }}>
          {/* mode picker */}
          {stState === 'pick' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11.5, color: P.muted, fontWeight: 600, lineHeight: 1.5, marginBottom: 2 }}>A count never changes stock. You count, Aria spots the variance, the owner approves the correction.</div>
              {modes.map(m => (
                <div key={m.k} onClick={() => !stBusy && openStocktakeUi(m.k)} style={{ display: 'flex', alignItems: 'center', gap: 13, background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 20, padding: '14px 15px', boxShadow: HARD_SHADOW, cursor: 'pointer' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, border: `1.5px solid ${P.ink}`, background: P.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><PIcon name={m.icon} size={22} /></div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>{m.label}</div><div style={{ fontSize: 12, color: P.muted, fontWeight: 500, marginTop: 2 }}>{m.sub}</div></div>
                  <PIcon name="back" size={18} stroke={P.muted} />
                </div>
              ))}
            </div>
          )}

          {stState === 'loading' && <div style={{ height: 160, borderRadius: 22, background: P.card, border: `1.5px solid ${P.ink}` }} />}

          {stState === 'submitted' && stSummary && (
            <div style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 18, boxShadow: HARD_SHADOW, textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, border: `1.5px solid ${P.ink}`, background: P.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><PIcon name="check-square" size={26} /></div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>count submitted</div>
              <div style={{ fontSize: 12.5, color: P.muted, fontWeight: 500, lineHeight: 1.5, margin: '6px 0 14px' }}>{stSummary.counted} counted · <b style={{ color: P.ink }}>{stSummary.variances}</b> variance{stSummary.variances === 1 ? '' : 's'} sent to owner review. Stock was <b style={{ color: P.ink }}>not</b> changed — the owner approves each correction.</div>
              <div style={{ display: 'flex', gap: 9, marginBottom: 4 }}>
                <PipelStat n={stSummary.counted} k="counted" />
                <PipelStat n={stSummary.variances} k="variances" tone={stSummary.variances > 0 ? 'warn' : undefined} />
                <PipelStat n={`$${Math.abs(stSummary.total_cents / 100).toFixed(0)}`} k="variance $" tone={stSummary.total_cents !== 0 ? 'alert' : undefined} />
              </div>
              <div style={{ marginTop: 14 }}><PipelButton onClick={resetStocktake}>New count</PipelButton></div>
            </div>
          )}

          {stState === 'active' && stSession && (
            <>
              {/* session bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: P.ink, color: '#fff', borderRadius: 16, padding: '11px 14px', marginBottom: 13 }}>
                <div><div style={{ fontWeight: 800, fontSize: 14, textTransform: 'capitalize' }}>{stSession.count_type} count</div><div style={{ fontSize: 11, color: '#cfd2cc' }}>{countedIds.size} counted{outletName ? ` · ${outletName}` : ''}</div></div>
                <button onClick={resetStocktake} style={{ background: 'none', border: 'none', color: '#cfd2cc', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: BODY }}>switch</button>
              </div>

              {/* INV-DEPTH-COUNTING B: recount warning — shown after recording a high-variance line */}
              {stRecountWarn && !stPick && (
                <div style={{ fontSize: 11.5, color: '#7A5C00', background: '#FEF9C3', border: '1.5px solid #F5C518', borderRadius: 12, padding: '10px 13px', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', lineHeight: 1.4 }}>
                  <span style={{ flexShrink: 0 }}>&#9888;</span>
                  <span><b>{stRecountWarn}</b> — big variance. Count this item again (ideally a different staff member) to confirm.</span>
                  <button onClick={() => setStRecountWarn(null)} style={{ background: 'none', border: 'none', color: '#7A5C00', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: 0, lineHeight: 1 }}>&#x2715;</button>
                </div>
              )}

              {/* active count card */}
              {stPick ? (
                <div style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 16, boxShadow: HARD_SHADOW, marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.1 }}>{stPick.name}</div>
                  <div style={{ fontSize: 12, color: P.muted, fontWeight: 600, marginTop: 2 }}>Aria expects <b style={{ color: P.ink }}>{stPick.expected}</b> on hand</div>
                  {stPattern && <div style={{ fontSize: 11.5, color: P.amber, fontWeight: 700, background: P.amberSoft, border: `1.5px solid ${P.amber}`, borderRadius: 12, padding: '8px 11px', marginTop: 11, lineHeight: 1.4 }}>⚑ {stPattern} — flagged for the owner</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '16px 0' }}>
                    <button onClick={() => setStCountVal(v => Math.max(0, v - 1))} style={{ width: 48, height: 48, borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', fontSize: 24, fontWeight: 800, cursor: 'pointer' }}>−</button>
                    <input value={stCountVal} onChange={e => setStCountVal(Math.max(0, Math.round(Number(e.target.value) || 0)))} inputMode="numeric" style={{ width: 84, textAlign: 'center', fontSize: 40, fontWeight: 800, border: 'none', outline: 'none', color: P.ink, fontFamily: BODY }} />
                    <button onClick={() => setStCountVal(v => v + 1)} style={{ width: 48, height: 48, borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', fontSize: 24, fontWeight: 800, cursor: 'pointer' }}>+</button>
                  </div>
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>{varChip(stCountVal - stPick.expected, null)} <span style={{ fontSize: 11, color: P.muted, fontWeight: 600 }}>variance</span></div>
                  <PipelButton onClick={stSubmitLine} disabled={stBusy}>{stBusy ? 'Recording…' : 'Record count'}</PipelButton>
                  <button onClick={() => { setStPick(null); setStPattern(null) }} style={{ width: '100%', marginTop: 9, background: 'none', color: P.muted, border: 'none', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>cancel</button>
                </div>
              ) : (
                <>
                  {/* product source: cycle list OR search */}
                  {stType === 'cycle' ? (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 10px' }}>today’s cycle list · {stCycle.length} items</div>
                      {stCycle.length === 0 && <div style={{ fontSize: 12.5, color: P.muted, padding: 16, textAlign: 'center' }}>Nothing due to count right now.</div>}
                      {stCycle.map(c => {
                        const done = countedIds.has(c.product_id)
                        return (
                          <div key={c.product_id} onClick={() => !done && stPickProduct(c.product_id, c.name, c.expected_qty)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 16, padding: '11px 13px', marginBottom: 9, cursor: done ? 'default' : 'pointer', opacity: done ? 0.55 : 1 }}>
                            <span style={{ width: 26, height: 26, borderRadius: 8, border: `1.5px solid ${P.ink}`, background: c.abc_tier === 'A' ? P.lime : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{c.abc_tier}</span>
                            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div><div style={{ fontSize: 11, color: P.muted, fontWeight: 500 }}>expect {c.expected_qty} · {c.last_counted_at ? `${c.days_since}d since count` : 'never counted'}</div></div>
                            {done ? <PIcon name="check-square" size={20} /> : <PIcon name="back" size={16} stroke={P.muted} />}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 11 }}>
                        <input value={stSearch} onChange={e => setStSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') stSearchRun(stSearch) }} placeholder="Find a product to count…"
                          onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${P.lime}` }} onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
                          style={{ flex: 1, padding: '11px 13px', borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', color: P.ink, fontFamily: BODY, fontSize: 14, outline: 'none' }} />
                        <button onClick={() => stSearchRun(stSearch)} style={{ background: P.lime, color: P.ink, border: `1.5px solid ${P.ink}`, borderRadius: 14, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Find</button>
                      </div>
                      {stMatches.map(m => (
                        <div key={m.id} onClick={() => stPickProduct(m.id, m.name, m.on_hand)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 16, padding: '11px 13px', marginBottom: 9, cursor: 'pointer' }}>
                          <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.name}</div><div style={{ fontSize: 11, color: P.muted }}>{m.sku ? `SKU ${m.sku} · ` : ''}expect {m.on_hand}</div></div>
                          <PIcon name="back" size={16} stroke={P.muted} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* counted lines */}
              {stLines.filter(l => l.counted_qty != null).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 10px' }}>counted this session</div>
                  {stLines.filter(l => l.counted_qty != null).map(l => (
                    <div key={l.product_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 14, padding: '10px 13px', marginBottom: 8 }}>
                      <div><div style={{ fontWeight: 700, fontSize: 13 }}>{l.product_name ?? 'Item'}</div><div style={{ fontSize: 11, color: P.muted }}>{l.expected_qty} → {l.counted_qty}</div></div>
                      {varChip(l.variance_qty, l.variance_cents)}
                    </div>
                  ))}
                </div>
              )}

              {/* submit */}
              <PipelButton onClick={stSubmitSession} disabled={stBusy || countedIds.size === 0}>{stBusy ? 'Submitting…' : `Submit count · ${countedIds.size} item${countedIds.size === 1 ? '' : 's'}`}</PipelButton>
              <div style={{ fontSize: 10.5, color: P.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5, fontWeight: 500 }}>Submitting sends variances to the owner review queue. Stock never changes until the owner approves.</div>
            </>
          )}
        </div>
        {tabbar}
      </>
    )
  }

  // ── ORDER / BUYING (INV-5) ──
  if (tab === 'order') {
    const outletName = boot?.outlets.find(o => o.id === outletId)?.name.replace(/^\[TEST\]\s*/, '') ?? ''
    const statusChip = (s: string) => {
      const map: Record<string, { bg: string; col: string }> = { draft: { bg: '#fff', col: P.muted }, sent: { bg: P.lime, col: P.ink }, received: { bg: '#f1fbcf', col: P.ink } }
      const m = map[s] ?? { bg: '#fff', col: P.muted }
      return <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 9, border: `1.5px solid ${P.ink}`, background: m.bg, color: m.col, textTransform: 'uppercase' }}>{s}</span>
    }
    return shell(
      <>
        {statusbar}{header(true, 'order', outletName ? `what to buy · ${outletName}` : 'reorder & purchase orders')}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px' }}>
          {buyMsg && <div style={{ fontSize: 12.5, color: P.ink, background: P.lime, border: `1.5px solid ${P.ink}`, borderRadius: 12, padding: '10px 13px', marginBottom: 13, fontWeight: 700, lineHeight: 1.4 }}>{buyMsg}</div>}

          {/* PO DETAIL */}
          {buyPo ? (
            <>
              <button onClick={() => { setBuyPo(null); setBuyPermErr('') }} style={{ background: 'none', border: 'none', color: P.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: BODY, marginBottom: 10 }}>← all orders</button>
              <div style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 16, boxShadow: HARD_SHADOW }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{buyPo.po.order_number}</div>{statusChip(buyPo.po.status)}
                </div>
                <div style={{ fontSize: 11.5, color: P.muted, fontWeight: 500, marginBottom: 12 }}>by {buyPo.po.created_by ?? '—'}</div>
                {buyPo.lines.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 2px', borderTop: `1.5px solid ${P.ink}`, fontSize: 13 }}>
                    <span style={{ fontWeight: 700, flex: 1 }}>{l.product_name}</span>
                    <span style={{ color: P.muted, fontWeight: 600 }}>{l.quantity_ordered} × {l.unit_cost != null ? `$${Number(l.unit_cost).toFixed(2)}` : '—'}</span>
                    <span style={{ width: 70, textAlign: 'right', fontWeight: 800 }}>{l.line_total != null ? `$${Number(l.line_total).toFixed(2)}` : '—'}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 2px 2px', borderTop: `1.5px solid ${P.ink}`, fontWeight: 800, fontSize: 15 }}><span>Total</span><span>${Number(buyPo.po.total ?? 0).toFixed(2)}</span></div>
              </div>
              {buyPermErr && <div style={{ fontSize: 12.5, color: P.amber, background: P.amberSoft, border: `1.5px solid ${P.amber}`, borderRadius: 12, padding: '10px 13px', marginTop: 12, fontWeight: 700, lineHeight: 1.4 }}>⚑ {buyPermErr}</div>}
              {buyPo.po.status === 'draft' && (
                <div style={{ marginTop: 14 }}>
                  <PipelButton onClick={() => approveBuyPo(buyPo.po.id)} disabled={buyBusy === buyPo.po.id}>{buyBusy === buyPo.po.id ? 'Sending…' : 'Approve & send to supplier'}</PipelButton>
                  <div style={{ fontSize: 10.5, color: P.muted, textAlign: 'center', marginTop: 9, lineHeight: 1.5, fontWeight: 500 }}>Sending emails the PO to the supplier. Money gate — needs a manager. Stock changes only when you Receive the delivery.</div>
                </div>
              )}
            </>
          ) : buyState === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 120, borderRadius: 22, background: P.card, border: `1.5px solid ${P.ink}` }} />)}</div>
          ) : buyState === 'error' ? (
            <div style={{ padding: 24, borderRadius: 22, background: P.card, border: `1.5px solid ${P.ink}`, textAlign: 'center' }}><p style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Couldn’t load buying</p><PipelButton onClick={() => loadBuying(outletId)} style={{ width: 'auto', padding: '10px 20px', display: 'inline-block' }}>Try again</PipelButton></div>
          ) : (
            <>
              {/* REORDER SUGGESTIONS grouped by supplier */}
              <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 11px' }}>what to buy · {buyGroups.reduce((s, g) => s + g.items.length, 0)} below par</div>
              {buyGroups.length === 0 && <div style={{ fontSize: 12.5, color: P.muted, padding: 16, textAlign: 'center', fontWeight: 500 }}>Nothing below reorder point at this outlet — stock is healthy.</div>}
              {buyGroups.map(g => (
                <div key={g.supplier_id ?? 'none'} style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 15, boxShadow: HARD_SHADOW, marginBottom: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{g.supplier_name}</div>
                    {!g.needs_supplier && <span style={{ fontWeight: 800, fontSize: 14 }}>${g.total.toFixed(2)}</span>}
                  </div>
                  {g.items.map(it => (
                    <div key={it.product_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 2px', borderTop: `1.5px solid ${P.ink}`, fontSize: 13 }}>
                      <div style={{ flex: 1 }}><span style={{ fontWeight: 700 }}>{it.name}</span><div style={{ fontSize: 11, color: P.muted }}>on hand {it.on_hand} · par {it.reorder_point}{it.needs_cost ? ' · needs cost' : ''}</div></div>
                      <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800 }}>+{it.suggested_qty}</div><div style={{ fontSize: 10.5, color: P.muted }}>{it.line_total != null ? `$${it.line_total.toFixed(2)}` : '—'}</div></div>
                    </div>
                  ))}
                  {g.needs_supplier ? (
                    <div style={{ fontSize: 11, color: P.amber, fontWeight: 700, marginTop: 11, lineHeight: 1.4 }}>⚑ Assign a supplier (in the dashboard) to draft a PO for these.</div>
                  ) : (
                    <div style={{ marginTop: 12 }}><PipelButton onClick={() => draftFromGroup(g)} disabled={buyBusy === g.supplier_id}>{buyBusy === g.supplier_id ? 'Drafting…' : `Draft PO · ${g.items.length} line${g.items.length === 1 ? '' : 's'}`}</PipelButton></div>
                  )}
                </div>
              ))}

              {/* OPEN ORDERS */}
              {buyPos.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '20px 2px 11px' }}>open orders</div>
                  {buyPos.map(p => (
                    <div key={p.id} onClick={() => openBuyPo(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 16, padding: '12px 14px', marginBottom: 9, cursor: 'pointer' }}>
                      <div><div style={{ fontWeight: 800, fontSize: 13.5 }}>{p.order_number}</div><div style={{ fontSize: 11, color: P.muted }}>{p.supplier_name} · ${Number(p.total ?? 0).toFixed(2)}</div></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>{statusChip(p.status)}<PIcon name="back" size={16} stroke={P.muted} /></div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        {tabbar}
      </>
    )
  }

  // ── FRESH / PRODUCTION (INV-7) ──
  if (tab === 'fresh') {
    const inp = (val: string, onCh: (v: string) => void, ph: string, dec?: boolean) => (
      <input value={val} onChange={e => onCh(e.target.value)} placeholder={ph} inputMode={dec ? 'decimal' : undefined}
        onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${P.lime}` }} onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
        style={{ width: '100%', padding: '11px 13px', borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', color: P.ink, fontFamily: BODY, fontSize: 14, outline: 'none' }} />
    )
    return shell(
      <>
        {statusbar}{header(true, 'production', 'recipes · markdown · temp logs')}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px' }}>
          <PipelSegment inset={false} value={freshTab} onChange={v => setFreshTab(v)}
            options={[{ value: 'prep', label: 'Prep' }, { value: 'markdown', label: 'Markdown' }, { value: 'temp', label: 'Temp' }]} />
          <div style={{ height: 14 }} />

          {freshState === 'loading' ? (
            <div style={{ height: 130, borderRadius: 22, background: P.card, border: `1.5px solid ${P.ink}` }} />
          ) : freshState === 'error' ? (
            <div style={{ padding: 22, borderRadius: 22, background: P.card, border: `1.5px solid ${P.ink}`, textAlign: 'center' }}><p style={{ fontWeight: 800, marginBottom: 12 }}>Couldn’t load production</p><PipelButton onClick={() => loadFresh(outletId)} style={{ width: 'auto', padding: '10px 20px', display: 'inline-block' }}>Try again</PipelButton></div>
          ) : freshTab === 'prep' ? (
            prepPick ? (
              <div style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 16, boxShadow: HARD_SHADOW }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{prepPick.name}</div>
                <div style={{ fontSize: 12, color: P.muted, fontWeight: 600, marginTop: 2 }}>{prepPick.linked}/{prepPick.ingredients} ingredients stock-linked{prepPick.cost != null ? ` · $${prepPick.cost.toFixed(2)}/serve` : ''}</div>
                {prepPick.linked === 0 && <div style={{ fontSize: 11.5, color: P.amber, fontWeight: 700, background: P.amberSoft, border: `1.5px solid ${P.amber}`, borderRadius: 12, padding: '8px 11px', marginTop: 11 }}>⚑ No ingredients are linked to stock — link them in the dashboard to auto-deplete.</div>}
                {!prepResult ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '16px 0' }}>
                      <button onClick={() => setPrepBatches(v => Math.max(1, v - 1))} style={{ width: 48, height: 48, borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', fontSize: 24, fontWeight: 800, cursor: 'pointer' }}>−</button>
                      <div style={{ fontWeight: 800, fontSize: 36, minWidth: 56, textAlign: 'center' }}>{prepBatches}</div>
                      <button onClick={() => setPrepBatches(v => v + 1)} style={{ width: 48, height: 48, borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', fontSize: 24, fontWeight: 800, cursor: 'pointer' }}>+</button>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 11, color: P.muted, fontWeight: 600, marginBottom: 14 }}>batches to prep — depletes ingredients now</div>
                    <PipelButton onClick={prepRecipe} disabled={freshBusy || prepPick.linked === 0}>{freshBusy ? 'Depleting…' : 'Prep & deplete ingredients'}</PipelButton>
                  </>
                ) : (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>depleted (−${prepResult.total_value.toFixed(2)})</div>
                    {prepResult.lines.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 2px', borderTop: `1.5px solid ${P.ink}`, fontSize: 13 }}>
                        <span style={{ fontWeight: 700, flex: 1 }}>{l.name}{l.fefo_batch ? <span style={{ fontSize: 10, color: P.muted }}> · FEFO {l.fefo_batch}</span> : ''}</span>
                        <span style={{ fontWeight: 800 }}>−{l.depleted} → {l.new_on_hand}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 10.5, color: P.muted, textAlign: 'center', marginTop: 10, fontWeight: 500 }}>Logged to {acting?.name} via the canonical stock path.</div>
                  </div>
                )}
                <button onClick={() => { setPrepPick(null); setPrepResult(null) }} style={{ width: '100%', marginTop: 10, background: 'none', color: P.muted, border: 'none', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>← all recipes</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 10px' }}>recipes · {freshRecipes.length}</div>
                {freshRecipes.length === 0 && <div style={{ fontSize: 12.5, color: P.muted, padding: 16, textAlign: 'center', fontWeight: 500 }}>No recipes yet — add them in the dashboard.</div>}
                {freshRecipes.map(r => (
                  <div key={r.id} onClick={() => { setPrepPick(r); setPrepBatches(1); setPrepResult(null) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 16, padding: '12px 14px', marginBottom: 9, cursor: 'pointer' }}>
                    <div><div style={{ fontWeight: 800, fontSize: 14 }}>{r.name}</div><div style={{ fontSize: 11, color: P.muted }}>{r.linked}/{r.ingredients} linked · serves {r.serves}{r.cost != null ? ` · $${r.cost.toFixed(2)}` : ''}</div></div>
                    <PIcon name="back" size={16} stroke={P.muted} />
                  </div>
                ))}
              </>
            )
          ) : freshTab === 'markdown' ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 10px' }}>end-of-day markdown · {freshMarkdowns.length}</div>
              {freshMarkdowns.length === 0 && <div style={{ fontSize: 12.5, color: P.muted, padding: 16, textAlign: 'center', fontWeight: 500, lineHeight: 1.5 }}>No markdowns proposed — needs an active markdown rule + items near expiry. Nothing fabricated.</div>}
              {freshMarkdowns.map((m, i) => (
                <div key={i} style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 18, padding: 14, marginBottom: 11, boxShadow: HARD_SHADOW }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{m.name}</div>
                    <span style={{ fontWeight: 800, fontSize: 11, padding: '3px 9px', borderRadius: 9, border: `1.5px solid ${P.ink}`, background: P.lime }}>{m.discount_pct}% off</span>
                  </div>
                  <div style={{ fontSize: 12, color: P.muted, fontWeight: 600, marginTop: 3 }}><span style={{ textDecoration: 'line-through' }}>${m.current_price.toFixed(2)}</span> → <b style={{ color: P.ink }}>${m.marked_price.toFixed(2)}</b> · {m.days_left <= 0 ? 'expires today' : `${m.days_left}d left`} · {m.rule_name}</div>
                  <button onClick={() => setTab('tickets')} style={{ width: '100%', marginTop: 11, background: '#fff', color: P.ink, border: `1.5px solid ${P.ink}`, borderRadius: 13, padding: 11, fontFamily: BODY, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Apply via price tickets →</button>
                </div>
              ))}
              <div style={{ fontSize: 10.5, color: P.muted, textAlign: 'center', marginTop: 8, lineHeight: 1.5, fontWeight: 500 }}>Proposals only — applying changes the price through the existing tickets flow, never automatically.</div>
            </>
          ) : (
            <>
              <div style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 16, boxShadow: HARD_SHADOW, marginBottom: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>log a temperature</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: P.muted, marginBottom: 5 }}>Location</div>{inp(tempForm.location, v => setTempForm(f => ({ ...f, location: v })), 'Fridge 1')}
                <div style={{ display: 'flex', gap: 10, marginTop: 11 }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: P.muted, marginBottom: 5 }}>Reading °C</div>{inp(tempForm.reading, v => setTempForm(f => ({ ...f, reading: v })), '3.5', true)}</div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: P.muted, marginBottom: 5 }}>Max °C</div>{inp(tempForm.threshold, v => setTempForm(f => ({ ...f, threshold: v })), '5', true)}</div>
                </div>
                {tempMsg && <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 11, color: tempMsg.startsWith('✓') ? P.ink : P.red, background: tempMsg.startsWith('✓') ? P.lime : P.redSoft, border: `1.5px solid ${tempMsg.startsWith('✓') ? P.ink : P.red}`, borderRadius: 12, padding: '9px 12px', lineHeight: 1.4 }}>{tempMsg}</div>}
                <div style={{ marginTop: 12 }}><PipelButton onClick={logTempUi} disabled={freshBusy || !tempForm.reading.trim()}>{freshBusy ? 'Logging…' : 'Log temperature'}</PipelButton></div>
              </div>
              {freshTemp && (
                <>
                  {!freshTemp.logged_today && <div style={{ fontSize: 11.5, color: P.amber, fontWeight: 700, background: P.amberSoft, border: `1.5px solid ${P.amber}`, borderRadius: 12, padding: '9px 12px', marginBottom: 12 }}>⚑ No temperature logged today — overdue (in your tasks).</div>}
                  <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 9px' }}>recent · {freshTemp.failed_today} failed today</div>
                  {freshTemp.recent.map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 14, padding: '10px 13px', marginBottom: 8 }}>
                      <div><span style={{ fontWeight: 700, fontSize: 13 }}>{t.location}</span><div style={{ fontSize: 11, color: P.muted }}>{new Date(t.logged_at).toLocaleString('en-AU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}{t.by ? ` · ${t.by}` : ''}</div></div>
                      <span style={{ fontWeight: 800, fontSize: 14, color: t.passed ? P.ink : P.red }}>{t.reading_c}°C {t.passed ? '✓' : '⚠'}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        {tabbar}
      </>
    )
  }

  // ── LOSS & COMPLIANCE (INV-8) ──
  if (tab === 'loss') {
    const catColor = (c: string) => c.includes('Waste') ? P.red : c.includes('variance') ? P.amber : c.includes('Recall') ? P.ink : P.muted
    return shell(
      <>
        {statusbar}{header(true, 'recall', 'on-hold · shrinkage · compliance')}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px' }}>
          <PipelSegment inset={false} value={lossTab} onChange={v => setLossTab(v)}
            options={[{ value: 'quarantine', label: 'On hold' }, { value: 'recall', label: 'Recall' }, { value: 'shrinkage', label: 'Shrinkage' }]} />
          <div style={{ height: 14 }} />
          {lossMsg && <div style={{ fontSize: 12.5, color: P.ink, background: P.lime, border: `1.5px solid ${P.ink}`, borderRadius: 12, padding: '10px 13px', marginBottom: 13, fontWeight: 700, lineHeight: 1.4 }}>{lossMsg}</div>}
          {lossPermErr && <div style={{ fontSize: 12.5, color: P.amber, background: P.amberSoft, border: `1.5px solid ${P.amber}`, borderRadius: 12, padding: '10px 13px', marginBottom: 13, fontWeight: 700 }}>⚑ {lossPermErr}</div>}

          {lossState === 'loading' ? (
            <div style={{ height: 130, borderRadius: 22, background: P.card, border: `1.5px solid ${P.ink}` }} />
          ) : lossState === 'error' ? (
            <div style={{ padding: 22, borderRadius: 22, background: P.card, border: `1.5px solid ${P.ink}`, textAlign: 'center' }}><p style={{ fontWeight: 800, marginBottom: 12 }}>Couldn’t load</p><PipelButton onClick={() => loadLoss(outletId)} style={{ width: 'auto', padding: '10px 20px', display: 'inline-block' }}>Try again</PipelButton></div>
          ) : lossTab === 'quarantine' ? (
            <>
              {lossHolds.length === 0 && lossFailedTemps.length === 0 && <div style={{ fontSize: 12.5, color: P.muted, padding: 16, textAlign: 'center', fontWeight: 500 }}>Nothing on hold — all stock is sellable.</div>}
              {lossHolds.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 10px' }}>on hold · {lossHolds.length} · ${lossAtRisk.toFixed(0)} at risk</div>}
              {lossHolds.map(h => (
                <div key={h.id} style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 18, padding: 14, marginBottom: 11, boxShadow: HARD_SHADOW }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontWeight: 800, fontSize: 15 }}>{h.item_name}</div>{h.value_at_risk != null && <span style={{ fontWeight: 800, fontSize: 13, color: P.red }}>${h.value_at_risk.toFixed(2)}</span>}</div>
                  <div style={{ fontSize: 11.5, color: P.muted, fontWeight: 600, marginTop: 2 }}>{h.quantity} on hold · {h.reason}{h.quarantined_by ? ` · ${h.quarantined_by}` : ''}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                    <button disabled={lossBusy === h.id} onClick={() => resolveHoldUi(h.id, 'released')} style={{ flex: 1, background: P.lime, color: P.ink, border: `1.5px solid ${P.ink}`, borderRadius: 12, padding: 10, fontFamily: BODY, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Release</button>
                    <button disabled={lossBusy === h.id} onClick={() => resolveHoldUi(h.id, 'returned_to_supplier')} style={{ flex: 1, background: '#fff', color: P.ink, border: `1.5px solid ${P.ink}`, borderRadius: 12, padding: 10, fontFamily: BODY, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Return</button>
                    <button disabled={lossBusy === h.id} onClick={() => resolveHoldUi(h.id, 'disposed')} style={{ flex: 1, background: '#fff', color: P.red, border: `1.5px solid ${P.red}`, borderRadius: 12, padding: 10, fontFamily: BODY, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Dispose</button>
                  </div>
                </div>
              ))}
              {lossFailedTemps.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: P.red, textTransform: 'uppercase', letterSpacing: '.04em', margin: '16px 2px 10px' }}>failed temp checks today</div>
                  {lossFailedTemps.map((t, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: P.redSoft, border: `1.5px solid ${P.red}`, borderRadius: 14, padding: '10px 13px', marginBottom: 8, fontSize: 13 }}><span style={{ fontWeight: 700 }}>{t.location}</span><span style={{ fontWeight: 800, color: P.red }}>{t.reading_c}°C ⚠</span></div>)}
                </>
              )}
              <div style={{ fontSize: 10.5, color: P.muted, textAlign: 'center', marginTop: 12, lineHeight: 1.5, fontWeight: 500 }}>On-hold stock is never auto-deleted. Dispose/return needs a manager and writes through the canonical path.</div>
            </>
          ) : lossTab === 'recall' ? (
            recallPick ? (
              <div style={{ background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 22, padding: 16, boxShadow: HARD_SHADOW }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{recallPick.name}</div>
                <div style={{ fontSize: 12, color: P.muted, fontWeight: 600, marginTop: 2 }}>place on hold — pulls it from sellable stock</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', margin: '16px 0' }}>
                  <button onClick={() => setRecallQty(v => Math.max(1, v - 1))} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', fontSize: 22, fontWeight: 800, cursor: 'pointer' }}>−</button>
                  <div style={{ fontWeight: 800, fontSize: 34, minWidth: 52, textAlign: 'center' }}>{recallQty}</div>
                  <button onClick={() => setRecallQty(v => v + 1)} style={{ width: 46, height: 46, borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', fontSize: 22, fontWeight: 800, cursor: 'pointer' }}>+</button>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: P.muted, marginBottom: 5 }}>Reason</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                  {['supplier recall', 'contamination', 'quality', 'damaged'].map(r => (
                    <button key={r} onClick={() => setRecallReason(r)} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: BODY, border: `1.5px solid ${P.ink}`, background: recallReason === r ? P.lime : '#fff', color: P.ink }}>{r}</button>
                  ))}
                </div>
                <PipelButton onClick={placeRecall} disabled={lossBusy === 'recall'}>{lossBusy === 'recall' ? 'Placing…' : 'Place on hold'}</PipelButton>
                <button onClick={() => setRecallPick(null)} style={{ width: '100%', marginTop: 9, background: 'none', color: P.muted, border: 'none', fontFamily: BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>cancel</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={recallSearch} onChange={e => setRecallSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') recallSearchRun(recallSearch) }} placeholder="Find the product to recall…"
                    onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${P.lime}` }} onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
                    style={{ flex: 1, padding: '11px 13px', borderRadius: 14, border: `1.5px solid ${P.ink}`, background: '#fff', color: P.ink, fontFamily: BODY, fontSize: 14, outline: 'none' }} />
                  <button onClick={() => recallSearchRun(recallSearch)} style={{ background: P.lime, color: P.ink, border: `1.5px solid ${P.ink}`, borderRadius: 14, padding: '0 16px', fontFamily: BODY, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Find</button>
                </div>
                {recallMatches.map(m => (
                  <div key={m.id} onClick={() => { setRecallPick({ id: m.id, name: m.name }); setRecallQty(1); setRecallReason("supplier recall") }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 16, padding: "11px 13px", marginBottom: 9, cursor: "pointer" }}>
                    <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.name}</div><div style={{ fontSize: 11, color: P.muted }}>{m.on_hand} on hand</div></div>
                    <PIcon name="back" size={16} stroke={P.muted} />
                  </div>
                ))}
                {recallFromCache && recallMatches.length > 0 && <div style={{ fontSize: 11, color: T.amber, background: T.amberSoft, borderRadius: 9, padding: "8px 12px", marginBottom: 9, lineHeight: 1.5 }}>⚡ Offline — saved catalog. Stock levels may be slightly stale.</div>}
                {!lossBusy && recallMatches.length === 0 && !online && recallSearch.trim() && <div style={{ padding: 16, borderRadius: 12, background: T.amberSoft, border: "1.5px solid " + T.amber, textAlign: "center", fontSize: 12.5, color: T.ink, lineHeight: 1.6, marginBottom: 9 }}>You&apos;re offline — open this tab while connected to enable offline search.</div>}
                <div style={{ fontSize: 10.5, color: P.muted, textAlign: "center", marginTop: 8, lineHeight: 1.5, fontWeight: 500 }}>Recall is open to any staff — pulling unsafe stock fast. Stock isn’t deleted; it’s held for the owner to resolve.</div>
              </>
            )
          ) : lossShrink ? (
            <>
              <div style={{ background: P.ink, color: '#fff', borderRadius: 22, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#cfd2cc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>shrinkage · last {lossShrink.period_days}d</div>
                <div style={{ fontWeight: 800, fontSize: 30, marginTop: 3 }}>${lossShrink.total_dollars.toFixed(2)}</div>
                <div style={{ marginTop: 12 }}>
                  {lossShrink.by_category.map((c, i) => (
                    <div key={i} style={{ marginBottom: 9 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}><span>{c.category}</span><span>${c.dollars.toFixed(2)} · {c.pct}%</span></div>
                      <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}><div style={{ width: `${Math.max(3, c.pct)}%`, height: '100%', background: catColor(c.category) === P.ink ? P.lime : catColor(c.category) }} /></div>
                    </div>
                  ))}
                  {lossShrink.by_category.length === 0 && <div style={{ fontSize: 12, color: '#9aa3b2' }}>No loss recorded this period — clean.</div>}
                </div>
              </div>
              {lossShrink.top_products.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: P.muted, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 9px' }}>top loss products</div>
                  {lossShrink.top_products.map((p, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: P.card, border: `1.5px solid ${P.ink}`, borderRadius: 14, padding: '10px 13px', marginBottom: 8, fontSize: 13 }}><span style={{ fontWeight: 700 }}>{p.name}</span><span style={{ fontWeight: 800 }}>${p.dollars.toFixed(2)}</span></div>)}
                </>
              )}
              {lossShrink.theft_signals.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: P.amber, textTransform: 'uppercase', letterSpacing: '.04em', margin: '2px 2px 9px' }}>worth a closer look</div>
                  {lossShrink.theft_signals.map((t, i) => <div key={i} style={{ fontSize: 11.5, color: P.amber, fontWeight: 600, background: P.amberSoft, border: `1.5px solid ${P.amber}`, borderRadius: 12, padding: '9px 12px', marginBottom: 8, lineHeight: 1.4 }}>⚑ <b>{t.name}</b> — {t.fact}</div>)}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: P.muted, textAlign: 'center', marginTop: 12, lineHeight: 1.5, fontWeight: 500 }}>Every figure is a real waste/variance row. Patterns are flagged for a look — never an accusation.</div>
            </>
          ) : null}
        </div>
        {tabbar}
      </>
    )
  }

  // HOME
  const multiOutlet = (boot?.outlets.length ?? 0) > 1
  const vh = home?.value_hero

  // INV-1 — route a manifest tile to its screen. Implemented screens map to tabs; the rest land on home until
  // CX-UI-POLISH builds them. Falls back to the built-in TILES set if the manifest didn't load.
  const routeTile = (route: string) => {
    switch (route) {
      case 'scan': case 'gap_scan': setTab('scan'); break
      case 'stocktake': resetStocktake(); setTab('stocktake'); break
      case 'order': setTab('order'); break
      case 'fresh': setTab('fresh'); break
      case 'loss': setTab('loss'); break
      case 'tasks': case 'count': setTab('tasks'); break
      case 'receive': setReceiveData(null); setOpenPo(null); setTab('receive'); break
      case 'transfer': setTransferData(null); setTab('transfer'); break
      case 'expiring': setExpData(null); setTab('expiring'); break
      case 'adjust': setAdjustProduct(null); setTab('adjust'); break
      case 'waste': setWasteProduct(null); setTab('waste'); break
      case 'tickets': setTab('tickets'); break
      case 'reports': setTab('reports'); break
      case 'review': setTab('review'); break
      default: setTab('home')
    }
  }
  const tilesToShow: VisibleTile[] = (home?.visible_tiles?.length)
    ? home.visible_tiles
    : TILES.filter(t => t.key !== 'transfer' || multiOutlet).map(t => ({ id: t.key, label: t.label, sublabel: t.sub, icon: t.key, route: t.key, badge: t.badge }))

  // INV-PIPEL — "needs you" surfaces EXISTING home counts (no new data) as actionable rows to real screens.
  const tb = home?.tile_badges
  const needs: Array<{ icon: string; title: string; detail: string; cta: string; onCta: () => void; tone?: 'lime' | 'plain' }> = []
  if (home && (tb?.receive ?? 0) > 0) needs.push({ icon: 'truck', title: `${tb!.receive} deliver${tb!.receive === 1 ? 'y' : 'ies'} to receive`, detail: 'Log it against its PO', cta: 'Receive', onCta: () => routeTile('receive') })
  if (home && (home.mini_stats.tasks_open ?? 0) > 0) needs.push({ icon: 'count', tone: 'plain', title: `${home.mini_stats.tasks_open} task${home.mini_stats.tasks_open === 1 ? '' : 's'} to count`, detail: 'Aria built your list from real sales', cta: 'Count', onCta: () => setTab('tasks') })
  if (home && (tb?.expiring ?? 0) > 0) needs.push({ icon: 'clock', title: `${tb!.expiring} expiring soon`, detail: 'Clear or mark it down', cta: 'Review', onCta: () => routeTile('expiring') })

  const costPct = vh && vh.at_retail > 0 ? Math.round((vh.at_cost / vh.at_retail) * 100) : 39

  return shell(
    <>
      {statusbar}{header()}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 18 }}>
        {multiOutlet && boot && (
          <PipelSegment
            options={boot.outlets.map(o => ({ value: o.id, label: o.name.replace(/^\[TEST\]\s*/, '') }))}
            value={outletId ?? boot.outlets[0]?.id ?? ''}
            onChange={(v) => { setOutletId(v); loadHome(v) }}
          />
        )}

        {/* VALUE HERO */}
        {homeState === 'loading' ? (
          <div style={{ height: 200, borderRadius: 28, background: P.card, border: `1.5px solid ${P.ink}`, margin: '16px 16px 0' }} />
        ) : homeState === 'error' ? (
          <div style={{ margin: '16px 16px 0', padding: 24, borderRadius: 28, background: P.card, border: `1.5px solid ${P.ink}`, textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Couldn&apos;t load your stock</p>
            <PipelButton onClick={() => loadHome(outletId)} style={{ width: 'auto', padding: '10px 20px', display: 'inline-block' }}>Try again</PipelButton>
          </div>
        ) : homeState === 'empty' ? (
          <div style={{ margin: '16px 16px 0', padding: 30, borderRadius: 28, background: P.card, border: `1.5px solid ${P.ink}`, textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>📦</div>
            <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>No products yet</p>
            <p style={{ fontSize: 12.5, color: P.muted, lineHeight: 1.5, fontWeight: 500 }}>Add products in the dashboard and your live stock value appears here.</p>
          </div>
        ) : vh && (
          <PipelHero
            caption="Stock value on hand · at cost"
            value={money(vh.at_cost)}
            costPct={costPct}
            costLabel={money(vh.at_cost)}
            retailLabel={money(vh.at_retail)}
            marginTag={vh.margin_pct != null ? `${vh.margin_pct}% margin` : null}
            stats={[
              { n: home!.mini_stats.sold_today, k: 'sold today' },
              { n: home!.mini_stats.tasks_open, k: 'tasks open', tone: home!.mini_stats.tasks_open > 0 ? 'warn' : undefined },
              { n: home!.mini_stats.to_review, k: 'to review', tone: home!.mini_stats.to_review > 0 ? 'alert' : undefined },
            ]}
          />
        )}

        {/* NEEDS YOU — existing counts surfaced as actions */}
        {needs.length > 0 && (
          <>
            <PipelSectionHead title="needs you" em="· before close" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 16px' }}>
              {needs.map((n, i) => <PipelNeed key={i} icon={n.icon} title={n.title} detail={n.detail} cta={n.cta} onCta={n.onCta} tone={n.tone} />)}
            </div>
          </>
        )}

        {/* TOOL TILES — INV-1 manifest (home.visible_tiles), Pipel-skinned (icon chip + live stat + offset shadow). */}
        <PipelSectionHead title="inventory tools" right={`all ${tilesToShow.length}`} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, margin: '0 16px' }}>
          {tilesToShow.map(t => {
            const count = t.badge ? ((home?.tile_badges as Record<string, number>)?.[t.badge] ?? 0) : 0
            const badgeWord = t.badge === 'order' ? 'to reorder' : t.badge === 'receive' ? 'to receive' : t.badge === 'expiring' ? 'within 7 days' : 'today'
            const isWaste = t.id === 'waste' || t.route === 'waste'
            const isReports = t.id === 'reports'
            const variant = isWaste ? 'loss' : isReports ? 'featured' : 'default'
            const hasCount = !!t.badge && count > 0
            return (
              <PipelTile
                key={t.id}
                icon={t.icon}
                label={t.label}
                statValue={hasCount ? count : undefined}
                statSuffix={hasCount ? badgeWord : t.sublabel}
                badge={isReports ? 'new' : t.id === 'expiring' ? 'soon' : undefined}
                badgeTone={t.id === 'expiring' ? 'amber' : 'default'}
                variant={variant}
                onClick={() => routeTile(t.route)}
              />
            )
          })}
        </div>
      </div>
      {tabbar}
    </>
  )
}
