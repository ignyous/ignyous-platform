import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'

const prisma = new PrismaClient()

async function checkUrl(url: string): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000), redirect: 'follow' })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false, status: null }
  }
}

// POST — run a scan
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteId, siteUrl, apiKey } = await req.json()

  // Fetch all pages via bridge
  let links: Array<{ sourceUrl: string; href: string }> = []
  try {
    const pagesRes = await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/ignyous/v1/pages`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const pagesData = await pagesRes.json()
    const pages = pagesData?.data?.pages || []

    for (const page of pages) {
      // Extract hrefs from page content using regex
      const content = page.content || ''
      const hrefs   = [...content.matchAll(/href="([^"]+)"/g)].map(m => m[1])
      for (const href of hrefs) {
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
        const absolute = href.startsWith('http') ? href : `${siteUrl.replace(/\/$/, '')}${href}`
        links.push({ sourceUrl: page.link || siteUrl, href: absolute })
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'Could not fetch pages: ' + e.message }, { status: 502 })
  }

  // Deduplicate
  const unique = [...new Map(links.map(l => [l.href, l])).values()].slice(0, 200)

  // Check each link
  const broken: typeof links & { status?: number }[] = []
  await Promise.all(unique.map(async link => {
    const { ok, status } = await checkUrl(link.href)
    if (!ok) broken.push({ ...link, status })
  }))

  // Clear old results and save new ones
  await prisma.brokenLink.deleteMany({ where: { siteId } })
  if (broken.length > 0) {
    await prisma.brokenLink.createMany({
      data: broken.map(b => ({
        siteId,
        sourceUrl: b.sourceUrl,
        brokenUrl: b.href,
        statusCode: (b as any).status ?? null,
      })),
      skipDuplicates: true,
    })
  }

  return NextResponse.json({ scanned: unique.length, broken: broken.length, results: broken })
}

// GET — fetch stored results
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const siteId = new URL(req.url).searchParams.get('siteId')
  const links  = siteId ? await prisma.brokenLink.findMany({ where: { siteId, fixed: false }, orderBy: { scannedAt: 'desc' } }) : []
  return NextResponse.json({ links })
}

// PATCH — mark as fixed
export async function PATCH(req: NextRequest) {
  const { id } = await req.json()
  await prisma.brokenLink.update({ where: { id }, data: { fixed: true } })
  return NextResponse.json({ success: true })
}
