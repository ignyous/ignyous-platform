import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, imageBase64, mediaType, fileName, setAsLogo } = await req.json()

    if (!siteUrl || !apiKey || !imageBase64) {
      return NextResponse.json({ error: 'siteUrl, apiKey, and imageBase64 are required' }, { status: 400 })
    }

    const base    = siteUrl.replace(/\/$/, '')
    const ext     = (mediaType || 'image/png').split('/')[1] || 'png'
    const name    = fileName || `upload-${Date.now()}.${ext}`
    const binary  = Buffer.from(imageBase64, 'base64')

    // Upload to WordPress media library via REST API
    const uploadRes = await fetch(`${base}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   mediaType || 'image/png',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
      body: binary,
      signal: AbortSignal.timeout(30000),
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      // WP requires Application Passwords for /wp/v2/media — fall back to bridge upload
      return await uploadViaBridge(base, apiKey, imageBase64, mediaType, name, setAsLogo)
    }

    const media = await uploadRes.json()
    const mediaUrl = media.source_url || media.guid?.rendered || ''
    const mediaId  = media.id

    // Optionally set as site logo
    if (setAsLogo && mediaId) {
      await fetch(`${base}/wp-json/ignyous/v1/settings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_logo: mediaId }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, url: mediaUrl, id: mediaId, message: setAsLogo ? 'Logo uploaded and applied!' : 'Image uploaded successfully.' })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/** Fallback: upload via ignyous bridge plugin endpoint */
async function uploadViaBridge(base: string, apiKey: string, imageBase64: string, mediaType: string, fileName: string, setAsLogo: boolean) {
  try {
    const res = await fetch(`${base}/wp-json/ignyous/v1/media/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, media_type: mediaType, file_name: fileName, set_as_logo: setAsLogo }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Upload failed. Make sure the ignyous-bridge plugin is up to date.', success: false }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json({ success: true, url: data.url, id: data.id, message: data.message || 'Uploaded via bridge.' })
  } catch (err: any) {
    return NextResponse.json({ error: 'Upload failed: ' + err.message, success: false }, { status: 502 })
  }
}
