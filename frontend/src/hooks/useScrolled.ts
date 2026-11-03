import { useEffect, useState } from 'react'

/** True once the page has scrolled at least `by` pixels: app bars show their hairline then. */
export function useScrolled(by = 4): boolean {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > by)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > by)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [by])
  return scrolled
}
