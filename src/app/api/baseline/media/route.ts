// src/app/api/baseline/media/route.ts
// GET ?siteId=&limit= — list recent media uploads from the bridge.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { bridgeCall, getSiteByIdForUser } from '@/lib/baseline/bridge'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const siteId = url.searchParams.get('siteId') || ''
  const limit  = url.searchParams.get('limit')  || '20'
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const site = await getSiteByIdForUser(siteId, session.user.email!)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const r = await bridgeCall(site, `media?limit=${encodeURIComponent(limit)}`)
  return NextResponse.json({
    ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs,
    media: (r.data?.media as any[]) || [],
  }, { status: r.ok ? 200 : (r.status || 500) })
}
