// ── Avada Fusion Builder shortcode generator ─────────────────────

type Attrs = Record<string, string | number | boolean>

function attrs(obj: Attrs): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== '' && v !== undefined)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
}

const container = (content: string, a: Attrs = {}) =>
  `[fusion_builder_container ${attrs({ hundred_percent: 'no', equal_height_columns: 'no', ...a })}]\n${content}\n[/fusion_builder_container]`

const row = (content: string, a: Attrs = {}) =>
  `[fusion_builder_row]\n${content}\n[/fusion_builder_row]`

const col = (type: string, content: string, a: Attrs = {}) =>
  `[fusion_builder_column type="${type}" ${attrs(a)}]\n${content}\n[/fusion_builder_column]`

export const F = {
  text: (html: string, a: Attrs = {}) =>
    `[fusion_text ${attrs(a)}]\n${html}\n[/fusion_text]`,

  title: (text: string, size = '2', align = 'center', color = '', a: Attrs = {}) =>
    `[fusion_title size="${size}" content_align="${align}" ${color ? `title_color="${color}"` : ''} ${attrs(a)}]${text}[/fusion_title]`,

  image: (src: string, id = '', alt = '', link = '', a: Attrs = {}) =>
    `[fusion_imageframe image_id="${id}" src="${src}" alt="${alt}" ${link ? `link="${link}"` : ''} ${attrs(a)} /]`,

  button: (label: string, link = '#', color = 'custom', accent = '#f3af00', textColor = '#1a1a4e', align = 'center', size = 'medium') =>
    `[fusion_button link="${link}" color="${color}" accent_color="${accent}" bkg_color="${accent}" border_color="${accent}" size="${size}" alignment="${align}" text_color="${textColor}"]${label}[/fusion_button]`,

  separator: (style = 'single', borderSize = '1', borderColor = '#e0e0e0', topMargin = '20', bottomMargin = '20') =>
    `[fusion_separator style_type="${style}" border_size="${borderSize}" border_color="${borderColor}" top_margin="${topMargin}" bottom_margin="${bottomMargin}" /]`,

  testimonials: (items: Array<{ quote: string; name: string; role?: string; image?: string }>) =>
    `[fusion_testimonials ${items.map(t =>
      `[fusion_testimonial name="${t.name}" avatar="${t.image || 'none'}" company="${t.role || ''}" title=""]${t.quote}[/fusion_testimonial]`
    ).join('\n')}][/fusion_testimonials]`,

  person: (name: string, title: string, picture = '', pictureId = '', content = '') =>
    `[fusion_person name="${name}" title="${title}" picture="${picture}" picture_id="${pictureId}" content_alignment="center"]${content}[/fusion_person]`,

  iconBox: (icon: string, title: string, content: string, iconColor = '#1a1a4e') =>
    `[fusion_fontawesome icon="fa-solid fa-${icon}" size="40px" icon_color="${iconColor}"][/fusion_fontawesome]\n` +
    `[fusion_title size="4" content_align="center"]${title}[/fusion_title]\n` +
    `[fusion_text content_alignment="center"]<p>${content}</p>[/fusion_text]`,

  pricingTable: (tiers: Array<{ title: string; price: string; per: string; features: string[]; cta: string; highlighted?: boolean }>, currency = '$') =>
    `[fusion_pricing_table type="1" backgroundcolor="" background_color_hover="" bordercolor="" dividercolor="" currency="${currency}" column_spacing="" ]\n` +
    tiers.map(t =>
      `[fusion_pricing_column title="${t.title}" standout="${t.highlighted ? 'yes' : 'no'}"]\n` +
      `[fusion_pricing_price currency="${currency}" price="${t.price}" time="${t.per}" /]\n` +
      t.features.map(f => `[fusion_pricing_row]${f}[/fusion_pricing_row]`).join('\n') + '\n' +
      `[fusion_pricing_footer][fusion_button link="#" size="small"]${t.cta}[/fusion_button][/fusion_pricing_footer]\n` +
      `[/fusion_pricing_column]`
    ).join('\n') +
    `\n[/fusion_pricing_table]`,

  toggle: (items: Array<{ title: string; content: string }>) =>
    `[fusion_accordion type="accordion"]\n` +
    items.map(i => `[fusion_toggle title="${i.title}" open="no"]${i.content}[/fusion_toggle]`).join('\n') +
    `\n[/fusion_accordion]`,

  tabs: (items: Array<{ title: string; content: string }>) =>
    `[fusion_tabs design="classic" layout="horizontal"]\n` +
    items.map(i => `[fusion_tab title="${i.title}" icon=""]${i.content}[/fusion_tab]`).join('\n') +
    `\n[/fusion_tabs]`,

  counter: (value: number, label: string, prefix = '', suffix = '') =>
    `[fusion_counter_box columns="1"][fusion_counter_box_item value="${value}" delimiter="," label="${label}" prefix="${prefix}" suffix="${suffix}" direction="up" /][/fusion_counter_box]`,

  separator_space: (height = '40px') =>
    `[fusion_separator top_margin="${height}" bottom_margin="0px" /]`,

  cta: (title: string, desc: string, btnLabel: string, btnLink = '#') =>
    `[fusion_call_to_action title="${title}" description="${desc}" button_text="${btnLabel}" link="${btnLink}" button_color="custom" accent_color="#f3af00" bkg_color="#f3af00" text_color="#1a1a4e"][/fusion_call_to_action]`,

  video: (src: string, a: Attrs = {}) =>
    `[fusion_youtube id="${src}" alignment="center" ${attrs(a)} /]`,

  checklist: (items: string[], iconColor = '#1a1a4e') =>
    `[fusion_checklist icon="fa-solid fa-check" iconcolor="${iconColor}" circle="no"]\n` +
    items.map(i => `[fusion_li_item]${i}[/fusion_li_item]`).join('\n') +
    `\n[/fusion_checklist]`,
}

// ── Section templates ─────────────────────────────────────────────
export const templates = {
  hero: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    container(row(col('1_1',
      F.title(heading, '1', 'center', '#ffffff') + '\n' +
      F.text(`<p style="text-align:center;color:rgba(255,255,255,0.8);font-size:18px">${subtext}</p>`) + '\n' +
      F.button(btnLabel, btnUrl)
    )), { background_color: '#1a1a4e', padding_top: '100px', padding_bottom: '100px' }),

  testimonials: (heading: string, items: Array<{ quote: string; name: string; role?: string; image?: string }>) =>
    container(row(col('1_1',
      F.title(heading, '2', 'center') + '\n' +
      F.separator() + '\n' +
      F.testimonials(items)
    ))),

  pricing: (heading: string, tiers: Array<{ title: string; price: string; per: string; features: string[]; cta: string; highlighted?: boolean }>) =>
    container(row(col('1_1',
      F.title(heading, '2', 'center') + '\n' +
      F.separator() + '\n' +
      F.pricingTable(tiers)
    ))),

  features: (heading: string, items: Array<{ icon: string; title: string; desc: string }>) =>
    container(
      row(col('1_1', F.title(heading, '2', 'center') + '\n' + F.separator())) + '\n' +
      row(items.map(i =>
        col(`1_${Math.min(items.length, 3)}`, F.iconBox(i.icon, i.title, i.desc))
      ).join('\n'))
    ),

  faq: (heading: string, items: Array<{ q: string; a: string }>) =>
    container(row(col('1_1',
      F.title(heading, '2', 'center') + '\n' +
      F.separator() + '\n' +
      F.toggle(items.map(i => ({ title: i.q, content: i.a })))
    ))),

  cta: (heading: string, subtext: string, btnLabel: string, btnUrl = '#') =>
    container(row(col('1_1', F.cta(heading, subtext, btnLabel, btnUrl))),
      { background_color: '#1a1a4e', padding_top: '80px', padding_bottom: '80px' }),

  team: (heading: string, members: Array<{ name: string; role: string; bio?: string; image?: string }>) =>
    container(
      row(col('1_1', F.title(heading, '2', 'center') + '\n' + F.separator())) + '\n' +
      row(members.map(m =>
        col(`1_${Math.min(members.length, 4)}`, F.person(m.name, m.role, m.image, '', m.bio))
      ).join('\n'))
    ),

  stats: (items: Array<{ value: number; label: string; prefix?: string; suffix?: string }>) =>
    container(row(
      items.map(i => col(`1_${items.length}`,
        F.counter(i.value, i.label, i.prefix, i.suffix)
      )).join('\n')
    ), { background_color: '#f8f9fc', padding_top: '60px', padding_bottom: '60px' }),
}
