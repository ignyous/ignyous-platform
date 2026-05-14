import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
function cleanBase(url: string) { return url.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') }
function authHeaders(key: string) { return { 'Authorization': `Bearer ${key}`, 'X-Ignyous-Key': key, 'Content-Type': 'application/json' } }

/**
 * GET  /api/content-graph?siteUrl=...&apiKey=...         — fetch stored graph
 * POST /api/content-graph { siteUrl, apiKey }            — trigger fresh scan, store, return
 * POST /api/content-graph { siteUrl, apiKey, pageId }    — re-scan a single page
 */

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const siteUrl = req.nextUrl.searchParams.get('siteUrl')
  if (!siteUrl) return NextResponse.json({ error: 'siteUrl required' }, { status: 400 })

  // Return stored graph from Site.memory
  const site = await prisma.site.findFirst({
    where: { url: { contains: siteUrl.replace(/https?:\/\//, '').replace(/\/$/, '') } },
    select: { memory: true },
  })

  const memory = (site?.memory as any) || {}
  return NextResponse.json({
    success: true,
    contentGraph: memory.contentGraph || null,
    scannedAt:    memory.contentGraphScannedAt || null,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteUrl, apiKey, pageId } = await req.json()
  if (!siteUrl || !apiKey) return NextResponse.json({ error: 'siteUrl and apiKey required' }, { status: 400 })

  const base = cleanBase(siteUrl)

  try {
    let result: any

    if (pageId) {
      // Single page re-scan
      const r = await fetch(`${base}/wp-json/ignyous/v1/content-graph/page/${pageId}?api_key=${encodeURIComponent(apiKey)}`, {
        headers: authHeaders(apiKey),
        signal: AbortSignal.timeout(15000),
      })
      result = await r.json()

      if (result?.success && result?.page) {
        // Merge into existing graph
        const site = await prisma.site.findFirst({
          where: { url: { contains: siteUrl.replace(/https?:\/\//, '').replace(/\/$/, '') } },
          select: { id: true, memory: true },
        })
        if (site) {
          const memory = (site.memory as any) || {}
          const graph  = memory.contentGraph || { pages: [] }
          // Replace or add the page
          const idx = graph.pages?.findIndex((p: any) => p.id === pageId)
          if (idx >= 0) graph.pages[idx] = result.page
          else graph.pages.push(result.page)
          await prisma.site.update({
            where: { id: site.id },
            data:  { memory: { ...memory, contentGraph: graph, contentGraphScannedAt: new Date().toISOString() } },
          })
        }
        return NextResponse.json({ success: true, page: result.page })
      }
    } else {
      // Full site scan
      const r = await fetch(`${base}/wp-json/ignyous/v1/content-graph?api_key=${encodeURIComponent(apiKey)}`, {
        headers: authHeaders(apiKey),
        signal: AbortSignal.timeout(30000),
      })
      result = await r.json()

      if (result?.success) {
        // Store in Site.memory
        const urlClean = siteUrl.replace(/https?:\/\//, '').replace(/\/$/, '')
        const site = await prisma.site.findFirst({
          where: { url: { contains: urlClean } },
          select: { id: true, memory: true },
        })
        if (site) {
          const memory = (site.memory as any) || {}
          await prisma.site.update({
            where: { id: site.id },
            data:  {
              memory: {
                ...memory,
                contentGraph:          result,
                contentGraphScannedAt: new Date().toISOString(),
              },
            },
          })
        }
        return NextResponse.json({ success: true, contentGraph: result })
      }
    }

    return NextResponse.json({
      success: false,
      error: result?.message || result?.data?.message || 'Content graph scan failed',
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: `Scan error: ${e.message}` })
  }
}
