'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
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
  blue: { bg: 'hsl(210 100% 88%)', color: 'hsl(209 96% 51%)' },
  teal: { bg: 'hsl(171 82% 83%)', color: 'hsl(174 84% 36%)' },
  yellow: { bg: 'hsl(50 100% 84%)', color: 'hsl(37 92% 50%)' },
  red: { bg: 'hsl(0 100% 89%)', color: 'hsl(0 84% 62%)' },
  cyan: { bg: 'hsl(185 92% 85%)', color: 'hsl(188 86% 43%)' },
}

const styles = {
  bg: 'hsl(220 20% 97%)',
  foreground: 'hsl(224 20% 12%)',
  muted: 'hsl(220 10% 55%)',
  mutedLight: 'hsl(220 10% 68%)',
  border: 'hsl(220 14% 89%)',
  card: 'hsl(0 0% 100%)',
  primary: 'hsl(248 79% 60%)',
  primaryDark: 'hsl(248 79% 50%)',
  sidebarAccent: 'hsl(248 60% 96%)',
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

export default function EasyModeDashboard({ siteUrl, apiKey, userName, onSwitchMode }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [siteInfo, setSiteInfo] = useState<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const cleanUrl = siteUrl ? siteUrl.replace(/\/$/, '') : ''
  const siteName = siteInfo?.site_name || siteInfo?.site?.name || cleanUrl.replace(/^https?:\/\//, '') || 'your WordPress site'
  const workspaceInitial = (userName || 'WP').trim()[0]?.toUpperCase() || 'W'

  useEffect(() => {
    if (!siteUrl || !apiKey) return

    fetch('/api/scan/profile?siteUrl=' + encodeURIComponent(cleanUrl) + '&apiKey=' + encodeURIComponent(apiKey))
      .then(r => r.json())
      .then(d => {
        if (d.profile) setSiteInfo(d.profile)
        else if (d.site) setSiteInfo(d)
      })
      .catch(() => {})

    setTimeout(() => inputRef.current?.focus(), 250)
  }, [siteUrl, apiKey, cleanUrl])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  async function executeAction(action: any) {
    const type = action.type
    try {
      if (type === 'clear_cache') {
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'update_page' || type === 'create_page' || type === 'update_site_options') {
        await fetch('/api/wordpress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'update_seo') {
        await fetch('/api/seo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'install_plugin' || type === 'install_theme') {
        await fetch('/api/wordpress/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'plugin_action') {
        await fetch('/api/plugins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'update_element') {
        await fetch('/api/element', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action.findByDescription ? 'find_and_update' : 'update_element', siteUrl: cleanUrl, apiKey, pageId: action.pageId, elementId: action.elementId, description: action.findByDescription, updates: action.updates }),
        })
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'scan_content') {
        const r = await fetch('/api/scan/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan', siteUrl: cleanUrl, apiKey, query: action.query, pattern: action.pattern }) })
        const d = await r.json()
        if (d.success && d.summary?.length > 0) {
          const summaryText = d.summary.slice(0, 10).map((s: any, i: number) =>
            `${i + 1}. "${s.value}" — ${s.count} match${s.count !== 1 ? 'es' : ''} in ${s.locations.join(', ')}`
          ).join('\n')
          setMessages(prev => [...prev, { role: 'assistant', content: `Found ${d.unique_values} unique value${d.unique_values !== 1 ? 's' : ''}:\n\n${summaryText}`, ts: new Date() }])
        }
      } else if (type === 'replace_content') {
        const r = await fetch('/api/scan/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'replace', siteUrl: cleanUrl, apiKey, find: action.find, replace: action.replace }) })
        const d = await r.json()
        if (d.success) await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
      }
    } catch {
      // Let the assistant message explain next steps.
    }
  }

  async function send(text?: string) {
    const msg = (text || input).trim()
    if (!msg || sending) return

    setInput('')
    setSending(true)

    const userMsg: Message = { role: 'user', content: msg, ts: new Date() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          siteUrl: cleanUrl,
          apiKey,
          siteContext: {
            site_name: siteName,
            site_url: cleanUrl,
            mode: 'easy',
            instruction: 'Respond in plain English. In easy mode, inspect the WordPress site context before asking clarifying questions. Ask only when there is real ambiguity.',
          },
        }),
      })
      const data = await res.json()

      if (data.action) await executeAction(data.action)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.text || 'Done!',
        options: data.options || undefined,
        ts: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.', ts: new Date() }])
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      background: styles.bg,
      color: styles.foreground,
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflow: 'hidden',
    }}>
      <aside style={{ width: 220, background: styles.card, borderRight: `1px solid ${styles.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '18px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: 'hsl(248 79% 96%)', color: styles.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SparkIcon small />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>WP AI Editor</div>
            <div style={{ fontSize: 11, color: styles.mutedLight, marginTop: 3 }}>WordPress Assistant</div>
          </div>
        </div>

        <div style={{ padding: '4px 12px 12px' }}>
          <button onClick={() => setMessages([])} style={{ width: '100%', height: 34, border: `1px solid ${styles.border}`, borderRadius: 12, background: styles.card, color: 'hsl(224 15% 35%)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            ＋ New Chat
          </button>
        </div>

        <nav style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button style={{ border: 0, borderRadius: 11, background: styles.sidebarAccent, color: styles.primaryDark, height: 36, display: 'flex', alignItems: 'center', gap: 11, padding: '0 12px', fontSize: 14, fontWeight: 600, cursor: 'default', textAlign: 'left' }}>
            <NavIcon>▱</NavIcon> Chat
          </button>
          <Link href="/overview" style={{ textDecoration: 'none', borderRadius: 11, color: 'hsl(224 15% 35%)', height: 36, display: 'flex', alignItems: 'center', gap: 11, padding: '0 12px', fontSize: 14, fontWeight: 500 }}>
            <NavIcon>◎</NavIcon> Sites
          </Link>
          <Link href="/activity" style={{ textDecoration: 'none', borderRadius: 11, color: 'hsl(224 15% 35%)', height: 36, display: 'flex', alignItems: 'center', gap: 11, padding: '0 12px', fontSize: 14, fontWeight: 500 }}>
            <NavIcon>↺</NavIcon> History
          </Link>
          <Link href="/settings" style={{ textDecoration: 'none', borderRadius: 11, color: 'hsl(224 15% 35%)', height: 36, display: 'flex', alignItems: 'center', gap: 11, padding: '0 12px', fontSize: 14, fontWeight: 500 }}>
            <NavIcon>⚙</NavIcon> Settings
          </Link>
        </nav>

        <div style={{ padding: '26px 20px 0', color: 'hsl(220 10% 63%)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em' }}>RECENT CHATS</div>
        <div style={{ flex: 1 }} />

        <div style={{ borderTop: `1px solid ${styles.border}`, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: styles.primary, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{workspaceInitial}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>My Workspace</div>
            <div style={{ fontSize: 11, color: styles.mutedLight }}>Free Plan</div>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 58, background: styles.card, borderBottom: `1px solid ${styles.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px 0 24px', flexShrink: 0 }}>
          <Link href="/overview" style={{ height: 30, border: `1px solid ${styles.border}`, borderRadius: 12, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 8, color: 'hsl(224 15% 35%)', textDecoration: 'none', background: styles.card, fontSize: 12, fontWeight: 600 }}>
            <GlobeIcon /> Select Site
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'hsl(220 16% 94%)', borderRadius: 14, padding: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <button style={{ border: 0, background: styles.primary, color: 'white', borderRadius: 11, padding: '7px 16px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, cursor: 'default' }}>
                ✨ Easy
              </button>
              <button onClick={onSwitchMode} style={{ border: 0, background: 'transparent', color: 'hsl(224 15% 35%)', borderRadius: 11, padding: '7px 14px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: onSwitchMode ? 'pointer' : 'default' }}>
                ‹/› Advanced
              </button>
            </div>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(520px, 1.35fr) minmax(460px, .9fr)' }}>
          <section style={{ position: 'relative', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${styles.border}`, minWidth: 0 }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: messages.length ? '28px 28px 112px' : '0 24px 112px' }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div style={{ maxWidth: 520, marginTop: 40 }}>
                    <div style={{ width: 80, height: 80, borderRadius: 40, background: 'hsl(248 79% 94%)', color: styles.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                      <SparkIcon />
                    </div>
                    <h1 style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 14px' }}>WordPress AI Editor</h1>
                    <p style={{ color: styles.muted, fontSize: 15, lineHeight: 1.55, margin: '0 auto', maxWidth: 460 }}>
                      Ask me anything about your WordPress site. I can help you edit content, change themes, optimize SEO, and much more.
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {messages.map((msg, index) => (
                    <div key={`${msg.role}-${index}-${msg.ts.getTime()}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '82%', display: 'flex', gap: 10, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, background: msg.role === 'user' ? styles.primary : 'hsl(248 79% 94%)', color: msg.role === 'user' ? 'white' : styles.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                          {msg.role === 'user' ? 'You' : <SparkIcon small />}
                        </div>
                        <div>
                          <div style={{ background: msg.role === 'user' ? styles.primary : styles.card, color: msg.role === 'user' ? 'white' : styles.foreground, border: msg.role === 'user' ? 'none' : `1px solid ${styles.border}`, borderRadius: msg.role === 'user' ? '18px 18px 5px 18px' : '18px 18px 18px 5px', padding: '12px 15px', boxShadow: msg.role === 'user' ? '0 10px 24px hsla(248,79%,60%,.2)' : '0 1px 2px rgba(15,23,42,.04)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {msg.content}
                          </div>
                          {msg.options && msg.options.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                              {msg.options.map((opt, optionIndex) => (
                                <button key={optionIndex} onClick={() => send(opt.value || opt.label)} style={{ textAlign: 'left', background: styles.card, color: styles.primaryDark, border: `1px solid ${styles.border}`, borderRadius: 12, padding: '9px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
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
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: styles.muted, fontSize: 14 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 16, background: 'hsl(248 79% 94%)', color: styles.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SparkIcon small /></div>
                      <div style={{ background: styles.card, border: `1px solid ${styles.border}`, borderRadius: '18px 18px 18px 5px', padding: '12px 15px' }}>Thinking…</div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div style={{ position: 'absolute', left: 32, right: 32, bottom: 38 }}>
              <div style={{ maxWidth: 844, margin: '0 auto' }}>
                <div style={{ background: styles.card, border: `1px solid ${styles.border}`, borderRadius: 15, boxShadow: '0 10px 28px rgba(15,23,42,.07)', display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 10px 10px 16px' }}>
                  <button type="button" aria-label="Attach file" style={{ width: 28, height: 38, border: 0, background: 'transparent', color: styles.mutedLight, fontSize: 23, cursor: 'pointer' }}>⌕</button>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={event => setInput(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        send()
                      }
                    }}
                    placeholder="Ask AI to edit your WordPress site..."
                    rows={1}
                    style={{ flex: 1, minHeight: 38, maxHeight: 124, border: 0, outline: 0, resize: 'none', background: 'transparent', color: styles.foreground, fontFamily: 'inherit', fontSize: 15, lineHeight: '38px' }}
                  />
                  <button onClick={() => send()} disabled={sending || !input.trim()} aria-label="Send" style={{ width: 34, height: 34, border: 0, borderRadius: 12, flexShrink: 0, background: sending || !input.trim() ? 'hsl(248 70% 78%)' : styles.primary, color: 'white', cursor: sending || !input.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SendIcon />
                  </button>
                </div>
                <div style={{ textAlign: 'center', color: styles.mutedLight, fontSize: 11, marginTop: 10 }}>AI can make mistakes. Always verify changes before publishing.</div>
              </div>
            </div>
          </section>

          <aside style={{ background: styles.bg, padding: '26px 44px', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 18px' }}>Quick Actions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              {QUICK_ACTIONS.map(action => {
                const tone = toneStyles[action.tone]
                return (
                  <button key={action.title} onClick={() => send(action.prompt)} style={{ minHeight: 138, background: styles.card, border: `1px solid ${styles.border}`, borderRadius: 15, textAlign: 'left', padding: 20, cursor: 'pointer', transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease' }}
                    onMouseEnter={event => {
                      event.currentTarget.style.transform = 'translateY(-2px)'
                      event.currentTarget.style.boxShadow = '0 16px 36px rgba(15,23,42,.08)'
                      event.currentTarget.style.borderColor = 'hsl(248 40% 82%)'
                    }}
                    onMouseLeave={event => {
                      event.currentTarget.style.transform = 'translateY(0)'
                      event.currentTarget.style.boxShadow = 'none'
                      event.currentTarget.style.borderColor = styles.border
                    }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: tone.bg, color: tone.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 26 }}>{action.icon}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: styles.foreground, marginBottom: 6 }}>{action.title}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.45, color: 'hsl(224 15% 35%)' }}>{action.desc}</div>
                  </button>
                )
              })}
            </div>

            <div style={{ marginTop: 22, background: styles.card, border: `1px solid ${styles.border}`, borderRadius: 15, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Smart Suggestions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SUGGESTIONS.map(suggestion => (
                  <button key={suggestion} onClick={() => send(suggestion)} style={{ border: `1px solid ${styles.border}`, borderRadius: 11, background: 'hsl(220 20% 98%)', padding: '10px 12px', color: 'hsl(224 15% 35%)', fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
