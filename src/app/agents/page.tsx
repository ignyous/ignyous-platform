'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

const C = {
  text:'#1A1410', text2:'#6B6056', text3:'#A89D94',
  border:'#E2DDD8', surface:'#F7F5F2', white:'#FFFFFF',
  green:'#1E7B4B', greenBg:'#F0FAF5', greenBorder:'#B8E5CF',
  red:'#B91C1C', redBg:'#FEF2F2',
  accent:'#E8651A', accentDim:'#FFF7ED',
  primary:'#1a1a4e', gold:'#f3af00',
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} style={{ width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: on ? C.green : C.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: on ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

export default function AgentsPage() {
  const params  = useSearchParams()
  const siteUrl = params.get('site') || ''
  const [siteId, setSiteId]       = useState('')
  const [agents, setAgents]       = useState<any[]>([])
  const [runs, setRuns]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [running, setRunning]     = useState<string | null>(null)
  const [selected, setSelected]   = useState<any | null>(null)
  const [toast, setToast]         = useState('')

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(d => {
      const site = d.sites?.find((s: any) => s.url === siteUrl || s.url === siteUrl.replace(/\/$/, '')) || d.sites?.[0]
      if (site) { setSiteId(site.id); load(site.id) }
      else setLoading(false)
    })
  }, [siteUrl])

  async function load(id = siteId) {
    setLoading(true)
    const r    = await fetch(`/api/agents?siteId=${id}`)
    const data = await r.json()
    setAgents(data.agents || [])
    setRuns(data.recentRuns || [])
    setLoading(false)
  }

  async function toggleAgent(agentId: string, enabled: boolean) {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, enabled } : a))
    await fetch('/api/agents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, agentId, enabled }) })
    showToast(enabled ? `✓ ${agentId} agent enabled` : `${agentId} agent disabled`)
  }

  async function runNow(agentId: string) {
    setRunning(agentId)
    try {
      const r    = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, agentId }) })
      const data = await r.json()
      showToast(data.success ? `✓ ${agentId}: ${data.summary?.slice(0, 80)}` : `⚠ Agent failed`)
      load()
    } catch { showToast('⚠ Failed to run agent') }
    setRunning(null)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 5000) }

  const statusColor = (status: string) => status === 'completed' ? C.green : status === 'running' ? C.gold : C.red
  const statusIcon  = (status: string) => status === 'completed' ? '✓' : status === 'running' ? '⏳' : '✗'

  if (loading) return <AppLayout><div style={{ padding: 60, textAlign: 'center', color: C.text3, fontFamily: 'Poppins,sans-serif' }}>Loading agents…</div></AppLayout>

  return (
    <AppLayout>
      <div style={{ display: 'flex', height: 'calc(100vh)', overflow: 'hidden', fontFamily: 'Poppins,sans-serif' }}>

        {/* Left: Agent list */}
        <div style={{ width: 420, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.white }}>
          <div style={{ padding: '24px 24px 0' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.primary, margin: 0 }}>AI Agents</h1>
            <p style={{ fontSize: 13, color: C.text2, margin: '6px 0 20px' }}>Autonomous agents that monitor and improve your site automatically</p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              {[{ label: 'Active', val: agents.filter(a => a.enabled).length, color: C.green },
                { label: 'Total Runs', val: runs.length, color: C.primary },
                { label: 'Successful', val: runs.filter(r => r.status === 'completed').length, color: C.accent }].map(s => (
                <div key={s.label} style={{ flex: 1, background: C.surface, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: C.text3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
            {agents.map(agent => (
              <div key={agent.id} onClick={() => setSelected(agent)} style={{
                padding: '16px', borderRadius: 14, marginBottom: 12, cursor: 'pointer',
                border: `1.5px solid ${selected?.id === agent.id ? C.primary : C.border}`,
                background: selected?.id === agent.id ? '#f0f0fa' : C.white,
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 24 }}>{agent.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{agent.name}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>🕐 {agent.schedule}</div>
                  </div>
                  <Toggle on={agent.enabled} onChange={v => toggleAgent(agent.id, v)} />
                </div>

                <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5, marginBottom: 10 }}>{agent.desc}</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {agent.lastRun ? (
                    <span style={{ fontSize: 11, color: statusColor(agent.lastRun.status), fontWeight: 600 }}>
                      {statusIcon(agent.lastRun.status)} Last run {new Date(agent.lastRun.startedAt).toLocaleDateString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: C.text3 }}>Never run</span>
                  )}
                  <button onClick={e => { e.stopPropagation(); runNow(agent.id) }} disabled={running === agent.id || !agent.enabled}
                    style={{ marginLeft: 'auto', padding: '5px 14px', background: running === agent.id ? C.border : C.primary, border: 'none', borderRadius: 8, color: 'white', fontSize: 11, fontWeight: 700, cursor: running === agent.id || !agent.enabled ? 'not-allowed' : 'pointer', opacity: !agent.enabled ? 0.5 : 1 }}>
                    {running === agent.id ? '⏳ Running…' : '▶ Run Now'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Detail + run history */}
        <div style={{ flex: 1, overflow: 'auto', background: C.surface }}>
          {!selected ? (
            <div style={{ padding: 60, textAlign: 'center', color: C.text3 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Select an agent to view details</div>
              <div style={{ fontSize: 14 }}>Enable agents to automate site maintenance, SEO, content, and security</div>
            </div>
          ) : (
            <div style={{ padding: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ fontSize: 42 }}>{selected.icon}</div>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: C.primary, margin: 0 }}>{selected.name}</h2>
                  <div style={{ fontSize: 13, color: C.text3 }}>Schedule: {selected.schedule}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                  <Toggle on={selected.enabled} onChange={v => { toggleAgent(selected.id, v); setSelected((a: any) => ({ ...a, enabled: v })) }} />
                  <button onClick={() => runNow(selected.id)} disabled={!!running || !selected.enabled}
                    style={{ padding: '9px 20px', background: running ? C.border : C.primary, border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: running || !selected.enabled ? 'not-allowed' : 'pointer' }}>
                    {running === selected.id ? '⏳ Running…' : '▶ Run Now'}
                  </button>
                </div>
              </div>

              {/* How it works */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>How this agent works</div>
                <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.7 }}>{selected.desc}</div>
                <div style={{ marginTop: 12, padding: '10px 14px', background: C.surface, borderRadius: 8, fontSize: 12, color: C.text3 }}>
                  💡 This agent uses Claude AI to reason about your site state before acting — it reads data, plans actions, and only changes what's needed.
                </div>
              </div>

              {/* Run history */}
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, fontSize: 15, fontWeight: 700, color: C.text }}>
                  Run History ({runs.filter(r => r.agentType === selected.id).length} runs)
                </div>
                {runs.filter(r => r.agentType === selected.id).length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>
                    No runs yet — enable the agent or click "Run Now"
                  </div>
                ) : runs.filter(r => r.agentType === selected.id).map((run, i) => (
                  <div key={run.id} style={{ padding: '16px 20px', borderBottom: i < runs.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: statusColor(run.status) }}>{statusIcon(run.status)} {run.status}</span>
                      <span style={{ fontSize: 12, color: C.text3, marginLeft: 'auto' }}>
                        {new Date(run.startedAt).toLocaleDateString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                        {run.completedAt && ` · ${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`}
                      </span>
                      <span style={{ fontSize: 11, background: run.triggeredBy === 'manual' ? C.accentDim : C.surface, color: C.text3, padding: '2px 8px', borderRadius: 6 }}>{run.triggeredBy}</span>
                    </div>
                    {run.summary && <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>{run.summary}</div>}
                    {(run.actionsLog as any[])?.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {((run.actionsLog as any[]) || []).slice(0, 3).map((log: any, li: number) => (
                          <div key={li} style={{ fontSize: 12, color: C.text3, padding: '3px 0', borderTop: li > 0 ? `1px solid ${C.border}` : 'none' }}>
                            <span style={{ fontWeight: 600 }}>{log.action}</span>
                            {log.result?.message && ` — ${log.result.message}`}
                          </div>
                        ))}
                        {((run.actionsLog as any[]) || []).length > 3 && (
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>+ {((run.actionsLog as any[]) || []).length - 3} more actions</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, background: C.primary, color: 'white', padding: '13px 20px', borderRadius: 12, fontFamily: 'Poppins,sans-serif', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 9999, maxWidth: 400, lineHeight: 1.4 }}>
          {toast}
        </div>
      )}
    </AppLayout>
  )
}
