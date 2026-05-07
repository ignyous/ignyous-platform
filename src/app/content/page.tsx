'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import { Suspense } from 'react'

const C = {
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
  blue: '#1B5FA8', blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
}

const FREQUENCIES = [
  { id: 'once',    label: 'One-time',   icon: '1️⃣', desc: 'Generate a single post now' },
  { id: 'daily',   label: 'Daily',      icon: '📅', desc: '1 post every day' },
  { id: 'weekly',  label: 'Weekly',     icon: '📆', desc: '1 post per week' },
  { id: 'monthly', label: 'Monthly',    icon: '🗓️', desc: '1 post per month' },
]

const STATUS_COLORS: Record<string, { bg: string; tc: string; b: string; label: string }> = {
  pending_approval: { bg: C.yellowBg, tc: C.yellow, b: C.yellowBorder, label: '⏳ Pending Approval' },
  approved:         { bg: C.blueBg,   tc: C.blue,   b: C.blueBorder,   label: '✓ Approved' },
  scheduled:        { bg: C.blueBg,   tc: C.blue,   b: C.blueBorder,   label: '🕐 Scheduled' },
  published:        { bg: C.greenBg,  tc: C.green,  b: C.greenBorder,  label: '✅ Published' },
  rejected:         { bg: C.redBg,    tc: C.red,    b: C.redBorder,    label: '✗ Rejected' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.scheduled
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.tc, border: `1px solid ${s.b}` }}>{s.label}</span>
}

function ContentInner() {
  const params  = useSearchParams()
  const siteUrl = params.get('site') || ''

  const [tab, setTab]                   = useState<'generate'|'rewrite'|'scheduled'>('generate')
  const [frequency, setFrequency]       = useState('weekly')
  const [topics, setTopics]             = useState('')
  const [tone, setTone]                 = useState('professional')
  const [adminEmail, setAdminEmail]     = useState('')
  const [requireApproval, setRequireApproval] = useState(true)
  const [includeImage, setIncludeImage] = useState(true)
  const [generating, setGenerating]     = useState(false)
  const [preview, setPreview]           = useState<any>(null)
  const [posts, setPosts]               = useState<any[]>([])
  const [imageQuery, setImageQuery]     = useState('')
  const [images, setImages]             = useState<any[]>([])
  const [searchingImages, setSearchingImages] = useState(false)
  const [selectedImage, setSelectedImage]     = useState<any>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    const res  = await fetch('/api/content/generate')
    const data = await res.json()
    if (data.posts) setPosts(data.posts)
  }

  async function generate() {
    setGenerating(true); setPreview(null)
    try {
      const res  = await fetch('/api/content/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl, siteName: siteUrl, siteId: siteUrl,
          topics: topics.split(',').map(t => t.trim()).filter(Boolean),
          tone, frequency, requireApproval, includeImage, adminEmail,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setPreview(data.post)
        setPosts(prev => [data.post, ...prev])
      }
    } catch (e: any) { alert('Generation failed: ' + e.message) }
    finally { setGenerating(false) }
  }

  async function searchImages() {
    if (!imageQuery.trim()) return
    setSearchingImages(true)
    const res  = await fetch(`/api/images?q=${encodeURIComponent(imageQuery)}`)
    const data = await res.json()
    setImages(data.images || [])
    setSearchingImages(false)
  }

  async function approvePost(postId: string, action: 'approve' | 'reject') {
    await fetch('/api/content/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, action }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: action === 'approve' ? 'approved' : 'rejected' } : p))
  }

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>

      {/* Header */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>✍️ Content Studio</div>
          <div style={{ fontSize: 14, color: C.text2, marginTop: 2 }}>AI-powered content generation & scheduling</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {siteUrl && <a href={`/dashboard?site=${siteUrl}`} style={{ padding: '8px 16px', border: `1px solid ${C.border}`, borderRadius: 9, color: C.text2, textDecoration: 'none', fontSize: 14 }}>← Dashboard</a>}
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
            padding: '14px 20px', border: 'none', cursor: 'pointer', fontSize: 15,
            fontWeight: tab === t.id ? 600 : 400, background: 'transparent',
            color: tab === t.id ? C.accent : C.text2,
            borderBottom: `2px solid ${tab === t.id ? C.accent : 'transparent'}`,
            marginBottom: -1, fontFamily: 'Poppins, sans-serif',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── GENERATE TAB ── */}
        {tab === 'generate' && (
          <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '600px 1fr', gap: 24 }}>

            {/* Left: Settings */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>

              {/* Frequency */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 14 }}>How often?</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {FREQUENCIES.map(f => (
                    <button key={f.id} onClick={() => setFrequency(f.id)} style={{
                      padding: '14px', border: `2px solid ${frequency === f.id ? C.accent : C.border}`,
                      borderRadius: 12, cursor: 'pointer', textAlign: 'left' as const,
                      background: frequency === f.id ? C.accentDim : 'white',
                      transition: 'all 0.15s', fontFamily: 'Poppins, sans-serif',
                    }}>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{f.label}</div>
                      <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Topics */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>Topics & Tags</div>
                <div style={{ fontSize: 13, color: C.text2, marginBottom: 12 }}>Enter topics separated by commas. AI will write relevant posts.</div>
                <textarea value={topics} onChange={e => setTopics(e.target.value)} rows={3}
                  placeholder="plumbing tips, water heater maintenance, emergency repairs, DIY vs professional..."
                  style={{ width: '100%', padding: '12px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: 'Poppins, sans-serif', resize: 'vertical', color: C.text }}/>
                <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' as const }}>
                  {['How-to guides', 'Industry news', 'Customer tips', 'Case studies', 'FAQs'].map(t => (
                    <button key={t} onClick={() => setTopics(prev => prev ? `${prev}, ${t}` : t)} style={{ padding: '5px 12px', border: `1px solid ${C.border}`, borderRadius: 20, background: 'white', color: C.text2, fontSize: 12, cursor: 'pointer' }}>+ {t}</button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 14 }}>Options</div>

                {/* Tone */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: C.text2, display: 'block', marginBottom: 7 }}>Writing Tone</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['professional', 'friendly', 'casual', 'technical'].map(t => (
                      <button key={t} onClick={() => setTone(t)} style={{ padding: '6px 14px', border: `1.5px solid ${tone===t?C.accent:C.border}`, borderRadius: 20, background: tone===t?C.accentDim:'white', color: tone===t?C.accent:C.text2, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize' as const, fontFamily: 'Poppins, sans-serif' }}>{t}</button>
                    ))}
                  </div>
                </div>

                {/* Include image */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                  <input type="checkbox" checked={includeImage} onChange={e => setIncludeImage(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Include a featured image</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>AI selects a relevant stock photo from Unsplash</div>
                  </div>
                </label>

                {/* Email approval */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: requireApproval ? 12 : 0 }}>
                  <input type="checkbox" checked={requireApproval} onChange={e => setRequireApproval(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Email me for approval before posting</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>You'll get a link to approve or reject each post</div>
                  </div>
                </label>
                {requireApproval && (
                  <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="your@email.com"
                    style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 14, marginTop: 8, color: C.text, fontFamily: 'Poppins, sans-serif' }}/>
                )}
              </div>

              {/* Generate button */}
              <button onClick={generate} disabled={generating || !topics.trim()} style={{
                padding: '16px', background: generating || !topics.trim() ? C.border : C.accent,
                border: 'none', borderRadius: 14, color: 'white', fontSize: 17, fontWeight: 700,
                cursor: generating || !topics.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'Poppins, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                {generating && <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>}
                {generating ? 'AI is writing…' : '✨ Generate Post'}
              </button>
            </div>

            {/* Right: Preview */}
            <div>
              {!preview ? (
                <div style={{ background: C.white, border: `2px dashed ${C.border}`, borderRadius: 16, padding: '60px 32px', textAlign: 'center' as const, height: '100%', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✍️</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 8 }}>Post preview will appear here</div>
                  <div style={{ fontSize: 14, color: C.text3, lineHeight: 1.6 }}>Enter your topics on the left and click Generate. The AI will write a full post and show you a preview before it goes live.</div>
                </div>
              ) : (
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  {/* Post image */}
                  {preview.imageUrl && (
                    <div style={{ position: 'relative' }}>
                      <img src={preview.imageUrl} alt={preview.imageAlt} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}/>
                      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '3px 8px', borderRadius: 6, fontSize: 11 }}>
                        Photo: Unsplash
                      </div>
                    </div>
                  )}

                  <div style={{ padding: '20px 24px' }}>
                    <StatusBadge status={preview.status}/>

                    <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginTop: 12, marginBottom: 8, lineHeight: 1.3 }}>
                      {preview.title}
                    </h2>
                    <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 16 }}>{preview.excerpt}</p>

                    {/* Content preview */}
                    <div style={{ padding: 16, background: C.surface, borderRadius: 10, marginBottom: 16, maxHeight: 200, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                      <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.7 }}
                        dangerouslySetInnerHTML={{ __html: preview.content?.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').trim().slice(0, 500) + '…' }}
                      />
                    </div>

                    {/* Actions */}
                    {preview.status === 'pending_approval' && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => { approvePost(preview.id, 'approve'); setPreview({ ...preview, status: 'approved' }) }}
                          style={{ flex: 1, padding: '12px', background: C.green, border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                          ✓ Approve & Schedule
                        </button>
                        <button onClick={() => { approvePost(preview.id, 'reject'); setPreview({ ...preview, status: 'rejected' }) }}
                          style={{ flex: 1, padding: '12px', border: `1px solid ${C.redBorder}`, borderRadius: 10, color: C.red, background: C.redBg, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                          ✗ Reject
                        </button>
                      </div>
                    )}
                    {preview.status === 'approved' && (
                      <div style={{ padding: 14, background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 10, fontSize: 14, color: C.green, textAlign: 'center' as const }}>
                        ✓ Post approved and scheduled to publish
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REWRITE TAB ── */}
        {tab === 'rewrite' && (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, maxWidth: 700 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Rewrite Existing Content</div>
            <div style={{ fontSize: 14, color: C.text2, marginBottom: 24 }}>AI will review your existing pages and rewrite them to be more engaging and SEO-friendly.</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                { label: '🏠 Rewrite Homepage', desc: 'Freshen up your main page copy', prompt: 'Rewrite my homepage content to be more professional, engaging, and conversion-focused.' },
                { label: '📋 Rewrite All Service Pages', desc: 'Update each service description', prompt: 'Review and rewrite all my service pages to clearly explain what I offer and include calls-to-action.' },
                { label: '📖 Improve About Page', desc: 'Make it personal and trustworthy', prompt: 'Rewrite my About page to be more personal, build trust with visitors, and include our story.' },
                { label: '🔍 SEO-Optimize All Pages', desc: 'Add keywords and meta descriptions', prompt: 'Review all my pages and rewrite titles, headings, and content to improve SEO rankings.' },
              ].map(action => (
                <a key={action.label} href={`/dashboard?site=${siteUrl}&prompt=${encodeURIComponent(action.prompt)}`}
                  style={{ padding: '16px 18px', border: `1.5px solid ${C.border}`, borderRadius: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.15s', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.accentDim }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = 'white' }}
                >
                  <div style={{ fontSize: 22 }}>{action.label.split(' ')[0]}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{action.label.slice(3)}</div>
                    <div style={{ fontSize: 13, color: C.text3 }}>{action.desc}</div>
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
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 8 }}>No posts scheduled yet</div>
                <div style={{ fontSize: 14, marginBottom: 24 }}>Generate your first AI post to get started</div>
                <button onClick={() => setTab('generate')} style={{ padding: '12px 28px', background: C.accent, border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>Generate a Post</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                {posts.map(post => (
                  <div key={post.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex' }}>
                    {post.imageUrl && <img src={post.imageUrl} alt="" style={{ width: 140, objectFit: 'cover', flexShrink: 0 }}/>}
                    <div style={{ padding: '16px 20px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{post.title}</div>
                        <StatusBadge status={post.status}/>
                      </div>
                      <div style={{ fontSize: 13, color: C.text2, marginBottom: 10 }}>{post.excerpt}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 12 }}>
                        {(post.topics || []).map((t: string) => (
                          <span key={t} style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, background: C.surface, color: C.text2, border: `1px solid ${C.border}` }}>{t}</span>
                        ))}
                        <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, background: C.surface, color: C.text3, border: `1px solid ${C.border}` }}>{post.frequency}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: C.text3 }}>
                          {new Date(post.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {post.status === 'pending_approval' && (
                          <>
                            <button onClick={() => approvePost(post.id, 'approve')} style={{ padding: '6px 14px', background: C.green, border: 'none', borderRadius: 7, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✓ Approve</button>
                            <button onClick={() => approvePost(post.id, 'reject')}  style={{ padding: '6px 14px', background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 7, color: C.red, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✗ Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ContentPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div style={{ padding: 60, textAlign: 'center' as const, color: '#A89D94' }}>Loading…</div>}>
        <ContentInner/>
      </Suspense>
    </AppLayout>
  )
}
