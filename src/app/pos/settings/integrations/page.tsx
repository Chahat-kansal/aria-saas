export default function IntegrationsPage() {
  const integrations = [
    { name: 'Xero', desc: 'Sync sales and invoices to Xero accounting', logo: '📊', status: 'coming_soon' },
    { name: 'MYOB', desc: 'Export transactions to MYOB AccountRight', logo: '📒', status: 'coming_soon' },
    { name: 'Square', desc: 'Import products and customers from Square', logo: '⬛', status: 'coming_soon' },
    { name: 'Shopify', desc: 'Sync online and in-store inventory', logo: '🛍️', status: 'coming_soon' },
    { name: 'Stripe', desc: 'Process card payments via Stripe Terminal', logo: '💳', status: 'coming_soon' },
    { name: 'QuickBooks', desc: 'Sync financial data to QuickBooks Online', logo: '📘', status: 'coming_soon' },
  ];
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6"><h1 className="text-xl font-semibold text-[#1a1a16]">Integrations</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Connect your POS to accounting and payment systems</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {integrations.map(i=>(
          <div key={i.name} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5 flex items-start gap-4">
            <div className="text-3xl flex-shrink-0">{i.logo}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#1a1a16]">{i.name}</p>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 flex-shrink-0">Soon</span>
              </div>
              <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{i.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 bg-[rgba(29,158,117,0.06)] border border-[rgba(29,158,117,0.15)] rounded-2xl p-4">
        <p className="text-sm font-medium text-[#1a6645]">Request an integration</p>
        <p className="text-xs text-[rgba(26,26,22,.5)] mt-1">Need a specific integration not listed? Contact us and we&apos;ll prioritise it in our roadmap.</p>
      </div>
    </div>
  );
}
