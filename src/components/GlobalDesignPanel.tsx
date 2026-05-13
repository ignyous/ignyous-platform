'use client'
import { designSystem } from '@/lib/designSystem'
import { useState, useEffect } from 'react'

const C = {
  text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
  accent: '#E8651A', primary: '#1a1a4e', gold: '#f3af00',
  green: '#1E7B4B', greenBg: '#F0FAF5',
}

const GOOGLE_FONTS_MODERN   = ['Inter', 'DM Sans', 'Plus Jakarta Sans', 'Outfit', 'Nunito', 'Space Grotesk', 'Syne', 'Satoshi']
const GOOGLE_FONTS_ELEGANT  = ['Playfair Display', 'Cormorant Garamond', 'Libre Baskerville', 'Merriweather', 'Source Serif 4']
const GOOGLE_FONTS_BOLD     = ['Montserrat', 'Oswald', 'Raleway', 'Poppins', 'Nunito Sans']

interface Props {
  siteUrl: string
  apiKey: string
}

export default function GlobalDesignPanel({ siteUrl, apiKey }: Props) {
  const [settings, setSettings]     = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [aiCmd, setAiCmd]           = useState('')
  const [aiRunning, setAiRunning]   = useState(false)
  const [toast, setToast]           = useState('')
  const [edits, setEdits]           = useState<any>({})

  useEffect(() => { load() }, [siteUrl])

  async function load() {
    setLoading(true)
    const r = await fetch(`/api/theme-global?siteUrl=${encodeURIComponent(siteUrl)}&apiKey=${encodeURIComponent(apiKey)}`)
    const d = await r.json()
    if (d.data) { setSettings(d.data); setEdits({}) }
    setLoading(false)
  }

  function edit(key: string, val: string) {
    setEdits((prev: any) => ({ ...prev, [key]: val }))
  }

  const merged = { ...(settings || {}), ...edits }

  async function save() {
    if (Object.keys(edits).length === 0) return
    setSaving(true)
    const r = await fetch('/api/theme-global', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', siteUrl, apiKey, updates: edits }),
    })
    const d = await r.json()
    if (d.success) { showToast('✓ Global styles saved!'); setSettings(merged); setEdits({}) }
    else showToast('⚠ ' + (d.message || 'Save failed'), true)
    setSaving(false)
  }

  async function runAiCommand() {
    if (!aiCmd.trim()) return
    setAiRunning(true)
    const r = await fetch('/api/theme-global', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ai_command', siteUrl, apiKey, command: aiCmd, currentSettings: settings }),
    })
    const d = await r.json()
    if (d.success) {
      showToast(`✦ ${d.explanation || 'Styles updated!'}`)
      setAiCmd('')
      await load()
    } else {
      showToast('⚠ ' + (d.message || 'AI command failed'), true)
    }
    setAiRunning(false)
  }

  function showToast(msg: string, err = false) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  if (loading) return (
    <div style={{ padding: 24, textAlign: 'center', color: C.text3, fontSize: 13 }}>Loading global styles…</div>
  )
  if (!settings) return (
    <div style={{ padding: 24, fontSize: 13, color: C.text3 }}>Could not load theme settings.</div>
  )

  const hasEdits = Object.keys(edits).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Poppins,sans-serif', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>🎨 Global Design</div>
          <div style={{ fontSize: 11, color: C.text3 }}>{settings.builder} theme settings</div>
        </div>
        {hasEdits && (
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', background: saving ? C.border : C.primary, border: 'none', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? '…' : '✓ Save'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

        {/* AI Command */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>✦ AI Style Command</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={aiCmd}
              onChange={e => setAiCmd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runAiCommand()}
              placeholder='e.g. "Change to a more modern font" or "Make it darker and bolder"'
              style={{ flex: 1, padding: '9px 12px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, fontFamily: 'Poppins,sans-serif', outline: 'none' }}
            />
            <button onClick={runAiCommand} disabled={aiRunning || !aiCmd.trim()} style={{ padding: '9px 14px', background: aiRunning ? C.border : C.gold, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#1a1a2e', cursor: aiRunning ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' as const }}>
              {aiRunning ? '⏳' : '→ Apply'}
            </button>
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {['"Use Inter for everything"', '"Bold dark palette"', '"Elegant serif headings"', '"Softer colours"'].map(s => (
              <button key={s} onClick={() => { setAiCmd(s.replace(/"/g, '')); }} style={{ fontSize: 10, padding: '3px 8px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, color: C.text3, cursor: 'pointer' }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>Colours</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'primary_color',          label: 'Primary' },
              { key: 'secondary_color',         label: 'Secondary' },
              { key: 'accent_color',            label: 'Accent' },
              { key: 'text_color',              label: 'Body Text' },
              { key: 'heading_color',           label: 'Headings' },
              { key: 'link_color',              label: 'Links' },
              { key: 'button_background_color', label: 'Button BG' },
              { key: 'button_text_color',       label: 'Button Text' },
            ].map(({ key, label }) => {
              const val = merged[key] || ''
              if (!val) return null
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="color" value={val.startsWith('#') ? val : '#000000'} onChange={e => edit(key, e.target.value)}
                    style={{ width: 36, height: 30, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>{label}</div>
                    <input value={edits[key] ?? val} onChange={e => edit(key, e.target.value)}
                      style={{ fontSize: 11, color: C.text3, background: 'none', border: 'none', outline: 'none', fontFamily: 'monospace', width: '100%', padding: 0 }} />
                  </div>
                  {edits[key] && <span style={{ fontSize: 10, color: C.accent }}>●</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Elementor system colors */}
        {settings.system_colors?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>Elementor System Colours</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {settings.system_colors.map((col: any, i: number) => (
                <div key={i} title={col.title}>
                  <input type="color" value={col.color || '#ffffff'} onChange={e => {
                    const updated = [...settings.system_colors]
                    updated[i] = { ...updated[i], color: e.target.value }
                    setEdits((prev: any) => ({ ...prev, [`system_color_${i}`]: e.target.value, [`_el_color_${i}_title`]: col.title }))
                    setSettings((s: any) => ({ ...s, system_colors: updated }))
                  }}
                    style={{ width: 36, height: 36, border: `2px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                  <div style={{ fontSize: 9, color: C.text3, textAlign: 'center', marginTop: 3, maxWidth: 36, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{col.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Typography */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>Typography</div>

          {[
            { key: 'body_font_family',    label: 'Body Font',    sizeKey: 'body_font_size' },
            { key: 'heading_font_family', label: 'Heading Font', weightKey: 'heading_font_weight' },
          ].map(({ key, label, sizeKey, weightKey }) => {
            const val = merged[key] || ''
            return (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 6 }}>{label}</div>
                <select value={edits[key] ?? val} onChange={e => edit(key, e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, background: C.white, marginBottom: 6, fontFamily: 'Poppins,sans-serif' }}>
                  <option value="">— current: {val} —</option>
                  <optgroup label="Modern / Sans-serif">
                    {GOOGLE_FONTS_MODERN.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                  </optgroup>
                  <optgroup label="Elegant / Serif">
                    {GOOGLE_FONTS_ELEGANT.map(f => <option key={f} value={f}>{f}</option>)}
                  </optgroup>
                  <optgroup label="Bold / Display">
                    {GOOGLE_FONTS_BOLD.map(f => <option key={f} value={f}>{f}</option>)}
                  </optgroup>
                </select>
                {sizeKey && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.text3 }}>Size:</span>
                    <input type="number" value={edits[sizeKey] ?? (merged[sizeKey] || 16)} onChange={e => edit(sizeKey, e.target.value)} min="10" max="24"
                      style={{ width: 60, padding: '5px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, textAlign: 'center' as const }} />
                    <span style={{ fontSize: 11, color: C.text3 }}>px</span>
                  </div>
                )}
                {weightKey && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.text3 }}>Weight:</span>
                    <select value={edits[weightKey] ?? (merged[weightKey] || '700')} onChange={e => edit(weightKey, e.target.value)}
                      style={{ padding: '5px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, background: C.white }}>
                      {['300','400','500','600','700','800','900'].map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Save button at bottom */}
        {hasEdits && (
          <button onClick={save} disabled={saving} style={{ width: '100%', padding: '12px', background: saving ? C.border : C.primary, border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
            {saving ? 'Saving…' : `✓ Save ${Object.keys(edits).length} change${Object.keys(edits).length !== 1 ? 's' : ''}`}
          </button>
        )}
        <button onClick={load} style={{ width: '100%', padding: '8px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text3, fontSize: 11, cursor: 'pointer' }}>
          ↺ Reload from site
        </button>
      </div>

      {toast && (
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, background: toast.startsWith('⚠') ? '#B91C1C' : C.primary, color: 'white', padding: '10px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, zIndex: 100, textAlign: 'center' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
