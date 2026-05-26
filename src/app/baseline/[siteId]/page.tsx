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
  const [tab, setTab]       = useState<'actions' | 'snapshots' | 'state'>('actions')
  const [actions, setActions]     = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [lastApply, setLastApply] = useState<ApplyResp | null>(null)

  const refreshState = useCallback(async () => {
    if (!siteId) return
    const r = await fetch(`/api/baseline/state?siteId=${siteId}`)
    const d = await r.json() as StateResp
    setState(d)
  }, [siteId])

  const refreshDebug = useCallback(async () => {
    if (!siteId) return
    const [aRes, sRes] = await Promise.all([
      fetch(`/api/baseline/actions?siteId=${siteId}&limit=30`).then(r => r.json()),
      fetch(`/api/baseline/snapshots?siteId=${siteId}&limit=30`).then(r => r.json()),
    ])
    setActions(aRes.actions || [])
    setSnapshots(sRes.snapshots || [])
  }, [siteId])

  useEffect(() => { refreshState(); refreshDebug() }, [refreshState, refreshDebug])

  // ─── Apply an Action ──
  async function apply(action: Action, intent?: string) {
    setBusy(true)
    setChat(c => [...c, { role: 'system', text: `Applying: ${action.label}` }])
    const r = await fetch('/api/baseline/apply', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ siteId, action, intent: intent || action.label }),
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
    await apply(d.action, text)
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
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Chat (regex parser, no AI in Phase 0)</div>
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
              {(['actions', 'snapshots', 'state'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{ ...btnGhost, flex: 1, background: tab === t ? C.text : 'transparent', color: tab === t ? C.white : C.text, textTransform: 'capitalize' }}
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
  const isBlock = state.theme.data?.is_block_theme
  const cur     = state.theme.data?.current || {}
  const fonts   = state.theme.data?.font_families || []
  const [primary,  setPrimary]  = useState(cur.primary_color || '#000000')
  const [textCol,  setTextCol]  = useState(cur.text_color    || '#000000')
  const [bgCol,    setBgCol]    = useState(cur.background_color || '#ffffff')
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

  if (!isBlock) {
    return (
      <div style={{ ...card, background: C.warnBg, borderColor: '#FDE68A' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Theme styles</div>
        <div style={{ fontSize: 13, color: C.warn }}>The active theme is not a block theme. Theme color/font editing requires a block theme (e.g. Twenty Twenty-Five). Phase 0 does not yet fall back to global CSS.</div>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Theme styles (Gutenberg global styles)</div>

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
  return (
    <div style={{ background: bgColor, padding: 8, borderRadius: 6, fontSize: 13 }}>
      <div>{turn.text}</div>
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
            <strong>{a.capability}</strong>{a.success ? ' ✓' : ' ✗'} <span style={{ color: C.mute }}>· {a.duration_ms ?? '?'}ms · {a.created_at?.replace('T',' ').slice(0,19)}</span>
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
