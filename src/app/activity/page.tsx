'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

const C = {
  primary: '#1a1a4e', primaryDim: '#F0F0FA', primaryBorder: '#C8C8E8',
  gold: '#f3af00', goldDim: '#fffbeb',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
  yellow: '#92400E', yellowBg: '#FFFBEB', yellowBorder: '#FDE68A',
  blue: '#1B5FA8', blueBg: '#EFF6FF', blueBorder: '#BFDBFE',
  text: '#1A1A2E', text2: '#6B6B8A', text3: '#A0A0C0',
  border: '#E2E2F0', surface: '#F7F7FD', white: '#FFFFFF',
}

const CATEGORY_META: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  ai_action: { icon: '✦', label: 'AI Action',    color: C.primary, bg: C.primaryDim,  border: C.primaryBorder },
  content:   { icon: '✍️', label: 'Content',      color: C.blue,    bg: C.blueBg,      border: C.blueBorder    },
  snapshot:  { icon: '📸', label: 'Snapshot',     color: '#6B21A8', bg: '#F5F3FF',     border: '#DDD6FE'       },
  page:      { icon: '📄', label: 'Page',         color: C.green,   bg: C.greenBg,     border: C.greenBorder   },
  plugin:    { icon: '🔌', label: 'Plugin/Theme', color: C.yellow,  bg: C.yellowBg,    border: C.yellowBorder  },
  settings:  { icon: '⚙️', label: 'Settings',     color: C.text2,   bg: C.surface,     border: C.border        },
  auth:      { icon: '🔐', label: 'Auth',         color: C.red,     bg: C.redBg,       border: C.redBorder     },
  system:    { icon: '💬', label: 'Chat',         color: C.text3,   bg: C.surface,     border: C.border        },
}

const STATUS_META: Record<string, { icon: string; color: string; bg: string }> = {
  success: { icon: '✓', color: C.green, bg: C.greenBg },
  failed:  { icon: '✗', color: C.red,   bg: C.redBg   },
  pending: { icon: '…', color: C.yellow, bg: C.yellowBg },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)   return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function ActivityInner() {
  const params  = useSearchParams()
  const initSite = params.get('site') || ''

  const [logs, setLogs]               = useState<any[]>([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [filterSite, setFilterSite]   = useState(initSite)
  const [filterCat, setFilterCat]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch]           = useState('')
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [page, setPage]               = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const LIMIT = 50

  const load = useCallback(async (reset = false) => {
    if (reset) setRefreshing(true)
    else setLoading(true)
    try {
      const offset = reset ? 0 : page * LIMIT
      const url = `/api/activity?limit=${LIMIT}&offset=${offset}${filterSite ? `&site=${encodeURIComponent(filterSite)}` : ''}${filterCat ? `&category=${filterCat}` : ''}`
      const res  = await fetch(url)
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      if (reset) setPage(0)
    } catch {} finally { setLoading(false); setRefreshing(false) }
  }, [page, filterSite, filterCat])

  useEffect(() => { load(true) }, [filterSite, filterCat])
  useEffect(() => { load() }, [page])

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => load(true), 10000)
    return () => clearInterval(t)
  }, [autoRefresh, load])

  const filtered = logs.filter(log => {
    if (filterStatus && log.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return log.summary?.toLowerCase().includes(q) || log.action?.toLowerCase().includes(q) || log.siteUrl?.toLowerCase().includes(q)
    }
    return true
  })

  // Stats
  const stats = {
    total:   logs.length,
    success: logs.filter(l => l.status === 'success').length,
    failed:  logs.filter(l => l.status === 'failed').length,
    sites:   [...new Set(logs.map(l => l.siteUrl).filter(Boolean))].length,
  }

  return (
    <div style={{ background: C.surface, minHeight: '100%', fontFamily: 'Poppins, sans-serif' }}>

      {/* Header */}
      <div style={{ background: C.primary, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>📋 Activity Log</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
            Everything happening across all sites — real time
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setAutoRefresh(a => !a)} style={{
            padding: '7px 14px', borderRadius: 8, border: `1px solid rgba(255,255,255,0.2)`,
            background: autoRefresh ? 'rgba(243,175,0,0.2)' : 'rgba(255,255,255,0.1)',
            color: autoRefresh ? C.gold : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {autoRefresh ? '⏵ Live' : '⏸ Paused'}
          </button>
          <button onClick={() => load(true)} disabled={refreshing} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: 13, fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {refreshing
              ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/> Refreshing…</>
              : <>↺ Refresh</>
            }
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '12px 32px', display: 'flex', gap: 32 }}>
        {[
          { label: 'Total Events',   value: total,         color: C.text },
          { label: 'Successful',     value: stats.success, color: C.green },
          { label: 'Failed',         value: stats.failed,  color: C.red },
          { label: 'Active Sites',   value: stats.sites,   color: C.primary },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 32px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search events…"
            style={{ padding: '9px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: 'Poppins, sans-serif', color: C.text, background: C.white, width: 220, outline: 'none' }}
          />
          <input
            value={filterSite} onChange={e => setFilterSite(e.target.value)}
            placeholder="Filter by site URL…"
            style={{ padding: '9px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: 'Poppins, sans-serif', color: C.text, background: C.white, width: 220, outline: 'none' }}
          />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding: '9px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: 'Poppins, sans-serif', color: C.text, background: C.white }}>
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '9px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 500, fontFamily: 'Poppins, sans-serif', color: C.text, background: C.white }}>
            <option value="">All Statuses</option>
            <option value="success">✓ Success</option>
            <option value="failed">✗ Failed</option>
            <option value="pending">… Pending</option>
          </select>
          {(filterSite||filterCat||filterStatus||search) && (
            <button onClick={() => { setFilterSite(''); setFilterCat(''); setFilterStatus(''); setSearch('') }}
              style={{ padding: '9px 14px', border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, color: C.text2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ✕ Clear
            </button>
          )}
          <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500, color: C.text3 }}>
            Showing {filtered.length} of {total} events
          </div>
        </div>

        {/* Category quick filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
          {Object.entries(CATEGORY_META).map(([k, v]) => (
            <button key={k} onClick={() => setFilterCat(filterCat === k ? '' : k)} style={{
              padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${filterCat===k ? v.color : C.border}`,
              background: filterCat===k ? v.bg : C.white, color: filterCat===k ? v.color : C.text3,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
            }}>{v.icon} {v.label}</button>
          ))}
        </div>

        {/* Log entries */}
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: 80 }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }}/>
            <div style={{ color: C.text3, fontWeight: 500 }}>Loading activity…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: 80, background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>No activity yet</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text3 }}>Events will appear here as you use the platform</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {filtered.map((log, i) => {
              const cat    = CATEGORY_META[log.category] || CATEGORY_META.system
              const status = STATUS_META[log.status] || STATUS_META.success
              const isOpen = expanded === log.id
              const prevDate = i > 0 ? new Date(filtered[i-1].createdAt).toDateString() : null
              const thisDate = new Date(log.createdAt).toDateString()
              const showDate = thisDate !== prevDate

              return (
                <div key={log.id}>
                  {showDate && (
                    <div style={{ padding: '12px 0 6px', fontSize: 12, fontWeight: 700, color: C.text3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: C.border }}/>
                      {thisDate === new Date().toDateString() ? 'Today' : thisDate}
                      <div style={{ flex: 1, height: 1, background: C.border }}/>
                    </div>
                  )}
                  <div style={{ background: C.white, border: `1px solid ${isOpen ? C.primaryBorder : C.border}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                    <div
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    >
                      {/* Category badge */}
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.bg, border: `1px solid ${cat.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                        {cat.icon}
                      </div>

                      {/* Summary */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {log.summary}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 12, fontWeight: 500, color: C.text3, flexWrap: 'wrap' as const }}>
                          <span style={{ background: cat.bg, color: cat.color, padding: '1px 7px', borderRadius: 20, border: `1px solid ${cat.border}`, fontWeight: 700 }}>{cat.label}</span>
                          {log.siteUrl && <span>🌐 {log.siteUrl.replace(/^https?:\/\//, '')}</span>}
                          {log.userId && <span>👤 {log.userId}</span>}
                          {log.durationMs && <span>⏱ {log.durationMs}ms</span>}
                        </div>
                      </div>

                      {/* Status + time */}
                      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: status.bg, color: status.color }}>
                          {status.icon} {log.status}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: C.text3 }}>
                          {timeAgo(log.createdAt)}
                        </span>
                      </div>

                      <div style={{ color: C.text3, fontSize: 14, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</div>
                    </div>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.border}`, marginTop: 0 }}>
                        <div style={{ paddingTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                          {[
                            { label: 'Action',    value: log.action },
                            { label: 'Category',  value: log.category },
                            { label: 'Status',    value: log.status },
                            { label: 'Time',      value: new Date(log.createdAt).toLocaleString() },
                            { label: 'Site',      value: log.siteUrl || '—' },
                            { label: 'User',      value: log.userId || 'anonymous' },
                            { label: 'IP',        value: log.ipAddress || '—' },
                            { label: 'Duration',  value: log.durationMs ? `${log.durationMs}ms` : '—' },
                          ].map(row => (
                            <div key={row.label} style={{ background: C.surface, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}` }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 3 }}>{row.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, wordBreak: 'break-all' as const }}>{row.value}</div>
                            </div>
                          ))}
                        </div>
                        {log.detail && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Detail</div>
                            <pre style={{ background: '#0f172a', color: '#94a3b8', padding: '12px 16px', borderRadius: 10, fontSize: 12, overflowX: 'auto', margin: 0, fontFamily: 'monospace', lineHeight: 1.6 }}>
                              {JSON.stringify(log.detail, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: page===0?C.text3:C.text, fontWeight: 600, cursor: page===0?'not-allowed':'pointer', fontSize: 14 }}>← Newer</button>
            <span style={{ padding: '8px 14px', fontSize: 14, fontWeight: 500, color: C.text3 }}>Page {page + 1} of {Math.ceil(total / LIMIT)}</span>
            <button disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color:(page+1)*LIMIT>=total?C.text3:C.text, fontWeight: 600, cursor:(page+1)*LIMIT>=total?'not-allowed':'pointer', fontSize: 14 }}>Older →</button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function ActivityPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div style={{ padding: 60, textAlign: 'center', color: '#A0A0C0' }}>Loading…</div>}>
        <ActivityInner/>
      </Suspense>
    </AppLayout>
  )
}
