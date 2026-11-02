import { useCallback, useEffect, useRef, useState } from 'react'
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

/**
 * The floating "Demo" pill (layout) sits on top of bottom action bars on phones.
 * Measure the overlap and return a left inset so the main button never hides under it.
 */
export function useAvoidDemoPill(): [(el: HTMLElement | null) => void, number] {
  const [inset, setInset] = useState(0)
  const elRef = useRef<HTMLElement | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)

  const measure = useCallback(() => {
    const el = elRef.current
    const pill = document.querySelector<HTMLElement>('[aria-label="Menu demo"]')
    if (!el || !pill) return setInset(0)
    const a = el.getBoundingClientRect()
    const b = pill.getBoundingClientRect()
    const overlap = b.width > 0 && b.bottom > a.top && b.top < a.bottom && b.left < a.right && b.right > a.left
    setInset(overlap ? Math.ceil(b.right - a.left + 8) : 0)
  }, [])

  const ref = useCallback(
    (el: HTMLElement | null) => {
      roRef.current?.disconnect()
      elRef.current = el
      if (!el) return
      roRef.current = new ResizeObserver(() => measure())
      roRef.current.observe(el)
      requestAnimationFrame(measure)
    },
    [measure],
  )

  useEffect(() => {
    window.addEventListener('resize', measure)
    const t = setTimeout(measure, 400)
    return () => {
      window.removeEventListener('resize', measure)
      clearTimeout(t)
      roRef.current?.disconnect()
    }
  }, [measure])

  return [ref, inset]
}

/** Height of an element (for spacers under fixed bars). */
export function useElementHeight(): [(el: HTMLElement | null) => void, number] {
  const [h, setH] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    roRef.current?.disconnect()
    if (!el) return
    roRef.current = new ResizeObserver(() => setH(el.getBoundingClientRect().height))
    roRef.current.observe(el)
    setH(el.getBoundingClientRect().height)
  }, [])
  useEffect(() => () => roRef.current?.disconnect(), [])
  return [ref, h]
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
