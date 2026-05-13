'use client'

import { useState, useRef, useEffect } from 'react'
import { designSystem } from '@/lib/designSystem'
import { useSiteStatus } from '@/hooks/useSiteStatus'

interface Props {
  siteUrl: string
  apiKey: string
  compact?: boolean
}

/**
 * Real-time site status indicator
 * Shows connection status, response time, and quick test button
 */
export default function SiteStatusIndicator({ siteUrl, apiKey, compact = false }: Props) {
  const { status, isManualTesting, manualTest, isConnected } = useSiteStatus(siteUrl, apiKey)
  const [showTooltip, setShowTooltip] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const C = designSystem.colors

  // Status icon and colors
  const statusConfig = {
    connected: {
      icon: '🟢',
      label: 'Connected',
      color: C.success,
      bg: C.successBg,
      border: `1px solid ${C.success}33`,
    },
    slow: {
      icon: '🟡',
      label: 'Slow',
      color: C.warning,
      bg: C.warningBg,
      border: `1px solid ${C.warning}33`,
    },
    unreachable: {
      icon: '🔴',
      label: 'Unreachable',
      color: C.error,
      bg: C.errorBg,
      border: `1px solid ${C.error}33`,
    },
    invalid_key: {
      icon: '⚠️',
      label: 'Invalid Key',
      color: C.error,
      bg: C.errorBg,
      border: `1px solid ${C.error}33`,
    },
    bridge_missing: {
      icon: '⚠️',
      label: 'Bridge Missing',
      color: C.error,
      bg: C.errorBg,
      border: `1px solid ${C.error}33`,
    },
    checking: {
      icon: '🔄',
      label: 'Checking...',
      color: C.info,
      bg: C.infoBg,
      border: `1px solid ${C.info}33`,
    },
    error: {
      icon: '❌',
      label: 'Error',
      color: C.error,
      bg: C.errorBg,
      border: `1px solid ${C.error}33`,
    },
    server_error: {
      icon: '⚠️',
      label: 'Server Error',
      color: C.warning,
      bg: C.warningBg,
      border: `1px solid ${C.warning}33`,
    },
  }

  const config = statusConfig[status.status as keyof typeof statusConfig] || statusConfig.error

  // Compact badge
  if (compact) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: designSystem.borderRadius.full,
          background: config.bg,
          border: config.border,
          fontSize: 12,
          fontWeight: 600,
          color: config.color,
          cursor: 'pointer',
          transition: `all ${designSystem.transitions.normal}`,
          animation: status.status === 'checking' ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={async () => {
          await manualTest()
          setShowTooltip(true)
          clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => setShowTooltip(false), 5000)
        }}
      >
        <span>{config.icon}</span>
        <span>{status.message}</span>

        {/* Tooltip */}
        {showTooltip && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginTop: 8,
              background: C.foreground,
              color: C.card,
              padding: '10px 12px',
              borderRadius: designSystem.borderRadius.sm,
              fontSize: 11,
              whiteSpace: 'nowrap',
              zIndex: 1000,
              boxShadow: designSystem.shadows.lg,
              pointerEvents: 'none',
            }}
          >
            Response: {status.responseTime}ms
            <div
              style={{
                position: 'absolute',
                bottom: '-4px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: `4px solid ${C.foreground}`,
              }}
            />
          </div>
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>
    )
  }

  // Full indicator with details
  return (
    <div
      style={{
        background: config.bg,
        border: config.border,
        borderRadius: designSystem.borderRadius.md,
        padding: designSystem.spacing.lg,
        marginBottom: designSystem.spacing.lg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: designSystem.spacing.lg }}>
        {/* Status Icon */}
        <div
          style={{
            fontSize: 28,
            animation: status.status === 'checking' ? 'spin 1s linear infinite' : 'none',
            flexShrink: 0,
          }}
        >
          {config.icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: config.color,
              marginBottom: 6,
            }}
          >
            {config.label}
          </div>

          <div style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.5, marginBottom: 12 }}>
            {status.message}
          </div>

          {/* Details */}
          <div
            style={{
              fontSize: 12,
              color: C.muted,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: designSystem.spacing.md,
            }}
          >
            <div>
              <strong>Response:</strong> {status.responseTime}ms
            </div>
            <div>
              <strong>Last checked:</strong>{' '}
              {new Date(status.lastChecked).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Test Button */}
        <button
          onClick={manualTest}
          disabled={isManualTesting}
          style={{
            padding: `${designSystem.spacing.md}px ${designSystem.spacing.lg}px`,
            background: isConnected ? C.success : C.error,
            color: 'white',
            border: 'none',
            borderRadius: designSystem.borderRadius.md,
            fontSize: 13,
            fontWeight: 600,
            cursor: isManualTesting ? 'not-allowed' : 'pointer',
            opacity: isManualTesting ? 0.6 : 1,
            transition: `all ${designSystem.transitions.normal}`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!isManualTesting) {
              (e.currentTarget as any).style.transform = 'translateY(-2px)'
              ;(e.currentTarget as any).style.boxShadow = designSystem.shadows.lg
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as any).style.transform = 'translateY(0)'
            ;(e.currentTarget as any).style.boxShadow = 'none'
          }}
        >
          {isManualTesting ? '🔄 Testing...' : '🔄 Test Now'}
        </button>
      </div>

      {/* Help text for error states */}
      {!isConnected && (
        <div
          style={{
            marginTop: designSystem.spacing.lg,
            padding: designSystem.spacing.md,
            background: 'rgba(0,0,0,0.03)',
            borderRadius: designSystem.borderRadius.sm,
            fontSize: 12,
            color: C.textSecondary,
            lineHeight: 1.6,
          }}
        >
          <strong>Troubleshooting:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {status.status === 'invalid_key' && (
              <li>Check that your API key is correct (in Settings)</li>
            )}
            {status.status === 'bridge_missing' && (
              <li>Bridge plugin may not be installed or activated</li>
            )}
            {status.status === 'unreachable' && (
              <>
                <li>Check that your WordPress site is online</li>
                <li>Verify the site URL is correct</li>
              </>
            )}
            {status.status === 'slow' && (
              <li>Your site is responding but slowly ({status.responseTime}ms)</li>
            )}
          </ul>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
