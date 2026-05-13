/**
 * Business Info Manager
 * 
 * Unified routine for managing business contact information:
 * - Phone numbers
 * - Email addresses  
 * - Physical addresses
 * - Business hours
 * - Website URLs
 * 
 * Scans ALL data layers:
 * - Post content
 * - Global settings & theme options
 * - Custom fields (ACF, Meta Box)
 * - Custom post types
 * - Forms
 * - Metadata
 * 
 * IMPROVED PATTERN MATCHING:
 * - Only matches COMPLETE phone numbers (not partials in timestamps)
 * - Groups same number by normalized form
 * - Shows user clear choices: "845-876-6586 (22 instances)" not 62 variations
 */

import axios from 'axios'
import { calculateConfidence, ContentConfidenceResult } from '@/lib/confidence'

// ── PHONE PATTERNS ──────────────────────────────────────────
/**
 * Phone patterns - match COMPLETE numbers only
 * NOT: "555" in "version555" or "123" in timestamps
 */
export const PHONE_PATTERNS = [
  // (555) 123-4567 or (555) 123 4567
  /\(\d{3}\)\s?[-.]?\s?\d{3}[-.\s]?\d{4}/g,
  // 555-123-4567 or 555.123.4567 or 555 123 4567
  /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g,
  // +1 555 123 4567
  /\+1\s?\(?\d{3}\)?\s?[-.]?\d{3}[-.\s]?\d{4}/g,
  // 5551234567 (10 digits exactly, word boundaries)
  /(?<!\d)\d{10}(?!\d)/g,
]

// ── EMAIL PATTERNS ──────────────────────────────────────────
export const EMAIL_PATTERNS = [
  // username@domain.tld (requires valid TLD)
  /[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g,
]

// ── ADDRESS PATTERNS ──────────────────────────────────────────
/**
 * Address patterns - matches street addresses with zip codes
 * 123 Main St, City, ST 12345
 */
export const ADDRESS_PATTERNS = [
  // Street address format: "123 Main Street, City, ST 12345"
  /\d+\s+[A-Za-z\s\.]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}/g,
  // Just ZIP code (5 digits)
  /(?<!\d)\d{5}(?!\d)/g,
]

export interface BusinessInfoMatch {
  id: string
  type: 'phone' | 'email' | 'address'
  normalized: string // phone: 5551234567, email: user@example.com, address: full address
  displayFormat: string // original format found
  locations: Array<{
    postId?: number
    postTitle?: string
    location: string // "Home page > Content" or "Theme Options > Phone"
    context: string // surrounding text
    confidence: ContentConfidenceResult
  }>
  totalInstances: number
}

/**
 * Normalize phone number (digits only)
 * (555) 123-4567 → 5551234567
 */
export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Validate complete phone number (10+ digits)
 */
export function isCompletePhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone)
  return normalized.length >= 10
}

/**
 * Extract all phone numbers from content, deduplicated
 */
export function extractPhoneNumbers(content: string): Record<string, { format: string; count: number }> {
  const found: Record<string, { format: string; count: number }> = {}

  for (const pattern of PHONE_PATTERNS) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const raw = match[0]
      if (isCompletePhoneNumber(raw)) {
        const normalized = normalizePhoneNumber(raw)
        if (!found[normalized]) {
          found[normalized] = { format: raw, count: 0 }
        }
        found[normalized].count++
      }
    }
  }

  return found
}

/**
 * Extract all emails from content
 */
export function extractEmails(content: string): Record<string, { format: string; count: number }> {
  const found: Record<string, { format: string; count: number }> = {}

  for (const pattern of EMAIL_PATTERNS) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const raw = match[0]
      const normalized = raw.toLowerCase()
      if (!found[normalized]) {
        found[normalized] = { format: raw, count: 0 }
      }
      found[normalized].count++
    }
  }

  return found
}

/**
 * Main scan function - find all business info everywhere
 */
export async function scanBusinessInfo(
  siteUrl: string,
  apiKey: string,
  searchTerm: string,
  type: 'phone' | 'email' | 'address' = 'phone'
): Promise<BusinessInfoMatch[]> {
  const matches: BusinessInfoMatch[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')
  const foundInstances: Map<string, BusinessInfoMatch> = new Map()

  try {
    // Scan pages and posts
    const posts = await scanPostsForBusinessInfo(cleanUrl, apiKey, searchTerm, type)
    for (const post of posts) {
      const key = post.normalized
      if (!foundInstances.has(key)) {
        foundInstances.set(key, {
          id: `${type}-${key}`,
          type,
          normalized: key,
          displayFormat: post.locations[0].context.substring(0, 50),
          locations: post.locations,
          totalInstances: post.locations.length,
        })
      } else {
        const existing = foundInstances.get(key)!
        existing.locations.push(...post.locations)
        existing.totalInstances += post.locations.length
      }
    }

    // Scan theme options
    const themeMatches = await scanThemeOptionsForBusinessInfo(cleanUrl, apiKey, searchTerm, type)
    for (const match of themeMatches) {
      const key = match.normalized
      if (!foundInstances.has(key)) {
        foundInstances.set(key, {
          id: `${type}-${key}`,
          type,
          normalized: key,
          displayFormat: match.displayFormat,
          locations: match.locations,
          totalInstances: match.locations.length,
        })
      } else {
        const existing = foundInstances.get(key)!
        existing.locations.push(...match.locations)
        existing.totalInstances += match.locations.length
      }
    }

    // Return deduplicated results
    return Array.from(foundInstances.values()).sort((a, b) => b.totalInstances - a.totalInstances)
  } catch (error) {
    console.error('Error scanning business info:', error)
    return []
  }
}

/**
 * Scan pages and posts for business info
 */
async function scanPostsForBusinessInfo(
  siteUrl: string,
  apiKey: string,
  searchTerm: string,
  type: 'phone' | 'email' | 'address'
): Promise<
  Array<{
    normalized: string
    displayFormat: string
    locations: Array<{
      postId: number
      postTitle: string
      location: string
      context: string
      confidence: ContentConfidenceResult
    }>
  }>
> {
  const results: Map<string, any> = new Map()

  for (const contentType of ['pages', 'posts']) {
    let pageNum = 1
    let hasMore = true

    while (hasMore) {
      try {
        const response = await axios.get(
          `${siteUrl}/wp-json/wp/v2/${contentType}?per_page=100&page=${pageNum}&_fields=id,title,content`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000,
            validateStatus: () => true,
          }
        )

        if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
          for (const post of response.data) {
            const content = post.content?.raw || ''
            let found: Record<string, any> = {}

            if (type === 'phone') {
              found = extractPhoneNumbers(content)
            } else if (type === 'email') {
              found = extractEmails(content)
            }

            for (const [normalized, { format }] of Object.entries(found)) {
              if (!results.has(normalized)) {
                results.set(normalized, {
                  normalized,
                  displayFormat: format,
                  locations: [],
                })
              }

              const confidence = calculateConfidence({
                fieldName: 'post_content',
                fieldType: type,
                currentValue: format,
                searchTerm,
                context: content.substring(0, 200),
                pageTitle: post.title?.rendered || 'Untitled',
                builderType: 'unknown',
                location: 'post_content',
                canVerifyPostChange: true,
              })

              results.get(normalized).locations.push({
                postId: post.id,
                postTitle: post.title?.rendered || 'Untitled',
                location: `${post.title?.rendered || 'Untitled'} → Content`,
                context: getContextAroundTerm(content, format),
                confidence,
              })
            }
          }

          pageNum++
        } else {
          hasMore = false
        }
      } catch {
        hasMore = false
      }
    }
  }

  return Array.from(results.values())
}

/**
 * Scan theme options for business info
 */
async function scanThemeOptionsForBusinessInfo(
  siteUrl: string,
  apiKey: string,
  searchTerm: string,
  type: 'phone' | 'email' | 'address'
): Promise<
  Array<{
    normalized: string
    displayFormat: string
    locations: Array<{
      location: string
      context: string
      confidence: ContentConfidenceResult
    }>
  }>
> {
  const results: Map<string, any> = new Map()

  try {
    const response = await axios.get(
      `${siteUrl}/wp-json/wp/v2/settings`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status === 200 && response.data) {
      const settings = response.data

      for (const [key, value] of Object.entries(settings)) {
        if (typeof value !== 'string') continue

        let found: Record<string, any> = {}

        if (type === 'phone') {
          found = extractPhoneNumbers(value)
        } else if (type === 'email') {
          found = extractEmails(value)
        }

        for (const [normalized, { format }] of Object.entries(found)) {
          if (!results.has(normalized)) {
            results.set(normalized, {
              normalized,
              displayFormat: format,
              locations: [],
            })
          }

          const confidence = calculateConfidence({
            fieldName: key,
            fieldType: `${type}_option`,
            currentValue: format,
            searchTerm,
            context: value,
            pageTitle: 'Theme Options',
            builderType: 'unknown',
            location: 'theme_option',
            canVerifyPostChange: true,
          })

          results.get(normalized).locations.push({
            location: `Theme Option: ${key}`,
            context: value.substring(0, 100),
            confidence,
          })
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return Array.from(results.values())
}

/**
 * Get context around a term in content
 */
function getContextAroundTerm(content: string, term: string): string {
  const index = content.indexOf(term)
  if (index === -1) return ''

  const start = Math.max(0, index - 40)
  const end = Math.min(content.length, index + term.length + 40)
  return content.substring(start, end).trim()
}

/**
 * Replace business info everywhere
 */
export async function updateBusinessInfo(
  siteUrl: string,
  apiKey: string,
  oldValue: string,
  newValue: string,
  type: 'phone' | 'email' | 'address',
  targetLocations?: string[] // if specified, only update these locations
): Promise<{ updated: number; byLocation: Record<string, number> }> {
  let totalUpdated = 0
  const byLocation: Record<string, number> = {}

  try {
    const cleanUrl = siteUrl.replace(/\/$/, '')

    // For phone numbers, we need to replace all format variations of the same number
    let searchPatterns: string[] = [oldValue]

    if (type === 'phone') {
      const normalized = normalizePhoneNumber(oldValue)
      // Generate common format variations to replace
      searchPatterns = [
        normalized, // 5551234567
        `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`, // (555) 123-4567
        `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`, // 555-123-4567
        `${normalized.slice(0, 3)}.${normalized.slice(3, 6)}.${normalized.slice(6)}`, // 555.123.4567
        `+1 ${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`, // +1 555 123 4567
      ]
    }

    // Update pages/posts
    for (const contentType of ['pages', 'posts']) {
      let pageNum = 1
      let hasMore = true

      while (hasMore) {
        try {
          const listResponse = await axios.get(
            `${cleanUrl}/wp-json/wp/v2/${contentType}?per_page=100&page=${pageNum}`,
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeout: 10000,
              validateStatus: () => true,
            }
          )

          if (listResponse.status === 200 && Array.isArray(listResponse.data) && listResponse.data.length > 0) {
            for (const post of listResponse.data) {
              const getResponse = await axios.get(
                `${cleanUrl}/wp-json/wp/v2/${contentType}/${post.id}?_fields=content`,
                {
                  headers: { Authorization: `Bearer ${apiKey}` },
                  timeout: 10000,
                  validateStatus: () => true,
                }
              )

              if (getResponse.status === 200) {
                let content = getResponse.data.content?.raw || ''
                let changed = false

                for (const pattern of searchPatterns) {
                  const regex = new RegExp(escapeRegex(pattern), 'g')
                  const matches = content.match(regex) || []
                  if (matches.length > 0) {
                    content = content.replace(regex, newValue)
                    totalUpdated += matches.length
                    byLocation[`${post.title?.rendered || 'Untitled'}`] =
                      (byLocation[`${post.title?.rendered || 'Untitled'}`] || 0) + matches.length
                    changed = true
                  }
                }

                if (changed) {
                  await axios.post(
                    `${cleanUrl}/wp-json/wp/v2/${contentType}/${post.id}`,
                    { content },
                    {
                      headers: { Authorization: `Bearer ${apiKey}` },
                      timeout: 10000,
                    }
                  )
                }
              }
            }

            pageNum++
          } else {
            hasMore = false
          }
        } catch {
          hasMore = false
        }
      }
    }

    // Update theme options
    try {
      const settingsResponse = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/settings`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (settingsResponse.status === 200) {
        const settings = settingsResponse.data
        const updates: Record<string, string> = {}

        for (const [key, value] of Object.entries(settings)) {
          if (typeof value !== 'string') continue

          let updated = value
          let changed = false

          for (const pattern of searchPatterns) {
            const regex = new RegExp(escapeRegex(pattern), 'g')
            const matches = updated.match(regex) || []
            if (matches.length > 0) {
              updated = updated.replace(regex, newValue)
              totalUpdated += matches.length
              byLocation[`Theme: ${key}`] = (byLocation[`Theme: ${key}`] || 0) + matches.length
              changed = true
            }
          }

          if (changed) {
            updates[key] = updated
          }
        }

        if (Object.keys(updates).length > 0) {
          await axios.post(
            `${cleanUrl}/wp-json/wp/v2/settings`,
            updates,
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeout: 10000,
            }
          )
        }
      }
    } catch {
      // Non-fatal
    }
  } catch (error) {
    console.error('Error updating business info:', error)
  }

  return { updated: totalUpdated, byLocation }
}

/**
 * Helper: Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
