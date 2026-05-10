export type SupplierKey = 'alm' | 'ilg' | 'lmg' | 'thirsty_camel' | 'custom'

export interface SupplierIntegration {
  key: SupplierKey
  display_name: string
  status: 'available' | 'pending_approval' | 'connected' | 'manual'
  integration_type: 'email_po' | 'csv_feed' | 'api' | 'partnership_required'
  docs_url?: string
  setup_instructions?: string
  image_feed_url?: string
  order_email?: string
}

export const SUPPLIERS: Record<SupplierKey, SupplierIntegration> = {
  alm: {
    key: 'alm',
    display_name: 'Australian Liquor Marketers (ALM)',
    status: 'available',
    integration_type: 'email_po',
    order_email: 'orders@alm.com.au',
    setup_instructions: 'Add your ALM customer number. Aria emails POs in their accepted format.',
  },
  ilg: {
    key: 'ilg',
    display_name: 'Independent Liquor Group (ILG)',
    status: 'available',
    integration_type: 'email_po',
    order_email: 'orders@ilg.com.au',
    setup_instructions: 'Add your ILG account number. Aria emails POs.',
  },
  lmg: {
    key: 'lmg',
    display_name: 'Liquor Marketing Group',
    status: 'pending_approval',
    integration_type: 'partnership_required',
    setup_instructions: 'Aria is applying as a POS partner. Available 2026 Q3.',
  },
  thirsty_camel: {
    key: 'thirsty_camel',
    display_name: 'Thirsty Camel',
    status: 'pending_approval',
    integration_type: 'partnership_required',
    setup_instructions: 'Part of LMG group. Same partnership pathway.',
  },
  custom: {
    key: 'custom',
    display_name: 'Custom supplier',
    status: 'manual',
    integration_type: 'email_po',
    setup_instructions: 'Add any other supplier with their order email.',
  },
}
