# Summarevent · frontend

PWA React 19 + Vite + TypeScript untuk ketiga peran: pengunjung, panitia, dan petugas. Cara menjalankan, variabel build, arsitektur, dan gerbang mutu ada di [README utama](../README.md); kontrak dengan backend di [`docs/API-CONTRACT.md`](../docs/API-CONTRACT.md).

```sh
npm install
npm run dev        # http://localhost:5173
```

Skrip bantu, dengan `npm run dev` jalan:

| Perintah | Fungsi |
| --- | --- |
| `node scripts/shot.mjs /app /app/pass` | Screenshot cepat di HP 360 px (`--desktop` untuk laptop, `--base` untuk alamat lain) |
| `node scripts/readme-promo.mjs` | Membuat ulang gambar promo README di `docs/gambar/` (butuh `cwebp`) |
| `node scripts/og-image.mjs` | Membuat ulang `public/og.png`, gambar pratinjau link |
| `npx knip` | Mencari file, export, dan dependency yang tidak terpakai |
