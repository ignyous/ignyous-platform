// ── WPBakery (Visual Composer) shortcode generator ────────────────

type Attrs = Record<string, string | number | boolean>

function attrs(obj: Attrs): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== '' && v !== undefined)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
}

const row = (content: string, a: Attrs = {}) =>
  `[vc_row ${attrs(a)}]\n${content}\n[/vc_row]`

const col = (width: string, content: string, a: Attrs = {}) =>
  `[vc_column width="${width}" ${attrs(a)}]\n${content}\n[/vc_column]`

export const W = {
  text: (html: string, a: Attrs = {}) =>
    `[vc_column_text ${attrs(a)}]\n${html}\n[/vc_column_text]`,

  heading: (text: string, tag = 'h2', align = 'center', color = '', a: Attrs = {}) =>
    `[vc_custom_heading text="${text}" font_container="tag:${tag}|text_align:${align}${color ? '|color:' + color : ''}" ${attrs(a)}]`,

  image: (imageId: string | number, size = 'large', align = 'center', link = '') =>
    `[vc_single_image image="${imageId}" img_size="${size}" alignment="${align}" ${link ? `onclick="custom_link" link="${link}"` : ''}]`,

  button: (title: string, link = '#', color = 'orange', align = 'center', size = 'md') =>
    `[vc_btn title="${title}" color="${color}" size="${size}" align="${align}" link="url:${link}"]`,

  separator: (border_width = '1', el_width = '100', color = '#e0e0e0') =>
    `[vc_separator border_width="${border_width}" el_width="${el_width}" accent_color="${color}"]`,

  empty_space: (height = '40px') =>
    `[vc_empty_space height="${height}"]`,

  cta: (title: string, btnTitle: string, btnLink = '#', btnColor = 'orange', txtAlign = 'left') =>
    `[vc_cta h2="${title}" txt_align="${txtAlign}" style="3d" color="white" add_button="right" btn_title="${btnTitle}" btn_color="${btnColor}" btn_link="url:${btnLink}"]`,

  icon: (type: string, icon: string, color = 'custom', customColor = '#1a1a4e', size = 'md', align = 'center') =>
    `[vc_icon type="${type}" icon_fontawesome="${icon}" color="${color}" custom_color="${customColor}" size="${size}" align="${align}"]`,

  progressBar: (bars: Array<{ value: number; title: string; color?: string }>) =>
    `[vc_progress_bar ${bars.map((b, i) => `values="${b.value}|${b.title}|${b.color || '#1a1a4e'}"`).join(' ')} bgcolor="custom"]`,

  accordion: (items: Array<{ title: string; content: string }>) =>
    `[vc_accordion]\n${items.map(i => `[vc_accordion_tab title="${i.title}"]\n[vc_column_text]${i.content}[/vc_column_text]\n[/vc_accordion_tab]`).join('\n')}\n[/vc_accordion]`,

  tabs: (items: Array<{ title: string; content: string }>) =>
    `[vc_tabs]\n${items.map(i => `[vc_tab title="${i.title}" tab_id="${i.title.toLowerCase().replace(/\s+/g, '-')}"]\n[vc_column_text]${i.content}[/vc_column_text]\n[/vc_tab]`).join('\n')}\n[/vc_tabs]`,

  testimonialGrid: (items: Array<{ quote: string; name: string; role?: string; image?: string }>) =>
    // WPBakery doesn't have a built-in testimonial block — uses HTML or Testimonials plugin
    `[vc_column_text]\n${items.map(t =>
      `<blockquote><p>${t.quote}</p><cite>${t.name}${t.role ? ', ' + t.role : ''}</cite></blockquote>`
    ).join('\n')}\n[/vc_column_text]`,

  pricingTable: (tiers: Array<{ title: string; price: string; per: string; features: string[]; cta: string; highlighted?: boolean }>) =>
    // WPBakery pricing via shortcode — typical Ultimate Addons format, fallback to column layout
    row(
      tiers.map(t => col(`1/${tiers.length}`,
        `[vc_column_text el_class="${t.highlighted ? 'pricing-highlighted' : ''}"]\n` +
        `<div class="pricing-box"><h3>${t.title}</h3><div class="price">${t.price}<span>/${t.per}</span></div>` +
        `<ul>${t.features.map(f => `<li>${f}</li>`).join('')}</ul></div>\n[/vc_column_text]\n` +
        W.button(t.cta, '#', t.highlighted ? 'orange' : 'white', 'center')
      )).join('\n')
    ),

  html: (html: string) =>
    `[vc_raw_html]${Buffer.from(html).toString('base64')}[/vc_raw_html]`,

  video: (url: string) =>
    `[vc_video link="${url}" align="center"]`,

  gallery: (imageIds: string, style = 'responsive-images') =>
    `[vc_gallery type="${style}" images="${imageIds}"]`,
}

// ── Section templates ─────────────────────────────────────────────
export const templates = {
  hero: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    row(col('1/1',
      W.heading(heading, 'h1', 'center', '#ffffff') + '\n' +
      W.text(`<p style="text-align:center;color:rgba(255,255,255,0.8)">${subtext}</p>`) + '\n' +
      W.button(btnLabel, btnUrl, 'orange', 'center', 'lg')
    ), { el_class: 'hero-section', full_width: 'stretch_row', css: '.vc_custom_hero{background-color:#1a1a4e;padding:100px 0}' }),

  testimonials: (heading: string, items: Array<{ quote: string; name: string; role?: string }>) =>
    row(col('1/1', W.heading(heading, 'h2', 'center') + '\n' + W.separator())) + '\n' +
    row(items.map(t => col(`1/${items.length}`,
      W.text(`<blockquote style="text-align:center"><p>"${t.quote}"</p><cite><strong>${t.name}</strong>${t.role ? ', ' + t.role : ''}</cite></blockquote>`)
    )).join('\n')),

  pricing: (heading: string, tiers: Array<{ title: string; price: string; per: string; features: string[]; cta: string; highlighted?: boolean }>) =>
    row(col('1/1', W.heading(heading, 'h2', 'center') + '\n' + W.separator())) + '\n' +
    W.pricingTable(tiers),

  features: (heading: string, items: Array<{ icon: string; title: string; desc: string }>) =>
    row(col('1/1', W.heading(heading, 'h2', 'center') + '\n' + W.separator())) + '\n' +
    row(items.slice(0, 3).map(i => col(`1/${Math.min(items.length, 3)}`,
      W.icon('fontawesome', `fa fa-${i.icon}`) + '\n' +
      W.heading(i.title, 'h4', 'center') + '\n' +
      W.text(`<p style="text-align:center">${i.desc}</p>`)
    )).join('\n')),

  faq: (heading: string, items: Array<{ q: string; a: string }>) =>
    row(col('1/1',
      W.heading(heading, 'h2', 'center') + '\n' + W.separator() + '\n' +
      W.accordion(items.map(i => ({ title: i.q, content: i.a })))
    )),

  cta: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    row(col('1/1', W.cta(heading, btnLabel, btnUrl, 'orange', 'center') +
      (subtext ? '\n' + W.text(`<p style="text-align:center">${subtext}</p>`) : '')
    ), { el_class: 'cta-section', css: '.vc_custom_cta{background-color:#1a1a4e;padding:80px 0}' }),

  team: (heading: string, members: Array<{ name: string; role: string; bio?: string; image?: string }>) =>
    row(col('1/1', W.heading(heading, 'h2', 'center') + '\n' + W.separator())) + '\n' +
    row(members.map(m => col(`1/${Math.min(members.length, 4)}`,
      (m.image ? W.text(`<img src="${m.image}" alt="${m.name}" style="border-radius:50%;max-width:120px;display:block;margin:0 auto">`) : '') + '\n' +
      W.heading(m.name, 'h4', 'center') + '\n' +
      W.text(`<p style="text-align:center;color:#666">${m.role}</p>`) +
      (m.bio ? '\n' + W.text(`<p style="text-align:center">${m.bio}</p>`) : '')
    )).join('\n')),
}
