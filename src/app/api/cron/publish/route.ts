import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { logActivity } from '@/lib/activityLogger'
import Anthropic from '@anthropic-ai/sdk'

const prisma    = new PrismaClient()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function bridgeCall(siteUrl: string, apiKey: string, body: any) {
  const base    = siteUrl.replace(/\/$/, '')
  const headers: Record<string,string> = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  for (const method of ['POST', 'PUT', 'PATCH']) {
    try {
      const r = await fetch(`${base}/wp-json/ignyous/v1/posts`, { method, headers, body: JSON.stringify(body) })
      if (r.status === 404 || r.status === 405) continue
      const d = await r.json().catch(() => ({}))
      return { ok: r.ok, data: d }
    } catch {}
  }
  return { ok: false, data: { error: 'All bridge methods failed' } }
}

async function generateNextPost(siteId: string, userId: string, topics: string[], frequency: string, siteName: string) {
  const topicsList = topics.join(', ') || 'general business topics'
  const response   = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: `Write a professional WordPress blog post for "${siteName}".
Topics: ${topicsList}
Requirements: Title under 70 chars, 400-600 words, h2 headings, call-to-action at end, clean HTML only.
Return ONLY:
<POST>
<TITLE>title</TITLE>
<EXCERPT>1-2 sentence excerpt</EXCERPT>
<CONTENT>html content</CONTENT>
</POST>` }]
  })
  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const get = (tag: string) => { const m = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].trim() : '' }

  const scheduledFor = (() => {
    const d = new Date()
    if (frequency === 'daily')   { d.setDate(d.getDate() + 1);   d.setHours(9,0,0,0); return d }
    if (frequency === 'weekly')  { d.setDate(d.getDate() + 7);   d.setHours(9,0,0,0); return d }
    if (frequency === 'monthly') { d.setMonth(d.getMonth() + 1); d.setDate(1); d.setHours(9,0,0,0); return d }
    return d
  })()

  return prisma.scheduledPost.create({
    data: { siteId, userId, title: get('TITLE') || topicsList, content: get('CONTENT') || '', excerpt: get('EXCERPT') || '', topics, frequency, status: 'scheduled', scheduledFor }
  })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let published = 0, failed = 0, generated = 0

  const due = await prisma.scheduledPost.findMany({
    where: { status: 'scheduled', scheduledFor: { lte: now } },
  })

  for (const post of due) {
    const site = await prisma.site.findFirst({ where: { url: post.siteId } })
    if (!site?.apiKey || !site?.url) { failed++; continue }

    const { ok, data } = await bridgeCall(site.url, site.apiKey, {
      title: post.title, content: post.content, excerpt: post.excerpt || '',
      status: 'publish', featured_image_url: post.imageUrl || undefined,
    })

    if (ok && (data.success || data.id)) {
      const publishedUrl = data.data?.post?.link || data.link || ''
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'published', publishedAt: now, publishedUrl } })
      await logActivity({ siteUrl: site.url, category: 'content', action: 'publish_post', status: 'success', summary: `[Cron] Published "${post.title}"`, detail: { postId: post.id, publishedUrl } }).catch(() => {})
      published++

      if (post.frequency !== 'once') {
        try { await generateNextPost(post.siteId, post.userId, post.topics as string[], post.frequency, site.name || site.url); generated++ }
        catch (e: any) { console.warn('[cron] Next post generation failed:', e.message) }
      }
    } else {
      failed++
      await logActivity({ siteUrl: site.url, category: 'content', action: 'publish_post', status: 'failed', summary: `[Cron] Failed to publish "${post.title}"`, detail: { postId: post.id, error: data?.error } }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, checked: due.length, published, failed, generated })
}
