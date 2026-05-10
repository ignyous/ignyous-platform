'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

const C = {
  text:'#1A1410', text2:'#6B6056', text3:'#A89D94',
  border:'#E2DDD8', surface:'#F7F5F2', white:'#FFFFFF',
  green:'#1E7B4B', greenBg:'#F0FAF5', greenBorder:'#B8E5CF',
  red:'#B91C1C', redBg:'#FEF2F2', yellow:'#92400E', yellowBg:'#FFFBEB',
  accent:'#E8651A', accentDim:'#FFF7ED', primary:'#1a1a4e', gold:'#f3af00',
}

const scoreColor = (n: number) => n >= 70 ? C.green : n >= 40 ? C.yellow : C.red
const scoreBg    = (n: number) => n >= 70 ? C.greenBg : n >= 40 ? C.yellowBg : C.redBg
const scoreLabel = (n: number) => n >= 70 ? 'Good' : n >= 40 ? 'Needs work' : 'Poor'

function ScoreBadge({ score }: { score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: scoreBg(score), border: `2px solid ${scoreColor(score)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: scoreColor(score) }}>
        {score}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: scoreColor(score) }}>{scoreLabel(score)}</span>
    </div>
  )
}

export default function SEOPage() {
  const params  = useSearchParams()
  const siteUrl = params.get('site') || ''
  const [apiKey, setApiKey]         = useState('')
  const [pages, setPages]           = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<any | null>(null)
  const [editing, setEditing]       = useState<any>({})
  const [saving, setSaving]         = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [toast, setToast]           = useState('')
  const [siteContext, setSiteContext] = useState<any>(null)
  const cleanUrl = siteUrl.replace(/\/$/, '')

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(d => {
      const site = d.sites?.find((s: any) => s.url === siteUrl || s.url === siteUrl.replace(/\/$/, '')) || d.sites?.[0]
      if (site) { setApiKey(site.apiKey); loadAudit(site.apiKey) }
      else setLoading(false)
    })
    fetch(`/api/bridge?site=${encodeURIComponent(cleanUrl)}&endpoint=site`).then(r => r.json()).then(d => setSiteContext(d?.data || null)).catch(() => {})
  }, [siteUrl])

  async function loadAudit(key = apiKey) {
    setLoading(true)
    const res  = await fetch(`/api/seo?siteUrl=${encodeURIComponent(cleanUrl)}&apiKey=${encodeURIComponent(key)}`)
    const data = await res.json()
    setPages(data.pages || [])
    setLoading(false)
  }

  function selectPage(page: any) {
    setSelected(page)
    setEditing({
      seo_title:        page.seo?.seo_title        || '',
      meta_description: page.seo?.meta_description || '',
      focus_keyword:    page.seo?.focus_keyword     || '',
      og_title:         page.seo?.og_title          || '',
      og_description:   page.seo?.og_description    || '',
    })
  }

  async function saveSEO() {
    if (!selected) return
    setSaving(true)
    const res = await fetch('/api/seo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', siteUrl: cleanUrl, apiKey, pageId: selected.id, seoData: editing }),
    })
    const data = await res.json()
    if (data.success) {
      showToast('✓ SEO saved for ' + selected.title)
      setPages(prev => prev.map(p => p.id === selected.id ? { ...p, seo: { ...p.seo, ...editing }, score: null } : p))
    } else {
      showToast('⚠️ ' + (data.message || 'Save failed'), true)
    }
    setSaving(false)
  }

  async function generateSEO(pageId: number) {
    setGenerating(String(pageId))
    const res = await fetch('/api/seo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', siteUrl: cleanUrl, apiKey, pageId, siteContext }),
    })
    const data = await res.json()
    if (data.success && data.generated) {
      if (selected?.id === pageId) {
        setEditing((prev: any) => ({ ...prev, ...data.generated }))
      }
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, seo: { ...p.seo, ...data.generated } } : p))
      showToast('✦ AI generated SEO for this page')
    } else {
      showToast('⚠️ Generation failed', true)
    }
    setGenerating(null)
  }

  async function bulkGenerate() {
    setBulkRunning(true)
    const lowScore = pages.filter(p => (p.score ?? 0) < 70)
    const res = await fetch('/api/seo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_generate', siteUrl: cleanUrl, apiKey, pages: lowScore, siteContext }),
    })
    const data = await res.json()
    showToast(`✦ AI updated SEO for ${data.updated}/${lowScore.length} pages`)
    loadAudit()
    setBulkRunning(false)
  }

  function showToast(msg: string, isError = false) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const avgScore = pages.length ? Math.round(pages.reduce((a, p) => a + (p.score ?? 0), 0) / pages.length) : 0
  const pagesNeedingWork = pages.filter(p => (p.score ?? 0) < 70).length

  return (
    <AppLayout>
      <div style={{ display: 'flex', height: 'calc(100vh - 0px)', fontFamily: 'Poppins,sans-serif', overflow: 'hidden' }}>

        {/* Left: Page list */}
        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, background: C.white, overflow: 'hidden' }}>
          
          {/* Header */}
          <div style={{ padding: '20px 20px 0', borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.primary, margin: 0 }}>SEO Manager</h1>
              <button onClick={() => loadAudit()} style={{ padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 12, cursor: 'pointer' }}>↺ Refresh</button>
            </div>

            {/* Summary scores */}
            {!loading && pages.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Avg Score', value: avgScore, isScore: true },
                  { label: 'Need Work', value: pagesNeedingWork, color: pagesNeedingWork > 0 ? C.accent : C.green },
                  { label: 'Total Pages', value: pages.length, color: C.primary },
                ].map(s => (
                  <div key={s.label} style={{ background: C.surface, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.isScore ? scoreColor(s.value as number) : (s.color || C.text) }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Bulk AI button */}
            {pagesNeedingWork > 0 && (
              <button onClick={bulkGenerate} disabled={bulkRunning} style={{
                width: '100%', padding: '10px', background: bulkRunning ? C.border : C.primary,
                border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: bulkRunning ? 'not-allowed' : 'pointer',
              }}>
                {bulkRunning ? '⏳ Optimizing all pages…' : `✦ AI Optimize All (${pagesNeedingWork} pages)`}
              </button>
            )}
          </div>

          {/* Page list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>Loading pages…</div>
            ) : pages.map(page => (
              <div key={page.id} onClick={() => selectPage(page)} style={{
                padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
                background: selected?.id === page.id ? C.accentDim : C.white,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                transition: 'background 0.1s',
              }}>
                <ScoreBadge score={page.score ?? 0} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title}</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{page.issues?.length || 0} issue{page.issues?.length !== 1 ? 's' : ''}</div>
                </div>
                {generating === String(page.id) && (
                  <div style={{ width: 14, height: 14, border: `2px solid ${C.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: SEO editor */}
        <div style={{ flex: 1, overflow: 'auto', background: C.surface }}>
          {!selected ? (
            <div style={{ padding: 60, textAlign: 'center', color: C.text3 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Select a page to edit its SEO</div>
              <div style={{ fontSize: 14 }}>Or click "AI Optimize All" to automatically improve every page at once</div>
            </div>
          ) : (
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 28px' }}>

              {/* Page header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: C.primary, margin: 0 }}>{selected.title}</h2>
                  <a href={selected.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.text3 }}>{selected.link}</a>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => generateSEO(selected.id)} disabled={!!generating} style={{
                    padding: '9px 18px', background: generating ? C.border : C.primary,
                    border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer',
                  }}>
                    {generating === String(selected.id) ? '⏳ Generating…' : '✦ AI Generate'}
                  </button>
                  <button onClick={saveSEO} disabled={saving} style={{
                    padding: '9px 18px', background: saving ? C.border : C.accent,
                    border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                  }}>
                    {saving ? 'Saving…' : '✓ Save'}
                  </button>
                </div>
              </div>

              {/* Issues */}
              {selected.issues?.length > 0 && (
                <div style={{ background: C.yellowBg, border: `1px solid #FDE68A`, borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>⚠ {selected.issues.length} issue{selected.issues.length !== 1 ? 's' : ''} detected</div>
                  {selected.issues.map((issue: string, i: number) => (
                    <div key={i} style={{ fontSize: 13, color: C.yellow, marginBottom: 2 }}>· {issue}</div>
                  ))}
                </div>
              )}

              {/* Google SERP Preview */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text2, marginBottom: 12 }}>📱 Google Search Preview</div>
                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px 20px' }}>
                  <div style={{ fontSize: 14, color: '#1a0dab', fontWeight: 400, marginBottom: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {editing.seo_title || selected.title || 'Page Title'}
                  </div>
                  <div style={{ fontSize: 12, color: '#006621', marginBottom: 4 }}>{selected.link}</div>
                  <div style={{ fontSize: 13, color: '#545454', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {editing.meta_description || 'No meta description set — Google will auto-generate one from your page content, which may not represent your page well.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
                  <span style={{ color: (editing.seo_title?.length || 0) > 60 ? C.red : C.green }}>Title: {editing.seo_title?.length || 0}/60 chars</span>
                  <span style={{ color: (editing.meta_description?.length || 0) > 160 ? C.red : (editing.meta_description?.length || 0) < 120 ? C.yellow : C.green }}>
                    Description: {editing.meta_description?.length || 0}/160 chars
                  </span>
                </div>
              </div>

              {/* SEO Fields */}
              {[
                { key: 'seo_title',        label: 'SEO Title',         placeholder: 'Primary keyword | Brand name | 50-60 chars', rows: 1, hint: 'Different from your page title — this is what shows in Google. Include your main keyword near the start.' },
                { key: 'meta_description', label: 'Meta Description',  placeholder: 'Compelling description 150-160 chars that includes keyword and a call to action...', rows: 3, hint: '150-160 chars. Must include focus keyword. Write for humans — it directly affects click-through rate.' },
                { key: 'focus_keyword',    label: 'Focus Keyword',     placeholder: 'e.g. "plumber in Chicago" or "wordpress website design"', rows: 1, hint: '2-4 words that best describe this page. Use in title, first paragraph, headings, and URL if possible.' },
                { key: 'og_title',         label: 'Social (OG) Title', placeholder: 'Title for Facebook, LinkedIn, Twitter shares...', rows: 1, hint: 'Can be more engaging/clickbait than your SEO title. Shows when someone shares this page on social media.' },
                { key: 'og_description',   label: 'Social (OG) Description', placeholder: 'Description for social media shares...', rows: 2, hint: 'Under 200 chars. This shows in social media link previews.' },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <label style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{field.label}</label>
                    <span style={{ fontSize: 12, color: C.text3 }}>— {field.hint}</span>
                  </div>
                  {field.rows === 1 ? (
                    <input value={editing[field.key] || ''} onChange={e => setEditing((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.text, fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' as const }} />
                  ) : (
                    <textarea value={editing[field.key] || ''} onChange={e => setEditing((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder} rows={field.rows}
                      style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.text, fontFamily: 'Poppins,sans-serif', resize: 'vertical', boxSizing: 'border-box' as const }} />
                  )}
                </div>
              ))}

              {/* Plugin indicator */}
              <div style={{ background: C.surface, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: C.text2 }}>
                {selected.seo?.plugin === 'yoast' ? '🟢 Writing to Yoast SEO fields' :
                 selected.seo?.plugin === 'rankmath' ? '🟢 Writing to RankMath SEO fields' :
                 '⚠️ No SEO plugin detected — install Yoast SEO or RankMath for these fields to take effect in Google'}
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, background: toast.startsWith('⚠') ? C.red : C.green, color: 'white', padding: '13px 20px', borderRadius: 12, fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 9999, animation: 'slideUp 0.3s ease' }}>
          {toast}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </AppLayout>
  )
}
