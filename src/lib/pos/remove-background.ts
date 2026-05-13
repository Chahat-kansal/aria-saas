/**
 * Removes background from an image URL using AI Engine via RapidAPI.
 * Returns the URL of the transparent PNG (hosted on AI Engine's CDN).
 *
 * Free tier: 100 images/month (no credit card)
 * Pro: $12.99/month for 10,000 images (~$0.0013/image)
 * Sign up: rapidapi.com → search "AI Engine Background Removal"
 * Env var: RAPIDAPI_KEY
 */
export async function removeBackgroundAIEngine(
  imageUrl: string
): Promise<Buffer> {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) throw new Error('RAPIDAPI_KEY not set')

  const response = await fetch(
    'https://background-removal-ai.p.rapidapi.com/remove-background',
    {
      method: 'POST',
      headers: {
        'x-rapidapi-host': 'background-removal-ai.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ image_url: imageUrl }).toString(),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI Engine API error ${response.status}: ${err}`)
  }

  const data = await response.json()

  // AI Engine returns a CDN URL to the transparent PNG
  if (!data.image_url) {
    throw new Error(`AI Engine returned no image_url: ${JSON.stringify(data)}`)
  }

  // Download the transparent PNG to buffer for upload to Supabase
  const pngRes = await fetch(data.image_url)
  if (!pngRes.ok) throw new Error(`Failed to download transparent PNG: ${pngRes.status}`)

  return Buffer.from(await pngRes.arrayBuffer())
}