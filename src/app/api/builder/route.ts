import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { detectBuilder, generateSection, BuilderType, SectionData } from '@/lib/builders'

async function bridgeRequest(siteUrl: string, apiKey: string, endpoint: string, method = 'POST', body?: any) {
  const base    = siteUrl.replace(/\/$/, '')
  const headers: Record<string,string> = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const res = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return res.json().catch(() => ({}))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteUrl, apiKey, pageId, builder: builderHint, section } = await req.json() as {
    siteUrl: string; apiKey: string; pageId: number
    builder?: string; section: SectionData
  }

  if (!siteUrl || !apiKey || !pageId || !section) {
    return NextResponse.json({ error: 'siteUrl, apiKey, pageId, section required' }, { status: 400 })
  }

  // Detect builder
  const builder = detectBuilder(builderHint || '')

  // Generate native content for this builder
  const { content, contentType } = generateSection(builder, section)

  let result: any

  if (contentType === 'elementor_json') {
    // Write to Elementor _elementor_data meta via bridge
    result = await bridgeRequest(siteUrl, apiKey, `pages/${pageId}/elementor-append`, 'POST', {
      elements: JSON.parse(content),
      label: section.heading || section.type,
    })
  } else if (contentType === 'beaver_json') {
    // Write to Beaver Builder _fl_builder_data meta via bridge
    result = await bridgeRequest(siteUrl, apiKey, `pages/${pageId}/beaver`, 'POST', {
      rows: JSON.parse(content),
    })
  } else {
    // Divi / WPBakery / Avada / Gutenberg — append to post_content
    // First fetch current content
    const current = await bridgeRequest(siteUrl, apiKey, `pages/${pageId}`, 'GET')
    const currentContent = current?.data?.page?.content || current?.data?.content || ''
    const newContent = currentContent + '\n' + content
    result = await bridgeRequest(siteUrl, apiKey, `pages/${pageId}`, 'POST', {
      content: newContent, status: 'publish',
    })
  }

  return NextResponse.json({
    success: result?.success ?? false,
    builder,
    contentType,
    message: result?.message || result?.error || 'Unknown result',
    data: result?.data,
  })
}

// GET: Detect builder + read current page builder data
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url     = new URL(req.url)
  const siteUrl = url.searchParams.get('siteUrl') || ''
  const apiKey  = url.searchParams.get('apiKey')  || ''
  const pageId  = url.searchParams.get('pageId')  || ''

  if (!siteUrl || !apiKey || !pageId) return NextResponse.json({ error: 'siteUrl, apiKey, pageId required' }, { status: 400 })

  const data = await bridgeRequest(siteUrl, apiKey, `pages/${pageId}/builder-data`, 'GET')
  return NextResponse.json({ ...data, detectedBuilder: data?.data?.builder || 'unknown' })
}
