'use client'
import { useState } from 'react'

const THEMES = [
  // Elementor
  { slug: 'hello-elementor',  name: 'Hello Elementor',   builder: 'elementor', industry: ['all'],         style: ['minimal','blank'],    recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/hello-elementor/screenshots/hello-elementor.jpg',   desc: 'The official blank Elementor canvas. Fastest load times.' },
  { slug: 'astra',            name: 'Astra',             builder: 'elementor', industry: ['all'],         style: ['business','minimal'], recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/astra/screenshots/astra.jpg',                       desc: 'Most popular WordPress theme. Works perfectly with Elementor.' },
  { slug: 'neve',             name: 'Neve',              builder: 'elementor', industry: ['all'],         style: ['modern','business'],  recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/neve/screenshots/neve.jpg',                         desc: 'AMP-ready, mobile-first. Pre-built starter sites for every industry.' },
  { slug: 'oceanwp',         name: 'OceanWP',           builder: 'elementor', industry: ['ecommerce'],   style: ['ecommerce','business'],recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/oceanwp/screenshots/oceanwp.jpg',                   desc: 'Feature-rich with WooCommerce built in. Great for stores.' },
  { slug: 'generatepress',   name: 'GeneratePress',     builder: 'elementor', industry: ['all'],         style: ['minimal','fast'],     recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/generatepress/screenshots/generatepress.jpg',       desc: 'Extremely lightweight. Best performance scores available.' },
  { slug: 'porto',           name: 'Porto',             builder: 'elementor', industry: ['ecommerce'],   style: ['ecommerce','modern'], recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/storefront/screenshots/storefront.jpg',             desc: 'Premium multipurpose eCommerce powerhouse with 40+ demos.' },
  // Gutenberg / Block Editor
  { slug: 'kadence',         name: 'Kadence',           builder: 'gutenberg', industry: ['all'],         style: ['modern','fast'],      recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/kadence/screenshots/kadence.jpg',                   desc: 'Full site editing with global styles. Built for blocks.' },
  { slug: 'blocksy',        name: 'Blocksy',           builder: 'gutenberg', industry: ['all'],         style: ['modern','blog'],      recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/blocksy/screenshots/blocksy.jpg',                   desc: 'Advanced FSE with real-time customization and WooCommerce support.' },
  { slug: 'twentytwentyfour',name: 'Twenty Twenty-Four',builder: 'gutenberg', industry: ['blog','all'],  style: ['minimal'],            recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/twentytwentyfour/screenshots/twentytwentyfour.jpg', desc: 'Official 2024 WordPress theme. Clean, versatile, fully block-based.' },
  { slug: 'storefront',     name: 'Storefront',        builder: 'gutenberg', industry: ['ecommerce'],   style: ['ecommerce'],          recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/storefront/screenshots/storefront.jpg',             desc: 'Official WooCommerce theme. Purpose-built for online stores.' },
  { slug: 'generatepress',  name: 'GeneratePress',     builder: 'gutenberg', industry: ['all'],         style: ['minimal','fast'],     recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/generatepress/screenshots/generatepress.jpg',       desc: 'Performance-first. Lightweight, accessible, and SEO-ready.' },
  { slug: 'spectra-one',    name: 'Spectra One',       builder: 'gutenberg', industry: ['business'],    style: ['modern','business'],  recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/neve/screenshots/neve.jpg',                         desc: 'Purpose-built for Spectra blocks. Professional business layouts.' },
  // Avada
  { slug: 'avada',          name: 'Avada',             builder: 'avada',     industry: ['all'],         style: ['powerful','business'],recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/astra/screenshots/astra.jpg',                       desc: '#1 selling WordPress theme. Includes Fusion Builder with 80+ elements.' },
  { slug: 'enfold',         name: 'Enfold',            builder: 'avada',     industry: ['business'],    style: ['business','clean'],   recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/neve/screenshots/neve.jpg',                         desc: 'Highly rated. Clean design with built-in visual composer.' },
  { slug: 'bridge',         name: 'Bridge',            builder: 'avada',     industry: ['all'],         style: ['creative','modern'],  recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/blocksy/screenshots/blocksy.jpg',                   desc: 'Creative multipurpose with 550+ pre-built websites.' },
]

const INDUSTRIES = ['All', 'Business', 'eCommerce', 'Restaurant', 'Photography', 'Blog', 'Portfolio']
const STYLES     = ['All Styles', 'Minimal', 'Modern', 'Business', 'eCommerce', 'Creative', 'Elegant', 'Fast']

type Builder = 'elementor' | 'gutenberg' | 'avada'

interface Props {
  onSelect:     (theme: typeof THEMES[0]) => void
  onClose:      () => void
  currentTheme?: string
  siteName?:    string
}

export default function ThemeBrowser({ onSelect, onClose, currentTheme, siteName }: Props) {
  const [builder,  setBuilder]  = useState<Builder>('elementor')
  const [industry, setIndustry] = useState('All')
  const [style,    setStyle]    = useState('All Styles')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered,  setHovered]  = useState<string | null>(null)

  const filtered = THEMES.filter(t => {
    if (t.builder !== builder) return false
    if (industry !== 'All' && !t.industry.includes('all') && !t.industry.includes(industry.toLowerCase())) return false
    if (style !== 'All Styles' && !t.style.includes(style.toLowerCase())) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.desc.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const recommended = filtered.filter(t => t.recommended)
  const rest        = filtered.filter(t => !t.recommended)
  const display     = [...recommended, ...rest]

  const BUILDER_TABS: { id: Builder; icon: string; label: string }[] = [
    { id: 'gutenberg', icon: '⬡', label: 'Block Editor' },
    { id: 'elementor', icon: '☰', label: 'Elementor' },
    { id: 'avada',     icon: '★', label: 'Avada Builder' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#F4F5F7', zIndex: 1000,
      display: 'flex', flexDirection: 'column' as const, fontFamily: 'Inter, sans-serif',
    }}>

      {/* ── TOP BAR ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, flexShrink: 0 }}>
        {/* Back */}
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', border: '1px solid #E2E8F0', borderRadius: 9, background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#4A5568', fontFamily: 'Inter, sans-serif' }}>
          ← Back
        </button>

        {/* Builder tabs - centered */}
        <div style={{ display: 'flex', border: '1.5px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
          {BUILDER_TABS.map(tab => (
            <button key={tab.id} onClick={() => setBuilder(tab.id)} style={{
              padding: '10px 24px', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              fontSize: 15, fontWeight: builder === tab.id ? 600 : 400,
              background: builder === tab.id ? '#1A202C' : 'white',
              color: builder === tab.id ? 'white' : '#718096',
              borderRight: tab.id !== 'avada' ? '1px solid #E2E8F0' : 'none',
              display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: count + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: '#718096' }}>{display.length} themes</span>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#718096' }}>✕</button>
        </div>
      </div>

      {/* ── TITLE + SEARCH + FILTERS ── */}
      <div style={{ background: 'white', padding: '28px 40px 20px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: 28, fontWeight: 700, color: '#1A202C', textAlign: 'center' as const, marginBottom: 20 }}>
          Choose the Design
        </h1>

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto 18px' }}>
          <svg style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} width="18" height="18" viewBox="0 0 20 20" fill="#A0AEC0">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/>
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by style, industry, features…"
            style={{ width: '100%', padding: '13px 16px 13px 46px', border: '1.5px solid #E2E8F0', borderRadius: 12, fontSize: 15, fontFamily: 'Inter, sans-serif', color: '#1A202C', background: 'white' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#A0AEC0', fontSize: 18 }}>✕</button>
          )}
        </div>

        {/* Industry + Style filters */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          {INDUSTRIES.map(ind => (
            <button key={ind} onClick={() => setIndustry(ind)} style={{
              padding: '6px 16px', border: `1.5px solid ${industry === ind ? '#E8651A' : '#E2E8F0'}`,
              borderRadius: 20, background: industry === ind ? '#FFF7ED' : 'white',
              color: industry === ind ? '#E8651A' : '#4A5568', fontSize: 14, fontWeight: industry === ind ? 600 : 400,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
            }}>{ind}</button>
          ))}
          <div style={{ width: 1, height: 28, background: '#E2E8F0', margin: '0 4px' }}/>
          <select value={style} onChange={e => setStyle(e.target.value)} style={{ padding: '6px 14px', border: '1.5px solid #E2E8F0', borderRadius: 20, fontSize: 14, fontFamily: 'Inter, sans-serif', color: '#4A5568', background: 'white', cursor: 'pointer' }}>
            {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ── THEME GRID ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px 60px' }}>

        {display.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '80px', color: '#718096', fontSize: 16 }}>
            No themes match. Try changing the filters or search term.
          </div>
        ) : (
          <>
            {/* Recommended section */}
            {recommended.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#A0AEC0', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 20 }}>
                  ✦ Recommended for {siteName || 'your site'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                  {recommended.map(theme => <ThemeCard key={theme.slug} theme={theme} selected={selected} hovered={hovered} setHovered={setHovered} setSelected={setSelected} onSelect={onSelect} currentTheme={currentTheme}/>)}
                </div>
              </div>
            )}

            {/* All themes */}
            {rest.length > 0 && (
              <div>
                {recommended.length > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#A0AEC0', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 20 }}>
                    All {builder === 'gutenberg' ? 'Block Editor' : builder === 'elementor' ? 'Elementor' : 'Avada'} Themes
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                  {rest.map(theme => <ThemeCard key={theme.slug} theme={theme} selected={selected} hovered={hovered} setHovered={setHovered} setSelected={setSelected} onSelect={onSelect} currentTheme={currentTheme}/>)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ThemeCard({ theme, selected, hovered, setHovered, setSelected, onSelect, currentTheme }: any) {
  const isSelected = selected === theme.slug
  const isCurrent  = currentTheme?.toLowerCase().includes(theme.slug)
  const isHovered  = hovered === theme.slug

  return (
    <div
      style={{
        background: 'white', borderRadius: 16, overflow: 'hidden',
        border: `2px solid ${isSelected ? '#E8651A' : isHovered ? '#CBD5E0' : '#E2E8F0'}`,
        boxShadow: isSelected ? '0 8px 30px rgba(232,101,26,0.2)' : isHovered ? '0 4px 20px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'all 0.2s', cursor: 'pointer', position: 'relative',
      }}
      onMouseEnter={() => setHovered(theme.slug)}
      onMouseLeave={() => setHovered(null)}
    >
      {/* Recommended badge */}
      {theme.recommended && (
        <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 2, padding: '5px 13px', background: '#E8651A', color: 'white', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', boxShadow: '0 2px 8px rgba(232,101,26,0.4)' }}>
          Recommended
        </div>
      )}
      {isCurrent && (
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, padding: '5px 13px', background: '#1E7B4B', color: 'white', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
          Current
        </div>
      )}
      {isSelected && !isCurrent && (
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, width: 32, height: 32, borderRadius: '50%', background: '#E8651A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, boxShadow: '0 2px 8px rgba(232,101,26,0.4)' }}>✓</div>
      )}

      {/* Screenshot — tall card like reference image */}
      <div style={{ height: 340, overflow: 'hidden', background: '#F7FAFC', position: 'relative' }}>
        <img
          src={theme.img} alt={theme.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block', transition: 'transform 0.4s' }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        {/* Hover overlay with preview button */}
        {isHovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <a href={`https://wordpress.org/themes/${theme.slug}/`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              style={{ padding: '10px 22px', background: 'white', borderRadius: 10, color: '#1A202C', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Preview ↗
            </a>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '16px 20px 20px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#1A202C', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>{theme.name}</div>
        <div style={{ fontSize: 13, color: '#718096', lineHeight: 1.55, marginBottom: 14 }}>{theme.desc}</div>

        {/* Style tags */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const }}>
          {theme.style.map((s: string) => (
            <span key={s} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: '#F7FAFC', color: '#4A5568', border: '1px solid #E2E8F0', textTransform: 'capitalize' as const }}>{s}</span>
          ))}
        </div>

        <button
          onClick={() => { setSelected(theme.slug); onSelect(theme) }}
          style={{
            width: '100%', padding: '11px', border: 'none', borderRadius: 10,
            background: isSelected ? '#1E7B4B' : '#E8651A', color: 'white',
            fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            transition: 'background 0.15s',
          }}
        >
          {isSelected ? '✓ Selected' : 'Use This Theme'}
        </button>
      </div>
    </div>
  )
}
