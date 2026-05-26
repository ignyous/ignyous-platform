// src/lib/baseline/bridge.ts
//
// Thin, typed HTTP client for the baseline bridge plugin.
// Every call uses Bearer auth and tags writes with the change_id/intent/ai_tokens headers
// so the bridge can write a useful action log.

import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

export interface SiteCreds { id: string; url: string; apiKey: string }

export async function getSiteByIdForUser(siteId: string, userEmail: string): Promise<SiteCreds | null> {
  const user = await prisma.user.findUnique({ where: { email: userEmail } })
  if (!user) return null
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } })
  if (!site) return null
  return { id: site.id, url: site.url, apiKey: site.apiKey }
}

export interface BridgeCallOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: any
  changeId?: string
  intent?: string
  aiTokens?: number
  timeoutMs?: number
}

export interface BridgeResult<T = any> {
  ok: boolean
  status: number
  data: T | null
  error?: string
  durationMs: number
  changeId: string
  url: string
}

function normalize(url: string) { return url.replace(/\/+$/, '') }

/** Call any /wp-json/ignyous/v1/<path> endpoint with full debug info attached. */
export async function bridgeCall<T = any>(site: SiteCreds, path: string, opts: BridgeCallOpts = {}): Promise<BridgeResult<T>> {
  const method = opts.method || 'GET'
  const changeId = opts.changeId || randomUUID()
  const base = normalize(site.url)
  const url  = `${base}/wp-json/ignyous/v1/${path.replace(/^\//, '')}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${site.apiKey}`,
    'Content-Type':  'application/json',
    'X-Ignyous-Change-Id': changeId,
  }
  if (opts.intent)   headers['X-Ignyous-Intent']    = opts.intent.slice(0, 500)
  if (opts.aiTokens) headers['X-Ignyous-Ai-Tokens'] = String(opts.aiTokens)

  const started = Date.now()
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000)

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(t)
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : (data?.message || data?.code || `HTTP ${res.status}`),
      durationMs: Date.now() - started,
      changeId,
      url,
    }
  } catch (err: any) {
    clearTimeout(t)
    return {
      ok: false,
      status: 0,
      data: null,
      error: err?.name === 'AbortError' ? 'Request timed out' : (err?.message || 'Fetch failed'),
      durationMs: Date.now() - started,
      changeId,
      url,
    }
  }
}
