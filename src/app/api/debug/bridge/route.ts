import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const site   = searchParams.get('site') || ''
  const apiKey = searchParams.get('key')  || ''
  if (!site) return NextResponse.json({ error: 'site param required' }, { status: 400 })

  const base    = site.replace(/\/$/, '')
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const results: Record<string, any> = {}

  const tests = [
    { name: 'verify',          url: `${base}/wp-json/ignyous/v1/verify`,       method: 'GET'   },
    { name: 'site',            url: `${base}/wp-json/ignyous/v1/site`,          method: 'GET'   },
    { name: 'pages_GET',       url: `${base}/wp-json/ignyous/v1/pages`,         method: 'GET'   },
    { name: 'pages_id_PUT',    url: `${base}/wp-json/ignyous/v1/pages/2`,       method: 'PUT'   },
    { name: 'pages_id_PATCH',  url: `${base}/wp-json/ignyous/v1/pages/2`,       method: 'PATCH' },
    { name: 'pages_id_POST',   url: `${base}/wp-json/ignyous/v1/pages/2`,       method: 'POST'  },
    { name: 'posts_POST',      url: `${base}/wp-json/ignyous/v1/posts`,         method: 'POST'  },
    { name: 'snapshot_POST',   url: `${base}/wp-json/ignyous/v1/snapshot`,      method: 'POST'  },
    { name: 'snapshots_GET',   url: `${base}/wp-json/ignyous/v1/snapshots`,     method: 'GET'   },
    { name: 'plugins_GET',     url: `${base}/wp-json/ignyous/v1/plugins`,       method: 'GET'   },
    { name: 'settings_PATCH',  url: `${base}/wp-json/ignyous/v1/site/settings`, method: 'PATCH' },
  ]

  for (const test of tests) {
    try {
      const r = await axios({
        method: test.method, url: test.url, headers,
        data: test.method !== 'GET' ? { title: '__test__', content: 'test' } : undefined,
        timeout: 8000, validateStatus: () => true,
      })
      results[test.name] = { status: r.status, ok: r.status !== 404 && r.status !== 405, snippet: JSON.stringify(r.data).slice(0, 120) }
    } catch (e: any) {
      results[test.name] = { status: 'error', ok: false, snippet: e.message }
    }
  }

  // Check WP namespace list
  let ignyousRoutes: string[] = []
  try {
    const r = await axios.get(`${base}/wp-json/`, { timeout: 8000 })
    ignyousRoutes = Object.keys(r.data?.routes || {}).filter((k: string) => k.includes('ignyous'))
  } catch {}

  return NextResponse.json({
    site,
    ignyous_routes_registered: ignyousRoutes,
    tests: results,
    summary: {
      plugin_responding:  results['verify']?.ok,
      can_read_pages:     results['pages_GET']?.ok,
      can_update_pages:   results['pages_id_PUT']?.ok || results['pages_id_PATCH']?.ok || results['pages_id_POST']?.ok,
      can_create_posts:   results['posts_POST']?.ok,
      can_snapshot:       results['snapshot_POST']?.ok,
    }
  })
}
