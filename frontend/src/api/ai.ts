/**
 * The event assistant (AD-01 with AI). It is not part of the Convex contract: it is a Vercel Function next to the app
 * (frontend/api/ai-event.ts), the same for the demo and the live version, so the Gemini key never reaches the browser.
 */

export interface AiTurn {
  role: 'user' | 'ai'
  text: string
}

export interface AiAnswer {
  reply: string
  /** Untrusted: check with sanitizeAiFields before use. */
  fields: unknown
}

export const AI_MAX_TEXT = 600
const TIMEOUT_MS = 25_000

export async function askEventAssistant(messages: AiTurn[], venues: string[]): Promise<AiAnswer> {
  let res: Response
  try {
    res = await fetch('/api/ai-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, venues }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error('Asisten AI tidak terhubung. Cek koneksi, atau isi form manual.')
  }
  const body = (await res.json().catch(() => null)) as { reply?: unknown; fields?: unknown; error?: unknown } | null
  if (!res.ok || !body || typeof body.reply !== 'string') {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Asisten AI belum tersedia di sini. Isi form manual dulu.')
  }
  return { reply: body.reply, fields: body.fields ?? {} }
}
