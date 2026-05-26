// src/app/api/baseline/intent/route.ts
//
// POST { text } → { source: 'regex'|'ai'|'none', action?, hint?, aiTokens?, cached? }
// Pure parse step — does NOT call the bridge. Tries regex first; on 'none', falls back to AI (Haiku 4.5).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { parseIntent } from '@/lib/baseline/intent'
import { aiParseIntent } from '@/lib/baseline/ai'

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await req.json()
  if (typeof text !== 'string') return NextResponse.json({ error: 'text required' }, { status: 400 })

  // 1) Regex first (free, fast, deterministic)
  const regex = parseIntent(text)
  if (regex.source === 'regex' && regex.action) {
    return NextResponse.json({ ...regex, aiTokens: 0 })
  }

  // 2) AI fallback (Haiku 4.5) — only when regex misses
  const ai = await aiParseIntent(text)
  if (ai.action) {
    return NextResponse.json({
      source:    'ai',
      action:    ai.action,
      aiTokens:  ai.aiTokens,
      cached:    !!ai.cached,
      hint:      regex.hint,
    })
  }

  // 3) Still nothing — return both hints so the user understands why
  return NextResponse.json({
    source:    'none',
    hint:      ai.hint || regex.hint || 'no_match',
    aiTokens:  ai.aiTokens,
    raw:       ai.raw,
  })
}
