import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, imageBase64, mediaType, fileName, setAsLogo } = await req.json()

    if (!siteUrl || !apiKey || !imageBase64) {
      return NextResponse.json({ error: 'siteUrl, apiKey, and imageBase64 are required' }, { status: 400 })
    }

    const base = siteUrl.replace(/\/$/, '')

    // Send api_key in both the Authorization header AND the body,
    // because nginx/SiteGround sometimes strips Authorization on POST requests.
    const res = await fetch(`${base}/wp-json/ignyous/v1/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        media_type:   mediaType || 'image/png',
        file_name:    fileName  || 'upload.png',
        set_as_logo:  setAsLogo ?? false,
        api_key:      apiKey,          // ← body fallback for servers that strip the header
      }),
      signal: AbortSignal.timeout(60000),
    })

    const text = await res.text()
    let data: any = {}
    try { data = JSON.parse(text) } catch { /* non-JSON response */ }

    if (!res.ok) {
      console.error('[upload-image] bridge error', res.status, text.slice(0, 300))

      if (res.status === 404) {
        return NextResponse.json({
          error: 'Media upload endpoint not found. Please install/update the ignyous-bridge plugin (v2.1+).',
          success: false,
        }, { status: 404 })
      }
      if (res.status === 401) {
        return NextResponse.json({
          error: `Authentication failed (401). Check that your API key in WP Admin → Settings → Ignyous Bridge matches the key stored in Ignyous AI.`,
          debug: data?.message,
          success: false,
        }, { status: 401 })
      }
      return NextResponse.json({
        error: `Bridge returned ${res.status}: ${data?.message || text.slice(0, 120)}`,
        success: false,
      }, { status: 502 })
    }

    if (!data.success) {
      return NextResponse.json({ error: data.message || 'Upload failed', success: false }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      url:     data.url,
      id:      data.id,
      message: data.message || (setAsLogo ? 'Logo uploaded and applied!' : 'Image uploaded successfully.'),
      locations: data.locations_updated || [],
    })

  } catch (err: any) {
    console.error('[upload-image] error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Server error', success: false }, { status: 500 })
  }
}
