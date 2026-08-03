# 07 — AUDIT FRONTEND / UI / UX

## 7.1 Skala

| Metrik | Nilai |
|---|---:|
| Halaman (`page.tsx`) | **59** |
| Komponen (`components/*.tsx`) | **36** |
| LOC web | 87.696 |
| File memakai `@/lib/api` | 82 |
| Halaman dengan `useEffect` (fetch tersebar) | **56 / 59** |

## 7.2 Kepatuhan design system — pelanggaran terbesar

| Cek | Hasil |
|---|---:|
| Literal hex (`#rrggbb`) di `app/` + `components/` | **1.039 kemunculan** |
| File yang mengandung literal hex | **60** |
| Font | ✅ `Bricolage_Grotesque` + `Plus_Jakarta_Sans` di `layout.tsx:2` — **patuh**, nol Inter/Roboto |

**1.039 literal hex di 60 file** adalah temuan kualitas frontend terbesar. Token desain
ada di `globals.css` (Tailwind v4 `@theme`), tetapi tidak ditegakkan. Konsekuensinya
langsung ke visi: **dark mode, theming per-tenant (white-label SaaS), dan konsistensi
visual mustahil dicapai selama warna dipaku di 60 berkas.** **P1.**

## 7.3 Kelengkapan state per halaman

| State | Halaman memuat | Dari 59 |
|---|---:|---:|
| `loading` | 43 | 73% |
| `error` | 40 | 68% |
| empty ("Belum ada"/"Tidak ada"/"kosong") | 51 | 86% |
| `skeleton` | **6** | **10%** |

Empty state justru paling terlayani (86%) — tidak biasa dan patut dipuji. Yang bolong:
**~16 halaman tanpa penanganan loading** dan **19 tanpa penanganan error**, serta
skeleton hampir absen. `BELUM DIVERIFIKASI` — pemetaan halaman-per-halaman tidak dibuat;
angka di atas berbasis kehadiran kata kunci, bukan pembacaan tiap berkas.

## 7.4 Arsitektur data fetching

**56 dari 59 halaman memakai `useEffect`** untuk fetch. Tidak ada React Query / SWR /
server component data layer yang terdeteksi. Konsekuensi:
- Tidak ada cache bersama → fetch waterfall & refetch berulang antar navigasi
- Tidak ada dedup request, retry, atau optimistic update terpusat
- Tiap halaman menemukan ulang pola loading/error-nya sendiri — menjelaskan
  ketidakseragaman di §7.3

Ini adalah **penghalang arsitektural utama** menuju UX "immersive" (lihat `09-VISION-GAP.md`).

## 7.5 Belum diverifikasi

Seluruh butir berikut **BELUM DIVERIFIKASI** — memerlukan render nyata atau pembacaan
per-komponen yang melampaui anggaran sesi:
- Aksesibilitas (kontras, focus ring, label form, aria modal, `alt`) — **tidak dijalankan**
  meski `a11y-audit` tersedia, karena butuh menjalankan aplikasi (di luar read-only aman)
- Responsivitas per breakpoint
- Ukuran bundle, memoization tabel besar, optimasi gambar
- Jumlah varian tombol/modal/tabel

## 7.6 Penilaian jujur "immersive"

Jarak ke standar Linear/Notion/Stripe **masih jauh**. Sepuluh hal konkret:

1. **1.039 warna ter-hardcode** → tak ada tema tunggal yang bisa digeser.
2. **Skeleton hanya di 10% halaman** → transisi terasa patah, bukan mengalir.
3. **`useEffect` di 56/59 halaman** → tiap pindah halaman memuat ulang dari nol; Linear terasa instan justru karena cache + prefetch.
4. **Tidak ada optimistic update** terdeteksi → tiap aksi menunggu server.
5. **Tidak ada realtime** (Supabase Realtime tak terdeteksi dipakai) → kolaborasi multi-user tak terasa hidup.
6. **Command palette ada** (`command-palette.tsx`, Ctrl+K) ✅ — satu-satunya elemen keyboard-first yang nyata.
7. **Tak ada keyboard shortcut** di luar Ctrl+K (tak ada `j/k`, `g+d`, `Cmd+Enter`).
8. **Tak ada offline capability** untuk lapangan — kritis untuk konteks konstruksi.
9. **19 halaman tanpa error state** → kegagalan tampil sebagai layar kosong.
10. **Tak ada motion system** — `ui-animation` tak tercermin; transisi halaman/daftar tak dirancang.

Yang sudah benar dan jangan diremehkan: **font non-generik** (Bricolage Grotesque +
Plus Jakarta Sans, bukan Inter/Roboto default), **command palette**, dan **empty state 86%**.
