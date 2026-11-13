<!-- markdownlint-disable MD013 -->

# Panduan tes tim

Cara menguji Summarevent sesuai peran masing-masing: **Shelvia** untuk user testing dan UX, **Said** untuk QA sistem, **Awwal** untuk demo dan pitch. Semua bisa dikerjakan dari HP atau laptop, tanpa memasang apa pun, kecuali tes otomatis QA.

## Sebelum mulai

### Dua alamat

| Alamat | Datanya | Pakai untuk |
| --- | --- | --- |
| [summarevent.vercel.app](https://summarevent.vercel.app) | Bersama, di server Convex. Semua HP melihat data yang sama. | Link utama untuk juri, demo, uji dua HP: rebutan kursi, struk disetujui panitia di laptop lain, scan petugas di HP lain |
| [summarevent-live.vercel.app](https://summarevent-live.vercel.app) | Sama dengan link utama (alamat lama, tetap jalan). | Uji terima otomatis |
| [summarevent-cadangan.vercel.app](https://summarevent-cadangan.vercel.app) | Per browser. Tiap HP dan laptop punya data contohnya sendiri. | Cadangan kalau server atau Wi-Fi bermasalah, tes sendiri tanpa mengganggu data bersama |

Halaman awal punya satu pintu masuk: tiap poster peran berisi **Masuk sebagai …** (langsung ke halaman masuk) dan **Daftar sebagai …** (pengenalan dulu, lalu daftar). Badge di pojok kiri atas hanya penanda: **live** di link utama, **demo** di versi cadangan.

### Akun

| Peran | Cara masuk |
| --- | --- |
| Pengunjung | Nomor HP apa saja yang diawali 08. Kode OTP muncul di layar, tekan **Isi otomatis**. |
| Pengunjung contoh (Rina) | Halaman awal → poster Pengunjung → **Masuk sebagai pengunjung** → **Akun contoh** → **Masuk**. Akunnya sudah punya e-ticket, struk yang sedang dicek, dan pesan. |
| Panitia | `panitia@summarevent.test`, kata sandi `summaba2026`, atau tekan **Isi otomatis** |
| Petugas | `desk.atrium@summarevent.test`, `pintu.utara@summarevent.test`, atau `atrium.cibadak@summarevent.test`, kata sandi `summaba2026` |

Tombol **Pintasan** (di app bar, sidebar panitia, atau beranda petugas) memindahkan langsung ke peran lain dengan akun contoh dan bisa mereset data.

### Data contoh

| Event | Gunanya untuk tes |
| --- | --- |
| Pentas Musikal Keluarga "Sangkuriang", Atrium Ciunik | Denah kursi dengan empat kategori: **VIP**, **Tukar Struk** (belanja minimal Rp300.000), **Reguler**, dan **Festival** (gratis, tanpa nomor kursi). **Sesi Hari Ini** selalu berlangsung, jadi bisa dipakai scan kapan saja. **Sesi 1** belum membuka check-in. |
| Kids Holiday Craft Class, Atrium Cileutik | Tanpa nomor kursi, tukar struk, dan sesi 1 sudah penuh (daftar tunggu) |
| Konser Akustik Sawarga, Sawarga Courtyard | Kursi bernomor, satu sesi |
| Pameran Kriya Bandung, Atrium Cibadak | Masuk bebas, tanpa tiket |

Yang disimulasikan: pembayaran QRIS dan Virtual Account, OTP, serta WhatsApp dan email (semuanya muncul di tab **Pesan**). Di layar scan, **Alat uji** menggantikan HP kedua.

### Mulai dari awal

- Halaman awal → menu **☰** → **Reset data contoh**. Di link utama ini menghapus data **semua orang**, jadi kabari tim dulu. Di versi cadangan hanya data browser itu yang terhapus.
- Untuk melihat splash dan pengenalan seperti pengunjung baru, buka link di jendela penyamaran (incognito).

### Kode yang dipakai saat melapor

Kode pesanan diawali `SEV-`, kode tiket diawali `TKT-`. Keduanya ada di layar status pesanan, e-ticket, dan panel detail panitia.

---

## Shelvia: user testing dan UX

Tujuannya melihat apakah orang yang belum pernah memakai Summarevent bisa menyelesaikan tugas sendiri, dan di mana mereka ragu atau salah ketuk.

### Persiapan

- Siapkan minimal satu Android layar kecil (360 px) dan satu iPhone. Pakai versi cadangan di jendela penyamaran supaya tiap peserta mulai dari awal dengan datanya sendiri.
- Minta izin merekam layar dan suara. Siapkan stopwatch dan lembar catatan.
- Jangan sebut nama tombol saat memberi tugas. Biarkan peserta mencari sendiri.

### Pembuka untuk peserta

> Kami sedang menguji aplikasinya, bukan kamu. Tidak ada jawaban salah. Sambil mencoba, ceritakan apa yang kamu pikirkan dan cari. Kalau macet, bilang saja; saya baru membantu kalau kamu minta.

### Tugas pengunjung

| No | Kalimat untuk peserta | Selesai kalau |
| --- | --- | --- |
| P1 | "Kamu mau nonton Pentas Musikal Sangkuriang hari Sabtu jam 16.00 berdua. Pesan dua kursi yang bersebelahan, lalu bayar." | E-ticket terbuka |
| P2 | "Kamu sudah sampai di pintu masuk. Tunjukkan tiketmu ke petugas." | QR tampil besar |
| P3 | "Daftarkan dirimu dan dua teman ke area Festival, yang gratis." | Tertulis **Tiketmu siap** |
| P4 | "Kamu punya struk belanja hari ini. Tukarkan dengan dua kursi kategori Tukar Struk. Struknya ada di kotak **Coba tanpa struk asli**." | Tertulis **Struk dicek panitia** |
| P5 | "Kids Holiday Craft Class sesi 1 sudah penuh. Usahakan supaya kamu dikabari kalau ada tempat." | Masuk daftar tunggu |
| P6 | "Ganti nama di salah satu tiketmu jadi nama temanmu." | Tertulis **Nama peserta diperbarui** |
| P7 | "Kamu batal datang. Batalkan pesananmu." | Tertulis **Pesanan dibatalkan** dan jumlah refund |
| P8 | Di versi live, dua peserta dengan dua HP: "Kalian berdua pilih kursi yang sama, lalu pesan." | Satu berhasil, satu langsung ditawari kursi terdekat |

### Tugas panitia (kalau pesertanya dari EO atau pengelola mal)

| No | Kalimat untuk peserta | Selesai kalau |
| --- | --- | --- |
| A1 | "Buat event baru dengan dua kategori tiket dan dua sesi, lalu terbitkan." Catat waktunya; target PRD di bawah 5 menit. | Tertulis **Event dipublikasikan!** |
| A2 | "Ada struk yang menunggu. Setujui satu, dan minta yang kurang lengkap diperbaiki." | Kedua struk keluar dari antrean |
| A3 | "Bayu bilang sudah bayar di desk. Cari pesanannya dan tandai lunas." | E-ticket Bayu terbit |

### Tugas petugas

| No | Kalimat untuk peserta | Selesai kalau |
| --- | --- | --- |
| S1 | "Periksa tiket pengunjung di pintu. Pakai tiket contoh di Alat uji." | Layar hijau **Valid** |
| S2 | "Pengunjung yang sama mencoba masuk lagi." | Layar merah **Sudah digunakan** |
| S3 | "QR Rina rusak. Masukkan dia tanpa scan." | Rina check-in lewat **Cari manual** |

### Catat untuk tiap tugas

- Berhasil sendiri, berhasil dengan bantuan, atau tidak berhasil.
- Waktu dari tugas dibacakan sampai selesai.
- Ketukan yang salah dan di layar mana peserta ragu.
- Kalimat peserta yang menarik, apa adanya.
- Nilai kemudahan dari peserta, 1 (sangat sulit) sampai 7 (sangat mudah).

### Pertanyaan penutup

1. Bagian mana yang paling membingungkan?
2. Ada kata atau tombol yang maksudnya tidak jelas?
3. Mau memakai ini untuk event berikutnya di SUMMABA? Kenapa?

Reset data contoh sebelum peserta berikutnya.

### Melapor

Satu temuan per issue di GitHub dengan label `enhancement` dan judul diawali `UX:`. Isinya: nomor tugas, perangkat, apa yang terjadi, screenshot atau potongan rekaman, dan berapa peserta yang mengalaminya. Repo ini publik, jadi **jangan tulis nama, nomor HP, atau wajah peserta**. Ringkasan semua temuan dikirim ke Haikal untuk daftar perbaikan.

---

## Said: QA sistem

Tujuannya memastikan setiap aturan berjalan benar di ketiga peran, tidak ada error, dan tampilan tidak rusak di HP kecil.

### Tes otomatis

Butuh Node.js 22.12 atau lebih baru dan Google Chrome.

```sh
git clone https://github.com/Karsa-Swakarya-Loka/summarevent.git
cd summarevent/frontend
npm install
npm run typecheck && npm run lint && npm test                  # tipe, lint, unit test
BASE=https://summarevent-cadangan.vercel.app npm run e2e        # 9 suite end-to-end + aksesibilitas di versi cadangan
cd ../backend && npm install && npm test && npm run check-domain # unit test backend, aturan sama dengan frontend
```

`npm run e2e` di versi cadangan aman dijalankan kapan saja, karena tiap suite membuka browser baru dengan data sendiri. Hasilnya PASS atau FAIL per suite, dan screenshot tersimpan di `frontend/e2e/out/`. Isi tiap suite ada di [uji end-to-end](../frontend/e2e/README.md).

Uji terima di link utama (alamat live) memakai backend bersama dan **mereset datanya**, jadi jalankan hanya setelah tim dikabari:

```sh
BASE=https://summarevent-live.vercel.app API_URL=https://good-gnu-186.convex.site/api npm run e2e
```

### Cek manual

| Area | Langkah | Hasil yang benar |
| --- | --- | --- |
| Rebutan kursi | Versi live, dua browser, kursi yang sama, tekan **Pesan** hampir bersamaan | Hanya satu yang berhasil. Yang lain melihat "baru saja dipilih orang lain" dan saran kursi terdekat. |
| Waktu tahan | Di checkout, **Simulasi → Waktu habis** | Tertulis **Waktu tahan habis**, kursinya kembali **Tersedia** di denah |
| Pembayaran | **Bayar gagal**, lalu bayar lagi, lalu ketuk **Bayar** dua kali cepat | Gagal tidak menerbitkan tiket. Ketukan ganda tetap satu pembayaran. |
| Tukar struk | Struk di bawah Rp300.000, struk Bazaar Atrium, tanggal kemarin, jam setelah 22.00, nomor struk yang sama dua kali, struk keempat | Tiap kasus ditolak dengan alasannya, dan **Kirim struk** tidak aktif |
| Gratis dan kuota | Festival melebihi sisa tempat | Diminta mengurangi jumlah orang |
| Daftar tunggu | Kids Holiday sesi 1 | Masuk dan keluar daftar tunggu berhasil, posisi tampil di Akun |
| Batal dan ubah nama | Batalkan pesanan lunas, ubah nama tiket yang sudah check-in | Refund penuh sampai 24 jam sebelum sesi. Nama tiket yang sudah check-in tidak bisa diubah. |
| Check-in | Alat uji: tiket contoh, scan ulang, QR palsu, tiket sesi lain, lalu Sesi 1 | **Valid**, **Sudah digunakan**, **Tidak valid**, **Sesi lain**, **Di luar jam check-in** |
| Rombongan | Valid untuk pesanan dua kursi | Tawaran **Masukkan juga 1 tiket lain** berhasil |
| Offline | Versi live, HP petugas mode pesawat saat scan, lalu online lagi | Scan tetap jalan, antrean terkirim. Tiket yang lebih dulu masuk lewat pintu lain muncul sebagai konflik. |
| Panitia | Tolak atau minta revisi struk tanpa alasan, **Tandai lunas** | Alasan wajib. Tandai lunas meminta konfirmasi dulu. |
| Cek silang AI | Pengunjung: **Isi struk contoh**, lalu ubah **Nominal** jadi Rp900.000 dan **Kirim struk**. Panitia: **Verifikasi struk** → buka struk itu → **Bandingkan foto dengan isian** | Nominal ditandai **Beda**, bagian lain **Sama**. Pertama kali butuh internet untuk mengunduh model baca. |
| Isi cepat dengan AI | Panitia → **Buat event**. Di kartu **Isi cepat dengan AI** tulis "Mau bikin Bandung Kids Fest" saja, **Kirim**, lalu jawab pertanyaannya. Coba juga satu pesan lengkap: "Bandung Kids Fest di Atrium Cibadak, kursi bernomor, Sabtu 28 November jam 10–12 dan 15–17, VIP 100 ribu, Reguler 50 ribu, Tukar Struk min belanja 300 ribu, sekitar 200 orang", lalu koreksi "ganti venue ke Atrium Ciunik" | AI menanyakan semua yang kurang sekaligus dan menerima koreksi. Setelah lengkap, Info, Kategori, Denah, dan Sesi terisi dan event bisa langsung dipublikasikan. Tanpa `GEMINI_API_KEY` di Vercel muncul "Asisten AI belum dipasang". |
| CSV | Di status pesanan, **Ubah nama peserta** jadi `=1+1`. Lalu panitia **Unduh data peserta** dan buka di Excel atau Sheets. | Tampil sebagai teks berawalan tanda petik, bukan angka 2 |
| Akses | Buka `/admin` dan `/staff` tanpa masuk. Masuk dengan sandi salah. Coba lupa sandi untuk email yang tidak ada. | Diarahkan ke halaman masuk. Pesan salahnya sama untuk email dan sandi. Lupa sandi tidak memberi tahu email itu terdaftar atau tidak. |
| Petugas nonaktif | Panitia → Petugas → **Nonaktifkan**, lalu petugas itu masuk | Ditolak |
| Gambar poster | Panitia → **Event** → **Edit** → **Unggah gambar poster** (foto dari HP juga boleh) → **Simpan perubahan**, lalu buka Beranda pengunjung. Ulangi dengan **Ganti gambar** dan **Hapus gambar**. Seret juga satu file PDF ke kotak unggahnya. | Gambar tampil di daftar event dan halaman event; e-ticket tetap memakai warna tema. Setelah dihapus, poster kembali digambar dari tema. PDF ditolak: **Pilih gambar JPG, PNG, atau WebP.** |
| Tampilan | Semua layar di HP 360 px dan laptop | Tidak bisa digeser ke samping, tidak ada tombol yang tertutup atau terpotong |
| Konsol | Buka DevTools di laptop | Tidak ada error merah |

### Melapor bug

Satu bug per issue di GitHub dengan label `bug`. Isinya: alamat (utama atau cadangan), perangkat dan browser, langkah sampai bug muncul, hasil yang diharapkan, hasil yang terjadi, kode `SEV-` atau `TKT-` kalau ada, dan screenshot.

---

## Awwal: demo dan pitch

Tujuannya menunjukkan inti lomba, yaitu pemilihan kursi dan pencegahan pesanan ganda, dalam lima menit, ditambah sisi panitia dan petugas.

### Link untuk juri

- **Utama:** [summarevent.vercel.app](https://summarevent.vercel.app). Terhubung ke server, jadi dua HP juri bisa berebut kursi yang sama dan melihat hasilnya langsung.
- **Cadangan:** [summarevent-cadangan.vercel.app](https://summarevent-cadangan.vercel.app). Data di browser masing-masing, tanpa server. Pakai kalau Wi-Fi atau server bermasalah saat presentasi.

### Alur demo lima menit

Jalur paling cepat kalau waktunya mepet: halaman awal → **Masuk sebagai pengunjung** → **Akun contoh** → **Masuk** (Rina). Tanpa pengenalan dan tanpa OTP, akunnya sudah punya e-ticket.

| Menit | Yang ditunjukkan | Yang ditekankan |
| --- | --- | --- |
| 0–1 | Halaman awal → **Daftar sebagai pengunjung** → **Lewati** pengenalan → daftar dengan nama dan nomor HP (OTP simulasi, **Isi otomatis**) → Pentas Musikal Sangkuriang sesi 16.00 → **Reguler** → **Pilihkan 2 kursi berdampingan** → **Pesan 2 kursi** | Kursi dipilih langsung dari denah dan ditahan 10 menit |
| 1–2 | **Bayar Rp100.000** (simulasi) → **Lihat e-ticket** | Satu QR bertanda tangan untuk tiap kursi, tersimpan di Pass Saya |
| 2–3 | Kembali ke denah → **Uji rebutan kursi** → saran kursi terdekat, lalu **Kenapa satu kursi tidak bisa terjual dua kali?** | Pencegahan pesanan ganda: kursi ditahan sekaligus, terlihat oleh semua, dicek ulang saat konfirmasi |
| 3–4 | Kategori **Tukar Struk** → **Isi struk contoh** → **Kirim struk** → **Pintasan → Masuk sebagai Panitia** → **Verifikasi struk** → **Bandingkan foto dengan isian** → **Setujui** | Belanja di tenant SUMMABA bisa jadi tiket. AI membaca foto struk dan mencocokkannya dengan isian, lalu panitia memutuskan |
| 4–5 | Panitia: dashboard dan peta kursi live. Lalu **Pintasan → Masuk sebagai Petugas** → **Sesi Hari Ini** → **Mulai scan** → **Alat uji** → **Ambil tiket contoh** → **Valid**, lalu **Scan ulang tiket tadi** → **Sudah digunakan** | Satu sistem untuk tiga peran, dan hasil scan terbaca dari satu meter |

### Angka untuk slide

| Angka | Sumber |
| --- | --- |
| 111 unit test logika inti, 23 tes backend, 9 suite end-to-end | `npm test` di `frontend/` dan `backend/`, `npm run e2e` |
| 61 layar lolos WCAG 2.1 AA, semua target sentuh di HP minimal 44 px | Suite `a11y.mjs` |
| Lighthouse HP: performa 90–92, aksesibilitas dan best practices 100 | Build produksi, simulasi HP lambat |
| Muatan awal halaman 274 KB (gzip) | Build produksi |

### Untuk deck dan PRD

- Microcopy bahasa Sunda sudah dihapus. Semua teks sekarang bahasa Indonesia biasa, supaya pengunjung dari mana pun paham.
- Link utama sudah tersambung ke backend Convex, jadi bisa dipakai untuk uji dua HP.
- Yang disimulasikan dan perlu disebut ke juri: pembayaran, OTP, serta WhatsApp dan email. Kode OTP dan akun contoh masih tampil di layar. Sebelum dipakai sungguhan, OTP harus dikirim lewat WhatsApp atau SMS, dan login akun contoh dimatikan.
