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
  Settings, Key, Receipt, Shield, Building, Barcode, Database,
  Banknote, Wrench,
  Clock, Smartphone, Timer, Scissors,
  ShoppingBag, CalendarClock, Plug,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string | number
  isHero?: boolean
  external?: boolean
}

export interface NavSection {
  id: string
  label: string
  icon?: LucideIcon
  items: NavItem[]
  defaultOpen?: boolean
}

export const NAV_STRUCTURE: NavSection[] = [
  {
    id: 'sell',
    label: 'Sell',
    icon: ShoppingCart,
    defaultOpen: true,
    items: [
      { label: 'Terminal', href: '/pos/terminal', icon: ShoppingCart },
      { label: 'Customer Display', href: '/pos/display', icon: Monitor, external: true },
      { label: 'Laybys', href: '/pos/laybys', icon: ClipboardList },
      { label: 'Split Groups', href: '/pos/split-groups', icon: Scissors },
      { label: 'Promotions', href: '/pos/promotions', icon: Tag },
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
      { label: 'Sales History', href: '/pos/reports/sales', icon: History },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    defaultOpen: true,
    items: [
      { label: 'Products', href: '/pos/products', icon: Package },
      { label: 'Recipes & Costing', href: '/pos/recipes', icon: BookOpen },
      { label: 'Waste Log', href: '/pos/waste', icon: TrendingDown },
      { label: 'Classifications', href: '/pos/categories', icon: FolderOpen },
      { label: 'Suppliers', href: '/pos/suppliers', icon: Truck },
      { label: 'Purchase Orders', href: '/pos/orders', icon: ShoppingBag },
      { label: 'Reorder Schedule', href: '/pos/settings/reorder-schedule', icon: CalendarClock },
      { label: 'Stocktake', href: '/pos/stocktake', icon: ClipboardList },
      { label: 'New Stocktake', href: '/pos/inventory/stocktake/new', icon: RefreshCw },
      { label: 'Dead Stock', href: '/pos/inventory/dead-stock', icon: TrendingDown },
      { label: 'Transfers', href: '/pos/transfers', icon: ArrowLeftRight },
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
      { label: 'Shelf Tickets', href: '/pos/shelf-tickets', icon: Ticket },
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
    defaultOpen: false,
    items: [
      { label: 'General', href: '/pos/settings', icon: Settings },
      { label: 'Sale Keys', href: '/pos/sale-keys', icon: Key },
      { label: 'Receipt Templates', href: '/pos/receipt-templates', icon: Receipt },
      { label: 'Staff & Users', href: '/pos/settings/users', icon: Users },
      { label: 'Roles & Permissions', href: '/pos/settings/roles', icon: Shield },
      { label: 'Surcharging', href: '/pos/settings/surcharging', icon: CreditCard },
      { label: 'Registers & Outlets', href: '/pos/settings/registers', icon: Building },
      { label: 'Barcodes', href: '/pos/barcodes', icon: Barcode },
      { label: 'Price Sets', href: '/pos/price-sets', icon: Tag },
      { label: 'Integrations', href: '/pos/setup/integrations', icon: Plug },
      { label: 'Supplier Integrations', href: '/pos/setup/suppliers', icon: Truck },
      { label: 'Migrate Data', href: '/pos/setup/migrate', icon: Database },
      { label: 'Billing', href: '/pos/settings/billing', icon: Banknote },
    ],
  },
  {
    id: 'utilities',
    label: 'Utilities',
    icon: Wrench,
    defaultOpen: false,
    items: [
      { label: 'Future Prices', href: '/pos/future-prices', icon: Clock },
      { label: 'Mobile Scanner', href: '/pos/mobile', icon: Smartphone },
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
