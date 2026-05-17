'use client'

import { useState, useCallback } from 'react'
import { connectUSBPrinter, connectHIDPrinter, setNetworkPrinter, disconnectPrinter, getActivePrinter, sendBytesToPrinter, type PrinterDevice } from './printer-client'
import { buildReceiptBytes, type ReceiptInput } from './escpos'
import { openCashDrawer } from './cash-drawer'

export type HardwareStatus = 'idle' | 'connecting' | 'ready' | 'error'

export interface HardwareState {
  status: HardwareStatus
  printer: PrinterDevice | null
  error: string | null
}

export function useHardware() {
  const [state, setState] = useState<HardwareState>({
    status: 'idle',
    printer: getActivePrinter(),
    error: null,
  })

  const connectUSB = useCallback(async () => {
    setState(s => ({ ...s, status: 'connecting', error: null }))
    try {
      const device = await connectUSBPrinter()
      setState({ status: 'ready', printer: device, error: null })
    } catch (err) {
      setState({ status: 'error', printer: null, error: (err as Error).message })
    }
  }, [])

  const connectHID = useCallback(async () => {
    setState(s => ({ ...s, status: 'connecting', error: null }))
    try {
      const device = await connectHIDPrinter()
      setState({ status: 'ready', printer: device, error: null })
    } catch (err) {
      setState({ status: 'error', printer: null, error: (err as Error).message })
    }
  }, [])

  const connectNetwork = useCallback((address: string, port?: number) => {
    try {
      const device = setNetworkPrinter(address, port)
      setState({ status: 'ready', printer: device, error: null })
    } catch (err) {
      setState({ status: 'error', printer: null, error: (err as Error).message })
    }
  }, [])

  const disconnect = useCallback(() => {
    disconnectPrinter()
    setState({ status: 'idle', printer: null, error: null })
  }, [])

  const testPrint = useCallback(async (input: ReceiptInput) => {
    const printer = getActivePrinter()
    if (!printer) throw new Error('No printer connected')
    const bytes = buildReceiptBytes(input)
    await sendBytesToPrinter(printer, bytes)
  }, [])

  const pulseDrawer = useCallback(async (pulseMs?: number) => {
    await openCashDrawer({ pulseMs })
  }, [])

  return { ...state, connectUSB, connectHID, connectNetwork, disconnect, testPrint, pulseDrawer }
}
