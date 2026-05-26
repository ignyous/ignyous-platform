// src/app/api/baseline/bridge.zip/route.ts
//
// Serves the prebuilt plugin zip from public/downloads/.
// Rebuild after editing the plugin:  npm run build:plugin

import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'

export async function GET() {
  const path = join(process.cwd(), 'public', 'downloads', 'ignyous-bridge-baseline.zip')
  if (!existsSync(path)) {
    return NextResponse.json({ error: 'Plugin zip not built. Run: npm run build:plugin' }, { status: 503 })
  }
  const buf = readFileSync(path)
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': 'attachment; filename="ignyous-bridge-baseline.zip"',
      'Content-Length':      String(buf.length),
      'Cache-Control':       'no-store',
    },
  })
}
