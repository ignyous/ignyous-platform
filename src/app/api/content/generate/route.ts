import { NextRequest, NextResponse } from 'next/server'
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
- Content: 400-600 words, well-structured with headings
- Include a clear call-to-action at the end
- Write in Gutenberg block format

Return as JSON only:
{
  "title": "...",
  "excerpt": "...(2 sentences max)",
  "content": "...(full Gutenberg HTML blocks)",
  "suggestedImageQuery": "...(3-4 words for stock photo search)",
  "tags": ["tag1","tag2","tag3"],
  "seoTitle": "...",
  "seoDescription": "..."
}`
      }]
    })

    const raw  = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = raw.replace(/```json|```/g, '').trim()
    const post  = JSON.parse(clean)

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
      } else {
        const approveUrl = `${process.env.NEXTAUTH_URL}/api/content/approve?token=${approvalToken}&action=approve`
        const rejectUrl  = `${process.env.NEXTAUTH_URL}/api/content/approve?token=${approvalToken}&action=reject`

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'ignyous AI <noreply@ignyous.ai>',
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
