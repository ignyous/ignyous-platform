import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function bridge(siteUrl: string, apiKey: string, endpoint: string, method = 'GET', body?: any) {
  const base = siteUrl.replace(/\/$/, '')
  const res  = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
    method, headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  })
  return res.json().catch(() => ({ success: false }))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url     = new URL(req.url)
  const siteUrl = url.searchParams.get('siteUrl') || ''
  const apiKey  = url.searchParams.get('apiKey')  || ''
  const action  = url.searchParams.get('action')  || ''

  const routes: Record<string, string> = {
    gateways:           'payments/gateways',
    revenue:            'payments/revenue',
    edd_products:       'edd/products',
    edd_orders:         'edd/orders',
    edd_discounts:      'edd/discounts',
    edd_stats:          'edd/stats',
    give_forms:         'give/forms',
    give_stats:         'give/stats',
    give_donors:        'give/donors',
    subscriptions:      'woo/subscriptions',
  }
  if (routes[action]) return NextResponse.json(await bridge(siteUrl, apiKey, routes[action]))
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, siteUrl, apiKey, data, description } = await req.json()

  // EDD
  if (action === 'edd_create_product') {
    if (description) {
      // AI generates product data
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 300,
        messages: [{ role: 'user', content: `Create an EDD digital product from: "${description}". JSON only: {"name":"","description":"","price":"","categories":[]}` }],
      })
      const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      try { Object.assign(data || {}, JSON.parse(raw.replace(/```json|```/g, '').trim())) } catch {}
    }
    return NextResponse.json(await bridge(siteUrl, apiKey, 'edd/products', 'POST', data))
  }
  if (action === 'edd_create_discount') {
    if (description) {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 200,
        messages: [{ role: 'user', content: `Create EDD discount from: "${description}". JSON only: {"name":"","code":"","type":"percent","amount":10,"max_uses":0,"expiration":""}` }],
      })
      const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      try { Object.assign(data || {}, JSON.parse(raw.replace(/```json|```/g, '').trim())) } catch {}
    }
    return NextResponse.json(await bridge(siteUrl, apiKey, 'edd/discounts', 'POST', data))
  }

  // GiveWP
  if (action === 'give_create_form') {
    if (description) {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 200,
        messages: [{ role: 'user', content: `Create GiveWP donation form from: "${description}". JSON only: {"title":"","description":"","suggested_amount":25,"goal":null,"custom_amount":true}` }],
      })
      const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      try { Object.assign(data || {}, JSON.parse(raw.replace(/```json|```/g, '').trim())) } catch {}
    }
    return NextResponse.json(await bridge(siteUrl, apiKey, 'give/forms', 'POST', data))
  }

  // WooCommerce Subscriptions
  if (action === 'sub_update') {
    const { subscriptionId, status } = data || {}
    return NextResponse.json(await bridge(siteUrl, apiKey, `woo/subscriptions/${subscriptionId}`, 'PATCH', { status }))
  }

  // Forms (GF + WPForms via existing forms API)
  if (action === 'gf_create_form') {
    if (description) {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 400,
        messages: [{ role: 'user', content:
          `Generate Gravity Forms fields for: "${description}".\n` +
          `JSON only: {"title":"","submit_text":"Submit","confirmation":"<p>Thank you!</p>","fields":[{"type":"text|email|phone|textarea|select|name|address","label":"","required":true,"options":[]}]}`
        }],
      })
      const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      try { Object.assign(data || {}, JSON.parse(raw.replace(/```json|```/g, '').trim())) } catch {}
    }
    return NextResponse.json(await bridge(siteUrl, apiKey, 'gf/forms', 'POST', data))
  }

  if (action === 'wpf_create_form') {
    if (description) {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 400,
        messages: [{ role: 'user', content:
          `Generate WPForms fields for: "${description}".\n` +
          `JSON only: {"title":"","submit_text":"Submit","confirmation":"<p>Thank you!</p>","fields":[{"type":"text|email|phone|textarea|select|name","label":"","required":true}]}`
        }],
      })
      const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      try { Object.assign(data || {}, JSON.parse(raw.replace(/```json|```/g, '').trim())) } catch {}
    }
    return NextResponse.json(await bridge(siteUrl, apiKey, 'wpf/forms', 'POST', data))
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
