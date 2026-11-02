# Summarevent — Kontrak API untuk Backend

Frontend jalan penuh dengan **mock di browser** (`frontend/src/api/mock`) dan juga dengan backend lewat
`frontend/src/api/http.ts` tanpa mengubah satu layar pun. Dokumen ini kontraknya.

**Implementasi acuan sudah ada di [`backend/`](../backend/README.md)** (Node + Hono + PostgreSQL): menjalankan
logika inti yang sama di server, dengan hold/konfirmasi/tiket/pembayaran dijaga SQL. Lolos 13 tes backend, uji
rebutan 100 request lintas 2 server, dan ketujuh suite end-to-end frontend dalam mode backend. Semua path di bawah
berada di bawah prefix `/api` (contoh: `https://summarevent-live.vercel.app/api/events`).

- Sumber kebenaran tipe: `frontend/src/domain/types.ts` (entitas) dan `frontend/src/api/contract.ts` (DTO).
- Logika bisnis yang harus di-port ada di `frontend/src/domain/rules.ts` (fungsi murni) dan
  `frontend/src/api/mock/adapter.ts` (alur per endpoint). Unit test-nya di `frontend/src/test/core.test.ts`
  — jadikan acuan test backend.
- Semua waktu ISO 8601 UTC. Uang = integer rupiah. Zona waktu tampilan: Asia/Jakarta (WIB).
- Error: HTTP 4xx dengan body `{ "code": "HOLD_EXPIRED", "message": "Waktu habis, kursi sudah dilepas…" }`.
  `message` ditampilkan apa adanya ke pengguna, jadi tulis dalam bahasa Indonesia dan jelaskan cara memperbaikinya.
- Database wajib PostgreSQL (UPDATE bersyarat, transaksi, partial unique index).

## Auth (OTP disimulasikan)

| Method | Path | Body | Balikan |
| --- | --- | --- | --- |
| POST | `/auth/otp/request` | `{ phone }` | `{ simulatedCode, expiresAt }` — kode ditampilkan di layar (simulasi). Rate limit 3×/menit/nomor → `429 RATE_LIMIT`. |
| POST | `/auth/otp/verify` | `{ phone, code, name? }` | `{ user, isNew, token }`. Nomor baru tanpa `name` → `200 { needName: true, message }`. Pesanan tamu (hold sebelum login) diklaim ke user ini. |
| POST | `/auth/demo-login` | `{ role: 'ADMIN' \| 'STAFF' \| 'VISITOR', user_id? }` | `{ user, token }` — akun demo untuk juri. `user_id` memilih akun petugas tertentu; akun nonaktif → `403 FORBIDDEN`. |

Token dikirim sebagai `Authorization: Bearer <token>`. Path `/admin/*` butuh role ADMIN, `/staff/*` butuh STAFF
(tanpa token yang cocok → `401 NEED_LOGIN`).

Setiap request juga membawa header `X-Guest-Id: guest_…` (id acak per browser). Itulah identitas pengunjung yang
belum login, supaya kursi bisa ditahan dulu lalu pesanannya diklaim saat verifikasi OTP.

Nomor baru yang belum mengirim `name` di `/auth/otp/verify` mendapat `200 { needName: true, message }` (langkah kedua
login, bukan error), lalu klien mengirim ulang dengan `name`.

## Publik & pengunjung

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/events` | `EventSummary[]` (event PUBLISHED + venue + kategori + sesi beserta ketersediaan per kategori) |
| GET | `/events/:slug` | `EventDetail` (+ daftar tenant) |
| GET | `/sessions/:id/seats?since=:version` | `SeatMapData`. Hold kedaluwarsa dilaporkan `AVAILABLE` (lazy expiry). `orderId` hanya diisi untuk hold milik peminta. Termasuk `waitlist: [{ categoryId, waiting }]` dan `bonus: [{ categoryId, left }]`. Frontend polling tiap 3 detik. |
| GET | `/sessions/:id/suggest?category_id=&qty=` | `string[]` seatId — saran kursi berdampingan terbaik (tanpa menahan) |
| POST | `/sessions/:id/holds` | Body `{ categoryId, seatIds? , qty? }` → `HoldResult` (lihat bawah) |
| POST | `/sessions/:id/holds/auto` | Body `{ category_id, qty }` → pilih + tahan dalam satu transaksi |
| GET | `/orders/:id` | `OrderDetail` (hanya pemilik) |
| PATCH | `/orders/:id` | Body `{ attendees: [{ itemId, name }] }` → `Order`. Boleh sampai sesi selesai (PV-13); nama tiket yang sudah check-in tidak bisa diubah → `409 BAD_STATE`. |
| DELETE | `/orders/:id` | Batalkan pesanan (PV-12). Pesanan menunggu: kursi dilepas. Pesanan terkonfirmasi: boleh sampai 24 jam sebelum sesi, tidak ada tiket yang sudah check-in, bukan sesi yang sedang berlangsung → tiket `CANCELLED`, kursi `AVAILABLE`, `refundAmount` = total kalau dibayar QRIS/VA (simulasi), `cancelledAt`/`cancelledBy`, pengingat terjadwal dihapus, antrean daftar tunggu dikabari. Aturan: `visitorCancelPolicy` di `domain/rules.ts`. |
| POST | `/orders/:id/payments/simulate` | Body `{ method: 'SIM_QRIS'\|'SIM_VA', outcome: 'SUCCESS'\|'FAIL', idempotencyKey }` → `{ order, paymentStatus, message }` |
| POST | `/orders/:id/confirm` | Kategori gratis → `Order` terkonfirmasi |
| POST | `/orders/:id/receipts/check` | Body `{ receipts: ReceiptInput[] }` tanpa foto → `{ checks: RuleCheck[], total }` (checklist live) |
| POST | `/orders/:id/receipts` | Body `{ receipts: ReceiptInput[] }` → `ReceiptSubmitResult`. Prototype mengirim foto sebagai data URL; backend boleh ganti ke multipart + object storage privat + signed URL. |
| GET | `/me/orders` · `/me/tickets` · `/me/notifications` | Riwayat pesanan, Pass Saya, kotak pesan simulasi. Tiket bisa membawa `bonus` (AD-12). |
| POST | `/sessions/:id/waitlist` | Body `{ category_id, qty }` → `WaitlistItem` (`position` = urutan). Hanya untuk user login (`401 NEED_LOGIN`) dan kalau tempat memang kurang dari `qty` (PV-14). |
| DELETE | `/waitlist/:id` | Keluar dari daftar tunggu |
| GET | `/me/waitlist` | `WaitlistItem[]` (+ event, sesi, kategori) |
| GET | `/receipt-photos/:id?sig=` | Foto struk yang diunggah (disimpan terpisah dari data pesanan). Hanya bisa dibuka lewat link bertanda tangan HMAC yang ada di `receipt.photoUrl`. |
| GET | `/health` | `{ ok, database, version, demo }` |

`HoldResult`:
```json
{ "ok": true, "order": { … } }
{ "ok": false, "reason": "CONFLICT", "conflictSeatIds": ["…"], "suggestions": ["…"], "message": "Yah, C8 baru saja dipilih orang lain." }
{ "ok": false, "reason": "SOLD_OUT" | "RULE", "message": "…" }
```

## Panitia (`/admin`)

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/admin/events` | Semua event (draft juga) |
| GET | `/admin/events/:id` | `{ draft: EventDraft, event }` untuk wizard edit |
| POST | `/admin/events` | Body `EventDraft` → buat event + kategori + denah (template) + sesi + inventori kursi per sesi |
| PATCH | `/admin/events/:id` | Body `EventDraft` (atau `{ status: 'PUBLISHED' }`). Denah tidak boleh berubah kalau sudah ada pesanan → `409 LOCKED_LAYOUT` |
| GET | `/admin/orders?eventId=&status=&q=` | `OrderRow[]` (q: kode, nama, HP, label kursi) |
| PATCH | `/admin/orders/:id` | `{ action: 'MARK_PAID' \| 'CANCEL' }`. CANCEL pada pesanan lunas mencatat `refundAmount` (simulasi) dan `cancelledBy: 'ADMIN'` (AD-10). |
| GET | `/admin/receipts?status=PENDING\|ALL\|…` | `ReceiptQueueItem[]` — satu item per pesanan (set struk digabung) + hasil cek aturan |
| PATCH | `/admin/receipts/:id` | `{ decision: 'APPROVE'\|'NEEDS_REVISION'\|'REJECT', reason? }` — berlaku untuk seluruh set struk pesanan. Revisi/tolak wajib `reason`. |
| GET | `/admin/events/:id/stats` | `EventStats` (polling 5 detik) |
| GET | `/admin/events/:id/export?type=attendees\|transactions` | `{ filename, csv }` |
| GET | `/admin/venues` · `/admin/tenants` | Data referensi |
| GET | `/admin/staff` | `StaffAccount[]` (akun petugas + jumlah scan VALID + scan terakhir), AD-13 |
| POST | `/admin/staff` | `{ name, phone }` → `User` role STAFF. Nomor ganda → `409 DUPLICATE`. |
| PATCH | `/admin/staff/:id` | `{ active }` → akun nonaktif tidak bisa login dan check-in (`403 FORBIDDEN`) |

## Petugas (`/staff`)

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/staff/accounts` | `StaffAccount[]` aktif, untuk pengganti akun petugas di layar demo |
| POST | `/staff/checkins` | Body `{ qr_token, session_id }` → `CheckinResponse` dengan `result` ∈ `VALID`, `ALREADY_USED` (+`firstScan`), `INVALID`, `WRONG_SESSION`, `OUTSIDE_WINDOW` |
| GET | `/staff/tickets?q=&event_id=` | Cari manual (kode tiket, kode pesanan, HP, nama) |
| GET | `/staff/sessions/:id/checkins` | `{ checkedIn, capacity, recent[] }` |
| GET | `/staff/receipts?event_id=` | Antrean struk menunggu untuk dicek di desk (PT-06), bentuk sama dengan `/admin/receipts` |
| PATCH | `/staff/receipts/:id` | Sama dengan `/admin/receipts/:id`, tapi `reviewedBy` = petugas yang login |

## Demo (matikan di produksi)

| Method | Path | Fungsi |
| --- | --- | --- |
| POST | `/demo/reset` | Kembalikan seed data |
| POST | `/demo/sessions/:id/fake-buyer` | Tahan 1–2 kursi acak (atau tepat `seat_ids` kalau dikirim) selama 60 detik atas nama "Pembeli lain (simulasi)". Body: `{ category_id?, seat_ids? }` |
| POST | `/demo/orders/:id/expire` | Akhiri waktu tahan pesanan milik pengunjung sekarang juga (pesanan jadi Kedaluwarsa, kursi kembali Tersedia). Hanya untuk mode demo. |

## Aturan yang wajib sama persis dengan mock

**Pencegahan pemesanan ganda (PRD §8)**
```sql
-- 1. Hold all-or-nothing, dalam transaksi
UPDATE session_seats
SET status = 'HELD', order_id = $1,
    hold_expires_at = now() + make_interval(mins => $4)
WHERE session_id = $2 AND seat_id = ANY($3)
  AND (status = 'AVAILABLE'
       OR (status = 'HELD' AND hold_expires_at < now()));
-- rowCount < jumlah kursi → ROLLBACK, balas CONFLICT + saran kursi terdekat

-- 3. Konfirmasi bersyarat
UPDATE session_seats SET status = 'SOLD'
WHERE order_id = $1 AND status = 'HELD' AND hold_expires_at > now();
-- rowCount < jumlah kursi pesanan → ROLLBACK, HOLD_EXPIRED

-- 4. Pengaman terakhir
CREATE UNIQUE INDEX one_ticket_per_seat ON tickets (session_id, seat_id)
  WHERE status <> 'CANCELLED' AND seat_id IS NOT NULL;
```
- Hold: 10 menit (bayar), 30 menit (tukar struk). Job tiap 1 menit mengubah pesanan lewat waktu jadi `EXPIRED` dan melepas kursi; query baca tetap memakai lazy expiry.
- Kategori tanpa nomor kursi: `filled + qty <= quota` dihitung dari pesanan CONFIRMED + pesanan menunggu yang hold-nya masih aktif.
- Satu akun maksimal satu pesanan **menunggu** per sesi. Maks kursi per pesanan dari `event.rules.maxSeatsPerOrder`.
- Pembayaran memakai `idempotencyKey` unik; permintaan ulang dengan key yang sama mengembalikan hasil yang sama.
- Satu tiket = satu kursi = satu QR. Token QR: `SEV1.<ticketId>.<qrVersion>.<HMAC-SHA256 base64url, 22 char>` — secret hanya di server.
- Check-in memakai `SELECT … FOR UPDATE` pada tiket. Urutan cek: token valid → tiket ada & versi cocok → tidak dibatalkan → event sama → belum dipakai (kecuali boleh keluar-masuk) → sesi sama → di dalam jendela check-in.
- Aturan struk R1–R4, R6: lihat `checkReceiptRules` di `domain/rules.ts` (pesan error ikut dari sana).
- Notifikasi (WA/email) cukup disimpan di tabel `notifications` — tidak dikirim sungguhan. Kolom opsional `order_id` dipakai untuk menghapus pengingat terjadwal saat pesanan dibatalkan.
- **Bonus N pembeli pertama (AD-12)**: kategori dengan `bonusFirstN` + `bonusDesc`; saat konfirmasi, tiket ke-1…N per sesi per kategori (tiket non-batal yang sudah punya bonus dihitung) diberi `bonus = bonusDesc`.
- **Daftar tunggu (PV-14)**: tabel `waitlist (id, user_id, session_id, category_id, qty, status WAITING|NOTIFIED|LEFT, created_at, notified_at)`. Setiap kali tempat lepas (hold kedaluwarsa, pesanan batal, struk ditolak), kabari orang terdepan yang jumlahnya muat lewat WA (simulasi), tanpa menahan tempat.
- **Akun petugas (AD-13)**: `users.active` (default true); check-in dari akun nonaktif ditolak.
- **OCR struk (PV-16)** berjalan di browser (tesseract.js); backend tidak perlu endpoint khusus.

## Kode error

`400` BAD_REQUEST, INVALID, NEED_REASON, BAD_PHONE, BAD_OTP, OTP_EXPIRED, RULE · `401` NEED_LOGIN · `403` FORBIDDEN ·
`404` NOT_FOUND · `409` CONFLICT, BAD_STATE, HOLD_EXPIRED, SEAT_TAKEN, SOLD_OUT, LOCKED_LAYOUT, DUPLICATE,
DUPLICATE_PAYMENT, ALREADY_USED · `429` RATE_LIMIT · `503` NOT_READY. Klien menampilkan `message` apa adanya; kalau
server tidak terjangkau, klien membuat error `OFFLINE` sendiri.

## Uji beban (untuk QA)
`qa/k6-hold-race.js` menembak 100 hold bersamaan ke kursi yang sama. Hasil yang diharapkan: tepat 1 `ok: true`.
Tanpa k6: `node qa/race-two-servers.mjs` menembak 100 hold yang dibagi ke dua instance API (hasil terakhir: 1 berhasil,
99 bentrok, 184 ms, kedua server melihat status yang sama).
