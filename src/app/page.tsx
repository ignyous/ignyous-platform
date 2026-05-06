'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ScanReport {
  url: string; status_code: number; scan_duration_ms: number; load_time_ms: number
  cms: { is_wordpress: boolean; wp_version: string | null; confidence: number; signals: string[] }
  builder: Array<{ id: string; name: string; confidence: number }>
  seo: { title: string; title_length: number; meta_description: string | null; has_h1: boolean; h1_text: string; images_without_alt: number; has_schema: boolean; yoast_detected: boolean }
  performance: { load_time_ms: number; html_size_kb: number; scripts_count: number; cdn: string; compression: string; mobile_viewport: boolean; estimated_score: number }
  security: { https: boolean; hsts: boolean; content_security_policy: boolean; server_exposed: string | null }
  forms: { count: number; forms: Array<{ plugin: string; fields: number }> }
  analytics: { google_analytics: boolean; google_tag_manager: boolean; facebook_pixel: boolean }
  wordpress: { pages: Array<{ title: { rendered: string }; slug: string; link: string }> } | null
  recommendations: Array<{ severity: string; category: string; title: string; detail: string }>
  scores: { overall: number; seo: number; performance: number; security: number; mobile: number }
}

function ScoreRing({ score, label, size = 64 }: { score: number; label: string; size?: number }) {
  const color  = score >= 70 ? '#1E7B4B' : score >= 45 ? '#92400E' : '#B91C1C'
  const bg     = score >= 70 ? '#F0FAF5' : score >= 45 ? '#FFFBEB' : '#FEF2F2'
  const border = score >= 70 ? '#B8E5CF' : score >= 45 ? '#FDE68A' : '#FECACA'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `2px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: size > 56 ? 18 : 14, fontWeight: 700, color }}>{score}</span>
      </div>
      <div style={{ fontSize: 12, color: '#6B6056', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function Pill({ children, color = 'default' }: { children: React.ReactNode; color?: string }) {
  const c: Record<string, any> = {
    green: { bg: '#F0FAF5', border: '#B8E5CF', text: '#1E7B4B' },
    red: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
    yellow: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
    blue: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1B5FA8' },
    orange: { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
    default: { bg: '#F7F5F2', border: '#E2DDD8', text: '#6B6056' },
  }
  const s = c[color] || c.default
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: s.bg, border: `1px solid ${s.border}`, color: s.text, display: 'inline-block' }}>{children}</span>
}

export default function HomePage() {
  const router = useRouter()
  const [scanUrl, setScanUrl]   = useState('')
  const [scanning, setScanning] = useState(false)
  const [report, setReport]     = useState<ScanReport | null>(null)
  const [scanError, setScanError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  async function runScan() {
    if (!scanUrl) return
    setScanning(true); setReport(null); setScanError('')
    try {
      const url = scanUrl.startsWith('http') ? scanUrl : `https://${scanUrl}`
      const res  = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const data = await res.json()
      if (data.success && data.report) setReport(data.report)
      else setScanError(data.error || 'Scan failed')
    } catch (e: any) { setScanError(e.message) }
    finally { setScanning(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', color: '#1A1410', fontFamily: 'DM Sans, sans-serif' }}>

      {/* NAV */}
      <nav style={{ height: 64, borderBottom: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', padding: '0 32px', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, background: '#E8651A', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 5v6l6 4 6-4V5L8 1zm0 2l4 2.7V11L8 13.4 4 11V5.7L8 3z"/></svg>
          </div>
          <span style={{ fontFamily: 'Sora, sans-serif', fontSize: 18, fontWeight: 700 }}>ignyous<span style={{ color: '#E8651A' }}>.ai</span></span>
          <span style={{ width: 1, height: 20, background: '#E2DDD8', margin: '0 8px' }}/>
          <span style={{ fontSize: 14, color: '#A89D94' }}>Developer Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push('/bridge/connect')} style={{ padding: '9px 20px', background: '#E8651A', border: 'none', borderRadius: 9, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Connect Site →</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px', borderRadius: 20, background: '#F0FAF5', border: '1px solid #B8E5CF', color: '#1E7B4B' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1E7B4B' }}/>All systems live
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 32px' }}>

        {/* HERO */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 20, marginBottom: 16, background: '#FFF7ED', border: '1px solid #FED7AA', fontSize: 13, fontWeight: 600, color: '#C2410C' }}>✦ v0.1 — Foundation Complete</div>
          <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 40, fontWeight: 700, marginBottom: 12, lineHeight: 1.15 }}>ignyous Platform</h1>
          <p style={{ fontSize: 17, color: '#6B6056', maxWidth: 560, lineHeight: 1.65 }}>AI-powered WordPress website builder. Scan any site, detect its tech stack, and manage it through the ignyous bridge.</p>
        </div>

        {/* STATUS CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 40 }}>
          {[{ label: 'Platform', value: 'Vercel', icon: '▲' }, { label: 'Scanner', value: 'Railway', icon: '⬡' }, { label: 'Database', value: 'Vercel Postgres', icon: '◈' }, { label: 'Test Site', value: 'SiteGround', icon: '◎' }].map(item => (
            <div key={item.label} style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 22, color: '#E8651A' }}>{item.icon}</span>
                <Pill color="green">Live</Pill>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{item.value}</div>
              <div style={{ fontSize: 13, color: '#A89D94', marginTop: 3 }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* SCANNER */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 20, overflow: 'hidden', marginBottom: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FFF7ED', border: '1px solid #FED7AA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="#E8651A"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, fontFamily: 'Sora, sans-serif' }}>Site Scanner</div>
              <div style={{ fontSize: 14, color: '#6B6056' }}>Detect WordPress, builder, SEO, performance &amp; more</div>
            </div>
          </div>

          <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2DDD8' }}>
            <div style={{ display: 'flex', background: '#FAFAF8', border: `2px solid ${scanning ? '#E8651A' : '#E2DDD8'}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ padding: '0 14px', background: '#F7F5F2', borderRight: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', fontSize: 14, color: '#A89D94', flexShrink: 0, fontFamily: 'monospace' }}>https://</div>
              <input value={scanUrl} onChange={e => setScanUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && runScan()} placeholder="josefn22.sg-host.com or any WordPress URL" style={{ flex: 1, background: 'transparent', border: 'none', padding: '14px 16px', color: '#1A1410', fontSize: 16, fontFamily: 'DM Sans, sans-serif' }}/>
              <button onClick={runScan} disabled={scanning || !scanUrl} style={{ padding: '0 28px', background: scanning ? '#C9541A' : '#E8651A', border: 'none', color: 'white', cursor: scanning ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {scanning ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>Scanning…</>) : 'Scan Site →'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#A89D94' }}>Quick test:</span>
              {['josefn22.sg-host.com', 'wordpress.org', 'woocommerce.com'].map(url => (
                <button key={url} onClick={() => setScanUrl(url)} style={{ padding: '5px 12px', background: 'white', border: '1px solid #E2DDD8', borderRadius: 20, color: '#6B6056', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>{url}</button>
              ))}
            </div>
          </div>

          {scanning && (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                {[0,1,2,3,4].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8651A', animation: `pulse 1.4s ease-in-out ${i * 0.15}s infinite` }}/>)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>Scanning {scanUrl}…</div>
              <div style={{ fontSize: 14, color: '#A89D94', marginTop: 6 }}>Detecting WordPress, builder, SEO, performance</div>
            </div>
          )}

          {scanError && <div style={{ margin: '16px 24px', padding: '14px 18px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 14 }}>⚠ {scanError}</div>}

          {report && !scanning && (
            <div>
              <div style={{ padding: '24px', borderBottom: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', background: '#FAFAF8' }}>
                <ScoreRing score={report.scores.overall} label="Overall" size={80}/>
                <div style={{ width: 1, height: 64, background: '#E2DDD8' }}/>
                <ScoreRing score={report.scores.seo}         label="SEO"      size={60}/>
                <ScoreRing score={report.scores.performance} label="Speed"    size={60}/>
                <ScoreRing score={report.scores.security}    label="Security" size={60}/>
                <ScoreRing score={report.scores.mobile}      label="Mobile"   size={60}/>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: '#A89D94', marginBottom: 4 }}>Scanned in</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Sora, sans-serif' }}>{(report.scan_duration_ms / 1000).toFixed(1)}s</div>
                  <div style={{ fontSize: 13, color: '#6B6056', marginTop: 3 }}>{report.status_code === 200 ? '✓ Site reachable' : `Status ${report.status_code}`}</div>
                </div>
              </div>

              <div style={{ display: 'flex', borderBottom: '1px solid #E2DDD8', padding: '0 8px' }}>
                {['overview','seo','performance','security','pages','recommendations'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '14px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${activeTab === tab ? '#E8651A' : 'transparent'}`, color: activeTab === tab ? '#E8651A' : '#6B6056', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textTransform: 'capitalize', marginBottom: -1 }}>{tab}</button>
                ))}
              </div>

              <div style={{ padding: 24 }}>

                {activeTab === 'overview' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div style={{ background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 12, padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#A89D94', marginBottom: 12 }}>CMS Detection</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Pill color={report.cms.is_wordpress ? 'green' : 'default'}>{report.cms.is_wordpress ? '✓ WordPress' : '✗ Not WordPress'}</Pill>
                        {report.cms.wp_version && <Pill color="blue">v{report.cms.wp_version}</Pill>}
                        {report.cms.confidence > 0 && <Pill>{report.cms.confidence}% confidence</Pill>}
                      </div>
                      {report.cms.signals.length > 0 && <div style={{ fontSize: 13, color: '#6B6056', lineHeight: 1.7 }}>Signals: {report.cms.signals.join(', ')}</div>}
                    </div>
                    <div style={{ background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 12, padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#A89D94', marginBottom: 12 }}>Page Builder</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                        {report.builder.length > 0 ? report.builder.map(b => <Pill key={b.id} color="orange">{b.name} ({b.confidence}%)</Pill>) : <Pill>None detected</Pill>}
                      </div>
                    </div>
                    <div style={{ background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 12, padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#A89D94', marginBottom: 12 }}>Forms</div>
                      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Sora, sans-serif', marginBottom: 6 }}>{report.forms.count}</div>
                      <div style={{ fontSize: 13, color: '#6B6056' }}>{report.forms.forms.length > 0 ? report.forms.forms.map(f => f.plugin).join(', ') : 'No forms found'}</div>
                    </div>
                    <div style={{ background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 12, padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#A89D94', marginBottom: 12 }}>Analytics &amp; Tracking</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
                        <Pill color={report.analytics.google_analytics ? 'green' : 'default'}>{report.analytics.google_analytics ? '✓' : '✗'} Google Analytics</Pill>
                        <Pill color={report.analytics.google_tag_manager ? 'green' : 'default'}>{report.analytics.google_tag_manager ? '✓' : '✗'} GTM</Pill>
                        <Pill color={report.analytics.facebook_pixel ? 'green' : 'default'}>{report.analytics.facebook_pixel ? '✓' : '✗'} FB Pixel</Pill>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'seo' && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    {[
                      { label: 'Page Title', value: report.seo.title || 'Missing', sub: `${report.seo.title_length} characters`, good: report.seo.title_length >= 30 && report.seo.title_length <= 70 },
                      { label: 'Meta Description', value: report.seo.meta_description || 'Missing', sub: report.seo.meta_description ? `${report.seo.meta_description.length} chars` : 'Not set', good: !!report.seo.meta_description },
                      { label: 'H1 Heading', value: report.seo.h1_text || 'Not found', sub: report.seo.has_h1 ? 'Present' : 'Missing', good: report.seo.has_h1 },
                      { label: 'Schema Markup', value: report.seo.has_schema ? 'Present' : 'Not found', sub: 'Structured data', good: report.seo.has_schema },
                      { label: 'Images Without Alt', value: String(report.seo.images_without_alt), sub: 'Should be 0', good: report.seo.images_without_alt === 0 },
                      { label: 'SEO Plugin', value: report.seo.yoast_detected ? 'Yoast SEO' : 'Not detected', sub: 'Recommended', good: report.seo.yoast_detected },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: item.good ? '#1E7B4B' : '#B91C1C' }}/>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</div>
                          <div style={{ fontSize: 12, color: '#A89D94', marginTop: 2 }}>{item.sub}</div>
                        </div>
                        <div style={{ fontSize: 13, color: '#6B6056', maxWidth: 280, textAlign: 'right' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'performance' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { label: 'Load Time', value: `${report.performance.load_time_ms}ms`, good: report.performance.load_time_ms < 2000 },
                      { label: 'HTML Size', value: `${report.performance.html_size_kb}KB`, good: report.performance.html_size_kb < 100 },
                      { label: 'Scripts', value: `${report.performance.scripts_count} files`, good: report.performance.scripts_count < 15 },
                      { label: 'CDN', value: report.performance.cdn, good: report.performance.cdn !== 'Not detected' },
                      { label: 'Compression', value: report.performance.compression, good: report.performance.compression !== 'none' },
                      { label: 'Mobile Viewport', value: report.performance.mobile_viewport ? 'Yes' : 'No', good: report.performance.mobile_viewport },
                    ].map(item => (
                      <div key={item.label} style={{ padding: '18px', background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, color: '#A89D94', marginBottom: 6 }}>{item.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Sora, sans-serif' }}>{item.value}</div>
                        </div>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.good ? '#1E7B4B' : '#B91C1C' }}/>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'security' && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    {[
                      { label: 'HTTPS', value: report.security.https ? 'Enabled' : 'Not enabled', good: report.security.https },
                      { label: 'HSTS Header', value: report.security.hsts ? 'Present' : 'Missing', good: report.security.hsts },
                      { label: 'Content Security Policy', value: report.security.content_security_policy ? 'Present' : 'Missing', good: report.security.content_security_policy },
                      { label: 'Server Header Exposed', value: report.security.server_exposed || 'Hidden', good: !report.security.server_exposed },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: item.good ? '#1E7B4B' : '#B91C1C' }}/>
                        <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{item.label}</div>
                        <Pill color={item.good ? 'green' : 'red'}>{item.value}</Pill>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'pages' && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    {report.wordpress?.pages && report.wordpress.pages.length > 0 ? report.wordpress.pages.map((page: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 10 }}>
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="#A89D94"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{page.title?.rendered || page.slug}</span>
                        <span style={{ fontSize: 13, color: '#A89D94', fontFamily: 'monospace' }}>/{page.slug}</span>
                        <a href={page.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#1B5FA8', textDecoration: 'none', fontWeight: 500 }}>↗</a>
                      </div>
                    )) : <div style={{ padding: '40px', textAlign: 'center' as const, color: '#A89D94', fontSize: 15 }}>No pages found via REST API</div>}
                  </div>
                )}

                {activeTab === 'recommendations' && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    {report.recommendations.length === 0
                      ? <div style={{ padding: '40px', textAlign: 'center' as const, color: '#1E7B4B', fontSize: 15 }}>✓ No issues found — site looks good!</div>
                      : report.recommendations.map((rec, i) => (
                        <div key={i} style={{ display: 'flex', gap: 14, padding: '16px 18px', background: '#F7F5F2', border: '1px solid #E2DDD8', borderRadius: 12 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: rec.severity === 'high' ? '#B91C1C' : rec.severity === 'medium' ? '#92400E' : '#1E7B4B' }}/>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' as const }}>
                              <span style={{ fontSize: 15, fontWeight: 600 }}>{rec.title}</span>
                              <Pill color={rec.severity === 'high' ? 'red' : rec.severity === 'medium' ? 'yellow' : 'green'}>{rec.severity}</Pill>
                              <Pill>{rec.category}</Pill>
                            </div>
                            <div style={{ fontSize: 14, color: '#6B6056', lineHeight: 1.6 }}>{rec.detail}</div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>

              {report.cms.is_wordpress && (
                <div style={{ padding: '0 24px 24px' }}>
                  <button onClick={() => router.push('/bridge/connect')} style={{ width: '100%', padding: '16px', background: '#E8651A', border: 'none', borderRadius: 12, color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'Sora, sans-serif', boxShadow: '0 4px 14px rgba(232,101,26,0.25)' }}>
                    Connect this site and manage it with AI →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* QUICK ACTIONS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { title: 'Template Builder', desc: 'Design a new WordPress site from scratch', icon: '⬡', color: '#E8651A', href: '/builder' },
            { title: 'Connect Existing Site', desc: 'Scan, connect & manage with AI', icon: '◈', color: '#1B5FA8', href: '/bridge/connect' },
            { title: 'New Site Setup', desc: 'Domain, hosting & full deployment', icon: '◎', color: '#1E7B4B', href: '/bridge/new' },
          ].map(item => (
            <div key={item.title} onClick={() => router.push(item.href)} style={{ background: '#FFFFFF', border: '1px solid #E2DDD8', borderRadius: 16, padding: '22px 24px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = item.color; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2DDD8'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 28, marginBottom: 12, color: item.color }}>{item.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'Sora, sans-serif', marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 14, color: '#6B6056', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}