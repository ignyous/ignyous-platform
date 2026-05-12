'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

const C = {
  accent:'#E8651A', accentDim:'#FFF7ED', accentBorder:'#FED7AA',
  green:'#1E7B4B', greenBg:'#F0FAF5', greenBorder:'#B8E5CF',
  text:'#1A1410', text2:'#6B6056', text3:'#A89D94',
  border:'#E2DDD8', surface:'#F7F5F2', white:'#FFFFFF',
  primary:'#1a1a4e', gold:'#f3af00',
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: desc ? 4 : 16 }}>{title}</div>
      {desc && <div style={{ fontSize: 13, color: C.text2, marginBottom: 16 }}>{desc}</div>}
      {children}
    </div>
  )
}

function Input({ label, value, onChange, placeholder, type = 'text' }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: C.text2, display: 'block', marginBottom: 6 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
        style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.text, fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' as const }} />
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab]               = useState<'profile'|'appearance'|'integrations'|'reporting'|'mode'>('profile')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [loading, setLoading]       = useState(true)
  const router                      = useRouter()
  const [initialMode, setInitialMode] = useState<'easy'|'advanced'>('advanced')

  // Profile
  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [phone, setPhone]           = useState('')
  const [dashboardMode, setDashboardMode] = useState<'easy'|'advanced'>('advanced')

  // White-label / appearance
  const [wlCompanyName, setWlCompanyName]   = useState('')
  const [wlLogoUrl, setWlLogoUrl]           = useState('')
  const [wlPrimaryColor, setWlPrimaryColor] = useState('#1a1a4e')

  // Integrations
  const [gaPropertyId, setGaPropertyId]     = useState('')
  const [twTwitter, setTwTwitter]           = useState('')
  const [fbToken, setFbToken]               = useState('')
  const [fbPageId, setFbPageId]             = useState('')

  // Reporting
  const [reportEmail, setReportEmail]       = useState('')
  const [reportEnabled, setReportEnabled]   = useState(false)
  const [previewHtml, setPreviewHtml]       = useState('')
  const [previewing, setPreviewing]         = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/user').then(r => r.json()),
      fetch('/api/integrations').then(r => r.json()),
    ]).then(([u, i]) => {
      if (u.user) {
        setName(u.user.name || ''); setEmail(u.user.email || ''); setPhone(u.user.phone || '')
        setDashboardMode((u.user.dashboardMode as 'easy'|'advanced') || 'advanced')
        setInitialMode((u.user.dashboardMode as 'easy'|'advanced') || 'advanced')
      }
      setGaPropertyId(i.gaPropertyId || ''); setReportEmail(i.reportEmail || '')
      setReportEnabled(i.reportEnabled || false); setWlCompanyName(i.wlCompanyName || '')
      setWlLogoUrl(i.wlLogoUrl || ''); setWlPrimaryColor(i.wlPrimaryColor || '#1a1a4e')
      const t = i.socialTokens || {}
      setTwTwitter(t.twitter || ''); setFbToken(t.facebook || ''); setFbPageId(t.facebook_page_id || '')
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true); setSaved(false)
    await Promise.all([
      fetch('/api/user', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, dashboardMode }) }),
      fetch('/api/integrations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gaPropertyId, reportEmail, reportEnabled,
          wlCompanyName, wlLogoUrl, wlPrimaryColor,
          socialTokens: { twitter: twTwitter, facebook: fbToken, facebook_page_id: fbPageId },
        }) }),
    ])
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    // If mode changed, navigate into the new mode immediately
    if (dashboardMode !== initialMode) {
      setTimeout(() => router.push('/dashboard'), 800)
    }
  }

  async function previewReport() {
    setPreviewing(true)
    const sites = await fetch('/api/sites').then(r => r.json())
    const firstSite = sites.sites?.[0]
    if (!firstSite) { alert('Connect a site first'); setPreviewing(false); return }
    const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: firstSite.id, send: false }) })
    const data = await res.json()
    setPreviewHtml(data.html || '')
    setPreviewing(false)
  }

  const TABS = [
    { key: 'profile',      label: '👤 Profile'       },
    { key: 'mode',         label: '🖥️ Dashboard Mode' },
    { key: 'appearance',   label: '🎨 White Label'    },
    { key: 'integrations', label: '🔗 Integrations'   },
    { key: 'reporting',    label: '📊 Reporting'      },
  ] as const

  if (loading) return <AppLayout><div style={{ padding: 60, textAlign: 'center', color: C.text3, fontFamily: 'Poppins,sans-serif' }}>Loading…</div></AppLayout>

  return (
    <AppLayout>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 24px', fontFamily: 'Poppins,sans-serif' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.primary, marginBottom: 6 }}>Settings</h1>
        <p style={{ fontSize: 14, color: C.text2, marginBottom: 28 }}>Manage your account, integrations, and appearance</p>

        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' as const }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 16px', borderRadius: 10, border: `1.5px solid ${tab === t.key ? C.accent : C.border}`,
              background: tab === t.key ? C.accentDim : C.white, color: tab === t.key ? C.accent : C.text2,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── PROFILE ── */}
        {tab === 'profile' && (
          <Card title="Profile" desc="Your name, email, and phone for SMS alerts">
            <Input label="Name"  value={name}  onChange={setName}  placeholder="Your name" />
            <Input label="Email" value={email} onChange={() => {}} placeholder={email} />
            <Input label="Phone (for SMS alerts)" value={phone} onChange={setPhone} placeholder="+1 555 000 0000" />
          </Card>
        )}

        {/* ── DASHBOARD MODE ── */}
        {tab === 'mode' && (
          <Card title="Dashboard Mode" desc="Choose how you interact with your sites">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([
                { key: 'easy',     icon: '✨', title: 'Easy Mode',        desc: 'Large chat window and quick actions. Best for most users.' },
                { key: 'advanced', icon: '⚡', title: 'Advanced Editing', desc: 'Full dashboard with live preview, plugins, and all tools.' },
              ] as const).map(opt => (
                <button key={opt.key} onClick={() => setDashboardMode(opt.key)} style={{
                  padding: '20px', border: `2px solid ${dashboardMode === opt.key ? C.accent : C.border}`,
                  borderRadius: 14, background: dashboardMode === opt.key ? C.accentDim : C.white,
                  cursor: 'pointer', textAlign: 'left' as const,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{opt.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{opt.title}</div>
                  <div style={{ fontSize: 13, color: C.text2 }}>{opt.desc}</div>
                  {dashboardMode === opt.key && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: C.accent }}>✓ Active</div>}
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* ── WHITE LABEL ── */}
        {tab === 'appearance' && (
          <Card title="White Label" desc="Rebrand ignyous for your agency or clients">
            <Input label="Company Name (replaces 'ignyous.ai')" value={wlCompanyName} onChange={setWlCompanyName} placeholder="Acme Digital Agency" />
            <Input label="Logo URL" value={wlLogoUrl} onChange={setWlLogoUrl} placeholder="https://yoursite.com/logo.png" />
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: C.text2, display: 'block', marginBottom: 6 }}>Primary Colour</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={wlPrimaryColor} onChange={e => setWlPrimaryColor(e.target.value)}
                  style={{ width: 48, height: 40, border: `1.5px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                <input value={wlPrimaryColor} onChange={e => setWlPrimaryColor(e.target.value)}
                  style={{ flex: 1, padding: '10px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.text, fontFamily: 'monospace' }} />
              </div>
            </div>
            {wlLogoUrl && <img src={wlLogoUrl} alt="Logo preview" style={{ maxHeight: 60, marginTop: 8, borderRadius: 8, border: `1px solid ${C.border}`, padding: 8, background: C.surface }} />}
          </Card>
        )}

        {/* ── INTEGRATIONS ── */}
        {tab === 'integrations' && <>
          <Card title="Google Analytics" desc="Show GA4 traffic data inside your dashboard">
            <Input label="GA4 Property ID (e.g. G-XXXXXXXXXX or 123456789)" value={gaPropertyId} onChange={setGaPropertyId} placeholder="G-XXXXXXXXXX" />
            <div style={{ background: C.surface, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: C.text2 }}>
              📋 To connect: Go to Google Analytics → Admin → Data Streams → your stream → Measurement ID. You'll also need to share the property with <strong>analytics@ignyous-service.iam.gserviceaccount.com</strong> as Viewer in GA Admin → Account Access Management.
            </div>
          </Card>

          <Card title="Social Auto-Posting" desc="Automatically share published posts to your social channels">
            <Input label="Twitter/X Bearer Token" value={twTwitter} onChange={setTwTwitter} placeholder="Your X app bearer token" type="password" />
            <Input label="Facebook Page Access Token" value={fbToken} onChange={setFbToken} placeholder="Your page access token" type="password" />
            <Input label="Facebook Page ID" value={fbPageId} onChange={setFbPageId} placeholder="Your numeric page ID" />
            <div style={{ background: C.surface, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: C.text2 }}>
              📋 Get tokens from <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: C.accent }}>Meta for Developers</a> and <a href="https://developer.twitter.com" target="_blank" rel="noreferrer" style={{ color: C.accent }}>X Developer Portal</a>. Posts publish automatically when your content scheduler publishes.
            </div>
          </Card>

          <Card title="Image Optimization" desc="Automatically compress images when installed">
            <div style={{ background: C.surface, borderRadius: 10, padding: '16px', fontSize: 14, color: C.text2 }}>
              Install <strong>Imagify</strong> or <strong>ShortPixel</strong> on your WordPress site — ignyous will automatically use them to optimise new uploads. No API key needed here.
            </div>
          </Card>
        </>}

        {/* ── REPORTING ── */}
        {tab === 'reporting' && (
          <Card title="Monthly Client Reports" desc="Auto-send a summary of site activity each month">
            <Input label="Send reports to" value={reportEmail} onChange={setReportEmail} placeholder="client@example.com" type="email" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button onClick={() => setReportEnabled(!reportEnabled)} style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: reportEnabled ? C.green : C.border, position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: reportEnabled ? 23 : 3, transition: 'left 0.2s' }} />
              </button>
              <span style={{ fontSize: 14, color: C.text2 }}>Send automatically on the 1st of each month</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={previewReport} disabled={previewing} style={{ padding: '10px 20px', border: `1.5px solid ${C.border}`, borderRadius: 10, background: C.white, color: C.text2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {previewing ? '…' : '👁 Preview Report'}
              </button>
              <button onClick={async () => {
                const sites = await fetch('/api/sites').then(r => r.json())
                const s = sites.sites?.[0]
                if (!s) return alert('Connect a site first')
                await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: s.id, send: true }) })
                alert('Report sent!')
              }} style={{ padding: '10px 20px', background: C.primary, border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                ✉️ Send Now
              </button>
            </div>
            {previewHtml && (
              <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', height: 400 }}>
                <iframe srcDoc={previewHtml} style={{ width: '100%', height: '100%', border: 'none' }} title="Report preview" />
              </div>
            )}
          </Card>
        )}

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '13px 32px', background: saving ? C.border : C.accent, border: 'none', borderRadius: 12,
            color: 'white', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span style={{ fontSize: 14, color: C.green, fontWeight: 600 }}>✓ Saved!</span>}
        </div>
      </div>
    </AppLayout>
  )
}
