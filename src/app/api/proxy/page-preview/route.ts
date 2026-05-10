import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { pageUrl, injectHtml, pageTitle } = await req.json()
    if (!pageUrl) return NextResponse.json({ error: 'pageUrl required' }, { status: 400 })

    // Fetch the live public page
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'ignyous-preview/1.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`Could not fetch ${pageUrl}: ${res.status}`)
    let html = await res.text()

    // Make all relative URLs absolute so CSS/images load in srcDoc iframe
    const base = new URL(pageUrl)
    const baseUrl = `${base.protocol}//${base.host}`
    html = html
      .replace(/(href|src|action)="\/(?!\/)/g, `$1="${baseUrl}/`)
      .replace(/(href|src|action)='\/(?!\/)/g, `$1='${baseUrl}/`)

    // Inject a <base> tag so relative resources load correctly
    html = html.replace('<head>', `<head>\n<base href="${baseUrl}/" />`)

    // Build the preview injection banner + highlighted content
    const banner = `
<div id="ignyous-preview-banner" style="
  position:fixed;top:0;left:0;right:0;z-index:999999;
  background:#1a1a4e;color:white;padding:10px 20px;
  display:flex;align-items:center;justify-content:space-between;
  font-family:system-ui,sans-serif;font-size:13px;font-weight:600;
  box-shadow:0 2px 12px rgba(0,0,0,0.35);
">
  <span>👁 Draft Preview — <em style="font-style:normal;color:#f3af00">${pageTitle || 'Page update'}</em></span>
  <span style="background:#f3af00;color:#1a1a4e;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700">NOT PUBLISHED</span>
</div>
<div style="height:44px"></div>`

    const injectedSection = injectHtml ? `
<div id="ignyous-preview-injection" style="
  outline:3px solid #f3af00;outline-offset:0;
  position:relative;
">
  <div style="
    position:absolute;top:0;right:0;z-index:9999;
    background:#f3af00;color:#1a1a4e;
    font-family:system-ui,sans-serif;font-size:11px;font-weight:700;
    padding:3px 10px;border-radius:0 0 0 8px;
  ">✦ PROPOSED ADDITION</div>
  ${injectHtml}
</div>` : ''

    // Inject banner just after <body> and proposed content just before </body>
    if (html.includes('<body')) {
      html = html.replace(/(<body[^>]*>)/, `$1\n${banner}`)
    } else {
      html = banner + html
    }

    if (injectedSection) {
      html = html.includes('</body>')
        ? html.replace('</body>', `${injectedSection}\n</body>`)
        : html + injectedSection
    }

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
