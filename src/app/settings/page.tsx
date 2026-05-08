'use client'
import { useState, useEffect } from 'react'
import AppLayout from '@/components/AppLayout'

const C = {
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', greenBg: '#F0FAF5', greenBorder: '#B8E5CF',
  text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
}

export default function SettingsPage() {
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [phone, setPhone]   = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(data => {
      if (data.user) {
        setName(data.user.name || '')
        setEmail(data.user.email || '')
        setPhone(data.user.phone || '')
      }
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true); setSaved(false)
    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <AppLayout><div style={{ padding: 60, textAlign: 'center', color: C.text3 }}>Loading…</div></AppLayout>

  return (
    <AppLayout>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 8 }}>Settings</h1>
        <p style={{ fontSize: 15, color: C.text2, marginBottom: 32 }}>Manage your account and SMS commands</p>

        {/* Profile */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 16 }}>Profile</div>
          
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: C.text2, display: 'block', marginBottom: 6 }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, color: C.text }}/>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: C.text2, display: 'block', marginBottom: 6 }}>Email</label>
            <input value={email} disabled style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, color: C.text3, background: C.surface }}/>
          </div>
        </div>

        {/* SMS Commands */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>📱</span>
            <div style={{ fontSize: 17, fontWeight: 600, color: C.text }}>SMS Commands</div>
          </div>
          <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 16 }}>
            Link your phone number to control your site via text message. Just text your changes to the ignyous number and they'll be applied automatically.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: C.text2, display: 'block', marginBottom: 6 }}>Your Phone Number</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 123-4567"
              style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, color: C.text }}/>
          </div>

          <div style={{ padding: '14px 16px', background: C.surface, borderRadius: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>How it works</div>
            <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.7 }}>
              Text your ignyous number with plain English commands like:<br/>
              • "50% off all items this weekend"<br/>
              • "Add a holiday banner to my homepage"<br/>
              • "Change my business hours to 9am-6pm"<br/>
              • "Add a new service: Emergency Repairs"<br/><br/>
              ignyous AI reads your message, makes the changes, and texts you back with confirmation.
            </div>
          </div>

          {process.env.NEXT_PUBLIC_TWILIO_NUMBER && (
            <div style={{ padding: '12px 16px', background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>
                Text your commands to: {process.env.NEXT_PUBLIC_TWILIO_NUMBER}
              </div>
            </div>
          )}
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '14px 32px', background: saving ? '#ccc' : C.accent, border: 'none', borderRadius: 12,
            color: 'white', fontSize: 16, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {saved && <span style={{ fontSize: 14, color: C.green, fontWeight: 500 }}>✓ Saved!</span>}
        </div>
      </div>
    </AppLayout>
  )
}
