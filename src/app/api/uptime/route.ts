import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'

const prisma = new PrismaClient()

async function pingSite(url: string): Promise<{ status: 'up'|'down'|'degraded'; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000), redirect: 'follow' })
    const latencyMs = Date.now() - start
    if (res.ok) return { status: latencyMs > 3000 ? 'degraded' : 'up', latencyMs }
    return { status: 'down', latencyMs, error: `HTTP ${res.status}` }
  } catch (e: any) {
    return { status: 'down', latencyMs: Date.now() - start, error: e.message }
  }
}

// POST — manual ping for a single site
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteId } = await req.json()
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const result = await pingSite(site.url)
  await prisma.uptimeLog.create({ data: { siteId: site.id, ...result } })

  return NextResponse.json({ ...result, siteId })
}

// GET — uptime history for a site
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const siteId = new URL(req.url).searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const logs = await prisma.uptimeLog.findMany({
    where: { siteId },
    orderBy: { checkedAt: 'desc' },
    take: 48, // last 48 checks = 4h at 5min intervals
  })

  const upCount   = logs.filter(l => l.status === 'up').length
  const uptimePct = logs.length ? Math.round((upCount / logs.length) * 1000) / 10 : null

  return NextResponse.json({ logs, uptimePct })
}
