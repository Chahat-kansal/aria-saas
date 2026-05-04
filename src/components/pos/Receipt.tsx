'use client';

export interface ReceiptSale {
  id: string;
  sale_number?: string;
  created_at: string;
  cartSnapshot?: Array<{
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
  const bName       = businessName ?? sale.businessName ?? 'AriaPOS';
  const total       = sale.total_amount ?? 0;
  const date        = new Date(sale.created_at || Date.now());
  const showGst     = settings.receipt_show_gst !== false;
  const showCashier = settings.receipt_show_cashier !== false;
  const showLoyalty = settings.receipt_show_loyalty !== false;
  const items       = sale.cartSnapshot ?? [];

  // Use total_amount as the base; derive sub and gst from it
  const subTotal = items.length > 0
    ? items.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0)
    : total;
  const gstAmt = sale.tax_amount ?? (subTotal - subTotal / 1.1);

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* Scoped print CSS — only the receipt-print div is visible when printing */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .receipt-print-root { display: block !important; position: fixed !important; inset: 0 !important; z-index: 99999 !important; }
          .receipt-print-root * { visibility: visible !important; }
          .receipt-print-root { width: 80mm !important; margin: 0 auto !important; background: white !important; color: black !important; font-size: 11px !important; font-family: 'Courier New', monospace !important; padding: 6mm !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Overlay backdrop */}
      <div
        className="no-print"
        onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        {/* Modal card */}
        <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', width: '100%', maxWidth: 380, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

          {/* Modal toolbar */}
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Receipt</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#7C3AED', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🖨️ Print
              </button>
              {onClose && (
                <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 8, background: '#f5f5f5', color: '#555', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Close
                </button>
              )}
            </div>
          </div>

          {/* Scrollable receipt content */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div className="receipt-print-root" style={{ padding: '20px 24px', fontFamily: "'Courier New', monospace", fontSize: 12, color: '#111', background: '#fff', lineHeight: 1.5 }}>

              {/* Logo */}
              {settings.receipt_logo_url && (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={settings.receipt_logo_url} alt="Logo" style={{ maxWidth: 96, maxHeight: 48 }} />
                </div>
              )}

              {/* Business info */}
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{bName}</div>
                {settings.business_address && <div style={{ fontSize: 11, color: '#555' }}>{settings.business_address}</div>}
                {settings.business_phone   && <div style={{ fontSize: 11, color: '#555' }}>{settings.business_phone}</div>}
                {settings.business_website && <div style={{ fontSize: 11, color: '#555' }}>{settings.business_website}</div>}
                {settings.business_abn     && <div style={{ fontSize: 11, color: '#555' }}>ABN: {settings.business_abn}</div>}
              </div>

              {settings.receipt_header && (
                <>
                  <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#555', marginBottom: 6 }}>{settings.receipt_header}</div>
                </>
              )}

              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />

              {/* Receipt meta */}
              {[
                ['Receipt', sale.sale_number ?? sale.id.slice(-8).toUpperCase()],
                ['Date',    date.toLocaleDateString('en-AU')],
                ['Time',    date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })],
                ...(showCashier && sale.served_by ? [['Cashier', sale.served_by]] : []),
                ...(sale.customerSnapshot ? [['Customer', sale.customerSnapshot.name]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: '#666' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}

              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />

              {/* Line items */}
              {items.length > 0 ? items.map((item, i) => {
                const name      = item.label ?? item.product?.name ?? 'Item';
                const lineTotal = item.unitPrice * item.qty * (1 - (item.discount_percent ?? 0) / 100);
                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                      <span style={{ flex: 1, marginRight: 8 }}>{name}</span>
                      <span>A${lineTotal.toFixed(2)}</span>
                    </div>
                    {item.qty > 1 && (
                      <div style={{ fontSize: 10, color: '#777', marginLeft: 4 }}>{item.qty} × A${item.unitPrice.toFixed(2)}</div>
                    )}
                    {(item.discount_percent ?? 0) > 0 && (
                      <div style={{ fontSize: 10, color: '#16a34a', marginLeft: 4 }}>{item.discount_percent}% discount applied</div>
                    )}
                    {item.modifierDetails?.map(m => (
                      <div key={m.name} style={{ fontSize: 10, color: '#777', fontStyle: 'italic', marginLeft: 4 }}>+ {m.name}</div>
                    ))}
                  </div>
                );
              }) : (
                <div style={{ fontSize: 12, color: '#777', marginBottom: 8 }}>1 item — A${total.toFixed(2)}</div>
              )}

              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />

              {/* Totals */}
              {showGst && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: '#666' }}>Subtotal (excl. GST)</span>
                    <span>A${(subTotal / 1.1).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: '#666' }}>GST (10%)</span>
                    <span>A${gstAmt.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                <span>TOTAL</span>
                <span>A${total.toFixed(2)}</span>
              </div>

              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />

              {/* Payment */}
              {[
                ['Payment', (sale.payment_method ?? 'card').toUpperCase()],
                ...(sale.cash_tendered != null ? [['Tendered', `A$${sale.cash_tendered.toFixed(2)}`]] : []),
                ...(sale.change_given != null && sale.change_given > 0 ? [['Change', `A$${sale.change_given.toFixed(2)}`]] : []),
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: '#666' }}>{l}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}

              {/* Loyalty */}
              {showLoyalty && (sale.loyaltyEarned || sale.customerSnapshot?.loyalty_points) && (
                <>
                  <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
                  {sale.loyaltyEarned && (
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#7C3AED' }}>⭐ +{sale.loyaltyEarned} loyalty points earned</div>
                  )}
                  {sale.customerSnapshot?.loyalty_points != null && (
                    <div style={{ textAlign: 'center', fontSize: 10, color: '#888' }}>Points balance: {sale.customerSnapshot.loyalty_points}</div>
                  )}
                </>
              )}

              <div style={{ borderTop: '1px dashed #ccc', margin: '10px 0' }} />

              {/* Footer */}
              <div style={{ textAlign: 'center', fontSize: 11, color: '#555', fontStyle: 'italic' }}>
                {ariaMessage ?? settings.receipt_footer ?? 'Thank you for your business!'}
              </div>
              <div style={{ textAlign: 'center', fontSize: 9, color: '#bbb', marginTop: 6 }}>Powered by Aria</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
