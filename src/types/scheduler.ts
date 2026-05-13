export interface BestTimeSlot {
  datetime: string   // ISO
  platform: string
  score: number      // 0–100
  reason: string     // human-readable
  dayOfWeek: number  // 0=Sun … 6=Sat
  hour: number       // 0–23 local time
}

export interface EngagementBucket {
  platform:    string
  dayOfWeek:   number   // 0–6
  hour:        number   // 0–23
  avgEngagement: number
  sampleSize:  number
}

export interface SchedulingPreferences {
  platform:      string
  customTimes:   string[]  // HH:MM local
  blackoutHours: number[]  // hours to avoid (0–23)
}