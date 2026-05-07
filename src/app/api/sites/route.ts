// src/app/api/sites/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET — list sites for logged-in user
export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { sites: { orderBy: { connectedAt: 'desc' } } },
  })

  return NextResponse.json({ sites: user?.sites || [] })
}

// POST — save a newly connected site
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url, name, apiKey, theme, builder, wpVersion } = await req.json()
  if (!url || !apiKey) {
    return NextResponse.json({ error: 'url and apiKey required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const site = await prisma.site.upsert({
    where: { userId_url: { userId: user.id, url } },
    update: { name, apiKey, theme, builder, wpVersion, lastSeen: new Date() },
    create: { userId: user.id, url, name, apiKey, theme, builder, wpVersion },
  })

  return NextResponse.json({ site })
}