// MONITOR-1 — fire-and-forget failure/cron alert notifier.
// Reads process.env.ALERT_WEBHOOK (a Discord/Slack-style incoming webhook URL). If it is not set, the
// notifier no-ops with a one-time warning so the build/cron never breaks — the env var must be set to
// enable alerting. Never throws, never blocks the caller. No new table; no DB writes.

let warnedMissing = false

export interface AlertPayload {
  title: string
  summary: string
  severity?: 'high' | 'normal'
  details?: Record<string, unknown>
}

export async function sendAlert(payload: AlertPayload): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK
  if (!url) {
    if (!warnedMissing) {
      console.warn('[monitor-1] ALERT_WEBHOOK is not set — alert suppressed. Set ALERT_WEBHOOK (a Discord/Slack incoming webhook URL) to enable failure/cron alerting.')
      warnedMissing = true
    }
    return false
  }
  try {
    const icon = payload.severity === 'high' ? '🔴' : '⚠️'
    const detailStr = payload.details ? '\n```' + JSON.stringify(payload.details).slice(0, 1500) + '```' : ''
    const content = `${icon} **${payload.title}**\n${payload.summary}${detailStr}`
    // `content` is the Discord/Slack-compatible field; `text` covers Slack; extra keys are harmless.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, text: content, title: payload.title }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.warn('[monitor-1] alert webhook returned non-OK:', res.status)
      return false
    }
    return true
  } catch (e) {
    console.warn('[monitor-1] alert webhook failed:', (e as Error).message)
    return false
  }
}
