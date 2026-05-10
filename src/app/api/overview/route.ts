import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'

const prisma = new PrismaClient()

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      sites: {
        include: {
          uptimeLogs:  { orderBy: { checkedAt: 'desc' }, take: 1 },
          teamMembers: { where: { status: 'active' } },
        },
        orderBy: { lastSeen: 'desc' },
      },
    },
  })

  const activityBysite = await prisma.activityLog.groupBy({
    by: ['siteUrl'],
    _max: { timestamp: true },
    where: {
      siteUrl: { in: user?.sites.map(s => s.url) ?? [] },
    },
  })
  const lastActivityMap = Object.fromEntries(activityBysite.map(a => [a.siteUrl, a._max.timestamp]))

  const sites = (user?.sites || []).map(site => {
    const latest = site.uptimeLogs[0]
    return {
      id:   site.id,
      url:  site.url,
      name: site.name,
      apiKey: site.apiKey,
      uptime: latest
        ? { status: latest.status, latencyMs: latest.latencyMs, checkedAt: latest.checkedAt }
        : { status: 'unknown' },
      lastActivity: lastActivityMap[site.url]?.toISOString() ?? null,
      issueCount:   0, // TODO: derive from scanData
      teamCount:    site.teamMembers.length,
    }
  })

  return NextResponse.json({ sites })
}
