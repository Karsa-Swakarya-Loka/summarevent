import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import type { User } from '@/domain/types'

export interface LiveState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  reload: () => void
}

/**
 * Fetch + keep fresh: re-runs when the data changes (mock: other tabs too;
 * http: 3 s polling) and, optionally, on an interval for changes that only time makes (a hold running out). The
 * backend's poll already covers that, so the interval runs in the demo only, and never while the page is hidden.
 */
export function useLive<T>(fetcher: () => Promise<T>, deps: unknown[], opts: { intervalMs?: number; enabled?: boolean } = {}): LiveState<T> {
  const { intervalMs, enabled = true } = opts
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const seq = useRef(0)

  const run = useCallback(() => {
    const id = ++seq.current
    fetcherRef
      .current()
      .then((d) => {
        if (id !== seq.current) return
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (id !== seq.current) return
        setError(e)
      })
      .finally(() => {
        if (id === seq.current) setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    run()
    const unsub = api.subscribe(run)
    const hidden = () => document.visibilityState === 'hidden'
    const t = intervalMs && api.mode !== 'http' ? setInterval(() => !hidden() && run(), intervalMs) : null
    const onShow = () => !hidden() && run()
    if (t) document.addEventListener('visibilitychange', onShow)
    return () => {
      unsub()
      if (t) {
        clearInterval(t)
        document.removeEventListener('visibilitychange', onShow)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, run, ...deps])

  return { data, error, loading, reload: run }
}

/** Current time, re-rendering every `ms`. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message
  return 'Terjadi kesalahan. Coba lagi.'
}

/**
 * The signed-in panitia or petugas, read again whenever the API reports a change, so a session the server has ended
 * (a new password set elsewhere, the data reset) sends the shell back to sign-in instead of failing on every request.
 */
export function useAccount(role: 'ADMIN' | 'STAFF'): User | null {
  const [user, setUser] = useState(() => api.currentUser(role))
  useEffect(
    () =>
      api.subscribe(() =>
        setUser((u) => {
          const now = api.currentUser(role)
          return now?.id === u?.id ? u : now
        }),
      ),
    [role],
  )
  return user
}
