import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, query, scope = 'all' } = await req.json()
    if (!siteUrl || !apiKey || !query) {
      return NextResponse.json({ error: 'siteUrl, apiKey, and query are required' }, { status: 400 })
    }
    const base = siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')

    // Scan options
    const optRes = await fetch(
      `${base}/wp-json/ignyous/v1/options/scan?query=${encodeURIComponent(query)}`,
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Ignyous-Key': apiKey }, signal: AbortSignal.timeout(20000) }
    )
    const optData = optRes.ok ? await optRes.json() : { matches: [] }

    // Also scan post content if scope includes posts
    let postData = { matches: [] as any[] }
    if (scope !== 'options') {
      const postRes = await fetch(
        `${base}/wp-json/ignyous/v1/content/find?query=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Ignyous-Key': apiKey }, signal: AbortSignal.timeout(15000) }
      )
      if (postRes.ok) postData = await postRes.json()
    }

    const all = [...(optData.matches || []), ...(postData.matches || [])]
    all.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))

    return NextResponse.json({ success: true, query, matches: all, count: all.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, success: false }, { status: 500 })
  }
}
