// src/app/api/wordpress/setup/route.ts
// Manual bridge verification flow.
// The current bridge plugin exposes /wp-json/ignyous/v1/verify and requires:
// Authorization: Bearer <api key>

import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

function normalizeSiteUrl(siteUrl: string) {
  const trimmed = String(siteUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey } = await req.json()

    if (!siteUrl) {
      return NextResponse.json({ success: false, plugin_found: false, message: 'Site URL required' }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ success: false, plugin_found: false, message: 'API key missing. Copy the generated key into WP Admin → Settings → Ignyous AI, save it, then try again.' }, { status: 400 })
    }

    const base = normalizeSiteUrl(siteUrl)

    const res = await axios.get(`${base}/wp-json/ignyous/v1/verify`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 12000,
      validateStatus: () => true,
    })

    if (res.status === 200 && res.data?.success) {
      return NextResponse.json({
        success: true,
        plugin_found: true,
        api_key: apiKey,
        site_info: res.data?.data || null,
        site_name: res.data?.data?.site_name || siteUrl,
        wp_version: res.data?.data?.wp_version,
        message: 'Connected successfully',
      })
    }

    if (res.status === 401) {
      return NextResponse.json({
        success: false,
        plugin_found: true,
        message: 'Plugin detected, but the Authorization header did not reach WordPress. Check security/firewall rules that may strip Authorization headers.',
      })
    }

    if (res.status === 403) {
      return NextResponse.json({
        success: false,
        plugin_found: true,
        message: 'Plugin detected, but the API key does not match. Copy the key from this screen into the plugin settings and click Save.',
      })
    }

    if (res.status === 404) {
      return NextResponse.json({
        success: false,
        plugin_found: false,
        message: 'Plugin endpoint not found. Make sure the Ignyous AI plugin is activated, then go to Settings → Permalinks and click Save Changes.',
      })
    }

    return NextResponse.json({
      success: false,
      plugin_found: false,
      message: `WordPress returned ${res.status}. ${res.data?.message || 'Could not verify the bridge plugin.'}`,
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      plugin_found: false,
      message: `Could not reach site: ${err.message}`,
    }, { status: 200 })
  }
}
