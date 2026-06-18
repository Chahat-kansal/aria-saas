import type { Metadata } from 'next'

// CX-SHELL-PRIVACY — Aria community is PROMOTION social media, not CONNECTION. Customer/member
// profiles must never be crawled, indexed, or discovered. This noindex applies ONLY to /community/u/*
// (member profiles); business profiles (/community/businesses/*) stay fully indexable so shops get found.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function MemberProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
