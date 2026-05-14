import { NextRequest, NextResponse } from 'next/server'
function cleanUrl(u: string) { return u.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') }
function hdrs(k: string) { return { 'X-Ignyous-Key': k, 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' } }

// GET /api/wordpress/theme-css?siteUrl=...&apiKey=...&query=logo
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const siteUrl = searchParams.get('siteUrl')!
  const apiKey  = searchParams.get('apiKey')!
  const query   = searchParams.get('query') || 'logo'
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/theme/scan-css?query=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`, {
    headers: hdrs(apiKey), signal: AbortSignal.timeout(15000),
  })
  return NextResponse.json(await res.json().catch(() => ({ success: false, matches: [] })))
}

// POST /api/wordpress/theme-css — update custom CSS
export async function POST(req: NextRequest) {
  const { siteUrl, apiKey, ...body } = await req.json()
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/theme/custom-css`, {
    method: 'POST', headers: hdrs(apiKey),
    body: JSON.stringify({ ...body, api_key: apiKey }),
    signal: AbortSignal.timeout(15000),
  })
  return NextResponse.json(await res.json().catch(() => ({ success: false })))
}
