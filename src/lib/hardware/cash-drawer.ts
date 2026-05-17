'use client'

import { buildDrawerPulseBytes } from './escpos'
import { sendBytesToPrinter, getActivePrinter } from './printer-client'

export interface DrawerPulseOptions {
  pulseMs?: number
}

export async function openCashDrawer(opts: DrawerPulseOptions = {}): Promise<void> {
  const printer = getActivePrinter()
  if (!printer) throw new Error('No printer connected — cash drawer requires a connected printer')
  const bytes = buildDrawerPulseBytes(opts.pulseMs ?? 60)
  await sendBytesToPrinter(printer, bytes)
}

export async function openCashDrawerViaNetwork(address: string, port = 9100, opts: DrawerPulseOptions = {}): Promise<void> {
  const bytes = buildDrawerPulseBytes(opts.pulseMs ?? 60)
  const resp = await fetch('/api/pos/hardware-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-printer-host': address,
      'x-printer-port': String(port),
    },
    body: bytes.buffer as BodyInit,
  })
  if (!resp.ok) throw new Error(`Cash drawer pulse failed: ${resp.status}`)
}
