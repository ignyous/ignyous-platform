import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { bridgeCall, getSiteByIdForUser } from '@/lib/baseline/bridge'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const siteId = url.searchParams.get('siteId') || ''
  const limit  = url.searchParams.get('limit') || '50'
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })
  const site = await getSiteByIdForUser(siteId, session.user.email!)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  const r = await bridgeCall(site, `actions?limit=${encodeURIComponent(limit)}`)
  return NextResponse.json({ ok: r.ok, error: r.error, actions: r.data?.actions || [] })
}
