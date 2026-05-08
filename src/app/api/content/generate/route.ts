import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/activityLogger'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const prisma    = new PrismaClient()

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { siteId, siteUrl, siteName, topics, tone, includeImage, frequency, requireApproval, adminEmail } = await req.json()

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Generate post content with AI
    const topicsList = Array.isArray(topics) ? topics.join(', ') : topics || 'general business topics'

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Write a professional WordPress blog post for "${siteName}".

Topics/Tags: ${topicsList}
Tone: ${tone || 'professional and friendly'}
Site: ${siteUrl}

Requirements:
- Title: Compelling, SEO-friendly (under 70 chars)
- Content: 400-600 words, well-structured with h2 headings and paragraphs
- Include a clear call-to-action at the end
- Write content as clean HTML (p, h2, h3, ul, li tags only)
- No backticks, no JSON, no code blocks in the content

Return ONLY this exact format:
<POST>
<TITLE>your title here</TITLE>
<EXCERPT>your excerpt here (1-2 sentences)</EXCERPT>
<CONTENT>your html content here</CONTENT>
<IMAGE_QUERY>3-4 word stock photo search query</IMAGE_QUERY>
<TAGS>tag1,tag2,tag3</TAGS>
<SEO_TITLE>seo title here</SEO_TITLE>
<SEO_DESC>meta description here</SEO_DESC>
</POST>`
      }]
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse XML-style response — avoids all JSON escaping issues with HTML content
    function extractTag(tag: string): string {
      const m = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`))
      return m ? m[1].trim() : ''
    }

    const post = {
      title:               extractTag('TITLE')       || topicsList + ' — Tips & Insights',
      excerpt:             extractTag('EXCERPT')     || '',
      content:             extractTag('CONTENT')     || `<p>An article about ${topicsList}.</p>`,
      suggestedImageQuery: extractTag('IMAGE_QUERY') || topicsList,
      tags:                extractTag('TAGS').split(',').map((t: string) => t.trim()).filter(Boolean),
      seoTitle:            extractTag('SEO_TITLE')   || '',
      seoDescription:      extractTag('SEO_DESC')    || '',
    }

    if (!post.title || !post.content) throw new Error('AI response missing required fields: ' + raw.slice(0, 200))

    // Fetch image from Unsplash if requested
    let imageUrl = null, imageAlt = null
    if (includeImage && process.env.UNSPLASH_ACCESS_KEY) {
      const query = encodeURIComponent(post.suggestedImageQuery || topicsList)
      const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`, {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
      })
      const imgData = await imgRes.json()
      if (imgData.results?.[0]) {
        imageUrl = imgData.results[0].urls.regular
        imageAlt = imgData.results[0].alt_description || post.suggestedImageQuery
      }
    }

    // Generate approval token
    const approvalToken = Math.random().toString(36).slice(2) + Date.now().toString(36)

    // Save to DB
    const scheduled = await prisma.scheduledPost.create({
      data: {
        siteId,
        userId:       user.id,
        title:        post.title,
        content:      post.content,
        excerpt:      post.excerpt,
        topics:       Array.isArray(topics) ? topics : [topics],
        imageUrl,
        imageAlt,
        status:       requireApproval ? 'pending_approval' : 'scheduled',
        approvalToken: requireApproval ? approvalToken : null,
        frequency:    frequency || 'once',
        scheduledFor: (() => {
          const now = new Date()
          if (frequency === 'once') { now.setMinutes(now.getMinutes() + 5); return now }
          if (frequency === 'daily') { now.setDate(now.getDate() + 1); now.setHours(9,0,0,0); return now }
          if (frequency === 'weekly') { now.setDate(now.getDate() + 7); now.setHours(9,0,0,0); return now }
          if (frequency === 'monthly') { now.setMonth(now.getMonth() + 1); now.setDate(1); now.setHours(9,0,0,0); return now }
          return now
        })(),
      }
    })

    // Send approval email if required
    if (requireApproval && adminEmail) {
      if (!process.env.RESEND_API_KEY) {
        console.warn('[content/generate] RESEND_API_KEY not set — skipping email')
        await logActivity({ siteUrl, category: 'content', action: 'email_skipped', status: 'failed',
          summary: 'Approval email NOT sent — RESEND_API_KEY missing in Vercel env vars',
          detail: { adminEmail, fix: 'Add RESEND_API_KEY to Vercel → Settings → Environment Variables' }
        }).catch(() => {})
      } else {
        // Use production URL — never localhost
        const baseUrl = (process.env.NEXTAUTH_URL || '').includes('localhost')
          ? 'https://ignyous.ai'
          : (process.env.NEXTAUTH_URL || 'https://ignyous.ai')
        const approveUrl = `${baseUrl}/api/content/approve?token=${approvalToken}&action=approve`
        const rejectUrl  = `${baseUrl}/api/content/approve?token=${approvalToken}&action=reject`

        console.log('[email] Sending approval email to:', adminEmail, 'via Resend')
        console.log('[email] NEXTAUTH_URL:', process.env.NEXTAUTH_URL, '→ using baseUrl:', baseUrl)

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'ignyous AI <onboarding@resend.dev>',
            to:      adminEmail,
            subject: `[ignyous] Approve post: "${post.title}"`,
            html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <img src="${process.env.NEXTAUTH_URL}/logo.png" alt="ignyous.ai" style="height:32px;margin-bottom:20px"/>
  <h2>New post ready for approval</h2>
  <h3 style="color:#1a1a4e">${post.title}</h3>
  <p style="color:#666">${post.excerpt}</p>
  ${imageUrl ? `<img src="${imageUrl}" alt="${imageAlt}" style="width:100%;border-radius:8px;margin:16px 0"/>` : ''}
  <div style="margin:24px 0;display:flex;gap:12px">
    <a href="${approveUrl}" style="background:#1E7B4B;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">✓ Approve &amp; Schedule</a>
    <a href="${rejectUrl}"  style="background:#B91C1C;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">✗ Reject</a>
  </div>
  <p style="color:#999;font-size:12px">Or approve from your <a href="${process.env.NEXTAUTH_URL}/content">ignyous dashboard</a></p>
</div>`
          })
        })
      }
    }

    await logActivity({
      userId:   session?.user?.email ?? undefined,
      siteUrl:  siteUrl,
      category: 'content',
      action:   'generate_post',
      status:   'success',
      summary:  `Generated post: "${post.title}" (${frequency}, ${requireApproval ? 'needs approval' : 'auto-approved'})`,
      detail:   { title: post.title, frequency, topics, requireApproval, scheduledFor: scheduled.scheduledFor },
    }).catch(() => {})
    return NextResponse.json({ success: true, post: { ...scheduled, generatedContent: post } })
  } catch (err: any) {
    console.error('[content/generate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user  = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user)  return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const posts = await prisma.scheduledPost.findMany({
    where:   { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take:    50,
  })

  return NextResponse.json({ posts })
}
