import { NextRequest, NextResponse } from 'next/server'
import axios, { AxiosError } from 'axios'

const MIN_WP_VERSION = 5.6

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, wpUser, wpPass, checkOnly = false } = await req.json()

    if (!siteUrl || !wpUser || !wpPass) {
      return NextResponse.json(
        { error: 'siteUrl, wpUser, and wpPass are required' },
        { status: 400 }
      )
    }

    const base    = siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
    const auth    = Buffer.from(`${wpUser}:${wpPass}`).toString('base64')
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type':  'application/json',
      'User-Agent':    'ignyous-platform/1.0',
    }

    const requirements = await checkRequirements(base, headers)

    if (checkOnly) {
      return NextResponse.json({ requirements })
    }

    const failed = requirements.filter(r => !r.pass && r.required)
    if (failed.length > 0) {
      return NextResponse.json({
        success: false,
        requirements,
        reason:  'requirements_failed',
        failed:  failed.map(f => f.name),
        manual_instructions: buildManualInstructions(base, failed),
      })
    }

    const result = await installPlugin(base, auth, headers)

    return NextResponse.json({
      success:      result.success,
      requirements,
      plugin_file:  result.plugin_file,
      error:        result.error,
      manual_instructions: result.success ? null : buildManualInstructions(base, []),
      message: result.success ? 'ignyous Bridge installed and activated' : undefined,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── Requirements ─────────────────────────────────────────────────
async function checkRequirements(base: string, headers: any) {
  const checks = await Promise.allSettled([
    checkRestApi(base),
    checkWpVersion(base),
    checkCredentials(base, headers),
    checkPluginPermissions(base, headers),
    checkAlreadyInstalled(base),
  ])

  return [
    resolve(checks[0], 'REST API',            true,  'WordPress REST API must be accessible'),
    resolve(checks[1], 'WordPress Version',   true,  `WordPress ${MIN_WP_VERSION}+ required for Application Passwords`),
    resolve(checks[2], 'Admin Credentials',   true,  'Must be a valid Administrator account'),
    resolve(checks[3], 'Plugin Permissions',  true,  'Account must be able to install plugins'),
    resolve(checks[4], 'Not Already Installed', false, 'ignyous Bridge not yet installed'),
  ]
}

function resolve(
  settled: PromiseSettledResult<any>,
  name: string,
  required: boolean,
  description: string
) {
  if (settled.status === 'fulfilled') {
    return { name, required, description, pass: settled.value.pass, detail: settled.value.detail }
  }
  return { name, required, description, pass: false, detail: settled.reason?.message || 'Check failed' }
}

async function checkRestApi(base: string) {
  try {
    const res = await axios.get(`${base}/wp-json/`, { timeout: 8000, validateStatus: () => true })
    const hasV2 = res.data?.namespaces?.includes?.('wp/v2')
    if (res.status === 200 && hasV2) return { pass: true, detail: 'REST API is active' }
    if (res.status === 200) return { pass: true, detail: 'REST API responded (namespaces not listed)' }
    return { pass: false, detail: `REST API returned status ${res.status}. Try: WP Admin → Settings → Permalinks → Save` }
  } catch {
    return { pass: false, detail: 'REST API unreachable — may be blocked by a security plugin (Wordfence, iThemes)' }
  }
}

async function checkWpVersion(base: string) {
  try {
    const res     = await axios.get(`${base}/wp-json/`, { timeout: 8000, validateStatus: () => true })
    const gen     = res.data?.generator || ''
    const match   = gen.match(/(\d+\.\d+)/)
    const version = match ? parseFloat(match[1]) : 0
    if (version >= MIN_WP_VERSION) return { pass: true, detail: `WordPress ${version} — supported` }
    if (version > 0) return { pass: false, detail: `WordPress ${version} is too old. Requires ${MIN_WP_VERSION}+` }
    return { pass: true, detail: 'Version not detected — assuming compatible' }
  } catch {
    return { pass: true, detail: 'Version check skipped — assuming compatible' }
  }
}

async function checkCredentials(base: string, headers: any) {
  try {
    // Fetch /users/me with edit context to get full data including roles
    const meRes = await axios.get(`${base}/wp-json/wp/v2/users/me`, {
      headers,
      params: { context: 'edit' },
      timeout: 8000,
      validateStatus: (s) => s < 500,
    })

    if (meRes.status === 401 || meRes.status === 403) {
      return {
        pass: false,
        detail: 'Invalid credentials. Make sure to use a WordPress Application Password — go to WP Admin → Users → Profile → Application Passwords → Generate.',
      }
    }

    const data = meRes.data
    const name = data?.name || data?.user_login || 'Unknown'

    // Method 1: roles array
    const roles = Array.isArray(data?.roles) ? data.roles : []
    if (roles.includes('administrator')) {
      return { pass: true, detail: `Authenticated as ${name} (Administrator)` }
    }

    // Method 2: capabilities object
    const caps = data?.capabilities || {}
    if (caps['administrator'] === true || caps.administrator === true) {
      return { pass: true, detail: `Authenticated as ${name} (Administrator via capabilities)` }
    }

    // Method 3: super admin flag
    if (data?.is_super_admin === true) {
      return { pass: true, detail: `Authenticated as ${name} (Super Admin)` }
    }

    // Method 4: try accessing admin-only /wp/v2/settings endpoint
    const settingsRes = await axios.get(`${base}/wp-json/wp/v2/settings`, {
      headers, timeout: 8000, validateStatus: () => true,
    })

    if (settingsRes.status === 200) {
      return { pass: true, detail: `Authenticated as ${name} — admin confirmed via settings access` }
    }

    // Method 5: try listing all users (only admins can do this with full data)
    const usersRes = await axios.get(`${base}/wp-json/wp/v2/users`, {
      headers, params: { context: 'edit' }, timeout: 8000, validateStatus: () => true,
    })

    if (usersRes.status === 200 && Array.isArray(usersRes.data) && usersRes.data.length > 0) {
      return { pass: true, detail: `Authenticated as ${name} — admin confirmed via user list access` }
    }

    return {
      pass: false,
      detail: `Logged in as ${name} but could not confirm Administrator role. Make sure this user is an Administrator in WP Admin → Users.`,
    }

  } catch (err: any) {
    const status = (err as AxiosError)?.response?.status
    if (status === 401) {
      return {
        pass: false,
        detail: 'Authentication failed. Use a WordPress Application Password: WP Admin → Users → Profile → scroll to Application Passwords → Generate.',
      }
    }
    return { pass: false, detail: `Credential check failed: ${err.message}` }
  }
}

async function checkPluginPermissions(base: string, headers: any) {
  try {
    const res = await axios.get(`${base}/wp-json/wp/v2/plugins`, {
      headers, timeout: 8000, validateStatus: () => true,
    })
    if (res.status === 200) return { pass: true, detail: `Can manage plugins (${Array.isArray(res.data) ? res.data.length : '?'} installed)` }
    if (res.status === 403) return { pass: false, detail: 'Account cannot manage plugins' }
    // 404 = endpoint not available (WP < 5.5) — assume ok and try the install
    return { pass: true, detail: 'Plugin endpoint not available — will attempt install anyway' }
  } catch {
    return { pass: true, detail: 'Could not check plugin permissions — will attempt install' }
  }
}

async function checkAlreadyInstalled(base: string) {
  try {
    const res = await axios.get(`${base}/wp-json/ignyous/v1/verify`, {
      timeout: 5000, validateStatus: () => true,
    })
    // 200 or 401 both mean the plugin IS installed (401 = plugin there but no key set)
    if (res.status === 200 || res.status === 401) {
      return { pass: false, detail: 'ignyous Bridge is already installed on this site' }
    }
    return { pass: true, detail: 'Not yet installed — ready to install' }
  } catch {
    return { pass: true, detail: 'Not yet installed — ready to install' }
  }
}

// ─── Plugin Installation ───────────────────────────────────────────
async function installPlugin(base: string, auth: string, headers: any) {
  // Strategy 1: WP REST API plugin install (WP 5.5+ endpoint)
  try {
    const res = await axios.post(
      `${base}/wp-json/wp/v2/plugins`,
      { slug: 'ignyous-bridge', status: 'active' },
      { headers, timeout: 30000, validateStatus: () => true }
    )
    if (res.status === 201 && res.data?.plugin) {
      return { success: true, plugin_file: res.data.plugin }
    }
  } catch { /* fall through to Strategy 2 */ }

  // Strategy 2: Upload zip via WP admin
  try {
    // Get nonce from plugin upload page
    const pageRes = await axios.get(`${base}/wp-admin/plugin-install.php?tab=upload`, {
      headers: { 'Authorization': `Basic ${auth}`, 'User-Agent': 'Mozilla/5.0 ignyous-platform' },
      timeout: 15000, maxRedirects: 5, validateStatus: () => true,
    })

    const nonceMatch = (pageRes.data || '').match(/_wpnonce['"]\s*:\s*['"]([a-f0-9]+)['"]/i)
      || (pageRes.data || '').match(/name="_wpnonce"\s+value="([^"]+)"/i)

    if (!nonceMatch?.[1]) {
      return { success: false, error: 'Could not get WordPress security token. Use manual install instead.' }
    }

    const PLUGIN_URL = `${process.env.NEXTAUTH_URL || 'https://ignyous-platform.vercel.app'}/api/plugin/bridge.zip`
    const zipRes     = await axios.get(PLUGIN_URL, { responseType: 'arraybuffer', timeout: 15000 })
    const zipBuffer  = Buffer.from(zipRes.data)

    const FormData   = (await import('form-data')).default
    const form       = new FormData()
    form.append('_wpnonce', nonceMatch[1])
    form.append('_wp_http_referer', '/wp-admin/plugin-install.php')
    form.append('pluginzip', zipBuffer, { filename: 'ignyous-bridge.zip', contentType: 'application/zip' })

    const uploadRes = await axios.post(
      `${base}/wp-admin/update.php?action=upload-plugin`,
      form,
      {
        headers: { ...form.getHeaders(), 'Authorization': `Basic ${auth}`, 'User-Agent': 'Mozilla/5.0 ignyous-platform' },
        timeout: 30000, maxRedirects: 5, validateStatus: () => true,
      }
    )

    const text = uploadRes.data?.toString() || ''
    if (text.includes('Plugin installed successfully') || text.includes('activate_plugin') || text.includes('ignyous-bridge')) {
      await activatePlugin(base, auth)
      return { success: true, plugin_file: 'ignyous-bridge/ignyous-bridge.php' }
    }

    return { success: false, error: 'Upload did not complete. Your host may block plugin uploads via HTTP. Use manual install.' }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function activatePlugin(base: string, auth: string) {
  try {
    await axios.put(
      `${base}/wp-json/wp/v2/plugins/ignyous-bridge%2Fignyous-bridge`,
      { status: 'active' },
      {
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        timeout: 15000, validateStatus: () => true,
      }
    )
  } catch { /* non-fatal */ }
}

// ─── Manual instructions ──────────────────────────────────────────
function buildManualInstructions(base: string, failedChecks: any[]) {
  const issues = failedChecks.map(f => f.name)

  if (issues.includes('REST API')) {
    return {
      reason: 'REST API is blocked on your site',
      steps: [
        'Go to WP Admin → Settings → Permalinks → click Save Changes (re-enables REST API)',
        'If using a security plugin (Wordfence, iThemes Security), whitelist the REST API',
        'Then try the requirements check again',
      ],
    }
  }

  if (issues.includes('Admin Credentials')) {
    return {
      reason: 'Credentials could not be verified via REST API',
      steps: [
        'Go to WP Admin → Users → Your Profile',
        'Scroll to the bottom — find "Application Passwords"',
        'Type "ignyous" in the name field and click "Add New Application Password"',
        'Copy the generated password (with spaces) and use that as your password here',
        'Your username stays the same',
      ],
    }
  }

  return {
    reason: 'Auto-install is not available for this site',
    steps: [
      'Download ignyous-bridge.zip from the ignyous dashboard',
      'Go to WP Admin → Plugins → Add New → Upload Plugin',
      'Upload ignyous-bridge.zip → Install Now → Activate',
      'Go to Settings → ignyous Bridge → save your API key',
    ],
  }
}
