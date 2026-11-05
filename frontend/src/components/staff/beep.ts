/**
 * Scan feedback sounds (PT-03 "bunyi") generated with WebAudio – no audio files, works offline.
 *   valid         → one short high beep, one short buzz
 *   warn          → one mid beep (sesi lain, di luar jam check-in)
 *   used          → two quick low beeps, two buzzes (sudah digunakan)
 *   invalid       → one long low buzz tone, one long buzz (tidak valid)
 * Sudah digunakan and Tidak valid share the red screen, so they never share a sound: a petugas looking away from the
 * phone still knows which one it was.
 */
import { CHECKIN_TONE } from '@/domain/labels'
import type { CheckinResult } from '@/domain/types'

/** Screen colour of a result: green, yellow or red. */
export type BeepKind = 'valid' | 'warn' | 'invalid'
/** Sound and vibration of a result: one per result shown on a red screen. */
export type Sound = BeepKind | 'used'

interface Pattern {
  wave: OscillatorType
  tones: Array<{ freq: number; at: number; dur: number }>
  vibrate: number[]
}

const PATTERNS: Record<Sound, Pattern> = {
  valid: { wave: 'sine', tones: [{ freq: 1568, at: 0, dur: 0.18 }], vibrate: [70] },
  warn: { wave: 'triangle', tones: [{ freq: 740, at: 0, dur: 0.3 }], vibrate: [140] },
  used: {
    wave: 'square',
    tones: [
      { freq: 440, at: 0, dur: 0.14 },
      { freq: 440, at: 0.22, dur: 0.14 },
    ],
    vibrate: [120, 80, 120],
  },
  invalid: { wave: 'square', tones: [{ freq: 200, at: 0, dur: 0.6 }], vibrate: [450] },
}

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try {
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  } catch {
    return null
  }
  return ctx
}

/** Call from a tap so mobile browsers allow the beep on the next (camera-triggered) scan. */
export function unlockAudio(): void {
  audio()
}

export function beep(sound: Sound): void {
  const p = PATTERNS[sound]
  try {
    if ('vibrate' in navigator) navigator.vibrate(p.vibrate)
  } catch {
    /* vibration is optional */
  }
  const ac = audio()
  if (!ac) return
  try {
    const t0 = ac.currentTime + 0.01
    for (const t of p.tones) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = p.wave
      osc.frequency.value = t.freq
      const start = t0 + t.at
      const end = start + t.dur
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.012)
      gain.gain.setValueAtTime(0.3, end - 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      osc.connect(gain).connect(ac.destination)
      osc.start(start)
      osc.stop(end + 0.02)
    }
  } catch {
    /* sound is a bonus, never block the result */
  }
}

export function kindOf(result: CheckinResult): BeepKind {
  const tone = CHECKIN_TONE[result]
  return tone === 'valid' ? 'valid' : tone === 'warn' ? 'warn' : 'invalid'
}

export function soundOf(result: CheckinResult): Sound {
  return result === 'ALREADY_USED' ? 'used' : kindOf(result)
}

export function beepFor(result: CheckinResult): void {
  beep(soundOf(result))
}
