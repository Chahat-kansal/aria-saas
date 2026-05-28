import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { PALETTE, FONT, NAV_HEIGHT } from './theme'
import { BottomNav } from './BottomNav'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' })

export const metadata: Metadata = {
  title: 'Aria Community',
  description: 'Local Australian businesses, one feed. Browse anonymously. Follow only what you want to hear from.',
  robots: { index: false },
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.className} style={{ minHeight: '100vh', background: PALETTE.bg, color: PALETTE.ink, fontFamily: FONT }}>
      <style>{`
        html, body { margin: 0; background: ${PALETTE.bg}; }
        /* Hide native scrollbar on horizontal carousels (stories) */
        .community-hide-scroll::-webkit-scrollbar { display: none; }
        .community-hide-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        @keyframes community-spin { to { transform: rotate(360deg); } }
        .community-spin { animation: community-spin 1s linear infinite; }
        @keyframes community-pop { 0% { transform: scale(0.8); opacity: 0.6; } 50% { transform: scale(1.18); } 100% { transform: scale(1); opacity: 1; } }
        .community-pop { animation: community-pop 320ms ease-out; }
      `}</style>
      {/* Pad bottom so the floating bottom-nav doesn't cover content */}
      <div style={{ paddingBottom: NAV_HEIGHT }}>
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
