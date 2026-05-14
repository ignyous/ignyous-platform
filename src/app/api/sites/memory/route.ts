/**
 * /api/sites/memory — read and update Site.memory for a given site URL.
 *
 * Site.memory shape:
 * {
 *   builder, theme, wp_version, logo_attachment_id, elementor_kit_id,
 *   plugin_knowledge: { elementor: {...}, ... },
 *   page_content_index: [{ id, title, slug, text }],
 *   theme_css_rules: { logo: [{ selector, declaration }] },
 *   known_options: { theme_option_name, logo_max_width_key, ... },
 *   active_plugins: string[],
 *   last_indexed: ISO string,
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/sites/memory?siteUrl=...
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const siteUrl = new URL(req.url).searchParams.get('siteUrl')
  if (!siteUrl) return NextResponse.json({ error: 'siteUrl required' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const site = await prisma.site.findFirst({
    where: { userId: user.id, url: { contains: siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') } },
    select: { id: true, url: true, memory: true, scanData: true, theme: true, builder: true, wpVersion: true },
  })
  if (!site) return NextResponse.json({ memory: null, site: null })

  return NextResponse.json({ memory: site.memory, site })
}

// PATCH /api/sites/memory — merge (not replace) memory fields
export async function PATCH(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteUrl, memory: newMemory, scanData } = await req.json()
  if (!siteUrl) return NextResponse.json({ error: 'siteUrl required' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const site = await prisma.site.findFirst({
    where: { userId: user.id, url: { contains: siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') } },
  })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  // Deep merge: keep existing keys, override only provided keys
  const existing = (site.memory as Record<string, any>) || {}
  const merged   = { ...existing, ...newMemory, last_indexed: new Date().toISOString() }

  const updated = await prisma.site.update({
    where: { id: site.id },
    data:  {
      memory:   merged,
      ...(scanData ? { scanData } : {}),
      // Also update top-level fields if provided
      ...(newMemory?.theme    ? { theme: newMemory.theme }       : {}),
      ...(newMemory?.builder  ? { builder: newMemory.builder }   : {}),
      ...(newMemory?.wp_version ? { wpVersion: newMemory.wp_version } : {}),
      lastSeen: new Date(),
    },
    select: { id: true, memory: true },
  })

  return NextResponse.json({ success: true, memory: updated.memory })
}
