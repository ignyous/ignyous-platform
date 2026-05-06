import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

const SCANNER_URL = process.env.SCANNER_URL || 'http://localhost:3400'

export async function POST(req: NextRequest) {
  try {
    const { url, siteId, quick = false } = await req.json()

    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    const endpoint = quick ? '/scan/quick' : '/scan'
    const response = await axios.post(`${SCANNER_URL}${endpoint}`, { url }, {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    })

    return NextResponse.json(response.data)

  } catch (err: any) {
    const message = err.response?.data?.error || err.message || 'Scan failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}