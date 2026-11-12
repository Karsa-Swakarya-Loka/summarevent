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
| `onboarding.mjs` | Kunjungan pertama tiap role: splash web muncul sekali per sesi, lalu splash berlabel Pengunjung, Panitia, dan Petugas saat role dimasuki, dan tidak muncul lagi di sesi yang sama. Pengenalan tiga langkah pengunjung dan daftar akun dengan OTP simulasi sampai Beranda menampilkan akunnya. Panitia: pengenalan, kata sandi salah ditolak, lupa kata sandi → link reset (simulasi) → sandi pendek ditolak → sandi baru → masuk, lalu masuk lagi dengan sandi baru. Petugas dari halaman awal: pengenalan dilewati, masuk, sampai berandanya. Dengan reduced motion splash hilang dalam 2 detik setelah halaman tiba. Slide tim: panah pindah antar anggota tanpa scroll. Kipas poster: yang di-hover dan yang dibuka tetap utuh di bawah notch di empat ukuran layar. Suite lain mulai dari setelah pengenalan dan masuk sebagai panitia atau petugas lewat layar login (`skip-intro.mjs`) |
| `visitor.mjs` | Bayar (gagal lalu berhasil) sampai e-ticket terbuka di layarnya sendiri dan 2 e-ticket di Pass Saya, tukar struk, Festival gratis, uji rebutan kursi + saran kursi, penjelasan pesan dobel, waktu habis, daftar tunggu, ubah nama + batal + refund, bonus, edit profil (email salah dan email yang sudah dipakai ditolak, foto profil dipasang lalu dihapus), baca struk otomatis (OCR, butuh internet untuk model) |
| `admin.mjs` | Dashboard (semua kartu ada, filter status dan halaman tabel pesanan, pohon pilih event memindahkan dashboard ke event lain dan sesi membuka peta kursi live, ⌘K membuka pesanan), setujui struk, minta revisi, tandai lunas, unduh 2 CSV (cek BOM dan isi), peta kursi live, layar laptop dan HP |
| `wizard.mjs` | Buat event bernomor kursi (gambar dan warna poster sendiri, 2 kategori, preset tukar struk, denah 6×10, 1 kursi diblokir, 2 sesi), publish, buka di app pengunjung, lalu cek gambar poster di kartu event dan warna poster di halaman event. Kategori yang penjualannya baru dibuka 3 hari lagi menonaktifkan tombol Pesan dan menyebut tanggalnya (QA-11) |
| `staff.mjs` | Valid, Sudah digunakan, Tidak valid, Sesi lain, Di luar jam check-in, cari manual, check-in rombongan, fallback kamera. Setelah tiketnya dipindai, Pass Saya Rina menampilkan "Terima kasih sudah datang" |
| `staff-admin-p1.mjs` | Panitia menambah dan menonaktifkan akun petugas, petugas menyetujui struk di desk, ganti akun petugas dari kotak Demo |
| `a11y.mjs` | axe-core (WCAG 2.1 A + AA) di 58 layar ketiga peran, termasuk pengenalan dan login tiap role (juga langkah OTP dan error login, lupa dan reset kata sandi), halaman 404, menu demo, Festival, langkah bayar, form struk, Pass Saya dan tiket Rina, profil dan sheet edit profil, daftar dan isi pesan, hasil scan, wizard (termasuk warna poster), pohon pilih event, dan panel struk. Di HP 360 px setiap target sentuh minimal 44 px, kursi diukur setelah denah di-zoom |
| `offline.mjs` | Khusus backend (`API_URL`): sinyal putus, scan tetap jalan dari daftar tiket di HP, antrean terkirim saat online, tiket yang lebih dulu dipindai pintu lain muncul sebagai konflik |

## Dengan backend

Suite yang sama menjadi uji terima untuk backend yang mengikuti [kontrak API](../../docs/API-CONTRACT.md). Jalankan app
yang di-build dengan `VITE_API_URL`, lalu:

```sh
API_URL=https://alamat-backend/api BASE=https://alamat-app npm run e2e
```

Data di backend di-reset (`POST /demo/reset`) sebelum tiap suite, dan suite `offline.mjs` ikut dijalankan. Di mode ini
satu request bisa memakan setengah detik lebih, jadi suite menunggu elemen atau kondisinya, bukan jeda tetap; satu
suite yang dijalankan sendiri (tanpa `run-all`) perlu reset data dulu, karena suite sebelumnya mengubah database bersama.

Host live produksi (`summarevent-live.vercel.app`) adalah deployment yang sama dengan versi demo: `vercel.json` meneruskan `/api/*` di host itu ke Convex, dan `.env.production` menyebut host itu di `VITE_LIVE_HOSTS`, jadi `BASE=https://summarevent-live.vercel.app API_URL=https://good-gnu-186.convex.site/api npm run e2e` menguji produksi live. Perintah itu mereset data bersama yang juga dipakai tim, jadi kabari tim dulu.

Cek manual QA dan skrip user testing ada di [panduan tes tim](../../docs/PANDUAN-TES.md).

Variabel: `BASE` (alamat app, default `http://localhost:5173`), `API_URL` (backend), `E2E_OUT` (folder screenshot,
default `e2e/out/`, tidak masuk git), `CHROME_PATH` (lokasi Chrome kalau bukan bawaan macOS).
