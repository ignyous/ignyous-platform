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

    const { postId, siteUrl: fallbackSiteUrl, apiKey: fallbackApiKey } = await req.json()
    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

    const post = await prisma.scheduledPost.findUnique({ where: { id: postId } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    if (post.status === 'published') {
      return NextResponse.json({ error: 'Already published', publishedUrl: post.publishedUrl }, { status: 400 })
    }

    // Try DB lookup with trailing-slash tolerance, fall back to request-supplied creds
    const site = await prisma.site.findFirst({
      where: { OR: [{ url: post.siteId }, { url: (post.siteId||'').replace(/\/$/, '') }, { url: (post.siteId||'') + '/' }] }
    }).catch(() => null)
    const resolvedUrl    = site?.url    || fallbackSiteUrl || ''
    const resolvedApiKey = site?.apiKey || fallbackApiKey  || ''
    if (!resolvedUrl || !resolvedApiKey) {
      return NextResponse.json({ error: 'Site credentials not found — reconnect the site' }, { status: 400 })
    }
    // Build a site-like object for the rest of the function
    const siteResolved = { url: resolvedUrl, apiKey: resolvedApiKey }

    // Snapshot before publishing
    try {
      const base = siteResolved.url.replace(/\/$/, '')
      await fetch(`${base}/wp-json/ignyous/v1/snapshot`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${siteResolved.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: `Before post: "${post.title}"` }),
      })
    } catch {}

    // Push to WordPress via bridge
    const { ok, data } = await bridgeCall(siteResolved.url, siteResolved.apiKey, {
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
        siteUrl: siteResolved.url, category: 'content', action: 'publish_post', status: 'failed',
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
      siteUrl: siteResolved.url, category: 'content', action: 'publish_post', status: 'success',
      summary: `Published "${post.title}" to ${siteResolved.url}`,
      detail:  { postId, publishedUrl },
    }).catch(() => {})

    return NextResponse.json({ success: true, publishedUrl })
  } catch (err: any) {
    console.error('[content/publish]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
