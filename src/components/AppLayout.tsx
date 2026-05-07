'use client'
import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const C = {
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', greenBg: '#F0FAF5',
  text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
  sidebar: '#1f2733', sidebarHover: '#2a3444', sidebarBorder: 'rgba(255,255,255,0.08)',
  topbar: '#333333',
}

interface Site { id: string; url: string; name: string | null; connectedAt: string }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const path    = usePathname()
  const [sites, setSites]   = useState<Site[]>([])
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') loadSites()
  }, [status])

  async function loadSites() {
    const res  = await fetch('/api/sites')
    const data = await res.json()
    if (data.sites) setSites(data.sites)
  }

  function siteSlug(url: string) {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }

  const currentSite = sites.find(s => path.includes(encodeURIComponent(s.url)) || path.includes(s.url.replace(/^https?:\/\//,'')))

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FFFFFF' }}>

      {/* ── SIDEBAR ── */}
      <div style={{
        width: 230, flexShrink: 0, background: C.sidebar,
        display: 'flex', flexDirection: 'column' as const,
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '22px 20px', borderBottom: `1px solid ${C.sidebarBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: C.accent, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 5v6l6 4 6-4V5L8 1zm0 2l4 2.7V11L8 13.4 4 11V5.7L8 3z"/></svg>
            </div>
            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: 18, fontWeight: 700, color: 'white' }}>
              ignyous<span style={{ color: C.accent }}>.ai</span>
            </span>
          </div>
        </div>

        {/* My Sites label */}
        <div style={{ padding: '20px 20px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>My Sites</div>
        </div>

        {/* Sites list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sites.length === 0 ? (
            <div style={{ padding: '8px 20px', fontSize: 14, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
              No sites connected yet
            </div>
          ) : sites.map(site => {
            const slug = siteSlug(site.url)
            const active = path.includes(encodeURIComponent(site.url)) || path.includes(slug)
            return (
              <Link key={site.id} href={`/dashboard?site=${encodeURIComponent(site.url)}&key=`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                  textDecoration: 'none', transition: 'background 0.15s',
                  background: active ? 'rgba(232,101,26,0.15)' : 'transparent',
                  borderLeft: `3px solid ${active ? C.accent : 'transparent'}`,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.sidebarHover }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8, background: active ? C.accent : 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
                }}>🌐</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: active ? 'white' : 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {site.name || slug}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {slug}
                  </div>
                </div>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, flexShrink: 0 }}/>
              </Link>
            )
          })}

          {/* Add site button */}
          <Link href="/bridge/connect" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
            textDecoration: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 14,
            transition: 'color 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = 'white')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
          >
            <div style={{ width: 30, height: 30, borderRadius: 8, border: '1.5px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>+</div>
            <span>Connect a site</span>
          </Link>
        </div>

        {/* Bottom nav */}
        <div style={{ borderTop: `1px solid ${C.sidebarBorder}`, padding: '12px 0' }}>
          {[
            { icon: '⚙', label: 'Settings', href: '/settings' },
            { icon: '❓', label: 'Help',     href: '/help' },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
              textDecoration: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 14,
              transition: 'color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'white')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, minWidth: 0, background: '#FFFFFF' }}>

        {/* Top bar */}
        <div style={{
          height: 58, background: C.topbar, borderBottom: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', position: 'sticky', top: 0, zIndex: 50,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          {/* Breadcrumb */}
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {currentSite ? (
              <>
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>Sites</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
                <span style={{ fontWeight: 600, color: 'white' }}>{currentSite.name || siteSlug(currentSite.url)}</span>
              </>
            ) : (
              <span style={{ fontWeight: 600, color: 'white' }}>Dashboard</span>
            )}
          </div>

          {/* Right: notifications + profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Bell */}
            <button style={{ width: 38, height: 38, borderRadius: 9, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, position: 'relative' }}>
              🔔
              <div style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: C.accent, border: '1.5px solid #333333' }}/>
            </button>

            {/* Profile menu */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowMenu(!showMenu)} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px 6px 6px',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10,
                background: 'rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', background: C.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: 'white',
                }}>
                  {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                </div>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'white', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {session?.user?.name || session?.user?.email?.split('@')[0]}
                </span>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="rgba(255,255,255,0.6)"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
              </button>

              {showMenu && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8,
                  background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.15)', minWidth: 200, zIndex: 100, overflow: 'hidden',
                }}>
                  <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{session?.user?.name || 'Account'}</div>
                    <div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>{session?.user?.email}</div>
                  </div>
                  {[
                    { label: 'Account Settings', icon: '⚙', href: '/settings' },
                    { label: 'Billing',           icon: '💳', href: '/billing' },
                    { label: 'Help & Support',    icon: '❓', href: '/help' },
                  ].map(item => (
                    <Link key={item.href} href={item.href} onClick={() => setShowMenu(false)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
                      textDecoration: 'none', color: C.text, fontSize: 15, transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.surface)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
                    </Link>
                  ))}
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    <button onClick={() => signOut({ callbackUrl: '/login' })} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', fontSize: 15,
                      textAlign: 'left' as const, fontFamily: 'DM Sans, sans-serif',
                    }}>
                      <span style={{ fontSize: 16 }}>🚪</span> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, background: '#FFFFFF' }}>{children}</div>
      </div>
    </div>
  )
}