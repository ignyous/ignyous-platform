'use client'
import { useState, useEffect } from 'react'
import AppLayout from '@/components/AppLayout'
import Link from 'next/link'

const C = {
  text:'#1A1410', text2:'#6B6056', text3:'#A89D94',
  border:'#E2DDD8', surface:'#F7F5F2', white:'#FFFFFF',
  green:'#1E7B4B', greenBg:'#F0FAF5', greenBorder:'#B8E5CF',
  red:'#B91C1C', redBg:'#FEF2F2', redBorder:'#FECACA',
  yellow:'#92400E', yellowBg:'#FFFBEB', yellowBorder:'#FDE68A',
  accent:'#E8651A', gold:'#f3af00', primary:'#1a1a4e',
}

interface SiteCard {
  id: string; url: string; name: string | null; apiKey: string
  uptime: { status: 'up'|'down'|'degraded'|'unknown'; latencyMs?: number; checkedAt?: string }
  lastActivity: string | null
  issueCount: number
  teamCount: number
}

export default function OverviewPage() {
  const [sites, setSites]     = useState<SiteCard[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState<string | null>(null)

  useEffect(() => { loadOverview() }, [])

  async function loadOverview() {
    setLoading(true)
    try {
      const res  = await fetch('/api/overview')
      const data = await res.json()
      setSites(data.sites || [])
    } catch {}
    setLoading(false)
  }

  async function checkUptime(siteId: string) {
    setChecking(siteId)
    await fetch('/api/uptime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId }) })
    await loadOverview()
    setChecking(null)
  }

  const statusColor = (s: string) => s === 'up' ? C.green : s === 'down' ? C.red : s === 'degraded' ? C.yellow : C.text3
  const statusBg    = (s: string) => s === 'up' ? C.greenBg : s === 'down' ? C.redBg : s === 'degraded' ? C.yellowBg : C.surface
  const statusLabel = (s: string) => s === 'up' ? '● Online' : s === 'down' ? '● Down' : s === 'degraded' ? '● Slow' : '○ Unknown'

  if (loading) return (
    <AppLayout><div style={{ padding: 80, textAlign: 'center', color: C.text3, fontFamily: 'Poppins,sans-serif' }}>Loading sites…</div></AppLayout>
  )

  return (
    <AppLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 28px', fontFamily: 'Poppins,sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.primary, margin: 0 }}>All Sites</h1>
            <p style={{ color: C.text2, fontSize: 14, margin: '4px 0 0' }}>{sites.length} connected site{sites.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={loadOverview} style={{ padding: '9px 18px', border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, color: C.text2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>↺ Refresh</button>
            <Link href="/bridge/connect" style={{ padding: '9px 18px', background: C.gold, border: 'none', borderRadius: 10, color: C.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ Connect Site</Link>
          </div>
        </div>

        {/* Summary bar */}
        {sites.length > 0 && (() => {
          const up   = sites.filter(s => s.uptime.status === 'up').length
          const down = sites.filter(s => s.uptime.status === 'down').length
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
              {[
                { label: 'Total Sites',  value: sites.length,            color: C.primary },
                { label: 'Online',       value: up,                       color: C.green   },
                { label: 'Down',         value: down,                     color: down > 0 ? C.red : C.text3 },
                { label: 'Total Issues', value: sites.reduce((a,s) => a + s.issueCount, 0), color: C.accent },
              ].map(stat => (
                <div key={stat.label} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Site cards */}
        {sites.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.text3 }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🌐</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>No sites connected yet</div>
            <Link href="/bridge/connect" style={{ display: 'inline-block', marginTop: 16, padding: '12px 28px', background: C.gold, borderRadius: 10, color: C.primary, textDecoration: 'none', fontWeight: 700 }}>Connect Your First Site</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sites.map(site => {
              const slug = site.url.replace(/^https?:\/\//, '').replace(/\/$/, '')
              return (
                <div key={site.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
                  {/* Site icon */}
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🌐</div>

                  {/* Name + URL */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>{site.name || slug}</div>
                    <a href={site.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.text3, textDecoration: 'none' }}>{slug}</a>
                  </div>

                  {/* Uptime status */}
                  <div style={{ background: statusBg(site.uptime.status), color: statusColor(site.uptime.status), padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {statusLabel(site.uptime.status)}
                    {site.uptime.latencyMs && <span style={{ fontWeight: 400, opacity: 0.75 }}> · {site.uptime.latencyMs}ms</span>}
                  </div>

                  {/* Issues */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: site.issueCount > 0 ? C.accent : C.green }}>{site.issueCount}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>issues</div>
                  </div>

                  {/* Team */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{site.teamCount}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>team</div>
                  </div>

                  {/* Last activity */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: C.text3 }}>Last activity</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text2 }}>
                      {site.lastActivity ? new Date(site.lastActivity).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Never'}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => checkUptime(site.id)} disabled={checking === site.id}
                      style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text2, fontSize: 12, cursor: 'pointer' }}>
                      {checking === site.id ? '…' : '↻ Ping'}
                    </button>
                    <Link href={`/dashboard?site=${encodeURIComponent(site.url)}&key=`}
                      style={{ padding: '7px 14px', background: C.primary, borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                      Open →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
