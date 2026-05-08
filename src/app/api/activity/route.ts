import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { logActivity, getActivityLogs } from '@/lib/activityLogger'

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
    const session = await getServerSession()
    const body    = await req.json()

    await logActivity({
      userId:    session?.user?.email ?? undefined,
      siteUrl:   body.siteUrl,
      siteName:  body.siteName,
      category:  body.category  || 'system',
      action:    body.action    || 'unknown',
      status:    body.status    || 'success',
      summary:   body.summary   || '',
      detail:    body.detail,
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
      durationMs: body.durationMs,
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
