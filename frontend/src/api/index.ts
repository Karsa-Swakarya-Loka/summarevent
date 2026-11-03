/**
 * The single API instance used by the UI.
 * - Demo version (default): in-browser mock – works offline, every browser has its own sample data.
 * - Live version: the backend over HTTP (same contract), shared by every phone and laptop. Used when
 *   VITE_API_URL is set at build time, or when the app is opened on one of the hosts listed in
 *   VITE_LIVE_HOSTS, where the API sits on the same origin at /api.
 */
import type { Api } from './contract'
import { createHttpApi } from './http'
import { createMockApi, ensureMockDb, startMockMaintenance } from './mock/adapter'

const LIVE_HOSTS = ((import.meta.env.VITE_LIVE_HOSTS as string | undefined) ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

const host = typeof location !== 'undefined' ? location.hostname : ''
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) || (LIVE_HOSTS.includes(host) ? '/api' : undefined)

export const api: Api = baseUrl ? createHttpApi(baseUrl) : createMockApi()

/** "live" = shared backend, "demo" = data per browser. */
export const apiMode: 'live' | 'demo' = api.mode === 'http' ? 'live' : 'demo'

/**
 * Where the other version lives, for the cross-links. The demo only checks and links the live
 * version when VITE_LIVE_URL is set at build time (it serves /api/health), so a live backend that
 * does not exist yet costs the demo no request and no console error.
 */
export const LIVE_URL: string | null = (import.meta.env.VITE_LIVE_URL as string | undefined) || null
export const DEMO_URL = (import.meta.env.VITE_DEMO_URL as string | undefined) ?? 'https://summarevent.vercel.app'

/** True when the live version answers its health check within 5 s. Always false without LIVE_URL. */
export async function liveVersionReady(signal?: AbortSignal): Promise<boolean> {
  if (!LIVE_URL) return false
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 5000)
  signal?.addEventListener('abort', () => ctl.abort(), { once: true })
  try {
    const res = await fetch(`${LIVE_URL}/api/health`, { signal: ctl.signal })
    if (!res.ok) return false
    return ((await res.json()) as { ok?: boolean }).ok === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Call once at startup. */
export async function bootApi(): Promise<void> {
  if (api.mode === 'mock') {
    await ensureMockDb()
    startMockMaintenance()
  }
}

export * from './contract'
