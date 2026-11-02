/**
 * Node entry point: `npm run dev` (watch) or `npm run build && npm start`.
 *
 *   DATABASE_URL   postgres://… (Neon, Supabase, local). Empty → embedded PGlite (in memory, or PGLITE_DIR).
 *   PORT           default 8787. The API lives under /api.
 *   QR_SECRET      HMAC key for e-ticket QR tokens (required in production).
 *   SESSION_SECRET HMAC key for login tokens (required in production).
 *   DEMO_ENABLED   "false" turns off /api/demo/* (reset, simulated buyer, force-expire).
 *   CORS_ORIGINS   comma-separated allowed origins; empty = any origin.
 */
import { serve } from '@hono/node-server'
import { ensureMockDb, startMockMaintenance } from '@/api/mock/adapter'
import { setQrSecret } from '@/domain/qr'
import { createApp } from './app'
import { connect } from './db/sql'
import { PgStore } from './store'

for (const key of ['QR_SECRET', 'SESSION_SECRET']) {
  if (!process.env[key]) {
    if (process.env.NODE_ENV === 'production') throw new Error(`${key} wajib diisi di produksi`)
    console.warn(`[api] ${key} kosong, memakai kunci demo (jangan dipakai di produksi)`)
  }
}
if (process.env.QR_SECRET) setQrSecret(process.env.QR_SECRET)

const database = await connect()
const store = new PgStore(database)
await store.init()
const app = createApp(store, {
  demo: process.env.DEMO_ENABLED !== 'false',
  origins: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
})
await ensureMockDb() // seeds sample data on first start
startMockMaintenance(60_000) // PRD §11: release expired holds every minute even when nobody writes

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
  console.log(`Summarevent API → http://localhost:${port}/api  (database: ${database.kind}, data version ${store.version})`)
})

const shutdown = async () => {
  await database.close().catch(() => undefined)
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
