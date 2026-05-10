export default function ProblemScene() {
  return (
    <>
      <div>
        <div className="scene-label">01 · The shop today</div>
        <h2>Most POS systems are <em>filing cabinets</em> with a screen.</h2>
        <p className="body-copy">They don&apos;t see your stock running low. They don&apos;t read the room when sales drop on a Tuesday. They don&apos;t help you decide what to reorder.</p>
      </div>
      <div className="problem-stack">
        <div className="problem-card">
          <div className="problem-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/></svg>
          </div>
          <span className="text">Can&apos;t see your stock running low</span>
        </div>
        <div className="problem-card">
          <div className="problem-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m7 12 3-3 3 3 5-5"/></svg>
          </div>
          <span className="text">Can&apos;t read the room on a slow day</span>
        </div>
        <div className="problem-card">
          <div className="problem-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
          </div>
          <span className="text">Can&apos;t help you decide</span>
        </div>
      </div>
    </>
  )
}
