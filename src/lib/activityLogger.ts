import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface LogEvent {
  userId?:    string
  siteUrl?:   string
  siteName?:  string
  category:   'ai_action' | 'content' | 'snapshot' | 'plugin' | 'page' | 'settings' | 'auth' | 'system'
  action:     string
  status?:    'success' | 'failed' | 'pending'
  summary:    string
  detail?:    Record<string, any>
  ipAddress?: string
  userAgent?: string
  durationMs?: number
}

export async function logActivity(event: LogEvent): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId:     event.userId    ?? null,
        siteUrl:    event.siteUrl   ?? null,
        siteName:   event.siteName  ?? null,
        category:   event.category,
        action:     event.action,
        status:     event.status    ?? 'success',
        summary:    event.summary,
        detail:     event.detail    ?? undefined,
        ipAddress:  event.ipAddress ?? null,
        userAgent:  event.userAgent ?? null,
        durationMs: event.durationMs ?? null,
      }
    })
  } catch (err) {
    // Never let logging crash the main request
    console.error('[activity-log] Failed to write:', err)
  }
}

export async function getActivityLogs(opts: {
  limit?:    number
  offset?:   number
  siteUrl?:  string
  category?: string
  userId?:   string
}) {
  const where: any = {}
  if (opts.siteUrl)  where.siteUrl  = { contains: opts.siteUrl }
  if (opts.category) where.category = opts.category
  if (opts.userId)   where.userId   = opts.userId

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    opts.limit  ?? 100,
      skip:    opts.offset ?? 0,
    }),
    prisma.activityLog.count({ where }),
  ])
  return { logs, total }
}
