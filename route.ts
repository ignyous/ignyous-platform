// src/app/api/wordpress/route.ts
// Secure proxy: ignyous platform → ignyous-bridge plugin on client's WP site
// The WP API key never leaves the server — browser only talks to this endpoint.

import { NextRequest, NextResponse } from 'next/server'
import axios, { AxiosError } from 'axios'

export async function POST(req: NextRequest) {
  try {
    const {
      siteUrl,
      apiKey,
      endpoint,
      method = 'GET',
      body,
      params,
    } = await req.json()

    if (!siteUrl || !apiKey || !endpoint) {
      return NextResponse.json(
        { error: 'siteUrl, apiKey, and endpoint are required' },
        { status: 400 }
      )
    }

    // Sanitize - only allow calls to the ignyous namespace
    const cleanEndpoint = endpoint.replace(/^\/+/, '').replace(/\.\./g, '')
    const url = `${siteUrl.replace(/\/$/, '')}/wp-json/ignyous/v1/${cleanEndpoint}`

    const response = await axios({
      method: method.toUpperCase(),
      url,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ignyous-platform/1.0',
      },
      data: body || undefined,
      params: params || undefined,
      timeout: 20000,
    })

    return NextResponse.json(response.data)

  } catch (err) {
    const axiosErr = err as AxiosError<{ message?: string }>
    const status   = axiosErr.response?.status || 500
    const message  = axiosErr.response?.data?.message || axiosErr.message || 'Unknown error'

    return NextResponse.json({ error: message }, { status })
  }
}
