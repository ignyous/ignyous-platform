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
  return <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: s.bg, color: s.tc, border: `1px solid ${s.b}`, display: 'inline-block', whiteSpace: 'nowrap' as const }}>{children}</span>
}

const ScoreRing = ({ score, label, size = 52 }: { score: number; label: string; size?: number }) => {
  const col = score >= 70 ? C.green : score >= 45 ? C.yellow : C.red
  const bg  = score >= 70 ? C.greenBg : score >= 45 ? C.yellowBg : C.redBg
  const bor = score >= 70 ? C.greenBorder : score >= 45 ? C.yellowBorder : C.redBorder
  return (
    <div style={{ textAlign: 'center' as const }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `2px solid ${bor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px' }}>
        <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: size > 60 ? 20 : 13, fontWeight: 700, color: col }}>{score}</span>
      </div>
      <div style={{ fontSize: 12, color: C.text3, fontWeight: 500 }}>{label}</div>
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
  '✦ Auto-suggest content for my homepage',
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
    <div style={{ fontSize: 14, fontWeight: 600, color: result.success ? C.green : C.red, marginBottom: result.url ? 7 : 0 }}>
      {result.success ? '✓' : '✗'} {result.message}
    </div>
    {result.url && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <code style={{ fontSize: 13, color: C.text2, background: 'rgba(0,0,0,0.06)', padding: '2px 7px', borderRadius: 4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{result.url}</code>
        <a href={result.url} target="_blank" rel="noreferrer" style={{ padding: '5px 12px', background: C.green, borderRadius: 7, color: 'white', fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>View Page ↗</a>
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
  const [snapshots, setSnapshots]       = useState<Array<{id: string; label: string; created_at: string}>>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [previewUrl, setPreviewUrl]     = useState('')
  const [iframeKey, setIframeKey]       = useState(0)
  const [previewMode, setPreviewMode]   = useState<'desktop'|'mobile'>('desktop')
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef                     = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (siteUrl && apiKey) loadAll() }, [siteUrl, apiKey])
  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [messages])

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

      // Background scan + snapshots
      fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: cleanUrl }) })
        .then(r => r.json()).then(d => { if (d.success) setScanReport(d.report) })

      bridge('snapshots').then(r => {
        if (r.success) setSnapshots(r.data?.snapshots || [])
      })

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
      setPreviewUrl(cleanUrl)
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
        pages:            pages.map(p => ({
          id: p.id, title: p.title, slug: p.slug, url: p.link, status: p.status,
          has_form: (p as any).has_form,
          has_elementor: (p as any).has_elementor,
        })),
        active_plugins:   activePlugins.map(p => ({ name: p.name, slug: p.slug })),
        plugin_count:     activePlugins.length,
        // Specific plugin detection for common checks
        has_contact_form_7: activePlugins.some(p => (p.slug||'').includes('contact-form-7') || (p.name||'').toLowerCase().includes('contact form 7')),
        has_wpforms:        activePlugins.some(p => (p.slug||'').includes('wpforms')),
        has_gravity_forms:  activePlugins.some(p => (p.slug||'').includes('gravityforms')),
        has_woocommerce:    activePlugins.some(p => (p.slug||'').includes('woocommerce')),
        has_amelia:         activePlugins.some(p => (p.slug||'').includes('amelia')),
        has_yoast:          activePlugins.some(p => (p.slug||'').includes('yoast') || (p.slug||'').includes('rank-math')),
        seo_score:          scanReport?.scores?.seo,
        performance_score:  scanReport?.scores?.performance,
        overall_score:      scanReport?.scores?.overall,
        meta_description:   scanReport?.seo?.meta_description,
        load_time_ms:       scanReport?.performance?.load_time_ms,
        forms_count:        scanReport?.forms?.count || 0,
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
          const targetPage = pages.find(p => p.id === action.pageId)
          const pageUrl = targetPage?.link
          const pageTitle = action.title || targetPage?.title || 'Page'
          result = { type: 'update_page', success: r.success, message: r.success ? `"${pageTitle}" updated successfully` : `Failed: ${r.error || r.message}`, url: pageUrl }
          if (r.success && pageUrl) { setPreviewUrl(pageUrl); setIframeKey(k => k + 1) }
          break
        }
        case 'create_page': {
          const r = await bridge('pages', 'POST', { title: action.title, content: action.content || '', status: action.status || 'publish' })
          if (r.success) {
            const pg  = r.data?.page || r.data
            const url = pg?.link || `${cleanUrl}/${(action.title||'').toLowerCase().replace(/\s+/g,'-')}`
            result = { type: 'create_page', success: true, message: `"${action.title}" created and published`, url, title: action.title }
            // Targeted page list refresh - no full reload
            const pagesRes = await bridge('pages')
            if (pagesRes.success) setPages(pagesRes.data?.pages || pagesRes.data?.data?.pages || [])
          } else {
            result = { type: 'create_page', success: false, message: `Failed: ${r.error}` }
          }
          break
        }
        case 'update_site_options': {
          const r = await bridge('site/settings', 'PATCH', { blogname: action.blogname, blogdescription: action.blogdescription, ...action.options })
          result = { type: 'update_site_options', success: r.success, message: r.success ? 'Site settings updated' : `Failed: ${r.error}` }
          // Targeted update - just update siteInfo name without full reload
          if (r.success && action.blogname && siteInfo) {
            setSiteInfo(prev => prev ? { ...prev, site: { ...prev.site, name: action.blogname } } : prev)
          }
          break
        }
        case 'install_plugin': {
          const r = await bridge('plugins/install', 'POST', { slug: action.slug, activate: true })
          result = { type: 'install_plugin', success: r.success, message: r.success ? `${action.name || action.slug} installed & activated` : `Failed: ${r.error}` }
          // Refresh plugin list only
          if (r.success) {
            const infoRes = await bridge('site')
            if (infoRes.success) {
              const d = infoRes.data?.site ? infoRes.data : infoRes.data?.data || infoRes.data
              setSiteInfo(d)
            }
          }
          break
        }
        case 'install_theme': {
          const r = await bridge('themes/install', 'POST', { slug: action.slug, activate: true })
          result = { type: 'install_theme', success: r.success, message: r.success ? `Theme "${action.name || action.slug}" installed and activated` : `Could not auto-install. Go to WP Admin → Appearance → Themes to install manually.` }
          break
        }
        case 'scan_site': {
          const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: cleanUrl }) })
          const d = await r.json()
          if (d.success) setScanReport(d.report)
          result = { type: 'scan_site', success: d.success, message: d.success ? `Scan done — Overall score: ${d.report?.scores?.overall}/100` : 'Scan failed' }
          break
        }
        case 'take_snapshot': {
          const r = await bridge('snapshot', 'POST', { label: action.label || 'Manual snapshot', page_id: action.pageId || 0 })
          result = { type: 'take_snapshot', success: r.success, message: r.success ? `📸 Snapshot saved: "${action.label || 'Snapshot'}"` : `Snapshot failed: ${r.error}` }
          if (r.success) setSnapshots(prev => [{ id: r.data?.snapshot_id, label: action.label, created_at: new Date().toISOString() }, ...prev].slice(0, 20))
          break
        }
        default:
          result = { type: action.type, success: true, message: 'Done!' }
      }
    } catch (e: any) { result = { type: action.type, success: false, message: `Error: ${e.message}` } }
    setMessages(prev => prev.map(m => m === msg ? { ...m, actionResult: result } : m))
  }

  // Auto-snapshot before destructive actions
  async function autoSnapshot(label: string) {
    try {
      const r = await bridge('snapshot', 'POST', { label })
      if (r.success) setSnapshots(prev => [{ id: r.data?.snapshot_id, label, created_at: new Date().toISOString() }, ...prev].slice(0, 20))
    } catch {}
  }

  async function restoreSnapshot(snapshotId: string, label: string) {
    if (!confirm(`Restore to: "${label}"? This will overwrite current page content.`)) return
    const r = await bridge('restore', 'POST', { snapshot_id: snapshotId })
    if (r.success) {
      alert(`✓ Restored to: "${label}"`)
    } else {
      alert(`Failed to restore: ${r.error}`)
    }
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
      <div style={{ fontSize: 16, color: C.text2 }}>Connecting to {siteUrl}…</div>
    </div>
  )

  // No API key — show reconnect prompt
  if (!apiKey) return (
    <div style={{ padding: '80px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, padding: '48px 40px', textAlign: 'center' as const, maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 41, marginBottom: 16 }}>🔗</div>
        <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: 23, fontWeight: 700, color: C.text, marginBottom: 10 }}>Connection key missing</h2>
        <p style={{ fontSize: 16, color: C.text2, lineHeight: 1.65, marginBottom: 28 }}>
          The API key for <strong>{siteUrl}</strong> wasn't found. This usually means the plugin was reinstalled. Run the connect flow again — it only takes 30 seconds.
        </p>
        <a href={`/bridge/connect`} style={{ display: 'inline-block', padding: '14px 36px', background: C.accent, borderRadius: 12, color: 'white', textDecoration: 'none', fontSize: 16, fontWeight: 700, fontFamily: 'Poppins, sans-serif', boxShadow: '0 4px 14px rgba(232,101,26,0.3)' }}>
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
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, border: `1px solid ${C.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>🌐</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'Poppins, sans-serif', color: C.text }}>{siteInfo?.site?.name || siteUrl}</div>
            <div style={{ fontSize: 13, color: C.text3, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block'}}/>
              {cleanUrl} · WP {siteInfo?.wordpress?.version} · {siteInfo?.theme?.name || '?'} · {activePlugins.length} plugins
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {updates > 0 && <button onClick={() => send('Update all my plugins to the latest versions')} style={{ padding: '7px 12px', background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 8, fontSize: 13, color: C.yellow, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>⚠ {updates} update{updates>1?'s':''}</button>}
          <a href={`${cleanUrl}/wp-admin`} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>WP Admin ↗</a>
          <a href={cleanUrl} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>View Site ↗</a>
        </div>
      </div>

      {/* ── MAIN LAYOUT: AI LEFT + PREVIEW RIGHT ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 58px - 62px)' }}>

        {/* ── LEFT: AI CHAT + ISSUES + ACTIONS ── */}
        <div style={{ width: 440, flexShrink: 0, display: 'flex', flexDirection: 'column' as const, borderRight: `1px solid ${C.border}`, background: C.white, overflowY: 'auto', overscrollBehavior: 'contain' }}>

        {/* ════ 1. AI CHAT HERO ════ */}
        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ padding: '14px 20px 0', background: `linear-gradient(120deg, ${C.accentDim} 0%, white 55%)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 17 }}>✦</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Poppins, sans-serif', color: C.text }}>Ask ignyous anything</div>
                <div style={{ fontSize: 13, color: C.text2 }}>Plain English — I'll handle everything</div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatContainerRef} style={{ padding: '14px 24px', height: 300, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: msg.role==='user'?'row-reverse':'row', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: msg.role==='user'?C.accent:C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'white', fontWeight: 600, marginTop: 2 }}>
                  {msg.role==='user'?'U':'✦'}
                </div>
                <div style={{ maxWidth: '80%' }}>
                  <div style={{ padding: '10px 14px', borderRadius: 14, fontSize: 15, lineHeight: 1.65, background: msg.role==='user'?C.accent:C.surface, color: msg.role==='user'?'white':C.text, border: msg.role==='user'?'none':`1px solid ${C.border}`, ...(msg.role==='user'?{borderTopRightRadius:4}:{borderTopLeftRadius:4}) }}>
                    {msg.content.split('\n').map((l,li) => <div key={li} style={{ marginBottom: li<msg.content.split('\n').length-1?4:0 }}>{l.replace(/\*\*(.*?)\*\*/g,'$1')}</div>)}
                  </div>
                  {msg.action && !msg.actionResult && (
                    <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, fontSize: 14, color: C.yellow, display: 'flex', alignItems: 'center', gap: 7 }}>
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
                          background: C.accentDim, color: C.accent, fontSize: 15, fontWeight: 500,
                          cursor: 'pointer', fontFamily: 'Poppins, sans-serif', textAlign: 'left' as const,
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

                  <div style={{ fontSize: 12, color: C.text3, marginTop: 3, textAlign: msg.role==='user'?'right':'left' as const }}>
                    {msg.ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13 }}>✦</div>
                <div style={{ padding: '12px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, borderTopLeftRadius: 4 }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.text3, animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
                  </div>
                </div>
              </div>
            )}
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
                rows={2} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, fontFamily: 'Poppins, sans-serif', color: C.text, resize: 'none', lineHeight: 1.5, padding: '10px 0' }}
              />
              <button onClick={() => send()} disabled={sending||!input.trim()} style={{ alignSelf: 'flex-end', width: 44, height: 44, borderRadius: 12, border: 'none', flexShrink: 0, marginBottom: 2, background: sending||!input.trim()?C.border:C.accent, cursor: sending||!input.trim()?'not-allowed':'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="white"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
              </button>
            </div>
          </div>

          {/* Chips */}
          <div style={{ padding: '0 20px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} style={{ padding: '5px 11px', border: `1px solid ${C.border}`, borderRadius: 20, background: C.white, color: C.text2, fontSize: 12, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s', whiteSpace: 'nowrap' as const }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=C.accent; e.currentTarget.style.color=C.accent }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text2 }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* ════ ISSUES STRIP ════ */}
        {visibleIssues.length > 0 && (
          <div style={{ margin: '0 12px 12px', background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10 }}>
              ✦ {visibleIssues.length} issue{visibleIssues.length>1?'s':''} found
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
              {visibleIssues.map((issue, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'white', border: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 16 }}>{issue.icon}</span>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.text }}>{issue.title}</div>
                  <button onClick={() => send(issue.prompt)} style={{ padding: '4px 10px', background: C.accent, border: 'none', borderRadius: 6, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Fix ✦</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ QUICK ACTIONS ════ */}
        <div style={{ padding: '12px 12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10, paddingLeft: 4 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ACTIONS.slice(0, 8).map(action => (
              <button key={action.label}
                onClick={() => action.prompt==='OPEN_THEME_BROWSER' ? setShowThemes(true) : send(action.prompt)}
                style={{
                  padding: '12px 14px', background: C.white, border: `1.5px solid ${C.border}`,
                  borderRadius: 12, cursor: 'pointer', textAlign: 'left' as const,
                  fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 9,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=C.accent; e.currentTarget.style.background=C.accentDim }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.background=C.white }}
              >
                <span style={{ fontSize: 20 }}>{action.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{action.label}</div>
                  <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.3 }}>{action.desc}</div>
                </div>
              </button>
            ))}
          </div>
          <a href={`/content?site=${siteUrl}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', marginTop: 8, background: C.accentDim, border: `1.5px solid ${C.accentBorder}`, borderRadius: 12, textDecoration: 'none', transition: 'all 0.15s' }}>
            <span style={{ fontSize: 20 }}>✍️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.accent, lineHeight: 1.2 }}>Content Studio</div>
              <div style={{ fontSize: 11, color: C.text2 }}>Generate & schedule AI posts</div>
            </div>
          </a>
        </div>

        </div>{/* end left panel */}

        {/* ── RIGHT: LIVE SITE PREVIEW ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, background: '#E8E4DF', overflow: 'hidden' }}>

          {/* Preview toolbar */}
          <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['#FF5F57','#FFBD2E','#28CA41'].map(col => <div key={col} style={{ width: 11, height: 11, borderRadius: '50%', background: col }}/>)}
            </div>
            <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, color: C.text3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {previewUrl || cleanUrl}
            </div>
            {/* Desktop / Mobile toggle */}
            <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {(['desktop','mobile'] as const).map(m => (
                <button key={m} onClick={() => setPreviewMode(m)} style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 12, background: previewMode===m?C.text:'white', color: previewMode===m?'white':C.text2, fontFamily: 'Poppins, sans-serif' }}>
                  {m === 'desktop' ? '🖥' : '📱'}
                </button>
              ))}
            </div>
            <button onClick={() => { setIframeKey(k => k+1) }} style={{ padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'white', color: C.text2, fontSize: 12, cursor: 'pointer' }}>↺</button>
            <a href={previewUrl || cleanUrl} target="_blank" rel="noreferrer" style={{ padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'white', color: C.text2, fontSize: 12, textDecoration: 'none' }}>↗</a>
          </div>

          {/* iframe */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflow: 'auto' }}>
            <div style={{
              width: previewMode==='mobile' ? 390 : '100%',
              height: '100%', minHeight: 500, background: C.white,
              borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
              overflow: 'hidden', position: 'relative',
            }}>
              {(previewUrl || cleanUrl) ? (
                <iframe
                  key={iframeKey}
                  src={previewUrl || cleanUrl}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  title="Live site preview"
                  sandbox="allow-same-origin allow-scripts allow-forms"
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, color: C.text3, gap: 12 }}>
                  <div style={{ fontSize: 40 }}>🌐</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>Connect a site to see the preview</div>
                </div>
              )}
            </div>
          </div>

          {/* Preview status bar */}
          <div style={{ background: C.white, borderTop: `1px solid ${C.border}`, padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: C.text3, flexShrink: 0 }}>
            <span>Live preview — changes appear here automatically</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }}/>
              Connected
            </span>
          </div>
        </div>

      </div>{/* end main layout */}
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
