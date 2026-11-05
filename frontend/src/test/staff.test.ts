/** Petugas scanner helpers: double scans (PT-04) and result sounds (PT-03). */
import { describe, expect, it } from 'vitest'
import { gateScan, SAME_TOKEN_GAP_MS, type Seen } from '@/components/staff/scanGate'
import { soundOf } from '@/components/staff/beep'

describe('camera double scan (PT-04)', () => {
  it('accepts a new QR and remembers it', () => {
    const r = gateScan(null, ' SEV1.a ', 1000, false)
    expect(r).toEqual({ accept: true, seen: { token: 'SEV1.a', at: 1000 } })
  })

  it('ignores empty reads', () => {
    expect(gateScan(null, '  ', 1000, false).accept).toBe(false)
  })

  it('counts a QR held in front of the lens once, however long it stays', () => {
    let seen: Seen | null = gateScan(null, 'SEV1.a', 0, false).seen
    // result on screen for 3.5 s, then closed; the QR is still seen every 400 ms for another 10 s
    for (let t = 400; t <= 13_600; t += 400) {
      const r = gateScan(seen, 'SEV1.a', t, t < 3500)
      expect(r.accept).toBe(false)
      seen = r.seen
    }
  })

  it('counts the same QR again once it has been out of sight', () => {
    const seen = { token: 'SEV1.a', at: 5000 }
    expect(gateScan(seen, 'SEV1.a', 5000 + SAME_TOKEN_GAP_MS - 1, false).accept).toBe(false)
    expect(gateScan(seen, 'SEV1.a', 5000 + SAME_TOKEN_GAP_MS, false).accept).toBe(true)
  })

  it('takes a different QR right away, but not while busy', () => {
    const seen = { token: 'SEV1.a', at: 5000 }
    expect(gateScan(seen, 'SEV1.b', 5100, true)).toEqual({ accept: false, seen })
    expect(gateScan(seen, 'SEV1.b', 5100, false).accept).toBe(true)
  })
})

describe('result sounds (PT-03)', () => {
  it('gives the two red results different sounds', () => {
    expect(soundOf('ALREADY_USED')).not.toBe(soundOf('INVALID'))
    expect(soundOf('VALID')).toBe('valid')
    expect(soundOf('WRONG_SESSION')).toBe('warn')
    expect(soundOf('OUTSIDE_WINDOW')).toBe('warn')
  })
})
