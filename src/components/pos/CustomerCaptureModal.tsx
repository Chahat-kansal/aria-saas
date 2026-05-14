'use client'
import { useState } from 'react'

export interface CustomerDetails {
  name: string
  phone: string
  pickup_time: string
  notes: string
}

interface Props {
  orderType: string
  onConfirm: (details: CustomerDetails) => void
  onSkip: () => void
  onClose: () => void
}

function formatAusPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('04') && digits.length <= 10) {
    const p = digits.padEnd(10, '_')
    return `${p.slice(0,4)} ${p.slice(4,7)} ${p.slice(7,10)}`.replace(/_+/g, '')
  }
  return raw
}

export function CustomerCaptureModal({ orderType, onConfirm, onSkip, onClose }: Props) {
  const [name,        setName]       = useState('')
  const [phone,       setPhone]      = useState('')
  const [pickupTime,  setPickupTime] = useState('')
  const [notes,       setNotes]      = useState('')

  const isPickup   = orderType === 'pickup'
  const isDelivery = orderType === 'delivery'
  const title      = isDelivery ? 'Delivery details' : isPickup ? 'Pickup order' : 'Customer name'

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14,
    outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#111a14', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0, fontFamily: "'Fraunces',serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>
              Name {isDelivery ? '(required)' : '(for cup label)'}
            </label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Customer name"
              style={inputStyle} autoFocus />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Phone</label>
            <input value={phone} onChange={e => setPhone(formatAusPhone(e.target.value))}
              placeholder="0412 345 678" inputMode="tel"
              style={inputStyle} />
          </div>

          {(isPickup || isDelivery) && (
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>
                {isDelivery ? 'Delivery time' : 'Pickup time'}
              </label>
              <input type="datetime-local" value={pickupTime}
                onChange={e => setPickupTime(e.target.value)}
                style={inputStyle} />
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Order notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Allergies, delivery instructions..."
              rows={2}
              style={{ ...inputStyle, resize: 'none' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onSkip}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
            Skip
          </button>
          <button onClick={() => onConfirm({ name, phone, pickup_time: pickupTime, notes })}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: '#7FB897', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700 }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}