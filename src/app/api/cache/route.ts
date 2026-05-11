import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

async function bridge(siteUrl: string, apiKey: string, endpoint: string, method = 'POST', body?: any) {
  const base    = siteUrl.replace(/\/$/, '')
  const headers: Record<string,string> = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const res = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  return res.json().catch(() => ({ success: false }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { siteUrl, apiKey, action = 'clear_all' } = await req.json()
  const r = await bridge(siteUrl, apiKey, `cache/${action}`, 'POST')
  return NextResponse.json(r)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const r = await bridge(url.searchParams.get('siteUrl')!, url.searchParams.get('apiKey')!, 'cache/status', 'GET')
  return NextResponse.json(r)
}
