'use client'
import { LayoutGrid, AlertTriangle, Clock } from 'lucide-react'
import { Player } from '@remotion/player'
import { RevenueChartComp } from '../remotion/RevenueChartComp'

const CARDS = [
  { Icon: LayoutGrid, title: 'Six apps, one headache', body: 'You check 6 different apps for sales, stock, reviews, and staff.' },
  { Icon: AlertTriangle, title: 'Problems found too late', body: "You find out about problems after they've already cost you money." },
  { Icon: Clock, title: "Yesterday's numbers", body: 'Your accountant tells you what happened last month. Nobody tells you what to do today.' },
]

export default function ProblemSceneNew() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>The pain</div>
      <h2 style={{ textAlign: 'center' }}>Running a small business is <em>hard.</em></h2>
      <p style={{ textAlign: 'center', color: '#9BA8A0', fontSize: '1.05rem', marginTop: '-8px', marginBottom: '2rem' }}>Your current tools make it harder.</p>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem',
        width: '100%', maxWidth: 900, marginInline: 'auto',
      }}>
        {CARDS.map(({ Icon, title, body }, i) => (
          <div key={title} style={{
            background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 14,
            padding: '1.5rem 1.4rem', textAlign: 'left',
            animation: 'l-cardUp 700ms cubic-bezier(0.16,1,0.3,1) ' + (0.1 + i * 0.1) + 's both',
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(127,184,151,0.12)', border: '1px solid rgba(127,184,151,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.9rem' }}>
              <Icon size={20} color="#7FB897" strokeWidth={1.75} />
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', marginBottom: '0.4rem' }}>{title}</div>
            <div style={{ fontSize: '0.9rem', color: '#9BA8A0', lineHeight: 1.5 }}>{body}</div>
          </div>
        ))}
      </div>
      <Player
        component={RevenueChartComp}
        durationInFrames={120}
        fps={30}
        compositionWidth={560}
        compositionHeight={240}
        style={{ width: '100%', maxWidth: 500, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)', marginInline: 'auto', marginTop: '1.5rem' }}
        loop
        autoPlay
      />
    </>
  )
}
