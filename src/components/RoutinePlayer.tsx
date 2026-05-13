'use client'

import { useState } from 'react'
import { designSystem } from '@/lib/designSystem'
import { RoutineStatus, RoutineType, ROUTINES, RoutineResults } from '@/types/routine'
import ConfidenceBadge from '@/components/ConfidenceBadge'

interface Props {
  routineType: RoutineType
  siteUrl: string
  onComplete: (results: RoutineResults) => void
  onClose: () => void
}

/**
 * RoutinePlayer
 * 
 * Component for running individual routines
 * Handles:
 * - Input collection
 * - Progress tracking
 * - Result display
 * - Action confirmation
 */
export default function RoutinePlayer({ routineType, siteUrl, onComplete, onClose }: Props) {
  const routine = ROUTINES[routineType]
  const C = designSystem.colors

  const [status, setStatus] = useState<RoutineStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [results, setResults] = useState<RoutineResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Routine-specific state
  const [phoneInput, setPhoneInput] = useState({ old: '', new: '' })
  const [emailInput, setEmailInput] = useState({ old: '', new: '' })
  const [previewChecked, setPreviewChecked] = useState<Set<string>>(new Set())

  const startRoutine = async () => {
    setStatus('scanning')
    setProgress(0)
    setMessage('Scanning your site...')
    setError(null)

    try {
      // Simulate progress
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 100))
        setProgress(Math.min(i * 3, 30))
      }

      // Call routine endpoint
      const response = await fetch('/api/routine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: routineType,
          siteUrl,
          ...(routineType === 'phone' && { oldPhone: phoneInput.old }),
          ...(routineType === 'email' && { oldEmail: emailInput.old }),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Routine failed')
      }

      setResults(data.results)
      setStatus('previewing')
      setProgress(50)
      setMessage(`Found ${data.results.found} instances. Review below.`)
    } catch (err: any) {
      setStatus('error')
      setError(err.message || 'Unknown error')
    }
  }

  const executeRoutine = async () => {
    setStatus('executing')
    setProgress(70)
    setMessage('Applying changes...')

    try {
      const response = await fetch('/api/routine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: routineType,
          action: 'execute',
          siteUrl,
          preview: results?.preview?.filter(p => previewChecked.has(p.id)),
          ...(routineType === 'phone' && { newPhone: phoneInput.new }),
          ...(routineType === 'email' && { newEmail: emailInput.new }),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Execution failed')
      }

      setProgress(100)
      setStatus('complete')
      setMessage('✅ Complete!')
      setResults(data.results)
      onComplete(data.results)
    } catch (err: any) {
      setStatus('error')
      setError(err.message || 'Execution failed')
    }
  }

  const togglePreview = (id: string) => {
    const newChecked = new Set(previewChecked)
    if (newChecked.has(id)) {
      newChecked.delete(id)
    } else {
      newChecked.add(id)
    }
    setPreviewChecked(newChecked)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.card,
          borderRadius: designSystem.borderRadius.lg,
          width: '90%',
          maxWidth: 700,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: designSystem.shadows.lg,
          animation: 'slideUp 0.3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: designSystem.spacing.lg,
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: designSystem.spacing.lg }}>
            <div style={{ fontSize: 28 }}>{routine.icon}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.foreground }}>
                {routine.name}
              </div>
              <div style={{ fontSize: 13, color: C.textSecondary }}>
                {routine.description}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: C.muted,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: designSystem.spacing.lg }}>
          {status === 'idle' && (
            <PhoneManagerSetup
              input={phoneInput}
              setInput={setPhoneInput}
              onStart={startRoutine}
              onClose={onClose}
            />
          )}

          {(status === 'scanning' || status === 'previewing') && (
            <PreviewPhase
              results={results}
              progress={progress}
              message={message}
              previewChecked={previewChecked}
              togglePreview={togglePreview}
              onExecute={executeRoutine}
              onClose={onClose}
            />
          )}

          {status === 'executing' && (
            <ExecutingPhase progress={progress} message={message} />
          )}

          {status === 'complete' && (
            <CompletePhase results={results} message={message} onClose={onClose} />
          )}

          {status === 'error' && (
            <ErrorPhase error={error} onRetry={startRoutine} onClose={onClose} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Phone Manager Setup Phase
 */
function PhoneManagerSetup({
  input,
  setInput,
  onStart,
  onClose,
}: {
  input: { old: string; new: string }
  setInput: any
  onStart: () => void
  onClose: () => void
}) {
  const C = designSystem.colors

  return (
    <div>
      <div style={{ marginBottom: designSystem.spacing.xl }}>
        <label
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            color: C.foreground,
            marginBottom: designSystem.spacing.sm,
          }}
        >
          Current Phone Number
        </label>
        <input
          type="tel"
          placeholder="(555) 123-4567 or 5551234567"
          value={input.old}
          onChange={e => setInput({ ...input, old: e.target.value })}
          style={{
            width: '100%',
            padding: designSystem.spacing.md,
            border: `1px solid ${C.border}`,
            borderRadius: designSystem.borderRadius.md,
            fontSize: 14,
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 6 }}>
          The phone number you want to find and replace
        </div>
      </div>

      <div style={{ marginBottom: designSystem.spacing.xl }}>
        <label
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            color: C.foreground,
            marginBottom: designSystem.spacing.sm,
          }}
        >
          New Phone Number
        </label>
        <input
          type="tel"
          placeholder="(555) 987-6543 or 5559876543"
          value={input.new}
          onChange={e => setInput({ ...input, new: e.target.value })}
          style={{
            width: '100%',
            padding: designSystem.spacing.md,
            border: `1px solid ${C.border}`,
            borderRadius: designSystem.borderRadius.md,
            fontSize: 14,
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 6 }}>
          The phone number to replace it with
        </div>
      </div>

      <div style={{ display: 'flex', gap: designSystem.spacing.md }}>
        <button
          onClick={onStart}
          disabled={!input.old || !input.new}
          style={{
            flex: 1,
            padding: designSystem.spacing.md,
            background: input.old && input.new ? C.primary : C.mutedLight,
            color: 'white',
            border: 'none',
            borderRadius: designSystem.borderRadius.md,
            fontWeight: 600,
            cursor: input.old && input.new ? 'pointer' : 'not-allowed',
            opacity: input.old && input.new ? 1 : 0.5,
            fontSize: 14,
          }}
        >
          ☎️ Scan for {input.old || 'phone number'}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: `${designSystem.spacing.md}px ${designSystem.spacing.lg}px`,
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: designSystem.borderRadius.md,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Preview Phase - Show scan results
 */
function PreviewPhase({
  results,
  progress,
  message,
  previewChecked,
  togglePreview,
  onExecute,
  onClose,
}: {
  results: RoutineResults | null
  progress: number
  message: string
  previewChecked: Set<string>
  togglePreview: (id: string) => void
  onExecute: () => void
  onClose: () => void
}) {
  const C = designSystem.colors

  // Calculate confidence distribution
  const confidenceStats = {
    safe: results?.preview?.filter((p: any) => p.confidence?.recommendation === 'safe').length || 0,
    review: results?.preview?.filter((p: any) => p.confidence?.recommendation === 'review').length || 0,
    skip: results?.preview?.filter((p: any) => p.confidence?.recommendation === 'skip').length || 0,
  }

  return (
    <div>
      {/* Progress Bar */}
      <div style={{ marginBottom: designSystem.spacing.lg }}>
        <div
          style={{
            height: 4,
            background: C.border,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: C.primary,
              width: `${progress}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.textSecondary,
            marginTop: 8,
          }}
        >
          {message}
        </div>
      </div>

      {/* Results */}
      {results?.preview && results.preview.length > 0 && (
        <div style={{ marginBottom: designSystem.spacing.lg }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.foreground,
              marginBottom: designSystem.spacing.md,
            }}
          >
            Found {results.found} instances
          </div>

          {/* Confidence Distribution */}
          {(confidenceStats.safe > 0 || confidenceStats.review > 0 || confidenceStats.skip > 0) && (
            <div
              style={{
                display: 'flex',
                gap: designSystem.spacing.md,
                marginBottom: designSystem.spacing.lg,
                padding: designSystem.spacing.md,
                background: C.bg,
                borderRadius: designSystem.borderRadius.md,
                border: `1px solid ${C.border}`,
              }}
            >
              {confidenceStats.safe > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>✅</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.success }}>
                      {confidenceStats.safe} Safe
                    </div>
                    <div style={{ fontSize: 11, color: C.textSecondary }}>95%+ confident</div>
                  </div>
                </div>
              )}

              {confidenceStats.review > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.warning }}>
                      {confidenceStats.review} Review
                    </div>
                    <div style={{ fontSize: 11, color: C.textSecondary }}>70-85% confident</div>
                  </div>
                </div>
              )}

              {confidenceStats.skip > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>❌</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.error }}>
                      {confidenceStats.skip} Skip
                    </div>
                    <div style={{ fontSize: 11, color: C.textSecondary }}>{'<70% confident'}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              maxHeight: 400,
              overflowY: 'auto',
              border: `1px solid ${C.border}`,
              borderRadius: designSystem.borderRadius.md,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {results.preview.map((item: any) => {
              const isChecked = previewChecked.has(item.id)
              const confidence = item.confidence

              // Determine checkbox state based on recommendation
              const shouldAutoCheck = confidence?.recommendation === 'safe' || confidence?.recommendation === 'review'

              return (
                <div
                  key={item.id}
                  style={{
                    padding: designSystem.spacing.md,
                    borderBottom: `1px solid ${C.border}`,
                    background: isChecked ? C.primaryVeryLight : 'transparent',
                    transition: `background ${designSystem.transitions.normal}`,
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: designSystem.spacing.md,
                      cursor: 'pointer',
                      marginBottom: designSystem.spacing.md,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => togglePreview(item.id)}
                      defaultChecked={shouldAutoCheck}
                      style={{ marginTop: 4, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: designSystem.spacing.md,
                          marginBottom: designSystem.spacing.sm,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: C.foreground,
                          }}
                        >
                          {item.location}
                        </div>
                        {confidence && (
                          <div
                            style={{
                              padding: '2px 8px',
                              background: confidence.recommendation === 'safe' ? C.successBg : 
                                          confidence.recommendation === 'review' ? C.warningBg :
                                          C.errorBg,
                              border: `1px solid ${confidence.recommendation === 'safe' ? C.success : 
                                               confidence.recommendation === 'review' ? C.warning :
                                               C.error}33`,
                              borderRadius: designSystem.borderRadius.sm,
                              fontSize: 11,
                              fontWeight: 600,
                              color: confidence.recommendation === 'safe' ? C.success :
                                    confidence.recommendation === 'review' ? C.warning :
                                    C.error,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {confidence.recommendation === 'safe' ? '✅' : 
                             confidence.recommendation === 'review' ? '⚠️' : '❌'}
                            {' '}{confidence.overallScore}%
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: C.textSecondary,
                          marginBottom: 4,
                        }}
                      >
                        <strong>Current:</strong>{' '}
                        <code
                          style={{
                            background: C.bg,
                            padding: '2px 6px',
                            borderRadius: 3,
                            fontFamily: 'monospace',
                          }}
                        >
                          {item.current}
                        </code>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.success,
                          marginBottom: designSystem.spacing.sm,
                        }}
                      >
                        <strong>New:</strong>{' '}
                        <code
                          style={{
                            background: C.bg,
                            padding: '2px 6px',
                            borderRadius: 3,
                            fontFamily: 'monospace',
                          }}
                        >
                          {item.proposed}
                        </code>
                      </div>

                      {/* Mini Confidence Breakdown */}
                      {confidence && (
                        <details
                          style={{
                            marginTop: designSystem.spacing.sm,
                            fontSize: 11,
                            color: C.textSecondary,
                          }}
                        >
                          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                            Show confidence details
                          </summary>
                          <div
                            style={{
                              marginTop: designSystem.spacing.sm,
                              paddingTop: designSystem.spacing.sm,
                              borderTop: `1px solid ${C.border}`,
                            }}
                          >
                            {confidence.factors.map((factor: any) => (
                              <div
                                key={factor.name}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  marginBottom: 4,
                                  alignItems: 'center',
                                }}
                              >
                                <span>{factor.name}:</span>
                                <span style={{ fontWeight: 600 }}>{factor.score}%</span>
                              </div>
                            ))}
                            {confidence.risks.length > 0 && (
                              <div style={{ marginTop: designSystem.spacing.sm }}>
                                <div style={{ color: C.error, fontWeight: 600 }}>Risks:</div>
                                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10 }}>
                                  {confidence.risks.map((risk: string, idx: number) => (
                                    <li key={idx}>{risk}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  </label>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: designSystem.spacing.md }}>
        <button
          onClick={onExecute}
          disabled={previewChecked.size === 0}
          style={{
            flex: 1,
            padding: designSystem.spacing.md,
            background: previewChecked.size > 0 ? C.primary : C.mutedLight,
            color: 'white',
            border: 'none',
            borderRadius: designSystem.borderRadius.md,
            fontWeight: 600,
            cursor: previewChecked.size > 0 ? 'pointer' : 'not-allowed',
            opacity: previewChecked.size > 0 ? 1 : 0.5,
            fontSize: 14,
          }}
        >
          ✓ Apply {previewChecked.size} change{previewChecked.size !== 1 ? 's' : ''}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: `${designSystem.spacing.md}px ${designSystem.spacing.lg}px`,
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: designSystem.borderRadius.md,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Executing Phase - Show progress
 */
function ExecutingPhase({ progress, message }: { progress: number; message: string }) {
  const C = designSystem.colors

  return (
    <div style={{ textAlign: 'center', padding: designSystem.spacing.xl }}>
      <div
        style={{
          fontSize: 48,
          marginBottom: designSystem.spacing.lg,
          animation: 'spin 1s linear infinite',
        }}
      >
        ⚙️
      </div>
      <div
        style={{
          height: 6,
          background: C.border,
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: designSystem.spacing.lg,
        }}
      >
        <div
          style={{
            height: '100%',
            background: C.primary,
            width: `${progress}%`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ fontSize: 14, color: C.textSecondary, fontWeight: 500 }}>
        {message}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

/**
 * Complete Phase - Show results
 */
function CompletePhase({
  results,
  message,
  onClose,
}: {
  results: RoutineResults | null
  message: string
  onClose: () => void
}) {
  const C = designSystem.colors

  return (
    <div style={{ textAlign: 'center', padding: designSystem.spacing.xl }}>
      <div style={{ fontSize: 48, marginBottom: designSystem.spacing.lg }}>✅</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: C.foreground,
          marginBottom: designSystem.spacing.md,
        }}
      >
        {message}
      </div>
      <div
        style={{
          fontSize: 14,
          color: C.textSecondary,
          marginBottom: designSystem.spacing.xl,
        }}
      >
        {results?.changed || 0} locations updated successfully
      </div>
      <button
        onClick={onClose}
        style={{
          padding: designSystem.spacing.md,
          background: C.primary,
          color: 'white',
          border: 'none',
          borderRadius: designSystem.borderRadius.md,
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 14,
          width: '100%',
        }}
      >
        Done
      </button>
    </div>
  )
}

/**
 * Error Phase - Show error
 */
function ErrorPhase({
  error,
  onRetry,
  onClose,
}: {
  error: string | null
  onRetry: () => void
  onClose: () => void
}) {
  const C = designSystem.colors

  return (
    <div style={{ padding: designSystem.spacing.xl }}>
      <div
        style={{
          background: C.errorBg,
          border: `1px solid ${C.error}33`,
          borderRadius: designSystem.borderRadius.md,
          padding: designSystem.spacing.lg,
          marginBottom: designSystem.spacing.lg,
        }}
      >
        <div style={{ fontSize: 16, color: C.error, fontWeight: 600, marginBottom: 8 }}>
          ❌ Error
        </div>
        <div style={{ fontSize: 14, color: C.foreground }}>
          {error || 'An error occurred'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: designSystem.spacing.md }}>
        <button
          onClick={onRetry}
          style={{
            flex: 1,
            padding: designSystem.spacing.md,
            background: C.primary,
            color: 'white',
            border: 'none',
            borderRadius: designSystem.borderRadius.md,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          🔄 Retry
        </button>
        <button
          onClick={onClose}
          style={{
            padding: `${designSystem.spacing.md}px ${designSystem.spacing.lg}px`,
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: designSystem.borderRadius.md,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
