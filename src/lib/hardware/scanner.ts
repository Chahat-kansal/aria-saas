'use client'

export type ScanHandler = (barcode: string) => void

interface ScannerOptions {
  minLength?: number
  maxGapMs?: number
  stopPropagation?: boolean
}

let _handler: ScanHandler | null = null
let _buffer = ''
let _lastKeyAt = 0
let _attached = false

function handleKeydown(e: KeyboardEvent) {
  if (!_handler) return

  const now = Date.now()
  const gap = now - _lastKeyAt
  _lastKeyAt = now

  // Gap too large — treat as new scan sequence
  if (gap > (_options.maxGapMs ?? 80)) _buffer = ''

  if (e.key === 'Enter') {
    const code = _buffer.trim()
    _buffer = ''
    if (code.length >= (_options.minLength ?? 4)) {
      if (_options.stopPropagation) e.stopPropagation()
      _handler(code)
    }
    return
  }

  // Collect single printable character
  if (e.key.length === 1) {
    if (_options.stopPropagation) e.stopPropagation()
    _buffer += e.key
  }
}

let _options: ScannerOptions = {}

export function attachScanner(handler: ScanHandler, opts: ScannerOptions = {}): () => void {
  _handler = handler
  _options = opts
  _buffer = ''
  _lastKeyAt = 0
  if (!_attached) {
    window.addEventListener('keydown', handleKeydown, { capture: true })
    _attached = true
  }
  return () => detachScanner()
}

export function detachScanner(): void {
  _handler = null
  _buffer = ''
  if (_attached) {
    window.removeEventListener('keydown', handleKeydown, { capture: true })
    _attached = false
  }
}

// React hook
import { useEffect } from 'react'

export function useScanner(handler: ScanHandler, opts: ScannerOptions = {}, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const detach = attachScanner(handler, opts)
    return detach
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
