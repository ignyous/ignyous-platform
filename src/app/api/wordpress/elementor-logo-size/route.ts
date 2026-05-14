import { NextRequest, NextResponse } from 'next/server'
function cleanUrl(u: string) { return u.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') }

export async function POST(req: NextRequest) {
  const { siteUrl, apiKey, widthPx, scalePercent } = await req.json()
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/elementor/logo-size`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ignyous-Key': apiKey, 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ width_px: widthPx, scale_percent: scalePercent, api_key: apiKey }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json().catch(() => ({ success: false }))
  return NextResponse.json(data)
}
