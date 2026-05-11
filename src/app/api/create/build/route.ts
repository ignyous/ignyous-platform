import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const prisma    = new PrismaClient()

const FEATURE_PLUGINS: Record<string, string[]> = {
  store:     ['woocommerce'],
  events:    ['the-events-calendar'],
  booking:   ['ameliabooking'],
  email:     ['mailchimp-for-wp'],
  members:   ['memberpress'],
  portfolio: ['envira-gallery'],
  blog:      [],
  services:  [],
}

function sse(ctrl: ReadableStreamDefaultController, data: any) {
  ctrl.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

async function bridgeCall(siteUrl: string, apiKey: string, endpoint: string, method = 'GET', body?: any) {
  const base = siteUrl.replace(/\/$/, '')
  const res  = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
    method, headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  })
  return res.json().catch(() => ({ success: false }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  const user    = session?.user?.email ? await prisma.user.findUnique({ where: { email: session.user.email } }) : null

  const { description, features, tier, themeSlug, builder, domainType, siteSlug, customDomain } = await req.json()
  const tempDomain = domainType === 'temp' ? `${siteSlug}.ignyous.app` : customDomain

  const stream = new ReadableStream({
    async start(ctrl) {
      const steps = ['Provision', 'Domain', 'Theme', 'Plugins', 'Content', 'Pages', 'SEO', 'Launch']

      const update = (idx: number, status: 'running'|'done'|'error', msg?: string) =>
        sse(ctrl, { stepIndex: idx, status, msg })

      try {
        // Step 0: Provision
        update(0, 'running')
        await new Promise(r => setTimeout(r, 1200))

        // Create provision record in DB
        const provision = user ? await prisma.siteProvision.create({
          data: {
            userId: user.id, siteSlug, tempDomain, hostingTier: tier,
            description, features, themeSlug, builder,
            status: 'provisioning',
          },
        }) : null

        // ── SiteGround Provisioning ─────────────────────────────
        // NOTE: For real provisioning, you need:
        // 1. SiteGround cPanel API token (set in env: SITEGROUND_CPANEL_URL, SITEGROUND_API_TOKEN)
        // 2. We create a subdomain + WP install via cPanel API
        // 3. Get the WP admin URL and credentials
        // 4. Install ignyous bridge plugin via WP REST API
        //
        // For now: simulate the provisioning and use a known test WordPress install

        let wpUrl = ''
        let wpApiKey = ''

        if (process.env.SITEGROUND_CPANEL_URL && process.env.SITEGROUND_API_TOKEN) {
          // Real SiteGround provisioning
          const sgRes = await fetch(`${process.env.SITEGROUND_CPANEL_URL}/execute/SubDomain/addsubdomain`, {
            method: 'POST',
            headers: { 'Authorization': `cpanel ${process.env.SITEGROUND_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: siteSlug, rootdomain: process.env.SITEGROUND_ROOT_DOMAIN || '', dir: `/public_html/${siteSlug}` }),
          })
          // Install WordPress via WP Toolkit or Softaculous API
          // ... additional provisioning steps
          wpUrl    = `https://${tempDomain}`
          wpApiKey = 'provisioned-key' // Would be set during WP install
        } else {
          // Demo mode — use test environment
          wpUrl    = process.env.DEMO_WP_URL    || `https://${tempDomain}`
          wpApiKey = process.env.DEMO_WP_APIKEY || ''
          await new Promise(r => setTimeout(r, 2000)) // Simulate provisioning time
        }

        update(0, 'done')

        // Step 1: Domain
        update(1, 'running', `Configuring ${tempDomain}…`)
        await new Promise(r => setTimeout(r, 800))
        update(1, 'done')

        // Step 2: Theme
        update(2, 'running', `Installing ${themeSlug}…`)
        if (wpApiKey) await bridgeCall(wpUrl, wpApiKey, 'themes/install', 'POST', { slug: themeSlug })
        else await new Promise(r => setTimeout(r, 1500))
        update(2, 'done')

        // Step 3: Plugins
        update(3, 'running')
        const pluginsToInstall = features.flatMap((f: string) => FEATURE_PLUGINS[f] || [])
        for (const slug of pluginsToInstall) {
          if (wpApiKey) await bridgeCall(wpUrl, wpApiKey, 'plugins/install', 'POST', { slug })
          else await new Promise(r => setTimeout(r, 400))
        }
        update(3, 'done')

        // Step 4: AI Generate Content
        update(4, 'running', 'AI generating site content…')
        const contentResp = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514', max_tokens: 2000,
          messages: [{ role: 'user', content:
            `Generate complete WordPress site content for:\n"${description}"\nFeatures: ${features.join(', ')}\nBuilder: ${builder}\n\n` +
            `Return JSON only:\n{"siteName":"","tagline":"","pages":[{"title":"","slug":"","content":"<gutenberg blocks or builder shortcodes>","isHome":true}],"navMenu":["page titles"],"primaryColor":"#hex","accentColor":"#hex"}`
          }],
        })
        const raw = contentResp.content[0].type === 'text' ? contentResp.content[0].text : '{}'
        let siteContent: any = { siteName: 'My Site', tagline: 'Welcome', pages: [], navMenu: [], primaryColor: '#1a1a4e', accentColor: '#f3af00' }
        try { siteContent = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}
        update(4, 'done')

        // Step 5: Create Pages
        update(5, 'running', `Creating ${siteContent.pages?.length || 0} pages…`)
        if (wpApiKey) {
          // Update site name + tagline
          await bridgeCall(wpUrl, wpApiKey, 'site/settings', 'PATCH', { blogname: siteContent.siteName, blogdescription: siteContent.tagline })
          // Create each page
          for (const page of (siteContent.pages || [])) {
            await bridgeCall(wpUrl, wpApiKey, 'pages', 'POST', { title: page.title, slug: page.slug, content: page.content, status: 'publish' })
          }
        } else {
          await new Promise(r => setTimeout(r, 2000))
        }
        update(5, 'done')

        // Step 6: SEO
        update(6, 'running', 'Generating SEO metadata…')
        if (wpApiKey) {
          // Would call SEO API for each page
        }
        await new Promise(r => setTimeout(r, 800))
        update(6, 'done')

        // Step 7: Launch
        update(7, 'running', 'Clearing cache and finalising…')
        if (wpApiKey) await bridgeCall(wpUrl, wpApiKey, 'cache/clear_all', 'POST')
        await new Promise(r => setTimeout(r, 600))
        update(7, 'done')

        // Update provision record
        if (provision) {
          await prisma.siteProvision.update({
            where: { id: provision.id },
            data: { status: 'ready', buildLog: steps.map((s, i) => ({ step: s, status: 'done' })) },
          })
          // Create Site record for dashboard management
          if (user && wpApiKey) {
            await prisma.site.upsert({
              where: { userId_url: { userId: user.id, url: wpUrl } },
              update: {},
              create: { userId: user.id, url: wpUrl, name: siteContent.siteName, apiKey: wpApiKey, builder },
            })
          }
        }

        sse(ctrl, { url: tempDomain, provisionId: provision?.id || 'demo', siteName: siteContent.siteName })

      } catch (e: any) {
        sse(ctrl, { error: e.message })
      }

      ctrl.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
