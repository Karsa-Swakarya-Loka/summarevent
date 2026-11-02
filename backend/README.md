# Summarevent Backend

REST API untuk Summarevent, sesuai kontrak di [`docs/API-CONTRACT.md`](../docs/API-CONTRACT.md). Stack: Node.js +
[Hono](https://hono.dev) + PostgreSQL.

## Cara kerjanya

Logika bisnis **tidak ditulis dua kali**. Aturan pemesanan, struk, check-in, daftar tunggu, dan lain-lain ada di
`frontend/src/api/mock/adapter.ts` dan `frontend/src/domain/*` (logika yang sama dipakai versi demo di browser dan
diuji 28 unit test + 7 suite end-to-end). Backend menjalankan kode itu di server lewat *storage driver* PostgreSQL
(`src/store.ts`), jadi perilaku versi demo dan versi live dijamin sama.

Yang dijaga oleh PostgreSQL sendiri (bukan cuma oleh kode aplikasi):

| Lapis (PRD §8) | Di database |
| --- | --- |
| 1. Hold atomik, all-or-nothing | Satu `UPDATE session_seats … WHERE status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < now)` untuk semua kursi pesanan. Baris ter-update kurang dari kursi diminta → `ROLLBACK`, balas 409 + saran kursi. |
| 2. Batas waktu hold | `hold_expires_at`; hold kedaluwarsa dianggap Tersedia saat dibaca, dan dirapikan tiap ada penulisan + job 1 menit (server Node). |
| 3. Konfirmasi bersyarat | `UPDATE … SET status = 'SOLD' WHERE order_id = $1 AND status = 'HELD' AND hold_expires_at > now`. Kurang → `HOLD_EXPIRED`. |
| 4. Pengaman terakhir | `CREATE UNIQUE INDEX one_ticket_per_seat ON tickets (session_id, seat_id) WHERE status <> 'CANCELLED'`. |
| 5. Idempotency key | `CREATE UNIQUE INDEX payments_idempotency_key ON payments (idempotency_key)`. |
| Check-in | `SELECT … FOR UPDATE` pada tiket, lalu `UPDATE … WHERE status = 'ACTIVE'`. |

Semua penulisan berjalan dalam satu transaksi dan diserialkan dengan `pg_advisory_xact_lock`, jadi aman walau API
jalan di beberapa instance sekaligus (Vercel). Perubahan lain memakai pengecekan optimistis ("masih dalam status
yang tadi dibaca"), jadi data basi di satu instance tidak bisa menimpa data instance lain.

Skema lengkap: `SCHEMA_SQL` di `src/store.ts` (dibuat otomatis saat server start). Tabel relasional untuk
`session_seats`, `orders`, `payments`, `tickets`, `receipts`, `receipt_photos`; data referensi (event, venue,
kategori, user, notifikasi, dll.) disimpan sebagai dokumen JSONB di `entities`.

## Menjalankan

```bash
cd backend
npm install
npm run dev          # http://localhost:8787/api, tanpa DATABASE_URL memakai PGlite (Postgres tertanam, di memori)
npm test             # 13 tes: rebutan 100 request, 5 lapis pengaman, check-in, akses, foto struk
```

Pakai PostgreSQL sungguhan:

```bash
DATABASE_URL=postgres://user:pass@host:5432/summarevent npm run dev
DATABASE_URL=postgres://…/summarevent_test npm test     # tabel di database ini dihapus dulu, jangan pakai data produksi
```

Hubungkan frontend ke backend lokal:

```bash
cd frontend
VITE_API_URL=http://localhost:8787/api npm run dev
API_URL=http://localhost:8787/api BASE=http://localhost:5173 npm run e2e   # 7 suite, data di-reset tiap suite
```

Uji rebutan kursi lintas server (dua instance API, satu database):

```bash
DATABASE_URL=… PORT=8788 npm run dev   # terminal 1
DATABASE_URL=… PORT=8789 npm run dev   # terminal 2
node ../qa/race-two-servers.mjs        # 100 request dibagi ke 2 server → harus tepat 1 berhasil
```

Atau dengan k6: `k6 run -e API=http://localhost:8787/api -e SESSION=ses_sk_16 -e SEAT=lay_ciunik:J8 ../qa/k6-hold-race.js`.

## Environment

| Variabel | Isi |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL (Neon: pakai URL *pooled*). Kosong → PGlite (`PGLITE_DIR` untuk simpan ke folder). |
| `QR_SECRET` | Kunci HMAC token QR e-ticket. Wajib di produksi. |
| `SESSION_SECRET` | Kunci HMAC token login. Wajib di produksi. |
| `DEMO_ENABLED` | `false` mematikan `/api/demo/*` (reset, pembeli simulasi, paksa kedaluwarsa). |
| `CORS_ORIGINS` | Daftar origin yang boleh, dipisah koma. Kosong = semua. |
| `PORT`, `HOST` | Server Node (default `8787`, `0.0.0.0`). |

## Deploy

**Vercel (yang dipakai sekarang).** `npm run build` di folder ini menghasilkan `frontend/api/index.js`, yaitu
Vercel Function yang ikut ter-deploy bersama app di project yang sama (`/api`, region `sin1`). Setelah mengubah
`backend/src`, jalankan `npm run build` lalu commit file itu. Env `QR_SECRET` dan `SESSION_SECRET` sudah diisi di
project Vercel; `DATABASE_URL` datang dari integrasi Neon:

```bash
cd frontend
vercel integration add neon --plan free_v3 -m region=sin1 -m auth=false --name summarevent-db
vercel deploy --prod
```

Versi live ada di `https://summarevent-live.vercel.app` (build yang sama, mode dipilih dari nama host). Versi demo
`https://summarevent.vercel.app` tetap menyimpan data per browser.

**Server Node biasa (Railway, Render, VPS, laptop di booth).** `npm run build && npm start`, isi env di atas.
Untuk demo di pameran tanpa internet stabil: jalankan di laptop, lalu `cloudflared tunnel --url http://localhost:8787`
memberi alamat HTTPS sementara (kamera scanner butuh HTTPS).

## Struktur

```
src/
  app.ts        route REST → core API, auth per role, error → HTTP status
  store.ts      driver PostgreSQL: skema, snapshot, flush dengan SQL yang dijaga
  auth.ts       token login (HMAC) dan link foto bertanda tangan
  context.ts    siapa yang memanggil (per request)
  db/sql.ts     pg atau PGlite
  server.ts     entry Node
  vercel.ts     entry Vercel Function
test/api.test.ts
scripts/build.mjs
```
