/**
 * A small unit of work over Convex, so the endpoint logic can be ported from the mock adapter almost line for line.
 *
 * Rows come back as plain domain objects (the contract shape plus a few internal fields). Code changes them in place
 * like the mock does with its in-memory Db; `flush()` writes every changed row back. It runs before every read, so an
 * index query always sees the changes made earlier in the same mutation, and once at the end. Because a whole
 * endpoint runs inside one Convex mutation, it is one serialisable transaction: either everything commits or nothing.
 */
import type { GenericId } from 'convex/values'
import type { TableNames } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type Row = Record<string, any>
interface Entry {
  table: TableNames
  docId: GenericId<any>
  obj: Row
  orig: string
  removed?: boolean
}

export class Tx {
  readonly now: Date
  readonly writable: boolean
  private entries = new Map<string, Entry>()
  private byObj = new WeakMap<object, Entry>()

  constructor(
    readonly ctx: QueryCtx | MutationCtx,
    now = new Date(),
  ) {
    this.now = now
    this.writable = 'insert' in ctx.db
  }

  get mctx(): MutationCtx {
    if (!this.writable) throw new Error('read-only transaction')
    return this.ctx as MutationCtx
  }

  private track(table: TableNames, doc: Row): Row {
    const known = this.entries.get(doc._id)
    if (known) return known.obj
    const { _id, _creationTime, ...obj } = doc
    void _creationTime
    const entry: Entry = { table, docId: _id, obj, orig: this.writable ? JSON.stringify(obj) : '' }
    this.entries.set(_id, entry)
    this.byObj.set(obj, entry)
    return obj
  }

  /** Write every changed row. Orders keep `pending` in step with their status; seat rows stamp `updatedAt`. */
  async flush(): Promise<void> {
    if (!this.writable) return
    for (const e of this.entries.values()) {
      if (e.removed) continue
      if (e.table === 'orders') e.obj.pending = e.obj.status === 'AWAITING_PAYMENT' || e.obj.status === 'AWAITING_VERIFICATION'
      let s = JSON.stringify(e.obj)
      if (s === e.orig) continue
      if (e.table === 'sessionSeats') {
        e.obj.updatedAt = this.now.getTime()
        s = JSON.stringify(e.obj)
      }
      await this.mctx.db.replace(e.docId, JSON.parse(s))
      e.orig = s
    }
  }

  /** One row by its contract id. */
  async get<T = Row>(table: TableNames, id: string | null | undefined): Promise<T | null> {
    if (!id) return null
    const rows = await this.where<T>(table, 'by_key', { id })
    return rows[0] ?? null
  }

  /** Rows matching an index prefix (equality on the index fields, in order). Re-checked against in-memory values. */
  async where<T = Row>(table: TableNames, index: string, eq: Record<string, unknown>): Promise<T[]> {
    await this.flush()
    const keys = Object.keys(eq)
    const docs = await (this.ctx.db.query(table) as any)
      .withIndex(index, (q: any) => keys.reduce((acc, k) => acc.eq(k, eq[k]), q))
      .collect()
    return docs
      .map((d: Row) => this.track(table, d))
      .filter((o: Row) => !this.byObj.get(o)?.removed && keys.every((k) => o[k] === eq[k])) as T[]
  }

  /** Rows of an index whose last field is at most `max` (after equality on the others). */
  async upTo<T = Row>(table: TableNames, index: string, eq: Record<string, unknown>, field: string, max: unknown): Promise<T[]> {
    await this.flush()
    const keys = Object.keys(eq)
    const docs = await (this.ctx.db.query(table) as any)
      .withIndex(index, (q: any) => keys.reduce((acc, k) => acc.eq(k, eq[k]), q).lte(field, max))
      .collect()
    return docs.map((d: Row) => this.track(table, d)).filter((o: Row) => !this.byObj.get(o)?.removed) as T[]
  }

  async all<T = Row>(table: TableNames): Promise<T[]> {
    await this.flush()
    const docs = await this.ctx.db.query(table).collect()
    return docs.map((d) => this.track(table, d as Row)).filter((o) => !this.byObj.get(o)?.removed) as T[]
  }

  /** Inserts go straight in (Convex reads see them right away); no flush needed since nothing is read. */
  async insert<T extends object>(table: TableNames, obj: T): Promise<T> {
    const row = obj as Row
    if (table === 'orders') row.pending = row.status === 'AWAITING_PAYMENT' || row.status === 'AWAITING_VERIFICATION'
    if (table === 'sessionSeats') row.updatedAt = this.now.getTime()
    const clean = JSON.parse(JSON.stringify(obj)) as Row
    const docId = await this.mctx.db.insert(table, clean as any)
    const entry: Entry = { table, docId, obj: obj as Row, orig: JSON.stringify(obj) }
    this.entries.set(docId, entry)
    this.byObj.set(obj, entry)
    return obj
  }

  async remove(obj: object): Promise<void> {
    const entry = this.byObj.get(obj)
    if (!entry || entry.removed) return
    entry.removed = true
    await this.mctx.db.delete(entry.docId)
  }

  /** The Convex document id of a tracked row (for storage cleanup and the like). */
  docId(obj: object): GenericId<any> | null {
    return this.byObj.get(obj)?.docId ?? null
  }
}
