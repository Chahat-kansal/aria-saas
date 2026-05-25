export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// ABN Lookup API — Australian Business Register
// Docs: https://abr.business.gov.au/Documentation/WebServices
const ABN_LOOKUP_BASE = 'https://abr.business.gov.au/abrxmlsearch/AbrXmlSearch.asmx'

function parseABNLookupXML(xml: string): {
  abn: string
  abn_status: string
  entity_name: string
  entity_type: string
  gst_registered: boolean
  gst_registered_from: string | null
  state: string | null
  postcode: string | null
  active: boolean
  raw: Record<string, unknown>
} | null {
  try {
    // Extract ABN status
    const abnStatus = xml.match(/<identifierStatus>([^<]+)<\/identifierStatus>/)?.[1] ?? ''
    const isActive = abnStatus === 'Active'

    // Extract entity name — try main name first, then other formats
    let entityName = ''
    const mainNameMatch = xml.match(/<mainName>[\s\S]*?<organisationName>([^<]+)<\/organisationName>/)
    if (mainNameMatch) {
      entityName = mainNameMatch[1]
    } else {
      // Individual (sole trader)
      const givenName = xml.match(/<givenName>([^<]+)<\/givenName>/)?.[1] ?? ''
      const familyName = xml.match(/<familyName>([^<]+)<\/familyName>/)?.[1] ?? ''
      if (givenName || familyName) entityName = `${givenName} ${familyName}`.trim()
    }

    // Extract entity type
    const entityType = xml.match(/<entityTypeIndicator>([^<]+)<\/entityTypeIndicator>/)?.[1] ?? ''
    const entityTypeText = xml.match(/<entityTypeCode>([^<]+)<\/entityTypeCode>/)?.[1] ?? entityType

    // Extract ABN
    const abn = xml.match(/<identifierValue>(\d{11})<\/identifierValue>/)?.[1] ?? ''

    // Extract GST registration
    const gstMatch = xml.match(/<goodsAndServicesTax>[\s\S]*?<effectiveFrom>([^<]+)<\/effectiveFrom>/)
    const gstRegistered = !!gstMatch
    const gstFrom = gstMatch?.[1] ?? null

    // Extract state/postcode
    const state = xml.match(/<stateCode>([^<]+)<\/stateCode>/)?.[1] ?? null
    const postcode = xml.match(/<postcode>(\d{4})<\/postcode>/)?.[1] ?? null

    return {
      abn,
      abn_status: abnStatus,
      entity_name: entityName,
      entity_type: entityTypeText,
      gst_registered: gstRegistered,
      gst_registered_from: gstFrom,
      state,
      postcode,
      active: isActive,
      raw: { xml_length: xml.length, abn_status: abnStatus, entity_name: entityName, entity_type: entityTypeText, gst_registered: gstRegistered }
    }
  } catch {
    return null
  }
}

// POST /api/abn-lookup
// Body: { abn: string, businessId?: string }
// If businessId provided and user owns it, saves result to businesses table
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { abn, businessId } = await req.json()
  if (!abn) return NextResponse.json({ error: 'abn required' }, { status: 400 })

  // Clean ABN — remove spaces and non-digits
  const cleanABN = abn.replace(/\D/g, '')
  if (cleanABN.length !== 11) {
    return NextResponse.json({ error: 'ABN must be 11 digits' }, { status: 400 })
  }

  const guid = process.env.ABN_LOOKUP_GUID
  if (!guid) {
    return NextResponse.json({ error: 'ABN Lookup not configured' }, { status: 503 })
  }

  try {
    // Call ABN Lookup SOAP/REST API
    const url = `${ABN_LOOKUP_BASE}/SearchByABNv202001?searchString=${cleanABN}&includeHistoricalDetails=N&authenticationGuid=${guid}`
    
    const response = await fetch(url, {
      headers: { 'Accept': 'text/xml', 'User-Agent': 'AriaOS/1.0 (ariaos.site)' }
    })

    if (!response.ok) {
      console.error('[abn-lookup] API error:', response.status, response.statusText)
      return NextResponse.json({ error: 'ABN Lookup service unavailable' }, { status: 502 })
    }

    const xml = await response.text()

    // Check for exception in response
    if (xml.includes('<exception>')) {
      const exMsg = xml.match(/<exceptionDescription>([^<]+)<\/exceptionDescription>/)?.[1] ?? 'Unknown error'
      console.error('[abn-lookup] API exception:', exMsg)
      return NextResponse.json({ error: `ABN Lookup error: ${exMsg}` }, { status: 400 })
    }

    // Check if ABN was found
    if (xml.includes('<identifierValue>0</identifierValue>') || !xml.includes('<identifierValue>')) {
      return NextResponse.json({
        found: false,
        abn: cleanABN,
        message: 'No business found for this ABN',
      })
    }

    const result = parseABNLookupXML(xml)
    if (!result) {
      return NextResponse.json({ error: 'Failed to parse ABN Lookup response' }, { status: 500 })
    }

    // If businessId provided, save to database
    if (businessId) {
      const { data: business } = await supabase
        .from('businesses')
        .select('id, user_id')
        .eq('id', businessId)
        .eq('user_id', user.id)
        .single()

      if (business) {
        await supabase.from('businesses').update({
          abn: cleanABN,
          abn_status: result.abn_status,
          abn_verified: true,
          abn_verified_at: new Date().toISOString(),
          abn_verification_method: 'abr_api',
          abn_lookup_raw: result.raw,
          legal_name: result.entity_name || undefined,
          entity_type: result.entity_type || undefined,
          gst_registered: result.gst_registered,
          gst_registered_from: result.gst_registered_from || undefined,
          business_state: result.state || undefined,
          postcode: result.postcode || undefined,
          abn_status: result.active ? 'Active' : 'Cancelled',
        }).eq('id', businessId)
      }
    }

    return NextResponse.json({
      found: true,
      active: result.active,
      abn: cleanABN,
      abn_formatted: cleanABN.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4'),
      entity_name: result.entity_name,
      entity_type: result.entity_type,
      abn_status: result.abn_status,
      gst_registered: result.gst_registered,
      gst_registered_from: result.gst_registered_from,
      state: result.state,
      postcode: result.postcode,
      saved: !!businessId,
    })

  } catch (err) {
    console.error('[abn-lookup] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal error during ABN lookup' }, { status: 500 })
  }
}

// GET /api/abn-lookup?abn=12345678901
// Read-only lookup — no save
export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const abn = searchParams.get('abn')
  if (!abn) return NextResponse.json({ error: 'abn required' }, { status: 400 })

  // Reuse POST logic via internal call
  return POST(new Request(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ abn }),
  }))
}
