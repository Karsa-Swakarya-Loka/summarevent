import { ConvexError, type Value } from 'convex/values'

/** An API error from the contract (docs/API-CONTRACT.md "Kode error"). `message` is shown to the user as is. */
export function fail(code: string, message: string, details?: Record<string, Value>): never {
  throw new ConvexError({ code, message, ...(details ? { details } : {}) })
}

/**
 * An error answer whose writes are still kept, e.g. a failed sign-in that has to count towards the rate limit
 * (throwing would roll the count back). A write handler returns it; rpc.ts commits, http.ts answers with the error.
 */
export class Refusal {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly details?: Record<string, Value>,
  ) {}
}

export function must<T>(v: T | undefined | null, what = 'Data'): T {
  if (v == null) fail('NOT_FOUND', `${what} tidak ditemukan.`)
  return v
}

export const HTTP_STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  INVALID: 400,
  NEED_REASON: 400,
  BAD_PHONE: 400,
  BAD_OTP: 400,
  OTP_EXPIRED: 400,
  RESET_EXPIRED: 400,
  RULE: 400,
  NEED_LOGIN: 401,
  BAD_LOGIN: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_STATE: 409,
  HOLD_EXPIRED: 409,
  SEAT_TAKEN: 409,
  SOLD_OUT: 409,
  LOCKED_LAYOUT: 409,
  DUPLICATE: 409,
  DUPLICATE_PAYMENT: 409,
  ALREADY_USED: 409,
  RATE_LIMIT: 429,
  NOT_READY: 503,
}
