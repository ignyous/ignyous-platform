/**
 * Builder Knowledge — Teaches the AI HOW to make changes for each builder.
 *
 * For each builder, defines:
 *   - How content is stored
 *   - How to change text (the right field names)
 *   - How to change colors (direct settings vs CSS)
 *   - How to change images
 *   - How to change fonts
 *   - How to add/remove/reorder elements
 *   - Limitations and gotchas
 *
 * Priority order for making changes:
 *   1. Builder direct settings (update_widget) — most reliable, preserves builder data
 *   2. Theme options (update_option/set_theme_mod) — for global theme settings
 *   3. CSS injection (inject_css/update_style) — universal fallback, works everywhere
 */

export function buildBuilderKnowledge(builder: string, themeFramework?: string): string {
  const sections: string[] = []

  sections.push(`== BUILDER KNOWLEDGE: ${builder.toUpperCase()} ==`)
  sections.push(`Priority for changes: 1) Builder settings directly, 2) Theme options, 3) CSS injection as fallback.`)

  // Builder-specific knowledge
  switch (builder) {
    case 'elementor':
      sections.push(getElementorKnowledge())
      break
    case 'gutenberg':
      sections.push(getGutenbergKnowledge())
      break
    case 'divi':
      sections.push(getDiviKnowledge())
      break
    case 'avada':
      sections.push(getAvadaKnowledge())
      break
    default:
      sections.push(getGenericKnowledge())
  }

  // Theme-specific knowledge
  if (themeFramework) {
    const themeKnowledge = getThemeKnowledge(themeFramework)
    if (themeKnowledge) sections.push(themeKnowledge)
  }

  sections.push(getDecisionTree())

  return sections.join('\n\n')
}

function getElementorKnowledge(): string {
  return `ELEMENTOR EDITING:

Storage: _elementor_data post meta (JSON array of sections/containers/widgets).
CSS selector pattern: .elementor-element-{element_id}

TEXT CHANGES:
• Use update_widget with the widget's element_id from the content graph.
• heading widget: settings.title
• text-editor widget: settings.editor (HTML content)
• image-box widget: settings.title_text, settings.description_text
• testimonial widget: settings.testimonial_name, settings.testimonial_content, settings.testimonial_job
• button widget: settings.text, settings.link.url
• counter widget: settings.ending_number, settings.title, settings.prefix, settings.suffix

COLOR CHANGES:
• PREFER update_widget (direct Elementor settings) over CSS injection.
• Section/container background: update_widget → settings.background_background="classic", settings.background_color="#hex"
• Widget text color: update_widget → settings.title_color, settings.text_color, settings.description_color
• Button: settings.button_background_color, settings.button_text_color
• CSS fallback: update_style with target or element_id → auto-generates .elementor-element-{id} selector.

FONT CHANGES:
• update_widget → settings.typography_font_family="Montserrat", settings.typography_font_size={size:18,unit:"px"}
• For headings: settings.title_typography_font_family, settings.title_typography_font_size
• Global fonts: modify Elementor Kit settings (elementor_active_kit post meta)

IMAGE CHANGES:
• update_widget → settings.image={url:"https://...",id:123}
• image-box: settings.image={url,id}
• testimonial: settings.testimonial_image={url,id}
• First upload the image via upload_media, get the attachment_id and URL, then update the widget.

STRUCTURAL CHANGES:
• Remove: remove_element with search_text (text inside the widget) or element_id
• Reorder: reorder_element with mode="swap" or mode="move"
• These modify the _elementor_data JSON structure directly.

GOTCHAS:
• Elementor caches CSS per-page. Always clear: delete_post_meta for _elementor_css and _elementor_page_assets.
• Curly apostrophes vs straight: Elementor stores both. The replace functions handle variants.
• JSON encoding: text in Elementor data may have \\u2019 for apostrophes.`
}

function getGutenbergKnowledge(): string {
  return `GUTENBERG EDITING:

Storage: post_content (HTML with block comments).
Block format: <!-- wp:block-type {"attrs"} --> <html content> <!-- /wp:block-type -->

TEXT CHANGES:
• Use replace_content to find and replace text in post_content.
• For block attributes (JSON inside comments), may need targeted regex.

COLOR CHANGES:
• Blocks use CSS classes: has-{color}-background-color, has-{color}-color
• Or inline styles in block attrs: {"style":{"color":{"background":"#hex","text":"#hex"}}}
• PREFER: update the block attributes directly via replace_content on the block comment.
• FALLBACK: CSS injection via update_style.

FONT CHANGES:
• Block themes use theme.json for global fonts.
• Individual blocks: {"fontSize":"large"} or {"style":{"typography":{"fontSize":"24px"}}}
• CSS fallback works well for Gutenberg font changes.

IMAGE CHANGES:
• Image blocks: <!-- wp:image {"id":123} --> <img src="..." /> <!-- /wp:image -->
• Replace the src URL and update the id attribute.

STRUCTURAL CHANGES:
• Add/remove blocks by modifying post_content HTML.
• Reorder by moving block comment sections within post_content.
• More complex than Elementor — blocks are HTML strings, not JSON.

GOTCHAS:
• Block validation: if HTML doesn't match expected output, Gutenberg shows "block recovery" error.
• Always preserve the exact block comment format.
• Reusable blocks are stored as separate posts (wp_block post type).`
}

function getDiviKnowledge(): string {
  return `DIVI EDITING:

Storage: post_content with Divi shortcodes [et_pb_section][et_pb_row][et_pb_column][et_pb_module]
Also stores in _et_builder_version, _et_pb_use_builder.

TEXT CHANGES:
• Text is inside shortcode content: [et_pb_text]<p>Content here</p>[/et_pb_text]
• Use replace_content to find/replace text.

COLOR CHANGES:
• Shortcode attributes: background_color="#hex", text_color="#hex"
• Module settings: header_text_color, body_text_color
• PREFER theme options (et_divi option) for global colors.
• CSS fallback: .et_pb_section, .et_pb_module, .et_pb_text classes.

STRUCTURAL CHANGES:
• Sections: [et_pb_section] ... [/et_pb_section]
• Rows: [et_pb_row] ... [/et_pb_row]
• Columns: [et_pb_column type="1_3"] ... [/et_pb_column]
• Remove by deleting the shortcode block from post_content.

GOTCHAS:
• Divi stores encoded content — special chars may be HTML entities.
• The Divi Builder layout is defined entirely by shortcodes.`
}

function getAvadaKnowledge(): string {
  return `AVADA EDITING:

Storage: post_content with Fusion Builder shortcodes.
Theme options: fusion_options in wp_options.

TEXT/COLOR CHANGES:
• Similar to Divi — shortcode attributes and content.
• Global options via fusion_options.
• CSS fallback: .fusion-builder-row, .fusion-layout-column classes.`
}

function getGenericKnowledge(): string {
  return `GENERIC BUILDER:

For unknown builders, use these safe approaches:
• Text: replace_content (searches post_content and meta)
• Colors: CSS injection via update_style
• Images: replace URLs in post_content
• Structural: CSS injection for visibility (display:none) — cannot truly add/remove elements.`
}

function getThemeKnowledge(framework: string): string | null {
  switch (framework) {
    case 'oshine':
    case 'oshine (be_themes)':
      return `OSHINE THEME:
Options stored in: wp_options → be_themes_options (array)
Option update method: update the be_themes_options array via scan_options + update_option_field.

Key settings (use these field names in the be_themes_options array):
• Colors: body_bg_color, body_text_color, body_link_color, heading_color, primary_color, secondary_color
• Fonts: heading_font, body_font
• Header: header_bg_color, header_text_color, header_style
• Footer: footer_bg_color, footer_text_color, footer_style
• Buttons: button_bg_color, button_text_color, button_hover_bg
• Layout: layout_style, container_width
• Page Title: page_title_bg_color, page_title_text_color

To change Oshine theme options:
1. Use scan_options to find the current value
2. Use update_option_field to set the new value
Example: change footer background → update be_themes_options[footer_bg_color] to the new hex value.
PREFER this over CSS injection when possible — it updates the theme properly.`

    case 'avada_fusion':
    case 'avada (fusion)':
      return `AVADA THEME:
Options stored in: wp_options → fusion_options
Key settings: primary_color, header_bg_color, footer_bg_color, body_typography, h1_typography, nav_typography, logo, logo_retina
Use update_option_field on fusion_options to change these directly.`

    case 'divi':
    case 'divi (elegant_themes)':
      return `DIVI THEME:
Options stored via et_get_option / et_update_option functions.
Key settings: accent_color, header_color, primary_nav_bg, footer_bg, body_font_size, header_font_size, logo
Use the Divi customizer or update the et_divi option in wp_options.`

    case 'astra':
      return `ASTRA THEME:
Options stored in: wp_options → astra-settings
Key settings: theme-color, link-color, text-color, heading-base-color, site-layout
Very Customizer-friendly — most changes go through set_theme_mod or the astra-settings option.`

    default:
      return null
  }
}

function getDecisionTree(): string {
  return `CHANGE DECISION TREE:
When the user asks to change something, follow this order:

1. CHECK CONTENT GRAPH: Do I know where this element is and what its current value is?
   YES → proceed. NO → the enriched scan data should have it. If truly missing, ask the user.

2. DETERMINE CHANGE TYPE:
   a. Text change → update_widget (Elementor) or replace_content (Gutenberg/other)
   b. Color/background change → update_widget settings (Elementor) or theme options (if it's a global theme color) or CSS injection (fallback)
   c. Font change → update_widget typography settings (Elementor) or theme options or CSS injection
   d. Image change → update_widget image settings (Elementor) or replace URL in content
   e. Structural (add/remove/reorder) → remove_element, reorder_element (Elementor only for now)
   f. Global change (all buttons, all headings) → theme options if available, else CSS injection
   g. WooCommerce (price/sale/coupon) → WooCommerce API actions
   h. Form change → form plugin API actions

3. EXECUTE: Emit the action block immediately. Never narrate what you would do.

4. VERIFY: The system will verify the change on the live page after execution.`
}
