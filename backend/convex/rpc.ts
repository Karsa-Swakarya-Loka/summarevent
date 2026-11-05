/**
 * Every endpoint runs as exactly one Convex query (reads) or mutation (writes), so each request is one serialisable
 * transaction (PRD §8). http.ts maps paths onto the operation names below.
 *
 * Results are returned as a JSON string: the contract's shapes (seat maps, the offline manifest, `seatAssignments`)
 * can be larger than Convex's limits for a single returned value, and the internal fields are stripped on the way.
 */
import { v } from 'convex/values'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import type { TableNames } from './_generated/dataModel'
import type { Req } from './lib/auth'
import { sweep } from './lib/core'
import { receiptPhotoLink } from './lib/links'
import { Refusal } from './lib/errors'
import { hashPassword } from './lib/password'
import { Tx } from './lib/tx'
import { DEMO_PASSWORD } from './shared/demoAccounts'
import { buildSeed } from './shared/seed'
import * as account from './api/account'
import * as admin from './api/admin'
import * as staff from './api/staff'
import * as visitor from './api/visitor'

type Handler = (tx: Tx, req: Req) => Promise<unknown>

export const READS: Record<string, Handler> = {
  listEvents: (tx) => visitor.listEvents(tx),
  getEvent: visitor.getEvent,
  getSeatMap: visitor.getSeatMap,
  suggest: visitor.suggest,
  getOrder: visitor.getOrder,
  checkReceipts: visitor.checkReceipts,
  myOrders: visitor.myOrders,
  myTickets: visitor.myTickets,
  myNotifications: visitor.myNotifications,
  myWaitlist: visitor.myWaitlist,
  checkProfile: visitor.checkProfile,
  'admin.listEvents': admin.listEvents,
  'admin.getEventDraft': admin.getEventDraft,
  'admin.listOrders': admin.listOrders,
  'admin.listReceipts': admin.listReceipts,
  'admin.stats': admin.stats,
  'admin.exportCsv': admin.exportCsv,
  'admin.venues': admin.venues,
  'admin.tenants': admin.tenants,
  'admin.listStaff': admin.listStaff,
  'staff.accounts': staff.accounts,
  'staff.offlineManifest': staff.offlineManifest,
  'staff.searchTickets': staff.searchTickets,
  'staff.recentCheckins': staff.recentCheckins,
  'staff.listReceipts': staff.listReceipts,
}

export const WRITES: Record<string, Handler> = {
  requestOtp: visitor.requestOtp,
  verifyOtp: visitor.verifyOtp,
  demoLogin: visitor.demoLogin,
  login: account.login,
  forgotPassword: account.forgotPassword,
  resetPassword: account.resetPassword,
  createHold: visitor.createHold,
  autoHold: visitor.autoHold,
  updateAttendees: visitor.updateAttendees,
  cancelOrder: visitor.cancelOrder,
  simulatePayment: visitor.simulatePayment,
  confirmFree: visitor.confirmFree,
  joinWaitlist: visitor.joinWaitlist,
  leaveWaitlist: visitor.leaveWaitlist,
  'admin.createEvent': admin.createEvent,
  'admin.updateEvent': admin.updateEvent,
  'admin.patchOrder': admin.patchOrder,
  'admin.patchReceipt': admin.patchReceipt,
  'admin.createStaff': admin.createStaff,
  'admin.setStaffActive': admin.setStaffActive,
  'staff.checkin': staff.checkin,
  'staff.patchReceipt': staff.patchReceipt,
  'demo.expireHold': staff.expireHold,
  'demo.fakeBuyer': staff.fakeBuyer,
}

/** Key of a committed error answer (see Refusal); http.ts turns it into the error response. */
export const REFUSED = '__refused'

/** Fields that exist only inside the backend. */
const INTERNAL = new Set(['pending', 'updatedAt', 'avatarStorageId', 'photoStorageId', 'unusedPhotos', 'oldPhoto'])
export const toJson = (value: unknown) => JSON.stringify(value ?? null, (k, v) => (INTERNAL.has(k) ? undefined : v))

const reqValidator = v.object({
  auth: v.object({ token: v.union(v.string(), v.null()), guestId: v.union(v.string(), v.null()) }),
  params: v.record(v.string(), v.string()),
  query: v.record(v.string(), v.string()),
  body: v.any(),
})

export const read = internalQuery({
  args: { op: v.string(), req: reqValidator },
  handler: async (ctx, { op, req }) => {
    const handler = READS[op]
    if (!handler) throw new Error(`unknown read ${op}`)
    return toJson(await handler(new Tx(ctx), req))
  },
})

export const write = internalMutation({
  args: { op: v.string(), req: reqValidator },
  handler: async (ctx, { op, req }) => {
    const handler = WRITES[op]
    if (!handler) throw new Error(`unknown write ${op}`)
    const tx = new Tx(ctx)
    const result = await handler(tx, req)
    await tx.flush()
    // an error answer whose writes are kept (e.g. a failed sign-in counting towards the rate limit)
    if (result instanceof Refusal) return JSON.stringify({ [REFUSED]: { code: result.code, message: result.message, details: result.details } })
    return toJson(result)
  },
})

/* ------------------------------------------------------------------ uploads (photos go to file storage first) */

export const submitReceipts = internalMutation({
  args: { req: reqValidator, storageIds: v.array(v.union(v.id('_storage'), v.null())) },
  handler: async (ctx, { req, storageIds }) => {
    const tx = new Tx(ctx)
    const result = await visitor.submitReceipts(tx, req, { storageIds, link: receiptPhotoLink })
    await tx.flush()
    // photos that were not kept (rule check failed, or a revised set was replaced) are deleted
    for (const id of result.unusedPhotos) if (id) await ctx.storage.delete(id as never)
    return toJson(result)
  },
})

export const updateProfile = internalMutation({
  args: { req: reqValidator, avatar: v.optional(v.union(v.null(), v.object({ storageId: v.id('_storage') }))) },
  handler: async (ctx, { req, avatar }) => {
    const tx = new Tx(ctx)
    let stored: { storageId: string; url: string } | null | undefined = avatar === null ? null : undefined
    if (avatar) stored = { storageId: avatar.storageId, url: (await ctx.storage.getUrl(avatar.storageId)) ?? '' }
    const { user, oldPhoto } = await visitor.updateProfile(tx, req, stored)
    await tx.flush()
    if (oldPhoto && oldPhoto !== avatar?.storageId) await ctx.storage.delete(oldPhoto as never)
    return toJson(user)
  },
})

export const receiptPhoto = internalQuery({
  args: { receiptId: v.string() },
  handler: async (ctx, { receiptId }) => {
    const r = await ctx.db
      .query('receipts')
      .withIndex('by_key', (q) => q.eq('id', receiptId))
      .unique()
    return r?.photoStorageId ?? null
  },
})

/* ------------------------------------------------------------------ demo data */

const TABLES: TableNames[] = [
  'users',
  'authTokens',
  'otps',
  'passwords',
  'resetTokens',
  'emails',
  'venues',
  'tenants',
  'layouts',
  'seats',
  'events',
  'categories',
  'sessions',
  'sessionSeats',
  'quotas',
  'orders',
  'payments',
  'receipts',
  'tickets',
  'checkins',
  'notifications',
  'waitlist',
]

/** Fill the tables with the demo's sample data (frontend/src/api/mock/seed.ts, synced into shared/seed.ts). */
async function seed(ctx: MutationCtx, now: Date) {
  const db = await buildSeed(now)
  const stamp = now.getTime()
  const put = async (table: TableNames, rows: object[]) => {
    for (const row of rows) await ctx.db.insert(table, JSON.parse(JSON.stringify(row)))
  }
  await put('users', db.users)
  // panitia and petugas sign in with the demo password; the server keeps its PBKDF2 hash, not the mock's SHA-256
  const demoHash = await hashPassword(DEMO_PASSWORD)
  for (const u of db.users) if (u.role !== 'VISITOR') await ctx.db.insert('passwords', { userId: u.id, hash: demoHash, fails: [] })
  await put('venues', db.venues)
  await put('tenants', db.tenants)
  await put('layouts', db.layouts)
  await put('seats', db.seats)
  await put('events', db.events)
  await put('categories', db.categories)
  await put('sessions', db.sessions)
  await put('sessionSeats', db.sessionSeats.map((s) => ({ ...s, updatedAt: stamp })))
  await put('quotas', db.quotas)
  await put('orders', db.orders.map((o) => ({ ...o, pending: o.status === 'AWAITING_PAYMENT' || o.status === 'AWAITING_VERIFICATION' })))
  await put('payments', db.payments)
  await put('receipts', db.receipts)
  await put('tickets', db.tickets)
  await put('checkins', db.checkins)
  await put('notifications', db.notifications)
  await put('waitlist', db.waitlist)
}

/** POST /demo/reset: wipe everything (logins and uploaded photos too) and seed again. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of TABLES) for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id)
    for (const file of await ctx.db.system.query('_storage').collect()) await ctx.storage.delete(file._id)
    await seed(ctx, new Date())
    return null
  },
})

/** Seed only when the database is empty (first deploy). */
export const ensureSeeded = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query('events').first()) return false
    await seed(ctx, new Date())
    return true
  },
})

export const health = internalQuery({
  args: {},
  handler: async (ctx) => ({ seeded: !!(await ctx.db.query('events').first()) }),
})

/** Expiry job (crons.ts): expire due holds, release stray seat holds, tell the waiting list. */
export const sweepJob = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tx = new Tx(ctx)
    await sweep(tx, { seats: true, limit: 200 })
    await tx.flush()
    return null
  },
})
