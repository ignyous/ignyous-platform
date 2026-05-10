// ── Divi (Elegant Themes) shortcode generator ─────────────────────
// Generates et_pb_* shortcodes that Divi renders natively

type Attrs = Record<string, string | number | boolean>

function attrs(obj: Attrs): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
}

const section = (content: string, a: Attrs = {}) =>
  `\n[et_pb_section fb_built="1" ${attrs({ admin_label: 'Section', ...a })}]\n${content}\n[/et_pb_section]\n`

const row = (content: string, a: Attrs = {}) =>
  `\n[et_pb_row ${attrs(a)}]\n${content}\n[/et_pb_row]\n`

const col = (type: string, content: string) =>
  `\n[et_pb_column type="${type}"]\n${content}\n[/et_pb_column]\n`

// ── Modules ───────────────────────────────────────────────────────
export const D = {
  text: (html: string, a: Attrs = {}) =>
    `[et_pb_text ${attrs(a)}]\n${html}\n[/et_pb_text]`,

  title: (text: string, level = 'h2', align = 'center', a: Attrs = {}) =>
    `[et_pb_text ${attrs({ text_orientation: align, ...a })}]<${level}>${text}</${level}>[/et_pb_text]`,

  image: (src: string, alt = '', url = '', a: Attrs = {}) =>
    `[et_pb_image src="${src}" alt="${alt}" ${url ? `url="${url}"` : ''} ${attrs(a)} /]`,

  button: (label: string, url = '#', align = 'center', a: Attrs = {}) =>
    `[et_pb_button button_text="${label}" button_url="${url}" button_alignment="${align}" ${attrs(a)} /]`,

  divider: (color = '#e0e0e0', height = '1px') =>
    `[et_pb_divider color="${color}" divider_weight="${height}" /]`,

  spacer: (height = '40px') =>
    `[et_pb_spacer height="${height}" /]`,

  testimonial: (content: string, author: string, jobTitle = '', company = '', portraitUrl = '') =>
    `[et_pb_testimonial author="${author}" job_title="${jobTitle}" company="${company}" ${portraitUrl ? `portrait_url="${portraitUrl}"` : ''} ]${content}[/et_pb_testimonial]`,

  blurb: (title: string, content: string, icon = 'misc-flag', iconColor = '#1a1a4e') =>
    `[et_pb_blurb title="${title}" use_icon="on" font_icon="%%${icon}%%" icon_color="${iconColor}" ]${content}[/et_pb_blurb]`,

  cta: (title: string, btnText: string, btnUrl = '#', content = '') =>
    `[et_pb_cta title="${title}" button_text="${btnText}" button_url="${btnUrl}" ]${content}[/et_pb_cta]`,

  accordion: (items: Array<{ title: string; content: string }>) =>
    `[et_pb_accordion]\n${items.map(i => `[et_pb_accordion_item title="${i.title}" open="off"]${i.content}[/et_pb_accordion_item]`).join('\n')}\n[/et_pb_accordion]`,

  tabs: (items: Array<{ title: string; content: string }>) =>
    `[et_pb_tabs]\n${items.map(i => `[et_pb_tab title="${i.title}"]${i.content}[/et_pb_tab]`).join('\n')}\n[/et_pb_tabs]`,

  person: (name: string, position: string, bio: string, imageUrl = '') =>
    `[et_pb_team_member name="${name}" position="${position}" ${imageUrl ? `image_url="${imageUrl}"` : ''}]\n<p>${bio}</p>\n[/et_pb_team_member]`,

  pricingTable: (tiers: Array<{ title: string; price: string; per: string; features: string[]; cta: string; featured?: boolean }>) =>
    `[et_pb_pricing_tables]\n${tiers.map(t => `[et_pb_pricing_table title="${t.title}" price="${t.price}" per="${t.per}" button_text="${t.cta}" featured="${t.featured ? 'on' : 'off'}"]\n${t.features.map(f => `[et_pb_pricing_item]${f}[/et_pb_pricing_item]`).join('\n')}\n[/et_pb_pricing_table]`).join('\n')}\n[/et_pb_pricing_tables]`,

  video: (src: string, a: Attrs = {}) =>
    `[et_pb_video src="${src}" ${attrs(a)} /]`,

  counter: (end: number, title: string, prefix = '', suffix = '') =>
    `[et_pb_number_counter title="${title}" number="${end}" percent_sign="off" counter_color="#1a1a4e" /]`,
}

// ── Section templates ─────────────────────────────────────────────
export const templates = {
  hero: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    section(row(col('4_4',
      D.title(heading, 'h1', 'center') + '\n' +
      D.text(`<p style="text-align:center">${subtext}</p>`) + '\n' +
      D.button(btnLabel, btnUrl, 'center')
    )), { background_color: '#1a1a4e', custom_padding: '100px|0px|100px|0px' }),

  testimonials: (heading: string, items: Array<{ quote: string; name: string; role?: string }>) =>
    section(
      row(col('4_4', D.title(heading, 'h2', 'center') + '\n' + D.divider())) +
      row(
        items.map(t => col(`1_${items.length}` as string, D.testimonial(t.quote, t.name, t.role))).join('\n'),
        { make_equal: 'on' }
      )
    ),

  pricing: (heading: string, tiers: Array<{ title: string; price: string; per: string; features: string[]; cta: string; featured?: boolean }>) =>
    section(
      row(col('4_4', D.title(heading, 'h2', 'center') + '\n' + D.divider())) +
      row(col('4_4', D.pricingTable(tiers)))
    ),

  features: (heading: string, items: Array<{ icon: string; title: string; desc: string }>) =>
    section(
      row(col('4_4', D.title(heading, 'h2', 'center') + '\n' + D.divider())) +
      row(items.map(i => col(`1_${Math.min(items.length, 3)}` as string, D.blurb(i.title, i.desc, i.icon))).join('\n'))
    ),

  faq: (heading: string, items: Array<{ q: string; a: string }>) =>
    section(row(col('4_4',
      D.title(heading, 'h2', 'center') + '\n' +
      D.divider() + '\n' +
      D.accordion(items.map(i => ({ title: i.q, content: i.a })))
    ))),

  cta: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    section(row(col('4_4', D.cta(heading, btnLabel, btnUrl, subtext))),
      { background_color: '#1a1a4e', custom_padding: '80px|0px|80px|0px' }),

  team: (heading: string, members: Array<{ name: string; role: string; bio?: string; image?: string }>) =>
    section(
      row(col('4_4', D.title(heading, 'h2', 'center') + '\n' + D.divider())) +
      row(members.map(m => col(`1_${Math.min(members.length, 4)}` as string,
        D.person(m.name, m.role, m.bio || '', m.image)
      )).join('\n'))
    ),
}
