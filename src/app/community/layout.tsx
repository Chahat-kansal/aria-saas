import type { Metadata } from 'next'
import { C, FONT } from './theme'
import { BottomNav } from './BottomNav'

export const metadata: Metadata = {
  title: 'Aria Community',
  description: 'Local Australian businesses, one feed. Browse anonymously. Follow only what you want to hear from.',
  robots: { index: false },
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT }}>
      <style>{`
        html, body { margin: 0; background: ${C.bg}; }
        /* Hide native scrollbar on horizontal carousels (stories) */
        .community-hide-scroll::-webkit-scrollbar { display: none; }
        .community-hide-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        @keyframes community-spin { to { transform: rotate(360deg); } }
        .community-spin { animation: community-spin 1s linear infinite; }
        @keyframes community-pop { 0% { transform: scale(0.8); opacity: 0.6; } 50% { transform: scale(1.18); } 100% { transform: scale(1); opacity: 1; } }
        .community-pop { animation: community-pop 320ms ease-out; }
      `}</style>
      {/* Pad bottom so the fixed bottom-nav doesn't cover content */}
      <div style={{ paddingBottom: 78 }}>
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
