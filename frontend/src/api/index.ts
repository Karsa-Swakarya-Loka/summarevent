/**
 * The single API instance used by the UI.
 * - No VITE_API_URL → in-browser mock (works offline, data per browser).
 * - VITE_API_URL=https://… → real backend over HTTP (same contract).
 */
import type { Api } from './contract'
import { createHttpApi } from './http'
import { createMockApi, ensureMockDb, startMockMaintenance } from './mock/adapter'

const baseUrl = import.meta.env.VITE_API_URL as string | undefined

export const api: Api = baseUrl ? createHttpApi(baseUrl) : createMockApi()

/** Call once at startup. */
export async function bootApi(): Promise<void> {
  if (api.mode === 'mock') {
    await ensureMockDb()
    startMockMaintenance()
  }
}

export * from './contract'
