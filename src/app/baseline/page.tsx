// src/app/baseline/page.tsx
//
// Lists the user's connected sites and links into the baseline editor.

'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Site { id: string; url: string; name?: string | null; theme?: string | null; builder?: string | null }

export default function BaselineHome() {
  const [sites, setSites]   = useState<Site[]>([])
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(d => {
      if (d.error) setError(d.error)
      else setSites(d.sites || [])
      setLoad(false)
    }).catch(e => { setError(String(e)); setLoad(false) })
  }, [])

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 32, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Baseline Editor</h1>
      <p style={{ color: '#6B6056', marginBottom: 24 }}>
        Phase 0 — basic text and color edits on the default WordPress theme. Every change is snapshotted; you can undo anything.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Your connected sites</h2>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: '#B91C1C' }}>{error}</p>}
      {!loading && sites.length === 0 && (
        <div style={{ padding: 16, border: '1px solid #E2DDD8', borderRadius: 8, background: '#F7F5F2' }}>
          <p>No sites connected yet.</p>
          <p style={{ marginTop: 8 }}>
            <Link href="/bridge/connect" style={{ color: '#2563eb' }}>Connect a site →</Link>
          </p>
        </div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sites.map(s => (
          <li key={s.id} style={{ marginBottom: 8 }}>
            <Link
              href={`/baseline/${s.id}`}
              style={{ display: 'block', padding: 12, border: '1px solid #E2DDD8', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ fontWeight: 600 }}>{s.name || s.url}</div>
              <div style={{ fontSize: 13, color: '#6B6056' }}>{s.url}</div>
              {(s.theme || s.builder) && (
                <div style={{ fontSize: 12, color: '#A89D94', marginTop: 4 }}>
                  {[s.theme, s.builder].filter(Boolean).join(' · ')}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 32, padding: 16, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 14 }}>
        <strong>Need the plugin?</strong>{' '}
        <a href="/api/baseline/bridge.zip" style={{ color: '#92400E' }}>Download ignyous-bridge-baseline.zip</a>{' '}
        and upload it via WP Admin → Plugins → Add New → Upload Plugin.
      </div>
    </div>
  )
}
