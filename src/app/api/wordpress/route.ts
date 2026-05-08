import { NextRequest, NextResponse } from 'next/server'
import axios, { AxiosError } from 'axios'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, endpoint, method = 'GET', body } = await req.json()

    if (!siteUrl || !apiKey || !endpoint) {
      return NextResponse.json({ error: 'siteUrl, apiKey, and endpoint are required' }, { status: 400 })
    }

    const cleanEndpoint = endpoint.replace(/^\/+/, '').replace(/\.\./g, '')
    const base = siteUrl.replace(/\/$/, '')

    // Categories → WP native REST API (public, no auth needed)
    if (cleanEndpoint === 'categories') {
      const res = await axios.get(`${base}/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc`, { timeout: 15000 })
      return NextResponse.json({
        categories: (res.data as any[]).map((c: any) => ({ id: c.id, name: c.name, count: c.count, slug: c.slug }))
      })
    }

    const ignyousUrl = `${base}/wp-json/ignyous/v1/${cleanEndpoint}`
    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

    // For write operations, try multiple methods until one works
    const isWrite = !['GET', 'HEAD'].includes(method.toUpperCase())
    const methodsToTry = isWrite ? ['PUT', 'PATCH', 'POST'] : [method.toUpperCase()]

    let lastErr: any = null
    for (const m of methodsToTry) {
      try {
        const response = await axios({ method: m, url: ignyousUrl, headers, data: body || undefined, timeout: 60000 })
        return NextResponse.json(response.data)
      } catch (err) {
        const axErr = err as AxiosError
        // 404 = route doesn't exist for this method, try next
        if (axErr.response?.status === 404 || axErr.response?.status === 405) { lastErr = err; continue }
        // Any other error (400, 401, 500) → real error, stop trying
        throw err
      }
    }

    // All ignyous methods failed → try WP native REST API as last resort
    // Works if the ignyous plugin stores an Application Password under this key
    if (isWrite && cleanEndpoint.startsWith('pages/')) {
      const pageId = cleanEndpoint.split('/')[1]
      const wpUrl = `${base}/wp-json/wp/v2/pages/${pageId}`
      try {
        // Try Bearer first (some bridge plugins proxy this)
        const response = await axios({ method: 'POST', url: wpUrl, headers, data: body || undefined, timeout: 30000 })
        return NextResponse.json(response.data)
      } catch {
        // Try Basic auth with apiKey as application password (common bridge pattern)
        try {
          const basicHeaders = { 'Authorization': `Basic ${Buffer.from(`ignyous:${apiKey}`).toString('base64')}`, 'Content-Type': 'application/json' }
          const response = await axios({ method: 'POST', url: wpUrl, headers: basicHeaders, data: body || undefined, timeout: 30000 })
          return NextResponse.json(response.data)
        } catch {}
      }
    }

    // Return the last error
    const axErr = lastErr as AxiosError<{ message?: string }>
    const status = axErr?.response?.status || 500
    const message = axErr?.response?.data?.message || axErr?.message || 'No route found — the ignyous bridge plugin may need updating to support this action'
    return NextResponse.json({ success: false, error: message }, { status })

  } catch (err) {
    const axiosErr = err as AxiosError<{ message?: string }>
    const status = axiosErr.response?.status || 500
    const message = axiosErr.response?.data?.message || axiosErr.message || 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
