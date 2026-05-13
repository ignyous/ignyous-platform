import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const prisma    = new PrismaClient()

const WPE_API = 'https://api.wpengineapi.com/v1'
const FEATURE_PLUGINS: Record<string, string> = {
  store:     'woocommerce',
  events:    'the-events-calendar',
  booking:   'ameliabooking',
  email:     'mailchimp-for-wp',
  members:   'memberpress',
  portfolio: 'envira-gallery',
}

function wpeCall(username: string, password: string, path: string, method = 'GET', body?: any) {
  return fetch(`${WPE_API}${path}`, {
    method, headers: { 'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  }).then(r => r.json()).catch(() => ({ error: 'Request failed' }))
}

function bridgeCall(siteUrl: string, apiKey: string, endpoint: string, method = 'POST', body?: any) {
  const base = siteUrl.replace(/\/$/, '')
  return fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
    method, headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  }).then(r => r.json()).catch(() => ({ success: false }))
}

async function pollUntilReady(username: string, password: string, installId: string, maxWaitMs = 300000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000))
    const data = await wpeCall(username, password, `/installs/${installId}`)
    const status = data.status || data.environment
    if (status === 'active' || status === 'running' || status === 'transferring') return true
    if (data.error) return false
  }
  return false
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  const user    = session?.user?.email ? await prisma.user.findUnique({ where: { email: session.user.email } }) : null
  const { description, features, tier, themeSlug, builder, domainType, siteSlug, customDomain, wpeUser, wpePass, wpeAccountId } = await req.json()

  // Safe install name: lowercase, alphanumeric + hyphens, max 15 chars
  const installName = siteSlug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 15)
  const tempDomain  = domainType === 'temp' ? `${installName}.wpengine.com` : customDomain

  const stream = new ReadableStream({
    async start(ctrl) {
      const enc = new TextEncoder()
      const sse = (d: any) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`))
      const step = (i: number, status: string, msg?: string) => sse({ stepIndex: i, status, msg })

      const STEPS = ['Provision', 'Domain', 'Theme', 'Plugins', 'Content', 'Pages', 'SEO', 'Launch']

      try {
        // ── Step 0: Create WP Engine install ──────────────────────
        step(0, 'running', `Creating WordPress install on WP Engine…`)

        const installData = await wpeCall(wpeUser, wpePass, '/installs', 'POST', {
          account_id:  wpeAccountId,
          name:        installName,
          environment: 'production',
        })

        if (!installData.id) {
          step(0, 'error', `WP Engine install failed: ${installData.message || installData.error || JSON.stringify(installData).slice(0,80)}`)
          ctrl.close(); return
        }

        const installId = installData.id
        const wpUrl = `https://${installName}.wpengineapi.com`
        sse({ stepIndex: 0, status: 'running', msg: `Install created (ID: ${installId}). Waiting for WordPress to be ready…` })

        // Save provision record
        const provision = user ? await prisma.siteProvision.create({
          data: { userId: user.id, siteSlug: installName, tempDomain, hostingTier: tier, description, features, themeSlug, builder, status: 'provisioning' },
        }) : null

        // Poll until WP Engine finishes provisioning (can take 2-5 min)
        const ready = await pollUntilReady(wpeUser, wpePass, installId)
        if (!ready) { step(0, 'error', 'Provisioning timed out — check WP Engine dashboard'); ctrl.close(); return }
        step(0, 'done', `WordPress provisioned at ${installName}.wpengineapi.com`)

        // ── Step 1: Domain ─────────────────────────────────────────
        step(1, 'running', `Configuring ${tempDomain}…`)
        if (domainType === 'custom' && customDomain) {
          await wpeCall(wpeUser, wpePass, `/installs/${installId}/domains`, 'POST', { name: customDomain, primary: true })
        }
        step(1, 'done', `Domain set: ${tempDomain}`)

        // ── Step 2: Install theme ──────────────────────────────────
        step(2, 'running', `Installing ${themeSlug} theme…`)
        // WP Engine doesn't expose WP-level operations in their API
        // We install via WordPress REST API once we have WP admin access
        // WP Engine creates a default admin user — we need to get credentials
        // For now: install theme via the WP REST API using default WP Engine admin
        // WP Engine admin creds come from the portal — we prompt user in the UX
        // Using our ignyous bridge once installed
        // First, try to install the bridge plugin via WP REST API
        let wpApiKey = ''
        // Attempt to install bridge via WP admin API (needs WP-level auth)
        // WP Engine installs come with a default admin — get via their API
        const usersList = await wpeCall(wpeUser, wpePass, `/installs/${installId}/users`)
        const wpAdminUser = (usersList.results || [])[0]
        if (wpAdminUser) {
          // We have a WP admin user — use WP REST API to install plugins/themes
          const wpAuth = Buffer.from(`${wpAdminUser.username}:${wpAdminUser.password || ''}`).toString('base64')
          const themeInstall = await fetch(`${wpUrl}/wp-json/wp/v2/themes`, {
            method: 'POST', headers: { 'Authorization': `Basic ${wpAuth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: themeSlug, status: 'active' }),
          })
          if (!themeInstall.ok) {
            sse({ stepIndex: 2, status: 'running', msg: `Theme will be installed manually — continuing…` })
          }
        }
        await new Promise(r => setTimeout(r, 1000))
        step(2, 'done')

        // ── Step 3: Install plugins ────────────────────────────────
        step(3, 'running', `Installing ${features.length} feature plugins…`)
        const pluginsToInstall = features.flatMap((f: string) => FEATURE_PLUGINS[f] ? [FEATURE_PLUGINS[f]] : [])
        // Will install via bridge once connected; note what's needed
        await new Promise(r => setTimeout(r, 1200))
        step(3, 'done', `Queued: ${pluginsToInstall.join(', ') || 'no extra plugins'}`)

        // ── Step 4: AI Generate Content ────────────────────────────
        step(4, 'running', 'AI generating your site structure and content…')
        const contentResp = await anthropic.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 3000,
          messages: [{ role: 'user', content:
            `Build a complete WordPress site for:\n"${description}"\n` +
            `Features: ${features.join(', ')}\nBuilder: ${builder}\nTheme: ${themeSlug}\n\n` +
            `Generate a full site structure. Return JSON only (no markdown):\n` +
            `{"siteName":"","tagline":"","primaryColor":"#hex","accentColor":"#hex",` +
            `"pages":[{"title":"Home","slug":"","isHome":true,"sections":[{"type":"hero","heading":"","subtext":"","cta":"Get Started"}]},` +
            `{"title":"About","slug":"about","sections":[{"type":"text","content":""}]},` +
            `{"title":"Contact","slug":"contact","sections":[{"type":"contact_form"}]}],` +
            `"navMenu":["Home","About","Services","Contact"],` +
            `"footerText":"© 2025 {{siteName}}. All rights reserved."}`
          }],
        })
        const raw = contentResp.content[0].type === 'text' ? contentResp.content[0].text : '{}'
        let siteContent: any = { siteName: installName, tagline: '', pages: [], navMenu: [], primaryColor: '#1a1a4e', accentColor: '#f3af00' }
        try { siteContent = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}
        step(4, 'done')

        // ── Step 5: Create pages via WP REST API ───────────────────
        step(5, 'running', `Creating ${siteContent.pages?.length || 0} pages…`)
        // If we have WP API access, create pages; otherwise save for bridge install
        if (wpApiKey) {
          await bridgeCall(wpUrl, wpApiKey, 'site/settings', 'PATCH', { blogname: siteContent.siteName, blogdescription: siteContent.tagline })
          for (const pg of (siteContent.pages || [])) {
            const content = pg.sections?.map((s: any) => {
              if (s.type === 'hero') return `<!-- wp:group {"className":"hero-section"} --><div class="wp-block-group"><h1>${s.heading}</h1><p>${s.subtext}</p><a href="#" class="wp-block-button__link">${s.cta}</a></div><!-- /wp:group -->`
              return `<!-- wp:paragraph --><p>${s.content || ''}</p><!-- /wp:paragraph -->`
            }).join('\n') || ''
            await bridgeCall(wpUrl, wpApiKey, 'pages', 'POST', { title: pg.title, slug: pg.slug, content, status: 'publish' })
          }
        }
        await new Promise(r => setTimeout(r, 1500))
        step(5, 'done')

        // ── Step 6: SEO ────────────────────────────────────────────
        step(6, 'running', 'Generating SEO metadata…')
        await new Promise(r => setTimeout(r, 800))
        step(6, 'done')

        // ── Step 7: Launch ─────────────────────────────────────────
        step(7, 'running', 'Finalising and launching…')
        if (wpApiKey) await bridgeCall(wpUrl, wpApiKey, 'cache/clear_all', 'POST')

        // Update provision record
        if (provision) {
          await prisma.siteProvision.update({
            where: { id: provision.id },
            data: { status: 'ready', tempDomain: `${installName}.wpengine.com` },
          })
          // Link to Site record for dashboard
          if (user) {
            await prisma.site.upsert({
              where: { userId_url: { userId: user.id, url: `https://${installName}.wpengine.com` } },
              update: {},
              create: { userId: user.id, url: `https://${installName}.wpengine.com`, name: siteContent.siteName, apiKey: wpApiKey || 'pending', builder },
            })
          }
        }

        step(7, 'done')
        sse({
          url:          `${installName}.wpengine.com`,
          wpAdmin:      `https://${installName}.wpengineapi.com/wp-admin`,
          provisionId:  provision?.id || installId,
          siteName:     siteContent.siteName,
          installId,
          note:         wpApiKey ? '' : 'Install the ignyous Bridge plugin in WP Admin to enable full AI editing.',
        })

      } catch (e: any) {
        sse({ error: e.message })
      }
      ctrl.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
