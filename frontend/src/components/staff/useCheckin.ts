import { useCallback, useRef, useState } from 'react'
import { api, type CheckinResponse } from '@/api'
import { errorMessage } from '@/hooks/useLive'
import { beep, beepFor } from './beep'

export interface ShownResult {
  res: CheckinResponse
  token: string
  /** Changes per result so <ScanResult key={…}> starts fresh. */
  key: number
}

/** One check-in at a time (POST /staff/checkins), with the beep and the result to show. */
export function useCheckin(sessionId: string) {
  const [current, setCurrent] = useState<ShownResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const seq = useRef(0)

  const submit = useCallback(
    async (token: string): Promise<CheckinResponse | null> => {
      const t = token.trim()
      if (!t || inFlight.current) return null
      inFlight.current = true
      setPending(true)
      setError(null)
      try {
        const res = await api.staff.checkin(t, sessionId)
        beepFor(res.result)
        setCurrent({ res, token: t, key: ++seq.current })
        return res
      } catch (e) {
        beep('invalid')
        setError(`Tiket belum bisa diperiksa: ${errorMessage(e)} Coba lagi atau cari manual.`)
        return null
      } finally {
        inFlight.current = false
        setPending(false)
      }
    },
    [sessionId],
  )

  const dismiss = useCallback(() => setCurrent(null), [])
  const clearError = useCallback(() => setError(null), [])

  return { current, pending, error, submit, dismiss, clearError, busy: inFlight }
}
