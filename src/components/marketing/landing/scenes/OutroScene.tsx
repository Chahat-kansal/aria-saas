import Link from 'next/link'

export default function OutroScene() {
  return (
    <>
      <h1 className="outro-h1">Start your <em>trial.</em></h1>
      <div className="outro-cta-row">
        <Link
          href="/signup?utm_source=landing&utm_medium=outro_primary&utm_campaign=v3"
          className="btn-primary-large"
        >
          Start free trial <span>→</span>
        </Link>
        <Link href="/demo" className="btn-text">
          <span className="play-circle">▶</span> Watch 3-min demo
        </Link>
      </div>
      <p className="outro-microtext">No credit card · Free data import · Cancel anytime</p>
    </>
  )
}
