// QA-01 untuk backend asli: 100 user rebutan 1 kursi di detik yang sama.
// Jalankan: k6 run -e API=https://api-kamu -e SESSION=ses_sk_16 -e SEAT=lay_ciunik:J8 qa/k6-hold-race.js
// Harapan: tepat 1 respons ok:true, 99 respons CONFLICT. Simpan screenshot ringkasan k6 untuk deck.
import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'

const wins = new Counter('holds_won')
const conflicts = new Counter('holds_conflict')

export const options = {
  scenarios: {
    race: { executor: 'per-vu-iterations', vus: 100, iterations: 1, maxDuration: '30s' },
  },
}

export function setup() {
  // 100 akun demo: minta OTP lalu verifikasi (OTP simulasi mengembalikan kodenya)
  const tokens = []
  for (let i = 0; i < 100; i++) {
    const phone = `0899${String(i).padStart(8, '0')}`
    const otp = http.post(`${__ENV.API}/auth/otp/request`, JSON.stringify({ phone }), { headers: { 'Content-Type': 'application/json' } }).json()
    const v = http
      .post(`${__ENV.API}/auth/otp/verify`, JSON.stringify({ phone, code: otp.simulatedCode, name: `Race ${i}` }), { headers: { 'Content-Type': 'application/json' } })
      .json()
    tokens.push(v.token)
  }
  return { tokens }
}

export default function (data) {
  const token = data.tokens[__VU - 1]
  const res = http.post(
    `${__ENV.API}/sessions/${__ENV.SESSION}/holds`,
    JSON.stringify({ categoryId: __ENV.CATEGORY || 'cat_reg', seatIds: [__ENV.SEAT] }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  )
  const body = res.json()
  if (body.ok) wins.add(1)
  else if (body.reason === 'CONFLICT') conflicts.add(1)
  check(body, { 'ok or conflict': (b) => b.ok === true || b.reason === 'CONFLICT' })
}
