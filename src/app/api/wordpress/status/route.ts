import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

/**
 * Health check endpoint for WordPress bridge
 * 
 * Tests:
 * - Bridge connectivity
 * - API key validity
 * - Response time
 * - Cache status
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const siteUrl = searchParams.get('siteUrl')
  const apiKey = searchParams.get('apiKey')

  if (!siteUrl || !apiKey) {
    return NextResponse.json({
      success: false,
      status: 'error',
      message: 'Missing siteUrl or apiKey',
    }, { status: 400 })
  }

  const cleanUrl = siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
  const started = Date.now()

  try {
    // Test 1: Bridge connectivity
    const bridgeUrl = `${cleanUrl}/wp-json/ignyous/v1/site`
    const headers = { 'Authorization': `Bearer ${apiKey}` }

    const response = await axios.get(bridgeUrl, {
      headers,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    })

    const responseTime = Date.now() - started

    // Determine status
    let status = 'connected'
    let statusCode = 'green'
    let message = 'Connected'

    if (response.status === 401 || response.status === 403) {
      status = 'invalid_key'
      statusCode = 'red'
      message = 'Invalid API key'
    } else if (response.status >= 500) {
      status = 'server_error'
      statusCode = 'yellow'
      message = 'Server error'
    } else if (response.status === 404) {
      status = 'bridge_missing'
      statusCode = 'red'
      message = 'Bridge plugin not found'
    } else if (response.status >= 200 && response.status < 300) {
      if (responseTime > 5000) {
        status = 'slow'
        statusCode = 'yellow'
        message = 'Slow response'
      } else {
        status = 'connected'
        statusCode = 'green'
        message = 'Connected'
      }
    } else {
      status = 'error'
      statusCode = 'yellow'
      message = `HTTP ${response.status}`
    }

    return NextResponse.json({
      success: status === 'connected',
      status,
      statusCode,
      message,
      responseTime,
      siteUrl: cleanUrl,
      lastChecked: new Date().toISOString(),
      debug: {
        httpStatus: response.status,
        responseTime,
        bridgeUrl,
      },
    })
  } catch (error: any) {
    const responseTime = Date.now() - started

    // Network errors
    const message = error.code === 'ECONNREFUSED'
      ? 'Site unreachable'
      : error.code === 'ETIMEDOUT'
      ? 'Connection timeout'
      : error.message || 'Connection failed'

    return NextResponse.json({
      success: false,
      status: 'unreachable',
      statusCode: 'red',
      message,
      responseTime,
      siteUrl: cleanUrl,
      lastChecked: new Date().toISOString(),
      debug: {
        error: error.message,
        code: error.code,
      },
    })
  }
}
