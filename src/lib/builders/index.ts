import { templates as EL, toElementorJson } from './elementor'
import { templates as DV } from './divi'
import { templates as WB } from './wpbakery'
import { templates as AV } from './avada'
import { templates as BB, toBeaverJson } from './beaver'

export type BuilderType = 'elementor' | 'divi' | 'wpbakery' | 'avada' | 'beaver' | 'gutenberg'

export type SectionType =
  | 'hero' | 'testimonials' | 'pricing' | 'features'
  | 'faq' | 'cta' | 'team' | 'stats'

export interface SectionData {
  type: SectionType
  heading?: string
  subtext?: string
  btnLabel?: string
  btnUrl?: string
  items?: any[]
  tiers?: any[]
  members?: any[]
}

/** Detect builder from siteInfo.builder string or array */
export function detectBuilder(builderField: any): BuilderType {
  const b = typeof builderField === 'string'
    ? builderField.toLowerCase()
    : Array.isArray(builderField)
      ? (builderField[0]?.id || builderField[0]?.name || '').toLowerCase()
      : ''
  if (b.includes('elementor'))    return 'elementor'
  if (b.includes('divi') || b.includes('et_pb')) return 'divi'
  if (b.includes('wpbakery') || b.includes('vc_row') || b.includes('visual_composer')) return 'wpbakery'
  if (b.includes('avada') || b.includes('fusion'))  return 'avada'
  if (b.includes('beaver') || b.includes('fl_builder')) return 'beaver'
  return 'gutenberg'
}

/** Generate native builder markup for a section */
export function generateSection(builder: BuilderType, data: SectionData): {
  content: string
  contentType: 'elementor_json' | 'post_content' | 'beaver_json'
} {
  const h = data.heading || ''
  const s = data.subtext  || ''
  const b = data.btnLabel || 'Learn More'
  const u = data.btnUrl   || '#'

  switch (builder) {
    case 'elementor': {
      let sections: any[]
      switch (data.type) {
        case 'hero':         sections = [EL.hero(h, s, b, u)]; break
        case 'testimonials': sections = (EL.testimonials as any)(h, data.items || defaultTestimonials); break
        case 'pricing':      sections = (EL.pricing as any)(h, data.tiers || defaultTiers); break
        case 'features':     sections = (EL.features as any)(h, data.items || defaultFeatures); break
        case 'faq':          sections = [(EL.faq as any)(h, data.items || defaultFAQ)]; break
        case 'cta':          sections = [EL.cta(h, s, b, u)]; break
        case 'team':         sections = (EL.team as any)(h, data.members || defaultTeam); break
        case 'stats':        sections = [(EL.stats as any)(data.items || defaultStats)]; break
        default:             sections = []
      }
      return { content: toElementorJson(sections), contentType: 'elementor_json' }
    }

    case 'divi': {
      let content = ''
      switch (data.type) {
        case 'hero':         content = DV.hero(h, s, b, u); break
        case 'testimonials': content = DV.testimonials(h, data.items || defaultTestimonials); break
        case 'pricing':      content = DV.pricing(h, data.tiers || defaultTiers); break
        case 'features':     content = DV.features(h, data.items || defaultFeatures); break
        case 'faq':          content = DV.faq(h, data.items?.map((i:any) => ({q:i.title,a:i.content})) || defaultFAQ); break
        case 'cta':          content = DV.cta(h, s, b, u); break
        case 'team':         content = DV.team(h, data.members || defaultTeam); break
        default:             content = ''
      }
      return { content, contentType: 'post_content' }
    }

    case 'wpbakery': {
      let content = ''
      switch (data.type) {
        case 'hero':         content = WB.hero(h, s, b, u); break
        case 'testimonials': content = WB.testimonials(h, data.items || defaultTestimonials); break
        case 'pricing':      content = WB.pricing(h, data.tiers || defaultTiers); break
        case 'features':     content = WB.features(h, data.items || defaultFeatures); break
        case 'faq':          content = WB.faq(h, data.items?.map((i:any) => ({q:i.title,a:i.content})) || defaultFAQ); break
        case 'cta':          content = WB.cta(h, s, b, u); break
        case 'team':         content = WB.team(h, data.members || defaultTeam); break
        default:             content = ''
      }
      return { content, contentType: 'post_content' }
    }

    case 'avada': {
      let content = ''
      switch (data.type) {
        case 'hero':         content = AV.hero(h, s, b, u); break
        case 'testimonials': content = AV.testimonials(h, data.items || defaultTestimonials); break
        case 'pricing':      content = AV.pricing(h, data.tiers || defaultTiers); break
        case 'features':     content = AV.features(h, data.items || defaultFeatures); break
        case 'faq':          content = AV.faq(h, data.items?.map((i:any) => ({q:i.title,a:i.content})) || defaultFAQ); break
        case 'cta':          content = AV.cta(h, s, b, u); break
        case 'team':         content = AV.team(h, data.members || defaultTeam); break
        default:             content = ''
      }
      return { content, contentType: 'post_content' }
    }

    case 'beaver': {
      let rows: any
      switch (data.type) {
        case 'hero':         rows = BB.hero(h, s, b, u); break
        case 'testimonials': rows = BB.testimonials(h, data.items || defaultTestimonials); break
        case 'pricing':      rows = BB.pricing(h, data.tiers || defaultTiers); break
        case 'features':     rows = BB.features(h, data.items || defaultFeatures); break
        case 'faq':          rows = BB.faq(h, data.items?.map((i:any) => ({q:i.title,a:i.content})) || defaultFAQ); break
        case 'cta':          rows = BB.cta(h, s, b, u); break
        case 'team':         rows = BB.team(h, data.members || defaultTeam); break
        default:             rows = {}
      }
      return { content: toBeaverJson(rows), contentType: 'beaver_json' }
    }

    default: // gutenberg — handled by AI directly
      return { content: '', contentType: 'post_content' }
  }
}

// ── Defaults for placeholder content ─────────────────────────────
const defaultTestimonials = [
  { quote: 'Outstanding service and results. Highly recommended to anyone looking for quality.', name: 'Sarah Johnson', role: 'CEO, Acme Corp' },
  { quote: 'The team went above and beyond. We saw immediate improvements in our business.', name: 'Mark Williams', role: 'Director, Tech Solutions' },
  { quote: 'Professional, efficient, and great value. Will definitely work with them again.', name: 'Lisa Chen', role: 'Founder, Startup Co' },
]

const defaultTiers = [
  { title: 'Starter', price: '$9', per: 'month', features: ['5 projects', '10GB storage', 'Email support'], cta: 'Get Started', featured: false },
  { title: 'Professional', price: '$29', per: 'month', features: ['Unlimited projects', '50GB storage', 'Priority support', 'Analytics'], cta: 'Get Started', featured: true },
  { title: 'Enterprise', price: '$99', per: 'month', features: ['Everything in Pro', 'Dedicated account manager', 'Custom integrations', 'SLA'], cta: 'Contact Us', featured: false },
]

const defaultFeatures = [
  { icon: 'star', title: 'Premium Quality', desc: 'We deliver only the highest quality in everything we do.' },
  { icon: 'clock', title: 'Fast Delivery', desc: 'Quick turnaround without compromising on results.' },
  { icon: 'shield-alt', title: 'Secure & Reliable', desc: 'Your data and business are always protected.' },
]

const defaultFAQ = [
  { q: 'How does it work?', a: 'Our simple process gets you up and running in minutes. Just sign up and follow the guided setup.' },
  { q: 'What do I get?', a: 'You get full access to all features included in your plan, with no hidden fees.' },
  { q: 'Can I cancel anytime?', a: 'Yes — no contracts, no lock-in. Cancel anytime with one click.' },
]

const defaultTeam = [
  { name: 'Jane Smith', role: 'CEO & Founder', bio: 'Passionate about building great products.', image: '' },
  { name: 'John Doe', role: 'Head of Design', bio: 'Creating beautiful user experiences.', image: '' },
  { name: 'Amy Lee', role: 'Lead Developer', bio: 'Turning ideas into working software.', image: '' },
]

const defaultStats = [
  { value: 500, label: 'Happy Clients', suffix: '+' },
  { value: 98, label: 'Satisfaction Rate', suffix: '%' },
  { value: 12, label: 'Years Experience' },
  { value: 50, label: 'Team Members', suffix: '+' },
]
