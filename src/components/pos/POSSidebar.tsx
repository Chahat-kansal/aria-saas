'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronRight, ChevronLeft,
  Search, Building2, User, LogOut,
} from 'lucide-react'
import { AriaMark } from '@/components/ui/AriaMark'
import { PulseDot } from '@/components/ui/PulseDot'
import { NAV_STRUCTURE, findActiveSection, findActiveItem } from './sidebar-nav'
import { springs } from '@/lib/motion'
import { supabase } from '@/lib/supabase'

// ── Props — backwards-compatible with existing POSShell wiring ───────
interface Props {
  businessName?: string
  userEmail?: string
  // Legacy props accepted but unused in new design
  posUser?: { name: string; initials: string; role: string } | null
  currentUser?: { name: string; initials: string; role: string } | null
  onAriaToggle?: () => void
  ariaOpen?: boolean
  onUserSwitch?: () => void
  onNavigate?: () => void
}

const COLLAPSED_WIDTH = 56
const EXPANDED_WIDTH  = 220
const STORAGE_KEY_RAIL     = 'aria-sidebar-collapsed'
const STORAGE_KEY_SECTIONS = 'aria-sidebar-sections'

// ── Small kbd helper ─────────────────────────────────────────────────
const kbdStyle: React.CSSProperties = {
  fontSize: 9, padding: '1px 4px', borderRadius: 3,
  background: 'var(--bg-base)', color: 'var(--text-secondary)',
  marginRight: 4,
}

// ── Main component ───────────────────────────────────────────────────
export default function POSSidebar({
  businessName,
  userEmail,
  posUser,
  currentUser,
  onAriaToggle,
}: Props) {
  const pathname  = usePathname() ?? ''
  const router    = useRouter()
  const isTerminal = pathname === '/pos/terminal'

  const [collapsed,    setCollapsed]    = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [hoveredItem,  setHoveredItem]  = useState<string | null>(null)
  const [showCmdK,     setShowCmdK]     = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mounted,      setMounted]      = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // ── Hydration guard
  useEffect(() => { setMounted(true) }, [])

  // ── Load persisted state from localStorage ──────────────────────
  useEffect(() => {
    const railState = localStorage.getItem(STORAGE_KEY_RAIL)
    if (railState === '1') setCollapsed(true)

    const sectionsRaw = localStorage.getItem(STORAGE_KEY_SECTIONS)
    const defaults: Record<string, boolean> = {}
    NAV_STRUCTURE.forEach(s => { defaults[s.id] = s.defaultOpen ?? true })

    if (sectionsRaw) {
      try {
        setOpenSections({ ...defaults, ...JSON.parse(sectionsRaw) })
      } catch {
        setOpenSections(defaults)
      }
    } else {
      setOpenSections(defaults)
    }
  }, [])

  // ── Auto-open active section on navigation ───────────────────────
  useEffect(() => {
    const activeSectionId = findActiveSection(pathname)
    if (!activeSectionId) return
    setOpenSections(prev => {
      if (prev[activeSectionId]) return prev
      const next = { ...prev, [activeSectionId]: true }
      localStorage.setItem(STORAGE_KEY_SECTIONS, JSON.stringify(next))
      return next
    })
  }, [pathname])

  // ── Keyboard: ⌘K → command palette (skip on terminal to avoid conflict) ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (isMeta && e.key === 'k' && !isTerminal) {
        e.preventDefault()
        setShowCmdK(s => !s)
      }
      if (e.key === 'Escape') {
        setShowCmdK(false)
        setUserMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isTerminal])

  // ── Close user menu on outside click ────────────────────────────
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  // ── Helpers ──────────────────────────────────────────────────────
  const toggleRail = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY_RAIL, next ? '1' : '0')
  }

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(STORAGE_KEY_SECTIONS, JSON.stringify(next))
      return next
    })
  }

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    router.push('/login')
  }

  const openDisplay = () =>
    window.open('/pos/display', 'AriaDisplay', 'width=1920,height=1080,menubar=no,toolbar=no')

  const activeItemHref = mounted ? (findActiveItem(pathname)?.href ?? '') : ''

  // Derive display name for bottom user menu
  const displayUser = currentUser ?? posUser
  const displayName = displayUser?.name ?? businessName ?? 'Aria POS'

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
        transition={springs.smooth}
        style={{
          height: '100dvh',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-glass)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          boxShadow: 'inset -1px 0 0 var(--divider)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
          zIndex: 50,
        }}
      >
        {/* ── TOP: branding ──────────────────────────────────────── */}
        <div style={{
          padding: collapsed ? '14px 10px' : '14px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 56,
          flexShrink: 0,
        }}>
          <Link href="/pos" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--gradient-aria)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14, fontWeight: 700,
              fontFamily: 'var(--font-display)', fontStyle: 'italic',
              flexShrink: 0,
              boxShadow: '0 4px 12px var(--violet-glow)',
            }}>A</div>
            {!collapsed && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <AriaMark size={15} />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>POS</span>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button onClick={toggleRail} aria-label="Collapse sidebar" style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}>
              <ChevronLeft size={15} />
            </button>
          )}
        </div>

        {/* ── CMD+K TRIGGER ────────────────────────────────────── */}
        {!isTerminal && (
          <div style={{ padding: collapsed ? '0 8px 10px' : '0 10px 10px', flexShrink: 0 }}>
            <button
              onClick={() => setShowCmdK(true)}
              title="Search (⌘K)"
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                gap: 8, padding: collapsed ? 8 : '7px 10px',
                background: 'var(--bg-input)', border: '1px solid var(--divider)',
                borderRadius: 8, color: 'var(--text-tertiary)', fontSize: 12,
                cursor: 'pointer', textAlign: 'left',
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-input)' }}
            >
              <Search size={14} style={{ flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>Search...</span>
                  <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-base)', color: 'var(--text-tertiary)', fontFamily: 'inherit' }}>⌘K</kbd>
                </>
              )}
            </button>
          </div>
        )}

        {/* ── NAV SECTIONS ─────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '0 4px' : '0 6px' }}>
          {NAV_STRUCTURE.map(section => {
            const isOpen = openSections[section.id] ?? (section.defaultOpen ?? true)
            const SectionIcon = section.icon

            return (
              <div key={section.id} style={{ marginBottom: 2 }}>
                {/* Section header — only shown expanded */}
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 8px', background: 'transparent', border: 'none',
                      color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.16em',
                      cursor: 'pointer', borderRadius: 6, marginTop: 2,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
                  >
                    <span>{section.label}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 0 : -90 }}
                      transition={springs.snappy}
                      style={{ display: 'flex', alignItems: 'center' }}
                    >
                      <ChevronDown size={11} />
                    </motion.span>
                  </button>
                )}

                {/* Collapsed: show section icon as separator pill */}
                {collapsed && SectionIcon && (
                  <div style={{
                    display: 'flex', justifyContent: 'center',
                    padding: '6px 0 2px',
                    color: 'var(--text-tertiary)',
                  }}>
                    <SectionIcon size={13} />
                  </div>
                )}

                {/* Items */}
                <AnimatePresence initial={false}>
                  {(collapsed || isOpen) && (
                    <motion.div
                      initial={collapsed ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={springs.smooth}
                      style={{ overflow: 'hidden' }}
                    >
                      {section.items.map(item => {
                        const Icon = item.icon
                        const isActive = mounted && (
                          item.href === '/pos'
                            ? pathname === '/pos'
                            : item.href === '/pos/display'
                              ? false
                              : activeItemHref === item.href
                        )
                        const isHero = item.isHero

                        return (
                          <div
                            key={item.href}
                            style={{ position: 'relative' }}
                            onMouseEnter={() => setHoveredItem(item.href)}
                            onMouseLeave={() => setHoveredItem(null)}
                          >
                            {/* External display link */}
                            {item.external ? (
                              <button
                                onClick={openDisplay}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center',
                                  gap: 9, padding: collapsed ? '9px' : '7px 8px',
                                  marginLeft: collapsed ? 0 : 4,
                                  borderRadius: 7, textDecoration: 'none',
                                  background: 'transparent',
                                  border: 'none', cursor: 'pointer',
                                  color: 'var(--text-secondary)', fontSize: 13,
                                  justifyContent: collapsed ? 'center' : 'flex-start',
                                  transition: 'background 150ms',
                                  fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = 'var(--bg-hover)'
                                  e.currentTarget.style.color = 'var(--text-primary)'
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = 'transparent'
                                  e.currentTarget.style.color = 'var(--text-secondary)'
                                }}
                              >
                                <Icon size={15} style={{ flexShrink: 0 }} />
                                {!collapsed && <span>{item.label}</span>}
                              </button>
                            ) : (
                              <Link
                                href={item.href}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 9,
                                  padding: collapsed ? '9px' : '7px 8px',
                                  marginLeft: collapsed ? 0 : 4,
                                  borderRadius: 7, textDecoration: 'none',
                                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  background: isActive ? 'var(--violet-soft)' : 'transparent',
                                  fontSize: 13, fontWeight: isActive ? 500 : 400,
                                  position: 'relative',
                                  transition: 'background 150ms, color 150ms',
                                  justifyContent: collapsed ? 'center' : 'flex-start',
                                }}
                                onMouseEnter={e => {
                                  if (!isActive) {
                                    e.currentTarget.style.background = 'var(--bg-hover)'
                                    e.currentTarget.style.color = 'var(--text-primary)'
                                  }
                                }}
                                onMouseLeave={e => {
                                  if (!isActive) {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.color = 'var(--text-secondary)'
                                  }
                                }}
                              >
                                {/* Active sage left-border */}
                                {isActive && !collapsed && (
                                  <motion.div
                                    layoutId="active-border"
                                    style={{
                                      position: 'absolute', left: -4, top: 5, bottom: 5,
                                      width: 3, background: 'var(--violet)', borderRadius: 2,
                                      boxShadow: '0 0 8px var(--violet-glow)',
                                    }}
                                  />
                                )}

                                <Icon
                                  size={15}
                                  style={{
                                    flexShrink: 0,
                                    color: isHero ? 'var(--violet)' : isActive ? 'var(--violet)' : 'currentColor',
                                  }}
                                />

                                {!collapsed && (
                                  <span style={{
                                    flex: 1, whiteSpace: 'nowrap',
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                    ...(isHero ? {
                                      background: 'var(--gradient-aria)',
                                      WebkitBackgroundClip: 'text',
                                      WebkitTextFillColor: 'transparent',
                                      fontWeight: 500,
                                    } : {}),
                                  }}>
                                    {item.label}
                                  </span>
                                )}

                                {!collapsed && item.badge !== undefined && (
                                  <span style={{
                                    fontSize: 10, padding: '2px 6px', borderRadius: 99,
                                    background: 'var(--violet-dim)', color: 'var(--violet)', fontWeight: 500,
                                  }}>{item.badge}</span>
                                )}
                              </Link>
                            )}

                            {/* Collapsed tooltip */}
                            {collapsed && hoveredItem === item.href && (
                              <motion.div
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.1 }}
                                style={{
                                  position: 'absolute', left: 'calc(100% + 8px)', top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                                  padding: '5px 10px', borderRadius: 7, fontSize: 12,
                                  whiteSpace: 'nowrap', boxShadow: 'var(--shadow-md)',
                                  pointerEvents: 'none', zIndex: 100,
                                }}
                              >
                                {item.label}
                              </motion.div>
                            )}
                          </div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

          {/* Aria toggle (legacy — for terminal's ⌘K / onAriaToggle) */}
          {onAriaToggle && (
            <button
              onClick={onAriaToggle}
              title="Ask Aria"
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                gap: 9, padding: collapsed ? '9px' : '7px 8px',
                marginTop: 4,
                background: 'transparent', border: 'none', borderRadius: 7,
                color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13,
                justifyContent: collapsed ? 'center' : 'flex-start',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 15 }}>✦</span>
              {!collapsed && <span>Ask Aria</span>}
            </button>
          )}
        </nav>

        {/* ── COLLAPSED expand button ──────────────────────────── */}
        {collapsed && (
          <button
            onClick={toggleRail}
            aria-label="Expand sidebar"
            style={{
              margin: '8px auto', padding: 8,
              background: 'transparent', border: '1px solid var(--divider)',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36,
            }}
          >
            <ChevronRight size={15} />
          </button>
        )}

        {/* ── BOTTOM: business / user ──────────────────────────── */}
        <div
          ref={userMenuRef}
          style={{ borderTop: '1px solid var(--divider)', padding: collapsed ? 8 : 10, position: 'relative', flexShrink: 0 }}
        >
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: 9, padding: collapsed ? 8 : '7px 9px',
              background: userMenuOpen ? 'var(--bg-hover)' : 'transparent',
              border: 'none', borderRadius: 8,
              color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'background 150ms',
            }}
            onMouseEnter={e => { if (!userMenuOpen) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--gradient-aria-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--violet)', flexShrink: 0,
            }}>
              <Building2 size={14} />
            </div>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {businessName ?? displayName}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <PulseDot color="var(--success)" />
                  <span>Online</span>
                </div>
              </div>
            )}
          </button>

          {/* User menu popup */}
          <AnimatePresence>
            {userMenuOpen && !collapsed && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={springs.snappy}
                style={{
                  position: 'absolute', bottom: 'calc(100% + 6px)', left: 10, right: 10,
                  background: 'var(--bg-elevated)',
                  borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 100,
                }}
              >
                {userEmail && (
                  <>
                    <div style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {userEmail}
                    </div>
                    <div style={{ height: 1, background: 'var(--divider)' }} />
                  </>
                )}
                <Link
                  href="/pos/settings"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13 }}
                  onClick={() => setUserMenuOpen(false)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <User size={14} /> Settings
                </Link>
                <button
                  onClick={handleSignOut}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: 'transparent', border: 'none',
                    color: 'var(--destructive)', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--destructive-bg)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>

      {/* ── Command palette ──────────────────────────────────────── */}
      <AnimatePresence>
        {showCmdK && (
          <CommandPalette
            onClose={() => setShowCmdK(false)}
            onNavigate={(href) => { router.push(href); setShowCmdK(false) }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ── CommandPalette ───────────────────────────────────────────────────
function CommandPalette({
  onClose,
  onNavigate,
}: {
  onClose: () => void
  onNavigate: (href: string) => void
}) {
  const [query, setQuery]           = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const allItems = NAV_STRUCTURE.flatMap(s =>
    s.items.filter(i => !i.external).map(item => ({ ...item, sectionLabel: s.label }))
  )

  const filtered = query.trim() === ''
    ? allItems.slice(0, 9)
    : allItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.sectionLabel.toLowerCase().includes(query.toLowerCase()) ||
        item.href.toLowerCase().includes(query.toLowerCase())
      )

  useEffect(() => { setHighlightIdx(0) }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlightIdx]) onNavigate(filtered[highlightIdx].href) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.48)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ y: -12, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -12, scale: 0.96 }}
        transition={springs.snappy}
        style={{
          width: 'min(540px, 90vw)',
          background: 'var(--bg-elevated)',
          backdropFilter: 'var(--glass-blur-strong)',
          borderRadius: 14, overflow: 'hidden',
          boxShadow: 'var(--shadow-plane-4), 0 0 0 1px var(--divider) inset',
        }}
      >
        {/* Input */}
        <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--divider)' }}>
          <Search size={17} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, settings, agents..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit',
            }}
          />
          <kbd style={{ ...kbdStyle, padding: '2px 6px', fontSize: 10 }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : filtered.map((item, i) => {
            const Icon = item.icon
            const highlighted = i === highlightIdx
            return (
              <button
                key={item.href}
                onClick={() => onNavigate(item.href)}
                onMouseEnter={() => setHighlightIdx(i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 12px',
                  background: highlighted ? 'var(--violet-soft)' : 'transparent',
                  border: 'none', borderRadius: 8,
                  color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', fontSize: 13,
                  fontFamily: 'inherit',
                }}
              >
                <Icon size={15} style={{ color: highlighted ? 'var(--violet)' : 'var(--text-secondary)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {item.sectionLabel}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer hints */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--divider)', display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-tertiary)' }}>
          <span><kbd style={kbdStyle}>↑↓</kbd>Navigate</span>
          <span><kbd style={kbdStyle}>↵</kbd>Open</span>
          <span><kbd style={kbdStyle}>ESC</kbd>Close</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
