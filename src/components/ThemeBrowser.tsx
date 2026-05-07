'use client'
import { useState } from 'react'

// Screenshot via thum.io - screenshots the actual WP.org theme page
function themeImg(slug: string) {
  return `https://image.thum.io/get/width/600/crop/420/noanimate/https://wordpress.org/themes/${slug}/`
}

const THEMES = [
  // Elementor
  { slug: 'hello-elementor',   name: 'Hello Elementor',    builder: 'elementor', industry: ['all'],       style: ['minimal','blank'],     recommended: true,  desc: 'Official blank Elementor canvas. Fastest load times.' },
  { slug: 'astra',             name: 'Astra',              builder: 'elementor', industry: ['all'],       style: ['business','minimal'],  recommended: true,  desc: 'Most popular WordPress theme. Works perfectly with Elementor.' },
  { slug: 'neve',              name: 'Neve',               builder: 'elementor', industry: ['all'],       style: ['modern','business'],   recommended: true,  desc: 'AMP-ready, mobile-first. Pre-built starter sites for every industry.' },
  { slug: 'oceanwp',          name: 'OceanWP',            builder: 'elementor', industry: ['ecommerce'], style: ['ecommerce','business'], recommended: false, desc: 'Feature-rich with WooCommerce built in. Great for stores.' },
  { slug: 'generatepress',    name: 'GeneratePress',      builder: 'elementor', industry: ['all'],       style: ['minimal','fast'],      recommended: false, desc: 'Extremely lightweight. Best performance scores.' },
  { slug: 'blocksy',          name: 'Blocksy',            builder: 'elementor', industry: ['all'],       style: ['modern','blog'],       recommended: false, desc: 'Advanced customization with real-time preview.' },
  // Gutenberg
  { slug: 'kadence',          name: 'Kadence',            builder: 'gutenberg', industry: ['all'],       style: ['modern','fast'],       recommended: true,  desc: 'Full site editing with global styles. Built for blocks.' },
  { slug: 'astra',            name: 'Astra',              builder: 'gutenberg', industry: ['all'],       style: ['business','minimal'],  recommended: true,  desc: 'Works great with the block editor. Lightweight and fast.' },
  { slug: 'generatepress',    name: 'GeneratePress',      builder: 'gutenberg', industry: ['all'],       style: ['minimal','fast'],      recommended: true,  desc: 'Performance-first. Highest speed scores available.' },
  { slug: 'blocksy',         name: 'Blocksy',            builder: 'gutenberg', industry: ['all'],       style: ['modern','blog'],       recommended: false, desc: 'Advanced FSE with WooCommerce support built in.' },
  { slug: 'twentytwentyfour',name: 'Twenty Twenty-Four', builder: 'gutenberg', industry: ['all'],       style: ['minimal'],             recommended: false, desc: 'Official 2024 WordPress theme. Clean and block-based.' },
  { slug: 'storefront',      name: 'Storefront',         builder: 'gutenberg', industry: ['ecommerce'], style: ['ecommerce'],           recommended: false, desc: 'Official WooCommerce theme. Purpose-built for stores.' },
  // Avada
  { slug: 'avada',           name: 'Avada',              builder: 'avada',     industry: ['all'],       style: ['powerful','business'], recommended: true,  desc: '#1 selling WordPress theme ever. 80+ elements included.' },
  { slug: 'neve',            name: 'Neve',               builder: 'avada',     industry: ['all'],       style: ['modern','business'],   recommended: false, desc: 'Works with Avada Fusion Builder. Mobile-first design.' },
  { slug: 'astra',           name: 'Astra',              builder: 'avada',     industry: ['all'],       style: ['business','minimal'],  recommended: false, desc: 'Lightweight base theme compatible with Avada.' },
]

const INDUSTRIES = ['All', 'Business', 'eCommerce', 'Restaurant', 'Photography', 'Blog']
const STYLES     = ['All Styles', 'Minimal', 'Modern', 'Business', 'eCommerce', 'Creative', 'Fast']
type Builder     = 'elementor' | 'gutenberg' | 'avada'

interface Props { onSelect: (theme: any) => void; onClose: () => void; currentTheme?: string; siteName?: string }

export default function ThemeBrowser({ onSelect, onClose, currentTheme, siteName }: Props) {
  const [builder,  setBuilder]  = useState<Builder>('elementor')
  const [industry, setIndustry] = useState('All')
  const [style,    setStyle]    = useState('All Styles')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = THEMES.filter(t => {
    if (t.builder !== builder) return false
    if (industry !== 'All' && !t.industry.includes('all') && !t.industry.includes(industry.toLowerCase())) return false
    if (style !== 'All Styles' && !t.style.includes(style.toLowerCase())) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.desc.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Deduplicate by slug
  const seen = new Set<string>()
  const unique = filtered.filter(t => { if (seen.has(t.slug)) return false; seen.add(t.slug); return true })
  const recommended = unique.filter(t => t.recommended)
  const rest        = unique.filter(t => !t.recommended)

  const BUILDER_TABS = [
    { id: 'gutenberg' as Builder, icon: '⬡', label: 'Block Editor' },
    { id: 'elementor' as Builder, icon: '☰', label: 'Elementor' },
    { id: 'avada'     as Builder, icon: '★', label: 'Avada Builder' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F4F5F7', zIndex: 2000, display: 'flex', flexDirection: 'column' as const, fontFamily: 'Inter, sans-serif' }}>

      {/* TOP BAR */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', border: '1px solid #E2E8F0', borderRadius: 9, background: 'white', cursor: 'pointer', fontSize: 15, fontWeight: 500, color: '#4A5568', fontFamily: 'Inter, sans-serif' }}>
          ← Back
        </button>

        {/* Builder tabs */}
        <div style={{ display: 'flex', border: '1.5px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          {BUILDER_TABS.map(tab => (
            <button key={tab.id} onClick={() => setBuilder(tab.id)} style={{
              padding: '10px 26px', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              fontSize: 15, fontWeight: builder === tab.id ? 600 : 400,
              background: builder === tab.id ? '#1f2733' : 'white',
              color: builder === tab.id ? 'white' : '#718096',
              borderRight: tab.id !== 'avada' ? '1px solid #E2E8F0' : 'none',
              display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: '#718096' }}>{unique.length} themes</span>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#718096' }}>✕</button>
        </div>
      </div>

      {/* TITLE + SEARCH + FILTERS */}
      <div style={{ background: 'white', padding: '24px 40px 18px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: 26, fontWeight: 700, color: '#1A202C', textAlign: 'center' as const, marginBottom: 18 }}>Choose the Design</h1>

        <div style={{ position: 'relative', maxWidth: 540, margin: '0 auto 16px' }}>
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} width="17" height="17" viewBox="0 0 20 20" fill="#A0AEC0">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search themes…"
            style={{ width: '100%', padding: '11px 14px 11px 42px', border: '1.5px solid #E2E8F0', borderRadius: 11, fontSize: 15, fontFamily: 'Inter, sans-serif', color: '#1A202C' }}/>
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#A0AEC0', fontSize: 17 }}>✕</button>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, flexWrap: 'wrap' as const }}>
          {INDUSTRIES.map(ind => (
            <button key={ind} onClick={() => setIndustry(ind)} style={{
              padding: '6px 15px', border: `1.5px solid ${industry === ind ? '#E8651A' : '#E2E8F0'}`,
              borderRadius: 20, background: industry === ind ? '#FFF7ED' : 'white',
              color: industry === ind ? '#E8651A' : '#4A5568', fontSize: 14, fontWeight: industry === ind ? 600 : 400,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}>{ind}</button>
          ))}
          <select value={style} onChange={e => setStyle(e.target.value)} style={{ padding: '6px 12px', border: '1.5px solid #E2E8F0', borderRadius: 20, fontSize: 14, fontFamily: 'Inter, sans-serif', color: '#4A5568', background: 'white', cursor: 'pointer' }}>
            {STYLES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* GRID */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px 60px' }}>
        {unique.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '80px', color: '#718096', fontSize: 16 }}>No themes match. Try changing the filters.</div>
        ) : (
          <>
            {recommended.length > 0 && (
              <div style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#A0AEC0', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 18 }}>✦ Recommended</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                  {recommended.map(t => <Card key={t.slug+t.builder} theme={t} selected={selected} setSelected={setSelected} onSelect={onSelect} currentTheme={currentTheme}/>)}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                {recommended.length > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#A0AEC0', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 18 }}>All Themes</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                  {rest.map(t => <Card key={t.slug+t.builder} theme={t} selected={selected} setSelected={setSelected} onSelect={onSelect} currentTheme={currentTheme}/>)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Card({ theme, selected, setSelected, onSelect, currentTheme }: any) {
  const [imgErr, setImgErr] = useState(false)
  const [hovered, setHovered] = useState(false)
  const isSelected = selected === theme.slug + theme.builder
  const isCurrent  = currentTheme?.toLowerCase().includes(theme.slug)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white', borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
        border: `2px solid ${isSelected ? '#E8651A' : hovered ? '#CBD5E0' : '#E2E8F0'}`,
        boxShadow: isSelected ? '0 8px 30px rgba(232,101,26,0.2)' : hovered ? '0 4px 20px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'all 0.2s', position: 'relative',
      }}
    >
      {theme.recommended && (
        <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 2, padding: '5px 13px', background: '#E8651A', color: 'white', borderRadius: 20, fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(232,101,26,0.4)' }}>Recommended</div>
      )}
      {isCurrent && <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, padding: '5px 13px', background: '#1E7B4B', color: 'white', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>Current</div>}
      {isSelected && !isCurrent && <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, width: 32, height: 32, borderRadius: '50%', background: '#E8651A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, boxShadow: '0 2px 8px rgba(232,101,26,0.4)' }}>✓</div>}

      {/* Screenshot */}
      <div style={{ height: 320, overflow: 'hidden', background: '#F0F4F8', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!imgErr ? (
          <img
            src={themeImg(theme.slug)}
            alt={theme.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block', transition: 'transform 0.4s' }}
            onError={() => setImgErr(true)}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        ) : (
          <div style={{ textAlign: 'center' as const, padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎨</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#4A5568' }}>{theme.name}</div>
            <a href={`https://wordpress.org/themes/${theme.slug}/`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#E8651A', textDecoration: 'none', marginTop: 8, display: 'block' }}>Preview on WP.org ↗</a>
          </div>
        )}
        {hovered && !imgErr && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <a href={`https://wordpress.org/themes/${theme.slug}/`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              style={{ padding: '10px 22px', background: 'white', borderRadius: 10, color: '#1A202C', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Preview on WP.org ↗
            </a>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '16px 20px 20px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#1A202C', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>{theme.name}</div>
        <div style={{ fontSize: 13, color: '#718096', lineHeight: 1.55, marginBottom: 14 }}>{theme.desc}</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' as const }}>
          {theme.style.map((s: string) => (
            <span key={s} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 12, background: '#F7FAFC', color: '#4A5568', border: '1px solid #E2E8F0', textTransform: 'capitalize' as const }}>{s}</span>
          ))}
        </div>
        <button onClick={() => { setSelected(theme.slug + theme.builder); onSelect(theme) }} style={{
          width: '100%', padding: '11px', border: 'none', borderRadius: 10,
          background: isSelected ? '#1E7B4B' : '#E8651A', color: 'white',
          fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}>
          {isSelected ? '✓ Selected' : 'Use This Theme'}
        </button>
      </div>
    </div>
  )
}
