'use client'
import { useState, useEffect, useCallback } from 'react'

interface HardwareDevice {
  id: string
  device_type: string
  connection_type: string
  network_address: string | null
  port: number | null
  outlet_id: string | null
  register_id: string | null
  is_active: boolean
  last_seen_at: string | null
  last_error: string | null
  config: Record<string, unknown> | null
}

const DEVICE_TYPES = ['receipt_printer', 'kitchen_printer', 'label_printer', 'cash_drawer', 'barcode_scanner', 'card_reader', 'customer_display', 'scale'] as const
const CONNECTION_TYPES = ['usb', 'bluetooth', 'network_tcp', 'network_udp', 'serial', 'hid', 'cloud'] as const

type DeviceType = typeof DEVICE_TYPES[number]
type ConnectionType = typeof CONNECTION_TYPES[number]

export default function HardwareDevicesPage() {
  const [devices, setDevices] = useState<HardwareDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<HardwareDevice | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [aiDiag, setAiDiag] = useState<string | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/pos/hardware-devices')
    const d = await r.json()
    setDevices(d.devices ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  async function saveNew(form: Partial<HardwareDevice>) {
    const r = await fetch('/api/pos/hardware-devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) { setShowAdd(false); fetchDevices() }
  }

  async function saveEdit(id: string, form: Partial<HardwareDevice>) {
    const r = await fetch(`/api/pos/hardware-devices/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) { setEditing(null); fetchDevices() }
  }

  async function remove(id: string) {
    if (!confirm('Remove this device?')) return
    await fetch(`/api/pos/hardware-devices/${id}`, { method: 'DELETE' })
    fetchDevices()
  }

  async function testDevice(id: string) {
    setTestingId(id)
    try {
      await fetch(`/api/pos/hardware-devices/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_print' }),
      })
      fetchDevices()
    } finally {
      setTestingId(null)
    }
  }

  async function runAiDiag() {
    const errored = devices.filter(d => d.last_error)
    if (errored.length === 0) { setAiDiag('No errors detected on any device.'); return }
    setDiagLoading(true)
    try {
      const r = await fetch('/api/aria/hardware-troubleshoot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devices: errored }),
      })
      const d = await r.json()
      setAiDiag(d.diagnosis ?? 'No diagnosis available.')
    } finally {
      setDiagLoading(false)
    }
  }

  function labelDevice(type: string) {
    const map: Record<string, string> = {
      receipt_printer: 'Receipt Printer', kitchen_printer: 'Kitchen Printer', label_printer: 'Label Printer',
      cash_drawer: 'Cash Drawer', barcode_scanner: 'Barcode Scanner', card_reader: 'Card Reader',
      customer_display: 'Customer Display', scale: 'Scale',
    }
    return map[type] ?? type
  }

  function labelConn(type: string) {
    const map: Record<string, string> = {
      usb: 'USB', bluetooth: 'Bluetooth', network_tcp: 'Network TCP', network_udp: 'Network UDP',
      serial: 'Serial', hid: 'HID', cloud: 'Cloud',
    }
    return map[type] ?? type
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Hardware Devices</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Manage printers, cash drawers, scanners, and other POS peripherals.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runAiDiag} disabled={diagLoading} className="px-3 py-2 rounded-xl text-sm border border-[rgba(0,0,0,.1)] text-[#1a1a16]">
            {diagLoading ? 'Diagnosing…' : 'AI Diagnose'}
          </button>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">+ Add device</button>
        </div>
      </div>

      {aiDiag && (
        <div className="mb-4 p-4 bg-violet-50 rounded-xl text-sm text-[#1a1a16] whitespace-pre-wrap">
          <strong className="block mb-1">AI Diagnosis</strong>
          {aiDiag}
          <button onClick={() => setAiDiag(null)} className="mt-2 text-xs text-[rgba(26,26,22,.4)]">Dismiss</button>
        </div>
      )}

      {loading ? <div className="text-sm text-[rgba(26,26,22,.5)]">Loading…</div> : (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden">
          {devices.length === 0 ? (
            <p className="text-sm text-[rgba(26,26,22,.4)] p-8 text-center">No devices configured. Add a device to get started.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[rgba(0,0,0,.02)] text-xs font-medium text-[rgba(26,26,22,.5)]">
                <tr>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Connection</th>
                  <th className="text-left px-4 py-3">Address</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.id} className="border-t border-[rgba(0,0,0,.04)]">
                    <td className="px-4 py-3 font-medium">{labelDevice(d.device_type)}</td>
                    <td className="px-4 py-3 text-xs">{labelConn(d.connection_type)}</td>
                    <td className="px-4 py-3 text-xs font-mono">{d.network_address ? `${d.network_address}:${d.port ?? 9100}` : '—'}</td>
                    <td className="px-4 py-3">
                      {d.last_error
                        ? <span className="text-xs text-red-600 truncate max-w-[140px] block" title={d.last_error}>Error</span>
                        : d.last_seen_at ? <span className="text-xs text-green-600">Online</span>
                        : <span className="text-xs text-[rgba(26,26,22,.4)]">Not tested</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => testDevice(d.id)} disabled={testingId === d.id} className="text-xs text-[#8B5CF6] mr-3">
                        {testingId === d.id ? 'Testing…' : 'Test'}
                      </button>
                      <button onClick={() => setEditing(d)} className="text-xs text-[#8B5CF6] mr-3">Edit</button>
                      <button onClick={() => remove(d.id)} className="text-xs text-red-600">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(showAdd || editing) && (
        <DeviceModal
          initial={editing ?? undefined}
          onSave={(form) => editing ? saveEdit(editing.id, form) : saveNew(form)}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function DeviceModal({
  initial, onSave, onClose,
}: {
  initial?: Partial<HardwareDevice>
  onSave: (f: Partial<HardwareDevice>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Partial<HardwareDevice>>({
    device_type: (initial?.device_type as DeviceType) ?? 'receipt_printer',
    connection_type: (initial?.connection_type as ConnectionType) ?? 'network_tcp',
    network_address: initial?.network_address ?? '',
    port: initial?.port ?? 9100,
    is_active: initial?.is_active ?? true,
  })
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{initial?.id ? 'Edit device' : 'Add device'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Device type</label>
            <select value={form.device_type ?? 'receipt_printer'} onChange={e => setForm(f => ({ ...f, device_type: e.target.value as DeviceType }))} className="w-full border rounded-xl px-3 py-2 text-sm">
              {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Connection type</label>
            <select value={form.connection_type ?? 'network_tcp'} onChange={e => setForm(f => ({ ...f, connection_type: e.target.value as ConnectionType }))} className="w-full border rounded-xl px-3 py-2 text-sm">
              {CONNECTION_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
          </div>
          {(form.connection_type === 'network_tcp' || form.connection_type === 'network_udp') && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">IP Address</label>
                <input value={form.network_address ?? ''} onChange={e => setForm(f => ({ ...f, network_address: e.target.value }))} placeholder="192.168.1.100" className="w-full border rounded-xl px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.5)] mb-1">Port</label>
                <input type="number" value={form.port ?? 9100} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 9100 }))} className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Cancel</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">Save</button>
        </div>
      </div>
    </div>
  )
}
