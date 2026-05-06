'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

interface ScanReport {
  url: string
  scores: { overall: number; seo: number; performance: number; security: number; mobile: number }
  cms: { is_wordpress: boolean; wp_version: string | null; confidence: number; signals: string[] }
  builder: Array<{ id: string; name: string; confidence: number }>
  theme: { name: string | null; slug: string | null; is_child: boolean; parent: string | null } | null
  seo: { title: string; meta_description: string | null; has_h1: boolean; images_without_alt: number }
  performance: { load_time_ms: number; cdn: string; mobile_viewport: boolean }
  security: { https: boolean }
  forms: { count: number }
  recommendations: Array<{ severity: string; category: string; title: string; detail: string }>
  scan_duration_ms: number
}

interface Requirement {
  name: string; required: boolean; description: string; pass: boolean; detail: string
}

interface InstallResult {
  success: boolean; requirements?: Requirement[]; reason?: string; failed?: string[]
  manual_instructions?: any; error?: string; plugin_file?: string
}

function Tag({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const m: Record<string, any> = {
    green: { bg: '#F0FAF5', color: '#1E7B4B', border: '#B8E5CF' },
    red: { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
    yellow: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
    blue: { bg: '#EFF6FF', color: '#1B5FA8', border: '#BFDBFE' },
    orange: { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
    gray: { bg: '#F7F5F2', color: '#6B6056', border: '#E2DDD8' },
  }
  const s = m[color] || m.gray
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: s.bg, color: s.color, border: `1px solid ${s.border}`, display: 'inline-block' }}>{children}</span>
}

function InfoBox({ children, type = 'info' }: { children: React.ReactNode; type?: string }) {
  const m: Record<string, any> = {
    info: { bg: '#EFF6FF', border: '#BFDBFE', color: '#1B5FA8' },
    success: { bg: '#F0FAF5', border: '#B8E5CF', color: '#1E7B4B' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
    error: { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C' },
  }
  const s = m[type] || m.info
  return <div style={{ padding: '13px 16px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 14, lineHeight: 1.6 }}>{children}</div>
}

function ScoreCircle({ score, label, size = 52 }: { score: number; label: string; size?: number }) {
  const color  = score >= 70 ? '#1E7B4B' : score >= 45 ? '#92400E' : '#B91C1C'
  const bg     = score >= 70 ? '#F0FAF5' : score >= 45 ? '#FFFBEB' : '#FEF2F2'
  const border = score >= 70 ? '#B8E5CF' : score >= 45 ? '#FDE68A' : '#FECACA'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `2px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: size > 60 ? 18 : 13, fontWeight: 700, color }}>{score}</span>
      </div>
      <div style={{ fontSize: 11, color: '#A89D94', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function StepBar({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36, overflowX: 'auto', paddingBottom: 4 }}>
      {labels.map((label, i) => {
        const n = i + 1; const done = n < current; const active = n === current
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < labels.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, background: done ? '#1E7B4B' : active ? '#E8651A' : '#F7F5F2', border: `2px solid ${done ? '#1E7B4B' : active ? '#E8651A' : '#E2DDD8'}`, color: done || active ? 'white' : '#A89D94', transition: 'all 0.25s' }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#1A1410' : done ? '#1E7B4B' : '#A89D94', whiteSpace: 'nowrap' as const }}>{label}</span>
            </div>
            {i < labels.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 12px', background: done ? '#1E7B4B' : '#E2DDD8', transition: 'background 0.25s', minWidth: 20 }}/>}
          </div>
        )
      })}
    </div>
  )
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #E2DDD8', borderRadius: 8, background: 'white', color: '#6B6056', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginBottom: 20 }}>
      ← Back
    </button>
  )
}

function ReqRow({ req }: { req: Requirement }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: req.pass ? '#F0FAF5' : req.required ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${req.pass ? '#B8E5CF' : req.required ? '#FECACA' : '#FDE68A'}`, borderRadius: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: req.pass ? '#1E7B4B' : req.required ? '#B91C1C' : '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, marginTop: 1 }}>
        {req.pass ? '✓' : req.required ? '✗' : '!'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1410', marginBottom: 2 }}>
          {req.name}{!req.required && <span style={{ fontSize: 11, fontWeight: 400, color: '#A89D94', marginLeft: 6 }}>(optional)</span>}
        </div>
        <div style={{ fontSize: 13, color: '#6B6056' }}>{req.detail}</div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>{children}</div>
}

function CardHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2DDD8' }}>
      <div style={{ fontSize: 17, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: '#1A1410' }}>{title}</div>
      {sub && <div style={{ fontSize: 14, color: '#6B6056', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function PrimaryBtn({ children, onClick, disabled = false, loading = false }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{ width: '100%', padding: '14px', background: disabled ? '#E2DDD8' : '#E8651A', border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: disabled ? 'none' : '0 2px 8px rgba(232,101,26,0.25)' }}>
      {loading && <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>}
      {children}
    </button>
  )
}

export default function ConnectPage() {
  const router = useRouter()
  const [step, setStep]                     = useState(1)
  const [url, setUrl]                       = useState('')
  const [scanning, setScanning]             = useState(false)
  const [report, setReport]                 = useState<ScanReport | null>(null)
  const [scanError, setScanError]           = useState('')
  const [installMethod, setInstallMethod]   = useState<'auto' | 'manual'>('auto')
  const [wpUser, setWpUser]                 = useState('')
  const [wpPass, setWpPass]                 = useState('')
  const [checking, setChecking]             = useState(false)
  const [requirements, setRequirements]     = useState<Requirement[]>([])
  const [reqChecked, setReqChecked]         = useState(false)
  const [canAutoInstall, setCanAutoInstall] = useState(false)
  const [installing, setInstalling]         = useState(false)
  const [installResult, setInstallResult]   = useState<InstallResult | null>(null)
  const [apiKey, setApiKey]                 = useState('')
  const [verifying, setVerifying]           = useState(false)
  const [verified, setVerified]             = useState(false)
  const [verifyError, setVerifyError]       = useState('')

  const stepLabels = ['Scan Site', 'Review', 'Requirements', 'Install Plugin', 'Connect', 'Manage']
  const siteUrl = url.startsWith('http') ? url : `https://${url}`

  function goBack() { if (step > 1) setStep(s => s - 1) }

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

  async function checkRequirements() {
    if (!wpUser || !wpPass) return
    setChecking(true); setRequirements([]); setReqChecked(false)
    try {
      const res  = await fetch('/api/wordpress/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl, wpUser, wpPass, checkOnly: true }) })
      const data = await res.json()
      const reqs: Requirement[] = data.requirements || []
      setRequirements(reqs); setReqChecked(true)
      setCanAutoInstall(reqs.filter(r => r.required).every(r => r.pass))
    } catch (e: any) { setScanError('Requirements check failed') }
    finally { setChecking(false) }
  }

  async function autoInstall() {
    setInstalling(true); setInstallResult(null)
    try {
      const res  = await fetch('/api/wordpress/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl, wpUser, wpPass }) })
      const data: InstallResult = await res.json()
      setInstallResult(data)
      if (data.success) setTimeout(() => setStep(5), 1200)
    } catch (e: any) { setInstallResult({ success: false, error: e.message }) }
    finally { setInstalling(false) }
  }

  async function verifyConnection() {
    if (!apiKey) return
    setVerifying(true); setVerifyError('')
    try {
      const res  = await fetch('/api/wordpress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl, apiKey, endpoint: 'verify', method: 'GET' }) })
      const data = await res.json()
      if (data.success) { setVerified(true); setTimeout(() => setStep(6), 800) }
      else setVerifyError('Could not connect. Check the API key is saved in WP Admin → Settings → ignyous Bridge.')
    } catch { setVerifyError('Connection failed — is the plugin active?') }
    finally { setVerifying(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2' }}>
      <Nav />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 80px' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, marginBottom: 12, background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: 12, fontWeight: 600, color: '#1B5FA8' }}>◈ Connect Existing Site</div>
          <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 30, fontWeight: 700, color: '#1A1410', marginBottom: 8, lineHeight: 1.2 }}>Connect & take over a WordPress site</h1>
          <p style={{ fontSize: 15, color: '#6B6056', maxWidth: 520, lineHeight: 1.65 }}>Scan any WordPress site, verify requirements, install the bridge plugin, then manage everything with AI.</p>
        </div>

        <StepBar current={step} labels={stepLabels} />

        {/* STEP 1: SCAN */}
        {step === 1 && (
          <Card>
            <CardHead title="Enter the site URL" sub="We'll scan it publicly — no login needed for this step"/>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', border: `2px solid ${scanning ? '#E8651A' : '#E2DDD8'}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ padding: '0 14px', background: '#F7F5F2', borderRight: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', fontSize: 14, color: '#A89D94', flexShrink: 0, fontFamily: 'monospace' }}>https://</div>
                <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && runScan()} placeholder="yourclientsite.com" style={{ flex: 1, border: 'none', padding: '15px 16px', fontSize: 16, color: '#1A1410', fontFamily: 'DM Sans, sans-serif', background: 'white' }}/>
                <button onClick={runScan} disabled={scanning || !url} style={{ padding: '0 28px', background: scanning ? '#C9541A' : '#E8651A', border: 'none', color: 'white', cursor: scanning ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {scanning ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>Scanning…</>) : 'Scan →'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 20 }}>
                <span style={{ fontSize: 13, color: '#A89D94' }}>Try:</span>
                {['josefn21.sg-host.com', 'josefn22.sg-host.com', 'wordpress.org'].map(u => (
                  <button key={u} onClick={() => setUrl(u)} style={{ padding: '4px 12px', border: '1px solid #E2DDD8', borderRadius: 20, background: 'white', color: '#6B6056', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{u}</button>
                ))}
              </div>
              {scanning && (
                <div style={{ padding: '28px', textAlign: 'center' as const, background: '#F7F5F2', borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 14 }}>
                    {[0,1,2,3,4].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: '#E8651A', animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite` }}/>)}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1410' }}>Scanning {url}…</div>
                  <div style={{ fontSize: 13, color: '#A89D94', marginTop: 4 }}>Detecting WordPress, theme, builder, pages, SEO, performance</div>
                </div>
              )}
              {scanError && <InfoBox type="error">⚠ {scanError}</InfoBox>}
              {!scanning && !scanError && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  {[{ icon: '◎', t: 'WordPress version & health' }, { icon: '🎨', t: 'Theme detection (name, parent, child)' }, { icon: '⬡', t: 'Page builder (Elementor, Avada, Divi…)' }, { icon: '◈', t: 'All pages & content structure' }, { icon: '▲', t: 'SEO, performance & security scores' }, { icon: '○', t: 'Forms, analytics & tracking' }].map(item => (
                    <div key={item.t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F7F5F2', borderRadius: 8, fontSize: 14, color: '#6B6056' }}>
                      <span style={{ color: '#E8651A' }}>{item.icon}</span>{item.t}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* STEP 2: REVIEW */}
        {step === 2 && report && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            <BackBtn onClick={goBack}/>
            <Card>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: '#1A1410' }}>{url}</div>
                  <div style={{ fontSize: 13, color: '#6B6056', marginTop: 2 }}>Scanned in {(report.scan_duration_ms / 1000).toFixed(1)}s · {report.cms.is_wordpress ? '✓ WordPress confirmed' : '✗ WordPress not detected'}</div>
                </div>
                {report.cms.is_wordpress ? <Tag color="green">WordPress</Tag> : <Tag color="red">Not WordPress</Tag>}
              </div>
              <div style={{ padding: '20px 24px', background: '#FAFAF8', display: 'flex', gap: 24, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <ScoreCircle score={report.scores.overall} label="Overall" size={72}/>
                <div style={{ width: 1, height: 56, background: '#E2DDD8' }}/>
                <ScoreCircle score={report.scores.seo}         label="SEO"/>
                <ScoreCircle score={report.scores.performance} label="Speed"/>
                <ScoreCircle score={report.scores.security}    label="Security"/>
                <ScoreCircle score={report.scores.mobile}      label="Mobile"/>
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Theme */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#A89D94', marginBottom: 10 }}>🎨 Theme</div>
                {report.theme?.name ? (
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1410', marginBottom: 8 }}>{report.theme.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                      {report.theme.slug && <Tag>{report.theme.slug}</Tag>}
                      {report.theme.is_child && <Tag color="blue">Child Theme</Tag>}
                      {report.theme.parent && <Tag>Parent: {report.theme.parent}</Tag>}
                    </div>
                  </div>
                ) : <div style={{ fontSize: 14, color: '#A89D94' }}>Theme not detected</div>}
              </div>

              {/* Builder */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#A89D94', marginBottom: 10 }}>⬡ Page Builder</div>
                {report.builder.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1410', marginBottom: 8 }}>{report.builder[0].name}</div>
                    <div style={{ display: 'flex', gap: 6 }}>{report.builder.map(b => <Tag key={b.id} color="orange">{b.name} {b.confidence}%</Tag>)}</div>
                  </div>
                ) : <div style={{ fontSize: 14, color: '#A89D94' }}>Gutenberg / custom</div>}
              </div>

              {/* WP Version */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#A89D94', marginBottom: 10 }}>◎ WordPress</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1410', marginBottom: 8 }}>{report.cms.wp_version ? `Version ${report.cms.wp_version}` : 'Detected'}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Tag color={report.cms.is_wordpress ? 'green' : 'red'}>{report.cms.is_wordpress ? '✓ Confirmed' : '✗ Not WordPress'}</Tag>
                  {report.cms.confidence > 0 && <Tag>{report.cms.confidence}% confidence</Tag>}
                </div>
              </div>

              {/* Forms */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#A89D94', marginBottom: 10 }}>○ Contact Forms</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: '#1A1410', marginBottom: 8 }}>{report.forms.count}</div>
                <Tag color={report.forms.count > 0 ? 'green' : 'yellow'}>{report.forms.count > 0 ? 'Forms found' : 'No forms — we can add one'}</Tag>
              </div>
            </div>

            {report.recommendations.length > 0 && (
              <Card>
                <CardHead title={`What ignyous will fix (${report.recommendations.length} issues)`}/>
                <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  {report.recommendations.slice(0, 4).map((rec, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: '#F7F5F2', borderRadius: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: rec.severity === 'high' ? '#B91C1C' : rec.severity === 'medium' ? '#92400E' : '#1E7B4B' }}/>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1410', marginBottom: 3 }}>{rec.title}</div>
                        <div style={{ fontSize: 13, color: '#6B6056', lineHeight: 1.5 }}>{rec.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {!report.cms.is_wordpress && <InfoBox type="warning">⚠ This doesn't appear to be a WordPress site. ignyous Bridge requires WordPress.</InfoBox>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(3)} disabled={!report.cms.is_wordpress} style={{ padding: '13px 32px', background: report.cms.is_wordpress ? '#E8651A' : '#E2DDD8', border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: report.cms.is_wordpress ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans, sans-serif' }}>
                Check requirements →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: REQUIREMENTS */}
        {step === 3 && (
          <div>
            <BackBtn onClick={goBack}/>
            <Card>
              <CardHead title="Requirements check" sub="Enter WP Admin credentials to check if auto-install is possible"/>
              <div style={{ padding: 24 }}>
                <InfoBox type="info">
                  <strong>Why credentials?</strong> We check WP version, REST API access, and admin permissions. Used only for this check and install — never stored.
                </InfoBox>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '20px 0' }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B6056', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>WP Admin Username</label>
                    <input type="text" value={wpUser} onChange={e => setWpUser(e.target.value)} placeholder="admin" style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2DDD8', borderRadius: 9, fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: '#1A1410' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B6056', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>WP Admin Password</label>
                    <input type="password" value={wpPass} onChange={e => setWpPass(e.target.value)} placeholder="••••••••••" style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2DDD8', borderRadius: 9, fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: '#1A1410' }}/>
                  </div>
                </div>
                <PrimaryBtn onClick={checkRequirements} disabled={!wpUser || !wpPass} loading={checking}>
                  {checking ? 'Checking requirements…' : 'Check Requirements →'}
                </PrimaryBtn>

                {requirements.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1410', marginBottom: 12 }}>
                      {canAutoInstall ? '✓ All requirements met — auto-install available' : '⚠ Some requirements failed'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 16 }}>
                      {requirements.map((req, i) => <ReqRow key={i} req={req}/>)}
                    </div>
                    {canAutoInstall ? (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => { setInstallMethod('auto'); setStep(4) }} style={{ flex: 1, padding: '13px', background: '#E8651A', border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Auto-install Plugin →</button>
                        <button onClick={() => { setInstallMethod('manual'); setStep(4) }} style={{ padding: '13px 20px', border: '1.5px solid #E2DDD8', borderRadius: 10, background: 'white', color: '#6B6056', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Manual</button>
                      </div>
                    ) : (
                      <div>
                        <InfoBox type="warning">Auto-install isn't available. Use the manual path — takes about 2 minutes.</InfoBox>
                        <button onClick={() => { setInstallMethod('manual'); setStep(4) }} style={{ marginTop: 12, width: '100%', padding: '13px', background: '#1B5FA8', border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Switch to Manual Install →</button>
                      </div>
                    )}
                  </div>
                )}

                {!reqChecked && !checking && (
                  <div style={{ marginTop: 16, textAlign: 'center' as const }}>
                    <button onClick={() => { setInstallMethod('manual'); setStep(4) }} style={{ background: 'transparent', border: 'none', color: '#A89D94', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'DM Sans, sans-serif' }}>
                      Skip to manual install
                    </button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* STEP 4: INSTALL */}
        {step === 4 && (
          <div>
            <BackBtn onClick={goBack}/>
            <Card>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600, fontFamily: 'Sora, sans-serif', color: '#1A1410' }}>{installMethod === 'auto' ? 'Auto-installing ignyous Bridge' : 'Manual Plugin Install'}</div>
                  <div style={{ fontSize: 14, color: '#6B6056', marginTop: 2 }}>{installMethod === 'auto' ? 'Installing via WordPress REST API' : 'Upload the plugin zip via WP Admin'}</div>
                </div>
                <Tag color={installMethod === 'auto' ? 'orange' : 'blue'}>{installMethod === 'auto' ? 'Auto' : 'Manual'}</Tag>
              </div>
              <div style={{ padding: 24 }}>

                {installMethod === 'auto' && (
                  <div>
                    {!installResult && !installing && (
                      <div>
                        <InfoBox type="info">Using your credentials to install ignyous Bridge on <strong>{url}</strong>. Takes 15–30 seconds.</InfoBox>
                        <div style={{ marginTop: 16 }}>
                          <PrimaryBtn onClick={autoInstall}>Install Plugin Now →</PrimaryBtn>
                        </div>
                      </div>
                    )}
                    {installing && (
                      <div style={{ padding: '40px', textAlign: 'center' as const, background: '#F7F5F2', borderRadius: 12 }}>
                        <div style={{ width: 48, height: 48, border: '3px solid #FED7AA', borderTopColor: '#E8651A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }}/>
                        <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1410', marginBottom: 6 }}>Installing ignyous Bridge…</div>
                        <div style={{ fontSize: 13, color: '#A89D94' }}>Connecting to WordPress and uploading plugin</div>
                      </div>
                    )}
                    {installResult && !installing && (
                      <div>
                        {installResult.success ? (
                          <div style={{ padding: '24px', background: '#F0FAF5', border: '1px solid #B8E5CF', borderRadius: 12, textAlign: 'center' as const, marginBottom: 16 }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                            <div style={{ fontSize: 17, fontWeight: 600, color: '#1E7B4B', marginBottom: 4 }}>Plugin installed!</div>
                            <div style={{ fontSize: 14, color: '#6B6056' }}>ignyous Bridge is active on {url}</div>
                          </div>
                        ) : (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ padding: '16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, marginBottom: 14 }}>
                              <div style={{ fontSize: 15, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>Auto-install failed</div>
                              <div style={{ fontSize: 13, color: '#6B6056' }}>{installResult.error}</div>
                            </div>
                            {installResult.manual_instructions?.steps && (
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1410', marginBottom: 8 }}>Manual steps:</div>
                                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                                  {installResult.manual_instructions.steps.map((s: string, i: number) => (
                                    <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: '#F7F5F2', borderRadius: 8 }}>
                                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#E8651A', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i+1}</div>
                                      <div style={{ fontSize: 14, color: '#1A1410', lineHeight: 1.5 }}>{s}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {installMethod === 'manual' && (
                  <div>
                    <InfoBox type="info">Download the plugin zip and install via WP Admin. Takes about 2 minutes.</InfoBox>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginTop: 16 }}>
                      {[
                        { n: 1, text: 'Download the ignyous Bridge plugin zip', extra: <a href="/api/plugin/bridge.zip" style={{ padding: '7px 14px', background: '#E8651A', borderRadius: 7, color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>↓ Download</a> },
                        { n: 2, text: `Open ${siteUrl}/wp-admin → Plugins → Add New → Upload Plugin`, extra: <a href={`${siteUrl}/wp-admin/plugin-install.php`} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', border: '1px solid #E2DDD8', borderRadius: 7, color: '#6B6056', textDecoration: 'none', fontSize: 13, flexShrink: 0 }}>Open ↗</a> },
                        { n: 3, text: 'Upload ignyous-bridge.zip → Install Now → Activate Plugin' },
                        { n: 4, text: 'Settings → Permalinks → Post name → Save Changes' },
                        { n: 5, text: 'Settings → ignyous Bridge → paste your API key → Save' },
                      ].map(step => (
                        <div key={step.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E8651A', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{step.n}</div>
                          <div style={{ flex: 1, fontSize: 14, color: '#1A1410', lineHeight: 1.5 }}>{step.text}</div>
                          {step.extra && step.extra}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 20 }}>
                  <button onClick={() => setStep(5)} style={{ width: '100%', padding: '14px', background: '#1E7B4B', border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    Plugin is installed — Continue →
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* STEP 5: CONNECT */}
        {step === 5 && (
          <div>
            <BackBtn onClick={goBack}/>
            <Card>
              <CardHead title="Enter your API key" sub="From WP Admin → Settings → ignyous Bridge"/>
              <div style={{ padding: 24 }}>
                <InfoBox type="info">
                  In WP Admin → <strong>Settings → ignyous Bridge</strong>, generate a key with <code style={{ background: '#F7F5F2', padding: '1px 6px', borderRadius: 4, fontSize: 13 }}>openssl rand -hex 32</code>, paste it in the API Key field, save. Then paste it below.
                </InfoBox>
                <div style={{ margin: '20px 0' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#6B6056', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>API KEY</label>
                  <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="a7f3c9b2e4d8f1a6c3e9b5d2f7a4c8e1…" style={{ width: '100%', padding: '13px 16px', border: '1.5px solid #E2DDD8', borderRadius: 10, fontSize: 15, fontFamily: 'monospace', color: '#1A1410', background: 'white', marginBottom: 12 }}/>
                  {verifyError && <div style={{ padding: '11px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', fontSize: 13, marginBottom: 12 }}>⚠ {verifyError}</div>}
                  {verified && <div style={{ padding: '12px 16px', background: '#F0FAF5', border: '1px solid #B8E5CF', borderRadius: 8, color: '#1E7B4B', fontSize: 14, fontWeight: 500, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>✓ Connected! Opening dashboard…</div>}
                  <button onClick={verifyConnection} disabled={verifying || !apiKey || verified} style={{ width: '100%', padding: '14px', background: verified ? '#1E7B4B' : '#E8651A', border: 'none', borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {verifying ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>Verifying…</>) : verified ? '✓ Connected!' : 'Verify & Connect →'}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* STEP 6: SUCCESS */}
        {step === 6 && (
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 20, padding: '48px 40px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FAF5', border: '2px solid #B8E5CF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>✓</div>
              <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: 26, fontWeight: 700, marginBottom: 10, color: '#1A1410' }}>{url} is connected!</h2>
              <p style={{ fontSize: 15, color: '#6B6056', marginBottom: 32, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 32px' }}>
                ignyous Bridge is live. You can now manage this site's content, plugins, and design through plain English chat.
              </p>
              <button onClick={() => router.push(`/dashboard?site=${encodeURIComponent(url)}&key=${encodeURIComponent(apiKey)}`)} style={{ padding: '15px 48px', background: '#E8651A', border: 'none', borderRadius: 12, color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif', boxShadow: '0 4px 16px rgba(232,101,26,0.3)' }}>
                Open Site Dashboard →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}