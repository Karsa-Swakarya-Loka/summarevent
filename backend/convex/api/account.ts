/**
 * Panitia and petugas sign-in with email + kata sandi, and setting a password from a one-time link
 * (docs/API-CONTRACT.md "Auth": /auth/login, /auth/password/forgot, /auth/password/reset). Rules and messages follow
 * the mock (frontend/src/api/mock/adapter.ts); the server keeps PBKDF2 hashes and only the hash of a reset token.
 */
import { FORGOT_MIN_INTERVAL_SEC, LOGIN_FAIL_WINDOW_MIN, LOGIN_MAX_FAILS, passwordCheck, RESET_TOKEN_MIN } from '../shared/rules'
import type { User } from '../shared/types'
import { issueToken, type Req } from '../lib/auth'
import { newToken, sha256Hex } from '../lib/crypto'
import { fail, Refusal } from '../lib/errors'
import { hashPassword, verifyPassword } from '../lib/password'
import type { Tx } from '../lib/tx'
import { appUrl, queueEmail } from '../mail'

const INVITE_HOURS = 24

const normEmail = (raw: unknown) => String(raw ?? '').trim().toLowerCase()

async function passwordRow(tx: Tx, userId: string) {
  return tx.ctx.db
    .query('passwords')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}

/** POST /auth/login { email, password, role } → { user, token } */
export async function login(tx: Tx, req: Req) {
  const role = req.body?.role
  if (role !== 'ADMIN' && role !== 'STAFF') fail('BAD_REQUEST', 'Role tidak dikenal.')
  const email = normEmail(req.body?.email)
  const password = String(req.body?.password ?? '')
  const user = email ? (await tx.where<User>('users', 'by_email', { email })).find((u) => u.role === role) : undefined
  const row = user ? await passwordRow(tx, user.id) : null
  // the failed attempts are counted per email whether or not it has an account, so the lockout answers alike for both
  const key = await sha256Hex(`${role}:${email}`)
  const counter = await tx.mctx.db
    .query('loginFails')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique()
  const window = tx.now.getTime() - LOGIN_FAIL_WINDOW_MIN * 60_000
  const fails = (counter?.fails ?? []).filter((t) => new Date(t).getTime() > window)
  if (fails.length >= LOGIN_MAX_FAILS) return new Refusal('RATE_LIMIT', `Terlalu banyak percobaan. Coba lagi dalam ${LOGIN_FAIL_WINDOW_MIN} menit.`)
  // the hash is checked even for an unknown email, so the answer takes as long either way
  const ok = await verifyPassword(password, row?.hash ?? null)
  // one message for a wrong email and a wrong password, so an address cannot be probed
  if (!user || !row || !ok) {
    const next = [...fails, tx.now.toISOString()]
    if (counter) await tx.mctx.db.patch(counter._id, { fails: next })
    else if (email) await tx.mctx.db.insert('loginFails', { key, fails: next })
    return new Refusal('BAD_LOGIN', 'Email atau kata sandi salah.')
  }
  if (user.active === false) fail('FORBIDDEN', 'Akun ini dinonaktifkan panitia.')
  if (counter) await tx.mctx.db.delete(counter._id)
  return { user, token: await issueToken(tx, user) }
}

/** A one-time link that lets the account set its password; only the token's hash is stored. */
async function newResetLink(tx: Tx, user: User, purpose: 'RESET' | 'INVITE'): Promise<string> {
  // a new link replaces the old one of the same kind only: asking for a reset never voids a petugas' invitation
  for (const old of await tx.mctx.db
    .query('resetTokens')
    .withIndex('by_user', (q) => q.eq('userId', user.id))
    .collect())
    if (old.purpose === purpose) await tx.mctx.db.delete(old._id)
  const token = newToken()
  const minutes = purpose === 'INVITE' ? INVITE_HOURS * 60 : RESET_TOKEN_MIN
  await tx.mctx.db.insert('resetTokens', {
    tokenHash: await sha256Hex(token),
    userId: user.id,
    purpose,
    expiresAt: new Date(tx.now.getTime() + minutes * 60_000).toISOString(),
    createdAt: tx.now.toISOString(),
  })
  return `${appUrl()}/reset?token=${token}`
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function linkEmail(to: string, subject: string, lines: string[], button: string, link: string, footer: string) {
  const text = [...lines, '', `${button}: ${link}`, '', footer].join('\n')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#231f20;max-width:480px">
${lines.map((l) => `<p>${esc(l)}</p>`).join('\n')}
<p><a href="${esc(link)}" style="display:inline-block;background:#006426;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(button)}</a></p>
<p style="color:#6b6567;font-size:13px">${esc(footer)}</p>
</div>`
  return { to, subject, text, html }
}

/** POST /auth/password/forgot { email } → always { ok: true } */
export async function forgotPassword(tx: Tx, req: Req) {
  const email = normEmail(req.body?.email)
  const user = email ? (await tx.where<User>('users', 'by_email', { email })).find((u) => u.role !== 'VISITOR') : undefined
  // an unknown email gets the same answer, so the form cannot tell which addresses exist
  if (!user || user.active === false) return { ok: true }
  const recent = await tx.mctx.db
    .query('resetTokens')
    .withIndex('by_user', (q) => q.eq('userId', user.id))
    .collect()
  if (recent.some((t) => t.purpose === 'RESET' && tx.now.getTime() - new Date(t.createdAt).getTime() < FORGOT_MIN_INTERVAL_SEC * 1000)) return { ok: true }
  const link = await newResetLink(tx, user, 'RESET')
  await queueEmail(
    tx.mctx,
    linkEmail(
      email,
      'Buat kata sandi baru Summarevent',
      [`Halo ${user.name},`, `Ada permintaan membuat kata sandi baru untuk akun ${user.role === 'ADMIN' ? 'panitia' : 'petugas'} Summarevent ini.`],
      'Buat kata sandi baru',
      link,
      `Link berlaku ${RESET_TOKEN_MIN} menit dan hanya bisa dipakai sekali. Kalau bukan kamu yang meminta, abaikan email ini; kata sandimu tidak berubah.`,
    ),
    tx.now,
  )
  return { ok: true }
}

/** POST /auth/password/reset { token, password } → { user, token } */
export async function resetPassword(tx: Tx, req: Req) {
  const password = String(req.body?.password ?? '')
  const check = passwordCheck(password)
  if (!check.ok) fail('INVALID', check.reason, { field: 'password' })
  const token = String(req.body?.token ?? '')
  const tokenHash = await sha256Hex(token)
  const link = token
    ? await tx.mctx.db
        .query('resetTokens')
        .withIndex('by_token', (q) => q.eq('tokenHash', tokenHash))
        .unique()
    : null
  const expired = 'Link ini sudah tidak berlaku. Minta link baru dari halaman masuk.'
  if (!link || new Date(link.expiresAt).getTime() <= tx.now.getTime()) fail('RESET_EXPIRED', expired)
  const user = await tx.get<User>('users', link.userId)
  if (!user || user.role === 'VISITOR') fail('RESET_EXPIRED', expired)
  if (user.active === false) fail('FORBIDDEN', 'Akun ini dinonaktifkan panitia.')
  await tx.mctx.db.delete(link._id)
  const hash = await hashPassword(password)
  const row = await passwordRow(tx, user.id)
  if (row) await tx.mctx.db.patch(row._id, { hash, fails: [] })
  else await tx.mctx.db.insert('passwords', { userId: user.id, hash, fails: [] })
  // a new password signs out every other device of this account
  for (const t of await tx.mctx.db
    .query('authTokens')
    .withIndex('by_user', (q) => q.eq('userId', user.id))
    .collect())
    await tx.mctx.db.delete(t._id)
  return { user, token: await issueToken(tx, user) }
}

/** Invitation for a new petugas (POST /admin/staff): the same one-time link, valid a day, to set their password. */
export async function sendInvite(tx: Tx, user: User, invitedBy: User) {
  const link = await newResetLink(tx, user, 'INVITE')
  await queueEmail(
    tx.mctx,
    linkEmail(
      user.email!,
      'Undangan petugas Summarevent',
      [`Halo ${user.name},`, `${invitedBy.name} menambahkan kamu sebagai petugas Summarevent. Buat kata sandi dulu, lalu masuk dengan email ini.`],
      'Buat kata sandi',
      link,
      `Link berlaku ${INVITE_HOURS} jam dan hanya bisa dipakai sekali. Kalau kedaluwarsa, pakai "Lupa kata sandi?" di halaman masuk petugas.`,
    ),
    tx.now,
  )
}
