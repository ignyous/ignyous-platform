/**
 * Gutenberg Content Scanner
 * 
 * Scans and replaces content in Gutenberg-built pages
 * Gutenberg stores blocks as HTML comments with block markup:
 * <!-- wp:paragraph {"key":"value"} -->
 * Block content here
 * <!-- /wp:paragraph -->
 * 
 * Includes confidence scoring for each match
 */

import axios from 'axios'
import { calculateConfidence, ContentConfidenceResult } from '@/lib/confidence'

export interface GutenbergBlock {
  type: string // paragraph, heading, image, etc
  level?: number // For headings
  content?: string
  attributes?: Record<string, any>
  blockSource?: string // The full HTML comment block
}

export interface GutenbergContentMatch {
  id: string
  type: 'gutenberg'
  location: string
  pageTitle: string
  pageId: number
  current: string
  proposed: string
  blockType: string
  blockLevel?: number
  fieldName: string
  blockIndex: number // Position in blocks array
  confidence?: ContentConfidenceResult
}

/**
 * Parse Gutenberg blocks from post content
 * Handles HTML comment format: <!-- wp:blocktype {...attrs} -->
 */
function parseGutenbergBlocks(content: string): GutenbergBlock[] {
  const blocks: GutenbergBlock[] = []

  // Regex to match block opening tags: <!-- wp:blocktype {...} -->
  const blockRegex = /<!--\s*wp:(\S+)(?:\s+({[^}]*}))?(?:\s*)-->/g
  let match

  while ((match = blockRegex.exec(content)) !== null) {
    const blockType = match[1]
    const attributesStr = match[2] || '{}'

    let attributes: Record<string, any> = {}
    try {
      attributes = JSON.parse(attributesStr)
    } catch {
      // If JSON parsing fails, just use empty attributes
    }

    blocks.push({
      type: blockType,
      attributes,
      blockSource: match[0],
    })
  }

  return blocks
}

/**
 * Extract text content from Gutenberg HTML
 * Removes block markup but preserves the text we want to search
 */
function extractTextContent(html: string): string {
  // Remove HTML tags but keep text
  return html
    .replace(/<!--[^]*?-->/g, '') // Remove HTML comments
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .trim()
}

/**
 * Find text matches in post content with their context
 */
function findMatchesInContent(
  content: string,
  searchTerm: string,
  pageTitle: string
): Array<{
  current: string
  context: string
  location: string
  blockType: string
  blockIndex: number
  blockLevel?: number
}> {
  const matches: Array<{
    current: string
    context: string
    location: string
    blockType: string
    blockIndex: number
    blockLevel?: number
  }> = []

  const blocks = parseGutenbergBlocks(content)

  // Search through content for matches
  const lines = content.split('\n')

  let blockIndex = 0
  let currentBlockType = 'text'
  let currentBlockLevel: number | undefined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if this line starts a new block
    const blockMatch = line.match(/<!--\s*wp:(\S+)(?:\s+({[^}]*}))?/)
    if (blockMatch) {
      currentBlockType = blockMatch[1]
      blockIndex++

      // Extract block level if it's a heading
      if (currentBlockType === 'heading' && blockMatch[2]) {
        try {
          const attrs = JSON.parse(blockMatch[2])
          currentBlockLevel = attrs.level || undefined
        } catch {
          // Ignore parse errors
        }
      }
      continue
    }

    // Skip comment lines
    if (line.trim().startsWith('<!--') || line.trim().startsWith('-->')) {
      continue
    }

    // Check if this line contains the search term
    if (line.includes(searchTerm)) {
      const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join(' ')
      const match = line.trim()

      matches.push({
        current: match,
        context,
        location: `${pageTitle} → ${currentBlockType}${currentBlockLevel ? ` (h${currentBlockLevel})` : ''}`,
        blockType: currentBlockType,
        blockIndex,
        blockLevel: currentBlockLevel,
      })
    }
  }

  return matches
}

/**
 * Scan a single Gutenberg page for content matches
 */
export async function scanGutenbergPage(
  siteUrl: string,
  apiKey: string,
  page: any,
  searchTerm: string
): Promise<GutenbergContentMatch[]> {
  const matches: GutenbergContentMatch[] = []

  try {
    // Get page content (post_content)
    const response = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${page.id}?_fields=content,title`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status !== 200 || !response.data.content?.raw) {
      return matches
    }

    const pageContent = response.data.content.raw || ''
    const pageTitle = page.title?.rendered || page.title || 'Untitled'

    // Find all matches in content
    const contentMatches = findMatchesInContent(pageContent, searchTerm, pageTitle)

    // Create match objects with confidence scoring
    for (let idx = 0; idx < contentMatches.length; idx++) {
      const m = contentMatches[idx]

      // Calculate confidence for this match
      const confidence = calculateConfidence({
        fieldName: m.blockType,
        fieldType: m.blockType,
        currentValue: m.current,
        searchTerm,
        context: m.context,
        pageTitle,
        builderType: 'gutenberg',
        elementType: m.blockType,
        isInFormField: m.blockType === 'form' || m.blockType === 'legacy-widget',
        canVerifyPostChange: true,
      })

      matches.push({
        id: `gutenberg-${page.id}-${m.blockIndex}-${idx}`,
        type: 'gutenberg',
        location: m.location,
        pageTitle,
        pageId: page.id,
        current: m.current,
        proposed: m.current.replace(new RegExp(searchTerm, 'g'), searchTerm),
        blockType: m.blockType,
        blockLevel: m.blockLevel,
        fieldName: m.blockType,
        blockIndex: m.blockIndex,
        confidence,
      })
    }
  } catch (error) {
    console.error(`Error scanning Gutenberg page ${page.id}:`, error)
  }

  return matches
}

/**
 * Replace content in Gutenberg post content
 */
export async function replaceInGutenberg(
  siteUrl: string,
  apiKey: string,
  pageId: number,
  oldValue: string,
  newValue: string
): Promise<number> {
  try {
    // Get current page content
    const response = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}?_fields=content`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status !== 200 || !response.data.content?.raw) {
      return 0
    }

    let content = response.data.content.raw || ''

    // Count occurrences before replacement
    const regex = new RegExp(escapeRegex(oldValue), 'g')
    const matches = content.match(regex)
    const count = matches ? matches.length : 0

    if (count === 0) {
      return 0
    }

    // Perform replacement
    content = content.replace(regex, newValue)

    // Validate that content is still valid (basic check)
    // Gutenberg content should still have the same number of <!-- wp: blocks
    const openingBlocks = (response.data.content.raw || '').match(/<!--\s*wp:\S+/g) || []
    const closingBlocks = (response.data.content.raw || '').match(/-->/g) || []

    if (openingBlocks.length !== closingBlocks.length) {
      console.warn('Block structure may be compromised after replacement')
    }

    // Update page content
    await axios.post(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}`,
      { content },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    )

    return count
  } catch (error) {
    console.error(`Error replacing content in Gutenberg page ${pageId}:`, error)
    return 0
  }
}

/**
 * Scan all Gutenberg pages on a site for content matches
 */
export async function scanAllGutenbergContent(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<GutenbergContentMatch[]> {
  const allMatches: GutenbergContentMatch[] = []
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
      const matches = await scanGutenbergPage(cleanUrl, apiKey, item, searchTerm)
      allMatches.push(...matches)
    }
  } catch (error) {
    console.error('Error scanning all Gutenberg content:', error)
  }

  return allMatches
}

/**
 * Helper: Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
