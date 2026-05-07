'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Color palettes ───────────────────────────────────────────────
const PALETTES = [
  { name: 'Ocean Blue',       colors: ['#1B3A6B','#2D7DD2','#97C8EB'] },
  { name: 'Forest Green',     colors: ['#1A3A2A','#2D7A4A','#7BC47F'] },
  { name: 'Sunset Orange',    colors: ['#8B1A1A','#E8651A','#F5C842'] },
  { name: 'Royal Purple',     colors: ['#2D1B69','#6B3FA0','#B794F4'] },
  { name: 'Charcoal Modern',  colors: ['#1A1A2E','#16213E','#E94560'] },
  { name: 'Earthy Warm',      colors: ['#3D2B1F','#8B5E3C','#D4A76A'] },
  { name: 'Sky Fresh',        colors: ['#0F4C75','#1B97C2','#B3E5FC'] },
  { name: 'Rose Gold',        colors: ['#7D1D3F','#C84B7A','#F4A5C0'] },
  { name: 'Slate Pro',        colors: ['#1E293B','#334155','#94A3B8'] },
  { name: 'Lime Energy',      colors: ['#1A3400','#4D7C0F','#A3E635'] },
  { name: 'Midnight Navy',    colors: ['#0A0F2C','#1E3A8A','#60A5FA'] },
  { name: 'Rust & Cream',     colors: ['#7C2D12','#C2410C','#FDE68A'] },
  { name: 'Teal Minimal',     colors: ['#0F3460','#0F766E','#5EEAD4'] },
  { name: 'Bold Red',         colors: ['#450A0A','#B91C1C','#FCA5A5'] },
  { name: 'Golden Hour',      colors: ['#78350F','#D97706','#FCD34D'] },
  { name: 'Deep Plum',        colors: ['#3B0764','#7E22CE','#DDD6FE'] },
  { name: 'Tropical',         colors: ['#0C4A6E','#0891B2','#67E8F9'] },
  { name: 'Sage & Stone',     colors: ['#1C2526','#4D6A6D','#A8B5A2'] },
  { name: 'Copper Luxe',      colors: ['#431407','#92400E','#D97706'] },
  { name: 'Classic Black',    colors: ['#000000','#374151','#D1D5DB'] },
]

const C = {
  accent: '#E8651A', text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
  sidebar: '#1A1410',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
}

// AI follow-up context
interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  suggestions?: string[]
  action?: any
  status?: 'pending' | 'done' | 'error'
  result?: string
}

function BuilderInner() {
  const params  = useSearchParams()
  const siteUrl = params.get('site') || ''
  const apiKey  = params.get('key')  || ''
  const pageId  = params.get('page') || ''

  const cleanUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`

  const [pages, setPages]             = useState<any[]>([])
  const [currentPage, setCurrentPage] = useState<any | null>(null)
  const [siteInfo, setSiteInfo]       = useState<any>(null)
  const [messages, setMessages]       = useState<ConversationTurn[]>([])
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const [iframeKey, setIframeKey]     = useState(0)
  const [previewMode, setPreviewMode] = useState<'desktop'|'mobile'>('desktop')
  const [hasChanges, setHasChanges]   = useState(false)
  const [saving, setSaving]           = useState(false)
  const [sidebarTab, setSidebarTab]   = useState<'palette'|'pages'|'settings'>('pages')
  const [selectedPalette, setSelectedPalette] = useState<typeof PALETTES[0] | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef  = useRef<HTMLDivElement>(null)

  useEffect(() => { loadSiteData() }, [siteUrl, apiKey])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function bridge(endpoint: string, method = 'GET', body?: any) {
    const res = await fetch('/api/wordpress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: cleanUrl, apiKey, endpoint, method, body }),
    })
    return res.json()
  }

  async function loadSiteData() {
    const [infoRes, pagesRes] = await Promise.all([bridge('site'), bridge('pages')])
    if (infoRes.success) setSiteInfo(infoRes.data?.site ? infoRes.data : infoRes.data?.data || infoRes.data)
    if (pagesRes.success) {
      const raw = pagesRes.data?.pages || pagesRes.data?.data?.pages || []
      setPages(raw)
      const target = raw.find((p: any) => p.id === parseInt(pageId)) || raw.find((p: any) => p.slug === 'home' || p.slug === '' || p.id === 2)
      if (target) setCurrentPage(target)
      else if (raw[0]) setCurrentPage(raw[0])
    }

    setMessages([{
      role: 'assistant',
      content: 'I\'m in Page Builder mode. I can see your site\'s pages and make changes via AI.\n\nTell me what you want to change — colors, content, layout, a new section — or just describe the look you\'re going for.',
      suggestions: ['Make the main color darker', 'Add a special offer banner at the top', 'Refresh the homepage content', 'Move the service boxes higher', 'I want a completely different look'],
    }])
  }

  async function sendMessage(text?: string) {
    const msg = (text || input).trim()
    if (!msg || sending) return

    const userTurn: ConversationTurn = { role: 'user', content: msg }
    setMessages(prev => [...prev, userTurn])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)

    try {
      const ctx = {
        site_url:   cleanUrl, site_name: siteInfo?.site?.name,
        theme:      siteInfo?.theme?.name, builder: siteInfo?.builder?.[0]?.name,
        current_page: { id: currentPage?.id, title: currentPage?.title, slug: currentPage?.slug, url: currentPage?.link },
        all_pages:  pages.map(p => ({ id: p.id, title: p.title, slug: p.slug })),
        active_plugins: (siteInfo?.plugins || []).filter((p: any) => p.active !== false).map((p: any) => p.name),
        mode: 'page_builder',
      }

      const history = messages.concat(userTurn).map(m => ({ role: m.role, content: m.content }))
      const res  = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, siteContext: ctx }),
      })
      const data = await res.json()

      const aiTurn: ConversationTurn = {
        role: 'assistant', content: data.text || 'Done!', action: data.action,
        suggestions: parseSuggestions(data.text),
        status: data.action ? 'pending' : 'done',
      }
      setMessages(prev => [...prev, aiTurn])

      if (data.action) {
        await executeAction(data.action, aiTurn)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    } finally {
      setSending(false)
    }
  }

  function parseSuggestions(text: string): string[] {
    // Extract bullet points or numbered lists from AI response as clickable suggestions
    const matches = text.match(/(?:^|\n)[•\-\*]?\s*(.{10,60})(?:\n|$)/g)
    if (!matches) return []
    return matches.slice(0, 4).map(m => m.replace(/^[\n•\-\*\s]+/, '').trim()).filter(s => s.length > 10)
  }

  async function executeAction(action: any, turn: ConversationTurn) {
    let result = ''
    try {
      switch (action.type) {
        case 'update_page': {
          const r = await bridge(`pages/${action.pageId || currentPage?.id}`, 'PATCH', {
            title: action.title, content: action.content, status: action.status,
          })
          result = r.success ? '✓ Page updated' : `✗ ${r.error}`
          if (r.success) { setHasChanges(true); refreshPreview() }
          break
        }
        case 'update_site_options': {
          const r = await bridge('settings', 'PATCH', { blogname: action.blogname, blogdescription: action.blogdescription })
          result = r.success ? '✓ Site settings updated' : `✗ ${r.error}`
          break
        }
        case 'install_theme': {
          const r = await bridge('themes/install', 'POST', { slug: action.slug, activate: true })
          result = r.success ? `✓ Theme "${action.name}" installed and activated` : `✗ ${r.error}`
          if (r.success) refreshPreview()
          break
        }
        case 'inject_css': {
          const r = await bridge(`pages/${currentPage?.id}`, 'PATCH', {
            content: (currentPage?.content?.raw || '') + `\n<style>${action.css}</style>`,
          })
          result = r.success ? '✓ Styles applied' : `✗ ${r.error}`
          if (r.success) { setHasChanges(true); refreshPreview() }
          break
        }
        default:
          result = `Action "${action.type}" acknowledged`
      }
    } catch (e: any) { result = `✗ Error: ${e.message}` }

    setMessages(prev => prev.map(m => m === turn ? { ...m, status: result.startsWith('✓') ? 'done' : 'error', result } : m))
  }

  function refreshPreview() {
    setIframeKey(k => k + 1)
  }

  async function savePage() {
    if (!currentPage) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setHasChanges(false)
  }

  const previewUrl = currentPage?.link || cleanUrl

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' as const, background: C.surface }}>

      {/* ── TOP BAR ── */}
      <div style={{ height: 52, background: C.white, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0, gap: 12 }}>
        {/* Back + Page selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href={`/dashboard?site=${encodeURIComponent(siteUrl)}&key=${encodeURIComponent(apiKey)}`} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.text2, textDecoration: 'none', fontSize: 14,
          }}>← Back</a>

          <select value={currentPage?.id || ''} onChange={e => { const p = pages.find(pg => pg.id === parseInt(e.target.value)); if (p) setCurrentPage(p) }}
            style={{ padding: '7px 12px', border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 15, fontFamily: 'Poppins, sans-serif', color: C.text, background: 'white', cursor: 'pointer', maxWidth: 220 }}>
            <option value="">Select page…</option>
            {pages.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>

          {currentPage?.link && (
            <a href={currentPage.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.text3, textDecoration: 'none' }}>↗ {currentPage.link}</a>
          )}
        </div>

        {/* Center: preview mode */}
        <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden' }}>
          {(['desktop','mobile'] as const).map(m => (
            <button key={m} onClick={() => setPreviewMode(m)} style={{
              padding: '6px 14px', border: 'none', cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
              fontSize: 13, fontWeight: previewMode===m?600:400,
              background: previewMode===m?C.sidebar:'white',
              color: previewMode===m?'white':C.text2,
            }}>
              {m === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}
            </button>
          ))}
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {hasChanges && (
            <div style={{ fontSize: 13, color: C.yellow, display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.yellow }}/>
              Unsaved changes
            </div>
          )}
          <button onClick={() => refreshPreview()} style={{ padding: '7px 13px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'white', color: C.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            ↺ Refresh
          </button>
          <button onClick={savePage} disabled={saving} style={{ padding: '7px 16px', background: C.green, border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            {saving ? 'Saving…' : '✓ Save'}
          </button>
          <button style={{ padding: '7px 16px', background: C.accent, border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            Publish →
          </button>
        </div>
      </div>

      {/* ── MAIN BUILDER AREA ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{ width: 260, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' as const }}>

          {/* Sidebar tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
            {([
              { id: 'pages',    label: '📄 Pages' },
              { id: 'palette',  label: '🎨 Style' },
              { id: 'settings', label: '⚙ Site' },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setSidebarTab(tab.id)} style={{
                flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: sidebarTab===tab.id?600:400,
                background: 'transparent', color: sidebarTab===tab.id?C.accent:C.text3,
                borderBottom: `2px solid ${sidebarTab===tab.id?C.accent:'transparent'}`, marginBottom: -1,
                fontFamily: 'Poppins, sans-serif',
              }}>{tab.label}</button>
            ))}
          </div>

          {/* Pages list */}
          {sidebarTab === 'pages' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {pages.map(page => (
                <div key={page.id}
                  onClick={() => setCurrentPage(page)}
                  style={{
                    padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
                    background: currentPage?.id===page.id?C.accentDim:'transparent',
                    borderLeft: `2px solid ${currentPage?.id===page.id?C.accent:'transparent'}`,
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => { if(currentPage?.id!==page.id) e.currentTarget.style.background=C.surface }}
                  onMouseLeave={e => { if(currentPage?.id!==page.id) e.currentTarget.style.background='transparent' }}
                >
                  <span style={{ fontSize: 15 }}>📄</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: currentPage?.id===page.id?600:400, color: C.text }}>{page.title}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>/{page.slug}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '8px 16px', borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                <button onClick={() => sendMessage('Create a new page — ask me what it should be called and what content to put on it')} style={{ width: '100%', padding: '8px', border: `1.5px dashed ${C.border}`, borderRadius: 9, background: 'transparent', color: C.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  + New page with AI
                </button>
              </div>
            </div>
          )}

          {/* Color palettes */}
          {sidebarTab === 'palette' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 12 }}>Color Palette</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {PALETTES.map(palette => (
                  <div key={palette.name}
                    onClick={() => {
                      setSelectedPalette(palette)
                      sendMessage(`Apply the "${palette.name}" color palette to my site. The primary color is ${palette.colors[0]}, secondary is ${palette.colors[1]}, and accent is ${palette.colors[2]}.`)
                    }}
                    style={{
                      padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                      border: `1.5px solid ${selectedPalette?.name===palette.name?C.accent:C.border}`,
                      background: selectedPalette?.name===palette.name?C.accentDim:'white',
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      {palette.colors.map(color => (
                        <div key={color} style={{ width: 18, height: 18, borderRadius: '50%', background: color, border: '1.5px solid rgba(0,0,0,0.1)' }}/>
                      ))}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{palette.name}</span>
                    {selectedPalette?.name===palette.name && <span style={{ marginLeft: 'auto', fontSize: 13, color: C.accent }}>✓</span>}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, padding: '12px', background: C.surface, borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Let AI choose</div>
                <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5, marginBottom: 8 }}>Describe the vibe and AI will pick the perfect palette</div>
                <button onClick={() => sendMessage('Analyze my site and recommend the best color palette for my industry and brand. Apply it if I approve.')} style={{ width: '100%', padding: '8px', background: C.accent, border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  ✦ AI Pick Colors
                </button>
              </div>
            </div>
          )}

          {/* Site settings */}
          {sidebarTab === 'settings' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 12 }}>Site Settings</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                {[
                  { label: 'Site Name', value: siteInfo?.site?.name },
                  { label: 'Tagline', value: siteInfo?.site?.description },
                  { label: 'Theme', value: siteInfo?.theme?.name },
                  { label: 'Builder', value: siteInfo?.builder?.[0]?.name || 'Gutenberg' },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ fontSize: 12, color: C.text3, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
                    <div style={{ fontSize: 14, color: C.text, fontWeight: 500, padding: '8px 10px', background: C.surface, borderRadius: 7 }}>{item.value || '—'}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                <button onClick={() => sendMessage('I want to change my WordPress theme. Show me options that fit my type of business.')} style={{ padding: '10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', fontWeight: 500, textAlign: 'left' as const }}>
                  🎨 Change Theme
                </button>
                <button onClick={() => sendMessage('Update my site name and tagline — ask me what they should be.')} style={{ padding: '10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', fontWeight: 500, textAlign: 'left' as const }}>
                  ✏ Update Site Name & Tagline
                </button>
                <button onClick={() => sendMessage('Upload a logo for my site — tell me what format to use and how to update it.')} style={{ padding: '10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', fontWeight: 500, textAlign: 'left' as const }}>
                  🖼 Update Logo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── CENTER: AI CHAT ── */}
        <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.white, display: 'flex', flexDirection: 'column' as const }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 15 }}>✦</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>AI Page Editor</div>
              <div style={{ fontSize: 12, color: C.text3 }}>Describe changes in plain English</div>
            </div>
          </div>

          {/* Chat messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ animation: 'fadeIn 0.2s ease' }}>
                <div style={{
                  display: 'flex', flexDirection: msg.role==='user'?'row-reverse':'row', gap: 8,
                }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: msg.role==='user'?C.accent:C.sidebar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white', fontWeight: 600, marginTop: 2 }}>
                    {msg.role==='user'?'U':'✦'}
                  </div>
                  <div style={{ maxWidth: '85%' }}>
                    <div style={{
                      padding: '10px 13px', borderRadius: 13, fontSize: 14, lineHeight: 1.6,
                      background: msg.role==='user'?C.accent:C.surface,
                      color: msg.role==='user'?'white':C.text,
                      border: msg.role==='user'?'none':`1px solid ${C.border}`,
                      ...(msg.role==='user'?{borderTopRightRadius:3}:{borderTopLeftRadius:3}),
                    }}>
                      {msg.content.split('\n').map((l,li) => <div key={li} style={{ marginBottom: li<msg.content.split('\n').length-1?4:0 }}>{l.replace(/\*\*(.*?)\*\*/g,'$1')}</div>)}
                    </div>
                    {/* Action status */}
                    {msg.status === 'pending' && !msg.result && (
                      <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 7, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, fontSize: 13, color: C.yellow, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, border: `2px solid ${C.yellowBorder}`, borderTopColor: C.yellow, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
                        Applying changes…
                      </div>
                    )}
                    {msg.result && (
                      <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, background: msg.result.startsWith('✓')?C.greenBg:C.redBg, border: `1px solid ${msg.result.startsWith('✓')?C.greenBorder:C.redBorder}`, color: msg.result.startsWith('✓')?C.green:C.red }}>
                        {msg.result}
                      </div>
                    )}
                  </div>
                </div>

                {/* Clickable suggestions */}
                {msg.role==='assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                  <div style={{ marginTop: 8, marginLeft: 34, display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                    {msg.suggestions.map((s, si) => (
                      <button key={si} onClick={() => sendMessage(s)} style={{
                        padding: '7px 11px', border: `1px solid ${C.border}`, borderRadius: 8,
                        background: 'white', color: C.text2, fontSize: 13, cursor: 'pointer',
                        textAlign: 'left' as const, fontFamily: 'Poppins, sans-serif',
                        transition: 'all 0.1s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor=C.accent; e.currentTarget.style.color=C.accent }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text2 }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.sidebar, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12 }}>✦</div>
                <div style={{ padding: '11px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, borderTopLeftRadius: 3 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.text3, animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>

          {/* Input */}
          <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 8, border: `1.5px solid ${C.border}`, borderRadius: 13, padding: '6px 6px 6px 12px', transition: 'border-color 0.2s', background: C.surface }}
              onFocusCapture={e => e.currentTarget.style.borderColor=C.accent}
              onBlurCapture={e => e.currentTarget.style.borderColor=C.border}
            >
              <textarea ref={textareaRef} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,100)+'px' }}
                onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()} }}
                placeholder="e.g. Make the heading darker, add a promo banner…"
                rows={2} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, fontFamily: 'Poppins, sans-serif', color: C.text, resize: 'none', lineHeight: 1.5, padding: '4px 0' }}
              />
              <button onClick={() => sendMessage()} disabled={sending||!input.trim()} style={{
                alignSelf: 'flex-end', width: 34, height: 34, borderRadius: 9, border: 'none', flexShrink: 0,
                background: sending||!input.trim()?C.border:C.accent, cursor: sending||!input.trim()?'not-allowed':'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="15" height="15" viewBox="0 0 20 20" fill="white"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: IFRAME PREVIEW ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, background: '#E8E4DF' }}>
          {/* Preview header */}
          <div style={{ padding: '8px 16px', background: C.white, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['#FF5F57','#FFBD2E','#28CA41'].map(color => (
                <div key={color} style={{ width: 10, height: 10, borderRadius: '50%', background: color }}/>
              ))}
            </div>
            <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 12px', fontSize: 13, color: C.text3, fontFamily: 'monospace' }}>
              {previewUrl}
            </div>
            <div style={{ fontSize: 12, color: C.text3 }}>Live preview</div>
          </div>

          {/* iframe */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflow: 'auto' }}>
            <div style={{
              width: previewMode==='mobile'?390:'100%', maxWidth: previewMode==='desktop'?'100%':390,
              height: '100%', minHeight: 600, background: C.white, borderRadius: 8,
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)', overflow: 'hidden', position: 'relative',
            }}>
              <iframe
                key={iframeKey}
                src={previewUrl}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title="Page preview"
                sandbox="allow-same-origin allow-scripts"
              />
              {/* Overlay label */}
              <div style={{ position: 'absolute', bottom: 12, right: 12, padding: '4px 10px', background: 'rgba(0,0,0,0.5)', borderRadius: 20, fontSize: 12, color: 'white', backdropFilter: 'blur(4px)' }}>
                {previewMode === 'desktop' ? '🖥 Desktop' : '📱 Mobile'} Preview
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}

export default function BuilderPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #E2DDD8', borderTopColor: '#E8651A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <BuilderInner/>
    </Suspense>
  )
}
