/**
 * The in-app back stack. The browser history cannot say which screen came before, so the layouts keep this list in
 * step with every navigation. A back button then takes a real history step when the previous screen is the one it goes
 * up to (so the phone's own back button keeps working), and otherwise opens that screen marked as a step back.
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

export function useBack(to: string) {
  const navigate = useNavigate()
  return () => {
    if (stack.length > 1 && stack[stack.length - 2] === to) navigate(-1)
    else navigate(to, { state: { back: true } })
  }
}
