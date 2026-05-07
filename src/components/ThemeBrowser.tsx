'use client'
import { useState } from 'react'

// WordPress.org themes with real screenshot URLs
const THEMES = [
  // Elementor-first
  { slug: 'hello-elementor',   name: 'Hello Elementor',    builders: ['elementor'],            industry: ['all'],          style: ['minimal','blank'],      color: 'light', recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/hello-elementor/screenshots/hello-elementor.jpg',   desc: 'The official Elementor companion theme. Blank canvas, blazing fast.' },
  { slug: 'astra',             name: 'Astra',              builders: ['elementor','gutenberg'], industry: ['all'],          style: ['business','minimal'],   color: 'light', recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/astra/screenshots/astra.jpg',                       desc: 'Most popular WordPress theme. Works beautifully with Elementor.' },
  { slug: 'oceanwp',           name: 'OceanWP',            builders: ['elementor','gutenberg'], industry: ['ecommerce'],    style: ['business','ecommerce'], color: 'light', recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/oceanwp/screenshots/oceanwp.jpg',                   desc: 'Feature-rich with WooCommerce built in. Perfect for online stores.' },
  { slug: 'neve',              name: 'Neve',               builders: ['elementor','gutenberg'], industry: ['all'],          style: ['modern','business'],    color: 'light', recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/neve/screenshots/neve.jpg',                         desc: 'AMP-ready, mobile-first. Starter sites for every industry.' },
  { slug: 'porto',             name: 'Porto',              builders: ['elementor'],             industry: ['ecommerce'],    style: ['ecommerce','modern'],   color: 'light', recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/storefront/screenshots/storefront.jpg',             desc: 'Multi-purpose eCommerce powerhouse.' },
  // Gutenberg / Block
  { slug: 'kadence',           name: 'Kadence',            builders: ['gutenberg'],             industry: ['all'],          style: ['modern','fast'],        color: 'light', recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/kadence/screenshots/kadence.jpg',                   desc: 'Full site editing with global colors and fonts. Built for blocks.' },
  { slug: 'generatepress',     name: 'GeneratePress',      builders: ['gutenberg','elementor'], industry: ['all'],          style: ['minimal','fast'],       color: 'light', recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/generatepress/screenshots/generatepress.jpg',       desc: 'Lightweight and performance focused. Highest speed scores.' },
  { slug: 'blocksy',           name: 'Blocksy',            builders: ['gutenberg'],             industry: ['all'],          style: ['modern','blog'],        color: 'light', recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/blocksy/screenshots/blocksy.jpg',                   desc: 'Advanced full-site editor with real-time customization.' },
  { slug: 'twentytwentyfour', name: 'Twenty Twenty-Four', builders: ['gutenberg'],             industry: ['blog','all'],   style: ['minimal'],              color: 'light', recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/twentytwentyfour/screenshots/twentytwentyfour.jpg', desc: 'Official 2024 WordPress theme. Clean and versatile.' },
  { slug: 'storefront',        name: 'Storefront',         builders: ['gutenberg'],             industry: ['ecommerce'],    style: ['ecommerce'],            color: 'light', recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/storefront/screenshots/storefront.jpg',             desc: 'Official WooCommerce theme. Built for online stores.' },
  // Avada
  { slug: 'avada',             name: 'Avada',              builders: ['avada'],                 industry: ['all'],          style: ['business','powerful'],  color: 'dark', recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/astra/screenshots/astra.jpg',                       desc: '#1 selling WordPress theme ever. Includes Fusion Builder.' },
  { slug: 'enfold',            name: 'Enfold',             builders: ['avada'],                 industry: ['business'],     style: ['business','clean'],     color: 'light', recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/neve/screenshots/neve.jpg',                         desc: 'Highly rated business theme with visual composer.' },
  // Niche
  { slug: 'restauranteur',     name: 'Restauranteur',      builders: ['gutenberg','elementor'], industry: ['restaurant'],   style: ['restaurant','elegant'], color: 'dark', recommended: true,  img: 'https://i0.wp.com/themes.svn.wordpress.org/biagiotti/screenshots/biagiotti.jpg',               desc: 'Purpose-built for restaurants. Menus, reservations, hours.' },
  { slug: 'photos',            name: 'Photos',             builders: ['gutenberg'],             industry: ['photography'],  style: ['photography','minimal'],color: 'dark', recommended: false, img: 'https://i0.wp.com/themes.svn.wordpress.org/photos/screenshots/photos.jpg',                     desc: 'Full-screen photography portfolio. Stunning visual impact.' },
]

const INDUSTRIES = ['All Industries', 'all', 'ecommerce', 'restaurant', 'photography', 'business', 'blog']
const STYLES     = ['All Styles', 'minimal', 'modern', 'business', 'ecommerce', 'restaurant', 'photography', 'elegant', 'fast', 'powerful']
const COLORS     = ['Any Color', 'light', 'dark']

interface Props {
  onSelect:     (theme: typeof THEMES[0]) => void
  onClose:      () => void
  currentTheme?: string
}

export default function ThemeBrowser({ onSelect, onClose, currentTheme }: Props) {
  const [builder,  setBuilder]  = useState<'elementor' | 'gutenberg' | 'avada'>('elementor')
  const [industry, setIndustry] = useState('All Industries')
  const [style,    setStyle]    = useState('All Styles')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = THEMES.filter(th => {
    if (!th.builders.includes(builder)) return false
    if (industry !== 'All Industries' && !th.industry.includes(industry) && !th.industry.includes('all')) return false
    if (style !== 'All Styles' && !th.style.includes(style)) return false
    if (search && !th.name.toLowerCase().includes(search.toLowerCase()) && !th.desc.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const recommended = filtered.filter(t => t.recommended)
  const others      = filtered.filter(t => !t.recommended)

  function ThemeCard({ theme }: { theme: typeof THEMES[0] }) {
    const isCurrent  = currentTheme?.toLowerCase().includes(theme.slug)
    const isSelected = selected === theme.slug

    return (
      <div style={{
        borderRadius: 14, overflow: 'hidden', background: 'white',
        border: `2px solid ${isSelected ? '#E8651A' : '#E2DDD8'}`,
        boxShadow: isSelected ? '0 6px 24px rgba(232,101,26,0.18)' : '0 1px 4px rgba(0,0,0,0.08)',
        transition: 'all 0.2s', cursor: 'pointer', position: 'relative',
      }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = '#FED7AA' }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = '#E2DDD8' }}
      >
        {/* Recommended badge */}
        {theme.recommended && (
          <div style={{
            position: 'absolute', top: 12, left: 12, zIndex: 2,
            padding: '4px 10px', background: '#E8651A', color: 'white',
            borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
          }}>Recommended</div>
        )}
        {isCurrent && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            padding: '4px 10px', background: '#1E7B4B', color: 'white',
            borderRadius: 20, fontSize: 11, fontWeight: 700,
          }}>Current</div>
        )}
        {isSelected && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            width: 28, height: 28, borderRadius: '50%', background: '#E8651A',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14,
          }}>✓</div>
        )}

        {/* Screenshot */}
        <div style={{ height: 180, overflow: 'hidden', background: '#F7F5F2', position: 'relative' }}>
          <img
            src={theme.img} alt={theme.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.3s' }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            onError={e => { (e.target as HTMLImageElement).src = `https://via.placeholder.com/400x250/F7F5F2/A89D94?text=${theme.name}` }}
          />
        </div>

        {/* Info */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1410', marginBottom: 4, fontFamily: 'Sora, sans-serif' }}>{theme.name}</div>
          <div style={{ fontSize: 12, color: '#6B6056', lineHeight: 1.5, marginBottom: 12, minHeight: 36 }}>{theme.desc}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const }}>
            {theme.style.map(s => (
              <span key={s} style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: '#F7F5F2', color: '#6B6056', border: '1px solid #E2DDD8', textTransform: 'capitalize' as const }}>{s}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setSelected(theme.slug); onSelect(theme) }}
              style={{
                flex: 1, padding: '9px', border: 'none', borderRadius: 9,
                background: isSelected ? '#1E7B4B' : '#E8651A', color: 'white',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {isSelected ? '✓ Selected' : 'Use This Theme'}
            </button>
            <a
              href={`https://wordpress.org/themes/${theme.slug}/`}
              target="_blank" rel="noreferrer"
              style={{
                padding: '9px 12px', border: '1px solid #E2DDD8', borderRadius: 9,
                color: '#6B6056', textDecoration: 'none', fontSize: 13, display: 'flex',
                alignItems: 'center', background: 'white',
              }}
            >↗</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', height: '90vh', background: '#F7F5F2', borderRadius: '24px 24px 0 0', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '22px 32px', background: 'white', borderBottom: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: '#1A1410' }}>Choose the Design</div>
            <div style={{ fontSize: 14, color: '#6B6056', marginTop: 3 }}>
              {currentTheme && `Currently: ${currentTheme} · `}{filtered.length} themes match your filters
            </div>
          </div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #E2DDD8', background: '#F7F5F2', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6056' }}>✕</button>
        </div>

        {/* Filters bar */}
        <div style={{ padding: '16px 32px', background: 'white', borderBottom: '1px solid #E2DDD8', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16 }} viewBox="0 0 20 20" fill="#A89D94">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/>
            </svg>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search styles, industry, features…"
              style={{ width: '100%', padding: '10px 14px 10px 38px', border: '1.5px solid #E2DDD8', borderRadius: 12, fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#1A1410', background: '#FAFAF8' }}
            />
          </div>

          {/* Industry dropdown */}
          <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ padding: '10px 14px', border: '1.5px solid #E2DDD8', borderRadius: 12, fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#1A1410', background: 'white', cursor: 'pointer', minWidth: 160 }}>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i === 'all' ? 'All Industries' : i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
          </select>

          {/* Style dropdown */}
          <select value={style} onChange={e => setStyle(e.target.value)} style={{ padding: '10px 14px', border: '1.5px solid #E2DDD8', borderRadius: 12, fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#1A1410', background: 'white', cursor: 'pointer', minWidth: 140 }}>
            {STYLES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>

          {/* Builder switcher */}
          <div style={{ display: 'flex', border: '1.5px solid #E2DDD8', borderRadius: 12, overflow: 'hidden', background: 'white', marginLeft: 'auto' }}>
            {([
              { id: 'gutenberg', label: '⬡ Block Editor' },
              { id: 'elementor', label: '☰ Elementor' },
              { id: 'avada',     label: '★ Avada' },
            ] as const).map(b => (
              <button key={b.id} onClick={() => setBuilder(b.id)} style={{
                padding: '9px 18px', border: 'none', borderRight: '1px solid #E2DDD8',
                background: builder === b.id ? '#1A1410' : 'white',
                color: builder === b.id ? 'white' : '#6B6056',
                fontSize: 13, fontWeight: builder === b.id ? 600 : 400,
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                transition: 'all 0.15s',
              }}>{b.label}</button>
            ))}
          </div>
        </div>

        {/* Theme grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '60px', color: '#A89D94', fontSize: 15 }}>
              No themes match your filters. Try changing the builder or clearing some filters.
            </div>
          ) : (
            <>
              {/* Recommended section */}
              {recommended.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#A89D94', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 16 }}>
                    ✦ Recommended for your site
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                    {recommended.map(th => <ThemeCard key={th.slug} theme={th}/>)}
                  </div>
                </div>
              )}

              {/* All themes */}
              {others.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#A89D94', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 16 }}>
                    All Themes
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                    {others.map(th => <ThemeCard key={th.slug} theme={th}/>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}