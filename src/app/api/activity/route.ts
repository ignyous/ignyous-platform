import { NextRequest, NextResponse } from 'next/server'
import { getActivityLogs, logActivity } from '@/lib/activityLogger'

// GET /api/activity — fetch logs (open for now, admin-only later)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit    = Math.min(parseInt(searchParams.get('limit')  || '100'), 500)
  const offset   = parseInt(searchParams.get('offset')  || '0')
  const siteUrl  = searchParams.get('site')     || undefined
  const category = searchParams.get('category') || undefined

  const { logs, total } = await getActivityLogs({ limit, offset, siteUrl, category })
  return NextResponse.json({ success: true, logs, total, limit, offset })
}

// POST /api/activity — called from client-side to log an event
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Don't require session — log whatever comes in (caller already authenticated)
    await logActivity({
      userId:    body.userId    || undefined,
      siteUrl:   body.siteUrl   || undefined,
      siteName:  body.siteName  || undefined,
      category:  body.category  || 'system',
      action:    body.action    || 'unknown',
      status:    body.status    || 'success',
      summary:   body.summary   || '',
      detail:    body.detail    || undefined,
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
      userAgent: req.headers.get('user-agent')       || undefined,
      durationMs: body.durationMs || undefined,
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
