// src/app/api/baseline/media/upload/route.ts
//
// POST multipart/form-data { siteId, file, alt? } → forwards a base64 upload
// to the WordPress bridge. Returns the bridge response verbatim plus timing.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { randomUUID } from 'crypto'
import { bridgeCall, getSiteByIdForUser } from '@/lib/baseline/bridge'

export const runtime = 'nodejs'
// Avoid Next's automatic JSON parsing — we need the raw FormData.
export const dynamic = 'force-dynamic'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB; bridge enforces the same

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })

  const siteId = String(form.get('siteId') || '')
  const file   = form.get('file') as File | null
  const alt    = String(form.get('alt') || '')

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })
  if (!file)   return NextResponse.json({ error: 'file required' },   { status: 400 })

  const site = await getSiteByIdForUser(siteId, session.user.email!)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large', bytes: file.size, max: MAX_BYTES }, { status: 413 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const b64 = buf.toString('base64')
  const changeId = randomUUID()

  const r = await bridgeCall(site, 'media/upload', {
    method: 'POST',
    body: {
      filename: file.name,
      mime:     file.type,
      data_base64: b64,
      alt,
    },
    changeId,
    intent: `upload ${file.name}`,
  })

  return NextResponse.json({
    success: r.ok,
    changeId,
    bridge: {
      ok: r.ok, status: r.status, data: r.data, error: r.error, durationMs: r.durationMs, url: r.url,
    },
  }, { status: r.ok ? 200 : (r.status || 500) })
}
