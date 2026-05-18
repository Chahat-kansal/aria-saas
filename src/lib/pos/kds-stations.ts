import { createServerSupabaseClient } from '@/lib/supabase-server'

const DEFAULT_STATIONS: Record<string, Array<{ key: string; name: string; sort: number }>> = {
  cafe: [
    { key: 'espresso', name: 'Espresso Bar', sort: 0 },
    { key: 'kitchen', name: 'Kitchen', sort: 1 },
  ],
  restaurant: [
    { key: 'kitchen', name: 'Kitchen', sort: 0 },
    { key: 'cold', name: 'Cold Station', sort: 1 },
    { key: 'pastry', name: 'Pastry', sort: 2 },
    { key: 'expo', name: 'Expo', sort: 3 },
  ],
  bakery: [
    { key: 'kitchen', name: 'Kitchen', sort: 0 },
  ],
}

export async function ensureDefaultStations(business_id: string, industry: string): Promise<void> {
  const defaults = DEFAULT_STATIONS[industry]
  if (!defaults) return

  const supabase = createServerSupabaseClient()
  const { data: existing } = await supabase
    .from('pos_kds_stations')
    .select('id')
    .eq('business_id', business_id)
    .limit(1)
    .maybeSingle()

  if (existing) return

  const rows = defaults.map(d => ({
    business_id,
    station_key: d.key,
    display_name: d.name,
    sort_order: d.sort,
  }))
  await supabase.from('pos_kds_stations').insert(rows)
}
