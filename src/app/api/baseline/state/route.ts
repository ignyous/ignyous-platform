// src/app/api/baseline/state/route.ts
//
// Single endpoint that fetches site + options + theme + pages list from the bridge.
// The editor calls this on load and after any apply.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { bridgeCall, getSiteByIdForUser } from '@/lib/baseline/bridge'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const siteId = url.searchParams.get('siteId') || ''
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const site = await getSiteByIdForUser(siteId, session.user.email!)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const [siteInfo, options, theme, pages] = await Promise.all([
    bridgeCall(site, 'site'),
    bridgeCall(site, 'options'),
    bridgeCall(site, 'theme/styles'),
    bridgeCall(site, 'pages'),
  ])

  return NextResponse.json({
    siteId,
    siteUrl: site.url,
    site:    { ok: siteInfo.ok,  error: siteInfo.error,  data: siteInfo.data,  durationMs: siteInfo.durationMs  },
    options: { ok: options.ok,   error: options.error,   data: options.data,   durationMs: options.durationMs   },
    theme:   { ok: theme.ok,     error: theme.error,     data: theme.data,     durationMs: theme.durationMs     },
    pages:   { ok: pages.ok,     error: pages.error,     data: pages.data,     durationMs: pages.durationMs     },
  })
}
