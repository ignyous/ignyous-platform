/**
 * Custom Post Type Scanner
 * 
 * Scans content in custom post types like:
 * - Team members (team, staff, people)
 * - Portfolio (portfolio, project, work)
 * - Testimonials (testimonial, client_review, review)
 * - Services (service, offer, solution)
 * - Products (in WooCommerce)
 * 
 * Includes confidence scoring for CPT-specific data
 */

import axios from 'axios'
import { calculateConfidence, ContentConfidenceResult } from '@/lib/confidence'

export interface CustomPostTypeMatch {
  id: string
  type: 'custom_post_type'
  postType: string
  postId: number
  postTitle: string
  postUrl?: string
  location: string
  current: string
  proposed: string
  metaKey?: string
  fieldType: 'post_content' | 'post_title' | 'post_excerpt' | 'post_meta'
  confidence?: ContentConfidenceResult
}

/**
 * Get all custom post types on the site (excluding built-in types)
 */
export async function getCustomPostTypes(
  siteUrl: string,
  apiKey: string
): Promise<string[]> {
  const customTypes: string[] = []

  try {
    // Built-in types to skip
    const builtInTypes = ['post', 'page', 'attachment', 'wp_block', 'wp_template']

    // Get all post types from WP API
    const response = await axios.get(
      `${siteUrl}/wp-json/wp/v2/types`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status === 200 && response.data) {
      for (const [postType] of Object.entries(response.data)) {
        if (!builtInTypes.includes(postType)) {
          customTypes.push(postType)
        }
      }
    }
  } catch (error) {
    console.error('Error getting custom post types:', error)
  }

  return customTypes
}

/**
 * Scan a specific custom post type for matches
 */
export async function scanPostType(
  siteUrl: string,
  apiKey: string,
  postType: string,
  searchTerm: string
): Promise<CustomPostTypeMatch[]> {
  const matches: CustomPostTypeMatch[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    // Fetch posts of this type
    let pageNumber = 1
    let hasMorePages = true

    while (hasMorePages) {
      const response = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/${postType}?per_page=100&page=${pageNumber}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        // Scan each post
        for (const post of response.data) {
          const postMatches = await scanCustomPost(
            cleanUrl,
            apiKey,
            postType,
            post,
            searchTerm
          )
          matches.push(...postMatches)
        }

        pageNumber++
      } else {
        hasMorePages = false
      }
    }
  } catch (error) {
    console.error(`Error scanning post type ${postType}:`, error)
  }

  return matches
}

/**
 * Scan a single custom post for matches
 */
async function scanCustomPost(
  siteUrl: string,
  apiKey: string,
  postType: string,
  post: any,
  searchTerm: string
): Promise<CustomPostTypeMatch[]> {
  const matches: CustomPostTypeMatch[] = []
  const postId = post.id
  const postTitle = post.title?.rendered || post.title || 'Untitled'
  const postUrl = post.link

  try {
    // Get full post data with meta
    const response = await axios.get(
      `${siteUrl}/wp-json/wp/v2/${postType}/${postId}?_fields=content,title,excerpt,meta`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (response.status !== 200) {
      return matches
    }

    const postData = response.data

    // Scan post content
    if (postData.content?.raw && postData.content.raw.includes(searchTerm)) {
      const confidence = calculateConfidence({
        fieldName: 'post_content',
        fieldType: 'content',
        currentValue: postData.content.raw.substring(0, 100),
        searchTerm,
        context: postData.content.raw.substring(0, 200),
        pageTitle: postTitle,
        builderType: 'unknown',
        elementType: 'content',
        isInFormField: false,
        canVerifyPostChange: true,
      })

      matches.push({
        id: `cpt-${postType}-${postId}-content`,
        type: 'custom_post_type',
        postType,
        postId,
        postTitle,
        postUrl,
        location: `${postType} > ${postTitle} > Content`,
        current: postData.content.raw,
        proposed: postData.content.raw.replace(new RegExp(searchTerm, 'g'), searchTerm),
        fieldType: 'post_content',
        confidence,
      })
    }

    // Scan post title
    if (postData.title?.raw && postData.title.raw.includes(searchTerm)) {
      const confidence = calculateConfidence({
        fieldName: 'post_title',
        fieldType: 'title',
        currentValue: postData.title.raw,
        searchTerm,
        context: postData.title.raw,
        pageTitle: postTitle,
        builderType: 'unknown',
        elementType: 'title',
        isInFormField: false,
        canVerifyPostChange: true,
      })

      matches.push({
        id: `cpt-${postType}-${postId}-title`,
        type: 'custom_post_type',
        postType,
        postId,
        postTitle,
        postUrl,
        location: `${postType} > ${postTitle} > Title`,
        current: postData.title.raw,
        proposed: postData.title.raw.replace(new RegExp(searchTerm, 'g'), searchTerm),
        fieldType: 'post_title',
        confidence,
      })
    }

    // Scan post excerpt
    if (postData.excerpt?.raw && postData.excerpt.raw.includes(searchTerm)) {
      const confidence = calculateConfidence({
        fieldName: 'post_excerpt',
        fieldType: 'excerpt',
        currentValue: postData.excerpt.raw,
        searchTerm,
        context: postData.excerpt.raw,
        pageTitle: postTitle,
        builderType: 'unknown',
        elementType: 'excerpt',
        isInFormField: false,
        canVerifyPostChange: true,
      })

      matches.push({
        id: `cpt-${postType}-${postId}-excerpt`,
        type: 'custom_post_type',
        postType,
        postId,
        postTitle,
        postUrl,
        location: `${postType} > ${postTitle} > Excerpt`,
        current: postData.excerpt.raw,
        proposed: postData.excerpt.raw.replace(new RegExp(searchTerm, 'g'), searchTerm),
        fieldType: 'post_excerpt',
        confidence,
      })
    }

    // Scan post meta (custom fields)
    const meta = postData.meta || {}
    for (const [metaKey, metaValue] of Object.entries(meta)) {
      if (typeof metaValue === 'string' && metaValue.includes(searchTerm)) {
        // Skip internal meta keys
        if (metaKey.startsWith('_')) {
          continue
        }

        // Determine if this looks like a phone/email field
        const isPhoneField = metaKey.toLowerCase().includes('phone')
        const isEmailField = metaKey.toLowerCase().includes('email')

        const confidence = calculateConfidence({
          fieldName: metaKey,
          fieldType: 'post_meta',
          currentValue: metaValue,
          searchTerm,
          context: metaValue,
          pageTitle: postTitle,
          builderType: 'unknown',
          elementType: metaKey,
          isInFormField: isPhoneField || isEmailField,
          canVerifyPostChange: true,
        })

        matches.push({
          id: `cpt-${postType}-${postId}-meta-${metaKey}`,
          type: 'custom_post_type',
          postType,
          postId,
          postTitle,
          postUrl,
          location: `${postType} > ${postTitle} > ${metaKey}`,
          current: metaValue,
          proposed: metaValue.replace(new RegExp(searchTerm, 'g'), searchTerm),
          metaKey,
          fieldType: 'post_meta',
          confidence,
        })
      }
    }
  } catch (error) {
    console.error(`Error scanning CPT post ${postId}:`, error)
  }

  return matches
}

/**
 * Scan all custom post types on the site
 */
export async function scanAllCustomPostTypes(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<CustomPostTypeMatch[]> {
  const allMatches: CustomPostTypeMatch[] = []

  try {
    // Get all custom post types
    const postTypes = await getCustomPostTypes(siteUrl, apiKey)

    // Scan each post type
    for (const postType of postTypes) {
      const matches = await scanPostType(siteUrl, apiKey, postType, searchTerm)
      allMatches.push(...matches)
    }
  } catch (error) {
    console.error('Error scanning all custom post types:', error)
  }

  return allMatches
}

/**
 * Replace content in a custom post
 */
export async function updateCustomPost(
  siteUrl: string,
  apiKey: string,
  postType: string,
  postId: number,
  oldValue: string,
  newValue: string,
  fieldType: 'post_content' | 'post_title' | 'post_excerpt' | 'post_meta'
): Promise<number> {
  try {
    // Get current post data
    const getResponse = await axios.get(
      `${siteUrl}/wp-json/wp/v2/${postType}/${postId}?_fields=content,title,excerpt,meta`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (getResponse.status !== 200) {
      return 0
    }

    const postData = getResponse.data
    const regex = new RegExp(escapeRegex(oldValue), 'g')
    let count = 0
    const updateData: any = {}

    // Update based on field type
    if (fieldType === 'post_content' && postData.content?.raw) {
      const matches = (postData.content.raw.match(regex) || []).length
      if (matches > 0) {
        updateData.content = postData.content.raw.replace(regex, newValue)
        count = matches
      }
    }

    if (fieldType === 'post_title' && postData.title?.raw) {
      const matches = (postData.title.raw.match(regex) || []).length
      if (matches > 0) {
        updateData.title = postData.title.raw.replace(regex, newValue)
        count = matches
      }
    }

    if (fieldType === 'post_excerpt' && postData.excerpt?.raw) {
      const matches = (postData.excerpt.raw.match(regex) || []).length
      if (matches > 0) {
        updateData.excerpt = postData.excerpt.raw.replace(regex, newValue)
        count = matches
      }
    }

    // Update if there are changes
    if (Object.keys(updateData).length > 0) {
      await axios.post(
        `${siteUrl}/wp-json/wp/v2/${postType}/${postId}`,
        updateData,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }
      )
    }

    return count
  } catch (error) {
    console.error(
      `Error updating custom post ${postType}/${postId}:`,
      error
    )
    return 0
  }
}

/**
 * Helper: Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
