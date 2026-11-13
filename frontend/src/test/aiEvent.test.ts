/** AD-01 with AI: the event assistant's server function and how its answer fills the wizard. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkVenue, editDistance, handleAiEvent, inventedAudience, matchVenue } from '../../api/ai-event'
import { aiKnown, applyAiFields, changedAiFields, mergeAiFields, missingAiFields, sanitizeAiFields } from '@/components/admin/wizard/aiFill'
import { emptyForm, validate } from '@/components/admin/wizard/model'
import type { Venue } from '@/domain/types'
import type { AiEventFields } from '@/components/admin/wizard/aiFill'

const TODAY = '2026-11-12'
const venues: Venue[] = [
  { id: 'v_ciunik', name: 'Atrium Ciunik', capacity: 200 },
  { id: 'v_cileutik', name: 'Atrium Cileutik', capacity: 60 },
  { id: 'v_cibadak', name: 'Atrium Cibadak', capacity: 300 },
]

/** What a full answer from the assistant looks like, in its own words. */
const answer = {
  title: '  Bandung   Kids Fest ',
  description: 'Festival anak dengan lomba mewarnai, cocok untuk keluarga.',
  venueName: 'Atrium Cibadak (kapasitas 300)',
  theme: 'Pertunjukan',
  seating: 'bernomor',
  sessions: [
    { date: '2026-11-28', start: '9.30', end: '12:00' },
    { date: '2026-11-28', start: '14:00', label: 'Sesi sore' },
  ],
  categories: [
    { name: 'VIP', method: 'bayar', price: '100.000' },
    { name: 'Reguler', method: 'bayar', price: 50000 },
    { name: 'Tukar Struk', method: 'struk', minSpend: 300000 },
    { name: 'Festival', method: 'gratis', seated: false, quota: 40 },
  ],
  audience: 200,
}

describe('AI answer → wizard fields', () => {
  it('reads the whole form the assistant knows about: info, seating, sessions, categories', () => {
    const f = sanitizeAiFields({ ...answer, extra: '<script>' }, venues, TODAY)
    expect(f).toEqual({
      title: 'Bandung Kids Fest',
      description: 'Festival anak dengan lomba mewarnai, cocok untuk keluarga.',
      venueId: 'v_cibadak',
      posterTheme: 'stage',
      seatingMode: 'RESERVED',
      sessions: [
        { date: '2026-11-28', start: '09:30', end: '12:00' },
        { date: '2026-11-28', start: '14:00', label: 'Sesi sore' },
      ],
      categories: [
        { name: 'VIP', method: 'PAID', price: 100_000 },
        { name: 'Reguler', method: 'PAID', price: 50_000 },
        { name: 'Tukar Struk', method: 'RECEIPT', minSpend: 300_000 },
        { name: 'Festival', method: 'FREE', seated: false, quota: 40 },
      ],
      audience: 200,
    })
    expect(missingAiFields(f)).toEqual([])
  })

  it('drops what does not pass: a vague venue, past or impossible dates, prices under Rp1.000, decimals, duplicates', () => {
    expect(
      sanitizeAiFields(
        {
          title: 'ab',
          venueName: 'Atrium',
          sessions: [{ date: '2026-11-11', start: '10:00' }, { date: '2026-02-30', start: '10:00' }, { date: '2026-11-20', start: '25:00' }],
          categories: [{ name: 'VIP', method: 'entah' }, { name: 'X', method: 'gratis' }],
          audience: '50,5',
          seating: 'mungkin',
        },
        venues,
        TODAY,
      ),
    ).toEqual({})
    const f = sanitizeAiFields({ categories: [{ name: 'VIP', method: 'bayar', price: 500 }, { name: 'vip', method: 'gratis' }, { name: 'Anak', method: 'gratis' }] }, venues, TODAY)
    // a price under Rp1.000 is left out, so the category still counts as unfinished and the AI asks again
    expect(f.categories).toEqual([{ name: 'VIP', method: 'PAID' }, { name: 'Anak', method: 'FREE' }])
    expect(sanitizeAiFields('not an object', venues, TODAY)).toEqual({})
  })

  it('knows what is still missing, including an unfinished category and a quota for an area without seats', () => {
    expect(missingAiFields({})).toEqual(['title', 'venueId', 'seatingMode', 'sessions', 'categories', 'audience'])
    const f = { title: 'Lomba Mewarnai', venueId: 'v_cileutik', seatingMode: 'GENERAL' as const, sessions: [{ date: '2026-11-29', start: '14:00' }] }
    expect(missingAiFields({ ...f, categories: [{ name: 'Reguler', method: 'PAID' as const }], audience: 50 })).toEqual(['categories'])
    expect(missingAiFields({ ...f, categories: [{ name: 'Gratis', method: 'FREE' as const }] })).toEqual(['categories', 'audience'])
    expect(missingAiFields({ ...f, categories: [{ name: 'Gratis', method: 'FREE' as const }], audience: 50 })).toEqual([])
  })

  it('remembers earlier answers, takes corrections, and tells the assistant what it knows', () => {
    const a = mergeAiFields({}, { title: 'Bandung Kids Fest', venueId: 'v_ciunik' })
    const b = mergeAiFields(a, { venueId: 'v_cibadak', audience: 200 })
    expect(b).toEqual({ title: 'Bandung Kids Fest', venueId: 'v_cibadak', audience: 200 })
    expect(aiKnown({ ...b, seatingMode: 'GENERAL', categories: [{ name: 'Gratis', method: 'FREE' }] }, venues)).toEqual({
      title: 'Bandung Kids Fest',
      venueName: 'Atrium Cibadak',
      seating: 'bebas',
      categories: [{ name: 'Gratis', method: 'gratis' }],
      audience: 200,
    })
    // a second fill brings only what changed, so it does not undo what the panitia typed since
    expect(changedAiFields(b, { ...b, sessions: [{ date: '2026-11-28', start: '09:30' }] })).toEqual({ sessions: [{ date: '2026-11-28', start: '09:30' }] })
    expect(changedAiFields(b, { ...b })).toEqual({})
  })

  it('a later "ganti bernomor" or a new number of visitors rebuilds the categories from all three', () => {
    const bebas: AiEventFields = { title: 'Kids Fest', venueId: 'v_cibadak', seatingMode: 'GENERAL', categories: [{ name: 'Reguler', method: 'PAID', price: 50_000, quota: 30 }, { name: 'Anak', method: 'FREE' }], audience: 120 }
    let form = applyAiFields(emptyForm(venues), bebas, venues)
    expect(form.categories.map((c) => [c.name, c.noSeat, c.quota])).toEqual([['Reguler', true, 30], ['Anak', true, 60]])
    // only the mode changes in the conversation
    const seated: AiEventFields = { ...bebas, seatingMode: 'RESERVED' }
    form = applyAiFields(form, changedAiFields(bebas, seated), venues)
    expect(form.categories.every((c) => !c.noSeat)).toBe(true)
    // only the visitors change: a quota the panitia stated stays
    const more: AiEventFields = { ...bebas, audience: 200 }
    form = applyAiFields(applyAiFields(emptyForm(venues), bebas, venues), changedAiFields(bebas, more), venues)
    expect(form.categories.map((c) => c.quota)).toEqual([30, 100])
  })

  it('fills a form that passes the wizard checks for info, categories and sessions', () => {
    const form = emptyForm(venues)
    const f = sanitizeAiFields(answer, venues, TODAY)
    const out = applyAiFields(form, f, venues)
    expect(out).toMatchObject({ title: 'Bandung Kids Fest', venueId: 'v_cibadak', posterTheme: 'stage', seatingMode: 'RESERVED' })
    expect(out.sessions.map((s) => [s.date, s.start, s.end, s.label])).toEqual([
      ['2026-11-28', '09:30', '12:00', ''],
      ['2026-11-28', '14:00', '16:00', 'Sesi sore'],
    ])
    expect(out.categories.map((c) => [c.name, c.accessMethod, c.price, c.noSeat])).toEqual([
      ['VIP', 'PAID', 100_000, false],
      ['Reguler', 'PAID', 50_000, false],
      ['Tukar Struk', 'RECEIPT', 0, false],
      ['Festival', 'FREE', 0, true],
    ])
    expect(out.categories[2].receiptRules?.minSpend).toBe(300_000)
    expect(out.categories[3].quota).toBe(40)
    // 200 visitors, 14 seats a row: 15 rows, within the venue's 300
    expect(out.layout.rows).toBe(15)
    // nothing left to fix on the steps the assistant fills (the seat rows are spread when Denah opens)
    const issues = validate(out, venues).filter((i) => !i.warning && i.step !== 'denah')
    expect(issues).toEqual([])
    expect(form.title).toBe('')
  })

  it('an event without seat numbers shares the visitors over its categories; seats never outgrow the venue', () => {
    const form = emptyForm(venues)
    const general = applyAiFields(form, { seatingMode: 'GENERAL', categories: [{ name: 'Gratis', method: 'FREE' }], audience: 50, venueId: 'v_cileutik' }, venues)
    expect(general.categories[0]).toMatchObject({ noSeat: true, quota: 50, accessMethod: 'FREE' })
    const big = applyAiFields(form, { audience: 999 }, venues)
    expect(big.layout.rows * big.layout.seatsPerRow).toBeLessThanOrEqual(200)
    const shaped = { ...form, layout: { ...form.layout, blocked: ['A1'] } }
    expect(applyAiFields(shaped, { audience: 50 }, venues).layout).toEqual(shaped.layout)
  })
})

describe('venue check: "Maksudnya …?"', () => {
  const names = ['Atrium Ciunik', 'Sawarga Courtyard', 'Atrium Cileutik', 'Atrium Cibadak']
  const user = (text: string) => [{ role: 'user' as const, text }]

  it('measures typos, a swap of two letters counting once', () => {
    expect(editDistance('cibadek', 'cibadak')).toBe(1)
    expect(editDistance('cibdaak', 'cibadak')).toBe(1)
    expect(editDistance('faris', 'paris')).toBe(1)
  })

  it('finds the venue, the venues a typo may mean, or nothing', () => {
    expect(matchVenue('Cibadak', names)).toEqual({ exact: 'Atrium Cibadak', near: [] })
    expect(matchVenue('atrium cibadak lantai 1', names)).toEqual({ exact: 'Atrium Cibadak', near: [] })
    expect(matchVenue('Cibadek', names)).toEqual({ near: ['Atrium Cibadak'] })
    expect(matchVenue('Ciunk', names)).toEqual({ near: ['Atrium Ciunik'] })
    expect(matchVenue('Sawarga Cortyard', names)).toEqual({ exact: 'Sawarga Courtyard', near: [] })
    expect(matchVenue('Atrium', names)).toEqual({ near: ['Atrium Ciunik', 'Atrium Cileutik', 'Atrium Cibadak'] })
    expect(matchVenue('Faris', names)).toEqual({ near: [] })
    expect(matchVenue('Paris Van Java', names)).toEqual({ near: [] })
  })

  it('keeps a venue the panitia typed, kept from before, or chose from the offer', () => {
    const f = (venueName: string) => ({ venueName })
    let fields: Record<string, unknown> = f('Atrium Cibadak (kapasitas 300)')
    expect(checkVenue(fields, undefined, names, user('di cibadak ya'), {})).toBeNull()
    expect(fields.venueName).toBe('Atrium Cibadak')
    fields = f('Atrium Cibadak')
    expect(checkVenue(fields, undefined, names, user('jam 7 malam'), { venueName: 'Atrium Cibadak' })).toBeNull()
    fields = f('Atrium Cibadak')
    const offer = [...user('di cibadek'), { role: 'ai' as const, text: 'Venue "cibadek" tidak ada di daftar SUMMABA. Maksudnya Atrium Cibadak?' }, ...user('iya')]
    expect(checkVenue(fields, undefined, names, offer, {})).toBeNull()
    expect(fields.venueName).toBe('Atrium Cibadak')
    // a venue the model invented is dropped
    fields = f('Hall Paris')
    expect(checkVenue(fields, undefined, names, user('acara fashion'), {})).toBeNull()
    expect(fields).toEqual({})
  })

  it('asks when the model corrected a typo on its own, quoting what was typed', () => {
    const fields: Record<string, unknown> = { venueName: 'Atrium Ciunik' }
    expect(checkVenue(fields, undefined, names, user('Workshop melukis di Ciunk'), {})).toEqual({ ask: 'Venue "Ciunk" tidak ada di daftar SUMMABA. Maksudnya Atrium Ciunik?', suggest: ['Atrium Ciunik'] })
    expect(fields).toEqual({})
  })

  it('knows a capacity is not a number of visitors, unless the panitia said it', () => {
    const list = ['Atrium Cibadak (kapasitas 300)']
    expect(inventedAudience({ audience: 300 }, list, user('kids fest'), {})).toBe(true)
    expect(inventedAudience({ audience: 300 }, list, user('sekitar 300 orang'), {})).toBe(false)
    expect(inventedAudience({ audience: 300 }, list, user('kids fest'), { audience: 300 })).toBe(false)
    expect(inventedAudience({ audience: 250 }, list, user('kids fest'), {})).toBe(false)
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
  const ok = { messages: [{ role: 'user', text: 'Mau bikin Bandung Kids Fest di Atrium Cibadak' }], venues: venues.map((v) => v.name), known: { title: 'Bandung Kids Fest' } }
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
    expect(sent.systemInstruction.parts[0].text).toContain('"title":"Bandung Kids Fest"')
    expect(sent.generationConfig.responseJsonSchema).toBeTruthy()
  })

  it('asks again without the schema when the model refuses it', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('Unknown name "responseJsonSchema"', { status: 400 })).mockResolvedValueOnce(gemini({ reply: 'Siap.', fields: { title: 'A', extra: 1, price: null } }))
    const res = await handleAiEvent(call(ok), env, fetchImpl as unknown as typeof fetch)
    expect(res.status).toBe(200)
    // only the known fields go back to the browser
    expect((await res.json()).fields).toEqual({ title: 'A' })
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body)).generationConfig.responseJsonSchema).toBeUndefined()
  })

  it('asks the fallback model when the first is busy or too slow, and says so when both are', async () => {
    const used: string[] = []
    const busyThenOk = vi.fn(async (url: string) => {
      used.push(url.match(/models\/([^:]+)/)![1])
      return used.length === 1 ? new Response('high demand', { status: 503 }) : gemini({ reply: 'Siap.', fields: {} })
    })
    expect((await handleAiEvent(call(ok), env, busyThenOk as unknown as typeof fetch)).status).toBe(200)
    expect(used).toEqual(['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'])
    const slow = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    const res = await handleAiEvent(call(ok), env, slow as unknown as typeof fetch)
    expect(slow).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/ramai/)
  })

  it('refuses without a key, from another site, with a bad message, or when Gemini fails', async () => {
    const never = vi.fn() as unknown as typeof fetch
    expect((await handleAiEvent(call(ok), {}, never)).status).toBe(503)
    expect((await handleAiEvent(call(ok, { origin: 'https://evil.example' }), env, never)).status).toBe(403)
    expect((await handleAiEvent(call({ messages: [], venues: ['Atrium'] }), env, never)).status).toBe(400)
    expect((await handleAiEvent(call({ ...ok, messages: [{ role: 'user', text: 'x'.repeat(601) }] }), env, never)).status).toBe(400)
    expect((await handleAiEvent(call({ ...ok, messages: [{ role: 'system', text: 'hi' }] }), env, never)).status).toBe(400)
    expect((await handleAiEvent(call({ ...ok, known: 'x' }), env, never)).status).toBe(400)
    expect((await handleAiEvent(call({ ...ok, messages: Array.from({ length: 13 }, () => ({ role: 'user', text: 'hai' })) }), env, never)).status).toBe(400)
    expect(never).not.toHaveBeenCalled()
    // a bad key is a 400 too: asked once, not twice
    const badKey = vi.fn(async () => new Response('API key not valid', { status: 400 }))
    expect((await handleAiEvent(call(ok), env, badKey as unknown as typeof fetch)).status).toBe(502)
    expect(badKey).toHaveBeenCalledTimes(1)
    // out of quota on both models
    const busy = vi.fn(async () => new Response('quota', { status: 429 }))
    expect((await handleAiEvent(call(ok), env, busy as unknown as typeof fetch)).status).toBe(503)
    expect(busy).toHaveBeenCalledTimes(2)
    const junk = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }))) as unknown as typeof fetch
    const res = await handleAiEvent(call(ok), env, junk)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Isi form manual/)
  })

  it('never fills a venue the panitia mistyped: it asks "Maksudnya …?" and offers the venue to tap', async () => {
    const said = (text: string) => ({ ...ok, messages: [{ role: 'user', text }], known: {} })
    // the model quietly corrected the typo
    const fixed = vi.fn(async () => gemini({ reply: 'Tanggal berapa acaranya?', venueAsked: 'Cibadek', fields: { title: 'Bandung Kids Fest', venueName: 'Atrium Cibadak' } })) as unknown as typeof fetch
    let body = await (await handleAiEvent(call(said('Bandung Kids Fest di Atrium Cibadek')), env, fixed)).json()
    expect(body.fields).toEqual({ title: 'Bandung Kids Fest' })
    expect(body.reply).toBe('Venue "Cibadek" tidak ada di daftar SUMMABA. Maksudnya Atrium Cibadak?\n\nTanggal berapa acaranya?')
    expect(body.suggest).toEqual(['Atrium Cibadak'])
    // a place that is not a SUMMABA venue at all
    const paris = vi.fn(async () => gemini({ reply: 'Tanggal berapa?', venueAsked: 'Faris', fields: { title: 'Pekan Mode' } })) as unknown as typeof fetch
    body = await (await handleAiEvent(call(said('Pekan Mode di Faris')), env, paris)).json()
    expect(body.reply).toMatch(/^"Faris" tidak ada di daftar venue SUMMABA\. Pilih salah satu: Atrium Ciunik, Atrium Cileutik atau Atrium Cibadak\./)
    expect(body.suggest).toEqual(['Atrium Ciunik', 'Atrium Cileutik', 'Atrium Cibadak'])
    // the panitia taps the offered venue: now it is filled, with no question
    const tapped = vi.fn(async () => gemini({ reply: 'Siap.', venueAsked: 'Atrium Cibadak', fields: { venueName: 'Atrium Cibadak' } })) as unknown as typeof fetch
    body = await (await handleAiEvent(call(said('Venuenya Atrium Cibadak.')), env, tapped)).json()
    expect(body).toEqual({ reply: 'Siap.', fields: { venueName: 'Atrium Cibadak' } })
  })

  it('drops a number of visitors the model took from the venue capacity', async () => {
    const guessed = vi.fn(async () => gemini({ reply: 'Form siap diisi.', fields: { title: 'Kids Fest', venueName: 'Atrium Cibadak', audience: 300 } })) as unknown as typeof fetch
    const body = await (await handleAiEvent(call({ ...ok, venues: venues.map((v) => `${v.name} (kapasitas ${v.capacity})`), known: {} }), env, guessed)).json()
    expect(body.fields).toEqual({ title: 'Kids Fest', venueName: 'Atrium Cibadak' })
    expect(body.reply).toBe('Berapa perkiraan jumlah pengunjung per sesi?')
  })

  it('takes back a long reply of its own in the next question', async () => {
    const long = 'Mohon lengkapi: ' + 'x'.repeat(700)
    const fetchImpl = vi.fn(async () => gemini({ reply: 'Siap.', fields: {} })) as unknown as typeof fetch
    const res = await handleAiEvent(call({ ...ok, messages: [{ role: 'user', text: 'Kids fest' }, { role: 'ai', text: long }, { role: 'user', text: 'Sabtu depan' }] }), env, fetchImpl)
    expect(res.status).toBe(200)
  })

  it('limits one address to 40 questions per 5 minutes', async () => {
    const fetchImpl = vi.fn(async () => gemini({ reply: 'Ok.', done: false, fields: {} })) as unknown as typeof fetch
    const same = { 'x-forwarded-for': '192.0.2.7' }
    const now = new Date('2026-11-12T12:00:00Z')
    for (let i = 0; i < 40; i++) expect((await handleAiEvent(call(ok, same), env, fetchImpl, now)).status).toBe(200)
    expect((await handleAiEvent(call(ok, same), env, fetchImpl, now)).status).toBe(429)
    expect((await handleAiEvent(call(ok, same), env, fetchImpl, new Date(now.getTime() + 5 * 60_000 + 1))).status).toBe(200)
  })
})
