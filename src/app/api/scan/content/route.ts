import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { bridgeCall } from '@/lib/siteProfile'

// POST: scan for content or replace content
export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { action, siteUrl, apiKey, query, pattern, find, replace, scope, targets } = await req.json()

  if (!siteUrl || !apiKey) {
    return NextResponse.json({ error: 'siteUrl and apiKey required' }, { status: 400 })
  }

  const cleanUrl = siteUrl.replace(/\/$/, '')

  // ── Scan action ────────────────────────────────────────────
  if (action === 'scan' || !action) {
    const result = await bridgeCall(cleanUrl, apiKey, 'scan/content', 'POST', {
      query: query || '',
      pattern: pattern || '',
      scope: scope || 'all',
    })

    if (!result || !result.success) {
      return NextResponse.json({
        success: false,
        error: 'Scanner not available. Make sure the Ignyous AI bridge plugin is updated.',
      })
    }

    return NextResponse.json(result)
  }

  // ── Replace action ─────────────────────────────────────────
  if (action === 'replace') {
    if (!find) {
      return NextResponse.json({ error: 'find text required' }, { status: 400 })
    }

    const result = await bridgeCall(cleanUrl, apiKey, 'scan/replace', 'POST', {
      find,
      replace: replace || '',
      scope: scope || 'all',
      targets: targets || [],
    })

    if (!result || !result.success) {
      return NextResponse.json({
        success: false,
        error: 'Replace failed. Check bridge plugin.',
      })
    }

    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Unknown action. Use scan or replace.' }, { status: 400 })
}
