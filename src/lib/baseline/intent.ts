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
  | { capability: 'blocks.patch';   pageRef: string | number;
                                    target: BlockTarget;
                                    op: BlockOp;
                                    label: string }
  | { capability: 'elementor.patch'; pageRef: string | number;
                                    target: ElementorTarget;
                                    op: { type: 'set_text'; value: string; field?: string };
                                    label: string }
  | { capability: 'undo';           changeId?: string; label: string }

/** How the platform locates an Elementor element (resolved to id before patch). */
export type ElementorTarget =
  | { kind: 'first';    widgetType: string }
  | { kind: 'nth';      widgetType: string; index: number }
  | { kind: 'contains'; widgetType: string; text: string }
  | { kind: 'id';       id: string }
  | { kind: 'path';     path: string }

export type BlockOp =
  | { type: 'set_text';     value: string }
  | { type: 'set_attr';     name: string; value: any }
  | { type: 'set_style';    category: 'color' | 'spacing' | 'typography'; name: string; value: any }
  | { type: 'clear_style';  category: 'color' | 'spacing' | 'typography'; name: string }

/** How the platform locates a block before it has the page's block tree in hand. */
export type BlockTarget =
  | { kind: 'first';      blockType: string }                 // "the heading" → first core/heading
  | { kind: 'nth';        blockType: string; index: number }  // "the second paragraph" → core/paragraph #1
  | { kind: 'contains';   blockType: string; text: string }   // "the heading that says X"
  | { kind: 'path';       path: string }                       // explicit (e.g. from UI click)

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

// Shared lookup tables for block-target patterns.
const ord = '(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)'
function ordToNum(s: string): number {
  const map: Record<string, number> = { first:0,'1st':0, second:1,'2nd':1, third:2,'3rd':2, fourth:3,'4th':3, fifth:4,'5th':4, sixth:5,'6th':5, seventh:6,'7th':6, eighth:7,'8th':7, ninth:8,'9th':8, tenth:9,'10th':9 }
  return map[s.toLowerCase()] ?? 0
}
const TYPE_MAP: Record<string, string> = {
  heading: 'core/heading', headline: 'core/heading', title: 'core/heading',
  paragraph: 'core/paragraph', text: 'core/paragraph',
  button: 'core/button', cta: 'core/button',
  quote: 'core/quote',
  group: 'core/group',
  'list-item': 'core/list-item', 'list item': 'core/list-item', listitem: 'core/list-item',
}
function typeMapStyles(s: string): string {
  return TYPE_MAP[s.toLowerCase().replace(/[\s-]+/g, '-')] || TYPE_MAP[s.toLowerCase()] || ''
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
  m = t.match(/^(?:set|change|use|make)\s+(?:the\s+)?featured\s+image(?:\s+(?:of|on|for)\s+(?:the\s+)?(.+?))?(?:\s+to\s+(?:the\s+)?(?:uploaded|new|last)\s+image)?\.?$/i)
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

  // ─── Block styles (Phase 3) ──
  // These must come BEFORE the generic "change the X to Y" so we don't
  // accidentally interpret "change the heading color to red" as a text edit.
  //
  // Patterns:
  //   "change the heading color to red"           → blocks.patch set_style color.text
  //   "change the button background to #2563eb"  → blocks.patch set_style color.background
  //   "change the [nth] [type] background color to X"
  //   "set the heading padding to 32px"           → blocks.patch set_style spacing.padding
  //   "set the heading font size to 24px"         → blocks.patch set_style typography.fontSize
  //   "make the heading red"     (heading/paragraph → text color)
  //   "make the button red"      (button           → background color)

  // "change the [N]th [type] (text|background) color to X"
  m = t.match(new RegExp(`^(?:change|set|make)\\s+(?:the\\s+)?(?:(${ord})\\s+)?(heading|headline|title|paragraph|text|button|cta|quote|list[\\s-]?item)\\s+(text\\s+color|background\\s+color|background|color|colour)\\s+(?:to\\s+)(\\S+)\\.?$`, 'i'))
  if (m) {
    const blockType = typeMapStyles(m[2])
    const which = m[3].toLowerCase()
    const styleName = /background/i.test(which) ? 'background' : 'text'
    const hex = asHex(m[4])
    if (!hex) return { source: 'none', hint: `Could not parse color "${m[4]}". Try a hex like #2563eb or a name like blue.` }
    return {
      source: 'regex',
      action: {
        capability: 'blocks.patch',
        pageRef: 'home',
        target: m[1] ? { kind: 'nth', blockType, index: ordToNum(m[1]) } : { kind: 'first', blockType },
        op: { type: 'set_style', category: 'color', name: styleName, value: hex },
        label: `${m[1] ? m[1] + ' ' : ''}${m[2]} ${styleName} color → ${hex}`,
      },
    }
  }

  // "make the [type] red"
  m = t.match(/^make\s+(?:the\s+)?(heading|headline|title|paragraph|text|button|cta|quote|list[\s-]?item)\s+(\S+)\.?$/i)
  if (m) {
    const blockType = typeMapStyles(m[1])
    const hex = asHex(m[2])
    if (hex) {
      // For buttons, "make red" implies background; for text-like blocks, text color
      const styleName = blockType === 'core/button' ? 'background' : 'text'
      return {
        source: 'regex',
        action: {
          capability: 'blocks.patch',
          pageRef: 'home',
          target: { kind: 'first', blockType },
          op: { type: 'set_style', category: 'color', name: styleName, value: hex },
          label: `${m[1]} ${styleName} → ${hex}`,
        },
      }
    }
  }

  // "set the heading padding to 32px"  /  "change the heading margin to 1rem"
  m = t.match(new RegExp(`^(?:change|set|make)\\s+(?:the\\s+)?(?:(${ord})\\s+)?(heading|headline|title|paragraph|text|button|cta|quote|list[\\s-]?item|group)\\s+(padding|margin)\\s+(?:to\\s+)(\\S+)\\.?$`, 'i'))
  if (m) {
    const blockType = typeMapStyles(m[2])
    const styleName = m[3].toLowerCase()  // padding | margin
    const value = m[4]
    if (!/^-?\d+(\.\d+)?(px|em|rem|%|vh|vw)?$/i.test(value)) {
      return { source: 'none', hint: `Could not parse spacing value "${value}". Try "24px" or "1.5rem".` }
    }
    return {
      source: 'regex',
      action: {
        capability: 'blocks.patch',
        pageRef: 'home',
        target: m[1] ? { kind: 'nth', blockType, index: ordToNum(m[1]) } : { kind: 'first', blockType },
        op: { type: 'set_style', category: 'spacing', name: styleName, value },
        label: `${m[1] ? m[1] + ' ' : ''}${m[2]} ${styleName} → ${value}`,
      },
    }
  }

  // "set the heading font size to 24px"
  m = t.match(new RegExp(`^(?:change|set|make)\\s+(?:the\\s+)?(?:(${ord})\\s+)?(heading|headline|title|paragraph|text|button|cta|quote|list[\\s-]?item)\\s+font[\\s-]?size\\s+(?:to\\s+)(\\S+)\\.?$`, 'i'))
  if (m) {
    const blockType = typeMapStyles(m[2])
    const value = m[3]
    if (!/^-?\d+(\.\d+)?(px|em|rem|%|vh|vw)?$/i.test(value)) {
      return { source: 'none', hint: `Could not parse font size "${value}". Try "18px" or "1.25rem".` }
    }
    return {
      source: 'regex',
      action: {
        capability: 'blocks.patch',
        pageRef: 'home',
        target: m[1] ? { kind: 'nth', blockType, index: ordToNum(m[1]) } : { kind: 'first', blockType },
        op: { type: 'set_style', category: 'typography', name: 'fontSize', value },
        label: `${m[1] ? m[1] + ' ' : ''}${m[2]} font size → ${value}`,
      },
    }
  }

  // ─── Block edits (Phase 2) ──
  // "change the heading to X" / "set the first heading to X"
  // "make the second paragraph say X" / "change the third paragraph to X"
  // "change the button text to X" / "set the button to X"
  // "change the heading that says Welcome to Hello"

  // "the heading that says X" → set to Y :  catches  "change the heading that says 'Welcome' to 'Hello'"
  m = t.match(/^(?:change|set|update|make)\s+(?:the\s+)?(heading|headline|title|paragraph|text|button|cta|quote)\s+(?:that\s+says|containing|with(?:\s+text)?|matching)\s+["']?(.+?)["']?\s+to\s+(.+?)\.?$/i)
  if (m) {
    const blockType = TYPE_MAP[m[1].toLowerCase()]
    return {
      source: 'regex',
      action: {
        capability: 'blocks.patch',
        pageRef: 'home',
        target: { kind: 'contains', blockType, text: stripQuotes(m[2]) },
        op: { type: 'set_text', value: stripQuotes(m[3]) },
        label: `${m[1]} containing "${stripQuotes(m[2])}" → "${stripQuotes(m[3])}"`,
      },
    }
  }

  // "change the second paragraph to X"  /  "make the third heading say X"
  m = t.match(new RegExp(`^(?:change|set|update|make)\\s+(?:the\\s+)?(${ord})\\s+(heading|headline|title|paragraph|text|button|cta|quote)\\s+(?:to\\s+(?:say\\s+)?|say\\s+)(.+?)\\.?$`, 'i'))
  if (m) {
    const blockType = TYPE_MAP[m[2].toLowerCase()]
    return {
      source: 'regex',
      action: {
        capability: 'blocks.patch',
        pageRef: 'home',
        target: { kind: 'nth', blockType, index: ordToNum(m[1]) },
        op: { type: 'set_text', value: stripQuotes(m[3]) },
        label: `${m[1]} ${m[2]} → "${stripQuotes(m[3])}"`,
      },
    }
  }

  // "change the heading to X"  /  "set the button text to X"
  m = t.match(/^(?:change|set|update|make)\s+(?:the\s+)?(heading|headline|title|paragraph|text|button|cta|quote)(?:\s+text)?\s+(?:to\s+(?:say\s+)?|say\s+)(.+?)\.?$/i)
  if (m) {
    const blockType = TYPE_MAP[m[1].toLowerCase()]
    return {
      source: 'regex',
      action: {
        capability: 'blocks.patch',
        pageRef: 'home',
        target: { kind: 'first', blockType },
        op: { type: 'set_text', value: stripQuotes(m[2]) },
        label: `${m[1]} → "${stripQuotes(m[2])}"`,
      },
    }
  }

  return { source: 'none', hint: 'Did not match any patterns. Try: "set site title to X", "change primary color to blue", "change the heading to Welcome", "change the second paragraph to ...", "set featured image on home", "undo".' }
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^['"](.*)['"]$/, '$1').trim()
}
