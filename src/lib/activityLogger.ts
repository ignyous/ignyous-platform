import { PrismaClient } from '@prisma/client'

// Use a singleton to avoid connection pool exhaustion
const globalForPrisma = globalThis as unknown as { prismaLogger: PrismaClient }
const prisma = globalForPrisma.prismaLogger ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaLogger = prisma

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
        summary:    event.summary.slice(0, 500),   // cap length
        detail:     event.detail    ?? undefined,
        ipAddress:  event.ipAddress ?? null,
        userAgent:  event.userAgent ?? null,
        durationMs: event.durationMs ?? null,
      }
    })
  } catch (err: any) {
    // Table might not exist yet — log to console but never crash caller
    if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
      console.warn('[activity-log] ActivityLog table missing — run: npx prisma db push')
    } else {
      console.error('[activity-log] Failed to write:', err?.message ?? err)
    }
  }
}

export async function getActivityLogs(opts: {
  limit?:    number
  offset?:   number
  siteUrl?:  string
  category?: string
  userId?:   string
}) {
  try {
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
  } catch (err: any) {
    if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
      console.warn('[activity-log] ActivityLog table missing — run: npx prisma db push')
    }
    return { logs: [], total: 0 }
  }
}
