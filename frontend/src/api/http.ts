/**
 * HTTP adapter – used when VITE_API_URL is set. Maps every Api method onto the REST
 * endpoints from PRD §11 / docs/API-CONTRACT.md. The backend team implements those
 * endpoints; the UI does not change.
 */
import { ApiError, type Api } from './contract'
import type { Role, User } from '@/domain/types'

const TOKEN_KEY = (role: Role) => `summarevent:token:${role}`
const USER_KEY = (role: Role) => `summarevent:user:${role}`

function store(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Which role's token to send: admin pages send the admin token, etc. */
function roleForPath(path: string): Role {
  if (path.startsWith('/admin')) return 'ADMIN'
  if (path.startsWith('/staff')) return 'STAFF'
  return 'VISITOR'
}

export function createHttpApi(baseUrl: string): Api {
  const base = baseUrl.replace(/\/$/, '')

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = load(TOKEN_KEY(roleForPath(path)))
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      let code = `HTTP_${res.status}`
      let message = 'Terjadi kesalahan di server.'
      try {
        const j = (await res.json()) as { code?: string; message?: string; details?: unknown }
        code = j.code ?? code
        message = j.message ?? message
        throw new ApiError(code, message, j.details)
      } catch (e) {
        if (e instanceof ApiError) throw e
        throw new ApiError(code, message)
      }
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  const listeners = new Set<() => void>()
  let pollId: ReturnType<typeof setInterval> | null = null

  const api: Api = {
    mode: 'http',

    requestOtp: (phone) => req('POST', '/auth/otp/request', { phone }),
    async verifyOtp(phone, code, name) {
      const r = await req<{ user: User; isNew: boolean; token: string }>('POST', '/auth/otp/verify', { phone, code, name })
      store(TOKEN_KEY('VISITOR'), r.token)
      store(USER_KEY('VISITOR'), JSON.stringify(r.user))
      return { user: r.user, isNew: r.isNew }
    },
    currentUser(role) {
      const raw = load(USER_KEY(role))
      return raw ? (JSON.parse(raw) as User) : null
    },
    async demoLogin(role, userId) {
      const r = await req<{ user: User; token: string }>('POST', '/auth/demo-login', { role, user_id: userId })
      store(TOKEN_KEY(role), r.token)
      store(USER_KEY(role), JSON.stringify(r.user))
      return r.user
    },
    logout(role) {
      store(TOKEN_KEY(role), null)
      store(USER_KEY(role), null)
    },

    listEvents: () => req('GET', '/events'),
    getEvent: (slug) => req('GET', `/events/${encodeURIComponent(slug)}`),
    getSeatMap: (sessionId) => req('GET', `/sessions/${sessionId}/seats`),

    createHold: (sessionId, body) => req('POST', `/sessions/${sessionId}/holds`, body),
    autoHold: (sessionId, categoryId, qty) => req('POST', `/sessions/${sessionId}/holds/auto`, { category_id: categoryId, qty }),
    suggestSeats: (sessionId, categoryId, qty) => req('GET', `/sessions/${sessionId}/suggest?category_id=${categoryId}&qty=${qty}`),
    updateAttendees: (orderId, names) => req('PATCH', `/orders/${orderId}`, { attendees: names }),
    cancelOrder: (orderId) => req('DELETE', `/orders/${orderId}`),
    simulatePayment: (orderId, body) => req('POST', `/orders/${orderId}/payments/simulate`, body),
    confirmFree: (orderId) => req('POST', `/orders/${orderId}/confirm`),
    submitReceipts: (orderId, receipts) => req('POST', `/orders/${orderId}/receipts`, { receipts }),
    checkReceipts: (orderId, receipts) => req('POST', `/orders/${orderId}/receipts/check`, { receipts }),
    getOrder: (orderId) => req('GET', `/orders/${orderId}`),
    myOrders: () => req('GET', '/me/orders'),
    myTickets: () => req('GET', '/me/tickets'),
    myNotifications: () => req('GET', '/me/notifications'),
    joinWaitlist: (sessionId, categoryId, qty) => req('POST', `/sessions/${sessionId}/waitlist`, { category_id: categoryId, qty }),
    leaveWaitlist: (id) => req('DELETE', `/waitlist/${id}`),
    myWaitlist: () => req('GET', '/me/waitlist'),

    admin: {
      listEvents: () => req('GET', '/admin/events'),
      getEventDraft: (id) => req('GET', `/admin/events/${id}`),
      createEvent: (draft) => req('POST', '/admin/events', draft),
      updateEvent: (id, draft) => req('PATCH', `/admin/events/${id}`, draft),
      publishEvent: (id) => req('PATCH', `/admin/events/${id}`, { status: 'PUBLISHED' }),
      listOrders: (f) => req('GET', `/admin/orders?${new URLSearchParams(Object.entries(f).filter(([, v]) => v != null && v !== '') as [string, string][])}`),
      markPaid: (id) => req('PATCH', `/admin/orders/${id}`, { action: 'MARK_PAID' }),
      cancelOrder: (id) => req('PATCH', `/admin/orders/${id}`, { action: 'CANCEL' }),
      listReceipts: (status) => req('GET', `/admin/receipts?status=${status}`),
      reviewReceipt: (id, decision, reason) => req('PATCH', `/admin/receipts/${id}`, { decision, reason }),
      stats: (id) => req('GET', `/admin/events/${id}/stats`),
      exportCsv: (id, type) => req('GET', `/admin/events/${id}/export?type=${type}`),
      venues: () => req('GET', '/admin/venues'),
      tenants: () => req('GET', '/admin/tenants'),
      listStaff: () => req('GET', '/admin/staff'),
      createStaff: (input) => req('POST', '/admin/staff', input),
      setStaffActive: (id, active) => req('PATCH', `/admin/staff/${id}`, { active }),
    },

    staff: {
      checkin: (qrToken, sessionId) => req('POST', '/staff/checkins', { qr_token: qrToken, session_id: sessionId }),
      searchTickets: (q, eventId) => req('GET', `/staff/tickets?q=${encodeURIComponent(q)}${eventId ? `&event_id=${eventId}` : ''}`),
      recentCheckins: (sessionId) => req('GET', `/staff/sessions/${sessionId}/checkins`),
      listReceipts: (eventId) => req('GET', `/staff/receipts${eventId ? `?event_id=${eventId}` : ''}`),
      reviewReceipt: (id, decision, reason) => req('PATCH', `/staff/receipts/${id}`, { decision, reason }),
    },

    demo: {
      reset: () => req('POST', '/demo/reset'),
      fakeBuyer: (sessionId, categoryId, seatIds) => req('POST', `/demo/sessions/${sessionId}/fake-buyer`, { category_id: categoryId, seat_ids: seatIds }),
      expireHold: (orderId) => req('POST', `/demo/orders/${orderId}/expire`),
    },

    subscribe(listener) {
      listeners.add(listener)
      // MVP: poll every 3 s (PRD §8); SSE can replace this later without touching the UI.
      pollId ??= setInterval(() => listeners.forEach((l) => l()), 3000)
      return () => {
        listeners.delete(listener)
        if (!listeners.size && pollId) {
          clearInterval(pollId)
          pollId = null
        }
      }
    },
  }
  return api
}
