'use client'
import { Sun, MessageCircle, ScanLine, Eye, Bell, FileText } from 'lucide-react'
import { Player } from '@remotion/player'
import { DailyBriefingComp } from '../remotion/DailyBriefingComp'

const FEATURES = [
  { Icon: Sun, title: 'Daily Briefing', body: 'Every morning, the 3 things that need you today — ranked by impact.' },
  { Icon: MessageCircle, title: 'Ask Aria', body: 'Any question about your business, answered in plain English.' },
  { Icon: ScanLine, title: 'POS System', body: 'A full point-of-sale that learns what sells and what stalls.' },
  { Icon: Eye, title: 'Competitor Intelligence', body: "Know when rivals change prices before it costs you a sale." },
  { Icon: Bell, title: 'Smart Alerts', body: 'Low stock, slow days and risks flagged before they hurt.' },
  { Icon: FileText, title: 'Weekly Report', body: 'A clear read on the week and what to do next — no spreadsheets.' },
]

export default function MeetAriaScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Meet Aria</div>
      <h2 style={{ textAlign: 'center' }}>One AI that knows your <em>entire business</em></h2>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%', maxWidth: 920, marginInline: 'auto' }}>
        <Player
          component={DailyBriefingComp}
          durationInFrames={160}
          fps={30}
          compositionWidth={560}
          compositionHeight={310}
          style={{ width: '100%', maxWidth: 560, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)' }}
          loop
          autoPlay
        />
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem',
          width: '100%',
        }}>
          {FEATURES.map(({ Icon, title, body }, i) => (
            <div key={title} style={{
              background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 14,
              padding: '1.25rem 1.3rem', textAlign: 'left',
              animation: 'l-cardUp 700ms cubic-bezier(0.16,1,0.3,1) ' + (0.08 + i * 0.08) + 's both',
            }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(127,184,151,0.12)', border: '1px solid rgba(127,184,151,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                <Icon size={18} color="#7FB897" strokeWidth={1.75} />
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: '0.35rem' }}>{title}</div>
              <div style={{ fontSize: '0.85rem', color: '#9BA8A0', lineHeight: 1.5 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
