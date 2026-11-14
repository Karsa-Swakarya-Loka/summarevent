// The clocks of the app: a time left always says its units, a day is said the way people say it, and an event card
// counts to the end of the running session or the start of the next one.
import { describe, expect, it } from 'vitest'
import { countdownUnits, fmtDuration, fmtLeft, fmtRelDay } from '@/lib/format'
import { eventClock, holdLabel, orderSteps } from '@/components/visitor/helpers'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('time left', () => {
  it('says its units, never a bare mm:ss', () => {
    expect(fmtLeft(2 * DAY + 5 * HOUR + 3 * MIN)).toBe('2 hari 5 jam')
    expect(fmtLeft(3 * DAY)).toBe('3 hari')
    expect(fmtLeft(5 * HOUR + 12 * MIN + 30_000)).toBe('5 jam 12 mnt')
    expect(fmtLeft(9 * MIN + 5_000)).toBe('9 mnt 05 dtk')
    expect(fmtLeft(45_000)).toBe('45 dtk')
    expect(fmtLeft(9 * MIN + 5_000, { seconds: false })).toBe('9 mnt')
    expect(fmtLeft(30_000, { seconds: false })).toBe('< 1 mnt')
    expect(fmtLeft(-5_000)).toBe('0 dtk')
  })
  it('gives the tiles from the largest unit, seconds always last', () => {
    expect(countdownUnits(DAY + 2 * HOUR + 3 * MIN + 4_000).map((u) => `${u.value}${u.unit}`)).toEqual(['1hari', '2jam', '3mnt', '4dtk'])
    expect(countdownUnits(2 * HOUR + 4_000).map((u) => u.unit)).toEqual(['jam', 'mnt', 'dtk'])
    expect(countdownUnits(59_000).map((u) => `${u.value}${u.unit}`)).toEqual(['0mnt', '59dtk'])
  })
  it('measures a stretch of time', () => {
    expect(fmtDuration(HOUR)).toBe('1 jam')
    expect(fmtDuration(90 * MIN)).toBe('1 jam 30 mnt')
    expect(fmtDuration(45 * MIN)).toBe('45 mnt')
    expect(fmtDuration(0)).toBe('0 mnt')
  })
  it('names days in WIB the way people say them', () => {
    // 23.30 WIB on 14 Nov: 00.30 WIB is already tomorrow, though both are 14 Nov in UTC
    const now = new Date('2026-11-14T16:30:00Z')
    expect(fmtRelDay('2026-11-14T05:00:00Z', now)).toBe('Hari ini')
    expect(fmtRelDay('2026-11-14T17:30:00Z', now)).toBe('Besok')
    expect(fmtRelDay('2026-11-16T03:00:00Z', now)).toBe('Lusa')
    expect(fmtRelDay('2026-11-13T03:00:00Z', now)).toBe('Kemarin')
    expect(fmtRelDay('2026-11-21T09:00:00Z', now)).toBe('Sab, 21 Nov')
  })
})

describe('event card clock', () => {
  const now = new Date('2026-11-14T10:00:00Z')
  const s = (start: number, end: number) => ({ startAt: new Date(now.getTime() + start).toISOString(), endAt: new Date(now.getTime() + end).toISOString() })
  it('counts to the end of the session running now', () => {
    expect(eventClock([s(-HOUR, HOUR), s(3 * HOUR, 4 * HOUR)], now)).toEqual({ label: 'Berakhir dalam', to: s(0, HOUR).endAt, live: true })
  })
  it('else counts to the start of the next session', () => {
    expect(eventClock([s(5 * HOUR, 6 * HOUR), s(2 * HOUR, 3 * HOUR), s(-3 * HOUR, -2 * HOUR)], now)).toEqual({ label: 'Mulai dalam', to: s(2 * HOUR, 0).startAt, live: false })
  })
  it('shows nothing once every session is over', () => {
    expect(eventClock([s(-3 * HOUR, -2 * HOUR)], now)).toBeNull()
  })
})

describe('hold countdown label', () => {
  const d = (status: string, extra: Record<string, unknown> = {}, receipts: Array<{ status: string }> = []) => ({ order: { status, paymentMethod: 'QRIS', totalAmount: 100000, ...extra }, receipts }) as never
  it('says what the time is for', () => {
    expect(holdLabel(d('AWAITING_PAYMENT'))).toBe('Bayar dalam')
    expect(holdLabel(d('AWAITING_PAYMENT', { paymentMethod: 'FREE', totalAmount: 0 }))).toBe('Konfirmasi dalam')
    expect(holdLabel(d('AWAITING_VERIFICATION', {}, [{ status: 'PENDING' }]))).toBe('Ditahan')
    expect(holdLabel(d('AWAITING_VERIFICATION', {}, [{ status: 'NEEDS_REVISION' }]))).toBe('Kirim dalam')
  })
})

describe('order tracker', () => {
  const o = (status: string, extra: Record<string, unknown> = {}, tickets: Array<{ status: string }> = []) =>
    ({ order: { status, paymentMethod: 'SIM_QRIS', totalAmount: 100000, items: [{ seatLabel: 'G3' }], ...extra }, tickets }) as never
  const states = (d: never) => orderSteps(d)?.map((s) => `${s.label}:${s.state}`)
  it('walks held, paid, e-ticket, check-in', () => {
    expect(states(o('AWAITING_PAYMENT'))).toEqual(['Kursi ditahan:done', 'Dibayar:current', 'E-ticket terbit:todo', 'Check-in:todo'])
    expect(states(o('CONFIRMED', {}, [{ status: 'ACTIVE' }]))).toEqual(['Kursi ditahan:done', 'Dibayar:done', 'E-ticket terbit:done', 'Check-in:current'])
    expect(states(o('CONFIRMED', {}, [{ status: 'USED' }, { status: 'USED' }]))?.every((x) => x.endsWith(':done'))).toBe(true)
  })
  it('names the second stop after the way in', () => {
    expect(orderSteps(o('AWAITING_VERIFICATION', { paymentMethod: 'RECEIPT', totalAmount: 0 }))?.[1].label).toBe('Struk dicek')
    expect(orderSteps(o('AWAITING_PAYMENT', { paymentMethod: 'FREE', totalAmount: 0, items: [{ seatLabel: null }] }))?.map((s) => s.label).slice(0, 2)).toEqual(['Tempat ditahan', 'Dikonfirmasi'])
  })
  it('shows no way for an order that ended without tickets', () => {
    for (const st of ['EXPIRED', 'CANCELLED', 'REJECTED']) expect(orderSteps(o(st))).toBeNull()
  })
})
