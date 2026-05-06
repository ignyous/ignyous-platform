'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

interface ScanReport {
  url: string; scan_duration_ms: number
  scores: { overall: number; seo: number; performance: number; security: number; mobile: number }
  cms: { is_wordpress: boolean; wp_version: string | null; confidence: number; signals: string[] }
  builder: Array<{ id: string; name: string; confidence: number }>
  theme: { name: string | null; slug: string | null; is_child: boolean; parent: string | null } | null
  forms: { count: number }
  recommendations: Array<{ severity: string; category: string; title: string; detail: string }>
}

interface Requirement {
  name: string; required: boolean; pass: boolean; detail: string
}

// ─── Tiny helpers ────────────────────────────────────────────────
const c = {
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  blue: '#1B5FA8', blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
  text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
}

function Tag({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const m: Record<string, any> = {
    green: { bg: c.greenBg, tc: c.green, border: c.greenBorder },
    red: { bg: c.redBg, tc: c.red, border: c.redBorder },
    yellow: { bg: c.yellowBg, tc: c.yellow, border: c.yellowBorder },
    blue: { bg: c.blueBg, tc: c.blue, border: c.blueBorder },
    orange: { bg: c.accentDim, tc: c.accent, border: c.accentBorder },
    gray: { bg: c.surface, tc: c.text2, border: c.border },
  }
  const s = m[color] || m.gray
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: s.bg, color: s.tc, border: `1px solid ${s.border}`, display: 'inline-block' }}>{children}</span>
}

function InfoBox({ children, type = 'info' }: { children: React.ReactNode; type?: string }) {
  const m: Record<string, any> = {
    info: { bg: c.blueBg, border: c.blueBorder, tc: c.blue },
    success: { bg: c.greenBg, border: c.greenBorder, tc: c.green },
    warning: { bg: c.yellowBg, border: c.yellowBorder, tc: c.yellow },
    error: { bg: c.redBg, border: c.redBorder, tc: c.red },
  }
  const s = m[type] || m.info
  return <div style={{ padding: '13px 16px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, color: s.tc, fontSize: 14, lineHeight: 1.6 }}>{children}</div>
}

function ScoreRing({ score, label, size = 52 }: { score: number; label: string; size?: number }) {
  const col = score >= 70 ? c.green : score >= 45 ? c.yellow : c.red
  const bg  = score >= 70 ? c.greenBg : score >= 45 ? c.yellowBg : c.redBg
  const bor = score >= 70 ? c.greenBorder : score >= 45 ? c.yellowBorder : c.redBorder
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `2px solid ${bor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px' }}>
        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: size > 60 ? 18 : 13, fontWeight: 700, color: col }}>{score}</span>
      </div>
      <div style={{ fontSize: 11, color: c.text3, fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function StepBar({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, overflowX: 'auto', paddingBottom: 2 }}>
      {labels.map((label, i) => {
        const n = i + 1; const done = n < current; const active = n === current
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < labels.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: done ? c.green : active ? c.accent : c.surface, border: `2px solid ${done ? c.green : active ? c.accent : c.border}`, color: done || active ? 'white' : c.text3, transition: 'all 0.2s' }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? c.text : done ? c.green : c.text3, whiteSpace: 'nowrap' as const }}>{label}</span>
            </div>
            {i < labels.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 10px', background: done ? c.green : c.border, transition: 'background 0.2s', minWidth: 16 }}/>}
          </div>
        )
      })}
    </div>
  )
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: `1px solid ${c.border}`, borderRadius: 8, background: c.white, color: c.text2, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginBottom: 18 }}>
      ← Back
    </button>
  )
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', ...style }}>{children}</div>
}

function CardHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ padding: '18px 24px', borderBottom: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 17, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: c.text }}>{title}</div>
      {sub && <div style={{ fontSize: 14, color: c.text2, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 12, fontWeight: 600, color: c.text2, display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{children}</label>
}

function TextInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${c.border}`, borderRadius: 9, fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: c.text, background: c.white }}/>
}

function PrimaryBtn({ children, onClick, disabled = false, loading = false, color = c.accent }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; color?: string }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{ width: '100%', padding: '13px', background: disabled ? c.border : color, border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {loading && <div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>}
      {children}
    </button>
  )
}

function Spinner({ size = 16 }: { size?: number }) {
  return <div style={{ width: size, height: size, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function ConnectPage() {
  const router = useRouter()

  const [step, setStep]                     = useState(1)
  const [url, setUrl]                       = useState('')
  const [scanning, setScanning]             = useState(false)
  const [report, setReport]                 = useState<ScanReport | null>(null)
  const [scanError, setScanError]           = useState('')

  // Install step
  const [installMethod, setInstallMethod]   = useState<'manual' | 'auto'>('manual')
  const [wpUser, setWpUser]                 = useState('')
  const [wpPass, setWpPass]                 = useState('')
  const [checking, setChecking]             = useState(false)
  const [requirements, setRequirements]     = useState<Requirement[]>([])
  const [canAutoInstall, setCanAutoInstall] = useState(false)
  const [autoChecked, setAutoChecked]       = useState(false)
  const [installing, setInstalling]         = useState(false)
  const [installError, setInstallError]     = useState('')
  const [installDone, setInstallDone]       = useState(false)

  // Connect step
  const [apiKey, setApiKey]                 = useState('')
  const [verifying, setVerifying]           = useState(false)
  const [verified, setVerified]             = useState(false)
  const [verifyError, setVerifyError]       = useState('')

  const stepLabels = ['Scan Site', 'Review', 'Install Plugin', 'Connect & Verify', 'Manage']
  const siteUrl    = url.startsWith('http') ? url : `https://${url}`

  // ── SCAN ───────────────────────────────────────────────────────
  async function runScan() {
    if (!url) return
    setScanning(true); setScanError(''); setReport(null)
    try {
      const res  = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: siteUrl }) })
      const data = await res.json()
      if (data.success && data.report) { setReport(data.report); setStep(2) }
      else setScanError(data.error || 'Could not reach that site. Check the URL and try again.')
    } catch { setScanError('Connection failed — check the URL') }
    finally { setScanning(false) }
  }

  // ── CHECK AUTO-INSTALL REQUIREMENTS ────────────────────────────
  async function checkRequirements() {
    if (!wpUser || !wpPass) return
    setChecking(true); setRequirements([]); setAutoChecked(false)
    try {
      const res  = await fetch('/api/wordpress/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl, wpUser, wpPass, checkOnly: true }) })
      const data = await res.json()
      const reqs: Requirement[] = data.requirements || []
      setRequirements(reqs)
      setAutoChecked(true)
      setCanAutoInstall(reqs.filter(r => r.required).every(r => r.pass))
    } catch { setInstallError('Requirements check failed. Try manual install.') }
    finally { setChecking(false) }
  }

  // ── AUTO INSTALL ───────────────────────────────────────────────
  async function autoInstall() {
    setInstalling(true); setInstallError('')
    try {
      const res  = await fetch('/api/wordpress/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl, wpUser, wpPass }) })
      const data = await res.json()
      if (data.success) { setInstallDone(true) }
      else setInstallError(data.error || 'Installation failed. Switch to manual install.')
    } catch (e: any) { setInstallError(e.message) }
    finally { setInstalling(false) }
  }

  // ── VERIFY ─────────────────────────────────────────────────────
  async function verifyConnection() {
    if (!apiKey) return
    setVerifying(true); setVerifyError('')
    try {
      const res  = await fetch('/api/wordpress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl, apiKey, endpoint: 'verify', method: 'GET' }) })
      const data = await res.json()
      if (data.success) { setVerified(true); setTimeout(() => setStep(5), 900) }
      else setVerifyError('Could not connect. Check the API key is saved in WP Admin → Settings → ignyous Bridge.')
    } catch { setVerifyError('Connection failed — is the plugin active and permalinks saved?') }
    finally { setVerifying(false) }
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: c.surface }}>
      <Nav/>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, marginBottom: 12, background: c.blueBg, border: `1px solid ${c.blueBorder}`, fontSize: 12, fontWeight: 600, color: c.blue }}>◈ Connect Existing Site</div>
          <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 30, fontWeight: 700, color: c.text, marginBottom: 8, lineHeight: 1.2 }}>Connect & manage a WordPress site</h1>
          <p style={{ fontSize: 15, color: c.text2, maxWidth: 520, lineHeight: 1.65 }}>Scan any WordPress site, install the ignyous bridge plugin, then manage everything with AI.</p>
        </div>

        <StepBar current={step} labels={stepLabels}/>

        {/* ════ STEP 1: SCAN ════ */}
        {step === 1 && (
          <Card>
            <CardHead title="Enter the site URL" sub="We'll scan it publicly — no login needed for this step"/>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', border: `2px solid ${scanning ? c.accent : c.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14, transition: 'border-color 0.2s' }}>
                <div style={{ padding: '0 14px', background: c.surface, borderRight: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', fontSize: 14, color: c.text3, flexShrink: 0, fontFamily: 'monospace' }}>https://</div>
                <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && runScan()} placeholder="yourclientsite.com" style={{ flex: 1, border: 'none', padding: '15px 16px', fontSize: 16, color: c.text, fontFamily: 'DM Sans, sans-serif', background: 'white' }}/>
                <button onClick={runScan} disabled={scanning || !url} style={{ padding: '0 28px', background: scanning ? '#C9541A' : c.accent, border: 'none', color: 'white', cursor: scanning ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {scanning ? (<><Spinner/>Scanning…</>) : 'Scan Site →'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 20 }}>
                <span style={{ fontSize: 13, color: c.text3 }}>Try:</span>
                {['josefn21.sg-host.com', 'josefn22.sg-host.com', 'wordpress.org'].map(u => (
                  <button key={u} onClick={() => setUrl(u)} style={{ padding: '4px 12px', border: `1px solid ${c.border}`, borderRadius: 20, background: c.white, color: c.text2, fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{u}</button>
                ))}
              </div>

              {scanning && (
                <div style={{ padding: '28px', textAlign: 'center' as const, background: c.surface, borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 14 }}>
                    {[0,1,2,3,4].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c.accent, animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite` }}/>)}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: c.text }}>Scanning {url}…</div>
                  <div style={{ fontSize: 13, color: c.text3, marginTop: 4 }}>Detecting WordPress, theme, builder, pages, SEO, performance</div>
                </div>
              )}

              {scanError && <InfoBox type="error">⚠ {scanError}</InfoBox>}

              {!scanning && !scanError && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[{ icon: '◎', t: 'WordPress version & health' }, { icon: '🎨', t: 'Theme (name, slug, parent/child)' }, { icon: '⬡', t: 'Page builder detection' }, { icon: '◈', t: 'All pages & content structure' }, { icon: '▲', t: 'SEO, speed & security scores' }, { icon: '○', t: 'Forms, analytics & plugins' }].map(item => (
                    <div key={item.t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: c.surface, borderRadius: 8, fontSize: 14, color: c.text2 }}>
                      <span style={{ color: c.accent, flexShrink: 0 }}>{item.icon}</span>{item.t}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ════ STEP 2: REVIEW ════ */}
        {step === 2 && report && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16, animation: 'fadeIn 0.3s ease' }}>
            <BackBtn onClick={() => setStep(1)}/>

            <Card>
              <div style={{ padding: '18px 24px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: c.text }}>{url}</div>
                  <div style={{ fontSize: 13, color: c.text2, marginTop: 2 }}>Scanned in {(report.scan_duration_ms/1000).toFixed(1)}s · {report.cms.is_wordpress ? '✓ WordPress confirmed' : '✗ WordPress not detected'}</div>
                </div>
                <Tag color={report.cms.is_wordpress ? 'green' : 'red'}>{report.cms.is_wordpress ? '✓ WordPress' : '✗ Not WordPress'}</Tag>
              </div>
              <div style={{ padding: '20px 24px', background: '#FAFAF8', display: 'flex', gap: 24, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <ScoreRing score={report.scores.overall} label="Overall" size={72}/>
                <div style={{ width: 1, height: 56, background: c.border }}/>
                <ScoreRing score={report.scores.seo}         label="SEO"/>
                <ScoreRing score={report.scores.performance} label="Speed"/>
                <ScoreRing score={report.scores.security}    label="Security"/>
                <ScoreRing score={report.scores.mobile}      label="Mobile"/>
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: c.text3, marginBottom: 10 }}>🎨 Theme</div>
                {report.theme?.name ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 600, color: c.text, marginBottom: 8 }}>{report.theme.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                      {report.theme.slug && <Tag>{report.theme.slug}</Tag>}
                      {report.theme.is_child && <Tag color="blue">Child Theme</Tag>}
                      {report.theme.parent && <Tag>Parent: {report.theme.parent}</Tag>}
                    </div>
                  </>
                ) : <div style={{ fontSize: 14, color: c.text3 }}>Theme not detected</div>}
              </div>

              <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: c.text3, marginBottom: 10 }}>⬡ Page Builder</div>
                {report.builder.length > 0 ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 600, color: c.text, marginBottom: 8 }}>{report.builder[0].name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>{report.builder.map(b => <Tag key={b.id} color="orange">{b.name} {b.confidence}%</Tag>)}</div>
                  </>
                ) : <div style={{ fontSize: 14, color: c.text3 }}>Gutenberg / custom</div>}
              </div>

              <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: c.text3, marginBottom: 10 }}>◎ WordPress</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: c.text, marginBottom: 8 }}>{report.cms.wp_version ? `Version ${report.cms.wp_version}` : 'Detected'}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Tag color={report.cms.is_wordpress ? 'green' : 'red'}>{report.cms.is_wordpress ? '✓ Confirmed' : '✗ Not WordPress'}</Tag>
                  {report.cms.confidence > 0 && <Tag>{report.cms.confidence}% confidence</Tag>}
                </div>
              </div>

              <div style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: c.text3, marginBottom: 10 }}>○ Contact Forms</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: c.text, marginBottom: 8 }}>{report.forms.count}</div>
                <Tag color={report.forms.count > 0 ? 'green' : 'yellow'}>{report.forms.count > 0 ? 'Forms found' : 'No forms — we can add one'}</Tag>
              </div>
            </div>

            {report.recommendations.length > 0 && (
              <Card>
                <CardHead title={`What ignyous will fix (${report.recommendations.length} issues)`}/>
                <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  {report.recommendations.slice(0, 4).map((rec, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: c.surface, borderRadius: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: rec.severity === 'high' ? c.red : rec.severity === 'medium' ? c.yellow : c.green }}/>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: c.text, marginBottom: 3 }}>{rec.title}</div>
                        <div style={{ fontSize: 13, color: c.text2, lineHeight: 1.5 }}>{rec.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {!report.cms.is_wordpress && <InfoBox type="warning">⚠ This doesn't appear to be a WordPress site. ignyous Bridge requires WordPress.</InfoBox>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(3)} disabled={!report.cms.is_wordpress} style={{ padding: '13px 32px', background: report.cms.is_wordpress ? c.accent : c.border, border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: report.cms.is_wordpress ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans, sans-serif', boxShadow: report.cms.is_wordpress ? `0 2px 8px rgba(232,101,26,0.3)` : 'none' }}>
                Install the plugin →
              </button>
            </div>
          </div>
        )}

        {/* ════ STEP 3: INSTALL — SIDE BY SIDE ════ */}
        {step === 3 && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <BackBtn onClick={() => setStep(2)}/>

            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 700, color: c.text, marginBottom: 6 }}>Install ignyous Bridge plugin</h2>
              <p style={{ fontSize: 15, color: c.text2, lineHeight: 1.6 }}>Choose how you want to install the plugin on <strong>{url}</strong>. Manual is the most reliable — auto-install works if your site meets certain requirements.</p>
            </div>

            {/* Side by side install options */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

              {/* MANUAL — highlighted by default */}
              <div
                onClick={() => setInstallMethod('manual')}
                style={{
                  border: `2px solid ${installMethod === 'manual' ? c.accent : c.border}`,
                  borderRadius: 18, background: installMethod === 'manual' ? '#FFFAF7' : c.white,
                  cursor: 'pointer', overflow: 'hidden', transition: 'all 0.2s',
                  boxShadow: installMethod === 'manual' ? '0 4px 16px rgba(232,101,26,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${installMethod === 'manual' ? c.accentBorder : c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: installMethod === 'manual' ? c.accentDim : c.surface }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: installMethod === 'manual' ? c.accent : c.text }}>📦 Manual Install</div>
                  {installMethod === 'manual' && (
                    <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: c.accent, color: 'white' }}>Selected</div>
                  )}
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <p style={{ fontSize: 13, color: c.text2, lineHeight: 1.6, marginBottom: 14 }}>
                    Download the plugin zip and upload it via WP Admin. Works on <strong>every WordPress site</strong> regardless of settings or version.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                    {['Works on all WordPress sites', 'No credentials needed', 'Takes about 2 minutes', 'Most reliable method'].map(item => (
                      <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: c.text2 }}>
                        <span style={{ color: c.green, fontSize: 12, fontWeight: 700 }}>✓</span>{item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AUTO */}
              <div
                onClick={() => setInstallMethod('auto')}
                style={{
                  border: `2px solid ${installMethod === 'auto' ? c.blue : c.border}`,
                  borderRadius: 18, background: installMethod === 'auto' ? '#F8FAFF' : c.white,
                  cursor: 'pointer', overflow: 'hidden', transition: 'all 0.2s',
                  boxShadow: installMethod === 'auto' ? `0 4px 16px rgba(27,95,168,0.1)` : '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${installMethod === 'auto' ? c.blueBorder : c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: installMethod === 'auto' ? c.blueBg : c.surface }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: installMethod === 'auto' ? c.blue : c.text }}>⚡ Auto Install</div>
                  {installMethod === 'auto' && (
                    <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: c.blue, color: 'white' }}>Selected</div>
                  )}
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <p style={{ fontSize: 13, color: c.text2, lineHeight: 1.6, marginBottom: 14 }}>
                    Enter your WP Admin credentials and ignyous installs the plugin automatically. Requires WordPress 5.6+ and Application Passwords enabled.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                    {['Hands-free installation', 'Requires WP admin credentials', 'WordPress 5.6+ required', 'Checks requirements first'].map(item => (
                      <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: c.text2 }}>
                        <span style={{ color: c.blue, fontSize: 12, fontWeight: 700 }}>→</span>{item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* MANUAL CONTENT */}
            {installMethod === 'manual' && (
              <Card>
                <CardHead title="Manual install steps" sub="Upload the plugin zip directly to WordPress"/>
                <div style={{ padding: 24 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 20 }}>
                    {[
                      { n: 1, text: 'Download the ignyous Bridge plugin zip', action: <a href="/api/plugin/bridge.zip" download style={{ padding: '8px 16px', background: c.accent, borderRadius: 8, color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600, flexShrink: 0, display: 'inline-block' }}>↓ Download zip</a> },
                      { n: 2, text: `Open WP Admin → Plugins → Add New → Upload Plugin`, action: <a href={`${siteUrl}/wp-admin/plugin-install.php`} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text2, textDecoration: 'none', fontSize: 13, flexShrink: 0, display: 'inline-block' }}>Open WP Admin ↗</a> },
                      { n: 3, text: 'Click "Upload Plugin" → choose ignyous-bridge.zip → Install Now → Activate Plugin' },
                      { n: 4, text: 'Go to Settings → Permalinks → select "Post name" → Save Changes (required for REST API)' },
                      { n: 5, text: 'Go to Settings → ignyous Bridge → you\'ll see your connect secret. Come back and click "I\'ve installed the plugin" below.' },
                    ].map(step => (
                      <div key={step.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.accent, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{step.n}</div>
                        <div style={{ flex: 1, fontSize: 14, color: c.text, lineHeight: 1.55 }}>{step.text}</div>
                        {step.action && step.action}
                      </div>
                    ))}
                  </div>
                  <InfoBox type="success">
                    💡 <strong>Service account created automatically:</strong> When you activate the plugin, ignyous creates a dedicated <code style={{ background: c.greenBg, padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>ignyous-service</code> admin account. You'll see it in WP Admin → Users. This is how ignyous manages your site without needing your personal credentials.
                  </InfoBox>
                  <div style={{ marginTop: 16 }}>
                    <PrimaryBtn onClick={() => setStep(4)}>I've installed and activated the plugin →</PrimaryBtn>
                  </div>
                </div>
              </Card>
            )}

            {/* AUTO CONTENT */}
            {installMethod === 'auto' && (
              <Card>
                <CardHead title="Auto install" sub="Enter your WP Admin credentials to check and install"/>
                <div style={{ padding: 24 }}>
                  <InfoBox type="info">
                    We'll check if your site meets the requirements, then install and activate the plugin automatically. We recommend using a <strong>WordPress Application Password</strong> instead of your regular password — generate one in WP Admin → Users → Profile → Application Passwords.
                  </InfoBox>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '20px 0' }}>
                    <div><FieldLabel>WP Admin Username or Email</FieldLabel><TextInput value={wpUser} onChange={setWpUser} placeholder="admin or you@email.com"/></div>
                    <div><FieldLabel>Password or Application Password</FieldLabel><TextInput value={wpPass} onChange={setWpPass} type="password" placeholder="•••• •••• •••• ••••"/></div>
                  </div>

                  {/* Step 1: Check requirements */}
                  {!autoChecked && (
                    <PrimaryBtn onClick={checkRequirements} disabled={!wpUser || !wpPass} loading={checking} color={c.blue}>
                      {checking ? 'Checking requirements…' : 'Check Requirements →'}
                    </PrimaryBtn>
                  )}

                  {/* Requirements results */}
                  {requirements.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 10 }}>
                        {canAutoInstall ? '✓ All requirements met' : '⚠ Some requirements failed'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 16 }}>
                        {requirements.map((req, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', background: req.pass ? c.greenBg : req.required ? c.redBg : c.yellowBg, border: `1px solid ${req.pass ? c.greenBorder : req.required ? c.redBorder : c.yellowBorder}`, borderRadius: 10 }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: req.pass ? c.green : req.required ? c.red : c.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700 }}>
                              {req.pass ? '✓' : req.required ? '✗' : '!'}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{req.name}{!req.required && <span style={{ fontSize: 11, fontWeight: 400, color: c.text3, marginLeft: 6 }}>(optional)</span>}</div>
                              <div style={{ fontSize: 12, color: c.text2, marginTop: 2 }}>{req.detail}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {canAutoInstall && !installDone && (
                        <PrimaryBtn onClick={autoInstall} loading={installing} color={c.blue}>
                          {installing ? 'Installing plugin…' : 'Install Plugin Automatically →'}
                        </PrimaryBtn>
                      )}

                      {installError && (
                        <div style={{ marginTop: 12 }}>
                          <InfoBox type="error">⚠ {installError}</InfoBox>
                          <button onClick={() => setInstallMethod('manual')} style={{ marginTop: 10, width: '100%', padding: '12px', background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, color: c.text2, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                            Switch to Manual Install →
                          </button>
                        </div>
                      )}

                      {!canAutoInstall && (
                        <div style={{ marginTop: 4 }}>
                          <InfoBox type="warning">Auto-install isn't available for this site. Switch to manual install — it takes 2 minutes and always works.</InfoBox>
                          <button onClick={() => setInstallMethod('manual')} style={{ marginTop: 12, width: '100%', padding: '13px', background: c.accent, border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                            Switch to Manual Install →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {installDone && (
                    <div style={{ marginTop: 16 }}>
                      <InfoBox type="success">✓ Plugin installed and activated on {url}. A dedicated ignyous-service admin account was also created.</InfoBox>
                      <div style={{ marginTop: 14 }}>
                        <PrimaryBtn onClick={() => setStep(4)}>Continue to Connect →</PrimaryBtn>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ════ STEP 4: CONNECT ════ */}
        {step === 4 && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <BackBtn onClick={() => setStep(3)}/>
            <Card>
              <CardHead title="Enter your API key" sub="From WP Admin → Settings → ignyous Bridge"/>
              <div style={{ padding: 24 }}>
                <InfoBox type="info">
                  In WP Admin → <strong>Settings → ignyous Bridge</strong>:<br/>
                  Run <code style={{ background: c.surface, padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>openssl rand -hex 32</code> in your terminal, paste the result as the API Key, and click Save Settings. Then paste that same key below.
                </InfoBox>

                <div style={{ margin: '20px 0' }}>
                  <FieldLabel>API KEY</FieldLabel>
                  <input
                    type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
                    placeholder="a7f3c9b2e4d8f1a6c3e9b5d2f7a4c8e1b6d3f9a2c5e8b1d4…"
                    style={{ width: '100%', padding: '13px 16px', border: `1.5px solid ${c.border}`, borderRadius: 10, fontSize: 14, fontFamily: 'monospace', color: c.text, background: 'white', marginBottom: 12 }}
                  />

                  {verifyError && <div style={{ padding: '11px 14px', background: c.redBg, border: `1px solid ${c.redBorder}`, borderRadius: 8, color: c.red, fontSize: 13, marginBottom: 12 }}>⚠ {verifyError}</div>}
                  {verified && <div style={{ padding: '12px 16px', background: c.greenBg, border: `1px solid ${c.greenBorder}`, borderRadius: 8, color: c.green, fontSize: 14, fontWeight: 500, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>✓ Connected! Opening dashboard…</div>}

                  <button onClick={verifyConnection} disabled={verifying || !apiKey || verified} style={{ width: '100%', padding: '14px', background: verified ? c.green : c.accent, border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {verifying ? (<><Spinner/>Verifying…</>) : verified ? '✓ Connected!' : 'Verify & Connect →'}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ════ STEP 5: SUCCESS ════ */}
        {step === 5 && (
          <div style={{ textAlign: 'center' as const, animation: 'fadeIn 0.3s ease' }}>
            <Card style={{ padding: '48px 40px' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: c.greenBg, border: `2px solid ${c.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>✓</div>
              <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: 26, fontWeight: 700, marginBottom: 10, color: c.text }}>{url} is connected!</h2>
              <p style={{ fontSize: 15, color: c.text2, marginBottom: 32, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 32px' }}>
                ignyous Bridge is live. Manage this site's content, plugins, and design through plain English chat — no WP Admin needed.
              </p>
              <button onClick={() => router.push(`/dashboard?site=${encodeURIComponent(url)}&key=${encodeURIComponent(apiKey)}`)} style={{ padding: '15px 48px', background: c.accent, border: 'none', borderRadius: 12, color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif', boxShadow: '0 4px 16px rgba(232,101,26,0.3)' }}>
                Open Site Dashboard →
              </button>
            </Card>
          </div>
        )}

      </div>
    </div>
  )
}