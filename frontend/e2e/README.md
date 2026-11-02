# Uji end-to-end

Skrip ini menjalankan alur nyata di Chrome (headless) lewat `playwright-core`, memakai Chrome yang sudah
terpasang. Setiap skrip mulai dari profil browser baru, jadi data demo selalu segar.

```bash
npm run dev          # terminal 1
npm run e2e          # terminal 2: semua suite, hasil PASS/FAIL per suite
node e2e/visitor.mjs conflict   # satu alur saja
BASE=https://alamat-deploy npm run e2e   # uji hasil deploy
```

| Suite | Yang diuji |
| --- | --- |
| `visitor.mjs` | Bayar (gagal lalu berhasil) sampai 2 e-ticket di Pass Saya, tukar struk, Festival gratis, uji rebutan kursi + saran kursi, penjelasan pesan dobel, waktu habis, daftar tunggu, ubah nama + batal + refund, bonus, baca struk otomatis (OCR, butuh internet untuk model) |
| `admin.mjs` | Setujui struk, minta revisi, tandai lunas, unduh 2 CSV (cek BOM dan isi), peta kursi live, layar laptop dan HP |
| `wizard.mjs` | Buat event bernomor kursi (2 kategori, preset tukar struk, denah 6×10, 1 kursi diblokir, 2 sesi), publish, buka di app pengunjung |
| `staff.mjs` | Valid, Sudah digunakan, Tidak valid, Sesi lain, Di luar jam check-in, cari manual, check-in rombongan, fallback kamera |
| `staff-admin-p1.mjs` | Panitia menambah dan menonaktifkan akun petugas, petugas menyetujui struk di desk, ganti akun petugas |

Variabel: `BASE` (alamat app), `E2E_OUT` (folder screenshot, default `e2e/out/`, tidak masuk git),
`CHROME_PATH` (lokasi Chrome kalau bukan bawaan macOS). Suite gagal kalau ada error di console browser.
