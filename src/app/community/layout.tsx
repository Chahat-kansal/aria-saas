import type { Metadata } from 'next'
import { C, FONT } from './theme'

export const metadata: Metadata = {
  title: 'Aria Community',
  description: 'Local Australian businesses, one feed. Browse anonymously. Follow only what you want to hear from.',
  robots: { index: false },
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT }}>
      <style>{`html, body { margin: 0; background: ${C.bg}; }`}</style>
      {children}
    </div>
  )
}
