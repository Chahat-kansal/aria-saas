const OPENWEATHER_KEY = process.env.OPENWEATHER_API_KEY
const BASE = 'https://api.openweathermap.org/data/2.5'

type WeatherContext = {
  location: string
  today: {
    condition: string
    temp_c: number
    feels_like_c: number
    humidity: number
    wind_kph: number
    description: string
    is_extreme: boolean
  }
  forecast_48h: Array<{
    day: string
    condition: string
    temp_high_c: number
    temp_low_c: number
    rain_chance: number
    description: string
  }>
  business_impact: string
}

function classifyCondition(weatherId: number, tempC: number): string {
  if (tempC >= 35) return 'hot'
  if (tempC <= 10) return 'cold'
  if (weatherId >= 200 && weatherId < 300) return 'stormy'
  if (weatherId >= 300 && weatherId < 600) return 'rainy'
  if (weatherId >= 600 && weatherId < 700) return 'cold'
  if (weatherId === 800) return tempC > 28 ? 'hot' : 'sunny'
  if (weatherId > 800) return 'cloudy'
  return 'mild'
}

function computeBusinessImpact(
  industry: string,
  condition: string,
  tempC: number,
  forecast: WeatherContext['forecast_48h']
): string {
  const impacts: string[] = []
  const tomorrowRain = forecast[1]?.rain_chance ?? 0
  const tomorrowCondition = forecast[1]?.condition ?? 'mild'

  if (condition === 'hot' || tempC >= 32) {
    impacts.push(`Hot day (${tempC}°C) — cold drinks and refrigerated products will spike.`)
  }
  if (condition === 'rainy' || condition === 'stormy') {
    impacts.push(`Rain today — expect foot traffic down 20–40%. Delivery and online orders may increase.`)
  }
  if (condition === 'cold' && tempC <= 12) {
    impacts.push(`Cold day — warm comfort products will move faster than usual.`)
  }
  if (tomorrowRain > 70) {
    impacts.push(`Heavy rain forecast tomorrow (${tomorrowRain}% chance) — consider adjusting tomorrow's production or staffing down.`)
  }

  if (industry === 'liquor' || industry === 'bottle_shop') {
    if (condition === 'hot' || tempC >= 30) {
      impacts.push(`Stock the beer fridge now — Carlton Draught, Great Northern, RTDs will lead. Consider fronting cold stock.`)
    }
    if (condition === 'rainy') {
      impacts.push(`Rainy days shift liquor sales toward wine and spirits — people drinking at home. Promote takeaway deals.`)
    }
    if (tomorrowCondition === 'hot') {
      impacts.push(`Hot day tomorrow — pull cold beer to the front tonight so it's chilled by opening.`)
    }
  }

  if (industry === 'cafe') {
    if (condition === 'rainy') {
      impacts.push(`Cafe foot traffic typically drops 25–35% on rainy days. Reduce baked goods production by a third to cut wastage.`)
    }
    if (condition === 'hot' || tempC >= 28) {
      impacts.push(`Hot day — cold brew, iced lattes, and cold food will outsell hot items. Prep extra cold stock.`)
    }
    if (condition === 'cold') {
      impacts.push(`Cold day — hot drinks and comfort food will spike. Ensure enough milk stock for extended AM rush.`)
    }
  }

  if (industry === 'warehouse') {
    if (condition === 'hot' || tempC >= 35) {
      impacts.push(`Extreme heat — check temperature-sensitive stock. Staff productivity typically drops in unventilated areas above 35°C.`)
    }
    if (condition === 'stormy') {
      impacts.push(`Storm risk — check loading dock security, delay outdoor movements if possible.`)
    }
  }

  if (industry === 'restaurant') {
    if (condition === 'hot' || tempC >= 30) {
      impacts.push(`Hot day — outdoor seating will fill first. Ensure outdoor staff coverage and cold drinks stocked heavily.`)
    }
    if (condition === 'rainy') {
      impacts.push(`Rain drives indoor dining — may fill indoors faster than usual. Consider a waiting list if close to capacity.`)
    }
  }

  if (industry === 'bakery') {
    if (condition === 'rainy') {
      impacts.push(`Rainy morning — foot traffic will be lower. Reduce morning production volume by 20% to cut wastage.`)
    }
    if (condition === 'hot') {
      impacts.push(`Hot day — cold pastries and drinks will move faster. Reduce hot items in the display case.`)
    }
  }

  if (industry === 'convenience') {
    if (condition === 'hot') {
      impacts.push(`Hot day — cold drinks, ice cream, and sunscreen will spike. Front these items now.`)
    }
    if (condition === 'stormy' || condition === 'rainy') {
      impacts.push(`Bad weather drives convenience store traffic up — people grab essentials rather than going to supermarkets.`)
    }
  }

  return impacts.length > 0
    ? impacts.join(' ')
    : `Mild conditions today (${tempC}°C, ${condition}) — no significant weather impact expected.`
}

export async function getWeatherContext(
  industry: string,
  city: string,
  countryCode = 'AU'
): Promise<WeatherContext | null> {
  if (!OPENWEATHER_KEY || !city) return null

  try {
    const location = encodeURIComponent(`${city},${countryCode}`)

    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${BASE}/weather?q=${location}&appid=${OPENWEATHER_KEY}&units=metric`),
      fetch(`${BASE}/forecast?q=${location}&appid=${OPENWEATHER_KEY}&units=metric&cnt=16`),
    ])

    if (!currentRes.ok || !forecastRes.ok) return null

    const current = await currentRes.json()
    const forecast = await forecastRes.json()

    const tempC     = Math.round(current.main.temp)
    const feelsLike = Math.round(current.main.feels_like)
    const weatherId = current.weather[0].id
    const condition = classifyCondition(weatherId, tempC)
    const windKph   = Math.round((current.wind?.speed ?? 0) * 3.6)

    // Group 3-hour OWM intervals by day label
    const dayMap: Record<string, {
      highs: number[]; lows: number[]; rainChances: number[]
      conditions: string[]; descriptions: string[]
    }> = {}
    const fixedDays = ['Today', 'Tomorrow']

    for (const item of forecast.list) {
      const diffDays = Math.floor((item.dt * 1000 - Date.now()) / 86400000)
      const label = fixedDays[diffDays] ??
        new Date(item.dt * 1000).toLocaleDateString('en-AU', { weekday: 'long' })
      if (!dayMap[label]) dayMap[label] = { highs: [], lows: [], rainChances: [], conditions: [], descriptions: [] }
      dayMap[label].highs.push(item.main.temp_max)
      dayMap[label].lows.push(item.main.temp_min)
      dayMap[label].rainChances.push((item.pop ?? 0) * 100)
      dayMap[label].conditions.push(classifyCondition(item.weather[0].id, item.main.temp))
      dayMap[label].descriptions.push(item.weather[0].description)
    }

    const forecast48h = Object.entries(dayMap).slice(0, 3).map(([day, d]) => ({
      day,
      condition:   d.conditions[Math.floor(d.conditions.length / 2)],
      temp_high_c: Math.round(Math.max(...d.highs)),
      temp_low_c:  Math.round(Math.min(...d.lows)),
      rain_chance: Math.round(Math.max(...d.rainChances)),
      description: d.descriptions[Math.floor(d.descriptions.length / 2)],
    }))

    return {
      location: `${current.name}, AU`,
      today: {
        condition,
        temp_c:       tempC,
        feels_like_c: feelsLike,
        humidity:     current.main.humidity,
        wind_kph:     windKph,
        description:  current.weather[0].description,
        is_extreme:   tempC >= 38 || condition === 'stormy',
      },
      forecast_48h: forecast48h,
      business_impact: computeBusinessImpact(industry, condition, tempC, forecast48h),
    }
  } catch {
    return null  // Never let weather failure break Aria
  }
}
