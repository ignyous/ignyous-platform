'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import ThemeBrowser from '@/components/ThemeBrowser'
import ModePicker from '@/components/ModePicker'
import EasyModeDashboard from '@/components/EasyModeDashboard'
import GlobalDesignPanel from '@/components/GlobalDesignPanel'
import SiteStatusIndicator from '@/components/SiteStatusIndicator'
import RoutineLibrary from '@/components/RoutineLibrary'
import ReactMarkdown from 'react-markdown'

// ─── Types ────────────────────────────────────────────────────────
interface Plugin  { name: string; slug: string; active: boolean; version: string; update: string | null }
interface Page    { id: number; title: string; slug: string; status: string; link: string }
interface SiteInfo {
  site:      { url: string; name: string; description: string; admin_email: string }
  wordpress: { version: string }
  theme:     { name: string; version: string; slug: string }
  builder:   Array<{ id: string; name: string }>
  plugins:   Plugin[]
  content:   { pages: number; active_pages?: number; posts: number; media_count?: number }
}
interface ActionResult { type: string; success: boolean; url?: string; title?: string; message: string; snapshotId?: string; detail?: any; data?: any }
interface ChatOption { label: string; action?: string; directAction?: any; confirmText?: string; variant?: 'primary'|'secondary'|'danger' }
interface Message { role: 'user'|'assistant'; content: string; action?: any; actionResult?: ActionResult; options?: ChatOption[]; ts: Date }

// ─── Memory ───────────────────────────────────────────────────────
function getSiteMem(k: string) { try { return JSON.parse(localStorage.getItem(`ignyous_${k}`) || '{}') } catch { return {} } }
function saveSiteMem(k: string, d: any) { try { localStorage.setItem(`ignyous_${k}`, JSON.stringify({ ...getSiteMem(k), ...d, updated: Date.now() })) } catch {} }

// ─── Get stored API key (fallback when URL param is empty) ────────
function getStoredKey(siteUrl: string): string {
  try {
    const k    = `ignyous_conn_${siteUrl.replace(/[^a-z0-9]/gi, '_')}`
    const data = JSON.parse(localStorage.getItem(k) || '{}')
    return data.apiKey || ''
  } catch { return '' }
}

// ─── Colors (Clean Design System) ─────────────────────────────────
import { designSystem } from '@/lib/designSystem'

const C = {
  bg: designSystem.colors.bg,
  white: designSystem.colors.card,
  text: designSystem.colors.foreground,
  text2: designSystem.colors.textSecondary,
  text3: designSystem.colors.muted,
  border: designSystem.colors.border,
  surface: designSystem.colors.cardAlt,
  accent: designSystem.colors.primary,
  accentDim: designSystem.colors.primaryVeryLight,
  accentBorder: designSystem.colors.primaryLight,
  gold: designSystem.colors.tones.yellow.color,
  goldDim: designSystem.colors.tones.yellow.bg,
  goldBorder: designSystem.colors.tones.yellow.bg,
  green: designSystem.colors.success,
  greenBg: designSystem.colors.successBg,
  greenBorder: designSystem.colors.success,
  blue: designSystem.colors.info,
  blueBg: designSystem.colors.infoBg,
  blueBorder: designSystem.colors.info,
  red: designSystem.colors.error,
  redBg: designSystem.colors.errorBg,
  redBorder: designSystem.colors.error,
  yellow: designSystem.colors.warning,
  yellowBg: designSystem.colors.warningBg,
  yellowBorder: designSystem.colors.warning,
}

// ─── Helpers ──────────────────────────────────────────────────────
const Tag = ({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) => {
  const m: Record<string,any> = {
    green: { bg: C.greenBg, tc: C.green, b: C.greenBorder }, red: { bg: C.redBg, tc: C.red, b: C.redBorder },
    yellow: { bg: C.yellowBg, tc: C.yellow, b: C.yellowBorder }, blue: { bg: C.blueBg, tc: C.blue, b: C.blueBorder },
    orange: { bg: C.accentDim, tc: C.accent, b: C.accentBorder }, gray: { bg: C.surface, tc: C.text2, b: C.border },
  }
  const s = m[color] || m.gray
  return <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: s.bg, color: s.tc, border: `1px solid ${s.b}`, display: 'inline-block', whiteSpace: 'nowrap' as const }}>{children}</span>
}

const ScoreRing = ({ score, label, size = 52 }: { score: number; label: string; size?: number }) => {
  const col = score >= 70 ? C.green : score >= 45 ? C.yellow : C.red
  const bg  = score >= 70 ? C.greenBg : score >= 45 ? C.yellowBg : C.redBg
  const bor = score >= 70 ? C.greenBorder : score >= 45 ? C.yellowBorder : C.redBorder
  return (
    <div style={{ textAlign: 'center' as const }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, border: `2px solid ${bor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 5px' }}>
        <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: size > 60 ? 20 : 13, fontWeight: 700, color: col }}>{score}</span>
      </div>
      <div style={{ fontSize: 12, color: C.text3, fontWeight: 500 }}>{label}</div>
    </div>
  )
}

const hasPlugin = (plugins: Plugin[], ...terms: string[]) =>
  plugins.some(p => p.active !== false && terms.some(t =>
    (p.slug||'').toLowerCase().includes(t) || (p.name||'').toLowerCase().includes(t)
  ))


function normalizePhoneDigits(phone: string) {
  const digits = String(phone || '').replace(/\D+/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

function shortLocation(m: any) {
  const title = String(m?.title || '').trim()
  const field = String(m?.field || m?.option_name || m?.source || 'site content').trim()
  if (title && !/^site option:/i.test(title)) return title
  if (field.includes('theme_mod')) return 'Theme settings'
  if (field.includes('widget')) return 'Widget area'
  if (field.includes('tatsu')) return 'Page builder content'
  if (field.includes('post_content')) return 'Page content'
  if (field.includes('post_excerpt')) return 'Page excerpt'
  return title || field || 'Site content'
}

function groupPhoneMatches(matches: any[]) {
  const map = new Map<string, { phone: string; digits: string; count: number; locations: string[]; risks: string[]; matchIds: string[]; matches: any[] }>()
  for (const m of matches || []) {
    const phone = String(m?.match || '').trim()
    const digits = normalizePhoneDigits(phone)
    if (!digits) continue
    const existing = map.get(digits) || { phone, digits, count: 0, locations: [], risks: [], matchIds: [], matches: [] }
    existing.count += 1
    existing.matches.push(m)
    if (m?.id) existing.matchIds.push(String(m.id))
    const loc = shortLocation(m)
    if (loc && !existing.locations.includes(loc)) existing.locations.push(loc)
    const risk = String(m?.risk || '').trim()
    if (risk && !existing.risks.includes(risk)) existing.risks.push(risk)
    if (!existing.phone || existing.phone.length < phone.length) existing.phone = phone
    map.set(digits, existing)
  }
  return Array.from(map.values()).sort((a,b) => b.count - a.count)
}

function formatPhoneGroupLine(g: ReturnType<typeof groupPhoneMatches>[number], i: number) {
  const places = g.locations.slice(0, 3).join(', ') || 'site content'
  const extra = g.locations.length > 3 ? ` +${g.locations.length - 3} more` : ''
  return `${i + 1}. ${g.phone} — ${g.count} match${g.count === 1 ? '' : 'es'} in ${places}${extra}`
}

// ─── QUICK ACTION CARDS (like image 2) ───────────────────────────
// SEO action is special - gets its own big card at the top
const SEO_ACTION = {
  icon: '🔍',
  label: 'Boost My SEO & Rankings',
  desc: 'Full audit: titles, descriptions, indexing, sitemap, analytics. Get found on Google.',
  prompt: `I want to improve my SEO. Before doing anything, check: 
1. Do I have Yoast SEO or Rank Math installed? 
2. Is my site indexable (check robots.txt)? 
3. Do I have a sitemap? 
4. Is Google Analytics connected?
Then ask me: "Do you want me to use your existing content to apply SEO best practices across your site?" with options to proceed or customize what gets optimized. Show me a before score first.`,
}

// ─── CONTEXTUAL QUICK ACTIONS ────────────────────────────────────
// Tailored to each site based on installed plugins & theme

type QuickAction = { icon: string; label: string; desc: string; prompt: string }

function getContextualActions(siteInfo: SiteInfo | null, hasPlugin: (...slugs: string[]) => boolean): QuickAction[] {
  const actions: QuickAction[] = []
  const plugins  = siteInfo?.plugins || []
  const hasWoo   = hasPlugin('woocommerce')
  const hasEvents= hasPlugin('events-calendar','the-events','event-calendar')
  const hasForms = hasPlugin('contact-form','wpforms','gravity','cf7','ninja-forms')
  const hasYoast = hasPlugin('yoast','rank-math','rankmath')
  const hasAmelia= hasPlugin('amelia')
  const hasML    = hasPlugin('mailchimp','mailpoet','newsletter','klaviyo')
  const hasSlider= hasPlugin('slider-revolution','revslider','smart-slider','meta-slider')
  const hasGal   = hasPlugin('envira-gallery','modula','nextgen-gallery','final-tiles')
  const hasLMS   = hasPlugin('learndash','tutor-lms','lifterLMS','learnpress')
  const hasMbr   = hasPlugin('memberpress','restrict-content','paid-memberships')
  const hasSocial= hasPlugin('instagram-feed','smash-balloon','social-snap','revive-social')
  const hasBkng  = hasPlugin('bookly','simply-schedule','booking-wp-plugin')
  const builder  = (siteInfo as any)?.builder || ''

  // ── WooCommerce: store-specific actions ──────────────────────────
  if (hasWoo) {
    actions.push(
      { icon: '🏷️', label: 'Run a Sale',          desc: 'Set discounts on products',           prompt: 'I want to run a sale. Help me set up a discount on my products — either a percentage off specific items or sitewide.' },
      { icon: '📦', label: 'Add a Product',        desc: 'Create a new product listing',        prompt: 'Help me add a new product to my store. Walk me through title, description, price, image, and category.' },
      { icon: '💳', label: 'Review Cart & Checkout', desc: 'Optimize the buying experience',   prompt: 'Audit my WooCommerce cart and checkout pages. Check for friction points, upsell opportunities, and abandoned cart recovery.' },
      { icon: '📊', label: 'Sales Dashboard',      desc: 'Check store performance',             prompt: 'Give me a summary of my WooCommerce store: product count, any configuration issues, and recommendations to increase sales.' },
      { icon: '🚚', label: 'Configure Shipping',   desc: 'Set up shipping zones & rates',       prompt: 'Help me configure shipping zones, flat rates, free shipping thresholds, and local pickup for my WooCommerce store.' },
      { icon: '🎁', label: 'Add Coupon Code',       desc: 'Create a discount coupon',           prompt: 'Create a WooCommerce coupon code with a percentage or fixed discount, expiry date, and usage limits.' }
    )
  }

  // ── Events Calendar ──────────────────────────────────────────────
  if (hasEvents) {
    actions.push(
      { icon: '📅', label: 'Create an Event',      desc: 'Add a new event to the calendar',    prompt: 'Help me create a new event with title, date, time, location, and description. Add it to my events calendar.' },
      { icon: '🎟️', label: 'Promote an Event',     desc: 'Feature event on homepage',          prompt: 'I want to feature an upcoming event prominently on my homepage. Help me add a compelling event section with CTA.' },
      { icon: '📆', label: 'Review Events Setup',  desc: 'Audit calendar configuration',        prompt: 'Review my Events Calendar setup. Check registration, ticketing, and suggest improvements for better attendance.' }
    )
  }

  // ── Booking plugins ──────────────────────────────────────────────
  if (hasAmelia || hasBkng) {
    actions.push(
      { icon: '📋', label: 'Review Booking Setup', desc: 'Check services & availability',       prompt: 'Review my booking system. Check services, staff, availability, and confirmation emails. Suggest improvements.' },
      { icon: '🔗', label: 'Add Book Now CTA',     desc: 'Add booking buttons to pages',        prompt: 'Add a prominent "Book Now" call-to-action to my homepage and service pages, linked to my booking system.' }
    )
  }

  // ── Email marketing ──────────────────────────────────────────────
  if (hasML) {
    actions.push(
      { icon: '📧', label: 'Grow My List',         desc: 'Add opt-in forms & lead magnets',     prompt: 'Help me grow my email list. Add opt-in forms, a lead magnet offer, and pop-up to capture subscriber emails.' },
      { icon: '✉️', label: 'Set Up Email Flow',    desc: 'Welcome sequence for new subscribers', prompt: 'Help me set up a welcome email sequence for new subscribers. Suggest content for the first 3 emails.' }
    )
  }

  // ── LMS ──────────────────────────────────────────────────────────
  if (hasLMS) {
    actions.push(
      { icon: '🎓', label: 'Add a Course',          desc: 'Create a new course listing',        prompt: 'Help me create a new course with curriculum, pricing, and enrollment page. Walk me through the full setup.' },
      { icon: '📈', label: 'Promote My Courses',    desc: 'Feature courses on homepage',         prompt: 'Help me feature my courses prominently on the homepage with a grid or hero section that drives enrollments.' }
    )
  }

  // ── Membership ───────────────────────────────────────────────────
  if (hasMbr) {
    actions.push(
      { icon: '🔐', label: 'Set Up Membership',    desc: 'Configure levels & access',           prompt: 'Review my membership setup. Check levels, pricing, and restricted content. Suggest ways to increase sign-ups.' }
    )
  }

  // ── Gallery plugins ──────────────────────────────────────────────
  if (hasGal) {
    actions.push(
      { icon: '🖼️', label: 'Update Gallery',       desc: 'Refresh photo gallery layout',        prompt: 'Help me update my gallery. Suggest a better layout and check if images are optimised for fast loading.' }
    )
  }

  // ── Social feed plugins ──────────────────────────────────────────
  if (hasSocial) {
    actions.push(
      { icon: '📱', label: 'Update Social Feeds',  desc: 'Refresh Instagram/Facebook display',  prompt: 'Review my social media feed setup. Make sure it is showing current posts and positioned well on the site.' }
    )
  }

  // ── Forms ────────────────────────────────────────────────────────
  if (hasForms) {
    actions.push(
      { icon: '📬', label: 'Check Form Alerts',    desc: 'Make sure you get notified',          prompt: 'Check my contact forms are sending email and SMS notifications correctly. Test and fix any issues.' }
    )
  } else {
    actions.push(
      { icon: '📬', label: 'Add Contact Form',     desc: 'Capture leads from visitors',         prompt: 'Add a contact form with SMS alerts and a lead capture strategy to my site.' }
    )
  }

  // ── Universal actions (always shown, smart ordering) ─────────────
  if (!hasWoo) {
    actions.push({ icon: '🛒', label: 'Add Online Store',   desc: 'Sell products or services',   prompt: 'I want to sell products or services on my site. Walk me through adding a WooCommerce store.' })
  }
  actions.push(
    { icon: '🎨', label: 'Change Design',      desc: 'New theme, colors & layout',          prompt: 'OPEN_THEME_BROWSER' },
    { icon: '📝', label: 'Rewrite Content',    desc: 'Professional copy that converts',      prompt: 'Rewrite all my page content to be more professional, clear, and SEO-optimized.' },
    { icon: '⚡', label: 'Speed Up Site',     desc: 'Faster load times',                   prompt: 'My site is slow. Identify every performance issue and fix them.' },
    { icon: '📊', label: 'Add Analytics',      desc: 'Track visitors & conversions',         prompt: 'Set up Google Analytics and Google Search Console on my site.' },
    { icon: '🔒', label: 'Secure My Site',    desc: 'SSL, backups, protection',             prompt: 'Check my site security, enable HTTPS, and set up automatic backups.' },
    { icon: '🛠️', label: 'Add Service Pages',  desc: 'Pages that explain what you offer',   prompt: 'Create professional service pages that explain what I offer and include call-to-actions.' }
  )

  // Deduplicate and cap at 8 (contextual ones first since they're inserted first)
  const seen = new Set<string>()
  return actions.filter(a => { if (seen.has(a.label)) return false; seen.add(a.label); return true }).slice(0, 8)
}

const SUGGESTIONS = [
  '✦ Auto-suggest content for my homepage',
  'What pages does my site have?',
  'Add a pricing section to my homepage',
  'Create an About Us page',
  'What plugins are installed?',
  'Check and fix my SEO',
  'My site looks bare — let\'s set it up',
]

// ─── ACTION FEEDBACK COMPONENT ───────────────────────────────────
const ActionFeedback = ({ result, onRollback }: { result: ActionResult; onRollback?: () => void }) => (
  <div style={{ marginTop: 8, padding: '11px 14px', borderRadius: 10, background: result.success ? C.greenBg : C.redBg, border: `1px solid ${result.success ? C.greenBorder : C.redBorder}` }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: result.success ? C.green : C.red, marginBottom: result.url || onRollback ? 7 : 0 }}>
      {result.success ? '✓' : '✗'} {result.message}
    </div>
    {result.url && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <code style={{ fontSize: 13, color: C.text2, background: 'rgba(0,0,0,0.06)', padding: '2px 7px', borderRadius: 4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{result.url}</code>
        <a href={result.url} target="_blank" rel="noreferrer" style={{ padding: '5px 12px', background: C.green, borderRadius: 7, color: 'white', fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>View Page ↗</a>
      </div>
    )}
    {result.success && onRollback && (
      <button onClick={onRollback} style={{
        marginTop: 8, padding: '7px 14px', border: `1.5px solid #1a1a4e`, borderRadius: 8,
        background: '#1a1a4e', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = C.red; e.currentTarget.style.borderColor = C.red }}
        onMouseLeave={e => { e.currentTarget.style.background = '#1a1a4e'; e.currentTarget.style.borderColor = '#1a1a4e' }}
      >
        ↩ Roll back to this snapshot
      </button>
    )}
  </div>
)

// ─── ISSUE DETECTOR ───────────────────────────────────────────────
function detectIssues(siteInfo: SiteInfo | null, scanReport: any, pages: Page[]) {
  const issues: Array<{ icon: string; title: string; desc: string; prompt: string; severity: 'high'|'medium' }> = []

  const name = siteInfo?.site?.name || ''
  if (!name || name === 'My WordPress Site' || name === 'WordPress Site' || name.length < 4)
    issues.push({ icon: '🏷️', severity: 'high', title: 'No site name set', desc: `Currently "${name || 'untitled'}" — visitors don't know who you are.`, prompt: 'Set my site name, tagline and basic branding to match my business.' })

  const hasContact = pages.some(p => p.slug?.includes('contact') || (p.title||'').toLowerCase().includes('contact'))
  if (!hasContact)
    issues.push({ icon: '📬', severity: 'high', title: 'No contact page', desc: 'Visitors have no way to reach you. You\'re losing leads every day.', prompt: 'Create a contact page with a form that texts me when someone fills it out.' })

  if (!scanReport?.seo?.meta_description)
    issues.push({ icon: '🔍', severity: 'high', title: 'Missing SEO description', desc: 'Search engines show nothing when your site appears in results.', prompt: 'Write and set a compelling meta description for my homepage and fix my basic SEO.' })

  if (scanReport?.performance?.load_time_ms > 3000)
    issues.push({ icon: '⚡', severity: 'medium', title: `Slow load time (${(scanReport.performance.load_time_ms/1000).toFixed(1)}s)`, desc: 'Over 3s loses 40% of visitors before they even see your site.', prompt: 'My site is loading slowly. Fix every performance issue.' })

  if (scanReport && !scanReport?.security?.https)
    issues.push({ icon: '🔒', severity: 'high', title: 'No HTTPS / SSL', desc: 'Browsers show "Not Secure". Google penalizes non-HTTPS sites.', prompt: 'Help me fix the HTTPS/SSL issue on my site.' })

  const realPages = pages.filter(p => p.slug !== 'sample-page' && p.status === 'publish')
  if (realPages.length <= 1)
    issues.push({ icon: '📄', severity: 'high', title: 'Site has no real pages', desc: 'Only a sample page exists. Let\'s build your actual website.', prompt: 'My site has no real pages yet. What pages does a business like mine need? Let\'s create them.' })

  return issues
}

// ─── MAIN ─────────────────────────────────────────────────────────
function DashboardInner() {
  const params   = useSearchParams()
  const urlSite  = params.get('site') || ''
  const urlKey   = params.get('key')  || ''

  const [siteUrl, setSiteUrl]       = useState(urlSite)
  const [apiKey,  setApiKey]        = useState(urlKey)
  const [dashboardMode, setDashboardMode] = useState<'easy'|'advanced'|null>(null)
  const [modeLoaded, setModeLoaded]       = useState(false)

  // Load dashboardMode on mount
  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(d => {
      setDashboardMode(d.user?.dashboardMode ?? 'advanced')
      setModeLoaded(true)
    }).catch(() => { setDashboardMode('advanced'); setModeLoaded(true) })
  }, [])

  // Save mode to DB (called only from Settings, not from header toggle)
  async function saveMode(mode: 'easy' | 'advanced') {
    setDashboardMode(mode)
    await fetch('/api/user', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardMode: mode }),
    })
  }

  // Switch mode temporarily (header toggle — does NOT persist to DB)
  function switchModeTemp(mode: 'easy' | 'advanced') {
    setDashboardMode(mode)
  }

  // Load apiKey from DB — single source of truth, no localStorage needed
  useEffect(() => {
    async function resolveKey() {
      // If URL has both site and key, use them directly
      if (urlSite && urlKey) { setSiteUrl(urlSite); setApiKey(urlKey); return }

      try {
        const res   = await fetch('/api/sites')
        const data  = await res.json()
        const sites: Array<{url: string; apiKey: string}> = data.sites || []

        if (urlSite) {
          // Find this specific site's key from DB
          const match = sites.find(s => s.url === urlSite || s.url === urlSite.replace(/\/$/, ''))
          if (match?.apiKey) { setApiKey(match.apiKey); return }
          // Not in DB yet — provision it (generates key, stores in DB)
          const provRes  = await fetch('/api/sites/provision', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlSite }),
          })
          const provData = await provRes.json()
          if (provData.apiKey) setApiKey(provData.apiKey)
        } else if (sites.length > 0) {
          // No site in URL — load first one from DB
          setSiteUrl(sites[0].url)
          setApiKey(sites[0].apiKey)
        } else {
          setLoading(false)
        }
      } catch {
        setLoading(false)
      }
    }
    resolveKey()
  }, [urlSite, urlKey])

  const cleanUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`
  const siteKey  = siteUrl.replace(/[^a-z0-9]/gi,'_')

  const [siteInfo, setSiteInfo]         = useState<SiteInfo | null>(null)
  const [pages, setPages]               = useState<Page[]>([])
  const [scanReport, setScanReport]     = useState<any>(null)
  const [loading, setLoading]           = useState(true)
  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState('')
  const [sending, setSending]           = useState(false)
  const [showThemes, setShowThemes]     = useState(false)
  const [dismissedIssues, setDismissedIssues] = useState<string[]>([])
  const [snapshots, setSnapshots]       = useState<Array<{id: string; label: string; created_at: string}>>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [previewUrl, setPreviewUrl]     = useState('')
  const [iframeKey, setIframeKey]       = useState(0)
  const [previewMode, setPreviewMode]   = useState<'desktop'|'mobile'>('desktop')
  const [variationPreview, setVariationPreview] = useState<{label: string; fields: Record<string,string>} | null>(null)
  const [keyError, setKeyError]               = useState(false)
  const [pendingAction, setPendingAction]       = useState<{action: any; msg: Message} | null>(null)
  const [livePreviewHtml, setLivePreviewHtml]   = useState<string | null>(null)
  const [livePreviewLoading, setLivePreviewLoading] = useState(false)
  const [rightTab, setRightTab]             = useState<'preview'|'design'>('preview')
  const [pendingImageData, setPendingImageData] = useState<{data:string;name:string}|null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef                     = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (siteUrl && apiKey) loadAll() }, [siteUrl, apiKey])
  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [messages])

  // Persist chat to localStorage
  useEffect(() => {
    if (!siteKey || messages.length === 0) return
    try {
      const toSave = messages.slice(-80).map(m => ({ role: m.role, content: m.content, ts: m.ts.getTime() }))
      localStorage.setItem(`ignyous_chat_${siteKey}`, JSON.stringify(toSave))
    } catch {}
  }, [messages, siteKey])

  async function bridge(endpoint: string, method = 'GET', body?: any) {
    const res  = await fetch('/api/wordpress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: cleanUrl, apiKey, endpoint, method, body }),
    })
    const data = await res.json()
    // 401 = key mismatch between DB and plugin
    if (res.status === 401 || data?.error?.includes('not allowed')) setKeyError(true)
    else setKeyError(false)
    return data
  }


  async function logClientActivity(event: { category?: string; action: string; status?: 'success'|'failed'|'pending'; summary: string; detail?: any; durationMs?: number }) {
    try {
      await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: cleanUrl,
          siteName: siteInfo?.site?.name || siteUrl,
          category: event.category || 'content',
          action: event.action,
          status: event.status || 'success',
          summary: event.summary,
          detail: event.detail,
          durationMs: event.durationMs,
        }),
      })
    } catch {}
  }

  function runQuickOption(opt: ChatOption, sourceMsg: Message) {
    if (opt.directAction) {
      const userChoice: Message = { role: 'user', content: opt.label, ts: new Date() }
      const assistantMsg: Message = {
        role: 'assistant',
        content: opt.confirmText || 'Got it — I’ll make that change now.',
        action: opt.directAction,
        ts: new Date(),
      }
      setMessages(prev => [...prev, userChoice, assistantMsg])
      executeAction(opt.directAction, assistantMsg)
      return
    }
    send(opt.action || opt.label)
  }

  async function loadAll() {
    setLoading(true)
    try {
      // Load saved chat history first
      try {
        const saved = JSON.parse(localStorage.getItem(`ignyous_chat_${siteKey}`) || '[]')
        if (saved.length > 0) {
          setMessages(saved.map((m: any) => ({ ...m, ts: new Date(m.ts), options: undefined, action: undefined, actionResult: undefined })))
        }
      } catch {}

      const [infoRes, pagesRes, pluginsRes] = await Promise.all([bridge('site'), bridge('pages'), bridge('plugins')])

      // Handle all possible response shapes from the bridge
      let info: SiteInfo | null = null
      if (infoRes.success) {
        const d = infoRes.data
        // Could be: d.site (direct) or d.data.site (double-wrapped)
        if (d?.site)      info = d
        else if (d?.data?.site) info = d.data
        else              info = d
        setSiteInfo(info)
      }

      let loadedPages: Page[] = []
      if (pagesRes.success) {
        const d = pagesRes.data
        const raw = d?.pages || d?.data?.pages || []
        loadedPages = raw
        setPages(raw)
      }

      if (pluginsRes.success) {
        const pd = pluginsRes.data
        const plugRaw = pd?.plugins || pd?.data?.plugins || []
        if (info) {
          info = { ...info, plugins: plugRaw }
          setSiteInfo(info)
        }
      }

      // Background scan + snapshots
      fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: cleanUrl }) })
        .then(r => r.json()).then(d => { if (d.success) setScanReport(d.report) })

      bridge('snapshots').then(r => {
        if (r.success) setSnapshots(r.data?.snapshots || [])
      })

      const mem      = getSiteMem(siteKey)
      const siteName = info?.site?.name || siteUrl
      const plugCt   = (info?.plugins || []).filter(p => p.active === true).length
      const pageCt   = loadedPages.length || info?.content?.pages || 0
      const activePageCt = loadedPages.filter(p => p.status === 'publish').length || info?.content?.active_pages || 0

      // Only show welcome if no saved chat history
      const hasSavedChat = (() => { try { return JSON.parse(localStorage.getItem(`ignyous_chat_${siteKey}`) || '[]').length > 0 } catch { return false } })()
      if (!hasSavedChat) {
        setMessages([{
          role: 'assistant', ts: new Date(),
          content: mem.welcomed
            ? `Welcome back! Connected to **${siteName}** — ${activePageCt} active page${activePageCt === 1 ? '' : 's'} (${pageCt} total), ${plugCt} active plugin${plugCt === 1 ? '' : 's'}. What would you like to do today?`
            : `Hi! I'm now connected to **${siteName}**.\n\nI can see ${activePageCt} active page${activePageCt === 1 ? '' : 's'} (${pageCt} total) and ${plugCt} active plugin${plugCt === 1 ? '' : 's'}. I'm scanning for issues now.\n\nJust tell me in plain English what you want — I'll handle everything.`,
        }])
      }
      saveSiteMem(siteKey, { welcomed: true, site_name: info?.site?.name, last_visit: Date.now() })
      setPreviewUrl(cleanUrl)
    } catch {
      setMessages([{ role: 'assistant', content: 'Connected! What would you like to do with your site?', ts: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  // ── AI Send ────────────────────────────────────────────────────
  async function send(text?: string) {
    const msg = (text || input).trim()
    if (!msg || sending) return
    if (msg === 'OPEN_THEME_BROWSER') { setShowThemes(true); return }

    const userMsg: Message = { role: 'user', content: msg, ts: new Date() }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)

    try {
      const activePlugins = (siteInfo?.plugins || []).filter(p => p.active !== false)
      const ctx = {
        site_name:        siteInfo?.site?.name || siteUrl,
        site_url:         cleanUrl,
        site_description: siteInfo?.site?.description,
        wp_version:       siteInfo?.wordpress?.version,
        theme:            siteInfo?.theme?.name,
        builder:          siteInfo?.builder?.[0]?.name,
        pages:            pages.map(p => ({
          id: p.id, title: p.title, slug: p.slug, url: p.link, status: p.status,
          has_form: (p as any).has_form,
          has_elementor: (p as any).has_elementor,
        })),
        active_plugins:   activePlugins.map(p => ({ name: p.name, slug: p.slug })),
        plugin_count:     activePlugins.length,
        // Specific plugin detection for common checks
        has_contact_form_7: activePlugins.some(p => (p.slug||'').includes('contact-form-7') || (p.name||'').toLowerCase().includes('contact form 7')),
        has_wpforms:        activePlugins.some(p => (p.slug||'').includes('wpforms')),
        has_gravity_forms:  activePlugins.some(p => (p.slug||'').includes('gravityforms')),
        has_woocommerce:    activePlugins.some(p => (p.slug||'').includes('woocommerce')),
        has_amelia:         activePlugins.some(p => (p.slug||'').includes('amelia')),
        has_yoast:          activePlugins.some(p => (p.slug||'').includes('yoast') || (p.slug||'').includes('rank-math')),
        seo_score:          scanReport?.scores?.seo,
        performance_score:  scanReport?.scores?.performance,
        overall_score:      scanReport?.scores?.overall,
        meta_description:   scanReport?.seo?.meta_description,
        load_time_ms:       scanReport?.performance?.load_time_ms,
        forms_count:        scanReport?.forms?.count || 0,
      }

      const res  = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })), siteContext: ctx, siteUrl: cleanUrl, apiKey }),
      })
      const data = await res.json()

      if (data.action?.type === 'open_theme_browser') { setShowThemes(true) }

      const aiMsg: Message = { role: 'assistant', content: data.text || 'Done!', action: data.action, options: data.options, ts: new Date() }
      setMessages(prev => [...prev, aiMsg])

      if (data.action) {
        const a = data.action
        if (a.type === 'open_theme_browser') { setShowThemes(true) }
        // For page content changes — stage as preview first, don't auto-execute
        else if (['update_page','create_page'].includes(a.type) && (a.content || a.title)) {
          setPendingAction({ action: a, msg: aiMsg })
          // Fetch real WP preview in background
          const targetPageForPreview = pages.find((p: any) => p.id === a.pageId)
          const pageUrlForPreview = targetPageForPreview?.link || cleanUrl
          if (pageUrlForPreview) {
            setLivePreviewLoading(true)
            setLivePreviewHtml(null)
            fetch('/api/proxy/page-preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pageUrl: pageUrlForPreview,
                injectHtml: a.content || '',
                pageTitle: a.title || targetPageForPreview?.title || 'Page update',
              }),
            }).then(r => r.text()).then(html => {
              setLivePreviewHtml(html)
              setLivePreviewLoading(false)
            }).catch(() => setLivePreviewLoading(false))
          }
        }
        else { executeAction(a, aiMsg) }
      }
      saveSiteMem(siteKey, { last_action: data.action?.type, last_msg: msg.slice(0, 80) })
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Check that ANTHROPIC_API_KEY is set in .env.local.', ts: new Date() }])
    } finally {
      setSending(false)
    }
  }

  // ── Execute action ─────────────────────────────────────────────
  async function confirmPendingAction() {
    if (!pendingAction) return
    const { action, msg } = pendingAction
    setPendingAction(null)
    setVariationPreview(null)
    setLivePreviewHtml(null)
    await executeAction(action, msg)
  }

  function discardPendingAction() {
    if (!pendingAction) return
    const { msg } = pendingAction
    setPendingAction(null)
    setVariationPreview(null)
    setLivePreviewHtml(null)
    setMessages(prev => prev.map(m => m === msg
      ? { ...m, actionResult: { type: m.action?.type || '', success: false, message: '✗ Change discarded — no modifications made' } }
      : m
    ))
  }

  async function executeAction(action: any, msg: Message) {
    let result: ActionResult = { type: action.type, success: false, message: 'Action failed' }

    // Auto-snapshot before destructive actions
    let snapshotId = ''
    if (['update_page','create_page','update_site_options','update_seo','update_element','update_global_style','plugin_action','install_plugin','install_theme','replace_text','replace_phone_number','replace_multiple_texts'].includes(action.type)) {
      try {
        const snapRes = await bridge('snapshot', 'POST', { label: `Before: ${action.type} — ${action.title || action.slug || action.blogname || 'change'}` })
        if (snapRes.success) {
          snapshotId = snapRes.data?.snapshot_id || ''
          setSnapshots(prev => [{ id: snapshotId, label: `Before: ${action.title || action.slug || action.type}`, created_at: new Date().toISOString() }, ...prev].slice(0, 20))
        }
      } catch {}
    }
    try {
      switch (action.type) {
        case 'update_page': {
          if (!action.pageId) {
            result = { type: 'update_page', success: false, message: 'Failed: page ID unknown — pages may not have loaded yet. Try refreshing or ask again once the site info loads.' }
            break
          }
          const targetPage = pages.find(p => p.id === action.pageId)
          const pageUrl    = targetPage?.link
          const pageTitle  = action.title || targetPage?.title || 'Page'

          let r: any
          if (action.section && action.pageId) {
            // Builder-native section insertion — uses BuilderAdapter
            const builderRes = await fetch('/api/builder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                siteUrl: cleanUrl, apiKey,
                pageId: action.pageId,
                builder: (siteInfo as any)?.builder || '',
                section: action.section,
              }),
            })
            r = await builderRes.json()
          } else {
            r = await bridge(`pages/${action.pageId}`, 'POST', { title: action.title, content: action.content, status: action.status || 'publish' })
          }

          result = { type: 'update_page', success: r.success, message: r.success ? `"${pageTitle}" updated successfully` : `Failed: ${r.error || r.message}`, url: pageUrl }
          if (r.success && pageUrl) {
            setPreviewUrl(pageUrl)
            setIframeKey(k => k + 1)
            setTimeout(() => setIframeKey(k => k + 1), 3000)
          }
          break
        }
        case 'create_page': {
          const r = await bridge('pages', 'POST', { title: action.title, content: action.content || '', status: action.status || 'publish' })
          if (r.success) {
            const pg  = r.data?.page || r.data
            const url = pg?.link || `${cleanUrl}/${(action.title||'').toLowerCase().replace(/\s+/g,'-')}`
            result = { type: 'create_page', success: true, message: `"${action.title}" created and published`, url, title: action.title }
            // Targeted page list refresh - no full reload
            const pagesRes = await bridge('pages')
            if (pagesRes.success) setPages(pagesRes.data?.pages || pagesRes.data?.data?.pages || [])
          } else {
            result = { type: 'create_page', success: false, message: `Failed: ${r.error}` }
          }
          break
        }
        case 'update_seo': {
          const targetPage = pages.find(p => p.id === action.pageId)
          if (action.bulk) {
            // Bulk SEO — call SEO API
            const seoRes = await fetch('/api/seo', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'bulk_generate', siteUrl: cleanUrl, apiKey, pages, siteContext: { site_name: siteInfo?.site?.name, site_url: cleanUrl, description: siteInfo?.site?.description } }),
            })
            const seoData = await seoRes.json()
            result = { type: 'update_seo', success: seoData.success, message: `SEO optimized for ${seoData.updated || 0} pages` }
          } else if (action.pageId) {
            const seoRes = await fetch('/api/seo', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'update', siteUrl: cleanUrl, apiKey, pageId: action.pageId, seoData: action.seoData }),
            })
            const seoData = await seoRes.json()
            result = { type: 'update_seo', success: seoData.success, message: seoData.success ? `SEO updated for "${targetPage?.title || 'page'}"` : `SEO update failed: ${seoData.message}` }
          } else {
            // AI-generate for all pages
            const seoRes = await fetch('/api/seo', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'bulk_generate', siteUrl: cleanUrl, apiKey, pages, siteContext: { site_name: siteInfo?.site?.name, site_url: cleanUrl } }),
            })
            const seoData = await seoRes.json()
            result = { type: 'update_seo', success: seoData.success, message: `AI optimized SEO for ${seoData.updated || 0} pages` }
          }
          break
        }

        case 'read_structure': {
          const r = await fetch(`/api/element?siteUrl=${encodeURIComponent(cleanUrl)}&apiKey=${encodeURIComponent(apiKey)}&pageId=${action.pageId}`)
          const data = await r.json()
          result = { type: 'read_structure', success: data.success ?? true, message: data.data ? `Page has ${data.data.section_count} section(s) — builder: ${data.data.builder}` : 'Could not read structure', data }
          // Inject structure into next AI message context
          if (data.success && data.data) {
            setMessages(prev => [...prev, {
              role: 'assistant' as const,
              content: `📐 Page structure loaded: ${data.data.section_count} sections (${data.data.builder}). Here are the sections:\n` +
                (data.data.sections || []).slice(0, 10).map((s: any, i: number) =>
                  `${i+1}. [${s.id}] ${s.type} — "${s.label}" ${s.settings?.background_color ? `bg:${s.settings.background_color}` : ''}`
                ).join('\n'),
              ts: new Date(),
            }])
          }
          break
        }

        case 'upload_image': {
          if (pendingImageData) {
            const r = await fetch('/api/element', { method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ action: 'upload_image', siteUrl: cleanUrl, apiKey, imageData: pendingImageData.data, imageName: pendingImageData.name }) })
            const data = await r.json()
            result = { type: 'upload_image', success: data.success ?? false, message: data.success ? `Image uploaded: ${data.data?.url}` : 'Upload failed', url: data.data?.url }
            if (data.success) setPendingImageData(null)
          } else {
            result = { type: 'upload_image', success: false, message: 'No image attached — please attach an image first' }
          }
          break
        }

        case 'update_element': {
          const targetPage = pages.find(p => p.id === action.pageId)
          const elementAction = action.findByDescription ? 'find_and_update' : 'update_element'
          const r = await fetch('/api/element', { method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              action: elementAction, siteUrl: cleanUrl, apiKey,
              pageId: action.pageId,
              elementId: action.elementId,
              description: action.findByDescription || action.description,
              updates: action.updates,
            })
          })
          const data = await r.json()
          result = { type: 'update_element', success: data.success ?? false,
            message: data.success ? `Updated ${action.findByDescription || action.elementId || 'element'}` : (data.message || 'Update failed'),
            url: targetPage?.link }
          if (data.success && targetPage?.link) {
            setPreviewUrl(targetPage.link); setIframeKey(k => k+1); setTimeout(() => setIframeKey(k => k+1), 3000)
          }
          break
        }

        case 'reorder_sections': {
          const targetPage = pages.find(p => p.id === action.pageId)
          const r = await fetch('/api/element', { method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              action: action.newOrder ? 'reorder' : 'move_section',
              siteUrl: cleanUrl, apiKey, pageId: action.pageId,
              newOrder: action.newOrder,
              fromIndex: action.moveFrom, toIndex: action.moveTo,
            })
          })
          const data = await r.json()
          result = { type: 'reorder_sections', success: data.success ?? false, message: data.message || 'Reorder failed', url: targetPage?.link }
          if (data.success && targetPage?.link) {
            setPreviewUrl(targetPage.link); setIframeKey(k => k+1); setTimeout(() => setIframeKey(k => k+1), 3000)
          }
          break
        }

        case 'scan_content':
        case 'find_text':
        case 'find_phone_numbers': {
          const mode = action.type === 'find_phone_numbers' ? 'phone' : (action.mode || 'text')
          const started = Date.now()
          const r = await bridge('content/scan', 'POST', { mode, query: action.query || action.text || '', pageId: action.pageId || 0, limit: action.limit || (mode === 'phone' ? 200 : 50) })
          const matches = r.data?.matches || r.data?.data?.matches || []

          if (mode === 'phone') {
            const groups = groupPhoneMatches(matches)
            const lines = groups.slice(0, 8).map(formatPhoneGroupLine).join('\n')
            result = {
              type: action.type,
              success: r.success ?? false,
              message: groups.length ? `Found ${groups.length} valid phone number${groups.length === 1 ? '' : 's'} across ${matches.length} match${matches.length === 1 ? '' : 'es'}.` : 'No phone numbers found.',
              data: { matches, groups },
            }
            await logClientActivity({
              action: 'phone_scan',
              status: groups.length ? 'success' : 'failed',
              summary: groups.length ? `Found ${groups.length} phone number candidate(s) across ${matches.length} raw match(es).` : 'No phone numbers found during scan.',
              detail: { mode, query: action.query || action.text || '', matches, groups },
              durationMs: Date.now() - started,
            })
            setMessages(prev => [...prev, {
              role: 'assistant' as const,
              content: groups.length ? `I found these valid phone numbers:\n${lines}` : 'I scanned the site and did not find any phone numbers.',
              ts: new Date(),
            }])
          } else {
            const lines = matches.slice(0, 8).map((m: any, i: number) => `${i+1}. ${m.match || action.query || action.text || 'Match'} — ${shortLocation(m)}`).join('\n')
            result = { type: action.type, success: r.success ?? false, message: matches.length ? `Found ${matches.length} match(es).` : 'No matching content found.', data: matches }
            await logClientActivity({
              action: 'content_scan',
              status: matches.length ? 'success' : 'failed',
              summary: matches.length ? `Found ${matches.length} content match(es).` : 'No matching content found.',
              detail: { mode, query: action.query || action.text || '', matches },
              durationMs: Date.now() - started,
            })
            setMessages(prev => [...prev, {
              role: 'assistant' as const,
              content: matches.length ? `I found ${matches.length} match${matches.length === 1 ? '' : 'es'}:\n${lines}` : 'I scanned the site and did not find matching content.',
              ts: new Date(),
            }])
          }
          break
        }

        case 'replace_text': {
          if (!action.old || typeof action.new === 'undefined') {
            result = { type: 'replace_text', success: false, message: 'Missing old or new text for replacement.' }
            break
          }
          const started = Date.now()
          const r = await bridge('content/replace', 'POST', { old: action.old, new: action.new, matchIds: action.matchIds || [], pageId: action.pageId || 0 })
          const data = r.data || r.data?.data || {}
          result = { type: 'replace_text', success: r.success ?? false, message: r.success ? `Done — I updated ${data.replacements || 0} match${(data.replacements || 0) === 1 ? '' : 'es'}.` : (r.message || r.error || 'Replacement failed'), detail: { old: action.old, new: action.new, matchIds: action.matchIds || [], response: data } }
          await logClientActivity({
            action: 'replace_text',
            status: r.success ? 'success' : 'failed',
            summary: r.success ? `Replaced text in ${data.updated_count || 0} location(s).` : `Text replacement failed: ${r.message || r.error || 'unknown error'}`,
            detail: { old: action.old, new: action.new, matchIds: action.matchIds || [], pageId: action.pageId || 0, response: data },
            durationMs: Date.now() - started,
          })
          if (r.success) { setIframeKey(k => k+1); setTimeout(() => setIframeKey(k => k+1), 3000) }
          break
        }

        case 'replace_multiple_texts': {
          const replacements = Array.isArray(action.replacements) ? action.replacements : []
          if (!replacements.length) {
            result = { type: 'replace_multiple_texts', success: false, message: 'No replacements were provided.' }
            break
          }
          const started = Date.now()
          const responses: any[] = []
          let totalReplacements = 0
          let updatedLocations = 0
          let failed = false
          for (const rep of replacements) {
            if (!rep?.old || typeof rep?.new === 'undefined') continue
            const r = await bridge('content/replace', 'POST', { old: rep.old, oldDigits: rep.oldDigits || rep.digits, new: rep.new, matchIds: rep.matchIds || [], pageId: rep.pageId || action.pageId || 0, mode: rep.mode || action.mode || 'text' })
            const data = r.data || r.data?.data || {}
            responses.push({ old: rep.old, new: rep.new, success: r.success, response: data, error: r.error || r.message })
            if (!r.success) failed = true
            totalReplacements += Number(data.replacements || 0)
            updatedLocations += Number(data.updated_count || 0)
          }
          result = { type: 'replace_multiple_texts', success: !failed, message: failed ? 'Some updates could not be completed. Check the activity log for details.' : `Done — I updated ${totalReplacements} match${totalReplacements === 1 ? '' : 'es'}.`, detail: { replacements, responses } }
          await logClientActivity({
            action: 'replace_multiple_texts',
            status: failed ? 'failed' : 'success',
            summary: failed ? `Multiple text replacement partially failed after ${totalReplacements} replacement(s).` : `Completed ${totalReplacements} replacement(s) across ${updatedLocations} location(s).`,
            detail: { replacements, responses },
            durationMs: Date.now() - started,
          })
          if (!failed) { setIframeKey(k => k+1); setTimeout(() => setIframeKey(k => k+1), 3000) }
          break
        }

        case 'replace_phone_number': {
          const newPhone = action.new || action.phone || action.newPhone
          if (!newPhone) {
            result = { type: 'replace_phone_number', success: false, message: 'Missing new phone number.' }
            break
          }
          let oldPhone = action.old || action.oldPhone || ''
          if (!oldPhone) {
            const started = Date.now()
            const scan = await bridge('content/scan', 'POST', { mode: 'phone', query: '', pageId: action.pageId || 0, limit: 200 })
            const matches = scan.data?.matches || scan.data?.data?.matches || []
            const groups = groupPhoneMatches(matches)

            if (groups.length === 0) {
              result = { type: 'replace_phone_number', success: false, message: 'I scanned the site and could not find an existing phone number to replace.', detail: { matches, groups } }
              await logClientActivity({
                action: 'replace_phone_number_scan',
                status: 'failed',
                summary: `No existing phone number found while trying to update to ${newPhone}.`,
                detail: { newPhone, matches, groups, scan },
                durationMs: Date.now() - started,
              })
              break
            }

            if (groups.length === 1 && groups[0].count === 1) {
              oldPhone = groups[0].phone
            } else {
              const lines = groups.slice(0, 8).map(formatPhoneGroupLine).join('\n')
              const options: ChatOption[] = groups.slice(0, 8).map(g => ({
                label: `Change all ${g.phone} matches`,
                directAction: { type: 'replace_phone_number', old: g.phone, oldDigits: g.digits, new: newPhone, matchIds: g.matchIds },
                confirmText: `Got it — I’ll change ${g.phone} to ${newPhone}.`,
                variant: 'primary',
              }))
              if (groups.length > 1) {
                options.unshift({
                  label: 'Change every phone number found',
                  directAction: {
                    type: 'replace_multiple_texts',
                    replacements: groups.map(g => ({ old: g.phone, oldDigits: g.digits, new: newPhone, matchIds: g.matchIds, mode: 'phone' })),
                  },
                  confirmText: `Got it — I’ll change every phone number I found to ${newPhone}.`,
                  variant: 'secondary',
                })
              }
              options.push({ label: 'Cancel — do not change anything', action: 'Cancel this phone number change.', variant: 'danger' })

              const intro = groups.length === 1
                ? `I found ${groups[0].phone} in ${groups[0].count} places. Should I change all of them to ${newPhone}?`
                : `I found ${groups.length} different valid phone numbers. Which should I change to ${newPhone}?`

              result = { type: 'replace_phone_number', success: false, message: groups.length === 1 ? 'Waiting for confirmation before changing multiple matches.' : 'Waiting for user to choose which phone number to change.', data: { matches, groups } }
              await logClientActivity({
                action: 'phone_replace_needs_choice',
                status: 'pending',
                summary: groups.length === 1 ? `Phone number ${groups[0].phone} found in ${groups[0].count} places; waiting for Change All confirmation.` : `Found ${groups.length} different phone numbers; waiting for user choice.`,
                detail: { newPhone, matches, groups, scan },
                durationMs: Date.now() - started,
              })
              setMessages(prev => [...prev, {
                role: 'assistant' as const,
                content: `${intro}\n${lines}`,
                options,
                ts: new Date(),
              }])
              break
            }
          }
          const started = Date.now()
          const r = await bridge('content/replace', 'POST', { old: oldPhone, oldDigits: action.oldDigits || action.digits || normalizePhoneDigits(oldPhone), new: newPhone, matchIds: action.matchIds || [], pageId: action.pageId || 0, mode: 'phone' })
          const data = r.data || r.data?.data || {}
          result = { type: 'replace_phone_number', success: r.success ?? false, message: r.success ? `Done — I changed ${oldPhone} to ${newPhone}.` : (r.message || r.error || 'Phone replacement failed'), detail: { oldPhone, newPhone, matchIds: action.matchIds || [], response: data } }
          await logClientActivity({
            action: 'replace_phone_number',
            status: r.success ? 'success' : 'failed',
            summary: r.success ? `Changed ${oldPhone} to ${newPhone}; ${data.replacements || 0} replacement(s).` : `Phone replacement failed for ${oldPhone} to ${newPhone}.`,
            detail: { oldPhone, newPhone, matchIds: action.matchIds || [], pageId: action.pageId || 0, response: data },
            durationMs: Date.now() - started,
          })
          if (r.success) { setIframeKey(k => k+1); setTimeout(() => setIframeKey(k => k+1), 3000) }
          break
        }

        case 'inspect_builder_data': {
          const r = await bridge('builder/inspect', 'POST', { pageId: action.pageId })
          const data = r.data || r.data?.data || {}
          const keys = data.meta_keys || []
          const lines = keys.slice(0, 8).map((k: any) => `- ${k.key} (${k.storage_type}, ${k.length} chars)`).join('\n')
          result = { type: 'inspect_builder_data', success: r.success ?? false, message: r.success ? `Builder inspected: ${data.builder || 'unknown'}` : (r.message || r.error || 'Inspection failed'), data }
          setMessages(prev => [...prev, { role: 'assistant' as const, content: r.success ? `🧩 Builder inspection: ${data.builder || 'unknown'}${data.layout_editing_supported ? ' — layout edits supported.' : ' — safe content replacements supported; layout adapter needed.'}\n${lines}` : 'Could not inspect builder data.', ts: new Date() }])
          break
        }

        case 'clear_cache': {
          const r = await fetch('/api/cache', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
          const data = await r.json()
          result = { type: 'clear_cache', success: data.success ?? false, message: data.message || (data.success ? 'Cache cleared' : 'Cache clear failed') }
          break
        }

        case 'events': {
          // Events calendar actions (create, update, list, delete)
          const evAction = action.action || 'list'
          let r: any
          if (evAction === 'create') {
            r = await fetch('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'create_from_description', siteUrl:cleanUrl, apiKey, eventDescription:action.data?.description||action.description, siteContext:{site_name:siteInfo?.site?.name} }) })
          } else if (evAction === 'update') {
            r = await fetch('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'update', siteUrl:cleanUrl, apiKey, eventId:action.data?.eventId, updateData:action.data }) })
          } else if (evAction === 'delete') {
            r = await fetch('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'delete', siteUrl:cleanUrl, apiKey, eventId:action.data?.eventId }) })
          } else {
            r = await fetch(`/api/events?siteUrl=${encodeURIComponent(cleanUrl)}&apiKey=${encodeURIComponent(apiKey)}&action=upcoming`)
          }
          const data = await r.json()
          result = { type:'events', success:data.success??false, message:data.data?.message||(data.success?'Events loaded':'Events action failed'), data:data.data }
          break
        }

        case 'payments': {
          const subAction = action.action || ''
          const r = await fetch('/api/payments', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:subAction, siteUrl:cleanUrl, apiKey, data:action.data, description:action.data?.description }) })
          const data = await r.json()
          result = { type:'payments', success:data.success??false, message:data.data?.message||JSON.stringify(data.data||'').slice(0,100) }
          break
        }

        case 'forms': {
          const plugin = action.plugin || 'gravity-forms'
          const formAction = action.action || 'list'
          let formEndpoint = `/api/forms?siteUrl=${encodeURIComponent(cleanUrl)}&apiKey=${encodeURIComponent(apiKey)}&action=list_forms`
          let r: any
          if (formAction === 'create') {
            r = await fetch('/api/payments', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action: plugin.includes('wpforms') ? 'wpf_create_form' : 'gf_create_form', siteUrl:cleanUrl, apiKey, description:action.data?.description }) })
          } else if (formAction === 'entries') {
            const endpoint = plugin.includes('wpforms') ? `/wpf/entries/${action.data?.formId}` : `/gf/entries/${action.data?.formId}`
            r = await fetch(`/api/bridge?site=${encodeURIComponent(cleanUrl)}&endpoint=${endpoint}`)
          } else {
            r = await fetch(formEndpoint)
          }
          const data = await r.json()
          result = { type:'forms', success:data.success??true, message:data.data?.message||'Forms loaded', data:data.data }
          break
        }

        case 'plugin_action': {
          const r = await fetch('/api/plugins', { method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ action: action.action, plugin: action.plugin, siteUrl: cleanUrl, apiKey, data: action.data })
          })
          const data = await r.json()
          result = { type: 'plugin_action', success: data.success ?? false, message: data.message || JSON.stringify(data.data || '').slice(0,120) }
          break
        }

        case 'update_site_options': {
          const r = await bridge('site/settings', 'PATCH', { blogname: action.blogname, blogdescription: action.blogdescription, ...action.options })
          result = { type: 'update_site_options', success: r.success, message: r.success ? 'Site settings updated' : `Failed: ${r.error}` }
          // Targeted update - just update siteInfo name without full reload
          if (r.success && action.blogname && siteInfo) {
            setSiteInfo(prev => prev ? { ...prev, site: { ...prev.site, name: action.blogname } } : prev)
          }
          break
        }
        case 'install_plugin': {
          const r = await bridge('plugins/install', 'POST', { slug: action.slug, activate: true })
          result = { type: 'install_plugin', success: r.success, message: r.success ? `${action.name || action.slug} installed & activated` : `Failed: ${r.error}` }
          // Refresh plugin list only
          if (r.success) {
            const infoRes = await bridge('site')
            if (infoRes.success) {
              const d = infoRes.data?.site ? infoRes.data : infoRes.data?.data || infoRes.data
              setSiteInfo(d)
            }
          }
          break
        }
        case 'install_theme': {
          const r = await bridge('themes/install', 'POST', { slug: action.slug, activate: true })
          result = { type: 'install_theme', success: r.success, message: r.success ? `Theme "${action.name || action.slug}" installed and activated` : `Could not auto-install. Go to WP Admin → Appearance → Themes to install manually.` }
          break
        }
        case 'scan_content': {
          const r = await fetch('/api/scan/content', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scan', siteUrl: cleanUrl, apiKey, query: action.query, pattern: action.pattern, scope: action.scope }),
          })
          const d = await r.json()
          result = {
            type: 'scan_content', success: d.success ?? false,
            message: d.success
              ? `Found ${d.total} match${d.total !== 1 ? 'es' : ''} (${d.unique_values} unique value${d.unique_values !== 1 ? 's' : ''}).`
              : (d.error || 'Scan failed'),
            data: d,
          }
          // Feed results back into the conversation so AI can summarize
          if (d.success && d.summary?.length > 0) {
            const summaryText = d.summary.slice(0, 15).map((s: any, i: number) =>
              `${i+1}. "${s.value}" - ${s.count} match${s.count !== 1 ? 'es' : ''} in ${s.locations.join(', ')}`
            ).join('\n')
            setMessages(prev => [...prev, {
              role: 'assistant' as const,
              content: `I found ${d.unique_values} unique value${d.unique_values !== 1 ? 's' : ''}:\n\n${summaryText}`,
              ts: new Date(),
            }])
          }
          break
        }

        case 'replace_content': {
          const r = await fetch('/api/scan/content', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'replace', siteUrl: cleanUrl, apiKey, find: action.find, replace: action.replace, scope: action.scope, targets: action.targets }),
          })
          const d = await r.json()
          result = {
            type: 'replace_content', success: d.success ?? false,
            message: d.success
              ? `Replaced ${d.replacements} instance${d.replacements !== 1 ? 's' : ''} of "${action.find}" with "${action.replace}". Cache cleared.`
              : (d.error || 'Replace failed'),
          }
          // Refresh preview after replacement
          if (d.success) {
            setIframeKey(k => k + 1)
            setTimeout(() => setIframeKey(k => k + 1), 3000)
          }
          break
        }

        case 'scan_site': {
          const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: cleanUrl }) })
          const d = await r.json()
          if (d.success) setScanReport(d.report)
          result = { type: 'scan_site', success: d.success, message: d.success ? `Scan done — Overall score: ${d.report?.scores?.overall}/100` : 'Scan failed' }
          break
        }
        case 'take_snapshot': {
          const r = await bridge('snapshot', 'POST', { label: action.label || 'Manual snapshot', page_id: action.pageId || 0 })
          const snapId = r.data?.snapshot_id || ''
          result = { type: 'take_snapshot', success: r.success, message: r.success ? `📸 Snapshot saved: "${action.label || 'Snapshot'}"` : `Snapshot failed: ${r.error}`, snapshotId: snapId }
          if (r.success) setSnapshots(prev => [{ id: snapId, label: action.label || 'Snapshot', created_at: new Date().toISOString() }, ...prev].slice(0, 20))
          break
        }
        default:
          result = { type: action.type, success: true, message: 'Done!' }
      }
    } catch (e: any) { result = { type: action.type, success: false, message: `Error: ${e.message}` } }

    // ── Auto-cache-clear after content changes ──────────────────
    const contentActions = ['update_page', 'create_page', 'update_element', 'replace_content', 'update_site_options', 'plugin_action']
    if (result.success && contentActions.includes(action.type)) {
      try {
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: cleanUrl, apiKey }) })
      } catch {}
      // Refresh preview after short delay for cache to clear
      setIframeKey(k => k + 1)
      setTimeout(() => setIframeKey(k => k + 1), 2500)
    }

    if (snapshotId) result.snapshotId = snapshotId
    setMessages(prev => prev.map(m => m === msg ? { ...m, actionResult: result } : m))
  }

  // Auto-snapshot before destructive actions
  async function autoSnapshot(label: string) {
    try {
      const r = await bridge('snapshot', 'POST', { label })
      if (r.success) setSnapshots(prev => [{ id: r.data?.snapshot_id, label, created_at: new Date().toISOString() }, ...prev].slice(0, 20))
    } catch {}
  }

  async function restoreSnapshot(snapshotId: string, label: string) {
    if (!confirm(`Restore to: "${label}"? This will overwrite current page content.`)) return
    const r = await bridge('restore', 'POST', { snapshot_id: snapshotId })
    if (r.success) {
      alert(`✓ Restored to: "${label}"`)
    } else {
      alert(`Failed to restore: ${r.error}`)
    }
  }

  // ── Theme select ───────────────────────────────────────────────
  function onThemeSelect(theme: any) {
    setShowThemes(false)
    const builderName = theme.builder || (Array.isArray(theme.builders) ? theme.builders[0] : 'WordPress')
    send(`Install and activate the ${theme.name} theme (slug: ${theme.slug}) on my site. It works with ${builderName}.`)
  }

  // ── LOADING (mode not yet fetched) — show blank spinner, NOT the mode picker ──
  if (!modeLoaded) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── MODE PICKER (first sign-in: no saved preference) ─────────────
  if (dashboardMode === null) return (
    <ModePicker onSelect={saveMode} />
  )

  // ── EASY MODE ────────────────────────────────────────────────────
  if (dashboardMode === 'easy') {
    const slugs = (siteInfo?.plugins || []).map((p: any) => p.slug || '')
    return <EasyModeDashboard
      siteUrl={siteUrl}
      apiKey={apiKey}
      pluginSlugs={slugs}
      userName={''}
      onSwitchMode={() => switchModeTemp('advanced')}
    />
  }

  if (loading) return (
    <div style={{ padding: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 16 }}>
      <div style={{ width: 44, height: 44, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <div style={{ fontSize: 16, color: C.text2 }}>Connecting to {siteUrl}…</div>
    </div>
  )

  // No API key — show reconnect prompt
  if (!apiKey) return (
    <div style={{ padding: '80px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, padding: '48px 40px', textAlign: 'center' as const, maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 41, marginBottom: 16 }}>🔗</div>
        <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: 23, fontWeight: 700, color: C.text, marginBottom: 10 }}>Connection key missing</h2>
        <p style={{ fontSize: 16, color: C.text2, lineHeight: 1.65, marginBottom: 28 }}>
          The API key for <strong>{siteUrl}</strong> wasn't found. This usually means the plugin was reinstalled. Run the connect flow again — it only takes 30 seconds.
        </p>
        <a href={`/bridge/connect`} style={{ display: 'inline-block', padding: '14px 36px', background: C.accent, borderRadius: 12, color: 'white', textDecoration: 'none', fontSize: 16, fontWeight: 700, fontFamily: 'Poppins, sans-serif', boxShadow: '0 4px 14px rgba(232,101,26,0.3)' }}>
          Reconnect Site →
        </a>
      </div>
    </div>
  )

  const plugins       = siteInfo?.plugins || []
  const activePlugins = plugins.filter(p => p.active !== false)
  const hasWoo        = hasPlugin(plugins, 'woocommerce')
  const hasAmelia     = hasPlugin(plugins, 'amelia')
  const hasEvents     = hasPlugin(plugins, 'events-calendar','the-events','event-calendar')
  const hasForms      = hasPlugin(plugins, 'contact-form','wpforms','gravity','cf7','ninja-forms')
  const hasYoast      = hasPlugin(plugins, 'yoast','rank-math','rankmath')
  const hasRocket     = hasPlugin(plugins, 'wp-rocket','w3-total','litespeed','autoptimize')
  const updates       = plugins.filter(p => p.update).length
  // Contextual actions tailored to this site's installed plugins
  const contextualActions = getContextualActions(siteInfo, (...slugs) => hasPlugin(plugins, ...slugs))
  const issues        = detectIssues(siteInfo, scanReport, pages)
  const visibleIssues = issues.filter(i => !dismissedIssues.includes(i.title))

  return (
    <div style={{ background: C.bg }}>
      
      {showThemes && <ThemeBrowser onSelect={onThemeSelect} onClose={() => setShowThemes(false)} currentTheme={siteInfo?.theme?.name}/>}

      {/* Key mismatch warning */}
      {keyError && (
        <div style={{ background: '#1a1a4e', borderBottom: `3px solid #f3af00`, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>
            🔑 API key mismatch
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', flex: 1 }}>
            Go to WP Admin → Settings → ignyous Bridge, copy your key, paste it here:
          </span>
          <input
            placeholder="igk_... (paste key, press Enter)"
            style={{ padding: '8px 14px', border: `2px solid #f3af00`, borderRadius: 8, fontSize: 13, fontFamily: 'monospace', width: 340, background: 'rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
            onKeyDown={async e => {
              if (e.key === 'Enter') {
                const newKey = (e.target as HTMLInputElement).value.trim()
                if (!newKey) return
                await fetch('/api/sites', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: siteUrl, apiKey: newKey }),
                })
                setApiKey(newKey)
                setKeyError(false)
                loadAll()
              }
            }}
          />
          <a href={`${cleanUrl}/wp-admin/options-general.php?page=ignyous-bridge`} target="_blank" rel="noreferrer"
            style={{ padding: '8px 14px', background: '#f3af00', borderRadius: 8, color: '#1a1a4e', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
            Open WP Admin ↗
          </a>
        </div>
      )}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, border: `1px solid ${C.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>🌐</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              {siteInfo?.site?.name || siteUrl}
              {/* Compact status dot */}
              <SiteStatusIndicator siteUrl={cleanUrl} apiKey={apiKey} compact />
            </div>
            <div style={{ fontSize: 13, color: C.text3, display: 'flex', alignItems: 'center', gap: 7 }}>
              {cleanUrl} · WP {siteInfo?.wordpress?.version || '?'} · {siteInfo?.theme?.name || siteInfo?.site?.theme || '?'} · {activePlugins.length} plugins
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          {updates > 0 && <button onClick={() => send('Update all my plugins to the latest versions')} style={{ padding: '7px 12px', background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, borderRadius: 8, fontSize: 13, color: C.yellow, fontWeight: 600, cursor: 'pointer' }}>⚠ {updates} update{updates>1?'s':''}</button>}
          {/* Content Scheduler */}
          <a href={`/content?site=${encodeURIComponent(siteUrl)}`} style={{ padding: '7px 14px', background: C.gold, border: 'none', borderRadius: 8, color: '#1a1a4e', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(243,175,0,0.3)' }}>✍️ Content Scheduler</a>
          {/* Backups */}
          <a href={`/snapshots?site=${encodeURIComponent(siteUrl)}`} style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>🗂 Backups</a>
          {/* Activity */}
          <a href={`/activity?site=${encodeURIComponent(siteUrl)}`} style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>📋 Activity</a>
          {/* Test bridge — opens in new tab showing diagnostics */}
          <a href={`/api/debug/bridge?site=${encodeURIComponent(cleanUrl)}&key=${encodeURIComponent(apiKey)}`} target="_blank" rel="noreferrer" title="Test WP plugin connection" style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text3, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>🔧</a>
          {/* API key copy */}
          {apiKey && (
            <button
              title={`API Key: ${apiKey.slice(0,8)}…  (click to copy)`}
              onClick={() => { navigator.clipboard.writeText(apiKey); }}
              style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace' }}
            >
              🔑 {apiKey.slice(0, 8)}…
            </button>
          )}
          <a href={`${cleanUrl}/wp-admin`} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', border: `1px solid #1a1a4e`, borderRadius: 8, background: '#1a1a4e', color: 'white', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>WP Admin ↗</a>
          <a href={cleanUrl} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>View Site ↗</a>
        </div>
      </div>

      {/* Status indicator removed — now inline in site info bar above */}

      {/* ── MAIN LAYOUT: AI LEFT + PREVIEW RIGHT ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 58px - 62px)' }}>

        {/* ── LEFT: AI CHAT + ISSUES + ACTIONS ── */}
        <div style={{ width: 500, flexShrink: 0, display: 'flex', flexDirection: 'column' as const, borderRight: `1px solid ${C.border}`, background: C.white, overflowY: 'auto', overscrollBehavior: 'contain' }}>

        {/* ════ 1. AI CHAT HERO ════ */}
        <div style={{ background: '#EEEEF8', borderBottom: `2px solid #D4D4EE` }}>
          <div style={{ padding: '16px 20px 0', background: `linear-gradient(120deg, rgba(26,26,78,0.08) 0%, #EEEEF8 60%)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#1a1a4e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 17 }}>✦</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Poppins, sans-serif', color: C.text }}>Ask ignyous anything</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text2 }}>Plain English — I'll handle everything</div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatContainerRef} style={{ padding: '14px 16px 0', height: 320, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column' as const, gap: 12, background: 'rgba(255,255,255,0.55)', borderRadius: '15px 15px 0 0', margin: '12px 14px 0', backdropFilter: 'blur(4px)', boxShadow: 'inset 0 1px 4px rgba(26,26,78,0.07)' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: msg.role==='user'?'row-reverse':'row', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: msg.role==='user'?'#1a1a4e':C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'white', fontWeight: 700, marginTop: 2 }}>
                  {msg.role==='user'?'U':'✦'}
                </div>
                <div style={{ maxWidth: '80%' }}>
                  <div style={{ padding: '10px 14px', borderRadius: 14, fontSize: 15, fontWeight: 500, lineHeight: 1.65, background: msg.role==='user'?'#1a1a4e':C.surface, color: msg.role==='user'?'white':C.text, border: msg.role==='user'?'none':`1px solid ${C.border}`, ...(msg.role==='user'?{borderTopRightRadius:4}:{borderTopLeftRadius:4}) }}>
                    {msg.role === 'user' ? (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    ) : (
                      <ReactMarkdown
                        components={{
                          table: ({ children }) => (
                            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => <thead style={{ background: 'rgba(26,26,78,0.06)' }}>{children}</thead>,
                          th: ({ children }) => <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: '#1a1a4e', borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap' as const }}>{children}</th>,
                          td: ({ children }) => <td style={{ padding: '7px 12px', borderBottom: `1px solid ${C.border}` }}>{children}</td>,
                          tr: ({ children }) => <tr>{children}</tr>,
                          p: ({ children }) => <p style={{ margin: '0 0 6px', lineHeight: 1.65 }}>{children}</p>,
                          strong: ({ children }) => <strong style={{ fontWeight: 700, color: '#1a1a4e' }}>{children}</strong>,
                          ul: ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</ul>,
                          ol: ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</ol>,
                          li: ({ children }) => <li style={{ lineHeight: 1.55 }}>{children}</li>,
                          code: ({ children }) => <code style={{ background: 'rgba(26,26,78,0.08)', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{children}</code>,
                          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: 'underline' }}>{children}</a>,
                          hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '8px 0' }} />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                  {msg.action && !msg.actionResult && (
                    <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`, fontSize: 14, color: C.yellow, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 11, height: 11, border: `2px solid ${C.yellowBorder}`, borderTopColor: C.yellow, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
                      Working on it…
                    </div>
                  )}
                  {msg.actionResult && <ActionFeedback result={msg.actionResult} onRollback={msg.actionResult.snapshotId ? () => restoreSnapshot(msg.actionResult!.snapshotId!, msg.actionResult!.message) : undefined}/>}

                  {/* Clickable options from AI */}
                  {msg.options && msg.options.length > 0 && !msg.actionResult && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
                      {msg.options.map((opt: any, oi: number) => {
                        const isVariation = /^variation\s+[a-c]/i.test(opt.label)
                        return (
                          <button key={oi} onClick={() => {
                            if (isVariation) {
                              const varLetter = opt.label.match(/variation\s+([a-c])/i)?.[1]?.toUpperCase()
                              if (varLetter) {
                                const fields: Record<string,string> = {}
                                const varBlock = msg.content.match(new RegExp(`Variation ${varLetter}[^\n]*\n([\\s\\S]*?)(?=---\n|Variation [A-C]|$)`))?.[1] || ''
                                varBlock.split('\n').forEach(line => {
                                  const m = line.match(/[-•]\s*\*?\*?([^:*]+)\*?\*?:\s*["""]?(.+?)["""]?\s*$/)
                                  if (m) fields[m[1].trim()] = m[2].trim()
                                })
                                setVariationPreview({ label: opt.label, fields })
                              }
                            }
                            runQuickOption(opt, msg)
                          }} style={{
                            padding: '9px 14px', borderRadius: 9,
                            border: isVariation ? `1.5px solid #f3af00` : `1.5px solid #1a1a4e`,
                            background: isVariation ? '#fffbeb' : '#1a1a4e',
                            color: isVariation ? '#92400E' : 'white',
                            fontSize: 14, fontWeight: 600,
                            cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.15s',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f3af00'; e.currentTarget.style.color = '#1a1a4e'; e.currentTarget.style.borderColor = '#f3af00' }}
                            onMouseLeave={e => { e.currentTarget.style.background = isVariation ? '#fffbeb' : '#1a1a4e'; e.currentTarget.style.color = isVariation ? '#92400E' : 'white'; e.currentTarget.style.borderColor = isVariation ? '#f3af00' : '#1a1a4e' }}
                          >
                            {isVariation ? '✦ ' : '→ '}{opt.label}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: C.text3, marginTop: 3, textAlign: msg.role==='user'?'right':'left' as const }}>
                    {msg.ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13 }}>✦</div>
                <div style={{ padding: '12px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, borderTopLeftRadius: 4 }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.text3, animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input — docked inside the chat container, 6px from edges */}
          <div style={{ margin: '0 14px 14px', padding: 6, background: 'rgba(255,255,255,0.55)', borderRadius: '0 0 15px 15px', boxShadow: 'inset 0 -1px 4px rgba(26,26,78,0.07)' }}>
            <div style={{ display: 'flex', gap: 10, border: `2px solid #C8C8E8`, borderRadius: 12, padding: '4px 4px 4px 14px', background: 'white', transition: 'border-color 0.2s', boxShadow: '0 2px 8px rgba(26,26,78,0.08)' }}
              onFocusCapture={e => e.currentTarget.style.borderColor = '#1a1a4e'}
              onBlurCapture={e => e.currentTarget.style.borderColor = '#C8C8E8'}
            >
              {pendingImageData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#e8f5e9', borderRadius: 8, fontSize: 13, color: '#1E7B4B', marginBottom: 4 }}>
              🖼 <strong>{pendingImageData.name}</strong> ready to upload
              <button onClick={() => setPendingImageData(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16 }}>×</button>
            </div>
          )}
          <textarea ref={textareaRef} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px' }}
                onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={`Tell ignyous what you want to do with ${siteInfo?.site?.name||'your site'}…`}
                rows={2} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontFamily: 'Poppins, sans-serif', color: C.text, resize: 'none', lineHeight: 1.5, padding: '8px 0' }}
              />
              {/* Hidden file input for image uploads */}
          <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e => {
            const file = e.target.files?.[0]; if (!file) return
            const reader = new FileReader()
            reader.onload = evt => {
              const data = (evt.target?.result as string) || ''
              setPendingImageData({ data, name: file.name })
              setInput(prev => prev || `Upload this image to my site`)
            }
            reader.readAsDataURL(file)
          }} />
          {/* Image upload button */}
          <button onClick={() => fileInputRef.current?.click()} title="Attach image" style={{ alignSelf: 'flex-end', width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, flexShrink: 0, marginBottom: 2, background: pendingImageData ? '#e8f5e9' : C.white, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            {pendingImageData ? '🖼' : '📎'}
          </button>
          <button onClick={() => send()} disabled={sending||!input.trim()} style={{ alignSelf: 'flex-end', width: 40, height: 40, borderRadius: 10, border: 'none', flexShrink: 0, marginBottom: 2, background: sending||!input.trim()?C.border:'#f3af00', cursor: sending||!input.trim()?'not-allowed':'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="#1a1a4e"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Suggestion chips — outside the chat zone, white bg */}
        <div style={{ padding: '12px 16px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' as const, background: C.white, borderBottom: `1px solid ${C.border}` }}>
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)} style={{ padding: '5px 11px', border: `1px solid ${C.border}`, borderRadius: 20, background: C.white, color: C.text2, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' as const }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='#1a1a4e'; e.currentTarget.style.color='#1a1a4e' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.text2 }}
            >{s}</button>
          ))}
        </div>

        {/* ════ ISSUES STRIP ════ */}
        {visibleIssues.length > 0 && (
          <div style={{ margin: '0 12px 12px', background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10 }}>
              ✦ {visibleIssues.length} issue{visibleIssues.length>1?'s':''} found
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
              {visibleIssues.map((issue, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'white', border: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 16 }}>{issue.icon}</span>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.text }}>{issue.title}</div>
                  <button onClick={() => send(issue.prompt)} style={{ padding: '4px 10px', background: C.accent, border: 'none', borderRadius: 6, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Fix ✦</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ ROUTINE LIBRARY ════ */}
        <div style={{ padding: '12px 12px 16px' }}>
          <RoutineLibrary siteUrl={cleanUrl} onRoutineComplete={(routine, msg) => {
            addMessage({ role: 'assistant', content: msg, ts: new Date() })
          }}/>
        </div>

        {/* ════ QUICK ACTIONS ════ */}
        <div style={{ padding: '12px 12px 16px' }}>

          {/* SEO HERO CARD — first and biggest */}
          <button onClick={() => send(SEO_ACTION.prompt)} style={{
            width: '100%', padding: '16px 18px', marginBottom: 12,
            background: 'linear-gradient(135deg, #1a1a4e 0%, #2d2d7a 100%)',
            border: 'none', borderRadius: 14, cursor: 'pointer', textAlign: 'left' as const,
            fontFamily: 'Poppins, sans-serif', transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(232,101,26,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>🔍</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 3 }}>{SEO_ACTION.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{SEO_ACTION.desc}</div>
              </div>
              <div style={{ color: C.accent, fontSize: 14, fontWeight: 600, flexShrink: 0 }}>Run Audit →</div>
            </div>
            {scanReport?.scores?.seo != null && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: scanReport.scores.seo >= 70 ? 'rgba(30,123,75,0.3)' : 'rgba(232,101,26,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>{scanReport.scores.seo}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Current SEO score · {scanReport.scores.seo >= 70 ? 'Good' : scanReport.scores.seo >= 45 ? 'Needs work' : 'Critical'}</div>
              </div>
            )}
          </button>

          <div style={{ fontSize: 12, fontWeight: 600, color: C.text3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10, paddingLeft: 4 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {contextualActions.map(action => (
              <button key={action.label}
                onClick={() => action.prompt==='OPEN_THEME_BROWSER' ? setShowThemes(true) : send(action.prompt)}
                style={{
                  padding: '12px 14px', background: C.white, border: `1.5px solid ${C.border}`,
                  borderRadius: 12, cursor: 'pointer', textAlign: 'left' as const,
                  fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 9,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=C.accent; e.currentTarget.style.background=C.accentDim }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.background=C.white }}
              >
                <span style={{ fontSize: 20 }}>{action.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{action.label}</div>
                  <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.3 }}>{action.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        </div>{/* end left panel */}

        {/* ── RIGHT: LIVE SITE PREVIEW ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, background: '#E8E4DF', overflow: 'hidden', position: 'relative' }}>

          {/* Preview toolbar */}
          <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['#FF5F57','#FFBD2E','#28CA41'].map(col => <div key={col} style={{ width: 11, height: 11, borderRadius: '50%', background: col }}/>)}
            </div>
            <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, color: C.text3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {pendingAction ? `✦ Draft preview — "${pendingAction.action.title || 'Proposed change'}"` : variationPreview ? `✦ Preview: ${variationPreview.label}` : (previewUrl || cleanUrl)}
            </div>
            {(pendingAction || variationPreview) && (
              <button onClick={() => { setPendingAction(null); setVariationPreview(null) }} style={{ padding: '5px 12px', background: 'rgba(255,255,255,0.1)', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>← Live site</button>
            )}
            <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {(['desktop','mobile'] as const).map(m => (
                <button key={m} onClick={() => setPreviewMode(m)} style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 12, background: previewMode===m?C.text:'white', color: previewMode===m?'white':C.text2 }}>
                  {m === 'desktop' ? '🖥' : '📱'}
                </button>
              ))}
            </div>
            {!pendingAction && !variationPreview && <>
              <button onClick={() => { setIframeKey(k => k+1) }} style={{ padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'white', color: C.text2, fontSize: 12, cursor: 'pointer' }}>↺</button>
              <a href={previewUrl || cleanUrl} target="_blank" rel="noreferrer" style={{ padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 7, background: 'white', color: C.text2, fontSize: 12, textDecoration: 'none' }}>↗</a>
            </>}
          </div>

          {/* ── PENDING ACTION PREVIEW ── */}
          {pendingAction ? (() => {
            const a = pendingAction.action
            const targetPage = pages.find(p => p.id === a.pageId)
            const previewHtml = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Draft Preview — ${a.title || targetPage?.title || 'New Page'}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a2e;background:#fff}
  .preview-banner{background:#1a1a4e;color:white;padding:10px 20px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between}
  .preview-banner span{background:#f3af00;color:#1a1a4e;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700}
  .page-title{padding:40px 40px 20px;border-bottom:2px solid #f0f0fa;background:#fafafa}
  .page-title h1{font-size:32px;font-weight:800;color:#1a1a2e;line-height:1.2}
  .page-title .meta{font-size:13px;color:#999;margin-top:8px}
  .page-content{padding:32px 40px;max-width:860px;font-size:16px;line-height:1.8;color:#2d2d2d}
  .page-content h1,.page-content h2,.page-content h3{color:#1a1a4e;margin:24px 0 12px;font-weight:700}
  .page-content h2{font-size:24px}.page-content h3{font-size:20px}
  .page-content p{margin-bottom:16px}
  .page-content ul,.page-content ol{margin:12px 0 12px 24px}
  .page-content li{margin-bottom:6px}
  .page-content strong{font-weight:700}
  .page-content a{color:#1a1a4e;text-decoration:underline}
  .page-content img{max-width:100%;border-radius:8px;margin:12px 0}
  .draft-footer{background:#f0f0fa;border-top:2px solid #c8c8e8;padding:16px 40px;font-size:13px;color:#6b6b8a;text-align:center}
</style></head><body>
<div class="preview-banner">
  <div>📄 ${a.type === 'create_page' ? 'New page' : `"${targetPage?.title || 'Page'}"` } — proposed changes</div>
  <span>DRAFT PREVIEW</span>
</div>
<div class="page-title">
  <h1>${a.title || targetPage?.title || 'Page'}</h1>
  <div class="meta">Draft · Not published · ${new Date().toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})}</div>
</div>
<div class="page-content">${a.content || '<p style="color:#999;font-style:italic">No content preview available</p>'}</div>
<div class="draft-footer">This is a draft preview only — nothing has been changed on your live site yet</div>
</body></html>`
            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }}>
                {/* Action bar */}
                <div style={{ background: '#1a1a4e', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <div style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600 }}>
                    👁 Preview of proposed change — review before publishing
                  </div>
                  <button onClick={confirmPendingAction} style={{ padding: '9px 22px', background: '#f3af00', border: 'none', borderRadius: 8, color: '#1a1a4e', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                    ✓ Publish this change
                  </button>
                  <button onClick={discardPendingAction} style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    ✗ Discard
                  </button>
                </div>
                {/* Draft iframe — real WP preview if available, else generic */}
                <div style={{ flex: 1, background: '#e8e4df', overflow: 'hidden', position: 'relative' as const }}>
                  {livePreviewLoading && (
                    <div style={{ position: 'absolute' as const, inset: 0, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', background: '#e8e4df', zIndex: 10, gap: 14 }}>
                      <div style={{ width: 36, height: 36, border: '3px solid rgba(26,26,78,0.15)', borderTopColor: '#1a1a4e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a4e' }}>Loading real site preview…</div>
                    </div>
                  )}
                  {!livePreviewLoading && livePreviewHtml ? (
                    <iframe
                      srcDoc={livePreviewHtml}
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                      title="Live draft preview"
                      sandbox="allow-same-origin allow-scripts"
                    />
                  ) : !livePreviewLoading ? (
                    <div style={{ padding: 16, height: '100%', display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
                      <div style={{ width: previewMode==='mobile'?390:'100%', minHeight: 500, background: C.white, borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                        <iframe srcDoc={previewHtml} style={{ width: '100%', height: '100%', minHeight: 600, border: 'none', display: 'block' }} title="Draft preview" sandbox="allow-same-origin"/>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })() : variationPreview ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
              <div style={{ width: previewMode==='mobile'?390:'100%', maxWidth: 860, background: C.white, borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                {/* Mock browser chrome */}
                <div style={{ background: '#f0f0f0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #ddd' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['#FF5F57','#FFBD2E','#28CA41'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }}/>)}
                  </div>
                  <div style={{ flex: 1, background: 'white', borderRadius: 5, padding: '4px 10px', fontSize: 11, color: '#999' }}>{cleanUrl}</div>
                </div>
                {/* Hero section mock */}
                <div style={{ background: 'linear-gradient(135deg, #1a1a4e 0%, #2d2d7a 100%)', padding: '60px 48px', textAlign: 'center' as const }}>
                  <div style={{ display: 'inline-block', background: 'rgba(243,175,0,0.2)', border: '1px solid rgba(243,175,0,0.4)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600, color: '#f3af00', marginBottom: 20, letterSpacing: '0.05em' }}>
                    ✦ PREVIEW — {variationPreview.label.toUpperCase()}
                  </div>
                  <h1 style={{ fontSize: previewMode==='mobile'?24:36, fontWeight: 800, color: 'white', marginBottom: 16, lineHeight: 1.25 }}>
                    {variationPreview.fields['Headline'] || variationPreview.fields['Title'] || 'Hero Headline'}
                  </h1>
                  <p style={{ fontSize: previewMode==='mobile'?14:18, fontWeight: 500, color: 'rgba(255,255,255,0.75)', marginBottom: 32, maxWidth: 560, margin: '0 auto 32px' }}>
                    {variationPreview.fields['Subtext'] || variationPreview.fields['Subtitle'] || variationPreview.fields['Description'] || ''}
                  </p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
                    {(variationPreview.fields['Button'] || variationPreview.fields['CTA'] || variationPreview.fields['Button Text']) && (
                      <div style={{ padding: '14px 32px', background: '#f3af00', borderRadius: 8, color: '#1a1a4e', fontSize: 16, fontWeight: 700, cursor: 'default' }}>
                        {variationPreview.fields['Button'] || variationPreview.fields['CTA'] || variationPreview.fields['Button Text']}
                      </div>
                    )}
                  </div>
                </div>
                {/* Body placeholder */}
                <div style={{ padding: '32px 48px', background: 'white' }}>
                  {Object.entries(variationPreview.fields).filter(([k]) => !['Headline','Title','Subtext','Subtitle','Button','CTA','Button Text','Description'].includes(k)).map(([key, val]) => (
                    <div key={key} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a4e', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>{key}</div>
                      <div style={{ fontSize: 15, color: '#444', lineHeight: 1.6 }}>{val}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                    {[1,2,3].map(n => <div key={n} style={{ flex: 1, height: 80, background: '#f5f5f5', borderRadius: 8 }}/>)}
                  </div>
                  <div style={{ height: 16, background: '#f5f5f5', borderRadius: 4, marginTop: 20, width: '70%' }}/>
                  <div style={{ height: 16, background: '#f5f5f5', borderRadius: 4, marginTop: 10, width: '50%' }}/>
                </div>
                <div style={{ padding: '12px 48px', background: '#1a1a4e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>This is a preview — not live yet</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f3af00' }}>Reply in chat to apply or change →</div>
                </div>
              </div>
            </div>
          ) : (
            /* iframe */
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflow: 'auto' }}>
              <div style={{ width: previewMode==='mobile' ? 390 : '100%', height: '100%', minHeight: 500, background: C.white, borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', overflow: 'hidden', position: 'relative' }}>
                {(previewUrl || cleanUrl) ? (
                  rightTab === 'design' ? (
                    <GlobalDesignPanel siteUrl={cleanUrl} apiKey={apiKey} />
                  ) : (
                    <iframe key={iframeKey} src={previewUrl || cleanUrl} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="Live site preview" sandbox="allow-same-origin allow-scripts allow-forms"/>
                  )
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, color: C.text3, gap: 12 }}>
                    <div style={{ fontSize: 40 }}>🌐</div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Connect a site to see the preview</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview status bar */}
          <div style={{ background: C.white, borderTop: `1px solid ${C.border}`, padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: C.text3, flexShrink: 0 }}>
            <span>{pendingAction ? 'Draft preview — approve or discard before anything goes live' : variationPreview ? `Previewing: ${variationPreview.label} — reply in chat to apply` : rightTab === 'design' ? 'Global design settings' : 'Live preview — changes appear here automatically'}</span>
                  <div style={{ display:'flex', gap:4, marginLeft:'auto' }}>
                    {(['preview','design'] as const).map(t => (
                      <button key={t} onClick={() => setRightTab(t)} style={{ padding:'4px 12px', border:`1px solid ${t===rightTab?C.accent:C.border}`, borderRadius:6, background:t===rightTab?C.accentDim:C.white, color:t===rightTab?C.accent:C.text2, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                        {t === 'preview' ? '🖥 Preview' : '🎨 Design'}
                      </button>
                    ))}
                  </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: pendingAction ? C.yellow : variationPreview ? C.gold : C.green }}/>
              {pendingAction ? 'Pending Approval' : variationPreview ? 'Preview Mode' : 'Connected'}
            </span>
          </div>
        </div>

      </div>{/* end main layout */}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <AppLayout onSwitchToEasy={() => switchModeTemp('easy')}>
      <Suspense fallback={
        <div style={{ minHeight: '100vh', background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 44, height: 44, border: '3px solid #E2DDD8', borderTopColor: '#E8651A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        </div>
      }>
        <DashboardInner/>
      </Suspense>
    </AppLayout>
  )
}
