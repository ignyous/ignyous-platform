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
  const action  = url.searchParams.get('action')  || 'upcoming'

  if (action === 'upcoming')       return NextResponse.json(await bridge(siteUrl, apiKey, 'events/upcoming'))
  if (action === 'detect_plugin')  return NextResponse.json(await bridge(siteUrl, apiKey, 'events/plugin'))
  if (action === 'list_all')       return NextResponse.json(await bridge(siteUrl, apiKey, 'events'))
  if (action === 'bookings')       return NextResponse.json(await bridge(siteUrl, apiKey, 'bookings'))
  if (action === 'services')       return NextResponse.json(await bridge(siteUrl, apiKey, 'bookings/services'))
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, siteUrl, apiKey, eventId, eventDescription, siteContext } = await req.json()

  if (action === 'create_from_description') {
    // AI generates structured event data from description
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 500,
      messages: [{ role: 'user', content:
        `Generate a WordPress event from this description: "${eventDescription}"\n` +
        `Site: ${siteContext?.site_name || ''}\n\n` +
        `Return JSON only (no markdown):\n` +
        `{"title":"","description":"","start_date":"YYYY-MM-DD","start_time":"HH:MM:00","end_date":"YYYY-MM-DD","end_time":"HH:MM:00","venue":"","address":"","city":"","cost":"","categories":[],"url":""}\n` +
        `If no dates mentioned, use next Saturday for start, same day for end.\n` +
        `If no times mentioned, use 10:00:00 to 17:00:00.`
      }],
    })
    const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
    let eventData: any = {}
    try { eventData = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}
    const r = await bridge(siteUrl, apiKey, 'events', 'POST', eventData)
    return NextResponse.json({ ...r, eventData })
  }

  if (action === 'create') {
    const { eventData } = await req.json()
    return NextResponse.json(await bridge(siteUrl, apiKey, 'events', 'POST', eventData))
  }

  if (action === 'update') {
    const { updateData } = await req.json()
    return NextResponse.json(await bridge(siteUrl, apiKey, `events/${eventId}`, 'PATCH', updateData))
  }

  if (action === 'delete') {
    return NextResponse.json(await bridge(siteUrl, apiKey, `events/${eventId}`, 'DELETE'))
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
