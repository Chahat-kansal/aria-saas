'use client'
import { useEffect } from 'react'

// Routes that support GET — safe to warmup with GET
// POST-only routes (daily-briefing, business-brain, ask) are NOT pinged
// to avoid 405 errors in the console. Cold start latency on those is
// acceptable since they're user-triggered, not background.
const WARM_ROUTES = [
  '/api/health',
  '/api/aria/live-intelligence',
]

export default function WarmupPinger() {
  useEffect(() => {
    // Stagger the pings slightly to avoid hammering on mount
    WARM_ROUTES.forEach((url, i) => {
      setTimeout(() => {
        fetch(url, { method: 'GET' }).catch(() => {})
      }, i * 200)
    })
  }, [])
  return null
}
