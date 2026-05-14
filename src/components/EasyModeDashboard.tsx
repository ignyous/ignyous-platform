'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import ReactMarkdown from 'react-markdown'

interface Message {
  role: 'user' | 'assistant'
  content: string
  image?: { base64: string; mediaType: string; name: string }
  options?: Array<{ label: string; value?: string }>
  ts: Date
}

interface Props {
  siteUrl: string
  apiKey: string
  pluginSlugs?: string[]
  userName?: string
  onSwitchMode?: () => void
}

type QuickAction = {
  icon: string
  title: string
  desc: string
  tone: string
  prompt: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: '🖌️',
    title: 'Change Theme Colors',
    desc: "Update your site's color palette and typography",
    tone: 'purple',
    prompt: "Help me change my site's theme colors and typography. First inspect the current theme and then suggest a cleaner color palette before applying changes.",
  },
  {
    icon: '📄',
    title: 'Create New Page',
    desc: 'Generate a new page with AI-written content',
    tone: 'blue',
    prompt: 'Create a new page for my WordPress site. Ask only for details you truly need, then generate polished content and publish it.',
  },
  {
    icon: '🔍',
    title: 'Improve SEO',
    desc: 'Optimize meta tags, headings, and content structure',
    tone: 'teal',
    prompt: 'Improve my SEO. Scan the site first, check installed SEO plugins, headings, titles, meta descriptions, sitemap, and indexing settings, then recommend and apply safe fixes.',
  },
  {
    icon: '⚡',
    title: 'Speed Optimization',
    desc: 'Identify and fix performance bottlenecks',
    tone: 'yellow',
    prompt: 'Speed optimize my site. Check caching plugins, images, scripts, CSS, and hosting-related issues. Fix what can be fixed safely and clear the right cache afterward.',
  },
  {
    icon: '🛡️',
    title: 'Security Check',
    desc: 'Audit plugins, themes, and configurations',
    tone: 'red',
    prompt: 'Run a WordPress security check. Review plugins, themes, users, SSL, backups, and common configuration risks. Tell me what needs attention before making risky changes.',
  },
  {
    icon: '🌐',
    title: 'Add New Plugin',
    desc: 'Find and configure the perfect plugin for your needs',
    tone: 'cyan',
    prompt: 'Help me add a new plugin. Ask what functionality I need, recommend the best plugin, install it, activate it, configure basics, and verify it works.',
  },
]

const SUGGESTIONS = [
  'Update my phone number everywhere',
  'Add a company name field to my contact form',
  'What pages does my site have?',
  'Rewrite my homepage to convert better',
]

const toneStyles: Record<string, { bg: string; color: string }> = {
  purple: { bg: 'hsl(276 95% 92%)', color: 'hsl(270 95% 58%)' },
  blue:   { bg: 'hsl(210 100% 88%)', color: 'hsl(209 96% 51%)' },
  teal:   { bg: 'hsl(171 82% 83%)', color: 'hsl(174 84% 36%)' },
  yellow: { bg: 'hsl(50 100% 84%)', color: 'hsl(37 92% 50%)' },
  red:    { bg: 'hsl(0 100% 89%)', color: 'hsl(0 84% 62%)' },
  cyan:   { bg: 'hsl(185 92% 85%)', color: 'hsl(188 86% 43%)' },
}

const S = {
  bg:           'hsl(220 20% 97%)',
  foreground:   'hsl(224 20% 12%)',
  muted:        'hsl(220 10% 55%)',
  mutedLight:   'hsl(220 10% 68%)',
  border:       'hsl(220 14% 89%)',
  card:         'hsl(0 0% 100%)',
  primary:      'hsl(248 79% 60%)',
  primaryDark:  'hsl(248 79% 50%)',
  primaryLight: 'hsl(248 79% 93%)',  // light purple for hover
  sidebarAccent:'hsl(248 60% 96%)',
}

function SparkIcon({ small = false }: { small?: boolean }) {
  return (
    <svg width={small ? 18 : 38} height={small ? 18 : 38} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 4l3.7 11.5L36 20l-12.3 4.5L20 36l-3.7-11.5L4 20l12.3-4.5L20 4z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M8 8l1.3 3.7L13 13l-3.7 1.3L8 18l-1.3-3.7L3 13l3.7-1.3L8 8z" fill="currentColor"/>
      <path d="M32 5l.9 2.6L36 8.5l-3.1.9L32 12l-.9-2.6-3.1-.9 3.1-.9L32 5z" fill="currentColor"/>
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M3 12h18M12 3c2.5 2.7 3.7 5.7 3.7 9S14.5 18.3 12 21c-2.5-2.7-3.7-5.7-3.7-9S9.5 5.7 12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 3L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 3l-7 18-4-7-7-4 18-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return <span style={{ width: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(220 10% 45%)' }}>{children}</span>
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

interface SiteEntry { id: string; url: string; name: string | null }

export default function EasyModeDashboard({ siteUrl, apiKey, userName, onSwitchMode }: Props) {
  const { data: session } = useSession()
  const [messages, setMessages]           = useState<Message[]>([])
  const [input, setInput]                 = useState('')
  const [sending, setSending]             = useState(false)
  const [previewKey, setPreviewKey]       = useState(0)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [siteInfo, setSiteInfo]           = useState<any>(null)
  const [pages, setPages]               = useState<any[]>([])
  const [sites, setSites]               = useState<SiteEntry[]>([])
  const [showSiteDrop, setShowSiteDrop] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [siteStatus, setSiteStatus]     = useState<'live' | 'offline' | 'checking'>('checking')
  const [pendingImage, setPendingImage] = useState<{ base64: string; mediaType: string; name: string } | null>(null)
  const [dragOver, setDragOver]         = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const dropRef     = useRef<HTMLDivElement>(null)
  const userRef     = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cleanUrl    = siteUrl ? siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://') : ''
  const siteDomain  = cleanUrl.replace(/^https?:\/\//, '')
  const siteKey     = cleanUrl.replace(/[^a-z0-9]/gi, '_')
  const siteName    = siteInfo?.site?.name || siteInfo?.site_name || siteDomain || 'your WordPress site'
  const wpVersion   = siteInfo?.wordpress?.version || siteInfo?.wp_version || ''
  const activePlugins = (siteInfo?.plugins || []).filter((p: any) => p.active !== false)
  const pluginCount = activePlugins.length
  const displayUser = session?.user?.name || session?.user?.email?.split('@')[0] || userName || 'Account'
  const userInitial = displayUser[0]?.toUpperCase() || 'A'

  // ── Save chat to sessionStorage (session-only, not persisted across reloads) ──
  useEffect(() => {
    if (!siteKey || messages.length === 0) return
    try {
      const toSave = messages.slice(-60).map(m => ({ role: m.role, content: m.content, ts: m.ts.getTime() }))
      sessionStorage.setItem(`ignyous_chat_${siteKey}`, JSON.stringify(toSave))
    } catch {}
  }, [messages, siteKey])

  // ── Load site info + pages + status ───────────────────────────
  useEffect(() => {
    if (!siteUrl || !apiKey) return

    // Chat starts clean on every page load (session-only memory)
    // sessionStorage is cleared automatically when the tab/window closes

    // Fetch site profile
    fetch('/api/scan/profile?siteUrl=' + encodeURIComponent(cleanUrl) + '&apiKey=' + encodeURIComponent(apiKey))
      .then(r => r.json())
      .then(d => {
        if (d.profile) setSiteInfo(d.profile)
        else if (d.site) setSiteInfo(d)
        else setSiteInfo(d)
      })
      .catch(() => {})

    // Fetch pages directly from bridge
    fetch('/api/wordpress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: cleanUrl, apiKey, endpoint: 'pages', method: 'GET' }),
    })
      .then(r => r.json())
      .then(d => {
        const raw = d?.data?.pages || d?.pages || []
        setPages(raw)
      })
      .catch(() => {})

    // Check if site is live
    fetch('/api/wordpress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: cleanUrl, apiKey, endpoint: 'verify', method: 'GET' }),
    })
      .then(r => r.ok ? setSiteStatus('live') : setSiteStatus('offline'))
      .catch(() => setSiteStatus('offline'))

    setTimeout(() => inputRef.current?.focus(), 250)
  }, [siteUrl, apiKey, cleanUrl, siteKey])

  // Load connected sites for dropdown
  useEffect(() => {
    fetch('/api/sites')
      .then(r => r.json())
      .then(d => { if (d.sites?.length > 0) setSites(d.sites) })
      .catch(() => {})
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowSiteDrop(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  // ── Build rich siteContext for AI (includes pages) ─────────────
  function buildSiteContext() {
    const theme   = siteInfo?.theme?.name   || siteInfo?.site?.theme  || ''
    const builder = siteInfo?.builder       || ''
    const activeP = pages.filter((p: any) => p.status === 'publish')
    const draftP  = pages.filter((p: any) => p.status !== 'publish')
    return {
      site_name:     siteName,
      site_url:      cleanUrl,
      wp_version:    wpVersion,
      theme:         theme,
      active_theme:  theme,
      builder:       builder,
      plugin_count:  pluginCount,
      plugins:       activePlugins.map((p: any) => ({ name: p.name, slug: p.slug })),
      pages:         pages.map((p: any) => ({ id: p.id, title: p.title, status: p.status, link: p.link })),
      page_count:    pages.length,
      active_pages:  activeP.length,
      draft_pages:   draftP.length,
      mode:          'easy',
      instruction:   [
        'You have FULL site context. Use it — do NOT emit scan_site or any scanning action.',
        'Format responses using markdown: **bold**, bullet lists, and tables where useful.',
        'Keep answers concise and helpful.',
      ].join(' '),
    }
  }

  // ── Execute AI actions ─────────────────────────────────────────
  async function executeAction(action: any, capturedImage?: { base64: string; mediaType: string; name: string } | null): Promise<string | null> {
    const type = action.type
    try {
      if (type === 'clear_cache') {
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
        return null

      } else if (type === 'scan_site') {
        fetch('/api/wordpress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl: cleanUrl, apiKey, endpoint: 'pages', method: 'GET' }),
        }).then(r => r.json()).then(d => {
          const fetched = d?.data?.pages || d?.pages || []
          if (fetched.length > 0) setPages(fetched)
        }).catch(() => {})
        return null

      } else if (type === 'update_page' || type === 'create_page' || type === 'update_site_options') {
        await fetch('/api/wordpress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
        return null

      } else if (type === 'install_plugin' || type === 'install_theme') {
        await fetch('/api/wordpress/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
        return null

      } else if (type === 'upload_image' || type === 'upload_logo') {
        // Priority: image the user attached → action.imageBase64 → action.data (Claude sometimes puts it here)
        const base64    = capturedImage?.base64 || action.imageBase64 || action.data || ''
        const mediaType = capturedImage?.mediaType || action.mediaType || 'image/png'
        const fileName  = capturedImage?.name || action.fileName || action.filename || 'upload.png'
        const setAsLogo = action.setAsLogo ?? (type === 'upload_logo') ?? true

        if (!base64) {
          return '⚠️ No image attached. Please use the 📎 button to attach an image, then try again.'
        }

        const r = await fetch('/api/wordpress/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl: cleanUrl, apiKey, imageBase64: base64, mediaType, fileName, setAsLogo }),
        })
        const d = await r.json()

        const debugSection = d.debug_log?.length
          ? `\n\n---\n**Debug log:**\n${d.debug_log.map((l: string) => `\`${l}\``).join('\n')}`
          : ''

        if (!d.success) {
          return `❌ Upload failed: ${d.error || 'Unknown error'}${debugSection}\n\nMake sure the updated ignyous-bridge plugin is installed.`
        }

        return `✅ ${d.message}${d.url ? `\n\n[View uploaded image ↗](${d.url})` : ''}${debugSection}`

      } else if (type === 'scan_content') {
        const r = await fetch('/api/scan/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan', siteUrl: cleanUrl, apiKey, query: action.query }) })
        const d = await r.json()
        if (d.success && d.summary?.length > 0) {
          return `Found ${d.unique_values} unique value${d.unique_values !== 1 ? 's' : ''}:\n\n` +
            d.summary.slice(0, 10).map((s: any, i: number) => `${i + 1}. "${s.value}" — ${s.count} match${s.count !== 1 ? 'es' : ''} in ${s.locations.join(', ')}`).join('\n')
        }
        return null

      } else if (type === 'scan_options') {
        // Confidence-scored DB scan — finds where content is stored across options + posts
        const r = await fetch('/api/wordpress/scan-options', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl: cleanUrl, apiKey, query: action.query, scope: action.scope || 'all' }),
        })
        const d = await r.json()
        if (!d.success || !d.matches?.length) return `No matches found for "${action.query}".`
        const lines = d.matches.slice(0, 10).map((m: any) => {
          const conf = m.confidence >= 80 ? '🟢 High' : m.confidence >= 50 ? '🟡 Medium' : '🔴 Low'
          const loc  = m.source === 'post_content' ? `Page "${m.post_title}"` : m.field_path
          return `- **${conf}** confidence — \`${loc}\`\n  Current value: "${m.current_value}"`
        }).join('\n')
        return `Found **${d.count}** match${d.count !== 1 ? 'es' : ''} for "${action.query}":\n\n${lines}`

      } else if (type === 'update_option') {
        // Update a specific DB option field (from a previous scan_options result)
        const r = await fetch('/api/wordpress/update-option', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl: cleanUrl, apiKey, ...action }),
        })
        const d = await r.json()
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
        return d.success
          ? `✅ Updated \`${action.field_path}\`\nOld: "${d.old}"\nNew: "${d.new}"`
          : `❌ Update failed: ${d.error}`

      } else if (type === 'replace_content') {
        const r = await fetch('/api/scan/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'replace', siteUrl: cleanUrl, apiKey, find: action.find, replace: action.replace }) })
        const d = await r.json()
        if (d.success) {
          await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
          return `✅ Replaced ${d.updated_count ?? 0} instance${d.updated_count !== 1 ? 's' : ''} of "${action.find}" site-wide.`
        }
        return `❌ Replace failed: ${d.error || 'Unknown error'}`
      }
    } catch (e: any) {
      return `Action failed: ${e.message}`
    }
    return null
  }

  function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      const base64  = dataUrl.split(',')[1]
      setPendingImage({ base64, mediaType: file.type, name: file.name })
    }
    reader.readAsDataURL(file)
  }

  async function send(text?: string) {
    const msg = (text || input).trim()
    if ((!msg && !pendingImage) || sending) return

    const imageToSend = pendingImage
    setInput('')
    setPendingImage(null)
    setSending(true)

    const userMsg: Message = {
      role: 'user',
      content: msg || (imageToSend ? `Please process this image: ${imageToSend.name}` : ''),
      image: imageToSend || undefined,
      ts: new Date(),
    }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)

    try {
      // Trim history sent to API — keep last 12 exchanges max to stay under token limits.
      // Full history is still stored in localStorage for the UI.
      const MAX_API_MESSAGES = 12
      const trimmedMessages = nextMessages.length > MAX_API_MESSAGES
        ? nextMessages.slice(-MAX_API_MESSAGES)
        : nextMessages

      // Build messages for Claude — include image as vision content block if present
      const apiMessages = trimmedMessages.map(m => {
        if (m.image && m.role === 'user') {
          return {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: m.image.mediaType, data: m.image.base64 } },
              { type: 'text',  text: m.content || 'Please process this image.' },
            ],
          }
        }
        return { role: m.role, content: m.content }
      })

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:    apiMessages,
          siteUrl:     cleanUrl,
          apiKey,
          siteContext: buildSiteContext(),
        }),
      })
      const data = await res.json()

      let actionResult: string | null = null
      if (data.action) {
        actionResult = await executeAction(data.action, imageToSend)
        // Refresh preview after any action that changes the site
        const noRefreshTypes = ['scan_options', 'scan_content', 'scan_site']
        if (data.action?.type && !noRefreshTypes.includes(data.action.type)) {
          setTimeout(() => setPreviewKey(k => k + 1), 800) // slight delay for WP to process
        }
      }

      const aiText    = data.text || (data.error ? `⚠️ Error: ${data.error}` : 'Something went wrong.')
      const finalText = actionResult || aiText

      // Hallucination guard: if AI says it made a change but emitted no action block, warn the user
      const claimsChange = !data.action && /\b(updated|changed|replaced|modified|applied|done|complete|i've made|i have updated)\b/i.test(aiText)
      const warningText  = claimsChange
        ? `\n\n⚠️ *Note: No action was actually executed. Ask me again and I'll make sure to apply the change.*`
        : ''

      setMessages(prev => [...prev, {
        role:    'assistant',
        content: finalText + warningText,
        options: data.options || undefined,
        ts:      new Date(),
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Something went wrong: ${err?.message || err}`, ts: new Date() }])
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const statusBadge = (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: siteStatus === 'live' ? '#dcfce7' : siteStatus === 'offline' ? '#fee2e2' : '#f3f4f6',
      color: siteStatus === 'live' ? '#16a34a' : siteStatus === 'offline' ? '#dc2626' : '#6b7280',
      border: `1px solid ${siteStatus === 'live' ? '#86efac' : siteStatus === 'offline' ? '#fca5a5' : '#e5e7eb'}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: siteStatus === 'live' ? '#16a34a' : siteStatus === 'offline' ? '#dc2626' : '#9ca3af', display: 'inline-block' }}/>
      {siteStatus === 'live' ? 'Live' : siteStatus === 'offline' ? 'Offline' : '…'}
    </span>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: S.bg, color: S.foreground, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' }}>

      {/* ── TOP BAR (matching Advanced Mode) ── */}
      <div style={{ height: 52, background: S.card, borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: S.muted }}>
          <span style={{ color: S.foreground, fontWeight: 700 }}>Ignyous AI</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${S.border}`, background: S.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, position: 'relative' }}>
            🔔<div style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: 'hsl(37 92% 50%)', border: '1.5px solid white' }}/>
          </button>
          <div style={{ position: 'relative' }} ref={userRef}>
            <button onClick={() => setShowUserMenu(!showUserMenu)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px', border: `1px solid ${S.border}`, borderRadius: 10, background: S.bg, cursor: 'pointer' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: S.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>{userInitial}</div>
              <span style={{ fontSize: 13, fontWeight: 600, color: S.foreground, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUser}</span>
              <ChevronDown />
            </button>
            {showUserMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: S.card, border: `1px solid ${S.border}`, borderRadius: 14, boxShadow: '0 8px 32px rgba(26,26,78,0.15)', minWidth: 200, zIndex: 200, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${S.border}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: S.foreground }}>{displayUser}</div>
                  <div style={{ fontSize: 12, color: S.mutedLight, marginTop: 2 }}>{session?.user?.email}</div>
                </div>
                {[{ label: 'Account Settings', icon: '⚙', href: '/settings' }, { label: 'Billing', icon: '💳', href: '/billing' }, { label: 'Help & Support', icon: '❓', href: '/help' }].map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setShowUserMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', textDecoration: 'none', color: S.foreground, fontSize: 13 }}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
                  </Link>
                ))}
                <div style={{ borderTop: `1px solid ${S.border}` }}>
                  <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', fontSize: 13, fontWeight: 600, textAlign: 'left' }}>
                    <span style={{ fontSize: 15 }}>🚪</span> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BODY: SIDEBAR + MAIN ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT SIDEBAR ── */}
        <aside style={{ width: 220, background: S.card, borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: S.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 5v6l6 4 6-4V5L8 1zm0 2l4 2.7V11L8 13.4 4 11V5.7L8 3z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>ignyous<span style={{ color: S.primary }}>.ai</span></div>
              <div style={{ fontSize: 10, color: S.mutedLight, marginTop: 2 }}>WordPress Assistant</div>
            </div>
          </div>

          <nav style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button style={{ border: 0, borderRadius: 9, background: S.sidebarAccent, color: S.primaryDark, height: 36, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 13, fontWeight: 600, cursor: 'default', textAlign: 'left' }}>
              <NavIcon>▱</NavIcon> Chat
            </button>
            <button onClick={() => { setMessages([]); try { localStorage.removeItem(`ignyous_chat_${siteKey}`) } catch {} }} style={{ border: 0, borderRadius: 9, background: 'transparent', color: 'hsl(224 15% 38%)', height: 36, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' as const, width: '100%' }}>
              <NavIcon>＋</NavIcon> New Chat
            </button>
            <Link href="/overview" style={{ textDecoration: 'none', borderRadius: 9, color: 'hsl(224 15% 38%)', height: 36, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 13, fontWeight: 500 }}>
              <NavIcon>◎</NavIcon> Sites
            </Link>
            <Link href="/activity" style={{ textDecoration: 'none', borderRadius: 9, color: 'hsl(224 15% 38%)', height: 36, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 13, fontWeight: 500 }}>
              <NavIcon>↺</NavIcon> History
            </Link>
            <Link href="/settings" style={{ textDecoration: 'none', borderRadius: 9, color: 'hsl(224 15% 38%)', height: 36, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 13, fontWeight: 500 }}>
              <NavIcon>⚙</NavIcon> Settings
            </Link>
          </nav>

          <div style={{ padding: '20px 14px 6px', color: 'hsl(220 10% 63%)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em' }}>RECENT CHATS</div>
          <div style={{ flex: 1 }} />

          <div style={{ borderTop: `1px solid ${S.border}`, padding: 10, display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: S.primary, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{userInitial}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{displayUser}</div>
              <div style={{ fontSize: 10, color: S.mutedLight }}>Easy Mode</div>
            </div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Header row: site info left, Select a Site dropdown + mode toggle right */}
          <header style={{ height: 58, background: S.card, borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px 0 24px', flexShrink: 0 }}>
            {/* LEFT: current site info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: S.sidebarAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🌐</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: S.foreground }}>
                  {siteDomain || 'No site selected'}
                  {statusBadge}
                </div>
                <div style={{ fontSize: 11, color: S.mutedLight, marginTop: 1 }}>
                  {wpVersion ? `WP ${wpVersion}` : 'WordPress'}{pluginCount > 0 ? ` · ${pluginCount} plugins` : ''}
                </div>
              </div>
            </div>

            {/* RIGHT: Site dropdown + mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Select a Site dropdown */}
              <div style={{ position: 'relative' }} ref={dropRef}>
                <button
                  onClick={() => setShowSiteDrop(!showSiteDrop)}
                  style={{ height: 32, border: `1px solid ${S.border}`, borderRadius: 10, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 7, color: 'hsl(224 15% 35%)', background: S.card, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  <GlobeIcon /> Select a Site <ChevronDown />
                </button>
                {showSiteDrop && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, minWidth: 220, boxShadow: '0 10px 32px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden' }}>
                    <div style={{ padding: '6px 0' }}>
                      {sites.length === 0 && (
                        <div style={{ padding: '10px 16px', fontSize: 13, color: S.mutedLight }}>No sites connected yet</div>
                      )}
                      {sites.map(site => {
                        const slug = site.url.replace(/^https?:\/\//, '').replace(/\/$/, '')
                        return (
                          <a key={site.id} href={`/dashboard?site=${encodeURIComponent(site.url)}&key=`} onClick={() => setShowSiteDrop(false)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', textDecoration: 'none', color: site.url === siteUrl ? S.primary : S.foreground, fontSize: 13, fontWeight: site.url === siteUrl ? 700 : 500, background: site.url === siteUrl ? S.primaryLight : 'transparent' }}
                            onMouseEnter={e => { if (site.url !== siteUrl) (e.currentTarget as HTMLElement).style.background = S.sidebarAccent }}
                            onMouseLeave={e => { if (site.url !== siteUrl) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                          >
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'hsl(142 76% 42%)', flexShrink: 0 }}/>
                            <div>
                              <div>{site.name || slug}</div>
                              {site.name && <div style={{ fontSize: 11, color: S.mutedLight }}>{slug}</div>}
                            </div>
                          </a>
                        )
                      })}
                      <div style={{ borderTop: `1px solid ${S.border}`, margin: '4px 0' }}/>
                      <a href="/bridge/connect" onClick={() => setShowSiteDrop(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', textDecoration: 'none', color: S.primary, fontSize: 13, fontWeight: 700 }}>
                        <span style={{ fontSize: 16 }}>+</span> New Site
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Easy / Advanced toggle */}
              <div style={{ background: 'hsl(220 16% 94%)', borderRadius: 12, padding: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                <button style={{ border: 0, background: S.primary, color: 'white', borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                  ✨ Easy
                </button>
                <button onClick={onSwitchMode} style={{ border: 0, background: 'transparent', color: 'hsl(224 15% 35%)', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, cursor: onSwitchMode ? 'pointer' : 'default' }}>
                  ‹/› Advanced
                </button>
              </div>
            </div>
          </header>

          {/* ── 2-column body: chat left, preview right — matching Advanced Mode proportions ── */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

            {/* ── CHAT COLUMN — fixed 500px matching Advanced Mode ── */}
            <section
              style={{ width: 500, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${S.border}`, overflow: 'hidden' }}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                const file = e.dataTransfer.files[0]
                if (file) handleImageFile(file)
              }}
            >
              {/* drag overlay */}
              {dragOver && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(99,87,255,0.08)', border: `2px dashed ${S.primary}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: S.primary }}>📎 Drop image here</div>
                </div>
              )}

              {/* ── MESSAGES (scrollable) ── */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: messages.length ? '24px 28px 16px' : '0 24px' }}>
                {messages.length === 0 ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ maxWidth: 520 }}>
                      <div style={{ width: 80, height: 80, borderRadius: 40, background: 'hsl(248 79% 94%)', color: S.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                        <SparkIcon />
                      </div>
                      <h1 style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 14px' }}>Ignyous AI</h1>
                      <p style={{ color: S.muted, fontSize: 15, lineHeight: 1.55, margin: '0 auto', maxWidth: 460 }}>
                        Ask me anything about your WordPress site. I can help you edit content, change themes, optimize SEO, and much more.
                      </p>
                      <p style={{ color: S.mutedLight, fontSize: 13, marginTop: 12 }}>💡 You can also drag & drop or paste images directly into the chat.</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {messages.map((msg, index) => (
                      <div key={`${msg.role}-${index}-${msg.ts.getTime()}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '82%', display: 'flex', gap: 10, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, background: msg.role === 'user' ? S.primary : 'hsl(248 79% 94%)', color: msg.role === 'user' ? 'white' : S.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                            {msg.role === 'user' ? 'You' : <SparkIcon small />}
                          </div>
                          <div>
                            {/* Image preview if message has an image */}
                            {msg.image && (
                              <div style={{ marginBottom: 6 }}>
                                <img src={`data:${msg.image.mediaType};base64,${msg.image.base64}`} alt={msg.image.name} style={{ maxWidth: 260, maxHeight: 180, borderRadius: 12, border: `1px solid ${S.border}`, display: 'block' }} />
                              </div>
                            )}
                            <div style={{ background: msg.role === 'user' ? S.primary : S.card, color: msg.role === 'user' ? 'white' : S.foreground, border: msg.role === 'user' ? 'none' : `1px solid ${S.border}`, borderRadius: msg.role === 'user' ? '18px 18px 5px 18px' : '18px 18px 18px 5px', padding: '12px 15px', boxShadow: msg.role === 'user' ? '0 10px 24px hsla(248,79%,60%,.2)' : '0 1px 2px rgba(15,23,42,.04)', fontSize: 14, lineHeight: 1.6 }}>
                              {msg.role === 'user' ? (
                                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                              ) : (
                                <ReactMarkdown
                                  components={{
                                    table: ({ children }) => (
                                      <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
                                      </div>
                                    ),
                                    thead: ({ children }) => <thead style={{ background: S.sidebarAccent }}>{children}</thead>,
                                    th: ({ children }) => <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: S.primaryDark, borderBottom: `2px solid ${S.border}`, whiteSpace: 'nowrap' as const }}>{children}</th>,
                                    td: ({ children }) => <td style={{ padding: '8px 14px', borderBottom: `1px solid ${S.border}` }}>{children}</td>,
                                    tr: ({ children }) => <tr>{children}</tr>,
                                    p: ({ children }) => <p style={{ margin: '0 0 6px', lineHeight: 1.65 }}>{children}</p>,
                                    strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                                    ul: ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</ul>,
                                    ol: ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</ol>,
                                    li: ({ children }) => <li style={{ lineHeight: 1.55 }}>{children}</li>,
                                    code: ({ children }) => <code style={{ background: S.sidebarAccent, padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', color: S.primaryDark }}>{children}</code>,
                                    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: S.primary, textDecoration: 'underline' }}>{children}</a>,
                                    hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${S.border}`, margin: '8px 0' }} />,
                                  }}
                                >
                                  {msg.content}
                                </ReactMarkdown>
                              )}
                            </div>
                            {msg.options && msg.options.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                {msg.options.map((opt, oi) => (
                                  <button key={oi} onClick={() => send(opt.value || opt.label)} style={{ textAlign: 'left', background: S.primaryLight, color: S.primaryDark, border: `1px solid ${S.border}`, borderRadius: 12, padding: '9px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {sending && (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: S.muted, fontSize: 14 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: 'hsl(248 79% 94%)', color: S.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SparkIcon small /></div>
                        <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: '18px 18px 18px 5px', padding: '12px 15px' }}>Thinking…</div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              {/* ── INPUT BAR (flex item, not absolute) ── */}
              <div style={{ flexShrink: 0, padding: '10px 28px 20px', background: S.bg }}>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }} />

                {/* Pending image preview */}
                {pendingImage && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '8px 12px', background: S.card, border: `1px solid ${S.border}`, borderRadius: 10 }}>
                    <img src={`data:${pendingImage.mediaType};base64,${pendingImage.base64}`} alt={pendingImage.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                    <div style={{ flex: 1, fontSize: 12, color: S.muted }}>{pendingImage.name}</div>
                    <button onClick={() => setPendingImage(null)} style={{ border: 0, background: 'transparent', color: S.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                )}

                <div style={{ maxWidth: 844, margin: '0 auto', background: S.card, border: `1px solid ${S.border}`, borderRadius: 15, boxShadow: '0 4px 20px rgba(15,23,42,.06)', display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 10px 10px 14px' }}>
                  {/* Upload button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image"
                    style={{ width: 32, height: 32, flexShrink: 0, border: 0, borderRadius: 8, background: pendingImage ? S.primaryLight : 'transparent', color: pendingImage ? S.primary : S.mutedLight, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = S.primaryLight; (e.currentTarget as HTMLElement).style.color = S.primary }}
                    onMouseLeave={e => { if (!pendingImage) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = S.mutedLight } }}
                  >
                    {/* Attachment/image icon */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </button>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    onPaste={e => {
                      const items = e.clipboardData.items
                      for (const item of Array.from(items)) {
                        if (item.type.startsWith('image/')) {
                          const file = item.getAsFile()
                          if (file) { handleImageFile(file); e.preventDefault() }
                        }
                      }
                    }}
                    placeholder="Ask AI to edit your WordPress site... (or drag & drop an image)"
                    rows={1}
                    style={{ flex: 1, minHeight: 38, maxHeight: 124, border: 0, outline: 0, resize: 'none', background: 'transparent', color: S.foreground, fontFamily: 'inherit', fontSize: 15, lineHeight: '38px' }}
                  />
                  <button onClick={() => send()} disabled={sending || (!input.trim() && !pendingImage)} aria-label="Send" style={{ width: 34, height: 34, border: 0, borderRadius: 12, flexShrink: 0, background: (sending || (!input.trim() && !pendingImage)) ? 'hsl(248 70% 78%)' : S.primary, color: 'white', cursor: (sending || (!input.trim() && !pendingImage)) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SendIcon />
                  </button>
                </div>
                <div style={{ textAlign: 'center', color: S.mutedLight, fontSize: 11, marginTop: 8 }}>AI can make mistakes. Always verify changes before publishing.</div>
              </div>
            </section>

            {/* ── PREVIEW COLUMN — flex-1 takes all remaining space ── */}
            <aside style={{ flex: 1, minWidth: 0, background: S.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Preview toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${S.border}`, flexShrink: 0, background: S.card }}>
                {/* Device toggles */}
                <div style={{ display: 'flex', background: 'hsl(220 16% 94%)', borderRadius: 8, padding: 2, gap: 2 }}>
                  {(['desktop', 'mobile'] as const).map(d => (
                    <button key={d} onClick={() => setPreviewDevice(d)}
                      style={{ border: 0, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: previewDevice === d ? S.primary : 'transparent', color: previewDevice === d ? 'white' : S.muted, transition: 'all .15s' }}>
                      {d === 'desktop' ? '🖥' : '📱'}
                    </button>
                  ))}
                </div>
                {/* URL bar */}
                <div style={{ flex: 1, background: 'hsl(220 20% 97%)', border: `1px solid ${S.border}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, color: S.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                  {cleanUrl}
                </div>
                {/* Refresh */}
                <button onClick={() => setPreviewKey(k => k + 1)} title="Refresh preview"
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 14, color: S.muted, padding: '4px 6px', borderRadius: 6 }}>↺</button>
                {/* Open in new tab */}
                <a href={cleanUrl} target="_blank" rel="noreferrer" title="Open site"
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13, color: S.muted, padding: '4px 6px', borderRadius: 6, textDecoration: 'none' }}>↗</a>
              </div>

              {/* iframe */}
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', position: 'relative' }}>
                {cleanUrl ? (
                  previewDevice === 'desktop' ? (
                    <iframe
                      key={previewKey}
                      src={cleanUrl}
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                      title="Site preview"
                    />
                  ) : (
                    /* Mobile: scale to 375px viewport */
                    <div style={{ width: 375, height: '100%', position: 'relative', overflow: 'hidden', transformOrigin: 'top left',
                      transform: `scale(${Math.min(1, 460 / 375)})`, boxShadow: '0 0 0 1px hsl(220 16% 86%)' }}>
                      <iframe
                        key={previewKey + '-m'}
                        src={cleanUrl}
                        style={{ width: 375, height: '100%', border: 'none', display: 'block' }}
                        title="Mobile preview"
                      />
                    </div>
                  )
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: S.muted, fontSize: 13 }}>
                    Connect a site to see a preview
                  </div>
                )}
              </div>

              {/* Quick actions — compact strip at bottom */}
              <div style={{ flexShrink: 0, borderTop: `1px solid ${S.border}`, padding: '12px 14px', background: S.card, overflowY: 'auto', maxHeight: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: S.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Quick Actions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {QUICK_ACTIONS.map(action => (
                    <button key={action.title} onClick={() => send(action.prompt)}
                      style={{ border: `1px solid ${S.border}`, borderRadius: 8, background: 'hsl(220 20% 98%)', padding: '6px 10px', color: S.foreground, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                      onMouseEnter={e => { e.currentTarget.style.background = S.primaryLight; e.currentTarget.style.borderColor = 'hsl(248 60% 82%)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'hsl(220 20% 98%)'; e.currentTarget.style.borderColor = S.border }}>
                      <span>{action.icon}</span> {action.title}
                    </button>
                  ))}
                </div>
              </div>

            </aside>

          </div>
        </main>
      </div>
    </div>
  )
}
