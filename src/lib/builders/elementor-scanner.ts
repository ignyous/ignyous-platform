/**
 * Elementor Content Scanner
 * 
 * Scans and replaces content in Elementor-built pages
 * Includes confidence scoring for each match
 */

import axios from 'axios'
import { calculateConfidence, ContentConfidenceResult } from '@/lib/confidence'

export interface ElementorElement {
  id: string
  elType: 'widget' | 'container' | 'column' | 'section'
  widgetType?: string
  settings?: Record<string, any>
  elements?: ElementorElement[]
}

export interface ElementorContentMatch {
  id: string
  type: 'elementor'
  location: string
  pageTitle: string
  pageId: number
  current: string
  proposed: string
  elementId: string
  elementType: string
  widgetType?: string
  fieldName: string
  fieldPath: string[]
  confidence?: ContentConfidenceResult
}

/**
 * Scan a single Elementor page for content matches
 */
export async function scanElementorPage(
  siteUrl: string,
  apiKey: string,
  page: any,
  searchTerm: string
): Promise<ElementorContentMatch[]> {
  const matches: ElementorContentMatch[] = []

  try {
    // Get page meta with Elementor data
    const response = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${page.id}?_fields=meta,title`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status !== 200 || !response.data.meta?._elementor_data) {
      return matches
    }

    let elementorDataStr = response.data.meta._elementor_data

    // Handle both string and object formats
    if (typeof elementorDataStr !== 'string') {
      elementorDataStr = JSON.stringify(elementorDataStr)
    }

    const elementorData = JSON.parse(elementorDataStr)
    const pageTitle = page.title?.rendered || page.title || 'Untitled'

    // Recursively search for matches
    function searchElements(
      elements: ElementorElement[],
      pathPrefix: string[] = []
    ) {
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i]
        const currentPath = [...pathPrefix, 'elements', String(i)]

        // Check if this element has settings with content
        if (element.settings) {
          for (const [settingKey, settingValue] of Object.entries(element.settings)) {
            if (typeof settingValue === 'string' && settingValue.includes(searchTerm)) {
              // Calculate confidence for this match
              const confidence = calculateConfidence({
                fieldName: settingKey,
                fieldType: element.widgetType,
                currentValue: settingValue,
                searchTerm,
                context: settingValue,
                pageTitle,
                builderType: 'elementor',
                elementType: element.widgetType,
                isInFormField:
                  element.widgetType?.includes('form') || settingKey.includes('phone'),
                canVerifyPostChange: true,
              })

              matches.push({
                id: `elementor-${element.id}-${settingKey}`,
                type: 'elementor',
                location: `${pageTitle} → ${element.widgetType || element.elType} → ${settingKey}`,
                pageTitle,
                pageId: page.id,
                current: settingValue,
                proposed: settingValue.replace(new RegExp(searchTerm, 'g'), searchTerm),
                elementId: element.id,
                elementType: element.elType,
                widgetType: element.widgetType,
                fieldName: settingKey,
                fieldPath: [...currentPath, 'settings', settingKey],
                confidence,
              })
            }
          }
        }

        // Recurse into nested elements
        if (element.elements && element.elements.length > 0) {
          searchElements(element.elements, currentPath)
        }
      }
    }

    searchElements([elementorData])
  } catch (error) {
    console.error(`Error scanning Elementor page ${page.id}:`, error)
  }

  return matches
}

/**
 * Replace content in Elementor pages
 */
export async function replaceInElementor(
  siteUrl: string,
  apiKey: string,
  pageId: number,
  matches: ElementorContentMatch[],
  oldValue: string,
  newValue: string
): Promise<number> {
  try {
    // Get current Elementor data
    const metaResponse = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}?_fields=meta`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (metaResponse.status !== 200 || !metaResponse.data.meta?._elementor_data) {
      return 0
    }

    let elementorDataStr = metaResponse.data.meta._elementor_data
    if (typeof elementorDataStr !== 'string') {
      elementorDataStr = JSON.stringify(elementorDataStr)
    }

    let elementorData = JSON.parse(elementorDataStr)

    // Apply replacements
    let count = 0
    for (const match of matches) {
      elementorData = replaceInElementorData(
        elementorData,
        match.fieldPath,
        oldValue,
        newValue
      )
      count++
    }

    // Validate JSON
    try {
      JSON.stringify(elementorData)
    } catch {
      throw new Error('JSON validation failed after replacement')
    }

    // Update page meta
    await axios.post(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}`,
      { meta: { _elementor_data: JSON.stringify(elementorData) } },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    )

    // Clear Elementor cache
    try {
      await axios.post(
        `${siteUrl}/wp-json/ignyous/v1/clear-cache`,
        { type: 'elementor' },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )
    } catch {
      // Non-fatal
    }

    return count
  } catch (error) {
    console.error(`Error replacing content in page ${pageId}:`, error)
    return 0
  }
}

/**
 * Navigate Elementor JSON and replace value
 */
function replaceInElementorData(
  data: any,
  path: string[],
  oldValue: string,
  newValue: string
): any {
  // Make a copy to avoid mutation issues
  const copy = JSON.parse(JSON.stringify(data))

  let current = copy

  // Navigate to the target using the path
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]

    if (key === 'elements' && !isNaN(Number(path[i + 1]))) {
      // Next item is an array index
      const idx = parseInt(path[i + 1], 10)
      current = current.elements[idx]
      i++ // Skip the next item since we've used it as an index
    } else {
      current = current[key]

      if (!current) {
        throw new Error(`Path not found: ${path.join('.')}`)
      }
    }
  }

  // Apply the replacement to the final key
  const lastKey = path[path.length - 1]
  if (typeof current[lastKey] === 'string') {
    current[lastKey] = current[lastKey].replace(new RegExp(oldValue, 'g'), newValue)
  } else {
    throw new Error(`Target value is not a string at ${path.join('.')}`)
  }

  return copy
}

/**
 * Scan all Elementor pages on a site
 */
export async function scanAllElementorContent(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<ElementorContentMatch[]> {
  const allMatches: ElementorContentMatch[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    // Get all pages
    const allItems: any[] = []

    // Fetch pages
    let pageNumber = 1
    let hasMorePages = true

    while (hasMorePages) {
      const response = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/pages?per_page=100&page=${pageNumber}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        allItems.push(...response.data)
        pageNumber++
      } else {
        hasMorePages = false
      }
    }

    // Fetch posts
    pageNumber = 1
    hasMorePages = true

    while (hasMorePages) {
      const response = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/posts?per_page=100&page=${pageNumber}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        allItems.push(...response.data)
        pageNumber++
      } else {
        hasMorePages = false
      }
    }

    // Scan each item
    for (const item of allItems) {
      const matches = await scanElementorPage(cleanUrl, apiKey, item, searchTerm)
      allMatches.push(...matches)
    }
  } catch (error) {
    console.error('Error scanning all Elementor content:', error)
  }

  return allMatches
}
