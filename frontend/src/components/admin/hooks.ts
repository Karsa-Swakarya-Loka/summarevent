/** Hooks shared by the panitia screens. */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useOutletContext } from 'react-router'
import type { AdminOutlet } from './lib'

/** The events and the one in view, handed down by the admin shell (see AdminLayout). */
export function useAdminEvent(): AdminOutlet {
  return useOutletContext<AdminOutlet>()
}

/** The element's size in CSS pixels, kept up to date, for charts drawn to the pixel. */
export function useSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A headline number that counts up to its new value, as the reference's "$7,462"; it just appears under reduced motion. */
export function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const still = reduced()
  useEffect(() => {
    const start = from.current
    if (still || start === value) return
    let raf = 0
    let t0 = 0
    const frame = (now: number) => {
      t0 ||= now
      const u = Math.min(1, (now - t0) / ms)
      const v = u >= 1 ? value : start + (value - start) * (1 - (1 - u) ** 3)
      from.current = v
      setShown(v)
      if (u < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [value, ms, still])
  return still ? value : shown
}
