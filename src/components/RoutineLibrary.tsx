'use client'

import { useState } from 'react'
import { designSystem } from '@/lib/designSystem'
import { RoutineType, ROUTINES } from '@/types/routine'
import RoutinePlayer from './RoutinePlayer'

interface Props {
  siteUrl: string
  onRoutineComplete?: (routine: RoutineType, message: string) => void
}

/**
 * RoutineLibrary
 * 
 * Shows available routines and lets users run them
 * Can be displayed as:
 * - Sidebar panel
 * - Full screen modal
 * - Compact card grid
 */
export default function RoutineLibrary({ siteUrl, onRoutineComplete }: Props) {
  const [selectedRoutine, setSelectedRoutine] = useState<RoutineType | null>(null)
  const C = designSystem.colors

  const handleRoutineComplete = (routine: RoutineType) => {
    const meta = ROUTINES[routine]
    onRoutineComplete?.(routine, `${meta.name} completed successfully!`)
    setSelectedRoutine(null)
  }

  return (
    <>
      {/* Routine Player Modal */}
      {selectedRoutine && (
        <RoutinePlayer
          routineType={selectedRoutine}
          siteUrl={siteUrl}
          onComplete={() => handleRoutineComplete(selectedRoutine)}
          onClose={() => setSelectedRoutine(null)}
        />
      )}

      {/* Routine Library Grid */}
      <div>
        <div style={{ marginBottom: designSystem.spacing.lg }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: C.foreground,
              marginBottom: designSystem.spacing.md,
            }}
          >
            Quick Workflows
          </h2>
          <p style={{ fontSize: 14, color: C.textSecondary }}>
            Automate common tasks across your entire site in minutes
          </p>
        </div>

        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: designSystem.spacing.lg,
          }}
        >
          {(Object.entries(ROUTINES) as [RoutineType, typeof ROUTINES[RoutineType]][]).map(
            ([routineId, routine]) => (
              <button
                key={routineId}
                onClick={() => setSelectedRoutine(routineId)}
                style={{
                  padding: designSystem.spacing.lg,
                  background: C.card,
                  border: `2px solid ${C.border}`,
                  borderRadius: designSystem.borderRadius.lg,
                  cursor: 'pointer',
                  transition: `all ${designSystem.transitions.normal}`,
                  textAlign: 'left',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = routine.color
                  el.style.background = `${routine.color}08`
                  el.style.transform = 'translateY(-2px)'
                  el.style.boxShadow = designSystem.shadows.lg
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = C.border
                  el.style.background = C.card
                  el.style.transform = 'translateY(0)'
                  el.style.boxShadow = 'none'
                }}
              >
                {/* Icon Badge */}
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: designSystem.borderRadius.md,
                    background: `${routine.color}18`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    marginBottom: designSystem.spacing.md,
                  }}
                >
                  {routine.icon}
                </div>

                {/* Title */}
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: C.foreground,
                    marginBottom: designSystem.spacing.sm,
                  }}
                >
                  {routine.name}
                </h3>

                {/* Description */}
                <p
                  style={{
                    fontSize: 13,
                    color: C.textSecondary,
                    lineHeight: 1.5,
                    marginBottom: designSystem.spacing.lg,
                  }}
                >
                  {routine.description}
                </p>

                {/* Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: designSystem.spacing.md,
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: C.muted,
                      fontWeight: 500,
                    }}
                  >
                    ⏱️ {routine.estimatedTime}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: routine.color,
                      fontWeight: 600,
                    }}
                  >
                    Start →
                  </span>
                </div>
              </button>
            )
          )}
        </div>

        {/* Info Box */}
        <div
          style={{
            marginTop: designSystem.spacing.xl,
            padding: designSystem.spacing.lg,
            background: C.infoBg,
            border: `1px solid ${C.info}33`,
            borderRadius: designSystem.borderRadius.md,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: C.foreground,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            💡 Pro Tip
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>
            Routines are non-destructive. You'll always see a preview before changes are applied.
            A snapshot is automatically created before any changes.
          </div>
        </div>
      </div>
    </>
  )
}
