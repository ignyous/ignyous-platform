'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

const C = {
  bg:      '#F8F7FF',
  card:    '#FFFFFF',
  border:  '#E8E6F0',
  primary: '#6357FF',
  primaryLight: '#F0EEFF',
  text:    '#1A1A2E',
  text2:   '#5A5872',
  text3:   '#9896A8',
  green:   '#16A34A',
  amber:   '#D97706',
  red:     '#DC2626',
}

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  serialized_field: { icon: '🔧', label: 'Theme Option',   color: '#7C3AED' },
  option:           { icon: '⚙️',  label: 'Option',        color: '#2563EB' },
  post_content:     { icon: '📄', label: 'Page Content',   color: '#059669' },
  post_meta:        { icon: '🏷', label: 'Post Meta',      color: '#0891B2' },
  elementor_kit:    { icon: '⚡', label: 'Elementor',      color: '#E4173F' },
  content_replace:  { icon: '🔁', label: 'Content Replace',color: '#D97706' },
  general:          { icon: '📦', label: 'Change',         color: '#6B7280' },
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() / 1000) - ts)
  if (s < 60)   return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function groupByDay(snaps: any[]) {
  const groups: Record<string, any[]> = {}
  for (const s of snaps) {
    const day = new Date(s.timestamp * 1000).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    if (!groups[day]) groups[day] = []
    groups[day].push(s)
  }
  return groups
}

function DataPreview({ data, type }: { data: any; type: string }) {
  if (!data) return null
  const rows: [string, any][] = []
  if (type === 'serialized_field' || type === 'option') {
    if (data.option_name) rows.push(['Option', data.option_name])
    if (data.array_key)   rows.push(['Field', data.array_key])
    if (data.old_value !== undefined && data.old_value !== null) {
      const v = typeof data.old_value === 'object' ? JSON.stringify(data.old_value).slice(0, 80) : String(data.old_value).slice(0, 80)
      rows.push(['Before', v || '(empty)'])
    }
  } else if (type === 'post_content') {
    if (data.post_title)   rows.push(['Page', data.post_title])
    if (data.post_status)  rows.push(['Status', data.post_status])
  } else if (type === 'content_replace') {
    if (data.find) rows.push(['Searched for', data.find])
    if (data.affected_posts?.length) rows.push(['Posts affected', data.affected_posts.length])
  } else if (type === 'elementor_kit') {
    if (data.kit_id)  rows.push(['Kit ID', data.kit_id])
    if (data.css_key) rows.push(['Setting', data.css_key])
  }
  if (!rows.length) return null
  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
      {rows.map(([k, v]) => (
        <span key={k} style={{ fontSize: 12, color: C.text3 }}>
          <span style={{ color: C.text2, fontWeight: 600 }}>{k}:</span> {String(v)}
        </span>
      ))}
    </div>
  )
}

export default function BackupsPage() {
  const { data: session } = useSession()
  const [siteUrl, setSiteUrl]       = useState('')
  const [apiKey,  setApiKey]        = useState('')
  const [snapshots, setSnapshots]   = useState<any[]>([])
  const [loading,   setLoading]     = useState(false)
  const [restoring, setRestoring]   = useState<string | null>(null)
  const [deleting,  setDeleting]    = useState<string | null>(null)
  const [error,     setError]       = useState('')
  const [success,   setSuccess]     = useState('')

  // Load site credentials
  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(d => {
      const sites = d.sites || []
      if (sites.length > 0) {
        setSiteUrl(sites[0].url || '')
        setApiKey(sites[0].apiKey || '')
      }
    }).catch(() => {})
  }, [])

  const loadSnapshots = useCallback(async () => {
    if (!siteUrl || !apiKey) return
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/wordpress/snapshots?siteUrl=${encodeURIComponent(siteUrl)}&apiKey=${encodeURIComponent(apiKey)}`)
      const d = await r.json()
      setSnapshots(d.snapshots || [])
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [siteUrl, apiKey])

  useEffect(() => { loadSnapshots() }, [loadSnapshots])

  async function restore(snap: any) {
    setRestoring(snap.id); setError(''); setSuccess('')
    try {
      const r = await fetch('/api/wordpress/snapshots/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, apiKey, snapshotId: snap.id }),
      })
      const d = await r.json()
      if (d.success) {
        setSuccess(`✅ Restored: ${snap.description}`)
        await fetch('/api/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl, apiKey }) })
      } else { setError(`Restore failed: ${d.message || d.error}`) }
    } catch (e: any) { setError(e.message) }
    setRestoring(null)
  }

  async function deleteSnap(snap: any) {
    setDeleting(snap.id)
    try {
      await fetch('/api/wordpress/snapshots', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, apiKey, snapshotId: snap.id }),
      })
      setSnapshots(prev => prev.filter(s => s.id !== snap.id))
    } catch {}
    setDeleting(null)
  }

  async function clearAll() {
    if (!confirm('Delete all snapshots? This cannot be undone.')) return
    await Promise.all(snapshots.map(s => deleteSnap(s)))
    setSnapshots([])
  }

  const groups = groupByDay(snapshots)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" style={{ textDecoration: 'none', color: C.text3, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>← Dashboard</Link>
          <span style={{ color: C.border }}>|</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: '-.02em' }}>Backups & Snapshots</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={loadSnapshots} disabled={loading} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: C.text2 }}>
            {loading ? '↻ Loading…' : '↻ Refresh'}
          </button>
          {snapshots.length > 0 && (
            <button onClick={clearAll} style={{ border: `1px solid #FCA5A5`, borderRadius: 8, background: '#FEF2F2', padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: C.red }}>
              🗑 Clear All
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 24px' }}>
        {/* Site selector if multiple sites */}
        {siteUrl && (
          <div style={{ marginBottom: 24, padding: '10px 16px', background: C.primaryLight, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, color: C.text2 }}>
            Showing snapshots for: <strong style={{ color: C.text }}>{siteUrl}</strong>
          </div>
        )}

        {/* Status messages */}
        {error   && <div style={{ marginBottom: 16, padding: '12px 16px', background: '#FEF2F2', border: `1px solid #FCA5A5`, borderRadius: 10, color: C.red, fontSize: 14 }}>{error}</div>}
        {success && <div style={{ marginBottom: 16, padding: '12px 16px', background: '#F0FDF4', border: `1px solid #86EFAC`, borderRadius: 10, color: C.green, fontSize: 14 }}>{success}</div>}

        {/* Empty state */}
        {!loading && snapshots.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: C.text3 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text2, marginBottom: 8 }}>No snapshots yet</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
              Snapshots are taken automatically before any change is made through the AI chat. They'll appear here so you can restore to any previous state.
            </div>
          </div>
        )}

        {/* Grouped snapshot list */}
        {Object.entries(groups).map(([day, daySnaps]) => (
          <div key={day} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>{day}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {daySnaps.map(snap => {
                const meta = TYPE_META[snap.type] || TYPE_META.general
                const isRestoring = restoring === snap.id
                const isDeleting  = deleting === snap.id
                return (
                  <div key={snap.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'box-shadow .15s' }}>
                    {/* Type icon */}
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{snap.description}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, background: meta.color + '18', color: meta.color, borderRadius: 5, padding: '2px 7px' }}>{meta.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.text3 }}>{formatDate(snap.timestamp)} · {timeAgo(snap.timestamp)}</div>
                      <DataPreview data={snap.data} type={snap.type} />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => restore(snap)}
                        disabled={!!restoring || !!deleting}
                        style={{ border: `1px solid ${C.primary}`, borderRadius: 8, background: isRestoring ? C.primaryLight : 'transparent', color: C.primary, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: restoring ? 'wait' : 'pointer', minWidth: 80, textAlign: 'center' }}
                      >
                        {isRestoring ? '↻ …' : '↩ Restore'}
                      </button>
                      <button
                        onClick={() => deleteSnap(snap)}
                        disabled={!!deleting || !!restoring}
                        style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.text3, padding: '7px 10px', fontSize: 13, cursor: 'pointer' }}
                        title="Delete snapshot"
                      >
                        {isDeleting ? '…' : '🗑'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
