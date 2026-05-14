import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

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
    return NextResponse.json(result)
  }

  // ── Remove Elementor element ───────────────────────────────────
  if (action === 'remove_element') {
    const pid  = post_id || page_id
    const stxt = search_text || find
    if (!pid || !stxt) return NextResponse.json({ error: 'post_id and search_text required' }, { status: 400 })

    let rawStatus = 0, rawText = '', result: any = null
    try {
      const r = await fetch(`${base}/wp-json/ignyous/v1/elementor/remove-element`, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({ post_id: pid, search_text: stxt, api_key: apiKey }),
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
