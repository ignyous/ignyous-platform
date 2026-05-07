'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Nav from '@/components/Nav'

// ─── Types ────────────────────────────────────────────────────────
interface Plugin { name: string; slug: string; active: boolean; version: string; update: string | null }
interface Page   { id: number; title: string; slug: string; status: string; url: string; has_elementor: boolean }
interface SiteInfo {
  site:      { url: string; name: string; description: string; admin_email: string }
  wordpress: { version: string }
  theme:     { name: string; version: string; slug: string }
  builder:   Array<{ id: string; name: string }>
  plugins:   Plugin[]
  content:   { pages: number; posts: number; media_count: number }
  ignyous:   { plugin_version: string; connected_at: number }
}
interface Message { role: 'user' | 'assistant'; content: string; action?: any; actionResult?: string; ts: Date }

// ─── Design tokens ────────────────────────────────────────────────
const t = {
  bg: '#F7F5F2', white: '#FFFFFF', text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2',
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  blue: '#1B5FA8', blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
  purple: '#6D28D9', purpleBg: '#F5F3FF', purpleBorder: '#DDD6FE',
}

// ─── Small helpers ─────────────────────────────────────────────────
function Tag({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const m: Record<string, any> = {
    green:  { bg: t.greenBg,  tc: t.green,  border: t.greenBorder },
    red:    { bg: t.redBg,    tc: t.red,    border: t.redBorder },
    yellow: { bg: t.yellowBg, tc: t.yellow, border: t.yellowBorder },
    blue:   { bg: t.blueBg,   tc: t.blue,   border: t.blueBorder },
    orange: { bg: t.accentDim,tc: t.accent, border: t.accentBorder },
    purple: { bg: t.purpleBg, tc: t.purple, border: t.purpleBorder },
    gray:   { bg: t.surface,  tc: t.text2,  border: t.border },
  }
  const s = m[color] || m.gray
  return <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: s.bg, color: s.tc, border: `1px solid ${s.border}`, display: 'inline-block', whiteSpace: 'nowrap' as const }}>{children}</span>
}

function Widget({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: t.white, border: `1px solid ${t.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', ...style }}>{children}</div>
}

function WidgetHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: t.text }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: t.text3, marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

function Stat({ label, value, color = t.text, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: t.text3, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Sora, sans-serif', color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: t.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ScoreRing({ score, label, size = 52 }: { score: number; label: string; size?: number }) {
  const col = score >= 70 ? t.green : score >= 45 ? t.yellow : t.red
  const bg  = score >= 70 ? t.greenBg : score >= 45 ? t.yellowBg : t.redBg
  const bor = score >= 70 ? t.greenBorder : score >= 45 ? t.yellowBorder : t.redBorder
  return (
    <div style={{ textAlign: 'center' as const }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `2px solid ${bor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px' }}>
        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: size > 60 ? 18 : 13, fontWeight: 700, color: col }}>{score}</span>
      </div>
      <div style={{ fontSize: 11, color: t.text3, fontWeight: 500 }}>{label}</div>
    </div>
  )
}

// ─── Plugin detector ──────────────────────────────────────────────
function hasPlugin(plugins: Plugin[], ...slugs: string[]) {
  return plugins.some(p => p.active && slugs.some(s => p.slug?.toLowerCase().includes(s) || p.name?.toLowerCase().includes(s)))
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────
function DashboardInner() {
  const params  = useSearchParams()
  const siteUrl = params.get('site') || ''
  const apiKey  = params.get('key')  || ''

  const [siteInfo, setSiteInfo]   = useState<SiteInfo | null>(null)
  const [pages, setPages]         = useState<Page[]>([])
  const [scanReport, setScanReport] = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const messagesEndRef            = useRef<HTMLDivElement>(null)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  const cleanUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`

  useEffect(() => { if (siteUrl && apiKey) loadAll() }, [siteUrl, apiKey])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function bridge(endpoint: string, method = 'GET', body?: any) {
    const res = await fetch('/api/wordpress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: cleanUrl, apiKey, endpoint, method, body }),
    })
    return res.json()
  }

  async function loadAll() {
    setLoading(true)
    try {
      const [infoRes, pagesRes] = await Promise.all([bridge('site'), bridge('pages')])
      if (infoRes.success) setSiteInfo(infoRes.data)
      if (pagesRes.success) setPages(pagesRes.data?.pages || [])

      // Background scan
      fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      }).then(r => r.json()).then(d => { if (d.success) setScanReport(d.report) })

      // Welcome message
      const name = infoRes.data?.site?.name || siteUrl
      const pluginNames = (infoRes.data?.plugins || []).filter((p: Plugin) => p.active).slice(0, 3).map((p: Plugin) => p.name).join(', ')
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm connected to **${name}** and I have full access to your site.\n\nI can see ${pagesRes.data?.pages?.length || 0} pages and ${infoRes.data?.plugins?.filter((p: Plugin) => p.active).length || 0} active plugins${pluginNames ? ` (including ${pluginNames})` : ''}.\n\nJust tell me what you want to do — in plain English. I'll handle the technical side.`,
        ts: new Date(),
      }])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  // ── AI Chat ─────────────────────────────────────────────────────
  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg || sending) return

    const userMsg: Message = { role: 'user', content: msg, ts: new Date() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)

    try {
      const siteContext = siteInfo ? {
        site_name:   siteInfo.site.name,
        site_url:    cleanUrl,
        wp_version:  siteInfo.wordpress.version,
        theme:       siteInfo.theme.name,
        builder:     siteInfo.builder[0]?.name,
        pages:       pages.map(p => ({ id: p.id, title: p.title, slug: p.slug })),
        active_plugins: siteInfo.plugins.filter(p => p.active).map(p => p.name),
      } : { site_url: cleanUrl }

      const res  = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })), siteContext }),
      })
      const data = await res.json()

      const aiMsg: Message = { role: 'assistant', content: data.text || 'Done!', action: data.action, ts: new Date() }
      setMessages(prev => [...prev, aiMsg])

      if (data.action) executeAction(data.action, aiMsg)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.', ts: new Date() }])
    } finally {
      setSending(false)
    }
  }

  async function executeAction(action: any, msg: Message) {
    let result = ''
    try {
      switch (action.type) {
        case 'update_page':
          const upd = await bridge(`pages/${action.pageId}`, 'PATCH', { title: action.title, content: action.content, status: action.status })
          result = upd.success ? '✓ Page updated live on your site' : `Failed: ${upd.error}`
          break
        case 'create_page':
          const cre = await bridge('pages', 'POST', { title: action.title, content: action.content || '', status: 'draft' })
          result = cre.success ? `✓ Page "${action.title}" created (saved as draft)` : `Failed: ${cre.error}`
          if (cre.success) loadAll()
          break
        case 'install_plugin':
          const ins = await bridge('plugins/install', 'POST', { slug: action.slug, activate: true })
          result = ins.success ? `✓ ${action.slug} installed and activated` : `Failed: ${ins.error}`
          break
        case 'scan_site':
          const sc = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: cleanUrl }) })
          const sd = await sc.json()
          result = sd.success ? `✓ Scan complete — Overall score: ${sd.report?.scores?.overall}/100` : 'Scan failed'
          if (sd.success) setScanReport(sd.report)
          break
        default:
          result = `Action "${action.type}" noted`
      }
    } catch (e: any) { result = `Error: ${e.message}` }
    setMessages(prev => prev.map(m => m === msg ? { ...m, actionResult: result } : m))
  }

  // ── Suggestions ──────────────────────────────────────────────────
  const suggestions = [
    'What pages does my site have?',
    'Rewrite my homepage headline to be more compelling',
    'Add a contact form to my Contact page',
    'Check my SEO and tell me what to fix',
    'Make my site load faster',
    'Add pricing to my services page',
    'Create a new About Us page',
    'Show me what plugins I have installed',
  ]

  const quickActions = [
    { icon: '🎨', label: 'Change Theme',          prompt: 'I want to change my site theme. What are my options and what would you recommend?' },
    { icon: '🔍', label: 'Fix SEO',               prompt: 'Audit my SEO and give me a prioritized list of what to fix, starting with the most impactful.' },
    { icon: '📱', label: 'Mobile Fix',             prompt: 'Check my site on mobile and fix any issues with the layout or usability.' },
    { icon: '🛒', label: 'Sell Online',            prompt: 'I want to sell products or services online. Walk me through adding an online store or payment to my site.' },
    { icon: '📝', label: 'Rewrite Content',        prompt: 'Review all my page content and rewrite it to be more professional, compelling, and SEO-friendly.' },
    { icon: '⚡', label: 'Speed Boost',            prompt: 'My site is slow. What can we do to make it faster? Walk me through each step.' },
    { icon: '🔗', label: 'Switch Page Builder',   prompt: 'I want to switch to a better page builder. What are my options and what would you recommend based on my site?' },
    { icon: '📊', label: 'Add Analytics',          prompt: 'Set up Google Analytics on my site so I can see how many visitors I get and where they come from.' },
    { icon: '🔒', label: 'Security Check',        prompt: 'Check my site security and tell me what needs to be fixed to protect my site.' },
    { icon: '📅', label: 'Add Booking',            prompt: 'I want customers to be able to book appointments online. What is the best way to add this?' },
    { icon: '⭐', label: 'Add Reviews',            prompt: 'Add a Google Reviews or testimonials section to my site to build trust with visitors.' },
    { icon: '💬', label: 'Add Live Chat',          prompt: 'Add a live chat widget to my site so visitors can reach me instantly.' },
  ]

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${t.border}`, borderTopColor: t.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <div style={{ fontSize: 15, color: t.text2 }}>Connecting to {siteUrl}…</div>
      </div>
    )
  }

  const plugins      = siteInfo?.plugins || []
  const hasWoo       = hasPlugin(plugins, 'woocommerce')
  const hasAmelia    = hasPlugin(plugins, 'amelia')
  const hasEvents    = hasPlugin(plugins, 'events', 'the-events-calendar', 'event')
  const hasForms     = hasPlugin(plugins, 'contact-form', 'wpforms', 'gravity', 'cf7')
  const hasYoast     = hasPlugin(plugins, 'yoast', 'rank-math', 'seo')
  const hasRocket    = hasPlugin(plugins, 'wp-rocket', 'cache', 'litespeed')
  const hasLearnDash = hasPlugin(plugins, 'learndash', 'lifterlms', 'tutor')
  const hasMember    = hasPlugin(plugins, 'memberpress', 'restrict-content', 'paid-memberships')
  const updatesAvailable = plugins.filter(p => p.update).length

  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <Nav/>

      {/* ── SITE HEADER ── */}
      <div style={{ background: t.white, borderBottom: `1px solid ${t.border}`, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accentDim, border: `1px solid ${t.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🌐</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: t.text }}>{siteInfo?.site.name || siteUrl}</div>
            <div style={{ fontSize: 13, color: t.text3, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.green, display: 'inline-block' }}/>
              {cleanUrl} · WP {siteInfo?.wordpress.version} · {siteInfo?.theme.name}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {updatesAvailable > 0 && (
            <div style={{ padding: '6px 12px', background: t.yellowBg, border: `1px solid ${t.yellowBorder}`, borderRadius: 8, fontSize: 13, color: t.yellow, fontWeight: 500 }}>
              ⚠ {updatesAvailable} update{updatesAvailable > 1 ? 's' : ''} available
            </div>
          )}
          <a href={`${cleanUrl}/wp-admin`} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.white, color: t.text2, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>WP Admin ↗</a>
          <a href={cleanUrl} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.white, color: t.text2, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>View Site ↗</a>
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 28px 60px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* ══════════════════════════════════════════════ */}
        {/* HERO — AI CHAT BOX                            */}
        {/* ══════════════════════════════════════════════ */}
        <div style={{
          background: t.white, border: `2px solid ${t.border}`, borderRadius: 24,
          overflow: 'hidden', marginBottom: 20,
          boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        }}>
          {/* Header */}
          <div style={{ padding: '20px 24px 0', background: `linear-gradient(135deg, ${t.accentDim} 0%, ${t.white} 100%)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'white' }}>✦</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: t.text }}>Ask ignyous anything</div>
                <div style={{ fontSize: 13, color: t.text2 }}>Tell me what you want — I'll handle the technical side</div>
              </div>
            </div>
          </div>

          {/* Messages */}
          {messages.length > 0 && (
            <div style={{ padding: '16px 24px', maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 10, animation: 'fadeIn 0.25s ease' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: msg.role === 'user' ? t.accent : t.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: msg.role === 'user' ? 13 : 14, color: 'white', fontWeight: 600, marginTop: 2 }}>
                    {msg.role === 'user' ? 'U' : '✦'}
                  </div>
                  <div style={{ maxWidth: '78%' }}>
                    <div style={{
                      padding: '11px 15px', borderRadius: 14, fontSize: 14, lineHeight: 1.65,
                      background: msg.role === 'user' ? t.accent : t.surface,
                      color: msg.role === 'user' ? 'white' : t.text,
                      border: msg.role === 'user' ? 'none' : `1px solid ${t.border}`,
                      ...(msg.role === 'user' ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }),
                    }}>
                      {msg.content.split('\n').map((line, li) => (
                        <div key={li} style={{ marginBottom: li < msg.content.split('\n').length - 1 ? 5 : 0 }}>
                          {line.replace(/\*\*(.*?)\*\*/g, '$1')}
                        </div>
                      ))}
                    </div>
                    {msg.action && (
                      <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: msg.actionResult?.startsWith('✓') ? t.greenBg : msg.actionResult ? t.redBg : t.yellowBg, border: `1px solid ${msg.actionResult?.startsWith('✓') ? t.greenBorder : msg.actionResult ? t.redBorder : t.yellowBorder}`, color: msg.actionResult?.startsWith('✓') ? t.green : msg.actionResult ? t.red : t.yellow, display: 'flex', alignItems: 'center', gap: 7 }}>
                        {!msg.actionResult && <div style={{ width: 12, height: 12, border: `2px solid ${t.yellowBorder}`, borderTopColor: t.yellow, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>}
                        {msg.actionResult || `Executing: ${msg.action.type}…`}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: t.text3, marginTop: 4, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      {msg.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14 }}>✦</div>
                  <div style={{ padding: '12px 16px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, borderTopLeftRadius: 4 }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: t.text3, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}/>)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef}/>
            </div>
          )}

          {/* Input area */}
          <div style={{ padding: '0 24px 16px' }}>
            <div style={{ display: 'flex', gap: 10, background: t.surface, border: `2px solid ${t.border}`, borderRadius: 16, padding: '4px 4px 4px 16px', transition: 'border-color 0.2s' }}
              onFocusCapture={e => e.currentTarget.style.borderColor = t.accent}
              onBlurCapture={e => e.currentTarget.style.borderColor = t.border}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder={`Tell ignyous what you want to do with ${siteInfo?.site.name || 'your site'}…\ne.g. "Add a pricing section to my homepage" or "Fix my SEO"`}
                rows={2}
                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: t.text, resize: 'none', lineHeight: 1.55, padding: '10px 0' }}
              />
              <button onClick={() => sendMessage()} disabled={sending || !input.trim()} style={{
                alignSelf: 'flex-end', width: 44, height: 44, borderRadius: 12, border: 'none', flexShrink: 0,
                background: sending || !input.trim() ? t.border : t.accent, cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', marginBottom: 2,
              }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="white"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
              </button>
            </div>
            <div style={{ fontSize: 12, color: t.text3, marginTop: 7, textAlign: 'center' as const }}>
              Enter to send · Shift+Enter for new line · ignyous applies changes to your live site
            </div>
          </div>

          {/* Suggestion chips */}
          <div style={{ padding: '0 24px 20px', display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
            {suggestions.map(s => (
              <button key={s} onClick={() => sendMessage(s)} style={{
                padding: '6px 13px', border: `1px solid ${t.border}`, borderRadius: 20, background: t.white,
                color: t.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                transition: 'all 0.15s', whiteSpace: 'nowrap' as const,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.text2 }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* QUICK ACTIONS GRID                            */}
        {/* ══════════════════════════════════════════════ */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text2, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {quickActions.map(action => (
              <button key={action.label} onClick={() => sendMessage(action.prompt)} style={{
                padding: '14px 12px', background: t.white, border: `1px solid ${t.border}`,
                borderRadius: 14, cursor: 'pointer', textAlign: 'left' as const,
                fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.boxShadow = '0 4px 12px rgba(232,101,26,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ fontSize: 22, marginBottom: 7 }}>{action.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text, lineHeight: 1.3 }}>{action.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* MAIN CONTENT — 2 COLUMN                       */}
        {/* ══════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>

            {/* ── WOOCOMMERCE ── */}
            {hasWoo && (
              <Widget>
                <WidgetHead
                  title="🛒 WooCommerce Store"
                  sub="Sales, orders and product management"
                  action={<button onClick={() => sendMessage('Show me my WooCommerce store stats and recent orders')} style={{ padding: '5px 12px', border: `1px solid ${t.border}`, borderRadius: 7, background: 'white', color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Ask AI ✦</button>}
                />
                <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  <Stat label="Total Orders" value="—" sub="Connect WooCommerce API"/>
                  <Stat label="Revenue (mo)" value="—" color={t.green}/>
                  <Stat label="Products" value="—"/>
                </div>
                <div style={{ padding: '0 18px 14px', display: 'flex', gap: 8 }}>
                  {['Add Product', 'View Orders', 'Set Sale', 'Inventory'].map(a => (
                    <button key={a} onClick={() => sendMessage(`Help me ${a.toLowerCase()} in WooCommerce`)} style={{ padding: '6px 12px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.surface, color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{a}</button>
                  ))}
                </div>
              </Widget>
            )}

            {/* ── AMELIA BOOKINGS ── */}
            {hasAmelia && (
              <Widget>
                <WidgetHead
                  title="📅 Amelia Bookings"
                  sub="Upcoming appointments and booking stats"
                  action={<button onClick={() => sendMessage('Show me my upcoming Amelia appointments and booking stats')} style={{ padding: '5px 12px', border: `1px solid ${t.border}`, borderRadius: 7, background: 'white', color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Ask AI ✦</button>}
                />
                <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  <Stat label="This Week" value="—" sub="Upcoming bookings"/>
                  <Stat label="This Month" value="—"/>
                  <Stat label="Avg Rating" value="—" color={t.green}/>
                </div>
                <div style={{ padding: '0 18px 14px', display: 'flex', gap: 8 }}>
                  {['Add Service', 'View Calendar', 'Add Employee', 'Booking Settings'].map(a => (
                    <button key={a} onClick={() => sendMessage(`Help me ${a.toLowerCase()} in Amelia`)} style={{ padding: '6px 12px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.surface, color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{a}</button>
                  ))}
                </div>
              </Widget>
            )}

            {/* ── EVENTS ── */}
            {hasEvents && (
              <Widget>
                <WidgetHead
                  title="🎉 Events"
                  sub="Upcoming events and event management"
                  action={<button onClick={() => sendMessage('Show me my upcoming events and help me add a new one')} style={{ padding: '5px 12px', border: `1px solid ${t.border}`, borderRadius: 7, background: 'white', color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Ask AI ✦</button>}
                />
                <div style={{ padding: 18 }}>
                  <div style={{ padding: '32px', textAlign: 'center' as const, color: t.text3, fontSize: 14 }}>
                    <button onClick={() => sendMessage('Show me all my upcoming events')} style={{ color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500 }}>Ask AI to load your events ✦</button>
                  </div>
                </div>
                <div style={{ padding: '0 18px 14px', display: 'flex', gap: 8 }}>
                  {['Add Event', 'View All Events', 'Edit Upcoming', 'Event Settings'].map(a => (
                    <button key={a} onClick={() => sendMessage(`Help me ${a.toLowerCase()}`)} style={{ padding: '6px 12px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.surface, color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{a}</button>
                  ))}
                </div>
              </Widget>
            )}

            {/* ── LEARNDASH / LMS ── */}
            {hasLearnDash && (
              <Widget>
                <WidgetHead title="🎓 Courses & Learning" sub="Student progress and course management"/>
                <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  <Stat label="Active Students" value="—"/>
                  <Stat label="Courses" value="—"/>
                  <Stat label="Completion Rate" value="—" color={t.green}/>
                </div>
                <div style={{ padding: '0 18px 14px', display: 'flex', gap: 8 }}>
                  {['Add Course', 'View Students', 'Add Lesson', 'Certificates'].map(a => (
                    <button key={a} onClick={() => sendMessage(`Help me ${a.toLowerCase()}`)} style={{ padding: '6px 12px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.surface, color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{a}</button>
                  ))}
                </div>
              </Widget>
            )}

            {/* ── MEMBERSHIPS ── */}
            {hasMember && (
              <Widget>
                <WidgetHead title="👥 Memberships" sub="Members, subscriptions and access control"/>
                <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  <Stat label="Active Members" value="—"/>
                  <Stat label="MRR" value="—" color={t.green}/>
                  <Stat label="Churn Rate" value="—" color={t.red}/>
                </div>
              </Widget>
            )}

            {/* ── FORMS / LEADS — always shown ── */}
            <Widget>
              <WidgetHead
                title="📬 Form Submissions & Leads"
                sub={hasForms ? 'Contact form activity' : 'No contact form detected'}
                action={<button onClick={() => sendMessage('Show me my recent form submissions and leads')} style={{ padding: '5px 12px', border: `1px solid ${t.border}`, borderRadius: 7, background: 'white', color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Ask AI ✦</button>}
              />
              {!hasForms ? (
                <div style={{ padding: 18 }}>
                  <div style={{ padding: '20px', background: t.yellowBg, border: `1px solid ${t.yellowBorder}`, borderRadius: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: t.yellow, marginBottom: 4 }}>⚠ No contact form found</div>
                    <div style={{ fontSize: 13, color: t.text2 }}>Visitors can't reach you. A contact form with SMS alerts is the #1 way to capture leads.</div>
                  </div>
                  <button onClick={() => sendMessage('Add a contact form to my site that texts me when someone submits it')} style={{ width: '100%', padding: '11px', background: t.accent, border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    ✦ Add Contact Form + SMS Alerts
                  </button>
                </div>
              ) : (
                <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  <div style={{ padding: '24px', textAlign: 'center' as const, color: t.text3, fontSize: 14 }}>
                    <button onClick={() => sendMessage('Show me my recent contact form submissions')} style={{ color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500 }}>Ask AI to load your recent leads ✦</button>
                  </div>
                </div>
              )}
            </Widget>

            {/* ── PAGES ── */}
            <Widget>
              <WidgetHead
                title="📄 Pages"
                sub={`${pages.length} pages on your site`}
                action={<button onClick={() => sendMessage('Show me all my pages and let me know which ones need improvement')} style={{ padding: '5px 12px', border: `1px solid ${t.border}`, borderRadius: 7, background: 'white', color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Audit with AI ✦</button>}
              />
              <div style={{ padding: '6px 0' }}>
                {pages.slice(0, 8).map(page => (
                  <div key={page.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderBottom: `1px solid ${t.surface}`, cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = t.surface}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => sendMessage(`Edit the "${page.title}" page — review the content and suggest improvements`)}
                  >
                    <svg width="13" height="13" viewBox="0 0 20 20" fill={t.text3}><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: t.text }}>{page.title}</span>
                    <span style={{ fontSize: 12, color: t.text3, fontFamily: 'monospace' }}>/{page.slug}</span>
                    <Tag color={page.status === 'publish' ? 'green' : 'gray'}>{page.status === 'publish' ? 'Live' : page.status}</Tag>
                    {page.has_elementor && <Tag color="orange">Elementor</Tag>}
                  </div>
                ))}
                {pages.length === 0 && (
                  <div style={{ padding: '24px', textAlign: 'center' as const, color: t.text3, fontSize: 14 }}>No pages found</div>
                )}
              </div>
              <div style={{ padding: '12px 18px', borderTop: `1px solid ${t.border}` }}>
                <button onClick={() => sendMessage('Create a new page for me — what pages does my site need that I am missing?')} style={{ width: '100%', padding: '10px', border: `1.5px dashed ${t.border}`, borderRadius: 10, background: 'transparent', color: t.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
                  + Ask AI to suggest & create new pages
                </button>
              </div>
            </Widget>

          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>

            {/* ── SCORES ── */}
            {scanReport && (
              <Widget>
                <WidgetHead title="Site Health Scores" sub={`Scanned ${new Date().toLocaleDateString()}`}/>
                <div style={{ padding: 18 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <ScoreRing score={scanReport.scores?.overall}     label="Overall" size={72}/>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, justifyContent: 'center' }}>
                      <ScoreRing score={scanReport.scores?.seo}         label="SEO"      size={44}/>
                      <ScoreRing score={scanReport.scores?.performance} label="Speed"    size={44}/>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <ScoreRing score={scanReport.scores?.security} label="Security" size={44}/>
                    <ScoreRing score={scanReport.scores?.mobile}   label="Mobile"   size={44}/>
                  </div>
                  <button onClick={() => sendMessage('Run a full site audit and give me a prioritized list of improvements')} style={{ marginTop: 14, width: '100%', padding: '10px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    ✦ Full AI Audit
                  </button>
                </div>
              </Widget>
            )}

            {/* ── SITE INFO ── */}
            <Widget>
              <WidgetHead title="Site Details"/>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                {[
                  { label: 'Site Name',    value: siteInfo?.site.name },
                  { label: 'Theme',        value: siteInfo?.theme.name },
                  { label: 'Builder',      value: siteInfo?.builder[0]?.name || 'Gutenberg' },
                  { label: 'WP Version',   value: siteInfo?.wordpress.version },
                  { label: 'Pages',        value: siteInfo?.content.pages },
                  { label: 'Posts',        value: siteInfo?.content.posts },
                  { label: 'Media Files',  value: siteInfo?.content.media_count },
                  { label: 'Admin Email',  value: siteInfo?.site.admin_email },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: t.text3, fontWeight: 500 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{item.value || '—'}</div>
                  </div>
                ))}
              </div>
            </Widget>

            {/* ── SEO PLUGIN ── */}
            {hasYoast && (
              <Widget>
                <WidgetHead title="🔍 SEO" sub="Yoast / Rank Math detected"/>
                <div style={{ padding: 18 }}>
                  <div style={{ padding: '12px 14px', background: t.surface, borderRadius: 10, marginBottom: 10, fontSize: 14, color: t.text2, lineHeight: 1.5 }}>
                    You have an SEO plugin installed. Let ignyous audit your content and optimize it.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
                    {['Audit all page SEO scores', 'Rewrite meta descriptions', 'Fix missing H1 headings', 'Generate XML sitemap'].map(a => (
                      <button key={a} onClick={() => sendMessage(a)} style={{ padding: '9px 12px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'white', color: t.text, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left' as const }}>{a}</button>
                    ))}
                  </div>
                </div>
              </Widget>
            )}

            {/* ── CACHE / PERFORMANCE ── */}
            {hasRocket && (
              <Widget>
                <WidgetHead title="⚡ Cache & Performance"/>
                <div style={{ padding: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
                    {['Clear all caches', 'Check page load speed', 'Optimize images', 'Enable lazy loading'].map(a => (
                      <button key={a} onClick={() => sendMessage(a)} style={{ padding: '9px 12px', border: `1px solid ${t.border}`, borderRadius: 8, background: 'white', color: t.text, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left' as const }}>{a}</button>
                    ))}
                  </div>
                </div>
              </Widget>
            )}

            {/* ── PLUGIN UPDATES ── */}
            {updatesAvailable > 0 && (
              <Widget>
                <WidgetHead title={`⚠ ${updatesAvailable} Plugin Update${updatesAvailable > 1 ? 's' : ''}`} sub="Keep plugins updated for security"/>
                <div style={{ padding: '8px 0', maxHeight: 200, overflowY: 'auto' }}>
                  {plugins.filter(p => p.update).map(p => (
                    <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderBottom: `1px solid ${t.surface}` }}>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: t.text }}>{p.name}</div>
                      <Tag color="yellow">→ {p.update}</Tag>
                    </div>
                  ))}
                </div>
                <div style={{ padding: 14 }}>
                  <button onClick={() => sendMessage('Update all my plugins to the latest versions')} style={{ width: '100%', padding: '10px', background: t.accent, border: 'none', borderRadius: 9, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    ✦ Update All with AI
                  </button>
                </div>
              </Widget>
            )}

            {/* ── ALL PLUGINS ── */}
            <Widget>
              <WidgetHead title="🔌 Active Plugins" sub={`${plugins.filter(p => p.active).length} active`}/>
              <div style={{ padding: '6px 0', maxHeight: 280, overflowY: 'auto' }}>
                {plugins.filter(p => p.active).map(p => (
                  <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: `1px solid ${t.surface}` }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.green, flexShrink: 0 }}/>
                    <div style={{ flex: 1, fontSize: 13, color: t.text, fontWeight: 400 }}>{p.name}</div>
                    {p.update && <Tag color="yellow">Update</Tag>}
                  </div>
                ))}
                {plugins.filter(p => p.active).length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center' as const, color: t.text3, fontSize: 13 }}>No plugin data — check connection</div>
                )}
              </div>
              <div style={{ padding: 14, borderTop: `1px solid ${t.border}` }}>
                <button onClick={() => sendMessage('What plugins should I have on my site that I might be missing?')} style={{ width: '100%', padding: '9px', border: `1px solid ${t.border}`, borderRadius: 9, background: t.surface, color: t.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  ✦ Ask AI for plugin recommendations
                </button>
              </div>
            </Widget>

          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #E2DDD8', borderTopColor: '#E8651A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      </div>
    }>
      <DashboardInner/>
    </Suspense>
  )
}