/**
 * The in-app back stack. The browser history cannot say which screen came before, so the layouts keep this list in
 * step with every navigation. A back button then takes a real history step when the previous screen is the one it goes
 * up to or one of the visitor's tabs (so an order opened from Akun goes back to Akun, and the phone's own back button
 * keeps working), and otherwise opens the screen it goes up to, marked as a step back.
 */
import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'

const stack: string[] = []
let lastKey = ''

export function useNavStack() {
  const location = useLocation()
  const type = useNavigationType()
  const path = location.pathname + location.search
  useEffect(() => {
    if (location.key === lastKey) return // StrictMode runs effects twice
    lastKey = location.key
    if (type === 'PUSH') stack.push(path)
    else if (type === 'REPLACE') stack.splice(Math.max(0, stack.length - 1), 1, path)
    else {
      // POP: the phone's back (or forward) button, or the first screen
      const i = stack.lastIndexOf(path)
      if (i >= 0) stack.length = i + 1
      else stack.splice(0, stack.length, path)
    }
  }, [location.key, path, type])
}

/** A screen that changes its own address without the router (the e-ticket swipe) keeps the stack in step with it. */
export function replaceTop(path: string) {
  if (stack.length) stack[stack.length - 1] = path
}

/** The visitor's four tab screens: a screen opened from one of them goes back to it, whatever its own way up is. */
const TAB_ROOT = /^\/app(\/(pass|inbox|akun))?\/?$/

export function useBack(to: string) {
  const navigate = useNavigate()
  return () => {
    const prev = stack.length > 1 ? stack[stack.length - 2] : ''
    if (prev && (prev === to || TAB_ROOT.test(prev))) navigate(-1)
    else navigate(to, { state: { back: true } })
  }
}
