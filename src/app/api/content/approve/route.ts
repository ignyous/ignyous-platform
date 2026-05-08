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
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  if (action === 'approve') {
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'approved', approvalToken: null } })
    return new NextResponse(`
      <html><body style="font-family:Arial;text-align:center;padding:60px;background:#F0FAF5">
        <div style="max-width:400px;margin:0 auto">
          <div style="font-size:60px;margin-bottom:16px">✅</div>
          <h2 style="color:#1E7B4B">Post Approved!</h2>
          <p style="color:#666">"${post.title}" is now scheduled to publish.</p>
          <a href="${process.env.NEXTAUTH_URL}/content" style="display:inline-block;margin-top:20px;background:#1a1a4e;color:white;padding:12px 28px;border-radius:8px;text-decoration:none">View in Dashboard</a>
        </div>
      </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  if (action === 'reject') {
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'rejected', approvalToken: null } })
    return new NextResponse(`
      <html><body style="font-family:Arial;text-align:center;padding:60px;background:#FEF2F2">
        <div style="max-width:400px;margin:0 auto">
          <div style="font-size:60px;margin-bottom:16px">❌</div>
          <h2 style="color:#B91C1C">Post Rejected</h2>
          <p style="color:#666">"${post.title}" has been rejected.</p>
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
