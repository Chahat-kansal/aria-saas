export default function ProblemScene() {
  return (
    <>
      <div>
        <div className="scene-label">01 · The real problem</div>
        <h2>Running a small business means managing <em>ten jobs at once.</em></h2>
        <p className="body-copy">Staffing, compliance, reviews, stock, win-back campaigns, bookings, cash flow, competitor pricing — and still serving customers. No one person can do it all. That&apos;s what Aria is for.</p>
      </div>
      <div className="problem-stack">
        <div className="problem-card">
          <div className="problem-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <span className="text">No time to analyse your own numbers</span>
        </div>
        <div className="problem-card">
          <div className="problem-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <span className="text">Customers churn while you&apos;re busy serving</span>
        </div>
        <div className="problem-card">
          <div className="problem-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <span className="text">Compliance, reviews, and leaks slip through the cracks</span>
        </div>
      </div>
    </>
  )
}
