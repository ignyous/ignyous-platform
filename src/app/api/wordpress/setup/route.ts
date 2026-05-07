// src/app/api/wordpress/setup/route.ts
// Handles automatic plugin connection.
// action=ping  → checks if plugin is installed, returns setup_token
// action=connect → generates API key, pushes it to plugin, verifies connection

import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, action, setup_token } = await req.json()

    if (!siteUrl) {
      return NextResponse.json({ error: 'siteUrl required' }, { status: 400 })
    }

    const base = siteUrl.replace(/\/$/, '').replace(/^https?:\/\//, '')
    const full = `https://${base}`

    if (action === 'ping') {
      return await handlePing(full)
    }

    if (action === 'connect') {
      return await handleConnect(full, setup_token)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── PING: check if plugin is installed ───────────────────────────
async function handlePing(base: string) {
  try {
    const res = await axios.get(`${base}/wp-json/ignyous/v1/ping`, {
      timeout: 10000,
      validateStatus: () => true,
    })

    // 404 = plugin not installed or permalinks not saved
    if (res.status === 404) {
      return NextResponse.json({
        plugin_found: false,
        message: 'Plugin not detected. Make sure it\'s activated and Permalinks are saved.',
      })
    }

    const data = res.data

    // Already connected (has api_key saved)
    if (data?.connected === true) {
      return NextResponse.json({
        plugin_found:      true,
        already_connected: true,
        message:           'Already connected!',
      })
    }

    // Plugin found, not yet connected — return setup_token
    if (data?.setup_token) {
      return NextResponse.json({
        plugin_found: true,
        setup_token:  data.setup_token,
        site_name:    data.site_name,
        wp_version:   data.wp_version,
      })
    }

    return NextResponse.json({
      plugin_found: false,
      message: 'Plugin responded but setup token missing. Try deactivating and reactivating the plugin.',
    })

  } catch (err: any) {
    return NextResponse.json({
      plugin_found: false,
      message: `Could not reach site: ${err.message}`,
    })
  }
}

// ─── CONNECT: generate key and push to plugin ─────────────────────
async function handleConnect(base: string, setupToken: string) {
  if (!setupToken) {
    return NextResponse.json({ success: false, message: 'Setup token required. Click "I\'ve activated the plugin" to try again.' })
  }

  // Generate a strong API key
  const apiKey = crypto.randomBytes(32).toString('hex')

  // Push the key to the plugin
  try {
    const pushRes = await axios.post(
      `${base}/wp-json/ignyous/v1/setup`,
      { api_key: apiKey, setup_token: setupToken },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 12000,
        validateStatus: () => true,
      }
    )

    if (pushRes.status === 409) {
      // Already connected — this shouldn't happen but handle gracefully
      return NextResponse.json({ success: false, message: 'Site is already connected. Refresh the page.' })
    }

    if (pushRes.status === 403) {
      return NextResponse.json({ success: false, message: 'Setup token was invalid or already used. Try deactivating and reactivating the plugin, then try again.' })
    }

    if (!pushRes.data?.success) {
      return NextResponse.json({ success: false, message: pushRes.data?.message || 'Plugin did not accept the key. Try reinstalling the plugin.' })
    }

  } catch (err: any) {
    return NextResponse.json({ success: false, message: `Could not reach plugin: ${err.message}` })
  }

  // Verify the connection works
  try {
    const verifyRes = await axios.get(`${base}/wp-json/ignyous/v1/verify`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 8000,
      validateStatus: () => true,
    })

    if (verifyRes.status !== 200) {
      return NextResponse.json({ success: false, message: 'Key was saved but verification failed. Try refreshing in a few seconds.' })
    }

    return NextResponse.json({
      success:   true,
      api_key:   apiKey,
      site_info: verifyRes.data?.data,
      message:   'Connected successfully',
    })

  } catch (err: any) {
    // Key was pushed but verify failed — still return key so user can proceed
    return NextResponse.json({
      success:  true,
      api_key:  apiKey,
      message:  'Connected — verification had a hiccup but should be fine.',
    })
  }
}
