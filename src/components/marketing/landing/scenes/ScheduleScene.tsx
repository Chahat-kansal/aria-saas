export default function ScheduleScene() {
  const days = [
    { label: 'MON', blocks: ['sage', 'sage', 'dim'] },
    { label: 'TUE', blocks: ['amber', 'sage', 'dim'] },
    { label: 'WED', blocks: ['sage', 'sage', 'amber'] },
    { label: 'THU', blocks: ['sage', 'sage', 'sage'] },
    { label: 'FRI', blocks: ['sage', 'sage', 'sage'] },
    { label: 'SAT', blocks: ['sage', 'amber', 'sage'] },
    { label: 'SUN', blocks: ['dim', 'dim', 'dim'] },
  ]
  return (
    <>
      <div className="text-side">
        <div className="scene-label">06 · Schedule Agent</div>
        <h2>The roster <em>writes itself.</em></h2>
        <p className="body-copy">AU public holidays and footy schedules baked in. Staff colour-coded by role. RSA hours respected. You approve. Aria sends.</p>
      </div>
      <div className="mockup-side">
        <div className="schedule-mockup">
          <div className="notif-row">
            <div className="notif-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div><div className="notif-meta">Roster · Week 19</div></div>
          </div>
          <div style={{ marginTop: 12 }}>
            {days.map(({ label, blocks }) => (
              <div key={label} className="schedule-day-row">
                <span className="schedule-day-label">{label}</span>
                <div className="schedule-blocks">
                  {blocks.map((b, i) => <div key={i} className={`schedule-block ${b}`} />)}
                </div>
              </div>
            ))}
          </div>
          <span className="schedule-holiday-tag">Mon 12 May · Closed (Mother&apos;s Day adj.)</span>
        </div>
      </div>
    </>
  )
}
