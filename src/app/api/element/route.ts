import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

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

  // ── Find element by description + update ────────────────────────
  if (action === 'find_and_update' && description) {
    // First read structure, then let the bridge find by description
    const r = await bridge(siteUrl, apiKey, `pages/${pageId}/element/find`, 'POST', {
      description, updates,
    })
    return NextResponse.json(r)
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
