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
  prompt: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: '🎨', title: 'Change Theme Colors', desc: 'Update your site\'s color palette', prompt: 'Help me change my site\'s theme colors and typography.' },
  { icon: '📄', title: 'Create New Page', desc: 'Generate a new page with AI content', prompt: 'Create a new page for my WordPress site.' },
  { icon: '🔍', title: 'Improve SEO', desc: 'Optimize meta tags and structure', prompt: 'Improve my SEO by scanning and fixing issues.' },
  { icon: '⚡', title: 'Speed Optimization', desc: 'Fix performance bottlenecks', prompt: 'Speed optimize my site by checking caching and images.' },
  { icon: '🛡️', title: 'Security Check', desc: 'Audit plugins and configuration', prompt: 'Run a WordPress security check on my site.' },
  { icon: '🌐', title: 'Add New Plugin', desc: 'Find and configure plugins', prompt: 'Help me add a new plugin that I need.' },
  { icon: '🛒', title: 'Set Up Store', desc: 'Add e-commerce functionality', prompt: 'I want to sell products online. Help me set up a store.' },
  { icon: '📬', title: 'Add Contact Form', desc: 'Add contact form to your site', prompt: 'Add a contact form so visitors can reach me.' },
]

const styles = {
  bg: 'hsl(220 20% 97%)',
  foreground: 'hsl(224 20% 12%)',
  muted: 'hsl(220 10% 55%)',
  mutedLight: 'hsl(220 10% 68%)',
  border: 'hsl(220 14% 89%)',
  card: 'hsl(0 0% 100%)',
  primary: 'hsl(248 79% 60%)',
  primaryDark: 'hsl(248 79% 50%)',
  primaryLight: 'hsl(248 79% 90%)',
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

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 3L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 3l-7 18-4-7-7-4 18-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function RefreshIcon({ small = true }: { small?: boolean }) {
  return (
    <svg width={small ? 14 : 18} height={small ? 14 : 18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20.49 9A9 9 0 5 1 5.64 5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function EasyModeDashboard({ siteUrl, apiKey, userName, onSwitchMode }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [siteInfo, setSiteInfo] = useState<any>(null)
  const [showSiteDropdown, setShowSiteDropdown] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const cleanUrl = siteUrl ? siteUrl.replace(/\/$/, '') : ''
  const siteName = siteInfo?.site_name || siteInfo?.site?.name || cleanUrl.replace(/^https?:\/\//, '') || 'your WordPress site'
  const workspaceInitial = (userName || 'WP').trim()[0]?.toUpperCase() || 'W'
  const wpVersion = siteInfo?.wordpress?.version || siteInfo?.wp_version || '?'
  const pluginCount = siteInfo?.plugins?.filter((p: any) => p.active)?.length || 0

  useEffect(() => {
    if (!siteUrl || !apiKey) return

    fetch('/api/scan/profile?siteUrl=' + encodeURIComponent(cleanUrl) + '&apiKey=' + encodeURIComponent(apiKey))
      .then(r => r.json())
      .then(data => {
        setSiteInfo(data)
        setLastCheck(new Date())
      })
      .catch(() => {})
  }, [siteUrl, apiKey, cleanUrl])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSiteDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
            wp_version: wpVersion,
            plugin_count: pluginCount,
            mode: 'easy',
            instruction: 'Respond in plain English. Respond concisely. Ask clarifying questions only when truly necessary. Execute actions when you can.',
          },
        }),
      })
      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + data.error, ts: new Date() }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.text || 'Done!',
          options: data.options || undefined,
          ts: new Date(),
        }])
      }
    } catch (err) {
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
      flexDirection: 'column',
      background: styles.bg,
      color: styles.foreground,
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflow: 'hidden',
    }}>
      {/* ─── TOP BAR (Profile/Logout) ─── */}
      <header style={{ height: 50, background: styles.card, borderBottom: `1px solid ${styles.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: styles.primary }}>
          Ignyous AI
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: styles.primary, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
            {workspaceInitial}
          </div>
          <button style={{ fontSize: 13, color: styles.muted, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            Logout
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* ─── MAIN CONTENT ─── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0', overflow: 'auto' }}>
          {/* ─── SITE SELECTOR & INFO BAR ─── */}
          <div style={{ background: styles.card, borderBottom: `1px solid ${styles.border}`, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, fontWeight: 500, marginBottom: 4 }}>Current Site</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: styles.foreground }}>{siteName}</div>
                <div style={{ fontSize: 12, color: styles.mutedLight, marginTop: 2 }}>
                  WP • {wpVersion} • {pluginCount} plugins
                </div>
              </div>
              <div style={{ width: 1, height: 40, background: styles.border }} />
              <div style={{ position: 'relative' }} ref={dropdownRef}>
                <button
                  onClick={() => setShowSiteDropdown(!showSiteDropdown)}
                  style={{
                    padding: '8px 14px',
                    border: `1px solid ${styles.border}`,
                    borderRadius: 8,
                    background: styles.card,
                    color: styles.foreground,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement
                    btn.style.background = styles.primaryLight
                    btn.style.borderColor = styles.primary
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement
                    btn.style.background = styles.card
                    btn.style.borderColor = styles.border
                  }}
                >
                  Select a Site <ChevronDownIcon />
                </button>
                
                {showSiteDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 8,
                    background: styles.card,
                    border: `1px solid ${styles.border}`,
                    borderRadius: 10,
                    minWidth: 200,
                    boxShadow: '0 10px 32px rgba(0,0,0,0.08)',
                    zIndex: 1000,
                  }}>
                    <div style={{ padding: 8 }}>
                      <a href="/overview" style={{ display: 'block', padding: '10px 14px', borderRadius: 6, fontSize: 13, color: styles.foreground, textDecoration: 'none', fontWeight: 500 }}>
                        📋 All Sites
                      </a>
                      <div style={{ borderTop: `1px solid ${styles.border}`, margin: '6px 0' }} />
                      <a href="/bridge/connect" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 6,
                        fontSize: 13,
                        color: styles.primary,
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}>
                        ＋ New Site
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <button
                title="Refresh site info"
                onClick={() => {
                  fetch('/api/scan/profile?siteUrl=' + encodeURIComponent(cleanUrl) + '&apiKey=' + encodeURIComponent(apiKey))
                    .then(r => r.json())
                    .then(data => {
                      setSiteInfo(data)
                      setLastCheck(new Date())
                    })
                    .catch(() => {})
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'transparent',
                  border: `1px solid ${styles.border}`,
                  color: styles.muted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = styles.primaryLight
                  btn.style.borderColor = styles.primary
                  btn.style.color = styles.primary
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = 'transparent'
                  btn.style.borderColor = styles.border
                  btn.style.color = styles.muted
                }}
              >
                <RefreshIcon />
              </button>
              <div style={{ fontSize: 11, color: styles.mutedLight }}>
                {lastCheck ? 'Checked ' + lastCheck.toLocaleTimeString().slice(0, 5) : 'Ready'}
              </div>
            </div>
          </div>

          {/* ─── QUICK ACTIONS ─── */}
          {messages.length === 0 && (
            <div style={{ padding: '28px 24px', borderBottom: `1px solid ${styles.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: styles.muted, marginBottom: 16, letterSpacing: '.08em' }}>QUICK ACTIONS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => send(action.prompt)}
                    style={{
                      padding: '16px 12px',
                      border: `1px solid ${styles.border}`,
                      borderRadius: 10,
                      background: styles.card,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement
                      btn.style.borderColor = styles.primary
                      btn.style.background = styles.primaryLight
                      btn.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement
                      btn.style.borderColor = styles.border
                      btn.style.background = styles.card
                      btn.style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{ fontSize: 22 }}>{action.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: styles.foreground }}>{action.title}</div>
                    <div style={{ fontSize: 11, color: styles.mutedLight }}>{action.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── CHAT AREA ─── */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: messages.length ? '28px 24px' : '0' }}>
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ maxWidth: 520 }}>
                  <div style={{ width: 80, height: 80, borderRadius: 40, background: 'hsl(248 79% 94%)', color: styles.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <SparkIcon />
                  </div>
                  <h1 style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 14px' }}>WordPress AI Assistant</h1>
                  <p style={{ color: styles.muted, fontSize: 15, lineHeight: 1.55, margin: '0 auto' }}>
                    Ask me anything about your WordPress site. I can help you edit content, change themes, optimize SEO, and more.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {messages.map((msg, index) => (
                  <div key={`${msg.role}-${index}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '82%', display: 'flex', gap: 10, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, background: msg.role === 'user' ? styles.primary : 'hsl(248 79% 94%)', color: msg.role === 'user' ? 'white' : styles.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                        {msg.role === 'user' ? 'You' : <SparkIcon small />}
                      </div>
                      <div>
                        <div style={{ background: msg.role === 'user' ? styles.primary : styles.card, color: msg.role === 'user' ? 'white' : styles.foreground, border: msg.role === 'user' ? 'none' : `1px solid ${styles.border}`, borderRadius: msg.role === 'user' ? '18px 18px 5px 18px' : '18px 18px 18px 5px', padding: '12px 15px', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* ─── INPUT AREA ─── */}
        <div style={{ background: styles.card, borderTop: `1px solid ${styles.border}`, padding: '16px 24px', flexShrink: 0 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 12 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask me anything..."
              style={{
                flex: 1,
                padding: '12px 14px',
                border: `1px solid ${styles.border}`,
                borderRadius: 10,
                fontSize: 14,
                fontFamily: 'inherit',
                color: styles.foreground,
                background: styles.bg,
                resize: 'none',
                minHeight: 44,
                maxHeight: 120,
              }}
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: input.trim() ? styles.primary : 'hsl(220 10% 80%)',
                border: 'none',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: input.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (input.trim()) {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = styles.primaryDark
                  btn.style.transform = 'scale(1.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (input.trim()) {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = styles.primary
                  btn.style.transform = 'scale(1)'
                }
              }}
            >
              <SendIcon />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={onSwitchMode} style={{ fontSize: 13, color: styles.primary, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              Switch to Advanced Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
