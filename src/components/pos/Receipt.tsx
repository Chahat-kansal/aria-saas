'use client';

export interface ReceiptSale {
  id: string;
  sale_number?: string;
  created_at: string;
  cartSnapshot: Array<{
    product: { name: string };
    label?: string;
    qty: number;
    unitPrice: number;
    discount_percent?: number;
    modifierDetails?: Array<{ name: string }>;
  }>;
  total_amount?: number;
  tax_amount?: number;
  payment_method?: string;
  cash_tendered?: number;
  change_given?: number;
  customerSnapshot?: { name: string; loyalty_points?: number } | null;
  businessName?: string;
  served_by?: string;
  loyaltyEarned?: number;
}

export interface ReceiptSettings {
  receipt_header?: string;
  receipt_footer?: string;
  receipt_show_gst?: boolean;
  receipt_show_cashier?: boolean;
  receipt_show_loyalty?: boolean;
  receipt_logo_url?: string;
  business_abn?: string;
  business_address?: string;
  business_phone?: string;
  business_website?: string;
}

interface Props {
  sale: ReceiptSale;
  settings?: ReceiptSettings;
  businessName?: string;
  ariaMessage?: string;
  onClose?: () => void;
}

export default function Receipt({ sale, settings = {}, businessName, ariaMessage, onClose }: Props) {
  const bName = businessName ?? sale.businessName ?? 'AriaPOS';
  const total = sale.total_amount ?? 0;
  const tax   = sale.tax_amount ?? (total - total / 1.1);
  const date  = new Date(sale.created_at ?? Date.now());
  const showGst      = settings.receipt_show_gst !== false;
  const showCashier  = settings.receipt_show_cashier !== false;
  const showLoyalty  = settings.receipt_show_loyalty !== false;

  function print() {
    window.print();
  }

  const subTotal = (sale.cartSnapshot ?? []).reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0);

  return (
    <>
      {/* Print styles injected inline so no global CSS needed */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .receipt-print, .receipt-print * { visibility: visible !important; }
          .receipt-print {
            position: fixed !important; inset: 0 !important;
            width: 80mm !important; margin: 0 auto !important;
            font-size: 11px !important; background: white !important;
            color: black !important; padding: 4mm !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 no-print" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ width: 360 }}>
          {/* Modal header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Receipt</span>
            <div className="flex items-center gap-2 no-print">
              <button onClick={print}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                🖨️ Print
              </button>
              {onClose && (
                <button onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  Close
                </button>
              )}
            </div>
          </div>

          {/* Scrollable receipt body */}
          <div className="overflow-y-auto flex-1">
            <div className="receipt-print p-5">
              {/* Logo */}
              {settings.receipt_logo_url && (
                <div className="text-center mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={settings.receipt_logo_url} alt="Logo" style={{ maxWidth: 100, maxHeight: 48, margin: '0 auto' }} />
                </div>
              )}

              {/* Business header */}
              <div className="text-center mb-3 space-y-0.5">
                <p className="font-bold text-base">{bName}</p>
                {settings.business_address && <p className="text-xs text-gray-600">{settings.business_address}</p>}
                {settings.business_phone && <p className="text-xs text-gray-600">{settings.business_phone}</p>}
                {settings.business_website && <p className="text-xs text-gray-600">{settings.business_website}</p>}
                {settings.business_abn && <p className="text-xs text-gray-600">ABN: {settings.business_abn}</p>}
              </div>

              {settings.receipt_header && (
                <>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  <p className="text-xs text-center text-gray-600 mb-2">{settings.receipt_header}</p>
                </>
              )}

              <div className="border-t border-dashed border-gray-300 my-2" />

              {/* Receipt meta */}
              <div className="space-y-0.5 mb-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Receipt</span>
                  <span className="font-mono">{sale.sale_number ?? sale.id.slice(-8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Date</span>
                  <span>{date.toLocaleDateString('en-AU')}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Time</span>
                  <span>{date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {showCashier && sale.served_by && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Cashier</span>
                    <span>{sale.served_by}</span>
                  </div>
                )}
                {sale.customerSnapshot && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Customer</span>
                    <span>{sale.customerSnapshot.name}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-gray-300 my-2" />

              {/* Line items */}
              <div className="space-y-1.5 mb-2">
                {(sale.cartSnapshot ?? []).map((item, i) => {
                  const name = item.label ?? item.product.name;
                  const lineTotal = item.unitPrice * item.qty * (1 - (item.discount_percent ?? 0) / 100);
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs">
                        <span className="flex-1 mr-2 font-medium">{name}</span>
                        <span className="font-mono">A${lineTotal.toFixed(2)}</span>
                      </div>
                      {item.qty > 1 && (
                        <p className="text-[10px] text-gray-400 ml-1">{item.qty} × A${item.unitPrice.toFixed(2)}</p>
                      )}
                      {item.discount_percent && item.discount_percent > 0 && (
                        <p className="text-[10px] text-green-600 ml-1">{item.discount_percent}% discount</p>
                      )}
                      {item.modifierDetails?.map(m => (
                        <p key={m.name} className="text-[10px] text-gray-400 italic ml-1">+ {m.name}</p>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-dashed border-gray-300 my-2" />

              {/* Totals */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Subtotal (excl. GST)</span>
                  <span className="font-mono">A${(subTotal / 1.1).toFixed(2)}</span>
                </div>
                {showGst && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">GST (10%)</span>
                    <span className="font-mono">A${(subTotal - subTotal / 1.1).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold mt-1">
                  <span>TOTAL</span>
                  <span className="font-mono">A${total.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-300 my-2" />

              {/* Payment */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Payment</span>
                  <span className="capitalize">{sale.payment_method ?? 'card'}</span>
                </div>
                {sale.cash_tendered != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Tendered</span>
                    <span className="font-mono">A${sale.cash_tendered.toFixed(2)}</span>
                  </div>
                )}
                {sale.change_given != null && sale.change_given > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Change</span>
                    <span className="font-mono">A${sale.change_given.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Loyalty */}
              {showLoyalty && (sale.loyaltyEarned || sale.customerSnapshot?.loyalty_points) && (
                <>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  {sale.loyaltyEarned && (
                    <p className="text-xs text-center text-violet-600">⭐ +{sale.loyaltyEarned} loyalty points earned</p>
                  )}
                  {sale.customerSnapshot?.loyalty_points && (
                    <p className="text-[10px] text-center text-gray-400">Balance: {sale.customerSnapshot.loyalty_points} points</p>
                  )}
                </>
              )}

              <div className="border-t border-dashed border-gray-300 my-3" />

              {/* Footer */}
              <p className="text-xs text-center text-gray-500 italic">
                {ariaMessage ?? settings.receipt_footer ?? 'Thank you for your business!'}
              </p>
              <p className="text-[9px] text-center text-gray-300 mt-2">Powered by Aria</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
