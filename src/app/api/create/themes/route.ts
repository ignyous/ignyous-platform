import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── WordPress.org theme library with metadata ─────────────────
const THEME_LIBRARY = [
  // Gutenberg themes
  { slug:'astra',       name:'Astra',           builder:'Gutenberg', style:'Minimal',   desc:'Lightweight, fast, and highly customisable. Works with any page builder.',     demoUrl:'https://wpastra.com/theme-demos/',     color1:'#2c3e50',color2:'#3498db', screenshot:'https://i0.wp.com/themes.svn.wordpress.org/astra/screenshot.png' },
  { slug:'kadence',     name:'Kadence',          builder:'Gutenberg', style:'Bold',      desc:'Full site editing theme with global styles, header/footer builder.',           demoUrl:'https://www.kadencewp.com/kadence-theme/demos/', color1:'#1a1a4e',color2:'#4a90e2' },
  { slug:'generatepress',name:'GeneratePress',   builder:'Gutenberg', style:'Minimal',   desc:'Speed-focused theme with premium design modules and clean code.',              demoUrl:'https://generatepress.com/theme-demos/',color1:'#2d6a4f',color2:'#52b788' },
  { slug:'twentytwentyfour',name:'Twenty Twenty-Four',builder:'Gutenberg',style:'Minimal',desc:'Official WordPress block theme with modern, editorial design.',            demoUrl:'https://wordpress.org/themes/twentytwentyfour/',color1:'#f5f5f0',color2:'#1a1a2e' },
  { slug:'blocksy',     name:'Blocksy',          builder:'Gutenberg', style:'Corporate', desc:'Performance-first block theme with WooCommerce deep integration.',            demoUrl:'https://creativethemes.com/blocksy/demos/', color1:'#0073aa',color2:'#005177' },
  { slug:'neve',        name:'Neve',             builder:'Gutenberg', style:'Corporate', desc:'Fast, responsive, AMP-ready WordPress theme for any type of website.',        demoUrl:'https://themeisle.com/themes/neve/demos/',  color1:'#0ea5e9',color2:'#0369a1' },
  { slug:'hello-elementor',name:'Hello Elementor',builder:'Elementor',style:'Minimal', desc:'Official Elementor blank canvas theme, optimised for best performance.',      demoUrl:'https://elementor.com/hello-theme-demos/',color1:'#93003a',color2:'#e8003a' },
  // Elementor-optimised themes
  { slug:'oceanwp',    name:'OceanWP',           builder:'Elementor', style:'Corporate', desc:'Versatile WooCommerce and business theme with 200+ demos.',                   demoUrl:'https://demos.oceanwp.org/',               color1:'#1b5e95',color2:'#0d3a5e' },
  { slug:'generatepress-el',name:'GeneratePress (Elementor)',builder:'Elementor',style:'Bold',desc:'Lightweight base with full Elementor Pro compatibility.',               demoUrl:'https://generatepress.com/theme-demos/',color1:'#6d28d9',color2:'#4c1d95' },
  { slug:'rey',        name:'Rey',               builder:'Elementor', style:'Elegant',   desc:'WooCommerce store theme with advanced product filtering and Elementor.',      demoUrl:'https://wpreytheme.com/demo/',             color1:'#1c1c1c',color2:'#444' },
  { slug:'porto',      name:'Porto',             builder:'Elementor', style:'Bold',      desc:'Ultra-fast WooCommerce multipurpose theme, 100+ demos.',                     demoUrl:'https://www.portotheme.com/demo/',          color1:'#e74c3c',color2:'#c0392b' },
  // Avada themes
  { slug:'avada',      name:'Avada',             builder:'Avada',     style:'Corporate', desc:'#1 best-selling WordPress theme of all time. 90+ pre-built websites.',       demoUrl:'https://avada.com/prebuilt-websites/',     color1:'#65bc7b',color2:'#4a9b60' },
  { slug:'avada-health',name:'Avada — Health',  builder:'Avada',     style:'Minimal',   desc:'Clean health and wellness demo with appointment booking integration.',        demoUrl:'https://avada.com/prebuilt-websites/health/',color1:'#5eead4',color2:'#0d9488' },
  { slug:'avada-shop', name:'Avada — Shop',     builder:'Avada',     style:'Bold',      desc:'Premium e-commerce layout with product filtering and cart customisation.',    demoUrl:'https://avada.com/prebuilt-websites/shop/', color1:'#f97316',color2:'#ea580c' },
  { slug:'avada-creative',name:'Avada — Creative',builder:'Avada',   style:'Creative',  desc:'Portfolio and agency layout with full-screen hero and project galleries.',    demoUrl:'https://avada.com/prebuilt-websites/architecture/',color1:'#1e293b',color2:'#0f172a' },
  // Dark/creative themes
  { slug:'divi',       name:'Divi',              builder:'Divi',      style:'Creative',  desc:'Drag-and-drop visual builder with 200+ design modules. Unlimited sites.',    demoUrl:'https://www.elegantthemes.com/layouts/',   color1:'#7c3aed',color2:'#5b21b6' },
  { slug:'jupiterx',   name:'Jupiter X',         builder:'Elementor', style:'Dark',      desc:'Professional Elementor-first theme with 120+ ready-made templates.',         demoUrl:'https://themes.artbees.net/jupiterx-demos/',color1:'#111827',color2:'#000' },
  { slug:'xstore',     name:'XStore',            builder:'Elementor', style:'Bold',      desc:'Woocommerce-first theme, 100+ shop layouts, Ajax filter, wishlist.',         demoUrl:'https://xstore.8theme.com/',               color1:'#111',  color2:'#333' },
  { slug:'woodmart',   name:'WoodMart',          builder:'Elementor', style:'Elegant',   desc:'Premium WooCommerce theme with AJAX shop, mega menu, and 90+ demos.',        demoUrl:'https://xtemos.com/demo/?theme=woodmart',  color1:'#2c2c2c',color2:'#1a1a1a' },
]

export async function POST(req: NextRequest) {
  const { description, features, tier } = await req.json()

  // AI picks the best themes for this site
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 600,
    messages: [{ role: 'user', content:
      `Site description: "${description}"\n` +
      `Features needed: ${features.join(', ')}\n` +
      `Tier: ${tier}\n\n` +
      `Available themes: ${THEME_LIBRARY.map(t => `${t.slug}(${t.builder},${t.style})`).join(', ')}\n\n` +
      `Pick the 9 BEST themes for this site. Consider: builder suitability, WooCommerce if store is needed, event plugins if events, site style.\n` +
      `Return JSON only: {"recommended":["slug1","slug2","slug3"],"top_pick":"slug","reason":"brief reason"}`
    }],
  })

  const raw = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
  let aiPicks: any = { recommended: THEME_LIBRARY.slice(0, 9).map(t => t.slug), top_pick: 'astra' }
  try { aiPicks = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}

  const recommended = (aiPicks.recommended || []).slice(0, 9)

  // Build theme list — AI picks first, then fill up with rest
  const topThemes    = recommended.map((slug: string) => THEME_LIBRARY.find(t => t.slug === slug)).filter(Boolean)
  const remaining    = THEME_LIBRARY.filter(t => !recommended.includes(t.slug)).slice(0, 18 - topThemes.length)
  const allThemes    = [...topThemes, ...remaining].map(t => ({
    ...t,
    aiRecommended: recommended.includes(t!.slug),
  }))

  return NextResponse.json({ themes: allThemes, topPick: aiPicks.top_pick, reason: aiPicks.reason })
}
