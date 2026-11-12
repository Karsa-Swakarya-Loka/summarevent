/** AD-01 with AI: the event assistant's server function and how its answer fills the wizard. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAiEvent } from '../../api/ai-event'
import { applyAiFields, mergeAiFields, missingAiFields, sanitizeAiFields } from '@/components/admin/wizard/aiFill'
import { emptyForm } from '@/components/admin/wizard/model'
import type { Venue } from '@/domain/types'

const venues: Venue[] = [
  { id: 'v_ciunik', name: 'Atrium Ciunik', capacity: 200 },
  { id: 'v_cileutik', name: 'Atrium Cileutik', capacity: 60 },
  { id: 'v_cibadak', name: 'Atrium Cibadak', capacity: 300 },
]

describe('AI answer → wizard fields', () => {
  it('keeps only fields that pass every check', () => {
    const f = sanitizeAiFields(
      {
        title: '  Bandung   Kids Fest ',
        venueName: 'atrium cibadak',
        date: '2026-11-28',
        start: '9.30',
        end: '08:00',
        price: '50.000',
        audience: 200,
        categoryName: 'X',
        description: 'Festival anak dengan lomba mewarnai.',
        extra: '<script>',
      },
      venues,
    )
    expect(f).toEqual({ title: 'Bandung Kids Fest', venueId: 'v_cibadak', date: '2026-11-28', start: '09:30', price: 50_000, audience: 200, description: 'Festival anak dengan lomba mewarnai.' })
    // an end before the start, a one-letter category name and unknown keys are dropped
    expect(sanitizeAiFields({ venueName: 'Parkir Timur', date: '2026-02-30', start: '25:00', price: -1, audience: 0, title: 'ab' }, venues)).toEqual({})
    expect(sanitizeAiFields('not an object', venues)).toEqual({})
  })

  it('remembers earlier answers and says what is still missing', () => {
    const a = mergeAiFields({}, { title: 'Bandung Kids Fest', price: 0 })
    const b = mergeAiFields(a, { date: '2026-11-28', price: 50_000 })
    expect(b).toEqual({ title: 'Bandung Kids Fest', date: '2026-11-28', price: 50_000 })
    expect(missingAiFields(b)).toEqual(['venueId', 'start', 'audience'])
  })

  it('fills the form: venue, first session, first category, and a seat map sized to the visitors', () => {
    const form = emptyForm(venues)
    const out = applyAiFields(form, { title: 'Bandung Kids Fest', venueId: 'v_cibadak', date: '2026-11-28', start: '09:30', price: 50_000, audience: 250 }, venues)
    expect(out.title).toBe('Bandung Kids Fest')
    expect(out.venueId).toBe('v_cibadak')
    expect(out.sessions[0]).toMatchObject({ date: '2026-11-28', start: '09:30', end: '11:30' })
    expect(out.categories[0]).toMatchObject({ name: 'Reguler', price: 50_000, accessMethod: 'PAID' })
    // 250 visitors, 14 seats a row: 18 rows (252 seats), within the venue's 300
    expect(out.layout.seatsPerRow).toBe(14)
    expect(out.layout.rows).toBe(18)
    // the form it started from is left as it was
    expect(form.title).toBe('')
  })

  it('a free event, more visitors than the venue holds, and a seat map the panitia already shaped', () => {
    const form = emptyForm(venues)
    const free = applyAiFields(form, { price: 0, audience: 999 }, venues)
    expect(free.categories[0]).toMatchObject({ name: 'Gratis', price: 0, accessMethod: 'FREE' })
    expect(free.layout.rows * free.layout.seatsPerRow).toBeGreaterThanOrEqual(200)
    expect(free.layout.rows).toBe(15) // the venue holds 200: 15 rows of 14
    const shaped = { ...form, layout: { ...form.layout, blocked: ['A1'] } }
    expect(applyAiFields(shaped, { audience: 50 }, venues).layout).toEqual(shaped.layout)
    const standing = { ...form, seatingMode: 'GENERAL' as const }
    expect(applyAiFields(standing, { audience: 120 }, venues).categories[0].quota).toBe(120)
  })
})

describe('POST /api/ai-event', () => {
  const ORIGIN = 'https://summarevent.vercel.app'
  const env = { GEMINI_API_KEY: 'test-key' }
  let ip = 0
  const call = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://summarevent.vercel.app/api/ai-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'x-forwarded-for': `10.0.0.${++ip}`, ...headers },
      body: JSON.stringify(body),
    })
  const ok = { messages: [{ role: 'user', text: 'Mau bikin Bandung Kids Fest di Atrium Cibadak' }], venues: venues.map((v) => v.name) }
  const gemini = (answer: unknown, status = 200) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status })

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('asks Gemini with the key on the server and returns the reply and fields', async () => {
    const fetchImpl = vi.fn(async () => gemini({ reply: 'Tanggal berapa acaranya?', done: false, fields: { title: 'Bandung Kids Fest' } }))
    const res = await handleAiEvent(call(ok), env, fetchImpl as unknown as typeof fetch, new Date('2026-11-12T12:00:00Z'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ reply: 'Tanggal berapa acaranya?', fields: { title: 'Bandung Kids Fest' } })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/models\/[\w.-]+:generateContent$/)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    const sent = JSON.parse(String(init.body))
    expect(sent.systemInstruction.parts[0].text).toContain('2026-11-12')
    expect(sent.generationConfig.responseJsonSchema).toBeTruthy()
  })

  it('asks again without the schema when the model refuses it', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('bad', { status: 400 })).mockResolvedValueOnce(gemini({ reply: 'Siap.', done: true, fields: {} }))
    const res = await handleAiEvent(call(ok), env, fetchImpl as unknown as typeof fetch)
    expect(res.status).toBe(200)
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body)).generationConfig.responseJsonSchema).toBeUndefined()
  })

  it('refuses without a key, from another site, with a bad message, or when Gemini fails', async () => {
    const never = vi.fn() as unknown as typeof fetch
    expect((await handleAiEvent(call(ok), {}, never)).status).toBe(503)
    expect((await handleAiEvent(call(ok, { origin: 'https://evil.example' }), env, never)).status).toBe(403)
    expect((await handleAiEvent(call({ messages: [], venues: ['Atrium'] }), env, never)).status).toBe(400)
    expect((await handleAiEvent(call({ ...ok, messages: [{ role: 'user', text: 'x'.repeat(601) }] }), env, never)).status).toBe(400)
    expect((await handleAiEvent(call({ ...ok, messages: [{ role: 'system', text: 'hi' }] }), env, never)).status).toBe(400)
    expect(never).not.toHaveBeenCalled()
    const busy = vi.fn(async () => new Response('quota', { status: 429 })) as unknown as typeof fetch
    expect((await handleAiEvent(call(ok), env, busy)).status).toBe(429)
    const junk = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }))) as unknown as typeof fetch
    const res = await handleAiEvent(call(ok), env, junk)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Isi form manual/)
  })

  it('limits one address to 20 questions per 5 minutes', async () => {
    const fetchImpl = vi.fn(async () => gemini({ reply: 'Ok.', done: false, fields: {} })) as unknown as typeof fetch
    const same = { 'x-forwarded-for': '192.0.2.7' }
    const now = new Date('2026-11-12T12:00:00Z')
    for (let i = 0; i < 20; i++) expect((await handleAiEvent(call(ok, same), env, fetchImpl, now)).status).toBe(200)
    expect((await handleAiEvent(call(ok, same), env, fetchImpl, now)).status).toBe(429)
    expect((await handleAiEvent(call(ok, same), env, fetchImpl, new Date(now.getTime() + 5 * 60_000 + 1))).status).toBe(200)
  })
})
