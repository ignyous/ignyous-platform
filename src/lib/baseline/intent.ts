// src/lib/baseline/intent.ts
//
// Parses what the user types into a structured Action that the apply route
// can execute against the bridge. Regex first (free), AI last (paid).
//
// Phase 0 surface area:
//   - set site title
//   - set tagline
//   - set page title (which page? defaults to home if unspecified)
//   - set page content (replace text)
//   - set primary color
//   - set text color / background color
//   - set heading font / body font
//   - undo

export type Action =
  | { capability: 'options.patch';  body: { site_title?: string; tagline?: string };          label: string }
  | { capability: 'pages.patch';    pageRef: string | number; body: { title?: string; content?: string }; label: string }
  | { capability: 'theme.patch';    body: { primary_color?: string; text_color?: string; background_color?: string; heading_font?: string; body_font?: string }; label: string }
  | { capability: 'pages.featured_image';  pageRef: string | number; attachmentRef: 'last_uploaded' | 'clear' | number; label: string }
  | { capability: 'options.site_logo';     attachmentRef: 'last_uploaded' | 'clear' | number; label: string }
  | { capability: 'pages.replace_first_image'; pageRef: string | number; attachmentRef: 'last_uploaded' | number; label: string }
  | { capability: 'undo';           changeId?: string; label: string }

export interface ParseResult {
  source: 'regex' | 'ai' | 'none'
  action?: Action
  hint?: string         // why we couldn't parse it (only when source==='none')
  aiTokens?: number
}

const COLOR_NAMES: Record<string, string> = {
  red:'#dc2626', orange:'#ea580c', amber:'#f59e0b', yellow:'#eab308',
  green:'#16a34a', teal:'#14b8a6', cyan:'#06b6d4', sky:'#0284c7',
  blue:'#2563eb', indigo:'#4f46e5', purple:'#9333ea', pink:'#ec4899',
  rose:'#e11d48', black:'#000000', white:'#ffffff', gray:'#6b7280',
  grey:'#6b7280', navy:'#1e3a8a',
}

function asHex(v: string): string | null {
  v = v.trim().toLowerCase()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v
  if (COLOR_NAMES[v]) return COLOR_NAMES[v]
  return null
}

export function parseIntent(text: string): ParseResult {
  const t = text.trim()
  if (!t) return { source: 'none', hint: 'empty input' }

  // ─── Undo ──
  if (/^(undo|revert|rollback|cancel that)\b/i.test(t)) {
    return { source: 'regex', action: { capability: 'undo', label: 'Undo last change' } }
  }

  // ─── Site title ──
  let m = t.match(/(?:change|set|update|rename)?\s*(?:the\s+)?site\s+(?:title|name)\s+(?:to|=|:)\s+(.+?)\.?$/i)
  if (m) return { source: 'regex', action: { capability: 'options.patch', body: { site_title: stripQuotes(m[1]) }, label: `Site title → "${stripQuotes(m[1])}"` } }

  // ─── Tagline ──
  m = t.match(/(?:change|set|update)?\s*(?:the\s+)?tagline\s+(?:to|=|:)\s+(.+?)\.?$/i)
  if (m) return { source: 'regex', action: { capability: 'options.patch', body: { tagline: stripQuotes(m[1]) }, label: `Tagline → "${stripQuotes(m[1])}"` } }

  // ─── Primary color ──
  m = t.match(/(?:change|set|make)?\s*(?:the\s+)?(?:primary|main|brand|accent|theme)\s+color(?:s)?\s+(?:to|=|:)\s+(\S+)/i)
  if (m) {
    const hex = asHex(m[1])
    if (hex) return { source: 'regex', action: { capability: 'theme.patch', body: { primary_color: hex }, label: `Primary color → ${hex}` } }
    return { source: 'none', hint: `Could not parse color "${m[1]}". Try a hex code like #2563eb.` }
  }
  // "make the site blue" / "change the colors to blue"
  m = t.match(/^(?:make|change|set)\s+(?:the\s+)?(?:site|colors?|theme)\s+(?:to\s+)?(\w+)\.?$/i)
  if (m) {
    const hex = asHex(m[1])
    if (hex) return { source: 'regex', action: { capability: 'theme.patch', body: { primary_color: hex }, label: `Primary color → ${m[1]} (${hex})` } }
  }

  // ─── Text / background color ──
  m = t.match(/(?:change|set|make)?\s*(?:the\s+)?(text|body|font|background|page background)\s+color\s+(?:to|=|:)\s+(\S+)/i)
  if (m) {
    const target = /background/i.test(m[1]) ? 'background_color' : 'text_color'
    const hex = asHex(m[2])
    if (hex) return { source: 'regex', action: { capability: 'theme.patch', body: { [target]: hex } as any, label: `${target.replace('_',' ')} → ${hex}` } }
    return { source: 'none', hint: `Could not parse color "${m[2]}".` }
  }

  // ─── Fonts ──
  m = t.match(/(?:change|set|use|make)?\s*(?:the\s+)?heading(?:s)?\s+font\s+(?:to|=|:)\s+(.+?)\.?$/i)
  if (m) return { source: 'regex', action: { capability: 'theme.patch', body: { heading_font: stripQuotes(m[1]) }, label: `Heading font → ${stripQuotes(m[1])}` } }
  m = t.match(/(?:change|set|use|make)?\s*(?:the\s+)?(?:body|paragraph|text)\s+font\s+(?:to|=|:)\s+(.+?)\.?$/i)
  if (m) return { source: 'regex', action: { capability: 'theme.patch', body: { body_font: stripQuotes(m[1]) }, label: `Body font → ${stripQuotes(m[1])}` } }

  // ─── Page title ──
  m = t.match(/(?:change|set|rename|update)?\s*(?:the\s+)?(?:home(?:page)?|page)\s+title\s+(?:to|=|:)\s+(.+?)\.?$/i)
  if (m) {
    const ref = /home/i.test(t) ? 'home' : 'home'
    return { source: 'regex', action: { capability: 'pages.patch', pageRef: ref, body: { title: stripQuotes(m[1]) }, label: `Home page title → "${stripQuotes(m[1])}"` } }
  }

  // ─── Page content (very basic: "replace homepage with X" / "set home content to X") ──
  m = t.match(/(?:set|change|replace|update)\s+(?:the\s+)?(?:home(?:page)?|page)\s+content\s+(?:to|with|=|:)\s+(.+)$/i)
  if (m) return { source: 'regex', action: { capability: 'pages.patch', pageRef: 'home', body: { content: stripQuotes(m[1]) }, label: `Home page content replaced` } }

  // ─── Featured image ──
  // "set featured image of home to the uploaded image"
  // "set the featured image on the home page"
  // "remove featured image from home"
  m = t.match(/^(?:remove|clear)\s+(?:the\s+)?featured\s+image(?:\s+(?:from|of|on)\s+(?:the\s+)?(.+?))?\.?$/i)
  if (m) {
    const ref = (m[1] || 'home').replace(/\s+page$/i, '').trim() || 'home'
    return { source: 'regex', action: { capability: 'pages.featured_image', pageRef: ref, attachmentRef: 'clear', label: `Remove featured image from ${ref}` } }
  }
  m = t.match(/^(?:set|change|use|make)\s+(?:the\s+)?featured\s+image(?:\s+(?:of|on|for)\s+(?:the\s+)?(.+?))?\s+(?:to\s+(?:the\s+)?(?:uploaded|new|last)\s+image)?\.?$/i)
  if (m) {
    const ref = (m[1] || 'home').replace(/\s+page$/i, '').trim() || 'home'
    return { source: 'regex', action: { capability: 'pages.featured_image', pageRef: ref, attachmentRef: 'last_uploaded', label: `Featured image on ${ref} → last uploaded` } }
  }

  // ─── Site logo ──
  m = t.match(/^(?:remove|clear)\s+(?:the\s+)?(?:site\s+)?logo\.?$/i)
  if (m) return { source: 'regex', action: { capability: 'options.site_logo', attachmentRef: 'clear', label: 'Remove site logo' } }
  m = t.match(/^(?:set|change|use|upload|update)\s+(?:the\s+)?(?:site\s+)?logo(?:\s+to\s+(?:the\s+)?(?:uploaded|new|last)\s+image)?\.?$/i)
  if (m) return { source: 'regex', action: { capability: 'options.site_logo', attachmentRef: 'last_uploaded', label: 'Site logo → last uploaded' } }

  // ─── Replace first image on a page ──
  m = t.match(/^(?:replace|swap|change)\s+(?:the\s+)?(?:first|main|hero)\s+image(?:\s+(?:on|of|in)\s+(?:the\s+)?(.+?))?(?:\s+(?:with|to)\s+(?:the\s+)?(?:uploaded|new|last)\s+image)?\.?$/i)
  if (m) {
    const ref = (m[1] || 'home').replace(/\s+page$/i, '').trim() || 'home'
    return { source: 'regex', action: { capability: 'pages.replace_first_image', pageRef: ref, attachmentRef: 'last_uploaded', label: `Replace first image on ${ref}` } }
  }

  return { source: 'none', hint: 'Did not match any patterns. Try: "set site title to X", "change primary color to blue", "set featured image on home", "replace first image on home", "set site logo".' }
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^['"](.*)['"]$/, '$1').trim()
}
