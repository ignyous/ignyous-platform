'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type EasyAction = { icon: string; label: string; prompt: string }

function getEasyActions(plugins: string[]): EasyAction[] {
  const has = (...slugs: string[]) => slugs.some(s => plugins.some(p => p.includes(s)))
  const actions: EasyAction[] = []

  if (has('woocommerce')) {
    actions.push(
      { icon: '🏷️', label: 'Run a sale',        prompt: 'I want to run a sale on my products. Help me set up discounts.' },
      { icon: '📦', label: 'Add a product',       prompt: 'Help me add a new product to my WooCommerce store.' },
      { icon: '💳', label: 'Improve checkout',    prompt: 'Review and improve my WooCommerce checkout experience.' }
    )
  }
  if (has('events-calendar','the-events','event-calendar')) {
    actions.push(
      { icon: '📅', label: 'Create an event',     prompt: 'Help me create and publish a new event on my site.' },
      { icon: '🎟️', label: 'Promote an event',    prompt: 'Feature an upcoming event prominently on my homepage.' }
    )
  }
  if (has('amelia','bookly','simply-schedule')) {
    actions.push({ icon: '📋', label: 'Update booking', prompt: 'Review my booking system and check services and availability.' })
  }
  if (has('mailchimp','mailpoet','newsletter','klaviyo')) {
    actions.push({ icon: '📧', label: 'Grow my email list', prompt: 'Add opt-in forms and a lead magnet to grow my email list.' })
  }

  actions.push(
    { icon: '📝', label: 'Rewrite homepage',    prompt: 'Rewrite my homepage to be more professional and compelling.' },
    { icon: '🔍', label: 'Improve my SEO',       prompt: 'Check my SEO and improve it so I rank higher on Google.' },
    { icon: '🎨', label: 'Refresh my design',    prompt: 'My design feels outdated. Suggest and apply a fresh modern look.' },
    { icon: '💰', label: 'Add pricing section',  prompt: 'Add a pricing section to my homepage with 3 tiers.' },
    { icon: '⚡', label: 'Speed up my site',    prompt: 'My site is slow. Find and fix every performance issue.' },
    { icon: '🔒', label: 'Secure my site',       prompt: 'Check my site security and make sure everything is locked down.' },
  )
  if (!has('woocommerce')) {
    actions.push({ icon: '🛒', label: 'Set up a store', prompt: 'I want to sell products online. Help me set up a store.' })
  }

  const seen = new Set<string>()
  return actions.filter(a => { if (seen.has(a.label)) return false; seen.add(a.label); return true }).slice(0, 8)
}

interface Message { role: 'user' | 'assistant'; content: string; options?: { label: string }[]; ts: Date }

export default function EasyModeDashboard({
  siteUrl, apiKey, pluginSlugs = [], userName, onSwitchMode
}: {
  siteUrl: string; apiKey: string; pluginSlugs?: string[]
  userName?: string; onSwitchMode?: () => void
}) {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const [siteInfo, setSiteInfo]   = useState<any>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLTextAreaElement>(null)
  const cleanUrl = siteUrl.replace(/\/$/, '')
  const hasMessages = messages.length > 0
  const actions = getEasyActions(pluginSlugs)

  useEffect(() => {
    if (!siteUrl || !apiKey) return
    fetch(`/api/bridge?site=${encodeURIComponent(cleanUrl)}&key=${encodeURIComponent(apiKey)}&endpoint=site`)
      .then(r => r.json()).then(d => setSiteInfo(d?.data || null)).catch(() => {})
    // Auto-focus input
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [siteUrl, apiKey])

  useEffect(() => {
    if (hasMessages) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    const userMsg: Message = { role: 'user', content: msg, ts: new Date() }
    setMessages(prev => [...prev, userMsg])

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const siteContext = siteInfo ? { site_url: cleanUrl, site_name: siteInfo.site?.name, description: siteInfo.site?.description } : { site_url: cleanUrl }
      const res  = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, siteContext }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant', content: data.text || 'Done!',
        options: data.options || undefined, ts: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.', ts: new Date() }])
    } finally {
      setSending(false)
    }
  }

  const siteName = siteInfo?.site?.name || cleanUrl.replace(/^https?:\/\//, '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Poppins, sans-serif', background: '#F7F8FC' }}>

      {/* ── Top bar ───────────────────────────────────────── */}
      <div style={{ height: 60, background: 'white', borderBottom: '1px solid #E2DDD8', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: '#1a1a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3af00', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>✦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a4e', lineHeight: 1.2 }}>
            {siteName}
          </div>
          <div style={{ fontSize: 11, color: '#A89D94' }}>Easy Mode · AI Assistant</div>
        </div>
        <button onClick={onSwitchMode} style={{ fontSize: 12, color: '#6B6056', textDecoration: 'none', padding: '6px 14px', border: '1px solid #E2DDD8', borderRadius: 8, fontWeight: 500, background: 'white', cursor: 'pointer' }}>
          ⚡ Advanced Mode
        </button>
      </div>

      {/* ── Main area ─────────────────────────────────────── */}
      {!hasMessages ? (
        /* Empty state — input front and center */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px 80px' }}>
          {/* Greeting */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1a1a4e', margin: '0 0 8px' }}>
              Hey{userName ? `, ${userName.split(' ')[0]}` : ''}! What would you like to do?
            </h1>
            <p style={{ fontSize: 16, color: '#6B6056', margin: 0 }}>
              Just tell me what you want — I'll handle it on {siteName}.
            </p>
          </div>

          {/* Big centered input */}
          <div style={{ width: '100%', maxWidth: 680, marginBottom: 28 }}>
            <div style={{ background: 'white', border: '2px solid #E2DDD8', borderRadius: 16, padding: '4px 4px 4px 20px', display: 'flex', alignItems: 'flex-end', gap: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', transition: 'border-color 0.2s' }}
              onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = '#1a1a4e'}
              onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = '#E2DDD8'}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="e.g. Add a pricing section to my homepage, Improve my SEO, Run a 20% sale…"
                rows={3}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, color: '#1a1a4e', fontFamily: 'Poppins, sans-serif', resize: 'none', background: 'transparent', padding: '12px 0', lineHeight: 1.5 }}
              />
              <button onClick={() => send()} disabled={sending || !input.trim()} style={{
                width: 46, height: 46, borderRadius: 12, border: 'none', flexShrink: 0, marginBottom: 4,
                background: sending || !input.trim() ? '#E2DDD8' : '#f3af00',
                cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, transition: 'all 0.15s',
              }}>↑</button>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: '#A89D94' }}>Press Enter to send · Shift+Enter for new line</div>
          </div>

          {/* Quick actions */}
          <div style={{ width: '100%', maxWidth: 680 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#A89D94', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, textAlign: 'center' }}>Quick Actions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {actions.map(a => (
                <button key={a.label} onClick={() => send(a.prompt)} style={{
                  padding: '12px 10px', border: '1.5px solid #E2DDD8', borderRadius: 12,
                  background: 'white', color: '#1a1a4e', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', lineHeight: 1.4,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#f3af00'; e.currentTarget.style.background = '#FFFBEB' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2DDD8'; e.currentTarget.style.background = 'white' }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{a.icon}</div>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Chat mode — messages + input at bottom */
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 0' }}>
            <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a1a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3af00', fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>✦</div>
                  )}
                  <div style={{ maxWidth: '80%' }}>
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                      background: msg.role === 'user' ? '#1a1a4e' : 'white',
                      color: msg.role === 'user' ? 'white' : '#1a1a4e',
                      fontSize: 14, lineHeight: 1.65,
                      boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                    }}>{msg.content}</div>
                    {msg.options && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {msg.options.map((opt: any, oi: number) => (
                          <button key={oi} onClick={() => send(opt.label)} style={{
                            padding: '9px 14px', borderRadius: 10,
                            border: '1.5px solid #1a1a4e', background: 'white', color: '#1a1a4e',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f3af00'; e.currentTarget.style.borderColor = '#f3af00' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#1a1a4e' }}
                          >→ {opt.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a1a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3af00', fontSize: 13 }}>✦</div>
                  <div style={{ padding: '12px 16px', background: 'white', borderRadius: '4px 18px 18px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#A89D94', animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef}/>
            </div>
          </div>

          {/* Input bar — bottom of chat mode */}
          <div style={{ background: 'white', borderTop: '1px solid #E2DDD8', padding: '12px 24px', flexShrink: 0 }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              {/* Mini quick actions */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const }}>
                {actions.slice(0, 5).map(a => (
                  <button key={a.label} onClick={() => send(a.prompt)} style={{
                    padding: '4px 12px', border: '1px solid #E2DDD8', borderRadius: 20,
                    background: '#F7F8FC', color: '#6B6056', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#f3af00'; e.currentTarget.style.background = '#FFFBEB' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2DDD8'; e.currentTarget.style.background = '#F7F8FC' }}
                  >{a.icon} {a.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Tell me what to change or improve…"
                  rows={2}
                  style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E2DDD8', borderRadius: 12, fontSize: 14, color: '#1a1a4e', outline: 'none', fontFamily: 'Poppins, sans-serif', resize: 'none', transition: 'border-color 0.15s' }}
                  onFocus={e => { e.target.style.borderColor = '#1a1a4e' }}
                  onBlur={e => { e.target.style.borderColor = '#E2DDD8' }}
                />
                <button onClick={() => send()} disabled={sending || !input.trim()} style={{
                  width: 46, borderRadius: 12, border: 'none', alignSelf: 'stretch',
                  background: sending || !input.trim() ? '#E2DDD8' : '#f3af00',
                  cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>↑</button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  )
}
