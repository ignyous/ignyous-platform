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
  try {
    const session = await getServerSession()
    const { messages, siteContext, siteUrl, apiKey } = await req.json()

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    // Build site profile (scan-before-action)
    let profile: SiteProfile | undefined

    if (siteContext) {
      profile = siteContext as SiteProfile
    } else if (siteUrl && apiKey) {
      try {
        const built = await buildSiteProfile(siteUrl, apiKey)
        if (built) profile = built
      } catch (err) {
        console.error('[buildSiteProfile error]', err)
      }
    }

    // ── CHECK IF THIS IS A ROUTINE REQUEST ──
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || ''
    const routineIntent = detectRoutineIntent(String(lastUserMsg))

    if (routineIntent && siteUrl && apiKey) {
      // Route to appropriate routine handler
      return await handleRoutineRequest(routineIntent, siteUrl, apiKey, profile, session, start)
    }

    // ── OTHERWISE, USE CLAUDE FOR CHAT ──
    try {
      const system = buildSystemPrompt(profile)

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system,
        messages: messages.map((m: any) => ({ 
          role: m.role, 
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) 
        })),
      })

      const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''

      if (!raw) {
        return NextResponse.json({ 
          text: 'I received your request but had trouble formulating a response. Please try again.',
          routineUsed: false,
        })
      }

      // Parse action and options blocks
      const actionMatch = raw.match(/```action\n([\s\S]*?)\n```/)
      const optionsMatch = raw.match(/```options\n([\s\S]*?)\n```/)

      let action: any = null
      let options: any = null

      if (actionMatch?.[1]) {
        try {
          action = JSON.parse(actionMatch[1])
        } catch (e) {
          console.error('[action parse error]', e)
        }
      }
      if (optionsMatch?.[1]) {
        try {
          options = JSON.parse(optionsMatch[1])
        } catch (e) {
          console.error('[options parse error]', e)
        }
      }

      // Strip action/options blocks from visible text
      const text = raw
        .replace(/```action[\s\S]*?```/g, '')
        .replace(/```options[\s\S]*?```/g, '')
        .trim()

      // Log the interaction
      try {
        await logActivity({
          userId: session?.user?.email ?? undefined,
          siteUrl: profile?.site_url,
          siteName: profile?.site_name,
          category: action ? 'ai_action' : 'system',
          action: action?.type || 'ai_chat',
          status: 'success',
          summary: action
            ? 'AI action: ' + action.type + (action.title ? ' on ' + action.title : '')
            : 'Chat: ' + String(lastUserMsg).slice(0, 80),
          detail: { userMessage: lastUserMsg, action, aiResponse: text.slice(0, 300) },
          ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
          userAgent: req.headers.get('user-agent') ?? undefined,
          durationMs: Date.now() - start,
        })
      } catch (logErr) {
        console.error('[logActivity error]', logErr)
      }

      return NextResponse.json({ text, action, options, routineUsed: false })
    } catch (claudeErr: any) {
      console.error('[Claude API error]', claudeErr)
      return NextResponse.json({ 
        error: claudeErr?.message || 'Claude API error',
        text: 'I encountered an error processing your request. Please try again.'
      }, { status: 500 })
    }
  } catch (err: any) {
    console.error('[POST error]', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
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
