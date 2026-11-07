/** Petugas helpers: which session is being scanned and whether its check-in window is open. */
import { api, type EventSummary } from '@/api'
import { checkinWindow, resolveSession } from '@/domain/rules'
import type { EventRules, Session } from '@/domain/types'
import { fmtShortDate } from '@/lib/format'
import { useLive } from '@/hooks/useLive'

export type WindowState = 'NOT_YET' | 'OPEN' | 'CLOSED'

export const WINDOW_LABEL: Record<WindowState, string> = {
  NOT_YET: 'Check-in belum dibuka',
  OPEN: 'Check-in dibuka',
  CLOSED: 'Check-in ditutup',
}

/** Check-in window of a session right now (demo-live sessions are re-resolved against `now`). */
export function sessionWindow(session: Session, rules: EventRules, now: Date) {
  const s = resolveSession(session, now)
  const { open, close } = checkinWindow(s, rules)
  const state: WindowState = now < open ? 'NOT_YET' : now > close ? 'CLOSED' : 'OPEN'
  const running = now >= new Date(s.startAt) && now <= new Date(s.endAt)
  return { state, open, close, running, session: s }
}

export function sessionName(s: Pick<Session, 'label' | 'startAt'>): string {
  return s.label?.trim() || fmtShortDate(s.startAt)
}

/** Events a petugas can check in: published, with real tickets (not info-only). */
export function scannableEvents(list: EventSummary[]): EventSummary[] {
  return list.filter((e) => e.event.status === 'PUBLISHED' && !e.event.infoOnly && e.sessions.length > 0)
}

/** Loads the event + session behind a /staff/…/:sessionId route. */
export function useStaffSession(sessionId: string | undefined) {
  const live = useLive(() => api.listEvents(), [])
  const summary = live.data?.find((e) => e.sessions.some((s) => s.id === sessionId))
  const found = summary ? { summary, session: summary.sessions.find((s) => s.id === sessionId)! } : null
  return {
    loading: !live.data && !live.error,
    error: live.error,
    notFound: !!live.data && !found,
    summary: found?.summary,
    event: found?.summary.event,
    session: found?.session,
    reload: live.reload,
  }
}
