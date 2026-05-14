import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

function cleanUrl(u: string) {
  return u.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
}

async function bridgePurge(siteUrl: string, apiKey: string) {
  const base = cleanUrl(siteUrl)
  const res  = await fetch(`${base}/wp-json/ignyous/v1/cache/purge`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Ignyous-Key': apiKey, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { success: false, error: `Bridge ${res.status}: ${t.slice(0, 120)}` }
  }
  return res.json().catch(() => ({ success: false, error: 'Invalid JSON from bridge' }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteUrl, apiKey } = await req.json()
  if (!siteUrl || !apiKey) return NextResponse.json({ error: 'siteUrl and apiKey required' }, { status: 400 })

  const result = await bridgePurge(siteUrl, apiKey)
  return NextResponse.json(result)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  return NextResponse.json({ message: 'Use POST to purge cache', siteUrl: url.searchParams.get('siteUrl') })
}
