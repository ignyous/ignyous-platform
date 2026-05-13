import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const prisma    = new PrismaClient()

export interface AgentTool {
  name: string
  description: string
  input_schema: any
  handler: (input: any, ctx: AgentContext) => Promise<any>
}

export interface AgentContext {
  siteUrl:  string
  apiKey:   string
  siteId:   string
  siteName: string
  plugins:  string[]
  history:  any[]
  log:      (action: string, result: any) => void
}

export interface AgentConfig {
  enabled:    boolean
  schedule?:  string
  threshold?: number
  settings?:  Record<string, any>
}

export type AgentType = 'health' | 'seo' | 'content' | 'security' | 'plugin_updater' | 'woocommerce' | 'multisite_sync'

// ── Core bridge helper ────────────────────────────────────────
export async function bridgeCall(siteUrl: string, apiKey: string, endpoint: string, method = 'GET', body?: any) {
  const base = siteUrl.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, {
      method, headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    })
    return res.json()
  } catch (e: any) { return { success: false, error: e.message } }
}

// ── Main agent runner ─────────────────────────────────────────
export async function runAgent(
  agentType: AgentType,
  site: { id: string; url: string; apiKey: string; name: string | null },
  tools: AgentTool[],
  systemPrompt: string,
  triggeredBy: 'cron' | 'manual' | 'event' = 'cron',
): Promise<{ summary: string; actionsLog: any[]; success: boolean }> {

  const actionsLog: any[] = []
  const ctx: AgentContext = {
    siteUrl:  site.url,
    apiKey:   site.apiKey,
    siteId:   site.id,
    siteName: site.name || site.url,
    plugins:  [],
    history:  await getRecentRuns(site.id, agentType),
    log: (action, result) => actionsLog.push({ action, result, timestamp: new Date().toISOString() }),
  }

  // Create run record
  const run = await prisma.agentRun.create({
    data: { siteId: site.id, agentType, status: 'running', triggeredBy },
  })

  try {
    // Build Anthropic tool definitions
    const anthropicTools: Anthropic.Messages.Tool[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as any,
    }))

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: `Site: ${site.name || site.url} (${site.url})\nPrevious runs: ${ctx.history.length > 0 ? JSON.stringify(ctx.history.slice(-2)) : 'None'}\n\nAnalyse this site and take appropriate actions now.` },
    ]

    let finalText = ''
    let iterations = 0
    const MAX_ITER = 8

    // Agentic loop — Claude reasons, picks tools, we execute, loop until done
    while (iterations < MAX_ITER) {
      iterations++
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        tools: anthropicTools,
        messages,
      })

      // Collect text
      const textBlocks = response.content.filter(b => b.type === 'text')
      if (textBlocks.length > 0) finalText = (textBlocks[textBlocks.length - 1] as any).text

      // If Claude is done reasoning (no more tool calls), break
      if (response.stop_reason === 'end_turn') break

      // Find tool calls
      const toolUses = response.content.filter(b => b.type === 'tool_use') as Anthropic.Messages.ToolUseBlock[]
      if (toolUses.length === 0) break

      // Add assistant message
      messages.push({ role: 'assistant', content: response.content })

      // Execute each tool call
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
      for (const toolUse of toolUses) {
        const tool = tools.find(t => t.name === toolUse.name)
        let result: any = { error: `Unknown tool: ${toolUse.name}` }
        if (tool) {
          try {
            result = await tool.handler(toolUse.input, ctx)
            ctx.log(toolUse.name, { input: toolUse.input, result })
          } catch (e: any) {
            result = { error: e.message }
            ctx.log(toolUse.name, { input: toolUse.input, error: e.message })
          }
        }
        toolResults.push({
          type: 'tool_result', tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        })
      }

      messages.push({ role: 'user', content: toolResults })
    }

    const summary = finalText || `Agent completed ${actionsLog.length} actions`

    await prisma.agentRun.update({
      where: { id: run.id },
      data:  { status: 'completed', summary, actionsLog, completedAt: new Date() },
    })

    return { summary, actionsLog, success: true }

  } catch (e: any) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data:  { status: 'failed', summary: e.message, actionsLog, completedAt: new Date() },
    })
    return { summary: `Agent failed: ${e.message}`, actionsLog, success: false }
  }
}

async function getRecentRuns(siteId: string, agentType: string) {
  return prisma.agentRun.findMany({
    where: { siteId, agentType, status: 'completed' },
    orderBy: { startedAt: 'desc' }, take: 3,
    select: { summary: true, startedAt: true, actionsLog: true },
  })
}
