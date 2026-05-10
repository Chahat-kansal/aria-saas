export type IntegrationKey =
  | 'accounts_flow' | 'alm' | 'conversion_service'
  | 'iba_ecommerce' | 'iba_rewards' | 'iba_scan_data_v2_5'
  | 'independent_brands_australia' | 'ilg' | 'last_yard'
  | 'lmg' | 'myob' | 'ontap_data' | 'promotion_stacker'
  | 'thirsty_camel' | 'tipplego_orders' | 'vii' | 'xero'
  | 'zen_global'
  | 'burps' | 'elabels' | 'hanshow' | 'ilr_esl'
  | 'myfoodlink' | 'pricer_esl' | 'ticket_it'
  | 'tipplego_store_sync'

export type IntegrationStatus = 'available' | 'partnership_pending' | 'beta'
export type SetupMethod = 'oauth' | 'api_key' | 'email_po' | 'partnership'

export interface Integration {
  key: IntegrationKey
  display_name: string
  description: string
  category: string
  status: IntegrationStatus
  is_official: boolean
  developed_by: string
  setup_method: SetupMethod
  oauth_authorize_url?: string
  oauth_token_url?: string
  oauth_scopes?: string[]
  logo_placeholder: string
}
