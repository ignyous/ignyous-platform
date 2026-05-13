/**
 * Divi Content Scanner
 * 
 * Scans and replaces content in Divi-built pages
 * Divi stores content in post_content (like standard WordPress)
 * but also uses custom post meta for Divi-specific settings
 * 
 * Includes confidence scoring for each match
 */

import axios from 'axios'
import { calculateConfidence, ContentConfidenceResult } from '@/lib/confidence'

export interface DiviContentMatch {
  id: string
  type: 'divi'
  location: string
  pageTitle: string
  pageId: number
  current: string
  proposed: string
  contentType: 'post_content' | 'post_meta' | 'divi_meta'
  metaKey?: string
  diviElement?: string
  confidence?: ContentConfidenceResult
}

/**
 * Scan a single Divi page for content matches
 * Divi content is stored in post_content + additional meta fields
 */
export async function scanDiviPage(
  siteUrl: string,
  apiKey: string,
  page: any,
  searchTerm: string
): Promise<DiviContentMatch[]> {
  const matches: DiviContentMatch[] = []

  try {
    // Get page content and meta
    const response = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${page.id}?_fields=content,title,meta`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status !== 200) {
      return matches
    }

    const pageContent = response.data.content?.raw || ''
    const pageTitle = page.title?.rendered || page.title || 'Untitled'
    const pageMeta = response.data.meta || {}

    // Scan post_content (main content)
    if (pageContent && pageContent.includes(searchTerm)) {
      const contentMatches = findMatches(pageContent, searchTerm, pageTitle)
      
      for (const match of contentMatches) {
        const confidence = calculateConfidence({
          fieldName: 'post_content',
          fieldType: 'content',
          currentValue: match.text,
          searchTerm,
          context: match.context,
          pageTitle,
          builderType: 'divi',
          elementType: 'content',
          isInFormField: false,
          canVerifyPostChange: true,
        })

        matches.push({
          id: `divi-${page.id}-content-${matches.length}`,
          type: 'divi',
          location: `${pageTitle} → Post Content`,
          pageTitle,
          pageId: page.id,
          current: match.text,
          proposed: match.text.replace(new RegExp(searchTerm, 'g'), searchTerm),
          contentType: 'post_content',
          confidence,
        })
      }
    }

    // Scan Divi-specific meta fields
    const diviMetaKeys = [
      '_et_pb_option_pages',
      '_et_pb_post_hide_nav',
      '_et_pb_template_type',
      '_et_pb_enable_scroll_animations',
      'et_pb_custom_css',
      'et_pb_gutter_width',
    ]

    for (const metaKey of diviMetaKeys) {
      if (pageMeta[metaKey]) {
        const metaValue = pageMeta[metaKey]
        if (typeof metaValue === 'string' && metaValue.includes(searchTerm)) {
          const confidence = calculateConfidence({
            fieldName: metaKey,
            fieldType: 'divi_meta',
            currentValue: metaValue,
            searchTerm,
            context: metaValue,
            pageTitle,
            builderType: 'divi',
            elementType: 'meta',
            isInFormField: false,
            canVerifyPostChange: true,
          })

          matches.push({
            id: `divi-${page.id}-meta-${metaKey}`,
            type: 'divi',
            location: `${pageTitle} → Divi Setting: ${metaKey}`,
            pageTitle,
            pageId: page.id,
            current: metaValue,
            proposed: metaValue.replace(new RegExp(searchTerm, 'g'), searchTerm),
            contentType: 'post_meta',
            metaKey,
            confidence,
          })
        }
      }
    }

    // Scan general post meta (custom fields)
    if (pageMeta && Object.keys(pageMeta).length > 0) {
      for (const [metaKey, metaValue] of Object.entries(pageMeta)) {
        // Skip Divi internal meta
        if (metaKey.startsWith('_et_pb_') || metaKey.startsWith('_')) {
          continue
        }

        if (typeof metaValue === 'string' && metaValue.includes(searchTerm)) {
          const confidence = calculateConfidence({
            fieldName: metaKey,
            fieldType: 'post_meta',
            currentValue: metaValue,
            searchTerm,
            context: metaValue,
            pageTitle,
            builderType: 'divi',
            elementType: 'custom_meta',
            isInFormField: metaKey.includes('form'),
            canVerifyPostChange: true,
          })

          matches.push({
            id: `divi-${page.id}-custommeta-${metaKey}`,
            type: 'divi',
            location: `${pageTitle} → Custom Field: ${metaKey}`,
            pageTitle,
            pageId: page.id,
            current: metaValue,
            proposed: metaValue.replace(new RegExp(searchTerm, 'g'), searchTerm),
            contentType: 'post_meta',
            metaKey,
            confidence,
          })
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning Divi page ${page.id}:`, error)
  }

  return matches
}

/**
 * Find text matches in content with context
 */
function findMatches(
  content: string,
  searchTerm: string,
  pageTitle: string
): Array<{ text: string; context: string }> {
  const matches: Array<{ text: string; context: string }> = []
  const regex = new RegExp(searchTerm, 'g')
  let match

  // Find all matches with context
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(searchTerm)) {
      const contextStart = Math.max(0, i - 1)
      const contextEnd = Math.min(lines.length, i + 2)
      const context = lines.slice(contextStart, contextEnd).join(' ')

      matches.push({
        text: line.trim(),
        context: context.substring(0, 200), // First 200 chars
      })
    }
  }

  return matches
}

/**
 * Replace content in Divi page
 */
export async function replaceInDivi(
  siteUrl: string,
  apiKey: string,
  pageId: number,
  oldValue: string,
  newValue: string
): Promise<number> {
  try {
    // Get current page data
    const response = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}?_fields=content,meta`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status !== 200) {
      return 0
    }

    let content = response.data.content?.raw || ''
    let count = 0
    const regex = new RegExp(escapeRegex(oldValue), 'g')

    // Count and replace in post content
    const contentMatches = content.match(regex) || []
    count += contentMatches.length

    if (contentMatches.length > 0) {
      content = content.replace(regex, newValue)
    }

    // Build update object
    const updateData: any = {}

    // Update post content if changed
    if (contentMatches.length > 0) {
      updateData.content = content
    }

    // Get meta and update if needed
    const meta = response.data.meta || {}
    const metaUpdates: Record<string, string> = {}

    for (const [metaKey, metaValue] of Object.entries(meta)) {
      if (typeof metaValue === 'string') {
        const metaMatches = metaValue.match(regex) || []
        if (metaMatches.length > 0) {
          metaUpdates[metaKey] = metaValue.replace(regex, newValue)
          count += metaMatches.length
        }
      }
    }

    if (Object.keys(metaUpdates).length > 0) {
      updateData.meta = metaUpdates
    }

    // Only update if there are changes
    if (Object.keys(updateData).length > 0) {
      await axios.post(
        `${siteUrl}/wp-json/wp/v2/pages/${pageId}`,
        updateData,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }
      )

      // Clear Divi cache
      try {
        await axios.post(
          `${siteUrl}/wp-json/ignyous/v1/clear-cache`,
          { type: 'divi' },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000,
            validateStatus: () => true,
          }
        )
      } catch {
        // Non-fatal if cache clear fails
      }
    }

    return count
  } catch (error) {
    console.error(`Error replacing content in Divi page ${pageId}:`, error)
    return 0
  }
}

/**
 * Scan all Divi pages on a site
 */
export async function scanAllDiviContent(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<DiviContentMatch[]> {
  const allMatches: DiviContentMatch[] = []
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
      const matches = await scanDiviPage(cleanUrl, apiKey, item, searchTerm)
      allMatches.push(...matches)
    }
  } catch (error) {
    console.error('Error scanning all Divi content:', error)
  }

  return allMatches
}

/**
 * Helper: Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
