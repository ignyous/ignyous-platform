import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { runHealthAgent, runSeoAgent, runContentAgent, runWooAgent, runSecurityAgent, runPluginUpdaterAgent } from '@/lib/agents/agents'

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hour      = new Date().getUTCHours()
  const dayOfWeek = new Date().getUTCDay()

  const sites = await prisma.site.findMany({ include: { user: true } })
  const results: any[] = []

  for (const site of sites) {
    const cfg = (site.agentConfigs as any) || {}

    // Skip if no agents configured
    if (!Object.values(cfg).some((c: any) => c?.enabled)) continue

    // Health: every hour
    if (cfg.health?.enabled) {
      try { results.push({ site: site.url, agent: 'health', ...(await runHealthAgent(site)) }) } catch {}
    }

    // Security: every hour
    if (cfg.security?.enabled) {
      try { results.push({ site: site.url, agent: 'security', ...(await runSecurityAgent(site)) }) } catch {}
    }

    // SEO: once daily at 3am UTC
    if (cfg.seo?.enabled && hour === 3) {
      try { results.push({ site: site.url, agent: 'seo', ...(await runSeoAgent(site, cfg.seo.threshold || 60)) }) } catch {}
    }

    // Plugin updater: once daily at 2am UTC
    if (cfg.plugin_updater?.enabled && hour === 2) {
      try { results.push({ site: site.url, agent: 'plugin_updater', ...(await runPluginUpdaterAgent(site)) }) } catch {}
    }

    // WooCommerce: every 4 hours
    if (cfg.woocommerce?.enabled && hour % 4 === 0) {
      try { results.push({ site: site.url, agent: 'woocommerce', ...(await runWooAgent(site)) }) } catch {}
    }

    // Content: weekly on Sunday at 8am UTC
    if (cfg.content?.enabled && dayOfWeek === 0 && hour === 8) {
      try { results.push({ site: site.url, agent: 'content', ...(await runContentAgent(site)) }) } catch {}
    }
  }

  return NextResponse.json({ ok: true, ran: results.length, results: results.map(r => ({ site: r.site, agent: r.agent, success: r.success, summary: r.summary })) })
}
