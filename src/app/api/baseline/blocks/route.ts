// src/app/api/baseline/blocks/route.ts
// GET ?siteId=&pageId= — list Gutenberg blocks on a page (flat with paths).
// If pageId is omitted, resolves the home page via /site.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { bridgeCall, getSiteByIdForUser } from '@/lib/baseline/bridge'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url    = new URL(req.url)
  const siteId = url.searchParams.get('siteId') || ''
  let pageId   = url.searchParams.get('pageId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const site = await getSiteByIdForUser(siteId, session.user.email!)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  if (!pageId) {
    const s = await bridgeCall(site, 'site')
    pageId = s.data?.home_page_id ? String(s.data.home_page_id) : null
    if (!pageId) return NextResponse.json({ error: 'No home page set. Pass ?pageId=.' }, { status: 400 })
  }

  const r = await bridgeCall(site, `pages/${pageId}/blocks`)
  return NextResponse.json({
    ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs,
    pageId: Number(pageId),
    count: r.data?.count || 0,
    blocks: (r.data?.blocks as any[]) || [],
  }, { status: r.ok ? 200 : (r.status || 500) })
}
