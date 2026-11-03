# Uji end-to-end

Alur nyata di Chrome headless lewat `playwright-core`, memakai Chrome yang sudah terpasang. Setiap suite mulai dari
profil browser baru, jadi data demo selalu segar. Suite gagal kalau hasilnya tidak sesuai harapan, ada error di console
browser, atau layar bisa digeser ke samping.

```sh
npm run dev                              # terminal 1
npm run e2e                              # terminal 2: semua suite, hasil PASS/FAIL per suite
node e2e/visitor.mjs conflict            # satu alur saja
BASE=https://summarevent.vercel.app npm run e2e   # uji hasil deploy
```

| Suite | Yang diuji |
| --- | --- |
| `onboarding.mjs` | Kunjungan pertama tiap role: splash web muncul sekali per sesi, lalu splash berlabel Pengunjung, Panitia, dan Petugas saat role dimasuki, dan tidak muncul lagi di sesi yang sama. Pengenalan tiga langkah pengunjung dan daftar akun dengan OTP simulasi sampai Beranda menampilkan akunnya. Panitia: pengenalan, kata sandi salah ditolak, masuk dengan akun demo sampai dashboard. Petugas dari halaman awal: pengenalan dilewati, masuk, sampai berandanya. Dengan reduced motion splash hilang dalam 2 detik setelah halaman tiba. Suite lain mulai dari setelah pengenalan dan masuk sebagai panitia atau petugas lewat layar login (`skip-intro.mjs`) |
| `visitor.mjs` | Bayar (gagal lalu berhasil) sampai e-ticket terbuka di layarnya sendiri dan 2 e-ticket di Pass Saya, tukar struk, Festival gratis, uji rebutan kursi + saran kursi, penjelasan pesan dobel, waktu habis, daftar tunggu, ubah nama + batal + refund, bonus, baca struk otomatis (OCR, butuh internet untuk model) |
| `admin.mjs` | Setujui struk, minta revisi, tandai lunas, unduh 2 CSV (cek BOM dan isi), peta kursi live, layar laptop dan HP |
| `wizard.mjs` | Buat event bernomor kursi (2 kategori, preset tukar struk, denah 6×10, 1 kursi diblokir, 2 sesi), publish, buka di app pengunjung. Kategori yang penjualannya baru dibuka 3 hari lagi menonaktifkan Hayu ngiring dan menyebut tanggalnya (QA-11) |
| `staff.mjs` | Valid, Sudah digunakan, Tidak valid, Sesi lain, Di luar jam check-in, cari manual, check-in rombongan, fallback kamera. Setelah tiketnya dipindai, Pass Saya Rina menampilkan "Hatur nuhun!" |
| `staff-admin-p1.mjs` | Panitia menambah dan menonaktifkan akun petugas, petugas menyetujui struk di desk, ganti akun petugas |
| `a11y.mjs` | axe-core (WCAG 2.1 A + AA) di 48 layar ketiga peran, termasuk pengenalan dan login tiap role (juga langkah OTP dan error login), halaman 404, menu demo, Festival, langkah bayar, form struk, Pass Saya dan tiket Rina, daftar dan isi pesan, hasil scan, wizard, dan panel struk. Di HP 360 px setiap target sentuh minimal 44 px, kursi diukur setelah denah di-zoom |
| `offline.mjs` | Khusus backend (`API_URL`): sinyal putus, scan tetap jalan dari daftar tiket di HP, antrean terkirim saat online, tiket yang lebih dulu dipindai pintu lain muncul sebagai konflik |

## Dengan backend

Suite yang sama menjadi uji terima untuk backend yang mengikuti [kontrak API](../../docs/API-CONTRACT.md). Jalankan app
yang di-build dengan `VITE_API_URL`, lalu:

```sh
API_URL=https://alamat-backend/api BASE=https://alamat-app npm run e2e
```

Data di backend di-reset (`POST /demo/reset`) sebelum tiap suite, dan suite `offline.mjs` ikut dijalankan.

Variabel: `BASE` (alamat app, default `http://localhost:5173`), `API_URL` (backend), `E2E_OUT` (folder screenshot,
default `e2e/out/`, tidak masuk git), `CHROME_PATH` (lokasi Chrome kalau bukan bawaan macOS).
