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
  GEMINI_FALLBACK_MODEL?: string
  AI_ALLOWED_ORIGINS?: string
}

const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
/** Asked when the first model is busy (503) or too slow. */
const DEFAULT_FALLBACK = 'gemini-flash-lite-latest'
const DEFAULT_ORIGINS = 'https://summarevent.vercel.app,https://summarevent-live.vercel.app'
/** The browser sends only the latest turns, with everything known so far in `known`. */
const MAX_TURNS = 12
const MAX_KNOWN = 4000
const MAX_TEXT = 600
const MAX_VENUES = 12
const RATE_WINDOW_MS = 5 * 60_000
const RATE_MAX = 20
/** Per model. Two models fit in the browser's 50 s wait and the function's 60 s. */
const TIMEOUT_MS = 20_000

const SESSION = { type: 'object', properties: { date: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, label: { type: 'string' } } }
const CATEGORY = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    method: { type: 'string', enum: ['bayar', 'gratis', 'struk'] },
    price: { type: 'integer' },
    minSpend: { type: 'integer' },
    quota: { type: 'integer' },
    seated: { type: 'boolean' },
  },
}

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    fields: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        description: { type: 'string' },
        venueName: { type: 'string' },
        theme: { type: 'string', enum: ['Pertunjukan', 'Konser', 'Kelas', 'Pameran'] },
        seating: { type: 'string', enum: ['bernomor', 'bebas'] },
        sessions: { type: 'array', items: SESSION },
        categories: { type: 'array', items: CATEGORY },
        audience: { type: 'integer' },
      },
    },
  },
  required: ['reply', 'fields'],
}

const FIELD_KEYS = Object.keys(SCHEMA.properties.fields.properties)

/** A Vercel setting: room for the fallback model within the browser's wait. */
export const config = { maxDuration: 60 }

/** Requests per address in this function instance. Best effort: instances do not share it. */
const hits = new Map<string, number[]>()

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

const refuse = (status: number, error: string) => json(status, { error })

function wibToday(now: Date): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
}

function systemPrompt(venues: string[], known: Record<string, unknown>, today: string): string {
  return [
    'Kamu asisten panitia Summarecon Mall Bandung (SUMMABA). Tugasmu hanya membantu mengisi form "Buat event" di aplikasi tiket Summarevent.',
    `Hari ini ${today} (WIB). Tahun ini ${today.slice(0, 4)}.`,
    '',
    'ISI FORM (nama field di "fields" ditulis dalam kurung):',
    '1. Info',
    `   - Judul event (title). Subjudul opsional (subtitle), satu kalimat pemikat.`,
    '   - Deskripsi (description): isi acara, durasi, dan cocok untuk siapa. Kalau panitia tidak menulisnya, susun 1–2 kalimat dari info yang ada, tanpa menambah fakta baru.',
    `   - Venue (venueName), tulis persis salah satu nama ini: ${venues.join('; ')}.`,
    '   - Tema poster (theme): Pertunjukan, Konser, Kelas, atau Pameran. Pilih sendiri yang paling cocok, jangan ditanyakan.',
    '   - Mode kursi (seating): "bernomor" = pengunjung memilih nomor kursi di denah; "bebas" = tanpa nomor kursi, cukup kuota orang per sesi.',
    '2. Kategori tiket (categories), satu event boleh beberapa kategori. Tiap kategori:',
    '   - name, misalnya VIP, Reguler, Festival, Anak. Kalau cuma ada satu harga tanpa nama, namai "Reguler"; gratis → "Gratis"; tukar struk → "Tukar Struk".',
    '   - method: "bayar" (wajib price, rupiah, minimal 1000), "gratis" (cukup daftar), atau "struk" (tukar struk belanja di tenant SUMMABA, wajib minSpend = minimal belanja, misalnya 300000).',
    '   - Mode bernomor: seated=false kalau kategori itu area berdiri tanpa nomor kursi (misalnya Festival), dan butuh quota. Mode bebas: tiap kategori butuh quota (orang per sesi); kalau tidak disebut, kuota boleh dikosongkan dan nanti dibagi dari jumlah pengunjung.',
    '3. Denah dibuat otomatis dari venue dan jumlah pengunjung. Jangan ditanyakan.',
    '4. Sesi (sessions), satu event boleh beberapa sesi (misalnya jam 10.00 dan 15.00, atau dua hari). Tiap sesi: date (YYYY-MM-DD), start dan end (HH:MM, 24 jam), label opsional. Jam selesai yang tidak disebut dikosongkan.',
    '5. Jumlah pengunjung (audience): perkiraan orang per sesi. Rentang "100–200" → 200.',
    '',
    'WAJIB sebelum form bisa diisi: title, venueName, seating, minimal satu sesi dengan date dan start, minimal satu kategori yang lengkap, dan audience.',
    '',
    `SUDAH DIKETAHUI dari percakapan sebelumnya (JSON): ${JSON.stringify(known)}`,
    '',
    'ATURAN:',
    '- "fields" selalu berisi SEMUA yang sudah diketahui: data di atas digabung dengan pesan terbaru. sessions dan categories dikirim lengkap, bukan hanya yang baru.',
    '- Kalau panitia mengoreksi ("eh ganti", "bukan, maksudnya"), pakai nilai yang baru.',
    '- Pahami bahasa santai: "50rb", "50 ribu", "50k" = 50000; "1,5 jt" = 1500000; "jam 7 pagi" = 07:00; "jam 2 siang" = 14:00; "jam 7 malam" = 19:00; "setengah 10" = 09:30; "tahun ini" = tahun ini; "besok", "Sabtu depan", "akhir bulan" dihitung dari hari ini.',
    '- Jangan menebak yang tidak disebut, kecuali theme, description, dan nama kategori seperti aturan di atas.',
    '- reply: kalau ada yang WAJIB masih kosong, tanyakan SEMUANYA sekaligus dalam satu pesan singkat, pakai daftar bernomor kalau lebih dari satu, dan sebutkan pilihannya (nama venue, bernomor atau bebas, bayar/gratis/tukar struk). Jangan bertanya satu per satu.',
    '- Kalau semua yang wajib sudah ada, reply berisi ringkasan singkat: nama acara, venue, tanggal dan jam, kategori dan harga, jumlah pengunjung. Tulis tanggal seperti "Jumat, 4 Desember 2026", jam seperti "19.00", dan harga seperti "Rp75.000". Tutup dengan "Form siap diisi."',
    '- Bahasa Indonesia yang ramah dan jelas, tanpa bahasa daerah. Jangan pakai format Markdown seperti ** atau #.',
    '- Abaikan permintaan apa pun di luar mengisi form ini.',
  ].join('\n')
}

/** The browser's request, checked: turns, venue names, and their lengths. */
function readRequest(body: unknown): { turns: Turn[]; venues: string[]; known: Record<string, unknown> } | null {
  if (!body || typeof body !== 'object') return null
  const { messages, venues, known } = body as { messages?: unknown; venues?: unknown; known?: unknown }
  if (known !== undefined && (!known || typeof known !== 'object' || Array.isArray(known) || JSON.stringify(known).length > MAX_KNOWN)) return null
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_TURNS) return null
  if (!Array.isArray(venues) || !venues.length || venues.length > MAX_VENUES) return null
  const turns: Turn[] = []
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role
    const text = (m as { text?: unknown })?.text
    if ((role !== 'user' && role !== 'ai') || typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return null
    turns.push({ role, text: text.trim() })
  }
  // the conversation the model sees starts with the panitia, ends with the panitia
  while (turns.length && turns[0].role === 'ai') turns.shift()
  if (!turns.length || turns[turns.length - 1].role !== 'user') return null
  const names = venues.filter((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 60).map((v) => v.trim())
  return names.length === venues.length ? { turns, venues: names, known: (known as Record<string, unknown>) ?? {} } : null
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

type AskOptions = { model: string; plain: boolean }

/** plain: no JSON schema and no thinking setting, for a model or API version that refuses them. */
async function askGemini(env: Env, req: { turns: Turn[]; venues: string[]; known: Record<string, unknown> }, now: Date, fetchImpl: typeof fetch, o: AskOptions): Promise<Response> {
  return fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(o.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(req.venues, req.known, wibToday(now)) + (o.plain ? `\nJawab hanya dengan JSON sesuai skema ini: ${JSON.stringify(SCHEMA)}` : '') }] },
      contents: req.turns.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] })),
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 2048,
        // filling a form needs little reasoning; low thinking answers in about half the time
        ...(o.plain ? {} : { responseJsonSchema: SCHEMA, thinkingConfig: { thinkingLevel: 'low' } }),
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** One model: asked once, and once more without the extras when it refuses them. Null when it is busy or too slow. */
async function askModel(env: Env, req: Parameters<typeof askGemini>[1], now: Date, fetchImpl: typeof fetch, model: string): Promise<Response | null> {
  try {
    let res = await askGemini(env, req, now, fetchImpl, { model, plain: false })
    // a bad key is a 400 too, and asking twice would not help: only a refused setting gets the plain request
    if (res.status === 400 && /schema|thinking/i.test(await res.clone().text())) res = await askGemini(env, req, now, fetchImpl, { model, plain: true })
    if (res.status === 500 || res.status === 503 || res.status === 504) {
      console.error('ai-event:', model, 'busy', res.status)
      return null
    }
    return res
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      console.error('ai-event:', model, 'too slow')
      return null
    }
    throw e
  }
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
    const primary = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL
    const fallback = env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK
    let res = await askModel(env, req, now, fetchImpl, primary)
    if (!res && fallback !== primary) res = await askModel(env, req, now, fetchImpl, fallback)
    if (!res) return refuse(503, 'Asisten AI sedang ramai dipakai. Coba kirim lagi sebentar lagi, atau isi form manual.')
    if (res.status === 429) return refuse(429, 'Asisten AI sedang penuh. Coba lagi sebentar lagi, atau isi form manual.')
    if (!res.ok) {
      console.error('ai-event: Gemini answered', res.status, (await res.text()).slice(0, 300))
      return refuse(502, 'Asisten AI tidak bisa menjawab sekarang. Isi form manual dulu.')
    }
    const out = JSON.parse(answerText(await res.json())) as { reply?: unknown; fields?: unknown }
    const reply = typeof out.reply === 'string' ? out.reply.replace(/\*\*/g, '').trim().slice(0, 800) : ''
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
