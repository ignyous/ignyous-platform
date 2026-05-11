import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

async function bridge(siteUrl: string, apiKey: string, endpoint: string, method = 'GET', body?: any) {
  const base = siteUrl.replace(/\/$/, '')
  const res  = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
    method, headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  })
  return res.json().catch(() => ({ success: false }))
}

// GET: list all ACF fields for a page/post
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url    = new URL(req.url)
  const r = await bridge(url.searchParams.get('siteUrl')!, url.searchParams.get('apiKey')!, `acf?postId=${url.searchParams.get('postId') || ''}`)
  return NextResponse.json(r)
}

// POST: update ACF field values
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { action, siteUrl, apiKey, postId, fieldKey, fieldValue, fields } = await req.json()

  if (action === 'get_fields') {
    const r = await bridge(siteUrl, apiKey, `acf?postId=${postId}`)
    return NextResponse.json(r)
  }
  if (action === 'update_field') {
    const r = await bridge(siteUrl, apiKey, 'acf', 'PATCH', { postId, fieldKey, fieldValue })
    return NextResponse.json(r)
  }
  if (action === 'update_many') {
    const r = await bridge(siteUrl, apiKey, 'acf', 'PATCH', { postId, fields })
    return NextResponse.json(r)
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
