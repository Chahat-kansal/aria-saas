'use client'

export function AuroraCanvas() {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 1100px 700px at 8% 12%, rgba(127, 184, 151, 0.16), transparent 55%),
            radial-gradient(ellipse 900px 650px at 92% 18%, rgba(58, 90, 64, 0.20), transparent 60%),
            radial-gradient(ellipse 1300px 800px at 50% 95%, rgba(101, 177, 121, 0.14), transparent 65%),
            linear-gradient(160deg, var(--terminal-bg-aurora) 0%, var(--terminal-bg-canvas) 70%)
          `,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          opacity: 0.4,
          mixBlendMode: 'overlay',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.025 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
        }}
      />
    </>
  )
}
