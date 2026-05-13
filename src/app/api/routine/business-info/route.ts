/**
 * Business Info Manager Routine API
 * POST /api/routine
 * Body: { type: "business_info_manager", action: "scan|preview|execute", ... }
 * 
 * Operations:
 * - Scan for phone, email, address across all data layers
 * - Show matches grouped by value (not scattered list)
 * - Preview changes
 * - Apply changes everywhere
 * - Return smart prompts
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  scanBusinessInfo,
  updateBusinessInfo,
  normalizePhoneNumber,
} from '@/lib/managers/business-info-manager'
import { generateSmartPrompts } from '@/components/SmartPrompts'

interface BusinessInfoRequest {
  type: 'business_info_manager'
  action: 'scan' | 'preview' | 'execute'
  siteUrl: string
  apiKey: string
  operation: 'phone' | 'email' | 'address'
  oldValue?: string
  newValue?: string
}

export async function POST(req: NextRequest) {
  try {
    const body: BusinessInfoRequest = await req.json()
    const { type, action, siteUrl, apiKey, operation, oldValue, newValue } = body

    if (type !== 'business_info_manager') {
      return NextResponse.json({ error: 'Invalid routine type' }, { status: 400 })
    }

    // ── SCAN PHASE ──────────────────────────────────────────────
    if (action === 'scan') {
      try {
        // Scan for all business info of this type
        const matches = await scanBusinessInfo(siteUrl, apiKey, oldValue || '', operation)

        if (matches.length === 0) {
          return NextResponse.json({
            status: 'no_matches',
            message: `No ${operation} numbers found on this site`,
            operation,
            matches: [],
          })
        }

        // Group results clearly for user
        const grouped = matches.map((match) => ({
          id: match.id,
          normalized: match.normalized,
          displayFormat: match.displayFormat,
          totalInstances: match.totalInstances,
          locations: match.locations.map((loc) => ({
            ...loc,
            confidence: loc.confidence,
          })),
        }))

        // Generate smart prompts
        const prompts = [
          {
            label: `✅ Change all ${grouped[0].totalInstances} instances`,
            action: 'change_all',
            variant: 'primary' as const,
            description: `Update ${operation} everywhere`,
          },
          {
            label: '👁️ Preview first',
            action: 'preview',
            variant: 'secondary' as const,
            description: 'See changes before applying',
          },
          {
            label: '❌ Cancel',
            action: 'cancel',
            variant: 'secondary' as const,
          },
        ]

        return NextResponse.json({
          status: 'success',
          action: 'scan',
          operation,
          matches: grouped,
          totalMatches: grouped.length,
          totalInstances: grouped.reduce((sum, m) => sum + m.totalInstances, 0),
          message: `Found ${grouped.length} unique ${operation} number${grouped.length !== 1 ? 's' : ''} (${grouped.reduce((sum, m) => sum + m.totalInstances, 0)} total instances)`,
          smartPrompts: prompts,
        })
      } catch (error: any) {
        return NextResponse.json(
          {
            status: 'error',
            message: `Error scanning for ${operation}: ${error.message}`,
          },
          { status: 500 }
        )
      }
    }

    // ── PREVIEW PHASE ──────────────────────────────────────────────
    if (action === 'preview') {
      try {
        if (!oldValue || !newValue) {
          return NextResponse.json({ error: 'oldValue and newValue required for preview' }, { status: 400 })
        }

        const matches = await scanBusinessInfo(siteUrl, apiKey, oldValue, operation)

        if (matches.length === 0) {
          return NextResponse.json({
            status: 'no_changes',
            message: `No ${operation} matches found to change`,
          })
        }

        // Show what will change
        const preview = matches.map((match) => ({
          normalized: match.normalized,
          oldFormat: match.displayFormat,
          newValue: newValue,
          locations: match.locations.length,
          confidence: match.locations[0].confidence,
        }))

        return NextResponse.json({
          status: 'preview',
          operation,
          preview,
          totalInstances: matches.reduce((sum, m) => sum + m.totalInstances, 0),
          message: `Will change ${matches.reduce((sum, m) => sum + m.totalInstances, 0)} instance${matches.reduce((sum, m) => sum + m.totalInstances, 0) !== 1 ? 's' : ''}`,
          prompts: [
            {
              label: '✅ Apply changes',
              action: 'execute',
              variant: 'primary' as const,
            },
            {
              label: '❌ Cancel',
              action: 'cancel',
              variant: 'secondary' as const,
            },
          ],
        })
      } catch (error: any) {
        return NextResponse.json(
          {
            status: 'error',
            message: `Error previewing changes: ${error.message}`,
          },
          { status: 500 }
        )
      }
    }

    // ── EXECUTE PHASE ──────────────────────────────────────────────
    if (action === 'execute') {
      try {
        if (!oldValue || !newValue) {
          return NextResponse.json({ error: 'oldValue and newValue required for execution' }, { status: 400 })
        }

        // Execute the update
        const result = await updateBusinessInfo(siteUrl, apiKey, oldValue, newValue, operation)

        if (result.updated === 0) {
          return NextResponse.json({
            status: 'no_changes',
            message: `No changes were made`,
            updated: 0,
          })
        }

        return NextResponse.json({
          status: 'success',
          action: 'execute',
          operation,
          updated: result.updated,
          byLocation: result.byLocation,
          message: `✅ Successfully updated ${result.updated} instance${result.updated !== 1 ? 's' : ''}`,
          details: {
            oldValue,
            newValue,
            changesBy: result.byLocation,
          },
        })
      } catch (error: any) {
        return NextResponse.json(
          {
            status: 'error',
            message: `Error executing changes: ${error.message}`,
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
