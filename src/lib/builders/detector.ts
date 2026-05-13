/**
 * Page Builder Detection
 * 
 * Detects which page builder (if any) is active on a WordPress site
 * Supports: Elementor, Gutenberg, Divi, Beaver Builder, and fallback for unknown
 */

import axios from 'axios'

export type BuilderType = 'elementor' | 'gutenberg' | 'divi' | 'beaver' | 'unknown'

export interface BuilderDetectionResult {
  active: boolean
  builderType: BuilderType
  version?: string
  confidence: number // 0-100 how confident are we
  details?: {
    pluginFile?: string
    metaKey?: string
    dataStructure?: string
  }
}

/**
 * Detect which page builder is active on a WordPress site
 */
export async function detectPageBuilder(
  siteUrl: string,
  apiKey: string
): Promise<BuilderDetectionResult> {
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    // Try each detection method
    const results: BuilderDetectionResult[] = []

    // Check Elementor
    const elementorResult = await detectElementor(cleanUrl, apiKey)
    if (elementorResult.active) results.push(elementorResult)

    // Check Gutenberg
    const gutenbergResult = await detectGutenberg(cleanUrl, apiKey)
    if (gutenbergResult.active) results.push(gutenbergResult)

    // Check Divi
    const diviResult = await detectDivi(cleanUrl, apiKey)
    if (diviResult.active) results.push(diviResult)

    // Check Beaver Builder
    const beaverResult = await detectBeaverBuilder(cleanUrl, apiKey)
    if (beaverResult.active) results.push(beaverResult)

    // Return highest confidence result
    if (results.length > 0) {
      results.sort((a, b) => b.confidence - a.confidence)
      return results[0]
    }

    return {
      active: false,
      builderType: 'unknown',
      confidence: 0,
    }
  } catch (error) {
    console.error('Error detecting page builder:', error)
    return {
      active: false,
      builderType: 'unknown',
      confidence: 0,
    }
  }
}

/**
 * Detect Elementor
 * Checks for: Elementor plugin, _elementor_data meta, _elementor_version
 */
async function detectElementor(siteUrl: string, apiKey: string): Promise<BuilderDetectionResult> {
  try {
    // Check if Elementor plugin is active via WP REST API
    const pluginsResponse = await axios.get(`${siteUrl}/wp-json/wp/v2/plugins`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 5000,
      validateStatus: () => true,
    })

    if (pluginsResponse.status === 200) {
      const plugins = Array.isArray(pluginsResponse.data) ? pluginsResponse.data : []
      const elementor = plugins.find(
        (p: any) =>
          p.plugin?.includes('elementor') &&
          (p.status === 'active' || p.active === true)
      )

      if (elementor) {
        return {
          active: true,
          builderType: 'elementor',
          version: elementor.version,
          confidence: 95,
          details: {
            pluginFile: elementor.plugin,
            metaKey: '_elementor_data',
            dataStructure: 'JSON in post meta',
          },
        }
      }
    }

    // Check via bridge plugin (more reliable)
    const bridgeResponse = await axios.get(
      `${siteUrl}/wp-json/ignyous/v1/site`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
        validateStatus: () => true,
      }
    )

    if (bridgeResponse.status === 200 && bridgeResponse.data?.plugins) {
      const elementorPlugin = bridgeResponse.data.plugins.find(
        (p: any) => p.slug === 'elementor' && p.active
      )

      if (elementorPlugin) {
        return {
          active: true,
          builderType: 'elementor',
          version: elementorPlugin.version,
          confidence: 98,
          details: {
            pluginFile: 'elementor/elementor.php',
            metaKey: '_elementor_data',
            dataStructure: 'JSON in post meta',
          },
        }
      }
    }

    return {
      active: false,
      builderType: 'elementor',
      confidence: 0,
    }
  } catch (error) {
    return {
      active: false,
      builderType: 'elementor',
      confidence: 0,
    }
  }
}

/**
 * Detect Gutenberg
 * Checks for: WordPress version >= 5.0, block editor enabled
 */
async function detectGutenberg(siteUrl: string, apiKey: string): Promise<BuilderDetectionResult> {
  try {
    const siteResponse = await axios.get(`${siteUrl}/wp-json/wp/v2/settings`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 5000,
      validateStatus: () => true,
    })

    if (siteResponse.status === 200) {
      const site = siteResponse.data

      // Gutenberg is enabled if editor settings exist
      if (
        site.gutenberg_version ||
        (site.wordpress_version && site.wordpress_version >= '5.0')
      ) {
        return {
          active: true,
          builderType: 'gutenberg',
          version: site.gutenberg_version || site.wordpress_version,
          confidence: 90,
          details: {
            dataStructure: 'HTML comments (block markup)',
            metaKey: 'post_content',
          },
        }
      }
    }

    return {
      active: false,
      builderType: 'gutenberg',
      confidence: 0,
    }
  } catch (error) {
    return {
      active: false,
      builderType: 'gutenberg',
      confidence: 0,
    }
  }
}

/**
 * Detect Divi
 * Checks for: Divi theme or plugin, et_builder_data meta
 */
async function detectDivi(siteUrl: string, apiKey: string): Promise<BuilderDetectionResult> {
  try {
    const themeResponse = await axios.get(`${siteUrl}/wp-json/wp/v2/themes`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 5000,
      validateStatus: () => true,
    })

    if (themeResponse.status === 200) {
      const themes = Array.isArray(themeResponse.data) ? themeResponse.data : []
      const diviTheme = themes.find(
        (t: any) => t.stylesheet?.includes('divi') && t.status === 'active'
      )

      if (diviTheme) {
        return {
          active: true,
          builderType: 'divi',
          version: diviTheme.version,
          confidence: 92,
          details: {
            themeFile: diviTheme.stylesheet,
            metaKey: 'et_builder_data',
            dataStructure: 'JSON in post meta',
          },
        }
      }
    }

    // Check for Divi plugin
    const pluginsResponse = await axios.get(`${siteUrl}/wp-json/wp/v2/plugins`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 5000,
      validateStatus: () => true,
    })

    if (pluginsResponse.status === 200) {
      const plugins = Array.isArray(pluginsResponse.data) ? pluginsResponse.data : []
      const diviPlugin = plugins.find(
        (p: any) => p.plugin?.includes('divi') && (p.status === 'active' || p.active === true)
      )

      if (diviPlugin) {
        return {
          active: true,
          builderType: 'divi',
          version: diviPlugin.version,
          confidence: 85,
          details: {
            pluginFile: diviPlugin.plugin,
            metaKey: 'et_builder_data',
            dataStructure: 'JSON in post meta',
          },
        }
      }
    }

    return {
      active: false,
      builderType: 'divi',
      confidence: 0,
    }
  } catch (error) {
    return {
      active: false,
      builderType: 'divi',
      confidence: 0,
    }
  }
}

/**
 * Detect Beaver Builder
 * Checks for: Beaver Builder plugin, _fl_builder_data meta
 */
async function detectBeaverBuilder(
  siteUrl: string,
  apiKey: string
): Promise<BuilderDetectionResult> {
  try {
    const pluginsResponse = await axios.get(`${siteUrl}/wp-json/wp/v2/plugins`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 5000,
      validateStatus: () => true,
    })

    if (pluginsResponse.status === 200) {
      const plugins = Array.isArray(pluginsResponse.data) ? pluginsResponse.data : []
      const beaverPlugin = plugins.find(
        (p: any) => p.plugin?.includes('beaver-builder') && (p.status === 'active' || p.active === true)
      )

      if (beaverPlugin) {
        return {
          active: true,
          builderType: 'beaver',
          version: beaverPlugin.version,
          confidence: 88,
          details: {
            pluginFile: beaverPlugin.plugin,
            metaKey: '_fl_builder_data',
            dataStructure: 'Custom post type + meta',
          },
        }
      }
    }

    return {
      active: false,
      builderType: 'beaver',
      confidence: 0,
    }
  } catch (error) {
    return {
      active: false,
      builderType: 'beaver',
      confidence: 0,
    }
  }
}

/**
 * Get builder info for UI display
 */
export function getBuilderInfo(builderType: BuilderType) {
  const info: Record<BuilderType, { name: string; icon: string; description: string }> = {
    elementor: {
      name: 'Elementor',
      icon: '⚙️',
      description: 'Popular page builder with 7M+ sites',
    },
    gutenberg: {
      name: 'Gutenberg',
      icon: '⬡',
      description: 'WordPress native block editor',
    },
    divi: {
      name: 'Divi',
      icon: '▦',
      description: 'Elegant Themes page builder',
    },
    beaver: {
      name: 'Beaver Builder',
      icon: '🦫',
      description: 'Fast Beaver Builder',
    },
    unknown: {
      name: 'Unknown',
      icon: '❓',
      description: 'Page builder not recognized',
    },
  }

  return info[builderType]
}
