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

// Approve/reject from dashboard
export async function POST(req: NextRequest) {
  const { postId, action } = await req.json()
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'scheduled'
  const post = await prisma.scheduledPost.update({
    where: { id: postId },
    data:  { status, approvalToken: null }
  })
  return NextResponse.json({ success: true, post })
}
