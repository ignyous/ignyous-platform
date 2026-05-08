import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'
import twilio from 'twilio'

const prisma    = new PrismaClient()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

// Twilio sends form-encoded POST
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const body     = formData.get('Body')?.toString().trim() || ''
    const from     = formData.get('From')?.toString() || ''
    const to       = formData.get('To')?.toString() || ''

    if (!body || !from) {
      return twimlResponse('No message received.')
    }

    console.log(`[SMS] From: ${from} — "${body}"`)

    // 1. Look up user by phone number
    const user = await prisma.user.findUnique({
      where:   { phone: normalizePhone(from) },
      include: { sites: { orderBy: { connectedAt: 'desc' }, take: 1 } },
    })

    if (!user) {
      return twimlResponse(
        `This number isn't linked to an ignyous account. Log into ignyous.ai and add your phone number in Settings to enable SMS commands.`
      )
    }

    if (user.sites.length === 0) {
      return twimlResponse(
        `Hi ${user.name || 'there'}! You don't have any sites connected yet. Connect one at ignyous.ai first, then text me your changes.`
      )
    }

    const site   = user.sites[0]
    const apiKey = site.apiKey

    // 2. Get site context via bridge
    let siteContext: any = { site_url: site.url, site_name: site.name }
    try {
      const bridgeUrl = `${site.url.replace(/\/$/, '')}/wp-json/ignyous/v1/site`
      const infoRes   = await fetch(bridgeUrl, {
        headers: { 'X-Ignyous-Key': apiKey },
      })
      if (infoRes.ok) {
        const infoData = await infoRes.json()
        if (infoData.success) {
          const d = infoData.data
          siteContext = {
            site_url:     site.url,
            site_name:    d.site?.name || site.name,
            theme:        d.theme?.name,
            builder:      d.builder?.[0]?.name,
            active_plugins: (d.plugins || []).filter((p: any) => p.active !== false).map((p: any) => ({ name: p.name, slug: p.slug })),
          }
        }
      }
    } catch {}

    // 3. Send to AI
    const aiSystem = `You are ignyous.ai receiving an SMS command from a business owner to make changes to their WordPress site.
The user is texting from their phone — keep your response VERY SHORT (under 100 chars if possible). No markdown.
You have the same capabilities: update_page, create_page, update_site_options, install_plugin.
For promotional banners: use update_page to add a banner section at the top of the homepage.
For content changes: update the relevant page directly.
Always include an action block when making changes.
SITE CONTEXT: ${JSON.stringify(siteContext)}`

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: aiSystem,
      messages: [{ role: 'user', content: body }],
    })

    const raw = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : ''

    // 4. Parse and execute action
    const actionMatch = raw.match(/```action\n([\s\S]*?)\n```/)
    let action  = null
    let actionResult = ''

    if (actionMatch?.[1]) {
      try { action = JSON.parse(actionMatch[1]) } catch {}
    }

    if (action) {
      try {
        const bridgeBase = `${site.url.replace(/\/$/, '')}/wp-json/ignyous/v1`

        // Take snapshot first
        await fetch(`${bridgeBase}/snapshot`, {
          method: 'POST',
          headers: { 'X-Ignyous-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: `SMS: ${body.slice(0, 50)}` }),
        })

        switch (action.type) {
          case 'update_page': {
            // Get pages to find target
            const pagesRes = await fetch(`${bridgeBase}/pages`, { headers: { 'X-Ignyous-Key': apiKey } })
            const pagesData = await pagesRes.json()
            const pages = pagesData.data?.pages || []

            // Find homepage or target page
            const targetId = action.pageId || pages.find((p: any) =>
              p.slug === '' || p.slug === 'home' || p.title?.toLowerCase().includes('home')
            )?.id || pages[0]?.id

            if (targetId) {
              const r = await fetch(`${bridgeBase}/pages/${targetId}`, {
                method: 'PATCH',
                headers: { 'X-Ignyous-Key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: action.content }),
              })
              const rd = await r.json()
              actionResult = rd.success ? '✅ Done!' : `❌ ${rd.message || 'Failed'}`
            }
            break
          }
          case 'update_site_options': {
            const r = await fetch(`${bridgeBase}/site/settings`, {
              method: 'PATCH',
              headers: { 'X-Ignyous-Key': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ blogname: action.blogname, blogdescription: action.blogdescription }),
            })
            const rd = await r.json()
            actionResult = rd.success ? '✅ Settings updated!' : `❌ ${rd.message}`
            break
          }
          case 'create_page': {
            const r = await fetch(`${bridgeBase}/pages`, {
              method: 'POST',
              headers: { 'X-Ignyous-Key': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: action.title, content: action.content, status: 'publish' }),
            })
            const rd = await r.json()
            actionResult = rd.success ? `✅ "${action.title}" page created!` : `❌ ${rd.message}`
            break
          }
          default:
            actionResult = `Action "${action.type}" noted — open ignyous.ai to complete.`
        }
      } catch (e: any) {
        actionResult = `❌ Error: ${e.message?.slice(0, 60)}`
      }
    }

    // 5. Build reply
    const cleanText = raw.replace(/```action[\s\S]*?```/g, '').replace(/```options[\s\S]*?```/g, '').trim()
    const reply     = actionResult
      ? `${actionResult}\n${cleanText}`.trim().slice(0, 300)
      : (cleanText || 'Got it! Open ignyous.ai to review.').slice(0, 300)

    console.log(`[SMS] Reply to ${from}: ${reply}`)

    // 6. Send SMS reply
    await twilioClient.messages.create({
      body: reply,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to:   from,
    })

    return twimlResponse(reply)

  } catch (err: any) {
    console.error('[SMS webhook]', err)
    return twimlResponse('Something went wrong. Try again or check ignyous.ai.')
  }
}

// TwiML response (Twilio expects this format)
function twimlResponse(message: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${escapeXml(message)}</Message></Response>`
  return new NextResponse(xml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function normalizePhone(phone: string) {
  // Strip everything except digits and leading +
  return phone.replace(/[^\d+]/g, '')
}
