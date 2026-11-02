/**
 * Vercel Function entry. `npm run build` bundles this file into frontend/api/index.js, so the API is
 * served from the same project and origin as the app: https://<project>.vercel.app/api/…
 *
 * Env (Vercel project settings): DATABASE_URL (pooled Postgres URL, e.g. Neon), QR_SECRET,
 * SESSION_SECRET, optional DEMO_ENABLED=false.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { ensureMockDb } from '@/api/mock/adapter'
import { setQrSecret } from '@/domain/qr'
import { createApp } from './app'
import { connect } from './db/sql'
import { PgStore } from './store'

type Listener = (req: IncomingMessage, res: ServerResponse) => Promise<void>

let ready: Promise<Listener> | null = null

function boot(): Promise<Listener> {
  ready ??= (async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diisi')
    if (process.env.QR_SECRET) setQrSecret(process.env.QR_SECRET)
    const database = await connect(process.env.DATABASE_URL)
    const store = new PgStore(database)
    await store.init()
    const app = createApp(store, { demo: process.env.DEMO_ENABLED !== 'false' })
    await ensureMockDb()
    return getRequestListener(app.fetch)
  })().catch((e: unknown) => {
    ready = null // try again on the next request
    throw e
  })
  return ready
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  let listener: Listener
  try {
    listener = await boot()
  } catch (e) {
    console.error('[api] boot failed:', (e as Error).message)
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ code: 'NOT_READY', message: 'Server sedang disiapkan atau database belum terhubung. Coba lagi sebentar.' }))
    return
  }
  await listener(req, res)
}
