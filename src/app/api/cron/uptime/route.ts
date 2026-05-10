import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function pingSite(url: string) {
  const start = Date.now()
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000), redirect: 'follow' })
    const latencyMs = Date.now() - start
    return { status: (res.ok ? (latencyMs > 3000 ? 'degraded' : 'up') : 'down') as 'up'|'down'|'degraded', latencyMs, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (e: any) {
    return { status: 'down' as const, latencyMs: Date.now() - start, error: e.message }
  }
}

async function sendDownAlert(siteUrl: string, phone: string | null, email: string | null, error: string) {
  // SMS via Twilio
  if (phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER || '', To: phone, Body: `🚨 ignyous Alert: ${siteUrl} appears to be DOWN. Error: ${error}` }),
      })
    } catch {}
  }

  // Email via Resend
  if (email && process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'ignyous <alerts@ignyous.ai>',
          to: [email],
          subject: `🚨 Site Down: ${siteUrl}`,
          html: `<p>Your site <strong>${siteUrl}</strong> is currently <strong style="color:red">DOWN</strong>.</p><p>Error: ${error}</p><p>We'll alert you again when it comes back up.</p>`,
        }),
      })
    } catch {}
  }
}

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sites = await prisma.site.findMany({
    include: {
      user:      { select: { phone: true, email: true } },
      uptimeLogs: { orderBy: { checkedAt: 'desc' }, take: 2 },
    },
  })

  let checked = 0, alerted = 0
  for (const site of sites) {
    const result = await pingSite(site.url)
    await prisma.uptimeLog.create({ data: { siteId: site.id, ...result } })
    checked++

    // Alert if this check is down AND the previous was also down (avoid flap alerts)
    const prevStatus = site.uptimeLogs[0]?.status
    const wasUp = !prevStatus || prevStatus === 'up' || prevStatus === 'degraded'
    if (result.status === 'down' && wasUp) {
      await sendDownAlert(site.url, site.user.phone, site.user.email, result.error || 'No response')
      alerted++
    }

    // Alert recovery
    if ((result.status === 'up') && prevStatus === 'down') {
      if (site.user.phone && process.env.TWILIO_ACCOUNT_SID) {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER || '', To: site.user.phone, Body: `✅ ignyous: ${site.url} is back ONLINE. Latency: ${result.latencyMs}ms` }),
        }).catch(() => {})
      }
    }

    // Prune old logs (keep 30 days)
    await prisma.uptimeLog.deleteMany({ where: { siteId: site.id, checkedAt: { lt: new Date(Date.now() - 30 * 86400000) } } })
  }

  return NextResponse.json({ ok: true, checked, alerted })
}
