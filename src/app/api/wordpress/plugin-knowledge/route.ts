import { NextRequest, NextResponse } from 'next/server'
function cleanUrl(u: string) { return u.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') }

const ELEMENTOR_KNOWLEDGE = {
  elementor: {
    slug: 'elementor', label: 'Elementor', confirmed_from: 'source_scan_v1',
    kit_option: 'elementor_active_kit',
    kit_meta_key: '_elementor_page_settings',
    logo: { key: 'site_logo', type: 'object', shape: { id: 'attachment_id', url: 'attachment_url' }, syncs_to: 'theme_mod:custom_logo' },
    logo_sizing: { method: 'custom_css', css_key: 'custom_css', selector: '.elementor-site-logo img', css_template: '.elementor-site-logo img { max-width: {width}px !important; }' },
    cache: { action: 'elementor/core/files/clear_cache' },
    wp_options: ['elementor_active_kit','elementor_css_print_method','elementor_cpt_support','elementor_disable_color_schemes','elementor_google_maps_api_key','elementor_space_between_widgets','elementor_viewport_lg','elementor_viewport_md','elementor_font_display','elementor_load_fa4_shim'],
    kit_settings_keys: ['site_name','site_description','site_logo','site_favicon','custom_css','system_colors','system_typography','viewport_lg','viewport_md','space_between_widgets'],
  }
}

export async function POST(req: NextRequest) {
  const { siteUrl, apiKey, knowledge } = await req.json()
  const payload = knowledge ?? ELEMENTOR_KNOWLEDGE
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/plugin-knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ignyous-Key': apiKey, 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ knowledge: payload, api_key: apiKey }),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({ success: false }))
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const siteUrl = searchParams.get('siteUrl')!
  const apiKey  = searchParams.get('apiKey')!
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/plugin-knowledge`, {
    headers: { 'X-Ignyous-Key': apiKey, 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json().catch(() => ({ success: false }))
  return NextResponse.json(data)
}
