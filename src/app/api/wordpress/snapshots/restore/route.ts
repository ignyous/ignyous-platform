import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

function cleanUrl(u: string) { return u.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') }

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { siteUrl, apiKey, snapshotId } = await req.json()
  const res = await fetch(`${cleanUrl(siteUrl)}/wp-json/ignyous/v1/snapshots/${snapshotId}/restore`, {
    method: 'POST',
    headers: { 'X-Ignyous-Key': apiKey, 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
    signal: AbortSignal.timeout(20000),
  })
  return NextResponse.json(await res.json().catch(() => ({ success: false })))
}
