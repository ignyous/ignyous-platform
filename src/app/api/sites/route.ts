import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()

function generateApiKey(): string {
  return 'igk_' + randomBytes(32).toString('hex')
}

// GET — list sites with apiKeys (needed by dashboard)
export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where:   { email: session.user.email },
    include: { sites: { orderBy: { connectedAt: 'desc' } } },
  })
  return NextResponse.json({ sites: user?.sites || [] })
}

// POST — upsert a site (called by connect flow)
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url, name, apiKey, theme, builder, wpVersion } = await req.json()
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Use provided key or generate one
  const key = apiKey || generateApiKey()

  const site = await prisma.site.upsert({
    where:  { userId_url: { userId: user.id, url } },
    update: { name, apiKey: key, theme, builder, wpVersion, lastSeen: new Date() },
    create: { userId: user.id, url, name, apiKey: key, theme, builder, wpVersion },
  })
  return NextResponse.json({ site })
}

// PATCH — rotate API key for a site
export async function PATCH(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteId } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const newKey = generateApiKey()
  const updated = await prisma.site.update({ where: { id: siteId }, data: { apiKey: newKey } })
  return NextResponse.json({ success: true, apiKey: updated.apiKey })
}
