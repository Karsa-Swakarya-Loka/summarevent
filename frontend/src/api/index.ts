/**
 * The single API instance used by the UI.
 * - Demo version (default): in-browser mock – works offline, every browser has its own sample data.
 * - Live version: the backend over HTTP (same contract), shared by every phone and laptop. Used when
 *   VITE_API_URL is set at build time, or when the app is opened on one of the hosts listed in
 *   VITE_LIVE_HOSTS, where the API sits on the same origin at /api.
 */
import type { Api } from './contract'
import { createHttpApi } from './http'

const LIVE_HOSTS = ((import.meta.env.VITE_LIVE_HOSTS as string | undefined) ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

const host = typeof location !== 'undefined' ? location.hostname : ''
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) || (LIVE_HOSTS.includes(host) ? '/api' : undefined)

/** The in-browser version, loaded by bootApi() only where it is used, so the server version never downloads it. */
let mock: Api | null = null

function lazyMock(): Api {
  return new Proxy({} as Api, {
    get(_, prop) {
      if (prop === 'mode') return 'mock'
      if (!mock) throw new Error('The in-browser API is used before bootApi() finished.')
      return Reflect.get(mock, prop)
    },
  })
}

export const api: Api = baseUrl ? createHttpApi(baseUrl) : lazyMock()

/** "live" = shared backend, "demo" = data per browser. */
export const apiMode: 'live' | 'demo' = api.mode === 'http' ? 'live' : 'demo'

/** The backup version (data in the browser), offered when the app cannot reach its server (LoadError). */
export const DEMO_URL = (import.meta.env.VITE_DEMO_URL as string | undefined) ?? 'https://summarevent-cadangan.vercel.app'

/** Call once at startup. */
export async function bootApi(): Promise<void> {
  if (api.mode === 'mock' && !mock) {
    const { createMockApi, ensureMockDb, startMockMaintenance } = await import('./mock/adapter')
    mock = createMockApi()
    await ensureMockDb()
    startMockMaintenance()
  }
}

export * from './contract'
