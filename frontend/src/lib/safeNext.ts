/**
 * Where a sign-in or onboarding goes afterwards (`?next=`): only a path inside the role's own area of this app, so the
 * parameter can never send anyone to another site or another role's screens. `/admin` and `/admin/…` pass; `/adminx`,
 * `//host`, `/\host` and full addresses do not.
 */
export function safeNext(raw: string | null | undefined, area: 'app' | 'admin' | 'staff'): string | null {
  if (!raw || raw.startsWith('//') || raw.includes('\\')) return null
  return new RegExp(`^/${area}(/|\\?|#|$)`).test(raw) ? raw : null
}
