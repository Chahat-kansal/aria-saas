// Aria OS product map — real routes verified against src/app directory.
// Used to answer navigation / "where is X" questions without hallucination.

export type ProductEntry = {
  feature: string
  route: string
  aliases: string[]   // alternative names the user might say
  blurb: string
}

export const PRODUCT_MAP: ProductEntry[] = [
  // ── POS ──────────────────────────────────────────────────────────────────
  { feature: 'POS Terminal', route: '/pos/terminal', aliases: ['point of sale', 'till', 'cash register', 'pos'], blurb: 'Full-screen POS for ringing up sales, voids, refunds, bill splitting, KDS routing' },
  { feature: 'POS Dashboard', route: '/pos/dashboard', aliases: ['pos home', 'pos overview'], blurb: 'POS-mode summary of today\'s session' },
  { feature: 'Sales History', route: '/pos/sales-history', aliases: ['past sales', 'sale history', 'transactions'], blurb: 'Browse and search past POS transactions' },
  { feature: 'Products', route: '/pos/products', aliases: ['product list', 'items', 'menu items', 'stock items'], blurb: 'Manage products, prices, stock levels, barcodes, variants' },
  { feature: 'Categories', route: '/pos/categories', aliases: ['product categories', 'departments'], blurb: 'Create and manage product categories' },
  { feature: 'Modifiers', route: '/pos/modifiers', aliases: ['add-ons', 'extras', 'options'], blurb: 'Modifier groups and options attached to products' },
  { feature: 'POS Customers', route: '/pos/customers', aliases: ['pos customer list'], blurb: 'Customer profiles, account balances, return policies' },
  { feature: 'Loyalty', route: '/pos/loyalty', aliases: ['rewards', 'points', 'loyalty program'], blurb: 'Loyalty program config, tiers, redemption rules' },
  { feature: 'POS Reports', route: '/pos/reports', aliases: ['pos reporting', 'sales reports', 'sales report', 'report'], blurb: 'Sales, cashier, inventory, BAS, commission, closure reports' },
  { feature: 'POS Reports — Sales', route: '/pos/reports/sales', aliases: ['sales breakdown', 'daily sales'], blurb: 'Detailed sales by product, category, staff' },
  { feature: 'POS Reports — Inventory', route: '/pos/reports/inventory', aliases: ['stock report', 'inventory report'], blurb: 'Stock movement, valuation, reorder report' },
  { feature: 'POS Reports — BAS', route: '/pos/reports/bas', aliases: ['gst report', 'tax report', 'bas'], blurb: 'GST / BAS summary for your accountant' },
  { feature: 'Cash Sessions', route: '/pos/cash', aliases: ['cash management', 'float', 'cash drawer'], blurb: 'Open/close cash sessions, track float and cash movements' },
  { feature: 'End of Day', route: '/pos/end-of-day', aliases: ['eod', 'close of day', 'day close'], blurb: 'Run end-of-day reconciliation and summary' },
  { feature: 'Stocktake', route: '/pos/stocktake', aliases: ['stock count', 'inventory count', 'physical count'], blurb: 'Run a full or partial stocktake' },
  { feature: 'Promotions (POS)', route: '/pos/promotions', aliases: ['discounts', 'deals', 'pos promos'], blurb: 'Create and manage POS promotions and discount rules' },
  { feature: 'Suppliers (POS)', route: '/pos/suppliers', aliases: ['vendors', 'pos suppliers'], blurb: 'Manage supplier contacts, lead times, pricing' },
  { feature: 'Purchase Orders', route: '/pos/orders', aliases: ['po', 'order stock', 'restock', 'purchase order'], blurb: 'Create and track purchase orders to suppliers' },
  { feature: 'Transfers', route: '/pos/transfers', aliases: ['stock transfer', 'inter-outlet transfer'], blurb: 'Transfer stock between outlets' },
  { feature: 'Gift Cards', route: '/pos/gift-cards', aliases: ['vouchers', 'gift voucher'], blurb: 'Issue and redeem gift cards' },
  { feature: 'Laybys', route: '/pos/laybys', aliases: ['layaway', 'layby'], blurb: 'Manage layby orders for customers' },
  { feature: 'Tables', route: '/pos/tables', aliases: ['table management', 'floor plan', 'restaurant tables'], blurb: 'Restaurant / café table map and management' },
  { feature: 'KDS (Kitchen Display)', route: '/pos/kds', aliases: ['kitchen display', 'kitchen screen', 'kds'], blurb: 'Kitchen display system for food/beverage orders' },
  { feature: 'Timesheets (POS)', route: '/pos/timesheets', aliases: ['pos timesheets', 'clock in'], blurb: 'Staff clock-in/out via POS' },
  { feature: 'Roster (POS)', route: '/pos/timesheets/roster', aliases: ['pos roster', 'pos schedule'], blurb: 'View the shift roster from the POS side' },
  { feature: 'POS Settings', route: '/pos/settings', aliases: ['pos configuration', 'pos setup'], blurb: 'General POS settings, hardware, payments, tax, registers' },
  { feature: 'POS Settings — Hardware', route: '/pos/settings/hardware', aliases: ['printer', 'receipt printer', 'eftpos', 'hardware setup'], blurb: 'Connect receipt printers, cash drawers, EFTPOS' },
  { feature: 'POS Settings — Payments', route: '/pos/settings/payments', aliases: ['payment methods', 'payment types'], blurb: 'Configure accepted payment methods' },
  { feature: 'POS Settings — Registers', route: '/pos/settings/registers', aliases: ['register', 'till setup'], blurb: 'Set up and name registers' },
  { feature: 'POS Agents', route: '/pos/agents', aliases: ['pos ai', 'pos automation'], blurb: 'AI agents for pricing, reordering, and scheduling from the POS' },
  { feature: 'Barcode Scanner', route: '/pos/barcodes', aliases: ['barcodes', 'scan', 'barcode labels'], blurb: 'Scan and print barcodes and shelf labels' },
  { feature: 'Price Tickets', route: '/pos/price-tickets', aliases: ['shelf tickets', 'price labels', 'price stickers'], blurb: 'Print price tickets and shelf labels' },
  { feature: 'Price Lists', route: '/pos/price-lists', aliases: ['pricelist', 'wholesale prices'], blurb: 'Manage multiple price lists for different customer groups' },
  { feature: 'Waste Tracking', route: '/pos/waste', aliases: ['waste', 'spoilage', 'write-off'], blurb: 'Record and track product waste / spoilage' },
  { feature: 'Void Reasons', route: '/pos/void', aliases: ['void', 'cancellation reasons'], blurb: 'Configure reasons for voiding sales' },
  { feature: 'Invoices (POS)', route: '/pos/invoices', aliases: ['pos invoices', 'customer invoice'], blurb: 'Generate and send customer invoices from the POS' },
  { feature: 'Fitting Room', route: '/pos/fitting-room', aliases: ['fitting room', 'try-on', 'dressing room'], blurb: 'Retail fitting room management' },
  { feature: 'Split Groups', route: '/pos/split-groups', aliases: ['bill split', 'split bill', 'bill splitting'], blurb: 'Manage bill-splitting groups for table service' },
  { feature: 'Competitors (POS)', route: '/pos/competitors', aliases: ['pos competitor tracking'], blurb: 'Track and compare competitor prices from POS' },
  { feature: 'Display Screen', route: '/pos/display', aliases: ['customer display', 'customer facing screen'], blurb: 'Customer-facing display configuration' },
  { feature: 'Ask Aria (POS)', route: '/pos/ask', aliases: ['aria pos chat', 'ask at pos'], blurb: 'Ask Aria AI questions directly from the POS' },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  { feature: 'Dashboard', route: '/dashboard', aliases: ['home', 'main screen', 'overview', 'command centre'], blurb: 'Business command centre: live KPIs, Aria briefing, quick actions' },
  { feature: 'Ask Aria', route: '/dashboard/ask-aria', aliases: ['aria chat', 'ai chat', 'chat with aria', 'ask ai'], blurb: 'Full Ask Aria conversational AI with business data access' },
  { feature: 'Daily Briefing', route: '/dashboard/daily-briefing', aliases: ['morning briefing', 'daily summary', 'briefing'], blurb: 'AI-generated daily business briefing — revenue, staff, alerts' },
  { feature: 'Intelligence', route: '/dashboard/intelligence', aliases: ['business intelligence', 'insights', 'analytics', 'bi'], blurb: 'Advanced analytics alerts and scheduled intelligence reports' },
  { feature: 'Autopilot', route: '/dashboard/autopilot', aliases: ['ai autopilot', 'automation', 'auto actions'], blurb: 'AI autopilot actions — Aria acts on business events automatically' },
  { feature: 'Staff Management', route: '/dashboard/staff', aliases: ['staff', 'employees', 'team', 'workers'], blurb: 'Manage staff profiles, roles, pay rates, documents' },
  { feature: 'Roster / Scheduling', route: '/dashboard/staff/roster', aliases: ['roster', 'schedule', 'shift schedule', 'rota'], blurb: 'AI-powered shift roster — generate, publish, notify staff' },
  { feature: 'Timesheets', route: '/dashboard/staff/timesheets', aliases: ['timesheet', 'hours worked', 'time tracking'], blurb: 'View and approve staff timesheet hours' },
  { feature: 'Leave Management', route: '/dashboard/staff/leave', aliases: ['leave', 'annual leave', 'sick leave', 'time off'], blurb: 'Approve/reject leave requests, view leave balances' },
  { feature: 'Payroll', route: '/dashboard/staff/payroll', aliases: ['pay run', 'wages', 'salary', 'payslips'], blurb: 'Run payroll, generate payslips, superannuation calculations' },
  { feature: 'Staff Messages', route: '/dashboard/staff/messages', aliases: ['staff messaging', 'team messages'], blurb: 'Message staff from the business owner side' },
  { feature: 'Staff Announcements', route: '/dashboard/staff/announcements', aliases: ['announcements', 'notice board'], blurb: 'Post announcements visible to all staff in their portal' },
  { feature: 'Inventory', route: '/dashboard/inventory', aliases: ['stock', 'products overview', 'inventory overview'], blurb: 'Inventory overview — levels, value, reorder alerts' },
  { feature: 'Cash Up', route: '/dashboard/cash-up', aliases: ['cash reconciliation', 'daily cash'], blurb: 'End-of-day cash reconciliation and close-out' },
  { feature: 'Reviews', route: '/dashboard/reviews', aliases: ['google reviews', 'customer reviews', 'reputation'], blurb: 'View and respond to Google reviews with AI-drafted replies' },
  { feature: 'Customers (Dashboard)', route: '/dashboard/customers', aliases: ['customer list', 'crm', 'customer database'], blurb: 'Full customer profiles, spending history, loyalty, winback' },
  { feature: 'Marketing', route: '/dashboard/marketing', aliases: ['marketing hub', 'campaigns', 'email marketing'], blurb: 'Marketing campaigns, email, SMS, social scheduling' },
  { feature: 'Promotions (Dashboard)', route: '/dashboard/promotions', aliases: ['promotion management', 'discount campaigns'], blurb: 'Manage and analyse business-wide promotions' },
  { feature: 'Reels / Studio', route: '/dashboard/reels', aliases: ['reels', 'video', 'content studio'], blurb: 'Short-form video reels and social content creation' },
  { feature: 'Social Media', route: '/dashboard/social', aliases: ['social', 'instagram', 'facebook', 'social posting'], blurb: 'Social media management: schedule posts across platforms' },
  { feature: 'Social Calendar', route: '/dashboard/social/calendar', aliases: ['content calendar', 'posting schedule'], blurb: 'Visual calendar for scheduled social posts' },
  { feature: 'Community', route: '/dashboard/community', aliases: ['aria community', 'business network'], blurb: 'Connect with other Aria OS businesses in the community' },
  { feature: 'Website Chat', route: '/dashboard/website-chat', aliases: ['chat widget', 'live chat', 'website chatbot'], blurb: 'Manage AI chat widget conversations from your website' },
  { feature: 'Bookings', route: '/dashboard/bookings', aliases: ['appointments', 'reservations', 'booking system'], blurb: 'View and manage customer bookings and appointments' },
  { feature: 'Orders (Dashboard)', route: '/dashboard/orders', aliases: ['online orders', 'delivery orders', 'order management'], blurb: 'Online and delivery order management' },
  { feature: 'Cash Flow', route: '/dashboard/cash-flow', aliases: ['cashflow', 'cash forecast', 'money flow'], blurb: 'Cash flow analysis and 30-day forward projection' },
  { feature: 'Suppliers (Dashboard)', route: '/dashboard/suppliers', aliases: ['vendor management', 'supplier hub'], blurb: 'Manage supplier relationships and purchase history' },
  { feature: 'Invoices (Dashboard)', route: '/dashboard/invoices', aliases: ['invoice management', 'accounts receivable'], blurb: 'Create, send, and track customer invoices' },
  { feature: 'Loyalty (Dashboard)', route: '/dashboard/pos/loyalty', aliases: ['loyalty config', 'points setup'], blurb: 'Loyalty program configuration from the dashboard' },
  { feature: 'Gift Cards (Dashboard)', route: '/dashboard/gift-cards', aliases: ['gift card management'], blurb: 'Issue and track gift cards' },
  { feature: 'Dynamic Pricing', route: '/dashboard/dynamic-pricing', aliases: ['smart pricing', 'ai pricing', 'automated pricing'], blurb: 'AI-driven dynamic pricing rules based on demand and time' },
  { feature: 'Competitor Intelligence', route: '/dashboard/competitors', aliases: ['competitors', 'competitive analysis'], blurb: 'Track competitor prices and monitor Google ratings' },
  { feature: 'Churn Risk', route: '/dashboard/churn', aliases: ['churn', 'at-risk customers', 'customer churn'], blurb: 'Identify and act on customers at risk of churning' },
  { feature: 'Winback', route: '/dashboard/winback', aliases: ['winback campaign', 'win back customers', 'lost customers'], blurb: 'Automated campaigns to re-engage lapsed customers' },
  { feature: 'Missed Demand', route: '/dashboard/missed-demand', aliases: ['missed sales', 'stockout analysis'], blurb: 'Identify revenue lost to stockouts and missed demand' },
  { feature: 'Profit Leaks', route: '/dashboard/profit-leaks', aliases: ['profit analysis', 'margin leaks', 'losses'], blurb: 'Identify where profit is leaking from the business' },
  { feature: 'Delivery', route: '/dashboard/delivery', aliases: ['delivery management', 'courier', 'dispatch'], blurb: 'Manage delivery orders and courier assignments' },
  { feature: 'Recipes', route: '/dashboard/recipes', aliases: ['recipe management', 'bill of materials', 'bom'], blurb: 'Product recipes for cost management and production planning' },
  { feature: 'Slow Day Predictor', route: '/dashboard/slow-day', aliases: ['slow days', 'quiet days', 'demand forecast'], blurb: 'AI predicts slow days so you can run targeted promotions' },
  { feature: 'Weekly Reports', route: '/dashboard/weekly-reports', aliases: ['weekly report', 'week summary'], blurb: 'Automated weekly business performance report' },
  { feature: 'Shift Reports', route: '/dashboard/shift-reports', aliases: ['shift report', 'shift summary'], blurb: 'Per-shift revenue, staff, and transaction summaries' },
  { feature: 'Reorder', route: '/dashboard/reorder', aliases: ['auto reorder', 'reorder schedule', 'replenishment'], blurb: 'AI-powered automatic reorder scheduling from suppliers' },
  { feature: 'Warehouse', route: '/dashboard/warehouse', aliases: ['warehouse management', 'wms'], blurb: 'Warehouse management: receiving, picking, locations, serials' },
  { feature: 'BAS / Tax', route: '/dashboard/bas', aliases: ['bas', 'tax reporting', 'gst reporting'], blurb: 'BAS and GST reporting dashboard' },
  { feature: 'Ad Network', route: '/dashboard/ad-network', aliases: ['ads', 'advertising', 'aria ads'], blurb: 'Run targeted ads through the Aria business network' },
  { feature: 'Receipt Scanner', route: '/dashboard/receipt-scan', aliases: ['receipt scan', 'expense scan', 'ocr receipts'], blurb: 'Scan receipts with AI to extract and log expenses' },
  { feature: 'SEO', route: '/dashboard/seo', aliases: ['search engine', 'google ranking', 'seo'], blurb: 'SEO insights and recommendations for your website' },
  { feature: 'Customer Tabs', route: '/dashboard/customer-tabs', aliases: ['tabs', 'house accounts', 'running tabs'], blurb: 'Customer running tab / house account management' },
  { feature: 'Settings', route: '/dashboard/settings', aliases: ['business settings', 'account settings', 'configuration'], blurb: 'Business profile, billing, integrations, sharing settings' },
  { feature: 'Settings — Business', route: '/dashboard/settings/business', aliases: ['business profile', 'business details', 'abn', 'address'], blurb: 'Update business name, ABN, address, industry, logo' },
  { feature: 'Settings — Billing', route: '/dashboard/billing', aliases: ['plan', 'subscription', 'billing', 'upgrade'], blurb: 'Manage your Aria OS subscription and billing' },
  { feature: 'Settings — Integrations', route: '/dashboard/integrations', aliases: ['integrations', 'connect apps', 'square', 'xero', 'shopify'], blurb: 'Connect Square, Xero, Shopify, Lightspeed and more' },
  { feature: 'Xero Integration', route: '/dashboard/xero', aliases: ['xero', 'accounting', 'bookkeeping'], blurb: 'Xero accounting integration — sync sales, invoices, expenses' },
  { feature: 'Aria Memory', route: '/dashboard/aria/memory', aliases: ['aria memory', 'ai memory', 'what aria knows'], blurb: 'View and manage what Aria has learned about your business' },
  { feature: 'AI Agents', route: '/dashboard/agents', aliases: ['agents', 'ai workers', 'background agents'], blurb: 'Manage autonomous AI agents running background tasks' },
  { feature: 'Compliance', route: '/dashboard/compliance', aliases: ['compliance hub', 'licensing', 'regulations', 'visa compliance'], blurb: 'Track liquor licences, Fair Work, visa right-to-work compliance' },
  { feature: 'In-Store Display', route: '/dashboard/in-store', aliases: ['in-store', 'digital signage', 'display screen'], blurb: 'Manage customer-facing in-store digital displays' },
  { feature: 'Locations', route: '/dashboard/locations', aliases: ['outlets', 'branches', 'locations', 'stores'], blurb: 'Manage multiple business locations and outlets' },
  { feature: 'Inbox', route: '/dashboard/inbox', aliases: ['inbox', 'messages', 'notifications'], blurb: 'Unified inbox for customer messages and Aria alerts' },
  { feature: 'Stocktake (Dashboard)', route: '/dashboard/stocktake', aliases: ['dashboard stocktake'], blurb: 'Initiate and manage stocktakes from the dashboard' },
  { feature: 'Quote Builder', route: '/dashboard/quote-builder', aliases: ['quotes', 'quote builder', 'estimate'], blurb: 'Build and send formal quotes to customers' },
  { feature: 'Price Tickets (Dashboard)', route: '/dashboard/price-tickets', aliases: ['label printing', 'dashboard price labels'], blurb: 'Print price tickets and shelf labels from the dashboard' },
  { feature: 'Marketplace', route: '/dashboard/marketplace', aliases: ['app marketplace', 'add-ons', 'extensions'], blurb: 'Discover and install Aria OS add-on features and integrations' },
  { feature: 'Bundles', route: '/dashboard/bundles', aliases: ['product bundles', 'combo deals', 'bundle pricing'], blurb: 'Create and sell product bundles at bundle pricing' },
  { feature: 'Variance', route: '/dashboard/variance', aliases: ['variance report', 'discrepancy', 'stock variance'], blurb: 'Analyse stock variances between expected and actual levels' },

  // ── Staff Portal ──────────────────────────────────────────────────────────
  { feature: 'Staff Portal', route: '/staff/portal', aliases: ['staff home', 'employee portal', 'worker portal'], blurb: 'Staff self-service portal: timesheets, leave, schedule, messages' },
  { feature: 'Staff Portal — Timesheets', route: '/staff/portal/timesheets', aliases: ['my timesheets', 'my hours'], blurb: 'Staff view of their own timesheet and clock records' },
  { feature: 'Staff Portal — Leave', route: '/staff/portal/leave', aliases: ['request leave', 'my leave', 'leave request'], blurb: 'Staff submit and track leave requests' },
  { feature: 'Staff Portal — Schedule', route: '/staff/portal/schedule', aliases: ['my schedule', 'my shifts', 'shift schedule'], blurb: 'Staff view their upcoming shifts' },
  { feature: 'Staff Portal — Messages', route: '/staff/portal/messages', aliases: ['my messages', 'staff chat'], blurb: 'Staff messaging with their manager' },
  { feature: 'Staff Portal — Training', route: '/staff/portal/training', aliases: ['training', 'staff training', 'onboarding'], blurb: 'Training modules and resources for staff' },
  { feature: 'Staff Portal — Availability', route: '/staff/portal/availability', aliases: ['my availability', 'set availability'], blurb: 'Staff set their weekly availability preferences' },
]

// Build a flat keyword→entry lookup for fast navigation detection
type NavMatch = { entry: ProductEntry; score: number }

export function findProductByQuery(query: string): ProductEntry | null {
  const q = query.toLowerCase()
  let best: NavMatch | null = null

  for (const entry of PRODUCT_MAP) {
    const targets = [
      entry.feature.toLowerCase(),
      entry.route.toLowerCase(),
      ...entry.aliases.map(a => a.toLowerCase()),
    ]
    let score = 0
    for (const t of targets) {
      if (q.includes(t) || t.includes(q)) {
        score = Math.max(score, t.length)
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score }
    }
  }

  return best ? best.entry : null
}

export function buildProductMapBlock(): string {
  const lines = ['ARIA OS APP MAP (authoritative routes — use these for navigation questions):']
  for (const e of PRODUCT_MAP) {
    lines.push(`• ${e.feature} → ${e.route} — ${e.blurb}`)
  }
  lines.push('\nNAVIGATION RULE: When the owner asks where to find a feature, how to open something,')
  lines.push('or where something is — answer DIRECTLY from this map. State the route/menu path.')
  lines.push('Do NOT ask a clarifying question when the feature clearly exists in the map above.')
  return lines.join('\n')
}
