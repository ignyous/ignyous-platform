'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg: '#0d0d1f', bgCard: 'rgba(255,255,255,0.04)', bgCardHover: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.10)', borderHover: 'rgba(255,255,255,0.22)',
  gold: '#f3af00', goldDim: 'rgba(243,175,0,0.15)', goldBorder: 'rgba(243,175,0,0.4)',
  purple: '#818cf8', purpleDim: 'rgba(129,140,248,0.15)',
  text: '#ffffff', text2: 'rgba(255,255,255,0.6)', text3: 'rgba(255,255,255,0.35)',
  green: '#22c55e', greenDim: 'rgba(34,197,94,0.15)',
  red: '#ef4444',
}

const FEATURES = [
  { id: 'store',      icon: '🛒', label: 'Sell Products',        desc: 'Online store with cart & checkout', plugin: 'woocommerce' },
  { id: 'services',   icon: '🎯', label: 'Showcase Services',    desc: 'Services pages with pricing & CTAs', plugin: null },
  { id: 'blog',       icon: '📝', label: 'Blog',                 desc: 'Articles, news & insights', plugin: null },
  { id: 'events',     icon: '📅', label: 'Events Calendar',      desc: 'List and promote events', plugin: 'the-events-calendar' },
  { id: 'portfolio',  icon: '🖼️', label: 'Portfolio / Gallery',  desc: 'Showcase work and projects', plugin: null },
  { id: 'booking',    icon: '📋', label: 'Online Booking',       desc: 'Appointments & reservations', plugin: 'amelia' },
  { id: 'email',      icon: '📧', label: 'Email Marketing',      desc: 'Newsletter opt-ins & campaigns', plugin: 'mailchimp-for-wp' },
  { id: 'members',    icon: '💬', label: 'Members Area',         desc: 'Gated content & community', plugin: 'memberpress' },
]

const TIERS = [
  { id: 'basic',  icon: '🌱', label: 'Basic',  desc: 'Personal sites, portfolios, blogs', specs: ['Up to 10 pages','5GB storage','1 user','Shared hosting'], color: C.green },
  { id: 'medium', icon: '🚀', label: 'Medium', desc: 'Business sites, stores, events',    specs: ['Up to 50 pages','25GB storage','5 users','SSD hosting','Priority support'], color: C.gold, popular: true },
  { id: 'large',  icon: '⚡', label: 'Large',  desc: 'High-traffic, multi-feature sites', specs: ['Unlimited pages','100GB storage','Unlimited users','Dedicated resources','24/7 support'], color: C.purple },
]

const THEME_STYLES = ['All', 'Minimal', 'Bold', 'Corporate', 'Creative', 'Dark', 'Elegant']
const BUILDERS     = ['All', 'Gutenberg', 'Elementor', 'Avada']

const BTN = (variant: 'primary'|'ghost'|'gold', disabled = false) => ({
  padding: '13px 28px', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
  background: variant === 'primary' ? 'rgba(255,255,255,0.1)' : variant === 'gold' ? C.gold : 'transparent',
  color: variant === 'gold' ? '#1a1a2e' : C.text,
  border_: variant === 'ghost' ? `1px solid ${C.border}` : 'none',
  opacity: disabled ? 0.5 : 1,
})

export default function CreatePage() {
  const router = useRouter()
  const [step, setStep]                     = useState(0)
  const [hosting, setHosting]               = useState<'siteground'|null>(null)
  const [domainType, setDomainType]         = useState<'temp'|'custom'>('temp')
  const [siteSlug, setSiteSlug]             = useState('')
  const [customDomain, setCustomDomain]     = useState('')
  const [tier, setTier]                     = useState<'basic'|'medium'|'large'>('medium')
  const [description, setDescription]       = useState('')
  const [features, setFeatures]             = useState<string[]>([])
  const [aiSummary, setAiSummary]           = useState('')
  const [analysing, setAnalysing]           = useState(false)
  const [themes, setThemes]                 = useState<any[]>([])
  const [filteredThemes, setFilteredThemes] = useState<any[]>([])
  const [styleFilter, setStyleFilter]       = useState('All')
  const [builderFilter, setBuilderFilter]   = useState('All')
  const [selectedTheme, setSelectedTheme]   = useState<any>(null)
  const [loadingThemes, setLoadingThemes]   = useState(false)
  const [buildLog, setBuildLog]             = useState<{step:string;status:'pending'|'running'|'done'|'error';msg:string}[]>([])
  const [building, setBuilding]             = useState(false)
  const [provisionId, setProvisionId]       = useState('')
  const [builtUrl, setBuiltUrl]             = useState('')
  const [wpeUser, setWpeUser]               = useState('')
  const [wpePass, setWpePass]               = useState('')
  const [wpeAccountId, setWpeAccountId]     = useState('')
  const [wpeAccounts, setWpeAccounts]       = useState<any[]>([])
  const [wpeValidating, setWpeValidating]   = useState(false)
  const [wpeConnected, setWpeConnected]     = useState(false)
  const descRef = useRef<HTMLTextAreaElement>(null)

  // Generate slug from description
  useEffect(() => {
    if (description) {
      const slug = description.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim().split(/\s+/).slice(0,3).join('-').slice(0,30) + '-' + Math.random().toString(36).slice(2,6)
      setSiteSlug(slug)
    }
  }, [description])

  // Filter themes
  useEffect(() => {
    let t = themes
    if (styleFilter !== 'All')   t = t.filter(th => th.style === styleFilter)
    if (builderFilter !== 'All') t = t.filter(th => th.builder === builderFilter)
    setFilteredThemes(t)
  }, [themes, styleFilter, builderFilter])

  const STEPS = ['Hosting', 'Domain', 'Size', 'Describe', 'Features', 'Theme', 'Build']

  async function analyseDescription() {
    if (!description.trim()) return
    setAnalysing(true)
    try {
      const res  = await fetch('/api/create/analyse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, features }),
      })
      const data = await res.json()
      setAiSummary(data.summary || '')
    } catch {}
    setAnalysing(false)
  }

  async function loadThemes() {
    setLoadingThemes(true)
    try {
      const res  = await fetch('/api/create/themes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, features, tier }),
      })
      const data = await res.json()
      setThemes(data.themes || [])
    } catch {}
    setLoadingThemes(false)
  }

  async function startBuild() {
    setBuilding(true)
    const steps = [
      { step: 'Provision', msg: 'Creating WordPress environment on SiteGround…' },
      { step: 'Domain',    msg: `Configuring domain ${domainType === 'temp' ? siteSlug + '.ignyous.app' : customDomain}…` },
      { step: 'Theme',     msg: `Installing ${selectedTheme?.name || 'theme'}…` },
      { step: 'Plugins',   msg: 'Installing plugins for selected features…' },
      { step: 'Content',   msg: 'AI generating site structure and content…' },
      { step: 'Pages',     msg: 'Creating pages and navigation…' },
      { step: 'SEO',       msg: 'Optimising SEO and meta data…' },
      { step: 'Launch',    msg: 'Finalising and launching…' },
    ]
    setBuildLog(steps.map(s => ({ ...s, status: 'pending' })))

    try {
      const res = await fetch('/api/create/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, features, tier, themeSlug: selectedTheme?.slug, builder: selectedTheme?.builder, domainType, siteSlug, customDomain, hosting, wpeUser, wpePass, wpeAccountId }),
      })

      const reader = res.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          try {
            const event = JSON.parse(line.slice(6))
            if (event.stepIndex !== undefined) {
              setBuildLog(prev => prev.map((s, i) => i === event.stepIndex ? { ...s, status: event.status, msg: event.msg || s.msg } : (i < event.stepIndex ? { ...s, status: 'done' } : s)))
            }
            if (event.url) setBuiltUrl(event.url)
            if (event.provisionId) setProvisionId(event.provisionId)
          } catch {}
        }
      }
    } catch (e: any) {
      setBuildLog(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', msg: 'Build failed: ' + e.message } : s))
    }
  }

  function nextStep() {
    if (step === 3 && description) analyseDescription()
    if (step === 4) loadThemes()
    setStep(s => Math.min(s + 1, 6))
  }

  const canNext = [
    !!(hosting && wpeConnected), // Step 0: hosting + WP Engine connected
    !!(domainType === 'temp' ? siteSlug : customDomain), // Step 1: domain set
    !!tier,                 // Step 2: tier picked
    description.length >= 20, // Step 3: description
    features.length >= 1,  // Step 4: features
    !!selectedTheme,        // Step 5: theme chosen
    false,                  // Step 6: building
  ][step]

  const tempDomain = `${siteSlug || 'mysite'}.ignyous.app`

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Poppins,sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>ignyous<span style={{ color: C.gold }}>.ai</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                background: i < step ? C.gold : i === step ? 'white' : C.bgCard,
                color: i < step ? '#1a1a2e' : i === step ? '#1a1a2e' : C.text3,
                border: `2px solid ${i <= step ? C.gold : C.border}`,
              }}>{i < step ? '✓' : i + 1}</div>
              <span style={{ fontSize: 12, color: i === step ? C.text : C.text3, display: i > 2 ? 'none' : 'block' }}>{s}</span>
              {i < STEPS.length - 1 && <div style={{ width: 20, height: 1, background: i < step ? C.gold : C.border, margin: '0 4px' }} />}
            </div>
          ))}
        </div>
        <button onClick={() => router.push('/dashboard')} style={{ ...BTN('ghost'), fontSize: 13, padding: '8px 16px' }}>← Back to dashboard</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: step < 6 ? 'center' : 'flex-start', padding: '40px 24px' }}>

        {/* ── STEP 0: HOSTING ─────────────────────────────────── */}
        {step === 0 && (
          <div style={{ maxWidth: 700, width: '100%' }}>
            <h1 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Where will your site live?</h1>
            <p style={{ textAlign: 'center', color: C.text2, marginBottom: 40, fontSize: 16 }}>Choose a hosting provider. We'll set everything up automatically.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* WP Engine — single option, no grid needed */}
              <button onClick={() => setHosting('siteground')} style={{
                background: hosting ? C.goldDim : C.bgCard, border: `2px solid ${hosting ? C.gold : C.border}`,
                borderRadius: 16, padding: '28px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', width: '100%',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  <span style={{ fontSize: 36 }}>⚡</span>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>WP Engine</div>
                    <div style={{ fontSize: 13, color: C.text3 }}>Managed WordPress Hosting</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: C.greenDim, color: C.green, border: `1px solid ${C.green}` }}>Available</span>
                </div>
                <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>Enterprise-grade managed WordPress hosting. Each site gets a dedicated `name.wpengine.com` subdomain automatically. Daily backups, CDN, and staging included.</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
                  {['Global CDN','Daily backups','SSH/SFTP access','One-click staging','24/7 support'].map(f => <span key={f} style={{ fontSize: 12, color: C.text3, background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: 6 }}>{f}</span>)}
                </div>
                {hosting && <div style={{ marginTop: 14, fontSize: 13, color: C.gold, fontWeight: 700 }}>✓ Selected</div>}
              </button>
            </div>

            {/* WP Engine credentials */}
            <div style={{ marginTop: 20, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🔑 WP Engine API Credentials</div>
              <p style={{ fontSize: 13, color: C.text2, marginBottom: 18, lineHeight: 1.6 }}>
                Get your API credentials from the <a href="https://my.wpengine.com/api_access" target="_blank" rel="noreferrer" style={{ color: C.gold }}>WP Engine portal → API Access</a>.
                Create a new API key and paste the username + password here.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                {[
                  { label: 'API Username', val: wpeUser, set: setWpeUser, ph: 'From WP Engine → API Access' },
                  { label: 'API Password', val: wpePass, set: setWpePass, ph: 'From WP Engine → API Access', pwd: true },
                ].map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 12, color: C.text3, marginBottom: 5 }}>{f.label}</div>
                    <input type={f.pwd ? 'password' : 'text'} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                      style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: 13, fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' as const }} />
                  </div>
                ))}
              </div>
              <button onClick={async () => {
                if (!wpeUser || !wpePass) return
                setWpeValidating(true)
                const r = await fetch('/api/create/wpengine', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'validate', username:wpeUser, password:wpePass }) })
                const d = await r.json()
                setWpeValidating(false)
                if (d.success) { setWpeConnected(true); setWpeAccounts(d.accounts); if (d.accounts[0]) setWpeAccountId(d.accounts[0].id); setHosting('siteground') }
                else alert('Connection failed: ' + (d.error || 'Unknown error'))
              }} disabled={!wpeUser || !wpePass || wpeValidating} style={{
                padding: '10px 24px', background: wpeValidating ? C.bgCard : wpeConnected ? C.greenDim : C.gold,
                border: `1px solid ${wpeConnected ? C.green : 'transparent'}`, borderRadius: 10,
                color: wpeConnected ? C.green : '#1a1a2e', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                {wpeValidating ? '…Connecting' : wpeConnected ? '✓ Connected' : 'Connect WP Engine'}
              </button>
              {wpeConnected && wpeAccounts.length > 1 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: C.text3, marginBottom: 6 }}>Account to provision on:</div>
                  <select value={wpeAccountId} onChange={e => setWpeAccountId(e.target.value)} style={{ padding: '9px 14px', background: 'rgba(255,255,255,0.08)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }}>
                    {wpeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 1: DOMAIN ──────────────────────────────────── */}
        {step === 1 && (
          <div style={{ maxWidth: 640, width: '100%' }}>
            <h1 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Set up your domain</h1>
            <p style={{ textAlign: 'center', color: C.text2, marginBottom: 40, fontSize: 16 }}>Use a temporary domain to get started instantly, or connect your own.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
              {[
                { id: 'temp',   icon: '⚡', label: 'Temporary Domain', desc: 'Get a free ignyous.app subdomain instantly — perfect for building and previewing.', badge: 'Free · Instant' },
                { id: 'custom', icon: '🌐', label: 'Custom Domain',    desc: 'Use your own domain name. You\'ll need to update your DNS after setup.', badge: 'Bring your own' },
              ].map(d => (
                <button key={d.id} onClick={() => setDomainType(d.id as any)} style={{
                  background: domainType === d.id ? C.goldDim : C.bgCard, border: `2px solid ${domainType === d.id ? C.gold : C.border}`,
                  borderRadius: 16, padding: 24, textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{d.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{d.label}</div>
                  <div style={{ fontSize: 12, color: C.text3, marginBottom: 10 }}>{d.desc}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: C.goldDim, color: C.gold, border: `1px solid ${C.goldBorder}` }}>{d.badge}</span>
                </button>
              ))}
            </div>

            {domainType === 'temp' && (
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 13, color: C.text3, marginBottom: 8 }}>Your temporary domain will be:</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input value={siteSlug} onChange={e => setSiteSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} placeholder="my-site-name" style={{ flex: 1, padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 15, fontFamily: 'Poppins,sans-serif', fontWeight: 700 }} />
                  <div style={{ fontSize: 15, color: C.text2, fontWeight: 600, whiteSpace: 'nowrap' as const }}>.ignyous.app</div>
                </div>
                {siteSlug && <div style={{ marginTop: 10, fontSize: 13, color: C.gold }}>✓ {tempDomain}</div>}
              </div>
            )}

            {domainType === 'custom' && (
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 13, color: C.text3, marginBottom: 8 }}>Your domain name:</div>
                <input value={customDomain} onChange={e => setCustomDomain(e.target.value)} placeholder="www.yourdomain.com" style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 15, fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' as const }} />
                <div style={{ marginTop: 10, fontSize: 12, color: C.text3 }}>⚠ You'll need to point your domain's DNS to our servers after setup. We'll show you exactly what to change.</div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: TIER ────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ maxWidth: 800, width: '100%' }}>
            <h1 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Choose your site size</h1>
            <p style={{ textAlign: 'center', color: C.text2, marginBottom: 40, fontSize: 16 }}>You can upgrade anytime as your site grows.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {TIERS.map(t => (
                <button key={t.id} onClick={() => setTier(t.id as any)} style={{
                  background: tier === t.id ? `${t.color}18` : C.bgCard,
                  border: `2px solid ${tier === t.id ? t.color : C.border}`,
                  borderRadius: 18, padding: '28px 24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' as const,
                }}>
                  {t.popular && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: C.gold, color: '#1a1a2e', fontSize: 11, fontWeight: 800, padding: '3px 14px', borderRadius: 20 }}>MOST POPULAR</div>}
                  <div style={{ fontSize: 36, marginBottom: 12 }}>{t.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{t.label}</div>
                  <div style={{ fontSize: 13, color: C.text2, marginBottom: 18 }}>{t.desc}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {t.specs.map(s => <div key={s} style={{ fontSize: 12, color: C.text2, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: t.color }}>✓</span>{s}</div>)}
                  </div>
                  {tier === t.id && <div style={{ marginTop: 16, fontSize: 13, color: t.color, fontWeight: 700 }}>✓ Selected</div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3: DESCRIBE ────────────────────────────────── */}
        {step === 3 && (
          <div style={{ maxWidth: 680, width: '100%' }}>
            <h1 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Tell us about your site</h1>
            <p style={{ textAlign: 'center', color: C.text2, marginBottom: 40, fontSize: 16 }}>Describe your business, audience, and goals in plain English. The more detail, the better.</p>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 4, marginBottom: 20 }}>
              <textarea ref={descRef} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. I run a boutique fitness studio in Austin, Texas. We offer yoga, pilates, and HIIT classes for women aged 25-45. I want to sell class packages and memberships online, showcase our instructors, and run a wellness blog. Our brand is modern, calming, and empowering..."
                rows={7} style={{ width: '100%', padding: '18px 20px', background: 'transparent', border: 'none', color: C.text, fontSize: 15, fontFamily: 'Poppins,sans-serif', resize: 'none', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box' as const }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: description.length < 20 ? C.text3 : C.green }}>{description.length} chars {description.length < 20 ? `(need ${20 - description.length} more)` : '✓'}</span>
              {description.length >= 20 && !aiSummary && !analysing && <span style={{ fontSize: 13, color: C.gold }}>✦ AI will analyse this when you continue</span>}
              {analysing && <span style={{ fontSize: 13, color: C.gold }}>✦ Analysing…</span>}
            </div>
            {aiSummary && (
              <div style={{ marginTop: 16, background: C.goldDim, border: `1px solid ${C.goldBorder}`, borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 6 }}>✦ AI Analysis</div>
                <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>{aiSummary}</div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: FEATURES ────────────────────────────────── */}
        {step === 4 && (
          <div style={{ maxWidth: 760, width: '100%' }}>
            <h1 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>What will your site do?</h1>
            <p style={{ textAlign: 'center', color: C.text2, marginBottom: 40, fontSize: 16 }}>Select everything you need. We'll install the right plugins automatically.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {FEATURES.map(f => {
                const on = features.includes(f.id)
                return (
                  <button key={f.id} onClick={() => setFeatures(prev => on ? prev.filter(x => x !== f.id) : [...prev, f.id])} style={{
                    background: on ? C.goldDim : C.bgCard,
                    border: `2px solid ${on ? C.gold : C.border}`,
                    borderRadius: 14, padding: '20px 14px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>{f.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: on ? C.gold : C.text }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.4 }}>{f.desc}</div>
                    {on && <div style={{ marginTop: 10, width: 20, height: 20, borderRadius: '50%', background: C.gold, color: '#1a1a2e', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '10px auto 0' }}>✓</div>}
                  </button>
                )
              })}
            </div>
            {features.length > 0 && (
              <div style={{ marginTop: 20, padding: '12px 18px', background: C.bgCard, borderRadius: 10, fontSize: 13, color: C.text2, textAlign: 'center' }}>
                {features.length} feature{features.length !== 1 ? 's' : ''} selected — we'll install: {features.flatMap(id => FEATURES.find(f => f.id === id)?.plugin ? [FEATURES.find(f => f.id === id)!.plugin!] : []).join(', ') || 'no extra plugins needed'}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5: THEME ───────────────────────────────────── */}
        {step === 5 && (
          <div style={{ maxWidth: 1100, width: '100%' }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Choose your theme</h1>
            <p style={{ textAlign: 'center', color: C.text2, marginBottom: 24, fontSize: 15 }}>AI-curated themes for your site type. Click Preview to see a live demo.</p>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 6, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4 }}>
                <span style={{ fontSize: 12, color: C.text3, padding: '4px 8px', alignSelf: 'center' }}>Builder:</span>
                {BUILDERS.map(b => (
                  <button key={b} onClick={() => setBuilderFilter(b)} style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: builderFilter === b ? C.gold : 'transparent', color: builderFilter === b ? '#1a1a2e' : C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{b}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4 }}>
                <span style={{ fontSize: 12, color: C.text3, padding: '4px 8px', alignSelf: 'center' }}>Style:</span>
                {THEME_STYLES.map(s => (
                  <button key={s} onClick={() => setStyleFilter(s)} style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: styleFilter === s ? C.gold : 'transparent', color: styleFilter === s ? '#1a1a2e' : C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            </div>

            {loadingThemes ? (
              <div style={{ textAlign: 'center', padding: 60, color: C.text3 }}>
                <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1s linear infinite', display: 'inline-block' }}>✦</div>
                <div>AI is selecting the best themes for your site…</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
                {filteredThemes.map(theme => (
                  <div key={theme.slug} style={{
                    border: `2px solid ${selectedTheme?.slug === theme.slug ? C.gold : C.border}`,
                    borderRadius: 16, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s',
                    background: selectedTheme?.slug === theme.slug ? C.goldDim : C.bgCard,
                  }} onClick={() => setSelectedTheme(theme)}>
                    {/* Theme screenshot */}
                    <div style={{ height: 180, background: `linear-gradient(135deg, ${theme.color1 || '#1a1a4e'}, ${theme.color2 || '#2d2d7a'})`, position: 'relative' as const, overflow: 'hidden' }}>
                      {theme.screenshot && <img src={theme.screenshot} alt={theme.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.currentTarget.style.display='none')} />}
                      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6 }}>
                        <span style={{ background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>{theme.builder}</span>
                        {theme.aiRecommended && <span style={{ background: C.gold, color: '#1a1a2e', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>✦ AI Pick</span>}
                      </div>
                      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: 10, padding: '3px 8px', borderRadius: 6 }}>{theme.style}</div>
                    </div>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{theme.name}</div>
                      <div style={{ fontSize: 12, color: C.text3, marginBottom: 12, lineHeight: 1.5 }}>{theme.desc}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={e => { e.stopPropagation(); setSelectedTheme(theme) }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${selectedTheme?.slug === theme.slug ? C.gold : C.border}`, background: selectedTheme?.slug === theme.slug ? C.gold : 'transparent', color: selectedTheme?.slug === theme.slug ? '#1a1a2e' : C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          {selectedTheme?.slug === theme.slug ? '✓ Selected' : 'Select'}
                        </button>
                        {theme.demoUrl && (
                          <a href={theme.demoUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                            Preview ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 6: BUILD ───────────────────────────────────── */}
        {step === 6 && (
          <div style={{ maxWidth: 640, width: '100%', padding: '20px 0' }}>
            {!building && !builtUrl && (
              <>
                <h1 style={{ fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Ready to build!</h1>
                <p style={{ textAlign: 'center', color: C.text2, marginBottom: 40 }}>We'll set up your entire WordPress site automatically.</p>
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 28 }}>
                  {[
                    ['Domain',   domainType === 'temp' ? tempDomain : customDomain],
                    ['Hosting',  'SiteGround — ' + tier.charAt(0).toUpperCase() + tier.slice(1)],
                    ['Theme',    selectedTheme?.name + ' (' + selectedTheme?.builder + ')'],
                    ['Features', features.map(id => FEATURES.find(f => f.id === id)?.label).filter(Boolean).join(', ') || 'Basic pages only'],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ width: 100, fontSize: 13, color: C.text3 }}>{label}</span>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{val}</span>
                    </div>
                  ))}
                </div>
                <button onClick={startBuild} style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 800, color: '#1a1a2e', cursor: 'pointer' }}>
                  🚀 Build My Site
                </button>
              </>
            )}

            {(building || builtUrl) && (
              <>
                <h1 style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>
                  {builtUrl ? '🎉 Your site is live!' : '🔨 Building your site…'}
                </h1>
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
                  {buildLog.map((log, i) => (
                    <div key={i} style={{ padding: '14px 20px', borderBottom: i < buildLog.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
                        background: log.status === 'done' ? C.greenDim : log.status === 'running' ? C.goldDim : log.status === 'error' ? 'rgba(239,68,68,0.15)' : C.bgCard,
                        color: log.status === 'done' ? C.green : log.status === 'running' ? C.gold : log.status === 'error' ? C.red : C.text3,
                      }}>
                        {log.status === 'done' ? '✓' : log.status === 'running' ? '⋯' : log.status === 'error' ? '✗' : '○'}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: log.status === 'pending' ? C.text3 : C.text }}>{log.step}</div>
                        <div style={{ fontSize: 12, color: C.text3 }}>{log.msg}</div>
                      </div>
                      {log.status === 'running' && <div style={{ marginLeft: 'auto', width: 16, height: 16, border: `2px solid ${C.gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                    </div>
                  ))}
                </div>

                {builtUrl && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, color: C.text2, marginBottom: 20 }}>Your site is live at:<br /><a href={`https://${builtUrl}`} target="_blank" rel="noreferrer" style={{ color: C.gold, fontWeight: 700, fontSize: 20 }}>{builtUrl} ↗</a></div>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                      <a href={`https://${builtUrl}`} target="_blank" rel="noreferrer" style={{ padding: '12px 28px', background: C.gold, borderRadius: 12, color: '#1a1a2e', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>View Site ↗</a>
                      <button onClick={() => router.push(`/dashboard?site=https://${builtUrl}`)} style={{ padding: '12px 28px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Open Dashboard →</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Nav bar */}
      {step < 6 && (
        <div style={{ padding: '20px 40px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} style={{ ...BTN('ghost', step === 0), padding: '12px 24px', fontSize: 14, border: `1px solid ${C.border}` }}>← Back</button>
          <span style={{ fontSize: 13, color: C.text3 }}>Step {step + 1} of {STEPS.length}</span>
          <button onClick={nextStep} disabled={!canNext} style={{ ...BTN('gold', !canNext), padding: '12px 32px', fontSize: 15 }}>
            {step === 5 ? 'Review & Build →' : 'Continue →'}
          </button>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
