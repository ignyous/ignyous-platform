'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

// ── localStorage helpers ──────────────────────────────────────────
function saveConnection(siteUrl: string, apiKey: string) {
  try {
    const key = `ignyous_conn_${siteUrl.replace(/[^a-z0-9]/gi, '_')}`
    localStorage.setItem(key, JSON.stringify({ apiKey, savedAt: Date.now() }))
    // Also keep a list of all connected sites
    const list = JSON.parse(localStorage.getItem('ignyous_sites') || '[]')
    if (!list.includes(siteUrl)) list.unshift(siteUrl)
    localStorage.setItem('ignyous_sites', JSON.stringify(list.slice(0, 20)))
  } catch {}
}

export function getStoredKey(siteUrl: string): string {
  try {
    const key  = `ignyous_conn_${siteUrl.replace(/[^a-z0-9]/gi, '_')}`
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    return data.apiKey || ''
  } catch { return '' }
}

// ─── Design ──────────────────────────────────────────────────────
const C = {
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  blue: '#1B5FA8', blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
  text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
}

function StepBar({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, overflowX: 'auto' as const }}>
      {labels.map((label, i) => {
        const n = i + 1; const done = n < current; const active = n === current
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < labels.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, background: done ? C.green : active ? C.accent : C.surface, border: `2px solid ${done ? C.green : active ? C.accent : C.border}`, color: done || active ? 'white' : C.text3, transition: 'all 0.2s' }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: 14, fontWeight: active ? 600 : 400, color: active ? C.text : done ? C.green : C.text3, whiteSpace: 'nowrap' as const }}>{label}</span>
            </div>
            {i < labels.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 10px', background: done ? C.green : C.border, minWidth: 16 }}/>}
          </div>
        )
      })}
    </div>
  )
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', marginBottom: 18 }}>
      ← Back
    </button>
  )
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', ...style }}>{children}</div>
}

function Spinner({ color = C.accent }: { color?: string }) {
  return <div style={{ width: 18, height: 18, border: `2.5px solid ${color}33`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }}/>
}

// ─── MAIN ─────────────────────────────────────────────────────────
export default function ConnectPage() {
  const router = useRouter()

  const [step, setStep]           = useState(1)
  const [url, setUrl]             = useState('')
  const [scanning, setScanning]   = useState(false)
  const [report, setReport]       = useState<any>(null)
  const [scanError, setScanError] = useState('')

  const [pluginStatus, setPluginStatus]         = useState<'idle'|'checking'|'found'|'not_found'>('idle')
  const [pluginMsg, setPluginMsg]               = useState('')
  const [connecting, setConnecting]             = useState(false)
  const [connectError, setConnectError]         = useState('')
  const [connectedKey, setConnectedKey]         = useState('')
  const [connectedSiteName, setConnectedSiteName] = useState('')

  const siteUrl = url.startsWith('http') ? url : `https://${url}`
  const stepLabels = ['Enter URL', 'Review', 'Install Plugin', 'Connected ✓']

  // ── SCAN ───────────────────────────────────────────────────────
  async function runScan() {
    if (!url.trim()) return
    setScanning(true); setScanError(''); setReport(null)
    try {
      const res  = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: siteUrl }),
      })
      const data = await res.json()
      if (data.success && data.report) {
        setReport(data.report)

        // Pre-generate API key in DB now — user will copy it into the plugin
        const provRes  = await fetch('/api/sites/provision', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: siteUrl, wpVersion: data.report?.cms?.version }),
        })
        const provData = await provRes.json()
        if (provData.apiKey) setConnectedKey(provData.apiKey)

        setStep(2)
      }
      else setScanError(data.error || 'Could not reach that site.')
    } catch { setScanError('Connection failed — check the URL') }
    finally { setScanning(false) }
  }

  // ── CHECK PLUGIN + CONNECT ─────────────────────────────────────
  async function checkAndConnect() {
    setPluginStatus('checking')
    setPluginMsg('')
    setConnectError('')

    const keyToVerify = connectedKey || getStoredKey(siteUrl)

    if (!keyToVerify) {
      setPluginStatus('not_found')
      setConnectError('API key missing. Go back one step so ignyous can generate a key, then paste it into the WordPress plugin settings and save.')
      return
    }

    try {
      const verifyRes = await fetch('/api/wordpress/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, apiKey: keyToVerify }),
      })

      const verifyData = await verifyRes.json()

      if (verifyData.success && verifyData.plugin_found) {
        saveConnection(siteUrl, keyToVerify)
        setConnectedKey(keyToVerify)
        setConnectedSiteName(verifyData.site_name || verifyData.site_info?.site_name || siteUrl)
        setPluginStatus('found')

        // Save to database
        fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: siteUrl,
            apiKey: keyToVerify,
            name: verifyData.site_name || verifyData.site_info?.site_name || siteUrl,
            wpVersion: verifyData.wp_version || verifyData.site_info?.wp_version,
          }),
        }).catch(() => {}) // non-fatal

        setStep(4)
        return
      }

      setPluginStatus('not_found')
      setPluginMsg(verifyData.message || 'Plugin not detected. Make sure it is activated, the API key is saved, and Permalinks are saved.')
    } catch (e: any) {
      setPluginStatus('not_found')
      setConnectError(`Connection error: ${e.message}`)
    } finally {
      setConnecting(false)
    }
  }

  // ── GO TO DASHBOARD ────────────────────────────────────────────
  function openDashboard() {
    router.push(`/dashboard?site=${encodeURIComponent(url)}&key=${encodeURIComponent(connectedKey)}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.surface }}>
      <Nav/>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 24px 80px' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, marginBottom: 12, background: C.blueBg, border: `1px solid ${C.blueBorder}`, fontSize: 13, fontWeight: 600, color: C.blue }}>
            ◈ Connect Existing Site
          </div>
          <h1 style={{ fontFamily: 'Poppins, sans-serif', fontSize: 29, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            Connect your WordPress site
          </h1>
          <p style={{ fontSize: 16, color: C.text2, lineHeight: 1.65 }}>
            Scan your site, install one plugin, and ignyous connects automatically — no keys to copy.
          </p>
        </div>

        <StepBar current={step} labels={stepLabels}/>

        {/* ── STEP 1: URL ── */}
        {step === 1 && (
          <Card>
            <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'Poppins, sans-serif', color: C.text }}>What's the site URL?</div>
              <div style={{ fontSize: 15, color: C.text2, marginTop: 2 }}>We'll scan it to see what it's built with</div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', border: `2px solid ${scanning ? C.accent : C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14, transition: 'border-color 0.2s' }}>
                <div style={{ padding: '0 14px', background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', fontSize: 15, color: C.text3, flexShrink: 0, fontFamily: 'monospace' }}>https://</div>
                <input
                  value={url} onChange={e => setUrl(e.target.value.replace(/^https?:\/\//,''))}
                  onKeyDown={e => e.key === 'Enter' && runScan()}
                  placeholder="yoursite.com"
                  style={{ flex: 1, border: 'none', padding: '14px 16px', fontSize: 17, color: C.text, fontFamily: 'Poppins, sans-serif', background: C.white }}
                />
                <button onClick={runScan} disabled={scanning || !url.trim()} style={{ padding: '0 28px', background: scanning ? '#C9541A' : C.accent, border: 'none', color: 'white', cursor: scanning ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 600, fontFamily: 'Poppins, sans-serif', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {scanning ? (<><Spinner color="white"/>Scanning…</>) : 'Scan →'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 20 }}>
                <span style={{ fontSize: 14, color: C.text3 }}>Try:</span>
                {['josefn21.sg-host.com', 'josefn22.sg-host.com'].map(u => (
                  <button key={u} onClick={() => setUrl(u)} style={{ padding: '4px 12px', border: `1px solid ${C.border}`, borderRadius: 20, background: C.white, color: C.text2, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>{u}</button>
                ))}
              </div>

              {/* Also check if already connected */}
              <div style={{ padding: '14px 16px', background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.blue, marginBottom: 4 }}>Already installed the plugin?</div>
                <div style={{ fontSize: 14, color: C.text2, marginBottom: 10 }}>Enter the site URL above and click "Scan" — we'll detect it and reconnect automatically.</div>
              </div>

              {scanError && <div style={{ marginTop: 14, padding: '12px 16px', background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, color: C.red, fontSize: 15 }}>⚠ {scanError}</div>}

              {scanning && (
                <div style={{ marginTop: 16, padding: '28px', textAlign: 'center' as const, background: C.surface, borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 12 }}>
                    {[0,1,2,3,4].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: C.accent, animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite` }}/>)}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: C.text }}>Scanning {url}…</div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ── STEP 2: REVIEW ── */}
        {step === 2 && report && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            <BackBtn onClick={() => setStep(1)}/>
            <Card>
              <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'Poppins, sans-serif', color: C.text }}>{url}</div>
                  <div style={{ fontSize: 14, color: C.text2, marginTop: 2 }}>Scanned in {(report.scan_duration_ms/1000).toFixed(1)}s</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600, background: report.cms.is_wordpress ? C.greenBg : C.redBg, color: report.cms.is_wordpress ? C.green : C.red, border: `1px solid ${report.cms.is_wordpress ? C.greenBorder : C.redBorder}` }}>
                  {report.cms.is_wordpress ? '✓ WordPress' : '✗ Not WordPress'}
                </span>
              </div>

              {/* Score row */}
              <div style={{ padding: '16px 24px', background: '#FAFAF8', display: 'flex', gap: 24, flexWrap: 'wrap' as const, alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
                {[
                  { label: 'Overall', score: report.scores?.overall, size: 64 },
                  { label: 'SEO', score: report.scores?.seo, size: 48 },
                  { label: 'Speed', score: report.scores?.performance, size: 48 },
                  { label: 'Security', score: report.scores?.security, size: 48 },
                  { label: 'Mobile', score: report.scores?.mobile, size: 48 },
                ].map(({ label, score, size }) => {
                  const s = score || 0
                  const col = s >= 70 ? C.green : s >= 45 ? C.yellow : C.red
                  const bg  = s >= 70 ? C.greenBg : s >= 45 ? C.yellowBg : C.redBg
                  const bor = s >= 70 ? C.greenBorder : s >= 45 ? C.yellowBorder : C.redBorder
                  return (
                    <div key={label} style={{ textAlign: 'center' as const }}>
                      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `2px solid ${bor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px' }}>
                        <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: size > 56 ? 18 : 13, fontWeight: 700, color: col }}>{s}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.text3, fontWeight: 500 }}>{label}</div>
                    </div>
                  )
                })}
              </div>

              <div style={{ padding: '14px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: '🎨 Theme',   value: report.theme?.name || 'Not detected' },
                  { label: '⬡ Builder',  value: report.builder?.[0]?.name || 'Gutenberg' },
                  { label: '◎ WP',       value: report.cms?.wp_version ? `Version ${report.cms.wp_version}` : 'Detected' },
                  { label: '○ Forms',    value: `${report.forms?.count || 0} found` },
                ].map(item => (
                  <div key={item.label} style={{ padding: '11px 14px', background: C.surface, borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: C.text3, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </Card>

            {!report.cms.is_wordpress && (
              <div style={{ padding: '14px 18px', background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 12, color: C.yellow, fontSize: 15 }}>
                ⚠ This doesn't appear to be a WordPress site. ignyous Bridge requires WordPress.
              </div>
            )}

            <button onClick={() => setStep(3)} disabled={!report.cms.is_wordpress} style={{
              padding: '14px', background: report.cms.is_wordpress ? C.accent : C.border, border: 'none', borderRadius: 12,
              color: 'white', fontSize: 17, fontWeight: 600, cursor: report.cms.is_wordpress ? 'pointer' : 'not-allowed',
              fontFamily: 'Poppins, sans-serif', boxShadow: report.cms.is_wordpress ? '0 2px 10px rgba(232,101,26,0.3)' : 'none',
            }}>
              Connect this site →
            </button>
          </div>
        )}

        {/* ── STEP 3: INSTALL ── */}
        {step === 3 && (
          <div>
            <BackBtn onClick={() => setStep(report ? 2 : 1)}/>

            {/* Connecting overlay */}
            {connecting && (
              <Card style={{ marginBottom: 16 }}>
                <div style={{ padding: '36px', textAlign: 'center' as const }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                    <Spinner color={C.accent}/>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 4 }}>Connecting automatically…</div>
                  <div style={{ fontSize: 15, color: C.text2 }}>ignyous is setting up the secure connection</div>
                </div>
              </Card>
            )}

            {/* Plugin found */}
            {pluginStatus === 'found' && !connecting && (
              <Card style={{ marginBottom: 16 }}>
                <div style={{ padding: '24px', textAlign: 'center' as const }}>
                  <div style={{ fontSize: 37, marginBottom: 10 }}>✓</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: C.green, fontFamily: 'Poppins, sans-serif' }}>Plugin detected! Connecting…</div>
                </div>
              </Card>
            )}

            {/* Error */}
            {connectError && (
              <div style={{ padding: '13px 16px', background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, color: C.red, fontSize: 15, marginBottom: 16 }}>
                ⚠ {connectError}
              </div>
            )}

            {/* Install steps */}
            <Card>
              <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'Poppins, sans-serif', color: C.text }}>Install the ignyous Bridge plugin</div>
                <div style={{ fontSize: 15, color: C.text2, marginTop: 2 }}>3 steps, about 2 minutes</div>
              </div>
              <div style={{ padding: 24 }}>

                {/* YOUR KEY — most important thing */}
                {connectedKey && (
                  <div style={{ background: '#0f172a', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f3af00', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8 }}>Your ignyous API Key — copy this</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <code style={{ flex: 1, fontSize: 13, color: '#94a3b8', wordBreak: 'break-all' as const, fontFamily: 'monospace', lineHeight: 1.6 }}>{connectedKey}</code>
                      <button onClick={() => { navigator.clipboard.writeText(connectedKey); alert('Copied!') }} style={{ flexShrink: 0, padding: '8px 16px', background: '#f3af00', border: 'none', borderRadius: 8, color: '#1a1a4e', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Copy</button>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>Paste this into WP Admin → ignyous Bridge settings → Save</div>
                  </div>
                )}

                {[
                  { n: 1, title: 'Download & install the plugin',
                    desc: 'Download ignyous-bridge.zip → WP Admin → Plugins → Add New → Upload → Activate',
                    action: <a href="/api/plugin/bridge.zip" download style={{ padding: '9px 18px', background: '#1a1a4e', borderRadius: 9, color: 'white', textDecoration: 'none', fontSize: 14, fontWeight: 600, flexShrink: 0, display: 'inline-block' }}>↓ Download Plugin</a> },
                  { n: 2, title: 'Paste your API key into the plugin',
                    desc: 'WP Admin → Settings → ignyous Bridge → paste the key above → Save',
                    action: <a href={`${siteUrl}/wp-admin/options-general.php?page=ignyous-bridge`} target="_blank" rel="noreferrer" style={{ padding: '9px 16px', border: `1px solid ${C.border}`, borderRadius: 9, color: C.text2, textDecoration: 'none', fontSize: 14, flexShrink: 0, display: 'inline-block' }}>Open Settings ↗</a> },
                  { n: 3, title: 'Save Permalinks',
                    desc: 'Settings → Permalinks → Post name → Save Changes (required for REST API)',
                    action: <a href={`${siteUrl}/wp-admin/options-permalink.php`} target="_blank" rel="noreferrer" style={{ padding: '9px 16px', border: `1px solid ${C.border}`, borderRadius: 9, color: C.text2, textDecoration: 'none', fontSize: 14, flexShrink: 0, display: 'inline-block' }}>Open ↗</a> },
                ].map(s => (
                  <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1a1a4e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{s.title}</div>
                      {s.desc && <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>{s.desc}</div>}
                    </div>
                    {s.action && s.action}
                  </div>
                ))}

                {/* NOT FOUND message */}
                {pluginStatus === 'not_found' && (
                  <div style={{ padding: '12px 14px', background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 10, fontSize: 14, color: C.yellow, marginBottom: 14 }}>
                    ⚠ {pluginMsg || 'Plugin not detected yet.'} Make sure you completed all 3 steps, then try again.
                  </div>
                )}

                {/* THE BIG BUTTON */}
                <button
                  onClick={checkAndConnect}
                  disabled={connecting || pluginStatus === 'checking'}
                  style={{
                    width: '100%', padding: '18px', fontSize: 18, fontWeight: 700,
                    fontFamily: 'Poppins, sans-serif', border: 'none', borderRadius: 14,
                    background: connecting || pluginStatus === 'checking' ? '#C9541A' : C.accent,
                    color: 'white', cursor: connecting || pluginStatus === 'checking' ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    boxShadow: '0 4px 16px rgba(232,101,26,0.3)',
                  }}
                >
                  {connecting || pluginStatus === 'checking'
                    ? <><Spinner color="white"/>{connecting ? 'Connecting…' : 'Checking…'}</>
                    : pluginStatus === 'not_found'
                      ? '↺ Try Again'
                      : '✦ I\'ve activated the plugin — Connect my site!'}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ── STEP 4: CONNECTED ── */}
        {step === 4 && (
          <div style={{ textAlign: 'center' as const }}>
            <Card style={{ padding: '52px 40px' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: C.greenBg, border: `2px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 37 }}>✓</div>
              <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: 27, fontWeight: 700, marginBottom: 10, color: C.text }}>
                {connectedSiteName || url} is connected!
              </h2>
              <p style={{ fontSize: 16, color: C.text2, marginBottom: 8, lineHeight: 1.65, maxWidth: 420, margin: '0 auto 8px' }}>
                ignyous Bridge is live. Manage your site's content, design, and plugins through plain English chat.
              </p>
              <p style={{ fontSize: 14, color: C.text3, marginBottom: 36 }}>
                Your connection is saved — you can return any time without reconnecting.
              </p>
              <button onClick={openDashboard} style={{
                padding: '16px 52px', background: C.accent, border: 'none', borderRadius: 14,
                color: 'white', fontSize: 18, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Poppins, sans-serif', boxShadow: '0 4px 20px rgba(232,101,26,0.35)',
              }}>
                Open Site Dashboard →
              </button>
            </Card>
          </div>
        )}

      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}
