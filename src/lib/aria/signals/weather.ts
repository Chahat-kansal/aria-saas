import type { WeatherSignal } from '../types'

function classifyCondition(wmoCode: number, tempC: number): string {
  if (tempC >= 35) return 'hot'
  if (tempC <= 10) return 'cold'
  if (wmoCode >= 95) return 'stormy'
  if (wmoCode >= 61 && wmoCode <= 67) return 'rainy'
  if (wmoCode >= 71 && wmoCode <= 77) return 'cold'
  if (wmoCode === 0 || wmoCode === 1) return tempC > 28 ? 'hot' : 'sunny'
  if (wmoCode <= 3) return 'cloudy'
  return 'mild'
}

function businessImpact(industry: string, condition: string, tempC: number): string {
  if (industry === 'liquor' || industry === 'bottle_shop') {
    if (condition === 'hot' || tempC >= 30) return `Hot day (${tempC}°C) — stock the beer fridge. Carlton Draught, Great Northern, RTDs will lead.`
    if (condition === 'rainy') return `Rain shifts sales toward wine and spirits (home drinking). Promote takeaway bundles.`
  }
  if (industry === 'cafe') {
    if (condition === 'hot' || tempC >= 28) return `Hot day — cold brew, iced lattes, cold food will outsell hot items. Prep extra cold stock.`
    if (condition === 'rainy') return `Rainy day — foot traffic drops 25–35%. Reduce baked goods production by a third.`
  }
  if (industry === 'bakery') {
    if (condition === 'rainy') return `Rainy morning — reduce production 20% to cut wastage.`
    if (condition === 'hot') return `Hot day — cold pastries and drinks will move faster than hot items.`
  }
  if (industry === 'restaurant') {
    if (condition === 'hot' || tempC >= 30) return `Hot day — outdoor seating fills first. Ensure cold drinks stocked heavily.`
    if (condition === 'rainy') return `Rain drives indoor dining. May fill indoors faster — consider a waiting list.`
  }
  if (condition === 'hot' || tempC >= 35) return `Hot day (${tempC}°C) — cold products will spike.`
  if (condition === 'rainy') return `Rainy day — expect foot traffic down 20–40%.`
  return `Mild conditions (${tempC}°C, ${condition}) — no significant weather impact expected.`
}

// Uses Open-Meteo (free, no key needed) with lat/lng from geocode.ts
export async function fetchWeather(lat: number, lng: number, industry = 'retail'): Promise<WeatherSignal | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation_probability,weather_code&hourly=temperature_2m,precipitation_probability&forecast_days=1&timezone=Australia/Sydney`
    const r = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!r.ok) return null
    const j = await r.json()
    const tempC = Math.round(Number(j.current?.temperature_2m) || 20)
    const wmoCode = Number(j.current?.weather_code) || 0
    const rainChance = Math.round(Number(j.current?.precipitation_probability) || 0)
    const condition = classifyCondition(wmoCode, tempC)
    return {
      condition,
      temp_c: tempC,
      rain_chance_pct: rainChance,
      business_impact: businessImpact(industry, condition, tempC),
    }
  } catch { return null }
}
