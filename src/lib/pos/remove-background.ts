/**
 * Removes the background from an image URL using PhotoRoom API.
 * Returns a transparent PNG as a Buffer.
 *
 * PhotoRoom API: https://www.photoroom.com/api/background-removal
 * Our cost: $0.02/image. Owner pays: $0.29/image.
 */
export async function removeBackgroundPhotoRoom(imageUrl: string): Promise<Buffer> {
  const apiKey = process.env.PHOTOROOM_API_KEY
  if (!apiKey) throw new Error('PHOTOROOM_API_KEY not set')

  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) throw new Error(`Failed to download image: ${imageRes.status}`)
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer())

  const formData = new FormData()
  formData.append('image_file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'product.jpg')
  formData.append('format', 'png')
  formData.append('channels', 'rgba')

  const response = await fetch('https://sdk.photoroom.com/v1/segment', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData,
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`PhotoRoom API error ${response.status}: ${err}`)
  }

  return Buffer.from(await response.arrayBuffer())
}