'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import ThemeBrowser from '@/components/ThemeBrowser'

// ─── Types ────────────────────────────────────────────────────────
interface Plugin  { name: string; slug: string; active: boolean; version: string; update: string | null }
interface Page    { id: number; title: string; slug: string; status: string; link: string }
interface SiteInfo {
  site:      { url: string; name: string; description: string; admin_email: string }
  wordpress: { version: string }
  theme:     { name: string; version: string; slug: string }
  builder:   Array<{ id: string; name: string }>
  plugins:   Plugin[]
  content:   { pages: number; posts: number; media_count?: number }
}
interface ActionResult { type: string; success: boolean; url?: string; title?: string; message: string }
interface Message { role: 'user'|'assistant'; content: string; action?: any; actionResult?: ActionResult; options?: Array<{label: string; action: string}>; ts: Date }

// ─── Memory ───────────────────────────────────────────────────────
function getSiteMem(k: string) { try { return JSON.parse(localStorage.getItem(`ignyous_${k}`) || '{}') } catch { return {} } }
function saveSiteMem(k: string, d: any) { try { localStorage.setItem(`ignyous_${k}`, JSON.stringify({ ...getSiteMem(k), ...d, updated: Date.now() })) } catch {} }

// ─── Get stored API key (fallback when URL param is empty) ────────
function getStoredKey(siteUrl: string): string {
  try {
    const k    = `ignyous_conn_${siteUrl.replace(/[^a-z0-9]/gi, '_')}`
    const data = JSON.parse(localStorage.getItem(k) || '{}')
    return data.apiKey || ''
  } catch { return '' }
}

// ─── Colors ───────────────────────────────────────────────────────
const C = {
  bg: '#F0EDE8', white: '#FFFFFF', text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2',
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  blue: '#1B5FA8', blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
}

// ─── Helpers ──────────────────────────────────────────────────────
const Tag = ({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) => {
  const m: Record<string,any> = {
    green: { bg: C.greenBg, tc: C.green, b: C.greenBorder }, red: { bg: C.redBg, tc: C.red, b: C.redBorder },
    yellow: { bg: C.yellowBg, tc: C.yellow, b: C.yellowBorder }, blue: { bg: C.blueBg, tc: C.blue, b: C.blueBorder },
    orange: { bg: C.accentDim, tc: C.accent, b: C.accentBorder }, gray: { bg: C.surface, tc: C.text2, b: C.border },
  }
  const s = m[color] || m.gray
  return <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: s.bg, color: s.tc, border: `1px solid ${s.b}`, display: 'inline-block', whiteSpace: 'nowrap' as const }}>{children}</span>
}

const ScoreRing = ({ score, label, size = 52 }: { score: number; label: string; size?: number }) => {
  const col = score >= 70 ? C.green : score >= 45 ? C.yellow : C.red
  const bg  = score >= 70 ? C.greenBg : score >= 45 ? C.yellowBg : C.redBg
  const bor = score >= 70 ? C.greenBorder : score >= 45 ? C.yellowBorder : C.redBorder
  return (
    <div style={{ textAlign: 'center' as const }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `2px solid ${bor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px' }}>
        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: size > 60 ? 20 : 13, fontWeight: 700, color: col }}>{score}</span>
      </div>
      <div style={{ fontSize: 11, color: C.text3, fontWeight: 500 }}>{label}</div>
    </div>
  )
}

const hasPlugin = (plugins: Plugin[], ...terms: string[]) =>
  plugins.some(p => p.active !== false && terms.some(t =>
    (p.slug||'').toLowerCase().includes(t) || (p.name||'').toLowerCase().includes(t)
  ))

// ─── QUICK ACTION CARDS (like image 2) ───────────────────────────
const ACTIONS = [
  { icon: '🛒', label: 'Sell Products',     desc: 'Add an online store or product listings',    prompt: 'I want to sell products or services on my site. Walk me through adding a store.' },
  { icon: '📬', label: 'Generate Leads',    desc: 'Contact forms, quote requests, call-to-actions', prompt: 'Add a contact form with SMS alerts and a lead capture strategy to my site.' },
  { icon: '🛠️', label: 'Offer Services',   desc: 'Showcase what you do with service pages',    prompt: 'Create professional service pages that explain what I offer and include call-to-actions.' },
  { icon: '📅', label: 'Promote Events',    desc: 'List events, shows, classes or workshops',  prompt: 'Add an events section to my site so visitors can see upcoming events and register.' },
  { icon: '🔍', label: 'Fix My SEO',        desc: 'Rank higher on Google and get found',        prompt: 'Audit my site SEO completely. Tell me every issue and fix them one by one.' },
  { icon: '⭐', label: 'Build Trust',       desc: 'Reviews, testimonials, credentials',        prompt: 'Add a testimonials section and Google reviews to build credibility with visitors.' },
  { icon: '🎨', label: 'Change Design',     desc: 'New theme, colors, fonts and layout',       prompt: 'OPEN_THEME_BROWSER' },
  { icon: '⚡', label: 'Speed Up Site',    desc: 'Faster load times, better performance',     prompt: 'My site is slow. Identify every performance issue and fix them.' },
  { icon: '📝', label: 'Rewrite Content',   desc: 'Professional copy that converts visitors',  prompt: 'Rewrite all my page content to be more professional, clear, and SEO-optimized.' },
  { icon: '📊', label: 'Add Analytics',     desc: 'Track visitors, traffic and conversions',   prompt: 'Set up Google Analytics and Google Search Console on my site.' },
  { icon: '🔒', label: 'Secure My Site',   desc: 'SSL, backups, protection from hackers',     prompt: 'Check my site security, enable HTTPS, and set up automatic backups.' },
  { icon: '💬', label: 'Add Live Chat',    desc: 'Talk to visitors in real-time',             prompt: 'Add a live chat widget to my site so visitors can reach me instantly.' },
]

const SUGGESTIONS = [
  'What pages does my site have?',
  'Add a pricing section to my homepage',
  'Create an About Us page',
  'What plugins are installed?',
  'Check and fix my SEO',
  'My site looks bare — let\'s set it up',
]

// ─── ACTION FEEDBACK COMPONENT ───────────────────────────────────
const ActionFeedback = ({ result }: { result: ActionResult }) => (
  <div style={{ marginTop: 8, padding: '11px 14px', borderRadius: 10, background: result.success ? C.greenBg : C.redBg, border: `1px solid ${result.success ? C.greenBorder : C.redBorder}` }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: result.success ? C.green : C.red, marginBottom: result.url ? 7 : 0 }}>
      {result.success ? '✓' : '✗'} {result.message}
    </div>
    {result.url && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <code style={{ fontSize: 12, color: C.text2, background: 'rgba(0,0,0,0.06)', padding: '2px 7px', borderRadius: 4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{result.url}</code>
        <a href={result.url} target="_blank" rel="noreferrer" style={{ padding: '5px 12px', background: C.green, borderRadius: 7, color: 'white', fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>View Page ↗</a>
      </div>
    )}
  </div>
)

// ─── ISSUE DETECTOR ───────────────────────────────────────────────
function detectIssues(siteInfo: SiteInfo | null, scanReport: any, pages: Page[]) {
  const issues: Array<{ icon: string; title: string; desc: string; prompt: string; severity: 'high'|'medium' }> = []

  const name = siteInfo?.site?.name || ''
  if (!name || name === 'My WordPress Site' || name === 'WordPress Site' || name.length < 4)
    issues.push({ icon: '🏷️', severity: 'high', title: 'No site name set', desc: `Currently "${name || 'untitled'}" — visitors don't know who you are.`, prompt: 'Set my site name, tagline and basic branding to match my business.' })

  const hasContact = pages.some(p => p.slug?.includes('contact') || (p.title||'').toLowerCase().includes('contact'))
  if (!hasContact)
    issues.push({ icon: '📬', severity: 'high', title: 'No contact page', desc: 'Visitors have no way to reach you. You\'re losing leads every day.', prompt: 'Create a contact page with a form that texts me when someone fills it out.' })

  if (!scanReport?.seo?.meta_description)
    issues.push({ icon: '🔍', severity: 'high', title: 'Missing SEO description', desc: 'Search engines show nothing when your site appears in results.', prompt: 'Write and set a compelling meta description for my homepage and fix my basic SEO.' })

  if (scanReport?.performance?.load_time_ms > 3000)
    issues.push({ icon: '⚡', severity: 'medium', title: `Slow load time (${(scanReport.performance.load_time_ms/1000).toFixed(1)}s)`, desc: 'Over 3s loses 40% of visitors before they even see your site.', prompt: 'My site is loading slowly. Fix every performance issue.' })

  if (scanReport && !scanReport?.security?.https)
    issues.push({ icon: '🔒', severity: 'high', title: 'No HTTPS / SSL', desc: 'Browsers show "Not Secure". Google penalizes non-HTTPS sites.', prompt: 'Help me fix the HTTPS/SSL issue on my site.' })

  const realPages = pages.filter(p => p.slug !== 'sample-page' && p.status === 'publish')
  if (realPages.length <= 1)
    issues.push({ icon: '📄', severity: 'high', title: 'Site has no real pages', desc: 'Only a sample page exists. Let\'s build your actual website.', prompt: 'My site has no real pages yet. What pages does a business like mine need? Let\'s create them.' })

  return issues
}

// ─── MAIN ─────────────────────────────────────────────────────────
function DashboardInner() {
  const params   = useSearchParams()
  const urlSite  = params.get('site') || ''
  const urlKey   = params.get('key')  || ''

  // Auto-load first connected site from localStorage if none in URL
  const [siteUrl, setSiteUrl] = useState(urlSite)
  const [apiKey,  setApiKey]  = useState(urlKey)

  useEffect(() => {
    if (!urlSite) {
      // Try to load first stored site
      try {
        const list = JSON.parse(localStorage.getItem('ignyous_sites') || '[]')
        if (list.length > 0) {
          const firstSite = list[0]
          const key = getStoredKey(firstSite)
          if (key) { setSiteUrl(firstSite); setApiKey(key); return }
        }
      } catch {}
    } else if (!urlKey) {
      const stored = getStoredKey(urlSite)
      if (stored) setApiKey(stored)
      else setLoading(false)
    }
  }, [urlSite, urlKey])

  const cleanUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`
  const siteKey  = siteUrl.replace(/[^a-z0-9]/gi,'_')

  const [siteInfo, setSiteInfo]         = useState<SiteInfo | null>(null)
  const [pages, setPages]               = useState<Page[]>([])
  const [scanReport, setScanReport]     = useState<any>(null)
  const [loading, setLoading]           = useState(true)
  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState('')
  const [sending, setSending]           = useState(false)
  const [showThemes, setShowThemes]     = useState(false)
  const [dismissedIssues, setDismissedIssues] = useState<string[]>([])
  const messagesEndRef                  = useRef<HTMLDivElement>(null)
  const textareaRef                     = useRef<HTMLTextAreaElement>(null)

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

      // Handle all possible response shapes from the bridge
      let info: SiteInfo | null = null
      if (infoRes.success) {
        const d = infoRes.data
        // Could be: d.site (direct) or d.data.site (double-wrapped)
        if (d?.site)      info = d
        else if (d?.data?.site) info = d.data
        else              info = d
        setSiteInfo(info)
      }

      if (pagesRes.success) {
        const d = pagesRes.data
        const raw = d?.pages || d?.data?.pages || []
        setPages(raw)
      }

      // Background scan
      fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: cleanUrl }) })
        .then(r => r.json()).then(d => { if (d.success) setScanReport(d.report) })

      const mem      = getSiteMem(siteKey)
      const siteName = info?.site?.name || siteUrl
      const plugCt   = (info?.plugins || []).filter(p => p.active !== false).length
      const pageCt   = pagesRes.data?.pages?.length || 0

      setMessages([{
        role: 'assistant', ts: new Date(),
        content: mem.welcomed
          ? `Welcome back! Connected to **${siteName}** — ${pageCt} pages, ${plugCt} active plugins. What would you like to do today?`
          : `Hi! I'm now connected to **${siteName}**.\n\nI can see ${pageCt} pages and ${plugCt} active plugins. I'm scanning for issues now.\n\nJust tell me in plain English what you want — I'll handle everything.`,
      }])
      saveSiteMem(siteKey, { welcomed: true, site_name: info?.site?.name, last_visit: Date.now() })
    } catch {
      setMessages([{ role: 'assistant', content: 'Connected! What would you like to do with your site?', ts: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  // ── AI Send ────────────────────────────────────────────────────
  async function send(text?: string) {
    const msg = (text || input).trim()
    if (!msg || sending) return
    if (msg === 'OPEN_THEME_BROWSER') { setShowThemes(true); return }

    const userMsg: Message = { role: 'user', content: msg, ts: new Date() }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)

    try {
      const activePlugins = (siteInfo?.plugins || []).filter(p => p.active !== false)
      const ctx = {
        site_name:        siteInfo?.site?.name || siteUrl,
        site_url:         cleanUrl,
        site_description: siteInfo?.site?.description,
        wp_version:       siteInfo?.wordpress?.version,
        theme:            siteInfo?.theme?.name,
        builder:          siteInfo?.builder?.[0]?.name,
        pages:            pages.map(p => ({ id: p.id, title: p.title, slug: p.slug, url: p.link, status: p.status })),
        active_plugins:   activePlugins.map(p => ({ name: p.name, slug: p.slug })),
        plugin_count:     activePlugins.length,
        seo_score:        scanReport?.scores?.seo,
        performance_score:scanReport?.scores?.performance,
        overall_score:    scanReport?.scores?.overall,
        has_seo_plugin:   activePlugins.some(p => (p.slug||'').includes('yoast') || (p.slug||'').includes('rank-math')),
        meta_description: scanReport?.seo?.meta_description,
        page_title:       scanReport?.seo?.title,
        load_time_ms:     scanReport?.performance?.load_time_ms,
      }

      const res  = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })), siteContext: ctx }),
      })
      const data = await res.json()

      if (data.action?.type === 'open_theme_browser') { setShowThemes(true) }

      const aiMsg: Message = { role: 'assistant', content: data.text || 'Done!', action: data.action, options: data.options, ts: new Date() }
      setMessages(prev => [...prev, aiMsg])
      if (data.action && data.action.type !== 'open_theme_browser') executeAction(data.action, aiMsg)
      saveSiteMem(siteKey, { last_action: data.action?.type, last_msg: msg.slice(0, 80) })
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Check that ANTHROPIC_API_KEY is set in .env.local.', ts: new Date() }])
    } finally {
      setSending(false)
    }
  }

  // ── Execute action ─────────────────────────────────────────────
  async function executeAction(action: any, msg: Message) {
    let result: ActionResult = { type: action.type, success: false, message: 'Action failed' }
    try {
      switch (action.type) {
        case 'update_page': {
          const r = await bridge(`pages/${action.pageId}`, 'PATCH', { title: action.title, content: action.content, status: action.status })
          result = { type: 'update_page', success: r.success, message: r.success ? `"${action.title}" updated` : `Failed: ${r.error}`, url: pages.find(p => p.id === action.pageId)?.link }
          break
        }
        case 'create_page': {
          const r = await bridge('pages', 'POST', { title: action.title, content: action.content || '', status: action.status || 'publish' })
          if (r.success) {
            const pg = r.data?.page || r.data
            const url = pg?.link || `${cleanUrl}/${(action.title||'').toLowerCase().replace(/\s+/g,'-')}`
            result = { type: 'create_page', success: true, message: `"${action.title}" page created and published`, url, title: action.title }
            bridge('pages').then(r2 => { if (r2.success) setPages(r2.data?.pages || r2.data?.data?.pages || []) })
          } else {
            result = { type: 'create_page', success: false, message: `Failed to create page: ${r.error}` }
          }
          break
        }
        case 'update_site_options': {
          const r = await bridge('settings', 'PATCH', { blogname: action.blogname, blogdescription: action.blogdescription, ...action.options })
          result = { type: 'update_site_options', success: r.success, message: r.success ? 'Site settings updated' : `Failed: ${r.error}` }
          if (r.success) loadAll()
          break
        }
        case 'install_plugin': {
          const r = await bridge('plugins/install', 'POST', { slug: action.slug, activate: true })
          result = { type: 'install_plugin', success: r.success, message: r.success ? `${action.name || action.slug} installed & activated` : `Failed: ${r.error}` }
          if (r.success) loadAll()
          break
        }
        case 'install_theme': {
          const r = await bridge('themes/install', 'POST', { slug: action.slug, activate: true })
          result = { type: 'install_theme', success: r.success, message: r.success ? `Theme "${action.name || action.slug}" installed` : `Could not auto-install. Go to WP Admin → Appearance → Themes to install ${action.name}.` }
          break
        }
        case 'scan_site': {
          const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: cleanUrl }) })
          const d = await r.json()
          if (d.success) setScanReport(d.report)
          result = { type: 'scan_site', success: d.success, message: d.success ? `Scan done — Overall score: ${d.report?.scores?.overall}/100` : 'Scan failed' }
          break
        }
        default:
          result = { type: action.type, success: true, message: 'Done!' }
      }
    } catch (e: any) { result = { type: action.type, success: false, message: `Error: ${e.message}` } }
    setMessages(prev => prev.map(m => m === msg ? { ...m, actionResult: result } : m))
  }

  // ── Theme select ───────────────────────────────────────────────
  function onThemeSelect(theme: any) {
    setShowThemes(false)
    const builderName = theme.builder || (Array.isArray(theme.builders) ? theme.builders[0] : 'WordPress')
    send(`Install and activate the ${theme.name} theme (slug: ${theme.slug}) on my site. It works with ${builderName}.`)
  }

  if (loading) return (
    <div style={{ padding: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 16 }}>
      <div style={{ width: 44, height: 44, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <div style={{ fontSize: 15, color: C.text2 }}>Connecting to {siteUrl}…</div>
    </div>
  )

  // No API key — show reconnect prompt
  if (!apiKey) return (
    <div style={{ padding: '80px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, padding: '48px 40px', textAlign: 'center' as const, maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
        <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 10 }}>Connection key missing</h2>
        <p style={{ fontSize: 15, color: C.text2, lineHeight: 1.65, marginBottom: 28 }}>
          The API key for <strong>{siteUrl}</strong> wasn't found. This usually means the plugin was reinstalled. Run the connect flow again — it only takes 30 seconds.
        </p>
        <a href={`/bridge/connect`} style={{ display: 'inline-block', padding: '14px 36px', background: C.accent, borderRadius: 12, color: 'white', textDecoration: 'none', fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', boxShadow: '0 4px 14px rgba(232,101,26,0.3)' }}>
          Reconnect Site →
        </a>
      </div>
    </div>
  )

  const plugins       = siteInfo?.plugins || []
  const activePlugins = plugins.filter(p => p.active !== false)
  const hasWoo        = hasPlugin(plugins, 'woocommerce')
  const hasAmelia     = hasPlugin(plugins, 'amelia')
  const hasEvents     = hasPlugin(plugins, 'events-calendar','the-events','event-calendar')
  const hasForms      = hasPlugin(plugins, 'contact-form','wpforms','gravity','cf7','ninja-forms')
  const hasYoast      = hasPlugin(plugins, 'yoast','rank-math','rankmath')
  const hasRocket     = hasPlugin(plugins, 'wp-rocket','w3-total','litespeed','autoptimize')
  const updates       = plugins.filter(p => p.update).length
  const issues        = detectIssues(siteInfo, scanReport, pages)
  const visibleIssues = issues.filter(i => !dismissedIssues.includes(i.title))

  return (
    <div style={{ background: C.bg }}>
      
      {showThemes && <ThemeBrowser onSelect={onThemeSelect} onClose={() => setShowThemes(false)} currentTheme={siteInfo?.theme?.name}/>}

      {/* Site header strip */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, border: `1px solid ${C.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🌐</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>{siteInfo?.site?.name || siteUrl}</div>
            <div style={{ fontSize: 12, color: C.text3, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block'}}/>
              {cleanUrl} · WP {siteInfo?.wordpress?.version} · {siteInfo?.theme?.name || '?'} · {activePlugins.length} plugins
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {updates > 0 && <button onClick={() => send('Update all my plugins to the latest versions')} style={{ padding: '7px 12px', background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 8, fontSize: 12, color: C.yellow, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>⚠ {updates} update{updates>1?'s':''}</button>}
          <a href={`${cleanUrl}/wp-admin`} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>WP Admin ↗</a>
          <a href={cleanUrl} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>View Site ↗</a>
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 32px 60px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>

        {/* ════ 1. AI CHAT HERO — FULL WIDTH ════ */}
        <div style={{ background: C.white, border: `2px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', marginBottom: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>
          <div style={{ padding: '16px 24px 0', background: `linear-gradient(120deg, ${C.accentDim} 0%, white 55%)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 17 }}>✦</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>Ask ignyous anything</div>
                <div style={{ fontSize: 13, color: C.text2 }}>Plain English — I'll handle all the technical work</div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ padding: '14px 24px', maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: msg.role==='user'?'row-reverse':'row', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: msg.role==='user'?C.accent:C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white', fontWeight: 600, marginTop: 2 }}>
                  {msg.role==='user'?'U':'✦'}
                </div>
                <div style={{ maxWidth: '80%' }}>
                  <div style={{ padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.65, background: msg.role==='user'?C.accent:C.surface, color: msg.role==='user'?'white':C.text, border: msg.role==='user'?'none':`1px solid ${C.border}`, ...(msg.role==='user'?{borderTopRightRadius:4}:{borderTopLeftRadius:4}) }}>
                    {msg.content.split('\n').map((l,li) => <div key={li} style={{ marginBottom: li<msg.content.split('\n').length-1?4:0 }}>{l.replace(/\*\*(.*?)\*\*/g,'$1')}</div>)}
                  </div>
                  {msg.action && !msg.actionResult && (
                    <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, fontSize: 13, color: C.yellow, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 11, height: 11, border: `2px solid ${C.yellowBorder}`, borderTopColor: C.yellow, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
                      Working on it…
                    </div>
                  )}
                  {msg.actionResult && <ActionFeedback result={msg.actionResult}/>}

                  {/* Clickable options from AI */}
                  {msg.options && msg.options.length > 0 && !msg.actionResult && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
                      {msg.options.map((opt: any, oi: number) => (
                        <button key={oi} onClick={() => send(opt.label)} style={{
                          padding: '9px 14px', border: `1.5px solid ${C.accent}`, borderRadius: 9,
                          background: C.accentDim, color: C.accent, fontSize: 14, fontWeight: 500,
                          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left' as const,
                          transition: 'all 0.15s',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = 'white' }}
                          onMouseLeave={e => { e.currentTarget.style.background = C.accentDim; e.currentTarget.style.color = C.accent }}
                        >
                          → {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: C.text3, marginTop: 3, textAlign: msg.role==='user'?'right':'left' as const }}>
                    {msg.ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12 }}>✦</div>
                <div style={{ padding: '12px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, borderTopLeftRadius: 4 }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.text3, animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef}/>
          </div>

          {/* Input */}
          <div style={{ padding: '0 24px 14px' }}>
            <div style={{ display: 'flex', gap: 10, border: `2px solid ${C.border}`, borderRadius: 16, padding: '4px 4px 4px 16px', background: C.surface, transition: 'border-color 0.2s' }}
              onFocusCapture={e => e.currentTarget.style.borderColor = C.accent}
              onBlurCapture={e => e.currentTarget.style.borderColor = C.border}
            >
              <textarea ref={textareaRef} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px' }}
                onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={`Tell ignyous what you want to do with ${siteInfo?.site?.name||'your site'}…`}
                rows={2} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: C.text, resize: 'none', lineHeight: 1.5, padding: '10px 0' }}
              />
              <button onClick={() => send()} disabled={sending||!input.trim()} style={{ alignSelf: 'flex-end', width: 44, height: 44, borderRadius: 12, border: 'none', flexShrink: 0, marginBottom: 2, background: sending||!input.trim()?C.border:C.accent, cursor: sending||!input.trim()?'not-allowed':'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="white"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
              </button>
            </div>
          </div>

          {/* Chips */}
          <div style={{ padding: '0 24px 18px', display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} style={{ padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 20, background: C.white, color: C.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s', whiteSpace: 'nowrap' as const }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=C.accent; e.currentTarget.style.color=C.accent }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text2 }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* ════ 2. ISSUES STRIP ════ */}
        {visibleIssues.length > 0 && (
          <div style={{ background: C.white, border: `1.5px solid ${C.accentBorder}`, borderRadius: 16, padding: '14px 20px', marginBottom: 20, boxShadow: '0 2px 12px rgba(232,101,26,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>
                ✦ {visibleIssues.length} issue{visibleIssues.length>1?'s':''} found — ignyous can fix all of these
              </div>
              <button onClick={() => setDismissedIssues(issues.map(i=>i.title))} style={{ fontSize: 12, color: C.text3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Dismiss all</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {visibleIssues.map((issue, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', borderRadius: 12, background: issue.severity==='high'?C.redBg:C.yellowBg, border: `1px solid ${issue.severity==='high'?C.redBorder:C.yellowBorder}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{issue.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{issue.title}</div>
                    <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.4, marginBottom: 8 }}>{issue.desc}</div>
                    <button onClick={() => send(issue.prompt)} style={{ padding: '5px 12px', background: C.accent, border: 'none', borderRadius: 7, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Fix with AI ✦</button>
                  </div>
                  <button onClick={() => setDismissedIssues(p=>[...p,issue.title])} style={{ fontSize: 14, color: C.text3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ 3. TWO COLUMN ════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>

            {/* GOAL CARDS — like image 2 */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>What would you like to do?</div>
                <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Click anything and ignyous will handle it</div>
              </div>
              <div style={{ padding: '16px 22px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12 }}>
                  {ACTIONS.map(action => (
                    <button key={action.label}
                      onClick={() => action.prompt==='OPEN_THEME_BROWSER' ? setShowThemes(true) : send(action.prompt)}
                      style={{
                        padding: '18px 16px', background: C.surface, border: `1.5px solid ${C.border}`,
                        borderRadius: 14, cursor: 'pointer', textAlign: 'left' as const,
                        fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor=C.accent; e.currentTarget.style.background='#FFF7ED'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(232,101,26,0.12)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.background=C.surface; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
                    >
                      <div style={{ fontSize: 26, marginBottom: 10 }}>{action.icon}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5, lineHeight: 1.2 }}>{action.label}</div>
                      <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.4 }}>{action.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* WooCommerce */}
            {hasWoo && (
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>🛒 WooCommerce Store</div>
                  <button onClick={() => send('Show me my WooCommerce orders and revenue stats')} style={{ padding: '5px 12px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'white', color: C.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Ask AI ✦</button>
                </div>
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  {['Orders','Revenue','Products'].map(l => <div key={l}><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 4 }}>{l}</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>—</div></div>)}
                </div>
                <div style={{ padding: '0 20px 14px', display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  {['Add Product','View Orders','Run a Sale','Update Inventory'].map(a => (
                    <button key={a} onClick={() => send(`Help me ${a.toLowerCase()} in WooCommerce`)} style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{a}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Amelia */}
            {hasAmelia && (
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>📅 Amelia Bookings</div>
                  <button onClick={() => send('Show me my upcoming Amelia appointments')} style={{ padding: '5px 12px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'white', color: C.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Ask AI ✦</button>
                </div>
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  {['This Week','This Month','Total Services'].map(l => <div key={l}><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 4 }}>{l}</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>—</div></div>)}
                </div>
                <div style={{ padding: '0 20px 14px', display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  {['Add Service','View Calendar','Add Employee','Edit Hours'].map(a => (
                    <button key={a} onClick={() => send(`Help me ${a.toLowerCase()} in Amelia`)} style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{a}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Events */}
            {hasEvents && (
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 20px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text, marginBottom: 12 }}>🎉 Events</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {['Add Event','View All Events','Edit Upcoming','Event Settings'].map(a => (
                    <button key={a} onClick={() => send(`Help me ${a.toLowerCase()}`)} style={{ padding: '8px 14px', border: `1px solid ${C.border}`, borderRadius: 9, background: C.surface, color: C.text, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{a}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Contact forms */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>📬 Contact Forms & Leads</div>
                {hasForms && <button onClick={() => send('Show me my recent form submissions')} style={{ padding: '5px 12px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'white', color: C.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Ask AI ✦</button>}
              </div>
              <div style={{ padding: 20 }}>
                {!hasForms ? (
                  <>
                    <div style={{ padding: '13px 15px', background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 10, marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.yellow, marginBottom: 3 }}>⚠ No contact form found</div>
                      <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>Visitors can't reach you. You're losing leads every day.</div>
                    </div>
                    <button onClick={() => send('Add a contact form to my site that texts me when someone submits it')} style={{ width: '100%', padding: '12px', background: C.accent, border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                      ✦ Add Contact Form + SMS Alerts
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center' as const }}>
                    <button onClick={() => send('Show me my recent contact form submissions and leads')} style={{ color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500 }}>
                      Load recent submissions ✦
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Pages */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: C.text }}>📄 Pages ({pages.length})</div>
                <button onClick={() => send('Review all my pages and tell me which need improvement')} style={{ padding: '5px 12px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'white', color: C.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Audit ✦</button>
              </div>
              {pages.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center' as const }}>
                  <div style={{ fontSize: 14, color: C.text3, marginBottom: 12 }}>No pages on your site yet</div>
                  <button onClick={() => send("What pages should my site have? Let's create them.")} style={{ padding: '10px 24px', background: C.accent, border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✦ Build my pages</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 14, padding: '16px 20px' }}>
                    {pages.slice(0,6).map(page => (
                      <div key={page.id} onClick={() => send(`Edit the "${page.title}" page — review content and suggest improvements`)} style={{ cursor: 'pointer' }}>
                        {/* Screenshot */}
                        <div style={{ height: 90, borderRadius: 10, overflow: 'hidden', background: C.surface, border: `1px solid ${C.border}`, marginBottom: 8, position: 'relative' }}>
                          <img
                            src={`https://image.thum.io/get/width/320/crop/200/noanimate/${page.link||`${cleanUrl}/${page.slug}`}`}
                            alt={page.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { (e.target as HTMLImageElement).style.display='none' }}
                          />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{page.title}</div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                          <Tag color={page.status==='publish'?'green':'gray'}>{page.status==='publish'?'Live':page.status}</Tag>
                          <span style={{ fontSize: 11, color: C.text3, fontFamily: 'monospace' }}>/{page.slug}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '0 20px 16px' }}>
                    <button onClick={() => send("What pages is my site missing? Suggest and create the important ones.")} style={{ width: '100%', padding: '10px', border: `1.5px dashed ${C.border}`, borderRadius: 10, background: 'transparent', color: C.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                      + Suggest & create missing pages
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>

            {/* Site preview — big screenshot */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: C.text }}>Homepage Preview</div>
                <a href={cleanUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.blue, textDecoration: 'none', fontWeight: 500 }}>Open ↗</a>
              </div>
              <div style={{ position: 'relative', height: 220, overflow: 'hidden', background: C.surface }}>
                <img
                  src={`https://image.thum.io/get/width/800/crop/500/noanimate/${cleanUrl}`}
                  alt="Site preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).style.display='none' }}
                />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(transparent, rgba(0,0,0,0.3))', display: 'flex', alignItems: 'flex-end', padding: '12px 14px' }}>
                  <span style={{ color: 'white', fontSize: 12, fontFamily: 'monospace' }}>{cleanUrl}</span>
                </div>
              </div>
              <div style={{ padding: '10px 18px', display: 'flex', gap: 8 }}>
                <button onClick={() => setShowThemes(true)} style={{ flex: 1, padding: '8px', background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 9, color: C.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>🎨 Change Theme</button>
                <button onClick={() => send('Redesign my homepage to look more professional and modern')} style={{ flex: 1, padding: '8px', border: `1px solid ${C.border}`, borderRadius: 9, background: 'white', color: C.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✦ Redesign</button>
              </div>
            </div>

            {/* Health scores */}
            {scanReport?.scores && (
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: C.text }}>Site Health Scores</div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <ScoreRing score={scanReport.scores.overall} label="Overall" size={72}/>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, justifyContent: 'center' }}>
                      <ScoreRing score={scanReport.scores.seo}         label="SEO"   size={44}/>
                      <ScoreRing score={scanReport.scores.performance} label="Speed" size={44}/>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <ScoreRing score={scanReport.scores.security} label="Security" size={44}/>
                    <ScoreRing score={scanReport.scores.mobile}   label="Mobile"  size={44}/>
                  </div>
                  <button onClick={() => send('Run a full site audit and give me a prioritized fix list')} style={{ width: '100%', padding: '9px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, color: C.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>✦ Full AI Audit</button>
                </div>
              </div>
            )}

            {/* Site details */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: C.text }}>Site Details</div>
              <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                {[
                  { label: 'Site Name',   value: siteInfo?.site?.name },
                  { label: 'Description',value: siteInfo?.site?.description },
                  { label: 'Theme',       value: siteInfo?.theme?.name },
                  { label: 'Builder',     value: siteInfo?.builder?.[0]?.name || 'Gutenberg' },
                  { label: 'WP Version', value: siteInfo?.wordpress?.version },
                  { label: 'Pages',       value: `${siteInfo?.content?.pages || pages.length}` },
                  { label: 'Posts',       value: `${siteInfo?.content?.posts || 0}` },
                  { label: 'Admin Email', value: siteInfo?.site?.admin_email },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 12, color: C.text3, flexShrink: 0 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 500, textAlign: 'right' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 180 }}>{item.value || '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plugins */}
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: C.text }}>🔌 Plugins ({activePlugins.length} active)</div>
                <button onClick={() => send('What plugins do I have installed? Are there any I should add or remove?')} style={{ padding: '4px 9px', border: `1px solid ${C.border}`, borderRadius: 6, background: 'white', color: C.text2, fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Ask AI</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {activePlugins.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center' as const, color: C.text3, fontSize: 13 }}>
                    No plugins detected yet.<br/>
                    <button onClick={() => send('What plugins do I have installed on my site?')} style={{ marginTop: 8, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>Ask AI to list them ✦</button>
                  </div>
                ) : activePlugins.map(p => (
                  <div key={p.slug||p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderBottom: `1px solid ${C.surface}` }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flexShrink: 0 }}/>
                    <div style={{ flex: 1, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.name}</div>
                    {p.update && <Tag color="yellow">Update</Tag>}
                  </div>
                ))}
              </div>
              {updates > 0 && (
                <div style={{ padding: '10px 18px', borderTop: `1px solid ${C.border}` }}>
                  <button onClick={() => send('Update all my plugins to the latest versions')} style={{ width: '100%', padding: '8px', background: C.accent, border: 'none', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    ✦ Update {updates} Plugin{updates>1?'s':''}
                  </button>
                </div>
              )}
            </div>

            {/* SEO & Cache quick actions */}
            {(hasYoast || hasRocket) && (
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: C.text }}>
                  {hasYoast ? '🔍 SEO' : '⚡ Performance'}
                </div>
                <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                  {(hasYoast
                    ? ['Audit all page SEO scores','Fix meta descriptions','Fix missing headings','Generate XML sitemap']
                    : ['Clear all caches','Optimize images','Enable lazy loading','Check page speed']
                  ).map(a => (
                    <button key={a} onClick={() => send(a)} style={{ padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'white', color: C.text, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left' as const }}>{a}</button>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <AppLayout>
      <Suspense fallback={
        <div style={{ minHeight: '100vh', background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 44, height: 44, border: '3px solid #E2DDD8', borderTopColor: '#E8651A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        </div>
      }>
        <DashboardInner/>
      </Suspense>
    </AppLayout>
  )
}
