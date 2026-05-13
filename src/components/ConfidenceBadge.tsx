'use client'

import { designSystem } from '@/lib/designSystem'
import { ContentConfidenceResult } from '@/lib/confidence'

interface Props {
  confidence: ContentConfidenceResult
  compact?: boolean
}

/**
 * Confidence Badge Component
 * Shows confidence score with color coding and brief explanation
 */
export default function ConfidenceBadge({ confidence, compact = false }: Props) {
  const C = designSystem.colors

  // Color based on recommendation
  const getColorScheme = () => {
    switch (confidence.recommendation) {
      case 'safe':
        return {
          bg: C.successBg,
          border: C.success,
          text: C.success,
          icon: '✅',
        }
      case 'review':
        return {
          bg: C.warningBg,
          border: C.warning,
          text: C.warning,
          icon: '⚠️',
        }
      case 'skip':
        return {
          bg: C.errorBg,
          border: C.error,
          text: C.error,
          icon: '❌',
        }
    }
  }

  const colors = getColorScheme()

  if (compact) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: colors.bg,
          border: `1px solid ${colors.border}33`,
          borderRadius: designSystem.borderRadius.sm,
          fontSize: 12,
          fontWeight: 600,
          color: colors.text,
        }}
        title={confidence.notes[0]}
      >
        <span>{colors.icon}</span>
        <span>{confidence.overallScore}%</span>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: designSystem.spacing.md,
        background: colors.bg,
        border: `1px solid ${colors.border}33`,
        borderRadius: designSystem.borderRadius.md,
      }}
    >
      {/* Score Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: designSystem.spacing.md,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: designSystem.spacing.sm,
          }}
        >
          <span style={{ fontSize: 20 }}>{colors.icon}</span>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: colors.text,
              }}
            >
              {confidence.overallScore}% Confident
            </div>
            <div
              style={{
                fontSize: 12,
                color: C.textSecondary,
                textTransform: 'capitalize',
              }}
            >
              {confidence.recommendation === 'safe'
                ? 'Safe to apply'
                : confidence.recommendation === 'review'
                ? 'Manual review recommended'
                : 'Should skip this one'}
            </div>
          </div>
        </div>
      </div>

      {/* Factor Breakdown */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: designSystem.spacing.sm,
        }}
      >
        {confidence.factors.map(factor => (
          <FactorBar key={factor.name} factor={factor} />
        ))}
      </div>

      {/* Risks */}
      {confidence.risks.length > 0 && (
        <div
          style={{
            marginTop: designSystem.spacing.md,
            paddingTop: designSystem.spacing.md,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.error,
              marginBottom: 8,
            }}
          >
            Risks:
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 12,
              color: C.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {confidence.risks.map((risk, idx) => (
              <li key={idx}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes */}
      {confidence.notes.length > 0 && (
        <div
          style={{
            marginTop: designSystem.spacing.md,
            paddingTop: designSystem.spacing.md,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.success,
              marginBottom: 8,
            }}
          >
            Notes:
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 12,
              color: C.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {confidence.notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Individual Factor Bar
 */
function FactorBar({
  factor,
}: {
  factor: {
    name: string
    score: number
    weight: number
    reason: string
  }
}) {
  const C = designSystem.colors

  // Color based on score
  const getScoreColor = (score: number) => {
    if (score >= 85) return C.success
    if (score >= 70) return C.warning
    return C.error
  }

  const barColor = getScoreColor(factor.score)

  return (
    <div key={factor.name}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
          fontSize: 12,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: C.foreground,
          }}
        >
          {factor.name}
        </span>
        <span
          style={{
            fontWeight: 600,
            color: barColor,
          }}
        >
          {factor.score}%
        </span>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          height: 6,
          background: C.border,
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 4,
        }}
      >
        <div
          style={{
            height: '100%',
            background: barColor,
            width: `${factor.score}%`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Reason */}
      <div
        style={{
          fontSize: 11,
          color: C.textSecondary,
          marginBottom: 8,
        }}
      >
        {factor.reason}
      </div>
    </div>
  )
}
