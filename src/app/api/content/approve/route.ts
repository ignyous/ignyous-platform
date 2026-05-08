import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { logActivity } from '@/lib/activityLogger'

const prisma = new PrismaClient()

// Helper: call ignyous bridge with method fallback
async function bridgeCall(siteUrl: string, apiKey: string, endpoint: string, body: any) {
  const base = siteUrl.replace(/\/$/, '')
  const headers: Record<string,string> = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  for (const method of ['POST', 'PUT', 'PATCH']) {
    try {
      const res = await fetch(`${base}/wp-json/ignyous/v1/${endpoint}`, { method, headers, body: JSON.stringify(body) })
      if (res.status === 404 || res.status === 405) continue
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, data }
    } catch {}
  }
  return { ok: false, data: {} }
}

// Helper: take a snapshot via bridge
async function takeSnapshot(siteUrl: string, apiKey: string, label: string) {
  try {
    const base = siteUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/wp-json/ignyous/v1/snapshot`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    return await res.json().catch(() => ({}))
  } catch { return {} }
}

// ── GET: email link approval ──────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token  = searchParams.get('token')
  const action = searchParams.get('action')

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })
  const post = await prisma.scheduledPost.findUnique({ where: { approvalToken: token } })
  if (!post) return NextResponse.json({ error: 'Post not found or already processed', status: 404 })

  if (action === 'approve') {
    // Try to publish to WordPress immediately
    let published = false
    let publishedUrl = ''
    let publishError = ''

    try {
      const site = await prisma.site.findFirst({ where: { id: post.siteId } }).catch(() => null)
      if (site?.apiKey && site?.url) {
        await takeSnapshot(site.url, site.apiKey, `Before publishing: "${post.title}"`)
        const { ok, data } = await bridgeCall(site.url, site.apiKey, 'posts', {
          title:    post.title,
          content:  post.content,
          excerpt:  post.excerpt || '',
          status:   'publish',
          featured_image_url: post.imageUrl || undefined,
        })
        if (ok && (data.success || data.id)) {
          published    = true
          publishedUrl = data.data?.post?.link || data.link || ''
        } else {
          publishError = data?.error || data?.message || 'Bridge call failed'
        }
      } else {
        publishError = 'Site or API key not found in database'
      }
    } catch (e: any) {
      publishError = e.message
    }

    // Update DB
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data:  {
        status:       published ? 'published' : 'approved',
        approvalToken: null,
        publishedAt:  published ? new Date() : undefined,
        publishedUrl: published ? publishedUrl : undefined,
      }
    })

    await logActivity({
      siteUrl:  post.siteId,
      category: 'content',
      action:   published ? 'publish_post' : 'approve_post',
      status:   published ? 'success' : 'pending',
      summary:  published
        ? `Post published via email approval: "${post.title}"`
        : `Post approved via email (publish pending): "${post.title}" — ${publishError}`,
      detail:   { postId: post.id, publishedUrl, publishError },
    }).catch(() => {})

    return new NextResponse(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Post ${published ? 'Published' : 'Approved'}</title>
<style>body{font-family:Arial,sans-serif;margin:0;background:${published?'#F0FAF5':'#EFF6FF'};min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:white;border-radius:16px;padding:48px;max-width:460px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.1)}
h2{color:${published?'#1E7B4B':'#1B5FA8'};margin:16px 0 8px}p{color:#666;line-height:1.6}
a{display:inline-block;margin-top:24px;background:#1a1a4e;color:white;padding:13px 32px;border-radius:9px;text-decoration:none;font-weight:bold;font-size:15px}
.url{background:#f5f5f5;padding:10px 14px;border-radius:8px;font-family:monospace;font-size:13px;word-break:break-all;margin-top:14px}
</style></head>
<body><div class="card">
  <div style="font-size:64px">${published ? '🚀' : '✅'}</div>
  <h2>${published ? 'Post Published!' : 'Post Approved!'}</h2>
  <p>${published
    ? `"${post.title}" is now live on your site.`
    : `"${post.title}" has been approved. It will be published on your next visit to the dashboard.`
  }</p>
  ${published && publishedUrl ? `<div class="url">${publishedUrl}</div><a href="${publishedUrl}" target="_blank">View Live Post ↗</a>` : ''}
  ${published && publishedUrl ? '' : `<a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/content">View in Dashboard</a>`}
  ${!published && publishError ? `<p style="color:#B91C1C;font-size:13px;margin-top:16px">Note: Auto-publish failed (${publishError}). Open the dashboard to publish manually.</p>` : ''}
</div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } })
  }

  if (action === 'reject') {
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'rejected', approvalToken: null } })
    return new NextResponse(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Post Rejected</title>
<style>body{font-family:Arial,sans-serif;margin:0;background:#FEF2F2;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:white;border-radius:16px;padding:48px;max-width:420px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.1)}
h2{color:#B91C1C}p{color:#666}a{display:inline-block;margin-top:24px;background:#1a1a4e;color:white;padding:13px 32px;border-radius:9px;text-decoration:none;font-weight:bold}
</style></head>
<body><div class="card">
  <div style="font-size:64px">❌</div>
  <h2>Post Rejected</h2>
  <p>"${post.title}" has been rejected and won't be published.</p>
  <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/content">Back to Dashboard</a>
</div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
          <a href="${process.env.NEXTAUTH_URL}/content" style="display:inline-block;margin-top:20px;background:#1a1a4e;color:white;padding:12px 28px;border-radius:8px;text-decoration:none">Back to Dashboard</a>
        </div>
      </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// ── POST: approve/reject/edit from dashboard ──────────────────────
export async function POST(req: NextRequest) {
  const { postId, action, title, content } = await req.json()

  if (action === 'edit') {
    const post = await prisma.scheduledPost.update({
      where: { id: postId },
      data:  { title: title ?? undefined, content: content ?? undefined },
    })
    return NextResponse.json({ success: true, post })
  }

  if (action === 'approve') {
    const post = await prisma.scheduledPost.findUnique({ where: { id: postId } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    // Try to publish to WordPress via bridge
    try {
      const site = await prisma.site.findFirst({ where: { id: post.siteId } }).catch(() => null)
      const siteUrl = site?.url || ''
      const apiKey  = site?.apiKey || ''

      if (siteUrl && apiKey) {
        // 1. Take snapshot BEFORE publishing
        await takeSnapshot(siteUrl, apiKey, `Before post: "${post.title}"`)

        // 2. Try to publish post via bridge
        const { ok, data } = await bridgeCall(siteUrl, apiKey, 'posts', {
          title:     post.title,
          content:   post.content,
          excerpt:   post.excerpt || '',
          status:    'publish',
          featured_image_url: post.imageUrl || undefined,
        })

        if (ok && (data.success || data.id)) {
          const publishedUrl = data.data?.post?.link || data.link || ''
          await prisma.scheduledPost.update({
            where: { id: postId },
            data:  { status: 'published', publishedUrl, publishedAt: new Date(), approvalToken: null }
          })
          await logActivity({
          siteUrl:  siteUrl, category: 'content', action: 'publish_post', status: 'success',
          summary:  `Published post to WordPress: "${post.title}"`,
          detail:   { postId, publishedUrl, title: post.title },
        }).catch(() => {})
        return NextResponse.json({ success: true, published: true, url: publishedUrl })
        }

        // Bridge call failed — log the error but mark as approved so user knows
        console.error('[approve] WP publish failed:', data)
        await prisma.scheduledPost.update({ where: { id: postId }, data: { status: 'approved', approvalToken: null } })
        await logActivity({
          siteUrl: siteUrl, category: 'content', action: 'publish_post', status: 'failed',
          summary: `Post approved but WP publish failed: "${post.title}"`,
          detail:  { postId, title: post.title },
        }).catch(() => {})
        return NextResponse.json({
          success: true,
          published: false,
          warning: `Post approved but could not auto-publish to WordPress: ${data?.message || 'bridge endpoint not found'}. Please publish manually from WP Admin.`
        })
      }
    } catch (e: any) {
      console.error('[approve] Exception:', e)
    }

    // No site found — just mark approved
    await prisma.scheduledPost.update({ where: { id: postId }, data: { status: 'approved', approvalToken: null } })
    return NextResponse.json({ success: true, published: false })
  }

  if (action === 'reject') {
    await prisma.scheduledPost.update({ where: { id: postId }, data: { status: 'rejected', approvalToken: null } })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
