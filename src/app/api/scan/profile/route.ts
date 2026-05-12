import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PrismaClient } from '@prisma/client'
import { buildSiteProfile } from '@/lib/siteProfile'

const prisma = new PrismaClient()

// GET: scan a site and return + store its profile
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url     = new URL(req.url)
  const siteUrl = url.searchParams.get('siteUrl') || ''
  const apiKey  = url.searchParams.get('apiKey')  || ''

  if (!siteUrl || !apiKey) {
    return NextResponse.json({ error: 'siteUrl and apiKey required' }, { status: 400 })
  }

  const profile = await buildSiteProfile(siteUrl, apiKey)

  if (!profile) {
    return NextResponse.json({ error: 'Could not connect to site bridge' }, { status: 502 })
  }

  // Store in Site.scanData for future use
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (user) {
    const cleanUrl = siteUrl.replace(/\/$/, '')
    await prisma.site.updateMany({
      where: { userId: user.id, url: { in: [cleanUrl, cleanUrl + '/'] } },
      data: {
        scanData: profile as any,
        builder:  profile.builder,
        lastSeen: new Date(),
      },
    })
  }

  return NextResponse.json({ success: true, profile })
}
