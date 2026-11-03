/**
 * The panitia and petugas accounts behind the email + kata sandi sign-in. Signing in is simulated until the backend
 * has its own login: the screen checks these credentials, then opens the account through the demo login. The sample
 * data gives the same users these emails, so the account shown after signing in is the one that was typed.
 */
export const DEMO_PASSWORD = 'summaba2026'

export const DEMO_SIGN_IN = {
  ADMIN: [{ userId: 'u_admin', email: 'panitia@summarevent.test' }],
  STAFF: [
    { userId: 'u_staff', email: 'desk.atrium@summarevent.test' },
    { userId: 'u_staff_utara', email: 'pintu.utara@summarevent.test' },
    { userId: 'u_staff_cibadak', email: 'atrium.cibadak@summarevent.test' },
  ],
} as const
