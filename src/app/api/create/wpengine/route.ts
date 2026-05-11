import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

const WPE_API = 'https://api.wpengineapi.com/v1'

function wpeAuth(username: string, password: string) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
}

async function wpeCall(username: string, password: string, path: string, method = 'GET', body?: any) {
  const res = await fetch(`${WPE_API}${path}`, {
    method,
    headers: {
      'Authorization': wpeAuth(username, password),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, username, password, installName, accountId, installId } = await req.json()

  // ── Validate credentials + get account info ──────────────────
  if (action === 'validate') {
    const { ok, data } = await wpeCall(username, password, '/accounts')
    if (!ok) return NextResponse.json({ success: false, error: 'Invalid credentials — check your WP Engine API username and password' })
    const accounts = data.results || []
    return NextResponse.json({ success: true, accounts: accounts.map((a: any) => ({ id: a.id, name: a.name, status: a.status })) })
  }

  // ── Create a new install (temp domain = installName.wpengine.com) ──
  if (action === 'create_install') {
    // Install name must be lowercase letters, numbers, hyphens; max 15 chars
    const safeName = installName.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 15)

    const { ok, data, status } = await wpeCall(username, password, '/installs', 'POST', {
      account_id:  accountId,
      name:        safeName,
      environment: 'production',
      region:      'us-east-2', // WP Engine default region
    })

    if (!ok) {
      const errMsg = data.message || data.error || `WP Engine API error ${status}`
      return NextResponse.json({ success: false, error: errMsg, raw: data })
    }

    return NextResponse.json({
      success:   true,
      installId: data.id,
      name:      data.name,
      domain:    `${data.name}.wpengine.com`,
      status:    data.status,
      cname:     data.cname,
    })
  }

  // ── Poll install status ───────────────────────────────────────
  if (action === 'poll_status') {
    const { ok, data } = await wpeCall(username, password, `/installs/${installId}`)
    if (!ok) return NextResponse.json({ success: false, error: 'Could not get install status' })
    return NextResponse.json({
      success: true,
      status:  data.status,       // transferring | active | etc.
      ready:   data.status === 'active' || data.status === 'running',
      domain:  data.cname || `${data.name}.wpengine.com`,
      wpAdmin: `https://${data.name}.wpengineapi.com/wp-admin`,
    })
  }

  // ── List all installs for an account ─────────────────────────
  if (action === 'list_installs') {
    const { ok, data } = await wpeCall(username, password, `/installs?account_id=${accountId}`)
    if (!ok) return NextResponse.json({ success: false, error: 'Could not list installs' })
    return NextResponse.json({
      success:  true,
      installs: (data.results || []).map((i: any) => ({ id: i.id, name: i.name, domain: `${i.name}.wpengine.com`, status: i.status, environment: i.environment })),
    })
  }

  // ── Create/reset WordPress admin user ────────────────────────
  // WP Engine can add users to installs — gives us WP-level access
  if (action === 'create_wp_user') {
    const { ok, data } = await wpeCall(username, password, `/installs/${installId}/users`, 'POST', {
      username: 'ignyous_admin',
      email:    session.user.email,
      role:     'admin',
    })
    if (!ok) return NextResponse.json({ success: false, error: data.message || 'Could not create WP user', raw: data })
    return NextResponse.json({ success: true, wpUser: data })
  }

  // ── Add custom domain to an install ──────────────────────────
  if (action === 'add_domain') {
    const { customDomain } = await req.json()
    const { ok, data } = await wpeCall(username, password, `/installs/${installId}/domains`, 'POST', {
      name:    customDomain,
      primary: true,
    })
    if (!ok) return NextResponse.json({ success: false, error: data.message || 'Could not add domain' })
    return NextResponse.json({ success: true, domain: data })
  }

  // ── Delete an install (cleanup) ───────────────────────────────
  if (action === 'delete_install') {
    const { ok } = await wpeCall(username, password, `/installs/${installId}`, 'DELETE')
    return NextResponse.json({ success: ok })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// GET — test credentials stored in session/env
export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use env credentials as fallback (for shared platform mode)
  const username = process.env.WPENGINE_API_USER || ''
  const password = process.env.WPENGINE_API_PASS || ''

  if (!username || !password) return NextResponse.json({ connected: false, reason: 'No WP Engine credentials configured' })

  const { ok, data } = await wpeCall(username, password, '/accounts')
  return NextResponse.json({
    connected: ok,
    accounts:  ok ? (data.results || []).map((a: any) => ({ id: a.id, name: a.name })) : [],
  })
}
