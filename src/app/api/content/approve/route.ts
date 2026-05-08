import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token  = searchParams.get('token')
  const action = searchParams.get('action') // approve | reject

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const post = await prisma.scheduledPost.findUnique({ where: { approvalToken: token } })
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  if (action === 'approve') {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data:  { status: 'approved', approvalToken: null }
    })
    return new NextResponse(`
      <html><body style="font-family:Arial;text-align:center;padding:60px;background:#F0FAF5">
        <div style="max-width:400px;margin:0 auto">
          <div style="font-size:60px;margin-bottom:16px">✅</div>
          <h2 style="color:#1E7B4B">Post Approved!</h2>
          <p style="color:#666">"${post.title}" is now scheduled to publish.</p>
          <a href="${process.env.NEXTAUTH_URL}/content" style="display:inline-block;margin-top:20px;background:#E8651A;color:white;padding:12px 28px;border-radius:8px;text-decoration:none">View in Dashboard</a>
        </div>
      </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  if (action === 'reject') {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data:  { status: 'rejected', approvalToken: null }
    })
    return new NextResponse(`
      <html><body style="font-family:Arial;text-align:center;padding:60px;background:#FEF2F2">
        <div style="max-width:400px;margin:0 auto">
          <div style="font-size:60px;margin-bottom:16px">❌</div>
          <h2 style="color:#B91C1C">Post Rejected</h2>
          <p style="color:#666">"${post.title}" has been rejected and won't be published.</p>
          <a href="${process.env.NEXTAUTH_URL}/content" style="display:inline-block;margin-top:20px;background:#E8651A;color:white;padding:12px 28px;border-radius:8px;text-decoration:none">Back to Dashboard</a>
        </div>
      </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// Approve/reject/edit from dashboard
export async function POST(req: NextRequest) {
  const { postId, action, title, content } = await req.json()

  if (action === 'edit') {
    const post = await prisma.scheduledPost.update({
      where: { id: postId },
      data:  { title: title ?? undefined, content: content ?? undefined },
    })
    return NextResponse.json({ success: true, post })
  }

  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'scheduled'
  
  // If approving, publish to WordPress
  if (action === 'approve') {
    const post = await prisma.scheduledPost.findUnique({ where: { id: postId } })
    if (post && post.siteId) {
      try {
        // Fetch stored API key
        const site = await prisma.site.findFirst({ where: { id: post.siteId } }).catch(() => null)
        if (site?.apiKey) {
          const wpRes = await fetch(`${site.url.replace(/\/$/, '')}/wp-json/ignyous/v1/posts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${site.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: post.title, content: post.content, excerpt: post.excerpt,
              status: 'publish', featured_image_url: post.imageUrl || undefined,
            })
          })
          const wpData = await wpRes.json().catch(() => ({}))
          if (wpData.success && wpData.data?.post?.link) {
            await prisma.scheduledPost.update({ where: { id: postId }, data: { status: 'published', publishedUrl: wpData.data.post.link, approvalToken: null } })
            return NextResponse.json({ success: true, published: true, url: wpData.data.post.link })
          }
        }
      } catch (_e) { /* fall through to just mark approved */ }
    }
  }

  const post = await prisma.scheduledPost.update({
    where: { id: postId },
    data:  { status, approvalToken: null }
  })
  return NextResponse.json({ success: true, post })
}
