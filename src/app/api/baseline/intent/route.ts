// src/app/api/baseline/intent/route.ts
//
// POST { text } → { source, action?, hint? }
// Pure parse step — does NOT call the bridge. The UI calls this to preview the action
// before the user confirms.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { parseIntent } from '@/lib/baseline/intent'

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { text } = await req.json()
  if (typeof text !== 'string') return NextResponse.json({ error: 'text required' }, { status: 400 })
  return NextResponse.json(parseIntent(text))
}
