/** The security headers in vercel.json against the policy the build writes into index.html (csp.ts). */
import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'
import envProduction from '../../.env.production?raw'
import vercel from '../../vercel.json'
import { cspDirectives, HEADER_ONLY } from '../../csp'

async function sha256(code: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.replace(/\r\n?/g, '\n'))))
  return `sha256-${btoa(String.fromCharCode(...bytes))}`
}

const header = (key: string) => vercel.headers[0].headers.find((h) => h.key === key)?.value

describe('security headers (vercel.json)', () => {
  it('sends the same Content-Security-Policy as the build, with the hashes of the inline scripts of index.html', async () => {
    const inline = await Promise.all([...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => sha256(m[1])))
    const live = new URL(/^VITE_LIVE_URL=(.+)$/m.exec(envProduction)![1].trim()).origin
    expect(header('Content-Security-Policy')).toBe([...cspDirectives(inline, live), ...HEADER_ONLY].join('; '))
  })

  it('has no wildcard source, and keeps the other hardening headers', () => {
    expect(header('Content-Security-Policy')).not.toMatch(/(^|\s)(\*|https:|http:)(\s|;|$)|\*\./)
    expect(header('Strict-Transport-Security')).toMatch(/max-age=63072000; includeSubDomains; preload/)
    expect(header('X-Frame-Options')).toBe('DENY')
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin')
  })
})
