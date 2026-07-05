'use client'

import { useEffect, useState, useCallback } from 'react'

type Settings = {
  online_ordering_enabled: boolean
  accept_orders: boolean
  business_name: string
}

type Props = { businessId: string }

const archetypeRows: { archetype: string; label: string }[] = [
  { archetype: 'coffee-spin', label: 'Spin360 coffee cup animation' },
  { archetype: 'bottle', label: 'Spin360 bottle spin' },
  { archetype: 'salad', label: 'Build-your-own customiser' },
  { archetype: 'toastie', label: 'Build-your-own customiser' },
  { archetype: 'wrap', label: 'Build-your-own customiser' },
  { archetype: 'bowl', label: 'Build-your-own customiser' },
  { archetype: 'breakfast', label: 'Build-your-own customiser' },
  { archetype: 'hero-photo', label: 'Full-bleed product hero photo' },
  { archetype: '(standard)', label: 'Standard product card' },
]

export default function SettingsTab({ businessId }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [initial, setInitial] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/pos/menu/settings')
      .then((r) => r.json())
      .then((data) => {
        const s: Settings = data.settings
        setSettings(s)
        setInitial(s)
      })
      .catch(() => {})
  }, [])

  const hasChanges =
    settings !== null &&
    initial !== null &&
    (settings.online_ordering_enabled !== initial.online_ordering_enabled ||
      settings.accept_orders !== initial.accept_orders)

  const handleSave = useCallback(async () => {
    if (!settings) return
    setSaving(true)
    try {
      await fetch('/api/pos/menu/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          online_ordering_enabled: settings.online_ordering_enabled,
          accept_orders: settings.accept_orders,
        }),
      })
      setInitial(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (_) {}
    setSaving(false)
  }, [settings])

  const toggle = (key: keyof Pick<Settings, 'online_ordering_enabled' | 'accept_orders'>) => {
    setSettings((prev) => prev ? { ...prev, [key]: !prev[key] } : prev)
  }

  const getSubtitle = (): string => {
    if (!settings) return ''
    if (!settings.online_ordering_enabled) return 'Ordering is hidden from your public menu'
    if (settings.accept_orders) return 'Orders are live — customers can checkout'
    return 'Browse-only — customers can view but not order'
  }

  const containerStyle: React.CSSProperties = {
    fontFamily: "'Outfit', system-ui, sans-serif",
    background: '#fafafa',
    color: '#0a0a0a',
    padding: '32px 24px 120px',
    minHeight: '100%',
    maxWidth: '640px',
    margin: '0 auto',
  }

  const sectionHeadingStyle: React.CSSProperties = {
    fontFamily: "'Cormorant', Georgia, serif",
    fontStyle: 'italic',
    fontWeight: 700,
    fontSize: '20px',
    lineHeight: 1.2,
    color: '#0a0a0a',
    marginBottom: '4px',
  }

  const cardStyle: React.CSSProperties = {
    background: '#f0f0f0',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px 22px',
    marginBottom: '16px',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 500,
    color: '#0a0a0a',
    lineHeight: 1.3,
  }

  const descStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#6b6b6b',
    marginTop: '4px',
    lineHeight: 1.5,
  }

  const pillTrackStyle = (on: boolean): React.CSSProperties => ({
    position: 'relative',
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    background: on ? '#0a0a0a' : '#c8c8c8',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.18s ease',
    border: 'none',
    outline: 'none',
  })

  const pillThumbStyle = (on: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: '3px',
    left: on ? '21px' : '3px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: on ? '#d9f54e' : '#ffffff',
    transition: 'left 0.18s ease',
    pointerEvents: 'none',
  })

  const infoHeaderStyle: React.CSSProperties = {
    fontFamily: "'Cormorant', Georgia, serif",
    fontStyle: 'italic',
    fontWeight: 700,
    fontSize: '18px',
    color: '#0a0a0a',
    marginBottom: '14px',
  }

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: 600,
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b6b6b',
    paddingBottom: '8px',
    borderBottom: '1px solid #d8d8d8',
  }

  const saveButtonStyle: React.CSSProperties = {
    background: '#d9f54e',
    color: '#0a0a0a',
    border: 'none',
    borderRadius: '12px',
    height: '44px',
    padding: '0 28px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: 600,
    fontSize: '14px',
    cursor: saving ? 'not-allowed' : 'pointer',
    opacity: saving ? 0.7 : 1,
    whiteSpace: 'nowrap' as const,
  }

  const unsavedBarStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#fffde7',
    borderTop: '1px solid #f0e04a',
    padding: '12px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    zIndex: 50,
  }

  const unsavedTextStyle: React.CSSProperties = {
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontSize: '14px',
    color: '#5a4a00',
    fontWeight: 500,
  }

  const savedBarStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#f0f9e8',
    borderTop: '1px solid #b8e084',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 50,
  }

  const savedTextStyle: React.CSSProperties = {
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontSize: '14px',
    color: '#2d5a0e',
    fontWeight: 600,
  }

  if (!settings) {
    return (
      <div style={{ ...containerStyle, paddingTop: '64px', textAlign: 'center', color: '#6b6b6b', fontSize: '14px' }}>
        Loading settings&hellip;
      </div>
    )
  }

  return (
    <div style={containerStyle}>

      {/* Section 1: Online Ordering */}
      <div style={cardStyle}>
        <div style={rowStyle}>
          <div>
            <div style={sectionHeadingStyle}>Online Ordering</div>
            <div style={descStyle}>{getSubtitle()}</div>
          </div>
          <button
            role="switch"
            aria-checked={settings.online_ordering_enabled}
            aria-label="Online ordering"
            onClick={() => toggle('online_ordering_enabled')}
            style={pillTrackStyle(settings.online_ordering_enabled)}
          >
            <span style={pillThumbStyle(settings.online_ordering_enabled)} />
          </button>
        </div>
      </div>

      {/* Section 2: Accept Orders — only when ordering is enabled */}
      {settings.online_ordering_enabled && (
        <div style={cardStyle}>
          <div style={rowStyle}>
            <div>
              <div style={labelStyle}>Accept new orders</div>
              <div style={descStyle}>Turn off to pause orders without hiding your menu</div>
            </div>
            <button
              role="switch"
              aria-checked={settings.accept_orders}
              aria-label="Accept new orders"
              onClick={() => toggle('accept_orders')}
              style={pillTrackStyle(settings.accept_orders)}
            >
              <span style={pillThumbStyle(settings.accept_orders)} />
            </button>
          </div>
        </div>
      )}

      {/* Section 3: Archetype -> Render type info card */}
      <div style={cardStyle}>
        <div style={infoHeaderStyle}>Archetype → Render type</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, paddingRight: '24px' }}>Archetype</th>
                <th style={thStyle}>Customer sees</th>
              </tr>
            </thead>
            <tbody>
              {archetypeRows.map((row, i) => {
                const isEven = i % 2 === 0
                const tdBase: React.CSSProperties = {
                  padding: '8px 0',
                  verticalAlign: 'top',
                  background: isEven ? 'transparent' : 'rgba(0,0,0,0.03)',
                  fontVariantNumeric: 'tabular-nums',
                }
                return (
                  <tr key={row.archetype}>
                    <td style={{ ...tdBase, paddingRight: '24px', paddingLeft: isEven ? '0' : '8px', borderRadius: '4px 0 0 4px' }}>
                      <span style={{ fontFamily: "'Outfit', monospace", fontSize: '12px', background: '#e4e4e4', borderRadius: '4px', padding: '2px 6px', color: '#0a0a0a', whiteSpace: 'nowrap' as const }}>
                        {row.archetype}
                      </span>
                    </td>
                    <td style={{ ...tdBase, paddingLeft: isEven ? '0' : '8px', borderRadius: '0 4px 4px 0', color: '#444', fontSize: '13px' }}>
                      {row.label}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Explicit Save button (always visible) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{ ...saveButtonStyle, opacity: (saving || !hasChanges) ? 0.5 : 1, cursor: (saving || !hasChanges) ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}
        </button>
      </div>

      {/* Unsaved changes bar */}
      {hasChanges && !saved && (
        <div style={unsavedBarStyle}>
          <span style={unsavedTextStyle}>You have unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            style={saveButtonStyle}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Saved confirmation bar */}
      {saved && (
        <div style={savedBarStyle}>
          <span style={savedTextStyle}>Saved ✓</span>
        </div>
      )}

    </div>
  )
}