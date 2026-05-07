'use client'
import { useState } from 'react'

interface Gap {
  id:       string
  icon:     string
  title:    string
  desc:     string
  priority: 'high' | 'medium' | 'low'
  prompt:   string
}

interface Props {
  siteInfo: any
  scanReport: any
  pages: any[]
  onAsk: (prompt: string) => void
  onDismiss: () => void
}

const c = {
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
}

export default function SiteOnboarding({ siteInfo, scanReport, pages, onAsk, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState<string[]>([])

  function dismiss(id: string) {
    setDismissed(prev => [...prev, id])
  }

  // Detect gaps
  const gaps: Gap[] = []

  // No site title or generic title
  const siteName = siteInfo?.site?.name || ''
  if (!siteName || siteName === 'My WordPress Site' || siteName === 'WordPress Site' || siteName.length < 4) {
    gaps.push({
      id: 'site_name', icon: '🏷️', priority: 'high',
      title: 'Your site has no proper name',
      desc: `Currently showing as "${siteName || 'untitled'}". Set your business name so visitors know who you are.`,
      prompt: 'My site needs a proper name and tagline. Let\'s set the site title, description, and basic branding.',
    })
  }

  // No pages or just "Sample Page"
  const hasRealPages = pages.some(p => p.slug !== 'sample-page' && p.title !== 'Sample Page' && p.status === 'publish')
  if (!hasRealPages || pages.length <= 1) {
    gaps.push({
      id: 'pages', icon: '📄', priority: 'high',
      title: 'No real pages yet',
      desc: 'Your site only has a sample page. Let\'s build the pages your business needs.',
      prompt: 'My site needs real pages. Based on my business, what pages should I have? Let\'s create them.',
    })
  }

  // No contact page
  const hasContact = pages.some(p => p.slug?.includes('contact') || p.title?.toLowerCase().includes('contact'))
  if (!hasContact) {
    gaps.push({
      id: 'contact', icon: '📬', priority: 'high',
      title: 'No contact page',
      desc: 'Visitors have no way to reach you. A contact page with a form is essential.',
      prompt: 'Add a contact page with a contact form that texts me when someone submits it.',
    })
  }

  // No SEO description
  if (!scanReport?.seo?.meta_description) {
    gaps.push({
      id: 'seo', icon: '🔍', priority: 'high',
      title: 'Missing SEO description',
      desc: 'Search engines have nothing to show when your site appears in results. This hurts your ranking.',
      prompt: 'Write a compelling meta description for my homepage and set up basic SEO.',
    })
  }

  // No H1
  if (scanReport && !scanReport?.seo?.has_h1) {
    gaps.push({
      id: 'h1', icon: '✏️', priority: 'high',
      title: 'No main headline on homepage',
      desc: 'Your homepage has no H1 heading — the most important on-page SEO element.',
      prompt: 'My homepage is missing a main headline. Add a compelling H1 that explains what my business does.',
    })
  }

  // Slow speed
  if (scanReport?.performance?.load_time_ms > 3000) {
    gaps.push({
      id: 'speed', icon: '⚡', priority: 'medium',
      title: 'Slow load time',
      desc: `Your site takes ${(scanReport.performance.load_time_ms / 1000).toFixed(1)}s to load. Over 3s loses 40% of visitors.`,
      prompt: 'My site is loading slowly. What can we do to make it faster?',
    })
  }

  // No HTTPS
  if (scanReport && !scanReport?.security?.https) {
    gaps.push({
      id: 'https', icon: '🔒', priority: 'high',
      title: 'Site not secured with HTTPS',
      desc: 'Browsers show "Not Secure" to visitors. Google penalizes non-HTTPS sites.',
      prompt: 'My site doesn\'t have HTTPS. How do we fix this?',
    })
  }

  // No mobile viewport
  if (scanReport && !scanReport?.performance?.mobile_viewport) {
    gaps.push({
      id: 'mobile', icon: '📱', priority: 'high',
      title: 'Not mobile friendly',
      desc: 'Over 60% of searches are on mobile. Your site layout breaks on phones.',
      prompt: 'Fix my site so it looks good on mobile phones.',
    })
  }

  const visible = gaps.filter(g => !dismissed.includes(g.id))
  if (visible.length === 0) return null

  const highPriority = visible.filter(g => g.priority === 'high')
  const others       = visible.filter(g => g.priority !== 'high')

  return (
    <div style={{ background: c.white, border: `2px solid ${c.accentBorder}`, borderRadius: 18, overflow: 'hidden', marginBottom: 20, boxShadow: '0 4px 20px rgba(232,101,26,0.1)' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', background: c.accentDim, borderBottom: `1px solid ${c.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}>✦</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: c.text }}>Your site needs some attention</div>
            <div style={{ fontSize: 13, color: c.text2 }}>{visible.length} issues found — ignyous can fix all of these for you</div>
          </div>
        </div>
        <button onClick={onDismiss} style={{ fontSize: 12, color: c.text3, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Dismiss all</button>
      </div>

      {/* Issues */}
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {visible.map(gap => (
          <div key={gap.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '12px 14px', borderRadius: 12,
            background: gap.priority === 'high' ? c.redBg : c.yellowBg,
            border: `1px solid ${gap.priority === 'high' ? c.redBorder : c.yellowBorder}`,
          }}>
            <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{gap.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 3 }}>{gap.title}</div>
              <div style={{ fontSize: 13, color: c.text2, lineHeight: 1.5 }}>{gap.desc}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => onAsk(gap.prompt)} style={{
                padding: '7px 14px', background: c.accent, border: 'none', borderRadius: 8,
                color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' as const,
              }}>Fix with AI ✦</button>
              <button onClick={() => dismiss(gap.id)} style={{
                padding: '7px 10px', border: `1px solid ${c.border}`, borderRadius: 8,
                background: 'white', color: c.text3, fontSize: 12, cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Fix all button */}
      {visible.length > 1 && (
        <div style={{ padding: '0 20px 16px' }}>
          <button onClick={() => onAsk(`My site has ${visible.length} issues that need fixing: ${visible.map(g => g.title).join(', ')}. Let's fix them one by one, starting with the most important.`)} style={{
            width: '100%', padding: '12px', background: c.accent, border: 'none', borderRadius: 10,
            color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'Sora, sans-serif', boxShadow: '0 2px 8px rgba(232,101,26,0.25)',
          }}>
            ✦ Fix all {visible.length} issues with AI
          </button>
        </div>
      )}
    </div>
  )
}