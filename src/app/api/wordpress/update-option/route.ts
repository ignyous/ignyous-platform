import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, ...payload } = await req.json()
    if (!siteUrl || !apiKey) {
      return NextResponse.json({ error: 'siteUrl and apiKey required' }, { status: 400 })
    }
    const base = siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
    const res = await fetch(`${base}/wp-json/ignyous/v1/options/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-Ignyous-Key': apiKey },
      body: JSON.stringify({ ...payload, api_key: apiKey }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message || 'Update failed', success: false }, { status: res.status })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message, success: false }, { status: 500 })
  }
}
