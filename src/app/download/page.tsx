import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Download Aria OS for Windows',
  description: 'Get the Aria OS desktop app for Windows — your business, one machine, always on.',
  alternates: { canonical: 'https://www.ariaos.site/download' },
  openGraph: {
    title: 'Download Aria OS for Windows',
    description: 'Get the Aria OS desktop app for Windows — your business, one machine, always on.',
    url: 'https://www.ariaos.site/download',
    siteName: 'Aria OS',
    locale: 'en_AU',
    type: 'website',
  },
}

// The desktop app's own GitHub repo — separate project from this one, so it's read from env
// rather than hardcoded, and simply doesn't exist until it's set. Format: "owner/repo".
const REPO = process.env.CANOPY_GITHUB_REPO ?? null

interface ReleaseInfo {
  version: string
  sizeLabel: string
  downloadUrl: string
  releaseUrl: string
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB'
}

async function getLatestRelease(): Promise<ReleaseInfo | null> {
  if (!REPO) return null
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json() as {
      tag_name?: string
      html_url?: string
      assets?: Array<{ name: string; size: number; browser_download_url: string }>
    }
    const exe = (data.assets ?? []).find(a => a.name.toLowerCase().endsWith('.exe'))
    if (!exe) return null
    return {
      version: data.tag_name ?? '',
      sizeLabel: formatBytes(exe.size),
      downloadUrl: exe.browser_download_url,
      releaseUrl: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
    }
  } catch {
    return null
  }
}

export default async function DownloadPage() {
  const release = await getLatestRelease()
  const fallbackReleasesUrl = REPO ? `https://github.com/${REPO}/releases/latest` : null

  return (
    <div style={{
      minHeight: '100vh', background: '#090e0b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: "'Inter',sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>
        <p style={{ fontSize: 13, letterSpacing: '0.2em', color: '#7FB897', textTransform: 'uppercase', margin: '0 0 12px' }}>
          Aria OS
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: '#fff', margin: '0 0 12px', fontFamily: "'Fraunces',serif" }}>
          The desktop app
        </h1>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: '0 0 40px', lineHeight: 1.6 }}>
          Your business, one machine, always on. Boots straight into Aria OS — no browser tab to lose.
        </p>

        <div style={{
          background: '#111a14', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 16,
          padding: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'rgba(127,184,151,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7FB897" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h6l1.5 2h7.5A1.5 1.5 0 0 1 21 7.5v11A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-13z" />
            </svg>
          </div>

          {release ? (
            <>
              <a
                href={release.downloadUrl}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '14px 28px', borderRadius: 10, background: '#7FB897',
                  color: '#0a0a0a', fontWeight: 700, fontSize: 16, textDecoration: 'none',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v13m0 0-4.5-4.5M12 16l4.5-4.5" /><path d="M4 19.5h16" />
                </svg>
                Download for Windows
              </a>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                {release.version && <>Version {release.version} · </>}{release.sizeLabel} · Windows 10/11 · .exe installer
              </p>
              <a href={release.releaseUrl} style={{ fontSize: 12.5, color: 'rgba(127,184,151,0.75)', textDecoration: 'none' }}>
                Release notes ↗
              </a>
            </>
          ) : fallbackReleasesUrl ? (
            <>
              <a
                href={fallbackReleasesUrl}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '14px 28px', borderRadius: 10, background: '#7FB897',
                  color: '#0a0a0a', fontWeight: 700, fontSize: 16, textDecoration: 'none',
                }}
              >
                Download for Windows
              </a>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Windows 10/11 · .exe installer</p>
            </>
          ) : (
            <>
              <div style={{
                padding: '12px 22px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 15,
              }}>
                Coming soon
              </div>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', margin: 0, maxWidth: 320 }}>
                The Windows installer isn't published yet — check back shortly, or{' '}
                <a href="/contact" style={{ color: '#7FB897' }}>get in touch</a> for early access.
              </p>
            </>
          )}
        </div>

        <p style={{ marginTop: 32, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          Prefer the browser? <a href="https://www.ariaos.site" style={{ color: 'rgba(127,184,151,0.6)' }}>ariaos.site</a> works exactly the same, no install required.
        </p>
      </div>
    </div>
  )
}
