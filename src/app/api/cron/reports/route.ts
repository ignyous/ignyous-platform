import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await prisma.user.findMany({ where: { reportEnabled: true, reportEmail: { not: null } } })
  let sent = 0

  for (const user of users) {
    const sites = await prisma.site.findMany({ where: { userId: user.id } })
    for (const site of sites) {
      try {
        await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: site.id, send: true }),
        })
        sent++
      } catch {}
    }
  }

  return NextResponse.json({ ok: true, sent })
}
