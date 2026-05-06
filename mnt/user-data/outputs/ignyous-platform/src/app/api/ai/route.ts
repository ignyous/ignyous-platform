// src/app/api/ai/route.ts
// Powers the ignyous chat interface.
// Claude receives full site context and can output both conversational
// responses AND structured "actions" that the frontend executes against
// the WordPress bridge API.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const BASE_SYSTEM = `You are ignyous.ai — an AI assistant that builds and manages 
WordPress websites for small business owners who aren't technical.

YOUR PERSONALITY:
- Speak like a knowledgeable friend, never a tech manual
- Never use jargon without explaining it
- Be decisive — don't ask for info you already have
- Confirm what you did in plain English after every action

WHAT YOU CAN DO:
When the user asks you to change their website, you output a JSON action block 
AFTER your response text. The platform reads this and executes it via the 
WordPress REST API. Example:

User: "Change my headline to 'Phoenix's Best Plumber'"
Response: "Done! I've updated your homepage headline to 'Phoenix's Best Plumber'. 
It's live now."

Then include:
\`\`\`action
{
  "type": "update_page",
  "pageId": 1,
  "field": "elementor",
  "selector": ".hero-heading",
  "value": "Phoenix's Best Plumber"
}
\`\`\`

ACTION TYPES YOU CAN EMIT:
- update_page: { pageId, elementor_data? or content? }
- create_page: { title, content, template }
- install_plugin: { slug }
- update_setting: { key, value }
- scan_site: {}
- send_test_sms: { message }

IMPORTANT:
- If you're not sure what the user wants, ask ONE clarifying question
- If an action would be irreversible, confirm with the user first
- Always tell the user what you're doing before you do it
- Keep responses under 150 words unless explaining something complex`

export async function POST(req: NextRequest) {
  try {
    const { messages, siteContext } = await req.json()

    // Build system prompt with live site context
    const systemPrompt = siteContext
      ? `${BASE_SYSTEM}\n\nCURRENT SITE CONTEXT:\n${JSON.stringify(siteContext, null, 2)}`
      : BASE_SYSTEM

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   messages,
    })

    const rawContent = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    // Parse out any action blocks
    const actionMatch = rawContent.match(/```action\n([\s\S]*?)\n```/)
    const action = actionMatch ? JSON.parse(actionMatch[1]) : null

    // Clean text (remove the action block from display text)
    const displayText = rawContent.replace(/```action[\s\S]*?```/g, '').trim()

    return NextResponse.json({
      text:   displayText,
      action: action,
      usage:  response.usage,
    })

  } catch (err: any) {
    console.error('AI route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
