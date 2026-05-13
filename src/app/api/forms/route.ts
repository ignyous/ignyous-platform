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
  const action  = url.searchParams.get('action')  || 'list_forms'
  const r = await bridge(siteUrl, apiKey, `forms?action=${action}`)
  return NextResponse.json(r)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { action, siteUrl, apiKey, formDescription, formId, plugin } = await req.json()

  if (action === 'list_forms') {
    const r = await bridge(siteUrl, apiKey, 'forms?action=list_forms')
    return NextResponse.json(r)
  }

  if (action === 'get_submissions') {
    const r = await bridge(siteUrl, apiKey, `forms?action=submissions&formId=${formId}`)
    return NextResponse.json(r)
  }

  if (action === 'generate_form') {
    // Use AI to generate appropriate form fields from a description
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 500,
      messages: [{ role: 'user', content:
        `Generate form fields for: "${formDescription}"\n` +
        `Plugin: ${plugin || 'contact-form-7'}\n` +
        `Return JSON only: {"title":"","fields":[{"type":"text|email|tel|textarea|select|checkbox|radio","label":"","required":true,"options":[]}]}\n` +
        `Common types: name(text), email(email), phone(tel), message(textarea), subject(text), service(select)`
      }],
    })
    const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
    let formDef: any = {}
    try { formDef = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}
    const r = await bridge(siteUrl, apiKey, 'forms', 'POST', { action: 'create_form', plugin, formDef })
    return NextResponse.json({ ...r, formDef })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
