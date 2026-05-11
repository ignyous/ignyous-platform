'use client'
import { useEffect, useRef, useState } from 'react'

const C = {
  primary: '#1a1a4e', gold: '#f3af00', accent: '#E8651A',
  text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', white: '#FFFFFF', surface: '#F7F5F2',
  green: '#1E7B4B', greenBg: '#F0FAF5',
}

interface SelectedElement {
  elementId: string | null
  elementLabel: string
  elementType: string
  index: number
  isSectionLevel: boolean
  bgColor?: string
  rect?: { top: number; left: number; width: number; height: number }
}

interface Props {
  pageUrl: string
  pageId: number
  siteUrl: string
  apiKey: string
  onClose: () => void
  onApply: (description: string, elementId: string | null, updates: any) => void
  onMove: (fromIndex: number, toIndex: number) => void
}

export default function VisualEditor({ pageUrl, pageId, siteUrl, apiKey, onClose, onApply, onMove }: Props) {
  const iframeRef           = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading]         = useState(true)
  const [proxyHtml, setProxyHtml]     = useState<string | null>(null)
  const [selected, setSelected]       = useState<SelectedElement | null>(null)
  const [stylePanel, setStylePanel]   = useState<any | null>(null)
  const [aiPrompt, setAiPrompt]       = useState('')
  const [applying, setApplying]       = useState(false)
  const [bgColor, setBgColor]         = useState('')
  const [bgImageUrl, setBgImageUrl]   = useState('')
  const [toast, setToast]             = useState('')

  // Load proxy HTML with editMode=true
  useEffect(() => {
    setLoading(true)
    fetch('/api/proxy/page-preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageUrl, editMode: true }),
    }).then(r => r.text()).then(html => {
      setProxyHtml(html)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [pageUrl])

  // Listen for postMessage events from the iframe
  useEffect(() => {
    function handler(e: MessageEvent) {
      const d = e.data
      if (!d?.type?.startsWith('ignyous:')) return

      if (d.type === 'ignyous:select') {
        setSelected(d)
        setStylePanel(null)
        setAiPrompt('')
        setBgColor(d.bgColor && d.bgColor !== 'rgba(0, 0, 0, 0)' ? rgbToHex(d.bgColor) : '')
        setBgImageUrl('')
      }
      if (d.type === 'ignyous:style') {
        setStylePanel(d)
        setSelected(s => s ? { ...s, elementId: d.elementId, index: d.index } : null)
        setBgColor(d.currentBg && d.currentBg !== 'rgba(0, 0, 0, 0)' ? rgbToHex(d.currentBg) : '')
      }
      if (d.type === 'ignyous:move') {
        onMove(d.fromIndex, d.toIndex)
        showToast('Section moved — preview will refresh')
      }
      if (d.type === 'ignyous:ready') {
        setLoading(false)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onMove])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function applyAiEdit() {
    if (!aiPrompt.trim() || !selected) return
    setApplying(true)
    // Construct a natural description for the element update API
    const desc = `${selected.elementLabel} at position ${selected.index} — ${selected.elementType}`
    onApply(aiPrompt, selected.elementId, { _aiPrompt: aiPrompt, _description: desc })
    setApplying(false)
    setAiPrompt('')
    showToast('✦ AI change queued — check the main chat panel')
  }

  async function applyStyle() {
    if (!selected) return
    const updates: any = {}
    if (bgColor)    updates.background_color = bgColor
    if (bgImageUrl) updates.background_image_url = bgImageUrl
    if (Object.keys(updates).length === 0) return

    setApplying(true)
    const res = await fetch('/api/element', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: selected.elementId ? 'update_element' : 'find_and_update',
        siteUrl, apiKey, pageId,
        elementId: selected.elementId,
        description: `element at index ${selected.index}`,
        updates,
      }),
    })
    const data = await res.json()
    if (data.success) {
      showToast('✓ Style applied!')
      // Reload proxy
      setTimeout(() => {
        fetch('/api/proxy/page-preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageUrl, editMode: true }),
        }).then(r => r.text()).then(setProxyHtml)
      }, 1500)
    } else {
      showToast('⚠ ' + (data.message || 'Update failed'))
    }
    setApplying(false)
  }

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'Poppins,sans-serif', background: '#1a1a2e', position: 'relative' }}>

      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, background: C.primary, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✦</div>
        <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>Visual Editor</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>— hover sections to edit, drag to reorder</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: 'white', padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
          ← Back to Preview
        </button>
      </div>

      {/* Main split */}
      <div style={{ display: 'flex', flex: 1, paddingTop: 44 }}>

        {/* iframe */}
        <div style={{ flex: 1, position: 'relative', background: '#e8e4df', overflow: 'hidden' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, zIndex: 10 }}>
              <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Loading visual editor…</div>
            </div>
          )}
          {proxyHtml && (
            <iframe
              ref={iframeRef}
              srcDoc={proxyHtml}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="Visual Editor"
            />
          )}
        </div>

        {/* Right panel — appears when something is selected */}
        {(selected || stylePanel) && (
          <div style={{ width: 300, flexShrink: 0, background: C.white, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>

            {/* Element header */}
            <div style={{ padding: '16px 18px', background: C.primary, color: 'white' }}>
              <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Selected element</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{selected?.elementLabel || 'Section'}</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                Position {(selected?.index ?? 0) + 1} · {selected?.elementId || 'no id'}
              </div>
            </div>

            {/* AI Edit */}
            <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>✦ AI Edit</div>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder={`e.g. "Make this heading bolder and change the text to 'Welcome to Our Store'" or "Change the background to a dark navy"`}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontFamily: 'Poppins,sans-serif', resize: 'vertical', boxSizing: 'border-box' as const, color: C.text }}
              />
              <button onClick={applyAiEdit} disabled={applying || !aiPrompt.trim()} style={{
                marginTop: 8, width: '100%', padding: '10px', background: applying ? C.border : C.primary,
                border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: applying ? 'not-allowed' : 'pointer',
              }}>
                {applying ? '⏳ Applying…' : '✦ Apply AI Change'}
              </button>
            </div>

            {/* Style controls */}
            {selected?.isSectionLevel && (
              <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>🎨 Quick Style</div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: C.text2, display: 'block', marginBottom: 6 }}>Background Colour</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={bgColor || '#ffffff'} onChange={e => setBgColor(e.target.value)}
                      style={{ width: 40, height: 36, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                    <input value={bgColor} onChange={e => setBgColor(e.target.value)} placeholder="#ffffff"
                      style={{ flex: 1, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'monospace' }} />
                    {bgColor && <button onClick={() => setBgColor('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.text3, fontSize: 16 }}>×</button>}
                  </div>
                </div>

                {/* Preset colours */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
                  {['#ffffff','#f8f9fc','#1a1a4e','#f3af00','#1E7B4B','#B91C1C','#000000','transparent'].map(c => (
                    <button key={c} onClick={() => setBgColor(c === 'transparent' ? '' : c)} style={{
                      width: 28, height: 28, borderRadius: 6, background: c === 'transparent' ? 'repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 0 0/10px 10px' : c,
                      border: `2px solid ${bgColor === c ? C.primary : C.border}`, cursor: 'pointer',
                    }} title={c} />
                  ))}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: C.text2, display: 'block', marginBottom: 6 }}>Background Image URL</label>
                  <input value={bgImageUrl} onChange={e => setBgImageUrl(e.target.value)} placeholder="https://… or upload via chat 📎"
                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, boxSizing: 'border-box' as const }} />
                </div>

                <button onClick={applyStyle} disabled={applying || (!bgColor && !bgImageUrl)} style={{
                  width: '100%', padding: '10px', background: applying ? C.border : C.accent,
                  border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: applying ? 'not-allowed' : 'pointer',
                }}>
                  {applying ? '⏳ Saving…' : '✓ Apply Style'}
                </button>
              </div>
            )}

            {/* Move section */}
            {selected?.isSectionLevel && (
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>↕ Move Section</div>
                <div style={{ fontSize: 12, color: C.text3, marginBottom: 10 }}>Drag the ⣿ handle in the preview, or use buttons:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { if (selected.index > 0) { onMove(selected.index, selected.index - 1); showToast('Moving up…') } }}
                    disabled={selected.index === 0}
                    style={{ flex: 1, padding: '8px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 12, cursor: 'pointer', opacity: selected.index === 0 ? 0.4 : 1 }}>
                    ↑ Move Up
                  </button>
                  <button onClick={() => { onMove(selected.index, selected.index + 1); showToast('Moving down…') }}
                    style={{ flex: 1, padding: '8px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 12, cursor: 'pointer' }}>
                    ↓ Move Down
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: C.primary, color: 'white', padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 200 }}>
          {toast}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/\d+/g)
  if (!m || m.length < 3) return ''
  return '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('')
}
