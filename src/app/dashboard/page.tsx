'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Nav from '@/components/Nav'

// ─── Types ───────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant'
  content: string
  action?: any
  executing?: boolean
  actionResult?: string
  timestamp: Date
}

interface SiteInfo {
  site: { url: string; name: string; description: string }
  wordpress: { version: string }
  theme: { name: string }
  builder: Array<{ name: string }>
  plugins: Array<{ name: string; active: boolean; update: string | null }>
  content: { pages: number; posts: number }
}

interface Page {
  id: number
  title: string
  slug: string
  status: string
  url: string
  has_elementor: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────
function Tag({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    green:  { bg: '#F0FAF5', color: '#1E7B4B', border: '#B8E5CF' },
    red:    { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
    yellow: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
    orange: { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
    gray:   { bg: '#F7F5F2', color: '#6B6056', border: '#E2DDD8' },
  }
  const s = map[color] || map.gray
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>{children}</span>
  )
}

// ─── DASHBOARD INNER (uses useSearchParams) ───────────────────────
function DashboardInner() {
  const params     = useSearchParams()
  const siteUrl    = params.get('site') || ''
  const apiKey     = params.get('key')  || ''

  const [siteInfo, setSiteInfo]         = useState<SiteInfo | null>(null)
  const [pages, setPages]               = useState<Page[]>([])
  const [loading, setLoading]           = useState(true)
  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState('')
  const [sending, setSending]           = useState(false)
  const [activeTab, setActiveTab]       = useState<'pages' | 'plugins' | 'settings'>('pages')
  const messagesEndRef                  = useRef<HTMLDivElement>(null)

  // ── Load site info ─────────────────────────────────────────────
  useEffect(() => {
    if (!siteUrl || !apiKey) return
    loadSiteInfo()
  }, [siteUrl, apiKey])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function callBridge(endpoint: string, method = 'GET', body?: any) {
    const fullUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`
    const res = await fetch('/api/wordpress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: fullUrl, apiKey, endpoint, method, body }),
    })
    return res.json()
  }

  async function loadSiteInfo() {
    setLoading(true)
    try {
      const [infoRes, pagesRes] = await Promise.all([
        callBridge('site'),
        callBridge('pages'),
      ])
      if (infoRes.success) setSiteInfo(infoRes.data)
      if (pagesRes.success) setPages(pagesRes.data.pages || [])

      // Welcome message
      const siteName = infoRes.data?.site?.name || siteUrl
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm connected to **${siteName}** and ready to help. I can see ${pagesRes.data?.pages?.length || 0} pages, and the site is running ${infoRes.data?.builder?.[0]?.name || 'WordPress'}.\n\nWhat would you like to change? You can tell me anything — "update my homepage headline", "add a contact form", "fix the mobile layout", or "show me all my pages".`,
        timestamp: new Date(),
      }])
    } catch (e) {
      setMessages([{
        role: 'assistant',
        content: 'Connected! Tell me what you\'d like to change on your site.',
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }

  // ── Send chat message ──────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || sending) return

    const userMsg: Message = { role: 'user', content: input, timestamp: new Date() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setSending(true)

    try {
      // Build site context for Claude
      const siteContext = siteInfo ? {
        site_name:    siteInfo.site.name,
        site_url:     siteUrl,
        wp_version:   siteInfo.wordpress.version,
        theme:        siteInfo.theme.name,
        builder:      siteInfo.builder[0]?.name,
        pages:        pages.map(p => ({ id: p.id, title: p.title, slug: p.slug })),
        page_count:   pages.length,
        plugin_count: siteInfo.plugins.length,
      } : { site_url: siteUrl }

      // Call Claude
      const aiRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          siteContext,
        }),
      })
      const aiData = await aiRes.json()

      const assistantMsg: Message = {
        role: 'assistant',
        content: aiData.text || 'Done!',
        action: aiData.action,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMsg])

      // If Claude returned an action, execute it
      if (aiData.action) {
        executeAction(aiData.action, assistantMsg)
      }

    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Try again.',
        timestamp: new Date(),
      }])
    } finally {
      setSending(false)
    }
  }

  // ── Execute WordPress action from Claude ───────────────────────
  async function executeAction(action: any, msg: Message) {
    try {
      let result = ''
      switch (action.type) {
        case 'update_page':
          const updateRes = await callBridge(`pages/${action.pageId}`, 'PATCH', {
            title:   action.title,
            content: action.content,
            status:  action.status,
          })
          result = updateRes.success ? '✓ Page updated live on your site' : `Failed: ${updateRes.error}`
          break

        case 'create_page':
          const createRes = await callBridge('pages', 'POST', {
            title:   action.title,
            content: action.content || '',
            status:  'draft',
          })
          result = createRes.success ? `✓ Page "${action.title}" created (saved as draft)` : `Failed: ${createRes.error}`
          if (createRes.success) loadSiteInfo() // refresh
          break

        case 'install_plugin':
          const installRes = await callBridge('plugins/install', 'POST', {
            slug: action.slug, activate: true,
          })
          result = installRes.success ? `✓ ${action.slug} installed and activated` : `Failed: ${installRes.error}`
          break

        case 'scan_site':
          const scanRes = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: siteUrl }),
          })
          const scanData = await scanRes.json()
          result = scanData.success
            ? `✓ Scan complete — Overall score: ${scanData.report.scores.overall}/100`
            : 'Scan failed'
          break

        default:
          result = '(Action type not yet implemented)'
      }

      // Update the message with the action result
      setMessages(prev => prev.map(m =>
        m === msg ? { ...m, actionResult: result } : m
      ))

    } catch (e: any) {
      setMessages(prev => prev.map(m =>
        m === msg ? { ...m, actionResult: `Error: ${e.message}` } : m
      ))
    }
  }

  // ── Suggested prompts ──────────────────────────────────────────
  const suggestions = [
    'What pages does my site have?',
    'Update my homepage headline',
    'Add a contact page',
    'What plugins are installed?',
    'Fix my SEO meta description',
    'Create an About page',
  ]

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', flexDirection: 'column' }}>
      <Nav />

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: 36, height: 36, border: '3px solid #E2DDD8', borderTopColor: '#E8651A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
          <div style={{ fontSize: 15, color: '#6B6056' }}>Connecting to {siteUrl}…</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 60px)' }}>

          {/* ── LEFT PANEL — Site Info ── */}
          <div style={{
            width: 280, flexShrink: 0, background: '#FFFFFF',
            borderRight: '1px solid #E2DDD8', display: 'flex',
            flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Site header */}
            <div style={{ padding: '20px', borderBottom: '1px solid #E2DDD8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: '#FFF0E8',
                  border: '1px solid #FED7AA', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18, flexShrink: 0,
                }}>🌐</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1410', fontFamily: 'Sora, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {siteInfo?.site.name || siteUrl}
                  </div>
                  <div style={{ fontSize: 11, color: '#A89D94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {siteUrl}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Tag color="green">Live</Tag>
                {siteInfo?.builder[0] && <Tag color="orange">{siteInfo.builder[0].name}</Tag>}
                {siteInfo?.wordpress.version && <Tag>WP {siteInfo.wordpress.version}</Tag>}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E2DDD8', padding: '0 2px' }}>
              {(['pages', 'plugins', 'settings'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: '10px 4px', background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${activeTab === tab ? '#E8651A' : 'transparent'}`,
                  color: activeTab === tab ? '#E8651A' : '#A89D94', fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textTransform: 'capitalize',
                  marginBottom: -1,
                }}>{tab}</button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>

              {/* Pages */}
              {activeTab === 'pages' && (
                <div>
                  {pages.length === 0 ? (
                    <div style={{ padding: '24px 20px', color: '#A89D94', fontSize: 13, textAlign: 'center' }}>
                      No pages found
                    </div>
                  ) : pages.map(page => (
                    <div key={page.id} style={{
                      padding: '10px 16px', borderBottom: '1px solid #F7F5F2',
                      display: 'flex', alignItems: 'center', gap: 8,
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F7F5F2'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => setInput(`Edit the "${page.title}" page`)}
                    >
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="#A89D94" style={{ flexShrink: 0 }}>
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/>
                      </svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1410', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {page.title}
                        </div>
                        <div style={{ fontSize: 11, color: '#A89D94' }}>/{page.slug}</div>
                      </div>
                      <Tag color={page.status === 'publish' ? 'green' : 'gray'}>
                        {page.status === 'publish' ? 'Live' : page.status}
                      </Tag>
                    </div>
                  ))}
                </div>
              )}

              {/* Plugins */}
              {activeTab === 'plugins' && (
                <div>
                  {(siteInfo?.plugins || []).map((plugin, i) => (
                    <div key={i} style={{
                      padding: '10px 16px', borderBottom: '1px solid #F7F5F2',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1410', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {plugin.name}
                        </div>
                        {plugin.update && (
                          <div style={{ fontSize: 11, color: '#92400E' }}>Update available</div>
                        )}
                      </div>
                      {plugin.update && <Tag color="yellow">Update</Tag>}
                    </div>
                  ))}
                  {!siteInfo?.plugins?.length && (
                    <div style={{ padding: '24px 20px', color: '#A89D94', fontSize: 13, textAlign: 'center' }}>
                      No plugin data
                    </div>
                  )}
                </div>
              )}

              {/* Settings */}
              {activeTab === 'settings' && (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Site Name',    value: siteInfo?.site.name },
                    { label: 'Description', value: siteInfo?.site.description },
                    { label: 'Theme',        value: siteInfo?.theme.name },
                    { label: 'WP Version',   value: siteInfo?.wordpress.version },
                    { label: 'Pages',        value: siteInfo?.content.pages?.toString() },
                    { label: 'Posts',        value: siteInfo?.content.posts?.toString() },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#A89D94', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 13, color: '#1A1410' }}>{item.value || '—'}</div>
                    </div>
                  ))}
                  <div style={{ marginTop: 8 }}>
                    <a href={`https://${siteUrl}/wp-admin`} target="_blank" rel="noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
                      color: '#E8651A', textDecoration: 'none', fontWeight: 500,
                    }}>
                      Open WP Admin ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── CENTER — AI CHAT ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#F7F5F2' }}>

            {/* Chat header */}
            <div style={{
              padding: '14px 24px', background: '#FFFFFF',
              borderBottom: '1px solid #E2DDD8',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: '#1A1410' }}>
                  AI Site Manager
                </div>
                <div style={{ fontSize: 13, color: '#6B6056' }}>
                  Tell ignyous what to change — it handles the rest
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href={`https://${siteUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '7px 14px', border: '1px solid #E2DDD8', borderRadius: 8,
                    background: 'white', color: '#6B6056', fontSize: 13, fontWeight: 500,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  View Site ↗
                </a>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  gap: 12, animation: 'fadeIn 0.25s ease',
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: msg.role === 'user' ? '#E8651A' : '#1A1410',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: msg.role === 'user' ? 13 : 16, color: 'white', fontWeight: 600,
                    marginTop: 2,
                  }}>
                    {msg.role === 'user' ? 'U' : '✦'}
                  </div>

                  {/* Bubble */}
                  <div style={{ maxWidth: '72%' }}>
                    <div style={{
                      padding: '13px 17px', borderRadius: 14,
                      background: msg.role === 'user' ? '#E8651A' : '#FFFFFF',
                      color: msg.role === 'user' ? 'white' : '#1A1410',
                      fontSize: 15, lineHeight: 1.65,
                      border: msg.role === 'user' ? 'none' : '1px solid #E2DDD8',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      ...(msg.role === 'user'
                        ? { borderTopRightRadius: 4 }
                        : { borderTopLeftRadius: 4 }),
                    }}>
                      {/* Render markdown-ish bold */}
                      {msg.content.split('\n').map((line, li) => (
                        <div key={li} style={{ marginBottom: li < msg.content.split('\n').length - 1 ? 6 : 0 }}>
                          {line.replace(/\*\*(.*?)\*\*/g, '$1')}
                        </div>
                      ))}
                    </div>

                    {/* Action result */}
                    {msg.action && (
                      <div style={{
                        marginTop: 8, padding: '9px 14px', borderRadius: 8,
                        background: msg.actionResult
                          ? (msg.actionResult.startsWith('✓') ? '#F0FAF5' : '#FEF2F2')
                          : '#FFFBEB',
                        border: `1px solid ${msg.actionResult
                          ? (msg.actionResult?.startsWith('✓') ? '#B8E5CF' : '#FECACA')
                          : '#FDE68A'}`,
                        fontSize: 13, fontWeight: 500,
                        color: msg.actionResult
                          ? (msg.actionResult.startsWith('✓') ? '#1E7B4B' : '#B91C1C')
                          : '#92400E',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        {!msg.actionResult && (
                          <div style={{
                            width: 12, height: 12, border: '2px solid #FDE68A',
                            borderTopColor: '#92400E', borderRadius: '50%',
                            animation: 'spin 0.7s linear infinite', flexShrink: 0,
                          }}/>
                        )}
                        {msg.actionResult || `Executing: ${msg.action.type}…`}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: '#A89D94', marginTop: 5, 
                      textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {sending && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: '#1A1410',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'white',
                  }}>✦</div>
                  <div style={{
                    padding: '14px 18px', background: '#FFFFFF', border: '1px solid #E2DDD8',
                    borderRadius: 14, borderTopLeftRadius: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{
                          width: 8, height: 8, borderRadius: '50%', background: '#A89D94',
                          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}/>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef}/>
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && (
              <div style={{
                padding: '0 24px 12px',
                display: 'flex', gap: 6, flexWrap: 'wrap',
              }}>
                {suggestions.map(s => (
                  <button key={s} onClick={() => { setInput(s); }} style={{
                    padding: '6px 14px', border: '1px solid #E2DDD8', borderRadius: 20,
                    background: 'white', color: '#6B6056', fontSize: 13, cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8651A'; e.currentTarget.style.color = '#E8651A' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2DDD8'; e.currentTarget.style.color = '#6B6056' }}
                  >{s}</button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{
              padding: '16px 24px 20px', background: '#FFFFFF',
              borderTop: '1px solid #E2DDD8',
            }}>
              <div style={{
                display: 'flex', border: '2px solid #E2DDD8', borderRadius: 14,
                overflow: 'hidden', background: '#FAFAFA',
                transition: 'border-color 0.2s',
              }}
                onFocusCapture={e => e.currentTarget.style.borderColor = '#E8651A'}
                onBlurCapture={e => e.currentTarget.style.borderColor = '#E2DDD8'}
              >
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="Tell ignyous what to do… e.g. 'Change my homepage headline to Phoenix's Best Plumber'"
                  rows={2}
                  style={{
                    flex: 1, border: 'none', padding: '14px 16px', fontSize: 15,
                    fontFamily: 'DM Sans, sans-serif', color: '#1A1410', background: 'transparent',
                    resize: 'none', lineHeight: 1.5,
                  }}
                />
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    onClick={sendMessage}
                    disabled={sending || !input.trim()}
                    style={{
                      width: 42, height: 42, borderRadius: 10, border: 'none',
                      background: sending || !input.trim() ? '#E2DDD8' : '#E8651A',
                      cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', flexShrink: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="white">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#A89D94', marginTop: 8, textAlign: 'center' }}>
                Press Enter to send · Shift+Enter for new line · ignyous executes changes live
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WRAPPER with Suspense ────────────────────────────────────────
export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E2DDD8', borderTopColor: '#E8651A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      </div>
    }>
      <DashboardInner />
    </Suspense>
  )
}
