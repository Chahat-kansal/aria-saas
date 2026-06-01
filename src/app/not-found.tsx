import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6"
      style={{ background: '#0E1411' }}
    >
      <div
        style={{
          fontFamily: "'Cormorant', Georgia, serif",
          fontSize: 80,
          color: '#7FB897',
          opacity: 0.3,
          fontStyle: 'italic',
          lineHeight: 1,
        }}
      >
        404
      </div>
      <h1 className="text-xl font-semibold text-white">Page not found</h1>
      <p className="text-sm max-w-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link
        href="/dashboard"
        className="px-4 py-2 rounded-lg text-sm font-semibold mt-2 inline-block"
        style={{ background: '#7FB897', color: '#0E1411' }}
      >
        Back to dashboard
      </Link>
    </div>
  )
}
