import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const site   = searchParams.get('site') || ''
  const apiKey = searchParams.get('key')  || ''

  if (!site) return NextResponse.json({ error: 'site param required' }, { status: 400 })
  if (!apiKey) return NextResponse.json({
    error: 'key param required — add &key=YOURAPIKEY to the URL',
    how_to_find_key: 'Go to WP Admin → ignyous Bridge settings page to find or reset your API key',
  }, { status: 400 })

  const base    = site.replace(/\/$/, '')
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const results: Record<string, any> = {}

  const tests = [
    { name: 'verify',         url: `${base}/wp-json/ignyous/v1/verify`,        method: 'GET'   },
    { name: 'site',           url: `${base}/wp-json/ignyous/v1/site`,           method: 'GET'   },
    { name: 'pages_GET',      url: `${base}/wp-json/ignyous/v1/pages`,          method: 'GET'   },
    { name: 'pages_id_PUT',   url: `${base}/wp-json/ignyous/v1/pages/2`,        method: 'PUT'   },
    { name: 'pages_id_PATCH', url: `${base}/wp-json/ignyous/v1/pages/2`,        method: 'PATCH' },
    { name: 'pages_id_POST',  url: `${base}/wp-json/ignyous/v1/pages/2`,        method: 'POST'  },
    { name: 'posts_POST',     url: `${base}/wp-json/ignyous/v1/posts`,          method: 'POST'  },
    { name: 'snapshot_POST',  url: `${base}/wp-json/ignyous/v1/snapshot`,       method: 'POST'  },
    { name: 'snapshots_GET',  url: `${base}/wp-json/ignyous/v1/snapshots`,      method: 'GET'   },
    { name: 'plugins_GET',    url: `${base}/wp-json/ignyous/v1/plugins`,        method: 'GET'   },
    { name: 'settings_PATCH', url: `${base}/wp-json/ignyous/v1/site/settings`,  method: 'PATCH' },
  ]

  for (const test of tests) {
    try {
      const r = await axios({
        method: test.method, url: test.url, headers,
        data: test.method !== 'GET' ? { title: '__ignyous_test__', content: 'test', status: 'draft' } : undefined,
        timeout: 8000, validateStatus: () => true,
      })
      results[test.name] = {
        status:  r.status,
        ok:      r.status >= 200 && r.status < 300,
        snippet: JSON.stringify(r.data).slice(0, 150),
      }
    } catch (e: any) {
      results[test.name] = { status: 'network_error', ok: false, snippet: e.message }
    }
  }


  // Clean up any test posts/pages created during diagnostic
  if (results['posts_POST']?.ok) {
    try {
      const testPostId = results['posts_POST']?.snippet?.match(/"id":(\d+)/)?.[1]
      if (testPostId && apiKey) {
        await axios({ method: 'DELETE', url: `${base}/wp-json/ignyous/v1/posts/${testPostId}`, headers, timeout: 5000, validateStatus: () => true })
      }
    } catch {}
  }
  if (results['pages_id_PUT']?.ok || results['pages_id_PATCH']?.ok || results['pages_id_POST']?.ok) {
    // Restore page 2 title (we changed it to __ignyous_test__)
    try {
      await axios({ method: 'POST', url: `${base}/wp-json/ignyous/v1/pages/2`, headers, data: { title: 'Sample Page' }, timeout: 5000, validateStatus: () => true })
    } catch {}
  }

  let ignyousRoutes: string[] = []
  try {
    const r = await axios.get(`${base}/wp-json/`, { timeout: 8000 })
    ignyousRoutes = Object.keys(r.data?.routes || {}).filter((k: string) => k.includes('ignyous'))
  } catch {}

  const all401 = Object.values(results).every((r: any) => r.status === 401)

  return NextResponse.json({
    site,
    key_length: apiKey.length,
    diagnosis:  all401
      ? '❌ ALL 401 — The API key in the URL does not match what is stored in WordPress. Reconnect your site from the ignyous dashboard.'
      : Object.values(results).every((r: any) => r.ok)
        ? '✅ All endpoints working!'
        : '⚠️ Partial — some endpoints failing, see tests below',
    ignyous_routes_registered: ignyousRoutes,
    tests: results,
    summary: {
      auth_working:      !all401,
      can_read_pages:    results['pages_GET']?.ok,
      can_update_pages:  results['pages_id_PUT']?.ok || results['pages_id_PATCH']?.ok || results['pages_id_POST']?.ok,
      can_create_posts:  results['posts_POST']?.ok,
      can_snapshot:      results['snapshot_POST']?.ok,
    }
  })
}
