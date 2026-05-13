'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { designSystem } from '@/lib/designSystem'

export default function Nav() {
  const path = usePathname()
  const C = designSystem.colors

  const links = [
    { href: '/',                label: 'Dashboard' },
    { href: '/bridge/connect',  label: 'Connect Site' },
    { href: '/bridge/new',      label: 'New Site' },
  ]

  return (
    <nav style={{
      height: 60, background: C.card,
      borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 32px', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 100,
      boxShadow: designSystem.shadows.sm,
      fontFamily: designSystem.typography.fontFamily,
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, background: C.primary, borderRadius: designSystem.borderRadius.md,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="white">
            <path d="M8 1L2 5v6l6 4 6-4V5L8 1zm0 2l4 2.7V11L8 13.4 4 11V5.7L8 3z"/>
          </svg>
        </div>
        <span style={{
          fontFamily: designSystem.typography.fontFamily, fontSize: 17, fontWeight: 700, color: C.foreground,
        }}>
          ignyous<span style={{ color: C.primary }}>.ai</span>
        </span>
      </Link>

      {/* Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {links.map(link => (
          <Link key={link.href} href={link.href} style={{
            padding: '6px 14px', borderRadius: designSystem.borderRadius.md, fontSize: 15, fontWeight: 500,
            textDecoration: 'none',
            background: path === link.href ? C.primaryVeryLight : 'transparent',
            color: path === link.href ? C.primary : C.textSecondary,
            transition: `all ${designSystem.transitions.normal}`,
          }}>
            {link.label}
          </Link>
        ))}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
          background: C.tones.teal.bg, border: `1px solid ${C.success}`, color: C.success,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success }}/>
          All systems live
        </div>
      </div>
    </nav>
  )
}
