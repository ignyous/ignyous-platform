import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    checks: {},
  }

  // 1. API key present?
  const keyPresent = !!process.env.ANTHROPIC_API_KEY
  const keyPreview = keyPresent
    ? process.env.ANTHROPIC_API_KEY!.slice(0, 10) + '...'
    : 'NOT SET'
  results.checks.api_key = { ok: keyPresent, value: keyPreview }

  if (!keyPresent) {
    return NextResponse.json({ ...results, error: 'ANTHROPIC_API_KEY not set in environment' }, { status: 500 })
  }

  // 2. Can we reach Anthropic?
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const start = Date.now()
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 20,
      messages:   [{ role: 'user', content: 'Reply with exactly: OK' }],
    })
    const ms   = Date.now() - start
    const text = response.content[0]?.type === 'text' ? response.content[0].text : '(no text)'

    results.checks.claude_api = {
      ok:           true,
      model:        'claude-sonnet-4-6',
      response:     text,
      duration_ms:  ms,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
    }
  } catch (err: any) {
    results.checks.claude_api = {
      ok:      false,
      error:   err?.message ?? String(err),
      status:  err?.status,
      headers: err?.headers,
    }
    return NextResponse.json({ ...results, error: 'Claude API call failed' }, { status: 500 })
  }

  // 3. Environment info
  results.checks.environment = {
    node_env:    process.env.NODE_ENV,
    nextauth_url: process.env.NEXTAUTH_URL ? '✓ set' : '✗ missing',
    database_url: process.env.DATABASE_URL ? '✓ set' : '✗ missing',
  }

  results.status = 'all checks passed'
  return NextResponse.json(results)
}
