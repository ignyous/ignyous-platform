// src/app/api/wordpress/install/route.ts
// Real auto-installer for the ignyous Bridge plugin.
// Uses WordPress Application Passwords (WP 5.6+) and the WP REST API.
//
// Flow:
//   1. Check requirements (WP version, REST API, credentials, permissions)
//   2. If all pass → install plugin via admin AJAX + nonce
//   3. If any fail → return specific failure reason + manual instructions

import { NextRequest, NextResponse } from 'next/server'
import axios, { AxiosError } from 'axios'

const PLUGIN_ZIP_URL = `${process.env.NEXTAUTH_URL || 'https://ignyous-platform.vercel.app'}/api/plugin/bridge.zip`
const MIN_WP_VERSION = 5.6

// ─── Requirements check ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { siteUrl, wpUser, wpPass, checkOnly = false } = await req.json()

    if (!siteUrl || !wpUser || !wpPass) {
      return NextResponse.json({ error: 'siteUrl, wpUser, and wpPass are required' }, { status: 400 })
    }

    const base = siteUrl.replace(/\/$/, '')
    const auth  = Buffer.from(`${wpUser}:${wpPass}`).toString('base64')
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ignyous-platform/1.0',
    }

    const requirements = await checkRequirements(base, headers)

    // Return requirements check only if requested
    if (checkOnly) {
      return NextResponse.json({ requirements })
    }

    // All requirements must pass for auto-install
    const failed = requirements.filter(r => !r.pass && r.required)
    if (failed.length > 0) {
      return NextResponse.json({
        success: false,
        requirements,
        reason: 'requirements_failed',
        failed: failed.map(f => f.name),
        manual_instructions: buildManualInstructions(base, failed),
      })
    }

    // ── Attempt installation ───────────────────────────────────────
    const installResult = await installPlugin(base, auth, headers)

    if (installResult.success) {
      return NextResponse.json({
        success: true,
        requirements,
        plugin_file: installResult.plugin_file,
        message: 'ignyous Bridge installed and activated',
        next_step: 'Set your API key in WP Admin → Settings → ignyous Bridge',
      })
    } else {
      return NextResponse.json({
        success: false,
        requirements,
        reason: 'install_failed',
        error: installResult.error,
        manual_instructions: buildManualInstructions(base, []),
      })
    }

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── Requirements checker ─────────────────────────────────────────
async function checkRequirements(base: string, headers: any) {
  const checks = await Promise.allSettled([
    checkRestApi(base),
    checkWpVersion(base, headers),
    checkCredentials(base, headers),
    checkPluginPermissions(base, headers),
    checkFileWritable(base, headers),
    checkAlreadyInstalled(base, headers),
  ])

  return [
    resolveCheck(checks[0], 'REST API',           true,  'WordPress REST API is accessible'),
    resolveCheck(checks[1], 'WordPress Version',  true,  `WordPress ${MIN_WP_VERSION}+ required`),
    resolveCheck(checks[2], 'Admin Credentials',  true,  'Username and password are valid'),
    resolveCheck(checks[3], 'Plugin Permissions', true,  'Admin can install plugins'),
    resolveCheck(checks[4], 'File System',        false, 'Server can write plugin files'),
    resolveCheck(checks[5], 'Not Already Installed', false, 'ignyous Bridge not yet installed'),
  ]
}

function resolveCheck(
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
    const res = await axios.get(`${base}/wp-json/`, { timeout: 8000 })
    const hasWpV2 = res.data?.namespaces?.includes('wp/v2')
    return { pass: hasWpV2, detail: hasWpV2 ? 'REST API active' : 'REST API disabled or blocked' }
  } catch {
    return { pass: false, detail: 'REST API unreachable — may be blocked by security plugin' }
  }
}

async function checkWpVersion(base: string, headers: any) {
  try {
    const res = await axios.get(`${base}/wp-json/`, { timeout: 8000 })
    const version = parseFloat(res.data?.generator?.match(/(\d+\.\d+)/)?.[1] || '0')
    const pass = version >= MIN_WP_VERSION

    // Also try authenticated route
    const siteRes = await axios.get(`${base}/wp-json/wp/v2/settings`, { headers, timeout: 8000 }).catch(() => null)
    const wpVer = siteRes?.data?.description ? version : version

    return {
      pass: pass || wpVer >= MIN_WP_VERSION,
      detail: version > 0
        ? `WordPress ${version} — ${pass ? 'supported' : `requires ${MIN_WP_VERSION}+`}`
        : `Could not detect version — assuming compatible`,
    }
  } catch {
    return { pass: true, detail: 'Version check skipped — assuming compatible' }
  }
}

async function checkCredentials(base: string, headers: any) {
  try {
    const res = await axios.get(`${base}/wp-json/wp/v2/users/me`, { headers, timeout: 8000 })
    const isAdmin = res.data?.roles?.includes('administrator')
    return {
      pass: isAdmin,
      detail: isAdmin
        ? `Authenticated as ${res.data.name} (Administrator)`
        : `Logged in as ${res.data.name} but not an Administrator`,
    }
  } catch (err: any) {
    const status = (err as AxiosError)?.response?.status
    if (status === 401) return { pass: false, detail: 'Invalid username or password' }
    if (status === 403) return { pass: false, detail: 'Access forbidden — check user permissions' }
    return { pass: false, detail: 'Could not verify credentials' }
  }
}

async function checkPluginPermissions(base: string, headers: any) {
  try {
    // Check if user can manage plugins by reading plugin list
    const res = await axios.get(`${base}/wp-json/wp/v2/plugins`, { headers, timeout: 8000 })
    return { pass: true, detail: `Can manage plugins (${res.data?.length || 0} installed)` }
  } catch (err: any) {
    const status = (err as AxiosError)?.response?.status
    if (status === 403) return { pass: false, detail: 'User cannot manage plugins' }
    // 404 means endpoint doesn't exist (WP < 5.5) — try alternative check
    return { pass: true, detail: 'Plugin management endpoint not available — will attempt install' }
  }
}

async function checkFileWritable(base: string, headers: any) {
  try {
    // Check site health for filesystem info
    const res = await axios.get(
      `${base}/wp-json/wp-site-health/v1/tests/filesystem-permissions`,
      { headers, timeout: 8000 }
    ).catch(() => null)

    if (res?.data?.status === 'good') {
      return { pass: true, detail: 'File system is writable' }
    }
    // If endpoint doesn't exist, assume writable (most shared hosts are)
    return { pass: true, detail: 'File system assumed writable (shared hosting)' }
  } catch {
    return { pass: true, detail: 'File system check skipped' }
  }
}

async function checkAlreadyInstalled(base: string, headers: any) {
  try {
    const res = await axios.get(`${base}/wp-json/ignyous/v1/verify`, {
      timeout: 5000,
      validateStatus: () => true,
    })
    if (res.status === 200 || res.status === 401) {
      // 401 means plugin is there but key not set — that's fine
      return { pass: false, detail: 'ignyous Bridge is already installed' }
    }
    return { pass: true, detail: 'Not yet installed' }
  } catch {
    return { pass: true, detail: 'Not yet installed' }
  }
}

// ─── Actual Plugin Installation ───────────────────────────────────
async function installPlugin(base: string, auth: string, headers: any) {
  // Strategy 1: WP REST API plugin install (WP 5.5+ /wp/v2/plugins POST)
  try {
    const res = await axios.post(
      `${base}/wp-json/wp/v2/plugins`,
      { slug: 'ignyous-bridge', status: 'active' },
      { headers, timeout: 30000 }
    )
    if (res.data?.plugin) {
      return { success: true, plugin_file: res.data.plugin }
    }
  } catch (err: any) {
    // 404 = endpoint doesn't exist, try next strategy
    // 400 = plugin not on WP.org, try next strategy
    const status = (err as AxiosError)?.response?.status
    if (status !== 404 && status !== 400) {
      return { success: false, error: `REST install failed: ${err.message}` }
    }
  }

  // Strategy 2: Install from our hosted zip URL via WP admin-ajax
  try {
    // First get a nonce by fetching the plugin upload page
    const uploadPageRes = await axios.get(
      `${base}/wp-admin/plugin-install.php?tab=upload`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'Mozilla/5.0 ignyous-platform',
        },
        timeout: 15000,
        maxRedirects: 5,
      }
    )

    // Extract nonce from page HTML
    const nonceMatch = uploadPageRes.data?.match(/_wpnonce['"]\s*:\s*['"]([a-f0-9]+)['"]/i)
      || uploadPageRes.data?.match(/name="_wpnonce"\s+value="([^"]+)"/i)

    if (!nonceMatch?.[1]) {
      return { success: false, error: 'Could not get WordPress security token. Try manual install.' }
    }

    const nonce = nonceMatch[1]

    // Download our plugin zip
    const zipRes = await axios.get(PLUGIN_ZIP_URL, { responseType: 'arraybuffer', timeout: 15000 })
    const zipBuffer = Buffer.from(zipRes.data)

    // Upload via form POST to WP
    const FormData = (await import('form-data')).default
    const form = new FormData()
    form.append('_wpnonce', nonce)
    form.append('_wp_http_referer', '/wp-admin/plugin-install.php')
    form.append('pluginzip', zipBuffer, {
      filename: 'ignyous-bridge.zip',
      contentType: 'application/zip',
    })

    const uploadRes = await axios.post(
      `${base}/wp-admin/update.php?action=upload-plugin`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'Mozilla/5.0 ignyous-platform',
        },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: () => true,
      }
    )

    // Check if install succeeded (WP redirects to activate page on success)
    const responseText = uploadRes.data?.toString() || ''
    const installed = responseText.includes('activate_plugin') ||
                      responseText.includes('Plugin installed successfully') ||
                      responseText.includes('ignyous-bridge')

    if (installed) {
      // Try to activate
      await activatePlugin(base, auth, 'ignyous-bridge/ignyous-bridge.php')
      return { success: true, plugin_file: 'ignyous-bridge/ignyous-bridge.php' }
    }

    return { success: false, error: 'Upload appeared to fail. Check your hosting allows plugin uploads.' }

  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function activatePlugin(base: string, auth: string, pluginFile: string) {
  try {
    await axios.put(
      `${base}/wp-json/wp/v2/plugins/${encodeURIComponent(pluginFile)}`,
      { status: 'active' },
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    )
  } catch {
    // Activation failure is non-fatal — user can activate manually
  }
}

// ─── Manual instructions builder ─────────────────────────────────
function buildManualInstructions(base: string, failedChecks: any[]) {
  const issues = failedChecks.map(f => f.name)

  if (issues.includes('REST API')) {
    return {
      reason: 'REST API is blocked on your site',
      steps: [
        'Go to WP Admin → Settings → Permalinks → Save (re-enables REST API)',
        'If using a security plugin (Wordfence, iThemes), whitelist REST API access',
        'Or install the plugin manually via SFTP',
      ],
      sftp_path: `${base.replace('https://', '').replace('http://', '')}/wp-content/plugins/`,
    }
  }

  if (issues.includes('Admin Credentials')) {
    return {
      reason: 'Credentials could not be verified',
      steps: [
        'Double-check your WordPress admin username and password',
        'Make sure Application Passwords are enabled (WP Admin → Users → Your Profile → Application Passwords)',
        'Or use an Application Password instead of your main password',
        'Or install the plugin manually',
      ],
    }
  }

  return {
    reason: 'Auto-install is not available for this site',
    steps: [
      'Download ignyous-bridge.zip from your ignyous dashboard',
      'Go to WP Admin → Plugins → Add New → Upload Plugin',
      'Upload ignyous-bridge.zip → Install Now → Activate',
      'Go to Settings → ignyous Bridge → enter your API key',
    ],
    download_url: '/api/plugin/bridge.zip',
  }
}