import { NextRequest, NextResponse } from 'next/server'
function cleanUrl(u: string) { return u.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') }

export async function POST(req: NextRequest) {
  const { siteUrl, apiKey, ...payload } = await req.json()
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/media/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ignyous-Key': apiKey, 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ ...payload, api_key: apiKey }),
    signal: AbortSignal.timeout(30000),
  })
  const data = await res.json().catch(() => ({ success: false }))
  return NextResponse.json(data)
}
