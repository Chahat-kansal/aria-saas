export default function EnterprisePoliciesPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6"><h1 className="text-xl font-semibold text-[#1a1a16]">Enterprise Policies</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Advanced access control and compliance for multi-location businesses</p></div>
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(29,158,117,0.1)] flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.5" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
        </div>
        <p className="text-sm font-semibold text-[#1a1a16] mb-1">Enterprise features</p>
        <p className="text-sm text-[rgba(26,26,22,.5)] max-w-sm mx-auto">Role-based access control, audit logs, multi-location policy enforcement, and SSO are available on Enterprise plans.</p>
        <a href="/dashboard/settings" className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-xl text-sm font-medium bg-[#1D9E75] text-white">Upgrade to Enterprise →</a>
      </div>
    </div>
  );
}
