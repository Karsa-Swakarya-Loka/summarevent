// Concurrency acceptance tests from docs/API-CONTRACT.md "Uji terima", against a running backend:
//   API_URL=https://<deployment>.convex.site/api node scripts/acceptance.mjs
// Resets the demo data first (POST /demo/reset), so do not point it at a backend people are using.
import dns from 'node:dns'
import https from 'node:https'

const API = (process.env.API_URL || '').replace(/\/$/, '')
if (!API) {
  console.error('Set API_URL, e.g. API_URL=https://good-gnu-186.convex.site/api')
  process.exit(1)
}

// One DNS lookup for all requests: 100 parallel lookups can overwhelm a laptop's resolver before the server sees anything.
const dnsCache = new Map()
const lookup = (host, opts, cb) => {
  const hit = dnsCache.get(host)
  if (hit) return opts.all ? cb(null, [hit]) : cb(null, hit.address, hit.family)
  dns.lookup(host, { family: 4 }, (err, address, family) => {
    if (!err) dnsCache.set(host, { address, family })
    if (err) return cb(err)
    return opts.all ? cb(null, [{ address, family }]) : cb(null, address, family)
  })
}
const agent = new https.Agent({ keepAlive: true, maxSockets: 200, lookup })

const call = (method, path, body, { guest = 'guest_acceptance', token } = {}) =>
  new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body)
    const req = https.request(API + path, {
      method,
      agent,
      headers: { 'Content-Type': 'application/json', 'X-Guest-Id': guest, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })

let failed = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed++
}

const SESSION = 'ses_sk_16'
const seat = (label) => `lay_ciunik:${label}`
const runId = Date.now().toString(36)

await call('POST', '/demo/reset')

// 1. 100 simultaneous holds on one seat: exactly one wins, 99 CONFLICT, everyone then sees it HELD
{
  const target = seat('J10')
  const results = await Promise.all(
    Array.from({ length: 100 }, (_, i) => call('POST', `/sessions/${SESSION}/holds`, { categoryId: 'cat_reg', seatIds: [target] }, { guest: `guest_race${runId}${i}` })),
  )
  const won = results.filter((r) => r.status === 200 && r.body.ok === true).length
  const conflict = results.filter((r) => r.status === 200 && r.body.ok === false && r.body.reason === 'CONFLICT').length
  const other = results.filter((r) => !(r.status === 200 && (r.body.ok === true || r.body.reason === 'CONFLICT')))
  check('100 holds on one seat: exactly 1 ok', won === 1, `ok=${won}`)
  check('100 holds on one seat: 99 CONFLICT', conflict === 99, `conflict=${conflict}, other=${other.length}${other[0] ? ` e.g. ${other[0].status} ${JSON.stringify(other[0].body).slice(0, 120)}` : ''}`)
  const readers = await Promise.all(Array.from({ length: 5 }, (_, i) => call('GET', `/sessions/${SESSION}/seats`, undefined, { guest: `guest_reader${runId}${i}` })))
  const held = readers.every((r) => r.body.sessionSeats.find((s) => s.seatId === target)?.status === 'HELD')
  check('every reader sees the seat HELD', held)
}

// 2. Overlapping orders (J12–J13 and J13–J14) sent together: one succeeds whole, the other fails whole
{
  const [a, b] = await Promise.all([
    call('POST', `/sessions/${SESSION}/holds`, { categoryId: 'cat_reg', seatIds: [seat('J12'), seat('J13')] }, { guest: `guest_overlapA${runId}` }),
    call('POST', `/sessions/${SESSION}/holds`, { categoryId: 'cat_reg', seatIds: [seat('J13'), seat('J14')] }, { guest: `guest_overlapB${runId}` }),
  ])
  const oks = [a, b].filter((r) => r.body.ok === true)
  check('overlapping orders: exactly one succeeds', oks.length === 1, `a=${a.body.ok ?? a.body.code} b=${b.body.ok ?? b.body.code}`)
  const map = (await call('GET', `/sessions/${SESSION}/seats`)).body.sessionSeats
  const status = (l) => map.find((s) => s.seatId === seat(l))?.status
  const winnerA = a.body.ok === true
  const loserOnly = winnerA ? 'J14' : 'J12'
  check('the losing order held nothing', status(loserOnly) === 'AVAILABLE', `${loserOnly}=${status(loserOnly)}`)
  check('the winning order holds both seats', status('J13') === 'HELD' && status(winnerA ? 'J12' : 'J14') === 'HELD')
}

// 3. The same QR scanned by many gates at once: exactly one VALID
{
  const rina = (await call('POST', '/auth/demo-login', { role: 'VISITOR' })).body
  const pass = (await call('GET', '/me/tickets', undefined, { token: rina.token })).body
  const ticket = pass.find((p) => p.session.demoLive && p.ticket.status === 'ACTIVE')?.ticket
  check('a demo ticket to scan', !!ticket)
  if (ticket) {
    const gates = await Promise.all(['u_staff', 'u_staff_utara', 'u_staff_cibadak'].map((id) => call('POST', '/auth/demo-login', { role: 'STAFF', user_id: id })))
    const scans = await Promise.all(
      Array.from({ length: 12 }, (_, i) => call('POST', '/staff/checkins', { qr_token: ticket.qrToken, session_id: ticket.sessionId }, { token: gates[i % gates.length].body.token })),
    )
    const valid = scans.filter((r) => r.body.result === 'VALID').length
    const used = scans.filter((r) => r.body.result === 'ALREADY_USED').length
    const odd = scans.filter((r) => r.body.result !== 'VALID' && r.body.result !== 'ALREADY_USED')
    check('same QR scanned 12× at once: exactly 1 VALID', valid === 1, `valid=${valid}, alreadyUsed=${used}`)
    check('the other scans all say ALREADY_USED', used === scans.length - 1, odd.map((r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`).join(' | '))
  }
}

// 4. Idempotent payment: the same key twice gives one payment
{
  const guest = `guest_pay${runId}`
  const hold = (await call('POST', `/sessions/${SESSION}/holds`, { categoryId: 'cat_reg', seatIds: [seat('J8')] }, { guest })).body
  const key = `idem-${runId}`
  const pay = () => call('POST', `/orders/${hold.order.id}/payments/simulate`, { method: 'SIM_QRIS', outcome: 'SUCCESS', idempotencyKey: key }, { guest })
  const [p1, p2] = await Promise.all([pay(), pay()])
  const detail = (await call('GET', `/orders/${hold.order.id}`, undefined, { guest })).body
  check('same idempotency key: both answer SUCCESS', p1.body.paymentStatus === 'SUCCESS' && p2.body.paymentStatus === 'SUCCESS')
  check('same idempotency key: one set of tickets', detail.tickets.length === 1, `tickets=${detail.tickets.length}`)
}

await call('POST', '/demo/reset')
console.log(failed ? `\n${failed} check(s) failed` : '\nAll acceptance checks passed')
agent.destroy()
process.exitCode = failed ? 1 : 0
