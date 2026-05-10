'use client'
import { useState, useEffect, useRef } from 'react'
import AppLayout from '@/components/AppLayout'

const EASY_ACTIONS = [
  { icon: '📝', label: 'Rewrite my homepage', prompt: 'Rewrite my homepage content to be more professional and compelling.' },
  { icon: '📬', label: 'Add a contact form', prompt: 'Add a contact form to my site so visitors can reach me.' },
  { icon: '🔍', label: 'Improve my SEO', prompt: 'Check my SEO and improve it so I show up better on Google.' },
  { icon: '🎨', label: 'Refresh my design', prompt: 'My site design feels outdated. Suggest and apply a fresh modern look.' },
  { icon: '💰', label: 'Add pricing section', prompt: 'Add a pricing section to my homepage with 3 tiers.' },
  { icon: '⚡', label: 'Speed up my site', prompt: 'My site is slow. Find and fix every performance issue.' },
  { icon: '🛒', label: 'Set up a store', prompt: 'I want to sell products or services online. Help me set up a store.' },
  { icon: '🔒', label: 'Secure my site', prompt: 'Check my site security and make sure HTTPS is enabled.' },
]

interface Message { role: 'user' | 'assistant'; content: string; options?: { label: string }[]; ts: Date }

export default function EasyModeDashboard({ siteUrl, apiKey }: { siteUrl: string; apiKey: string }) {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const [siteInfo, setSiteInfo]   = useState<any>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)
  const cleanUrl = siteUrl.replace(/\/$/, '')

  useEffect(() => {
    if (!siteUrl || !apiKey) return
    fetch(`/api/bridge?site=${encodeURIComponent(cleanUrl)}&key=${encodeURIComponent(apiKey)}&endpoint=site`)
      .then(r => r.json()).then(d => setSiteInfo(d?.data || null)).catch(() => {})
    setMessages([{
      role: 'assistant',
      content: `Hi! I'm your ignyous AI assistant. I can make changes to your WordPress site just by you telling me what you want. What would you like to do today?`,
      ts: new Date(),
    }])
  }, [siteUrl, apiKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || sending) return
    setInput('')
    setSending(true)
    const userMsg: Message = { role: 'user', content: msg, ts: new Date() }
    setMessages(prev => [...prev, userMsg])

    try {
      const siteContext = siteInfo ? {
        site_url: cleanUrl, site_name: siteInfo.site?.name,
        description: siteInfo.site?.description,
      } : { site_url: cleanUrl }

      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res  = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, siteContext }),
      })
      const data = await res.json()

      // Execute action if present
      if (data.action && ['update_page','create_page','install_plugin','update_site_options'].includes(data.action.type)) {
        try {
          await fetch(`/api/bridge?site=${encodeURIComponent(cleanUrl)}&key=${encodeURIComponent(apiKey)}&endpoint=${data.action.type === 'update_page' ? `pages/${data.action.pageId}` : 'pages'}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: data.action.title, content: data.action.content, status: 'publish' }),
          })
        } catch {}
      }

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

  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', fontFamily: 'Poppins, sans-serif', background: '#F7F8FC' }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #E8EAF0', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#1a1a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3af00', fontSize: 18 }}>✦</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a4e' }}>{siteInfo?.site?.name || cleanUrl}</div>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Easy Mode · AI Assistant</div>
          </div>
          <a href={`/dashboard?site=${encodeURIComponent(siteUrl)}&key=`}
            style={{ marginLeft: 'auto', fontSize: 13, color: '#6B7280', textDecoration: 'none', padding: '6px 14px', border: '1px solid #E5E7EB', borderRadius: 8, fontWeight: 500 }}>
            ⚡ Advanced mode
          </a>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', width: '100%', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1a1a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3af00', fontSize: 15, flexShrink: 0 }}>✦</div>
                )}
                <div style={{ maxWidth: '78%' }}>
                  <div style={{
                    padding: '13px 18px', borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                    background: msg.role === 'user' ? '#1a1a4e' : 'white',
                    color: msg.role === 'user' ? 'white' : '#1a1a4e',
                    fontSize: 15, lineHeight: 1.65, fontWeight: 400,
                    boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
                  }}>
                    {msg.content}
                  </div>
                  {msg.options && msg.options.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {msg.options.map((opt: any, oi: number) => (
                        <button key={oi} onClick={() => send(opt.label)} style={{
                          padding: '10px 16px', borderRadius: 10,
                          border: '1.5px solid #1a1a4e', background: 'white', color: '#1a1a4e',
                          fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s',
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
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1a1a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f3af00', fontSize: 15 }}>✦</div>
                <div style={{ padding: '14px 18px', background: 'white', borderRadius: '4px 18px 18px 18px', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#9CA3AF', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}/>)}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>
        </div>

        {/* Quick action chips */}
        <div style={{ background: 'white', borderTop: '1px solid #E8EAF0', padding: '14px 24px 0', flexShrink: 0 }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Quick Actions</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 14 }}>
              {EASY_ACTIONS.map(a => (
                <button key={a.label} onClick={() => send(a.prompt)} style={{
                  padding: '7px 14px', border: '1.5px solid #E5E7EB', borderRadius: 20,
                  background: '#F9FAFB', color: '#374151', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#f3af00'; e.currentTarget.style.background = '#FFFBEB' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#F9FAFB' }}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Input bar */}
        <div style={{ background: 'white', borderTop: '1px solid #E8EAF0', padding: '16px 24px', flexShrink: 0 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10 }}>
            <input
              ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Tell me what you want to change or improve…"
              style={{
                flex: 1, padding: '13px 18px', border: '1.5px solid #E5E7EB', borderRadius: 12,
                fontSize: 15, color: '#1a1a4e', outline: 'none', fontFamily: 'Poppins, sans-serif',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#1a1a4e' }}
              onBlur={e => { e.target.style.borderColor = '#E5E7EB' }}
            />
            <button onClick={() => send()} disabled={sending || !input.trim()} style={{
              width: 48, height: 48, borderRadius: 12, border: 'none',
              background: sending || !input.trim() ? '#E5E7EB' : '#f3af00',
              cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              transition: 'all 0.15s',
            }}>↑</button>
          </div>
        </div>

      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
      `}</style>
    </AppLayout>
  )
}
