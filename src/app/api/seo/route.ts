import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function bridge(siteUrl: string, apiKey: string, endpoint: string, method = 'GET', body?: any) {
  const base    = siteUrl.replace(/\/$/, '')
  const headers: Record<string,string> = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  try {
    const res = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
    return res.json()
  } catch (e: any) { return { success: false, error: e.message } }
}

// ── GET: audit all pages' SEO state ─────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url     = new URL(req.url)
  const siteUrl = url.searchParams.get('siteUrl') || ''
  const apiKey  = url.searchParams.get('apiKey')  || ''
  if (!siteUrl || !apiKey) return NextResponse.json({ error: 'siteUrl and apiKey required' }, { status: 400 })

  // Fetch pages + their SEO data via bridge
  const pagesRes = await bridge(siteUrl, apiKey, 'pages')
  const pages    = pagesRes?.data?.pages || pagesRes?.data?.data?.pages || []

  // Fetch SEO data for each page
  const pagesWithSeo = await Promise.all(pages.map(async (page: any) => {
    const seoRes = await bridge(siteUrl, apiKey, `pages/${page.id}/seo`)
    return {
      ...page,
      seo: seoRes?.data || {
        seo_title: '', meta_description: '', focus_keyword: '',
        og_title: '', og_description: '', has_h1: false, has_schema: false,
        plugin: 'none',
      },
    }
  }))

  // Score each page
  const audited = pagesWithSeo.map(page => ({
    ...page,
    score:   scorePage(page),
    issues:  getPageIssues(page),
  }))

  return NextResponse.json({ pages: audited, totalPages: audited.length })
}

// ── POST: write SEO fields, bulk update, or AI-generate ─────────
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, siteUrl, apiKey, pageId, seoData, pages: bulkPages, siteContext } = await req.json()

  // ── Single page SEO update ──────────────────────────────────────
  if (action === 'update' && pageId) {
    const r = await bridge(siteUrl, apiKey, `pages/${pageId}/seo`, 'POST', seoData)
    return NextResponse.json({ success: r?.success ?? false, data: r?.data, message: r?.message })
  }

  // ── AI-generate SEO for a single page ──────────────────────────
  if (action === 'generate' && pageId) {
    const pageRes = await bridge(siteUrl, apiKey, `pages/${pageId}`)
    const page    = pageRes?.data?.page || {}
    const content = page.content || ''
    const title   = page.title   || ''

    const prompt = `You are an SEO expert. Analyze this WordPress page and generate optimized SEO metadata.

Page title: ${title}
Page content (excerpt): ${content.replace(/<[^>]+>/g, ' ').slice(0, 2000)}
Site context: ${JSON.stringify(siteContext || {}).slice(0, 500)}

Generate ONLY a JSON object (no markdown, no explanation):
{
  "seo_title": "Optimized SEO title under 60 chars with primary keyword near the start",
  "meta_description": "Compelling meta description 150-160 chars that includes keyword and CTA",
  "focus_keyword": "primary target keyword (2-4 words)",
  "og_title": "Social media title (can be slightly different, more engaging)",
  "og_description": "Social media description under 200 chars",
  "suggested_h1": "Optimized H1 if current one is weak (or null if good)",
  "suggested_headings": ["H2 suggestion 1", "H2 suggestion 2"],
  "schema_type": "WebPage|LocalBusiness|Product|Article|FAQPage (most appropriate)",
  "score_estimate": 85,
  "improvements": ["What changed and why"]
}`

    const response  = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    let generated: any = {}
    try { generated = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}

    // Write to WordPress
    const writeRes = await bridge(siteUrl, apiKey, `pages/${pageId}/seo`, 'POST', generated)
    return NextResponse.json({ success: writeRes?.success ?? false, generated, message: writeRes?.message })
  }

  // ── Bulk AI SEO for all pages ───────────────────────────────────
  if (action === 'bulk_generate' && bulkPages?.length) {
    const results: any[] = []
    for (const page of bulkPages) {
      // Generate for each page
      const pageRes = await bridge(siteUrl, apiKey, `pages/${page.id}`)
      const pageData = pageRes?.data?.page || {}
      const content  = (pageData.content || '').replace(/<[^>]+>/g, ' ').slice(0, 1500)

      const prompt = `SEO expert. Generate optimized metadata for this WordPress page. JSON only, no markdown.
Page: "${page.title}"
Content: ${content}
Site: ${siteContext?.site_name || ''} — ${siteContext?.description || ''}

Return: {"seo_title":"","meta_description":"","focus_keyword":"","og_title":"","og_description":""}`

      try {
        const res = await anthropic.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        })
        const raw  = res.content[0].type === 'text' ? res.content[0].text : '{}'
        const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
        const writeRes = await bridge(siteUrl, apiKey, `pages/${page.id}/seo`, 'POST', data)
        results.push({ pageId: page.id, title: page.title, success: writeRes?.success ?? false, data })
      } catch (e: any) {
        results.push({ pageId: page.id, title: page.title, success: false, error: e.message })
      }
    }
    return NextResponse.json({ success: true, results, updated: results.filter(r => r.success).length })
  }

  // ── Generate schema markup ──────────────────────────────────────
  if (action === 'generate_schema' && pageId) {
    const pageRes = await bridge(siteUrl, apiKey, `pages/${pageId}`)
    const page    = pageRes?.data?.page || {}
    const content = (page.content || '').replace(/<[^>]+>/g, ' ').slice(0, 2000)

    const prompt = `Generate JSON-LD schema markup for this WordPress page. Return only the JSON-LD script content.
Page: "${page.title}"
Content: ${content}
Site: ${siteContext?.site_name} at ${siteContext?.site_url}
Type: ${req.headers.get('x-schema-type') || 'auto-detect'}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    const schema = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const writeRes = await bridge(siteUrl, apiKey, `pages/${pageId}/seo`, 'POST', { schema_json_ld: schema })
    return NextResponse.json({ success: writeRes?.success ?? false, schema })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── Scoring helpers ───────────────────────────────────────────────
function scorePage(page: any): number {
  let score = 0
  const seo = page.seo || {}
  if (seo.seo_title)        score += 20
  if (seo.meta_description) score += 20
  if (seo.focus_keyword)    score += 15
  if (seo.og_title)         score += 10
  if (seo.og_description)   score += 10
  if (page.seo?.has_h1)     score += 15
  if (seo.has_schema)       score += 10
  return score
}

function getPageIssues(page: any): string[] {
  const issues: string[] = []
  const seo = page.seo || {}
  if (!seo.seo_title)        issues.push('Missing SEO title')
  if (!seo.meta_description) issues.push('Missing meta description')
  if (!seo.focus_keyword)    issues.push('No focus keyword set')
  if (!seo.og_title)         issues.push('No Open Graph title (affects social sharing)')
  if (!seo.has_h1)           issues.push('No H1 heading detected')
  if (!seo.has_schema)       issues.push('No schema markup')
  if (seo.seo_title && seo.seo_title.length > 60) issues.push('SEO title too long (over 60 chars)')
  if (seo.meta_description && seo.meta_description.length > 160) issues.push('Meta description too long (over 160 chars)')
  if (seo.meta_description && seo.meta_description.length < 120) issues.push('Meta description too short (under 120 chars)')
  return issues
}
