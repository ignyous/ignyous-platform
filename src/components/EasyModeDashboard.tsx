'use client'
import { useState, useEffect, useRef } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  options?: Array<{ label: string; value: string }>
  ts: Date
}

interface Props {
  siteUrl: string
  apiKey: string
  pluginSlugs?: string[]
  userName?: string
  onSwitchMode?: () => void
}

const QUICK_ACTIONS = [
  { icon: '\u270F\uFE0F', label: 'Rewrite homepage',    prompt: 'Rewrite my homepage to be more professional and compelling.' },
  { icon: '\uD83D\uDD0D', label: 'Improve SEO',         prompt: 'Check my SEO and improve it so I rank higher on Google.' },
  { icon: '\uD83C\uDFA8', label: 'Refresh design',      prompt: 'My design feels outdated. Suggest and apply a fresh modern look.' },
  { icon: '\uD83D\uDCB0', label: 'Add pricing section', prompt: 'Add a pricing section to my homepage with 3 tiers.' },
  { icon: '\u26A1',       label: 'Speed up site',       prompt: 'My site is slow. Find and fix every performance issue.' },
  { icon: '\uD83D\uDD12', label: 'Secure site',         prompt: 'Check my site security and make sure everything is locked down.' },
  { icon: '\uD83D\uDCDE', label: 'Update phone number', prompt: 'I need to update my phone number everywhere on the site.' },
  { icon: '\uD83D\uDCCB', label: 'Add contact form',    prompt: 'Add a professional contact form to my site.' },
]

export default function EasyModeDashboard({ siteUrl, apiKey, pluginSlugs = [], userName, onSwitchMode }: Props) {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const [siteInfo, setSiteInfo]   = useState<any>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLTextAreaElement>(null)
  const iframeRef                 = useRef<HTMLIFrameElement>(null)
  const [iframeKey, setIframeKey] = useState(0)
  const cleanUrl                  = siteUrl.replace(/\/$/, '')
  const hasMessages               = messages.length > 0

  useEffect(() => {
    if (!siteUrl || !apiKey) return
    fetch('/api/scan/profile?siteUrl=' + encodeURIComponent(cleanUrl) + '&apiKey=' + encodeURIComponent(apiKey))
      .then(r => r.json())
      .then(d => { if (d.profile) setSiteInfo(d.profile) })
      .catch(() => {})
    setTimeout(() => inputRef.current?.focus(), 200)
  }, [siteUrl, apiKey])

  useEffect(() => {
    if (hasMessages) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send(text?: string) {
    const msg = (text || input).trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    const userMsg: Message = { role: 'user', content: msg, ts: new Date() }
    setMessages(prev => [...prev, userMsg])

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res  = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, siteUrl: cleanUrl, apiKey }),
      })
      const data = await res.json()

      // If there's an action, execute it
      if (data.action) {
        await executeAction(data.action)
      }

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
    }
  }

  async function executeAction(action: any) {
    const type = action.type
    try {
      if (type === 'clear_cache') {
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
        setIframeKey(k => k + 1)
      } else if (type === 'update_page' || type === 'create_page') {
        await fetch('/api/wordpress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
        setIframeKey(k => k + 1)
        setTimeout(() => setIframeKey(k => k + 1), 3000)
      } else if (type === 'update_seo') {
        await fetch('/api/seo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'install_plugin' || type === 'install_theme') {
        await fetch('/api/wordpress/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'plugin_action') {
        await fetch('/api/plugins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, siteUrl: cleanUrl, apiKey }) })
      } else if (type === 'update_element') {
        await fetch('/api/element', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action.findByDescription ? 'find_and_update' : 'update_element', siteUrl: cleanUrl, apiKey, pageId: action.pageId, elementId: action.elementId, description: action.findByDescription, updates: action.updates }) })
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
        setIframeKey(k => k + 1)
      }
    } catch {
      // Action failed silently — AI will report what happened
    }
  }

  const siteName = siteInfo?.site_name || cleanUrl.replace(/^https?:\/\//, '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Poppins, system-ui, sans-serif', background: '#F7F8FC' }}>

      {/* Top bar */}
      <div style={{ height: 56, background: 'white', borderBottom: '1px solid #E2DDD8', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1a1a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3af00', fontSize: 14, fontWeight: 800 }}>I</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a4e' }}>{siteName}</div>
          <div style={{ fontSize: 10, color: '#A89D94' }}>Easy Mode</div>
        </div>
        {onSwitchMode && (
          <button onClick={onSwitchMode} style={{ fontSize: 12, color: '#6B6056', padding: '5px 12px', border: '1px solid #E2DDD8', borderRadius: 7, background: 'white', cursor: 'pointer' }}>
            Advanced
          </button>
        )}
      </div>

      {/* Main content — split: chat top, preview bottom */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Chat area — takes ~60% when chatting, centers when empty */}
        <div style={{ flex: hasMessages ? '0 0 55%' : '1', display: 'flex', flexDirection: 'column', overflow: hasMessages ? 'auto' : 'visible' }}>
          {!hasMessages ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>I</div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a4e', margin: '0 0 6px', textAlign: 'center' }}>
                What would you like to change?
              </h1>
              <p style={{ fontSize: 14, color: '#6B6056', margin: '0 0 24px', textAlign: 'center' }}>
                Just describe it. I will handle it on {siteName}.
              </p>

              <div style={{ width: '100%', maxWidth: 600, marginBottom: 20 }}>
                <div style={{ background: 'white', border: '2px solid #E2DDD8', borderRadius: 14, padding: '4px 4px 4px 16px', display: 'flex', alignItems: 'flex-end', gap: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="e.g. Update my phone number, Add a pricing section, Improve my SEO..."
                    rows={2}
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: '#1a1a4e', fontFamily: 'inherit', resize: 'none', background: 'transparent', padding: '10px 0', lineHeight: 1.5 }}
                  />
                  <button onClick={() => send()} disabled={sending || !input.trim()} style={{
                    width: 42, height: 42, borderRadius: 10, border: 'none', flexShrink: 0, marginBottom: 3,
                    background: sending || !input.trim() ? '#E2DDD8' : '#f3af00',
                    cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>&#8593;</button>
                </div>
              </div>

              <div style={{ width: '100%', maxWidth: 600, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {QUICK_ACTIONS.map(a => (
                  <button key={a.label} onClick={() => send(a.prompt)} style={{
                    padding: '10px 8px', border: '1px solid #E2DDD8', borderRadius: 10,
                    background: 'white', color: '#1a1a4e', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', textAlign: 'center', lineHeight: 1.3,
                  }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#f3af00' }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#E2DDD8' }}
                  >
                    <div style={{ fontSize: 18, marginBottom: 3 }}>{a.icon}</div>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
                <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                      {msg.role === 'assistant' && <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1a4e', color: '#f3af00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>I</div>}
                      <div style={{ maxWidth: '80%' }}>
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                          background: msg.role === 'user' ? '#1a1a4e' : 'white',
                          color: msg.role === 'user' ? 'white' : '#1a1a4e',
                          fontSize: 13, lineHeight: 1.6,
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        }}>{msg.content}</div>
                        {msg.options && (
                          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {msg.options.map((opt, oi) => (
                              <button key={oi} onClick={() => send(opt.label || opt.value)} style={{
                                padding: '7px 12px', borderRadius: 8,
                                border: '1px solid #1a1a4e', background: 'white', color: '#1a1a4e',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                              }}>{opt.label}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1a4e', color: '#f3af00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>I</div>
                      <div style={{ padding: '10px 14px', background: 'white', borderRadius: '4px 16px 16px 16px', fontSize: 13, color: '#A89D94' }}>Thinking...</div>
                    </div>
                  )}
                  <div ref={bottomRef}/>
                </div>
              </div>

              {/* Chat input bar */}
              <div style={{ background: 'white', borderTop: '1px solid #E2DDD8', padding: '10px 16px', flexShrink: 0 }}>
                <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', gap: 8 }}>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="What else would you like to change?"
                    rows={1}
                    style={{ flex: 1, padding: '9px 12px', border: '1px solid #E2DDD8', borderRadius: 10, fontSize: 13, color: '#1a1a4e', outline: 'none', fontFamily: 'inherit', resize: 'none' }}
                  />
                  <button onClick={() => send()} disabled={sending || !input.trim()} style={{
                    width: 40, borderRadius: 10, border: 'none',
                    background: sending || !input.trim() ? '#E2DDD8' : '#f3af00',
                    cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}>&#8593;</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live preview — always visible, takes bottom portion */}
        <div style={{ flex: hasMessages ? '0 0 45%' : '0 0 0', borderTop: hasMessages ? '1px solid #E2DDD8' : 'none', background: '#e8e4df', position: 'relative', overflow: 'hidden', transition: 'flex 0.3s' }}>
          {hasMessages && (
            <>
              <div style={{ position: 'absolute', top: 8, left: 12, fontSize: 10, color: '#6B6056', background: 'rgba(255,255,255,0.8)', padding: '2px 8px', borderRadius: 4, zIndex: 2 }}>Live Preview</div>
              <iframe
                key={iframeKey}
                src={cleanUrl}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                sandbox="allow-same-origin allow-scripts"
                title="Site preview"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
