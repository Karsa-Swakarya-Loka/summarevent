import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'
import type { User } from '@/domain/types'

/** The logged-in visitor (or null), kept in sync after login/logout. */
export function useVisitor(): { user: User | null; refresh: () => void } {
  const [user, setUser] = useState<User | null>(() => api.currentUser('VISITOR'))
  const refresh = useCallback(() => setUser(api.currentUser('VISITOR')), [])
  useEffect(() => {
    const unsub = api.subscribe(refresh)
    const onStorage = () => refresh()
    window.addEventListener('storage', onStorage)
    return () => {
      unsub()
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])
  return { user, refresh }
}

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
