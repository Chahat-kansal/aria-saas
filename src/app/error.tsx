'use client'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6"
      style={{ background: '#0E1411' }}
    >
      <div className="text-4xl">⚠️</div>
      <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
      <p className="text-sm max-w-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
        An unexpected error occurred. Your data is safe.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg text-sm font-semibold"
        style={{ background: '#7FB897', color: '#0E1411' }}
      >
        Try again
      </button>
      {process.env.NODE_ENV === 'development' && (
        <pre className="text-xs text-red-400 text-left max-w-lg overflow-auto mt-4">
          {error.message}
        </pre>
      )}
    </div>
  )
}
