/**
 * Industry-aware POS identity.
 *
 * When the operator switches the active business, the terminal does not
 * just swap the product list — it re-skins itself to match the venue type.
 * A bottle shop, a cafe and a clothing store each get their own accent
 * colour, icon and label, so staff get an instant visual confirmation
 * they are ringing up the RIGHT venue. No competitor POS does this.
 *
 * Pure data — no React, safe to import anywhere.
 */

export interface IndustryIdentity {
  /** canonical key */
  key: string;
  /** short human label shown on the switcher chip */
  label: string;
  /** emoji used as a fast visual marker */
  icon: string;
  /** accent colour (hex) used for the switcher chip + terminal accent */
  accent: string;
  /** soft background tint for the chip */
  tint: string;
  /** one-line description of the POS mode */
  mode: string;
}

const DEFAULT_IDENTITY: IndustryIdentity = {
  key: 'other',
  label: 'Retail',
  icon: '\u{1F3EA}',
  accent: '#2D5240',
  tint: 'rgba(45,82,64,0.10)',
  mode: 'Scan & sell',
};

const IDENTITY_MAP: Record<string, IndustryIdentity> = {
  cafe:        { key: 'cafe',        label: 'Cafe',         icon: '\u2615', accent: '#8B5E34', tint: 'rgba(139,94,52,0.10)',  mode: 'Modifiers, sizes & KDS' },
  restaurant:  { key: 'restaurant',  label: 'Restaurant',   icon: '\u{1F37D}', accent: '#9B3D3D', tint: 'rgba(155,61,61,0.10)',  mode: 'Tables, courses & KDS' },
  bakery:      { key: 'bakery',      label: 'Bakery',       icon: '\u{1F950}', accent: '#C08552', tint: 'rgba(192,133,82,0.10)', mode: 'Modifiers & fresh batches' },
  liquor:      { key: 'liquor',      label: 'Liquor',       icon: '\u{1F377}', accent: '#6B2737', tint: 'rgba(107,39,55,0.10)',  mode: 'Age-checked scan & sell' },
  convenience: { key: 'convenience',label: 'Convenience',  icon: '\u{1F3EA}', accent: '#2F6B4F', tint: 'rgba(47,107,79,0.10)',  mode: 'Fast scan & sell' },
  grocery:     { key: 'grocery',     label: 'Grocery',      icon: '\u{1F6D2}', accent: '#3B7A57', tint: 'rgba(59,122,87,0.10)',  mode: 'Weigh, scan & sell' },
  clothing:    { key: 'clothing',    label: 'Clothing',     icon: '\u{1F455}', accent: '#3D5A80', tint: 'rgba(61,90,128,0.10)',  mode: 'Size, colour & fitting room' },
  gift:        { key: 'gift',        label: 'Gift',         icon: '\u{1F381}', accent: '#A14A76', tint: 'rgba(161,74,118,0.10)', mode: 'Scan, gift-wrap & sell' },
  pharmacy:    { key: 'pharmacy',    label: 'Pharmacy',     icon: '\u{1F48A}', accent: '#2C6E8F', tint: 'rgba(44,110,143,0.10)', mode: 'Script-checked scan & sell' },
  electronics: { key: 'electronics',label: 'Electronics',  icon: '\u{1F4F1}', accent: '#41506B', tint: 'rgba(65,80,107,0.10)',  mode: 'Serial-tracked scan & sell' },
  beauty:      { key: 'beauty',      label: 'Beauty',       icon: '\u{1F484}', accent: '#B5547F', tint: 'rgba(181,84,127,0.10)', mode: 'Services & retail' },
  warehouse:   { key: 'warehouse',   label: 'Warehouse',    icon: '\u{1F4E6}', accent: '#5A6470', tint: 'rgba(90,100,112,0.10)', mode: 'Stock & fulfilment' },
  gym:         { key: 'gym',         label: 'Gym',          icon: '\u{1F4AA}', accent: '#3F6F52', tint: 'rgba(63,111,82,0.10)',  mode: 'Memberships & retail' },
  retail:      { key: 'retail',      label: 'Retail',       icon: '\u{1F3EA}', accent: '#2D5240', tint: 'rgba(45,82,64,0.10)',   mode: 'Scan & sell' },
};

/** Resolve a business industry string to its POS identity. Always returns a value. */
export function getIndustryIdentity(industry: string | null | undefined): IndustryIdentity {
  if (!industry) return DEFAULT_IDENTITY;
  return IDENTITY_MAP[industry.toLowerCase().trim()] ?? DEFAULT_IDENTITY;
}
