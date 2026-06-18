import type { Metadata } from 'next'

// CX-SHELL-PRIVACY — businesses are PROMOTION: they WANT to be found. This overrides the community
// layout's global robots:{index:false}, so /community/businesses/* is indexable + crawlable while the
// rest of the community shell (feed, reels, member profiles) stays noindex.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
}

export default function BusinessProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
