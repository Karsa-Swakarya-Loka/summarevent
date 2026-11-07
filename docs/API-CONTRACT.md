# Summarevent — Kontrak API

Frontend jalan penuh dengan **mock di browser** (`frontend/src/api/mock`) dan juga dengan backend lewat
`frontend/src/api/http.ts`, tanpa mengubah satu layar pun. Dokumen ini kontrak di antara keduanya. Backend apa pun
(saat ini Convex, dikelola tim backend dan dipakai versi live) cukup menyediakan endpoint di bawah, lalu frontend di-build
dengan `VITE_API_URL` yang menunjuk ke prefix-nya: `VITE_API_URL=https://api.contoh.id/api` berarti
`GET https://api.contoh.id/api/events`.

- Sumber kebenaran tipe: `frontend/src/domain/types.ts` (entitas) dan `frontend/src/api/contract.ts` (DTO).
- Logika bisnis yang harus di-port ada di `frontend/src/domain/rules.ts` (fungsi murni) dan
  `frontend/src/api/mock/adapter.ts` (alur per endpoint). Unit test-nya di `frontend/src/test/core.test.ts`
  — jadikan acuan test backend.
- Semua waktu ISO 8601 UTC. Uang = integer rupiah. Zona waktu tampilan: Asia/Jakarta (WIB).
- Error: HTTP 4xx dengan body `{ "code": "HOLD_EXPIRED", "message": "Waktu habis, kursi sudah dilepas…" }`.
  `message` ditampilkan apa adanya ke pengguna, jadi tulis dalam bahasa Indonesia dan jelaskan cara memperbaikinya.
- CORS: izinkan origin app beserta header `Content-Type`, `Authorization`, dan `X-Guest-Id`.
- Uji terimanya adalah suite end-to-end frontend dalam mode backend, lihat [bagian terakhir](#uji-terima).

## Auth (OTP disimulasikan)

| Method | Path | Body | Balikan |
| --- | --- | --- | --- |
| POST | `/auth/otp/request` | `{ phone }` | `{ simulatedCode, expiresAt }` — kode ditampilkan di layar (simulasi). `simulatedCode` hanya ada di deployment demo; di luar itu kode dikirim lewat SMS/WA dan balikannya `{ expiresAt }`. Rate limit 3×/menit/nomor → `429 RATE_LIMIT`. |
| POST | `/auth/otp/verify` | `{ phone, code, name? }` | `{ user, isNew, token }`. Nomor baru tanpa `name` → `200 { needName: true, message }`. Pesanan tamu (hold sebelum login) diklaim ke user ini. Kode salah → `400 BAD_OTP`; setelah 5× salah kodenya hangus dan harus minta kode baru. |
| POST | `/auth/demo-login` | `{ role: 'ADMIN' \| 'STAFF' \| 'VISITOR', user_id? }` | `{ user, token }` — akun demo untuk juri, hanya di deployment demo (`DEMO_MODE=true`, selain itu `403 FORBIDDEN`). `user_id` hanya untuk STAFF, memilih akun petugas tertentu; VISITOR selalu persona Rina. Akun nonaktif → `403 FORBIDDEN`. |
| POST | `/auth/login` | `{ email, password, role: 'ADMIN' \| 'STAFF' }` | `{ user, token }` — masuk panitia dan petugas. Email dibandingkan huruf kecil. Email atau sandi salah → `401 BAD_LOGIN` "Email atau kata sandi salah." (sengaja tidak menyebut mana yang salah). Akun nonaktif → `403 FORBIDDEN`. 5× gagal dalam 15 menit → `429 RATE_LIMIT`. Di deployment demo, akun demo memakai sandi `summaba2026` (disimpan sebagai hash), jadi tombol Isi otomatis tetap jalan. Di luar demo akun contoh tidak punya sandi. Hitungan gagal dicatat per email, termasuk email yang tidak terdaftar, jadi `429` tidak membocorkan email mana yang ada. |
| POST | `/auth/logout` | — | `{ ok: true }` — token yang dikirim tidak berlaku lagi. Jawabannya sama walau tokennya sudah tidak ada. |
| POST | `/auth/password/forgot` | `{ email }` | Selalu `200 { ok: true }`, supaya tidak bisa dipakai mengecek email terdaftar. Kalau emailnya ada (panitia atau petugas), Resend mengirim link `<app>/reset?token=…` yang berlaku 30 menit dan sekali pakai (satu halaman untuk kedua role, rolenya dibaca dari token). Permintaan ulang untuk akun yang sama dalam 1 menit (`FORGOT_MIN_INTERVAL_SEC`) tetap `{ ok: true }` tanpa link baru. Versi demo menambah `simulatedLink` dan menampilkannya di layar. |
| POST | `/auth/password/reset` | `{ token, password }` | `{ user, token }` — langsung masuk sebagai role akun itu. Sandi minimal 8 karakter, tanpa spasi di awal atau akhir (`passwordCheck` di `domain/rules.ts`) → kalau tidak, `400 INVALID` dengan `details.field: 'password'`. Token kedaluwarsa atau sudah dipakai → `400 RESET_EXPIRED`. Akun nonaktif → `403 FORBIDDEN`. Sandi baru mengeluarkan semua sesi lain akun itu (token lama tidak berlaku lagi). |

Token dikirim sebagai `Authorization: Bearer <token>`. Path `/admin/*` butuh role ADMIN, `/staff/*` butuh STAFF
(tanpa token yang cocok → `401 NEED_LOGIN`). Token berlaku 12 jam untuk panitia dan petugas, 30 hari untuk pengunjung,
lalu `401 NEED_LOGIN`. Petugas yang dinonaktifkan langsung keluar dari semua HP-nya (`403 FORBIDDEN` untuk token lain
yang tersisa).

Tahan kursi, OTP, login, lupa sandi, dan kirim struk dibatasi per alamat klien (header `x-vercel-forwarded-for` kalau lewat rewrite Vercel, selain itu `x-forwarded-for`) dalam jendela
10 menit → `429 RATE_LIMIT`. Batasnya longgar supaya satu keluarga di Wi-Fi mal tetap bisa memesan.

Setiap request juga membawa header `X-Guest-Id: guest_…` (id acak per browser). Itulah identitas pengunjung yang
belum login, supaya kursi bisa ditahan dulu lalu pesanannya diklaim saat verifikasi OTP. Tanpa header yang sah (dan
tanpa login), tahan kursi dan akses pesanan ditolak `400 BAD_REQUEST`.

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
| PATCH | `/me` | Body `{ name?, email?, avatar? }` → `User` (PV-06, edit profil pengunjung). Hanya untuk user login (`401 NEED_LOGIN`). Nama dirapikan (spasi berlebih jadi satu) dan wajib 2–60 karakter. Email dibuat huruf kecil, `""` atau `null` menghapusnya, dan formatnya dicek. `avatar` adalah foto profil sebagai data URL JPEG, PNG, atau WebP, paling besar 300 KB (frontend sudah memotongnya persegi 320 px); simpan di storage dan kembalikan alamatnya sebagai `user.avatarUrl`, sedangkan `null` menghapus foto. Salah isi → `400 INVALID` dengan `details.field` (`name`, `email`, atau `avatar`). Email yang sudah dipakai akun lain → `409 DUPLICATE`. Nomor HP adalah login, jadi tidak bisa diubah di sini. Mengganti nama tidak mengubah nama di tiket yang sudah terbit (itu lewat `PATCH /orders/:id`). Aturan: `profileChanges` di `domain/rules.ts`. |
| GET | `/receipt-photos/:id?exp=&sig=` | Foto struk yang diunggah (disimpan terpisah dari data pesanan). Hanya bisa dibuka lewat link bertanda tangan HMAC yang ada di `receipt.photoUrl`, berlaku 30 hari sejak struk dikirim. Foto harus JPEG, PNG, atau WebP sungguhan (isinya dicek, bukan hanya namanya), paling besar 3 MB per foto dan 12 MB per kiriman; SVG hanya diterima di deployment demo untuk struk contoh. |
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
| POST | `/admin/events` | Body `EventDraft` (termasuk `posterPalette` dan `layout.curved` opsional, lihat Aturan) → buat event + kategori + denah (template) + sesi + inventori kursi per sesi |
| PATCH | `/admin/events/:id` | Body `EventDraft` (atau `{ status: 'PUBLISHED' }`). Denah tidak boleh berubah kalau sudah ada pesanan → `409 LOCKED_LAYOUT` |
| GET | `/admin/orders?eventId=&status=&q=` | `OrderRow[]` (q: kode, nama, HP, label kursi) |
| PATCH | `/admin/orders/:id` | `{ action: 'MARK_PAID' \| 'CANCEL' }`. CANCEL pada pesanan lunas mencatat `refundAmount` (simulasi) dan `cancelledBy: 'ADMIN'` (AD-10). |
| GET | `/admin/receipts?status=PENDING\|ALL\|…` | `ReceiptQueueItem[]` — satu item per pesanan (set struk digabung) + hasil cek aturan |
| PATCH | `/admin/receipts/:id` | `{ decision: 'APPROVE'\|'NEEDS_REVISION'\|'REJECT', reason? }` — berlaku untuk seluruh set struk pesanan. Revisi/tolak wajib `reason`. |
| GET | `/admin/events/:id/stats` | `EventStats` (polling 5 detik). Termasuk `daily` (30 hari terakhir WIB, urut dari yang terlama: `{ date, tickets, revenue, orders }` dari pesanan terkonfirmasi hari itu, tanpa pembeli simulasi) dan `checkinsByHour` (7 hari × 24 jam, Senin = 0, jumlah check-in VALID) untuk grafik dashboard. |
| GET | `/admin/events/:id/export?type=attendees\|transactions` | `{ filename, csv }`, dengan sel yang aman dibuka di Excel (lihat Aturan) |
| GET | `/admin/venues` · `/admin/tenants` | Data referensi |
| GET | `/admin/staff` | `StaffAccount[]` (akun petugas + jumlah scan VALID + scan terakhir), AD-13 |
| POST | `/admin/staff` | `{ name, phone, email }` → `User` role STAFF. Email wajib dan dibuat huruf kecil; petugas lalu mendapat email undangan untuk membuat sandi (alur reset yang sama, link berlaku 24 jam). Nomor atau email ganda → `409 DUPLICATE` dengan `details.field`. |
| PATCH | `/admin/staff/:id` | `{ active }` → akun nonaktif tidak bisa login dan check-in (`403 FORBIDDEN`) |

## Petugas (`/staff`)

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/staff/accounts` | `StaffAccount[]` aktif, untuk pengganti akun petugas di layar demo |
| POST | `/staff/checkins` | Body `{ qr_token, session_id }` (QR yang dipindai) atau `{ ticket_id, session_id }` (tiket yang dipilih dari cari manual atau rombongan; scanner dan kolom tempel QR tidak pernah memakai ini, dan id tiket yang dikirim sebagai `qr_token` dijawab `INVALID`) → `CheckinResponse` dengan `result` ∈ `VALID`, `ALREADY_USED` (+`firstScan`), `INVALID`, `WRONG_SESSION`, `OUTSIDE_WINDOW`. Di luar deployment demo, `ticket.qrToken` di jawaban petugas (check-in dan `/staff/tickets`) dikosongkan: token QR hanya dilihat pemilik tiketnya. |
| GET | `/staff/tickets?q=&event_id=` | Cari manual (kode tiket, kode pesanan, HP, nama) |
| GET | `/staff/sessions/:id/checkins` | `{ checkedIn, capacity, recent[] }` |
| GET | `/staff/sessions/:id/offline-manifest` | Bekal scan offline (PT-07): `OfflineManifest { sessionId, generatedAt, event, session, categories, tickets[] }`. Tiap tiket berisi `tokenHash` (SHA-256 hex dari token QR; tokennya sendiri tidak pernah dikirim), `ticket` tanpa `qrToken`, `order { id, code, buyerName }`, dan `session`. Isinya semua tiket event, supaya tiket sesi lain tetap terbaca `WRONG_SESSION`. Scan yang tertahan offline dikirim belakangan lewat `POST /staff/checkins` biasa, dan hasil dari server yang berlaku. |
| GET | `/staff/receipts?event_id=` | Antrean struk menunggu untuk dicek di desk (PT-06), bentuk sama dengan `/admin/receipts` |
| PATCH | `/staff/receipts/:id` | Sama dengan `/admin/receipts/:id`, tapi `reviewedBy` = petugas yang login |

## Demo (hanya di deployment dengan `DEMO_MODE=true`)

| Method | Path | Fungsi |
| --- | --- | --- |
| POST | `/demo/reset` | Kembalikan seed data |
| POST | `/demo/sessions/:id/fake-buyer` | Tahan 1–2 kursi acak (atau tepat `seat_ids` kalau dikirim) selama 60 detik atas nama "Pembeli lain (simulasi)". Body: `{ category_id?, seat_ids? }` |
| POST | `/demo/orders/:id/expire` | Akhiri waktu tahan pesanan milik pengunjung sekarang juga (pesanan jadi Kedaluwarsa, kursi kembali Tersedia). Hanya untuk mode demo. |

## Aturan yang wajib sama persis dengan mock

**Pencegahan pemesanan ganda (PRD §8).** Lima invarian ini dijaga di dalam transaksi backend, bukan hanya di
kode yang memanggilnya:

1. **Hold all-or-nothing.** Semua kursi pesanan ditahan dalam satu transaksi, dan hanya kalau masing-masing masih
   `AVAILABLE` atau hold-nya sudah lewat waktu. Satu saja bentrok, tidak ada yang ditahan: balas `CONFLICT` beserta
   `conflictSeatIds` dan saran kursi terdekat.
2. **Batas waktu tahan.** Hold yang lewat waktu dianggap `AVAILABLE` saat dibaca, dan dirapikan berkala.
3. **Konfirmasi bersyarat.** Pembayaran atau persetujuan struk hanya mengubah kursi jadi `SOLD` kalau hold masih milik
   pesanan itu dan belum lewat waktu. Kalau tidak, `409 HOLD_EXPIRED`.
4. **Satu tiket aktif per kursi per sesi.** Pengaman terakhir di lapisan data, kalau ada bug di atasnya.
5. **Idempotency key.** Pembayaran dengan key yang sama selalu menghasilkan satu pembayaran.
- Hold: 10 menit (bayar), 30 menit (tukar struk). Job tiap 1 menit mengubah pesanan lewat waktu jadi `EXPIRED` dan melepas kursi; query baca tetap memakai lazy expiry.
- Kategori tanpa nomor kursi: `filled + qty <= quota` dihitung dari pesanan CONFIRMED + pesanan menunggu yang hold-nya masih aktif.
- Satu akun maksimal satu pesanan **menunggu** per sesi. Maks kursi per pesanan dari `event.rules.maxSeatsPerOrder`.
- Pembayaran memakai `idempotencyKey` unik; permintaan ulang dengan key yang sama mengembalikan hasil yang sama.
- Satu tiket = satu kursi = satu QR. Token QR: `SEV1.<ticketId>.<qrVersion>.<HMAC-SHA256 base64url, 22 char>`, dengan secret yang hanya ada di server.
- Check-in mengunci tiketnya di dalam transaksi, jadi dua petugas yang memindai QR yang sama berbarengan hanya menghasilkan satu `VALID`. Urutan cek: token valid → tiket ada & versi cocok → tidak dibatalkan → event sama → belum dipakai (kecuali boleh keluar-masuk) → sesi sama → di dalam jendela check-in.
- Aturan struk R1–R4, R6: lihat `checkReceiptRules` di `domain/rules.ts` (pesan error ikut dari sana).
- Notifikasi (WA/email) cukup disimpan, tidak dikirim sungguhan. Field opsional `orderId` diisi di setiap pesan yang menyangkut satu pesanan (konfirmasi, e-ticket, pengingat, struk, kedaluwarsa, batal), supaya layar Pesan bisa membuka pesanannya. Pembatalan hanya menghapus pesan yang punya `orderId` **dan** `scheduledFor` (pengingat terjadwal). Pesan daftar tunggu tidak punya `orderId`.
- **Bonus N pembeli pertama (AD-12)**: kategori dengan `bonusFirstN` + `bonusDesc`; saat konfirmasi, tiket ke-1…N per sesi per kategori (tiket non-batal yang sudah punya bonus dihitung) diberi `bonus = bonusDesc`.
- **Daftar tunggu (PV-14)**: entri `{ id, userId, sessionId, categoryId, qty, status: WAITING|NOTIFIED|LEFT, createdAt, notifiedAt }`. Setiap kali tempat lepas (hold kedaluwarsa, pesanan batal, struk ditolak), kabari orang terdepan yang jumlahnya muat lewat WA (simulasi), tanpa menahan tempat.
- **Akun petugas (AD-13)**: user punya `active` (default true); check-in dari akun nonaktif ditolak.
- **OCR struk (PV-16)** berjalan di browser (tesseract.js); backend tidak perlu endpoint khusus.
- **Sel CSV export**: angka ditulis apa adanya. Teks yang diawali `=`, `+`, `-`, `@`, tab, atau CR diberi `'` di depannya supaya tidak dijalankan sebagai rumus di Excel atau Sheets, lalu sel yang berisi koma, titik koma, kutip, atau baris baru diapit kutip dengan kutip di dalamnya digandakan. Acuannya `csvCell` di `frontend/src/lib/format.ts`.
- **Baris melengkung**: `EventDraft.layout.curved?: boolean` dan `SeatLayout.curved?: boolean`. Kalau `true`, `buildSeats` (di `domain/rules.ts`) memberi `y` pecahan pada kursi: kedua ujung baris tetap di `y` barisnya, tengahnya mundur sampai 1,5 unit kursi, sama untuk semua baris. Koordinat itu yang disimpan di tabel `seats`, jadi peta kursi tinggal menggambar `x`/`y`. Tidak dikirim atau `false` berarti baris lurus seperti sebelumnya. Saran kursi memakai urutan baris, bukan `y`, untuk "lebih dekat ke panggung". Backend hanya menyimpan `curved` kalau nilainya `true`, jadi deployment yang skemanya belum punya field ini tetap menerima denah lurus.
- **Warna poster (AD-01)**: `event.posterPalette?: { bg, accent }` (dua warna hex 6 digit huruf kecil, harus berbeda) menimpa warna tema `posterTheme`; warna teks dihitung dari `bg` (`posterInk` di `domain/rules.ts`, dipakai poster dan e-ticket pengunjung). `EventDraft.posterPalette: null` atau tidak dikirim berarti memakai warna tema. Salah → `400 INVALID` dengan `details.field: 'posterPalette'` (validasinya `posterPaletteCheck` di `domain/rules.ts`). Seed: event `evt_akustik` memakai `{ bg: '#1c2f5e', accent: '#f9a61b' }`.

## Kode error

`400` BAD_REQUEST, INVALID, NEED_REASON, BAD_PHONE, BAD_OTP, OTP_EXPIRED, RESET_EXPIRED, RULE · `401` NEED_LOGIN, BAD_LOGIN · `403` FORBIDDEN ·
`404` NOT_FOUND · `409` CONFLICT, BAD_STATE, HOLD_EXPIRED, SEAT_TAKEN, SOLD_OUT, LOCKED_LAYOUT, DUPLICATE,
DUPLICATE_PAYMENT, ALREADY_USED · `429` RATE_LIMIT · `503` NOT_READY. Klien menampilkan `message` apa adanya; kalau
server tidak terjangkau, klien membuat error `OFFLINE` sendiri.

## Uji terima

- Suite end-to-end frontend dalam mode backend lolos semua:
  `API_URL=https://alamat-backend/api BASE=https://alamat-app npm run e2e` (lihat
  [`frontend/e2e/README.md`](../frontend/e2e/README.md)). Data di-reset lewat `POST /demo/reset` sebelum tiap suite.
- 100 hold bersamaan untuk satu kursi: tepat 1 `ok: true`, 99 `CONFLICT`, dan semua pembaca melihat kursi itu `HELD`.
- Dua pesanan yang tumpang tindih (C5–C6 dan C6–C7) dikirim berbarengan: satu berhasil utuh, yang lain gagal utuh.
- QR yang sama dipindai dua petugas berbarengan: tepat satu `VALID`.
