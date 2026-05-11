import { runAgent, bridgeCall, AgentTool, AgentContext } from './runner'
import { PrismaClient } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'

const prisma    = new PrismaClient()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── Shared tools used by multiple agents ──────────────────────
const TOOL_READ_SITE: AgentTool = {
  name: 'read_site_info',
  description: 'Read current site info including pages, plugins, theme, and recent activity',
  input_schema: { type: 'object', properties: {}, required: [] },
  handler: async (_, ctx) => {
    const [site, pages, plugins, activity] = await Promise.all([
      bridgeCall(ctx.siteUrl, ctx.apiKey, 'site'),
      bridgeCall(ctx.siteUrl, ctx.apiKey, 'pages'),
      bridgeCall(ctx.siteUrl, ctx.apiKey, 'plugins'),
      prisma.activityLog.findMany({ where: { siteUrl: ctx.siteUrl }, orderBy: { timestamp: 'desc' }, take: 10, select: { action: true, status: true, summary: true, timestamp: true } }),
    ])
    return { site: site?.data, pages: pages?.data?.pages?.slice(0, 20), plugins: plugins?.data?.plugins, recentActivity: activity }
  },
}

const TOOL_CLEAR_CACHE: AgentTool = {
  name: 'clear_cache',
  description: 'Clear all WordPress caches (WP Rocket, LiteSpeed, W3TC, etc.)',
  input_schema: { type: 'object', properties: {}, required: [] },
  handler: async (_, ctx) => bridgeCall(ctx.siteUrl, ctx.apiKey, 'cache/clear_all', 'POST'),
}

const TOOL_TAKE_SNAPSHOT: AgentTool = {
  name: 'take_snapshot',
  description: 'Take a backup snapshot of the site before making changes',
  input_schema: { type: 'object', properties: { label: { type: 'string', description: 'Snapshot label' } }, required: ['label'] },
  handler: async (input, ctx) => bridgeCall(ctx.siteUrl, ctx.apiKey, 'snapshot', 'POST', { label: input.label }),
}

const TOOL_SEND_ALERT: AgentTool = {
  name: 'send_alert',
  description: 'Send an SMS/email alert to the site owner about a critical issue',
  input_schema: { type: 'object', properties: { message: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } }, required: ['message', 'severity'] },
  handler: async (input, ctx) => {
    const site = await prisma.site.findUnique({ where: { id: ctx.siteId }, include: { user: true } })
    if (!site?.user) return { sent: false, reason: 'User not found' }
    if (input.severity === 'critical' || input.severity === 'high') {
      if (site.user.phone && process.env.TWILIO_ACCOUNT_SID) {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER || '', To: site.user.phone, Body: `ignyous Agent [${input.severity.toUpperCase()}]: ${input.message}` }),
        })
      }
      if (site.user.email && process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'ignyous Agent <agents@ignyous.ai>', to: [site.user.email], subject: `[${input.severity.toUpperCase()}] ignyous Agent Alert — ${site.name || site.url}`, html: `<p>${input.message}</p>` }),
        })
      }
    }
    return { sent: true, severity: input.severity }
  },
}

// ══════════════════════════════════════════════════════════════
// 1. HEALTH MONITOR AGENT
// ══════════════════════════════════════════════════════════════
export async function runHealthAgent(site: any) {
  return runAgent('health', site, [
    TOOL_READ_SITE,
    TOOL_CLEAR_CACHE,
    TOOL_TAKE_SNAPSHOT,
    TOOL_SEND_ALERT,
    {
      name: 'check_uptime',
      description: 'Ping the site and check response time',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        const start = Date.now()
        try {
          const r = await fetch(ctx.siteUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
          return { status: r.status, latencyMs: Date.now() - start, ok: r.ok }
        } catch (e: any) { return { ok: false, error: e.message, latencyMs: Date.now() - start } }
      },
    },
    {
      name: 'check_broken_links',
      description: 'Scan for broken links on the site',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        const db = await prisma.site.findFirst({ where: { url: ctx.siteUrl } })
        const existing = await prisma.brokenLink.findMany({ where: { siteId: db?.id || '', fixed: false }, take: 10 })
        return { brokenLinks: existing.length, sample: existing.slice(0, 3).map(l => l.brokenUrl) }
      },
    },
    {
      name: 'check_plugin_updates',
      description: 'Check how many plugins need updates',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        const r = await bridgeCall(ctx.siteUrl, ctx.apiKey, 'plugins')
        const plugins = r?.data?.plugins || []
        const needsUpdate = plugins.filter((p: any) => p.update)
        return { total: plugins.length, needsUpdate: needsUpdate.length, plugins: needsUpdate.map((p: any) => p.name) }
      },
    },
  ],
  `You are the Site Health Monitor Agent for ${site.name || site.url}.
Your job: check the site's health, identify issues, and fix what you can automatically.

Process:
1. Call check_uptime — if site is down, send_alert immediately with severity "critical"
2. Call read_site_info — check recent errors in activity log
3. Call check_plugin_updates — if 3+ plugins need updates, note it
4. Call check_broken_links — if 5+ broken links, note it
5. If site is slow (>3000ms), call clear_cache
6. Summarise findings and any actions taken

Be decisive. Fix what you can, alert on what you can't. Keep summary under 100 words.`)
}

// ══════════════════════════════════════════════════════════════
// 2. SEO IMPROVEMENT AGENT
// ══════════════════════════════════════════════════════════════
export async function runSeoAgent(site: any, threshold = 60) {
  return runAgent('seo', site, [
    TOOL_READ_SITE,
    {
      name: 'get_seo_audit',
      description: 'Get SEO scores for all pages',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        const r = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/seo?siteUrl=${encodeURIComponent(ctx.siteUrl)}&apiKey=${encodeURIComponent(ctx.apiKey)}`)
        const d = await r.json()
        return { pages: d.pages?.map((p: any) => ({ id: p.id, title: p.title, score: p.score, issues: p.issues })) || [] }
      },
    },
    {
      name: 'generate_seo_for_page',
      description: 'AI-generate optimised SEO title, description, focus keyword for a specific page',
      input_schema: { type: 'object', properties: { pageId: { type: 'number' }, pageTitle: { type: 'string' } }, required: ['pageId', 'pageTitle'] },
      handler: async (input, ctx) => {
        const r = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/seo`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generate', siteUrl: ctx.siteUrl, apiKey: ctx.apiKey, pageId: input.pageId, siteContext: { site_name: ctx.siteName, site_url: ctx.siteUrl } }),
        })
        return r.json()
      },
    },
  ],
  `You are the SEO Improvement Agent for ${site.name || site.url}.
Your job: find pages with SEO scores below ${threshold} and improve them automatically.

Process:
1. Call get_seo_audit — identify pages scoring below ${threshold}
2. For each low-scoring page (max 5 per run), call generate_seo_for_page
3. Report how many pages were improved and their new expected scores
4. If all pages are above ${threshold}, report that the site's SEO is healthy

Focus on impact — prioritise the lowest-scoring pages first.`)
}

// ══════════════════════════════════════════════════════════════
// 3. CONTENT STRATEGY AGENT
// ══════════════════════════════════════════════════════════════
export async function runContentAgent(site: any) {
  return runAgent('content', site, [
    TOOL_READ_SITE,
    {
      name: 'list_published_posts',
      description: 'Get list of existing published blog posts to avoid duplicates',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        const r = await bridgeCall(ctx.siteUrl, ctx.apiKey, 'posts?per_page=20&status=publish')
        return { posts: r?.data?.posts?.map((p: any) => p.title) || [] }
      },
    },
    {
      name: 'create_draft_post',
      description: 'Create a draft blog post with AI-generated content',
      input_schema: { type: 'object', properties: { topic: { type: 'string' }, keyword: { type: 'string' }, description: { type: 'string' } }, required: ['topic', 'keyword'] },
      handler: async (input, ctx) => {
        // Generate full post content
        const resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514', max_tokens: 1500,
          messages: [{ role: 'user', content:
            `Write a 600-word SEO-optimised blog post for: "${input.topic}"\n` +
            `Site: ${ctx.siteName}\nKeyword: ${input.keyword}\n\n` +
            `Format: WordPress HTML with h2 headings, paragraphs, a conclusion with CTA.\n` +
            `Return JSON: {"title":"","excerpt":"","content":"<html>","seo_title":"","meta_description":""}`
          }],
        })
        const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
        let post: any = {}
        try { post = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}
        const r = await bridgeCall(ctx.siteUrl, ctx.apiKey, 'posts', 'POST', { title: post.title, content: post.content, excerpt: post.excerpt, status: 'draft', seo_title: post.seo_title, meta_description: post.meta_description })
        return { ...r, title: post.title, keyword: input.keyword }
      },
    },
  ],
  `You are the Content Strategy Agent for ${site.name || site.url}.
Your job: identify content gaps and generate high-quality draft blog posts.

Process:
1. Call read_site_info to understand the site's niche (theme, description, existing pages)
2. Call list_published_posts to see what content already exists
3. Identify 2-3 high-value content topics that:
   - Are relevant to the site's business/niche
   - Fill obvious gaps (e.g. no FAQ page, no pricing page, no "how to" posts)
   - Target keywords with clear search intent
4. Call create_draft_post for ONE topic (don't create too many at once)
5. Summarise what you created and why it's valuable

Be strategic — quality over quantity. The post goes to draft for human review.`)
}

// ══════════════════════════════════════════════════════════════
// 4. WOOCOMMERCE SALES AGENT
// ══════════════════════════════════════════════════════════════
export async function runWooAgent(site: any) {
  return runAgent('woocommerce', site, [
    TOOL_READ_SITE,
    TOOL_SEND_ALERT,
    {
      name: 'get_store_overview',
      description: 'Get WooCommerce store stats, recent orders, and product info',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        const [orders, products] = await Promise.all([
          bridgeCall(ctx.siteUrl, ctx.apiKey, 'woo/orders?per_page=20&status=any'),
          bridgeCall(ctx.siteUrl, ctx.apiKey, 'woo/products?per_page=20'),
        ])
        const recentOrders = orders?.data?.orders || []
        const productList  = products?.data?.products || []
        const revenueToday = recentOrders.filter((o: any) => o.date?.startsWith(new Date().toISOString().slice(0,10))).reduce((s: number, o: any) => s + parseFloat(o.total || '0'), 0)
        const lowStock     = productList.filter((p: any) => p.stock !== null && p.stock <= 5)
        const slowMovers   = productList.filter((p: any) => (p.sales || 0) === 0)
        return { revenueToday, totalOrders: recentOrders.length, lowStockProducts: lowStock.map((p: any) => ({ id: p.id, name: p.name, stock: p.stock })), slowMovingProducts: slowMovers.slice(0, 5).map((p: any) => ({ id: p.id, name: p.name })) }
      },
    },
    {
      name: 'create_woo_coupon',
      description: 'Create a WooCommerce discount coupon',
      input_schema: { type: 'object', properties: { code: { type: 'string' }, discount_type: { type: 'string', enum: ['percent', 'fixed_cart'] }, amount: { type: 'number' }, description: { type: 'string' } }, required: ['code', 'amount'] },
      handler: async (input, ctx) => bridgeCall(ctx.siteUrl, ctx.apiKey, 'posts', 'POST', { ...input, type: 'shop_coupon' }),
    },
    {
      name: 'update_product_stock_note',
      description: 'Update a product description or add urgency messaging for low-stock items',
      input_schema: { type: 'object', properties: { productId: { type: 'number' }, stockMessage: { type: 'string' } }, required: ['productId', 'stockMessage'] },
      handler: async (input, ctx) => {
        const product = await bridgeCall(ctx.siteUrl, ctx.apiKey, `posts/${input.productId}`)
        const content = (product?.data?.content || '') + `\n\n<p><strong>⚠️ ${input.stockMessage}</strong></p>`
        return bridgeCall(ctx.siteUrl, ctx.apiKey, `posts/${input.productId}`, 'PATCH', { content })
      },
    },
  ],
  `You are the WooCommerce Sales Agent for ${site.name || site.url}.
Your job: monitor the store and take proactive actions to boost sales and prevent issues.

Process:
1. Call get_store_overview — understand revenue, low stock, slow movers
2. If any product has stock ≤ 2: call update_product_stock_note to add urgency + send_alert
3. If slow-moving products exist (0 sales): consider creating a targeted coupon
4. If revenue today is unusually high/low compared to history: note the trend
5. Report what you found and any actions taken

Be specific about numbers. Don't create coupons unless there's a clear business case.`)
}

// ══════════════════════════════════════════════════════════════
// 5. SECURITY PATROL AGENT
// ══════════════════════════════════════════════════════════════
export async function runSecurityAgent(site: any) {
  return runAgent('security', site, [
    TOOL_SEND_ALERT,
    TOOL_TAKE_SNAPSHOT,
    {
      name: 'check_security_status',
      description: 'Check Wordfence status, blocked IPs, and recent login attempts',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => bridgeCall(ctx.siteUrl, ctx.apiKey, 'plugins/wordfence/status'),
    },
    {
      name: 'get_blocked_ips',
      description: 'List currently blocked IP addresses',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => bridgeCall(ctx.siteUrl, ctx.apiKey, 'plugins/wordfence/blocked-ips'),
    },
    {
      name: 'trigger_security_scan',
      description: 'Start a Wordfence malware scan',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => bridgeCall(ctx.siteUrl, ctx.apiKey, 'plugins/wordfence/scan', 'POST'),
    },
    {
      name: 'check_ssl_status',
      description: 'Verify SSL certificate and HTTPS configuration',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        try {
          const r = await fetch(ctx.siteUrl.replace('http://', 'https://'), { method: 'HEAD', signal: AbortSignal.timeout(5000) })
          return { https_works: r.ok, status: r.status }
        } catch { return { https_works: false } }
      },
    },
  ],
  `You are the Security Patrol Agent for ${site.name || site.url}.
Your job: identify security threats and take protective action.

Process:
1. Call check_ssl_status — if HTTPS isn't working, send_alert with severity "high"
2. Call check_security_status — check Wordfence firewall and login security
3. Call get_blocked_ips — note number of blocked IPs (high count = active attacks)
4. If more than 20 IPs blocked or active attack detected: send_alert severity "high", trigger_security_scan
5. If no Wordfence found: recommend installing it in your summary

Threat levels: 0-5 blocked IPs = normal, 5-20 = elevated, 20+ = active attack.`)
}

// ══════════════════════════════════════════════════════════════
// 6. PLUGIN UPDATER AGENT
// ══════════════════════════════════════════════════════════════
export async function runPluginUpdaterAgent(site: any) {
  return runAgent('plugin_updater', site, [
    TOOL_TAKE_SNAPSHOT,
    TOOL_SEND_ALERT,
    {
      name: 'list_outdated_plugins',
      description: 'Get list of plugins that have available updates',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        const r = await bridgeCall(ctx.siteUrl, ctx.apiKey, 'plugins')
        const plugins = r?.data?.plugins || []
        return { outdated: plugins.filter((p: any) => p.update).map((p: any) => ({ name: p.name, slug: p.slug, current: p.version, available: p.update?.new_version })) }
      },
    },
    {
      name: 'update_plugin',
      description: 'Update a specific plugin by slug',
      input_schema: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' } }, required: ['slug', 'name'] },
      handler: async (input, ctx) => bridgeCall(ctx.siteUrl, ctx.apiKey, 'plugins/install', 'POST', { slug: input.slug, action: 'update' }),
    },
    {
      name: 'check_site_still_up',
      description: 'Verify the site is still responding correctly after an update',
      input_schema: { type: 'object', properties: {}, required: [] },
      handler: async (_, ctx) => {
        await new Promise(r => setTimeout(r, 3000)) // wait for site to settle
        try {
          const r = await fetch(ctx.siteUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
          return { ok: r.ok, status: r.status }
        } catch (e: any) { return { ok: false, error: e.message } }
      },
    },
  ],
  `You are the Plugin Updater Agent for ${site.name || site.url}.
Your job: safely update outdated plugins one at a time.

Process:
1. Call list_outdated_plugins — if none, stop and report all plugins are current
2. Call take_snapshot with label "Before plugin updates [date]"
3. Update the FIRST plugin only (safe, incremental approach):
   a. Call update_plugin
   b. Call check_site_still_up — if site is down, send_alert severity "critical" and stop
   c. If site is up, report success
4. Stop after 1 plugin — the agent will run again tomorrow for the next one

Safety first — never batch-update. One plugin per run, always verify after.`)
}

// ══════════════════════════════════════════════════════════════
// 7. MULTI-SITE SYNC AGENT
// ══════════════════════════════════════════════════════════════
export async function runMultisiteSyncAgent(userId: string, sourceChange: { siteId: string; type: string; content: string }) {
  const sites = await prisma.site.findMany({ where: { userId, id: { not: sourceChange.siteId } } })
  const results = []
  for (const site of sites) {
    const config = (site.agentConfigs as any)?.multisite_sync
    if (!config?.enabled) continue
    const r = await runAgent('multisite_sync', site, [
      {
        name: 'apply_change',
        description: 'Apply a propagated change from the source site',
        input_schema: { type: 'object', properties: { content: { type: 'string' }, pageTitle: { type: 'string' } }, required: ['content'] },
        handler: async (input, ctx) => bridgeCall(ctx.siteUrl, ctx.apiKey, `pages/${config.syncPageId || 1}`, 'POST', { content: input.content, status: 'publish' }),
      },
    ],
    `You are the Multi-site Sync Agent. A change was made to one site and needs to be applied here.
Change type: ${sourceChange.type}
Content/details: ${sourceChange.content}
Apply the change to this site, adapting as needed for this site's context.`)
    results.push({ siteId: site.id, ...r })
  }
  return results
}
