'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

const C = {
  text:'#1A1410', text2:'#6B6056', text3:'#A89D94',
  border:'#E2DDD8', surface:'#F7F5F2', white:'#FFFFFF',
  green:'#1E7B4B', greenBg:'#F0FAF5', red:'#B91C1C', redBg:'#FEF2F2',
  accent:'#E8651A', accentDim:'#FFF7ED', primary:'#1a1a4e', gold:'#f3af00',
}
const ROLES = ['viewer','editor','admin'] as const

export default function TeamPage() {
  const params  = useSearchParams()
  const siteUrl = params.get('site') || ''
  const [siteId, setSiteId]     = useState('')
  const [members, setMembers]   = useState<any[]>([])
  const [email, setEmail]       = useState('')
  const [role, setRole]         = useState<'viewer'|'editor'|'admin'>('editor')
  const [inviting, setInviting] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [toast, setToast]       = useState('')

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(d => {
      const site = d.sites?.find((s: any) => s.url === siteUrl || !siteUrl) || d.sites?.[0]
      if (site) { setSiteId(site.id); loadMembers(site.id) }
      else setLoading(false)
    })
  }, [siteUrl])

  async function loadMembers(id: string) {
    setLoading(true)
    const res  = await fetch(`/api/team?siteId=${id}`)
    const data = await res.json()
    setMembers(data.members || [])
    setLoading(false)
  }

  async function invite() {
    if (!email.trim() || !siteId) return
    setInviting(true)
    const res  = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, email: email.trim(), role }) })
    const data = await res.json()
    if (data.success) {
      setEmail('')
      setToast('Invitation sent!')
      setTimeout(() => setToast(''), 3000)
      loadMembers(siteId)
    }
    setInviting(false)
  }

  async function updateMember(memberId: string, updates: any) {
    await fetch('/api/team', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, ...updates }) })
    loadMembers(siteId)
  }

  const roleColor = (r: string) => r === 'admin' ? C.accent : r === 'editor' ? '#7c3aed' : C.text3
  const statusColor = (s: string) => s === 'active' ? C.green : C.text3

  return (
    <AppLayout>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '36px 24px', fontFamily: 'Poppins,sans-serif' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.primary, marginBottom: 6 }}>Team Access</h1>
        <p style={{ fontSize: 14, color: C.text2, marginBottom: 28 }}>Invite collaborators to manage this site</p>

        {/* Invite form */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>Invite a Team Member</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com"
              onKeyDown={e => e.key === 'Enter' && invite()}
              style={{ flex: 1, minWidth: 200, padding: '11px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.text, fontFamily: 'Poppins,sans-serif' }} />
            <select value={role} onChange={e => setRole(e.target.value as any)}
              style={{ padding: '11px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.text, fontFamily: 'Poppins,sans-serif', background: C.white }}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <button onClick={invite} disabled={inviting || !email.trim()} style={{
              padding: '11px 22px', background: inviting ? C.border : C.primary, border: 'none', borderRadius: 10,
              color: 'white', fontSize: 14, fontWeight: 700, cursor: inviting ? 'not-allowed' : 'pointer',
            }}>
              {inviting ? '…' : 'Send Invite'}
            </button>
          </div>

          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {([
              { role: 'viewer', icon: '👁', desc: 'Can view activity and reports only' },
              { role: 'editor', icon: '✏️', desc: 'Can make changes via AI chat' },
              { role: 'admin',  icon: '⚡', desc: 'Full access including team management' },
            ]).map(r => (
              <div key={r.role} style={{ background: C.surface, borderRadius: 10, padding: '12px 14px', fontSize: 12, color: C.text2 }}>
                <span style={{ fontWeight: 700, color: roleColor(r.role) }}>{r.icon} {r.role.charAt(0).toUpperCase() + r.role.slice(1)}</span>
                <div style={{ marginTop: 4 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Members list */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, fontSize: 15, fontWeight: 700, color: C.text }}>
            Team Members ({members.length})
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>Loading…</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>👥</div>
              No team members yet — invite someone above
            </div>
          ) : members.map((m, i) => (
            <div key={m.id} style={{ padding: '16px 24px', borderBottom: i < members.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: C.primary }}>
                {m.email[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{m.email}</div>
                <div style={{ fontSize: 12, color: statusColor(m.status) }}>{m.status === 'active' ? '● Active' : '○ Invitation pending'}</div>
              </div>
              <select value={m.role} onChange={e => updateMember(m.id, { role: e.target.value })}
                style={{ padding: '6px 12px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: roleColor(m.role), fontWeight: 700, background: C.white, cursor: 'pointer' }}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={() => { if (confirm('Remove this team member?')) updateMember(m.id, { remove: true }) }}
                style={{ padding: '6px 12px', border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.text3, fontSize: 12, cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, background: C.green, color: 'white', padding: '12px 20px', borderRadius: 12, fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 9999 }}>
          ✓ {toast}
        </div>
      )}
    </AppLayout>
  )
}
