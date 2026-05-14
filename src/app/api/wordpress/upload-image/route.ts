import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, imageBase64, mediaType, fileName, setAsLogo } = await req.json()

    if (!siteUrl || !apiKey || !imageBase64) {
      return NextResponse.json({ error: 'siteUrl, apiKey, and imageBase64 are required' }, { status: 400 })
    }

    const base = siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')

    const res = await fetch(`${base}/wp-json/ignyous/v1/media/upload`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Ignyous-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        media_type:   mediaType || 'image/png',
        file_name:    fileName  || 'upload.png',
        set_as_logo:  setAsLogo ?? false,
        api_key:      apiKey,
      }),
      signal: AbortSignal.timeout(90000),
    })

    const text = await res.text()
    let data: any = {}
    try { data = JSON.parse(text) } catch {}

    if (!res.ok) {
      return NextResponse.json({
        error:     `Bridge ${res.status}: ${data?.message || text.slice(0, 200)}`,
        debug_log: data?.debug_log || [`Bridge returned HTTP ${res.status}`, text.slice(0, 300)],
        success:   false,
      }, { status: res.ok ? 200 : 502 })
    }

    // Forward EVERYTHING including debug_log
    return NextResponse.json({
      success:            data.success,
      url:                data.url,
      id:                 data.id,
      message:            data.message,
      locations_updated:  data.locations_updated || [],
      debug_log:          data.debug_log         || [],   // ← was missing before
      error:              data.error,
    })

  } catch (err: any) {
    return NextResponse.json({
      error:     err?.message || 'Server error',
      debug_log: [`Exception: ${err?.message}`],
      success:   false,
    }, { status: 500 })
  }
}
