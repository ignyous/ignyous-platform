import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, imageBase64, mediaType, fileName, setAsLogo } = await req.json()

    if (!siteUrl || !apiKey || !imageBase64) {
      return NextResponse.json({ error: 'siteUrl, apiKey, and imageBase64 are required' }, { status: 400 })
    }

    const base = siteUrl.replace(/\/$/, '')

    // Use X-Ignyous-Key header (avoids WordPress Application Password auth interference)
    // AND include api_key in body as a further fallback
    const res = await fetch(`${base}/wp-json/ignyous/v1/media/upload`, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Ignyous-Key':  apiKey,
        'Authorization':  `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        media_type:   mediaType || 'image/png',
        file_name:    fileName  || 'upload.png',
        set_as_logo:  setAsLogo ?? false,
        api_key:      apiKey,
      }),
      signal: AbortSignal.timeout(60000),
    })

    const text = await res.text()
    let data: any = {}
    try { data = JSON.parse(text) } catch {}

    if (!res.ok) {
      console.error('[upload-image] bridge error', res.status, text.slice(0, 300))
      if (res.status === 404) {
        return NextResponse.json({ error: 'Endpoint not found. Install/update ignyous-bridge plugin (v2.1+).', success: false }, { status: 404 })
      }
      if (res.status === 401) {
        return NextResponse.json({ error: `Auth failed (401). Your API key may not match what's stored in the plugin. Go to WP Admin → Settings → Ignyous Bridge and copy the key, then reconnect your site.`, debug: data?.message, success: false }, { status: 401 })
      }
      return NextResponse.json({ error: `Bridge ${res.status}: ${data?.message || text.slice(0, 120)}`, success: false }, { status: 502 })
    }

    if (!data.success) {
      return NextResponse.json({ error: data.message || 'Upload failed', success: false }, { status: 500 })
    }

    return NextResponse.json({ success: true, url: data.url, id: data.id, message: data.message, locations: data.locations_updated || [] })

  } catch (err: any) {
    console.error('[upload-image]', err?.message)
    return NextResponse.json({ error: err?.message || 'Server error', success: false }, { status: 500 })
  }
}
