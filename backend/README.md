# Summarevent — Backend (Convex)

Backend bersama untuk versi live. Isinya REST API dari [`docs/API-CONTRACT.md`](../docs/API-CONTRACT.md), dilayani
HTTP action Convex di `https://<deployment>.convex.site/api`. Frontend tinggal di-build dengan
`VITE_API_URL=https://<deployment>.convex.site/api`, tanpa mengubah layar.

Deployment dev saat ini: `https://good-gnu-186.convex.site/api` (project `summarevent`, team Bintang).

## Cara kerja

| Bagian | Isi |
| --- | --- |
| `convex/http.ts` | Router: path dan method → satu query atau mutation, CORS, kode error → status HTTP, upload foto ke file storage |
| `convex/rpc.ts` | Daftar operasi baca (`query`) dan tulis (`mutation`), reset dan seed data demo, job kedaluwarsa |
| `convex/api/*.ts` | Alur per endpoint, di-port dari `frontend/src/api/mock/adapter.ts` dengan nama dan pesan yang sama |
| `convex/lib/core.ts` | Bagian bersama: hold, konfirmasi, daftar tunggu, ketersediaan, wizard event |
| `convex/lib/tx.ts` | Unit of work: baris dibaca sebagai objek domain, diubah di tempat, lalu ditulis balik dalam transaksi yang sama |
| `convex/shared/` | **Hasil generate** dari `frontend/src/domain`, `lib/format.ts`, `api/contract.ts`, dan `api/mock/seed.ts`. Jangan diedit; ubah file frontend-nya lalu `npm run sync-domain` |
| `convex/crons.ts` | Tiap menit: pesanan lewat waktu jadi `EXPIRED`, kursi dilepas, daftar tunggu dikabari |

Kenapa invarian pemesanan ganda (PRD §8) terjaga: setiap request adalah **satu** mutation Convex, dan mutation Convex
adalah transaksi serializable. Hold membaca dan menulis baris kursi yang diminta di transaksi yang sama, jadi dua
hold pada kursi yang sama tidak mungkin sama-sama berhasil; check-in mengunci baris tiketnya dengan cara yang sama.
Kalau tabrakan masih terjadi setelah retry bawaan Convex, `http.ts` mengulang seluruh panggilan.

Yang berbeda dari mock, karena ini server sungguhan:

- Login memakai token bearer acak (yang disimpan hanya hash SHA-256-nya). `X-Guest-Id` wajib berawalan `guest_`, jadi id tamu tidak bisa dipakai untuk membaca data akun.
- Token QR dan link foto struk ditandatangani HMAC dengan `APP_SECRET` yang hanya ada di server.
- Foto profil dan foto struk disimpan di file storage Convex. Foto struk hanya bisa dibuka lewat link bertanda tangan `/receipt-photos/:id?sig=`; SVG dikirim dengan CSP `sandbox`.
- `orderId` diisi di semua pesan yang menyangkut satu pesanan (lihat kontrak, bagian aturan notifikasi).

## Menjalankan

```sh
cd backend
npm install
npx convex dev                 # login Convex, push fungsi, pantau perubahan
npx convex env set APP_SECRET "$(openssl rand -base64 32)"   # sekali per deployment
npx convex run rpc:ensureSeeded                               # isi data contoh kalau database masih kosong
```

| Env (di deployment Convex) | Fungsi |
| --- | --- |
| `APP_SECRET` | Wajib. Kunci HMAC untuk token QR dan link foto struk. Mengganti kunci membuat QR lama tidak berlaku |
| `DEMO_MODE` | `false` mematikan `/demo/*` (produksi). Default menyala |
| `ALLOWED_ORIGINS` | Origin app yang boleh memanggil API, dipisah koma. Default `*` |
| `PUBLIC_API_URL` | Alamat publik API kalau tidak lewat `.convex.site` (misalnya di balik proxy `/api`) |
| `DEBUG_ERRORS` | `true` (dev saja) menaruh pesan error asli di `details` respons 500 |

## Cek sebelum commit

```sh
npm run check-domain   # convex/shared sama dengan frontend/src/domain (jalan juga di CI)
npm run typecheck
npm test               # convex-test: hold, bayar, klaim tamu, check-in, profil, daftar tunggu
```

Uji terima terhadap deployment (mereset data demo):

```sh
API_URL=https://good-gnu-186.convex.site/api npm run acceptance   # 100 hold serentak, pesanan tumpang tindih, scan serentak, idempotency
cd ../frontend
VITE_API_URL=https://good-gnu-186.convex.site/api npm run dev     # terminal lain
API_URL=https://good-gnu-186.convex.site/api npm run e2e
```
