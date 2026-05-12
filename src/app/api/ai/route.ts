import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { logActivity } from '@/lib/activityLogger'
import { buildSystemPrompt, SiteProfile } from '@/lib/systemPrompt'
import { buildSiteProfile } from '@/lib/siteProfile'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const start = Date.now()
  try {
    const session = await getServerSession()
    const { messages, siteContext, siteUrl, apiKey } = await req.json()

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
    }

    // Build site profile (scan-before-action)
    let profile: SiteProfile | undefined

    if (siteContext) {
      profile = siteContext as SiteProfile
    } else if (siteUrl && apiKey) {
      const built = await buildSiteProfile(siteUrl, apiKey)
      if (built) profile = built
    }

    // Build system prompt with live profile
    const system = buildSystemPrompt(profile)

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages,
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse action and options blocks
    const actionMatch  = raw.match(/```action\n([\s\S]*?)\n```/)
    const optionsMatch = raw.match(/```options\n([\s\S]*?)\n```/)

    let action: any = null
    let options: any = null

    if (actionMatch?.[1]) {
      try { action = JSON.parse(actionMatch[1]) } catch {}
    }
    if (optionsMatch?.[1]) {
      try { options = JSON.parse(optionsMatch[1]) } catch {}
    }

    // Strip action/options blocks from visible text
    const text = raw
      .replace(/```action[\s\S]*?```/g, '')
      .replace(/```options[\s\S]*?```/g, '')
      .trim()

    // Log the interaction
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || ''
    await logActivity({
      userId:    session?.user?.email ?? undefined,
      siteUrl:   profile?.site_url,
      siteName:  profile?.site_name,
      category:  action ? 'ai_action' : 'system',
      action:    action?.type || 'ai_chat',
      status:    'success',
      summary:   action
        ? 'AI action: ' + action.type + (action.title ? ' on ' + action.title : '')
        : 'Chat: ' + String(lastUserMsg).slice(0, 80),
      detail:    { userMessage: lastUserMsg, action, aiResponse: text.slice(0, 300) },
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
      durationMs: Date.now() - start,
    })

    return NextResponse.json({ text, action, options })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
