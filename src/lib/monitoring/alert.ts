// MONITOR-1 — fire-and-forget failure/cron alert notifier.
// Reads process.env.ALERT_WEBHOOK (a Discord/Slack-style incoming webhook URL). If it is not set, the
// notifier no-ops with a one-time warning so the build/cron never breaks — the env var must be set to
// enable alerting. Never throws, never blocks the caller. No new table; no DB writes.
//
// MONITOR-1 (this sprint) — 'high' severity ALSO escalates to the founder directly via email (Resend)
// + SMS (ClickSend), reading ALERT_EMAIL / ALERT_PHONE. This is specifically what was missing during
// the Anthropic-credits outage: aria_provider_incidents recorded the failover correctly, but nothing
// ever reached a human for 2 weeks. 'normal' severity stays webhook-only (unchanged) — escalating
// every routine cron hiccup to SMS would just get the alerts ignored/muted.

let warnedMissing = false

export interface AlertPayload {
  title: string
  summary: string
  severity?: 'high' | 'normal'
  details?: Record<string, unknown>
}

async function escalateHighSeverity(payload: AlertPayload): Promise<void> {
  const email = process.env.ALERT_EMAIL
  const phone = process.env.ALERT_PHONE
  const detailStr = payload.details ? '\n\n' + JSON.stringify(payload.details, null, 2).slice(0, 1000) : ''

  if (email) {
    try {
      const { sendEmail } = await import('@/lib/external-apis')
      await sendEmail({
        to: email,
        subject: `[Aria Alert] ${payload.title}`,
        html: `<p><strong>${payload.title}</strong></p><p>${payload.summary}</p><pre style="white-space:pre-wrap;font-size:12px;color:#555">${detailStr}</pre>`,
        from_name: 'Aria Monitoring',
      })
    } catch (e) {
      console.warn('[monitor-1] high-severity email escalation failed:', (e as Error).message)
    }
  }

  if (phone) {
    try {
      const { sendSMS } = await import('@/lib/clicksend')
      // SMS stays short — full detail is in the email/webhook.
      await sendSMS(phone, `Aria Alert: ${payload.title}. ${payload.summary}`.slice(0, 300))
    } catch (e) {
      console.warn('[monitor-1] high-severity SMS escalation failed:', (e as Error).message)
    }
  }

  if (!email && !phone) {
    console.warn('[monitor-1] high-severity alert with no ALERT_EMAIL/ALERT_PHONE configured — webhook-only:', payload.title)
  }
}

export async function sendAlert(payload: AlertPayload): Promise<boolean> {
  if (payload.severity === 'high') void escalateHighSeverity(payload)

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
