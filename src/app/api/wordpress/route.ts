import { NextRequest, NextResponse } from 'next/server'
import axios, { AxiosError } from 'axios'
import { getServerSession } from 'next-auth'
import { logActivity } from '@/lib/activityLogger'

export async function POST(req: NextRequest) {
  const start = Date.now()
  let siteUrl = '', cleanEndpoint = '', method = 'GET', body: any = null

  try {
    const parsed = await req.json()
    siteUrl       = parsed.siteUrl   || ''
    const apiKey  = parsed.apiKey    || ''
    cleanEndpoint = (parsed.endpoint || '').replace(/^\/+/, '').replace(/\.\./g, '')
    method        = parsed.method    || 'GET'
    body          = parsed.body      || null

    if (!siteUrl || !apiKey || !cleanEndpoint) {
      return NextResponse.json({ error: 'siteUrl, apiKey, and endpoint are required' }, { status: 400 })
    }

    const base = siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')

    // ── Categories → WP native REST API ──────────────────────────
    if (cleanEndpoint === 'categories') {
      const res = await axios.get(
        `${base}/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc`,
        { timeout: 15000 }
      )
      return NextResponse.json({
        categories: (res.data as any[]).map((c: any) => ({ id: c.id, name: c.name, count: c.count, slug: c.slug }))
      })
    }

    const ignyousUrl = `${base}/wp-json/ignyous/v1/${cleanEndpoint}`
    const headers    = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    const isWrite    = !['GET', 'HEAD'].includes(method.toUpperCase())

    // For write ops try PUT → PATCH → POST (bridge may support any of these)
    // For reads just use GET
    const methodsToTry = isWrite ? ['PUT', 'PATCH', 'POST'] : [method.toUpperCase()]
    const attemptLog: Array<{ method: string; status: number | string; responseBody: any }> = []

    for (const m of methodsToTry) {
      try {
        const response = await axios({
          method: m, url: ignyousUrl, headers,
          data: body || undefined, timeout: 60000,
          validateStatus: () => true, // don't throw on any status — we inspect manually
        })

        attemptLog.push({ method: m, status: response.status, responseBody: response.data })

        // Log every attempt to activity log for debugging
        console.log(`[bridge] ${m} ${ignyousUrl} → ${response.status}`, JSON.stringify(response.data).slice(0, 200))

        if (response.status === 404 || response.status === 405) {
          // Route not found for this method — try next
          continue
        }

        if (response.status >= 200 && response.status < 300) {
          // Success — log it
          if (isWrite) {
            const session = await getServerSession()
            const cat = cleanEndpoint.startsWith('snapshot') ? 'snapshot'
                      : cleanEndpoint.startsWith('pages')    ? 'page'
                      : cleanEndpoint.startsWith('posts')    ? 'content'
                      : cleanEndpoint.startsWith('plugins')  ? 'plugin'
                      : cleanEndpoint.startsWith('themes')   ? 'plugin'
                      : cleanEndpoint.startsWith('settings') ? 'settings'
                      : 'system'
            await logActivity({
              userId:    session?.user?.email ?? undefined,
              siteUrl,
              category:  cat as any,
              action:    `${m.toLowerCase()}_${cleanEndpoint.replace(/\/\d+/, '/:id')}`,
              status:    'success',
              summary:   `Bridge: ${m} /${cleanEndpoint}${body?.title ? ` — "${body.title}"` : ''}`,
              detail:    { endpoint: cleanEndpoint, method: m, status: response.status, bodyKeys: body ? Object.keys(body) : [] },
              durationMs: Date.now() - start,
            }).catch(() => {})
          }
          return NextResponse.json(response.data)
        }

        // Any other non-success status (401, 403, 500) — real error, stop trying
        const errMsg = response.data?.message || response.data?.error || `HTTP ${response.status}`
        await logBridgeError({ siteUrl, cleanEndpoint, methodsAttempted: attemptLog, finalError: errMsg, durationMs: Date.now() - start })
        return NextResponse.json({
          success: false,
          error:   errMsg,
          debug:   { url: ignyousUrl, attemptsLog: attemptLog },
        }, { status: response.status })

      } catch (err) {
        // Network error (timeout, DNS, etc)
        const netErr = (err as Error).message
        attemptLog.push({ method: m, status: 'network_error', responseBody: netErr })
        console.error(`[bridge] ${m} ${ignyousUrl} → network error:`, netErr)
        break // network errors won't be solved by trying another method
      }
    }

    // All methods returned 404/405 — plugin missing these routes
    // Try WP native REST API as last resort for page/post updates
    if (isWrite && (cleanEndpoint.startsWith('pages/') || cleanEndpoint.startsWith('posts/'))) {
      const [type, id] = cleanEndpoint.split('/')
      const wpUrl      = `${base}/wp-json/wp/v2/${type}/${id}`
      console.log(`[bridge] Falling back to WP native REST: POST ${wpUrl}`)
      try {
        const r = await axios({ method: 'POST', url: wpUrl, headers, data: body || undefined, timeout: 30000, validateStatus: () => true })
        attemptLog.push({ method: 'POST_WP_NATIVE', status: r.status, responseBody: r.data })
        if (r.status >= 200 && r.status < 300) {
          return NextResponse.json({ success: true, data: r.data, source: 'wp_native' })
        }
      } catch (e: any) {
        attemptLog.push({ method: 'POST_WP_NATIVE', status: 'network_error', responseBody: e.message })
      }
    }

    // Complete failure — log it with full debug info
    const finalMsg = 'Bridge plugin does not have write endpoints registered. Check plugin is v1.4+ and activated.'
    await logBridgeError({ siteUrl, cleanEndpoint, methodsAttempted: attemptLog, finalError: finalMsg, durationMs: Date.now() - start })

    return NextResponse.json({
      success: false,
      error:   finalMsg,
      debug: {
        url:         `${siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')}/wp-json/ignyous/v1/${cleanEndpoint}`,
        methods_tried: methodsToTry,
        attempts:    attemptLog,
        hint:        'Visit /wp-json/ignyous/v1/ on your site to see registered routes',
      }
    }, { status: 404 })

  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'Unknown error'
    console.error('[bridge] Unhandled error:', msg)
    await logBridgeError({ siteUrl, cleanEndpoint, methodsAttempted: [], finalError: msg, durationMs: Date.now() - start })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

async function logBridgeError(opts: { siteUrl: string; cleanEndpoint: string; methodsAttempted: any[]; finalError: string; durationMs: number }) {
  await logActivity({
    siteUrl:   opts.siteUrl,
    category:  'system',
    action:    `bridge_error_${opts.cleanEndpoint.replace(/\/\d+/, '/:id')}`,
    status:    'failed',
    summary:   `Bridge FAILED: ${opts.cleanEndpoint} — ${opts.finalError}`,
    detail:    {
      endpoint:         opts.cleanEndpoint,
      methods_attempted: opts.methodsAttempted,
      error:            opts.finalError,
      fix:              'Ensure ignyous-bridge v1.4+ is installed and activated',
    },
    durationMs: opts.durationMs,
  }).catch(() => {})
}
