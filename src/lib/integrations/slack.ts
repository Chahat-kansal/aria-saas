import { getConnectorTokens, writeConnectorTokens, clearConnectorTokens } from '@/lib/integrations/connector-tokens'

// CONNECTOR-VAULT-1a — Slack migrated as the proof connector: tokens now live encrypted in
// pos_oauth_integrations (integration_key='slack') instead of plaintext on businesses.
// slack_access_token. The non-secret display columns (slack_connected, slack_team_id,
// slack_team_name, slack_channel_id, slack_channel_name, slack_briefing_enabled) stay on
// `businesses` unchanged — only the credential itself moved.
export const SLACK_KEY = 'slack' as const

export async function getSlackAccessToken(businessId: string): Promise<string | null> {
  const tokens = await getConnectorTokens(businessId, SLACK_KEY)
  return tokens?.access_token ?? null
}

export async function writeSlackToken(businessId: string, integrationId: string, accessToken: string): Promise<void> {
  await writeConnectorTokens(businessId, integrationId, { access_token: accessToken })
}

export async function disconnectSlack(businessId: string): Promise<void> {
  await clearConnectorTokens(businessId, SLACK_KEY)
}

export async function sendSlackMessage(
  accessToken: string,
  channelId: string,
  message: string,
  blocks?: unknown[],
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = {
    channel: channelId,
    text: message,
  }
  if (blocks && blocks.length > 0) payload.blocks = blocks

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json() as Record<string, unknown>
  return { ok: Boolean(data.ok), error: data.error as string | undefined }
}
