// ── Beaver Builder JSON generator ────────────────────────────────
// Beaver stores _fl_builder_data as PHP-serialized objects.
// We generate JSON here; the bridge PHP converts it to serialize()

const id = () => Math.random().toString(36).slice(2, 10)

function row(cols: any[], settings: any = {}) {
  const rowId = id()
  const colsObj: any = {}
  cols.forEach(c => { colsObj[c.id] = c })
  return {
    [rowId]: {
      id: rowId, type: 'row', position: 0,
      settings: { full_width: '', max_content_width: '', content_width: 'fixed', ...settings },
      cols: colsObj,
    },
  }
}

function col(modules: any[], size = 1): any {
  const colId = id()
  const nodesObj: any = {}
  modules.forEach((m, i) => {
    const mod = { ...m, position: i }
    nodesObj[mod.id] = mod
  })
  return { id: colId, type: 'column', position: 0, settings: { size }, nodes: nodesObj }
}

function mod(slug: string, settings: any): any {
  return { id: id(), type: 'module', alias: false, slug, position: 0, settings }
}

// ── Modules ───────────────────────────────────────────────────────
export const B = {
  heading: (text: string, tag = 'h2', align = 'center', color = '') =>
    mod('heading', { tag, text, font_size: '', text_align: align, ...(color ? { color } : {}) }),

  richText: (html: string) =>
    mod('rich-text', { text: html }),

  photo: (url: string, alt = '', link = '') =>
    mod('photo', { photo_src: url, photo_alt: alt, ...(link ? { link_type: 'url', link_url: link } : { link_type: '' }) }),

  button: (label: string, link = '#', align = 'center', style = 'default', bgColor = '#f3af00', textColor = '#1a1a4e') =>
    mod('button', { text: label, link, node_label: label, style, align, background_color: bgColor, text_color: textColor }),

  icon: (icon: string, size = '40', color = '#1a1a4e', text = '', link = '') =>
    mod('icon', { icon: `fa fa-${icon}`, icon_size: size, color, text, ...(link ? { link } : {}) }),

  cta: (heading: string, text: string, btnText: string, btnLink = '#') =>
    mod('cta', { heading, text, node_label: heading, btn_text: btnText, btn_link: btnLink, btn_style: 'default', btn_background_color: '#f3af00', btn_text_color: '#1a1a4e' }),

  testimonial: (quote: string, name: string, position = '', imageUrl = '') =>
    mod('testimonials', {
      testimonials: [{ quote, author: name, author_position: position, ...(imageUrl ? { photo_src: imageUrl } : {}) }],
      layout: 'simple',
    }),

  accordion: (items: Array<{ label: string; content: string }>) =>
    mod('accordion', { items: items.map(i => ({ label: i.label, content: i.content })) }),

  tabs: (items: Array<{ label: string; content: string }>) =>
    mod('tabs', { items: items.map(i => ({ label: i.label, content: i.content })) }),

  pricingTable: (tiers: Array<{ title: string; price: string; duration: string; features: string[]; cta: string; featured?: boolean }>) =>
    mod('pricing-table', {
      columns: tiers.map(t => ({
        title: t.title, price: t.price, duration: t.duration,
        features: t.features.map(f => ({ feature: f })),
        cta_text: t.cta, cta_link: '#',
        featured: t.featured ? '1' : '',
      })),
    }),

  html: (html: string) =>
    mod('html', { html }),

  separator: (color = '#e0e0e0', height = '1') =>
    mod('separator', { color, height }),

  spacer: (height = '40') =>
    mod('spacer', { height }),

  video: (url: string) =>
    mod('video', { node_label: 'Video', video_type: 'url', video_url: url }),
}

// ── Section templates ─────────────────────────────────────────────
export const templates = {
  hero: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    row([col([
      B.heading(heading, 'h1', 'center', '#ffffff'),
      B.richText(`<p style="text-align:center;color:rgba(255,255,255,0.8);font-size:18px">${subtext}</p>`),
      B.button(btnLabel, btnUrl),
    ])], { bg_color: '#1a1a4e', padding_top: '100', padding_bottom: '100' }),

  testimonials: (heading: string, items: Array<{ quote: string; name: string; role?: string; image?: string }>) => ({
    ...row([col([B.heading(heading, 'h2', 'center'), B.separator()])]),
    ...row(items.map(t => col([B.testimonial(t.quote, t.name, t.role, t.image)], 1 / items.length))),
  }),

  pricing: (heading: string, tiers: Array<{ title: string; price: string; duration: string; features: string[]; cta: string; featured?: boolean }>) => ({
    ...row([col([B.heading(heading, 'h2', 'center'), B.separator()])]),
    ...row([col([B.pricingTable(tiers)])]),
  }),

  features: (heading: string, items: Array<{ icon: string; title: string; desc: string }>) => ({
    ...row([col([B.heading(heading, 'h2', 'center'), B.separator()])]),
    ...row(items.slice(0, 3).map(i => col([
      B.icon(i.icon, '40', '#1a1a4e'),
      B.heading(i.title, 'h4', 'center'),
      B.richText(`<p style="text-align:center">${i.desc}</p>`),
    ], 1 / Math.min(items.length, 3)))),
  }),

  faq: (heading: string, items: Array<{ q: string; a: string }>) =>
    row([col([
      B.heading(heading, 'h2', 'center'),
      B.separator(),
      B.accordion(items.map(i => ({ label: i.q, content: i.a }))),
    ])]),

  cta: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    row([col([B.cta(heading, subtext, btnLabel, btnUrl)])],
      { bg_color: '#1a1a4e', padding_top: '80', padding_bottom: '80' }),

  team: (heading: string, members: Array<{ name: string; role: string; bio?: string; image?: string }>) => ({
    ...row([col([B.heading(heading, 'h2', 'center'), B.separator()])]),
    ...row(members.map(m => col([
      ...(m.image ? [B.photo(m.image, m.name)] : []),
      B.heading(m.name, 'h4', 'center'),
      B.richText(`<p style="text-align:center;color:#666">${m.role}</p>`),
      ...(m.bio ? [B.richText(`<p style="text-align:center">${m.bio}</p>`)] : []),
    ], 1 / Math.min(members.length, 4)))),
  }),
}

/** Convert JS object tree to JSON for the bridge to PHP-serialize */
export function toBeaverJson(rows: any): string {
  const merged = Array.isArray(rows) ? Object.assign({}, ...rows) : rows
  return JSON.stringify(merged)
}
