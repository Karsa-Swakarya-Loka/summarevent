# Summarevent · Frontend

PWA React + Vite + TypeScript (Tailwind, shadcn/ui). Gambaran produk, skrip demo, dan pemetaan brief ada di
[README utama](../README.md); kontrak API di [`docs/API-CONTRACT.md`](../docs/API-CONTRACT.md).

```bash
npm install
npm run dev        # http://localhost:5173, versi demo (data contoh di browser, tanpa server)
npm test           # unit test logika inti
npm run typecheck && npm run lint
npm run e2e        # suite end-to-end di Chrome (dev server harus jalan), lihat e2e/README.md
npm run build      # build produksi ke dist/
```

## Demo atau live

Tanpa konfigurasi, app memakai **mock di browser** (`src/api/mock`): data contoh di localStorage, transaksi
atomik antar-tab lewat Web Locks. Mode live memakai backend lewat HTTP dengan kontrak yang sama
(`src/api/http.ts`). Backend dikerjakan tim backend; frontend cukup diberi alamatnya saat build.

| Variabel (build) | Fungsi |
| --- | --- |
| `VITE_API_URL` | Alamat API backend. Kalau diisi, app selalu memakai mode live. |
| `VITE_LIVE_HOSTS` | Host yang otomatis memakai mode live dengan API di `/api` host itu sendiri (default `summarevent-live.vercel.app`). |
| `VITE_LIVE_URL` | Alamat versi live. Kalau diisi, halaman awal versi demo mengecek `/api/health`-nya dan menampilkan tautan "Buka versi live" saat sehat. Kosong: tidak ada pengecekan. |
| `VITE_DEMO_URL` | Alamat versi demo untuk tautan balik dari versi live (default `https://summarevent.vercel.app`). |

## Struktur

```
src/api/        contract.ts (kontrak), http.ts (klien backend), mock/ (driver data, seed, logika inti)
src/domain/     tipe, label status (satu kosakata), aturan bisnis murni, token QR
src/components/ seatmap/ (denah), common/, visitor/, admin/, staff/, ui/ (shadcn)
src/pages/      visitor/, admin/, staff/, RolePicker
public/         ikon PWA, manifest, service worker, og.png (pratinjau link), brand/
e2e/            uji end-to-end (playwright-core + Chrome terpasang)
```

Denah kursi (`src/components/seatmap/SeatMap.tsx`): memilih kategori memperbesar denah ke baris kategori itu
sampai jarak antar-kursi 44 px di layar (target sentuh, PRD §13–14); kursi hasil "Pilihkan N kursi" atau kursi
saran dibawa ke tengah; tombol zoom ada di bawah denah supaya tidak menutupi kursi.
