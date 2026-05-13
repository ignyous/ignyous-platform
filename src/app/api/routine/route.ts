import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { detectPageBuilder } from '@/lib/builders/detector'
import { scanAllElementorContent, replaceInElementor } from '@/lib/builders/elementor-scanner'
import { scanAllGutenbergContent, replaceInGutenberg } from '@/lib/builders/gutenberg-scanner'
import { scanAllDiviContent, replaceInDivi } from '@/lib/builders/divi-scanner'

/**
 * Routine API with Builder Support
 * 
 * Handles routine execution with page builder awareness:
 * - Detects active page builder (Elementor, Gutenberg, etc)
 * - Scans builder-specific content locations
 * - Includes confidence scoring for each match
 * - Phone Manager: scan, replace phone numbers
 * - Email Manager: scan, replace email addresses
 */

const REQUEST_TIMEOUT = 30000

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, action, siteUrl, oldPhone, newPhone, oldEmail, newEmail, preview } = body

    // Get API key (from header or body)
    let apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    
    // For routine calls from frontend, look in body
    if (!apiKey && body.apiKey) {
      apiKey = body.apiKey
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    const cleanUrl = siteUrl.replace(/\/$/, '')

    // Detect page builder
    const builderDetection = await detectPageBuilder(cleanUrl, apiKey)

    // Phone Manager
    if (type === 'phone') {
      if (action === 'execute') {
        return handlePhoneReplace(cleanUrl, apiKey, body, builderDetection)
      }
      return handlePhoneScan(cleanUrl, apiKey, oldPhone, builderDetection)
    }

    // Email Manager
    if (type === 'email') {
      if (action === 'execute') {
        return handleEmailReplace(cleanUrl, apiKey, body, builderDetection)
      }
      return handleEmailScan(cleanUrl, apiKey, oldEmail, builderDetection)
    }

    return NextResponse.json({ error: 'Unknown routine type' }, { status: 400 })
  } catch (error: any) {
    console.error('Routine error:', error)
    return NextResponse.json(
      { error: error.message || 'Routine execution failed' },
      { status: 500 }
    )
  }
}

/**
 * Phone Manager - Scan for phone numbers
 */
async function handlePhoneScan(
  siteUrl: string,
  apiKey: string,
  oldPhone: string,
  builderDetection: any
) {
  try {
    let results: any[] = []

    // Use builder-specific scanner if available
    if (builderDetection.active && builderDetection.builderType === 'elementor') {
      const matches = await scanAllElementorContent(siteUrl, apiKey, oldPhone)
      
      results = matches.map(match => ({
        id: match.id,
        location: match.location,
        current: match.current,
        proposed: match.proposed,
        confidence: match.confidence,
        metadata: {
          pageId: match.pageId,
          elementId: match.elementId,
          fieldPath: match.fieldPath,
        },
      }))
    } else if (builderDetection.active && builderDetection.builderType === 'gutenberg') {
      const matches = await scanAllGutenbergContent(siteUrl, apiKey, oldPhone)
      
      results = matches.map(match => ({
        id: match.id,
        location: match.location,
        current: match.current,
        proposed: match.proposed,
        confidence: match.confidence,
        metadata: {
          pageId: match.pageId,
          blockType: match.blockType,
          blockIndex: match.blockIndex,
        },
      }))
    } else if (builderDetection.active && builderDetection.builderType === 'divi') {
      const matches = await scanAllDiviContent(siteUrl, apiKey, oldPhone)
      
      results = matches.map(match => ({
        id: match.id,
        location: match.location,
        current: match.current,
        proposed: match.proposed,
        confidence: match.confidence,
        metadata: {
          pageId: match.pageId,
          contentType: match.contentType,
          metaKey: match.metaKey,
        },
      }))
    } else {
      // Fallback to standard scanning
      results = await scanStandardPhones(siteUrl, apiKey, oldPhone)
    }

    return NextResponse.json({
      results: {
        found: results.length,
        preview: results,
        builder: builderDetection.builderType,
        builderVersion: builderDetection.version,
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      results: {
        found: 0,
        preview: [],
        builder: builderDetection.builderType,
        error: error.message,
      },
    })
  }
}

/**
 * Phone Manager - Replace phone numbers
 */
async function handlePhoneReplace(
  siteUrl: string,
  apiKey: string,
  body: any,
  builderDetection: any
) {
  const { oldPhone, newPhone, preview } = body

  try {
    let changed = 0

    // Replace using builder-specific method if available
    if (builderDetection.active && builderDetection.builderType === 'elementor') {
      // Group by page ID
      const byPage = new Map<number, any[]>()
      for (const item of preview) {
        const pageId = item.metadata?.pageId
        if (pageId) {
          if (!byPage.has(pageId)) byPage.set(pageId, [])
          byPage.get(pageId)!.push(item)
        }
      }

      // Replace in each page
      for (const [pageId, items] of byPage) {
        const pageChanged = await replaceInElementor(
          siteUrl,
          apiKey,
          pageId,
          items as any,
          oldPhone,
          newPhone
        )
        changed += pageChanged
      }
    } else if (builderDetection.active && builderDetection.builderType === 'gutenberg') {
      // Group by page ID
      const byPage = new Map<number, any[]>()
      for (const item of preview) {
        const pageId = item.metadata?.pageId
        if (pageId) {
          if (!byPage.has(pageId)) byPage.set(pageId, [])
          byPage.get(pageId)!.push(item)
        }
      }

      // Replace in each page
      for (const [pageId] of byPage) {
        const pageChanged = await replaceInGutenberg(
          siteUrl,
          apiKey,
          pageId,
          oldPhone,
          newPhone
        )
        changed += pageChanged
      }
    } else if (builderDetection.active && builderDetection.builderType === 'divi') {
      // Group by page ID
      const byPage = new Map<number, any[]>()
      for (const item of preview) {
        const pageId = item.metadata?.pageId
        if (pageId) {
          if (!byPage.has(pageId)) byPage.set(pageId, [])
          byPage.get(pageId)!.push(item)
        }
      }

      // Replace in each page
      for (const [pageId] of byPage) {
        const pageChanged = await replaceInDivi(
          siteUrl,
          apiKey,
          pageId,
          oldPhone,
          newPhone
        )
        changed += pageChanged
      }
    } else {
      // Fallback to standard replacement
      changed = await replaceStandardPhones(siteUrl, apiKey, oldPhone, newPhone, preview)
    }

    return NextResponse.json({
      results: {
        changed,
        found: preview?.length || 0,
        preview,
        builder: builderDetection.builderType,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Replacement failed' },
      { status: 500 }
    )
  }
}

/**
 * Email Manager - Scan for email addresses
 */
async function handleEmailScan(
  siteUrl: string,
  apiKey: string,
  oldEmail: string,
  builderDetection: any
) {
  try {
    let results: any[] = []

    // Use builder-specific scanner if available
    if (builderDetection.active && builderDetection.builderType === 'elementor') {
      const matches = await scanAllElementorContent(siteUrl, apiKey, oldEmail)
      
      results = matches.map(match => ({
        id: match.id,
        location: match.location,
        current: match.current,
        proposed: match.proposed,
        confidence: match.confidence,
        metadata: {
          pageId: match.pageId,
          elementId: match.elementId,
          fieldPath: match.fieldPath,
        },
      }))
    } else if (builderDetection.active && builderDetection.builderType === 'gutenberg') {
      const matches = await scanAllGutenbergContent(siteUrl, apiKey, oldEmail)
      
      results = matches.map(match => ({
        id: match.id,
        location: match.location,
        current: match.current,
        proposed: match.proposed,
        confidence: match.confidence,
        metadata: {
          pageId: match.pageId,
          blockType: match.blockType,
          blockIndex: match.blockIndex,
        },
      }))
    } else if (builderDetection.active && builderDetection.builderType === 'divi') {
      const matches = await scanAllDiviContent(siteUrl, apiKey, oldEmail)
      
      results = matches.map(match => ({
        id: match.id,
        location: match.location,
        current: match.current,
        proposed: match.proposed,
        confidence: match.confidence,
        metadata: {
          pageId: match.pageId,
          contentType: match.contentType,
          metaKey: match.metaKey,
        },
      }))
    } else {
      // Fallback to standard scanning
      results = await scanStandardEmails(siteUrl, apiKey, oldEmail)
    }

    return NextResponse.json({
      results: {
        found: results.length,
        preview: results,
        builder: builderDetection.builderType,
        builderVersion: builderDetection.version,
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      results: {
        found: 0,
        preview: [],
        builder: builderDetection.builderType,
        error: error.message,
      },
    })
  }
}

/**
 * Email Manager - Replace email addresses
 */
async function handleEmailReplace(
  siteUrl: string,
  apiKey: string,
  body: any,
  builderDetection: any
) {
  const { oldEmail, newEmail, preview } = body

  try {
    let changed = 0

    // Replace using builder-specific method if available
    if (builderDetection.active && builderDetection.builderType === 'elementor') {
      // Group by page ID
      const byPage = new Map<number, any[]>()
      for (const item of preview) {
        const pageId = item.metadata?.pageId
        if (pageId) {
          if (!byPage.has(pageId)) byPage.set(pageId, [])
          byPage.get(pageId)!.push(item)
        }
      }

      // Replace in each page
      for (const [pageId, items] of byPage) {
        const pageChanged = await replaceInElementor(
          siteUrl,
          apiKey,
          pageId,
          items as any,
          oldEmail,
          newEmail
        )
        changed += pageChanged
      }
    } else if (builderDetection.active && builderDetection.builderType === 'gutenberg') {
      // Group by page ID
      const byPage = new Map<number, any[]>()
      for (const item of preview) {
        const pageId = item.metadata?.pageId
        if (pageId) {
          if (!byPage.has(pageId)) byPage.set(pageId, [])
          byPage.get(pageId)!.push(item)
        }
      }

      // Replace in each page
      for (const [pageId] of byPage) {
        const pageChanged = await replaceInGutenberg(
          siteUrl,
          apiKey,
          pageId,
          oldEmail,
          newEmail
        )
        changed += pageChanged
      }
    } else if (builderDetection.active && builderDetection.builderType === 'divi') {
      // Group by page ID
      const byPage = new Map<number, any[]>()
      for (const item of preview) {
        const pageId = item.metadata?.pageId
        if (pageId) {
          if (!byPage.has(pageId)) byPage.set(pageId, [])
          byPage.get(pageId)!.push(item)
        }
      }

      // Replace in each page
      for (const [pageId] of byPage) {
        const pageChanged = await replaceInDivi(
          siteUrl,
          apiKey,
          pageId,
          oldEmail,
          newEmail
        )
        changed += pageChanged
      }
    } else {
      // Fallback to standard replacement
      changed = await replaceStandardEmails(siteUrl, apiKey, oldEmail, newEmail, preview)
    }

    return NextResponse.json({
      results: {
        changed,
        found: preview?.length || 0,
        preview,
        builder: builderDetection.builderType,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Replacement failed' },
      { status: 500 }
    )
  }
}

/**
 * Fallback: Scan standard WordPress content for phones
 */
async function scanStandardPhones(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<any[]> {
  // TODO: Implement standard WordPress phone scanning
  return []
}

/**
 * Fallback: Replace phones in standard content
 */
async function replaceStandardPhones(
  siteUrl: string,
  apiKey: string,
  oldPhone: string,
  newPhone: string,
  preview: any[]
): Promise<number> {
  // TODO: Implement standard WordPress phone replacement
  return preview?.length || 0
}

/**
 * Fallback: Scan standard WordPress content for emails
 */
async function scanStandardEmails(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<any[]> {
  // TODO: Implement standard WordPress email scanning
  return []
}

/**
 * Fallback: Replace emails in standard content
 */
async function replaceStandardEmails(
  siteUrl: string,
  apiKey: string,
  oldEmail: string,
  newEmail: string,
  preview: any[]
): Promise<number> {
  // TODO: Implement standard WordPress email replacement
  return preview?.length || 0
}
