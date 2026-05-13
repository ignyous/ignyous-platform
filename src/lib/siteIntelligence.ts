/**
 * Site Intelligence / Capabilities Scanner
 * 
 * Builds a comprehensive profile of the connected WordPress site
 * including active plugins, builders, forms, capabilities, and options.
 * 
 * This is the foundation for "scan before action" and smart prompts.
 */

import axios from 'axios'

export interface SiteCapabilities {
  // Basic info
  wordpress_version: string
  site_url: string
  site_name: string
  site_tagline: string
  admin_email: string
  
  // Theme info
  active_theme: string
  is_child_theme: boolean
  
  // Builder detection
  builder: 'elementor' | 'gutenberg' | 'divi' | 'avada' | 'wpbakery' | 'beaver' | 'bricks' | 'oxygen' | 'classic' | 'unknown'
  builder_version?: string
  
  // Page stats
  total_pages: number
  active_pages: number
  total_posts: number
  active_posts: number
  
  // Plugin detection
  plugins: {
    forms?: {
      provider: 'gravity_forms' | 'wpforms' | 'cf7' | 'fluent_forms' | 'ninja_forms' | 'formidable' | 'elementor' | string
      version?: string
      active_forms: number
      pages_with_forms: number
      can_add_field: boolean
      can_edit_notifications: boolean
    }
    cache?: {
      provider: 'wp_fastest_cache' | 'w3_total_cache' | 'wp_super_cache' | 'breeze' | string
      version?: string
      can_clear: boolean
    }
    seo?: {
      provider: 'yoast' | 'rankmath' | 'aioseo' | 'seopress' | string
      version?: string
      can_update_meta: boolean
      can_update_schema: boolean
    }
    ecommerce?: {
      provider: 'woocommerce' | 'edd' | 'surecart' | string
      version?: string
      product_count: number
      can_update_products: boolean
    }
    events?: {
      provider: 'the_events_calendar' | 'modern_events' | 'event_espresso' | 'amelia' | 'bookly' | string
      version?: string
      active_events: number
    }
    security?: {
      provider: string
      version?: string
    }
    backups?: {
      provider: string
      version?: string
      last_backup?: string
    }
    analytics?: {
      provider: string
      version?: string
    }
  }
  
  // Content structure
  content_editing: {
    safe_text_replace: boolean
    safe_phone_replace: boolean
    safe_email_replace: boolean
    safe_url_replace: boolean
    builder_sections_editable: boolean
    acf_fields_supported: boolean
    meta_fields_accessible: boolean
  }
  
  // Storage locations
  header_storage: 'theme' | 'builder' | 'custom' | 'widget'
  footer_storage: 'theme' | 'builder' | 'custom' | 'widget'
  
  // Custom structures
  custom_post_types: string[]
  custom_taxonomies: string[]
  active_menus: string[]
  
  // Form info
  forms: Array<{
    id: number
    title: string
    type: string
    pages: number[]
    fields: number
  }>
  
  // Capabilities for AI
  can_do: {
    change_phone: boolean
    change_email: boolean
    change_address: boolean
    add_form_field: boolean
    create_form: boolean
    replace_form: boolean
    add_page_section: boolean
    edit_page_section: boolean
    change_colors: boolean
    change_fonts: boolean
    update_seo: boolean
    add_product: boolean
    update_woocommerce: boolean
    install_plugin: boolean
    clear_cache: boolean
  }
  
  // Warnings
  warnings: string[]
}

/**
 * Scan a WordPress site and build capabilities profile
 */
export async function scanSiteCapabilities(
  siteUrl: string,
  apiKey: string
): Promise<SiteCapabilities | null> {
  const cleanUrl = siteUrl.replace(/\/$/, '')
  const capabilities: Partial<SiteCapabilities> = {
    site_url: cleanUrl,
    plugins: {},
    content_editing: {
      safe_text_replace: true,
      safe_phone_replace: true,
      safe_email_replace: true,
      safe_url_replace: true,
      builder_sections_editable: false,
      acf_fields_supported: false,
      meta_fields_accessible: false,
    },
    can_do: {
      change_phone: true,
      change_email: true,
      change_address: true,
      add_form_field: false,
      create_form: false,
      replace_form: false,
      add_page_section: false,
      edit_page_section: false,
      change_colors: false,
      change_fonts: false,
      update_seo: false,
      add_product: false,
      update_woocommerce: false,
      install_plugin: false,
      clear_cache: false,
    },
    warnings: [],
    custom_post_types: [],
    custom_taxonomies: [],
    active_menus: [],
    forms: [],
  }

  try {
    // Get WordPress info
    const settingsResp = await axios.get(
      `${cleanUrl}/wp-json/wp/v2/settings`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (settingsResp.status === 200) {
      const settings = settingsResp.data
      capabilities.wordpress_version = settings.wp_version || 'unknown'
      capabilities.site_name = settings.title || 'Unknown'
      capabilities.site_tagline = settings.description || ''
      capabilities.admin_email = settings.admin_email || ''
    }

    // Get theme info
    const themeResp = await axios.get(
      `${cleanUrl}/wp-json/wp/v2/themes`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (themeResp.status === 200 && themeResp.data) {
      const themes = Array.isArray(themeResp.data) ? themeResp.data : Object.values(themeResp.data)
      const activeTheme = themes.find((t: any) => t.is_active)
      if (activeTheme) {
        capabilities.active_theme = activeTheme.name || 'Unknown'
        capabilities.is_child_theme = activeTheme.is_child_theme || false
      }
    }

    // Get page and post counts
    const pagesResp = await axios.get(
      `${cleanUrl}/wp-json/wp/v2/pages?per_page=1`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (pagesResp.status === 200) {
      const totalPages = parseInt(pagesResp.headers['x-wp-total'] || '0', 10)
      const activePages = Math.max(
        0,
        parseInt(pagesResp.headers['x-wp-total'] || '0', 10) - 1
      ) // Subtract default page
      capabilities.total_pages = totalPages
      capabilities.active_pages = activePages
    }

    const postsResp = await axios.get(
      `${cleanUrl}/wp-json/wp/v2/posts?per_page=1&status=publish`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (postsResp.status === 200) {
      capabilities.total_posts = parseInt(
        postsResp.headers['x-wp-total'] || '0',
        10
      )
    }

    // Detect builder
    const builderDetection = await detectBuilder(cleanUrl, apiKey)
    capabilities.builder = builderDetection.type as any
    if (builderDetection.type !== 'unknown') {
      capabilities.builder_sections_editable = true
      capabilities.can_do.add_page_section = true
      capabilities.can_do.edit_page_section = true
    }

    // Detect plugins
    await detectPlugins(cleanUrl, apiKey, capabilities)

    // Get custom post types
    const typesResp = await axios.get(
      `${cleanUrl}/wp-json/wp/v2/types`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (typesResp.status === 200 && typesResp.data) {
      const builtInTypes = ['post', 'page', 'attachment', 'wp_block', 'wp_template']
      capabilities.custom_post_types = Object.keys(typesResp.data).filter(
        (t) => !builtInTypes.includes(t)
      )
      
      // Check for ACF
      if (capabilities.custom_post_types.includes('acf-field-group')) {
        capabilities.content_editing.acf_fields_supported = true
      }
    }

    return capabilities as SiteCapabilities
  } catch (error) {
    console.error('Error scanning site capabilities:', error)
    return null
  }
}

/**
 * Detect which page builder is active
 */
async function detectBuilder(
  siteUrl: string,
  apiKey: string
): Promise<{ type: string; version?: string }> {
  try {
    // Check for Elementor
    const elementorCheck = await axios.get(
      `${siteUrl}/wp-json/elementor/v1/info`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    if (elementorCheck.status === 200) {
      return { type: 'elementor', version: elementorCheck.data?.version }
    }

    // Check for Divi
    const diviCheck = await axios.get(
      `${siteUrl}/wp-json/wp/v2/settings`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    if (diviCheck.status === 200 && diviCheck.data?.et_divi_customizer_settings) {
      return { type: 'divi' }
    }

    // Default to Gutenberg (always available)
    return { type: 'gutenberg' }
  } catch {
    return { type: 'unknown' }
  }
}

/**
 * Detect active plugins and their capabilities
 */
async function detectPlugins(
  siteUrl: string,
  apiKey: string,
  capabilities: Partial<SiteCapabilities>
): Promise<void> {
  try {
    // This would typically use a bridge endpoint to get plugin list
    // For now, we'll check for common plugins via their REST API endpoints
    
    // Check for popular form plugins
    const formPluginsCheck = await axios.get(
      `${siteUrl}/wp-json/gf/v2/forms`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    
    if (formPluginsCheck.status === 200 && Array.isArray(formPluginsCheck.data)) {
      capabilities.plugins!.forms = {
        provider: 'gravity_forms',
        active_forms: formPluginsCheck.data.length,
        pages_with_forms: 0, // Would need separate check
        can_add_field: true,
        can_edit_notifications: true,
      }
      capabilities.can_do!.add_form_field = true
      capabilities.can_do!.create_form = true
      capabilities.can_do!.replace_form = true
    }

    // Check for WooCommerce
    const wooCheck = await axios.get(
      `${siteUrl}/wp-json/wc/v3/products?per_page=1`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    
    if (wooCheck.status === 200) {
      const productCount = parseInt(wooCheck.headers['x-wp-total'] || '0', 10)
      capabilities.plugins!.ecommerce = {
        provider: 'woocommerce',
        product_count: productCount,
        can_update_products: true,
      }
      capabilities.can_do!.add_product = true
      capabilities.can_do!.update_woocommerce = true
    }

    // Check for Yoast SEO
    const yoastCheck = await axios.get(
      `${siteUrl}/wp-json/yoast/v1/status`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )
    
    if (yoastCheck.status === 200) {
      capabilities.plugins!.seo = {
        provider: 'yoast',
        can_update_meta: true,
        can_update_schema: true,
      }
      capabilities.can_do!.update_seo = true
    }
  } catch {
    // Non-fatal if plugin detection fails
  }
}

/**
 * Get smart prompt suggestions based on capabilities
 */
export function getSmartPrompts(capabilities: SiteCapabilities): string[] {
  const prompts: string[] = []

  // Based on what the site can do
  if (capabilities.can_do.change_phone) {
    prompts.push('→ Change phone number')
  }
  
  if (capabilities.can_do.change_email) {
    prompts.push('→ Change email address')
  }
  
  if (capabilities.can_do.add_form_field && capabilities.plugins.forms) {
    prompts.push(`→ Add field to ${capabilities.plugins.forms.provider}`)
  }
  
  if (capabilities.can_do.add_page_section) {
    prompts.push(`→ Add section to ${capabilities.builder} page`)
  }
  
  if (capabilities.can_do.add_product) {
    prompts.push('→ Add product')
  }
  
  if (capabilities.can_do.update_seo) {
    prompts.push('→ Update SEO title/description')
  }

  return prompts
}
