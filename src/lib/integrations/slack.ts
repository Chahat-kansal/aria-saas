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
