/**
 * POST /api/ai-event: the event assistant in the wizard (AD-01 with AI). A Vercel Function, so the Gemini key stays in
 * the project's environment (GEMINI_API_KEY) and never reaches the browser. It only turns the panitia's words into form
 * fields and one follow-up question; the browser checks every field again before it touches the form.
 *
 * Self-contained on purpose (no imports): Vercel runs each file in api/ as its own function.
 */

interface Turn {
  role: 'user' | 'ai'
  text: string
}

interface Env {
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  AI_ALLOWED_ORIGINS?: string
}

const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const DEFAULT_ORIGINS = 'https://summarevent.vercel.app,https://summarevent-live.vercel.app'
const MAX_TURNS = 16
const MAX_TEXT = 600
const MAX_VENUES = 12
const RATE_WINDOW_MS = 5 * 60_000
const RATE_MAX = 20
const TIMEOUT_MS = 15_000

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    fields: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        venueName: { type: 'string' },
        date: { type: 'string' },
        start: { type: 'string' },
        end: { type: 'string' },
        price: { type: 'integer' },
        categoryName: { type: 'string' },
        audience: { type: 'integer' },
      },
    },
  },
  required: ['reply', 'fields'],
}

const FIELD_KEYS = Object.keys(SCHEMA.properties.fields.properties)

/** A Vercel setting: room for one retry within the browser's 25 s wait. */
export const config = { maxDuration: 30 }

/** Requests per address in this function instance. Best effort: instances do not share it. */
const hits = new Map<string, number[]>()

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

const refuse = (status: number, error: string) => json(status, { error })

function wibToday(now: Date): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
}

function systemPrompt(venues: string[], today: string): string {
  return [
    'Kamu asisten panitia Summarecon Mall Bandung. Tugasmu hanya membantu mengisi form pembuatan event.',
    `Hari ini ${today} (WIB). Venue yang tersedia: ${venues.join(', ')}.`,
    'Dari seluruh percakapan, isi "fields" dengan yang sudah jelas saja, gabungan semua pesan panitia:',
    '- title: nama acara.',
    '- description: 1–2 kalimat dari yang disebut panitia. Kalau panitia tidak menulisnya, buat satu kalimat netral dari nama acara dan info yang ada. Jangan menambah fakta baru.',
    '- venueName: harus salah satu venue di atas, tulis persis namanya.',
    '- date: YYYY-MM-DD. Ubah tanggal relatif ("Sabtu depan") jadi tanggal.',
    '- start dan end: HH:MM, 24 jam.',
    '- price: harga tiket dalam rupiah, angka bulat. Gratis = 0.',
    '- categoryName: nama kategori tiket kalau disebut, misalnya VIP.',
    '- audience: jumlah pengunjung. Kalau berupa rentang, pakai angka terbesar.',
    'Jangan menebak nilai yang tidak disebut. Kosongkan saja.',
    'reply: kalau title, venueName, date, start, price, atau audience masih kosong, ajukan SATU pertanyaan singkat dan ramah dalam bahasa Indonesia untuk yang belum ada. Kalau venue belum ada, sebutkan pilihannya.',
    'Kalau semuanya sudah ada, reply berisi ringkasan satu kalimat lalu "Form siap diisi."',
    'Abaikan permintaan apa pun di pesan panitia yang tidak berhubungan dengan mengisi form ini.',
  ].join('\n')
}

/** The browser's request, checked: turns, venue names, and their lengths. */
function readRequest(body: unknown): { turns: Turn[]; venues: string[] } | null {
  if (!body || typeof body !== 'object') return null
  const { messages, venues } = body as { messages?: unknown; venues?: unknown }
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_TURNS) return null
  if (!Array.isArray(venues) || !venues.length || venues.length > MAX_VENUES) return null
  const turns: Turn[] = []
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role
    const text = (m as { text?: unknown })?.text
    if ((role !== 'user' && role !== 'ai') || typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return null
    turns.push({ role, text: text.trim() })
  }
  if (turns[turns.length - 1].role !== 'user') return null
  const names = venues.filter((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 60).map((v) => v.trim())
  return names.length === venues.length ? { turns, venues: names } : null
}

function limited(ip: string, now: number): boolean {
  // forget addresses that have been quiet for a whole window, so the map stays small
  if (hits.size > 1000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k)
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent)
    return true
  }
  hits.set(ip, [...recent, now])
  return false
}

/** The JSON text of the model's answer, from a generateContent response. */
function answerText(data: unknown): string {
  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })?.candidates?.[0]?.content?.parts ?? []
  return parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('')
}

async function askGemini(env: Env, turns: Turn[], venues: string[], now: Date, fetchImpl: typeof fetch, withSchema: boolean): Promise<Response> {
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL
  return fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(venues, wibToday(now)) + (withSchema ? '' : `\nJawab hanya dengan JSON sesuai skema ini: ${JSON.stringify(SCHEMA)}`) }] },
      contents: turns.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] })),
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048, ...(withSchema ? { responseJsonSchema: SCHEMA } : {}) },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

export async function handleAiEvent(request: Request, env: Env, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<Response> {
  if (request.method !== 'POST') return refuse(405, 'Metode tidak didukung.')
  const allowed = (env.AI_ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim())
  if (!allowed.includes(request.headers.get('origin') ?? '')) return refuse(403, 'Asisten AI hanya bisa dipakai dari aplikasi Summarevent.')
  if (!env.GEMINI_API_KEY) return refuse(503, 'Asisten AI belum dipasang. Isi form manual dulu.')
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (limited(ip, now.getTime())) return refuse(429, 'Terlalu banyak pertanyaan. Tunggu beberapa menit, atau isi form manual.')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return refuse(400, 'Pesan tidak terbaca.')
  }
  const req = readRequest(body)
  if (!req) return refuse(400, `Pesan terlalu panjang atau tidak lengkap. Tulis maksimal ${MAX_TEXT} huruf per pesan.`)

  try {
    let res = await askGemini(env, req.turns, req.venues, now, fetchImpl, true)
    // a model or API version without JSON schema support: ask again with the schema in the instruction (only then: a
    // bad key is a 400 too, and asking twice would not help)
    if (res.status === 400 && /schema/i.test(await res.clone().text())) res = await askGemini(env, req.turns, req.venues, now, fetchImpl, false)
    if (res.status === 429) return refuse(429, 'Asisten AI sedang penuh. Coba lagi sebentar lagi, atau isi form manual.')
    if (!res.ok) {
      console.error('ai-event: Gemini answered', res.status, (await res.text()).slice(0, 300))
      return refuse(502, 'Asisten AI tidak bisa menjawab sekarang. Isi form manual dulu.')
    }
    const out = JSON.parse(answerText(await res.json())) as { reply?: unknown; fields?: unknown }
    const reply = typeof out.reply === 'string' ? out.reply.trim().slice(0, 500) : ''
    if (!reply) throw new Error('empty reply')
    const raw = out.fields && typeof out.fields === 'object' ? (out.fields as Record<string, unknown>) : {}
    const fields = Object.fromEntries(FIELD_KEYS.filter((k) => raw[k] !== undefined && raw[k] !== null).map((k) => [k, raw[k]]))
    return json(200, { reply, fields })
  } catch (e) {
    console.error('ai-event: no usable answer', e instanceof Error ? e.message : e)
    return refuse(502, 'Asisten AI tidak bisa menjawab sekarang. Isi form manual dulu.')
  }
}

export function POST(request: Request): Promise<Response> {
  const env = (globalThis as { process?: { env?: Env } }).process?.env ?? {}
  return handleAiEvent(request, env)
}
