'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

const C = {
  primary: '#1a1a4e', primaryDim: '#F0F0FA', primaryBorder: '#C8C8E8',
  gold: '#f3af00', goldDim: '#fffbeb', goldBorder: '#fde68a',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
  blue: '#1B5FA8', blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  text: '#1A1A2E', text2: '#6B6B8A', text3: '#A0A0C0',
  border: '#E2E2F0', surface: '#F7F7FD', white: '#FFFFFF',
}

const BTN = (variant: 'primary'|'gold'|'ghost'|'danger' = 'primary'): React.CSSProperties => ({
  fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: 14,
  borderRadius: 8, cursor: 'pointer', padding: '8px 16px', transition: 'all 0.15s',
  ...(variant === 'primary' ? { background: C.primary, color: 'white', border: 'none' } :
      variant === 'gold'    ? { background: C.gold, color: '#1a1a4e', border: 'none' } :
      variant === 'danger'  ? { background: C.redBg, color: C.red, border: `1px solid ${C.redBorder}` } :
      { background: 'white', color: C.text2, border: `1px solid ${C.border}` }),
})

const STATUS_COLORS: Record<string, { bg: string; tc: string; b: string; label: string }> = {
  pending_approval: { bg: C.yellowBg,  tc: C.yellow, b: C.yellowBorder, label: '⏳ Pending Approval' },
  approved:         { bg: C.blueBg,    tc: C.blue,   b: C.blueBorder,   label: '✓ Approved' },
  scheduled:        { bg: C.blueBg,    tc: C.blue,   b: C.blueBorder,   label: '🕐 Scheduled' },
  published:        { bg: C.greenBg,   tc: C.green,  b: C.greenBorder,  label: '✅ Published' },
  rejected:         { bg: C.redBg,     tc: C.red,    b: C.redBorder,    label: '✗ Rejected' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.scheduled
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.tc, border: `1px solid ${s.b}` }}>{s.label}</span>
}

function ContentInner() {
  const params  = useSearchParams()
  const siteUrl = params.get('site') || ''
  const apiKey  = typeof window !== 'undefined'
    ? (() => { try { const k = `ignyous_conn_${siteUrl.replace(/[^a-z0-9]/gi,'_')}`; return JSON.parse(localStorage.getItem(k)||'{}').apiKey||'' } catch { return '' } })()
    : ''

  const [tab, setTab]                         = useState<'generate'|'rewrite'|'scheduled'>('generate')
  const [frequency, setFrequency]             = useState('weekly')
  const [topics, setTopics]                   = useState('')
  const [tone, setTone]                       = useState('professional')
  const [adminEmail, setAdminEmail]           = useState('')
  const [requireApproval, setRequireApproval] = useState(true)
  const [includeImage, setIncludeImage]       = useState(true)
  const [generating, setGenerating]           = useState(false)
  const [preview, setPreview]                 = useState<any>(null)
  const [posts, setPosts]                     = useState<any[]>([])
  const [editingPost, setEditingPost]         = useState<any>(null)
  const [categories, setCategories]           = useState<Array<{id:number;name:string;count:number}>>([])
  const [selectedCategory, setSelectedCategory] = useState<number|'auto'>('auto')
  const [loadingCats, setLoadingCats]         = useState(false)

  useEffect(() => { loadPosts() }, [])
  useEffect(() => { if (siteUrl && apiKey) fetchCategories() }, [siteUrl, apiKey])

  function setFrequencyAndApproval(f: string) {
    setFrequency(f)
    if (f === 'once') setRequireApproval(false)
    else setRequireApproval(true)
  }

  async function fetchCategories() {
    setLoadingCats(true)
    try {
      const res  = await fetch('/api/wordpress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, apiKey, endpoint: 'categories', method: 'GET' }),
      })
      const data = await res.json()
      if (data.categories) setCategories(data.categories)
    } catch {} finally { setLoadingCats(false) }
  }

  async function loadPosts() {
    const res  = await fetch('/api/content/generate')
    const data = await res.json()
    if (data.posts) setPosts(data.posts)
  }

  async function generate() {
    setGenerating(true); setPreview(null)
    try {
      const catId = selectedCategory !== 'auto' ? selectedCategory : undefined
      const res   = await fetch('/api/content/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl, siteName: siteUrl, siteId: siteUrl, apiKey,
          topics: topics.split(',').map(t => t.trim()).filter(Boolean),
          tone, frequency, requireApproval, includeImage, adminEmail,
          categoryId: catId, autoCategory: selectedCategory === 'auto',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setPreview(data.post)
        setPosts(prev => [data.post, ...prev])
        if (!requireApproval && frequency !== 'once') setTab('scheduled')
      } else {
        alert('Error: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) { alert('Generation failed: ' + e.message) }
    finally { setGenerating(false) }
  }

  async function approvePost(postId: string, action: 'approve' | 'reject') {
    const res  = await fetch('/api/content/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, action }),
    })
    const data = await res.json()
    const newStatus = action === 'approve'
      ? (data.published ? 'published' : 'approved')
      : 'rejected'
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: newStatus, publishedUrl: data.url || p.publishedUrl } : p))
    if (preview?.id === postId) setPreview((p: any) => ({ ...p, status: newStatus }))
    if (data.warning) alert('⚠️ ' + data.warning)
  }

  async function cancelPost(postId: string) {
    if (!confirm('Cancel this scheduled post? It will be marked as rejected.')) return
    await approvePost(postId, 'reject')
  }

  async function publishNow(postId: string) {
    setGenerating(true)
    try {
      const res  = await fetch('/api/content/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const data = await res.json()
      if (!res.ok) { alert('Publish failed: ' + (data.error || 'Unknown error')); return }
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'published', publishedUrl: data.publishedUrl } : p))
      if (preview?.id === postId) setPreview((p: any) => ({ ...p, status: 'published', publishedUrl: data.publishedUrl }))
    } catch (e: any) { alert('Publish error: ' + e.message) }
    finally { setGenerating(false) }
  }

  async function saveEdit(postId: string, title: string, content: string) {
    await fetch('/api/content/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, action: 'edit', title, content }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, title, content } : p))
    setEditingPost(null)
  }

  const FREQUENCIES = [
    { id: 'once',    label: 'One-time',  icon: '1️⃣', desc: 'Generate a single post now' },
    { id: 'daily',   label: 'Daily',     icon: '📅', desc: '1 post every day' },
    { id: 'weekly',  label: 'Weekly',    icon: '📆', desc: '1 post per week' },
    { id: 'monthly', label: 'Monthly',   icon: '🗓️', desc: '1 post per month' },
  ]

  return (
    <div style={{ background: C.surface, minHeight: '100%', fontFamily: 'Poppins, sans-serif' }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>✍️ Content Scheduler</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>AI-powered content generation & scheduling</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {siteUrl && <a href={`/dashboard?site=${siteUrl}`} style={{ ...BTN('ghost'), textDecoration: 'none' }}>← Dashboard</a>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '0 32px', display: 'flex', gap: 0 }}>
        {([
          { id: 'generate',  label: '✨ Generate New Posts' },
          { id: 'rewrite',   label: '✏️ Rewrite Content' },
          { id: 'scheduled', label: `📋 Scheduled (${posts.length})` },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '14px 22px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab===t.id ? 700 : 500,
            background: 'transparent', color: tab===t.id ? C.primary : C.text2,
            borderBottom: `3px solid ${tab===t.id ? C.gold : 'transparent'}`,
            marginBottom: -1, fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── GENERATE TAB ── */}
        {tab === 'generate' && (
          <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '580px 1fr', gap: 24 }}>

            {/* Settings */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>

              {/* Frequency */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>📅 Post Frequency</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {FREQUENCIES.map(f => (
                    <button key={f.id} onClick={() => setFrequencyAndApproval(f.id)} style={{
                      padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left' as const,
                      border: `2px solid ${frequency===f.id ? C.primary : C.border}`,
                      background: frequency===f.id ? C.primaryDim : C.white,
                      transition: 'all 0.15s', fontFamily: 'Poppins, sans-serif',
                    }}>
                      <div style={{ fontSize: 20 }}>{f.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 4 }}>{f.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: C.text3 }}>{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Topics + Tone */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>🎯 Content Settings</div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 6 }}>Topics / Keywords (comma separated)</label>
                    <textarea value={topics} onChange={e => setTopics(e.target.value)} placeholder="plumbing tips, emergency repairs, water heater, clogged drains…"
                      style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: 'Poppins, sans-serif', color: C.text, resize: 'vertical', minHeight: 72, background: C.surface, boxSizing: 'border-box' as const }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 6 }}>Writing Tone</label>
                    <select value={tone} onChange={e => setTone(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: 'Poppins, sans-serif', color: C.text, background: C.surface }}>
                      {['professional','friendly','casual','authoritative','educational','conversational'].map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category picker */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 6 }}>
                      Category {loadingCats && <span style={{ color: C.text3, fontWeight: 400 }}>(loading…)</span>}
                    </label>
                    {categories.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                        <button onClick={() => setSelectedCategory('auto')} style={{
                          padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${selectedCategory==='auto'?C.primary:C.border}`,
                          background: selectedCategory==='auto'?C.primaryDim:C.white, color: selectedCategory==='auto'?C.primary:C.text2,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>🤖 Auto-select</button>
                        {categories.map(cat => (
                          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{
                            padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${selectedCategory===cat.id?C.primary:C.border}`,
                            background: selectedCategory===cat.id?C.primaryDim:C.white, color: selectedCategory===cat.id?C.primary:C.text2,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}>{cat.name} <span style={{ opacity: 0.5 }}>({cat.count})</span></button>
                        ))}
                        <button onClick={fetchCategories} style={{ padding: '6px 10px', borderRadius: 20, border: `1px solid ${C.border}`, background: 'white', color: C.text3, fontSize: 12, cursor: 'pointer' }}>↺</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: C.text3 }}>
                          {siteUrl ? 'No categories found — will auto-assign' : 'Connect a site to see categories'}
                        </span>
                        {siteUrl && <button onClick={fetchCategories} style={{ ...BTN('ghost'), fontSize: 12, padding: '4px 10px' }}>Retry</button>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Options */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>⚙️ Options</div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  {[
                    { label: '🖼️ Include images', desc: 'Auto-fetch relevant stock photo', val: includeImage, set: setIncludeImage },
                    ...( frequency !== 'once' ? [
                      { label: '✅ Require my approval', desc: 'Review before posting to site', val: requireApproval, set: setRequireApproval },
                    ] : []),
                  ].map(opt => (
                    <div key={opt.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{opt.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: C.text3 }}>{opt.desc}</div>
                      </div>
                      <div onClick={() => opt.set(!opt.val)} style={{
                        width: 46, height: 26, borderRadius: 13, cursor: 'pointer', transition: 'all 0.2s',
                        background: opt.val ? C.primary : C.border, position: 'relative',
                      }}>
                        <div style={{ position: 'absolute', top: 3, left: opt.val ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}/>
                      </div>
                    </div>
                  ))}
                  {requireApproval && frequency !== 'once' && (
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 6 }}>Email approval notifications to</label>
                      <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="you@example.com"
                        style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: 'Poppins, sans-serif', color: C.text, background: C.surface, boxSizing: 'border-box' as const }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <button onClick={generate} disabled={generating} style={{
                ...BTN('gold'), fontSize: 16, padding: '14px 28px',
                opacity: generating ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 4px 14px rgba(243,175,0,0.35)',
              }}>
                {generating ? (
                  <><div style={{ width: 18, height: 18, border: '2.5px solid rgba(26,26,78,0.3)', borderTopColor: '#1a1a4e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/> Generating…</>
                ) : (
                  <><span style={{ fontSize: 18 }}>✦</span> {frequency==='once' ? 'Generate & Preview Post' : `Start ${frequency.charAt(0).toUpperCase()+frequency.slice(1)} Schedule`}</>
                )}
              </button>
            </div>

            {/* Preview */}
            <div>
              {preview ? (
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', position: 'sticky', top: 80 }}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Preview</span>
                    <StatusBadge status={preview.status}/>
                  </div>
                  {preview.imageUrl && (
                    <div style={{ position: 'relative' }}>
                      <img src={preview.imageUrl} alt={preview.imageAlt} style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}/>
                      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500 }}>Photo: Unsplash</div>
                    </div>
                  )}
                  <div style={{ padding: '18px 22px' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8, lineHeight: 1.3 }}>{preview.title}</h2>
                    <p style={{ fontSize: 13, fontWeight: 500, color: C.text2, lineHeight: 1.6, marginBottom: 14 }}>{preview.excerpt}</p>
                    <div style={{ padding: 14, background: C.surface, borderRadius: 10, marginBottom: 16, maxHeight: 180, overflowY: 'auto' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: C.text2, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: (preview.content||'').replace(/<!--.*?-->/g,'').replace(/<[^>]+>/g,' ').trim().slice(0,400)+'…' }}/>
                    </div>
                    {preview.status === 'pending_approval' && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => approvePost(preview.id, 'approve')} style={{ ...BTN('gold'), flex: 1, justifyContent: 'center', display: 'flex' }}>✓ Approve & Schedule</button>
                        <button onClick={() => approvePost(preview.id, 'reject')} style={{ ...BTN('danger'), flex: 1, justifyContent: 'center', display: 'flex' }}>✗ Reject</button>
                      </div>
                    )}
                    {(preview.status === 'approved' || preview.status === 'scheduled') && preview.frequency !== 'once' && (
                      <button onClick={() => publishNow(preview.id)} disabled={generating} style={{ ...BTN('gold'), width: '100%', justifyContent: 'center', display: 'flex' }}>
                        {generating ? '⏳ Publishing…' : '🚀 Publish Now to WordPress'}
                      </button>
                    )}
                    {preview.status === 'published' && preview.publishedUrl && (
                      <a href={preview.publishedUrl} target='_blank' rel='noreferrer' style={{ display: 'block', textAlign: 'center', padding: 12, background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.green, textDecoration: 'none' }}>✅ Published — View Live Post ↗</a>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ background: C.white, border: `2px dashed ${C.border}`, borderRadius: 16, padding: 48, textAlign: 'center' as const }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Your post preview appears here</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text3 }}>Configure your settings and click Generate</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REWRITE TAB ── */}
        {tab === 'rewrite' && (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, maxWidth: 700 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Rewrite Existing Content</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text2, marginBottom: 24 }}>AI will review your existing pages and rewrite them to be more engaging and SEO-friendly.</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                { label: '🏠 Rewrite Homepage',        desc: 'Freshen up your main page copy',         prompt: 'Rewrite my homepage content to be more professional, engaging, and conversion-focused.' },
                { label: '📋 Rewrite All Service Pages',desc: 'Update each service description',        prompt: 'Review and rewrite all my service pages to clearly explain what I offer and include calls-to-action.' },
                { label: '📖 Improve About Page',       desc: 'Make it personal and trustworthy',       prompt: 'Rewrite my About page to be more personal, build trust with visitors, and include our story.' },
                { label: '🔍 SEO-Optimize All Pages',   desc: 'Add keywords and meta descriptions',     prompt: 'Review all my pages and rewrite titles, headings, and content to improve SEO rankings.' },
              ].map(action => (
                <a key={action.label} href={`/dashboard?site=${siteUrl}&prompt=${encodeURIComponent(action.prompt)}`}
                  style={{ padding: '16px 18px', border: `1.5px solid ${C.border}`, borderRadius: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.background=C.primaryDim }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.background='white' }}
                >
                  <div style={{ fontSize: 22 }}>{action.label.split(' ')[0]}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{action.label.slice(3)}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.text3 }}>{action.desc}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', color: C.text3, fontSize: 20 }}>→</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── SCHEDULED TAB ── */}
        {tab === 'scheduled' && (
          <div>
            {posts.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '80px', color: C.text3 }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>📋</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>No posts scheduled yet</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 24 }}>Generate your first AI post to get started</div>
                <button onClick={() => setTab('generate')} style={{ ...BTN('gold'), fontSize: 15, padding: '12px 28px' }}>Generate a Post</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                {posts.map(post => (
                  <div key={post.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                    {/* Edit mode */}
                    {editingPost?.id === post.id ? (
                      <div style={{ padding: '20px 24px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Edit Post</div>
                        <input value={editingPost.title} onChange={e => setEditingPost((p: any) => ({ ...p, title: e.target.value }))}
                          style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, fontWeight: 600, fontFamily: 'Poppins, sans-serif', marginBottom: 10, boxSizing: 'border-box' as const }}
                        />
                        <textarea value={editingPost.content} onChange={e => setEditingPost((p: any) => ({ ...p, content: e.target.value }))} rows={8}
                          style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontFamily: 'Poppins, sans-serif', resize: 'vertical', boxSizing: 'border-box' as const }}
                        />
                        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                          <button onClick={() => saveEdit(post.id, editingPost.title, editingPost.content)} style={{ ...BTN('primary') }}>Save Changes</button>
                          <button onClick={() => setEditingPost(null)} style={{ ...BTN('ghost') }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex' }}>
                        {post.imageUrl && <img src={post.imageUrl} alt="" style={{ width: 130, objectFit: 'cover', flexShrink: 0 }}/>}
                        <div style={{ padding: '16px 20px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{post.title}</div>
                            <StatusBadge status={post.status}/>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: C.text2, marginBottom: 10 }}>{post.excerpt}</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 12 }}>
                            {(post.topics||[]).map((t: string) => (
                              <span key={t} style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: C.primaryDim, color: C.primary, border: `1px solid ${C.primaryBorder}` }}>{t}</span>
                            ))}
                            <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: C.surface, color: C.text3, border: `1px solid ${C.border}` }}>{post.frequency}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.text3 }}>
                              📅 Created: {new Date(post.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {post.scheduledFor && post.status !== 'published' && (
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.primary, background: C.primaryDim, padding: '2px 10px', borderRadius: 20, border: `1px solid ${C.primaryBorder}` }}>
                                🕐 Scheduled: {new Date(post.scheduledFor).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })} at {new Date(post.scheduledFor).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                              </span>
                            )}
                            {post.status === 'published' && (
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.green, background: C.greenBg, padding: '2px 10px', borderRadius: 20, border: `1px solid ${C.greenBorder}` }}>
                                ✅ Posted {post.publishedAt ? `on ${new Date(post.publishedAt).toLocaleDateString([], { month:'short', day:'numeric' })} at ${new Date(post.publishedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}` : 'successfully'}
                              </span>
                            )}
                            {post.status === 'approved' && (
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.yellow, background: C.yellowBg, padding: '2px 10px', borderRadius: 20, border: `1px solid ${C.yellowBorder}` }}>
                                ⚠️ Approved but not yet published to WP — check Activity Log
                              </span>
                            )}
                            {post.status === 'published' && post.publishedUrl && (
                              <a href={post.publishedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>View Live Post ↗</a>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: C.text3 }}>
                              {new Date(post.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {post.status === 'pending_approval' && (
                              <>
                                <button onClick={() => approvePost(post.id, 'approve')} style={{ ...BTN('gold'), fontSize: 12, padding: '5px 12px' }}>✓ Approve</button>
                                <button onClick={() => approvePost(post.id, 'reject')} style={{ ...BTN('danger'), fontSize: 12, padding: '5px 12px' }}>✗ Reject</button>
                              </>
                            )}
                            {(post.status === 'scheduled' || post.status === 'approved') && post.frequency !== 'once' && (
                              <button onClick={() => publishNow(post.id)} disabled={generating} style={{ ...BTN('gold'), fontSize: 12, padding: '5px 12px' }}>
                                🚀 Publish Now
                              </button>
                            )}
                            {/* Edit & Cancel — shown for non-published posts */}
                            {post.status !== 'published' && post.status !== 'rejected' && (
                              <>
                                <button onClick={() => setEditingPost({ id: post.id, title: post.title, content: post.content })} style={{ ...BTN('ghost'), fontSize: 12, padding: '5px 12px' }}>✏️ Edit</button>
                                <button onClick={() => cancelPost(post.id)} style={{ ...BTN('danger'), fontSize: 12, padding: '5px 12px' }}>✕ Cancel</button>
                              </>
                            )}
                            {post.status === 'published' && post.publishedUrl && (
                              <a href={post.publishedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>View Post ↗</a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function ContentPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: '#A0A0C0', fontFamily: 'Poppins, sans-serif' }}>Loading…</div>}>
        <ContentInner/>
      </Suspense>
    </AppLayout>
  )
}
