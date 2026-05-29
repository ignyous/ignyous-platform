// src/app/baseline/[siteId]/page.tsx
//
// Phase 0 editor. Three panes:
//   Left  — Quick form (direct fields, no AI)
//   Mid   — Chat (regex intent parser; everything is also showable here)
//   Right — Debug panel (action log, snapshots, current state, raw JSON)
//
// Every change goes through /api/baseline/apply which:
//   1. Adds a change_id
//   2. Calls the bridge — bridge snapshots before, writes, snapshots after, logs action
//   3. Returns full debug result (tiers tried, durations, before/after)
//
// Undo button restores the last successful change_id's snapshots.

'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import type { Action } from '@/lib/baseline/intent'

// ─── Types ────────────────────────────────────────────────────────
interface StateResp {
  siteId: string; siteUrl: string
  site:    { ok: boolean; error?: string; data: any; durationMs: number }
  options: { ok: boolean; error?: string; data: any; durationMs: number }
  theme:   { ok: boolean; error?: string; data: any; durationMs: number }
  pages:   { ok: boolean; error?: string; data: any; durationMs: number }
}
interface ApplyResp {
  success: boolean
  changeId: string
  primary: any
  tiers:   any[]
  action?:  Action
  error?:  string
}
interface ChatTurn {
  role: 'user' | 'system' | 'result'
  text: string
  meta?: any
}

// ─── Styles ───────────────────────────────────────────────────────
const C = {
  bg: '#F7F5F2', text: '#1A1410', mute: '#6B6056', faint: '#A89D94',
  border: '#E2DDD8', white: '#FFFFFF', accent: '#E8651A',
  good: '#1E7B4B', goodBg: '#F0FAF5', bad: '#B91C1C', badBg: '#FEF2F2',
  warn: '#92400E', warnBg: '#FFFBEB',
}
const card: React.CSSProperties  = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }
const label: React.CSSProperties = { display: 'block', fontSize: 12, color: C.mute, marginBottom: 4 }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }
const btn:   React.CSSProperties = { padding: '8px 14px', background: C.text, color: C.white, border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', color: C.text, border: `1px solid ${C.border}` }

// ─── Main ─────────────────────────────────────────────────────────
export default function BaselineEditor() {
  const params  = useParams<{ siteId: string }>()
  const siteId  = params?.siteId
  const [state, setState]   = useState<StateResp | null>(null)
  const [chat, setChat]     = useState<ChatTurn[]>([])
  const [input1, setInput]  = useState('')
  const [busy, setBusy]     = useState(false)
  const [tab, setTab]       = useState<'actions' | 'snapshots' | 'blocks' | 'elementor' | 'state'>('actions')
  const [actions, setActions]     = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [pageBlocks, setPageBlocks] = useState<any[]>([])
  const [elementorEls, setElementorEls] = useState<any[]>([])
  const [elementorInfo, setElementorInfo] = useState<{ built: boolean; version: string | null; hint: string | null }>({ built: false, version: null, hint: null })
  const [templates, setTemplates] = useState<Record<string, any[]>>({})
  const [targetDoc, setTargetDoc] = useState<{ ref: 'home' | number; label: string }>({ ref: 'home', label: 'Home page' })
  const [lastApply, setLastApply] = useState<ApplyResp | null>(null)

  const refreshState = useCallback(async () => {
    if (!siteId) return
    const r = await fetch(`/api/baseline/state?siteId=${siteId}`)
    const d = await r.json() as StateResp
    setState(d)
  }, [siteId])

  const refreshDebug = useCallback(async () => {
    if (!siteId) return
    const elUrl = targetDoc.ref === 'home'
      ? `/api/baseline/elementor-elements?siteId=${siteId}`
      : `/api/baseline/elementor-elements?siteId=${siteId}&pageId=${targetDoc.ref}`
    const [aRes, sRes, bRes, eRes, tRes] = await Promise.all([
      fetch(`/api/baseline/actions?siteId=${siteId}&limit=30`).then(r => r.json()),
      fetch(`/api/baseline/snapshots?siteId=${siteId}&limit=30`).then(r => r.json()),
      fetch(`/api/baseline/blocks?siteId=${siteId}`).then(r => r.json()).catch(() => ({ blocks: [] })),
      fetch(elUrl).then(r => r.json()).catch(() => ({ elements: [] })),
      fetch(`/api/baseline/elementor-templates?siteId=${siteId}`).then(r => r.json()).catch(() => ({ byType: {} })),
    ])
    setActions(aRes.actions || [])
    setSnapshots(sRes.snapshots || [])
    setPageBlocks(bRes.blocks || [])
    setElementorEls(eRes.elements || [])
    setElementorInfo({ built: !!eRes.builtWithElementor, version: eRes.elementorVersion || null, hint: eRes.hint || null })
    setTemplates(tRes.byType || {})
  }, [siteId, targetDoc])

  useEffect(() => { refreshState(); refreshDebug() }, [refreshState, refreshDebug])

  // ─── Apply an Action ──
  async function apply(action: Action, intent?: string, aiTokens?: number) {
    setBusy(true)
    setChat(c => [...c, { role: 'system', text: `Applying: ${action.label}` }])
    const r = await fetch('/api/baseline/apply', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ siteId, action, intent: intent || action.label, aiTokens }),
    })
    const d = await r.json() as ApplyResp
    setLastApply(d)
    setChat(c => [...c, { role: 'result', text: d.success ? `✓ ${action.label}` : `✗ ${action.label} — ${d.error || d.primary?.error || 'failed'}`, meta: d }])
    setBusy(false)
    await Promise.all([refreshState(), refreshDebug()])
  }

  // ─── Chat submit ──
  async function submitChat(e: React.FormEvent) {
    e.preventDefault()
    if (!input1.trim() || busy) return
    const text = input1.trim()
    setInput('')
    setChat(c => [...c, { role: 'user', text }])
    setBusy(true)
    const r = await fetch('/api/baseline/intent', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text }),
    })
    const d = await r.json()
    setBusy(false)
    if (d.source === 'none' || !d.action) {
      setChat(c => [...c, { role: 'system', text: `Couldn't parse: ${d.hint || 'no match'}`, meta: d }])
      return
    }
    // Surface AI source so the user can see when tokens were used
    if (d.source === 'ai') {
      setChat(c => [...c, { role: 'system', text: `AI parsed (${d.cached ? 'cached, 0' : d.aiTokens} tokens): ${d.action.label}`, meta: d }])
    }
    await apply(d.action, text, d.aiTokens || 0)
  }

  // ─── Undo last ──
  async function undoLast() {
    if (busy) return
    setBusy(true)
    const r = await fetch('/api/baseline/undo', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ siteId }),
    })
    const d = await r.json()
    setChat(c => [...c, { role: 'result', text: d.success ? `↶ Restored change ${d.restoredChangeId?.slice(0,8) || ''}` : `✗ Undo failed: ${d.error || 'no change to undo'}`, meta: d }])
    setBusy(false)
    await Promise.all([refreshState(), refreshDebug()])
  }

  if (!state) return <div style={{ padding: 32 }}>Loading site…</div>

  const siteData    = state.site.data
  const optionsData = state.options.data
  const themeData   = state.theme.data
  const pagesData   = state.pages.data
  const isBlock     = themeData?.is_block_theme

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'ui-sans-serif, system-ui' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.white }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{siteData?.site_title || state.siteUrl}</div>
          <div style={{ fontSize: 12, color: C.mute }}>{state.siteUrl} · {siteData?.theme?.name} {isBlock ? '· block theme' : '· classic theme'}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={undoLast} disabled={busy} style={btnGhost}>↶ Undo last</button>
          <a href={state.siteUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: 'none' }}>View site ↗</a>
        </div>
      </div>

      {/* Bridge health row */}
      <BridgeHealth state={state} />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 380px', gap: 16, padding: 16 }}>
        {/* Left — Quick form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <QuickFormText state={state} apply={apply} busy={busy} />
          <QuickFormTheme state={state} apply={apply} busy={busy} />
          <QuickFormPage  state={state} apply={apply} busy={busy} />
          <QuickFormMedia siteId={siteId!} apply={apply} busy={busy} />
        </div>

        {/* Mid — Chat */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Chat <span style={{ fontWeight: 400, fontSize: 11, color: C.faint }}>· regex first, Haiku 4.5 fallback</span></div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
            {chat.length === 0 && (
              <div style={{ color: C.mute, fontSize: 13 }}>
                <p>Try one of these:</p>
                <ul style={{ paddingLeft: 18 }}>
                  <li><code>set site title to My Plumbing Co</code></li>
                  <li><code>set tagline to Trusted plumbing since 1998</code></li>
                  <li><code>change primary color to #2563eb</code></li>
                  <li><code>set heading font to body</code> <span style={{ color: C.faint }}>(theme font slug)</span></li>
                  <li><code>change home page title to Welcome</code></li>
                  <li><code>change the heading to Hello there</code> <span style={{ color: C.faint }}>(Phase 2)</span></li>
                  <li><code>change the second paragraph to Lorem ipsum…</code></li>
                  <li><code>change the button to Get Started</code></li>
                  <li><code>make the heading red</code> <span style={{ color: C.faint }}>(Phase 3)</span></li>
                  <li><code>change the button background to #2563eb</code></li>
                  <li><code>set the heading padding to 32px</code></li>
                  <li><code>set the heading font size to 24px</code></li>
                  <li><code>set featured image on home</code> <span style={{ color: C.faint }}>(after uploading)</span></li>
                  <li><code>set site logo</code></li>
                  <li><code>replace first image on home</code></li>
                  <li><code>undo</code></li>
                </ul>
              </div>
            )}
            {chat.map((t, i) => (
              <ChatBubble key={i} turn={t} />
            ))}
          </div>
          <form onSubmit={submitChat} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={input1} onChange={e => setInput(e.target.value)} placeholder="Type a command…" style={{ ...input, flex: 1 }} disabled={busy} />
            <button type="submit" disabled={busy || !input1.trim()} style={btn}>{busy ? '…' : 'Run'}</button>
          </form>
        </div>

        {/* Right — Debug */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 200px)' }}>
          <div style={card}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['actions', 'snapshots', 'blocks', 'elementor', 'state'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{ ...btnGhost, flex: 1, background: tab === t ? C.text : 'transparent', color: tab === t ? C.white : C.text, textTransform: 'capitalize', fontSize: 11, padding: '4px 2px' }}
                >
                  {t}
                </button>
              ))}
            </div>
            <button onClick={refreshDebug} style={{ ...btnGhost, width: '100%', fontSize: 12 }}>Refresh</button>
          </div>
          <div style={{ ...card, flex: 1, overflowY: 'auto' }}>
            {tab === 'actions'   && <ActionsList   rows={actions} />}
            {tab === 'snapshots' && <SnapshotsList rows={snapshots} siteId={siteId!} onChange={() => { refreshState(); refreshDebug() }} />}
            {tab === 'blocks'    && <BlocksList    rows={pageBlocks} apply={apply} busy={busy} />}
            {tab === 'elementor' && <ElementorList rows={elementorEls} info={elementorInfo} apply={apply} busy={busy} templates={templates} targetDoc={targetDoc} setTargetDoc={setTargetDoc} />}
            {tab === 'state'     && <StateDump state={state} lastApply={lastApply} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────

function BridgeHealth({ state }: { state: StateResp }) {
  const rows = [
    { label: 'site',    ok: state.site.ok,    err: state.site.error,    ms: state.site.durationMs },
    { label: 'options', ok: state.options.ok, err: state.options.error, ms: state.options.durationMs },
    { label: 'theme',   ok: state.theme.ok,   err: state.theme.error,   ms: state.theme.durationMs },
    { label: 'pages',   ok: state.pages.ok,   err: state.pages.error,   ms: state.pages.durationMs },
  ]
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 20px', borderBottom: `1px solid ${C.border}`, background: C.white, fontSize: 12 }}>
      {rows.map(r => (
        <span key={r.label} title={r.err || ''} style={{ color: r.ok ? C.good : C.bad }}>
          {r.ok ? '●' : '○'} {r.label} {r.ok ? `(${r.ms}ms)` : `(${r.err || 'error'})`}
        </span>
      ))}
    </div>
  )
}

function QuickFormText({ state, apply, busy }: { state: StateResp; apply: (a: Action) => void; busy: boolean }) {
  const [title,   setTitle]   = useState('')
  const [tagline, setTagline] = useState('')
  useEffect(() => {
    setTitle(state.options.data?.site_title || '')
    setTagline(state.options.data?.tagline   || '')
  }, [state])

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Site identity</div>
      <label style={label}>Site title</label>
      <input style={input} value={title} onChange={e => setTitle(e.target.value)} disabled={busy} />
      <div style={{ height: 8 }} />
      <label style={label}>Tagline</label>
      <input style={input} value={tagline} onChange={e => setTagline(e.target.value)} disabled={busy} />
      <div style={{ height: 8 }} />
      <button
        style={btn}
        disabled={busy}
        onClick={() => {
          const body: any = {}
          if (title   !== state.options.data?.site_title) body.site_title = title
          if (tagline !== state.options.data?.tagline)    body.tagline    = tagline
          if (!Object.keys(body).length) return
          apply({ capability: 'options.patch', body, label: `Site identity → ${Object.keys(body).join(', ')}` })
        }}
      >Save</button>
    </div>
  )
}

function QuickFormTheme({ state, apply, busy }: { state: StateResp; apply: (a: Action) => void; busy: boolean }) {
  const adapter   = state.theme.data?.adapter
  const adapterSlug = adapter?.slug || 'unknown'
  const caps      = adapter?.capabilities || {}
  const cur       = state.theme.data?.current || {}
  // font_families only exist for block themes (theme.json presets) — Astra/Kadence take raw family names
  const fonts     = state.theme.data?.raw?.font_families || state.theme.data?.font_families || []
  const [primary, setPrimary]   = useState(cur.primary_color || '#000000')
  const [textCol, setTextCol]   = useState(cur.text_color    || '#000000')
  const [bgCol,   setBgCol]     = useState(cur.background_color || '#ffffff')
  const [headingFont, setHF]    = useState(cur.heading_font || '')
  const [bodyFont,    setBF]    = useState(cur.body_font    || '')

  useEffect(() => {
    const c = state.theme.data?.current || {}
    setPrimary(c.primary_color || '#000000')
    setTextCol(c.text_color    || '#000000')
    setBgCol(c.background_color || '#ffffff')
    setHF(c.heading_font || '')
    setBF(c.body_font    || '')
  }, [state])

  // If the adapter doesn't support ANY of our keys, the form is useless
  const supportsAnything = caps.primary_color || caps.text_color || caps.background_color || caps.heading_font || caps.body_font
  if (!supportsAnything) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Theme styles</div>
        <div style={{ fontSize: 12, color: C.warn, background: C.warnBg, padding: 6, borderRadius: 4 }}>
          {state.theme.data?.raw?.hint || `No theme adapter for "${state.theme.data?.raw?.stylesheet || 'this theme'}" yet. Per-block edits on the Blocks tab still work.`}
        </div>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>Theme styles</div>
        <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px', borderRadius: 3, background: C.text, color: C.white }}>
          {adapter?.name || adapterSlug}
        </span>
      </div>

      <label style={label}>Primary color</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="color" value={primary} onChange={e => setPrimary(e.target.value)} style={{ width: 40, height: 36, border: `1px solid ${C.border}`, borderRadius: 6, padding: 2 }} />
        <input style={{ ...input, flex: 1 }} value={primary} onChange={e => setPrimary(e.target.value)} />
      </div>
      <div style={{ height: 8 }} />
      <label style={label}>Text color</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="color" value={textCol} onChange={e => setTextCol(e.target.value)} style={{ width: 40, height: 36, border: `1px solid ${C.border}`, borderRadius: 6, padding: 2 }} />
        <input style={{ ...input, flex: 1 }} value={textCol} onChange={e => setTextCol(e.target.value)} />
      </div>
      <div style={{ height: 8 }} />
      <label style={label}>Page background</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="color" value={bgCol} onChange={e => setBgCol(e.target.value)} style={{ width: 40, height: 36, border: `1px solid ${C.border}`, borderRadius: 6, padding: 2 }} />
        <input style={{ ...input, flex: 1 }} value={bgCol} onChange={e => setBgCol(e.target.value)} />
      </div>
      <div style={{ height: 8 }} />
      <label style={label}>Heading font (theme slug or family)</label>
      <select style={input} value={headingFont} onChange={e => setHF(e.target.value)}>
        <option value="">— keep current —</option>
        {fonts.map((f: any) => <option key={f.slug} value={`var:preset|font-family|${f.slug}`}>{f.name || f.slug}</option>)}
      </select>
      <div style={{ height: 8 }} />
      <label style={label}>Body font</label>
      <select style={input} value={bodyFont} onChange={e => setBF(e.target.value)}>
        <option value="">— keep current —</option>
        {fonts.map((f: any) => <option key={f.slug} value={`var:preset|font-family|${f.slug}`}>{f.name || f.slug}</option>)}
      </select>
      <div style={{ height: 8 }} />
      <button
        style={btn}
        disabled={busy}
        onClick={() => {
          const body: any = {}
          if (primary !== cur.primary_color)        body.primary_color    = primary
          if (textCol !== (cur.text_color || ''))   body.text_color       = textCol
          if (bgCol   !== (cur.background_color || '')) body.background_color = bgCol
          if (headingFont && headingFont !== cur.heading_font) body.heading_font = headingFont
          if (bodyFont    && bodyFont    !== cur.body_font)    body.body_font    = bodyFont
          if (!Object.keys(body).length) return
          apply({ capability: 'theme.patch', body, label: `Theme styles → ${Object.keys(body).join(', ')}` })
        }}
      >Save theme styles</button>
    </div>
  )
}

function QuickFormPage({ state, apply, busy }: { state: StateResp; apply: (a: Action) => void; busy: boolean }) {
  const pages    = (state.pages.data?.pages as any[]) || []
  const homeId   = state.pages.data?.home_page_id || pages.find(p => p.is_home)?.id || pages[0]?.id
  const [pageId, setPageId] = useState<number>(homeId || 0)
  const [title,  setTitle]  = useState('')
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!pageId) { setPageId(homeId || 0); return }
    setLoaded(false)
    fetch(`/api/baseline/state?siteId=${state.siteId}`)
      .then(() => fetch(`/api/baseline/state?siteId=${state.siteId}`))   // ensure auth context warm
    // Load this specific page via state route would be ideal — simpler: hit the bridge via state actions list?
    // For now use a small lazy single-page fetch via apply's proxy is overkill, so reuse the pages list summary.
    const meta = pages.find((p: any) => p.id === pageId)
    setTitle(meta?.title || '')
    setContent('')   // we don't have content in the list — leave blank, only edit if user types
    setLoaded(true)
  }, [pageId, state.siteId, homeId, pages])

  if (!pages.length) {
    return (
      <div style={{ ...card, background: C.warnBg, borderColor: '#FDE68A' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Pages</div>
        <div style={{ fontSize: 13, color: C.warn }}>No pages found on this site yet.</div>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Edit a page</div>
      <label style={label}>Page</label>
      <select style={input} value={pageId} onChange={e => setPageId(Number(e.target.value))}>
        {pages.map((p: any) => (
          <option key={p.id} value={p.id}>{p.title}{p.is_home ? ' (home)' : ''}</option>
        ))}
      </select>
      <div style={{ height: 8 }} />
      <label style={label}>Title</label>
      <input style={input} value={title} onChange={e => setTitle(e.target.value)} disabled={!loaded} />
      <div style={{ height: 8 }} />
      <label style={label}>New content (optional — replaces existing)</label>
      <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} value={content} onChange={e => setContent(e.target.value)} placeholder="Leave empty to keep current content" />
      <div style={{ height: 8 }} />
      <button
        style={btn}
        disabled={busy || !pageId}
        onClick={() => {
          const body: any = {}
          const meta = pages.find((p: any) => p.id === pageId)
          if (title && title !== meta?.title) body.title = title
          if (content.trim()) body.content = content
          if (!Object.keys(body).length) return
          apply({ capability: 'pages.patch', pageRef: pageId, body, label: `Page #${pageId} → ${Object.keys(body).join(', ')}` })
        }}
      >Save page</button>
    </div>
  )
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const bgColor = turn.role === 'user' ? '#EEF3FA' : turn.role === 'result' ? (turn.text.startsWith('✓') ? C.goodBg : turn.text.startsWith('↶') ? '#F0FAF5' : C.badBg) : '#F7F5F2'
  const candidates: any[] | null = Array.isArray(turn.meta?.candidates) ? turn.meta.candidates : null
  return (
    <div style={{ background: bgColor, padding: 8, borderRadius: 6, fontSize: 13 }}>
      <div>{turn.text}</div>
      {candidates && candidates.length > 0 && (
        <div style={{ marginTop: 6, padding: 6, background: '#fff', borderRadius: 4, fontSize: 12 }}>
          <div style={{ color: C.mute, marginBottom: 4 }}>Candidates — open the Blocks tab to click one:</div>
          {candidates.slice(0, 8).map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: C.faint, minWidth: 28 }}>{c.path}</span>
              <span style={{ color: C.mute, minWidth: 80 }}>{(c.type || '').replace(/^core\//,'')}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.text || <em style={{ color: C.faint }}>(no text)</em>}</span>
            </div>
          ))}
        </div>
      )}
      {turn.meta && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ fontSize: 11, color: C.mute, cursor: 'pointer' }}>debug</summary>
          <pre style={{ fontSize: 11, overflowX: 'auto', background: '#fff', padding: 6, borderRadius: 4, marginTop: 4 }}>{JSON.stringify(turn.meta, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}

function ActionsList({ rows }: { rows: any[] }) {
  if (!rows.length) return <div style={{ fontSize: 13, color: C.mute }}>No actions logged yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
      {rows.map(a => (
        <details key={a.id} style={{ background: a.success ? C.goodBg : C.badBg, border: `1px solid ${a.success ? '#B8E5CF' : '#FECACA'}`, borderRadius: 6, padding: 6 }}>
          <summary style={{ cursor: 'pointer' }}>
            <strong>{a.capability}</strong>{a.success ? ' ✓' : ' ✗'}
            {a.ai_tokens > 0 && <span title={`${a.ai_tokens} AI tokens`} style={{ marginLeft: 4, padding: '0 4px', borderRadius: 3, background: C.warnBg, color: C.warn, fontSize: 10 }}>AI · {a.ai_tokens}t</span>}
            <span style={{ color: C.mute }}> · {a.duration_ms ?? '?'}ms · {a.created_at?.replace('T',' ').slice(0,19)}</span>
          </summary>
          <div style={{ marginTop: 4 }}>
            {a.intent_raw && <div><em>intent:</em> {a.intent_raw}</div>}
            {a.error && <div style={{ color: C.bad }}>error: {a.error}</div>}
            <div style={{ color: C.faint }}>change_id: {a.change_id}</div>
            {a.ai_tokens > 0 && <div style={{ color: C.warn }}>AI tokens: {a.ai_tokens}</div>}
            <details style={{ marginTop: 4 }}>
              <summary style={{ color: C.mute, cursor: 'pointer' }}>request/response</summary>
              <pre style={{ fontSize: 11, overflowX: 'auto', background: '#fff', padding: 6, borderRadius: 4 }}>{a.request}{"\n\n"}{a.response}</pre>
            </details>
          </div>
        </details>
      ))}
    </div>
  )
}

function SnapshotsList({ rows, siteId, onChange }: { rows: any[]; siteId: string; onChange: () => void }) {
  async function restore(id: number) {
    if (!confirm('Restore this snapshot? This will overwrite the current value.')) return
    const r = await fetch('/api/baseline/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, snapshotId: id }),
    })
    const d = await r.json()
    if (!d.success) alert('Restore failed: ' + (d.error || 'unknown'))
    onChange()
  }
  if (!rows.length) return <div style={{ fontSize: 13, color: C.mute }}>No snapshots yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
      {rows.map(s => (
        <div key={s.id} style={{ background: s.restored_at ? '#F7F5F2' : C.white, border: `1px solid ${C.border}`, borderRadius: 6, padding: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <strong>{s.description || s.target_type}</strong>
              <span style={{ color: C.mute }}> · {s.target_type}/{s.target_key}</span>
            </div>
            <button onClick={() => restore(s.id)} style={{ ...btnGhost, padding: '2px 8px', fontSize: 11 }} disabled={!!s.restored_at}>{s.restored_at ? 'restored' : 'restore'}</button>
          </div>
          <div style={{ color: C.faint, fontSize: 11 }}>{s.created_at?.replace('T',' ').slice(0,19)} · change {s.change_id?.slice(0,8)}</div>
          <details style={{ marginTop: 4 }}>
            <summary style={{ color: C.mute, cursor: 'pointer' }}>before / after</summary>
            <pre style={{ fontSize: 11, overflowX: 'auto', background: '#fff', padding: 6, borderRadius: 4 }}>BEFORE:{"\n"}{s.before_value}{"\n\n"}AFTER:{"\n"}{s.after_value}</pre>
          </details>
        </div>
      ))}
    </div>
  )
}

function StateDump({ state, lastApply }: { state: StateResp; lastApply: ApplyResp | null }) {
  return (
    <div style={{ fontSize: 12 }}>
      {lastApply && (
        <details open style={{ marginBottom: 8 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Last apply result</summary>
          <pre style={{ overflowX: 'auto', background: '#fff', padding: 6, borderRadius: 4 }}>{JSON.stringify(lastApply, null, 2)}</pre>
        </details>
      )}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Full site state</summary>
        <pre style={{ overflowX: 'auto', background: '#fff', padding: 6, borderRadius: 4 }}>{JSON.stringify(state, null, 2)}</pre>
      </details>
    </div>
  )
}

// ─── Phase 1: Media pane ───────────────────────────────────────────────────
function QuickFormMedia({ siteId, apply, busy }: { siteId: string; apply: (a: Action) => void; busy: boolean }) {
  const [media, setMedia]       = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [lastUploadId, setLastUploadId] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)

  const refreshMedia = useCallback(async () => {
    const r = await fetch(`/api/baseline/media?siteId=${siteId}&limit=12`).then(r => r.json())
    setMedia(r.media || [])
  }, [siteId])

  useEffect(() => { refreshMedia() }, [refreshMedia])

  const upload = async (file: File) => {
    setUploading(true); setUploadErr(null)
    try {
      const fd = new FormData()
      fd.append('siteId', siteId)
      fd.append('file', file)
      const r = await fetch('/api/baseline/media/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (!d.success) {
        setUploadErr(d.bridge?.data?.error || d.bridge?.error || d.error || 'upload_failed')
      } else {
        setLastUploadId(d.bridge?.data?.attachment_id || null)
        await refreshMedia()
      }
    } catch (e: any) {
      setUploadErr(e?.message || 'network_error')
    } finally {
      setUploading(false)
    }
  }

  const onFile = (f: File | null) => { if (f) upload(f) }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>Images</div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>Phase 1</span>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false)
          onFile(e.dataTransfer.files?.[0] || null)
        }}
        style={{
          border: `2px dashed ${drag ? C.accent : C.border}`,
          borderRadius: 6, padding: 16, textAlign: 'center',
          background: drag ? '#FFF7EC' : '#FAFAF8',
          fontSize: 13, color: C.mute, marginBottom: 10,
        }}
      >
        {uploading ? 'Uploading…' : drag ? 'Drop to upload' : 'Drop an image here or'}
        <div style={{ marginTop: 6 }}>
          <label style={{ ...btnGhost, display: 'inline-block', cursor: 'pointer' }}>
            Choose file
            <input
              type="file" accept="image/*" hidden
              onChange={e => onFile(e.target.files?.[0] || null)}
              disabled={uploading || busy}
            />
          </label>
        </div>
        {uploadErr && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.bad, background: C.badBg, padding: 6, borderRadius: 4 }}>
            {uploadErr}
          </div>
        )}
        {lastUploadId && !uploadErr && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.good }}>
            Uploaded · attachment #{lastUploadId}
          </div>
        )}
      </div>

      {/* Apply actions — use the most recent upload */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => apply({ capability: 'pages.featured_image', pageRef: 'home', attachmentRef: 'last_uploaded', label: 'Featured image on home → last uploaded' })}
          disabled={busy || media.length === 0}
          style={{ ...btnGhost, fontSize: 13 }}
        >
          Set as featured image (home)
        </button>
        <button
          onClick={() => apply({ capability: 'options.site_logo', attachmentRef: 'last_uploaded', label: 'Site logo → last uploaded' })}
          disabled={busy || media.length === 0}
          style={{ ...btnGhost, fontSize: 13 }}
        >
          Set as site logo
        </button>
        <button
          onClick={() => apply({ capability: 'pages.replace_first_image', pageRef: 'home', attachmentRef: 'last_uploaded', label: 'Replace first image on home' })}
          disabled={busy || media.length === 0}
          style={{ ...btnGhost, fontSize: 13 }}
        >
          Replace first image on home
        </button>
        <button
          onClick={() => apply({ capability: 'pages.featured_image', pageRef: 'home', attachmentRef: 'clear', label: 'Clear featured image on home' })}
          disabled={busy}
          style={{ ...btnGhost, fontSize: 12, color: C.mute }}
        >
          Clear featured image (home)
        </button>
      </div>

      {/* Recent uploads */}
      <div style={{ fontSize: 11, color: C.mute, marginBottom: 4 }}>Recent</div>
      {media.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>None yet.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {media.slice(0, 6).map(m => (
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer" title={m.title}>
            <img
              src={m.url}
              alt={m.alt || m.title}
              style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 4, border: `1px solid ${C.border}` }}
            />
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Phase 2: Blocks pane ──────────────────────────────────────────────────
function BlocksList({ rows, apply, busy }: { rows: any[]; apply: (a: Action) => void; busy: boolean }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft]     = useState('')

  if (!rows.length) {
    return <div style={{ fontSize: 12, color: C.mute }}>No blocks (or page didn't load). Click Refresh.</div>
  }

  const TEXT_EDITABLE = new Set([
    'core/heading', 'core/paragraph', 'core/button', 'core/list-item',
    'core/quote', 'core/preformatted', 'core/verse',
  ])

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ color: C.mute, marginBottom: 6 }}>{rows.length} blocks on home page · click a row to edit its text</div>
      {rows.map(b => {
        const isEditing  = editing === b.path
        const canEdit    = TEXT_EDITABLE.has(b.type)
        const indent     = (b.depth || 0) * 12
        const shortType  = b.type.replace(/^core\//, '')
        return (
          <div key={b.path} style={{
            paddingLeft: indent,
            borderBottom: `1px solid ${C.border}`,
            padding: '6px 4px 6px ' + (indent + 4) + 'px',
            cursor: canEdit ? 'pointer' : 'default',
            background: isEditing ? '#FFF7EC' : 'transparent',
          }}
          onClick={() => {
            if (!canEdit) return
            if (isEditing) { setEditing(null); setDraft(''); return }
            setEditing(b.path); setDraft(b.text || '')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.faint, minWidth: 28 }}>{b.path}</span>
              <span style={{ fontSize: 11, color: C.mute, minWidth: 80 }}>{shortType}</span>
              <span style={{ flex: 1, color: canEdit ? C.text : C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.text || <em style={{ color: C.faint }}>(no text)</em>}
              </span>
            </div>
            {isEditing && (
              <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={3}
                  style={{ ...input, fontSize: 13 }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    onClick={() => {
                      apply({
                        capability: 'blocks.patch',
                        pageRef: 'home',
                        target: { kind: 'path', path: b.path },
                        op: { type: 'set_text', value: draft },
                        label: `${shortType} ${b.path} → "${draft.slice(0, 40)}${draft.length > 40 ? '…' : ''}"`,
                      })
                      setEditing(null)
                    }}
                    disabled={busy || draft === b.text}
                    style={{ ...btn, fontSize: 12 }}
                  >Save text</button>
                  <button
                    onClick={() => { setEditing(null); setDraft('') }}
                    style={{ ...btnGhost, fontSize: 12 }}
                  >Cancel</button>
                </div>

                <BlockStyleControls blockPath={b.path} blockType={b.type} apply={apply} busy={busy} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Phase 3: per-block style controls inside BlocksList ───────────────────
function BlockStyleControls({ blockPath, blockType, apply, busy }: { blockPath: string; blockType: string; apply: (a: Action) => void; busy: boolean }) {
  const [textColor, setTextColor] = useState('#000000')
  const [bgColor,   setBgColor]   = useState('#ffffff')
  const [padding,   setPadding]   = useState('')
  const [fontSize,  setFontSize]  = useState('')

  const isButton = blockType === 'core/button'
  const supportsText = ['core/heading','core/paragraph','core/button','core/list-item','core/quote'].includes(blockType)
  const supportsBg   = ['core/heading','core/paragraph','core/button','core/group','core/cover','core/list-item','core/quote'].includes(blockType)
  const supportsPad  = ['core/heading','core/paragraph','core/button','core/group','core/list-item','core/quote'].includes(blockType)
  const supportsFont = ['core/heading','core/paragraph','core/button','core/list-item','core/quote'].includes(blockType)

  const setStyle = (category: 'color'|'spacing'|'typography', name: string, value: any) =>
    apply({
      capability: 'blocks.patch',
      pageRef: 'home',
      target: { kind: 'path', path: blockPath },
      op: { type: 'set_style', category, name, value },
      label: `${blockType.replace(/^core\//,'')} ${category}.${name} → ${typeof value === 'string' ? value : JSON.stringify(value)}`,
    })

  const clearStyle = (category: 'color'|'spacing'|'typography', name: string) =>
    apply({
      capability: 'blocks.patch',
      pageRef: 'home',
      target: { kind: 'path', path: blockPath },
      op: { type: 'clear_style', category, name },
      label: `clear ${blockType.replace(/^core\//,'')} ${category}.${name}`,
    })

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 4 }
  const lbl: React.CSSProperties = { color: C.mute, minWidth: 56 }
  const btnSm: React.CSSProperties = { ...btn, fontSize: 11, padding: '3px 8px' }
  const btnSmG: React.CSSProperties = { ...btnGhost, fontSize: 11, padding: '3px 8px' }

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.mute, marginBottom: 4 }}>Block styles</div>

      {supportsText && (
        <div style={row}>
          <span style={lbl}>Text color</span>
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} disabled={busy}
                 style={{ width: 32, height: 22, border: `1px solid ${C.border}`, borderRadius: 4, padding: 0 }} />
          <button onClick={() => setStyle('color', 'text', textColor)} disabled={busy} style={btnSm}>Apply</button>
          <button onClick={() => clearStyle('color', 'text')} disabled={busy} style={btnSmG}>Clear</button>
        </div>
      )}

      {supportsBg && (
        <div style={row}>
          <span style={lbl}>{isButton ? 'Button bg' : 'Background'}</span>
          <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} disabled={busy}
                 style={{ width: 32, height: 22, border: `1px solid ${C.border}`, borderRadius: 4, padding: 0 }} />
          <button onClick={() => setStyle('color', 'background', bgColor)} disabled={busy} style={btnSm}>Apply</button>
          <button onClick={() => clearStyle('color', 'background')} disabled={busy} style={btnSmG}>Clear</button>
        </div>
      )}

      {supportsPad && (
        <div style={row}>
          <span style={lbl}>Padding</span>
          <input value={padding} onChange={e => setPadding(e.target.value)} placeholder="24px"
                 disabled={busy} style={{ ...input, fontSize: 12, padding: '3px 6px', width: 70 }} />
          <button onClick={() => setStyle('spacing', 'padding', padding)} disabled={busy || !padding} style={btnSm}>Apply</button>
          <button onClick={() => clearStyle('spacing', 'padding')} disabled={busy} style={btnSmG}>Clear</button>
        </div>
      )}

      {supportsFont && (
        <div style={row}>
          <span style={lbl}>Font size</span>
          <input value={fontSize} onChange={e => setFontSize(e.target.value)} placeholder="18px"
                 disabled={busy} style={{ ...input, fontSize: 12, padding: '3px 6px', width: 70 }} />
          <button onClick={() => setStyle('typography', 'fontSize', fontSize)} disabled={busy || !fontSize} style={btnSm}>Apply</button>
          <button onClick={() => clearStyle('typography', 'fontSize')} disabled={busy} style={btnSmG}>Clear</button>
        </div>
      )}
    </div>
  )
}

// ─── Phase 6B/6C/6D/6E: Elementor element tree + doc picker ────────────────
function ElementorList({ rows, info, apply, busy, templates, targetDoc, setTargetDoc }: {
  rows: any[]; info: { built: boolean; version: string | null; hint: string | null };
  apply: (a: Action) => void; busy: boolean;
  templates: Record<string, any[]>;
  targetDoc: { ref: 'home' | number; label: string };
  setTargetDoc: (d: { ref: 'home' | number; label: string }) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft]     = useState('')

  // pageRef the edits should target: 'home' or the selected template's numeric id
  const pageRef: 'home' | number = targetDoc.ref

  // Build doc options: Home + every template grouped by type
  const docOptions: { ref: 'home' | number; label: string }[] = [{ ref: 'home', label: 'Home page' }]
  for (const [type, list] of Object.entries(templates)) {
    for (const tpl of (list as any[])) {
      docOptions.push({ ref: tpl.id as number, label: `${type}: ${tpl.title}` })
    }
  }

  const Picker = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: C.mute }}>Editing</span>
      <select
        value={String(targetDoc.ref)}
        onChange={e => {
          const v = e.target.value
          const opt = docOptions.find(o => String(o.ref) === v) || docOptions[0]
          setTargetDoc(opt)
        }}
        style={{ ...input, fontSize: 12, padding: '3px 6px', flex: 1 }}
        disabled={busy}
      >
        {docOptions.map(o => <option key={String(o.ref)} value={String(o.ref)}>{o.label}</option>)}
      </select>
    </div>
  )

  if (!info.built) {
    return (
      <div style={{ fontSize: 12, color: C.mute }}>
        {docOptions.length > 1 && Picker}
        <div style={{ marginBottom: 6 }}>This document isn't built with Elementor.</div>
        {info.hint && <div style={{ color: C.faint }}>{info.hint}</div>}
        <div style={{ marginTop: 8, color: C.faint }}>If it should be, click Refresh after loading the page once in WP.</div>
      </div>
    )
  }

  const TEXT_EDITABLE = new Set(['heading', 'text-editor', 'button', 'icon-box', 'image-box', 'testimonial', 'alert', 'call-to-action'])
  const isWidget = (r: any) => r.elType === 'widget'

  return (
    <div style={{ fontSize: 12 }}>
      {Picker}
      {!rows.length && <div style={{ color: C.mute }}>No elements parsed. Click Refresh.</div>}
      <div style={{ color: C.mute, marginBottom: 6 }}>
        {rows.length} Elementor elements{info.version ? ` · v${info.version}` : ''}
        <span style={{ color: C.faint }}> · click a widget to edit</span>
      </div>
      {rows.map(r => {
        const indent = (r.depth || 0) * 12
        const structural = !isWidget(r)
        const canEdit = isWidget(r) && TEXT_EDITABLE.has(r.widgetType) && r.id
        const key = r.path + (r.id || '')
        const isEditing = editing === key
        return (
          <div key={key} style={{
            paddingLeft: indent + 4,
            padding: '5px 4px 5px ' + (indent + 4) + 'px',
            borderBottom: `1px solid ${C.border}`,
            background: isEditing ? '#FFF7EC' : (structural ? '#FAFAF8' : 'transparent'),
            cursor: canEdit ? 'pointer' : 'default',
          }}
          onClick={() => {
            if (!canEdit) return
            if (isEditing) { setEditing(null); setDraft(''); return }
            setEditing(key); setDraft(r.text || '')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.faint, minWidth: 34 }}>{r.path}</span>
              <span style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 3,
                background: structural ? C.border : C.warnBg, color: structural ? C.mute : C.accent,
                minWidth: 64, textAlign: 'center',
              }}>{r.label}</span>
              <span style={{ flex: 1, color: r.text ? C.text : C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.text || (structural ? '' : <em style={{ color: C.faint }}>(no text)</em>)}
              </span>
              {r.id && <span style={{ fontSize: 9, color: C.faint }}>#{r.id}</span>}
            </div>
            {isEditing && (
              <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} style={{ ...input, fontSize: 13 }} autoFocus />
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    onClick={() => {
                      apply({
                        capability: 'elementor.patch',
                        pageRef,
                        target: { kind: 'id', id: r.id },
                        op: { type: 'set_text', value: draft },
                        label: `${r.widgetType} #${r.id} → "${draft.slice(0, 40)}${draft.length > 40 ? '…' : ''}"`,
                      })
                      setEditing(null)
                    }}
                    disabled={busy || draft === r.text}
                    style={{ ...btn, fontSize: 12 }}
                  >Save text</button>
                  <button onClick={() => { setEditing(null); setDraft('') }} style={{ ...btnGhost, fontSize: 12 }}>Cancel</button>
                </div>
                <ElementorStyleControls elId={r.id} widgetType={r.widgetType} apply={apply} busy={busy} pageRef={pageRef} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Phase 6D: per-Elementor-widget style controls ────────────────────────
function ElementorStyleControls({ elId, widgetType, apply, busy, pageRef }: { elId: string; widgetType: string; apply: (a: Action) => void; busy: boolean; pageRef: 'home' | number }) {
  const [textColor, setTextColor] = useState('#000000')
  const [bgColor,   setBgColor]   = useState('#ffffff')
  const [padding,   setPadding]   = useState('')
  const [fontSize,  setFontSize]  = useState('')

  const hasType = ['heading','text-editor','button','icon-box','image-box','testimonial','alert','call-to-action'].includes(widgetType)
  const isButton = widgetType === 'button'

  const setStyle = (category: 'color'|'spacing'|'typography', name: string, value: any) =>
    apply({
      capability: 'elementor.patch', pageRef,
      target: { kind: 'id', id: elId },
      op: { type: 'set_style', category, name, value },
      label: `${widgetType} #${elId} ${category}.${name} → ${typeof value === 'string' ? value : JSON.stringify(value)}`,
    })
  const clearStyle = (category: 'color'|'spacing'|'typography', name: string) =>
    apply({
      capability: 'elementor.patch', pageRef,
      target: { kind: 'id', id: elId },
      op: { type: 'clear_style', category, name },
      label: `clear ${widgetType} #${elId} ${category}.${name}`,
    })

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 4 }
  const lbl: React.CSSProperties = { color: C.mute, minWidth: 56 }
  const btnSm: React.CSSProperties = { ...btn, fontSize: 11, padding: '3px 8px' }
  const btnSmG: React.CSSProperties = { ...btnGhost, fontSize: 11, padding: '3px 8px' }

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.mute, marginBottom: 4 }}>Widget styles</div>
      {hasType && (
        <div style={row}>
          <span style={lbl}>Text color</span>
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} disabled={busy}
                 style={{ width: 32, height: 22, border: `1px solid ${C.border}`, borderRadius: 4, padding: 0 }} />
          <button onClick={() => setStyle('color', 'text', textColor)} disabled={busy} style={btnSm}>Apply</button>
          <button onClick={() => clearStyle('color', 'text')} disabled={busy} style={btnSmG}>Clear</button>
        </div>
      )}
      <div style={row}>
        <span style={lbl}>{isButton ? 'Button bg' : 'Background'}</span>
        <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} disabled={busy}
               style={{ width: 32, height: 22, border: `1px solid ${C.border}`, borderRadius: 4, padding: 0 }} />
        <button onClick={() => setStyle('color', 'background', bgColor)} disabled={busy} style={btnSm}>Apply</button>
        <button onClick={() => clearStyle('color', 'background')} disabled={busy} style={btnSmG}>Clear</button>
      </div>
      <div style={row}>
        <span style={lbl}>Padding</span>
        <input value={padding} onChange={e => setPadding(e.target.value)} placeholder="24px" disabled={busy} style={{ ...input, fontSize: 12, padding: '3px 6px', width: 70 }} />
        <button onClick={() => setStyle('spacing', 'padding', padding)} disabled={busy || !padding} style={btnSm}>Apply</button>
        <button onClick={() => clearStyle('spacing', 'padding')} disabled={busy} style={btnSmG}>Clear</button>
      </div>
      {hasType && (
        <div style={row}>
          <span style={lbl}>Font size</span>
          <input value={fontSize} onChange={e => setFontSize(e.target.value)} placeholder="18px" disabled={busy} style={{ ...input, fontSize: 12, padding: '3px 6px', width: 70 }} />
          <button onClick={() => setStyle('typography', 'fontSize', fontSize)} disabled={busy || !fontSize} style={btnSm}>Apply</button>
          <button onClick={() => clearStyle('typography', 'fontSize')} disabled={busy} style={btnSmG}>Clear</button>
        </div>
      )}
    </div>
  )
}
