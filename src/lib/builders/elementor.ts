import { v4 as uuid } from 'uuid'

// ── ID generator ──────────────────────────────────────────────────
const id = () => Math.random().toString(36).slice(2, 10)

// ── Base structures ───────────────────────────────────────────────
const section = (elements: any[], settings: any = {}) => ({
  id: id(), elType: 'section', isInner: false,
  settings: { layout: 'full_width', ...settings },
  elements,
})

const column = (elements: any[], width = 100, settings: any = {}) => ({
  id: id(), elType: 'column', isInner: false,
  settings: { _column_size: width, ...settings },
  elements,
})

const widget = (widgetType: string, settings: any) => ({
  id: id(), elType: 'widget', widgetType, isInner: false,
  settings, elements: [],
})

// ── Individual widgets ────────────────────────────────────────────
export const E = {
  heading: (text: string, tag = 'h2', align = 'center', color?: string) =>
    widget('heading', { title: text, header_size: tag, align, ...(color ? { title_color: color } : {}) }),

  text: (html: string) =>
    widget('text-editor', { editor: html }),

  image: (url: string, alt = '', link = '') =>
    widget('image', { image: { url, alt }, link: { url: link }, image_size: 'large', align: 'center' }),

  button: (label: string, url = '#', align = 'center', style = 'default', bgColor?: string, textColor?: string) =>
    widget('button', {
      text: label, link: { url, is_external: false },
      align, button_type: style,
      ...(bgColor ? { background_color: bgColor } : {}),
      ...(textColor ? { button_text_color: textColor } : {}),
    }),

  divider: (style = 'solid', weight = '1px', color = '#e0e0e0') =>
    widget('divider', { style, weight, color, gap: { top: '20px', bottom: '20px' } }),

  spacer: (heightPx = 40) =>
    widget('spacer', { space: { size: heightPx, unit: 'px' } }),

  testimonial: (quote: string, name: string, role = '', imageUrl = '') =>
    widget('testimonial', {
      testimonial_content: quote, testimonial_name: name, testimonial_job: role,
      ...(imageUrl ? { testimonial_image: { url: imageUrl } } : {}),
      alignment: 'center',
    }),

  iconBox: (icon: string, title: string, desc: string) =>
    widget('icon-box', {
      selected_icon: { library: 'fa-solid', value: `fa fa-${icon}` },
      title_text: title, description_text: desc, position: 'top',
    }),

  counter: (end: number, title: string, prefix = '', suffix = '') =>
    widget('counter', { starting_number: 0, ending_number: end, title, prefix, suffix }),

  accordion: (items: Array<{ title: string; content: string }>) =>
    widget('accordion', {
      tabs: items.map(item => ({ tab_title: item.title, tab_content: item.content })),
    }),

  tabs: (items: Array<{ title: string; content: string }>) =>
    widget('tabs', {
      tabs: items.map(item => ({ tab_title: item.title, tab_content: item.content })),
    }),

  imageBox: (imageUrl: string, title: string, desc: string, linkUrl = '') =>
    widget('image-box', {
      image: { url: imageUrl }, title_text: title, description_text: desc,
      link: { url: linkUrl },
    }),

  html: (htmlContent: string) =>
    widget('html', { html: htmlContent }),

  video: (url: string) =>
    widget('video', { video_type: 'youtube', youtube_url: url }),

  socialIcons: (icons: Array<{ network: string; link: string }>) =>
    widget('social-icons', {
      social_icon_list: icons.map(i => ({ social_icon: { library: 'fa-brands', value: `fa fa-${i.network}` }, link: { url: i.link } })),
    }),

  pricingTable: (title: string, price: string, period: string, features: string[], cta: string, highlighted = false) =>
    widget('price-table', {
      heading: title, price, period: { price_period: period },
      features_list: features.map(f => ({ item_text: f })),
      button_text: cta,
      ...(highlighted ? { header_bgcolor: '#1a1a4e', header_text_color: 'white' } : {}),
    }),
}

// ── Section templates ─────────────────────────────────────────────
export const templates = {

  /** Hero with heading, subtext, button */
  hero: (heading: string, subtext: string, btnLabel: string, btnUrl = '#', bgColor = '#1a1a4e') =>
    section([column([
      E.heading(heading, 'h1', 'center', '#ffffff'),
      E.text(`<p style="text-align:center;color:rgba(255,255,255,0.8);font-size:18px">${subtext}</p>`),
      E.button(btnLabel, btnUrl, 'center', 'default', '#f3af00', '#1a1a4e'),
    ])], { background_background: 'classic', background_color: bgColor, padding: { top: '100px', bottom: '100px' } }),

  /** 3-column testimonials */
  testimonials: (heading: string, items: Array<{ quote: string; name: string; role?: string }>) =>
    [
      section([column([
        E.heading(heading, 'h2', 'center'),
        E.divider(),
      ])]),
      section(items.map(t =>
        column([E.testimonial(t.quote, t.name, t.role || '')], Math.floor(100 / items.length))
      )),
    ],

  /** 3-column pricing */
  pricing: (heading: string, tiers: Array<{ title: string; price: string; period: string; features: string[]; cta: string; highlight?: boolean }>) =>
    [
      section([column([E.heading(heading, 'h2', 'center'), E.divider()])]),
      section(tiers.map(t =>
        column([E.pricingTable(t.title, t.price, t.period, t.features, t.cta, t.highlight)], Math.floor(100 / tiers.length))
      )),
    ],

  /** Icon boxes / features grid */
  features: (heading: string, items: Array<{ icon: string; title: string; desc: string }>) =>
    [
      section([column([E.heading(heading, 'h2', 'center'), E.divider()])]),
      section(
        Array.from({ length: Math.ceil(items.length / 3) }, (_, row) =>
          items.slice(row * 3, row * 3 + 3).map(item =>
            column([E.iconBox(item.icon, item.title, item.desc)], 33)
          )
        ).flat()
      ),
    ],

  /** Stats / counters row */
  stats: (items: Array<{ value: number; label: string; prefix?: string; suffix?: string }>) =>
    section(items.map(s =>
      column([E.counter(s.value, s.label, s.prefix, s.suffix)], Math.floor(100 / items.length))
    ), { background_background: 'classic', background_color: '#f8f9fc' }),

  /** FAQ accordion */
  faq: (heading: string, items: Array<{ q: string; a: string }>) =>
    section([column([
      E.heading(heading, 'h2', 'center'),
      E.divider(),
      E.accordion(items.map(i => ({ title: i.q, content: i.a }))),
    ])]),

  /** CTA banner */
  cta: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    section([column([
      E.heading(heading, 'h2', 'center', '#ffffff'),
      E.text(`<p style="text-align:center;color:rgba(255,255,255,0.75)">${subtext}</p>`),
      E.button(btnLabel, btnUrl, 'center', 'default', '#f3af00', '#1a1a4e'),
    ])], { background_background: 'classic', background_color: '#1a1a4e', padding: { top: '80px', bottom: '80px' } }),

  /** Team grid */
  team: (heading: string, members: Array<{ name: string; role: string; bio?: string; image?: string }>) =>
    [
      section([column([E.heading(heading, 'h2', 'center'), E.divider()])]),
      section(members.map(m =>
        column([E.imageBox(m.image || '', m.name, `${m.role}${m.bio ? ' — ' + m.bio : ''}`)], Math.floor(100 / members.length))
      )),
    ],
}

/** Serialise an array of Elementor sections/columns/widgets to JSON string */
export function toElementorJson(elements: any[]): string {
  return JSON.stringify(elements.flat())
}
