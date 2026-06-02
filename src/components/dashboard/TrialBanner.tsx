'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Props {
  daysLeft?: number | null
  isExpired?: boolean
}

export default function TrialBanner({ daysLeft, isExpired }: Props) {
  if (!isExpired && (daysLeft === null || daysLeft === undefined || daysLeft > 3)) return null

  if (isExpired) {
    return (
      <div className="w-full px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: '#f87171' }}>⚠️</span>
          <span className="text-xs font-medium" style={{ color: '#f87171' }}>
            Your trial has ended. AI features are paused and POS transactions are disabled.
            Your data is safe.
          </span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <a href="/api/business/export"
            className="text-xs px-3 py-1 rounded-lg font-medium"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
            Export data ↓
          </a>
          <Link href="/billing"
            className="text-xs px-3 py-1 rounded-lg font-semibold"
            style={{ background: '#f87171', color: '#fff' }}>
            Upgrade now →
          </Link>
        </div>
      </div>
    )
  }

  const urgentColor = daysLeft === 1 ? '#f87171' : daysLeft === 2 ? '#fb923c' : '#fbbf24'
  const urgentBg = daysLeft === 1
    ? 'rgba(239,68,68,0.08)' : daysLeft === 2
    ? 'rgba(251,146,60,0.08)' : 'rgba(251,191,36,0.08)'
  const urgentBorder = daysLeft === 1
    ? 'rgba(239,68,68,0.2)' : daysLeft === 2
    ? 'rgba(251,146,60,0.2)' : 'rgba(251,191,36,0.2)'

  return (
    <div className="w-full px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap"
      style={{ background: urgentBg, borderBottom: `1px solid ${urgentBorder}` }}>
      <span className="text-xs font-medium" style={{ color: urgentColor }}>
        ⏱ Your free trial ends in {daysLeft === 1 ? '1 day' : `${daysLeft} days`}.
        Upgrade to keep everything running.
      </span>
      <Link href="/billing"
        className="text-xs px-3 py-1 rounded-lg font-semibold flex-shrink-0"
        style={{ background: urgentColor, color: '#fff' }}>
        View plans →
      </Link>
    </div>
  )
}
