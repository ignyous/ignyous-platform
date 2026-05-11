import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { runHealthAgent, runSeoAgent, runContentAgent, runWooAgent, runSecurityAgent, runPluginUpdaterAgent } from '@/lib/agents/agents'

const prisma = new PrismaClient()

// GET — list agents, their config, and recent runs for a site
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url    = new URL(req.url)
  const siteId = url.searchParams.get('siteId') || ''

  const [site, recentRuns] = await Promise.all([
    prisma.site.findUnique({ where: { id: siteId } }),
    prisma.agentRun.findMany({ where: { siteId }, orderBy: { startedAt: 'desc' }, take: 30 }),
  ])

  const cfg = (site?.agentConfigs as any) || {}

  const AGENTS = [
    { id: 'health',        icon: '💚', name: 'Site Health Monitor',    desc: 'Checks uptime, performance, broken links, plugin updates hourly. Alerts on critical issues.', schedule: 'Every hour', defaultEnabled: true },
    { id: 'seo',           icon: '🔍', name: 'SEO Improvement Agent',  desc: 'Finds pages with poor SEO scores and auto-improves titles, descriptions, focus keywords.', schedule: 'Daily at 3am', settings: [{ key: 'threshold', label: 'Minimum SEO score (auto-fix below this)', type: 'number', default: 60 }] },
    { id: 'content',       icon: '✍️', name: 'Content Strategy Agent', desc: 'Analyses your site niche weekly, identifies content gaps, and creates draft blog posts.', schedule: 'Weekly (Sunday)' },
    { id: 'woocommerce',   icon: '🛒', name: 'WooCommerce Sales Agent', desc: 'Monitors store health, low stock, slow-moving products. Creates promotions when useful.', schedule: 'Every 4 hours' },
    { id: 'security',      icon: '🛡️', name: 'Security Patrol Agent',  desc: 'Monitors Wordfence, blocked IPs, SSL status. Alerts on threats and triggers scans.', schedule: 'Every hour' },
    { id: 'plugin_updater',icon: '🔄', name: 'Plugin Updater Agent',    desc: 'Safely updates one plugin per day: snapshots first, updates, verifies site is still up.', schedule: 'Daily at 2am' },
    { id: 'multisite_sync',icon: '🌐', name: 'Multi-site Sync Agent',   desc: 'Propagates approved changes from one site to your other connected sites.', schedule: 'On demand' },
  ]

  const agentsWithStatus = AGENTS.map(a => ({
    ...a,
    enabled: cfg[a.id]?.enabled || (a.id === 'health' && cfg[a.id] === undefined) || false,
    settings: cfg[a.id] || {},
    lastRun:  recentRuns.find(r => r.agentType === a.id),
    runCount: recentRuns.filter(r => r.agentType === a.id).length,
  }))

  return NextResponse.json({ agents: agentsWithStatus, recentRuns })
}

// PATCH — update agent config
export async function PATCH(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteId, agentId, enabled, settings } = await req.json()
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  const cfg  = (site?.agentConfigs as any) || {}
  cfg[agentId] = { ...(cfg[agentId] || {}), enabled, ...(settings || {}) }
  await prisma.site.update({ where: { id: siteId }, data: { agentConfigs: cfg } })
  return NextResponse.json({ success: true })
}

// POST — manually trigger an agent
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteId, agentId } = await req.json()
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const cfg = (site.agentConfigs as any)?.[agentId] || {}

  let result: any
  switch (agentId) {
    case 'health':         result = await runHealthAgent(site);                         break
    case 'seo':            result = await runSeoAgent(site, cfg.threshold || 60);       break
    case 'content':        result = await runContentAgent(site);                        break
    case 'woocommerce':    result = await runWooAgent(site);                            break
    case 'security':       result = await runSecurityAgent(site);                       break
    case 'plugin_updater': result = await runPluginUpdaterAgent(site);                  break
    default:               return NextResponse.json({ error: 'Unknown agent' }, { status: 400 })
  }

  return NextResponse.json({ success: result.success, summary: result.summary, actionsLog: result.actionsLog })
}
