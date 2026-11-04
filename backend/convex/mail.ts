/**
 * Outgoing email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * A request never calls Resend itself: it queues a row in `emails` and schedules `send` in the same transaction.
 * Convex only runs a scheduled function once its mutation commits, so a retried request (OCC conflict, withRetry in
 * http.ts) can never send twice, and the row id is passed as Resend's Idempotency-Key for the action's own retries.
 *
 * Env: RESEND_API_KEY (without it emails are kept as SKIPPED and logged), EMAIL_FROM, APP_URL (links in the email).
 */
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalAction, internalMutation, internalQuery, type MutationCtx } from './_generated/server'

export interface Email {
  to: string
  subject: string
  text: string
  html: string
}

export async function queueEmail(ctx: MutationCtx, email: Email, now: Date): Promise<Id<'emails'>> {
  const id = await ctx.db.insert('emails', { ...email, status: 'QUEUED', createdAt: now.toISOString() })
  await ctx.scheduler.runAfter(0, internal.mail.send, { id })
  return id
}

/** Where the app lives, for links in an email. */
export function appUrl(): string {
  return (process.env.APP_URL ?? '').replace(/\/$/, '')
}

export const get = internalQuery({
  args: { id: v.id('emails') },
  handler: (ctx, { id }) => ctx.db.get(id),
})

export const mark = internalMutation({
  args: {
    id: v.id('emails'),
    status: v.union(v.literal('SENT'), v.literal('FAILED'), v.literal('SKIPPED')),
    error: v.optional(v.string()),
    providerId: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch)
  },
})

export const send = internalAction({
  args: { id: v.id('emails') },
  handler: async (ctx, { id }) => {
    const email = await ctx.runQuery(internal.mail.get, { id })
    if (!email || email.status !== 'QUEUED') return
    const key = process.env.RESEND_API_KEY
    if (!key) {
      console.warn(`email ${id} to ${email.to} not sent: RESEND_API_KEY is not set`)
      await ctx.runMutation(internal.mail.mark, { id, status: 'SKIPPED', error: 'RESEND_API_KEY belum diisi' })
      return
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': id },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Summarevent <onboarding@resend.dev>',
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    })
    const body = await res.text()
    if (res.ok) {
      const providerId = (JSON.parse(body) as { id?: string }).id
      await ctx.runMutation(internal.mail.mark, { id, status: 'SENT', ...(providerId ? { providerId } : {}) })
    } else {
      console.error(`email ${id} to ${email.to} failed: ${res.status} ${body.slice(0, 300)}`)
      await ctx.runMutation(internal.mail.mark, { id, status: 'FAILED', error: `${res.status} ${body.slice(0, 300)}` })
    }
  },
})
