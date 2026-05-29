// src/app/api/baseline/elementor-templates/route.ts
// GET ?siteId=&location= — list Elementor theme-builder templates (header/footer/etc.)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { bridgeCall, getSiteByIdForUser } from '@/lib/baseline/bridge'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url      = new URL(req.url)
  const siteId   = url.searchParams.get('siteId') || ''
  const location = url.searchParams.get('location') || ''
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const site = await getSiteByIdForUser(siteId, session.user.email!)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const path = location ? `elementor/templates?location=${encodeURIComponent(location)}` : 'elementor/templates'
  const r = await bridgeCall(site, path)
  return NextResponse.json({
    ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs,
    hasThemeBuilder: !!r.data?.has_theme_builder,
    proVersion: r.data?.pro_version || null,
    count: r.data?.count || 0,
    byType: r.data?.by_type || {},
  }, { status: r.ok ? 200 : (r.status || 500) })
}
