// force-recompile:1779337019
'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { OrderType } from '@/components/pos/OrderTypeSelector';
import type { CustomerDetails } from '@/components/pos/CustomerCaptureModal';
import type { ConfiguredCartItem } from '@/types/pos-modifiers';
import Link from 'next/link';
import { isMobileDevice, hasCameraSupport } from '@/lib/mobile-detect';
import { SFX } from '@/lib/pos-utils';
import dynamic from 'next/dynamic';
import type { FlyToCartHandle } from '@/components/pos/FlyToCart';
import type { ReceiptTemplate } from '@/components/pos/Receipt';
import { printReceiptWithTemplate } from '@/lib/pos-print';
import { printReceipt as printESCPOS } from '@/lib/pos/escpos';
import { AriaChatMessage } from '@/components/pos/AriaChatMessage';
import type { AriaResponse } from '@/components/pos/AriaChatMessage';

const CursorGlow = dynamic(() => import('@/components/pos/CursorGlow'), { ssr: false });
// AnimatedBg removed from terminal v4 — static aurora only (AuroraCanvas handles background)
const FlyToCart  = dynamic(() => import('@/components/pos/FlyToCart'),  { ssr: false });

const ModifierModal       = dynamic(() => import('@/components/pos/ModifierModal').then(m => ({ default: m.ModifierModal })), { ssr: false });
const SandwichBuilder     = dynamic(() => import('@/components/pos/SandwichBuilder').then(m => ({ default: m.SandwichBuilder })), { ssr: false });
const FloorPlan           = dynamic(() => import('@/components/pos/FloorPlan').then(m => ({ default: m.FloorPlan })), { ssr: false });
const OrderTypeSelector   = dynamic(() => import('@/components/pos/OrderTypeSelector').then(m => ({ default: m.OrderTypeSelector })), { ssr: false });
const CustomerCaptureModal = dynamic(() => import('@/components/pos/CustomerCaptureModal').then(m => ({ default: m.CustomerCaptureModal })), { ssr: false });
const Receipt             = dynamic(() => import('@/components/pos/Receipt'), { ssr: false });
const SplitModal          = dynamic(() => import('@/components/pos/SplitModal'), { ssr: false });
const CafeSetupModal      = dynamic(() => import('@/components/pos/CafeSetupModal'), { ssr: false });
const KdsTracker          = dynamic(() => import('@/components/pos/KdsTracker'), { ssr: false });
const DiscountBar         = dynamic(() => import('@/components/pos/DiscountBar'), { ssr: false });
const ModifierPickerModal = dynamic(() => import('@/components/pos/ModifierPickerModal'), { ssr: false });
const PriceOverrideModal  = dynamic(() => import('@/components/pos/PriceOverrideModal'), { ssr: false });

// Layout system — additive
import { LayoutSwitcher } from '@/components/terminal/LayoutSwitcher';
import { LayoutWrapper } from '@/components/terminal/layouts/LayoutWrapper';
import { FastGridLayout } from '@/components/terminal/layouts/FastGridLayout';
import { ShelfLayout } from '@/components/terminal/layouts/ShelfLayout';
import { CarouselLayout } from '@/components/terminal/layouts/CarouselLayout';
import { MasonryLayout } from '@/components/terminal/layouts/MasonryLayout';
import { SearchFirstLayout } from '@/components/terminal/layouts/SearchFirstLayout';
import { EmptyLayoutState } from '@/components/terminal/layouts/EmptyLayoutState';
import type { ProductForTerminal } from '@/components/terminal/layouts/types';
import { getCurrentLayout, TerminalLayout } from '@/lib/terminal/layouts';
import { getAriaSuggestions } from '@/lib/terminal/aria-suggestions';
import { AuroraCanvas } from '@/components/terminal/AuroraCanvas';
import { AriaInlineCard } from '@/components/terminal/AriaInlineCard';
import { ProductImage } from '@/components/terminal/ProductImage';
import CustomerLookupBar, { type LoyaltyCustomer } from '@/components/pos/CustomerLookupBar';
import type { DiscountBarCartItem } from '@/components/pos/DiscountBar';
import { useScanner } from '@/lib/hardware/scanner';
import type { AppliedDiscount } from '@/lib/pos/discount-engine';
import CartLineMenu from '@/components/pos/CartLineMenu';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';

/* ─── Types ─────────────────────────────────────────────────────── */
interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number; tax_rate: number;
  tax_code_id?: string | null; additional_tax_code_ids?: string[] | null;
  stock_quantity: number; low_stock_threshold: number;
  track_stock: boolean; is_active: boolean; is_age_restricted?: boolean;
  category_id: string | null;
  pos_categories?: { name: string; color: string } | null;
  builder_type?: string | null;  // Sprint C — 'sandwich' | null
  image_url?: string | null;
  is_weight_based?: boolean;
  price_per_kg?: number | null;
  serial_tracked?: boolean;
  is_schedule_drug?: boolean;
  schedule_level?: string | null;
  requires_script?: boolean;
}
interface GlobalProductHit {
  name: string; brand?: string; category?: string;
  suggested_price_cents?: number; is_age_restricted?: boolean;
}
interface Modifier { id: string; name: string; price_adjustment: number; modifier_group: string | null; }
interface VariantGroup { id: string; name: string; values: string[]; affects_price: boolean; price_map: Record<string, number>; }
interface SimpleVariant { id: string; name: string; price: number | null; sku: string | null; barcode: string | null; stock_quantity: number; sort_order: number; }
interface ModifierLink { id: string; modifier_id: string; pos_modifiers: Modifier; }
interface CartItem {
  product: Product; qty: number; discount_percent?: number;
  label?: string; variantLabel?: string; modifierDetails?: Modifier[]; unitPrice: number;
  variant_id?: string | null; variant_name?: string | null;
}
interface Customer { id: string; name: string; email: string | null; phone: string | null; loyalty_points: number; total_spent: number; points_balance?: number; stamps_count?: number; tags?: string[]; visit_count?: number; last_visit_at?: string | null; }
interface ParkedSale { id: string; label: string | null; items: CartItem[]; total: number; customer_id: string | null; created_at: string; }
interface RegisterSession { id: string; status: string; opening_float: number; opened_at: string; opened_by: string | null; }
interface VariantModalState { product: Product; variantGroups: VariantGroup[]; modifiers: Modifier[]; }
interface AriaChatMsg { role: 'user' | 'assistant'; content: string; structured?: AriaResponse; ts: number; }
interface RecentSale { id: string; total: number; items: number; time: Date; }

/* ─── Cash rounding ─────────────────────────────────────────────── */
function roundCash(amount: number): number { return Math.round(amount * 20) / 20; }

/* ─── Product card visual constants ─────────────────────────────── */
interface CatStyle { bg: string; text: string; emoji: string; }
const CATEGORY_STYLES: Record<string, CatStyle> = {
  'Beer & Cider':  { bg: '#FEF3C7', text: '#92400E', emoji: '🍺' },
  'Wine':          { bg: '#FDF2F8', text: '#9D174D', emoji: '🍷' },
  'Spirits':       { bg: '#EFF6FF', text: '#1E40AF', emoji: '🥃' },
  'RTD':           { bg: '#ECFDF5', text: '#065F46', emoji: '🍹' },
  'Soft Drinks':   { bg: '#F0FDF4', text: '#166534', emoji: '🥤' },
  'Water':         { bg: '#E0F2FE', text: '#0369A1', emoji: '💧' },
  'Energy Drinks': { bg: '#FFFBEB', text: '#92400E', emoji: '⚡' },
  'Sports Drinks': { bg: '#F0FDF4', text: '#166534', emoji: '🏃' },
  'Snacks':        { bg: '#FFF7ED', text: '#9A3412', emoji: '🍿' },
  'Confectionery': { bg: '#FDF4FF', text: '#7E22CE', emoji: '🍬' },
  'Coffee':        { bg: '#FEF3C7', text: '#78350F', emoji: '☕' },
  'Food':          { bg: '#FFF7ED', text: '#C2410C', emoji: '🍔' },
  'Dairy':         { bg: '#F0F9FF', text: '#0369A1', emoji: '🥛' },
  'Frozen':        { bg: '#EFF6FF', text: '#1D4ED8', emoji: '🧊' },
  'Tobacco':       { bg: '#F8FAFC', text: '#374151', emoji: '🚬' },
  'Ice Cream':     { bg: '#FDF4FF', text: '#7E22CE', emoji: '🍦' },
  'Bakery':        { bg: '#FFFBEB', text: '#92400E', emoji: '🥐' },
};
const DEFAULT_CAT_STYLE: CatStyle = { bg: '#F9FAFB', text: '#374151', emoji: '📦' };

function getCatStyle(catName: string | null | undefined): CatStyle {
  if (!catName) return DEFAULT_CAT_STYLE;
  if (CATEGORY_STYLES[catName]) return CATEGORY_STYLES[catName];
  // Map unknown categories by first char to a colour slot
  const code = catName.charCodeAt(0) % 8;
  const fallbacks: CatStyle[] = [
    { bg: '#FEF3C7', text: '#92400E', emoji: '📦' },
    { bg: '#F0FDF4', text: '#166534', emoji: '📦' },
    { bg: '#EFF6FF', text: '#1E40AF', emoji: '📦' },
    { bg: '#FDF4FF', text: '#7E22CE', emoji: '📦' },
    { bg: '#FFF7ED', text: '#9A3412', emoji: '📦' },
    { bg: '#FDF2F8', text: '#9D174D', emoji: '📦' },
    { bg: '#ECFDF5', text: '#065F46', emoji: '📦' },
    { bg: '#F9FAFB', text: '#374151', emoji: '📦' },
  ];
  return fallbacks[code] ?? DEFAULT_CAT_STYLE;
}

// Keep legacy helpers for category tabs
function getCategoryEmoji(catName: string | null | undefined): string {
  return getCatStyle(catName).emoji;
}
function getCategoryBg(catName: string | null | undefined): string {
  return getCatStyle(catName).bg;
}

const CART_SESSION_KEY = 'aria_pos_cart_v1';
type PayMethod = 'card' | 'cash' | 'split' | 'gift_card' | 'direct_deposit';

/* ═══════════════════════════════════════════════════════════════════
   TERMINAL
═══════════════════════════════════════════════════════════════════ */
export default function TerminalPage() {
  /* ── Data ─────────────────────────────────────────────────────── */
  const [products,       setProducts]       = useState<Product[]>([]);
  // O(1) barcode/SKU lookup — rebuilt whenever products list changes
  const barcodeMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) {
      if (p.barcode) m.set(p.barcode, p);
      if (p.sku) m.set(p.sku, p);
    }
    return m;
  }, [products]);
  // Pre-loaded modifier cache — eliminates 4-5s API calls on every product tap
  const modifierCache = useRef<Record<string, { hasModifiers: boolean; hasVariants: boolean }>>({});
  const [parkedSales,    setParkedSales]    = useState<ParkedSale[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [businessId,     setBusinessId]     = useState<string | null>(null);
  const [businessName,   setBusinessName]   = useState<string>('AriaPOS');
  const [lowStockItems,  setLowStockItems]  = useState<Product[]>([]);
  const [lowStockDismissed, setLowStockDismissed] = useState(false);
  const [recentSales,    setRecentSales]    = useState<RecentSale[]>([]);
  const [showMobileBanner, setShowMobileBanner] = useState(false);

  /* ── Clock In/Out ─────────────────────────────────────────────── */
  const [showClockModal,  setShowClockModal]  = useState(false);
  const [clockPin,        setClockPin]        = useState('');
  const [clockMode,       setClockMode]       = useState<'in' | 'out'>('in');
  const [clockResult,     setClockResult]     = useState<string | null>(null);
  const [clockLoading,    setClockLoading]    = useState(false);

  const submitClock = async () => {
    if (!clockPin.trim() || clockLoading) return;
    setClockLoading(true);
    setClockResult(null);
    try {
      const endpoint = clockMode === 'in' ? '/api/staff/timesheets/clock-in' : '/api/staff/timesheets/clock-out';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: clockPin }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      setClockResult(data.message ?? data.error ?? 'Done');
      setClockPin('');
      if (data.ok) setTimeout(() => { setShowClockModal(false); setClockResult(null); }, 2000);
    } catch {
      setClockResult('Network error — try again');
    }
    setClockLoading(false);
  };

  /* ── Cart ─────────────────────────────────────────────────────── */
  const [cart,           setCart]           = useState<CartItem[]>([]);

  // Multi-business killer feature: INSTANT in-place re-skin on business switch.
  // No window.location.reload() — we clear the cart, wipe all venue-scoped
  // state, refetch this venue's products and re-skin the terminal. The API
  // is already scoped to user_active_business, so the new fetch returns ONLY
  // the switched-to venue's catalogue.
  const [switchingBusiness, setSwitchingBusiness] = useState(false);
  useEffect(() => {
    async function handleBusinessChange() {
      setSwitchingBusiness(true);
      // Clear everything that belongs to the previous venue
      setCart([]);
      setCustomer(null);
      setSelectedItem(null);
      setParkedSales([]);
      setLowStockItems([]);
      modifierCache.current = {};
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('aria_pos_products_cache');
        sessionStorage.removeItem('aria_pos_cart_v1');
      }
      try {
        // Refetch — API resolves the NEW active business server-side
        const prod = await fetch('/api/pos/products').then(r => r.json());
        if (prod.business_id)    setBusinessId(prod.business_id);
        if (prod.business_name)  setBusinessName(prod.business_name);
        if (prod.business_type)  setBusinessType(prod.business_type);
        if (prod.terminal_layout) setTerminalLayoutOverride(prod.terminal_layout as TerminalLayout);
        const prods: Product[] = prod.products || [];
        setProducts(prods);
        setLowStockItems(prods.filter(p => p.track_stock && p.stock_quantity <= (p.low_stock_threshold ?? 5) && p.is_active));
        if (prods.length > 0) {
          const ids = prods.map(p => p.id).join(',');
          fetch('/api/pos/product-modifier-groups/bulk?product_ids=' + ids)
            .then(r => r.ok ? r.json() : { cache: {} })
            .then((d: { cache?: Record<string, { hasModifiers: boolean; hasVariants: boolean }> }) => {
              if (d.cache) modifierCache.current = d.cache;
            })
            .catch(() => {});
        }
      } catch {
        // Network hiccup — fall back to a hard reload so we never show stale data
        window.location.reload();
        return;
      }
      setSwitchingBusiness(false);
    }
    window.addEventListener('aria:business-changed', handleBusinessChange)
    return () => window.removeEventListener('aria:business-changed', handleBusinessChange)
  }, [])
  const [selectedItem,   setSelectedItem]   = useState<string | null>(null);
  const [customer,       setCustomer]       = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [displaySuggestion, setDisplaySuggestion] = useState<{ id: string; offer_text: string; discount_pct: number } | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [lastAddedId,    setLastAddedId]    = useState<string | null>(null);
  const [discountMode,   setDiscountMode]   = useState<'pct' | 'amt' | null>(null);
  const [discountVal,    setDiscountVal]    = useState('');

  /* ── Commission / sale attribution ───────────────────────────── */
  const [servedBy,       setServedBy]       = useState<string>('');
  const [posUserId,      setPosUserId]      = useState<string | null>(null);

  /* ── Payment ──────────────────────────────────────────────────── */
  const [payMethod,      setPayMethod]      = useState<PayMethod>('card');
  // EOD markdown — active rule if current time is past trigger
  const [eodMarkdown, setEodMarkdown] = useState<{ discount_pct: number; name: string; category_id: string|null } | null>(null);

  // Surcharge rules — loaded once on mount, applied to total based on payment method
  const [surchargeRules, setSurchargeRules] = useState<Array<{ id:string; payment_type:string|null; amount_type:string|null; amount:number; is_active:boolean; day_of_week:number[]|null }>>([]);
  // Pharmacist consultation prompt (pharmacy schedule drugs)
  const [pharmPrompt,    setPharmPrompt]    = useState<{ product: Product } | null>(null);
  const [pharmConfirmed, setPharmConfirmed] = useState(false);

  // Serial number prompt
  const [serialPrompt,   setSerialPrompt]   = useState<{ product: Product; label?: string } | null>(null);
  const [serialInput,    setSerialInput]    = useState('');
  const [cashTendered,   setCashTendered]   = useState('');
  const [splitCash,      setSplitCash]      = useState('');
  const [processing,     setProcessing]     = useState(false);
  const [showReceipt,    setShowReceipt]    = useState<any>(null);
  const [giftCardCode,        setGiftCardCode]        = useState('');
  const [giftCardBalance,     setGiftCardBalance]     = useState<number | null>(null);
  const [giftCardChecking,    setGiftCardChecking]    = useState(false);
  const [giftCardError,       setGiftCardError]       = useState('');
  const [directDepositRef,    setDirectDepositRef]    = useState('');
  const [directDepositName,   setDirectDepositName]   = useState('');

  /* ── Register ─────────────────────────────────────────────────── */
  const [registerSession,   setRegisterSession]   = useState<RegisterSession | null>(null);
  const [registerLoading,   setRegisterLoading]   = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [openingFloat,      setOpeningFloat]      = useState('200');
  const [openingRegister,   setOpeningRegister]   = useState(false);
  const [closingRegister,   setClosingRegister]   = useState(false);
  const [showCloseModal,    setShowCloseModal]    = useState(false);
  const [closingFloat,      setClosingFloat]      = useState('');
  const [registerError,     setRegisterError]     = useState<string | null>(null);

  /* ── Variants/modifiers ───────────────────────────────────────── */
  const [variantModal,     setVariantModal]     = useState<VariantModalState | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedMods,     setSelectedMods]     = useState<Record<string, boolean>>({});
  const [variantQty,       setVariantQty]       = useState(1);
  const [variantLoading,   setVariantLoading]   = useState(false);
  const [simplePriceModal, setSimplePriceModal] = useState<{ product: Product; variants: SimpleVariant[] } | null>(null);

  /* ── UI ───────────────────────────────────────────────────────── */
  const [showOutletDropdown, setShowOutletDropdown] = useState(false);
  const [search,           setSearch]           = useState('');
  const [activeCategory,   setActiveCategory]   = useState<string | null>(null);
  const [showParked,       setShowParked]       = useState(false);
  const [mobileTab,        setMobileTab]        = useState<'products' | 'cart' | 'aria'>('products');

  /* ── Product grid layout prefs ────────────────────────────────── */
  const [productGridOrder, setProductGridOrder] = useState<Record<string, string[]> | null>(null);
  const [gridCustomising,  setGridCustomising]  = useState(false);

  /* ── Aria chat ────────────────────────────────────────────────── */
  const [ariaOpen,       setAriaOpen]       = useState(false);
  const [chatInput,      setChatInput]      = useState('');
  const [chatMessages,   setChatMessages]   = useState<AriaChatMsg[]>([]);
  // Weight-based pricing modal
  const [weightModal, setWeightModal] = useState<{ product: Product } | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [chatLoading,    setChatLoading]    = useState(false);

  /* ── Missed sale ──────────────────────────────────────────────── */
  const [showMissedModal, setShowMissedModal] = useState(false);
  const [missedName,      setMissedName]      = useState('');
  const [missedQty,       setMissedQty]       = useState('1');
  const [missedNote,      setMissedNote]      = useState('');
  const [savingMissed,    setSavingMissed]    = useState(false);

  /* ── Age verification ──────────────────────────────────────────── */
  const [ageVerified,    setAgeVerified]    = useState(false);
  const [showAgeModal,   setShowAgeModal]   = useState(false);

  /* ── Product suggestions (/api/aria/pos-suggestions) ───────────── */
  const [suggestions,        setSuggestions]        = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  /* ── Barcode external lookup (/api/products/barcode-lookup) ────── */
  const [barcodeLookupHit,  setBarcodeLookupHit]  = useState<GlobalProductHit | null>(null);
  const [barcodeScanning,   setBarcodeScanning]   = useState(false);

  /* ── Quick access panel ───────────────────────────────────────── */
  const [showQuickPanel,   setShowQuickPanel]   = useState(false);

  /* ── Expiry tracking ──────────────────────────────────────────── */
  const [expiryPrompt, setExpiryPrompt] = useState<{
    product_id: string; product_name: string;
    existing_batch: { id: string; expiry_date: string; quantity_remaining: number } | null;
    mode: 'confirm_existing' | 'ask_new' | 'ask_track';
    pending_date: string;
  } | null>(null);

  /* ── Custom item / Note ───────────────────────────────────────── */
  const [showCustomItem,   setShowCustomItem]   = useState(false);
  const [customItemForm,   setCustomItemForm]   = useState({ desc: '', price: '', qty: '1', taxable: true, isNote: false });

  /* ── Price check mode ─────────────────────────────────────────── */
  const [priceCheckMode,   setPriceCheckMode]   = useState(false);
  const [priceCheckProd,   setPriceCheckProd]   = useState<Product | null>(null);

  /* ── Refund ───────────────────────────────────────────────────── */
  const [showRefundModal,  setShowRefundModal]  = useState(false);
  const [refundSearch,     setRefundSearch]     = useState('');
  const [refundResults,    setRefundResults]    = useState<any[]>([]);
  const [refundSale,       setRefundSale]       = useState<any>(null);
  const [refundItems,      setRefundItems]      = useState<Record<string, boolean>>({});
  const [processingRefund, setProcessingRefund] = useState(false);

  /* ── Cashier switch ───────────────────────────────────────────── */
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [cashierName,      setCashierName]      = useState('');
  const [switchingCashier, setSwitchingCashier] = useState(false);

  /* ── Receipt reprint ──────────────────────────────────────────── */
  const [reprintSale,      setReprintSale]      = useState<any>(null);

  /* ── Default receipt template (from Canva editor) ─────────────── */
  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate | null>(null);

  /* ── Terminal view state ────────────────────────────────────────── */
  const [terminalView,     setTerminalView]     = useState<'pos' | 'checkout' | 'confirm'>('pos');
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  /* ── Context menu ─────────────────────────────────────────────── */
  const [contextMenu,      setContextMenu]      = useState<{ product: Product; x: number; y: number } | null>(null);

  // Layout system — additive
  const [currentLayout, setLayout] = useState<TerminalLayout>('grid');
  const [recentProductIds, setRecentProductIds] = useState<string[]>([]);
  const [businessType, setBusinessType] = useState<string>('liquor');
  const [terminalLayoutOverride, setTerminalLayoutOverride] = useState<TerminalLayout | null>(null);
  const [showCafeSetup, setShowCafeSetup] = useState(false);
  // Cafe modifier modal (Sprint A) — additive, cafe-only
  const [modifierModalProduct,  setModifierModalProduct]  = useState<Product | null>(null);
  // Sandwich/food builder (Sprint C) — additive, cafe-only
  const [sandwichBuilderProduct, setSandwichBuilderProduct] = useState<Product | null>(null);
  // Order context (Sprint D) — additive, cafe-only
  const [orderType,            setOrderType]            = useState<OrderType>('takeaway');
  const [showCustomerCapture,  setShowCustomerCapture]  = useState(false);
  const [showFloorPlan,        setShowFloorPlan]        = useState(false);
  const [customerDetails,      setCustomerDetails]      = useState<CustomerDetails | null>(null);
  const [selectedTable,        setSelectedTable]        = useState<{ id: string; name: string } | null>(null);
  const [floorPlanEditMode,    setFloorPlanEditMode]    = useState(false);

  // Sprint H — cart customisation (modifier picker, price override, line menu)
  const [modifierPicker, setModifierPicker] = useState<null | { product: Product }>(null);
  const [priceOverride, setPriceOverride] = useState<null | { index: number; line: CartItem }>(null);
  const [editNotesState, setEditNotesState] = useState<null | { index: number; line: CartItem }>(null);
  const [canOverridePrice, setCanOverridePrice] = useState(false);
  useEffect(() => {
    fetch('/api/pos/users/me-permissions')
      .then(r => r.json())
      .then(d => setCanOverridePrice(!!d.permissions?.can_override_price))
      .catch(() => {});
  }, []);

  // Outlet awareness — additive
  const [activeOutletId, setActiveOutletId] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<any[]>([]);

  // Bill splitting
  const [showSplitModal,   setShowSplitModal]   = useState(false);
  const [splitSaleId,      setSplitSaleId]      = useState<string | null>(null);

  // KDS tracker — cafe-only
  const [showKdsTracker,   setShowKdsTracker]   = useState(false);
  const [kdsReadyOrders,   setKdsReadyOrders]   = useState<string[]>([]);

  // Online orders bell — Sprint J, cafe-only
  const [pendingOnlineOrders, setPendingOnlineOrders] = useState<Array<{ id: string; order_number: string; customer_name: string; total: number }>>([])
  const [showOnlineBell,      setShowOnlineBell]      = useState(false)

  // Loyalty — Sprint G, cafe-only
  const [loyaltyConfig, setLoyaltyConfig] = useState<{ program_type: string; points_per_dollar: number; point_value_cents: number; stamps_to_reward: number; stamp_reward_text: string } | null>(null);
  const [redeemActive,  setRedeemActive]  = useState(false);

  // Discounts & promotions — Sprint I, cafe-only
  const [appliedDiscounts, setAppliedDiscounts] = useState<AppliedDiscount[]>([])
  const [manualDiscountAmt, setManualDiscountAmt] = useState(0)

  // Training mode — additive
  const [trainingMode, setTrainingMode] = useState(false);
  const [trainingOffTimer, setTrainingOffTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard shortcuts help modal — additive
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  function toggleTrainingMode() {
    const newVal = !trainingMode;
    setTrainingMode(newVal);
    if (trainingOffTimer) clearTimeout(trainingOffTimer);
    if (newVal) {
      // Auto-off after 4 hours
      const t = setTimeout(() => setTrainingMode(false), 4 * 60 * 60 * 1000);
      setTrainingOffTimer(t);
    }
  }

  // Layby modal state — additive
  const [showLaybyModal, setShowLaybyModal] = useState(false);
  const [laybyDeposit, setLaybyDeposit] = useState('');
  const [laybyDueDate, setLaybyDueDate] = useState('');
  const [laybyNotes, setLaybyNotes] = useState('');
  const [laybyLoading, setLaybyLoading] = useState(false);

  const searchRef   = useRef<HTMLInputElement>(null);
  const chatEndRef  = useRef<HTMLDivElement>(null);
  const flyRef      = useRef<FlyToCartHandle>(null);
  const cartAnchor  = useRef<HTMLDivElement>(null);
  const barcodeBuffer = useRef('');
  const barcodeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeTs     = useRef<number>(0);
  const quickPanelRef = useRef<HTMLDivElement>(null);

  /* ── Apply saved theme on terminal mount ─────────────────────── */
  useEffect(() => {
    const stored = localStorage.getItem('pos_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', stored)
  }, [])

  /* ── sessionStorage cart persistence ─────────────────────────── */
  useEffect(() => {
    try { const saved = sessionStorage.getItem(CART_SESSION_KEY); if (saved) setCart(JSON.parse(saved)); } catch { /* ignore */ }
    // Pre-fill served_by from logged-in POS user
    try {
      const posUser = localStorage.getItem('aria_pos_user');
      if (posUser) {
        const u = JSON.parse(posUser);
        if (u.name) setServedBy(u.name);
        if (u.id && u.id !== 'owner') setPosUserId(u.id);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(CART_SESSION_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);

  /* ── Keyboard shortcuts — additive ───────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === '/') { e.preventDefault(); setShowShortcutsModal(s => !s); return; }
      if (isMeta && e.key === 'f') { e.preventDefault(); document.getElementById('pos-product-search')?.focus(); return; }
      if (e.key === 'Escape') { setShowShortcutsModal(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Realtime price sync (multi-tab) — additive ───────────────── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    import('@/lib/supabase').then(({ supabase: sb }) => {
      if (!sb) return;
      const today = new Date().toISOString().split('T')[0];
      channel = sb.channel('pos_future_prices_terminal')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('postgres_changes' as any, {
          event: 'INSERT', schema: 'public', table: 'pos_future_prices',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }, (payload: any) => {
          const effectiveFrom = payload.new?.effective_date as string | undefined;
          if (effectiveFrom && effectiveFrom <= today) {
            fetch('/api/pos/products').then(r => r.json()).then(d => {
              if (d.products) setProducts(d.products);
            }).catch(() => {});
          }
        })
        .subscribe();
    });
    return () => { channel?.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Register load ────────────────────────────────────────────── */
  const loadRegister = useCallback(async () => {
    setRegisterLoading(true);
    try { const r = await fetch('/api/pos/sessions'); if (r.ok) { const d = await r.json(); setRegisterSession(d.openSession ?? null); } }
    catch { /* silent */ }
    setRegisterLoading(false);
  }, []);

  /* ── Initial data load ────────────────────────────────────────── */
  useEffect(() => {
    loadRegister();

    let onlineOrderInterval: ReturnType<typeof setInterval> | null = null;
    let kdsChannel: BroadcastChannel | null = null;

    const t0Prods = performance.now();
    Promise.all([
      fetch('/api/pos/products').then(r => r.json()),
      fetch('/api/pos/park').then(r => r.json()),
      fetch('/api/pos/receipt-templates').then(r => r.json()).catch(() => ({ templates: [] })),
    ]).then(([prod, park, tmplData]) => {
      console.log('[POS perf] products:', (performance.now() - t0Prods).toFixed(2), 'ms');
      // ALWAYS run these — no early returns until after setLoading(false)
      if (prod.business_id) setBusinessId(prod.business_id);
      if (prod.business_name) setBusinessName(prod.business_name);
      if (prod.business_type) setBusinessType(prod.business_type);
      if (prod.terminal_layout) setTerminalLayoutOverride(prod.terminal_layout as TerminalLayout);

      const prods: Product[] = prod.products || [];
      setProducts(prods);
      setParkedSales(park.parked_sales || []);
      // Pre-load modifier data in bulk — eliminates per-tap API round trips
      if (prods.length > 0) {
        const ids = prods.map(p => p.id).join(',')
        fetch(`/api/pos/product-modifier-groups/bulk?product_ids=${ids}`)
          .then(r => r.ok ? r.json() : { cache: {} })
          .then((d: { cache?: Record<string, { hasModifiers: boolean; hasVariants: boolean }> }) => {
            if (d.cache) modifierCache.current = d.cache;
          })
          .catch(() => {});
      }
      setLowStockItems(prods.filter(p => p.track_stock && p.stock_quantity <= (p.low_stock_threshold ?? 5) && p.is_active));

      // First-run cafe setup
      if (prod.business_type === 'cafe' && prods.length === 0) {
        setShowCafeSetup(true);
      }

      // Cafe-only side effects (NON-blocking — must not prevent setLoading)
      if (prod.business_type === 'cafe') {
        // Load loyalty config
        fetch('/api/pos/loyalty/config').then(r => r.json()).then(d => {
          if (d.config && d.config.program_type !== 'off') setLoyaltyConfig(d.config);
        }).catch(() => {});

        // KDS BroadcastChannel listener
        try {
          kdsChannel = new BroadcastChannel('aria-kds');
          kdsChannel.onmessage = (e) => {
            if (e.data?.type === 'order_ready') {
              setKdsReadyOrders(prev => [...new Set([...prev, e.data.sale_id])]);
            }
          };
        } catch { /* BroadcastChannel not available */ }

        // Poll for pending online orders every 30s — Sprint J
        const pollOnlineOrders = async () => {
          try {
            const res = await fetch('/api/pos/online-orders?status=pending&limit=10');
            if (res.ok) {
              const d = await res.json();
              const newOrders = d.orders ?? [];
              if (newOrders.length > 0) {
                setPendingOnlineOrders(newOrders);
                setShowOnlineBell(true);
                try { new Audio('/pos-sfx/new-order.mp3').play(); } catch { /* ignore */ }
              }
            }
          } catch { /* non-fatal */ }
        };
        pollOnlineOrders();
        onlineOrderInterval = setInterval(pollOnlineOrders, 30000);
      }

      // CRITICAL: runs for every business type — no early return above this line
      setLoading(false);

      // Load default receipt template (non-blocking, after terminal renders)
      const templates: ReceiptTemplate[] = tmplData.templates || [];
      if (templates.length > 0) {
        const def = templates.find((t: ReceiptTemplate) => t.is_default) ?? templates[0];
        if (def?.elements?.length) setReceiptTemplate(def);
      }
    }).catch(() => setLoading(false));

    // Cleanup — correct location: useEffect return, not .then() callback
    return () => {
      if (onlineOrderInterval) clearInterval(onlineOrderInterval);
      if (kdsChannel) { try { kdsChannel.close(); } catch { /* ignore */ } }
    };
  }, [loadRegister]);

  /* ── Layout init from business_type + localStorage — additive ── */
  useEffect(() => {
    setLayout(getCurrentLayout(businessType, terminalLayoutOverride));
  }, [businessType, terminalLayoutOverride]);

  /* ── businessId-gated fetches — merged to avoid waterfall ──────── */
  useEffect(() => {
    if (!businessId) return;
    function checkEod() {
      fetch('/api/pos/eod-markdown')
        .then(r => r.json())
        .then((d: { rules?: Array<{ trigger_time:string; discount_pct:number; name:string; is_active:boolean; days_of_week:number[]|null; category_id:string|null }> }) => {
          const now = new Date();
          const todayDow = now.getDay();
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const active = (d.rules ?? []).find(r => {
            if (!r.is_active) return false;
            const [h, m] = r.trigger_time.split(':').map(Number);
            const ruleMins = h * 60 + m;
            const dayOk = !r.days_of_week || r.days_of_week.includes(todayDow);
            return dayOk && nowMins >= ruleMins;
          });
          setEodMarkdown(active ? { discount_pct: active.discount_pct, name: active.name, category_id: active.category_id } : null);
        })
        .catch(() => null);
    }
    const surchargeFetch = fetch('/api/pos/surcharge-rules')
      .then(r => r.json())
      .then((d: { rules?: Array<{ id:string; payment_type:string|null; amount_type:string|null; amount:number; is_active:boolean; day_of_week:number[]|null }> }) => {
        setSurchargeRules((d.rules ?? []).filter(r => r.is_active));
      })
      .catch(() => null);
    const outletsFetch = import('@/lib/supabase').then(({ supabase: sb }) => {
      if (!sb) return;
      sb.from('pos_outlets')
        .select('id, name, is_global, is_default, code')
        .eq('business_id', businessId)
        .eq('active', true)
        .order('is_global', { ascending: false })
        .order('name')
        .then(({ data }: { data: any[] | null }) => {
          const list = data ?? [];
          setOutlets(list);
          if (list.length > 0) {
            const stored = typeof window !== 'undefined' ? localStorage.getItem('aria-active-outlet') : null;
            const found = stored ? list.find((o: any) => o.id === stored) : null;
            const chosen = found ?? list[0];
            setActiveOutletId(chosen.id);
            // Keep legacy key in sync for sale API
            if (typeof window !== 'undefined') localStorage.setItem('pos_outlet_id', chosen.id);
          }
        });
    });
    Promise.all([surchargeFetch, outletsFetch]).catch(() => null);
    checkEod();
    const timer = setInterval(checkEod, 60_000);
    return () => clearInterval(timer);
  // Only re-run when businessId resolves — intentionally exclude activeOutletId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Sync offline queue when connection restored
  useEffect(() => {
    function handleOnline() {
      const queue = JSON.parse(localStorage.getItem('aria_offline_queue') || '[]')
      if (queue.length === 0) return
      fetch('/api/pos/sync-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sales: queue, business_id: businessId }),
      }).then(r => r.json()).then(d => {
        if (d.synced > 0) localStorage.removeItem('aria_offline_queue')
      }).catch(() => {})
    }
    window.addEventListener('online', handleOnline)
    handleOnline() // also try on mount
    return () => window.removeEventListener('online', handleOnline)
  }, [businessId])

  /* ── Mobile detection ────────────────────────────────────────── */
  useEffect(() => {
    if (isMobileDevice() && hasCameraSupport()) setShowMobileBanner(true);
  }, []);

  /* ── Keyboard shortcuts ───────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); if (window.innerWidth >= 768) setAriaOpen(prev => !prev); else setMobileTab('aria'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Customer display sync ────────────────────────────────────── */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showReceipt) return;
      try {
        const sub = cart.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0);
        const tax = sub - sub / 1.1;
        const tot = sub;
        const payload = JSON.stringify({
          status: cart.length > 0 ? 'active' : 'idle',
          business_name: businessName,
          items: cart.map(i => ({
            id:        i.product.id,
            name:      i.label ?? i.product.name,
            cat:       i.product.pos_categories?.name?.toLowerCase() ?? 'other',
            category:  i.product.pos_categories?.name ?? 'other',
            price:     i.unitPrice,
            price_cents: Math.round(i.unitPrice * 100),
            quantity:  i.qty,
          })),
          subtotal_cents: Math.round(sub * 100),
          discount_cents: 0,
          tax_cents: Math.round(tax * 100),
          total_cents: Math.round(tot * 100),
          customer_name: customer?.name ?? null,
          loyalty_points: customer?.loyalty_points ?? 0,
          timestamp: Date.now(),
        });
        localStorage.setItem('aria_display_state', payload);
        localStorage.setItem('aria_pos_display_state', payload); // legacy
      } catch { /* ignore */ }
    }, 50);
    return () => clearTimeout(timer);
  }, [cart, customer, businessName, showReceipt]);

  /* ── Barcode scanner ──────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target === searchRef.current) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const now = Date.now();
      if (e.key === 'Enter') {
        const code = barcodeBuffer.current.trim();
        barcodeBuffer.current = '';
        if (code.length >= 4) {
          const t0Bc = performance.now();
          const hit = barcodeMap.get(code);
          console.log('[POS perf] barcode:', (performance.now() - t0Bc).toFixed(2), 'ms');
          if (hit && hit.is_active) {
            SFX.scan();
            checkAndAddToCart(hit);
          } else if (!hit) {
            // Not in local catalog — try global products / Open Food Facts
            setBarcodeLookupHit(null);
            setBarcodeScanning(true);
            fetch(`/api/products/barcode-lookup?barcode=${encodeURIComponent(code)}`)
              .then(r => r.json())
              .then(d => {
                if (d.found && d.product) setBarcodeLookupHit(d.product as GlobalProductHit);
              })
              .catch(() => null)
              .finally(() => setBarcodeScanning(false));
          }
        }
        return;
      }
      if (e.key === 'F1')  { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'F2')  { e.preventDefault(); setShowCustomItem(true); return; }
      if (e.key === 'F3')  { e.preventDefault(); parkSale(); return; }
      if (e.key === 'F8')  { e.preventDefault(); setPayMethod('cash'); return; }
      if (e.key === 'F9')  { e.preventDefault(); setPayMethod('card'); return; }
      if (e.key === 'F10') { e.preventDefault(); if (cart.length > 0 && registerIsOpen) setTerminalView('checkout'); return; }
      if (e.key === 'Escape') { if (!variantModal) confirmClear(); return; }
      if (e.key.length === 1) {
        if (now - barcodeTs.current > 100) barcodeBuffer.current = '';
        barcodeTs.current = now;
        barcodeBuffer.current += e.key;
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 150);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [products, variantModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hardware scanner hook — enabled when a dedicated USB/HID scanner is registered
  const [hasDedicatedScanner, setHasDedicatedScanner] = useState(false);
  useEffect(() => {
    fetch('/api/pos/hardware-devices')
      .then(r => r.json())
      .then(d => {
        const scanners = (d.devices ?? []).filter((dev: { device_type: string; is_active: boolean }) => dev.device_type === 'barcode_scanner' && dev.is_active);
        setHasDedicatedScanner(scanners.length > 0);
      })
      .catch(() => null);
  }, []);
  useScanner(
    (code) => {
      const hit = barcodeMap.get(code);
      if (hit && hit.is_active) { SFX.scan(); checkAndAddToCart(hit); }
    },
    { minLength: 4, maxGapMs: 50 },
    hasDedicatedScanner,
  );

  /* ── Customer search ──────────────────────────────────────────── */
  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    const r = await fetch(`/api/pos/customers?q=${encodeURIComponent(q)}${businessId ? '&business_id=' + businessId : ''}`);
    const d = await r.json();
    setCustomerResults(d.customers || []);
  }, []);
  useEffect(() => { searchCustomers(customerSearch); }, [customerSearch, searchCustomers]);

  /* ── Aria chat scroll ─────────────────────────────────────────── */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  /* ── Close context menu on outside click ──────────────────────── */
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  /* ── Product suggestions — debounced on cart change ───────────── */
  useEffect(() => {
    if (cart.length === 0) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const res = await fetch('/api/aria/pos-suggestions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart_item_ids: cart.map(i => i.product.id) }),
        });
        if (res.ok) {
          const d = await res.json();
          setSuggestions((d.suggestions ?? []).slice(0, 3));
        }
      } catch { /* non-critical */ }
      setSuggestionsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [cart.map(i => i.product.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Product grid order prefs (loaded by POSSidebar, broadcast via event) ── */
  useEffect(() => {
    const cached = (window as Window & { __posProductGridOrder?: Record<string, string[]> | null }).__posProductGridOrder
    if (cached !== undefined) setProductGridOrder(cached)
    const handler = (e: Event) => setProductGridOrder((e as CustomEvent<Record<string, string[]> | null>).detail)
    window.addEventListener('pos-product-grid-order', handler)
    return () => window.removeEventListener('pos-product-grid-order', handler)
  }, []);

  useEffect(() => {
    const handler = () => setGridCustomising(v => !v)
    window.addEventListener('pos-customise-layout', handler)
    return () => window.removeEventListener('pos-customise-layout', handler)
  }, []);

  /* ─── Derived values ─────────────────────────────────────────── */
  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      if (p.pos_categories?.name) m.set(p.pos_categories.name, p.pos_categories.color);
    }
    return Array.from(m.entries()).map(([name, color]) => ({ name, color }));
  }, [products]);

  const displayedProducts = useMemo(() => {
    let ps = products.filter(p => p.is_active);
    if (activeCategory) ps = ps.filter(p => p.pos_categories?.name === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      );
    }
    return ps;
  }, [products, activeCategory, search]);

  const ageRestrictedInCart = useMemo(() =>
    cart.some(i => (i.product as any).is_age_restricted), [cart]);

  // Local Aria suggestions for SearchFirstLayout — additive
  const ariaSuggestedIds = useMemo(() => {
    const lps: ProductForTerminal[] = displayedProducts.map(p => ({
      id: p.id, name: p.name, sku: p.sku ?? '',
      category: p.pos_categories?.name ?? null,
      price: p.price, stock_quantity: p.stock_quantity,
      track_inventory: p.track_stock, active: p.is_active,
    }));
    return getAriaSuggestions({
      products: lps,
      recentProductIds,
      cartProductIds: cart.map(i => i.product.id),
      nowAEST: new Date(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedProducts, recentProductIds, cart.map(i => i.product.id).join(',')]);

  const activeCategoryId = useMemo(
    () => activeCategory ? (displayedProducts[0]?.category_id ?? null) : null,
    [activeCategory, displayedProducts]
  );

  const orderedProducts = useMemo(() => {
    const savedOrder = activeCategoryId ? productGridOrder?.[activeCategoryId] : undefined;
    if (!savedOrder) return displayedProducts;
    const map = new Map(displayedProducts.map(p => [p.id, p]));
    const sorted = savedOrder.map(id => map.get(id)).filter((p): p is typeof displayedProducts[0] => p !== undefined);
    const unsaved = displayedProducts.filter(p => !savedOrder.includes(p.id));
    return [...sorted, ...unsaved];
  }, [displayedProducts, activeCategoryId, productGridOrder]);

  const layoutProducts = useMemo<ProductForTerminal[]>(() => orderedProducts.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku ?? '',
    barcode: p.barcode,
    category: p.pos_categories?.name ?? null,
    price: p.price,
    cost_price: p.cost_price,
    stock_quantity: p.stock_quantity,
    image_url: (p as any).image_url ?? null,
    image_source: (p as any).image_source ?? null,
    container_type: null,
    description: (p as any).description ?? null,
    track_inventory: p.track_stock,
    active: p.is_active,
  })), [orderedProducts]);

  const cartForAria = useMemo(
    () => cart.map(c => ({ name: c.label ?? c.product.name, category: c.product.pos_categories?.name ?? null })),
    [cart]
  );

  const cartForDiscount = useMemo(
    () => cart.map((i): DiscountBarCartItem => ({
      product_id: i.product.id,
      product_name: i.product.name,
      category_id: i.product.category_id,
      qty: i.qty,
      unit_price: i.unitPrice,
    })),
    [cart]
  );

  const loyaltyCustomer = customer && customer.loyalty_points > 0;

  /* ─── Cart calculations ──────────────────────────────────────── */
  const cartKey    = (i: CartItem) => `${i.product.id}::${i.label ?? i.product.name}`;
  const subtotal   = cart.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0);
  // Sprint E: engine computes authoritative tax on finalize. Display uses flat 1.1 estimate.
  const taxAmount  = subtotal - subtotal / 1.1;
  const netAmount  = subtotal / 1.1;
  // Surcharge: apply first matching active rule for current payment method
  const surchargeAmt = useMemo(() => {
    if (!surchargeRules.length || !cart.length) return 0;
    const todayDow = new Date().getDay(); // 0=Sun, 6=Sat
    const rule = surchargeRules.find(r => {
      const methodMatch = !r.payment_type || r.payment_type === 'all' || r.payment_type === payMethod;
      const dayMatch = !r.day_of_week || r.day_of_week.length === 0 || r.day_of_week.includes(todayDow);
      return methodMatch && dayMatch;
    });
    if (!rule) return 0;
    return rule.amount_type === 'percent'
      ? Math.round(subtotal * (rule.amount / 100) * 100) / 100
      : rule.amount;
  }, [surchargeRules, payMethod, subtotal, cart.length]);

  const total      = subtotal + surchargeAmt;
  const tendered   = parseFloat(cashTendered) || 0;

  // POS user permission gates (set at cashier login, stored in localStorage)
  const posUserPerms = useMemo<Record<string, boolean>>(() => {
    try { const u = localStorage.getItem('aria_pos_user'); return u ? (JSON.parse(u).permissions ?? {}) : {} } catch { return {} }
  }, []);
  const canVoid = posUserPerms.can_void !== false;
  const roundedTotal = payMethod === 'cash' ? roundCash(total) : total;
  const change     = payMethod === 'cash' && tendered >= roundedTotal ? tendered - roundedTotal : 0;
  const splitCardAmt = payMethod === 'split' ? Math.max(0, total - (parseFloat(splitCash) || 0)) : 0;

  /* ─── Cart helpers ───────────────────────────────────────────── */
  function updateQty(key: string, qty: number) {
    if (qty <= 0) { SFX.remove(); setCart(c => c.filter(i => cartKey(i) !== key)); }
    else { SFX.tap(); setCart(c => c.map(i => cartKey(i) === key ? { ...i, qty } : i)); }
  }
  function confirmClear() { if (!cart.length) return; if (confirm('Clear the current sale?')) clearSale(); }
  function clearSale() {
    setCart([]); setCustomer(null); setSelectedItem(null);
    setCashTendered(''); setSplitCash(''); setCustomerSearch('');
    setDiscountMode(null); setDiscountVal('');
    setAgeVerified(false); setSuggestions([]);
    setAppliedDiscounts([]); setManualDiscountAmt(0);
    try { sessionStorage.removeItem(CART_SESSION_KEY); } catch { /* ignore */ }
    searchRef.current?.focus();
  }

  function triggerFly(fromEl: HTMLElement | null) {
    if (!fromEl || !cartAnchor.current || !flyRef.current) return;
    flyRef.current.fly(fromEl.getBoundingClientRect(), cartAnchor.current.getBoundingClientRect());
  }

  function addToCartDirect(p: Product, qty: number, variantLabel?: string, label?: string, mods: Modifier[] = [], fromEl?: HTMLElement | null, variantId?: string | null, variantName?: string | null) {
    if (fromEl) triggerFly(fromEl);
    const modPrice = mods.reduce((s, m) => s + (m.price_adjustment ?? 0), 0);
    const unitPrice = p.price + modPrice;
    const fullLabel = label ?? (variantLabel ? `${p.name} · ${variantLabel}` : p.name);
    setCart(c => {
      const key = `${p.id}::${fullLabel}`;
      const hit = c.find(i => `${i.product.id}::${i.label ?? i.product.name}` === key);
      if (hit) return c.map(i => `${i.product.id}::${i.label ?? i.product.name}` === key ? { ...i, qty: i.qty + qty } : i);
      return [...c, { product: p, qty, label: fullLabel !== p.name ? fullLabel : undefined, variantLabel, modifierDetails: mods, unitPrice, discount_percent: 0, variant_id: variantId ?? null, variant_name: variantName ?? null }];
    });
    SFX.add();
    setSelectedItem(p.id);
    setLastAddedId(p.id);
    // Track recent for SearchFirstLayout — additive
    setRecentProductIds(prev => [p.id, ...prev.filter(id => id !== p.id)].slice(0, 8));
    setSearch('');
    if (window.innerWidth < 768) setMobileTab('cart');
  }

  // Converts a ConfiguredCartItem (from ModifierModal) into the cart — cafe-only
  function addConfiguredItemToCart(item: ConfiguredCartItem) {
    const mods = item.selected_modifiers.map(sm => ({
      id: sm.modifier_id,
      name: sm.modifier_name,
      price_adjustment: sm.price,
      is_active: true,
      group_id: sm.group_id,
    } as any))
    const fakeProduct = {
      ...(cart.find(c => c.product.id === item.product_id)?.product ?? { id: item.product_id, name: item.product_name, price: item.base_price, is_active: true } as any),
      price: item.base_price,
    }
    addToCartDirect(fakeProduct, item.quantity, undefined, item.display_summary || item.product_name, mods)
  }

  async function getProductBatches(productId: string): Promise<Array<{ id: string; expiry_date: string; quantity_remaining: number }>> {
    if (!businessId) return []
    try {
      const res = await fetch(`/api/pos/product-batches?product_id=${productId}&business_id=${businessId}`)
      const data = await res.json()
      return data.batches ?? []
    } catch { return [] }
  }

  async function checkAndAddToCart(p: Product, fromEl?: HTMLElement | null) {
    if (!p.is_active) return;

    // Inline checks that never need network — instant
    if (p.is_schedule_drug && p.schedule_level) { setPharmPrompt({ product: p }); return; }
    if ((p as any).serial_tracked) { setSerialInput(''); setSerialPrompt({ product: p }); return; }
    if (p.is_weight_based && p.price_per_kg) { setWeightInput(''); setWeightModal({ product: p }); return; }
    if ((p as any).builder_type === 'sandwich') { setSandwichBuilderProduct(p); return; }

    // Check pre-loaded cache — no network needed for most products
    const cached = modifierCache.current[p.id];
    if (cached !== undefined) {
      if (!cached.hasModifiers && !cached.hasVariants) {
        // Cached: no modifiers, no variants — add directly. INSTANT.
        addToCartDirect(p, 1, undefined, undefined, [], fromEl);
        getProductBatches(p.id).then(batches => {
          const activeBatch = batches.find(b => b.quantity_remaining > 0 && new Date(b.expiry_date).getTime() > Date.now())
          if (activeBatch) setExpiryPrompt({ product_id: p.id, product_name: p.name, existing_batch: activeBatch, mode: 'confirm_existing', pending_date: activeBatch.expiry_date })
        }).catch(() => {})
        return;
      }
    }

    // Only fetch if cache says this product HAS modifiers, or cache miss
    // Sprint H: check pos_product_modifier_groups for ALL industries
    try {
      const checkR = await fetch(`/api/pos/product-modifier-groups?product_id=${p.id}`);
      if (checkR.ok) {
        const checkD = await checkR.json();
        if (Array.isArray(checkD.groups) && checkD.groups.length > 0) {
          setModifierPicker({ product: p });
          return;
        }
      }
    } catch { /* fall through to existing logic */ }
    // Cafe routing — Sprint C: sandwich builder, Sprint A: modifier modal
    if (businessType === 'cafe') {
      // Fall through to modifier modal if groups attached
      try {
        const modRes = await fetch(`/api/pos/products/${p.id}/modifiers`)
        if (modRes.ok) {
          const modData = await modRes.json()
          if ((modData.data ?? []).length > 0) {
            setModifierModalProduct(p)
            return
          }
        }
      } catch { /* fall through to existing behavior */ }
    }
    setVariantLoading(true);
    try {
      const res = await fetch(`/api/pos/variants?product_id=${p.id}`);
      if (res.ok) {
        const d = await res.json();
        const rawVariants: any[] = d.variants ?? [];
        const modLinks: ModifierLink[] = d.modifiers ?? [];
        const mods = modLinks.map((l: ModifierLink) => l.pos_modifiers).filter(Boolean);
        // Simple variants have a numeric `price` field; group variants have a `values` array
        const isSimple = rawVariants.length > 0 && !Array.isArray(rawVariants[0]?.values);
        if (isSimple) {
          setSimplePriceModal({ product: p, variants: rawVariants as SimpleVariant[] });
          setVariantLoading(false); return;
        }
        const groups = rawVariants as VariantGroup[];
        if (groups.length > 0 || mods.length > 0) {
          setVariantModal({ product: p, variantGroups: groups, modifiers: mods });
          setSelectedVariants({}); setSelectedMods({}); setVariantQty(1);
          setVariantLoading(false); return;
        }
      }
    } catch { /* fall through */ }
    setVariantLoading(false);
    addToCartDirect(p, 1, undefined, undefined, [], fromEl);
    // Non-blocking expiry check after adding to cart
    getProductBatches(p.id).then(batches => {
      const activeBatch = batches.find(b =>
        b.quantity_remaining > 0 && new Date(b.expiry_date).getTime() > Date.now()
      )
      if (activeBatch) {
        setExpiryPrompt({ product_id: p.id, product_name: p.name, existing_batch: activeBatch, mode: 'confirm_existing', pending_date: activeBatch.expiry_date })
      } else if ((p as any).track_stock) {
        setExpiryPrompt({ product_id: p.id, product_name: p.name, existing_batch: null, mode: 'ask_new', pending_date: '' })
      }
    }).catch(() => {})
  }

  function confirmVariantSelection() {
    if (!variantModal) return;
    const p = variantModal.product;
    const variantParts: string[] = [];
    let priceDelta = 0;
    for (const g of variantModal.variantGroups) {
      const sel = selectedVariants[g.id];
      if (sel) {
        variantParts.push(sel);
        if (g.affects_price && g.price_map[sel] != null) priceDelta += g.price_map[sel] - p.price;
      }
    }
    const selectedModList = variantModal.modifiers.filter(m => selectedMods[m.id]);
    const allParts = [...variantParts, ...selectedModList.map(m => m.name)];
    const label = allParts.length > 0 ? `${p.name} · ${allParts.join(' · ')}` : p.name;
    const effectivePrice = Math.max(0, p.price + priceDelta + selectedModList.reduce((s, m) => s + (m.price_adjustment ?? 0), 0));
    addToCartDirect({ ...p, price: effectivePrice }, variantQty, variantParts.join(' / ') || undefined, label, selectedModList);
    setVariantModal(null);
  }

  function addVariantToCart(product: Product, variant: SimpleVariant) {
    const price = variant.price ?? product.price;
    addToCartDirect(
      { ...product, price }, 1, variant.name,
      `${product.name} · ${variant.name}`,
      [], null, variant.id, variant.name,
    );
    setSimplePriceModal(null);
  }

  /* ─── Aria chat ──────────────────────────────────────────────── */
  async function sendAriaChat() {
    if (!chatInput.trim() || chatLoading || !businessId) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(m => [...m, { role: 'user', content: msg, ts: Date.now() }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/aria/pos-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, business_id: businessId }),
      });
      const data = await res.json();
      setChatMessages(m => [...m, { role: 'assistant', content: data.message || '', structured: data, ts: Date.now() }]);
    } catch {
      setChatMessages(m => [...m, { role: 'assistant', content: 'Connection error — try again.', ts: Date.now() }]);
    }
    setChatLoading(false);
  }

  function handleAriaAction(action: string, data: Record<string, unknown>) {
    switch (action) {
      case 'create_promotion': window.location.href = '/pos/promotions'; break;
      case 'reorder_product':
      case 'open_orders':
      case 'create_order': window.location.href = '/pos/orders'; break;
      case 'view_report': window.location.href = '/pos/reports/sales'; break;
      case 'view_products': window.location.href = '/pos/products'; break;
      case 'adjust_stock': window.location.href = '/pos/stocktake'; break;
      case 'close_register': window.location.href = '/pos/close'; break;
      case 'run_autopilot': window.location.href = '/dashboard/autopilot'; break;
      case 'competitor_scan': window.location.href = '/pos/competitors'; break;
      default: console.log('[aria action]', action, data);
    }
  }

  /* ─── Custom item / Note ────────────────────────────────────── */
  function addCustomItemToCart() {
    const price = parseFloat(customItemForm.price) || 0;
    const qty   = parseInt(customItemForm.qty) || 1;
    if (!customItemForm.desc.trim()) return;
    if (!customItemForm.isNote && price <= 0) return;
    const fakeProduct: Product = {
      id: `custom-${Date.now()}`,
      name: customItemForm.isNote ? `📝 ${customItemForm.desc}` : customItemForm.desc,
      sku: null, barcode: null,
      price: customItemForm.isNote ? 0 : price,
      cost_price: 0,
      tax_rate: customItemForm.taxable ? 10 : 0,
      stock_quantity: 999, low_stock_threshold: 0,
      track_stock: false, is_active: true,
      category_id: null,
    };
    addToCartDirect(fakeProduct, qty);
    setCustomItemForm({ desc: '', price: '', qty: '1', taxable: true, isNote: false });
    setShowCustomItem(false);
  }

  /* ─── Refund search & process ────────────────────────────────── */
  async function searchRefundSales(q: string) {
    if (q.length < 2) { setRefundResults([]); return; }
    try {
      const res = await fetch(`/api/pos/sales?q=${encodeURIComponent(q)}&limit=10`);
      const d = await res.json();
      setRefundResults(d.sales ?? []);
    } catch { setRefundResults([]); }
  }
  async function processRefund() {
    if (!refundSale || processingRefund) return;
    const selectedItems = refundSale.items?.filter((item: any) => refundItems[item.id]) ?? [];
    if (selectedItems.length === 0) return;
    setProcessingRefund(true);
    try {
      const refundTotal = selectedItems.reduce((s: number, i: any) => s + (i.line_total ?? 0), 0);
      await fetch('/api/pos/sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedItems.map((i: any) => ({
            product_id: i.product_id, product_name: i.product_name,
            quantity: -Math.abs(i.quantity), unit_price: i.unit_price,
            tax_rate: i.tax_rate ?? 10, discount_percent: 0,
            line_total: -Math.abs(i.line_total ?? 0),
          })),
          payment_method: refundSale.payment_method ?? 'card',
          subtotal: -refundTotal, tax_amount: -(refundTotal - refundTotal / 1.1),
          discount_amount: 0, total_amount: -refundTotal,
          session_id: registerSession?.id ?? null,
          original_sale_id: refundSale.id,
          notes: `Refund for sale ${refundSale.sale_number ?? refundSale.id}`,
        }),
      });
      setShowRefundModal(false);
      setRefundSale(null); setRefundItems({}); setRefundSearch(''); setRefundResults([]);
      alert(`Refund of A$${refundTotal.toFixed(2)} processed.`);
    } catch { alert('Refund failed — try again.'); }
    setProcessingRefund(false);
  }

  /* ─── Cashier switch ─────────────────────────────────────────── */
  async function switchCashier() {
    if (!cashierName.trim() || !registerSession) return;
    setSwitchingCashier(true);
    try {
      await fetch('/api/pos/sessions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: registerSession.id, cashier_name: cashierName.trim() }),
      });
      setRegisterSession({ ...registerSession, opened_by: cashierName.trim() });
      setShowCashierModal(false); setCashierName('');
    } catch { /* silent */ }
    setSwitchingCashier(false);
  }

  /* ─── Park sale ──────────────────────────────────────────────── */
  async function parkSale() {
    if (!cart.length) return;
    const label = prompt('Label for parked sale (optional):') ?? undefined;
    await fetch('/api/pos/park', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, items: cart, customer_id: customer?.id ?? null, subtotal: +subtotal.toFixed(2), total: +total.toFixed(2) }) });
    const r = await fetch('/api/pos/park').then(r => r.json());
    setParkedSales(r.parked_sales || []);
    clearSale();
  }

  /* ─── Save as Layby — additive ───────────────────────────────── */
  async function saveLayby() {
    if (!customer) { alert('Please select a customer before creating a layby.'); return; }
    if (!cart.length) return;
    setLaybyLoading(true);
    const depositAmt = parseFloat(laybyDeposit) || total * 0.2;
    const dueDefault = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    await fetch('/api/pos/laybys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customer.id,
        deposit_cents: Math.round(depositAmt * 100),
        paid_cents: Math.round(depositAmt * 100),
        total_cents: Math.round(total * 100),
        due_date: laybyDueDate || dueDefault,
        notes: laybyNotes || null,
        items: cart.map(i => ({ product_id: i.product.id, product_name: i.label ?? i.product.name, qty: i.qty, unit_price: i.unitPrice })),
        status: 'active',
      }),
    }).catch(() => {});
    setLaybyLoading(false);
    setShowLaybyModal(false);
    setLaybyDeposit('');
    setLaybyDueDate('');
    setLaybyNotes('');
    clearSale();
  }
  async function restoreParked(p: ParkedSale) {
    setCart(p.items);
    await fetch(`/api/pos/park?id=${p.id}`, { method: 'DELETE' });
    const r = await fetch('/api/pos/park').then(r => r.json());
    setParkedSales(r.parked_sales || []);
    setShowParked(false);
  }

  /* ─── Register ───────────────────────────────────────────────── */
  async function openRegister() {
    setOpeningRegister(true); setRegisterError(null);
    try {
      const res = await fetch('/api/pos/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0, outlet_id: activeOutletId }) });
      const d = await res.json();
      if (!res.ok) { setRegisterError(d.error ?? 'Failed to open register'); setOpeningRegister(false); return; }
      await loadRegister(); setShowRegisterModal(false);
    } catch { setRegisterError('Failed to open register — check connection'); }
    setOpeningRegister(false);
  }
  async function closeRegister() {
    if (!registerSession) return;
    setClosingRegister(true); setRegisterError(null);
    try {
      const res = await fetch('/api/pos/sessions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: registerSession.id, closing_float: parseFloat(closingFloat) || 0 }) });
      if (!res.ok) { const d = await res.json(); setRegisterError(d.error ?? 'Failed to close register'); setClosingRegister(false); return; }
      await loadRegister(); setShowCloseModal(false); setClosingFloat('');
    } catch { setRegisterError('Failed to close register — check connection'); }
    setClosingRegister(false);
  }

  /* ─── Process sale ───────────────────────────────────────────── */
  const checkGiftCard = async () => {
    if (!giftCardCode.trim() || !businessId) return;
    setGiftCardChecking(true);
    setGiftCardError('');
    setGiftCardBalance(null);
    try {
      const res = await fetch(`/api/pos/payments/gift-card?code=${encodeURIComponent(giftCardCode.trim())}`);
      const d = await res.json();
      if (d.valid && d.card) {
        setGiftCardBalance(d.card.balance);
      } else {
        setGiftCardError(d.error || 'Gift card not found');
      }
    } catch {
      setGiftCardError('Could not check gift card');
    }
    setGiftCardChecking(false);
  };

  async function processSale() {
    if (!cart.length || processing) return;
    if (roundedTotal <= 0) {
      alert('Cannot process a $0 sale. Please set prices on all items.');
      return;
    }
    // Age restriction gate — require ID check confirmation before proceeding
    const hasAgeRestricted = cart.some(i => i.product.is_age_restricted);
    if (hasAgeRestricted && !ageVerified) {
      setShowAgeModal(true);
      return;
    }
    setProcessing(true);

    // Training mode — skip API entirely, show success animation only
    if (trainingMode) {
      SFX.ching();
      const cartSnapshot = [...cart];
      const customerSnapshot = customer;
      setShowReceipt({
        id: 'TRAINING-' + Date.now(),
        total_amount: roundedTotal,
        payment_method: 'training',
        sale_number: 'TRAINING',
        cartSnapshot,
        customerSnapshot,
        businessName,
        is_training: true,
      });
      setTerminalView('confirm');
      clearSale();
      setProcessing(false);
      return;
    }

    // Capture all ephemeral values before clearSale zeros them
    const t0Sale = performance.now();
    const cartSnapshot = [...cart];
    const customerSnapshot = customer;
    const capturedTotal = roundedTotal;
    const capturedChange = change;
    const capturedSplitCash = parseFloat(splitCash) || 0;
    const capturedSplitCardAmt = splitCardAmt;
    const capturedPayMethod = payMethod;
    const capturedSubtotal = subtotal;
    const capturedTaxAmount = taxAmount;
    const capturedTendered = tendered;
    const capturedAppliedDiscounts = appliedDiscounts ?? [];
    const capturedAgeVerified = ageVerified;
    const capturedServedBy = servedBy || null;
    const capturedPosUserId = posUserId;
    const capturedGiftCardCode = giftCardCode;
    const capturedGiftCardBalance = giftCardBalance;
    const capturedDirectDepositRef = directDepositRef;
    const capturedActiveOutletId = activeOutletId;
    const capturedBusinessId = businessId;
    const capturedBusinessName = businessName;
    const capturedCustomerDetails = customerDetails;
    const capturedSessionId = registerSession?.id ?? null;
    const capturedOutletId = typeof window !== 'undefined' ? localStorage.getItem('pos_outlet_id') || null : null;
    const saleBody = JSON.stringify({
      items: cartSnapshot.map(i => ({
        product_id: i.product.id, product_name: i.label ?? i.product.name, product_sku: i.product.sku,
        quantity: i.qty, unit_price: i.unitPrice, tax_rate: i.product.tax_rate ?? 10,
        tax_code_id: i.product.tax_code_id ?? null,
        additional_tax_code_ids: i.product.additional_tax_code_ids ?? [],
        category_id: i.product.category_id ?? null,
        discount_percent: i.discount_percent ?? 0,
        line_total: +(i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100)).toFixed(2),
        variant_label: i.variantLabel ?? null,
        variant_id: i.variant_id ?? null,
        variant_name: i.variant_name ?? null,
        modifiers: i.modifierDetails?.map(m => ({ id: m.id, name: m.name, price_cents: Math.round(m.price_adjustment * 100) })) ?? [],
      })),
      customer_id: customerSnapshot?.id ?? null, payment_method: capturedPayMethod,
      served_by: capturedServedBy,
      pos_user_id: capturedPosUserId,
      applied_discounts: capturedAppliedDiscounts,
      subtotal: +capturedSubtotal.toFixed(2), tax_amount: +capturedTaxAmount.toFixed(2),
      discount_amount: 0, total_amount: +capturedTotal.toFixed(2),
      cash_tendered: capturedPayMethod === 'cash' ? capturedTendered : null,
      change_given: capturedPayMethod === 'cash' ? +capturedChange.toFixed(2) : null,
      split_cash: capturedPayMethod === 'split' ? capturedSplitCash : null,
      split_card: capturedPayMethod === 'split' ? +capturedSplitCardAmt.toFixed(2) : null,
      outlet_id: capturedOutletId, session_id: capturedSessionId,
      age_verified: capturedAgeVerified,
      ...(capturedPayMethod === 'gift_card' ? { gift_card_code: capturedGiftCardCode, gift_card_amount: Math.min(capturedGiftCardBalance ?? 0, capturedTotal) } : {}),
      ...(capturedPayMethod === 'direct_deposit' ? { direct_deposit_ref: capturedDirectDepositRef } : {}),
    });

    try {
      // Optimistic stock decrement — local state only, instant
      setProducts(ps => ps.map(p => {
        const item = cartSnapshot.find(i => i.product.id === p.id);
        if (!item || !p.track_stock) return p;
        return { ...p, stock_quantity: Math.max(0, p.stock_quantity - item.qty) };
      }));
      // Show optimistic receipt immediately — UI unblocked before API call
      setShowReceipt({
        id: 'TEMP-' + Date.now(),
        total_amount: capturedTotal,
        payment_method: capturedPayMethod,
        sale_number: '…',
        cartSnapshot,
        customerSnapshot,
        businessName: capturedBusinessName,
      });
      setTerminalView('confirm');
      clearSale();
    } finally { setProcessing(false); }
    SFX.ching();

    // Customer display signal — immediate
    try {
      const changeCents = capturedPayMethod === 'cash' ? Math.round(capturedChange * 100) : 0;
      const completePayload = JSON.stringify({
        status: 'complete', business_name: capturedBusinessName, change_cents: changeCents,
        customer_name: customerSnapshot?.name ?? null,
        loyalty_earned: Math.floor(capturedTotal), timestamp: Date.now(),
      });
      localStorage.setItem('aria_display_state', completePayload);
      localStorage.setItem('aria_pos_display_state', completePayload);
      try {
        const bc = new BroadcastChannel('aria-pos-display');
        bc.postMessage({
          type: 'sale_completed',
          items: cartSnapshot.map((i: any) => ({ name: i.product?.name ?? i.label ?? '', category: i.product?.category ?? '', price: i.unitPrice ?? i.unit_price ?? 0, quantity: i.qty ?? i.quantity ?? 1 })),
          customer_name: customerSnapshot?.name ?? null,
          total: capturedTotal, points_earned: Math.floor(capturedTotal),
        });
        bc.close();
      } catch { /* BroadcastChannel not available */ }
      setTimeout(() => {
        try {
          const idlePayload = JSON.stringify({ status: 'idle', business_name: capturedBusinessName, timestamp: Date.now() });
          localStorage.setItem('aria_display_state', idlePayload);
          localStorage.setItem('aria_pos_display_state', idlePayload);
        } catch { /* ignore */ }
      }, 4500);
    } catch { /* ignore */ }

    // Background sync — API call after UI is already shown
    ;(async () => {
      try {
        const r = await fetch('/api/pos/sale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: saleBody });
        const d = await r.json();
        console.log('[POS perf] sale:', (performance.now() - t0Sale).toFixed(2), 'ms');
        if (d.error || !d.sale) return;
        setShowReceipt((prev: any) => prev ? { ...d.sale, cartSnapshot, customerSnapshot, businessName: capturedBusinessName } : prev);
        setRecentSales(prev => [{
          id: d.sale.id, total: capturedTotal,
          items: cartSnapshot.reduce((s: number, i: { qty: number }) => s + i.qty, 0), time: new Date(),
        }, ...prev].slice(0, 5));
        if (!d.sale.id) return;
        // KDS auto-fire (non-blocking)
        fetch('/api/pos/kds/auto-fire', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sale_id: d.sale.id, outlet_id: capturedOutletId ?? null,
            table_label: capturedCustomerDetails?.name ?? null,
            items: cartSnapshot.map(i => ({ id: i.product.id, product_id: i.product.id, quantity: i.qty, notes: null, seat_number: null, course: null })),
          }),
        }).catch(() => {});
        // Loyalty earn (non-blocking)
        if (customerSnapshot?.id && capturedBusinessId) {
          fetch('/api/loyalty/earn', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sale_id: d.sale.id, customer_id: customerSnapshot.id, business_id: capturedBusinessId, sale_total: capturedTotal }),
          }).catch(() => {});
        }
        // Split payments (non-blocking)
        if (capturedPayMethod === 'split') {
          Promise.all([
            capturedSplitCash > 0 && fetch('/api/pos/sale-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sale_id: d.sale.id, method: 'cash', amount_cents: Math.round(capturedSplitCash * 100) }) }),
            capturedSplitCardAmt > 0 && fetch('/api/pos/sale-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sale_id: d.sale.id, method: 'card', amount_cents: Math.round(capturedSplitCardAmt * 100) }) }),
          ]).catch(() => {});
        }
        // Commission (non-blocking)
        if (capturedServedBy && capturedBusinessId) {
          fetch('/api/pos/commission-rules?business_id=' + capturedBusinessId).then(r => r.json()).then(async data => {
            const rules = data.rules ?? [];
            const activeRule = rules[0];
            if (!activeRule) return;
            const saleCents = Math.round(capturedTotal * 100);
            if (saleCents < (activeRule.min_sale_cents ?? 0)) return;
            const commissionCents = Math.round(saleCents * (activeRule.rate / 100));
            await fetch('/api/pos/commissions', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ business_id: capturedBusinessId, sale_id: d.sale.id, pos_user_name: capturedServedBy, rule_id: activeRule.id, sale_total_cents: saleCents, commission_rate: activeRule.rate, commission_cents: commissionCents }),
            }).catch(() => null);
          }).catch(() => null);
        }
        // Outlet inventory decrement (non-blocking)
        if (capturedActiveOutletId && capturedBusinessId) {
          import('@/lib/supabase').then(({ supabase: sb }) => {
            if (!sb) return;
            cartSnapshot.forEach(i => {
              if (!i.product.track_stock) return;
              Promise.resolve(sb.rpc('decrement_outlet_inventory', {
                p_business_id: capturedBusinessId,
                p_product_id: i.product.id,
                p_outlet_id: capturedActiveOutletId,
                p_qty: i.qty,
              })).catch(() => {});
            });
          });
        }
      } catch { /* background sync failed — receipt already shown */ }
    })();
  }

  const registerIsOpen = !!registerSession;

  /* ── Session gate — must open register before using terminal ─── */
  if (!registerLoading && !registerIsOpen) {
    return (
      <div style={{ height: '100%', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 400, height: 400, top: '-100px', left: '-100px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(20,184,166,0.12),transparent 70%)', filter: 'blur(80px)', animation: 'pos-orb-breathe 4s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ background: 'var(--pos-elevated,#162030)', backdropFilter: 'blur(20px)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 24, padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', animation: 'pos-scale-in 0.4s var(--pos-ease,cubic-bezier(0.16,1,0.3,1))' }}>
          <svg width={36} height={36} viewBox="0 0 32 32" fill="none" style={{ margin: '0 auto 12px' }}>
            <path d="M16 2L28 9v14L16 30 4 23V9z" fill="rgba(0,106,255,0.10)" stroke="var(--violet)" strokeWidth="1.5"/>
            <path d="M16 8l7 4v8l-7 4-7-4V12z" fill="rgba(0,106,255,0.15)" stroke="var(--violet)" strokeWidth="1"/>
            <circle cx="16" cy="16" r="2.5" fill="var(--violet)"/>
          </svg>
          <p style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', fontSize: 26, color: 'var(--violet)', marginBottom: 6, lineHeight: 1 }}>AriaPOS</p>
          <p style={{ fontSize: 13, color: 'var(--pos-text-secondary,#7A9BB5)', marginBottom: 32 }}>{businessName}</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--pos-text-primary,#E8F4F8)', marginBottom: 6, fontFamily: "'Manrope',sans-serif" }}>Register is closed</p>
          <p style={{ fontSize: 13, color: 'var(--pos-text-secondary,#7A9BB5)', marginBottom: 28 }}>Enter your opening float to start trading.</p>
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--pos-text-tertiary,#3D5A73)', marginBottom: 10, fontFamily: "'Manrope',sans-serif" }}>Opening Float</p>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--pos-border-default,#243347)', borderRadius: 12, background: 'var(--bg-surface)', overflow: 'hidden' }}>
              <span style={{ padding: '14px 12px 14px 16px', fontFamily: "'JetBrains Mono',monospace", color: 'var(--pos-text-tertiary,#3D5A73)', fontSize: 14 }}>A$</span>
              <input
                type="number" min="0" step="0.01"
                value={openingFloat}
                onChange={e => setOpeningFloat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') openRegister(); }}
                style={{ flex: 1, background: 'transparent', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: 'var(--pos-text-primary,#E8F4F8)', padding: '10px 16px 10px 0' }}
                autoFocus
              />
            </div>
            {registerError && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--destructive)', background: 'var(--destructive-bg)', border: '1px solid rgba(255,22,0,0.12)', borderRadius: 8, padding: '8px 12px' }}>{registerError}</p>}
          </div>
          <button onClick={openRegister} disabled={openingRegister}
            style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: 'var(--violet)', boxShadow: '0 4px 0 rgba(124,58,237,0.4),0 6px 20px rgba(139,92,246,0.33)', color: '#fff', fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15, cursor: openingRegister ? 'not-allowed' : 'pointer', opacity: openingRegister ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {openingRegister ? 'Opening…' : 'Open Register'}
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  /* ── Quick helpers for checkout overlay ────────────────────────── */
  const loyaltyPoints = Math.floor(total);

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100dvh', background: 'var(--terminal-bg-canvas)', position: 'relative' }}>
      <POSAriaInsight page="terminal" businessId={businessId} />
      {showCafeSetup && (
        <CafeSetupModal
          businessName={businessName}
          onComplete={() => { setShowCafeSetup(false); window.location.reload(); }}
          onSkip={() => setShowCafeSetup(false)}
        />
      )}
      {/* Cafe modifier modal — Sprint A, cafe-only, additive */}
      {modifierModalProduct && businessType === 'cafe' && (
        <ModifierModal
          product={modifierModalProduct}
          onClose={() => setModifierModalProduct(null)}
          onConfirm={(item: ConfiguredCartItem) => {
            setModifierModalProduct(null)
            addConfiguredItemToCart(item)
          }}
        />
      )}
      {/* Customer capture modal — Sprint D, cafe-only */}
      {showCustomerCapture && businessType === 'cafe' && (
        <CustomerCaptureModal
          orderType={orderType}
          onConfirm={details => { setCustomerDetails(details); setShowCustomerCapture(false) }}
          onSkip={() => setShowCustomerCapture(false)}
          onClose={() => setShowCustomerCapture(false)}
        />
      )}
      {/* Floor plan — Sprint D, cafe dine-in */}
      {showFloorPlan && businessType === 'cafe' && (
        <div onClick={() => setShowFloorPlan(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#090e0b', border: '1px solid rgba(0,106,255,0.12)', borderRadius: '0 0 16px 16px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(0,106,255,0.10)' }}>
              <span style={{ color: 'var(--violet)', fontWeight: 700, fontSize: 14, fontFamily: "'Fraunces',serif" }}>Floor Plan — Select Table</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setFloorPlanEditMode(v => !v)}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: "1px solid " + (floorPlanEditMode ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.1)'), background: floorPlanEditMode ? 'var(--violet-dim)' : 'transparent', color: floorPlanEditMode ? 'var(--violet)' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {floorPlanEditMode ? '✓ Done editing' : '⚙ Edit layout'}
                </button>
                <button onClick={() => setShowFloorPlan(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20 }}>×</button>
              </div>
            </div>
            <FloorPlan
              businessId={businessId ?? ''}
              editMode={floorPlanEditMode}
              onTableSelect={table => {
                if (table.status === 'available') {
                  setSelectedTable({ id: table.id, name: table.name })
                  setShowFloorPlan(false)
                }
              }}
            />
          </div>
        </div>
      )}
      {/* Sandwich/food builder — Sprint C, cafe-only, additive */}
      {sandwichBuilderProduct && businessType === 'cafe' && (
        <SandwichBuilder
          product={sandwichBuilderProduct}
          onClose={() => setSandwichBuilderProduct(null)}
          onConfirm={(item: ConfiguredCartItem) => {
            setSandwichBuilderProduct(null)
            addConfiguredItemToCart(item)
          }}
        />
      )}
      {/* Expiry tracking prompt — slides up from bottom */}
      {expiryPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 32px' }}>
          <div style={{ background: 'var(--pos-elevated,#162030)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, border: '1px solid rgba(20,184,166,0.2)', boxShadow: '0 -24px 64px rgba(0,0,0,0.5)' }}>
            {expiryPrompt.mode === 'confirm_existing' && expiryPrompt.existing_batch && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>⏰ Expiry Tracked</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>{expiryPrompt.product_name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                  Selling from batch expiring{' '}
                  <strong style={{ color: new Date(expiryPrompt.existing_batch.expiry_date).getTime() < Date.now() + 7*86400000 ? '#ef4444' : '#f97316' }}>
                    {new Date(expiryPrompt.existing_batch.expiry_date).toLocaleDateString('en-AU')}
                  </strong>
                  {' '}· {expiryPrompt.existing_batch.quantity_remaining} units remaining
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => {
                    fetch(`/api/pos/product-batches/${expiryPrompt.existing_batch!.id}/decrement`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qty: 1 }) }).catch(() => {})
                    setExpiryPrompt(null)
                  }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--success,#65B179)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Confirmed</button>
                  <button onClick={() => setExpiryPrompt(null)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Skip</button>
                </div>
              </>
            )}
            {expiryPrompt.mode === 'ask_new' && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Add Expiry Date?</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>{expiryPrompt.product_name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' }}>No expiry date on file. Add one so Aria can track this stock?</p>
                <input type="date" value={expiryPrompt.pending_date} min={new Date().toISOString().split('T')[0]}
                  onChange={e => setExpiryPrompt(p => p ? { ...p, pending_date: e.target.value } : p)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', marginBottom: 14, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button disabled={!expiryPrompt.pending_date} onClick={() => { if (expiryPrompt.pending_date) setExpiryPrompt(p => p ? { ...p, mode: 'ask_track' } : p) }}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: expiryPrompt.pending_date ? 'var(--success,#65B179)' : 'var(--bg-elevated)', color: expiryPrompt.pending_date ? '#fff' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: expiryPrompt.pending_date ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Add Date</button>
                  <button onClick={() => setExpiryPrompt(null)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Skip</button>
                </div>
              </>
            )}
            {expiryPrompt.mode === 'ask_track' && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Track in System?</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>{expiryPrompt.product_name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                  Add <strong style={{ color: 'var(--text-primary)' }}>{new Date(expiryPrompt.pending_date).toLocaleDateString('en-AU')}</strong> to the system and let Aria monitor expiry for this product?
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={async () => {
                    try {
                      await fetch('/api/pos/product-batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: businessId, product_id: expiryPrompt.product_id, expiry_date: expiryPrompt.pending_date, quantity_received: 1, quantity_remaining: 0, expiry_tracked: true, source: 'pos_sale' }) })
                    } catch { /* non-fatal */ }
                    setExpiryPrompt(null)
                  }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Yes, Track It</button>
                  <button onClick={() => setExpiryPrompt(null)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>No Thanks</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Training mode amber banner — additive */}
      {trainingMode && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, background: 'rgba(245,158,11,0.95)', color: '#000', fontSize: 13, fontWeight: 800, textAlign: 'center', padding: '6px 0', letterSpacing: '0.04em', backdropFilter: 'blur(4px)' }}>
            🎓 TRAINING MODE — sales not recorded
            <button onClick={toggleTrainingMode} style={{ marginLeft: 16, padding: '2px 10px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.2)', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Turn off</button>
          </div>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(245,158,11,0.03)', pointerEvents: 'none', zIndex: 1 }} />
        </>
      )}

      {/* Keyboard shortcuts modal — additive */}
      {showShortcutsModal && (
        <div onClick={() => setShowShortcutsModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-ghost)', borderRadius: 16, padding: '24px 28px', maxWidth: 400, width: '90vw', boxShadow: 'var(--shadow-lg)', fontFamily: "'Manrope',sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcutsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {[
              ['⌘/', 'Open this shortcut list'],
              ['⌘F', 'Focus product search'],
              ['⌘P', 'View parked sales'],
              ['⌘K', 'Open Aria chat'],
              ['Esc', 'Close modal / panel'],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</span>
                <kbd style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-primary)', fontWeight: 600 }}>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Aurora canvas background — v3 redesign */}
      <AuroraCanvas />
      {/* LivePulseRail removed — saves 38px, data shown in topbar stats instead */}
      {/* Animated dot grid removed from terminal v4 — only static aurora */}
      <CursorGlow />
      <FlyToCart ref={flyRef} />

      {/* ══ CHECKOUT OVERLAY ════════════════════════════════════════ */}
      {terminalView === 'checkout' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', fontFamily: "'Manrope',sans-serif", background: 'var(--bg-base)', backdropFilter: 'blur(20px)' }}>
          {/* Left: Summary */}
          <div style={{ width: 300, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRight: '1px solid var(--violet-dim)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--violet-dim)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setTerminalView('pos')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontFamily: 'inherit', padding: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Back
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1, textAlign: 'right' }}>Summary</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cart.map(item => {
                const cn = (item.product.pos_categories?.name ?? 'other').toLowerCase();
                const cMeta: Record<string, { a: string; b: string }> = { beer: { a:'#F59E0B', b:'#92400E' }, 'beer & cider': { a:'#F59E0B', b:'#92400E' }, wine: { a:'#9333EA', b:'#4C1D95' }, spirits: { a:'var(--violet)', b:'var(--violet)' }, coffee: { a:'#A16207', b:'#451A03' }, food: { a:'var(--destructive)', b:'#7F1D1D' }, snacks: { a:'#F97316', b:'#7C2D12' }, other: { a:'#6366F1', b:'#312E81' } };
                const m = cMeta[cn] ?? cMeta.other;
                const initials = item.product.name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase();
                return (
                  <div key={cartKey(item)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--bg-ghost)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg," + (m.a) + "33," + (m.b) + "66)", border: "1px solid " + (m.a) + "44", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: m.a, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label ?? item.product.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono',monospace" }}>×{item.qty}</div>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>A${(item.unitPrice * item.qty).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--violet-dim)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Loyalty earned</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--violet-dim)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '3px 10px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800, color: 'var(--violet)' }}>{loyaltyPoints}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600 }}>PTS</span>
                </div>
              </div>
              {surchargeAmt > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'4px 0', borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:2 }}>
                  <span style={{ fontSize:12, color:'var(--text-secondary)' }}>Surcharge ({surchargeRules.find(r => r.is_active)?.amount_type === 'percent' ? `${surchargeRules.find(r => r.is_active)?.amount}%` : 'flat'})</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text-secondary)', fontFamily:"'JetBrains Mono',monospace" }}>+A${surchargeAmt.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Total</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 900, color: trainingMode ? '#F59E0B' : 'var(--text-primary)', letterSpacing: '-0.04em' }}>A${roundedTotal.toFixed(2)}{trainingMode ? ' (TRAINING)' : ''}</span>
              </div>
            </div>
          </div>

          {/* Right: Payment */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Payment method tabs */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--violet-dim)', display: 'flex', gap: 8 }}>
              {([
                { id: 'card'           as const, label: 'Card',       icon: '💳', color: 'var(--violet)' },
                { id: 'cash'           as const, label: 'Cash',       icon: '💵', color: 'var(--success)' },
                { id: 'split'          as const, label: 'Split',      icon: '✂️', color: '#F59E0B' },
                { id: 'gift_card'      as const, label: 'Gift Card',  icon: '🎁', color: 'var(--violet)' },
                { id: 'direct_deposit' as const, label: 'Direct Dep.',icon: '🏦', color: '#F59E0B' },
              ]).map(m => (
                <button key={m.id} onClick={() => setPayMethod(m.id)}
                  style={{ flex: 1, height: 60, borderRadius: 12, border: "1.5px solid " + (payMethod === m.id ? m.color + '55' : 'var(--violet-dim)'), background: payMethod === m.id ? (m.color) + "12" : 'var(--bg-ghost)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', transition: 'all 200ms', transform: payMethod === m.id ? 'translateY(-2px)' : 'none', boxShadow: payMethod === m.id ? "0 6px 20px " + (m.color) + "33" : 'none' }}>
                  <span style={{ fontSize: 18 }}>{m.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: payMethod === m.id ? m.color : 'var(--text-tertiary)', fontFamily: 'inherit' }}>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Payment UI */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 24 }}>
              {payMethod === 'card' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                  {/* 3D EFTPOS terminal */}
                  <div style={{ width: 220, background: 'linear-gradient(160deg,rgba(17,22,40,0.97),rgba(6,9,22,0.99))', border: '1px solid rgba(0,106,255,0.10)', borderRadius: 24, padding: 20, boxShadow: '0 22px 64px rgba(0,0,0,0.65), 0 0 50px rgba(0,106,255,0.08), inset 0 1px 0 rgba(0,106,255,0.06)', transform: 'perspective(600px) rotateX(6deg)' }}>
                    {/* Screen */}
                    <div style={{ background: '#050A14', borderRadius: 14, padding: '20px 16px', border: '1px solid rgba(0,106,255,0.08)', marginBottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,106,255,0.008) 2px,rgba(0,106,255,0.008) 4px)', borderRadius: 14, pointerEvents: 'none' }} />
                      {/* NFC rings */}
                      <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{ position: 'absolute', width: 48 + i * 20, height: 48 + i * 20, borderRadius: '50%', border: "1.5px solid rgba(0,229,255," + (0.6 - i * 0.18) + ")", animation: "nfc-pulse 2s ease-in-out infinite", animationDelay: (i * 0.4) + "s" }} />
                        ))}
                        <div style={{ width: 38, height: 38, borderRadius: '50%', border: '2px solid rgba(0,106,255,0.7)', background: 'rgba(0,106,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="1.5" strokeLinecap="round"><path d="M6 8.32a7.43 7.43 0 0 0 0 7.36"/><path d="M9.46 6.21a11.76 11.76 0 0 0 0 11.58"/><path d="M12.91 4.1a15.91 15.91 0 0 1 0 15.8"/></svg>
                        </div>
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>A${roundedTotal.toFixed(2)}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--violet)', letterSpacing: '0.08em' }}>TAP TO PAY</div>
                      {/* Indicator dots */}
                      <div style={{ display: 'flex', gap: 5 }}>
                        {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 1 ? 'var(--violet)' : 'rgba(0,106,255,0.15)', boxShadow: i === 1 ? '0 0 6px #006AFF' : 'none' }} />)}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>Tap, insert or swipe card</div>
                  {/* Confirm Payment */}
                  <button onClick={() => { processSale(); }} disabled={processing}
                    style={{ height: 52, padding: '0 36px', borderRadius: 14, border: 'none', background: '#006AFF', color: '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 900, cursor: processing ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(0,106,255,0.35)', transition: 'all 200ms', opacity: processing ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {processing ? 'Processing…' : trainingMode ? `Complete (Training) · A$${roundedTotal.toFixed(2)}` : `Confirm Payment · A$${roundedTotal.toFixed(2)}`}
                  </button>
                </div>
              )}

              {payMethod === 'cash' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[...new Set([roundedTotal, Math.ceil(roundedTotal/5)*5, Math.ceil(roundedTotal/10)*10, 50, 100].filter(a=>a>=roundedTotal))].slice(0,4).map(a => (
                      <button key={a} onClick={() => setCashTendered(a.toFixed(2))} style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-ghost)', color: 'var(--text-primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace" }}>A${a.toFixed(0)}</button>
                    ))}
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,106,255,0.10)', borderRadius: 12, padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4, letterSpacing: '0.06em' }}>CASH TENDERED</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--text-tertiary)' }}>A$</span>
                      <input type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                        placeholder="0.00" autoFocus
                        style={{ background: 'none', border: 'none', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', width: '100%', textAlign: 'right' }} />
                    </div>
                  </div>
                  {tendered >= roundedTotal && (
                    <div style={{ background: 'var(--success-bg)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>Change due</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>A${change.toFixed(2)}</span>
                    </div>
                  )}
                  <button onClick={() => processSale()} disabled={processing || tendered < roundedTotal}
                    style={{ height: 50, borderRadius: 12, border: 'none', background: 'var(--success)', color: '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 900, cursor: (processing || tendered < roundedTotal) ? 'not-allowed' : 'pointer', opacity: (processing || tendered < roundedTotal) ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 8px rgba(0,177,64,0.3)' }}>
                    {processing ? 'Processing…' : `Confirm Cash · A$${roundedTotal.toFixed(2)}`}
                  </button>
                </div>
              )}

              {payMethod === 'split' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280, textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Cash portion:</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,106,255,0.10)', borderRadius: 12, padding: '8px 14px' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-tertiary)' }}>A$</span>
                    <input type="number" value={splitCash} onChange={e => setSplitCash(e.target.value)} placeholder="0.00" autoFocus style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,106,255,0.08)', borderRadius: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Card remainder</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--text-primary)' }}>A${splitCardAmt.toFixed(2)}</span>
                  </div>
                  <button onClick={() => processSale()} disabled={processing}
                    style={{ height: 50, borderRadius: 12, border: 'none', background: 'var(--violet)', color: '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 900, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.4 : 1, boxShadow: '0 2px 8px rgba(0,106,255,0.3)' }}>
                    {processing ? 'Processing…' : 'Confirm Split Payment'}
                  </button>
                </div>
              )}

              {payMethod === 'gift_card' && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, width:300 }}>
                  <div style={{ width:'100%' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Gift Card Code</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <input
                        value={giftCardCode}
                        onChange={e => { setGiftCardCode(e.target.value.toUpperCase()); setGiftCardBalance(null); setGiftCardError(''); }}
                        onKeyDown={e => e.key === 'Enter' && checkGiftCard()}
                        placeholder="XXXX-XXXX"
                        style={{ flex:1, background:'var(--bg-surface)', border:'1px solid rgba(0,106,255,0.10)', borderRadius:10, padding:'10px 14px', fontSize:16, fontFamily:"'JetBrains Mono',monospace", color:'var(--text-primary)', outline:'none', letterSpacing:'0.1em' }}
                      />
                      <button onClick={checkGiftCard} disabled={!giftCardCode.trim() || giftCardChecking}
                        style={{ padding:'10px 16px', borderRadius:10, border:'none', background:'rgba(0,106,255,0.12)', color:'var(--violet)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!giftCardCode.trim()?0.4:1 }}>
                        {giftCardChecking ? '…' : 'Check'}
                      </button>
                    </div>
                    {giftCardError && <p style={{ fontSize:12, color:'var(--destructive)', marginTop:6 }}>{giftCardError}</p>}
                  </div>
                  {giftCardBalance !== null && (
                    <div style={{ width:'100%', background:'var(--violet-dim)', border:'1px solid rgba(0,106,255,0.12)', borderRadius:12, padding:'14px 18px' }}>
                      <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:4 }}>Available Balance</div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:28, fontWeight:800, color: giftCardBalance >= roundedTotal ? 'var(--success)' : 'var(--destructive)' }}>
                        A${giftCardBalance.toFixed(2)}
                      </div>
                      {giftCardBalance < roundedTotal && (
                        <p style={{ fontSize:12, color:'var(--destructive)', marginTop:6 }}>Insufficient — A${(roundedTotal - giftCardBalance).toFixed(2)} short</p>
                      )}
                      {giftCardBalance > roundedTotal && (
                        <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:4 }}>Change due: A${(giftCardBalance - roundedTotal).toFixed(2)}</p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => processSale()}
                    disabled={processing || giftCardBalance === null || giftCardBalance <= 0}
                    style={{ height:52, padding:'0 36px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#8B5CF6,#6D28D9)', color:'#fff', fontFamily:'inherit', fontSize:14, fontWeight:900, cursor:(processing||giftCardBalance===null||giftCardBalance<=0)?'not-allowed':'pointer', boxShadow:'0 5px 0 rgba(109,40,217,0.5), 0 10px 30px rgba(0,106,255,0.18)', transition:'all 200ms', opacity:(processing||giftCardBalance===null||giftCardBalance<=0)?0.4:1 }}>
                    {processing ? 'Processing…' : `Pay with Gift Card · A$${roundedTotal.toFixed(2)}`}
                  </button>
                </div>
              )}

              {payMethod === 'direct_deposit' && (
                <div style={{ display:'flex', flexDirection:'column', gap:16, width:300 }}>
                  <div style={{ fontSize:13, color:'var(--text-secondary)', textAlign:'center' }}>Record a direct deposit / bank transfer payment</div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Reference Number</div>
                    <input
                      value={directDepositRef}
                      onChange={e => setDirectDepositRef(e.target.value)}
                      placeholder="e.g. REF-20260506"
                      style={{ width:'100%', background:'var(--bg-surface)', border:'1px solid rgba(0,106,255,0.10)', borderRadius:10, padding:'10px 14px', fontSize:14, color:'var(--text-primary)', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Account Name (optional)</div>
                    <input
                      value={directDepositName}
                      onChange={e => setDirectDepositName(e.target.value)}
                      placeholder="e.g. John Smith"
                      style={{ width:'100%', background:'var(--bg-surface)', border:'1px solid rgba(0,106,255,0.10)', borderRadius:10, padding:'10px 14px', fontSize:14, color:'var(--text-primary)', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
                    />
                  </div>
                  <button
                    onClick={() => processSale()}
                    disabled={processing}
                    style={{ height:52, padding:'0 36px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#F59E0B,#D97706)', color:'#000', fontFamily:'inherit', fontSize:14, fontWeight:900, cursor:processing?'not-allowed':'pointer', boxShadow:'0 5px 0 rgba(217,119,6,0.5)', transition:'all 200ms', opacity:processing?0.6:1 }}>
                    {processing ? 'Processing…' : `Mark as Paid · A$${roundedTotal.toFixed(2)}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ CONFIRM OVERLAY ═════════════════════════════════════════ */}
      {showReceipt && terminalView === 'confirm' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, fontFamily: "'Manrope',sans-serif", overflow: 'hidden' }}>
          {/* AnimatedBg rendered once at line ~1084 — not duplicated here */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Green check with expanding rings */}
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ position: 'absolute', width: 76 + i * 24, height: 76 + i * 24, borderRadius: '50%', border: "1.5px solid rgba(34,197,94," + (0.55 - i * 0.15) + ")", animation: "paid-ring 1.6s " + (i * 0.3) + "s ease-out infinite" }} />
              ))}
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(34,197,94,0.3)', animation: 'scale-in 0.5s cubic-bezier(0.16,1,0.3,1)', position: 'relative', zIndex: 1 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
            {/* Title */}
            <div style={{ textAlign: 'center', animation: 'fade-up 0.4s 0.1s cubic-bezier(0.16,1,0.3,1) both' }}>
              <div style={{ fontSize: 38, fontWeight: 900, color: showReceipt.is_training ? '#F59E0B' : 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {showReceipt.is_training ? '🎓 Training sale' : 'Payment approved'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                {showReceipt.is_training
                  ? 'Not recorded · Training mode is on'
                  : `via ${showReceipt.payment_method ?? 'card'} · R${(showReceipt.sale_number ?? String(showReceipt.id ?? '')).slice(-5).toUpperCase() || '—'}`}
              </div>
            </div>
            {/* Receipt card */}
            <div style={{ background: 'rgba(10,14,30,0.85)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 20, padding: '20px 28px', minWidth: 320, maxWidth: 380, backdropFilter: 'blur(24px)', animation: 'fade-up 0.4s 0.2s cubic-bezier(0.16,1,0.3,1) both', boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(0,106,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(showReceipt.cartSnapshot ?? []).reduce((s: number, i: CartItem) => s + i.qty, 0)} items</span>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-secondary)' }}>A${showReceipt.total_amount?.toFixed(2) ?? roundedTotal.toFixed(2)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--violet-dim)', margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Charged</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 30, fontWeight: 900, color: 'var(--success)', letterSpacing: '-0.05em' }}>A${showReceipt.total_amount?.toFixed(2) ?? roundedTotal.toFixed(2)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--violet-dim)', margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Points earned</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--violet-dim)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '3px 10px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800, color: 'var(--violet)' }}>{loyaltyPoints}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600 }}>PTS</span>
                </div>
              </div>
            </div>
            {/* Receipt modal — only when user clicks Print */}
            {showReceiptModal && showReceipt && (
              <Receipt
                sale={showReceipt}
                businessName={businessName}
                template={receiptTemplate}
                onClose={() => setShowReceiptModal(false)}
                watermark={trainingMode ? 'TRAINING' : undefined}
              />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  const used = await printReceiptWithTemplate(showReceipt, businessName ?? '');
                  if (!used) setShowReceiptModal(true);
                }}
                title="Print via browser / receipt template"
                style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(220,240,255,0.7)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                🖨️ Print
              </button>
              <button
                onClick={async () => {
                  if (!showReceipt) return;
                  const items = (showReceipt.cartSnapshot ?? []).map((i: any) => ({
                    name: i.label ?? i.product?.name ?? 'Item',
                    qty: i.qty,
                    price: i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100),
                  }));
                  const total = showReceipt.total_amount ?? 0;
                  const tax = total - total / 1.1;
                  const r = await printESCPOS({
                    businessName: businessName ?? 'Aria POS',
                    receiptNumber: showReceipt.sale_number ?? showReceipt.id?.slice(-6) ?? '000',
                    date: showReceipt.created_at ? new Date(showReceipt.created_at).toLocaleString('en-AU') : new Date().toLocaleString('en-AU'),
                    cashier: showReceipt.served_by ?? undefined,
                    items,
                    subtotal: total - tax,
                    tax,
                    total,
                    paymentMethod: showReceipt.payment_method ?? 'card',
                    amountTendered: showReceipt.cash_tendered ?? undefined,
                    change: showReceipt.change_given ?? undefined,
                    loyaltyPoints: showReceipt.loyaltyEarned ?? undefined,
                  });
                  if (!r.ok) alert('Thermal print failed: ' + r.error);
                }}
                title="Print to USB thermal printer (Chrome/Edge)"
                style={{ height: 40, width: 40, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(220,240,255,0.7)', fontFamily: 'inherit', fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ⚡
              </button>
              <button
                onClick={async () => {
                  if (!showReceipt || !customer?.email) {
                    alert('No customer email on file. Attach a customer first.');
                    return;
                  }
                  try {
                    await fetch('/api/pos/email-receipt', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sale_id: showReceipt.id, email: customer.email }),
                    });
                    alert(`Receipt sent to ${customer.email}`);
                  } catch { alert('Failed to send email'); }
                }}
                title="Email receipt to customer"
                style={{ height: 40, padding: '0 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(220,240,255,0.7)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
              >
                📧 Email
              </button>
            </div>
            {/* New Sale button */}
            <button onClick={() => { setShowReceipt(null); setTerminalView('pos'); setShowReceiptModal(false); if (window.innerWidth < 768) setMobileTab('products'); }}
              style={{ height: 52, padding: '0 40px', borderRadius: 14, border: 'none', background: '#006AFF', color: '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,106,255,0.35)', transition: 'all 220ms', display: 'flex', alignItems: 'center', gap: 8, animation: 'fade-up 0.4s 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-3px)'; el.style.boxShadow = '0 8px 0 rgba(0,150,200,0.5), 0 16px 40px rgba(0,229,255,0.4)'; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.transform = ''; el.style.boxShadow = '0 5px 0 rgba(0,150,200,0.5), 0 10px 30px rgba(0,229,255,0.3)'; }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Sale
            </button>
          </div>
        </div>
      )}

      {/* Mobile mode banner */}
      {showMobileBanner && (
        <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: 'var(--violet)' }}>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">Mobile device detected</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>Switch to mobile mode for camera barcode scanning</p>
          </div>
          <div className="flex gap-2 ml-3 flex-shrink-0">
            <button onClick={() => setShowMobileBanner(false)}
              className="px-3 py-1.5 rounded-lg text-white/70 text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              Stay
            </button>
            <a href="/pos/mobile"
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: '#fff', color: 'var(--violet)' }}>
              Switch →
            </a>
          </div>
        </div>
      )}

{/* Low stock banner removed — visible in Dashboard instead */}

      {/* ── TOP BAR ───────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center px-3 gap-2" style={{ minHeight: 46, background: 'var(--terminal-glass-3,rgba(11,20,16,0.85))', borderBottom: '1px solid var(--terminal-sage-rim,rgba(127,184,151,0.18))', backdropFilter: 'blur(20px) saturate(1.4)', WebkitBackdropFilter: 'blur(20px) saturate(1.4)', position: 'relative', zIndex: 2, flexWrap: 'wrap', paddingTop: 6, paddingBottom: 6 }}>
        {/* Hamburger — mobile only, opens sidebar */}
        <button className="sm:hidden flex-shrink-0" onClick={() => window.dispatchEvent(new CustomEvent('pos-open-sidebar'))}
          style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }} className="hidden sm:block">
          <rect x="16" y="2" width="19" height="19" rx="3" transform="rotate(45 16 2)" stroke="var(--violet)" strokeWidth="1.8" fill="none"/>
          <circle cx="16" cy="16" r="3" fill="var(--violet)"/>
          <circle cx="16" cy="4.5" r="1.8" fill="var(--violet)" opacity="0.4"/>
          <circle cx="27.5" cy="16" r="1.8" fill="var(--violet)" opacity="0.4"/>
          <circle cx="16" cy="27.5" r="1.8" fill="var(--violet)" opacity="0.4"/>
          <circle cx="4.5" cy="16" r="1.8" fill="var(--violet)" opacity="0.4"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Point of Sale</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }} className="hidden sm:inline">{businessName}</span>
        <div style={{ flex: 1 }} />
        {/* Register quick actions — right side of top bar */}
        <div className="flex gap-1 items-center overflow-x-auto" style={{ flexShrink: 0, flexWrap: 'nowrap', maxWidth: '60%', scrollbarWidth: 'none' }}>
          {!registerLoading && parkedSales.length > 0 && (
            <button onClick={() => setShowParked(true)} className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
              Parked ({parkedSales.length})
            </button>
          )}
          {/* Online orders bell — Sprint J, cafe-only */}
          {businessType === 'cafe' && pendingOnlineOrders.length > 0 && (
            <button onClick={() => setShowOnlineBell(v => !v)}
              className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0"
              style={{ color: '#F59E0B', border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', position: 'relative' }}>
              🔔 {pendingOnlineOrders.length} online
            </button>
          )}
          {!registerLoading && cart.length > 0 && (
            <button onClick={() => { setShowSplitModal(true); setSplitSaleId(null) }} className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0" style={{ color: 'var(--violet)', border: '1px solid var(--border-violet)', background: 'var(--violet-dim)' }}>
              ✂ Split Bill
            </button>
          )}
          {!registerLoading && (
            <button onClick={() => { if (!canVoid) { alert('Manager permission required to process refunds.'); return; } setShowRefundModal(true); }} className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0" style={{ color: canVoid ? 'var(--text-secondary)' : '#6B7280', border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
              ⟳ Refund
            </button>
          )}
          {!registerLoading && registerIsOpen && (
            <button onClick={() => setShowCashierModal(true)} className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {registerSession?.opened_by
                ? `👤 ${registerSession.opened_by.includes('-') && !registerSession.opened_by.includes('@')
                    ? 'Owner'
                    : registerSession.opened_by.includes('@')
                      ? registerSession.opened_by.split('@')[0]
                      : registerSession.opened_by}`
                : 'Switch cashier'}
            </button>
          )}
          {businessType === 'cafe' && (
            <button onClick={() => setShowKdsTracker(v => !v)}
              className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0"
              style={{ color: kdsReadyOrders.length > 0 ? 'var(--violet)' : 'var(--text-secondary)', border: kdsReadyOrders.length > 0 ? '1px solid rgba(127,184,151,0.4)' : '1px solid var(--border-default)', background: kdsReadyOrders.length > 0 ? 'var(--violet-dim)' : 'var(--bg-surface)' }}>
              🍳{kdsReadyOrders.length > 0 ? ` ${kdsReadyOrders.length} ready` : ' Kitchen'}
            </button>
          )}
          {!registerLoading && (
            <button onClick={toggleTrainingMode} className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0" style={{ color: trainingMode ? '#F59E0B' : 'var(--text-secondary)', border: "1px solid " + (trainingMode ? 'rgba(245,158,11,0.4)' : '#2A2540'), background: trainingMode ? 'rgba(245,158,11,0.08)' : 'var(--bg-surface)' }}>
              {trainingMode ? '🎓 Training ON' : '🎓'}
            </button>
          )}
          {!registerLoading && (registerIsOpen
            ? <button onClick={() => setShowCloseModal(true)} className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0" style={{ color: 'var(--destructive)', border: '1px solid rgba(255,22,0,0.18)', background: 'rgba(239,68,68,0.06)' }}>Close reg.</button>
            : <button onClick={() => setShowRegisterModal(true)} className="px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0" style={{ color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)' }}>Open reg.</button>
          )}
        </div>
      </div>

      {/* 2-column layout — products 60%, cart 40% */}
      <div className="pos-terminal-layout-root flex-1 min-h-0 flex overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── LEFT: Product browser ──────────────────────────────── */}
        <div className={`pos-products-panel relative flex flex-col overflow-hidden ${mobileTab !== 'products' ? 'hidden sm:flex' : 'flex'}`}
          style={{ flex: '1 1 0', minWidth: 0, width: '100%', borderRight: '1px solid var(--terminal-sage-rim,rgba(127,184,151,0.18))', background: 'var(--terminal-glass-2,rgba(20,33,26,0.72))', backdropFilter: 'blur(40px) saturate(1.4)', WebkitBackdropFilter: 'blur(40px) saturate(1.4)' }}>

          {/* EOD Markdown banner */}
          {eodMarkdown && cart.length > 0 && (
            <div style={{ background:'rgba(245,158,11,0.1)', borderBottom:'1px solid rgba(245,158,11,0.3)', padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#F59E0B', fontWeight:700 }}>
                ⏰ {eodMarkdown.name} — {eodMarkdown.discount_pct}% off active
              </div>
              <button
                onClick={() => {
                  setCart(c => c.map(i => ({
                    ...i,
                    discount_percent: Math.max(i.discount_percent ?? 0, eodMarkdown!.discount_pct),
                  })));
                }}
                style={{ padding:'4px 12px', borderRadius:7, border:'none', background:'#F59E0B', color:'#000', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                Apply to cart
              </button>
            </div>
          )}

          {/* Quick panel slide-out */}
          {showQuickPanel && (
            <div ref={quickPanelRef} className="absolute inset-0 z-20 flex flex-col" style={{ background: 'var(--bg-elevated)', backdropFilter: 'blur(20px)', boxShadow: '4px 0 24px rgba(0,0,0,0.5)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{businessName}</p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                </div>
                <button onClick={() => setShowQuickPanel(false)} className="text-xl" style={{ color: 'var(--text-tertiary)' }}>×</button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {[
                  { icon: '🏠', label: 'Dashboard',        href: '/dashboard' },
                  { icon: '📦', label: 'Products',         href: '/pos/products' },
                  { icon: '👥', label: 'Customers',        href: '/pos/customers' },
                  { icon: '🎁', label: 'Gift Cards',       href: '/pos/gift-cards' },
                  { icon: '🏷️', label: 'Promotions',      href: '/pos/promotions' },
                  { icon: '📊', label: 'Reports',          href: '/pos/reports' },
                  { icon: '⏰', label: 'Timesheets',       href: '/dashboard/staff/timesheets' },
                  { icon: '💰', label: 'Cash Management',  href: '/pos/cash' },
                ].map(link => (
                  <a key={link.href} href={link.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = ''; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'; }}>
                    <span className="text-base w-6 text-center">{link.icon}</span>
                    <span>{link.label}</span>
                  </a>
                ))}
                {/* Clock In / Out — Sprint M */}
                <div className="pt-2 mt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                  <div className="flex gap-1 px-1">
                    {(['in', 'out'] as const).map(m => (
                      <button key={m} onClick={() => { setClockMode(m); setShowClockModal(true); setClockPin(''); setClockResult(null); }}
                        className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors capitalize"
                        style={{ background: m === 'in' ? 'rgba(45,82,64,0.4)' : 'rgba(255,22,0,0.10)', color: m === 'in' ? 'var(--violet)' : '#fca5a5', border: "1px solid " + (m === 'in' ? 'rgba(45,82,64,0.5)' : 'rgba(255,22,0,0.18)') }}>
                        Clock {m}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    try {
                      localStorage.setItem('aria_display_state', JSON.stringify({
                        status: 'idle', business_name: businessName, timestamp: Date.now(),
                      }));
                    } catch { /* ignore */ }
                    const w = window.open(
                      '/pos/display',
                      'AriaCustomerDisplay',
                      ['width=1280','height=800','menubar=no','toolbar=no','location=no','status=no','scrollbars=no','resizable=yes'].join(',')
                    );
                    if (w) w.focus();
                    setShowQuickPanel(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-left" style={{ color: 'var(--text-secondary)' }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='var(--bg-hover)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='';}}>
                  <span className="text-base w-6 text-center">📺</span>
                  <span>Customer Display ↗</span>
                </button>
              </div>
              {lowStockItems.length > 0 && (
                <div className="p-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Low stock</p>
                  {lowStockItems.slice(0, 3).map(p => (
                    <p key={p.id} className="text-xs py-0.5" style={{ color: '#F59E0B' }}>⚠ {p.name} ({p.stock_quantity} left)</p>
                  ))}
                </div>
              )}
              {registerIsOpen && (
                <div className="p-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <button onClick={() => { setShowCloseModal(true); setShowQuickPanel(false); }}
                    className="w-full py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--destructive-bg)', border: '1px solid rgba(255,22,0,0.12)', color: 'var(--destructive)' }}>
                    Close Register
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search + menu button row */}
          <div className="px-3 py-1.5 flex gap-2" style={{ borderBottom: '1px solid rgba(0,106,255,0.06)' }}>
            <button onClick={() => setShowQuickPanel(v => !v)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-base"
              style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
              ≡
            </button>
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search or scan barcode…"
                className="w-full pl-9 pr-8 py-1.5 rounded-[10px] text-sm outline-none"
                style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid var(--violet-dim)', color: 'var(--text-primary)', fontFamily: "'Manrope', sans-serif" }}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none"
                  style={{ color: 'var(--text-tertiary)' }}>
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="px-3 py-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-subtle)', scrollbarWidth: 'none' }}>
            <div className="flex gap-1.5 whitespace-nowrap">
              <button onClick={() => setActiveCategory(null)}
                className="text-xs font-semibold px-2.5 py-0.5 rounded-lg flex-shrink-0 transition-all"
                style={!activeCategory
                  ? { background: 'var(--violet-dim)', border: '1px solid rgba(0,106,255,0.15)', color: 'var(--violet)' }
                  : { background: 'var(--bg-surface)', border: '1px solid transparent', color: 'rgba(139,133,168,0.5)' }}>
                All
              </button>
              {categories.map(c => (
                <button key={c.name} onClick={() => setActiveCategory(activeCategory === c.name ? null : c.name)}
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-lg flex-shrink-0 flex items-center gap-1.5 transition-all"
                  style={activeCategory === c.name
                    ? { background: 'var(--violet-dim)', border: '1px solid rgba(0,106,255,0.15)', color: 'var(--violet)' }
                    : { background: 'var(--bg-surface)', border: '1px solid transparent', color: 'rgba(139,133,168,0.5)' }}>
                  <span className="text-sm leading-none">{getCategoryEmoji(c.name)}</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick sale row — + Item, + Note, 🔍, % Discount, + Customer, Global select */}
          <div className="px-3 py-1.5 flex gap-1.5 items-center" style={{ borderBottom: '1px solid var(--border-subtle, #1C1928)' }}>
            <button onClick={() => { setCustomItemForm(f => ({ ...f, isNote: false })); setShowCustomItem(true); }}
              title="Custom item"
              className="flex items-center justify-center gap-1 text-xs rounded-lg transition-colors whitespace-nowrap"
              style={{ padding: '5px 8px', border: '1px dashed var(--border-strong, #2A2540)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
              + Item
            </button>
            <button onClick={() => { setCustomItemForm(f => ({ ...f, isNote: true, price: '0' })); setShowCustomItem(true); }}
              title="Add note to sale"
              className="flex items-center justify-center gap-1 text-xs rounded-lg transition-colors whitespace-nowrap"
              style={{ padding: '5px 8px', border: '1px dashed var(--border-strong, #2A2540)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
              + Note
            </button>
            <button onClick={() => setPriceCheckMode(v => !v)}
              className="flex items-center justify-center text-xs rounded-lg transition-colors"
              style={{ padding: '5px 7px', flexShrink: 0,
                ...(priceCheckMode
                  ? { background: 'var(--violet-dim)', border: '1px solid var(--border-violet)', color: 'var(--violet)' }
                  : { border: '1px solid var(--border-strong, #2A2540)', color: 'var(--text-tertiary)' }) }}
              title="Price check mode">
              🔍
            </button>
            {/* Quick discount button — opens discount modal or sets 10% on selected item */}
            {/* Quick discount — cycles 0→5→10→15→20→0% on cart total */}
            <button
              onClick={() => {
                const steps = [0, 5, 10, 15, 20];
                const cur = steps.indexOf(Math.round(manualDiscountAmt / Math.max(subtotal, 0.01) * 100));
                const next = steps[(cur + 1) % steps.length];
                setManualDiscountAmt(subtotal * next / 100);
              }}
              className="flex items-center justify-center text-xs rounded-lg transition-colors whitespace-nowrap"
              style={{ padding: '5px 8px', flexShrink: 0,
                ...(manualDiscountAmt > 0
                  ? { background: 'var(--violet-dim)', border: '1px solid var(--border-violet)', color: 'var(--violet)' }
                  : { border: '1px solid var(--border-strong, #2A2540)', color: 'var(--text-tertiary)' }) }}
              title={manualDiscountAmt > 0 ? `Discount: ${(manualDiscountAmt / Math.max(subtotal, 0.01) * 100).toFixed(0)}% — click to change` : 'Apply quick discount'}>
              {manualDiscountAmt > 0 ? `${(manualDiscountAmt / Math.max(subtotal, 0.01) * 100).toFixed(0)}% off` : '% Disc'}
            </button>
            {/* Compact customer search — right in action bar */}
            <div className="relative" style={{ flexShrink: 0 }}>
              {customer ? (
                <div className="flex items-center gap-1 rounded-lg px-2 py-1" style={{ border: '1px solid rgba(0,106,255,0.25)', background: 'var(--violet-dim)', maxWidth: 90 }}>
                  <span className="text-xs truncate" style={{ color: 'var(--violet)', maxWidth: 60 }}>{customer.name.split(' ')[0]}</span>
                  <button onClick={() => { setCustomer(null); setCustomerSearch(''); }} style={{ color: 'rgba(0,106,255,0.5)', fontSize: 13, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>×</button>
                </div>
              ) : (
                <>
                  <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="+ Cust."
                    className="text-xs rounded-lg px-2 py-1 outline-none"
                    style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-secondary)', background: 'transparent', width: 62 }} />
                  {customerResults.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 rounded-xl shadow-xl z-30 overflow-hidden w-48" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                      {customerResults.map(c => (
                        <button key={c.id}
                          onMouseDown={e => {
                            e.preventDefault();
                            setCustomer(c);
                            setCustomerSearch('');
                            setCustomerResults([]);
                            if (c.id && businessId) {
                              setSuggestionLoading(true);
                              setDisplaySuggestion(null);
                              fetch('/api/pos/display-suggestions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ customer_id: c.id, cart_items: cart.map((i: any) => ({ name: i.name, price: i.price })) }),
                              }).then(r => r.json()).then((d: any) => {
                                setDisplaySuggestion(d.suggestion ?? null);
                                setSuggestionLoading(false);
                              }).catch(() => setSuggestionLoading(false));
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{c.phone ?? c.email ?? ''}</p>
                          </div>
                          <span className="text-[10px]" style={{ color: 'var(--violet)' }}>{c.loyalty_points}pts</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Spacer */}
            <span style={{ flex: 1 }} />
            {/* Layout switcher */}
            <LayoutSwitcher current={currentLayout} onChange={setLayout} />
            {/* Outlet switcher — only shown if >1 outlet */}
            {outlets.length > 1 && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setShowOutletDropdown(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'var(--violet-dim)', border: '1px solid rgba(0,106,255,0.10)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span>📍</span>
                  <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(outlets.find((o: any) => o.id === activeOutletId) as any)?.name ?? 'Location'}
                  </span>
                  <span style={{ fontSize: 8, opacity: 0.6 }}>▼</span>
                </button>
                {showOutletDropdown && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 160, marginTop: 4 }}>
                    {outlets.map((o: any) => (
                      <button key={o.id} onClick={() => {
                        setActiveOutletId(o.id);
                        localStorage.setItem('aria-active-outlet', o.id);
                        localStorage.setItem('pos_outlet_id', o.id);
                        setShowOutletDropdown(false);
                      }} style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', border: 'none', background: o.id === activeOutletId ? 'rgba(0,106,255,0.08)' : 'transparent', color: o.id === activeOutletId ? 'var(--violet)' : 'var(--text-primary)', fontSize: 12, fontWeight: o.id === activeOutletId ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {o.is_global ? 'Global' : o.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {priceCheckMode && (
            <div className="px-3 py-1.5" style={{ background: 'rgba(139,92,246,0.06)', borderBottom: '1px solid rgba(0,106,255,0.10)' }}>
              <p className="text-xs font-medium" style={{ color: 'var(--violet)' }}>Price check mode — tap product to check price, not add to cart</p>
            </div>
          )}

          {/* Barcode lookup result */}
          {(barcodeScanning || barcodeLookupHit) && (
            <div className="mx-3 mb-2 mt-1">
              {barcodeScanning ? (
                <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(0,106,255,0.12)', color: 'var(--violet)' }}>
                  <span className="w-3 h-3 rounded-full border border-t-transparent animate-spin" style={{ borderColor: 'var(--violet)', borderTopColor: 'transparent' }} />
                  Looking up barcode…
                </div>
              ) : barcodeLookupHit && (
                <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <p className="text-xs font-medium" style={{ color: '#F59E0B' }}>{barcodeLookupHit.name}</p>
                  {barcodeLookupHit.brand && <p className="text-[10px]" style={{ color: 'rgba(245,158,11,0.7)' }}>{barcodeLookupHit.brand}</p>}
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(245,158,11,0.5)' }}>Not in your catalogue — add via Products</p>
                  <button onClick={() => setBarcodeLookupHit(null)} className="text-[10px] mt-0.5" style={{ color: 'rgba(245,158,11,0.4)' }}>Dismiss</button>
                </div>
              )}
            </div>
          )}

          {/* Product grid */}
          <div className="pos-product-grid flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="rounded-2xl p-3 animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                    <div className="h-12 rounded-lg mb-2" style={{ background: 'var(--bg-ghost)' }} />
                    <div className="h-3 rounded mb-1" style={{ background: 'rgba(255,255,255,0.06)', width: '70%' }} />
                    <div className="h-3 rounded" style={{ background: 'var(--bg-ghost)', width: '45%' }} />
                  </div>
                ))}
              </div>
            ) : displayedProducts.length === 0 ? (
              /* Empty state — additive */
              <EmptyLayoutState
                reason={search.trim().length >= 2
                  ? 'no-search-match'
                  : activeCategory
                    ? 'category-empty'
                    : 'no-products'}
                searchQuery={search}
              />
            ) : (() => {
              // Shared handler for layout components — additive
              const handleLayoutClick = (lp: ProductForTerminal) => {
                if (gridCustomising) return;
                const p = products.find(prod => prod.id === lp.id);
                if (!p) return;
                if (priceCheckMode) { setPriceCheckProd(p); return; }
                checkAndAddToCart(p);
              };
              // Search fallback: always render FastGrid when searching — additive
              const effectiveLayout: TerminalLayout =
                search.trim().length >= 2 ? 'grid' : currentLayout;

              const handleGridReorder = (newIds: string[]) => {
                if (!activeCategoryId) return;
                const prevOrder = productGridOrder;
                const newMap = { ...(productGridOrder ?? {}), [activeCategoryId]: newIds };
                setProductGridOrder(newMap);
                fetch('/api/pos/layout-preferences', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ product_grid_order: { [activeCategoryId]: newIds } }),
                }).then(undefined, () => {
                  setProductGridOrder(prevOrder);
                  console.warn('[POS] Failed to save product order');
                });
              };

              const handleResetCategoryOrder = () => {
                if (!activeCategoryId) return;
                setProductGridOrder(prev => {
                  if (!prev) return null;
                  const next = { ...prev };
                  delete next[activeCategoryId];
                  return Object.keys(next).length ? next : null;
                });
                fetch('/api/pos/layout-preferences', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ product_grid_order: { [activeCategoryId]: null } }),
                }).then(undefined, () => console.warn('[POS] Failed to reset product order'));
              };

              const handleResetAllOrders = () => {
                setProductGridOrder(null);
                fetch('/api/pos/layout-preferences', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ product_grid_order: null }),
                }).then(undefined, () => console.warn('[POS] Failed to reset all product orders'));
              };

              return (
                <>
                  {gridCustomising && effectiveLayout === 'grid' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(45,82,64,0.6)', borderBottom: '1px solid rgba(127,184,151,0.2)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#7FB897', fontWeight: 600, flex: 1, minWidth: 120 }}>Drag to reorder products</span>
                      {activeCategoryId && (
                        <button onClick={handleResetCategoryOrder}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: 'rgba(127,184,151,0.7)', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Reset product order
                        </button>
                      )}
                      <button onClick={handleResetAllOrders}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: 'rgba(127,184,151,0.7)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Reset ALL orders
                      </button>
                      <button onClick={() => setGridCustomising(false)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2D5240', color: '#7FB897', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                        Done
                      </button>
                    </div>
                  )}
                  <LayoutWrapper layout={effectiveLayout}>
                    {effectiveLayout === 'shelf' && (
                      <ShelfLayout
                        products={layoutProducts}
                        onProductClick={handleLayoutClick}
                        selectedCategory={activeCategory}
                      />
                    )}
                    {effectiveLayout === 'carousel' && (
                      <CarouselLayout
                        products={layoutProducts}
                        onProductClick={handleLayoutClick}
                        selectedCategory={activeCategory}
                      />
                    )}
                    {effectiveLayout === 'masonry' && (
                      <MasonryLayout
                        products={layoutProducts}
                        onProductClick={handleLayoutClick}
                      />
                    )}
                    {effectiveLayout === 'search-first' && (
                      <SearchFirstLayout
                        products={layoutProducts}
                        onProductClick={handleLayoutClick}
                        recentProductIds={recentProductIds}
                        suggestedProductIds={ariaSuggestedIds}
                      />
                    )}
                    {effectiveLayout === 'grid' && (
                      <FastGridLayout
                        products={layoutProducts}
                        onProductClick={handleLayoutClick}
                        showStock={true}
                        customising={gridCustomising}
                        onReorder={handleGridReorder}
                      />
                    )}
                  </LayoutWrapper>
                </>
              );

              // unreachable — kept for fallback reference
            })()}
          </div>
        </div>

        {/* ── CENTRE: Cart ──────────────────────────────────────── */}
        <div className={`pos-cart-panel flex flex-col overflow-hidden ${mobileTab !== 'cart' ? 'hidden sm:flex' : 'flex'}`}
          style={{ flex: '0 0 360px', width: typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : 360, height: '100%', background: 'var(--terminal-glass-1,rgba(28,44,36,0.55))', backdropFilter: 'blur(40px) saturate(1.4)', WebkitBackdropFilter: 'blur(40px) saturate(1.4)', borderLeft: '1px solid var(--terminal-sage-rim,rgba(127,184,151,0.18))', minHeight: 0 }}>

          {showReceipt && terminalView !== 'confirm' ? (
            /* ── RECEIPT VIEW (non-confirm, e.g. reprint) ─────── */
            <div className="flex-1 flex items-center justify-center p-4">
              <Receipt
                sale={showReceipt}
                businessName={businessName}
                template={receiptTemplate}
                onClose={() => { setShowReceipt(null); if (window.innerWidth < 768) setMobileTab('products'); }}
                watermark={trainingMode ? 'TRAINING' : undefined}
              />
            </div>
          ) : (
            /* ── CART VIEW ────────────────────────────────────── */
            <>
              {/* Order type selector — Sprint D, cafe-only, additive */}
              {businessType === 'cafe' && (
                <OrderTypeSelector value={orderType} onChange={type => {
                  setOrderType(type)
                  if (type === 'dine_in') setShowFloorPlan(true)
                  else if (type === 'takeaway' || type === 'pickup') setShowCustomerCapture(true)
                  else if (type === 'delivery') setShowCustomerCapture(true)
                }} />
              )}
              {/* Table + customer context bar — cafe, additive */}
              {businessType === 'cafe' && (selectedTable || customerDetails?.name) && (
                <div style={{ display: 'flex', gap: 8, padding: '5px 12px', background: 'var(--violet-dim)', borderBottom: '1px solid rgba(0,106,255,0.10)', fontSize: 11, alignItems: 'center' }}>
                  {selectedTable && <span style={{ color: 'var(--violet)' }}>🪑 {selectedTable.name}</span>}
                  {customerDetails?.name && <span style={{ color: 'rgba(255,255,255,0.6)' }}>👤 {customerDetails.name}</span>}
                  {customerDetails?.pickup_time && <span style={{ color: 'rgba(255,255,255,0.4)' }}>⏰ {new Date(customerDetails.pickup_time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>}
                  <button onClick={() => { setSelectedTable(null); setCustomerDetails(null) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 13 }}>×</button>
                </div>
              )}
              {/* Customer lookup bar — Sprint G, cafe + loyalty, additive */}
              {businessType === 'cafe' && loyaltyConfig && (
                <CustomerLookupBar
                  selected={customer as LoyaltyCustomer | null}
                  loyaltyConfig={loyaltyConfig}
                  cartTotal={total}
                  onSelect={c => {
                    if (!c) { setCustomer(null); setCustomerSearch(''); return; }
                    setCustomer({ id: c.id, name: c.name, email: c.email, phone: c.phone, loyalty_points: c.points_balance ?? 0, total_spent: c.total_spent, points_balance: c.points_balance, stamps_count: c.stamps_count, tags: c.tags, visit_count: c.visit_count, last_visit_at: c.last_visit_at });
                  }}
                />
              )}
              {/* Cart header */}
              <div ref={cartAnchor} className="flex-shrink-0 px-4 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Order</span>
                {cart.length > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--violet-dim)', border: '1px solid rgba(0,106,255,0.15)', color: 'var(--violet)' }}>
                    {cart.reduce((s, i) => s + i.qty, 0)} item{cart.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="flex-1" />
                {cart.length > 0 && (
                  <button onClick={() => setShowLaybyModal(true)}
                    className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ border: '1px solid rgba(139,92,246,0.35)', color: 'var(--violet)' }}>
                    Layby
                  </button>
                )}
                {cart.length > 0 && (
                  <button onClick={() => parkSale()}
                    className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                    Park
                  </button>
                )}
                {cart.length > 0 && (
                  <button onClick={confirmClear}
                    className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                    Clear
                  </button>
                )}

              </div>



              {/* Cart items — scrollable region, flex-1 fills remaining height */}
              <div className="cart-items">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                    <div style={{ width: 52, height: 52, borderRadius: 15, border: '1px dashed rgba(127,184,151,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(0,106,255,0.12)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                    </div>
                    <p style={{ fontSize: 12, color: 'rgba(127,184,151,0.25)', lineHeight: 1.6 }}>Tap a product<br/>to begin</p>
                  </div>
                ) : cart.map(item => {
                  const key = cartKey(item);
                  const lineTotal = item.unitPrice * item.qty * (1 - (item.discount_percent ?? 0) / 100);
                  return (
                    <div key={key}
                      className="cart-line"
                      onClick={() => setSelectedItem(item.product.id)}
                      style={{ background: selectedItem === item.product.id ? 'rgba(127,184,151,0.08)' : undefined, borderColor: selectedItem === item.product.id ? 'var(--terminal-sage-rim,rgba(127,184,151,0.18))' : undefined }}>
                      <div className="cart-thumb">
                        <ProductImage product={{ id: item.product.id, name: item.label ?? item.product.name, category: item.product.pos_categories?.name ?? null, image_url: (item.product as any).image_url ?? null, image_source: (item.product as any).image_source ?? null }} size={56} showShadow={false} />
                      </div>
                      <div className="cart-line-info">
                        <div className="cart-line-name">{item.label ?? item.product.name}</div>
                        <div className="cart-line-meta">
                          {item.modifierDetails && item.modifierDetails.length > 0
                            ? item.modifierDetails.map(m => m.name).join(', ')
                            : (item.product.pos_categories?.name ?? '')}
                        </div>
                      </div>
                      <div className="qty-control">
                        <button className="qty-btn" onClick={e => { e.stopPropagation(); updateQty(key, item.qty - 1); }}>−</button>
                        <span className="qty-num">{item.qty}</span>
                        <button className="qty-btn" onClick={e => { e.stopPropagation(); updateQty(key, item.qty + 1); }}>+</button>
                      </div>
                      <div className="cart-line-price" style={item.unitPrice === 0 ? { color: '#f87171' } : {}}>
                        {item.unitPrice === 0 ? (
                          <span style={{ fontSize: 11 }} title="No price set — edit this product in Products">⚠ $0.00</span>
                        ) : (
                          <>
                            {(item.discount_percent ?? 0) > 0 && (
                              <span style={{ fontSize: 10, textDecoration: 'line-through', color: 'var(--text-tertiary)', display: 'block', textAlign: 'right' }}>
                                ${(item.unitPrice * item.qty).toFixed(2)}
                              </span>
                            )}
                            ${lineTotal.toFixed(2)}
                          </>
                        )}
                      </div>
                      {/* Sprint H: per-line kebab menu */}
                      <CartLineMenu
                        canOverride={canOverridePrice}
                        onOverridePrice={() => setPriceOverride({ index: cart.indexOf(item), line: item })}
                        onEditNotes={() => setEditNotesState({ index: cart.indexOf(item), line: item })}
                        onRemove={() => { updateQty(key, 0); }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Fixed bottom: discount pills + aria card + totals + charge */}
              <div style={{ flexShrink: 0 }}>


                {/* Aria inline suggestion card */}
                {cart.length > 0 && (
                  <AriaInlineCard
                    cartItems={cartForAria}
                    customer={customer ? { name: customer.name } : null}
                    onAddSuggestion={(name) => console.log('[Aria] suggestion accepted:', name)}
                  />
                )}

                {/* Discount Bar — Sprint I, cafe-only, additive */}
                {businessType === 'cafe' && cart.length > 0 && (
                  <DiscountBar
                    businessType={businessType}
                    cart={cartForDiscount}
                    appliedDiscounts={appliedDiscounts}
                    onApply={d => setAppliedDiscounts(prev => prev.some(x => x.promotion_id === d.promotion_id) ? prev : [...prev, d])}
                    onRemove={pid => setAppliedDiscounts(prev => prev.filter(x => x.promotion_id !== pid))}
                    manualDiscountAmount={manualDiscountAmt}
                    onManualDiscount={(amt) => setManualDiscountAmt(amt)}
                  />
                )}

                {/* Pay panel — totals + grand total halo + charge + quick actions */}
                {cart.length > 0 && (() => {
                  const promoOff = appliedDiscounts.reduce((s, d) => s + d.amount_off, 0) + manualDiscountAmt;
                  const discountAmt = cart.reduce((s, i) => s + i.unitPrice * i.qty * ((i.discount_percent ?? 0) / 100), 0) + promoOff;
                  const tFloor = Math.floor(total);
                  const tCents = String(Math.round((total - tFloor) * 100)).padStart(2, '0');
                  return (
                    <>
                      <div className="cart-totals">
                        <div className="totals-row">
                          <span>Subtotal</span>
                          <span className="value">A${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="totals-row">
                          <span>GST (10% inc.)</span>
                          <span className="value">A${taxAmount.toFixed(2)}</span>
                        </div>
                        {discountAmt > 0 && (
                          <div className="totals-row discount">
                            <span>Discount</span>
                            <span className="value">−A${discountAmt.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '0 16px' }}>
                        <div className="totals-grand">
                          <div className="totals-grand-label-block">
                            <span className="totals-grand-label">Total</span>
                            <span className="totals-grand-sub">
                              {cart.length} item{cart.length === 1 ? '' : 's'}
                              {customer ? ` · ${customer.name?.split(' ')[0]}` : ''}
                            </span>
                          </div>
                          <span className="totals-grand-value">
                            A${tFloor}<span className="cents">.{tCents}</span>
                          </span>
                        </div>
                      </div>
                      {/* Loyalty earn/redeem preview — Sprint G, cafe + loyalty, additive */}
                      {businessType === 'cafe' && loyaltyConfig && customer && (() => {
                        const earnPts = Math.floor(roundedTotal * (loyaltyConfig.points_per_dollar ?? 1));
                        const redeemThreshold = Math.round(100 / (loyaltyConfig.point_value_cents ?? 1));
                        const canRedeem = (customer.points_balance ?? customer.loyalty_points ?? 0) >= redeemThreshold;
                        const redeemDiscount = redeemActive ? Math.min((customer.points_balance ?? customer.loyalty_points ?? 0), redeemThreshold) * (loyaltyConfig.point_value_cents ?? 1) / 100 : 0;
                        return (
                          <div style={{ padding: '6px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {earnPts > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--violet)', fontWeight: 600 }}>
                                +{earnPts} point{earnPts !== 1 ? 's' : ''} earned this sale
                              </div>
                            )}
                            {canRedeem && (
                              <button onClick={() => setRedeemActive(r => !r)}
                                style={{ textAlign: 'left', background: redeemActive ? 'var(--violet-dim)' : 'transparent', border: "1px solid " + (redeemActive ? 'rgba(139,92,246,0.4)' : 'rgba(0,106,255,0.12)'), borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: 'var(--violet)' }}>
                                {redeemActive ? `✓ Redeeming ${redeemThreshold} pts = −A$${redeemDiscount.toFixed(2)}` : `Redeem ${redeemThreshold} pts = −A$${((redeemThreshold * (loyaltyConfig.point_value_cents ?? 1)) / 100).toFixed(2)}`}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      <div className="cart-action">
                        {!registerIsOpen && !registerLoading ? (
                          <button className="charge-btn" onClick={() => setShowRegisterModal(true)}>
                            <span>Open Register to Sell</span>
                            <span className="arrow">→</span>
                          </button>
                        ) : (
                          <>
                            <button data-tour="test_sale" className="charge-btn"
                              onClick={() => {
                                if (roundedTotal <= 0) { alert('Please set prices for all items before charging.'); return; }
                                if (registerIsOpen) setTerminalView('checkout');
                              }}
                              disabled={!registerIsOpen || processing || roundedTotal <= 0}
                              style={{ opacity: (!registerIsOpen || roundedTotal <= 0) ? 0.4 : 1 }}>
                              <span>Charge A${roundedTotal.toFixed(2)}</span>
                              <span className="arrow">→</span>
                            </button>
                            <div className="cart-quick-actions">
                              <button className="quick-action"
                                onClick={() => { setPayMethod('card'); setTerminalView('checkout'); }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                                EFTPOS
                              </button>
                              <button className="quick-action"
                                onClick={() => { setPayMethod('cash'); setTerminalView('checkout'); }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h6M9 15h6"/></svg>
                                Cash
                              </button>
                              <button className="quick-action"
                                onClick={() => setShowLaybyModal(true)}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M11 17h2"/></svg>
                                Layby
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>{/* end fixed bottom */}
            </>
          )}
        </div>

      </div>

      {/* Online orders bell drawer — Sprint J, cafe-only */}
      {showOnlineBell && businessType === 'cafe' && pendingOnlineOrders.length > 0 && (
        <div style={{ position: 'fixed', top: 48, right: 0, width: 320, zIndex: 410, background: 'var(--pos-elevated,#162030)', borderLeft: '1px solid rgba(245,158,11,0.3)', borderBottom: '1px solid rgba(245,158,11,0.3)', borderBottomLeftRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontFamily: "'Manrope',sans-serif", maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>🔔 Incoming online orders</span>
            <button onClick={() => setShowOnlineBell(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingOnlineOrders.map(o => (
              <div key={o.id} style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e8f4f8' }}>{o.order_number} · {o.customer_name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>A${(o.total ?? 0).toFixed(2)}</div>
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/pos/online-orders/${o.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }) })
                    setPendingOnlineOrders(prev => prev.filter(x => x.id !== o.id))
                  }}
                  style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: 'var(--violet)', color: '#0f1a26', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  Confirm
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KDS Tracker drawer - cafe-only, additive */}
      {showKdsTracker && businessType === 'cafe' && (
        <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 320, background: 'var(--pos-elevated,#162030)', borderLeft: '1px solid rgba(0,106,255,0.12)', zIndex: 400, overflowY: 'auto', padding: 16, fontFamily: "'Manrope',sans-serif" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, color: 'var(--violet)', margin: 0, fontSize: 14 }}>Kitchen Status</p>
            <button onClick={() => { setShowKdsTracker(false); setKdsReadyOrders([]); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20 }}>x</button>
          </div>
          <KdsTracker businessId={businessId} />
          <a href='/pos/kitchen' target='_blank' style={{ display: 'block', marginTop: 16, textAlign: 'center', fontSize: 11, color: 'rgba(127,184,151,0.6)', textDecoration: 'none' }}>Open full Kitchen Display</a>
        </div>
      )}

      {/* ── ARIA FLOATING PANEL ────────────────────────────────────── */}

      {/* Backdrop — desktop only when ariaOpen */}
      {ariaOpen && (
        <div
          className="hidden sm:block"
          onClick={() => setAriaOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* Panel — mobile: shows as mobileTab, desktop: floating */}
      <div
        className={`flex flex-col overflow-hidden ${mobileTab !== 'aria' ? 'hidden sm:flex' : 'flex'}`}
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 340,
          zIndex: 99,
          background: 'var(--bg-surface)',
          boxShadow: 'var(--shadow-lg)',
          transform: ariaOpen || mobileTab === 'aria' ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms cubic-bezier(0.16,1,0.3,1)',
          visibility: ariaOpen || mobileTab === 'aria' ? 'visible' : 'hidden',
        }}>

        {/* Panel header */}
        <div className="flex-shrink-0 px-4 py-3.5 flex items-center justify-between relative overflow-hidden"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
          <div style={{ position: 'absolute', top: -30, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,106,255,0.18),transparent 70%)', filter: 'blur(20px)', animation: 'orb-breathe 4s ease-in-out infinite', pointerEvents: 'none' }} />
          <div className="flex items-center gap-2 relative z-10">
            <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 18, color: 'var(--violet)' }}>Aria</span>
            <div className="relative">
              <span className="w-1.5 h-1.5 rounded-full block" style={{ background: 'var(--success)' }} />
              <span className="absolute inset-0 w-1.5 h-1.5 rounded-full animate-ping" style={{ background: 'var(--success)', opacity: 0.75 }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <kbd className="text-[10px] rounded px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-tertiary)' }}>⌘K</kbd>
            <div
              onClick={() => { setAriaOpen(false); setMobileTab('products'); }}
              style={{ cursor: 'pointer', fontSize: 18, color: 'var(--text-tertiary)', lineHeight: 1, padding: '0 2px' }}>×</div>
          </div>
        </div>

        {/* Proactive alerts */}
        <div className="flex-shrink-0 px-3 py-2 space-y-1.5">
          {ageRestrictedInCart && (
            <div className="rounded-[10px] px-2.5 py-1.5 text-xs flex items-center gap-1.5 font-semibold" style={{ background: 'var(--destructive-bg)', border: '1px solid rgba(255,22,0,0.10)', color: 'var(--destructive)' }}>
              🔞 ID check required
            </div>
          )}
          {(displaySuggestion || suggestionLoading) && customer && (
            <div className="flex-shrink-0 px-3 py-2" style={{ background: 'rgba(127,184,151,0.06)', borderBottom: '1px solid rgba(127,184,151,0.12)' }}>
              {suggestionLoading ? (
                <p className="text-[11px]" style={{ color: 'rgba(127,184,151,0.5)' }}>Aria is preparing a suggestion…</p>
              ) : displaySuggestion ? (
                <div>
                  <p className="text-[10px] font-semibold mb-1.5" style={{ color: '#7FB897', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Aria suggestion</p>
                  <p className="text-xs mb-2" style={{ color: '#e8ede7' }}>{displaySuggestion.offer_text} ({displaySuggestion.discount_pct}% off)</p>
                  <div className="flex gap-2">
                    <button onClick={() => { fetch('/api/pos/display-suggestions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: displaySuggestion.id, decision: 'approved' }) }).catch(() => {}); if (typeof BroadcastChannel !== 'undefined') { const bc = new BroadcastChannel('aria-pos-display'); bc.postMessage({ type: 'display_suggestion', offer_text: displaySuggestion.offer_text, discount_pct: displaySuggestion.discount_pct, customer_name: customer ? customer.name : '' }); bc.close(); } setDisplaySuggestion(null); }} className="text-[11px] px-2.5 py-1 rounded-lg font-semibold" style={{ background: 'rgba(127,184,151,0.2)', border: '1px solid rgba(127,184,151,0.4)', color: '#7FB897', cursor: 'pointer', fontFamily: 'inherit' }}>Show on display</button>
                    <button onClick={() => { fetch('/api/pos/display-suggestions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: displaySuggestion.id, decision: 'rejected' }) }).catch(() => {}); setDisplaySuggestion(null); }} className="text-[11px] px-2.5 py-1 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontFamily: 'inherit', background: 'none' }}>Skip</button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {loyaltyCustomer && (
            <div className="rounded-[10px] px-2.5 py-1.5 text-xs flex items-center gap-1.5 font-semibold" style={{ background: 'var(--violet-dim)', border: '1px solid rgba(0,106,255,0.10)', color: 'var(--violet)' }}>
              ⭐ {customer!.name} has {customer!.loyalty_points} loyalty points
            </div>
          )}
          {lowStockItems.slice(0, 2).map(p => (
            <div key={p.id} className="rounded-[10px] px-2.5 py-1.5 text-xs flex items-center gap-1.5 font-semibold" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', color: '#F59E0B' }}>
              ⚠️ {p.name} at {p.stock_quantity} units
            </div>
          ))}
        </div>

        {/* Product suggestions */}
        {(suggestions.length > 0 || suggestionsLoading) && (
          <div className="flex-shrink-0 px-3 pb-2">
            <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Often bought together</p>
            {suggestionsLoading ? (
              <div className="h-6 rounded animate-pulse w-2/3" style={{ background: 'var(--bg-ghost)' }} />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map(s => {
                  const prod = products.find(p => p.id === s.id);
                  return (
                    <button key={s.id}
                      onClick={() => prod && checkAndAddToCart(prod)}
                      disabled={!prod}
                      className="text-xs rounded-lg px-2.5 py-1.5 disabled:opacity-40 transition-all"
                      style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.border = '1px solid rgba(0,106,255,0.18)'; el.style.background = 'rgba(139,92,246,0.06)'; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.border = '1px solid var(--border-default)'; el.style.background = 'var(--bg-elevated)'; }}>
                      {s.name} <span style={{ color: 'var(--violet)', fontFamily: "'JetBrains Mono',monospace" }}>+A${s.price?.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Aria chat */}
        <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2 min-h-0">
          {chatMessages.length === 0 && (
            <p className="text-xs text-center pt-4 px-2" style={{ color: 'var(--text-tertiary)' }}>
              Ask about products, GST, stock levels, or today's sales.
            </p>
          )}
          {chatMessages.slice(-6).map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[90%] rounded-[10px] px-3 py-2 text-xs leading-snug"
                  style={{ background: 'var(--violet-dim)', border: '1px solid rgba(0,106,255,0.12)', color: 'var(--text-primary)' }}>
                  {m.content}
                </div>
              </div>
            ) : m.structured && (m.structured.cards?.length || m.structured.data_tables?.length || m.structured.chart || m.structured.actions?.length) ? (
              <div key={i} className="flex justify-start">
                <div className="max-w-[98%] rounded-[10px] px-3 py-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <AriaChatMessage response={m.structured} onAction={handleAriaAction} />
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] rounded-[10px] px-3 py-2 text-xs leading-snug"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {m.content}
                </div>
              </div>
            )
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="rounded-[10px] px-3 py-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <AriaChatMessage response={{ message: '', cards: [] }} isLoading={true} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Ask Aria input */}
        <div className="flex-shrink-0 px-3 pb-2">
          <div className="flex gap-1.5 items-center rounded-[10px] px-3 py-2.5" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)' }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAriaChat(); } }}
              placeholder="Ask Aria…"
              className="flex-1 text-xs bg-transparent outline-none"
              style={{ color: 'var(--text-primary)' }} />
            <button onClick={sendAriaChat} disabled={!chatInput.trim() || chatLoading}
              className="w-7 h-7 rounded-lg text-xs disabled:opacity-40 flex items-center justify-center flex-shrink-0 text-white"
              style={{ background: 'var(--violet)' }}>↑</button>
          </div>
        </div>

        {/* Log missed sale */}
        <div className="flex-shrink-0 px-3 pb-2">
          <button onClick={() => setShowMissedModal(true)}
            className="w-full rounded-[10px] py-2 text-xs transition-all"
            style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-tertiary)' }}>
            Log missed sale
          </button>
        </div>

        {/* Parked sales */}
        {parkedSales.length > 0 && (
          <div className="flex-shrink-0 px-3 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Held sales ({parkedSales.length})</p>
            <div className="space-y-1">
              {parkedSales.slice(0, 3).map(p => (
                <button key={p.id} onClick={() => restoreParked(p)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{p.label || 'Sale'} · {Array.isArray(p.items) ? p.items.length : 0} items</span>
                  <span className="text-xs font-medium flex-shrink-0 ml-2" style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-primary)' }}>A${(p.total || 0).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent sales */}
        <div className="flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="px-4 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Recent sales</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 min-h-0" style={{ maxHeight: '140px' }}>
          {recentSales.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>No sales yet this session</p>
          ) : (
            <div>
              {recentSales.map(s => (
                <div key={s.id} className="py-2 group flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      <span>#{s.id.slice(-6).toUpperCase()}</span>
                      <span>{s.time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.items} item{s.items !== 1 ? 's' : ''}</span>
                      <span className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-primary)' }}>A${s.total.toFixed(2)}</span>
                    </div>
                  </div>
                  <button onClick={() => setReprintSale(s)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-base"
                    title="Reprint receipt">
                    🖨️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── FLOATING ASK ARIA BUTTON — removed in v4 (replaced by inline cart card) */}

      {/* Mobile bottom tab bar */}
      <div className="sm:hidden flex-shrink-0 h-16 grid grid-cols-3" style={{ background: 'var(--bg-base)', borderTop: '1px solid var(--border-subtle)' }}>
        {([
          { tab: 'products' as const, label: 'Products', icon: '🛍️' },
          { tab: 'cart' as const, label: `Cart${cart.length > 0 ? ` (${cart.reduce((s,i)=>s+i.qty,0)})` : ''}`, icon: '🛒' },
          { tab: 'aria' as const, label: 'Aria', icon: '✦' },
        ]).map(t => (
          <button key={t.tab} onClick={() => setMobileTab(t.tab)}
            className="flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors"
            style={{ color: mobileTab === t.tab ? 'var(--violet)' : 'var(--text-tertiary)' }}>
            <span className="text-lg">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════ */}

      {/* Variant / Modifier modal */}
      {variantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{variantModal.product.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Base A${variantModal.product.price.toFixed(2)} — select options below
              </p>
            </div>
            <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {variantModal.variantGroups.map(g => (
                <div key={g.id}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{g.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {(g.values as string[]).map(v => {
                      const priceNote = g.affects_price && g.price_map[v] != null ? ` · A$${g.price_map[v].toFixed(2)}` : '';
                      return (
                        <button key={v} onClick={() => setSelectedVariants(p => ({ ...p, [g.id]: v }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            selectedVariants[g.id] === v ? '' : ''} style={selectedVariants[g.id] === v ? { background: 'var(--violet)', border: '1px solid rgba(139,92,246,0.6)', color: '#fff' } : { background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }
                          }`}>
                          {v}{priceNote}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {variantModal.modifiers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Extras</p>
                  <div className="space-y-2">
                    {variantModal.modifiers.map(m => (
                      <label key={m.id} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={!!selectedMods[m.id]}
                          onChange={e => setSelectedMods(p => ({ ...p, [m.id]: e.target.checked }))}
                          className="w-4 h-4 accent-gray-900" />
                        <span className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                        {m.price_adjustment !== 0 && (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono',monospace" }}>
                            {m.price_adjustment > 0 ? '+' : ''}A${m.price_adjustment.toFixed(2)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Quantity</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setVariantQty(q => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>−</button>
                  <span className="text-base font-bold w-6 text-center" style={{ color: 'var(--text-primary)' }}>{variantQty}</span>
                  <button onClick={() => setVariantQty(q => q + 1)}
                    className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>+</button>
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => setVariantModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>Cancel</button>
              <button onClick={confirmVariantSelection}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: 'var(--violet)' }}>
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Register modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Open Register</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Enter opening float to start trading.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">Opening float (A$)</label>
                <input type="number" min="0" step="0.01" value={openingFloat}
                  onChange={e => setOpeningFloat(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-lg font-bold outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-primary)' }} autoFocus />
              </div>
              {registerError && <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--destructive)', background: 'var(--destructive-bg)', border: '1px solid rgba(255,22,0,0.10)' }}>{registerError}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => { setShowRegisterModal(false); setRegisterError(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>Cancel</button>
              <button onClick={openRegister} disabled={openingRegister}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--violet)' }}>
                {openingRegister ? <><Spinner /> Opening…</> : 'Open Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Register modal */}
      {showCloseModal && registerSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Close Register</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Opened {new Date(registerSession.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} · Float A${(registerSession.opening_float || 0).toFixed(2)}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">Closing float counted (A$)</label>
                <input type="number" min="0" step="0.01" value={closingFloat}
                  onChange={e => setClosingFloat(e.target.value)} placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-lg font-bold font-mono text-gray-900 outline-none focus:ring-2 focus:ring-red-500" autoFocus />
              </div>
              {registerError && <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--destructive)', background: 'var(--destructive-bg)', border: '1px solid rgba(255,22,0,0.10)' }}>{registerError}</p>}
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => { setShowCloseModal(false); setRegisterError(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>Cancel</button>
              <button onClick={closeRegister} disabled={closingRegister}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--destructive)' }}>
                {closingRegister ? <><Spinner /> Closing…</> : 'Close Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parked sales drawer */}
      {showParked && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 md:items-center" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Parked Sales</h2>
              <button onClick={() => setShowParked(false)} className="text-xl leading-none" style={{ color: 'var(--text-tertiary)' }}>×</button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {parkedSales.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No parked sales. Press F8 to park.</p>
              ) : parkedSales.map(p => (
                <button key={p.id} onClick={() => restoreParked(p)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl transition-all text-left" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.label || 'Parked Sale'}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {Array.isArray(p.items) ? p.items.length : 0} items · {new Date(p.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-primary)' }}>A${(p.total || 0).toFixed(2)}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--violet)' }}>Restore →</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Layby modal — additive */}
      {showLaybyModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg-ghost)' }}>
          <div style={{ background: 'var(--bg-ghost)', border: '1px solid rgba(0,106,255,0.18)', borderRadius: 20, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Save as Layby</div>
                {customer && <div style={{ fontSize: 12, color: 'var(--violet)', marginTop: 2 }}>{customer.name}</div>}
                {!customer && <div style={{ fontSize: 12, color: '#F87171', marginTop: 2 }}>⚠ No customer selected</div>}
              </div>
              <button onClick={() => setShowLaybyModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
                <span>Cart total</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--text-primary)' }}>A${total.toFixed(2)}</span>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Deposit (default 20% = A${(total * 0.2).toFixed(2)})
                </label>
                <input type="number" value={laybyDeposit} onChange={e => setLaybyDeposit(e.target.value)}
                  placeholder={`${(total * 0.2).toFixed(2)}`}
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 9, padding: '10px 13px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Due date (default +30 days)
                </label>
                <input type="date" value={laybyDueDate} onChange={e => setLaybyDueDate(e.target.value)}
                  defaultValue={new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]}
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 9, padding: '10px 13px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes (optional)</label>
                <input type="text" value={laybyNotes} onChange={e => setLaybyNotes(e.target.value)}
                  placeholder="Customer notes…"
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 9, padding: '10px 13px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10 }}>
              <button onClick={() => setShowLaybyModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={saveLayby} disabled={laybyLoading || !customer}
                style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: customer ? 'var(--violet)' : 'var(--bg-elevated)', color: customer ? '#fff' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: (laybyLoading || !customer) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {laybyLoading ? 'Saving…' : '🛍️ Save Layby'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Missed sale modal */}
      {showMissedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Log Missed Sale</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Record what a customer asked for that you didn't stock</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <input value={missedName} onChange={e => setMissedName(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                placeholder="Product name e.g. Oat Milk 1L" autoFocus />
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Qty wanted</label>
                <input type="number" min="1" value={missedQty} onChange={e => setMissedQty(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
              </div>
              <input value={missedNote} onChange={e => setMissedNote(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                placeholder="Customer note (optional)" />
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => { setShowMissedModal(false); setMissedName(''); setMissedQty('1'); setMissedNote(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>Cancel</button>
              <button disabled={savingMissed || !missedName.trim()}
                onClick={async () => {
                  if (!businessId || !missedName.trim()) return;
                  setSavingMissed(true);
                  try {
                    await fetch('/api/pos/missed-demand', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ business_id: businessId, product_name: missedName.trim(),
                        estimated_quantity_wanted: parseInt(missedQty) || 1, customer_note: missedNote || undefined, logged_by: 'pos_terminal' }),
                    });
                    setShowMissedModal(false);
                    setMissedName(''); setMissedQty('1'); setMissedNote('');
                  } finally { setSavingMissed(false); }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ background: '#F59E0B', color: 'var(--bg-base)' }}>
                {savingMissed ? 'Saving…' : 'Log it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom item / Note modal */}
      {showCustomItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {customItemForm.isNote ? 'Add Note to Cart' : 'Custom Item'}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {customItemForm.isNote ? 'Non-priced note — appears on receipt' : 'One-time item, not saved to products'}
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>{customItemForm.isNote ? 'Note text' : 'Description'}</label>
                <input value={customItemForm.desc} onChange={e => setCustomItemForm(f => ({ ...f, desc: e.target.value }))}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  placeholder={customItemForm.isNote ? 'e.g. Gift wrap requested' : 'e.g. Custom engraving'} autoFocus />
              </div>
              {!customItemForm.isNote && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Price (A$)</label>
                      <input type="number" min="0" step="0.01" value={customItemForm.price}
                        onChange={e => setCustomItemForm(f => ({ ...f, price: e.target.value }))}
                        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                    </div>
                    <div className="w-20">
                      <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Qty</label>
                      <input type="number" min="1" value={customItemForm.qty}
                        onChange={e => setCustomItemForm(f => ({ ...f, qty: e.target.value }))}
                        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={customItemForm.taxable}
                      onChange={e => setCustomItemForm(f => ({ ...f, taxable: e.target.checked }))}
                      className="w-4 h-4 accent-gray-900" />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>GST inclusive (10%)</span>
                  </label>
                </>
              )}
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => { setShowCustomItem(false); setCustomItemForm({ desc: '', price: '', qty: '1', taxable: true, isNote: false }); }}
                className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>Cancel</button>
              <button onClick={addCustomItemToCart}
                disabled={!customItemForm.desc.trim() || (!customItemForm.isNote && !customItemForm.price)}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--violet)' }}>
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price check overlay */}
      {priceCheckProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-xs overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-4 text-center" style={{ background: 'var(--violet-dim)', borderBottom: '1px solid rgba(0,106,255,0.10)' }}>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--violet)' }}>Price Check</p>
              <h2 className="text-lg font-bold text-gray-900">{priceCheckProd.name}</h2>
              {priceCheckProd.pos_categories && <p className="text-sm text-gray-500">{priceCheckProd.pos_categories.name}</p>}
            </div>
            <div className="px-6 py-5 text-center">
              <p className="text-4xl font-bold mb-1" style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-primary)' }}>A${priceCheckProd.price.toFixed(2)}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Includes GST: A${(priceCheckProd.price - priceCheckProd.price / 1.1).toFixed(2)}</p>
              {priceCheckProd.track_stock && (
                <p className="mt-3 text-sm font-medium" style={{ color: priceCheckProd.stock_quantity <= 0 ? 'var(--destructive)' : priceCheckProd.stock_quantity <= priceCheckProd.low_stock_threshold ? '#F59E0B' : 'var(--success)' }}>
                  {priceCheckProd.stock_quantity <= 0 ? 'Out of stock' : `${priceCheckProd.stock_quantity} in stock`}
                </p>
              )}
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => setPriceCheckProd(null)}
                className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>Close</button>
              <button onClick={() => { checkAndAddToCart(priceCheckProd); setPriceCheckProd(null); setPriceCheckMode(false); }}
                disabled={priceCheckProd.track_stock && priceCheckProd.stock_quantity <= 0}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--violet)' }}>
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Bill modal */}
      {showSplitModal && (
        <SplitModal
          saleId={splitSaleId ?? ''}
          saleTotal={total}
          saleTax={+((total / 11)).toFixed(2)}
          cartItems={cart.map(i => ({ id: i.product.id, product_name: i.product.name, quantity: i.qty, unit_price: i.product.price, line_total: i.product.price * i.qty }))}
          onSaved={() => { setShowSplitModal(false); setCart([]); }}
          onClose={() => setShowSplitModal(false)}
        />
      )}

      {/* ── Weight entry modal ─────────────────────────────────────── */}
      {weightModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg-ghost)' }}>
          <div style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '28px 28px 24px', width: '100%', maxWidth: 360, boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                ⚖️ Enter weight
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {weightModal.product.name} — ${weightModal.product.price_per_kg?.toFixed(2)}/kg
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 16px' }}>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0.000"
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const kg = parseFloat(weightInput)
                      if (!kg || kg <= 0) return
                      const pricePerKg = weightModal.product.price_per_kg ?? 0
                      const totalPrice = Math.round(kg * pricePerKg * 100) / 100
                      const label = `${weightModal.product.name} · ${kg.toFixed(3)}kg`
                      addToCartDirect({ ...weightModal.product, price: totalPrice }, 1, undefined, label)
                      setWeightModal(null)
                      setWeightInput('')
                    }
                    if (e.key === 'Escape') { setWeightModal(null); setWeightInput('') }
                  }}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono',monospace" }}
                />
                <span style={{ fontSize: 16, color: 'var(--text-secondary)', fontWeight: 600 }}>kg</span>
              </div>
              {weightInput && parseFloat(weightInput) > 0 && weightModal.product.price_per_kg && (
                <div style={{ marginTop: 10, fontSize: 15, fontWeight: 700, color: 'var(--success)', textAlign: 'center' }}>
                  = ${(parseFloat(weightInput) * weightModal.product.price_per_kg).toFixed(2)}
                </div>
              )}
            </div>
            {/* Numpad for quick entry */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k => (
                <button key={k} onClick={() => {
                  if (k === '⌫') { setWeightInput(w => w.slice(0, -1)) }
                  else if (k === '.' && weightInput.includes('.')) return
                  else setWeightInput(w => w + k)
                }}
                style={{ padding: '14px 0', borderRadius: 10, border: '1px solid var(--border-default)', background: k === '⌫' ? 'var(--destructive-bg)' : 'var(--bg-base)', color: k === '⌫' ? 'var(--destructive)' : 'var(--text-primary)', fontSize: 18, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {k}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setWeightModal(null); setWeightInput('') }}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={() => {
                const kg = parseFloat(weightInput)
                if (!kg || kg <= 0) return
                const pricePerKg = weightModal.product.price_per_kg ?? 0
                const totalPrice = Math.round(kg * pricePerKg * 100) / 100
                const label = `${weightModal.product.name} · ${kg.toFixed(3)}kg`
                addToCartDirect({ ...weightModal.product, price: totalPrice }, 1, undefined, label)
                setWeightModal(null)
                setWeightInput('')
              }}
              disabled={!weightInput || parseFloat(weightInput) <= 0}
              style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--gradient-aria)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!weightInput || parseFloat(weightInput) <= 0) ? 0.4 : 1 }}>
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pharmacist consultation prompt (pharmacy) ────────────────── */}
      {pharmPrompt && (
        <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(8,6,16,0.92)' }}>
          <div style={{ background:'var(--bg-elevated)', border:'1px solid rgba(255,22,0,0.18)', borderRadius:20, padding:'28px 28px 24px', width:'100%', maxWidth:400, boxShadow:'0 24px 48px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize:24, textAlign:'center', marginBottom:12 }}>💊</div>
            <div style={{ fontSize:17, fontWeight:800, color:'var(--text-primary)', marginBottom:8, textAlign:'center' }}>
              Pharmacist consultation required
            </div>
            <div style={{ background:'var(--destructive-bg)', border:'1px solid rgba(255,22,0,0.12)', borderRadius:10, padding:'12px 16px', marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--destructive)', marginBottom:4 }}>
                {pharmPrompt.product.schedule_level} — {pharmPrompt.product.name}
              </div>
              <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
                {pharmPrompt.product.requires_script
                  ? 'This item requires a valid prescription. Verify script before proceeding.'
                  : 'This is a Schedule drug. A pharmacist must counsel the customer before dispensing.'}
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}>
                <input type="checkbox" checked={pharmConfirmed} onChange={e=>setPharmConfirmed(e.target.checked)}
                  style={{ marginTop:2, flexShrink:0 }} />
                <span style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.5 }}>
                  I confirm a pharmacist has {pharmPrompt.product.requires_script ? 'verified the prescription and ' : ''}counselled the customer about this medication.
                </span>
              </label>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setPharmPrompt(null); setPharmConfirmed(false) }}
                style={{ flex:1, padding:'11px 0', borderRadius:10, border:'1px solid var(--border-default)', background:'transparent', color:'var(--text-secondary)', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Cancel
              </button>
              <button disabled={!pharmConfirmed} onClick={() => {
                  addToCartDirect(pharmPrompt.product, 1);
                  setPharmPrompt(null); setPharmConfirmed(false);
                }}
                style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', background:pharmConfirmed?'var(--destructive)':'rgba(255,22,0,0.12)', color:'#fff', fontSize:14, fontWeight:700, cursor:pharmConfirmed?'pointer':'not-allowed', fontFamily:'inherit', opacity:pharmConfirmed?1:0.5 }}>
                Confirm & add to sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Serial number / IMEI prompt ──────────────────────────────── */}
      {serialPrompt && (
        <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'var(--bg-elevated)' }}>
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:20, padding:'28px 28px 24px', width:'100%', maxWidth:360, boxShadow:'0 24px 48px rgba(0,0,0,0.6)' }}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>🔢 Serial / IMEI</div>
              <div style={{ fontSize:13, color:'var(--text-secondary)' }}>{serialPrompt.product.name}</div>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Scan barcode or type serial number"
              value={serialInput}
              onChange={e => setSerialInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && serialInput.trim()) {
                  addToCartDirect({ ...serialPrompt.product }, 1, undefined, `${serialPrompt.product.name} · S/N: ${serialInput.trim()}`);
                  setSerialPrompt(null); setSerialInput('');
                }
                if (e.key === 'Escape') { setSerialPrompt(null); setSerialInput(''); }
              }}
              style={{ width:'100%', padding:'12px 16px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--bg-base)', color:'var(--text-primary)', fontSize:15, fontFamily:'inherit', outline:'none', boxSizing:'border-box', marginBottom:16 }}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setSerialPrompt(null); setSerialInput(''); }}
                style={{ flex:1, padding:'11px 0', borderRadius:10, border:'1px solid var(--border-default)', background:'transparent', color:'var(--text-secondary)', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={() => {
                addToCartDirect({ ...serialPrompt.product }, 1, undefined, serialInput.trim() ? `${serialPrompt.product.name} · S/N: ${serialInput.trim()}` : undefined);
                setSerialPrompt(null); setSerialInput('');
              }}
              style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', background:'var(--gradient-aria)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                {serialInput.trim() ? 'Add with serial' : 'Add without serial'}
              </button>
            </div>
            <p style={{ fontSize:11, color:'var(--text-tertiary)', textAlign:'center', marginTop:10 }}>
              Serial number is stored with the sale for warranty/returns tracking
            </p>
          </div>
        </div>
      )}

      {/* Refund modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-lg overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Process Refund</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Search by receipt number or customer name</p>
              </div>
              <button onClick={() => { setShowRefundModal(false); setRefundSale(null); setRefundSearch(''); setRefundResults([]); }}
                className="text-xl" style={{ color: 'var(--text-tertiary)' }}>×</button>
            </div>
            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {!refundSale ? (
                <>
                  <input value={refundSearch} onChange={e => { setRefundSearch(e.target.value); searchRefundSales(e.target.value); }}
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                    placeholder="Search receipt # or customer name…" autoFocus />
                  <div className="space-y-2">
                    {refundResults.map((sale: any) => (
                      <button key={sale.id} onClick={() => { setRefundSale(sale); setRefundItems({}); }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>#{sale.sale_number ?? sale.id?.slice(-6).toUpperCase()}</p>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{new Date(sale.created_at).toLocaleDateString('en-AU')} · {sale.customer_name ?? 'Walk-in'}</p>
                        </div>
                        <span className="font-mono font-semibold text-sm text-gray-900">A${(sale.total_amount ?? 0).toFixed(2)}</span>
                      </button>
                    ))}
                    {refundSearch.length >= 2 && refundResults.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">No sales found</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">#{refundSale.sale_number ?? refundSale.id?.slice(-6).toUpperCase()}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{new Date(refundSale.created_at).toLocaleDateString('en-AU')} · A${(refundSale.total_amount ?? 0).toFixed(2)}</p>
                    </div>
                    <button onClick={() => setRefundSale(null)} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Select items to refund:</p>
                  <div className="space-y-1.5">
                    {(refundSale.items ?? []).map((item: any) => (
                      <label key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)' }}>
                        <input type="checkbox" checked={!!refundItems[item.id]}
                          onChange={e => setRefundItems(r => ({ ...r, [item.id]: e.target.checked }))}
                          className="w-4 h-4 accent-gray-900" />
                        <div className="flex-1">
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.product_name ?? item.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>qty {item.quantity} × A${(item.unit_price ?? 0).toFixed(2)}</p>
                        </div>
                        <span className="font-mono text-sm text-gray-900">A${(item.line_total ?? 0).toFixed(2)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="pt-2">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Refund total: A${(refundSale.items ?? []).filter((i: any) => refundItems[i.id]).reduce((s: number, i: any) => s + (i.line_total ?? 0), 0).toFixed(2)}
                    </p>
                  </div>
                </>
              )}
            </div>
            {refundSale && (
              <div className="px-6 pb-5 flex gap-2">
                <button onClick={() => { setShowRefundModal(false); setRefundSale(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>Cancel</button>
                <button onClick={processRefund} disabled={processingRefund || Object.values(refundItems).every(v => !v)}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'var(--destructive)' }}>
                  {processingRefund ? <><Spinner /> Processing…</> : 'Process Refund'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cashier switch modal */}
      {showCashierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Switch Cashier</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Current: {registerSession?.opened_by ?? 'Unknown'}</p>
            </div>
            <div className="px-6 py-5">
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>New cashier name</label>
              <input value={cashierName} onChange={e => setCashierName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') switchCashier(); }}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                placeholder="Enter name…" autoFocus />
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => { setShowCashierModal(false); setCashierName(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>Cancel</button>
              <button onClick={switchCashier} disabled={!cashierName.trim() || switchingCashier}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'var(--violet)' }}>
                {switchingCashier ? <><Spinner /> Switching…</> : 'Switch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt reprint modal */}
      {reprintSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--bg-ghost)' }}>
          <div className="rounded-2xl w-full max-w-xs overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'var(--success-bg)', borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
              <p className="font-semibold text-gray-900 text-sm">#{reprintSale.id.slice(-6).toUpperCase()}</p>
              <button onClick={() => setReprintSale(null)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="px-5 py-4 font-mono text-xs space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex justify-between"><span className="text-gray-400">Time</span><span>{reprintSale.time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Items</span><span>{reprintSale.items}</span></div>
              <div className="flex justify-between font-bold text-sm text-gray-900 mt-2"><span>TOTAL</span><span>A${reprintSale.total.toFixed(2)}</span></div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setReprintSale(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500">Close</button>
              <button onClick={() => window.print()} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>🖨️ Print</button>
            </div>
          </div>
        </div>
      )}

      {/* Product context menu */}
      {contextMenu && (
        <div className="fixed z-50" style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}>
          <div className="rounded-xl py-1 min-w-44" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 12px 32px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>
            {[
              { label: 'View price & stock', action: () => { setPriceCheckProd(contextMenu.product); setContextMenu(null); } },
              { label: 'Edit price', action: async () => {
                const newPrice = prompt(`New price for ${contextMenu.product.name}:`, contextMenu.product.price.toFixed(2));
                if (newPrice && !isNaN(parseFloat(newPrice))) {
                  await fetch('/api/pos/products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: contextMenu.product.id, price: parseFloat(newPrice) }) });
                  setProducts(ps => ps.map(p => p.id === contextMenu.product.id ? { ...p, price: parseFloat(newPrice!) } : p));
                }
                setContextMenu(null);
              }},
              { label: 'Reorder product', action: () => { window.location.href = `/pos/orders?product=${contextMenu.product.id}`; setContextMenu(null); } },
              { label: 'View in products', action: () => { window.location.href = `/pos/products?q=${encodeURIComponent(contextMenu.product.name)}`; setContextMenu(null); } },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                className="block w-full text-left px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--text-secondary)' }} onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='var(--bg-elevated)';}} onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='';}}>
                {item.label}
              </button>
            ))}
            <div className="my-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />
            <button onClick={() => setContextMenu(null)} className="block w-full text-left px-4 py-2.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Age verification modal */}
      {showAgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(8,6,16,0.92)' }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-6 py-5" style={{ background: 'var(--destructive-bg)', borderBottom: '1px solid rgba(255,22,0,0.10)' }}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">🔞</span>
                <div>
                  <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Age verification required</h2>
                  <p className="text-xs text-red-600 mt-0.5">This sale contains age-restricted items</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                You must verify the customer is <span className="font-semibold">18 years or older</span> before completing this sale.
              </p>
              <p className="text-xs text-gray-400 mt-2">Check photo ID (driver's licence, passport, or Proof of Age card).</p>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => setShowAgeModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>
                Cancel sale
              </button>
              <button
                onClick={() => { setAgeVerified(true); setShowAgeModal(false); processSale(); }}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: 'var(--violet)' }}>
                ✓ ID verified — complete sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant loading overlay */}
      {variantLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(8,6,16,0.5)' }}>
          <div className="rounded-xl px-6 py-4 flex items-center gap-3" style={{ background: 'var(--bg-ghost)', border: '1px solid var(--border-default)' }}>
            <Spinner /><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading options…</span>
          </div>
        </div>
      )}

      {/* Sprint H — ModifierPickerModal */}
      {modifierPicker && (
        <ModifierPickerModal
          productId={modifierPicker.product.id}
          productName={modifierPicker.product.name}
          basePrice={Number(modifierPicker.product.price) || 0}
          onCancel={() => setModifierPicker(null)}
          onConfirm={(selections, unitPrice, notes) => {
            setCart(c => [...c, {
              product: modifierPicker.product,
              qty: 1,
              unitPrice,
              modifierDetails: selections.map(s => ({ id: s.modifier_id, name: s.name, price_adjustment: s.price_adjustment, modifier_group: null })),
              label: selections.length > 0 ? `${modifierPicker.product.name} · ${selections.map(s => s.name).join(', ')}` : undefined,
            } as CartItem & { item_notes?: string; h_modifiers?: typeof selections }]);
            setModifierPicker(null);
          }}
        />
      )}

      {/* Sprint H — PriceOverrideModal */}
      {priceOverride && (
        <PriceOverrideModal
          productName={priceOverride.line.label ?? priceOverride.line.product.name}
          originalPrice={Number((priceOverride.line as unknown as Record<string, unknown>).original_unit_price ?? priceOverride.line.unitPrice) || 0}
          currentPrice={Number(priceOverride.line.unitPrice) || 0}
          canOverride={canOverridePrice}
          onCancel={() => setPriceOverride(null)}
          onConfirm={async (newPrice, reason) => {
            const idx = priceOverride.index;
            setCart(c => c.map((l, i) => i === idx ? {
              ...l,
              unitPrice: newPrice,
            } : l));
            fetch('/api/pos/cart-line-actions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                product_id: priceOverride.line.product.id,
                product_name: priceOverride.line.label ?? priceOverride.line.product.name,
                original_unit_price: Number((priceOverride.line as unknown as Record<string, unknown>).original_unit_price ?? priceOverride.line.unitPrice) || 0,
                new_unit_price: newPrice,
                reason,
              }),
            }).catch(() => {});
            setPriceOverride(null);
          }}
        />
      )}

      {/* Sprint H — Edit notes inline prompt */}
      {editNotesState && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditNotesState(null)}>
          <div className="bg-[#0e1612] border border-[rgba(0,106,255,0.10)] rounded-2xl p-6 w-full max-w-sm text-[#E8EDE8]" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-3">Special instructions</h2>
            <textarea
              autoFocus
              rows={3}
              defaultValue={String((editNotesState.line as unknown as Record<string, unknown>).item_notes ?? '')}
              onKeyDown={e => {
                if (e.key === 'Enter' && e.metaKey) {
                  const val = (e.target as HTMLTextAreaElement).value;
                  const idx = editNotesState.index;
                  setCart(c => c.map((l, i) => i === idx ? { ...l } : l));
                  setEditNotesState(null);
                  void val;
                }
              }}
              placeholder="No onions, well done, allergy note…"
              className="w-full bg-[var(--bg-surface)] border border-[rgba(0,106,255,0.12)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8] placeholder:text-[rgba(232,237,232,0.3)]"
            />
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => setEditNotesState(null)} className="px-4 py-2 rounded-xl text-sm border border-[rgba(0,106,255,0.12)] text-[rgba(232,237,232,0.7)]">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Clock In/Out PIN modal — Sprint M */}
      {showClockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowClockModal(false); setClockPin(''); setClockResult(null); } }}>
          <div className="rounded-2xl p-6 w-full max-w-xs space-y-4" style={{ background: '#1a2420', border: '1px solid rgba(127,184,151,0.3)' }}>
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-white text-base">Clock {clockMode === 'in' ? 'In' : 'Out'}</h3>
              <button onClick={() => { setShowClockModal(false); setClockPin(''); setClockResult(null); }} className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>✕</button>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Enter your staff PIN</p>
            <input
              type="password" inputMode="numeric" maxLength={8}
              value={clockPin} onChange={e => setClockPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') submitClock(); }}
              placeholder="••••" autoFocus
              className="w-full px-4 py-3 rounded-xl text-center text-2xl font-mono outline-none tracking-widest"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
            />
            {clockResult && (
              <div className="text-sm text-center rounded-xl px-4 py-2.5"
                style={{ background: clockResult.toLowerCase().includes('error') || clockResult.toLowerCase().includes('invalid') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: clockResult.toLowerCase().includes('error') || clockResult.toLowerCase().includes('invalid') ? '#fca5a5' : '#86efac' }}>
                {clockResult}
              </div>
            )}
            <button onClick={submitClock} disabled={!clockPin || clockLoading}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: clockMode === 'in' ? '#2D5240' : 'rgba(239,68,68,0.4)' }}>
              {clockLoading ? 'Processing…' : `Clock ${clockMode === 'in' ? 'In' : 'Out'}`}
            </button>
          </div>
        </div>
      )}

      {/* Simple price variant picker */}
      {simplePriceModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{simplePriceModal.product.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Select a size or price</p>
            </div>
            <div className="px-5 py-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
              {simplePriceModal.variants.map(v => (
                <button key={v.id} onClick={() => addVariantToCart(simplePriceModal.product, v)}
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <span>{v.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-secondary)' }}>
                    {v.price != null ? `A$${Number(v.price).toFixed(2)}` : `A$${Number(simplePriceModal.product.price).toFixed(2)}`}
                  </span>
                </button>
              ))}
            </div>
            <div className="px-5 pb-4 pt-2">
              <button onClick={() => setSimplePriceModal(null)}
                className="w-full py-2.5 rounded-xl text-sm" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-input)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ask Aria FAB — bottom-right corner */}
      <Link href="/pos/ask" className="ask-aria-fab" aria-label="Ask Aria">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
        </svg>
      </Link>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */
function Spinner() {
  return <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="rgba(139,133,168,0.4)" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function BagOutlineIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="rgba(74,69,101,0.4)" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>;
}



