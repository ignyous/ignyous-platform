import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function bridge(siteUrl: string, apiKey: string, endpoint: string, method = 'GET', body?: any) {
  const base = siteUrl.replace(/\/$/, '')
  const res  = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
    method, headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  })
  return res.json().catch(() => ({ success: false }))
}

// Plugin-specific actions
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { action, plugin, siteUrl, apiKey, data } = await req.json()

  switch (`${plugin}:${action}`) {

    // ── WP Rocket / Cache ─────────────────────────────────────────
    case 'wp-rocket:clear_cache':
    case 'litespeed:clear_cache':
    case 'w3tc:clear_cache':
    case 'wp-super-cache:clear_cache':
      return NextResponse.json(await bridge(siteUrl, apiKey, `plugins/${plugin}/clear-cache`, 'POST'))

    // ── UpdraftPlus ───────────────────────────────────────────────
    case 'updraftplus:backup':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/updraftplus/backup', 'POST', { type: data?.type || 'all' }))
    case 'updraftplus:list_backups':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/updraftplus/backups', 'GET'))
    case 'updraftplus:restore':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/updraftplus/restore', 'POST', { backupId: data?.backupId }))

    // ── Wordfence ─────────────────────────────────────────────────
    case 'wordfence:scan':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/wordfence/scan', 'POST'))
    case 'wordfence:status':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/wordfence/status', 'GET'))
    case 'wordfence:blocked_ips':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/wordfence/blocked-ips', 'GET'))
    case 'wordfence:unblock_ip':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/wordfence/unblock-ip', 'POST', { ip: data?.ip }))

    // ── Smush / Image optimization ────────────────────────────────
    case 'smush:optimize_all':
    case 'imagify:optimize_all':
    case 'shortpixel:optimize_all':
      return NextResponse.json(await bridge(siteUrl, apiKey, `plugins/${plugin}/optimize`, 'POST'))
    case 'smush:status':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/smush/status', 'GET'))

    // ── Slider Revolution ─────────────────────────────────────────
    case 'revslider:list_sliders':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/revslider/sliders', 'GET'))
    case 'revslider:update_slide':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/revslider/slide', 'PATCH', data))
    case 'revslider:generate_slide': {
      // AI generates slide content from description
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 300,
        messages: [{ role: 'user', content: `Generate a compelling slider slide for: "${data?.description}". JSON only: {"title":"","subtitle":"","button_text":"","button_link":"#","bg_color":"#1a1a4e"}` }],
      })
      const raw  = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      const slide = JSON.parse(raw.replace(/```json|```/g, '').trim())
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/revslider/slide', 'POST', { sliderId: data?.sliderId, slide }))
    }

    // ── TablePress ────────────────────────────────────────────────
    case 'tablepress:list_tables':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/tablepress/tables', 'GET'))
    case 'tablepress:get_table':
      return NextResponse.json(await bridge(siteUrl, apiKey, `plugins/tablepress/table?id=${data?.tableId}`))
    case 'tablepress:update_table':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/tablepress/table', 'PATCH', data))
    case 'tablepress:create_from_data': {
      // AI structures the data into a table
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 500,
        messages: [{ role: 'user', content: `Convert this to a TablePress table JSON: "${data?.description}". JSON only: {"name":"","data":[["Header1","Header2"],["row1col1","row1col2"]]}` }],
      })
      const raw    = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      const table  = JSON.parse(raw.replace(/```json|```/g, '').trim())
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/tablepress/table', 'POST', table))
    }

    // ── WooCommerce (enhanced) ────────────────────────────────────
    case 'woocommerce:list_products':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'woo/products?per_page=20'))
    case 'woocommerce:list_orders':
      return NextResponse.json(await bridge(siteUrl, apiKey, `woo/orders?status=${data?.status || 'any'}&per_page=20`))
    case 'woocommerce:create_coupon': {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 200,
        messages: [{ role: 'user', content: `Generate WooCommerce coupon JSON for: "${data?.description}". JSON only: {"code":"","discount_type":"percent|fixed_cart","amount":"","date_expires":"","usage_limit":null,"description":""}` }],
      })
      const raw    = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      const coupon = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (!coupon.code) coupon.code = 'SALE' + Math.floor(Math.random() * 1000)
      return NextResponse.json(await bridge(siteUrl, apiKey, 'woo/coupon', 'POST', coupon))
    }
    case 'woocommerce:bulk_price_change':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'woo/products/bulk-price', 'PATCH', data))
    case 'woocommerce:create_product': {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 400,
        messages: [{ role: 'user', content: `Generate a WooCommerce product for: "${data?.description}". JSON only: {"name":"","description":"","short_description":"","regular_price":"","sku":"","categories":[{"name":""}],"status":"publish"}` }],
      })
      const raw  = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      const prod = JSON.parse(raw.replace(/```json|```/g, '').trim())
      return NextResponse.json(await bridge(siteUrl, apiKey, 'woo/product', 'POST', prod))
    }

    // ── Mailchimp ─────────────────────────────────────────────────
    case 'mailchimp:stats':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/mailchimp/stats', 'GET'))
    case 'mailchimp:lists':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/mailchimp/lists', 'GET'))

    // ── MonsterInsights / GA ──────────────────────────────────────
    case 'monsterinsights:report':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/monsterinsights/report', 'GET'))

    // ── Really Simple SSL ─────────────────────────────────────────
    case 'really-simple-ssl:status':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/ssl/status', 'GET'))
    case 'really-simple-ssl:force_ssl':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/ssl/force', 'POST'))

    // ── Jetpack ───────────────────────────────────────────────────
    case 'jetpack:stats':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/jetpack/stats', 'GET'))
    case 'jetpack:scan':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/jetpack/scan', 'POST'))

    // ── WPML / Polylang (multilingual) ────────────────────────────
    case 'wpml:list_languages':
    case 'polylang:list_languages':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/multilingual/languages', 'GET'))
    case 'wpml:translate_page': {
      // AI translates page content
      const pageRes = await bridge(siteUrl, apiKey, `pages/${data?.pageId}`)
      const content = pageRes?.data?.page?.content || ''
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 2000,
        messages: [{ role: 'user', content: `Translate this page content to ${data?.language}. Keep all HTML tags intact, only translate the text:\n\n${content}` }],
      })
      const translated = resp.content[0].type === 'text' ? resp.content[0].text : content
      return NextResponse.json(await bridge(siteUrl, apiKey, `plugins/multilingual/translate`, 'POST', { pageId: data?.pageId, language: data?.language, content: translated }))
    }

    // ── WP Migrate / migration ────────────────────────────────────
    case 'all-in-one-wp-migration:export':
      return NextResponse.json(await bridge(siteUrl, apiKey, 'plugins/migration/export', 'POST'))

    default:
      return NextResponse.json({ error: `Unsupported plugin action: ${plugin}:${action}` }, { status: 400 })
  }
}

// GET: list all installed plugins with their actionable capabilities
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url     = new URL(req.url)
  const siteUrl = url.searchParams.get('siteUrl') || ''
  const apiKey  = url.searchParams.get('apiKey')  || ''

  const pluginsRes = await bridge(siteUrl, apiKey, 'plugins')
  const plugins    = pluginsRes?.data?.plugins || []

  // Map each installed plugin to its supported actions
  const PLUGIN_ACTIONS: Record<string, { label: string; actions: string[]; icon: string }> = {
    'wp-rocket'              : { label: 'WP Rocket',          icon: '🚀', actions: ['clear_cache'] },
    'litespeed-cache'        : { label: 'LiteSpeed Cache',    icon: '⚡', actions: ['clear_cache'] },
    'w3-total-cache'         : { label: 'W3 Total Cache',     icon: '💾', actions: ['clear_cache'] },
    'wp-super-cache'         : { label: 'WP Super Cache',     icon: '💾', actions: ['clear_cache'] },
    'updraftplus'            : { label: 'UpdraftPlus',         icon: '☁️', actions: ['backup','list_backups','restore'] },
    'wordfence'              : { label: 'Wordfence',           icon: '🛡️', actions: ['scan','status','blocked_ips','unblock_ip'] },
    'wp-smushit'             : { label: 'Smush',               icon: '🖼️', actions: ['optimize_all','status'] },
    'imagify'                : { label: 'Imagify',             icon: '🖼️', actions: ['optimize_all'] },
    'revslider'              : { label: 'Slider Revolution',   icon: '🎠', actions: ['list_sliders','update_slide','generate_slide'] },
    'tablepress'             : { label: 'TablePress',          icon: '📊', actions: ['list_tables','get_table','update_table','create_from_data'] },
    'contact-form-7'         : { label: 'Contact Form 7',     icon: '📬', actions: ['list_forms','create_form'] },
    'wpforms-lite'           : { label: 'WPForms',             icon: '📋', actions: ['list_forms','get_submissions','create_form'] },
    'gravityforms'           : { label: 'Gravity Forms',       icon: '📝', actions: ['list_forms','get_submissions'] },
    'advanced-custom-fields' : { label: 'ACF',                 icon: '🔧', actions: ['get_fields','update_field'] },
    'acf-pro'                : { label: 'ACF Pro',             icon: '🔧', actions: ['get_fields','update_field'] },
    'mailchimp-for-wp'       : { label: 'Mailchimp',           icon: '📧', actions: ['stats','lists'] },
    'google-analytics-for-wordpress' : { label: 'MonsterInsights', icon: '📈', actions: ['report'] },
    'really-simple-ssl'      : { label: 'Really Simple SSL',   icon: '🔒', actions: ['status','force_ssl'] },
    'jetpack'                : { label: 'Jetpack',             icon: '🌐', actions: ['stats','scan'] },
    'sitepress-multilingual-cms' : { label: 'WPML',           icon: '🌍', actions: ['list_languages','translate_page'] },
    'polylang'               : { label: 'Polylang',            icon: '🌍', actions: ['list_languages'] },
    'all-in-one-wp-migration': { label: 'All-in-One Migration', icon: '📦', actions: ['export'] },
  }

  const enriched = plugins.map((p: any) => ({
    ...p,
    capabilities: PLUGIN_ACTIONS[p.slug] || null,
  })).filter((p: any) => p.active !== false)

  const actionable = enriched.filter((p: any) => p.capabilities)

  return NextResponse.json({ plugins: enriched, actionable, total: enriched.length, actionableCount: actionable.length })
}
