/**
 * Thin database layer: real PostgreSQL through `pg` when DATABASE_URL is set, otherwise an
 * embedded PostgreSQL (PGlite, compiled to WebAssembly) so the API runs with zero setup on a
 * laptop. Both speak the same SQL, so every guard in store.ts runs on a real Postgres engine.
 */
import pg from 'pg'

export interface QueryResult<R> {
  rows: R[]
  rowCount: number
}

export interface Sql {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<R>>
}

export interface Database extends Sql {
  readonly kind: 'postgres' | 'pglite'
  /** Several statements at once, no parameters (schema migrations). */
  exec(text: string): Promise<void>
  /** BEGIN … COMMIT on one connection; ROLLBACK when `fn` throws. */
  tx<T>(fn: (q: Sql) => Promise<T>, opts?: { readOnly?: boolean }): Promise<T>
  close(): Promise<void>
}

// timestamptz → keep as Date (converted to ISO in store.ts); int8 → number (our counters stay small)
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v))

export async function connect(url = process.env.DATABASE_URL): Promise<Database> {
  return url ? postgres(url) : pglite(process.env.PGLITE_DIR)
}

function postgres(url: string): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })
  pool.on('error', (e) => console.error('[pg] idle client error', e.message))
  return {
    kind: 'postgres',
    async exec(text) {
      await pool.query(text)
    },
    async query<R>(text: string, params?: unknown[]) {
      const r = await pool.query(text, params as unknown[])
      return { rows: r.rows as R[], rowCount: r.rowCount ?? 0 }
    },
    async tx(fn, opts) {
      const client = await pool.connect()
      try {
        await client.query(opts?.readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
        const q: Sql = {
          async query<R>(text: string, params?: unknown[]) {
            const r = await client.query(text, params as unknown[])
            return { rows: r.rows as R[], rowCount: r.rowCount ?? 0 }
          },
        }
        const out = await fn(q)
        await client.query('COMMIT')
        return out
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

async function pglite(dir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = dir ? new PGlite(dir) : new PGlite()
  await db.waitReady
  const wrap = (runner: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> }): Sql => ({
    async query<R>(text: string, params?: unknown[]) {
      const r = await runner.query(text, params)
      return { rows: r.rows as R[], rowCount: r.affectedRows ?? r.rows.length }
    },
  })
  return {
    kind: 'pglite',
    ...wrap(db),
    async exec(text) {
      await db.exec(text)
    },
    tx: (fn) => db.transaction((t) => fn(wrap(t))),
    close: () => db.close(),
  }
}
