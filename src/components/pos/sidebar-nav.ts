import type { LucideIcon } from 'lucide-react'
import {
  ShoppingCart, Monitor, ClipboardList, Tag,
  Home, DollarSign, Power, History,
  Package, FolderOpen, Truck, FileText, RefreshCw, Import, ArrowLeftRight,
  Users, CreditCard, Gift, Scale,
  Megaphone, Ticket, Heart,
  BarChart3, Sparkles, Layers, UserCheck, TrendingUp, BookOpen, Zap,
  Globe, TrendingDown,
  Bot, RotateCcw, DollarSign as DollarIcon, Calendar, Activity,
  Settings, Key, Receipt, Shield, Building, Barcode, Database, Store, Shirt,
  Banknote, Wrench,
  Clock, Smartphone, Timer, Scissors,
  ShoppingBag, CalendarClock, Plug,
  Calculator, CalendarOff, MapPin, ShieldCheck,
  Printer, ScrollText, ListOrdered, ChefHat, UtensilsCrossed,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string | number
  isHero?: boolean
  external?: boolean
  /** Industries this item is relevant for. If undefined, item shows for ALL industries. */
  industries?: Industry[]
}

export interface NavSection {
  id: string
  label: string
  icon?: LucideIcon
  items: NavItem[]
  defaultOpen?: boolean
  /** Industries this section is relevant for. If undefined, section shows for ALL industries. */
  industries?: Industry[]
}

/**
 * Supported business industries. Used to filter the POS nav so only
 * relevant features appear for each business type.
 */
export type Industry =
  | 'cafe'           // cafés, coffee shops
  | 'restaurant'     // full-service dining
  | 'bakery'         // bakeries, pastry shops
  | 'liquor'         // bottle shops, liquor retail
  | 'convenience'    // convenience stores, mini-marts
  | 'grocery'        // supermarkets, grocery
  | 'clothing'       // apparel, footwear, fashion
  | 'gift'           // gift, homewares, florists
  | 'pharmacy'       // chemists, pharmacies
  | 'electronics'    // phone shops, computer stores
  | 'beauty'         // salons, beauty, hair
  | 'other'          // generic retail


export const NAV_STRUCTURE: NavSection[] = [
  {
    id: 'sell',
    label: 'Sell',
    icon: ShoppingCart,
    defaultOpen: true,
    items: [
      { label: 'Terminal', href: '/pos/terminal', icon: ShoppingCart },
      { label: 'Customer Display', href: '/pos/display', icon: Monitor, external: true },
      { label: 'Laybys', href: '/pos/laybys', icon: ClipboardList, industries: ['liquor', 'clothing', 'gift', 'electronics', 'other'] },
      { label: 'Split Groups', href: '/pos/split-groups', icon: Scissors, industries: ['cafe', 'restaurant', 'bakery'] },
      { label: 'Returns', href: '/pos/returns', icon: RotateCcw },
      { label: 'Promotions', href: '/pos/promotions', icon: Tag },
      { label: 'Kitchen (Expo)', href: '/pos/kds/expo', icon: UtensilsCrossed, industries: ['cafe', 'restaurant', 'bakery'] },
    ],
  },
  {
    id: 'register',
    label: 'Register',
    icon: Home,
    defaultOpen: false,
    items: [
      { label: 'Open / Close', href: '/pos', icon: Home },
      { label: 'Manage Cash', href: '/pos/cash', icon: DollarSign },
      { label: 'Audit Log', href: '/pos/audit-log', icon: ClipboardList },
      { label: 'Close Register', href: '/pos/close', icon: Power },
      { label: 'Sales History', href: '/pos/sales-history', icon: ListOrdered },
      { label: 'End of Day', href: '/pos/end-of-day', icon: Calculator },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    defaultOpen: true,
    items: [
      { label: 'Products', href: '/pos/products', icon: Package },
      { label: 'Recipes & Costing', href: '/pos/recipes', icon: BookOpen, industries: ['cafe', 'restaurant', 'bakery'] },
      { label: 'Waste Log', href: '/pos/waste', icon: TrendingDown, industries: ['cafe', 'restaurant', 'bakery', 'grocery', 'convenience', 'pharmacy'] },
      { label: 'Classifications', href: '/pos/categories', icon: FolderOpen },
      { label: 'Suppliers', href: '/pos/suppliers', icon: Truck },
      { label: 'Purchase Orders', href: '/pos/orders', icon: ShoppingBag },
      { label: 'Reorder Schedule', href: '/pos/settings/reorder-schedule', icon: CalendarClock },
      { label: 'Stocktake', href: '/pos/stocktake', icon: ClipboardList },
      { label: 'New Stocktake', href: '/pos/inventory/stocktake/new', icon: RefreshCw },
      { label: 'Dead Stock', href: '/pos/inventory/dead-stock', icon: TrendingDown },
      { label: 'Expiry Tracking', href: '/pos/expiry', icon: CalendarOff, industries: ['bakery', 'pharmacy', 'convenience', 'grocery', 'cafe', 'restaurant'] },
      { label: 'Transfers', href: '/pos/transfers', icon: ArrowLeftRight },
      { label: 'Parcel Tracking', href: '/pos/parcel-tracking', icon: Truck },
      { label: 'Import Products', href: '/pos/import', icon: Import },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    defaultOpen: true,
    items: [
      { label: 'Customers', href: '/pos/customers', icon: Users },
      { label: 'Segments', href: '/pos/customers/segments', icon: Layers },
      { label: 'Customer Groups', href: '/pos/customer-groups', icon: Users },
      { label: 'Price Sets', href: '/pos/price-sets', icon: Tag },
      { label: 'Balances', href: '/pos/balances', icon: Scale },
      { label: 'Gift Cards', href: '/pos/gift-cards', icon: Gift },
      { label: 'Return Policies', href: '/pos/customers/return-policies', icon: RotateCcw },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    defaultOpen: false,
    items: [
      { label: 'Promotions', href: '/pos/promotions', icon: Tag },
      { label: 'New Promotion', href: '/pos/promotions/new', icon: Tag },
      { label: 'Promo Attribution', href: '/pos/promotions/attribution', icon: TrendingUp },
      { label: 'Shelf Tickets', href: '/pos/shelf-tickets', icon: Ticket, industries: ['liquor', 'convenience', 'grocery', 'clothing', 'gift', 'pharmacy', 'electronics', 'other'] },
      { label: 'Loyalty', href: '/pos/loyalty', icon: Heart },
    ],
  },
  {
    id: 'reporting',
    label: 'Reporting',
    icon: BarChart3,
    defaultOpen: true,
    items: [
      { label: 'Ask Aria', href: '/pos/ask', icon: Sparkles, isHero: true },
      { label: 'BAS export', href: '/pos/reports/bas', icon: FileText },
      { label: 'Sales Reports', href: '/pos/reports/sales', icon: BarChart3 },
      { label: 'Inventory', href: '/pos/reports/inventory', icon: Package },
      { label: 'Cashier', href: '/pos/reports/cashier', icon: UserCheck },
      { label: 'Commission', href: '/pos/reports/commission', icon: TrendingUp },
      { label: 'Closures', href: '/pos/reports/closures', icon: BookOpen },
      { label: 'Actions', href: '/pos/reports/actions', icon: Zap },
      { label: 'Advanced', href: '/pos/reports/advanced', icon: BarChart3 },
      { label: 'Competitor Prices', href: '/pos/competitors', icon: Globe },
    ],
  },
  {
    id: 'agents',
    label: 'AI Agents',
    icon: Bot,
    defaultOpen: true,
    items: [
      { label: 'Overview', href: '/pos/agents', icon: Bot },
      { label: 'Reorder', href: '/pos/agents/reorder', icon: RotateCcw },
      { label: 'Pricing', href: '/pos/agents/pricing', icon: DollarIcon },
      { label: 'Schedule', href: '/pos/agents/schedule', icon: Calendar },
      { label: 'Activity Log', href: '/pos/agents/activity', icon: Activity },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    icon: Settings,
    defaultOpen: true,
    items: [
      { label: 'General', href: '/pos/settings', icon: Settings },
      { label: 'Business Type', href: '/pos/settings/business-type', icon: Store },
      { label: 'Outlets & Registers', href: '/pos/outlets', icon: Building },
      { label: 'Sale Keys', href: '/pos/sale-keys', icon: Key, industries: ['cafe', 'restaurant', 'bakery'] },
      { label: 'Receipt Designer', href: '/pos/settings/receipts', icon: ScrollText },
      { label: 'Hardware Devices', href: '/pos/settings/hardware', icon: Printer },
      { label: 'Modifiers', href: '/pos/settings/modifiers', icon: Settings, industries: ['cafe', 'restaurant', 'bakery'] },
      { label: 'Kitchen Stations', href: '/pos/settings/kds-stations', icon: ChefHat, industries: ['cafe', 'restaurant', 'bakery'] },
      { label: 'Staff & Users', href: '/pos/settings/users', icon: Users },
      { label: 'Roles & Permissions', href: '/pos/settings/roles', icon: Shield },
      { label: 'Surcharging', href: '/pos/settings/surcharging', icon: CreditCard, industries: ['cafe', 'restaurant', 'bakery'] },
      { label: 'Registers & Outlets', href: '/pos/settings/registers', icon: Building },
      { label: 'Barcodes', href: '/pos/barcodes', icon: Barcode },
      { label: 'Price Sets', href: '/pos/price-sets', icon: Tag },
      { label: 'Integrations', href: '/pos/setup/integrations', icon: Plug },
      { label: 'Supplier Integrations', href: '/pos/setup/suppliers', icon: Truck },
      { label: 'Migrate Data', href: '/pos/setup/migrate', icon: Database },
      { label: 'Tax Codes', href: '/pos/settings/tax-codes', icon: Calculator },
      { label: 'Tax Holidays', href: '/pos/settings/tax-holidays', icon: CalendarOff },
      { label: 'Per-outlet tax', href: '/pos/settings/outlet-tax', icon: MapPin },
      { label: 'Custom roles', href: '/pos/settings/roles', icon: ShieldCheck },
      { label: 'Billing', href: '/pos/settings/billing', icon: Banknote },
    ],
  },
  {
    id: 'utilities',
    label: 'Utilities',
    icon: Wrench,
    defaultOpen: false,
    items: [
      { label: 'Future Prices', href: '/pos/future-prices', icon: Clock, industries: ['liquor', 'grocery', 'convenience', 'pharmacy'] },
      { label: 'EOD Markdown', href: '/pos/eod-markdown', icon: Tag, industries: ['bakery', 'grocery', 'convenience', 'cafe'] },
      { label: 'Production Plan', href: '/pos/production-plan', icon: ClipboardList, industries: ['bakery', 'cafe', 'restaurant'] },
      { label: 'Fitting Rooms', href: '/pos/fitting-room', icon: Shirt, industries: ['clothing', 'beauty'] },
      { label: 'Mobile Scanner', href: '/pos/mobile', icon: Smartphone, industries: ['liquor', 'convenience', 'grocery', 'clothing', 'gift', 'pharmacy', 'electronics', 'other'] },
      { label: 'Timesheets', href: '/pos/timesheets', icon: Timer },
      { label: 'Void & Refund', href: '/pos/void', icon: Scissors },
    ],
  },
]

export function findActiveSection(pathname: string): string | null {
  // Terminal is a direct match for 'sell'
  if (pathname === '/pos/terminal') return 'sell'

  for (const section of NAV_STRUCTURE) {
    for (const item of section.items) {
      if (item.external) continue
      if (pathname === item.href) return section.id
      if (item.href !== '/pos' && pathname.startsWith(item.href + '/')) return section.id
    }
  }
  return null
}

export function findActiveItem(pathname: string): NavItem | null {
  for (const section of NAV_STRUCTURE) {
    for (const item of section.items) {
      if (item.external) continue
      if (pathname === item.href) return item
      if (item.href !== '/pos' && pathname.startsWith(item.href + '/')) return item
    }
  }
  return null
}

/**
 * Filter NAV_STRUCTURE to only include sections/items relevant to a given industry.
 * If industry is null/undefined, returns the full nav (backward compatible).
 *
 * Rules:
 *   - Section with no `industries` field shows for everyone.
 *   - Section with `industries` field only shows if industry is in the list.
 *   - Same logic applies per-item inside each section.
 *   - A section becomes hidden if all its items are filtered out for this industry.
 */
export function filterNavByIndustry(
  industry: Industry | string | null | undefined,
): NavSection[] {
  if (!industry) return NAV_STRUCTURE
  const ind = industry as Industry
  return NAV_STRUCTURE
    .filter(section => !section.industries || section.industries.includes(ind))
    .map(section => ({
      ...section,
      items: section.items.filter(item => !item.industries || item.industries.includes(ind)),
    }))
    .filter(section => section.items.length > 0)
}

/**
 * Map raw business.industry values from the DB to the Industry type.
 * Handles legacy/freeform values like 'cafe_or_coffee_shop' → 'cafe'.
 */
export function normalizeIndustry(raw: string | null | undefined): Industry {
  if (!raw) return 'other'
  const s = raw.toLowerCase().trim()
  if (s.includes('cafe') || s.includes('coffee')) return 'cafe'
  if (s.includes('restaurant') || s.includes('dining')) return 'restaurant'
  if (s.includes('bakery') || s.includes('pastry')) return 'bakery'
  if (s.includes('liquor') || s.includes('bottle') || s.includes('alcohol')) return 'liquor'
  if (s.includes('convenience') || s.includes('mini')) return 'convenience'
  if (s.includes('grocery') || s.includes('supermarket')) return 'grocery'
  if (s.includes('clothing') || s.includes('apparel') || s.includes('fashion') || s.includes('footwear')) return 'clothing'
  if (s.includes('gift') || s.includes('homeware') || s.includes('florist')) return 'gift'
  if (s.includes('pharmacy') || s.includes('chemist')) return 'pharmacy'
  if (s.includes('electronic') || s.includes('phone') || s.includes('computer')) return 'electronics'
  if (s.includes('beauty') || s.includes('salon') || s.includes('hair')) return 'beauty'
  return 'other'
}
