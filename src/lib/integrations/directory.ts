import type { Integration } from './types'

export const INTEGRATIONS: Integration[] = [
  // ── OFFICIAL (blue ribbon) ────────────────────────────────────
  {
    key: 'xero', display_name: 'Xero',
    description: 'Sync sales, invoices, and payments to Xero automatically.',
    category: 'Accounting', status: 'available', is_official: true, developed_by: 'Aria',
    setup_method: 'oauth',
    oauth_authorize_url: 'https://login.xero.com/identity/connect/authorize',
    oauth_token_url: 'https://identity.xero.com/connect/token',
    oauth_scopes: ['accounting.transactions', 'accounting.contacts', 'offline_access'],
    logo_placeholder: '🔵',
  },
  {
    key: 'myob', display_name: 'MYOB',
    description: 'Push daily sales and purchases to MYOB AccountRight or Essentials.',
    category: 'Accounting', status: 'available', is_official: true, developed_by: 'Aria',
    setup_method: 'oauth',
    oauth_authorize_url: 'https://secure.myob.com/oauth2/account/authorize/',
    oauth_token_url: 'https://secure.myob.com/oauth2/v1/authorize/',
    oauth_scopes: ['CompanyFile', 'CompanyFile.Sales', 'CompanyFile.Purchases'],
    logo_placeholder: '🟣',
  },
  {
    key: 'alm', display_name: 'ALM',
    description: 'Australian Liquor Marketers — receive invoices, sync product data, place orders.',
    category: 'Supplier', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🍺',
  },
  {
    key: 'ilg', display_name: 'ILG',
    description: 'Independent Liquor Group — electronic invoicing and product catalogue sync.',
    category: 'Supplier', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🥃',
  },
  {
    key: 'lmg', display_name: 'LMG',
    description: 'Liquor Marketing Group — supplier integration for LMG member stores.',
    category: 'Supplier', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🍷',
  },
  {
    key: 'thirsty_camel', display_name: 'Thirsty Camel',
    description: 'Thirsty Camel Hump Club loyalty and supplier integration.',
    category: 'Supplier', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🐪',
  },
  {
    key: 'iba_ecommerce', display_name: 'IBA E-Commerce',
    description: 'Independent Brands Australia — online store sync and order management.',
    category: 'E-Commerce', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🛒',
  },
  {
    key: 'iba_rewards', display_name: 'IBA Rewards',
    description: 'IBA loyalty rewards program — earn and redeem points at the terminal.',
    category: 'Loyalty', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '⭐',
  },
  {
    key: 'iba_scan_data_v2_5', display_name: 'IBA Scan Data v2.5',
    description: 'Automated scan data reporting to IBA suppliers.',
    category: 'Analytics', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '📊',
  },
  {
    key: 'independent_brands_australia', display_name: 'Independent Brands Australia',
    description: 'IBA group purchasing and supplier network integration.',
    category: 'Supplier', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🏪',
  },
  {
    key: 'last_yard', display_name: 'Last Yard',
    description: 'Last-mile delivery integration for bottle shop delivery orders.',
    category: 'Delivery', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🚚',
  },
  {
    key: 'ontap_data', display_name: 'OnTap Data',
    description: 'Draught beer data and analytics for venues with tap systems.',
    category: 'Analytics', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🍻',
  },
  {
    key: 'promotion_stacker', display_name: 'Promotion Stacker',
    description: 'Advanced promotion and discount stacking engine.',
    category: 'Promotions', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🏷️',
  },
  {
    key: 'tipplego_orders', display_name: 'TippleGO Orders',
    description: 'TippleGO online orders sync directly into your Aria POS.',
    category: 'E-Commerce', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '📱',
  },
  {
    key: 'vii', display_name: 'Vii',
    description: 'Vii loyalty program — digital cards, rewards, and customer profiles.',
    category: 'Loyalty', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '💳',
  },
  {
    key: 'accounts_flow', display_name: 'Accounts Flow',
    description: 'Automated accounts payable and receivable reconciliation.',
    category: 'Accounting', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '💰',
  },
  {
    key: 'zen_global', display_name: 'Zen Global',
    description: 'International payments and multi-currency support.',
    category: 'Payments', status: 'partnership_pending', is_official: true, developed_by: 'Aria',
    setup_method: 'partnership', logo_placeholder: '🌏',
  },
  {
    key: 'conversion_service', display_name: 'Aria Data Conversion',
    description: 'Free migration service — we import your data from Shopfront, Square, or Lightspeed.',
    category: 'Migration', status: 'available', is_official: true, developed_by: 'Aria',
    setup_method: 'email_po', logo_placeholder: '📦',
  },

  // ── APPROVED BY ARIA (orange ribbon) ─────────────────────────
  {
    key: 'burps', display_name: 'BuRPS',
    description: 'YTT Solutions rostering — staff scheduling integrated with Aria.',
    category: 'Rostering', status: 'partnership_pending', is_official: false, developed_by: 'YTT Solutions',
    setup_method: 'partnership', logo_placeholder: '📅',
  },
  {
    key: 'elabels', display_name: 'Elabels',
    description: 'Electronic shelf labels — price changes push instantly from Aria.',
    category: 'Shelf Labels', status: 'partnership_pending', is_official: false, developed_by: 'Elabels Pty Ltd',
    setup_method: 'partnership', logo_placeholder: '🏷️',
  },
  {
    key: 'hanshow', display_name: 'Hanshow',
    description: 'Hanshow ESL — smart shelf labels with real-time price sync.',
    category: 'Shelf Labels', status: 'partnership_pending', is_official: false, developed_by: 'Hanshow Australia',
    setup_method: 'partnership', logo_placeholder: '📟',
  },
  {
    key: 'ilr_esl', display_name: 'ILR ESL',
    description: 'Independent Liquor Retailers electronic shelf label integration.',
    category: 'Shelf Labels', status: 'partnership_pending', is_official: false, developed_by: 'ILR',
    setup_method: 'partnership', logo_placeholder: '📋',
  },
  {
    key: 'myfoodlink', display_name: 'Myfoodlink',
    description: 'Online ordering and delivery platform for food and beverage retailers.',
    category: 'E-Commerce', status: 'partnership_pending', is_official: false, developed_by: 'Myfoodlink Pty',
    setup_method: 'partnership', logo_placeholder: '🍔',
  },
  {
    key: 'pricer_esl', display_name: 'Pricer ESL',
    description: 'Pricer AB electronic shelf labels — enterprise-grade label management.',
    category: 'Shelf Labels', status: 'partnership_pending', is_official: false, developed_by: 'Pricer AB',
    setup_method: 'partnership', logo_placeholder: '🔖',
  },
  {
    key: 'ticket_it', display_name: 'Ticket-IT',
    description: 'Shelf ticket printing and management for retail stores.',
    category: 'Shelf Labels', status: 'partnership_pending', is_official: false, developed_by: 'Ticket-IT',
    setup_method: 'partnership', logo_placeholder: '🎫',
  },
  {
    key: 'tipplego_store_sync', display_name: 'TippleGO Store Sync',
    description: 'Keep your TippleGO store catalogue in sync with Aria inventory.',
    category: 'E-Commerce', status: 'partnership_pending', is_official: false, developed_by: 'TippleGO',
    setup_method: 'partnership', logo_placeholder: '🔄',
  },
]

export const OFFICIAL = INTEGRATIONS.filter(i => i.is_official)
export const APPROVED = INTEGRATIONS.filter(i => !i.is_official)
