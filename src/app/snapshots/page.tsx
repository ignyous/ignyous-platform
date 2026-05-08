'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

const C = {
  primary: '#1a1a4e', primaryDim: '#F0F0FA', primaryBorder: '#C8C8E8',
  gold: '#f3af00', goldDim: '#fffbeb',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  text: '#1A1A2E', text2: '#6B6B8A', text3: '#A0A0C0',
  border: '#E2E2F0', surface: '#F7F7FD', white: '#FFFFFF',
}

function SnapshotsInner() {
  const params  = useSearchParams()
  const siteUrl = params.get('site') || ''
  const apiKey  = typeof window !== 'undefined'
    ? (() => { try { const k=`ignyous_conn_${siteUrl.replace(/[^a-z0-9]/gi,'_')}`; return JSON.parse(localStorage.getItem(k)||'{}').apiKey||'' } catch { return '' } })()
    : ''

  const cleanUrl = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`

  const [snapshots, setSnapshots] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [restoring, setRestoring] = useState<string|null>(null)
  const [result, setResult]       = useState<{id:string; ok:boolean; msg:string}|null>(null)

  useEffect(() => { if (siteUrl && apiKey) loadSnapshots() }, [siteUrl, apiKey])

  async function bridge(endpoint: string, method = 'GET', body?: any) {
    const res = await fetch('/api/wordpress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl: cleanUrl, apiKey, endpoint, method, body }),
    })
    return res.json()
  }

  async function loadSnapshots() {
    setLoading(true)
    try {
      const r = await bridge('snapshots')
      if (r.success) setSnapshots(r.data?.snapshots || r.data || [])
    } catch {} finally { setLoading(false) }
  }

  async function restore(snapshotId: string, label: string) {
    if (!confirm(`Restore to snapshot: "${label}"?\n\nThis will revert your site content to this point. Your current content will be replaced.`)) return
    setRestoring(snapshotId)
    try {
      const r = await bridge('restore', 'POST', { snapshot_id: snapshotId })
      setResult({ id: snapshotId, ok: r.success, msg: r.success ? `✓ Restored to: "${label}"` : `Failed: ${r.error || 'Unknown error'}` })
    } catch (e: any) {
      setResult({ id: snapshotId, ok: false, msg: `Error: ${e.message}` })
    } finally { setRestoring(null) }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>🗂 Backups & Restore</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
            {siteUrl ? `Snapshots for ${siteUrl}` : 'Select a site to view backups'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={loadSnapshots} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>↺ Refresh</button>
          {siteUrl && <a href={`/dashboard?site=${siteUrl}`} style={{ padding: '8px 16px', background: C.gold, border: 'none', borderRadius: 8, color: '#1a1a4e', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>← Dashboard</a>}
        </div>
      </div>

      <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>

        {result && (
          <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 12, background: result.ok ? C.greenBg : C.redBg, border: `1px solid ${result.ok ? C.greenBorder : C.redBorder}`, fontSize: 15, fontWeight: 600, color: result.ok ? C.green : C.red }}>
            {result.msg}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center' as const, padding: 80 }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }}/>
            <div style={{ color: C.text3, fontWeight: 500 }}>Loading snapshots…</div>
          </div>
        ) : snapshots.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: 80, background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🗂</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>No snapshots yet</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text3, marginBottom: 24 }}>Snapshots are created automatically before any change is made to your site.</div>
            <a href={`/dashboard?site=${siteUrl}`} style={{ padding: '12px 28px', background: C.primary, borderRadius: 8, color: 'white', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>← Back to Dashboard</a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text3 }}>{snapshots.length} snapshot{snapshots.length!==1?'s':''} — most recent first</div>
            {snapshots.map((snap, i) => {
              const isRestoring = restoring === snap.id
              const wasRestored = result?.id === snap.id
              const snapDate = snap.created_at ? new Date(snap.created_at) : null
              return (
                <div key={snap.id || i} style={{ background: C.white, border: `1px solid ${wasRestored && result?.ok ? C.greenBorder : C.border}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                  <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Icon + number */}
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: i === 0 ? C.primaryDim : C.surface, border: `1px solid ${i===0?C.primaryBorder:C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {snap.label?.includes('Before') ? '📸' : snap.label?.includes('Manual') ? '🖐' : '⚡'}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{snap.label || `Snapshot ${i+1}`}</div>
                        {i === 0 && <span style={{ padding: '2px 8px', borderRadius: 20, background: C.primaryDim, color: C.primary, fontSize: 11, fontWeight: 700, border: `1px solid ${C.primaryBorder}` }}>Latest</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 13, fontWeight: 500, color: C.text3 }}>
                        {snapDate && <>
                          <span>📅 {snapDate.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric', year:'numeric' })}</span>
                          <span>🕐 {snapDate.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
                          <span>{timeAgo(snap.created_at)}</span>
                        </>}
                        {snap.page_count != null && <span>📄 {snap.page_count} page{snap.page_count!==1?'s':''}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {snap.preview_url && (
                        <a href={snap.preview_url} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Preview ↗</a>
                      )}
                      <button
                        onClick={() => restore(snap.id, snap.label || `Snapshot ${i+1}`)}
                        disabled={!!restoring}
                        style={{
                          padding: '8px 18px', borderRadius: 8, border: 'none', cursor: restoring ? 'not-allowed' : 'pointer',
                          background: isRestoring ? C.border : C.primary, color: 'white', fontSize: 13, fontWeight: 700,
                          display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s', opacity: restoring&&!isRestoring ? 0.5 : 1,
                        }}
                      >
                        {isRestoring ? (
                          <><div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> Restoring…</>
                        ) : '↩ Restore to this point'}
                      </button>
                    </div>
                  </div>

                  {wasRestored && result?.ok && (
                    <div style={{ padding: '10px 24px', background: C.greenBg, borderTop: `1px solid ${C.greenBorder}`, fontSize: 13, fontWeight: 600, color: C.green }}>
                      ✓ Site restored to this snapshot. Reload the dashboard to see changes.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function SnapshotsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div style={{ padding:60, textAlign:'center', color:'#A0A0C0' }}>Loading…</div>}>
        <SnapshotsInner/>
      </Suspense>
    </AppLayout>
  )
}
