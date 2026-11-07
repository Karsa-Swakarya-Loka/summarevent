/**
 * HTTP adapter – used when VITE_API_URL is set. Maps every Api method onto the REST
 * endpoints from PRD §11 / docs/API-CONTRACT.md. The backend team implements those
 * endpoints; the UI does not change.
 */
import { ApiError, type Api } from './contract'
import { clearClientSessions, guestId } from './mock/db'
import { isTicketId } from '@/domain/qr'
import type { Role, User } from '@/domain/types'

const TOKEN_KEY = (role: Role) => `summarevent:token:${role}`
const USER_KEY = (role: Role) => `summarevent:user:${role}`
const ROLES: Role[] = ['VISITOR', 'ADMIN', 'STAFF']

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
    let res: Response
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          // anonymous visitor id: seats can be held before login, then claimed at OTP verify
          'X-Guest-Id': guestId(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError('OFFLINE', 'Tidak terhubung ke server. Cek koneksi internet lalu coba lagi.')
    }
    if (!res.ok) {
      let code = `HTTP_${res.status}`
      let message = 'Terjadi kesalahan di server.'
      let details: unknown
      try {
        const j = (await res.json()) as { code?: string; message?: string; details?: unknown }
        code = j.code ?? code
        message = j.message ?? message
        details = j.details
      } catch {
        /* not JSON: keep the generic message */
      }
      // The session is no longer accepted (it ran out, or the data was reset elsewhere): sign out on this phone too, so
      // the screens offer the way in instead of failing on every request. A wrong password elsewhere is not that.
      const role = roleForPath(path)
      if (res.status === 401 && token && (role !== 'VISITOR' || code === 'NEED_LOGIN')) {
        store(TOKEN_KEY(role), null)
        store(USER_KEY(role), null)
        listeners.forEach((l) => l())
      }
      throw new ApiError(code, message, details)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  const listeners = new Set<() => void>()
  let pollId: ReturnType<typeof setInterval> | null = null
  const refreshAll = () => listeners.forEach((l) => l())
  // a page in the background (another tab, the phone locked) skips its polls; back on screen it catches up at once
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!hidden() && listeners.size) refreshAll()
    })
  }

  const api: Api = {
    mode: 'http',

    requestOtp: (phone) => req('POST', '/auth/otp/request', { phone }),
    async verifyOtp(phone, code, name) {
      const r = await req<{ user: User; isNew: boolean; token: string } | { needName: true; message: string }>('POST', '/auth/otp/verify', { phone, code, name })
      // new number: step two of the login asks for a name (a normal answer, not an HTTP error)
      if ('needName' in r) throw new ApiError('NEED_NAME', r.message)
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
      const token = load(TOKEN_KEY(role))
      store(TOKEN_KEY(role), null)
      store(USER_KEY(role), null)
      // the server forgets this sign-in too; signing out here never waits on it or fails because of it
      if (token) {
        void fetch(base + '/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Guest-Id': guestId() }, keepalive: true }).catch(() => undefined)
      }
    },
    async login(email, password, role) {
      const r = await req<{ user: User; token: string }>('POST', '/auth/login', { email, password, role })
      store(TOKEN_KEY(role), r.token)
      store(USER_KEY(role), JSON.stringify(r.user))
      return r.user
    },
    forgotPassword: (email) => req('POST', '/auth/password/forgot', { email }),
    async resetPassword(token, password) {
      const r = await req<{ user: User; token: string }>('POST', '/auth/password/reset', { token, password })
      store(TOKEN_KEY(r.user.role), r.token)
      store(USER_KEY(r.user.role), JSON.stringify(r.user))
      return r.user
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
    async updateProfile(changes) {
      const user = await req<User>('PATCH', '/me', changes)
      // the signed-in visitor is kept on the device; keep it in step, and let open screens redraw
      store(USER_KEY('VISITOR'), JSON.stringify(user))
      listeners.forEach((l) => l())
      return user
    },

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
      accounts: () => req('GET', '/staff/accounts'),
      offlineManifest: (sessionId) => req('GET', `/staff/sessions/${sessionId}/offline-manifest`),
      checkin: (code, sessionId) => req('POST', '/staff/checkins', isTicketId(code) ? { ticket_id: code.trim(), session_id: sessionId } : { qr_token: code, session_id: sessionId }),
      searchTickets: (q, eventId) => req('GET', `/staff/tickets?q=${encodeURIComponent(q)}${eventId ? `&event_id=${eventId}` : ''}`),
      recentCheckins: (sessionId) => req('GET', `/staff/sessions/${sessionId}/checkins`),
      listReceipts: (eventId) => req('GET', `/staff/receipts${eventId ? `?event_id=${eventId}` : ''}`),
      reviewReceipt: (id, decision, reason) => req('PATCH', `/staff/receipts/${id}`, { decision, reason }),
    },

    demo: {
      async reset() {
        await req('POST', '/demo/reset')
        // same as the mock: everyone starts logged out with a fresh guest id
        for (const role of ROLES) {
          store(TOKEN_KEY(role), null)
          store(USER_KEY(role), null)
        }
        clearClientSessions()
      },
      fakeBuyer: (sessionId, categoryId, seatIds) => req('POST', `/demo/sessions/${sessionId}/fake-buyer`, { category_id: categoryId, seat_ids: seatIds }),
      expireHold: (orderId) => req('POST', `/demo/orders/${orderId}/expire`),
    },

    subscribe(listener) {
      listeners.add(listener)
      // MVP: poll every 3 s (PRD §8), only while the page is on screen; SSE can replace this later without touching the UI.
      pollId ??= setInterval(() => {
        if (!hidden()) refreshAll()
      }, 3000)
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
