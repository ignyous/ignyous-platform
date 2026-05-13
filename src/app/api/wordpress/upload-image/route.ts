import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, imageBase64, mediaType, fileName, setAsLogo } = await req.json()

    if (!siteUrl || !apiKey || !imageBase64) {
      return NextResponse.json({ error: 'siteUrl, apiKey, and imageBase64 are required' }, { status: 400 })
    }

    const base = siteUrl.replace(/\/$/, '')

    // Go directly through the ignyous bridge plugin — it handles our Bearer token auth
    const res = await fetch(`${base}/wp-json/ignyous/v1/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        media_type:   mediaType || 'image/png',
        file_name:    fileName  || 'upload.png',
        set_as_logo:  setAsLogo ?? false,
      }),
      signal: AbortSignal.timeout(45000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'no body')
      console.error('[upload-image] bridge error', res.status, text.slice(0, 200))

      if (res.status === 404) {
        return NextResponse.json({
          error: 'Media upload endpoint not found. Install/update the ignyous-bridge plugin (v2.1+) on your WordPress site.',
          success: false,
        }, { status: 404 })
      }
      return NextResponse.json({ error: `Bridge returned ${res.status}: ${text.slice(0, 120)}`, success: false }, { status: 502 })
    }

    const data = await res.json()

    if (!data.success) {
      return NextResponse.json({ error: data.message || 'Upload failed', success: false }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      url:     data.url,
      id:      data.id,
      message: data.message || (setAsLogo ? 'Logo uploaded and applied!' : 'Image uploaded successfully.'),
    })

  } catch (err: any) {
    console.error('[upload-image] error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Server error', success: false }, { status: 500 })
  }
}
