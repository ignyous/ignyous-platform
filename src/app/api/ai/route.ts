import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { logActivity } from '@/lib/activityLogger'
import { buildSystemPrompt, SiteProfile } from '@/lib/systemPrompt'
import { buildSiteProfile } from '@/lib/siteProfile'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

/**
 * Detect if user message is requesting a specific routine operation
 */
function detectRoutineIntent(message: string): {
  type?: 'business_info' | 'form' | 'image' | 'theme_settings'
  operation?: 'phone' | 'email' | 'address' | 'add_field' | 'replace_form' | 'change_image' | 'change_colors'
  oldValue?: string
  newValue?: string
} | null {
  const lower = message.toLowerCase()

  // BUSINESS INFO: Phone changes
  if (
    (lower.includes('change') || lower.includes('update')) &&
    (lower.includes('phone') || /\d{3}[-.]?\d{3}[-.]?\d{4}/.test(message))
  ) {
    const phoneMatch = message.match(
      /(?:change|update|to|replace)\s+(?:to\s+)?(\d{10,}|[\d\s\-().]{10,})/i
    )
    return {
      type: 'business_info',
      operation: 'phone',
      oldValue: extractPhoneFromMessage(message, true),
      newValue: phoneMatch ? phoneMatch[1] : undefined,
    }
  }

  // BUSINESS INFO: Email changes
  if (
    (lower.includes('change') || lower.includes('update')) &&
    (lower.includes('email') || /@/.test(message))
  ) {
    const oldEmail = extractEmailFromMessage(message, true)
    const newEmail = extractEmailFromMessage(message, false)
    if (oldEmail || newEmail) {
      return {
        type: 'business_info',
        operation: 'email',
        oldValue: oldEmail,
        newValue: newEmail,
      }
    }
  }

  // BUSINESS INFO: Address changes
  if ((lower.includes('change') || lower.includes('update')) && lower.includes('address')) {
    return {
      type: 'business_info',
      operation: 'address',
    }
  }

  // FORMS: Add field
  if (lower.includes('add') && (lower.includes('field') || lower.includes('form'))) {
    return {
      type: 'form',
      operation: 'add_field',
    }
  }

  // IMAGES: Change image
  if ((lower.includes('change') || lower.includes('update')) && lower.includes('image')) {
    return {
      type: 'image',
      operation: 'change_image',
    }
  }

  // THEME: Change colors/fonts
  if ((lower.includes('change') || lower.includes('update')) && (lower.includes('color') || lower.includes('font'))) {
    return {
      type: 'theme_settings',
      operation: lower.includes('color') ? 'change_colors' : 'change_colors',
    }
  }

  return null
}

/**
 * Extract phone number from message
 */
function extractPhoneFromMessage(message: string, first = true): string | undefined {
  const matches = message.match(/\d{3}[-.]?\d{3}[-.]?\d{4}|\(\d{3}\)\s?\d{3}[-.]?\d{4}|\d{10}/g)
  return matches ? (first ? matches[0] : matches[matches.length - 1]) : undefined
}

/**
 * Extract email from message
 */
function extractEmailFromMessage(message: string, first = true): string | undefined {
  const matches = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
  return matches ? (first ? matches[0] : matches[matches.length - 1]) : undefined
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  let session: any = null
  let lastUserMsg = ''
  let profile: SiteProfile | undefined

  try {
    session = await getServerSession()
    const body = await req.json()
    const { messages, siteContext, siteUrl, apiKey } = body

    // ── Guard: API key ──────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      const msg = 'ANTHROPIC_API_KEY is not configured on the server.'
      console.error('[/api/ai]', msg)
      return NextResponse.json({ error: msg, debug: msg }, { status: 500 })
    }

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''

    // ── Build site profile ──────────────────────────────────────
    if (siteContext) {
      profile = siteContext as SiteProfile
    } else if (siteUrl && apiKey) {
      try {
        const built = await buildSiteProfile(siteUrl, apiKey)
        if (built) profile = built
      } catch (err: any) {
        console.error('[buildSiteProfile]', err?.message)
        // non-fatal — continue without profile
      }
    }

    // ── Routine routing ─────────────────────────────────────────
    const routineIntent = detectRoutineIntent(String(lastUserMsg))
    if (routineIntent && siteUrl && apiKey) {
      return await handleRoutineRequest(routineIntent, siteUrl, apiKey, profile, session, start)
    }

    // ── Claude call ─────────────────────────────────────────────
    let system: string
    try {
      system = buildSystemPrompt(profile)
    } catch (promptErr: any) {
      console.error('[buildSystemPrompt]', promptErr?.message)
      system = 'You are ignyous.ai, a WordPress AI assistant. Answer the user helpfully.'
    }

    const cleanMessages = messages.map((m: any) => ({
      role:    m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }))

    let response: any
    try {
      response = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 1500,
        system,
        messages:   cleanMessages,
      })
    } catch (claudeErr: any) {
      const detail = claudeErr?.message ?? String(claudeErr)
      console.error('[Claude API]', detail, '| status:', claudeErr?.status)

      // Log the failure
      try {
        await logActivity({
          userId:    session?.user?.email ?? undefined,
          siteUrl:   profile?.site_url,
          siteName:  profile?.site_name,
          category:  'system',
          action:    'ai_chat_error',
          status:    'error',
          summary:   'Claude API error: ' + detail.slice(0, 120),
          detail:    { error: detail, status: claudeErr?.status, userMessage: lastUserMsg.slice(0, 200) },
          ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
          userAgent: req.headers.get('user-agent') ?? undefined,
          durationMs: Date.now() - start,
        })
      } catch { /* logging must never crash the route */ }

      return NextResponse.json({
        error: detail,
        debug: `Claude API error (${claudeErr?.status ?? 'unknown status'}): ${detail}`,
        text:  `⚠️ AI error: ${detail}`,
      }, { status: 500 })
    }

    // ── Parse response ──────────────────────────────────────────
    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    if (!raw) {
      return NextResponse.json({ text: 'No response from AI. Please try again.' })
    }

    const actionMatch  = raw.match(/```action\n([\s\S]*?)\n```/)
    const optionsMatch = raw.match(/```options\n([\s\S]*?)\n```/)

    let action: any  = null
    let options: any = null
    try { if (actionMatch?.[1])  action  = JSON.parse(actionMatch[1])  } catch { /* ignore bad JSON */ }
    try { if (optionsMatch?.[1]) options = JSON.parse(optionsMatch[1]) } catch { /* ignore bad JSON */ }

    const text = raw
      .replace(/```action[\s\S]*?```/g, '')
      .replace(/```options[\s\S]*?```/g, '')
      .trim()

    // ── Activity log ────────────────────────────────────────────
    try {
      await logActivity({
        userId:    session?.user?.email ?? undefined,
        siteUrl:   profile?.site_url,
        siteName:  profile?.site_name,
        category:  action ? 'ai_action' : 'system',
        action:    action?.type || 'ai_chat',
        status:    'success',
        summary:   action
          ? `AI action: ${action.type}${action.title ? ' — ' + action.title : ''}`
          : `Chat: ${String(lastUserMsg).slice(0, 80)}`,
        detail:    { userMessage: lastUserMsg, action, aiResponse: text.slice(0, 300) },
        ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: req.headers.get('user-agent') ?? undefined,
        durationMs: Date.now() - start,
      })
    } catch (logErr: any) {
      console.error('[logActivity]', logErr?.message)
    }

    return NextResponse.json({ text, action, options, routineUsed: false })

  } catch (err: any) {
    const detail = err?.message ?? String(err)
    console.error('[/api/ai unhandled]', detail)

    try {
      await logActivity({
        userId:    session?.user?.email ?? undefined,
        siteUrl:   profile?.site_url,
        category:  'system',
        action:    'ai_route_error',
        status:    'error',
        summary:   'Unhandled error in /api/ai: ' + detail.slice(0, 120),
        detail:    { error: detail, userMessage: lastUserMsg.slice(0, 200) },
        durationMs: Date.now() - start,
      })
    } catch { /* ignore */ }

    return NextResponse.json({
      error: detail,
      debug: detail,
      text:  `⚠️ Server error: ${detail}`,
    }, { status: 500 })
  }
}

/**
 * Handle routine request by routing to appropriate API endpoint
 */
async function handleRoutineRequest(
  intent: any,
  siteUrl: string,
  apiKey: string,
  profile: SiteProfile | undefined,
  session: any,
  start: number
): Promise<NextResponse> {
  try {
    // For now, return instruction to use routine endpoint
    // In production, you'd call the routine API directly here

    let routineType = ''
    let operation = ''
    let params: any = {}

    if (intent.type === 'business_info') {
      routineType = 'business_info_manager'
      operation = intent.operation // 'phone', 'email', 'address'
      params = {
        oldValue: intent.oldValue,
        newValue: intent.newValue,
      }
    } else if (intent.type === 'form') {
      routineType = 'form_manager'
      operation = intent.operation
    } else if (intent.type === 'image') {
      routineType = 'image_manager'
      operation = intent.operation
    } else if (intent.type === 'theme_settings') {
      routineType = 'theme_settings_manager'
      operation = intent.operation
    }

    // Log routine attempt
    await logActivity({
      userId: session?.user?.email ?? undefined,
      siteUrl: profile?.site_url,
      siteName: profile?.site_name,
      category: 'routine_request',
      action: `${routineType}_${operation}`,
      status: 'initiated',
      summary: `Routing to ${routineType} for ${operation}`,
      detail: params,
      ipAddress: undefined,
      userAgent: undefined,
      durationMs: Date.now() - start,
    })

    // Return routine instruction
    return NextResponse.json({
      text: `I'll help you ${intent.operation} on your site. Scanning for all instances...`,
      routineUsed: true,
      routine: {
        type: routineType,
        operation,
        params,
        siteUrl,
        apiKey,
      },
      action: {
        type: 'routine_scan',
        routine: routineType,
        operation,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
