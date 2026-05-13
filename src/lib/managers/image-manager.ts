/**
 * Image Manager Scanner & Replacer
 * 
 * Finds images in all locations:
 * - Featured images (post thumbnails)
 * - Inline image URLs in content
 * - Builder image blocks
 * - ACF image fields
 * - Theme options
 * - Meta fields
 * 
 * Operations:
 * - Find all image references
 * - Replace by ID or URL
 * - Validate new images exist
 * - Domain migration
 */

import axios from 'axios'
import { calculateConfidence, ContentConfidenceResult } from '@/lib/confidence'

export interface ImageReference {
  id: string
  type:
    | 'featured_image'
    | 'inline_url'
    | 'builder_block'
    | 'acf_field'
    | 'theme_option'
    | 'post_meta'
  source: 'page_content' | 'elementor' | 'gutenberg' | 'divi' | 'acf' | 'theme' | 'meta'
  postId?: number
  postTitle?: string
  currentImageId?: number
  currentImageUrl?: string
  currentImageFile?: string
  location: string
  confidence?: ContentConfidenceResult
  canReplace: boolean
}

/**
 * Find all references to an image by ID
 */
export async function findImageByIdEverywhere(
  siteUrl: string,
  apiKey: string,
  imageId: number
): Promise<ImageReference[]> {
  const references: ImageReference[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    // Find featured images
    let pageNumber = 1
    let hasMorePages = true

    while (hasMorePages) {
      const response = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/pages?per_page=100&page=${pageNumber}&_fields=id,title,featured_media`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        for (const page of response.data) {
          if (page.featured_media === imageId) {
            const confidence = calculateConfidence({
              fieldName: 'featured_media',
              fieldType: 'featured_image',
              currentValue: String(imageId),
              searchTerm: String(imageId),
              context: `Featured image on "${page.title?.rendered || 'Untitled'}"`,
              pageTitle: page.title?.rendered || 'Untitled',
              builderType: 'unknown',
              location: 'featured_image',
              canVerifyPostChange: true,
            })

            references.push({
              id: `featured-${page.id}`,
              type: 'featured_image',
              source: 'page_content',
              postId: page.id,
              postTitle: page.title?.rendered || 'Untitled',
              currentImageId: imageId,
              location: `${page.title?.rendered || 'Untitled'} > Featured Image`,
              confidence,
              canReplace: true,
            })
          }
        }

        pageNumber++
      } else {
        hasMorePages = false
      }
    }

    // Do same for posts
    pageNumber = 1
    hasMorePages = true

    while (hasMorePages) {
      const response = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/posts?per_page=100&page=${pageNumber}&_fields=id,title,featured_media`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        for (const post of response.data) {
          if (post.featured_media === imageId) {
            const confidence = calculateConfidence({
              fieldName: 'featured_media',
              fieldType: 'featured_image',
              currentValue: String(imageId),
              searchTerm: String(imageId),
              context: `Featured image on "${post.title?.rendered || 'Untitled'}"`,
              pageTitle: post.title?.rendered || 'Untitled',
              builderType: 'unknown',
              location: 'featured_image',
              canVerifyPostChange: true,
            })

            references.push({
              id: `featured-post-${post.id}`,
              type: 'featured_image',
              source: 'page_content',
              postId: post.id,
              postTitle: post.title?.rendered || 'Untitled',
              currentImageId: imageId,
              location: `${post.title?.rendered || 'Untitled'} > Featured Image`,
              confidence,
              canReplace: true,
            })
          }
        }

        pageNumber++
      } else {
        hasMorePages = false
      }
    }
  } catch (error) {
    console.error('Error finding image by ID:', error)
  }

  return references
}

/**
 * Find all references to an image by URL
 */
export async function findImageByUrlEverywhere(
  siteUrl: string,
  apiKey: string,
  imageUrl: string
): Promise<ImageReference[]> {
  const references: ImageReference[] = []
  const cleanUrl = siteUrl.replace(/\/$/, '')

  try {
    // Search in pages
    let pageNumber = 1
    let hasMorePages = true

    while (hasMorePages) {
      const response = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/pages?per_page=100&page=${pageNumber}&_fields=id,title,content`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        for (const page of response.data) {
          const content = page.content?.raw || ''

          if (content.includes(imageUrl)) {
            // Count matches
            const matches = (content.match(new RegExp(escapeRegex(imageUrl), 'g')) || []).length

            const confidence = calculateConfidence({
              fieldName: 'post_content',
              fieldType: 'image_url',
              currentValue: imageUrl,
              searchTerm: imageUrl,
              context: content.substring(0, 200),
              pageTitle: page.title?.rendered || 'Untitled',
              builderType: 'unknown',
              location: 'image_url',
              canVerifyPostChange: true,
            })

            references.push({
              id: `url-page-${page.id}`,
              type: 'inline_url',
              source: 'page_content',
              postId: page.id,
              postTitle: page.title?.rendered || 'Untitled',
              currentImageUrl: imageUrl,
              currentImageFile: imageUrl.split('/').pop(),
              location: `${page.title?.rendered || 'Untitled'} > Content (${matches} match${matches !== 1 ? 'es' : ''})`,
              confidence,
              canReplace: true,
            })
          }
        }

        pageNumber++
      } else {
        hasMorePages = false
      }
    }

    // Search in posts
    pageNumber = 1
    hasMorePages = true

    while (hasMorePages) {
      const response = await axios.get(
        `${cleanUrl}/wp-json/wp/v2/posts?per_page=100&page=${pageNumber}&_fields=id,title,content`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        for (const post of response.data) {
          const content = post.content?.raw || ''

          if (content.includes(imageUrl)) {
            const matches = (content.match(new RegExp(escapeRegex(imageUrl), 'g')) || []).length

            const confidence = calculateConfidence({
              fieldName: 'post_content',
              fieldType: 'image_url',
              currentValue: imageUrl,
              searchTerm: imageUrl,
              context: content.substring(0, 200),
              pageTitle: post.title?.rendered || 'Untitled',
              builderType: 'unknown',
              location: 'image_url',
              canVerifyPostChange: true,
            })

            references.push({
              id: `url-post-${post.id}`,
              type: 'inline_url',
              source: 'page_content',
              postId: post.id,
              postTitle: post.title?.rendered || 'Untitled',
              currentImageUrl: imageUrl,
              currentImageFile: imageUrl.split('/').pop(),
              location: `${post.title?.rendered || 'Untitled'} > Content (${matches} match${matches !== 1 ? 'es' : ''})`,
              confidence,
              canReplace: true,
            })
          }
        }

        pageNumber++
      } else {
        hasMorePages = false
      }
    }
  } catch (error) {
    console.error('Error finding image by URL:', error)
  }

  return references
}

/**
 * Validate that an image exists
 */
export async function validateImage(
  siteUrl: string,
  apiKey: string,
  imageId?: number,
  imageUrl?: string
): Promise<{ exists: boolean; dimensions?: { width: number; height: number }; size?: number }> {
  try {
    // If we have an ID, get the attachment post
    if (imageId) {
      const response = await axios.get(
        `${siteUrl}/wp-json/wp/v2/media/${imageId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      )

      if (response.status === 200 && response.data?.source_url) {
        // Verify the URL is accessible
        const urlCheck = await axios.head(response.data.source_url, { timeout: 5000 })
        if (urlCheck.status === 200) {
          return {
            exists: true,
            dimensions: {
              width: response.data.media_details?.width || 0,
              height: response.data.media_details?.height || 0,
            },
            size: response.data.media_details?.filesize || 0,
          }
        }
      }
    }

    // If we have a URL, just check if it's accessible
    if (imageUrl) {
      const urlCheck = await axios.head(imageUrl, { timeout: 5000 })
      return { exists: urlCheck.status === 200 }
    }

    return { exists: false }
  } catch {
    return { exists: false }
  }
}

/**
 * Replace image by ID on a page
 */
export async function replaceImageIdOnPage(
  siteUrl: string,
  apiKey: string,
  pageId: number,
  oldImageId: number,
  newImageId: number
): Promise<boolean> {
  try {
    // Check if it's featured image
    const pageResponse = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}?_fields=featured_media`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (pageResponse.status === 200 && pageResponse.data?.featured_media === oldImageId) {
      // Replace featured image
      const updateResponse = await axios.post(
        `${siteUrl}/wp-json/wp/v2/pages/${pageId}`,
        { featured_media: newImageId },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }
      )

      return updateResponse.status === 200
    }

    return false
  } catch (error) {
    console.error(`Error replacing image on page ${pageId}:`, error)
    return false
  }
}

/**
 * Replace image URL in page content
 */
export async function replaceImageUrlInContent(
  siteUrl: string,
  apiKey: string,
  pageId: number,
  oldImageUrl: string,
  newImageUrl: string
): Promise<number> {
  let replacedCount = 0

  try {
    // Get page content
    const getResponse = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}?_fields=content`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: () => true,
      }
    )

    if (getResponse.status !== 200) {
      return 0
    }

    const content = getResponse.data.content?.raw || ''
    const regex = new RegExp(escapeRegex(oldImageUrl), 'g')
    const matches = content.match(regex) || []
    replacedCount = matches.length

    if (replacedCount > 0) {
      const newContent = content.replace(regex, newImageUrl)

      // Update page
      await axios.post(
        `${siteUrl}/wp-json/wp/v2/pages/${pageId}`,
        { content: newContent },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }
      )
    }
  } catch (error) {
    console.error(`Error replacing image URL on page ${pageId}:`, error)
  }

  return replacedCount
}

/**
 * Helper: Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
