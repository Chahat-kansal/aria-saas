/**
 * ClickSend SMS utility
 * Docs: https://developers.clicksend.com/docs/rest/v3/#send-sms
 * Auth: Basic auth with username:api_key base64 encoded
 * Sender: "AriaOS" (alphanumeric sender ID — no number needed in AU)
 */

interface ClickSendResult {
  ok: boolean
  message_id?: string
  error?: string
}

export async function sendSMS(to: string, body: string): Promise<ClickSendResult> {
  const username = process.env.CLICKSEND_USERNAME
  const apiKey = process.env.CLICKSEND_API_KEY

  if (!username || !apiKey) {
    console.warn('[clicksend] Missing credentials — SMS not sent')
    return { ok: false, error: 'SMS not configured' }
  }

  // Normalise Australian numbers — ensure +61 format
  let phone = to.trim()
  if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
  if (!phone.startsWith('+')) phone = '+61' + phone

  const auth = Buffer.from(`${username}:${apiKey}`).toString('base64')

  try {
    const res = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        messages: [{
          source: 'aria_os',
          from: 'AriaOS',  // alphanumeric sender — shows as "AriaOS" on recipient phone
          body,
          to: phone,
        }],
      }),
    })

    const data = await res.json() as {
      data?: { messages?: Array<{ message_id: string; status: string }> }
      response_code?: string
    }

    if (!res.ok || data.response_code !== 'SUCCESS') {
      console.error('[clicksend] Send failed:', JSON.stringify(data))
      return { ok: false, error: `ClickSend error: ${data.response_code}` }
    }

    const msg = data.data?.messages?.[0]
    return { ok: true, message_id: msg?.message_id }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[clicksend] Exception:', error)
    return { ok: false, error }
  }
}
