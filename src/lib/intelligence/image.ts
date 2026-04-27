// DALL-E image generation — extracted from /api/image/route.ts
export interface ImageResult {
  url: string;
  revised_prompt: string;
}

export async function generateImage(
  prompt: string,
  size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024',
  quality: 'standard' | 'hd' = 'standard',
  style: 'vivid' | 'natural' = 'vivid'
): Promise<ImageResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  if (!prompt?.trim()) throw new Error('Prompt required');
  if (prompt.length > 4000) throw new Error('Prompt too long (max 4000 chars)');

  const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
  if (!validSizes.includes(size)) throw new Error(`Invalid size: ${size}`);

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality,
      style,
      response_format: 'url',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Image generation failed');
  }

  return {
    url: data.data[0].url,
    revised_prompt: data.data[0].revised_prompt,
  };
}
