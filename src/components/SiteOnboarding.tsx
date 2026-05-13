'use client'
import { useState } from 'react'
import { designSystem } from '@/lib/designSystem'

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

const C = designSystem.colors

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
    <div style={{ background: C.card, border: `2px solid ${C.primary}33`, borderRadius: designSystem.borderRadius.lg, overflow: 'hidden', marginBottom: 20, boxShadow: designSystem.shadows.primarySm }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', background: C.primaryVeryLight, borderBottom: `1px solid ${C.primary}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: designSystem.borderRadius.md, background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 19 }}>✦</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: designSystem.typography.fontFamily, color: C.foreground }}>Your site needs some attention</div>
            <div style={{ fontSize: 14, color: C.textSecondary }}>{visible.length} issues found — ignyous can fix all of these for you</div>
          </div>
        </div>
        <button onClick={onDismiss} style={{ fontSize: 13, color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: designSystem.typography.fontFamily }}>Dismiss all</button>
      </div>

      {/* Issues */}
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {visible.map(gap => (
          <div key={gap.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '12px 14px', borderRadius: designSystem.borderRadius.md,
            background: gap.priority === 'high' ? C.errorBg : C.warningBg,
            border: `1px solid ${gap.priority === 'high' ? C.error : C.warning}33`,
          }}>
            <div style={{ fontSize: 21, flexShrink: 0, marginTop: 1 }}>{gap.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.foreground, marginBottom: 3 }}>{gap.title}</div>
              <div style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.5 }}>{gap.desc}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => onAsk(gap.prompt)} style={{
                padding: '7px 14px', background: C.primary, border: 'none', borderRadius: designSystem.borderRadius.sm,
                color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: designSystem.typography.fontFamily, whiteSpace: 'nowrap' as const,
              }}>Fix with AI ✦</button>
              <button onClick={() => dismiss(gap.id)} style={{
                padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: designSystem.borderRadius.sm,
                background: 'white', color: C.muted, fontSize: 13, cursor: 'pointer',
                fontFamily: designSystem.typography.fontFamily,
              }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Fix all button */}
      {visible.length > 1 && (
        <div style={{ padding: '0 20px 16px' }}>
          <button onClick={() => onAsk(`My site has ${visible.length} issues that need fixing: ${visible.map(g => g.title).join(', ')}. Let's fix them one by one, starting with the most important.`)} style={{
            width: '100%', padding: '12px', background: C.primary, border: 'none', borderRadius: designSystem.borderRadius.md,
            color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: designSystem.typography.fontFamily, boxShadow: designSystem.shadows.primary,
          }}>
            ✦ Fix all {visible.length} issues with AI
          </button>
        </div>
      )}
    </div>
  )
}