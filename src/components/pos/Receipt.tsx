'use client';
import React from 'react';

/* ─── Shared type definitions ────────────────────────────────── */
export interface ReceiptElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  visible?: boolean;
  locked?: boolean;
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  color?: string;
  lineHeight?: number;
  padding?: number;
  backgroundColor?: string;
  imageUrl?: string;
  objectFit?: string;
  dividerStyle?: string;
  dividerThickness?: number;
  dataBinding?: string;
}

export interface ReceiptTemplate {
  id: string;
  name: string;
  elements: ReceiptElement[];
  canvas_width?: number;
  canvas_height?: number;
  background_color?: string;
  is_default?: boolean;
}

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
  tax_breakdown?: Array<{ tax_code_id: string; code: string; name: string; rate: number; taxable_amount: number; tax_amount: number }>;
  payment_method?: string;
  cash_tendered?: number;
  change_given?: number;
  customerSnapshot?: { name: string; loyalty_points?: number } | null;
  businessName?: string;
  served_by?: string;
  loyaltyEarned?: number;
  business_id?: string;
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
  template?: ReceiptTemplate | null;
  watermark?: string;
}

/* ─── Template-based receipt ────────────────────────────────────
   Renders absolutely-positioned elements from the Canva editor
   with real sale data substituted in.                           */
function TemplateReceipt({ template, sale, businessName, settings, onClose, watermark }: {
  template: ReceiptTemplate;
  sale: ReceiptSale;
  businessName: string;
  settings: ReceiptSettings;
  onClose?: () => void;
  watermark?: string;
}) {
  const [emailMode, setEmailMode] = React.useState(false);
  const [emailVal, setEmailVal] = React.useState((sale as any).customerSnapshot?.email || (sale as any).customer_email || '');
  const [emailSending, setEmailSending] = React.useState(false);
  const [emailDone, setEmailDone] = React.useState(false);

  async function handleEmailReceipt() {
    if (!emailVal || !sale.id) return;
    setEmailSending(true);
    try {
      await fetch('/api/pos/email-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: sale.id, email: emailVal, business_id: sale.business_id }),
      });
      setEmailDone(true);
      setTimeout(() => { setEmailMode(false); setEmailDone(false); }, 2000);
    } catch { /* silent */ } finally { setEmailSending(false); }
  }
  const CW = template.canvas_width || 302;

  // Variable substitution map — real sale data
  const total = sale.total_amount ?? 0;
  const gst   = sale.tax_amount   ?? (total - total / 1.1);
  const vars: Record<string, string> = {
    '{{business_name}}':    businessName,
    '{{business_address}}': settings?.business_address ?? '',
    '{{business_phone}}':   settings?.business_phone   ?? '',
    '{{business_abn}}':     settings?.business_abn     ?? '',
    '{{receipt_number}}':   sale.sale_number || sale.id?.slice(-8).toUpperCase() || '',
    '{{date}}':             new Date(sale.created_at || Date.now()).toLocaleDateString('en-AU', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            }),
    '{{cashier_name}}':     sale.served_by    || '',
    '{{customer_name}}':    sale.customerSnapshot?.name || '',
    '{{receipt_barcode}}':  sale.sale_number  || sale.id?.slice(0, 12) || '',
  };

  function resolveContent(content: string): string {
    return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(k, v), content || '');
  }

  const items = sale.cartSnapshot ?? [];

  function renderEl(el: ReceiptElement) {
    const ff = el.fontFamily === 'monospace' ? "'Courier New',Courier,monospace"
             : el.fontFamily === 'serif'     ? 'Georgia,serif'
             : 'Arial,sans-serif';

    const base: React.CSSProperties = {
      position:        'absolute',
      left:            el.x,
      top:             el.y,
      width:           el.width,
      height:          el.height || 'auto',
      zIndex:          el.zIndex || 1,
      boxSizing:       'border-box',
      overflow:        'hidden',
      fontFamily:      ff,
      fontSize:        el.fontSize    || 10,
      fontWeight:      (el.fontWeight || 'normal') as React.CSSProperties['fontWeight'],
      fontStyle:       (el.fontStyle  || 'normal') as React.CSSProperties['fontStyle'],
      textAlign:       (el.textAlign  || 'left')   as React.CSSProperties['textAlign'],
      color:           el.color            || '#000000',
      lineHeight:      el.lineHeight       || 1.4,
      padding:         el.padding          || 0,
      backgroundColor: el.backgroundColor || 'transparent',
      whiteSpace:      'pre-wrap',
    };

    switch (el.type) {
      case 'text':
      case 'dynamic_text':
        return <div key={el.id} style={base}>{resolveContent(el.content || '')}</div>;

      case 'divider':
        return (
          <div key={el.id} style={{ ...base, display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: '100%',
              borderTopWidth: el.dividerThickness || 1,
              borderTopStyle: (el.dividerStyle || 'solid') as React.CSSProperties['borderTopStyle'],
              borderTopColor: el.color || '#000000',
            }} />
          </div>
        );

      case 'image':
        return el.imageUrl ? (
          <div key={el.id} style={{ ...base, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={el.imageUrl} alt="Logo"
              style={{ width: '100%', height: '100%', objectFit: (el.objectFit || 'contain') as React.CSSProperties['objectFit'] }} />
          </div>
        ) : null;

      case 'spacer':
        return <div key={el.id} style={base} />;

      case 'barcode':
        return (
          <div key={el.id} style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#666' }}>
            <div style={{ fontSize: 16, letterSpacing: 2 }}>▌▌▌▐▌▌▐▌▐▌▌▐▌▐▌</div>
            <div style={{ fontSize: 8, marginTop: 2 }}>{vars['{{receipt_barcode}}']}</div>
          </div>
        );

      case 'items_table':
        return (
          <div key={el.id} style={{ ...base, padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: 2, marginBottom: 3, fontSize: el.fontSize || 10 }}>
              <span style={{ flex: 2 }}>Item</span>
              <span style={{ textAlign: 'right', minWidth: 24 }}>Qty</span>
              <span style={{ textAlign: 'right', minWidth: 56 }}>Price</span>
            </div>
            {items.length > 0 ? items.map((item, i) => {
              const name      = item.label ?? item.product?.name ?? 'Item';
              const lineTotal = item.unitPrice * item.qty * (1 - (item.discount_percent ?? 0) / 100);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: el.fontSize || 10 }}>
                  <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ textAlign: 'right', minWidth: 24 }}>×{item.qty}</span>
                  <span style={{ textAlign: 'right', minWidth: 56, fontFamily: "'Courier New',monospace" }}>A${lineTotal.toFixed(2)}</span>
                </div>
              );
            }) : (
              <div style={{ fontSize: el.fontSize || 10, color: '#777', marginBottom: 4 }}>1 item — A${total.toFixed(2)}</div>
            )}
          </div>
        );

      case 'totals_block': {
        const subTotal = items.length > 0
          ? items.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0)
          : total;
        const showGst = settings?.receipt_show_gst !== false;
        return (
          <div key={el.id} style={{ ...base, padding: '0 8px' }}>
            {showGst && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: el.fontSize || 10 }}>
                  <span>Subtotal</span>
                  <span style={{ fontFamily: "'Courier New',monospace" }}>A${(subTotal / 1.1).toFixed(2)}</span>
                </div>
                {Array.isArray(sale.tax_breakdown) && sale.tax_breakdown.length > 0 ? (
                  sale.tax_breakdown.map((b) => (
                    <div key={b.code} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: el.fontSize || 10, color: '#666' }}>
                      <span>{b.code} ({(Number(b.rate) || 0).toFixed(1)}%)</span>
                      <span style={{ fontFamily: "'Courier New',monospace" }}>A${(Number(b.tax_amount) || 0).toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: el.fontSize || 10, color: '#666' }}>
                    <span>GST (10%)</span>
                    <span style={{ fontFamily: "'Courier New',monospace" }}>A${gst.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px solid #000', paddingTop: 3, marginTop: 2, fontSize: (el.fontSize || 10) + 2 }}>
              <span>TOTAL</span>
              <span style={{ fontFamily: "'Courier New',monospace" }}>A${total.toFixed(2)}</span>
            </div>
          </div>
        );
      }

      case 'payment_info': {
        const method = (sale.payment_method || 'Card').replace(/_/g, ' ');
        return (
          <div key={el.id} style={{ ...base, padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: el.fontSize || 10 }}>
              <span style={{ textTransform: 'capitalize' }}>{method}</span>
              <span style={{ fontFamily: "'Courier New',monospace" }}>A${total.toFixed(2)}</span>
            </div>
            {(sale.cash_tendered ?? 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: el.fontSize || 10, color: '#666' }}>
                <span>Tendered</span>
                <span style={{ fontFamily: "'Courier New',monospace" }}>A${(sale.cash_tendered ?? 0).toFixed(2)}</span>
              </div>
            )}
            {(sale.change_given ?? 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: el.fontSize || 10, color: '#666' }}>
                <span>Change</span>
                <span style={{ fontFamily: "'Courier New',monospace" }}>A${(sale.change_given ?? 0).toFixed(2)}</span>
              </div>
            )}
          </div>
        );
      }

      case 'loyalty_block': {
        if (!sale.loyaltyEarned && !sale.customerSnapshot?.loyalty_points) return null;
        return (
          <div key={el.id} style={{ ...base, textAlign: 'center', padding: '0 8px' }}>
            {sale.loyaltyEarned ? `★ +${sale.loyaltyEarned} loyalty points earned` : ''}
            {sale.customerSnapshot?.loyalty_points != null ? ` · Balance: ${sale.customerSnapshot.loyalty_points}` : ''}
          </div>
        );
      }

      default:
        return null;
    }
  }

  const sortedElements = [...(template.elements || [])]
    .filter(el => el.visible !== false)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  function handlePrint() { window.print(); }

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          .receipt-print-root { display: block !important; position: fixed !important; inset: 0 !important; z-index: 99999 !important; }
          .receipt-print-root * { visibility: visible !important; }
          .receipt-print-root { width: 80mm !important; margin: 0 auto !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print"
        onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', width: '100%', maxWidth: 380, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Receipt</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#7C3AED', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🖨️ Print
              </button>
              <button onClick={() => setEmailMode(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#2D5240', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                ✉️ Email
              </button>
              {onClose && (
                <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 8, background: '#f5f5f5', color: '#555', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Close
                </button>
              )}
            </div>
          </div>
          {emailMode && (
            <div className="no-print" style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', background: '#f9fafb', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="email"
                placeholder="Customer email"
                value={emailVal}
                onChange={e => setEmailVal(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
              />
              <button onClick={handleEmailReceipt} disabled={emailSending || !emailVal} style={{ padding: '6px 14px', borderRadius: 7, background: emailDone ? '#7FB897' : '#2D5240', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minWidth: 64 }}>
                {emailDone ? '✓ Sent' : emailSending ? '...' : 'Send'}
              </button>
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div className="receipt-print-root" style={{ background: '#fff', overflow: 'hidden' }}>
              <div style={{ position: 'relative', width: CW, minHeight: template.canvas_height || 800, background: template.background_color || '#ffffff', margin: '0 auto' }}>
                {sortedElements.map(el => renderEl(el))}
                {watermark && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 999 }}>
                    <span style={{ fontSize: 64, fontWeight: 900, color: 'rgba(245,158,11,0.2)', transform: 'rotate(-30deg)', letterSpacing: 4, userSelect: 'none', fontFamily: 'sans-serif' }}>{watermark}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Settings-based receipt (original) ─────────────────────────
   Kept exactly as-is — used as fallback when no template exists.  */
function SettingsReceipt({ sale, settings, businessName, ariaMessage, onClose, watermark }: {
  sale: ReceiptSale;
  settings: ReceiptSettings;
  businessName: string;
  ariaMessage?: string;
  onClose?: () => void;
  watermark?: string;
}) {
  const [emailMode, setEmailMode] = React.useState(false);
  const [emailVal, setEmailVal] = React.useState((sale as any).customerSnapshot?.email || (sale as any).customer_email || '');
  const [emailSending, setEmailSending] = React.useState(false);
  const [emailDone, setEmailDone] = React.useState(false);

  async function handleEmailReceipt() {
    if (!emailVal || !sale.id) return;
    setEmailSending(true);
    try {
      await fetch('/api/pos/email-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: sale.id, email: emailVal, business_id: sale.business_id }),
      });
      setEmailDone(true);
      setTimeout(() => { setEmailMode(false); setEmailDone(false); }, 2000);
    } catch { /* silent */ } finally { setEmailSending(false); }
  }
  const bName       = businessName ?? sale.businessName ?? 'AriaPOS';
  const total       = sale.total_amount ?? 0;
  const date        = new Date(sale.created_at || Date.now());
  const showGst     = settings.receipt_show_gst !== false;
  const showCashier = settings.receipt_show_cashier !== false;
  const showLoyalty = settings.receipt_show_loyalty !== false;
  const items       = sale.cartSnapshot ?? [];

  const subTotal = items.length > 0
    ? items.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0)
    : total;
  const gstAmt = sale.tax_amount ?? (subTotal - subTotal / 1.1);

  function handlePrint() { window.print(); }

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          .receipt-print-root { display: block !important; position: fixed !important; inset: 0 !important; z-index: 99999 !important; }
          .receipt-print-root * { visibility: visible !important; }
          .receipt-print-root { width: 80mm !important; margin: 0 auto !important; background: white !important; color: black !important; font-size: 11px !important; font-family: 'Courier New', monospace !important; padding: 6mm !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print"
        onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', width: '100%', maxWidth: 380, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Receipt</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#7C3AED', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🖨️ Print
              </button>
              <button onClick={() => setEmailMode(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#2D5240', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                ✉️ Email
              </button>
              {onClose && (
                <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 8, background: '#f5f5f5', color: '#555', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Close
                </button>
              )}
            </div>
          </div>
          {emailMode && (
            <div className="no-print" style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', background: '#f9fafb', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="email"
                placeholder="Customer email"
                value={emailVal}
                onChange={e => setEmailVal(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
              />
              <button onClick={handleEmailReceipt} disabled={emailSending || !emailVal} style={{ padding: '6px 14px', borderRadius: 7, background: emailDone ? '#7FB897' : '#2D5240', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minWidth: 64 }}>
                {emailDone ? '✓ Sent' : emailSending ? '...' : 'Send'}
              </button>
            </div>
          )}

          <div style={{ overflowY: 'auto', flex: 1, position: 'relative' }}>
            {watermark && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
                <span style={{ fontSize: 64, fontWeight: 900, color: 'rgba(245,158,11,0.2)', transform: 'rotate(-30deg)', letterSpacing: 4, userSelect: 'none', fontFamily: 'sans-serif' }}>{watermark}</span>
              </div>
            )}
            <div className="receipt-print-root" style={{ padding: '20px 24px', fontFamily: "'Courier New', monospace", fontSize: 12, color: '#111', background: '#fff', lineHeight: 1.5 }}>

              {settings.receipt_logo_url && (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={settings.receipt_logo_url} alt="Logo" style={{ maxWidth: 96, maxHeight: 48 }} />
                </div>
              )}

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

              {showGst && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: '#666' }}>Subtotal (excl. tax)</span>
                    <span>A${(subTotal / 1.1).toFixed(2)}</span>
                  </div>
                  {Array.isArray(sale.tax_breakdown) && sale.tax_breakdown.length > 0 ? (
                    sale.tax_breakdown.map((b) => (
                      <div key={b.code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                        <span style={{ color: '#666' }}>{b.code} ({(Number(b.rate) || 0).toFixed(1)}%)</span>
                        <span>A${(Number(b.tax_amount) || 0).toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: '#666' }}>GST (10%)</span>
                      <span>A${gstAmt.toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                <span>TOTAL</span>
                <span>A${total.toFixed(2)}</span>
              </div>

              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />

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

/* ─── Main export — picks template or settings receipt ────────── */
export default function Receipt({ sale, settings = {}, businessName, ariaMessage, onClose, template, watermark }: Props) {
  const bName = businessName ?? sale.businessName ?? 'AriaPOS';

  // Use the custom template if it exists and has elements
  if (template?.elements && template.elements.length > 0) {
    return (
      <TemplateReceipt
        template={template}
        sale={sale}
        businessName={bName}
        settings={settings}
        onClose={onClose}
        watermark={watermark}
      />
    );
  }

  // Fallback: original settings-based receipt
  return (
    <SettingsReceipt
      sale={sale}
      settings={settings}
      businessName={bName}
      ariaMessage={ariaMessage}
      onClose={onClose}
      watermark={watermark}
    />
  );
}
