'use client'

interface Props {
  imageSrc: string
  videoSrc?: string
  name: string
  alt: string
  size?: number
}

export function ProductHero({ imageSrc, videoSrc, name, alt, size = 260 }: Props) {
  const plateW = Math.round(size * 0.88)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        flexShrink: 0,
      }}
    >
      {/* Hero wrapper — positions image above the plate */}
      <div
        style={{
          position: 'relative',
          width: size,
          /* reserve plate space below */
          paddingBottom: 16,
        }}
      >
        {/* Plate surface — same spec as LayeredProduct */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: plateW,
            height: 26,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center top, #ffffff 30%, #ece8de 100%)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.07)',
            pointerEvents: 'none',
          }}
        />

        {/* Hero: video or image */}
        {videoSrc ? (
          <video
            src={videoSrc}
            poster={imageSrc}
            muted
            autoPlay
            loop
            playsInline
            style={{
              display: 'block',
              width: size,
              height: size,
              objectFit: 'contain',
              filter: 'drop-shadow(0 8px 28px rgba(0,0,0,0.14))',
              position: 'relative',
              zIndex: 1,
            }}
          />
        ) : (
          <img
            src={imageSrc}
            alt={alt}
            style={{
              display: 'block',
              width: size,
              height: size,
              objectFit: 'contain',
              filter: 'drop-shadow(0 8px 28px rgba(0,0,0,0.14))',
              position: 'relative',
              zIndex: 1,
            }}
          />
        )}
      </div>

      {/* Name label */}
      <p
        style={{
          margin: '12px 0 0',
          fontFamily: 'Inter, sans-serif',
          fontSize: 15,
          fontWeight: 600,
          color: '#111',
          letterSpacing: '-0.02em',
          textAlign: 'center',
        }}
      >
        {name}
      </p>
    </div>
  )
}