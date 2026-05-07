'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const C = {
  accent: '#E8651A', accentDim: '#FFF7ED', accentBorder: '#FED7AA',
  green: '#1E7B4B', text: '#1A1410', text2: '#6B6056', text3: '#A89D94',
  border: '#E2DDD8', surface: '#F7F5F2', white: '#FFFFFF',
  red: '#B91C1C', redBg: '#FEF2F2', redBorder: '#FECACA',
}

export default function LoginPage() {
  const router     = useRouter()
  const params     = useSearchParams()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [tab, setTab]           = useState<'login'|'register'>('login')
  const [name, setName]         = useState('')

  const callbackUrl = params.get('callbackUrl') || '/'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    if (tab === 'register') {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
    }

    const result = await signIn('credentials', {
      email, password, redirect: false, callbackUrl,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push(callbackUrl)
    }
  }

  async function handleGoogle() {
    await signIn('google', { callbackUrl })
  }

  return (
    <div style={{ minHeight: '100vh', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 42, height: 42, background: C.accent, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="white">
                <path d="M8 1L2 5v6l6 4 6-4V5L8 1zm0 2l4 2.7V11L8 13.4 4 11V5.7L8 3z"/>
              </svg>
            </div>
            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: 24, fontWeight: 700, color: C.text }}>
              ignyous<span style={{ color: C.accent }}>.ai</span>
            </span>
          </div>
          <div style={{ fontSize: 14, color: C.text3 }}>AI-powered WordPress management</div>
        </div>

        {/* Card */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
            {(['login', 'register'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '16px', border: 'none', cursor: 'pointer',
                background: tab === t ? C.white : C.surface, fontFamily: 'DM Sans, sans-serif',
                fontSize: 14, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? C.text : C.text3,
                borderBottom: `2px solid ${tab === t ? C.accent : 'transparent'}`,
              }}>{t === 'login' ? 'Sign In' : 'Create Account'}</button>
            ))}
          </div>

          <div style={{ padding: '28px 32px' }}>

            {/* Google button */}
            <button onClick={handleGoogle} style={{
              width: '100%', padding: '12px', border: `1.5px solid ${C.border}`, borderRadius: 12,
              background: C.white, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              fontSize: 14, fontWeight: 500, color: C.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              marginBottom: 20, transition: 'all 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#4285F4'}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.3-.2-2.7-.5-4z"/>
                <path fill="#34A853" d="M6.3 14.7l7 5.1C15.2 16.2 19.3 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 16.3 3 9.7 7.9 6.3 14.7z"/>
                <path fill="#FBBC05" d="M24 45c5.5 0 10.5-1.9 14.4-5l-6.7-5.5C29.8 36.1 27 37 24 37c-6.1 0-11.3-4.1-13.2-9.7l-7 5.4C7.5 41.4 15.2 45 24 45z"/>
                <path fill="#EA4335" d="M44.5 20H24v8.5h11.8C35 32 32.1 34.6 28.6 35.6l6.7 5.5C39.8 37.5 44.5 31.3 44.5 24c0-1.3-.2-2.7-.5-4z"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: C.border }}/>
              <span style={{ fontSize: 12, color: C.text3, fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: C.border }}/>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '12px 14px', background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, color: C.red, fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              {tab === 'register' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Joe Smith"
                    style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: C.text }}/>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"
                  style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: C.text }}/>
              </div>

              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
                  {tab === 'login' && <a href="/forgot-password" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>Forgot?</a>}
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                  style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: C.text }}/>
                {tab === 'register' && <div style={{ fontSize: 11, color: C.text3, marginTop: 5 }}>Minimum 8 characters</div>}
              </div>

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '14px', background: loading ? '#C9541A' : C.accent,
                border: 'none', borderRadius: 12, color: 'white', fontSize: 15, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Sora, sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 2px 10px rgba(232,101,26,0.3)',
              }}>
                {loading && <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>}
                {loading ? 'Please wait…' : tab === 'login' ? 'Sign In →' : 'Create Account →'}
              </button>
            </form>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: C.text3 }}>
          By continuing you agree to our{' '}
          <a href="/terms" style={{ color: C.text2, textDecoration: 'none' }}>Terms</a>
          {' & '}
          <a href="/privacy" style={{ color: C.text2, textDecoration: 'none' }}>Privacy Policy</a>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}