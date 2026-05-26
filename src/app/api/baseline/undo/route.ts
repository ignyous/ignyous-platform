// src/app/api/baseline/undo/route.ts
// POST { siteId, changeId?, snapshotId? } → restore

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { bridgeCall, getSiteByIdForUser } from '@/lib/baseline/bridge'

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { siteId, changeId, snapshotId } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const site = await getSiteByIdForUser(siteId, session.user.email!)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  if (snapshotId) {
    const r = await bridgeCall(site, `snapshots/${snapshotId}/restore`, { method: 'POST' })
    return NextResponse.json({ success: r.ok, primary: r })
  }
  if (changeId) {
    const r = await bridgeCall(site, `snapshots/restore-change/${changeId}`, { method: 'POST' })
    return NextResponse.json({ success: r.ok, primary: r })
  }
  // No id → undo the last successful non-restore action
  const logRes = await bridgeCall(site, 'actions?limit=20')
  const last = ((logRes.data?.actions as any[]) || []).find(a => a.success && a.capability && !a.capability.startsWith('snapshots.'))
  if (!last) return NextResponse.json({ success: false, error: 'Nothing to undo' }, { status: 404 })
  const r = await bridgeCall(site, `snapshots/restore-change/${last.change_id}`, { method: 'POST' })
  return NextResponse.json({ success: r.ok, primary: r, restoredChangeId: last.change_id })
}
