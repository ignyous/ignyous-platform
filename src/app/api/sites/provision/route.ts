import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()

function generateApiKey(): string {
  return 'igk_' + randomBytes(32).toString('hex')
}

// POST /api/sites/provision
// Called as soon as user enters a site URL — creates/updates the Site record
// with a fresh API key that ignyous controls. Returns the key so the user
// can paste it into the plugin settings.
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url, name, wpVersion } = await req.json()
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const normalizedUrl = url.replace(/\/$/, '').toLowerCase().startsWith('http')
    ? url.replace(/\/$/, '')
    : `https://${url.replace(/\/$/, '')}`

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Check if site already exists and has a key — reuse it so reconnecting
  // doesn't break existing plugin installations
  const existing = await prisma.site.findFirst({
    where: { userId: user.id, url: normalizedUrl }
  })

  const apiKey = existing?.apiKey || generateApiKey()

  const site = await prisma.site.upsert({
    where: { userId_url: { userId: user.id, url: normalizedUrl } },
    update: { name: name || existing?.name, wpVersion, lastSeen: new Date() },
    create: { userId: user.id, url: normalizedUrl, name, apiKey, wpVersion },
  })

  return NextResponse.json({
    success: true,
    siteId:  site.id,
    apiKey:  site.apiKey,
    url:     normalizedUrl,
    isNew:   !existing,
  })
}

// GET /api/sites/provision?site=URL — returns the stored key for a site
// Used by dashboard to recover the key without localStorage
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const url = searchParams.get('site') || ''
  if (!url) return NextResponse.json({ error: 'site param required' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const site = await prisma.site.findFirst({ where: { userId: user.id, url } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  return NextResponse.json({ success: true, apiKey: site.apiKey, siteId: site.id })
}
