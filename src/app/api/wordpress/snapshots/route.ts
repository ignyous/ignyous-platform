import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

function cleanUrl(u: string) { return u.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') }
function headers(k: string) { return { 'X-Ignyous-Key': k, 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' } }

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const siteUrl = searchParams.get('siteUrl')!
  const apiKey  = searchParams.get('apiKey')!
  if (!siteUrl || !apiKey) return NextResponse.json({ error: 'siteUrl and apiKey required' }, { status: 400 })
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/snapshots`, { headers: headers(apiKey), signal: AbortSignal.timeout(10000) })
  return NextResponse.json(await res.json().catch(() => ({ success: false, snapshots: [] })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { siteUrl, apiKey, ...body } = await req.json()
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/snapshots`, {
    method: 'POST', headers: headers(apiKey), body: JSON.stringify({ ...body, api_key: apiKey }), signal: AbortSignal.timeout(10000),
  })
  return NextResponse.json(await res.json().catch(() => ({ success: false })))
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { siteUrl, apiKey, snapshotId } = await req.json()
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/snapshots/${snapshotId}`, {
    method: 'DELETE', headers: headers(apiKey), body: JSON.stringify({ api_key: apiKey }), signal: AbortSignal.timeout(10000),
  })
  return NextResponse.json(await res.json().catch(() => ({ success: false })))
}
