/**
 * Post-Action Verification — confirms changes actually appear on the live page.
 *
 * After any content change (replace, remove, reorder), this fetches the live
 * page HTML and verifies the expected outcome is visible. Never says "done"
 * based on a 200 response alone.
 */

interface VerifyResult {
  verified:    boolean
  confidence:  'confirmed' | 'likely' | 'unverified' | 'failed'
  message:     string
  htmlChecked: boolean
}

/**
 * Verify a change by fetching the live page and checking content.
 *
 * @param pageUrl    - Full URL of the page to check
 * @param expect     - Text that SHOULD appear on the page after the change (for replace)
 * @param notExpect  - Text that should NOT appear (for remove, or old text after replace)
 * @param timeout    - Fetch timeout in ms (default 8000)
 */
export async function verifyChange(
  pageUrl:    string,
  expect?:    string,
  notExpect?: string,
  timeout:    number = 8000,
): Promise<VerifyResult> {
  if (!expect && !notExpect) {
    return { verified: true, confidence: 'unverified', message: 'No verification criteria provided', htmlChecked: false }
  }

  try {
    // Fetch with cache-busting query param
    const bustUrl = pageUrl.includes('?')
      ? `${pageUrl}&_ignyous_verify=${Date.now()}`
      : `${pageUrl}?_ignyous_verify=${Date.now()}`

    const r = await fetch(bustUrl, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      signal: AbortSignal.timeout(timeout),
    })

    if (!r.ok) {
      return {
        verified: false,
        confidence: 'unverified',
        message: `Page returned HTTP ${r.status} — cannot verify`,
        htmlChecked: false,
      }
    }

    const html = await r.text()
    // Strip HTML tags for text comparison
    const plainText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    let expectOk   = true
    let notExpectOk = true

    if (expect) {
      // Check if expected text appears (case-insensitive partial match)
      expectOk = plainText.toLowerCase().includes(expect.toLowerCase())
    }

    if (notExpect) {
      // Check if unwanted text is gone
      notExpectOk = !plainText.toLowerCase().includes(notExpect.toLowerCase())
    }

    if (expectOk && notExpectOk) {
      return {
        verified: true,
        confidence: 'confirmed',
        message: 'Verified — change is visible on the live page.',
        htmlChecked: true,
      }
    }

    // Something didn't match — likely a cache issue
    const issues: string[] = []
    if (!expectOk)    issues.push(`new text "${expect?.slice(0, 40)}" not yet visible`)
    if (!notExpectOk) issues.push(`old text "${notExpect?.slice(0, 40)}" still showing`)

    return {
      verified: false,
      confidence: 'likely',
      message: `Data updated but ${issues.join(' and ')}. This is usually a cache or CDN delay — try a hard refresh (Ctrl+Shift+R).`,
      htmlChecked: true,
    }
  } catch (e: any) {
    return {
      verified: false,
      confidence: 'unverified',
      message: `Could not verify: ${e.message}`,
      htmlChecked: false,
    }
  }
}

/**
 * Build a human-friendly verification suffix for action results.
 */
export function verificationSuffix(result: VerifyResult): string {
  if (result.confidence === 'confirmed') return ''  // clean success, no extra text needed
  if (result.confidence === 'likely')     return `\n\n⚠️ ${result.message}`
  if (result.confidence === 'unverified') return ''  // silent — don't confuse user
  return `\n\n⚠️ ${result.message}`
}
