// src/app/api/baseline/apply/route.ts
//
// POST { siteId, action, intent? } → result with success flag, tier used,
// snapshot/change ids, before+after values, error chain.
//
// The route adds the X-Ignyous-Intent and X-Ignyous-Change-Id headers on the way down
// so the bridge can build a useful action log row.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { randomUUID } from 'crypto'
import { bridgeCall, getSiteByIdForUser } from '@/lib/baseline/bridge'
import type { Action, BlockTarget, ElementorTarget } from '@/lib/baseline/intent'

interface ApplyBody {
  siteId: string
  action: Action
  intent?: string
  aiTokens?: number
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as ApplyBody
  if (!body?.siteId || !body?.action) return NextResponse.json({ error: 'siteId and action required' }, { status: 400 })

  const site = await getSiteByIdForUser(body.siteId, session.user.email!)
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const changeId = randomUUID()
  const tiers: Array<{ tier: number; capability: string; ok: boolean; status: number; error?: string; durationMs: number; data?: any }> = []
  const opts = { changeId, intent: body.intent || body.action.label, aiTokens: body.aiTokens }

  // Phase 0 hierarchy:
  //  Tier 1 — builder native (Gutenberg block-targeted edits): not yet implemented; falls through.
  //  Tier 2 — theme options / theme.json / site options                ← currently the primary tier
  //  Tier 3 — global CSS                                               ← future
  //
  // The same dispatcher will fan capability requests out to Tier 1 first as we add it.

  let primary: any = null

  switch (body.action.capability) {
    case 'options.patch': {
      const r = await bridgeCall(site, 'options', { method: 'PATCH', body: body.action.body, ...opts })
      tiers.push({ tier: 2, capability: 'options.patch', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    case 'theme.patch': {
      const r = await bridgeCall(site, 'theme/styles', { method: 'PATCH', body: body.action.body, ...opts })
      tiers.push({ tier: 2, capability: 'theme.patch', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    case 'pages.patch': {
      // Resolve "home" → page id
      let pageId: number | null = null
      if (typeof body.action.pageRef === 'number') {
        pageId = body.action.pageRef
      } else if (body.action.pageRef === 'home') {
        const s = await bridgeCall(site, 'site')
        pageId = (s.data?.home_page_id as number) || null
        tiers.push({ tier: 0, capability: 'resolve.home', ok: s.ok && !!pageId, status: s.status, durationMs: s.durationMs, data: { home_page_id: pageId } })
      }
      if (!pageId) {
        return NextResponse.json({
          success: false,
          changeId,
          error: 'Could not resolve target page. Set a static front page in WP Admin → Settings → Reading, or pass a numeric page id.',
          tiers,
        }, { status: 400 })
      }
      const r = await bridgeCall(site, `pages/${pageId}`, { method: 'PATCH', body: body.action.body, ...opts })
      tiers.push({ tier: 2, capability: 'pages.patch', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    case 'pages.featured_image': {
      const pageId = await resolvePageId(site, body.action.pageRef, tiers)
      if (!pageId) return NextResponse.json({ success: false, changeId, error: 'Could not resolve page.', tiers }, { status: 400 })
      const attachId = await resolveAttachmentId(site, body.action.attachmentRef, tiers)
      if (attachId === null) return NextResponse.json({ success: false, changeId, error: 'No uploaded image found. Upload one first.', tiers }, { status: 400 })
      const r = await bridgeCall(site, `pages/${pageId}/featured-image`, { method: 'PATCH', body: { attachment_id: attachId }, ...opts })
      tiers.push({ tier: 1, capability: 'pages.featured_image', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    case 'options.site_logo': {
      const attachId = await resolveAttachmentId(site, body.action.attachmentRef, tiers)
      if (attachId === null) return NextResponse.json({ success: false, changeId, error: 'No uploaded image found. Upload one first.', tiers }, { status: 400 })
      const r = await bridgeCall(site, 'options/site_logo', { method: 'PATCH', body: { attachment_id: attachId }, ...opts })
      tiers.push({ tier: 2, capability: 'options.site_logo', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    case 'pages.replace_first_image': {
      const pageId = await resolvePageId(site, body.action.pageRef, tiers)
      if (!pageId) return NextResponse.json({ success: false, changeId, error: 'Could not resolve page.', tiers }, { status: 400 })
      const attachId = await resolveAttachmentId(site, body.action.attachmentRef, tiers)
      if (!attachId) return NextResponse.json({ success: false, changeId, error: 'No uploaded image found. Upload one first.', tiers }, { status: 400 })

      // Need the URL — pull from the media list lookup we just did, or refetch
      const mediaRes = await bridgeCall(site, 'media?limit=20')
      const found = ((mediaRes.data?.media as any[]) || []).find(m => m.id === attachId)
      if (!found?.url) return NextResponse.json({ success: false, changeId, error: 'Attachment exists but URL missing.', tiers }, { status: 500 })

      const r = await bridgeCall(site, `pages/${pageId}/replace-first-image`, { method: 'PATCH', body: { url: found.url, alt: found.alt || '', attachment_id: attachId }, ...opts })
      tiers.push({ tier: 1, capability: 'pages.replace_first_image', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    case 'blocks.patch': {
      const blocksAction = body.action  // preserve type narrowing across awaits below
      const pageId = await resolvePageId(site, blocksAction.pageRef, tiers)
      if (!pageId) return NextResponse.json({ success: false, changeId, error: 'Could not resolve page.', tiers }, { status: 400 })

      // ── Elementor detection ──
      // If this page is built with Elementor, route text AND style edits to the
      // Elementor element tree instead of Gutenberg blocks.
      if (blocksAction.op.type === 'set_text' || blocksAction.op.type === 'set_style' || blocksAction.op.type === 'clear_style') {
        const el = await bridgeCall(site, `pages/${pageId}/elementor`)
        if (el.ok && el.data?.built_with_elementor) {
          tiers.push({ tier: 0, capability: 'elementor.list', ok: true, status: el.status, durationMs: el.durationMs, data: { count: el.data?.count } })
          const els = (el.data?.elements as any[]) || []
          const widgetType = blockTypeToElementorWidget(getTargetType(blocksAction.target))
          const elTarget = remapTargetToElementor(blocksAction.target, widgetType)
          const res = resolveElementorTarget(els, elTarget)

          if (res.kind === 'none') {
            return NextResponse.json({
              success: false, changeId,
              error: `No ${widgetType || 'matching'} widget found on this Elementor page.`,
              tiers, candidates: els.filter(e => e.elType === 'widget' && (!widgetType || e.widgetType === widgetType)).map(e => ({ path: e.path, id: e.id, type: e.widgetType, text: e.text })),
            }, { status: 404 })
          }
          if (res.kind === 'ambiguous') {
            return NextResponse.json({
              success: false, changeId,
              error: `Ambiguous — multiple ${widgetType || ''} widgets match. Pick one by clicking it in the Elementor pane, or be more specific.`,
              tiers, candidates: res.matches.map(e => ({ path: e.path, id: e.id, type: e.widgetType, text: e.text })),
            }, { status: 409 })
          }

          // Translate the op: Gutenberg set_style category/name carries over directly
          const elOp = blocksAction.op
          const r = await bridgeCall(site, `pages/${pageId}/elementor`, {
            method: 'PATCH',
            body: { target: { by: 'id', id: res.el.id }, op: elOp },
            ...opts,
          })
          tiers.push({ tier: 1, capability: 'elementor.patch', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
          primary = r
          break
        }
      }

      // Fetch the page's block tree
      const list = await bridgeCall(site, `pages/${pageId}/blocks`)
      tiers.push({ tier: 0, capability: 'blocks.list', ok: list.ok, status: list.status, error: list.error, durationMs: list.durationMs, data: { count: list.data?.count } })
      if (!list.ok) return NextResponse.json({ success: false, changeId, error: 'Could not list blocks.', tiers }, { status: 502 })

      const blocks = (list.data?.blocks as any[]) || []
      const resolved = resolveBlockTarget(blocks, blocksAction.target)

      if (resolved.kind === 'none') {
        return NextResponse.json({
          success: false, changeId,
          error: `No ${humanizeType(getTargetType(blocksAction.target))} found on this page.`,
          tiers, candidates: blocks.filter(b => !getTargetType(blocksAction.target) || b.type === getTargetType(blocksAction.target)).map(b => ({ path: b.path, type: b.type, text: b.text })),
        }, { status: 404 })
      }
      if (resolved.kind === 'ambiguous') {
        return NextResponse.json({
          success: false, changeId,
          error: `Ambiguous — multiple ${humanizeType(getTargetType(blocksAction.target))} blocks match. Pick one by clicking it in the Blocks pane, or be more specific.`,
          tiers, candidates: resolved.matches.map(b => ({ path: b.path, type: b.type, text: b.text })),
        }, { status: 409 })
      }

      const r = await bridgeCall(site, `pages/${pageId}/blocks`, {
        method: 'PATCH',
        body: { path: resolved.block.path, op: blocksAction.op },
        ...opts,
      })
      tiers.push({ tier: 1, capability: 'blocks.patch', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    case 'elementor.patch': {
      const elAction = body.action
      const pageId = await resolvePageId(site, elAction.pageRef, tiers)
      if (!pageId) return NextResponse.json({ success: false, changeId, error: 'Could not resolve page.', tiers }, { status: 400 })

      // Resolve fuzzy targets (first/nth/contains) to a concrete id; id/path pass through
      let target = elAction.target
      if (target.kind !== 'id' && target.kind !== 'path') {
        const el = await bridgeCall(site, `pages/${pageId}/elementor`)
        tiers.push({ tier: 0, capability: 'elementor.list', ok: el.ok, status: el.status, durationMs: el.durationMs, data: { count: el.data?.count } })
        if (!el.ok || !el.data?.built_with_elementor) {
          return NextResponse.json({ success: false, changeId, error: 'Page is not built with Elementor.', tiers }, { status: 404 })
        }
        const els = (el.data?.elements as any[]) || []
        const res = resolveElementorTarget(els, target)
        if (res.kind === 'none') return NextResponse.json({ success: false, changeId, error: 'No matching Elementor widget found.', tiers, candidates: els.filter(e => e.elType === 'widget').map(e => ({ path: e.path, id: e.id, type: e.widgetType, text: e.text })) }, { status: 404 })
        if (res.kind === 'ambiguous') return NextResponse.json({ success: false, changeId, error: 'Ambiguous Elementor target — pick one in the Elementor pane.', tiers, candidates: res.matches.map(e => ({ path: e.path, id: e.id, type: e.widgetType, text: e.text })) }, { status: 409 })
        target = { kind: 'id', id: res.el.id }
      }

      const byKey = target.kind === 'id' ? { by: 'id', id: (target as any).id } : { by: 'path', path: (target as any).path }
      const r = await bridgeCall(site, `pages/${pageId}/elementor`, {
        method: 'PATCH',
        body: { target: byKey, op: elAction.op },
        ...opts,
      })
      tiers.push({ tier: 1, capability: 'elementor.patch', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    case 'undo': {
      // Find the most recent change_id from the bridge action log, then restore it
      const logRes = await bridgeCall(site, 'actions?limit=20')
      const actions = (logRes.data?.actions as any[]) || []
      const last = actions.find(a => a.capability && a.capability !== 'snapshots.restore' && a.capability !== 'snapshots.restore_change' && a.success)
      if (!last) {
        return NextResponse.json({ success: false, changeId, error: 'Nothing to undo — no successful changes found.', tiers }, { status: 404 })
      }
      const r = await bridgeCall(site, `snapshots/restore-change/${last.change_id}`, { method: 'POST', ...opts })
      tiers.push({ tier: 2, capability: 'snapshots.restore_change', ok: r.ok, status: r.status, error: r.error, durationMs: r.durationMs, data: r.data })
      primary = r
      break
    }
    default:
      return NextResponse.json({ success: false, error: 'Unknown capability', tiers }, { status: 400 })
  }

  return NextResponse.json({
    success: !!primary?.ok,
    changeId,
    primary: primary ? { ok: primary.ok, status: primary.status, data: primary.data, error: primary.error, durationMs: primary.durationMs, url: primary.url } : null,
    tiers,
    action: body.action,
  })
}

// ─── helpers ───────────────────────────────────────────────────────────────

async function resolvePageId(site: any, ref: string | number, tiers: any[]): Promise<number | null> {
  if (typeof ref === 'number') return ref
  if (ref === 'home') {
    const s = await bridgeCall(site, 'site')
    const id = (s.data?.home_page_id as number) || null
    tiers.push({ tier: 0, capability: 'resolve.home', ok: s.ok && !!id, status: s.status, durationMs: s.durationMs, data: { home_page_id: id } })
    return id
  }
  // Theme-builder location refs: header / footer / single / archive → newest template of that type
  if (['header', 'footer', 'single', 'archive', 'error-404', 'search-results'].includes(ref)) {
    const t = await bridgeCall(site, `elementor/templates?location=${encodeURIComponent(ref)}`)
    const list = ((t.data?.by_type as any)?.[ref] as any[]) || []
    const id = list[0]?.id || null   // newest-modified first (bridge orders desc)
    tiers.push({ tier: 0, capability: `resolve.${ref}`, ok: t.ok && !!id, status: t.status, durationMs: t.durationMs, data: { template_id: id, candidates: list.length } })
    return id
  }
  // Could expand to slug lookup later
  return null
}

async function resolveAttachmentId(site: any, ref: 'last_uploaded' | 'clear' | number, tiers: any[]): Promise<number | null> {
  if (ref === 'clear') return 0
  if (typeof ref === 'number') return ref
  if (ref === 'last_uploaded') {
    const r = await bridgeCall(site, 'media?limit=1')
    const first = ((r.data?.media as any[]) || [])[0]
    tiers.push({ tier: 0, capability: 'resolve.last_uploaded', ok: r.ok && !!first, status: r.status, durationMs: r.durationMs, data: { attachment_id: first?.id } })
    return first?.id || null
  }
  return null
}

// ─── Block target resolver ─────────────────────────────────────────────────

type ResolveResult =
  | { kind: 'one';       block: any }
  | { kind: 'ambiguous'; matches: any[] }
  | { kind: 'none' }

function getTargetType(t: BlockTarget): string {
  return (t as any).blockType || ''
}
function humanizeType(t: string): string {
  if (!t) return 'block'
  return t.replace(/^core\//, '').replace(/-/g, ' ')
}

function resolveBlockTarget(blocks: any[], target: BlockTarget): ResolveResult {
  if (target.kind === 'path') {
    const hit = blocks.find(b => b.path === target.path)
    return hit ? { kind: 'one', block: hit } : { kind: 'none' }
  }
  const ofType = blocks.filter(b => b.type === target.blockType)
  if (ofType.length === 0) return { kind: 'none' }

  if (target.kind === 'first') {
    if (ofType.length === 1) return { kind: 'one', block: ofType[0] }
    // For "the heading" with multiple, treat as ambiguous unless ALL are at depth 0
    // (heuristic: a page with one obvious "the heading" usually has one top-level h1/h2)
    const topLevel = ofType.filter(b => b.depth === 0)
    if (topLevel.length === 1) return { kind: 'one', block: topLevel[0] }
    return { kind: 'ambiguous', matches: ofType }
  }

  if (target.kind === 'nth') {
    if (target.index >= ofType.length) return { kind: 'none' }
    return { kind: 'one', block: ofType[target.index] }
  }

  if (target.kind === 'contains') {
    const needle = target.text.toLowerCase().trim()
    const matches = ofType.filter(b => (b.text || '').toLowerCase().includes(needle))
    if (matches.length === 0) return { kind: 'none' }
    if (matches.length === 1) return { kind: 'one', block: matches[0] }
    return { kind: 'ambiguous', matches }
  }

  return { kind: 'none' }
}

// ─── Elementor target resolution (parallel to block resolver) ───────────────

type ElResolveResult =
  | { kind: 'one';       el: any }
  | { kind: 'ambiguous'; matches: any[] }
  | { kind: 'none' }

// Gutenberg block type → Elementor widget type
const BLOCK_TO_ELEMENTOR: Record<string, string> = {
  'core/heading':   'heading',
  'core/paragraph': 'text-editor',
  'core/button':    'button',
  'core/list':      'icon-list',
  'core/image':     'image',
  'core/quote':     'testimonial',
}
function blockTypeToElementorWidget(blockType: string): string {
  return BLOCK_TO_ELEMENTOR[blockType] || ''
}
function remapTargetToElementor(target: BlockTarget, widgetType: string): ElementorTarget {
  switch (target.kind) {
    case 'first':    return { kind: 'first', widgetType }
    case 'nth':      return { kind: 'nth', widgetType, index: target.index }
    case 'contains': return { kind: 'contains', widgetType, text: target.text }
    case 'path':     return { kind: 'path', path: target.path }
    default:         return { kind: 'first', widgetType }
  }
}

function resolveElementorTarget(els: any[], target: ElementorTarget): ElResolveResult {
  if (target.kind === 'id') {
    const hit = els.find(e => e.id === target.id)
    return hit ? { kind: 'one', el: hit } : { kind: 'none' }
  }
  if (target.kind === 'path') {
    const hit = els.find(e => e.path === target.path)
    return hit ? { kind: 'one', el: hit } : { kind: 'none' }
  }
  const widgets = els.filter(e => e.elType === 'widget' && (!target.widgetType || e.widgetType === target.widgetType))
  if (widgets.length === 0) return { kind: 'none' }

  if (target.kind === 'first') {
    if (widgets.length === 1) return { kind: 'one', el: widgets[0] }
    // prefer a shallow (top-ish) widget if exactly one is at min depth
    const minDepth = Math.min(...widgets.map(w => w.depth ?? 0))
    const shallow = widgets.filter(w => (w.depth ?? 0) === minDepth)
    if (shallow.length === 1) return { kind: 'one', el: shallow[0] }
    return { kind: 'ambiguous', matches: widgets }
  }
  if (target.kind === 'nth') {
    if (target.index >= widgets.length) return { kind: 'none' }
    return { kind: 'one', el: widgets[target.index] }
  }
  if (target.kind === 'contains') {
    const needle = target.text.toLowerCase().trim()
    const matches = widgets.filter(w => (w.text || '').toLowerCase().includes(needle))
    if (matches.length === 0) return { kind: 'none' }
    if (matches.length === 1) return { kind: 'one', el: matches[0] }
    return { kind: 'ambiguous', matches }
  }
  return { kind: 'none' }
}
