// src/lib/siteProfile.ts
// Builds a complete site capabilities profile from bridge data

import { SiteProfile } from './systemPrompt'

export async function bridgeCall(siteUrl: string, apiKey: string, endpoint: string, method = 'GET', body?: any) {
  const base = siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
  try {
    const res = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
      method,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Ignyous-Key': apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function detectPlugin(plugins: any[], ...slugParts: string[]): string | undefined {
  const found = plugins.find((p: any) =>
    p.active && slugParts.some(part => (p.slug || '').includes(part) || (p.name || '').toLowerCase().includes(part))
  )
  return found?.slug || found?.name
}

export async function buildSiteProfile(siteUrl: string, apiKey: string): Promise<SiteProfile | null> {
  // Parallel fetch: site info, pages, plugins (forms endpoint removed — not implemented)
  const [siteRes, pagesRes, pluginsRes] = await Promise.all([
    bridgeCall(siteUrl, apiKey, 'site'),
    bridgeCall(siteUrl, apiKey, 'pages'),
    bridgeCall(siteUrl, apiKey, 'plugins'),
  ])

  if (!siteRes?.data?.site) return null

  const site    = siteRes.data.site
  const pages   = (pagesRes?.data?.pages || []) as any[]
  const plugins = (pluginsRes?.data?.plugins || []) as any[]
  const forms   = [] as any[]  // Detect from plugins list only, no separate bridge call
  const active  = plugins.filter((p: any) => p.active)
  const activeSlugs = active.map((p: any) => p.slug || '')

  // Detect specific plugin categories
  const cachePlugin  = detectPlugin(active, 'wp-rocket', 'litespeed', 'w3-total-cache', 'wp-super-cache', 'wp-fastest-cache', 'autoptimize', 'breeze', 'sg-cachepress', 'hummingbird', 'swift-performance')
  const seoPlugin    = detectPlugin(active, 'wordpress-seo', 'rank-math', 'all-in-one-seo', 'seopress')
  const formsPlugin  = detectPlugin(active, 'gravityforms', 'wpforms', 'contact-form-7', 'fluent-forms', 'formidable', 'ninja-forms')
  const ecommerce    = detectPlugin(active, 'woocommerce', 'easy-digital-downloads', 'surecart')
  const eventsPlugin = detectPlugin(active, 'the-events-calendar', 'events-manager', 'modern-events-calendar', 'event-espresso')

  // Detect builder
  let builder = site.theme || 'Gutenberg'
  if (activeSlugs.some(s => s.includes('elementor')))    builder = 'Elementor'
  if (activeSlugs.some(s => s.includes('fusion-builder') || s.includes('avada'))) builder = 'Avada'
  if (activeSlugs.some(s => s.includes('js_composer')))  builder = 'WPBakery'
  if (activeSlugs.some(s => s.includes('beaver-builder'))) builder = 'Beaver Builder'
  if (activeSlugs.some(s => s.includes('divi-builder') || s.includes('et-builder'))) builder = 'Divi'

  // Pages with only publish status
  const activePages = pages.filter((p: any) => p.status === 'publish')

  const profile: SiteProfile = {
    site_url:           siteUrl,
    site_name:          site.name || '',
    description:        site.description || '',
    theme:              site.theme || '',
    builder,
    wp_version:         site.wp_version || '',
    active_pages:       activePages.length,
    active_plugins:     activeSlugs,
    cache_plugin:       cachePlugin,
    seo_plugin:         seoPlugin,
    forms_plugin:       formsPlugin,
    forms_count:        forms.length,
    ecommerce:          ecommerce,
    events_plugin:      eventsPlugin,
    has_woocommerce:    activeSlugs.some(s => s.includes('woocommerce')),
    has_contact_form_7: activeSlugs.some(s => s.includes('contact-form-7')),
    has_wpforms:        activeSlugs.some(s => s.includes('wpforms')),
    has_gravity_forms:  activeSlugs.some(s => s.includes('gravityforms')),
    has_yoast:          activeSlugs.some(s => s.includes('wordpress-seo')),
    has_rank_math:      activeSlugs.some(s => s.includes('rank-math')),
    pages: activePages.slice(0, 20).map((p: any) => ({
      id:     p.id,
      title:  p.title,
      status: p.status,
      link:   p.link,
    })),
    plugins: active.map((p: any) => ({ name: p.name, slug: p.slug, active: true })),
  }

  return profile
}
