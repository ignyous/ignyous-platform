import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { logActivity } from '@/lib/activityLogger'
import { getServerSession } from 'next-auth'

const prisma = new PrismaClient()

async function bridgeCall(siteUrl: string, apiKey: string, body: any) {
  const base    = siteUrl.replace(/\/$/, '')
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  for (const method of ['POST', 'PUT', 'PATCH']) {
    try {
      const res = await fetch(`${base}/wp-json/ignyous/v1/posts`, { method, headers, body: JSON.stringify(body) })
      if (res.status === 404 || res.status === 405) continue
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, data }
    } catch {}
  }
  return { ok: false, data: { error: 'All bridge methods failed' } }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { postId } = await req.json()
    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

    // Load post + site credentials
    const post = await prisma.scheduledPost.findUnique({ where: { id: postId } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    if (post.status === 'published') {
      return NextResponse.json({ error: 'Already published', publishedUrl: post.publishedUrl }, { status: 400 })
    }

    const site = await prisma.site.findFirst({ where: { url: post.siteId } })
    if (!site?.apiKey || !site?.url) {
      return NextResponse.json({ error: 'Site credentials not found — reconnect the site' }, { status: 400 })
    }

    // Push to WordPress via bridge
    const { ok, data } = await bridgeCall(site.url, site.apiKey, {
      title:              post.title,
      content:            post.content,
      excerpt:            post.excerpt || '',
      status:             'publish',
      featured_image_url: post.imageUrl || undefined,
      seo_title:          (post as any).seoTitle       || post.title,
      seo_description:    (post as any).seoDescription || post.excerpt || '',
    })

    if (!ok) {
      const errMsg = data?.error || data?.message || 'Bridge call failed'
      await logActivity({
        siteUrl: site.url, category: 'content', action: 'publish_post', status: 'failed',
        summary: `Failed to publish "${post.title}": ${errMsg}`,
        detail:  { postId, error: errMsg, bridgeResponse: data },
      }).catch(() => {})
      return NextResponse.json({ error: errMsg, bridgeResponse: data }, { status: 502 })
    }

    const publishedUrl = data.data?.post?.link || data.link || ''

    await prisma.scheduledPost.update({
      where: { id: postId },
      data:  { status: 'published', publishedAt: new Date(), publishedUrl, approvalToken: null },
    })

    await logActivity({
      siteUrl: site.url, category: 'content', action: 'publish_post', status: 'success',
      summary: `Published "${post.title}" to ${site.url}`,
      detail:  { postId, publishedUrl },
    }).catch(() => {})

    return NextResponse.json({ success: true, publishedUrl })
  } catch (err: any) {
    console.error('[content/publish]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
