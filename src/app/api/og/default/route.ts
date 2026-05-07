export const runtime = 'edge';

export async function GET() {
  const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#08070D"/>
  <defs>
    <radialGradient id="g1" cx="30%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#08070D" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="80%" cy="80%" r="50%">
      <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#08070D" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g1)"/>
  <rect width="1200" height="630" fill="url(#g2)"/>
  <text x="80" y="160" font-family="system-ui, sans-serif" font-size="72" font-weight="800" fill="#F0EBFF" letter-spacing="-2">Aria POS</text>
  <text x="80" y="260" font-family="system-ui, sans-serif" font-size="36" font-weight="400" fill="#918AAE">Square sells. Shopfront manages.</text>
  <text x="80" y="320" font-family="system-ui, sans-serif" font-size="36" font-weight="700" fill="#B49BFB">Aria runs your shop.</text>
  <text x="80" y="420" font-family="system-ui, sans-serif" font-size="22" font-weight="400" fill="#5E5878">The first POS with autonomous AI agents.</text>
  <text x="80" y="456" font-family="system-ui, sans-serif" font-size="22" font-weight="400" fill="#5E5878">Built for Australian retail. From $59/outlet/month.</text>
  <rect x="80" y="510" width="200" height="54" rx="10" fill="#8B5CF6"/>
  <text x="180" y="543" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="white" text-anchor="middle">ariaos.site</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
