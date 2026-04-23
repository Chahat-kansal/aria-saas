export default function GiftCardsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#1a1a16]">Gift Cards</h1>
        <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Issue and manage gift card balances</p>
      </div>
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm p-12 text-center">
        <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(37,99,235,.08)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-[#2563eb]">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-[#1a1a16] mb-1">Gift Cards</p>
        <p className="text-xs text-[rgba(26,26,22,.4)]">This feature is coming soon</p>
      </div>
    </div>
  );
}
