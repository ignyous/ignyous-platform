'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const path = usePathname()

  const links = [
    { href: '/',                label: 'Dashboard' },
    { href: '/bridge/connect',  label: 'Connect Site' },
    { href: '/bridge/new',      label: 'New Site' },
  ]

  return (
    <nav style={{
      height: 60, background: '#FFFFFF',
      borderBottom: '1px solid #E2DDD8',
      display: 'flex', alignItems: 'center',
      padding: '0 32px', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 100,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, background: '#E8651A', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="white">
            <path d="M8 1L2 5v6l6 4 6-4V5L8 1zm0 2l4 2.7V11L8 13.4 4 11V5.7L8 3z"/>
          </svg>
        </div>
        <span style={{
          fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 700, color: '#1A1410',
        }}>
          ignyous<span style={{ color: '#E8651A' }}>.ai</span>
        </span>
      </Link>

      {/* Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {links.map(link => (
          <Link key={link.href} href={link.href} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500,
            textDecoration: 'none',
            background: path === link.href ? '#FFF0E8' : 'transparent',
            color: path === link.href ? '#E8651A' : '#6B6056',
            transition: 'all 0.15s',
          }}>
            {link.label}
          </Link>
        ))}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
          background: '#F0FAF5', border: '1px solid #B8E5CF', color: '#1E7B4B',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1E7B4B' }}/>
          All systems live
        </div>
      </div>
    </nav>
  )
}
