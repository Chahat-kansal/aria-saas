'use client'
import { useEffect } from 'react'

const WARM_ROUTES = [
  '/api/aria/daily-briefing',
  '/api/aria/ask',
  '/api/aria/live-intelligence',
  '/api/aria/business-brain',
]

export default function WarmupPinger() {
  useEffect(() => {
    WARM_ROUTES.forEach(url => fetch(url, { method: 'HEAD' }).catch(() => {}))
  }, [])
  return null
}
