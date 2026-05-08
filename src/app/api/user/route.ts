import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'

const prisma = new PrismaClient()

// GET — get user profile
export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  return NextResponse.json({ user: { id: user?.id, name: user?.name, email: user?.email, phone: user?.phone, image: user?.image } })
}

// PATCH — update user profile (phone, name)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const { phone, name } = await req.json()
  const data: any = {}
  if (phone !== undefined) data.phone = phone.replace(/[^\d+]/g, '')
  if (name !== undefined)  data.name = name

  const user = await prisma.user.update({
    where: { email: session.user.email },
    data,
  })

  return NextResponse.json({ success: true, user: { id: user.id, name: user.name, phone: user.phone } })
}
