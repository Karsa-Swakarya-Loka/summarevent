// Rebutan kursi lintas server: 100 permintaan hold untuk SATU kursi, dibagi ke dua instance API
// yang memakai database yang sama. Harus tepat 1 yang berhasil.
//   API_A=http://localhost:8788/api API_B=http://localhost:8789/api node qa/race-two-servers.mjs
const A = process.env.API_A ?? 'http://localhost:8788/api'
const B = process.env.API_B ?? 'http://localhost:8789/api'
const SESSION = process.env.SESSION ?? 'ses_sk_16'
const N = Number(process.env.N ?? 100)

const post = (base, path, body, guest) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Guest-Id': guest }, body: JSON.stringify(body) }).then((r) => r.json())

await fetch(`${A}/demo/reset`, { method: 'POST' })
const map = await fetch(`${A}/sessions/${SESSION}/seats`).then((r) => r.json())
const seat = map.sessionSeats.find((s) => s.categoryId === 'cat_reg' && s.status === 'AVAILABLE')
console.log(`kursi rebutan: ${seat.seatId} · ${N} permintaan bersamaan ke 2 server`)

const t0 = performance.now()
const results = await Promise.all(
  Array.from({ length: N }, (_, i) => post(i % 2 ? B : A, `/sessions/${SESSION}/holds`, { categoryId: 'cat_reg', seatIds: [seat.seatId] }, `guest_race2x${String(i).padStart(4, '0')}`)),
)
const ms = Math.round(performance.now() - t0)
const ok = results.filter((r) => r.ok)
const conflict = results.filter((r) => r.ok === false && r.reason === 'CONFLICT')
const viaA = results.filter((r, i) => r.ok && i % 2 === 0).length
console.log(`berhasil: ${ok.length} (lewat server ${viaA ? 'A' : 'B'}) · bentrok: ${conflict.length} · lainnya: ${N - ok.length - conflict.length} · ${ms} ms`)

const [ma, mb] = await Promise.all([A, B].map((base) => fetch(`${base}/sessions/${SESSION}/seats`).then((r) => r.json())))
const st = (m) => m.sessionSeats.find((s) => s.seatId === seat.seatId).status
console.log(`status kursi di server A: ${st(ma)} · di server B: ${st(mb)}`)
if (ok.length !== 1 || st(ma) !== 'HELD' || st(mb) !== 'HELD') {
  console.error('GAGAL: harus tepat 1 berhasil dan kedua server melihat HELD')
  process.exit(1)
}
console.log('LULUS: satu kursi, satu pemesan, konsisten di kedua server')
