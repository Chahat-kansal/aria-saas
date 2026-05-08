'use client'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import LogoMark from './LogoMark'
import { ThemeToggle } from '@/components/ThemeProvider'

const COLLAPSED_W = 60
const EXPANDED_W  = 236

const SECTIONS = [
  {
    id: 'sell',
    label: 'Sell',
    icon: '🛒',
    directHref: '/pos/terminal',
  },
  {
    id: 'register',
    label: 'Register',
    icon: '🏠',
    items: [
      { label: 'Open / Close', href: '/pos' },
      { label: 'Manage Cash', href: '/pos/cash' },
      { label: 'Close Register', href: '/pos/close' },
      { label: 'Sales History', href: '/pos/reports/sales' },
      { label: 'Customer Display', href: '/pos/display', external: true },
    ],
  },
  {
    id: 'stock',
    label: 'Stock Management',
    icon: '📦',
    items: [
      { label: 'Products', href: '/pos/products' },
      { label: 'Classifications', href: '/pos/categories' },
      { label: 'Suppliers', href: '/pos/suppliers' },
      { label: 'Orders & Invoices', href: '/pos/orders' },
      { label: 'Stocktake', href: '/pos/stocktake' },
      { label: 'New Stocktake', href: '/pos/inventory/stocktake/new' },
      { label: 'Dead Stock', href: '/pos/inventory/dead-stock' },
      { label: 'Transfers', href: '/pos/transfers' },
      { label: 'Import Products', href: '/pos/import' },
    ],
  },
  {
    id: 'customers',
    label: 'Customer Management',
    icon: '👥',
    items: [
      { label: 'Customers', href: '/pos/customers' },
      { label: 'Segments', href: '/pos/customers/segments' },
      { label: 'Customer Groups', href: '/pos/customer-groups' },
      { label: 'Price Sets', href: '/pos/price-sets' },
      { label: 'Balances', href: '/pos/balances' },
      { label: 'Gift Cards', href: '/pos/gift-cards' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: '🎯',
    items: [
      { label: 'Promotions', href: '/pos/promotions' },
      { label: 'New Promotion', href: '/pos/promotions/new' },
      { label: 'Laybys', href: '/pos/laybys' },
      { label: 'Shelf Tickets', href: '/pos/shelf-tickets' },
      { label: 'Loyalty', href: '/pos/loyalty' },
    ],
  },
  {
    id: 'reporting',
    label: 'Reporting',
    icon: '📊',
    items: [
      { label: 'Sales Reports', href: '/pos/reports/sales' },
      { label: 'Inventory', href: '/pos/reports/inventory' },
      { label: 'Cashier', href: '/pos/reports/cashier' },
      { label: 'Commission', href: '/pos/reports/commission' },
      { label: 'Closures', href: '/pos/reports/closures' },
      { label: 'Actions Report', href: '/pos/reports/actions' },
      { label: 'Advanced', href: '/pos/reports/advanced' },
      { label: 'Competitor Prices', href: '/pos/competitors' },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    icon: '⚙️',
    items: [
      { label: 'General', href: '/pos/settings' },
      { label: 'Sale Keys', href: '/pos/sale-keys' },
      { label: 'Receipt Templates', href: '/pos/receipt-templates' },
      { label: 'Staff & Users', href: '/pos/settings/users' },
      { label: 'Roles & Permissions', href: '/pos/settings/roles' },
      { label: 'Surcharging', href: '/pos/settings/surcharging' },
      { label: 'Registers & Outlets', href: '/pos/settings/registers' },
      { label: 'Barcodes', href: '/pos/barcodes' },
      { label: 'Price Sets', href: '/pos/price-sets' },
    ],
  },
  {
    id: 'utilities',
    label: 'Utilities',
    icon: '🔧',
    items: [
      { label: 'Future Prices', href: '/pos/future-prices' },
      { label: 'Mobile Scanner', href: '/pos/mobile' },
      { label: 'Timesheets', href: '/pos/timesheets' },
      { label: 'Void & Refund', href: '/pos/void' },
    ],
  },
]

function getActiveSection(pathname: string): string {
  if (pathname === '/pos/terminal') return 'sell'
  if (pathname.startsWith('/pos/reports') || pathname.startsWith('/pos/competitors')) return 'reporting'
  if (pathname.startsWith('/pos/settings') || pathname.startsWith('/pos/sale-keys') ||
      pathname.startsWith('/pos/receipt-templates') || pathname.startsWith('/pos/barcodes') ||
      pathname.startsWith('/pos/price-sets')) return 'setup'
  if (pathname.startsWith('/pos/customers') || pathname.startsWith('/pos/customer-groups') ||
      pathname.startsWith('/pos/gift-cards') || pathname.startsWith('/pos/balances')) return 'customers'
  if (pathname.startsWith('/pos/products') || pathname.startsWith('/pos/categories') ||
      pathname.startsWith('/pos/suppliers') || pathname.startsWith('/pos/orders') ||
      pathname.startsWith('/pos/stocktake') || pathname.startsWith('/pos/transfers') ||
      pathname.startsWith('/pos/import')) return 'stock'
  if (pathname.startsWith('/pos/promotions') || pathname.startsWith('/pos/shelf-tickets') ||
      pathname.startsWith('/pos/loyalty')) return 'marketing'
  if (pathname.startsWith('/pos/future-prices') || pathname.startsWith('/pos/mobile') ||
      pathname.startsWith('/pos/timesheets') || pathname.startsWith('/pos/void')) return 'utilities'
  return 'register'
}

interface Props {
  businessName?:  string
  posUser?:       { name: string; initials: string; role: string } | null
  currentUser?:   { name: string; initials: string; role: string } | null
  onAriaToggle?:  () => void
  ariaOpen?:      boolean
  onUserSwitch?:  () => void
  onNavigate?:    () => void
}

export default function POSSidebar({
  businessName = '',
  posUser,
  currentUser,
  onAriaToggle,
  ariaOpen = false,
  onUserSwitch,
  onNavigate,
}: Props) {
  const pathname    = usePathname()
  const router      = useRouter()
  const user        = currentUser ?? posUser ?? null
  const isTerminal  = pathname === '/pos/terminal'

  // Dark overrides for terminal — sidebar matches terminal's forced-dark theme
  const SB = isTerminal ? {
    bg:        '#0A0910',
    elevated:  '#1A1728',
    text:      '#EDE8FF',
    secondary: 'rgba(237,232,255,0.65)',
    tertiary:  'rgba(237,232,255,0.4)',
    divider:   'rgba(255,255,255,0.05)',
  } : {
    bg:        'var(--bg-surface)',
    elevated:  'var(--bg-elevated)',
    text:      'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    tertiary:  'var(--text-tertiary)',
    divider:   'var(--divider)',
  }

  const [collapsed, setCollapsed]       = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set([getActiveSection(pathname)])
  )
  const [time, setTime] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('aria_pos_sidebar_collapsed')
    if (stored === 'true') setCollapsed(true)
    const tick = () => setTime(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 15000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setOpenSections(prev => new Set([...prev, getActiveSection(pathname)]))
  }, [pathname])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('aria_pos_sidebar_collapsed', String(next))
    if (next) setOpenSections(new Set())
    else setOpenSections(new Set([getActiveSection(pathname)]))
  }

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isActive = (href: string) => {
    if (href === '/pos') return pathname === '/pos'
    if (href === '/pos/display') return pathname === '/pos/display'
    if (href === '/pos/terminal') return pathname === '/pos/terminal'
    return pathname.startsWith(href)
  }

  const navigate = (href: string) => {
    router.push(href)
    onNavigate?.()
  }

  const openDisplay = () =>
    window.open('/pos/display', 'AriaDisplay', 'width=1920,height=1080,menubar=no,toolbar=no')

  return (
    <nav style={{
      width: collapsed ? COLLAPSED_W : EXPANDED_W,
      minWidth: collapsed ? COLLAPSED_W : EXPANDED_W,
      transition: 'width 280ms cubic-bezier(0.16,1,0.3,1), min-width 280ms cubic-bezier(0.16,1,0.3,1)',
      background: SB.bg,
      boxShadow: collapsed ? 'none' : 'var(--shadow-md)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
      zIndex: 10,
    }}>

      {/* Collapse toggle tab */}
      <div onClick={toggleCollapse} style={{
        position: 'absolute', right: -12, top: '50%',
        transform: 'translateY(-50%)',
        width: 20, height: 44,
        background: SB.elevated,
        boxShadow: 'var(--shadow-sm)',
        borderRadius: '0 8px 8px 0',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 20,
        fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 800,
        transition: 'color 150ms',
      }}>
        {collapsed ? '›' : '‹'}
      </div>

      {/* Logo */}
      <div style={{
        padding: collapsed ? '14px 0' : '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
        justifyContent: collapsed ? 'center' : 'flex-start',
        minHeight: 56,
      }}>
        <div style={{ flexShrink: 0 }}><LogoMark size={26} /></div>
        {!collapsed && (
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontStyle: 'italic',
              fontSize: 15, color: 'var(--text-primary)', fontWeight: 400, whiteSpace: 'nowrap',
            }}>AriaPOS</div>
            {businessName && (
              <div style={{
                fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160,
              }}>{businessName}</div>
            )}
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Nav sections */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 0' }}>
        {SECTIONS.map(section => {
          const isOpen = openSections.has(section.id)
          const isSectionActive = getActiveSection(pathname) === section.id

          if ('directHref' in section) {
            return (
              <div key={section.id} onClick={() => navigate(section.directHref!)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '11px 0' : '10px 14px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                cursor: 'pointer',
                background: isSectionActive ? 'var(--violet-dim)' : 'transparent',
                borderLeft: isSectionActive && !collapsed ? '3px solid var(--violet)' : '3px solid transparent',
                transition: 'all 150ms',
                position: 'relative',
              }}>
                {isSectionActive && collapsed && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 3, height: 18, background: 'var(--violet)', borderRadius: 999,
                    boxShadow: '0 0 8px var(--violet-glow)',
                  }} />
                )}
                <span style={{ fontSize: 17, flexShrink: 0 }}>{section.icon}</span>
                {!collapsed && (
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: isSectionActive ? 'var(--text-violet)' : 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                  }}>{section.label}</span>
                )}
              </div>
            )
          }

          return (
            <div key={section.id}>
              <div onClick={() => {
                if (collapsed) {
                  setCollapsed(false)
                  localStorage.setItem('aria_pos_sidebar_collapsed', 'false')
                  setOpenSections(new Set([section.id]))
                } else {
                  toggleSection(section.id)
                }
              }} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '11px 0' : '10px 14px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                cursor: 'pointer',
                background: isSectionActive && !isOpen ? 'var(--violet-soft)' : 'transparent',
                borderLeft: isSectionActive && !collapsed ? '3px solid rgba(139,92,246,0.3)' : '3px solid transparent',
                transition: 'all 150ms',
                userSelect: 'none',
                position: 'relative',
              }}>
                {isSectionActive && collapsed && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 3, height: 18, background: 'var(--violet)', borderRadius: 999,
                    boxShadow: '0 0 8px var(--violet-glow)',
                  }} />
                )}
                <span style={{ fontSize: 17, flexShrink: 0 }}>{section.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{
                      fontSize: 12, fontWeight: 600, flex: 1, whiteSpace: 'nowrap',
                      color: isSectionActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}>{section.label}</span>
                    <span style={{
                      fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, lineHeight: 1,
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1)',
                    }}>›</span>
                  </>
                )}
              </div>

              {!collapsed && isOpen && (
                <div style={{ marginLeft: 30, borderLeft: '1px solid var(--divider)', paddingBottom: 4 }}>
                  {'items' in section && section.items?.map(item => {
                    const active = isActive(item.href)
                    return (
                      <div key={item.href} onClick={() => {
                        if ('external' in item && item.external) openDisplay()
                        else navigate(item.href)
                      }} style={{
                        padding: '7px 14px', cursor: 'pointer',
                        fontSize: 12, fontWeight: active ? 600 : 400,
                        color: active ? 'var(--text-violet)' : 'var(--text-tertiary)',
                        background: active ? 'var(--violet-soft)' : 'transparent',
                        borderLeft: active ? '2px solid var(--violet)' : '2px solid transparent',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        transition: 'all 100ms', marginLeft: -1,
                      }}
                      onMouseEnter={e => {
                        if (!active) {
                          const el = e.currentTarget as HTMLElement
                          el.style.color = 'var(--text-primary)'
                          el.style.background = 'var(--bg-hover)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!active) {
                          const el = e.currentTarget as HTMLElement
                          el.style.color = 'var(--text-tertiary)'
                          el.style.background = 'transparent'
                        }
                      }}>
                        {item.label}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="divider" />

      {/* Bottom */}
      <div style={{ flexShrink: 0, padding: '8px 0' }}>
        <div style={{ padding: collapsed ? '6px 12px' : '6px 10px', display: 'flex', justifyContent: collapsed ? 'center' : 'stretch' }}>
          <ThemeToggle collapsed={collapsed} />
        </div>

        <div onClick={onAriaToggle} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: collapsed ? '10px 0' : '10px 14px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          cursor: 'pointer',
          background: ariaOpen ? 'var(--violet-dim)' : 'transparent',
          transition: 'background 150ms',
        }}>
          <span style={{ fontSize: 16 }}>✨</span>
          {!collapsed && (
            <span style={{ fontSize: 12, fontWeight: 700, color: ariaOpen ? 'var(--text-violet)' : 'var(--text-secondary)' }}>
              Ask Aria
            </span>
          )}
        </div>

        <div onClick={onUserSwitch} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: collapsed ? '8px 0' : '8px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          cursor: 'pointer',
          margin: collapsed ? 0 : '0 8px',
          borderRadius: 12,
          background: SB.elevated,
          boxShadow: 'var(--shadow-sm)',
          transition: 'transform 200ms var(--ease)',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}>
          <div style={{
            width: 28, height: 28, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #A78BFA, #7C3AED)',
            boxShadow: '0 4px 12px rgba(139,92,246,0.30)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color: '#fff',
          }}>
            {user?.initials || '?'}
          </div>
          {!collapsed && user && (
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {user.role}
              </div>
            </div>
          )}
          {!collapsed && time && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', flexShrink: 0 }}>
              {time}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
