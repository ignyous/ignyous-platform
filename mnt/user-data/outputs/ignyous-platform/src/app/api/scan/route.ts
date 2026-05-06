// src/app/api/scan/route.ts
// Proxies scan requests to the Railway scanner service.
// Also saves scan results to the database.

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
      timeout: 60000, // full scan can take up to 60s
      headers: { 'Content-Type': 'application/json' },
    })

    const report = response.data.report

    // If siteId provided, persist scan results to DB
    if (siteId && report) {
      try {
        const { PrismaClient } = await import('@prisma/client')
        const prisma = new PrismaClient()

        await prisma.siteScan.create({
          data: {
            siteId,
            url,
            reportJson:      report,
            scoreOverall:    report.scores?.overall,
            scoreSeo:        report.scores?.seo,
            scorePerformance:report.scores?.performance,
            scoreSecurity:   report.scores?.security,
            scoreMobile:     report.scores?.mobile,
            wpVersion:       report.cms?.wp_version,
            builder:         report.builder?.[0]?.name,
            plugins:         report.wordpress?.plugins_hint || [],
            pageCount:       report.wordpress?.pages?.length,
            recsHigh:   report.recommendations?.filter((r: any) => r.severity === 'high').length,
            recsMedium: report.recommendations?.filter((r: any) => r.severity === 'medium').length,
            recsLow:    report.recommendations?.filter((r: any) => r.severity === 'low').length,
          }
        })

        await prisma.$disconnect()
      } catch (dbErr) {
        console.error('Failed to save scan to DB:', dbErr)
        // Don't fail the request if DB write fails
      }
    }

    return NextResponse.json(response.data)

  } catch (err: any) {
    const message = err.response?.data?.error || err.message || 'Scan failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
