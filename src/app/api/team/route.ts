import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()

// GET — list team members for a site
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const siteId = new URL(req.url).searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })
  const members = await prisma.teamMember.findMany({ where: { siteId }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ members })
}

// POST — invite a team member
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { siteId, email, role = 'editor' } = await req.json()
  const inviter = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!inviter) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const site = await prisma.site.findFirst({ where: { id: siteId, userId: inviter.id } })
  if (!site) return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 403 })

  const inviteToken = randomBytes(24).toString('hex')

  const member = await prisma.teamMember.upsert({
    where: { siteId_email: { siteId, email } },
    update: { role, status: 'pending', inviteToken },
    create: { siteId, email, role, invitedBy: inviter.id, inviteToken },
  })

  // Send invite email via Resend
  if (process.env.RESEND_API_KEY) {
    const inviteUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/team/accept?token=${inviteToken}`
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'ignyous <team@ignyous.ai>',
        to: [email],
        subject: `${inviter.name || inviter.email} invited you to manage ${site.name || site.url}`,
        html: `<p>You've been invited as a <strong>${role}</strong> on <strong>${site.name || site.url}</strong>.</p>
<p><a href="${inviteUrl}" style="background:#f3af00;color:#1a1a4e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Accept Invitation →</a></p>
<p style="color:#999;font-size:12px">This link expires in 7 days.</p>`,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, member, inviteToken })
}

// PATCH — update role or remove member
export async function PATCH(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { memberId, role, remove } = await req.json()
  if (remove) {
    await prisma.teamMember.delete({ where: { id: memberId } })
    return NextResponse.json({ success: true })
  }
  const member = await prisma.teamMember.update({ where: { id: memberId }, data: { role } })
  return NextResponse.json({ success: true, member })
}
