import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function bridge(siteUrl: string, apiKey: string, endpoint: string, method = 'GET', body?: any) {
  const base    = siteUrl.replace(/\/$/, '')
  const headers: Record<string,string> = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const res = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  })
  return res.json().catch(() => ({ success: false }))
}

// ── GET: read page structure (sections, their settings, IDs) ──────
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url     = new URL(req.url)
  const siteUrl = url.searchParams.get('siteUrl') || ''
  const apiKey  = url.searchParams.get('apiKey')  || ''
  const pageId  = url.searchParams.get('pageId')  || ''
  const r = await bridge(siteUrl, apiKey, `pages/${pageId}/structure`)
  return NextResponse.json(r)
}

// ── POST: surgical element update ────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    action, siteUrl, apiKey, pageId,
    elementId,       // for targeted updates
    updates,         // { background_color, background_image, padding, etc. }
    description,     // human description of the target ("the hero section", "the contact form row")
    newOrder,        // array of section IDs for reordering
    imageData,       // base64 image for upload
    imageName,       // filename for upload
    fromIndex,       // for move operations
    toIndex,
  } = await req.json()

  // ── Upload image to WP media library ───────────────────────────
  if (action === 'upload_image') {
    const r = await bridge(siteUrl, apiKey, 'media', 'POST', { imageData, imageName })
    return NextResponse.json(r)
  }

  // ── Read structure (also available via GET) ─────────────────────
  if (action === 'read_structure') {
    const r = await bridge(siteUrl, apiKey, `pages/${pageId}/structure`)
    return NextResponse.json(r)
  }

  // ── Update element by ID ────────────────────────────────────────
  if (action === 'update_element' && elementId) {
    const r = await bridge(siteUrl, apiKey, `pages/${pageId}/element/${elementId}`, 'PATCH', { updates })
    return NextResponse.json(r)
  }

  // ── Find element by description (Claude-powered matching) ────────
  if (action === 'find_and_update' && description) {
    // Step 1: read full page structure from bridge
    const structureRes = await bridge(siteUrl, apiKey, `pages/${pageId}/structure`)
    const sections = structureRes?.data?.sections || []
    const builder  = structureRes?.data?.builder  || 'unknown'
    let   targetId: string | null = null

    // Step 2: ask Claude to pick the best matching element
    if (sections.length > 0) {
      try {
        const summary = sections.slice(0, 40).map((s: any, i: number) =>
          `[index:${i}] id="${s.id}" type="${s.type}" label="${s.label}" ` +
          `bg_color="${s.settings?.background_color || 'none'}" ` +
          `bg_image="${s.settings?.background_image ? 'yes' : 'no'}" ` +
          `text="${(s.settings?.title || s.settings?.text || '').slice(0, 80).replace(/\n/g,' ')}"`
        ).join('\n')

        const resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 60,
          messages: [{ role: 'user', content:
            `Builder: ${builder}. Page elements:\n${summary}\n\n` +
            `User wants to edit: "${description}"\n\n` +
            `Rules:\n` +
            `- "header", "hero", "banner", "top" → usually index 0 (the first section)\n` +
            `- "footer", "bottom" → usually the last section\n` +
            `- "contact", "form" → section containing contact or form text\n` +
            `- Match label text, type, position, and content clues\n\n` +
            `Reply with ONLY the element id value (the string after id=), nothing else. If no match, reply: none`
          }],
        })
        const raw = resp.content[0].type === 'text' ? resp.content[0].text.trim().replace(/^["']|["']$/g, '') : ''
        if (raw && raw !== 'none' && sections.some((s: any) => s.id === raw)) targetId = raw
      } catch {}
    }

    // Step 3: update by matched ID or fall back to bridge keyword matching
    if (targetId) {
      const r = await bridge(siteUrl, apiKey, `pages/${pageId}/element/${targetId}`, 'PATCH', { updates })
      return NextResponse.json({ ...r, matchedId: targetId, matchMethod: 'claude-ai' })
    }
    const r = await bridge(siteUrl, apiKey, `pages/${pageId}/element/find`, 'POST', { description, updates })
    return NextResponse.json({ ...r, matchMethod: 'keyword-fallback' })
  }

  // ── Reorder sections ────────────────────────────────────────────
  if (action === 'reorder' && newOrder) {
    const r = await bridge(siteUrl, apiKey, `pages/${pageId}/reorder`, 'POST', { newOrder })
    return NextResponse.json(r)
  }

  // ── Move section by index ───────────────────────────────────────
  if (action === 'move_section') {
    const r = await bridge(siteUrl, apiKey, `pages/${pageId}/move-section`, 'POST', { fromIndex, toIndex })
    return NextResponse.json(r)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
