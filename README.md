# Summarevent

**Satu pass untuk semua event Summarecon Mall Bandung.** Prototype ticketing untuk Bandung Build Challenge 2026
(tema: Event Ticketing System, fokus pemilihan kursi). Pengunjung memilih kategori dan kursi langsung dari denah,
lalu bayar (simulasi), daftar gratis, atau tukar struk belanja, dan mendapat e-ticket QR. Panitia mengatur event,
denah, harga, kuota, dan periode jual, memantau kursi dan transaksi secara live, lalu memvalidasi QR saat check-in.

- PRD: `docs/PRD-v1.2.txt` · Technical brief: `docs/TECHNICAL-BRIEF.txt` · Kontrak API backend: `docs/API-CONTRACT.md`
- Logo & brand: `docs/brand/final/` (kit final), konsep lama di `docs/brand/`, aset app di `frontend/public/brand/`

## Menjalankan

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # unit test logika inti (rebutan kursi, struk, check-in, data contoh)
npm run e2e        # uji end-to-end di Chrome (dev server harus jalan), lihat frontend/e2e/README.md
npm run build      # build produksi ke frontend/dist
```

Tanpa `VITE_API_URL`, app memakai **mock di browser** (data contoh di localStorage, transaksi atomik antar-tab
dengan Web Locks). Dengan `VITE_API_URL=https://…`, app memakai backend asli lewat kontrak di `docs/API-CONTRACT.md`.

## Skrip demo untuk juri (±5 menit)

1. Buka `/` → pilih **Pengunjung**. Pilih *Pentas Musikal Keluarga "Sangkuriang"* → sesi 16.00.
2. Pilih kategori **Reguler**, jumlah 2, tekan **Pilihkan 2 kursi berdampingan** → **Hayu ngiring**.
   Kursi ditahan 10 menit (hitung mundur terlihat).
3. Masuk dengan nomor HP apa saja → kode OTP muncul di layar (simulasi) → isi nama → **Simulasikan bayar berhasil**.
   E-ticket QR muncul di **Pass Saya** (*Tos siap!*). Mau lihat jalur gagal? Tekan **Simulasikan bayar gagal**, atau
   **Simulasikan waktu habis (demo)** untuk melihat pesanan jadi *Kedaluwarsa* dan kursinya dilepas tanpa menunggu 10 menit.
4. Coba kategori **Tukar Struk** → **Pakai struk contoh** → checklist aturan tercentang otomatis → kirim.
   Status pesanan jadi *Menunggu verifikasi struk*, kursi tetap ditahan 30 menit.
5. Pindah ke **Panitia** (tombol *Demo* di pojok kiri bawah): **Verifikasi struk** → setujui struk dari langkah 4
   (layar status pengunjung di tab lain langsung berubah jadi *Tos siap!*), lalu **Minta revisi** untuk struk Yudi
   yang totalnya kurang dari minimal. **Peta kursi live** → **Simulasikan pembeli lain** dan lihat kursi berubah jadi
   *Sedang dipesan*. **Pesanan & peserta** → filter *Menunggu pembayaran* → buka pesanan Bayu (transfer VA) →
   **Tandai lunas**, lalu unduh CSV peserta dan transaksi. **Event** → **Buat event** untuk mencoba wizard.
6. Pindah ke **Petugas** → *Sesi Demo Juri (selalu berlangsung)* → **Mulai scan**. Scan QR dari HP lain, atau pakai
   **Alat bantu demo → Ambil tiket contoh**: hasil **Valid** (*Mangga lebet*), scan lagi → **Sudah digunakan**,
   **QR palsu** → **Tidak valid**.
7. Uji rebutan kursi: di denah, pilih kursi lalu tekan **Uji rebutan kursi** (tombol demo di pojok denah). Pembeli
   simulasi menekan *Hayu ngiring* untuk kursi yang sama sepersekian detik lebih dulu → kamu dapat pesan bentrok +
   saran kursi terdekat → **Pindah ke kursi saran**. Kursi yang ditahan di satu tab juga langsung berubah status di tab
   lain tanpa reload.

8. Fitur tambahan, kalau masih ada waktu:
   - **Daftar tunggu**: *Kids Holiday Craft Class* → Sesi 1 (habis) → **Masuk daftar tunggu**. Urutanmu tampil di **Akun**,
     dan kamu dikabari lewat WA (simulasi) begitu ada tempat lepas.
   - **Kelola pesanan**: dari status pesanan yang sudah lunas → **Ubah nama peserta** atau **Batalkan tiket** (refund simulasi,
     sampai 24 jam sebelum sesi).
   - **Baca struk otomatis**: di Tukar Struk → *Atau coba baca otomatis dari foto struk contoh* → **Baca otomatis dari foto**.
   - **Bonus**: VIP Sangkuriang memberi foto bareng pemeran untuk 20 tiket pertama tiap sesi. Tandanya ada di e-ticket dan di layar
     scan petugas.
   - **Panitia → Petugas**: tambah dan nonaktifkan akun petugas. **Petugas → Verifikasi struk di desk**: setujui struk kertas di meja.
   - **Akun → Pasang di HP**: pasang ke layar utama dan nyalakan notifikasi.

Tombol **Reset data demo** (halaman awal atau menu *Demo*) mengembalikan semua data contoh. Pakai ini juga kalau antrean
struk contoh sudah kosong: pesanan contoh ikut kedaluwarsa setelah 30 menit, sama seperti pesanan sungguhan.

**Batas mode mock:** data tersimpan per browser. Dua tab di browser yang sama berbagi data (status kursi sinkron), tapi
dua HP berbeda punya data masing-masing. Uji rebutan kursi antar-HP sungguhan butuh backend (`VITE_API_URL`) dan bisa
diuji beban dengan `qa/k6-hold-race.js`.

## Pemetaan technical brief → fitur

| Persyaratan brief | Di Summarevent |
| --- | --- |
| Melihat informasi acara, jadwal, lokasi, pilihan tiket | Beranda + detail event: sesi, venue, kategori + harga + cara dapat, syarat checklist |
| Mendaftar dengan mengisi data peserta | Login HP + OTP (simulasi), nama pemesan, nama per kursi |
| Memilih kategori tiket dan kursi melalui denah yang menampilkan ketersediaan | Denah interaktif (zoom per kategori), legenda Tersedia / Pilihanmu / Sedang dipesan / Terjual / Tidak dijual, pilih otomatis N kursi berdampingan |
| Ringkasan pesanan, harga, status sebelum lanjut | Ringkasan di bawah denah dan di checkout (kursi, kategori, total, status, hitung mundur) |
| Pembayaran / simulasi konfirmasi pembayaran | QRIS / VA simulasi (berhasil / gagal / waktu habis), idempotency key; atau tukar struk; atau gratis |
| E-ticket QR setelah terkonfirmasi | Pass Saya: 1 kursi = 1 QR bertanda tangan HMAC |
| Pengingat dan informasi acara | Kotak pesan WA/email simulasi + pengingat H-1 terjadwal |
| Panitia mengatur acara, jenis tiket, harga, kuota, denah kursi, periode penjualan | Wizard event: Info → Kategori (harga, kuota, periode jual, aturan struk) → Denah (template baris × kursi, lorong, blokir, prioritas) → Sesi → Publish |
| Mengelola data peserta dan status pembayaran | Pesanan & peserta: filter status, detail, tandai lunas, batalkan |
| Memantau kursi tersedia / dipesan / terjual | Peta kursi live per sesi + hitungan per kategori, refresh 3 detik |
| Validasi QR saat check-in, status kehadiran | Scanner petugas: Valid / Sudah digunakan / Tidak valid (+ kuning: sesi lain / di luar jam), cari manual, check-in satu pesanan sekaligus |
| Pantau pendaftar, tiket terjual, transaksi, kehadiran | Dashboard: KPI, per sesi (okupansi 70%/90%), per kategori, transaksi per status, tenant teratas |
| Unduh data peserta dan laporan transaksi | CSV peserta & transaksi |
| Status kursi & tiket konsisten; cegah pemesanan ganda | Satu kosakata status di semua layar; hold atomik all-or-nothing, cek ulang saat konfirmasi, satu tiket aktif per kursi, idempotency key; dijelaskan di app (*Kenapa satu kursi tidak bisa terjual dua kali?* di denah, kartu di Peta kursi live) dan diuji `npm test` (100 request bersamaan → 1 berhasil) |
| Pembatalan, refund, perubahan data peserta (fitur tambahan) | Batalkan tiket sampai 24 jam sebelum sesi dengan refund simulasi, ubah nama peserta sampai sesi selesai, panitia bisa membatalkan + refund |
| Daftar tunggu, ringkasan penjualan (fitur tambahan) | Daftar tunggu per kategori yang habis (urutan + kabar WA otomatis saat ada tempat lepas), dashboard penjualan per kategori/sesi |
| Antarmuka nyaman dari ponsel | Mobile-first 390 px, target sentuh ≥ 44 px, PWA (manifest + service worker) |
| Pendukung lain (P1 PRD) | Bonus N pembeli pertama (tampil di e-ticket dan layar scan), verifikasi struk di desk oleh petugas, kelola akun petugas, baca struk otomatis (OCR di browser), pasang ke layar utama + notifikasi perangkat (simulasi Web Push) |
| Pembayaran, notifikasi, data simulasi | Semua simulasi; data contoh fiktif; struk contoh bertanda "STRUK CONTOH" |

## Struktur

```
frontend/src
  api/          contract.ts (kontrak), http.ts (backend asli), mock/ (db, seed, adapter)
  domain/       types, labels (satu kosakata status), rules (aturan bisnis murni), qr (token HMAC)
  components/   seatmap/ (denah), common/ (brand, badge, countdown, poster), ui/ (shadcn)
  pages/        visitor/, admin/, staff/, RolePicker
docs/           PRD, brief, kontrak API, brand
qa/             k6-hold-race.js (uji rebutan kursi untuk backend)
```

## Deploy

Vercel/Netlify: root directory `frontend`, build `npm run build`, output `dist` (rewrite SPA sudah disiapkan di
`vercel.json` dan `public/_redirects`). HTTPS wajib supaya kamera scanner jalan di HP. Setelah deploy, cek link dari
mode incognito.

## Catatan

- Logo Summarevent final: konsep C "Lorong", kit lengkap di `docs/brand/final/`, aturan pakai di
  `frontend/public/brand/README.md`. Konsep putaran 1 dan 2 tetap disimpan di `docs/brand/` dan `docs/brand/v2/`.
- Logo SUMMABA resmi sudah terpasang (`frontend/public/brand/summaba-logo.png`, file dari tim).
- Warna brand diambil dari logo resmi Summarecon: hijau `#006426`, oranye `#F26F22`, kuning `#FEDC01`.
- Semua nama orang, tenant, nomor HP, dan struk adalah data contoh.
