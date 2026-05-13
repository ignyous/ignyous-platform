/**
 * Smart Prompts Component
 * 
 * Shows contextual action buttons instead of making users type.
 * Based on scan results and site capabilities.
 * 
 * Examples:
 * - "Change all matches"
 * - "Only update homepage"
 * - "Preview first"
 * - "Add Company field to form"
 */

'use client'

import React from 'react'
import { designSystem } from '@/lib/designSystem'

export interface SmartPrompt {
  label: string
  action: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'danger'
  description?: string
}

interface SmartPromptsProps {
  prompts: SmartPrompt[]
  onSelect: (action: string) => void
  context?: {
    matchCount?: number
    pageCount?: number
    itemCount?: number
    danger?: boolean
  }
}

/**
 * Smart Prompts: Action buttons for common operations
 * 
 * Used after scanning to guide user on what to do next
 * instead of making them type or select checkboxes
 */
export function SmartPrompts({
  prompts,
  onSelect,
  context,
}: SmartPromptsProps) {
  if (!prompts.length) {
    return null
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: designSystem.spacing.md,
        padding: designSystem.spacing.lg,
        backgroundColor: designSystem.colors.primaryVeryLight,
        borderRadius: designSystem.borderRadius.md,
        borderLeft: `4px solid ${designSystem.colors.primary}`,
      }}
    >
      {context?.danger && (
        <div
          style={{
            padding: designSystem.spacing.md,
            backgroundColor: designSystem.colors.errorBg,
            color: designSystem.colors.error,
            borderRadius: designSystem.borderRadius.sm,
            fontSize: designSystem.typography.sizes.sm,
            fontWeight: 500,
          }}
        >
          ⚠️ These are {context.matchCount} matches. Review carefully before applying.
        </div>
      )}

      {context?.matchCount && (
        <div
          style={{
            fontSize: designSystem.typography.sizes.sm,
            color: designSystem.colors.textSecondary,
            fontWeight: 500,
          }}
        >
          Found {context.matchCount} match{context.matchCount !== 1 ? 'es' : ''}
          {context.pageCount && ` across ${context.pageCount} page${context.pageCount !== 1 ? 's' : ''}`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: designSystem.spacing.sm }}>
        {prompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(prompt.action)}
            style={{
              padding: `${designSystem.spacing.md} ${designSystem.spacing.lg}`,
              backgroundColor:
                prompt.variant === 'danger'
                  ? designSystem.colors.errorBg
                  : prompt.variant === 'secondary'
                    ? designSystem.colors.border
                    : designSystem.colors.primary,
              color:
                prompt.variant === 'danger'
                  ? designSystem.colors.error
                  : prompt.variant === 'secondary'
                    ? designSystem.colors.foreground
                    : 'white',
              border: 'none',
              borderRadius: designSystem.borderRadius.sm,
              cursor: 'pointer',
              fontSize: designSystem.typography.sizes.base,
              fontWeight: 500,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: designSystem.spacing.sm,
              ':hover': {
                opacity: 0.9,
                transform: 'translateY(-2px)',
              },
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
              ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1'
              ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
            }}
          >
            {prompt.icon && <span>{prompt.icon}</span>}
            <span>{prompt.label}</span>
          </button>
        ))}
      </div>

      {prompts.some((p) => p.description) && (
        <div
          style={{
            fontSize: designSystem.typography.sizes.xs,
            color: designSystem.colors.muted,
            marginTop: designSystem.spacing.sm,
          }}
        >
          {prompts
            .filter((p) => p.description)
            .map((p) => `${p.label}: ${p.description}`)
            .join(' • ')}
        </div>
      )}
    </div>
  )
}

/**
 * Generate smart prompts for a phone number change
 */
export function generatePhonePrompts(
  matchCount: number,
  pageCount: number,
  oldPhone: string,
  newPhone: string
): SmartPrompt[] {
  const prompts: SmartPrompt[] = [
    {
      label: `✅ Change all ${matchCount} matches`,
      action: 'change_all',
      variant: 'primary',
      description: `Update every instance of ${oldPhone} to ${newPhone}`,
    },
  ]

  if (pageCount > 1) {
    prompts.push({
      label: '🏠 Only update homepage',
      action: 'change_homepage_only',
      variant: 'secondary',
    })
  }

  prompts.push({
    label: '👁️ Preview first',
    action: 'preview',
    variant: 'secondary',
    description: 'See changes before applying',
  })

  prompts.push({
    label: '⏸️ Cancel',
    action: 'cancel',
    variant: 'secondary',
  })

  return prompts
}

/**
 * Generate smart prompts for form field operations
 */
export function generateFormPrompts(): SmartPrompt[] {
  return [
    {
      label: '➕ Add field now',
      action: 'add_field',
      variant: 'primary',
      icon: '✓',
    },
    {
      label: '⚙️ Configure field',
      action: 'configure_field',
      variant: 'secondary',
      icon: '⚙',
    },
    {
      label: '📋 Preview form',
      action: 'preview_form',
      variant: 'secondary',
      icon: '👁',
    },
    {
      label: '❌ Cancel',
      action: 'cancel',
      variant: 'secondary',
    },
  ]
}

/**
 * Generate smart prompts for page operations
 */
export function generatePagePrompts(builderType: string): SmartPrompt[] {
  return [
    {
      label: `➕ Add section to ${builderType}`,
      action: 'add_section',
      variant: 'primary',
      icon: '✓',
    },
    {
      label: '📋 Choose section type',
      action: 'choose_section',
      variant: 'secondary',
      icon: '🎨',
    },
    {
      label: '👁️ Preview page',
      action: 'preview_page',
      variant: 'secondary',
      icon: '👁',
    },
    {
      label: '❌ Cancel',
      action: 'cancel',
      variant: 'secondary',
    },
  ]
}

/**
 * Generate smart prompts based on scan results
 */
export function generateScanPrompts(scanType: string, results: any): SmartPrompt[] {
  switch (scanType) {
    case 'phone':
      return generatePhonePrompts(
        results.matchCount || 0,
        results.pageCount || 0,
        results.oldValue || 'phone number',
        results.newValue || 'new number'
      )
    case 'email':
      return generatePhonePrompts(
        results.matchCount || 0,
        results.pageCount || 0,
        results.oldValue || 'email',
        results.newValue || 'new email'
      )
    case 'form':
      return generateFormPrompts()
    case 'page':
      return generatePagePrompts(results.builder || 'page')
    default:
      return []
  }
}
