/**
 * Global Settings Scanner
 * 
 * Scans WordPress options, theme settings, and plugin settings
 * Handles:
 * - WordPress core options (blogname, admin_email, etc.)
 * - Theme options (Avada, Divi, GeneratePress, etc.)
 * - Theme customizer settings
 * - Plugin settings stored in wp_options
 * 
 * Includes confidence scoring and safe serialization handling
 */

import axios from 'axios'
import { calculateConfidence, ContentConfidenceResult } from '@/lib/confidence'

export interface GlobalSettingsMatch {
  id: string
  type: 'global_settings'
  location: string
  optionName: string
  optionGroup?: string
  current: string
  proposed: string
  settingType: 'core' | 'theme' | 'plugin' | 'customizer'
  source: string // "WordPress Core", "Avada Theme", "Yoast SEO", etc.
  confidence?: ContentConfidenceResult
  riskLevel: 'low' | 'medium' | 'high'
}

/**
 * Scan all WordPress options for a search term
 * Handles both simple options and serialized/JSON data
 */
export async function scanAllOptions(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<GlobalSettingsMatch[]> {
  const matches: GlobalSettingsMatch[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    // Get all options via WordPress REST API settings endpoint
    const response = await axios.get(
      `${cleanUrl}/wp-json/wp/v2/settings`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status !== 200) {
      return matches
    }

    const settings = response.data || {}

    // Scan all settings for matches
    for (const [optionName, optionValue] of Object.entries(settings)) {
      const matchesFound = scanOption(
        optionName,
        optionValue,
        searchTerm,
        'wordpress'
      )

      for (const match of matchesFound) {
        const confidence = calculateConfidence({
          fieldName: match.fieldName,
          fieldType: 'setting',
          currentValue: match.current,
          searchTerm,
          context: match.current,
          pageTitle: match.source,
          builderType: 'unknown',
          location: match.fieldName,
          canVerifyPostChange: true,
        })

        matches.push({
          id: `settings-${optionName}-${matches.length}`,
          type: 'global_settings',
          location: `${match.source} > ${match.fieldName}`,
          optionName,
          current: match.current,
          proposed: match.current.replace(new RegExp(searchTerm, 'g'), searchTerm),
          settingType: match.type,
          source: match.source,
          confidence,
          riskLevel: match.riskLevel,
        })
      }
    }
  } catch (error) {
    console.error('Error scanning WordPress options:', error)
  }

  return matches
}

/**
 * Scan theme options specifically
 * Detects Avada, Divi, GeneratePress, etc. settings
 */
export async function scanThemeOptions(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<GlobalSettingsMatch[]> {
  const matches: GlobalSettingsMatch[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    // Common theme option keys
    const themeOptionKeys = [
      // Avada
      'sfsi_premium_customized_data',
      'avada_options',
      'avada_customizer_data',
      // Divi
      'et_divi_customizer_settings',
      'et_divi_options',
      'et_pb_options',
      // GeneratePress
      'generate_settings',
      'generate_customizer_data',
      // OceanWP
      'ocean_settings',
      // Astra
      'astra_settings',
      // Custom theme options
      'theme_mods_*',
      'theme_options',
    ]

    // Use WordPress API or custom bridge endpoint
    // This is a simplified version - real implementation would use bridge
    
    // Try to get theme customizer settings
    const response = await axios.get(
      `${cleanUrl}/wp-json/wp/v2/settings`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status !== 200) {
      return matches
    }

    const settings = response.data || {}

    // Look for theme-related options
    for (const [optionName, optionValue] of Object.entries(settings)) {
      // Check if this looks like a theme option
      if (
        optionName.includes('theme') ||
        optionName.includes('customizer') ||
        optionName.includes('avada') ||
        optionName.includes('divi') ||
        optionName.includes('et_') ||
        optionName.includes('generate') ||
        optionName.includes('ocean') ||
        optionName.includes('astra')
      ) {
        const matchesFound = scanOption(
          optionName,
          optionValue,
          searchTerm,
          'theme'
        )

        for (const match of matchesFound) {
          const confidence = calculateConfidence({
            fieldName: match.fieldName,
            fieldType: 'theme_setting',
            currentValue: match.current,
            searchTerm,
            context: match.current,
            pageTitle: match.source,
            builderType: 'unknown',
            location: match.fieldName,
            canVerifyPostChange: true,
          })

          // Theme settings are high risk - affects whole site
          const riskLevel = match.riskLevel === 'high' ? 'high' : 'medium'

          matches.push({
            id: `theme-settings-${optionName}-${matches.length}`,
            type: 'global_settings',
            location: `${match.source} > ${match.fieldName}`,
            optionName,
            current: match.current,
            proposed: match.current.replace(new RegExp(searchTerm, 'g'), searchTerm),
            settingType: 'theme',
            source: match.source,
            confidence,
            riskLevel,
          })
        }
      }
    }
  } catch (error) {
    console.error('Error scanning theme options:', error)
  }

  return matches
}

/**
 * Scan a single option value
 * Handles simple strings, arrays, JSON, serialized PHP
 */
function scanOption(
  optionName: string,
  optionValue: any,
  searchTerm: string,
  type: 'core' | 'theme' | 'plugin' = 'core'
): Array<{
  current: string
  fieldName: string
  type: 'core' | 'theme' | 'plugin'
  source: string
  riskLevel: 'low' | 'medium' | 'high'
}> {
  const matches: Array<{
    current: string
    fieldName: string
    type: 'core' | 'theme' | 'plugin'
    source: string
    riskLevel: 'low' | 'medium' | 'high'
  }> = []

  // Determine source
  const source = getOptionSource(optionName, type)

  // If it's a simple string, just search it
  if (typeof optionValue === 'string') {
    if (optionValue.includes(searchTerm)) {
      matches.push({
        current: optionValue,
        fieldName: optionName,
        type: source === 'WordPress Core' ? 'core' : type,
        source,
        riskLevel: getOptionRiskLevel(optionName),
      })
    }

    // Try to unserialize if it looks like PHP serialized data
    if (optionValue.startsWith('a:') || optionValue.startsWith('O:')) {
      try {
        const unserialized = unserializePhp(optionValue)
        if (unserialized && typeof unserialized === 'object') {
          const nestedMatches = scanObjectRecursively(
            unserialized,
            searchTerm,
            optionName,
            source,
            type
          )
          matches.push(...nestedMatches)
        }
      } catch {
        // Failed to unserialize, skip
      }
    }

    return matches
  }

  // If it's an object/array, scan recursively
  if (typeof optionValue === 'object' && optionValue !== null) {
    const nestedMatches = scanObjectRecursively(
      optionValue,
      searchTerm,
      optionName,
      source,
      type
    )
    matches.push(...nestedMatches)
  }

  return matches
}

/**
 * Scan an object/array recursively for search term
 */
function scanObjectRecursively(
  obj: any,
  searchTerm: string,
  parentKey: string,
  source: string,
  type: 'core' | 'theme' | 'plugin'
): Array<{
  current: string
  fieldName: string
  type: 'core' | 'theme' | 'plugin'
  source: string
  riskLevel: 'low' | 'medium' | 'high'
}> {
  const matches: Array<{
    current: string
    fieldName: string
    type: 'core' | 'theme' | 'plugin'
    source: string
    riskLevel: 'low' | 'medium' | 'high'
  }> = []

  if (!obj || typeof obj !== 'object') {
    return matches
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = `${parentKey} > ${key}`

    if (typeof value === 'string') {
      if (value.includes(searchTerm)) {
        matches.push({
          current: value,
          fieldName: fullKey,
          type,
          source,
          riskLevel: getOptionRiskLevel(fullKey),
        })
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively scan nested objects (limit depth to prevent infinite loops)
      if (fullKey.split('>').length < 5) {
        const nestedMatches = scanObjectRecursively(value, searchTerm, fullKey, source, type)
        matches.push(...nestedMatches)
      }
    }
  }

  return matches
}

/**
 * Determine the source/product of an option
 */
function getOptionSource(optionName: string, type: string): string {
  const lower = optionName.toLowerCase()

  // WordPress Core
  if (['blogname', 'blogdescription', 'admin_email', 'siteurl', 'home'].includes(lower)) {
    return 'WordPress Core'
  }

  // Avada
  if (lower.includes('avada') || lower.includes('sfsi_premium')) {
    return 'Avada Theme'
  }

  // Divi
  if (lower.includes('divi') || lower.includes('et_')) {
    return 'Divi Theme'
  }

  // GeneratePress
  if (lower.includes('generate')) {
    return 'GeneratePress Theme'
  }

  // OceanWP
  if (lower.includes('ocean')) {
    return 'OceanWP Theme'
  }

  // Astra
  if (lower.includes('astra')) {
    return 'Astra Theme'
  }

  // Yoast SEO
  if (lower.includes('yoast') || lower.includes('wpseo')) {
    return 'Yoast SEO'
  }

  // WooCommerce
  if (lower.includes('woocommerce')) {
    return 'WooCommerce'
  }

  // Default
  if (lower.includes('theme')) {
    return 'Theme Settings'
  }

  if (lower.includes('plugin')) {
    return 'Plugin Settings'
  }

  return type === 'theme' ? 'Theme Settings' : type === 'plugin' ? 'Plugin Settings' : 'WordPress Core'
}

/**
 * Determine risk level for an option
 */
function getOptionRiskLevel(optionName: string): 'low' | 'medium' | 'high' {
  const lower = optionName.toLowerCase()

  // Low risk - safe to change
  if (lower.includes('phone') || lower.includes('email') || lower.includes('address')) {
    return 'low'
  }

  // Medium risk - theme settings
  if (lower.includes('theme') || lower.includes('color') || lower.includes('font')) {
    return 'medium'
  }

  // High risk - core settings or unknown
  if (
    lower.includes('siteurl') ||
    lower.includes('home') ||
    lower.includes('admin') ||
    lower.includes('permalink')
  ) {
    return 'high'
  }

  // Default medium risk
  return 'medium'
}

/**
 * Basic PHP unserialize implementation
 * Note: This is incomplete - only handles simple cases
 * For production, use a proper PHP parser or bridge
 */
function unserializePhp(str: string): any {
  try {
    // Very basic implementation - for production use proper parser
    if (str.startsWith('a:')) {
      // Array format: a:count:{...}
      // This is complex - return null for now
      return null
    }

    if (str.startsWith('s:')) {
      // String: s:length:"value";
      const match = str.match(/s:(\d+):"(.*)";/)
      if (match) {
        return match[2]
      }
    }

    if (str.startsWith('i:')) {
      // Integer: i:value;
      const match = str.match(/i:(\d+);/)
      if (match) {
        return parseInt(match[1], 10)
      }
    }

    if (str.startsWith('b:')) {
      // Boolean: b:1; or b:0;
      const match = str.match(/b:([01]);/)
      if (match) {
        return match[1] === '1'
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Update a WordPress option
 * Used by routines to apply changes
 */
export async function updateWPOption(
  siteUrl: string,
  apiKey: string,
  optionName: string,
  newValue: any
): Promise<boolean> {
  try {
    const response = await axios.post(
      `${siteUrl}/wp-json/wp/v2/settings`,
      {
        [optionName]: newValue,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    )

    return response.status === 200
  } catch (error) {
    console.error(`Error updating option ${optionName}:`, error)
    return false
  }
}
