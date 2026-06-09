/** Strip [mood:X] and [gesture:Y] tags from Aria replies and return parsed values. */
export function parseAriaTags(text: string): {
  clean:   string
  mood:    string
  gesture: string
} {
  const moodMatch    = text.match(/\[mood:(\w+)\]/)
  const gestureMatch = text.match(/\[gesture:(\w+)\]/)
  const clean = text.replace(/\s*\[(?:mood|gesture):\w+\]/g, '').trim()
  return {
    clean,
    mood:    moodMatch?.[1]    ?? 'neutral',
    gesture: gestureMatch?.[1] ?? '',
  }
}
