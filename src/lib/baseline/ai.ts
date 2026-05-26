// src/lib/baseline/ai.ts
//
// Phase 4 — AI intent fallback.
//
// Called ONLY when the regex parser returns source: 'none'. Uses Haiku 4.5
// (cheapest current Claude tier) with a tight prompt that lists all our
// capabilities and asks for a single JSON Action.
//
// Cost controls:
//   • In-memory cache keyed by trimmed/lowercased text — repeats are free.
//   • Max 300 output tokens.
//   • 5-second abort.
//   • IGNYOUS_NO_AI=1 disables entirely.
//
// Safety:
//   • Strict validator. If the AI output doesn't conform to our Action union,
//     we return { action: null } with the raw text in `raw` for debugging.
//   • We never trust the AI to set colors as raw names — the prompt enforces hex.

import Anthropic from '@anthropic-ai/sdk'
import type { Action, BlockTarget, BlockOp } from './intent'

const MODEL  = 'claude-haiku-4-5-20251001'
const MAX_OUTPUT = 300
const TIMEOUT_MS = 5000

export interface AIParseResult {
  action: Action | null
  hint?: string
  aiTokens: number      // input + output, 0 if cached or disabled
  cached?: boolean
  raw?: string          // raw AI output, present only when validation fails
}

const cache = new Map<string, { action: Action; aiTokens: number }>()

const SYSTEM_PROMPT = `You convert a user's WordPress edit request into a JSON Action.

Reply with JSON ONLY in this shape:
  { "action": <Action> | null, "hint": <string> | null }

If the request is out of scope, ambiguous, or you can't fit it into the schemas below, return { "action": null, "hint": "<short reason>" }.

Available Actions:

1) options.patch — site identity
   { "capability": "options.patch", "body": { "site_title"?: string, "tagline"?: string }, "label": string }

2) theme.patch — global theme styles (block themes only)
   { "capability": "theme.patch", "body": { "primary_color"?: hex, "text_color"?: hex, "background_color"?: hex, "heading_font"?: string, "body_font"?: string }, "label": string }

3) pages.patch — page title or whole-page content (rare; prefer blocks.patch)
   { "capability": "pages.patch", "pageRef": "home" | <pageId:number>, "body": { "title"?: string, "content"?: string }, "label": string }

4) blocks.patch — edit ONE block on a page (the main capability you'll use)
   { "capability": "blocks.patch",
     "pageRef": "home" | number,
     "target": <BlockTarget>,
     "op": <BlockOp>,
     "label": string }

   BlockTarget = one of:
     { "kind": "first", "blockType": "core/heading" }
     { "kind": "nth", "blockType": "core/paragraph", "index": 0 }       // index is 0-based
     { "kind": "contains", "blockType": "core/heading", "text": "..." } // case-insensitive substring
     { "kind": "path", "path": "0.1" }                                   // explicit; rare

   Valid blockType values: core/heading, core/paragraph, core/button, core/list-item, core/quote, core/group

   BlockOp = one of:
     { "type": "set_text", "value": "..." }
     { "type": "set_style", "category": "color"|"spacing"|"typography", "name": "text"|"background"|"padding"|"margin"|"fontSize", "value": "#hexcolor"|"24px"|"1.5rem" }
     { "type": "clear_style", "category": "...", "name": "..." }
     { "type": "set_attr", "name": "level", "value": 2 }   // advanced — only for known attrs

5) pages.featured_image
   { "capability": "pages.featured_image", "pageRef": "home"|number, "attachmentRef": "last_uploaded"|"clear"|<id:number>, "label": string }

6) options.site_logo
   { "capability": "options.site_logo", "attachmentRef": "last_uploaded"|"clear"|<id:number>, "label": string }

7) pages.replace_first_image
   { "capability": "pages.replace_first_image", "pageRef": "home"|number, "attachmentRef": "last_uploaded"|number, "label": string }

8) undo
   { "capability": "undo", "label": "Undo last change" }

Rules:
- Colors MUST be hex like "#2563eb". Resolve names yourself: red=#dc2626, orange=#ea580c, yellow=#eab308, green=#16a34a, teal=#14b8a6, blue=#2563eb, indigo=#4f46e5, purple=#9333ea, pink=#ec4899, black=#000000, white=#ffffff, gray=#6b7280, navy=#1e3a8a.
- For "make the heading red" → text color. For "make the button red" → background color.
- Default pageRef to "home" unless the user names a specific page.
- "label" should be a 3-6 word human description of the change.
- Never invent capabilities not listed above.

Examples:
User: rename the homepage to About Us
→ { "action": { "capability": "pages.patch", "pageRef": "home", "body": { "title": "About Us" }, "label": "Home title → About Us" }, "hint": null }

User: bump up the heading font slightly
→ { "action": null, "hint": "Need a specific size like '20px' or '1.25rem'." }

User: turn the call to action button green
→ { "action": { "capability": "blocks.patch", "pageRef": "home", "target": { "kind": "first", "blockType": "core/button" }, "op": { "type": "set_style", "category": "color", "name": "background", "value": "#16a34a" }, "label": "Button background → green" }, "hint": null }`

/**
 * Try regex first via parseIntent; fall back to AI when source === 'none'.
 * This is the function the API route should call.
 */
export async function aiParseIntent(text: string, abortMs = TIMEOUT_MS): Promise<AIParseResult> {
  if (process.env.IGNYOUS_NO_AI === '1') {
    return { action: null, hint: 'ai_disabled', aiTokens: 0 }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { action: null, hint: 'no_api_key', aiTokens: 0 }
  }

  const key = text.trim().toLowerCase()
  const hit = cache.get(key)
  if (hit) return { action: hit.action, aiTokens: 0, cached: true }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), abortMs)

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    }, { signal: ac.signal })

    const totalTokens = (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0)
    const raw = extractText(res)
    const json = stripFences(raw)

    let parsed: any
    try { parsed = JSON.parse(json) } catch {
      return { action: null, hint: 'ai_returned_non_json', aiTokens: totalTokens, raw }
    }

    if (!parsed || typeof parsed !== 'object') {
      return { action: null, hint: 'ai_returned_non_object', aiTokens: totalTokens, raw }
    }
    if (parsed.action === null) {
      return { action: null, hint: typeof parsed.hint === 'string' ? parsed.hint : 'ai_no_match', aiTokens: totalTokens }
    }

    const validated = validateAction(parsed.action)
    if (!validated) {
      return { action: null, hint: 'ai_returned_invalid_action_shape', aiTokens: totalTokens, raw }
    }

    cache.set(key, { action: validated, aiTokens: totalTokens })
    return { action: validated, aiTokens: totalTokens }

  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { action: null, hint: 'ai_timeout', aiTokens: 0 }
    }
    return { action: null, hint: 'ai_error:' + (e?.message || 'unknown'), aiTokens: 0 }
  } finally {
    clearTimeout(timer)
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function extractText(res: any): string {
  if (!Array.isArray(res?.content)) return ''
  const block = res.content.find((b: any) => b.type === 'text')
  return block?.text || ''
}

function stripFences(s: string): string {
  return s.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const LEN = /^-?\d+(\.\d+)?(px|em|rem|%|vh|vw)?$/i
const VALID_BLOCK_TYPES = new Set([
  'core/heading', 'core/paragraph', 'core/button', 'core/list-item',
  'core/quote', 'core/group', 'core/cover', 'core/image',
  'core/preformatted', 'core/verse',
])
const VALID_STYLE: Record<string, Set<string>> = {
  color:      new Set(['text', 'background', 'link']),
  spacing:    new Set(['padding', 'margin', 'blockGap']),
  typography: new Set(['fontSize', 'fontWeight', 'letterSpacing', 'lineHeight']),
}

/**
 * Defensive shape check. Returns the action if it conforms, null otherwise.
 * Always validates the discriminator first, then required fields by capability.
 */
function validateAction(a: any): Action | null {
  if (!a || typeof a !== 'object') return null
  if (typeof a.capability !== 'string' || typeof a.label !== 'string') return null

  switch (a.capability) {
    case 'options.patch':
      if (!a.body || typeof a.body !== 'object') return null
      if (a.body.site_title !== undefined && typeof a.body.site_title !== 'string') return null
      if (a.body.tagline    !== undefined && typeof a.body.tagline    !== 'string') return null
      return a as Action

    case 'theme.patch': {
      if (!a.body || typeof a.body !== 'object') return null
      const b = a.body
      for (const k of ['primary_color', 'text_color', 'background_color']) {
        if (b[k] !== undefined && (typeof b[k] !== 'string' || !HEX.test(b[k]))) return null
      }
      for (const k of ['heading_font', 'body_font']) {
        if (b[k] !== undefined && typeof b[k] !== 'string') return null
      }
      return a as Action
    }

    case 'pages.patch':
      if (a.pageRef !== 'home' && typeof a.pageRef !== 'number') return null
      if (!a.body || typeof a.body !== 'object') return null
      if (a.body.title   !== undefined && typeof a.body.title   !== 'string') return null
      if (a.body.content !== undefined && typeof a.body.content !== 'string') return null
      return a as Action

    case 'blocks.patch':
      if (a.pageRef !== 'home' && typeof a.pageRef !== 'number') return null
      if (!validateTarget(a.target)) return null
      if (!validateOp(a.op))         return null
      return a as Action

    case 'pages.featured_image':
    case 'pages.replace_first_image':
      if (a.pageRef !== 'home' && typeof a.pageRef !== 'number') return null
      if (!validateAttachRef(a.attachmentRef, a.capability === 'pages.replace_first_image')) return null
      return a as Action

    case 'options.site_logo':
      if (!validateAttachRef(a.attachmentRef, false)) return null
      return a as Action

    case 'undo':
      return a as Action

    default:
      return null
  }
}

function validateTarget(t: any): t is BlockTarget {
  if (!t || typeof t !== 'object') return false
  switch (t.kind) {
    case 'first':
      return typeof t.blockType === 'string' && VALID_BLOCK_TYPES.has(t.blockType)
    case 'nth':
      return typeof t.blockType === 'string' && VALID_BLOCK_TYPES.has(t.blockType)
          && Number.isInteger(t.index) && t.index >= 0 && t.index < 100
    case 'contains':
      return typeof t.blockType === 'string' && VALID_BLOCK_TYPES.has(t.blockType)
          && typeof t.text === 'string' && t.text.length > 0 && t.text.length < 200
    case 'path':
      return typeof t.path === 'string' && /^\d+(\.\d+){0,5}$/.test(t.path)
    default:
      return false
  }
}

function validateOp(o: any): o is BlockOp {
  if (!o || typeof o !== 'object') return false
  switch (o.type) {
    case 'set_text':
      return typeof o.value === 'string' && o.value.length < 5000
    case 'set_attr':
      return typeof o.name === 'string' && o.name.length < 80 && o.value !== undefined
    case 'set_style': {
      if (typeof o.category !== 'string' || !VALID_STYLE[o.category]) return false
      if (typeof o.name !== 'string' || !VALID_STYLE[o.category].has(o.name)) return false
      if (typeof o.value !== 'string' || o.value.length > 80) return false
      if (o.category === 'color')     return HEX.test(o.value) || /^var:preset\|color\|[a-z0-9_-]+$/i.test(o.value)
      if (o.category === 'spacing')   return LEN.test(o.value)
      if (o.category === 'typography') return LEN.test(o.value) || /^\d{3}$/.test(o.value)
      return false
    }
    case 'clear_style':
      return typeof o.category === 'string' && VALID_STYLE[o.category]
          && typeof o.name === 'string' && VALID_STYLE[o.category].has(o.name)
    default:
      return false
  }
}

function validateAttachRef(r: any, lastUploadedOnly: boolean): boolean {
  if (r === 'last_uploaded') return true
  if (!lastUploadedOnly && r === 'clear') return true
  if (Number.isInteger(r) && r >= 0) return true
  return false
}

// Exposed for debug routes
export function _cacheStats() {
  return { size: cache.size, keys: Array.from(cache.keys()).slice(0, 10) }
}
export function _cacheClear() {
  cache.clear()
}
