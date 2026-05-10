import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'

const prisma = new PrismaClient()

// GET — fetch all integration settings
export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  return NextResponse.json({
    gaPropertyId:  user?.gaPropertyId || null,
    socialTokens:  user?.socialTokens || {},
    reportEmail:   user?.reportEmail  || null,
    reportEnabled: user?.reportEnabled || false,
    wlCompanyName: user?.wlCompanyName || null,
    wlLogoUrl:     user?.wlLogoUrl    || null,
    wlPrimaryColor:user?.wlPrimaryColor|| null,
  })
}

// PATCH — save integration settings
export async function PATCH(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const data: any = {}
  if (body.gaPropertyId   !== undefined) data.gaPropertyId    = body.gaPropertyId
  if (body.socialTokens   !== undefined) data.socialTokens    = body.socialTokens
  if (body.reportEmail    !== undefined) data.reportEmail     = body.reportEmail
  if (body.reportEnabled  !== undefined) data.reportEnabled   = body.reportEnabled
  if (body.wlCompanyName  !== undefined) data.wlCompanyName   = body.wlCompanyName
  if (body.wlLogoUrl      !== undefined) data.wlLogoUrl       = body.wlLogoUrl
  if (body.wlPrimaryColor !== undefined) data.wlPrimaryColor  = body.wlPrimaryColor
  // pass-through for dashboardMode, name, phone
  if (body.dashboardMode  !== undefined) data.dashboardMode   = body.dashboardMode
  if (body.name           !== undefined) data.name            = body.name
  if (body.phone          !== undefined) data.phone           = body.phone?.replace(/[^\d+]/g, '')

  const user = await prisma.user.update({ where: { email: session.user.email }, data })
  return NextResponse.json({ success: true })
}

// POST — trigger image optimization for a site via bridge
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, siteUrl, apiKey } = await req.json()

  if (action === 'optimize_images') {
    // Tell WordPress bridge to run image optimization
    // This requires the site to have an image optimization plugin, or we use the WP REST API
    const base = siteUrl.replace(/\/$/, '')
    try {
      const res  = await fetch(`${base}/wp-json/ignyous/v1/optimize-images`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality: 80 }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      return NextResponse.json({ success: res.ok, data })
    } catch (e: any) {
      // Bridge doesn't have this endpoint yet — recommend plugin
      return NextResponse.json({
        success: false,
        message: 'Image optimization requires the Imagify or ShortPixel plugin. Install one and this will automatically use it.',
      })
    }
  }

  if (action === 'post_to_social') {
    const { content, imageUrl, platforms } = await req.json()
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    const tokens = (user?.socialTokens as any) || {}
    const results: Record<string, any> = {}

    // Twitter/X
    if (platforms.includes('twitter') && tokens.twitter) {
      try {
        const r = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${tokens.twitter}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: content.slice(0, 280) }),
        })
        results.twitter = { ok: r.ok, status: r.status }
      } catch (e: any) { results.twitter = { ok: false, error: e.message } }
    }

    // Facebook
    if (platforms.includes('facebook') && tokens.facebook_page_id && tokens.facebook) {
      try {
        const r = await fetch(`https://graph.facebook.com/v19.0/${tokens.facebook_page_id}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, access_token: tokens.facebook }),
        })
        results.facebook = { ok: r.ok, status: r.status }
      } catch (e: any) { results.facebook = { ok: false, error: e.message } }
    }

    return NextResponse.json({ success: true, results })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
