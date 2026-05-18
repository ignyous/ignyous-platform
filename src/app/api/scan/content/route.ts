import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

/** Fetch live page and verify expected content changes are visible */
async function verifyOnPage(pageUrl: string, expect?: string, notExpect?: string): Promise<{ verified: boolean; message: string }> {
  if (!pageUrl || (!expect && !notExpect)) return { verified: true, message: '' }
  try {
    const r = await fetch(`${pageUrl}${pageUrl.includes('?') ? '&' : '?'}_nocache=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { verified: true, message: '' } // can't verify, assume ok
    const html = await r.text()
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const lower = text.toLowerCase()
    if (expect && !lower.includes(expect.toLowerCase())) return { verified: false, message: `New text not yet visible — may be cached. Try hard refresh.` }
    if (notExpect && lower.includes(notExpect.toLowerCase())) return { verified: false, message: `Old text still showing — may be cached. Try hard refresh.` }
    return { verified: true, message: 'Verified on live page.' }
  } catch { return { verified: true, message: '' } }
}

function cleanBase(url: string) { return url.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') }
function authHeaders(key: string) { return { 'Authorization': `Bearer ${key}`, 'X-Ignyous-Key': key, 'Content-Type': 'application/json' } }

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, siteUrl, apiKey, query, find, replace, scope, page_id, post_id, search_text } = body
  if (!siteUrl || !apiKey) return NextResponse.json({ error: 'siteUrl and apiKey required' }, { status: 400 })

  const base = cleanBase(siteUrl)

  // ── Scan ──────────────────────────────────────────────────────
  if (action === 'scan' || !action) {
    const url = `${base}/wp-json/ignyous/v1/content/find?query=${encodeURIComponent(query || '')}&api_key=${encodeURIComponent(apiKey)}`
    try {
      const r = await fetch(url, { headers: authHeaders(apiKey), signal: AbortSignal.timeout(15000) })
      const d = await r.json()
      if (!r.ok || !d.success) return NextResponse.json({ success: false, error: `Bridge ${r.status}: ${d?.message || 'scanner unavailable'}` })
      return NextResponse.json(d)
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Network error: ${e.message}` })
    }
  }

  // ── Replace ───────────────────────────────────────────────────
  if (action === 'replace') {
    if (!find) return NextResponse.json({ error: 'find text required' }, { status: 400 })

    let rawStatus = 0, rawText = '', result: any = null
    try {
      const r = await fetch(`${base}/wp-json/ignyous/v1/content/replace`, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({ find, replace: replace || '', scope: scope || 'all', page_id: page_id || 0, api_key: apiKey }),
        signal: AbortSignal.timeout(30000),
      })
      rawStatus = r.status
      rawText   = await r.text()
      try { result = JSON.parse(rawText) } catch {}
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Network error reaching bridge: ${e.message}` })
    }

    if (!result?.success) {
      const detail = result?.message || result?.data?.message || rawText.slice(0, 300)
      return NextResponse.json({ success: false, error: `Bridge HTTP ${rawStatus}: ${detail}` })
    }
    // Verify on live page
    const verifyUrl = page_id ? `${base}/?p=${page_id}` : base
    const verify = await verifyOnPage(verifyUrl, replace || undefined, result?.updated_count > 0 ? find : undefined)
    return NextResponse.json({ ...result, verification: verify })
  }

  // ── Site-wide Replace ──────────────────────────────────────────
  if (action === 'site_wide_replace') {
    if (!find) return NextResponse.json({ error: 'find text required' }, { status: 400 })

    let rawStatus = 0, rawText = '', result: any = null
    try {
      const r = await fetch(`${base}/wp-json/ignyous/v1/site-wide/replace`, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({ find, replace: replace || '', api_key: apiKey }),
        signal: AbortSignal.timeout(30000),
      })
      rawStatus = r.status
      rawText   = await r.text()
      try { result = JSON.parse(rawText) } catch {}
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Network error: ${e.message}` })
    }

    if (!result?.success) {
      const detail = result?.message || result?.data?.message || rawText.slice(0, 300)
      return NextResponse.json({ success: false, error: `Bridge HTTP ${rawStatus}: ${detail}` })
    }
    // Verify on front page
    const swVerify = await verifyOnPage(base, replace || undefined, result?.total_replaced > 0 ? find : undefined)
    return NextResponse.json({ ...result, verification: swVerify })
  }

  // ── Insert Elementor Element ─────────────────────────────────────
  if (action === 'insert_element') {
    const pid = post_id || page_id
    if (!pid) return NextResponse.json({ error: 'post_id required' }, { status: 400 })

    let rawStatus = 0, rawText = '', result: any = null
    try {
      const r = await fetch(`${base}/wp-json/ignyous/v1/elementor/insert-element`, {
        method: 'POST', headers: authHeaders(apiKey),
        body: JSON.stringify({
          post_id:   pid,
          element:   body.element   || null,
          position:  body.position  || 'end',
          parent_id: body.parent_id || null,
          api_key:   apiKey,
        }),
        signal: AbortSignal.timeout(30000),
      })
      rawStatus = r.status
      rawText   = await r.text()
      try { result = JSON.parse(rawText) } catch {}
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Network error: ${e.message}` })
    }

    if (!result?.success) {
      const detail = result?.message || result?.data?.message || rawText.slice(0, 300)
      return NextResponse.json({ success: false, error: `Bridge HTTP ${rawStatus}: ${detail}` })
    }
    return NextResponse.json(result)
  }

  // ── CSS Injection / Style Updates ──────────────────────────────
  if (action === 'update_style' || action === 'inject_css') {
    const endpoint = action === 'update_style'
      ? `${base}/wp-json/ignyous/v1/css/update-style`
      : `${base}/wp-json/ignyous/v1/css/inject`

    const payload = action === 'update_style'
      ? { post_id: post_id || page_id || 0, element_id: body.element_id || '', target: body.target || '', styles: body.styles || {}, label: body.label || '', api_key: apiKey }
      : { rules: body.rules || [], raw_css: body.raw_css || '', api_key: apiKey }

    let rawStatus = 0, rawText = '', result: any = null
    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: authHeaders(apiKey),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      })
      rawStatus = r.status
      rawText   = await r.text()
      try { result = JSON.parse(rawText) } catch {}
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Network error: ${e.message}` })
    }

    if (!result?.success) {
      const detail = result?.message || result?.data?.message || rawText.slice(0, 300)
      return NextResponse.json({ success: false, error: `Bridge HTTP ${rawStatus}: ${detail}` })
    }
    return NextResponse.json(result)
  }

  // ── Update Widget Settings ──────────────────────────────────────
  if (action === 'update_widget' || action === 'update_widgets_batch') {
    const pid = post_id || page_id
    if (!pid) return NextResponse.json({ error: 'post_id required' }, { status: 400 })

    const endpoint = action === 'update_widgets_batch'
      ? `${base}/wp-json/ignyous/v1/elementor/update-widgets`
      : `${base}/wp-json/ignyous/v1/elementor/update-widget`

    const payload = action === 'update_widgets_batch'
      ? { post_id: pid, updates: body.updates || [], api_key: apiKey }
      : { post_id: pid, element_id: body.element_id || '', search_text: body.search_text || '', settings: body.settings || {}, api_key: apiKey }

    let rawStatus = 0, rawText = '', result: any = null
    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: authHeaders(apiKey),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      })
      rawStatus = r.status
      rawText   = await r.text()
      try { result = JSON.parse(rawText) } catch {}
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Network error: ${e.message}` })
    }

    if (!result?.success) {
      const detail = result?.message || result?.data?.message || rawText.slice(0, 300)
      return NextResponse.json({ success: false, error: `Bridge HTTP ${rawStatus}: ${detail}` })
    }
    return NextResponse.json(result)
  }

  // ── Reorder Elementor element ────────────────────────────────────
  if (action === 'reorder_element') {
    const pid = post_id || page_id
    if (!pid) return NextResponse.json({ error: 'post_id required' }, { status: 400 })

    let rawStatus = 0, rawText = '', result: any = null
    try {
      const r = await fetch(`${base}/wp-json/ignyous/v1/elementor/reorder-element`, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          post_id: pid,
          mode:            body.mode            || 'swap',
          source:          body.source          || '',
          target:          body.target          || '',
          source_position: body.source_position || 0,
          target_position: body.target_position || 0,
          api_key: apiKey,
        }),
        signal: AbortSignal.timeout(30000),
      })
      rawStatus = r.status
      rawText   = await r.text()
      try { result = JSON.parse(rawText) } catch {}
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Network error: ${e.message}` })
    }

    if (!result?.success) {
      const detail = result?.message || result?.data?.message || rawText.slice(0, 300)
      return NextResponse.json({ success: false, error: `Bridge HTTP ${rawStatus}: ${detail}` })
    }
    return NextResponse.json(result)
  }

  // ── Remove Elementor element ───────────────────────────────────
  if (action === 'remove_element') {
    const pid        = post_id || page_id
    const stxt       = search_text || find
    const element_id = body.element_id || null
    const nth        = body.nth        || 0
    if (!pid || (!stxt && !element_id)) return NextResponse.json({ error: 'post_id and (search_text or element_id) required' }, { status: 400 })

    let rawStatus = 0, rawText = '', result: any = null
    try {
      const r = await fetch(`${base}/wp-json/ignyous/v1/elementor/remove-element`, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({ post_id: pid, search_text: stxt, element_id, nth, api_key: apiKey }),
        signal: AbortSignal.timeout(30000),
      })
      rawStatus = r.status
      rawText   = await r.text()
      try { result = JSON.parse(rawText) } catch {}
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `Network error: ${e.message}` })
    }

    if (!result?.success) {
      const detail = result?.message || result?.data?.message || rawText.slice(0, 300)
      return NextResponse.json({ success: false, error: `Bridge HTTP ${rawStatus}: ${detail}` })
    }
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
