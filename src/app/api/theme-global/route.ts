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

// GET — read current global styles
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url     = new URL(req.url)
  const siteUrl = url.searchParams.get('siteUrl') || ''
  const apiKey  = url.searchParams.get('apiKey')  || ''
  const r = await bridge(siteUrl, apiKey, 'theme/global')
  return NextResponse.json(r)
}

// POST — update global styles (direct update or AI-interpreted command)
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, siteUrl, apiKey, updates, command, currentSettings } = await req.json()

  // Direct update of specific fields
  if (action === 'update') {
    const r = await bridge(siteUrl, apiKey, 'theme/global', 'PATCH', updates)
    return NextResponse.json(r)
  }

  // AI interprets a natural language command and generates updates
  if (action === 'ai_command' && command) {
    const settingsSummary = JSON.stringify(currentSettings || {}).slice(0, 1500)

    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 800,
      messages: [{ role: 'user', content:
        `You are a WordPress theme design expert. The user wants to make a global design change.\n\n` +
        `Current theme settings:\n${settingsSummary}\n\n` +
        `User's request: "${command}"\n\n` +
        `Generate the specific setting updates to apply. Return JSON only:\n` +
        `{\n` +
        `  "updates": {\n` +
        `    "body_font_family": "Inter",          // if font change requested\n` +
        `    "heading_font_family": "Playfair Display", // if heading font change\n` +
        `    "primary_color": "#hex",              // if color change\n` +
        `    "secondary_color": "#hex",\n` +
        `    "accent_color": "#hex",\n` +
        `    "body_font_size": "16px",\n` +
        `    "heading_font_weight": "700",\n` +
        `    "link_color": "#hex",\n` +
        `    "button_background_color": "#hex",\n` +
        `    "button_text_color": "#hex"\n` +
        `  },\n` +
        `  "explanation": "What changed and why — brief"\n` +
        `}\n\n` +
        `Only include keys that should actually change based on the request. For font requests, pick a Google Font that matches the requested style (modern=Inter/DM Sans, elegant=Playfair Display/Cormorant, bold=Montserrat/Oswald, minimal=Plus Jakarta Sans).`
      }],
    })

    const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
    let parsed: any = {}
    try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}

    // Apply the AI-generated updates
    const r = await bridge(siteUrl, apiKey, 'theme/global', 'PATCH', parsed.updates || {})
    return NextResponse.json({ ...r, aiUpdates: parsed.updates, explanation: parsed.explanation })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
