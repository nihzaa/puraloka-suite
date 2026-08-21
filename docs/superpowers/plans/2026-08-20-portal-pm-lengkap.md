# Portal PM Lengkap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal PM (`apps/web/app/pm-portal/*`) menjangkau seluruh 32 modul
permission role `pm` (bukan versi ringkas), dibungkus PWA installable,
dengan interaksi mobile-native (swipe-to-action, transisi arah-sadar).

**Architecture:** Tahap 0 membangun fondasi PWA (manifest dinamis
per-tenant, service worker diperluas, komponen swipe bersama). Tahap 1-7
menambah modul per kategori navigasi resmi (`lib/peta-menu.ts`), masing-masing
mengikuti pola yang sudah terbukti di 8 halaman PM existing: baca endpoint+
permission dari kode backend dulu, tulis tipe di `_bersama/tipe.ts`
diverifikasi ke bentuk respons nyata, tulis halaman pakai `useData`+komponen
portal bersama, verifikasi (typecheck, lint, penjaga CI, a11y) sebelum
commit.

**Tech Stack:** Next.js 16 App Router, TypeScript, Fastify API (existing),
`next/og` `ImageResponse` untuk ikon dinamis, CSS transitions untuk motion
(bukan JS animation library baru).

**Spec:** `docs/superpowers/specs/2026-08-20-portal-pm-lengkap-design.md`

## Global Constraints

- Warna: HANYA token CSS (`var(--token)`) di komponen; hex mentah hanya di
  `lib/warna-merek.ts` (satu-satunya tempat sah, dijaga `uji-token-merek.mjs`).
- Tombol aksi utama: `var(--grad-aksen)`, BUKAN `var(--navy)` padat
  (`uji-tombol-primer-seragam.mjs`, ratchet lantai — lihat pelajaran Task 10
  hari ini: 8 pelanggaran nyata baru ditemukan lewat penjaga ini).
- Padding/gap kartu: token kerapatan (`--pad-kartu`, `--pad-kartu-lega`,
  `--gap-bagian`, `--gap-grid`), bukan angka ditulis manual
  (`kerapatan-ratchet.mjs`).
- Disabled-state teks: swap warna solid, TIDAK PERNAH `opacity`
  (`uji-opacity-teks.mjs`).
- Tiap halaman baru WAJIB `<h1>` sekali (tidak dijaga otomatis untuk
  portal, verifikasi manual: `grep -c "<h1"`).
- Tipe respons API WAJIB diverifikasi ke kode backend nyata (route handler
  + `SELECT`/interface-nya) SEBELUM ditulis — bukan ditebak dari nama field
  atau nama fungsi. Pelajaran hari ini: `punch:verify` sempat disangka tak
  ada (grep tak lengkap), bentuk respons baseline jadwal ditebak salah dari
  nama fungsi `ringkas()`.
- Setelah tiap Tahap selesai: typecheck bersih, lint bersih (warning tak
  bertambah dari baseline sebelum tahap itu), `uji-token-css-ada.mjs`,
  `uji-tombol-primer-seragam.mjs`, `kerapatan-ratchet.mjs`,
  `audit-halaman-pakai-cache.mjs` — semua dijalankan dan hasilnya
  dibandingkan ke baseline SEBELUM tahap itu (bukan cuma "exit 0", karena
  banyak penjaga ini ratchet dan repo punya hutang lama di file lain yang
  bukan tanggung jawab tahap ini).
- Audit a11y runtime penuh (`node apps/web/scripts/jalankan-a11y-lengkap.mjs`,
  butuh `LAYAR_EMAIL`/`LAYAR_SANDI`/`LAYAR_BASIS` dari `apps/web/.env.local`)
  dijalankan SEKALI per Tahap selesai, bukan per halaman — satu run makan
  ~50-70 menit untuk ratusan halaman, jalankan di background
  (`run_in_background: true` kalau pakai Bash tool) dan lanjutkan pekerjaan
  lain sambil menunggu.
- `git stash` DILARANG di worktree ini (CLAUDE.md §8a.1) — worktree ini
  dipakai bersama, dan `stash`/`pop` bisa menarik pekerjaan sesi lain tanpa
  sengaja (terjadi nyata hari ini, tidak merusak tapi memakan waktu
  pemulihan). Untuk membandingkan baseline, pakai `git show HEAD:<path>`
  ke file sementara, bukan stash.

---

## Tahap 0: Fondasi PWA

### Task 1: Ekstrak logic logo bersama + ikon PWA dinamis

**Files:**
- Create: `apps/web/lib/merek-perusahaan.ts`
- Modify: `apps/web/app/icon.tsx` (pakai fungsi dari file baru, hapus
  duplikat)
- Create: `apps/web/app/icon-192/route.tsx`
- Create: `apps/web/app/icon-512/route.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/public/merek` (endpoint sudah ada, dipakai
  `app/icon.tsx` — verifikasi bentuk respons persis sebelum menulis: baca
  `apps/api/src/routes/v1/*.ts` untuk rute `public/merek`)
- Produces: `ambilMerek(): Promise<{ logo: string | null; nama: string }>`
  — dipakai Task 1 ini sendiri (icon.tsx, icon-192, icon-512) dan
  `app/manifest.ts` (Task 2)

- [ ] **Step 1: Baca endpoint `/api/v1/public/merek` di kode backend**

Cari rute itu di `apps/api/src/routes/v1/`. Cocokkan bentuk field respons
persis dengan yang dipakai `app/icon.tsx` (`logo_url`, `nama`). Catat kalau
ada field tambahan yang berguna (mis. warna aksen per-tenant kalau ada,
untuk dipakai `theme-color` di Task 2 — TAPI JANGAN implementasikan
personalisasi warna kalau tak ada field-nya di respons; itu di luar scope
plan ini).

- [ ] **Step 2: Ekstrak `ambilMerek()` ke `lib/merek-perusahaan.ts`**

Pindahkan fungsi `ambilMerek` dari `app/icon.tsx` (baris 89-103 di versi
saat ditulis plan ini — cek ulang nomor baris saat eksekusi, file lain
mungkin sudah menyisipkan baris) ke file baru:

```typescript
// apps/web/lib/merek-perusahaan.ts

/**
 * Ambil logo + nama perusahaan dari API — dipakai favicon (`app/icon.tsx`)
 * dan ikon PWA (`app/icon-192/route.tsx`, `app/icon-512/route.tsx`,
 * `app/manifest.ts`). SATU fungsi, tiga konsumen — supaya ikon app dan
 * favicon tak pernah menampilkan logo yang berbeda untuk company yang sama.
 *
 * Lewat HTTP, bukan koneksi DB langsung: `apps/web` tak punya kredensial
 * basis data sama sekali.
 */
export async function ambilMerek(): Promise<{ logo: string | null; nama: string }> {
  const basis = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const r = await fetch(`${basis}/api/v1/public/merek`, {
      next: { revalidate: 3600 },
    });
    if (!r.ok) return { logo: null, nama: "Puraloka" };
    const j = (await r.json()) as { logo_url?: string | null; nama?: string };
    return { logo: j.logo_url ?? null, nama: j.nama || "Puraloka" };
  } catch {
    // Ikon TIDAK BOLEH menggagalkan render halaman. Kegagalan jaringan
    // apa pun jatuh ke inisial.
    return { logo: null, nama: "Puraloka" };
  }
}
```

- [ ] **Step 3: Update `app/icon.tsx` memakai fungsi yang diekstrak**

Hapus definisi `ambilMerek` dari `app/icon.tsx`, ganti dengan:

```typescript
import { ambilMerek } from "@/lib/merek-perusahaan";
```

Sisa file (komponen `Icon()`, render logic, komentar penjelasan) TIDAK
diubah — itu sudah benar dan teruji.

- [ ] **Step 4: Buat `app/icon-192/route.tsx`**

```tsx
import { ImageResponse } from "next/og";
import { NAVY, DI_ATAS_NAVY } from "@/lib/warna-merek";
import { ambilMerek } from "@/lib/merek-perusahaan";

/**
 * Ikon PWA 192×192 — dipakai manifest.json untuk "Add to Home Screen".
 * Pola SAMA PERSIS dengan app/icon.tsx (favicon 64×64): logo per-tenant,
 * jatuh ke inisial+navy kalau tak ada. JANGAN ganti ke logo statis
 * Puraloka — itu salah untuk tenant lain (lihat komentar app/icon.tsx
 * untuk alasan lengkapnya).
 */

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const { logo, nama } = await ambilMerek();
  const inisial = nama.trim().charAt(0).toUpperCase() || "P";
  const size = 192;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: logo ? DI_ATAS_NAVY : NAVY,
          borderRadius: 42,
          overflow: "hidden",
        }}
      >
        {logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logo}
            alt=""
            width={size * 0.9}
            height={size * 0.9}
            style={{ objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              fontSize: 120,
              fontWeight: 700,
              color: DI_ATAS_NAVY,
              letterSpacing: "-0.02em",
            }}
          >
            {inisial}
          </div>
        )}
      </div>
    ),
    { width: size, height: size },
  );
}
```

- [ ] **Step 5: Buat `app/icon-512/route.tsx`**

Salinan Step 4 dengan `size = 512`, `fontSize: 320`, `borderRadius: 112`
(proporsi radius/font terhadap ukuran dipertahankan sama dengan versi 192).

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: bersih

- [ ] **Step 7: Verifikasi manual kedua rute ikon**

Dengan web server hidup (`cd apps/web && pnpm dev`), buka
`http://localhost:3000/icon-192` dan `http://localhost:3000/icon-512` di
browser — konfirmasi keduanya merender gambar PNG (bukan galat), dan
isinya identik secara visual dengan favicon tab (`app/icon.tsx`) hanya
beda ukuran.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/merek-perusahaan.ts apps/web/app/icon.tsx apps/web/app/icon-192/route.tsx apps/web/app/icon-512/route.tsx
git commit -m "feat(pwa): ikon 192/512 dinamis per-tenant, ekstrak ambilMerek() bersama"
```

---

### Task 2: `app/manifest.ts` — manifest PWA dinamis

**Files:**
- Create: `apps/web/app/manifest.ts`

**Interfaces:**
- Consumes: `ambilMerek()` dari `lib/merek-perusahaan.ts` (Task 1), `NAVY`
  dari `lib/warna-merek.ts` (sudah ada)
- Produces: tidak ada — endpoint manifest, dikonsumsi browser

- [ ] **Step 1: Cek tipe `MetadataRoute.Manifest` dari Next.js**

Baca deklarasi tipe di `node_modules/next/dist/lib/metadata/types/
manifest-types.d.ts` (atau cari `MetadataRoute` di `node_modules/next/
types/`) untuk memastikan field yang dipakai di Step 2 valid — Next.js
16 mungkin sudah punya field yang berbeda dari versi lama yang dipelajari
saat menulis plan ini.

- [ ] **Step 2: Tulis `app/manifest.ts`**

```typescript
import type { MetadataRoute } from "next";
import { NAVY } from "@/lib/warna-merek";
import { ambilMerek } from "@/lib/merek-perusahaan";

/**
 * Manifest PWA — dinamis per-tenant (nama app dari company), BUKAN
 * public/manifest.json statis. Ikon menunjuk app/icon-192 dan
 * app/icon-512 (Task 1) yang sama-sama generate dari logo per-company.
 *
 * `start_url` ke /pm-portal: layout portal itu sendiri yang redirect ke
 * /login kalau belum ada sesi (pm-portal/layout.tsx) — start_url tak
 * perlu tahu status login.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { nama } = await ambilMerek();

  return {
    name: `${nama} Suite`,
    short_name: nama,
    description: "Manajemen konstruksi, dari lapangan sampai laporan.",
    start_url: "/pm-portal",
    display: "standalone",
    background_color: NAVY,
    theme_color: NAVY,
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 2b: Sesuaikan field sesuai hasil Step 1**

Kalau tipe `MetadataRoute.Manifest` di versi Next.js project ini berbeda
dari yang ditulis Step 2 (nama field berubah, field baru wajib, dsb),
sesuaikan di sini — Step 1 sudah memverifikasi tipe sungguhan, JANGAN
biarkan `tsc` yang pertama kali memberi tahu ada field salah.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: bersih

- [ ] **Step 4: Verifikasi manual**

Buka `http://localhost:3000/manifest.webmanifest` (Next.js menyajikan
`app/manifest.ts` di path itu — konfirmasi path persis dari response
header/Network tab dev server, App Router bisa menempatkannya di
`/manifest.webmanifest` atau `/manifest.json` tergantung versi). Konfirmasi
JSON valid, `icons[].src` bisa diakses (buka manual di tab baru).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manifest.ts
git commit -m "feat(pwa): manifest.json dinamis per-tenant (nama, ikon dari company)"
```

---

### Task 3: Perluas service worker untuk app-shell offline + registrasi selalu-aktif

**Files:**
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/lib/webpush.ts`
- Create: `apps/web/lib/register-sw.ts`
- Modify: `apps/web/app/layout.tsx` (panggil registrasi baru)

**Interfaces:**
- Consumes: tidak ada (murni browser API)
- Produces: `registerServiceWorker(): void` dari `lib/register-sw.ts`,
  dipanggil dari `app/layout.tsx` (root, bukan cuma pm-portal — supaya
  seluruh app, termasuk dashboard admin, mendapat app-shell cache yang
  sama; tak ada downside untuk role lain)

- [ ] **Step 1: Baca `public/sw.js` lengkap saat ini**

Konfirmasi isinya persis seperti yang dicatat spec (58 baris, cuma push
notification handler, `install`/`activate`/`push` event). JANGAN
menghapus event listener yang sudah ada — Task ini MENAMBAH, bukan
mengganti.

- [ ] **Step 2: Tambahkan strategi cache app-shell ke `sw.js`**

Tambahkan di ATAS event listener yang sudah ada (jangan ubah urutan yang
sudah ada):

```javascript
// Puraloka Suite — Service Worker: push notifications + app-shell cache
// Version: 2.0.0 (app-shell caching ditambahkan — push notification TIDAK diubah)

const CACHE_NAME = 'puraloka-shell-v1'
// Hanya app-shell (route Next.js menangani asetnya sendiri lewat build
// hash) — TIDAK ada data API di sini. Offline penuh (cache data
// transaksional) sengaja TIDAK dibangun — risiko data basi/konflik,
// keputusan founder di spec 2026-08-20-portal-pm-lengkap-design.md §4.
const SHELL_URLS = ['/pm-portal', '/login']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  // Hanya navigasi (buka halaman), BUKAN request API — panggilan
  // /api/v1/* harus tetap live-fail dengan pesan jelas, bukan diam-diam
  // menyajikan data cache basi.
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || caches.match('/pm-portal'))
    )
  )
})
```

- [ ] **Step 3: Update komentar versi + pastikan `activate` yang sudah ada tetap utuh**

Verifikasi event listener `activate` yang sudah ada (baris `self.clients.claim()`)
masih persis sama posisinya, tidak tertimpa oleh Step 2.

- [ ] **Step 4: Buat `lib/register-sw.ts`**

```typescript
/**
 * Registrasi service worker untuk app-shell caching — dipanggil SELALU
 * saat app dibuka (app/layout.tsx), terpisah dari `lib/webpush.ts` yang
 * hanya register saat user opt-in push notification.
 *
 * Sebelumnya sw.js HANYA terdaftar saat subscribeToPush() dipanggil —
 * artinya app-shell cache (Task 3 ini) tak pernah aktif untuk user yang
 * belum menyalakan notifikasi. Fungsi ini memastikan registrasi terjadi
 * dari awal, idempoten (browser tak mendaftar dua kali untuk scope yang
 * sama).
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Kegagalan registrasi TIDAK BOLEH menghalangi app berjalan normal
      // di mode online — PWA installable adalah peningkatan, bukan
      // syarat.
    });
  });
}
```

- [ ] **Step 5: Update `lib/webpush.ts` supaya tak register dua kali**

Baca `subscribeToPush()` lengkap. Ganti baris registrasi:

```typescript
const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
await navigator.serviceWorker.ready
```

menjadi (memakai registrasi yang sudah ada dari `register-sw.ts` kalau
sudah terdaftar, register kalau belum — `navigator.serviceWorker.register`
sendiri sebenarnya idempoten di level browser untuk scope yang sama, jadi
baris ini AMAN dibiarkan apa adanya; verifikasi ini betul dengan membaca
MDN `ServiceWorkerContainer.register()` — kalau memang idempoten, Step 5
ini CUKUP menambahkan komentar penjelas, tanpa mengubah logic).

- [ ] **Step 6: Panggil `registerServiceWorker()` di root layout**

Di `app/layout.tsx`, `RootLayout` adalah server component (tidak ada
`"use client"` di file itu berdasar Task-Task sebelumnya) — `registerServiceWorker`
memakai `window`, jadi TIDAK BISA dipanggil langsung di situ. Buat client
component kecil:

```tsx
// apps/web/components/pendaftar-sw.tsx
"use client";
import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/register-sw";

export default function PendaftarServiceWorker() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
```

Lalu di `app/layout.tsx`, dalam `<body>`, tambahkan
`<PendaftarServiceWorker />` (import dari `@/components/pendaftar-sw`) —
sejajar dengan `<ThemeProvider>`, tidak membungkus apa pun (return `null`).

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: bersih

- [ ] **Step 8: Verifikasi manual service worker terdaftar**

Buka `http://localhost:3000/pm-portal` di Chrome, buka DevTools → Application
→ Service Workers. Konfirmasi `sw.js` berstatus "activated and is running"
TANPA perlu klik apa pun (berbeda dari sebelumnya yang butuh subscribe
push dulu).

- [ ] **Step 9: Verifikasi manual offline app-shell**

DevTools → Network → centang "Offline". Reload halaman
`http://localhost:3000/pm-portal`. Expected: halaman TETAP terbuka (bukan
"No internet" bawaan Chrome) karena app-shell ter-cache, TAPI data yang
butuh API (mis. daftar proyek) menampilkan state error/kosong yang sudah
ada di komponen (`EmptyState`/`galat` dari `useData`) — bukan hang atau
crash.

- [ ] **Step 10: Commit**

```bash
git add apps/web/public/sw.js apps/web/lib/webpush.ts apps/web/lib/register-sw.ts apps/web/components/pendaftar-sw.tsx apps/web/app/layout.tsx
git commit -m "feat(pwa): app-shell cache offline + registrasi service worker selalu-aktif"
```

---

### Task 4: Komponen `SwipeableCard` bersama

**Files:**
- Create: `apps/web/components/portal/SwipeableCard.tsx`
- Create: `apps/web/lib/motion.ts`

**Interfaces:**
- Consumes: tidak ada
- Produces: `SwipeableCard` component (props: `children`, `onSwipeRight`,
  `onSwipeLeft`, `labelKanan`, `labelKiri`, `warnaKanan`, `warnaKiri`),
  token motion dari `lib/motion.ts` (`DURASI_ENTER`, `DURASI_MOVE`,
  `EASING_ENTER`, `EASING_MOVE`) — dipakai SEMUA halaman baru Tahap 1-7
  yang punya kartu approve/reject atau tutup/verifikasi.

- [ ] **Step 1: Tulis `lib/motion.ts`**

```typescript
/**
 * Token motion bersama — durasi & easing dipakai konsisten lintas portal,
 * bukan angka ditulis ulang tiap komponen. Nilai dari skill ui-animation
 * (SKILL.md §Easing defaults), didasarkan pada riset motion design
 * (Material Design + praktik umum), BUKAN dikarang sendiri.
 */
export const DURASI_ENTER_MS = 250;
export const DURASI_MOVE_MS = 250;
export const EASING_ENTER = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASING_MOVE = "cubic-bezier(0.25, 1, 0.5, 1)";

/** Threshold drag (px) sebelum swipe dianggap disengaja, bukan tak sengaja. */
export const SWIPE_THRESHOLD_PX = 80;
```

- [ ] **Step 2: Tulis `SwipeableCard.tsx`**

```tsx
"use client";

// ============================================================================
// SwipeableCard — kartu list dengan swipe-to-action (approve/reject,
// tutup/tolak). Dipakai di seluruh Portal PM untuk kartu approval/
// verifikasi, mulai Tahap 1.
//
// Gesture adalah PERCEPATAN, bukan satu-satunya cara — tombol tetap
// disediakan pemanggil sebagai children (pola sudah ada di
// pm-portal/approval, pm-portal/punch-list dst). Komponen ini HANYA
// menambah lapisan swipe di atasnya, tidak menggantikan tombol yang
// sudah ada di tiap halaman.
//
// prefers-reduced-motion: swipe tetap berfungsi (drag masih menggerakkan
// elemen mengikuti jari — itu respons langsung, bukan animasi terpisah),
// tapi animasi SNAP-BACK saat dilepas tanpa melewati threshold dipercepat
// ke instan.
// ============================================================================

import { useRef, useState } from "react";
import { SWIPE_THRESHOLD_PX, EASING_MOVE, DURASI_MOVE_MS } from "@/lib/motion";

export interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  labelKanan?: string;
  labelKiri?: string;
  /** Default: var(--success-bg) */
  warnaKanan?: string;
  /** Default: var(--danger-bg) */
  warnaKiri?: string;
  /** Matikan swipe (mis. kartu yang aksinya sudah tak berlaku) — tombol children tetap tampil. */
  nonaktif?: boolean;
}

export default function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  labelKanan = "Setujui",
  labelKiri = "Tolak",
  warnaKanan = "var(--success-bg)",
  warnaKiri = "var(--danger-bg)",
  nonaktif = false,
}: SwipeableCardProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const mulaiX = useRef(0);
  const prefersReduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  if (nonaktif || prefersReduced.current) {
    // Reduced motion ATAU dinonaktifkan pemanggil: render kartu polos,
    // swipe tak aktif — tombol children (disediakan pemanggil) tetap
    // satu-satunya jalur aksi. Ini BUKAN kehilangan fungsi, karena
    // gesture selalu opsional (§3c spec).
    return <div>{children}</div>;
  }

  function mulai(clientX: number) {
    mulaiX.current = clientX;
    setDragging(true);
  }
  function gerak(clientX: number) {
    if (!dragging) return;
    setDx(clientX - mulaiX.current);
  }
  function lepas() {
    setDragging(false);
    if (dx > SWIPE_THRESHOLD_PX && onSwipeRight) {
      onSwipeRight();
    } else if (dx < -SWIPE_THRESHOLD_PX && onSwipeLeft) {
      onSwipeLeft();
    }
    setDx(0);
  }

  const progresKanan = Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD_PX));
  const progresKiri = Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD_PX));

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16 }}>
      {onSwipeRight && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            paddingLeft: 20, background: warnaKanan, opacity: progresKanan,
            fontSize: 13, fontWeight: 700, color: "var(--text-primary)",
          }}
        >
          {labelKanan}
        </div>
      )}
      {onSwipeLeft && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "flex-end", paddingRight: 20, background: warnaKiri,
            opacity: progresKiri, fontSize: 13, fontWeight: 700, color: "var(--text-primary)",
          }}
        >
          {labelKiri}
        </div>
      )}
      <div
        onPointerDown={(e) => mulai(e.clientX)}
        onPointerMove={(e) => gerak(e.clientX)}
        onPointerUp={lepas}
        onPointerCancel={lepas}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : `transform ${DURASI_MOVE_MS}ms ${EASING_MOVE}`,
          touchAction: "pan-y",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: bersih

- [ ] **Step 4: Lint**

Run: `cd apps/web && pnpm exec eslint components/portal/SwipeableCard.tsx lib/motion.ts`
Expected: bersih

- [ ] **Step 5: Verifikasi manual di halaman existing**

Pasang `SwipeableCard` secara SEMENTARA di satu kartu
`pm-portal/approval/page.tsx` (mis. bungkus satu baris inbox), jalankan
`pnpm dev`, buka di Chrome DevTools mode device emulation (mobile), coba
swipe dengan mouse-drag. Konfirmasi kartu mengikuti drag, warna latar
terungkap progresif, snap-back saat dilepas di bawah threshold, callback
terpanggil saat melewati threshold. **Setelah verifikasi, batalkan
pemasangan sementara ini** (`git checkout -- apps/web/app/pm-portal/
approval/page.tsx` kalau ada perubahan tak sengaja ter-commit, atau
`git diff` untuk pastikan tidak ada residu) — Task 4 hanya membangun
komponennya, bukan memasangnya di halaman manapun; itu pekerjaan
Tahap 1+.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/portal/SwipeableCard.tsx apps/web/lib/motion.ts
git commit -m "feat(portal): SwipeableCard + token motion bersama — dasar interaksi Tahap 1-7"
```

---

## Tahap 1: Operasi Lapangan + Mandor & Subkon

> ⚠️ Sebelum memulai task-task di bawah, baca ulang §1 spec (Kedalaman
> fungsi: ikuti permission API apa adanya) dan §3 (Interaksi & feel
> mobile) — keduanya berlaku ke SETIAP halaman baru di tahap ini.

### Task 5: Riset endpoint + permission — kelompok Mandor & Subkon

**Files:** tidak ada perubahan kode — task riset murni, hasilnya dipakai
Task 6-11.

**Interfaces:**
- Consumes: tidak ada
- Produces: catatan riset (di deskripsi commit Task 6, BUKAN file terpisah
  — spec §5 sudah menegaskan disiplin verifikasi-dulu, tulisan hasil riset
  cukup di commit message tiap halaman yang memakainya, seperti pola
  Task 10 hari ini)

- [ ] **Step 1: Petakan 10 modul kelompok ini ke route file backend**

Modul: `mandor`, `workers`, `mitra`, `backcharge`, `opname`, `spk`,
`progress` (dari §6 tabel spec, Tahap 1). Untuk TIAP modul, grep
`apps/api/src/routes/v1/*.ts` untuk `requirePermission('<modul>:...)`
DAN `hasPermission(request, '<modul>:...')` (dua pola — pelajaran hari
ini: sebagian permission dicek di dalam handler, bukan di `preHandler`,
dan grep yang cuma cari satu pola melewatkannya).

- [ ] **Step 2: Catat method+path+permission per endpoint yang relevan**

Untuk tiap modul, catat: endpoint LIST (GET), endpoint DETAIL kalau ada,
endpoint UBAH STATUS/AKSI kalau PM py permission `:manage` bukan cuma
`:view`. Prioritaskan endpoint yang halaman webnya (dari riset agent §6
spec) benar-benar memanggilnya — jangan asumsikan endpoint yang cocok
namanya otomatis yang dipakai.

- [ ] **Step 3: Identifikasi endpoint yang PM permission-nya CUMA view**

Tandai modul mana yang PM cuma py `:view` (bukan `:manage`) — untuk modul
itu, halaman portalnya BACA SAJA, nol tombol aksi (pola sama dengan
`pm-portal/dokumen` yang sudah ada hari ini).

---

### Task 6: Halaman Mandor & Subkon — bagian 1 (Penugasan, Kasbon, Opname)

**Files:**
- Create: `apps/web/app/pm-portal/mandor-lengkap/penugasan/page.tsx`
- Create: `apps/web/app/pm-portal/mandor-lengkap/kasbon/page.tsx`
- Create: `apps/web/app/pm-portal/mandor-lengkap/opname/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Interfaces:**
- Consumes: hasil riset Task 5, `SwipeableCard`+`lib/motion.ts` (Task 4),
  komponen portal existing (`StatusBadge`, `EmptyState`, `SkeletonCard`,
  `BottomSheet`, `SegmentedTab`)
- Produces: tipe baru di `_bersama/tipe.ts` (nama persis ditentukan saat
  eksekusi, berdasar bentuk field API sungguhan dari Task 5 — TIDAK
  ditulis di sini karena menulisnya sebelum riset akan jadi tebakan,
  persis pelanggaran yang dilarang §"No Placeholders" skill ini)

- [ ] **Step 1: Baca halaman web existing untuk ketiga modul**

`apps/web/app/(dashboard)/mandor/penugasan/page.tsx`,
`mandor/kasbon/page.tsx`, `mandor/opname/page.tsx` — baca LENGKAP tiap
file (bukan sebagian), catat: field yang ditampilkan, aksi yang tersedia
(create/approve/reject/dsb), endpoint yang dipanggil (`api.get`/`api.post`/
`api.patch` dengan path persis).

- [ ] **Step 2: Tulis tipe di `_bersama/tipe.ts` untuk ketiga modul**

Tipe field HARUS sama persis dengan yang dibaca Step 1 dari kode web
existing (yang sudah teruji di dashboard) — bukan dari dugaan nama kolom
DB. Tambahkan di `_bersama/tipe.ts` sesudah tipe yang sudah ada, dengan
komentar sumber (mis. "Bentuk dari `GET /api/v1/mandor/assignments`,
dicocokkan ke `(dashboard)/mandor/penugasan/page.tsx`").

- [ ] **Step 3: Tulis `penugasan/page.tsx`**

Pola: `useData` untuk list, kartu per penugasan (`StatusBadge` untuk
status), kalau PM py `mandor:manage` sertakan `BottomSheet` untuk
create/edit — kalau cuma `:view`, halaman baca saja. `<h1>Penugasan
Mandor</h1>`. Pakai `SwipeableCard` HANYA kalau ada aksi approve/reject
di kartu (kemungkinan tidak untuk penugasan — ini murni daftar, bukan
approval; putuskan berdasar Step 1, jangan pasang swipe di modul yang
tak punya aksi biner approve/reject).

- [ ] **Step 4: Tulis `kasbon/page.tsx`**

Sama polanya — cek apakah ini duplikat dengan `pm-portal/keuangan/page.tsx`
yang sudah ada (yang juga menampilkan kasbon). KALAU IYA duplikat penuh,
JANGAN buat halaman baru — cukup pastikan `keuangan/page.tsx` sudah
lengkap dan tautkan dari kategori "Mandor & Subkon" ke halaman yang sama.
Keputusan ini WAJIB dicatat di commit message Task ini (bukan diam-diam
dilewati).

- [ ] **Step 5: Tulis `opname/page.tsx`**

Pola sama, dengan `SwipeableCard` KALAU opname punya aksi
verifikasi/tolak (cek Step 1 — opname bersama biasanya butuh dua pihak
setuju, kemungkinan PM salah satu penyetuju).

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: bersih

- [ ] **Step 7: Lint**

Run: `cd apps/web && pnpm exec eslint app/pm-portal/mandor-lengkap/`
Expected: bersih (warning tak bertambah dari baseline)

- [ ] **Step 8: Penjaga token, tombol, kerapatan, cache**

```bash
cd apps/web
node scripts/uji-token-css-ada.mjs
node scripts/uji-tombol-primer-seragam.mjs
node scripts/kerapatan-ratchet.mjs
cd ../api
node scripts/audit-halaman-pakai-cache.mjs
```

Expected: semua exit 0, angka tak naik dari baseline sebelum task ini
(catat baseline dengan menjalankan skrip yang sama SEBELUM Step 1, kalau
belum dicatat di sesi sebelumnya).

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/pm-portal/mandor-lengkap/ apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): Penugasan, Kasbon, Opname — kelompok Mandor & Subkon bagian 1"
```

---

### Task 7: Halaman Mandor & Subkon — bagian 2 (SPK, Tender, Retensi, Back-charge)

**Files:**
- Create: `apps/web/app/pm-portal/mandor-lengkap/spk/page.tsx`
- Create: `apps/web/app/pm-portal/mandor-lengkap/tender/page.tsx`
- Create: `apps/web/app/pm-portal/mandor-lengkap/retensi/page.tsx`
- Create: `apps/web/app/pm-portal/mandor-lengkap/backcharge/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Interfaces:**
- Consumes: sama pola Task 6
- Produces: tipe tambahan di `_bersama/tipe.ts`

- [ ] **Step 1: Baca halaman web existing untuk keempat modul**

`(dashboard)/mandor/spk/page.tsx` (874 baris — halaman besar, baca
seluruhnya sebelum menulis, sesuai instruksi wajib plan
portal-mobile-rombak yang terbukti perlu untuk file besar),
`mandor/tender/page.tsx` (1045 baris), `mandor/retensi/page.tsx`,
back-charge (dicatat riset agent sebelumnya: TIDAK punya halaman
sendiri, ada di dalam komponen section `mandor/page.tsx` — cari
`*-section.tsx` yang memanggil endpoint `/api/v1/back-charge`).

- [ ] **Step 2: Tulis tipe di `_bersama/tipe.ts`**

Sama disiplinnya dengan Task 6 Step 2.

- [ ] **Step 3: Tulis `spk/page.tsx`**

SPK (874 baris di web) adalah modul kompleks — ikuti §1 spec "modul
kompleks tetap dibangun, disederhanakan". Untuk versi mobile: list SPK
dengan status, BottomSheet untuk lihat detail (nilai, lingkup, tanggal),
kalau PM py `spk:manage` sertakan aksi terbitkan/addendum disederhanakan
ke field terpenting (nilai delta, alasan) — bukan mereplikasi seluruh
form 874-baris. Cetak PDF (kalau ada endpoint-nya, dari riset agent)
cukup tombol "Unduh PDF" yang buka di tab baru, bukan preview inline.

- [ ] **Step 4: Tulis `tender/page.tsx`**

Sama prinsipnya — tender subkon (1045 baris web) disederhanakan ke: list
tender + status, detail penawaran per subkon (perbandingan per-pos dari
riset agent — kalau terlalu padat untuk mobile, tampilkan ringkasan total
per penawar + tautan "lihat rincian pos" yang buka BottomSheet terpisah).

- [ ] **Step 5: Tulis `retensi/page.tsx`**

Retensi subkon — list per lingkup kerja, jumlah ditahan/dicairkan,
kalau PM py permission pencairan sertakan aksi (BottomSheet dengan
jumlah + alasan).

- [ ] **Step 6: Tulis `backcharge/page.tsx`**

List potongan back-charge per mandor, kategori+uraian+bukti, status
approval kalau PM adalah penyetujunya (`SwipeableCard` untuk approve/
reject cepat).

- [ ] **Step 7-9: Typecheck, lint, penjaga (sama seperti Task 6 Step 6-8)**

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/pm-portal/mandor-lengkap/ apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): SPK, Tender, Retensi, Back-charge — kelompok Mandor & Subkon bagian 2"
```

---

### Task 8: Halaman Operasi Lapangan — sisa (progress, workers, mitra)

**Files:**
- Create atau extend: halaman terkait `progress` (kemungkinan tab baru di
  `proyek/[id]/page.tsx` PM, bukan halaman berdiri sendiri — riset agent
  mencatat modul ini TIDAK PUNYA UI terpisah, menyatu di
  `ProgressSection` proyek/[id])
- Create: `apps/web/app/pm-portal/mandor-lengkap/tukang/page.tsx`
  (workers)
- Create: `apps/web/app/pm-portal/mandor-lengkap/mitra/page.tsx`

**Interfaces:**
- Consumes: sama pola Task 6-7
- Produces: tipe tambahan di `_bersama/tipe.ts`

- [ ] **Step 1: Cek apakah `pm-portal/proyek/[id]/page.tsx` PM sudah punya
tab progress**

Portal PM saat ini BELUM punya halaman `proyek/[id]` sendiri (beda dari
portal klien yang sudah dibangun hari ini) — konfirmasi dengan
`find apps/web/app/pm-portal/proyek -name "page.tsx"`. Kalau memang belum
ada, modul `progress` untuk PM masuk ke Task terpisah di Tahap 2
(kelompok Kontrak+Perencanaan juga butuh `proyek/[id]` PM sebagai hub) —
CATAT temuan ini di commit message Task 8, JANGAN memaksakan
membangunnya di sini kalau ternyata bergantung pada struktur yang belum
ada.

- [ ] **Step 2: Baca `(dashboard)/mandor/tukang/page.tsx` (276 baris)**

- [ ] **Step 3: Tulis `tukang/page.tsx`** (workers — daftar tukang individu)

Pola sama Task 6.

- [ ] **Step 4: Baca `(dashboard)/mandor/mitra/page.tsx` (585 baris)**

- [ ] **Step 5: Tulis `mitra/page.tsx`** (evaluasi mitra/subkon, status
kelayakan)

Pola sama, dengan perhatian khusus: field `status_kelayakan`
('layak'/'ditinjau'/'tak_layak') — pastikan `StatusBadge` varian yang
dipakai konsisten dengan makna (`layak`→approved, `ditinjau`→pending,
`tak_layak`→rejected).

- [ ] **Step 6-8: Typecheck, lint, penjaga**

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/pm-portal/mandor-lengkap/
git commit -m "feat(pm-portal): Tukang, Mitra — sisa kelompok Operasi Lapangan/Mandor & Subkon"
```

---

### Task 9: Halaman "Lainnya" berkategori — pengganti grid datar

**Files:**
- Modify: `apps/web/app/pm-portal/lainnya/page.tsx` (tulis ulang total)
- Create: `apps/web/app/pm-portal/kategori/[key]/page.tsx`

**Interfaces:**
- Consumes: struktur kategori dari `lib/peta-menu.ts` (dibaca ulang,
  DISARING ke kategori yang PM py minimal satu permission di dalamnya —
  bukan disalin manual)
- Produces: rute dinamis `/pm-portal/kategori/[key]` yang dipakai SEMUA
  tahap berikutnya sebagai target link dari halaman kategori

- [ ] **Step 1: Baca `lib/peta-menu.ts` struktur `GrupMenu`/`ItemMenu`
lengkap**

Konfirmasi field `key`, `label`, `icon`, `items[].href` bisa dipakai
langsung untuk navigasi (bukan cuma dokumentasi) — cek apakah ada fungsi
helper yang sudah mengambil peta ini di kode web (mis. dipakai sidebar
`components/sidebar.tsx`) yang bisa dipakai ulang alih-alih import
`PETA_MENU` mentah.

- [ ] **Step 2: Tulis fungsi filter kategori-berdasar-permission**

Di `apps/web/lib/pm-portal-kategori.ts` (baru):

```typescript
import { PETA_MENU, type GrupMenu } from "@/lib/peta-menu";

/**
 * Kategori yang PM punya minimal satu permission di dalamnya — dipakai
 * halaman "Lainnya" (Task 9) supaya kategori kosong tak pernah tampil.
 *
 * Permission per-item BELUM dicek di sini (itu terjadi saat halaman
 * modulnya sendiri dibuka, lewat requirePermission API) — fungsi ini
 * hanya menyaring KATEGORI yang relevan secara kasar, dari daftar modul
 * yang plan ini bangun (Tahap 1-7). Modul yang belum dibangun (status
 * bukan 'hidup' atau belum sempat dikerjakan tahap ini) TIDAK muncul —
 * daftarnya di-maintain manual di sini seiring tiap Tahap selesai
 * (idealnya via array MODUL_PM_DIBANGUN yang tumbuh tiap task, BUKAN
 * lewat pengecekan permission runtime yang lebih kompleks dari yang
 * dibutuhkan fase ini).
 */
export function kategoriUntukPm(): GrupMenu[] {
  // Diisi progresif: tiap Task Tahap 1-7 yang menambah modul baru WAJIB
  // menambahkan key kategorinya ke daftar ini juga, di commit yang sama
  // (pola sama dengan kewajiban CLAUDE.md §8a.4 "dokumen tak boleh
  // tertinggal dari kode").
  const KATEGORI_AKTIF = ["g-subkon", "g-lapangan"]; // Tahap 1 — tambah tiap tahap
  return PETA_MENU.filter((g) => KATEGORI_AKTIF.includes(g.key));
}
```

- [ ] **Step 3: Tulis ulang `lainnya/page.tsx`**

```tsx
"use client";

// ============================================================================
// Lainnya — Portal PM. Task 9: grid datar (bentuk lama) diganti halaman
// kategori. Tiap kartu kategori membuka /pm-portal/kategori/[key] (Task 9
// juga) yang mendaftar modul di dalamnya.
// ============================================================================

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { kategoriUntukPm } from "@/lib/pm-portal-kategori";
import * as Icons from "lucide-react";

export default function PmLainnyaPage() {
  const kategori = kategoriUntukPm();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Lainnya
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {kategori.map((g) => {
          const Ikon = (Icons as Record<string, Icons.LucideIcon>)[g.icon] ?? Icons.Folder;
          return (
            <Link
              key={g.key}
              href={`/pm-portal/kategori/${g.key}`}
              style={{
                display: "flex", alignItems: "center", gap: 14, padding: 16,
                borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)",
                textDecoration: "none",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12, background: "var(--info-bg)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Ikon size={20} color="var(--navy)" aria-hidden="true" />
              </div>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                {g.label}
              </span>
              <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

**Catatan implementasi**: badge count (§2 spec, "3 PO menunggu terima")
SENGAJA TIDAK ditulis di Step ini — itu butuh fetch data per-kategori yang
bervariasi per modul, ditambahkan progresif per-tahap kalau ada endpoint
ringkasan yang murah (jangan menambah N panggilan API di halaman ini
demi badge yang belum tentu bernilai; putuskan per-kategori nanti setelah
lihat apakah endpoint ringkasannya sudah ada).

- [ ] **Step 4: Tulis `kategori/[key]/page.tsx`**

```tsx
"use client";

// ============================================================================
// Detail Kategori — Portal PM. Menampilkan daftar modul (ItemMenu) di
// dalam satu kategori, hanya yang status 'hidup' (§1 spec — modul belum
// hidup dilewati, bukan ditampilkan sebagai coming-soon).
// ============================================================================

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PETA_MENU } from "@/lib/peta-menu";
import EmptyState from "@/components/portal/EmptyState";
import { Folder } from "lucide-react";

/**
 * Peta href web (`/mandor/spk`, dst) ke href portal PM
 * (`/pm-portal/mandor-lengkap/spk`) — DIISI PROGRESIF tiap Task menambah
 * halaman baru. Item yang key-nya TAK ADA di sini masih ditampilkan
 * (status hidup di web), tapi tautannya ke path web asli sebagai
 * fallback sampai versi portalnya dibangun — BUKAN disembunyikan
 * (menyembunyikan modul yang PM tahu ada tapi belum bisa dibuka dari HP
 * lebih membingungkan daripada menautkannya ke web, meski itu bukan
 * pengalaman ideal, sampai tahap yang relevan selesai).
 */
const PETA_HREF_PORTAL: Record<string, string> = {
  "sk-wo": "/pm-portal/mandor-lengkap/spk",
  "sk-tender": "/pm-portal/mandor-lengkap/tender",
  "sk-retensi": "/pm-portal/mandor-lengkap/retensi",
  "sk-backcharge": "/pm-portal/mandor-lengkap/backcharge",
  "sk-mandor": "/pm-portal/mandor-lengkap/tukang",
  "sk-paket": "/pm-portal/mandor-lengkap/penugasan",
  "sk-kasbon": "/pm-portal/mandor-lengkap/kasbon",
  "sk-opname": "/pm-portal/mandor-lengkap/opname",
  // Tahap berikutnya menambah baris di sini, sesuai key ItemMenu.
};

export default function PmKategoriPage() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const grup = PETA_MENU.find((g) => g.key === key);

  if (!grup) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <button type="button" onClick={() => router.back()} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}>
          <ChevronLeft size={16} aria-hidden="true" /> Kembali
        </button>
        <EmptyState icon={Folder} judul="Kategori tidak ditemukan" deskripsi="Kategori ini mungkin sudah dipindahkan." />
      </div>
    );
  }

  const itemHidup = grup.items.filter((it) => it.status === "hidup");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button type="button" onClick={() => router.back()} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--navy)", fontWeight: 600, padding: 0, alignSelf: "flex-start" }}>
        <ChevronLeft size={16} aria-hidden="true" /> Kembali
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        {grup.label}
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {itemHidup.map((it) => (
          <Link
            key={it.key}
            href={PETA_HREF_PORTAL[it.key] ?? it.href ?? "#"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: 16, borderRadius: 14, background: "var(--surface)",
              border: "1px solid var(--border)", textDecoration: "none",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{it.label}</span>
            <ChevronRight size={16} color="var(--text-muted)" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck, lint, penjaga (sama pola Task 6)**

- [ ] **Step 6: Verifikasi manual navigasi 3-level**

`pnpm dev`, buka `/pm-portal/lainnya` → tap kategori "Mandor & Subkon" →
konfirmasi masuk ke `/pm-portal/kategori/g-subkon` → tap "Surat Perintah
Kerja" → konfirmasi masuk ke `/pm-portal/mandor-lengkap/spk` (halaman
Task 7).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/pm-portal/lainnya/page.tsx apps/web/app/pm-portal/kategori/ apps/web/lib/pm-portal-kategori.ts
git commit -m "feat(pm-portal): Lainnya jadi kategori berjenjang, ganti grid datar"
```

---

### Task 10: Verifikasi akhir Tahap 1

**Files:** tidak ada perubahan kode — task verifikasi murni.

- [ ] **Step 1: Typecheck seluruh workspace**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: bersih

- [ ] **Step 2: Jalankan SEMUA penjaga CI**

Run: `cd apps/api && node scripts/jalankan-semua-penjaga.mjs`
Tempel ringkasan lengkap. Bandingkan tiap penjaga yang MERAH terhadap
baseline sebelum Tahap 1 dimulai — pisahkan temuan nyata dari sesi ini vs
hutang lama file lain (pola yang sama dipakai memisahkan 41 temuan
penjaga hari ini jadi hanya 2 yang benar-benar dari kerja sesi itu).

- [ ] **Step 3: Test integrasi terkait**

Run: `cd apps/api && npx vitest run spk tender retensi opname backcharge`
(atau nama file test yang sesuai, ditemukan dari `find apps/api/src -iname "*<modul>*test*"`)
Expected: seluruhnya lulus — plan ini TIDAK mengubah backend, jadi test
backend HARUS tetap hijau (kalau ada yang merah, itu bukti perubahan tak
sengaja atau race-condition test lain berjalan bersamaan — lihat CLAUDE.md
§7 soal larangan run test paralel).

- [ ] **Step 4: Audit a11y runtime penuh**

```bash
cd apps/web
export $(grep -E "^LAYAR_(EMAIL|SANDI|BASIS)=" .env.local | tr -d '\r' | xargs)
node scripts/jalankan-a11y-lengkap.mjs
```

Jalankan di background (task lama), tempel hasil lengkap begitu selesai:
jumlah halaman dipindai, jumlah pelanggaran (target: 0, konsisten dengan
seluruh portal hari ini).

- [ ] **Step 5: Update JOURNAL.md**

Tambahkan entri baru (di ATAS, append-only sesuai format
`docs/execution/JOURNAL.md`) mencatat: Tahap 1 selesai, jumlah halaman
baru, temuan penting (kalau ada duplikasi terhindari seperti kasbon di
Task 6, atau modul yang ternyata butuh struktur `proyek/[id]` PM yang
belum ada seperti dicatat Task 8).

- [ ] **Step 6: Commit dokumentasi**

```bash
git add docs/execution/JOURNAL.md
git commit -m "docs(jurnal): Tahap 1 Portal PM Lengkap selesai — Operasi Lapangan + Mandor & Subkon"
```

---

## Tahap 2: Kontrak + Perencanaan (Task 11-16)

> Tahap 1 (Task 5-10) sudah selesai dan di-merge sebelum Tahap 2 dimulai.
> Task 11 di bawah adalah task RISET yang breakdown-nya (Task 12-16)
> ditulis LANGSUNG ke dokumen ini pada sesi yang sama (bukan ditunda ke
> sesi eksekusi terpisah) — polanya tetap sama dengan Tahap 1 (riset dulu,
> tipe diverifikasi ke kode nyata, BARU kode halaman ditulis), hanya
> urutannya digabung satu sesi karena riset Task 11 sudah cukup dalam
> untuk langsung menghasilkan kode lengkap, bukan sekadar kerangka.

### Task 11: [Tahap 2] Kontrak + Perencanaan — riset & breakdown

**Files:** Modify: dokumen plan ini (Task 12-16 di bawah, kode lengkap)

- [x] **Step 1: Riset endpoint+permission** modul `projects` (bagian
kontrak), `rfi`, `klaim`, `milestones`, `jadwal` — pola sama Task 5.

  **Temuan kunci** (detail lengkap per-endpoint ada di riset masing-masing
  Task 12-15 di bawah, bukan diulang di sini):
  - Modul kontrak jauh LEBIH KAYA dari perkiraan awal spec §6 (~15
    halaman sumber) — ditemukan 4 route file tambahan yang tak disebut
    brief: `kontrak.ts` (Register Kontrak, tabel `kontrak` migrasi 344),
    `rantai-kontrak.ts` (EOT+LD+Bond+Klaim Kontraktual, 1 file 4 sub-
    modul), `surat.ts` (korespondensi), `asuransi.ts` (register polis).
  - `KontrakRingkas` yang SUDAH ADA di `_bersama/tipe.ts` (dari Tahap 1)
    komentarnya menyatakan "tak ada tabel/endpoint `contracts` terpisah"
    — itu SALAH untuk entitas `kontrak` (dokumen induk/addendum, migrasi
    344), meski BENAR untuk perannya sendiri (`projects.contract_value`,
    jalur uang yang berlaku). Dua entitas berbeda, dibandingkan bukan
    ditimpa (lihat komentar `kontrak.ts` baris 12-23). Dikoreksi di Task
    12.
  - Permission `klaim:*` di `role_permissions` BUKAN klaim kontraktual
    (`kt-claims`/`contract_claims`) — itu modul TERPISAH (Klaim
    Perjalanan/reimbursement karyawan, `klaim-perjalanan.ts`). PM cuma
    punya `klaim:setujui`+`klaim:bayar` (bukan `klaim:view`/`klaim:kelola`
    — diukur `role_permissions`), jadi modul itu KELUAR scope Task 14.
    Klaim kontraktual (`contract_claims`) pakai permission `projects:view`/
    `projects:edit` yang PM PUNYA PENUH — itu yang dikerjakan Task 14.
  - `jd-histogram`/`jd-method` TERNYATA bukan endpoint terpisah —
    keduanya SUDAH ada di payload `GET /api/v1/jadwal-cpm/:projectId`
    yang `pm-portal/jadwal/page.tsx` (Tahap 1) SUDAH memanggil, hanya
    belum dirender. Task 15 menambah tab, bukan endpoint baru.
  - `kt-co`/`kt-eot`/`kt-ld`/`kt-bond`/`kt-surat` TIDAK semuanya
    `tabProyek` seperti dugaan brief — diverifikasi ke `peta-menu.ts`
    ulang: hanya `kt-co` yang `tabProyek: 'sec-co'` (Change Order, live
    di `/proyek/[id]` admin, endpoint `change_orders` tak diriset detail
    Tahap 2 ini). `kt-eot`/`kt-ld`/`kt-bond` menunjuk `tabProyek:
    'sec-info'` TAPI py endpoint per-proyek BERDIRI SENDIRI
    (`/api/v1/projects/:id/eot`, dst, di `rantai-kontrak.ts`) — jadi
    TETAP BISA dibangun sebagai halaman standalone tanpa menunggu hub
    tab, dan itu yang dipilih Task 13. `kt-rfi`/`kt-surat` BUKAN
    `tabProyek` sama sekali — keduanya endpoint berdiri sendiri
    (`rfi.ts`/`surat.ts`).

- [x] **Step 2: Cek apakah `pm-portal/proyek/[id]/page.tsx` untuk PM sudah
perlu dibangun di sini.**

  **Temuan**: `pm-portal/proyek/[id]/page.tsx` SUDAH ADA (dibuat sebelum
  Tahap 1, bukan baru) tapi isinya HANYA `router.replace` ke
  `/proyek/:id` ADMIN — 16 baris, bukan hub tab PM. Membangun hub tab
  PM penuh (pola `portal/proyek/[id]` klien, ~750 baris, 10 tab) adalah
  pekerjaan besar tersendiri. **Diputuskan TIDAK dibangun di Tahap 2** —
  endpoint EOT/LD/Bond/Klaim/Surat semuanya SUDAH per-proyek berdiri
  sendiri (lihat Step 1), jadi Tahap 2 tidak BUTUH hub untuk berfungsi.
  Task 13 menggabungkan EOT+LD+Bond jadi satu halaman `SegmentedTab`
  3-arah sebagai gantinya. Modul yang MEMANG murni `tabProyek` tanpa
  endpoint berdiri sendiri (`kt-co`/Change Order, dan diperkirakan
  `jd-gantt`/`jd-kurva-s`/`jd-evm`/`jd-wbs`/`cc-rab` dst di Tahap 3
  CECEP) dicatat sebagai UTANG di Task 16, ditunda sampai hub-nya benar-
  benar dibutuhkan banyak modul sekaligus (kemungkinan didorong Tahap 3,
  dicatat di Task 17 Step 1).

- [x] **Step 3: Tulis breakdown Task 12-16 ke dokumen plan ini** —
selesai, lihat di bawah. 5 task (bukan kerangka riset seperti Tahap 3-7)
karena riset Step 1-2 di atas sudah cukup dalam untuk kode lengkap
langsung.

- [x] **Step 4: Update §6 spec** — lihat perubahan di §6 (baris
"Perkiraan halaman sumber" untuk Tahap 2 dikoreksi dari "~15" ke "~18"
(bertambah, BUKAN berkurang seperti dugaan awal brief — modul kontrak
ternyata punya endpoint LEBIH BANYAK dari yang tabProyek asumsikan,
lihat Step 1), dan catatan baru ditambahkan menjelaskan `kt-co` tetap
`tabProyek` murni sementara `kt-eot`/`kt-ld`/`kt-bond` py endpoint
sendiri meski targetnya sama-sama `/proyek`.

### Task 12: Register Kontrak + Asuransi — halaman baru

**Files:**
- Create: `apps/web/app/pm-portal/kontrak-lengkap/register/page.tsx`
- Create: `apps/web/app/pm-portal/kontrak-lengkap/asuransi/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Riset yang sudah dilakukan (Task 11 Step 1)** — ditulis di sini, bukan
file terpisah, pola sama Task 5:

- `kt-register` (Register Kontrak) TERNYATA sudah punya tabel & rute
  sendiri — **koreksi atas `KontrakRingkas` yang sudah ada di
  `_bersama/tipe.ts`**, yang komentarnya menyatakan "tak ada
  tabel/endpoint `contracts` terpisah". Itu benar untuk `projects`
  (nilai kontrak yang BERLAKU, dipakai invoice/PPN/retensi/EVM), tapi ada
  ENTITAS KEDUA: tabel `kontrak` (migrasi 344, `apps/api/src/routes/v1/
  kontrak.ts`) — dokumen kontrak induk+addendum sebagai peristiwa
  tersendiri, dibandingkan (bukan menimpa) terhadap `projects.
  contract_value`. `KontrakRingkas` TETAP BENAR untuk perannya sendiri
  (ringkasan nilai proyek) — catatan komentarnya yang perlu ditambah,
  bukan tipenya yang salah.
  - `GET /api/v1/kontrak?project_id=&status=&jenis=` — `projects:view`.
  - `GET /api/v1/kontrak/proyek/:projectId` — `projects:view`. Payload:
    `{ proyek, kontrak: BarisKontrak[], nilai: {awal, addendum, berjalan,
    jumlahAddendum}, banding: {menurutKontrak, menurutProyek, selisih,
    cocok, sebab}, co_belum_addendum }` (field `nilai`/`banding`
    diverifikasi PERSIS ke `apps/api/src/lib/kontrak.ts:254-361` —
    `HasilNilai`/`HasilBanding` — bukan ditebak dari nama fungsi;
    ⚠️ `cocok: true` = SESUAI, bukan sebaliknya).
  - `POST /api/v1/kontrak` — `projects:contract` (PM PUNYA izin ini,
    diverifikasi `role_permissions`). Body: `jenis` (`'induk'|'addendum'`),
    `nomor`, `judul`, `tanggal_tanda_tangan`, `tanggal_mulai`,
    `tanggal_selesai`, `nilai`, `retensi_pct`, `syarat_pembayaran`,
    `lingkup`, `catatan`, `project_id`, `kontrak_induk_id` (wajib kalau
    `jenis: 'addendum'`).
  - `PATCH /api/v1/kontrak/:id/status` — `projects:contract`. Body:
    `{ status: 'draf'|'berlaku'|'selesai'|'dibatalkan', alasan? }`.
- `kt-asuransi` (Register Asuransi) — modul BACA + CATAT, TANPA endpoint
  ubah-status (diverifikasi: `asuransi.ts` cuma GET+POST, nol PATCH).
  - `GET /api/v1/asuransi?project_id=` — `projects:contract`. Payload:
    `{ polis: BarisPolisDenganCelah[], jumlah_aktif, jumlah_kadaluarsa,
    jumlah_segera_berakhir, jumlah_belum_berlaku, jumlah_ada_celah,
    proyek_tanpa_polis: string[], total_nilai_pertanggungan }`.
  - `POST /api/v1/asuransi` — `projects:contract`. Body: `project_id`,
    `jenis`, `jenis_lain?`, `nomor_polis`, `penerbit`,
    `nilai_pertanggungan`, `premi`, `periode_mulai`, `periode_selesai`,
    `tertanggung`.

- [ ] **Step 1: Tulis tipe di `_bersama/tipe.ts`**

Tambahkan sesudah `KontrakRingkas` (jangan menggantikannya — perbaiki
komentarnya menjelaskan `kontrak` sebagai entitas kedua, lihat riset di
atas):

```typescript
/**
 * Kontrak sebagai DOKUMEN (induk/addendum) — tabel `kontrak`, migrasi 344.
 * Beda dari `KontrakRingkas`/`ProyekPM`: yang itu nilai BERLAKU di
 * `projects.contract_value` (jalur uang); ini nilai yang DITANDATANGANI,
 * dibandingkan terhadapnya. Bentuk dari `SELECT_KONTRAK`, `kontrak.ts`.
 */
export interface DokumenKontrak {
  id: string
  jenis: "induk" | "addendum"
  nomor: string
  judul: string
  tanggal_tanda_tangan: string
  tanggal_mulai: string | null
  tanggal_selesai: string | null
  nilai: number | string
  retensi_pct: number | string | null
  syarat_pembayaran: string | null
  lingkup: string | null
  status: "draf" | "berlaku" | "selesai" | "dibatalkan"
  alasan_batal: string | null
  file_url: string | null
  catatan: string | null
  project_id: string
  client_id: string | null
  kontrak_induk_id: string | null
  dibuat_pada: string
  proyek?: { id: string; name: string; contract_value: number | string } | null
  klien?: { id: string; company_name: string | null; contact_person: string | null } | null
  induk?: { id: string; nomor: string; judul: string } | null
}

/**
 * Bentuk `HasilNilai` — `hitungNilaiKontrak()`, `apps/api/src/lib/kontrak.ts:254-262`.
 * `nilai` dari `GET /api/v1/kontrak/proyek/:id`. Field PERSIS diverifikasi
 * ke kode: `awal` (BUKAN `induk`), `jumlahAddendum` disertakan (jumlah
 * baris addendum yang ikut dihitung, bukan nilainya).
 */
export interface NilaiKontrakBerjalan {
  /** Nilai kontrak INDUK yang berlaku — apa yang mula-mula ditandatangani. */
  awal: number
  /** Σ addendum berlaku. Bisa negatif (pengurangan lingkup). */
  addendum: number
  /** awal + addendum — nilai kontraktual berjalan. */
  berjalan: number
  jumlahAddendum: number
}

/**
 * Bentuk `HasilBanding` — `bandingkanNilai()`, `apps/api/src/lib/kontrak.ts:306-314`.
 * `banding` dari `GET /api/v1/kontrak/proyek/:id`. ⚠️ `cocok: true` berarti
 * SESUAI (bukan "perlu perhatian") — logika kebalikan dari nama yang
 * ditulis draf breakdown pertama (`perlu_perhatian`). Field asli:
 * `menurutKontrak`, `menurutProyek`, `selisih`, `cocok`, `sebab` — TIDAK
 * ada `keterangan`.
 */
export interface BandingNilaiKontrak {
  /** Nilai menurut dokumen kontrak. */
  menurutKontrak: number
  /** Nilai yang dipakai jalur uang (`projects.contract_value`). */
  menurutProyek: number
  selisih: number
  /** true = nilai dokumen cocok dengan nilai penagihan. false = ADA selisih yang perlu dilihat. */
  cocok: boolean
  sebab: string
}

export interface RespKontrakProyek {
  proyek: { id: string; name: string; contract_value: number | string } | null
  kontrak: DokumenKontrak[]
  nilai: NilaiKontrakBerjalan
  banding: BandingNilaiKontrak
  co_belum_addendum: number
}

/**
 * Polis asuransi + celah pertanggungan. Bentuk `PolisTerhitung`,
 * `apps/api/src/lib/register-asuransi.ts:73-100` — dibaca LANGSUNG dari
 * kode (bukan tebakan dari nama fungsi), dipanggil `asuransi.ts`.
 *
 * ⚠️ Field turunan bernama `status` (BUKAN `keadaan`) — dan field ini
 * MENIMPA kolom `status` mentah dari tabel `polis_asuransi` di objek yang
 * sama (lib membangun objek baru dari baris DB, kolom mentahnya tak ikut
 * terbawa ke tipe ini). `sisa_hari` (BUKAN `hari_tersisa`) — negatif
 * berarti sudah lewat, ditegaskan di komentar lib.
 */
export interface PolisAsuransi {
  id: string
  project_id: string
  project_name: string
  jenis: "car" | "tpl" | "jamsostek" | "car_tpl" | "lainnya"
  /** Nama jenis siap-tampil; dipakai bila `jenis === 'lainnya'`. */
  jenis_label: string
  nomor_polis: string
  penerbit: string
  nilai_pertanggungan: number | null
  periode_mulai: string
  periode_selesai: string
  /** Field TURUNAN (dihitung server) — bukan kolom mentah `status` dari DB. */
  status: "aktif" | "kadaluarsa" | "belum_berlaku" | "segera_berakhir" | "dibatalkan"
  /** Sisa hari sampai berakhir. Negatif = sudah lewat. */
  sisa_hari: number
  /** Hari masa proyek yang TIDAK tertanggung. null = tanggal proyek tak diketahui (BEDA dari 0). */
  celah_hari: number | null
  /** Polis mulai SESUDAH proyek jalan. */
  celah_awal: number
  /** Polis berakhir SEBELUM proyek usai. */
  celah_akhir: number
}

/** Bentuk `HasilRegister`, `apps/api/src/lib/register-asuransi.ts:102-118`. */
export interface RespAsuransi {
  polis: PolisAsuransi[]
  jumlah_aktif: number
  jumlah_kadaluarsa: number
  jumlah_segera_berakhir: number
  jumlah_belum_berlaku: number
  /** Polis yang meninggalkan hari proyek tanpa pertanggungan. */
  jumlah_ada_celah: number
  /** Proyek yang TIDAK punya satu polis pun — dinyatakan supaya "nol kadaluarsa" tak terbaca "semua aman". */
  proyek_tanpa_polis: Array<{ project_id: string; project_name: string }>
  total_nilai_pertanggungan: number
}
```

- [ ] **Step 2: Tulis `kontrak-lengkap/register/page.tsx`**

Pola: pemilih proyek (seperti `pm-portal/kontrak/page.tsx`), lalu daftar
`DokumenKontrak` per proyek dari `GET /api/v1/kontrak/proyek/:id` — kartu
kontrak induk di atas (dengan badge `StatusBadge`), addendum-addendumnya
di bawahnya berindentasi (variant='netral' badge kecil "Addendum #n").
Tampilkan panel banding (`banding.selisih`, `banding.sebab`) dengan warna
`--warning` kalau `!banding.cocok` (⚠️ `cocok: true` = SESUAI — logikanya
KEBALIKAN dari nama; banner tampil saat `cocok` FALSE, bukan saat
`perlu_perhatian` — field itu tak ada di backend). Tombol "+ Kontrak
Baru"/"+ Addendum" buka `BottomSheet` dengan form disederhanakan (nomor,
judul, tanggal tanda tangan, nilai, retensi %, syarat pembayaran) — field
`lingkup`/`catatan` sebagai textarea opsional collapsed by default (§1
spec: modul kompleks disederhanakan, bukan direplikasi field-per-field).
PM punya `projects:contract` jadi form CREATE disertakan (bukan baca
saja). Transisi status (`draf→berlaku→selesai`/`dibatalkan`) sebagai
tombol aksi di kartu detail — bukan swipe (bukan approval biner
approve/reject, ini siklus dokumen 4 status).

```typescript
"use client";

import { useMemo, useState } from "react";
import { FileSignature, Plus, AlertTriangle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespKontrakProyek, DokumenKontrak, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  draf: "Draf", berlaku: "Berlaku", selesai: "Selesai", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draf: "netral", berlaku: "approved", selesai: "info", dibatalkan: "rejected",
};
const TRANSISI: Record<string, string[]> = {
  draf: ["berlaku", "dibatalkan"],
  berlaku: ["selesai", "dibatalkan"],
  selesai: [],
  dibatalkan: [],
};

export default function PmRegisterKontrakPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [jenisBaru, setJenisBaru] = useState<"induk" | "addendum">("induk");
  const [indukDipilih, setIndukDipilih] = useState<DokumenKontrak | null>(null);
  const [form, setForm] = useState({ nomor: "", judul: "", tanggal_tanda_tangan: "", nilai: "", retensi_pct: "", syarat_pembayaran: "" });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/kontrak/proyek/${proyekAktif}` : null;
  const { data, memuat, galat } = useData<RespKontrakProyek>(url);

  const induk = useMemo(() => (data?.kontrak ?? []).filter((k) => k.jenis === "induk"), [data]);
  const addendumPerInduk = useMemo(() => {
    const m = new Map<string, DokumenKontrak[]>();
    for (const k of data?.kontrak ?? []) {
      if (k.jenis !== "addendum" || !k.kontrak_induk_id) continue;
      m.set(k.kontrak_induk_id, [...(m.get(k.kontrak_induk_id) ?? []), k]);
    }
    return m;
  }, [data]);

  function bukaForm(jenis: "induk" | "addendum", induk?: DokumenKontrak) {
    setJenisBaru(jenis);
    setIndukDipilih(induk ?? null);
    setForm({ nomor: "", judul: "", tanggal_tanda_tangan: "", nilai: "", retensi_pct: "", syarat_pembayaran: "" });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function simpanKontrak() {
    if (!proyekAktif) return;
    if (form.nomor.trim().length === 0 || form.judul.trim().length === 0) {
      setGalatForm("Nomor dan judul wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/kontrak", {
        project_id: proyekAktif,
        jenis: jenisBaru,
        kontrak_induk_id: jenisBaru === "addendum" ? indukDipilih?.id : undefined,
        nomor: form.nomor.trim(),
        judul: form.judul.trim(),
        tanggal_tanda_tangan: form.tanggal_tanda_tangan || undefined,
        nilai: form.nilai ? Number(form.nilai) : undefined,
        retensi_pct: form.retensi_pct ? Number(form.retensi_pct) : undefined,
        syarat_pembayaran: form.syarat_pembayaran.trim() || undefined,
      });
      setSheetTerbuka(false);
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan kontrak"));
    } finally {
      setMengirim(false);
    }
  }

  async function ubahStatus(k: DokumenKontrak, status: string) {
    try {
      await api.patch(`/api/v1/kontrak/${k.id}/status`, { status });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengubah status kontrak"));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Register Kontrak
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={FileSignature} judul="Pilih proyek" deskripsi="Kontrak tercatat per proyek." />}
      {memuat && <SkeletonCard tinggi={160} />}
      {galat && <EmptyState icon={FileSignature} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {/* cocok: true = SESUAI — banner tampil saat cocok FALSE (ada selisih), bukan sebaliknya */}
      {!memuat && data?.banding && !data.banding.cocok && (
        <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <AlertTriangle size={16} color="var(--warning)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--on-warning-bg)" }}>Selisih nilai kontrak: {fmtRupiah(data.banding.selisih)}</div>
            <div style={{ fontSize: 12, color: "var(--on-warning-bg)", marginTop: 2 }}>{data.banding.sebab}</div>
          </div>
        </div>
      )}

      {!memuat && proyekAktif && induk.length === 0 && (
        <EmptyState icon={FileSignature} judul="Belum ada kontrak" deskripsi="Kontrak induk proyek ini belum dicatat." />
      )}

      {!memuat && induk.map((k) => (
        <div key={k.id} style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.nomor}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{k.judul}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[k.status] ?? "netral"} label={LABEL_STATUS[k.status] ?? k.status} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(k.nilai)}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            TTD {fmtTanggal(k.tanggal_tanda_tangan)} · Retensi {k.retensi_pct ?? "—"}%
          </div>

          {(addendumPerInduk.get(k.id) ?? []).map((a) => (
            <div key={a.id} style={{ marginLeft: 16, paddingLeft: 12, borderLeft: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{a.nomor} · {a.judul}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{fmtRupiah(a.nilai)}</div>
              </div>
              <StatusBadge status={VARIAN_STATUS[a.status] ?? "netral"} label={LABEL_STATUS[a.status] ?? a.status} />
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {(TRANSISI[k.status] ?? []).map((tujuan) => (
              <button
                key={tujuan}
                type="button"
                onClick={() => ubahStatus(k, tujuan)}
                style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                → {LABEL_STATUS[tujuan]}
              </button>
            ))}
            {k.status === "berlaku" && (
              <button
                type="button"
                onClick={() => bukaForm("addendum", k)}
                style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--info-bg)", color: "var(--navy)", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                + Addendum
              </button>
            )}
          </div>
        </div>
      ))}

      {!memuat && proyekAktif && (
        <button
          type="button"
          onClick={() => bukaForm("induk")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          <Plus size={18} aria-hidden="true" /> Kontrak Induk Baru
        </button>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul={jenisBaru === "induk" ? "Kontrak Induk Baru" : `Addendum — ${indukDipilih?.nomor ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor
            <input type="text" value={form.nomor} onChange={(e) => setForm((f) => ({ ...f, nomor: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Judul
            <input type="text" value={form.judul} onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Tanda Tangan
            <input type="date" value={form.tanggal_tanda_tangan} onChange={(e) => setForm((f) => ({ ...f, tanggal_tanda_tangan: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai (Rp)
            <input type="number" value={form.nilai} onChange={(e) => setForm((f) => ({ ...f, nilai: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Retensi (%)
            <input type="number" value={form.retensi_pct} onChange={(e) => setForm((f) => ({ ...f, retensi_pct: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={simpanKontrak} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
```

- [x] **Step 3: Baca `apps/api/src/lib/register-asuransi.ts` untuk bentuk
per-polis** — SELESAI (fix round ini): `PolisTerhitung`/`HasilRegister`
dibaca langsung, `PolisAsuransi`/`RespAsuransi` di Step 1 sudah
diperbaiki mengikuti nama field asli (`status` bukan `keadaan`,
`sisa_hari` bukan `hari_tersisa`, plus `celah_hari`/`celah_awal`/
`celah_akhir`/`jenis_label`/`project_name` yang sebelumnya hilang total,
dan `proyek_tanpa_polis` yang bentuknya array objek bukan array string).

- [ ] **Step 4: Tulis `kontrak-lengkap/asuransi/page.tsx`**

```typescript
"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespAsuransi, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  aktif: "Aktif", kadaluarsa: "Kadaluarsa", belum_berlaku: "Belum Berlaku",
  segera_berakhir: "Segera Berakhir", dibatalkan: "Dibatalkan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  aktif: "approved", kadaluarsa: "rejected", belum_berlaku: "netral",
  segera_berakhir: "pending", dibatalkan: "netral",
};
const LABEL_JENIS: Record<string, string> = {
  car: "CAR", tpl: "TPL", jamsostek: "Jamsostek", car_tpl: "CAR + TPL", lainnya: "Lainnya",
};

export default function PmAsuransiPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [form, setForm] = useState({
    jenis: "car", jenis_lain: "", nomor_polis: "", penerbit: "",
    nilai_pertanggungan: "", premi: "", periode_mulai: "", periode_selesai: "", tertanggung: "",
  });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/asuransi?project_id=${proyekAktif}` : "/api/v1/asuransi";
  const { data, memuat, galat } = useData<RespAsuransi>(url);

  function bukaForm() {
    setForm({ jenis: "car", jenis_lain: "", nomor_polis: "", penerbit: "", nilai_pertanggungan: "", premi: "", periode_mulai: "", periode_selesai: "", tertanggung: "" });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function simpanPolis() {
    if (!proyekAktif) {
      setGalatForm("Pilih proyek terlebih dulu.");
      return;
    }
    if (form.nomor_polis.trim().length === 0 || form.penerbit.trim().length === 0) {
      setGalatForm("Nomor polis dan penerbit wajib diisi.");
      return;
    }
    if (!form.periode_mulai || !form.periode_selesai) {
      setGalatForm("Periode mulai dan selesai wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/asuransi", {
        project_id: proyekAktif,
        jenis: form.jenis,
        jenis_lain: form.jenis === "lainnya" ? form.jenis_lain.trim() || undefined : undefined,
        nomor_polis: form.nomor_polis.trim(),
        penerbit: form.penerbit.trim(),
        nilai_pertanggungan: form.nilai_pertanggungan ? Number(form.nilai_pertanggungan) : undefined,
        premi: form.premi ? Number(form.premi) : undefined,
        periode_mulai: form.periode_mulai,
        periode_selesai: form.periode_selesai,
        tertanggung: form.tertanggung.trim() || undefined,
      });
      setSheetTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan polis"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Register Asuransi
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            <option value="">Semua proyek</option>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {memuat && <SkeletonCard tinggi={160} />}
      {galat && <EmptyState icon={ShieldCheck} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && data && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Aktif", value: data.jumlah_aktif, warna: "var(--success)" },
            { label: "Segera Berakhir", value: data.jumlah_segera_berakhir, warna: "var(--warning)" },
            { label: "Kadaluarsa", value: data.jumlah_kadaluarsa, warna: "var(--danger)" },
            { label: "Tanpa Polis", value: data.proyek_tanpa_polis.length, warna: "var(--text-secondary)" },
          ].map((k) => (
            <div key={k.label} style={{ flex: "1 1 45%", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.warna }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {!memuat && (data?.polis?.length ?? 0) === 0 && (
        <EmptyState icon={ShieldCheck} judul="Belum ada polis" deskripsi="Polis asuransi proyek akan muncul di sini." />
      )}

      {!memuat && data?.polis.map((p) => (
        <div key={p.id} style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{p.nomor_polis}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{p.jenis_label} · {p.project_name}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[p.status] ?? "netral"} label={LABEL_STATUS[p.status] ?? p.status} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Penerbit: {p.penerbit}</div>
          {p.nilai_pertanggungan !== null && (
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(p.nilai_pertanggungan)}</div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {fmtTanggal(p.periode_mulai)} — {fmtTanggal(p.periode_selesai)}
            {p.status === "aktif" && ` · sisa ${p.sisa_hari} hari`}
          </div>
          {(p.celah_awal > 0 || p.celah_akhir > 0) && (
            <div role="alert" style={{ fontSize: 11, color: "var(--on-warning-bg)", background: "var(--warning-bg)", padding: "6px 10px", borderRadius: 8 }}>
              Ada celah {p.celah_hari ?? "—"} hari masa proyek tanpa pertanggungan.
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={bukaForm}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
      >
        <Plus size={18} aria-hidden="true" /> Polis Baru
      </button>

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Polis Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Jenis
            <select value={form.jenis} onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              {Object.entries(LABEL_JENIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {form.jenis === "lainnya" && (
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Jenis Lainnya
              <input type="text" value={form.jenis_lain} onChange={(e) => setForm((f) => ({ ...f, jenis_lain: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
            </label>
          )}
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor Polis
            <input type="text" value={form.nomor_polis} onChange={(e) => setForm((f) => ({ ...f, nomor_polis: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Penerbit
            <input type="text" value={form.penerbit} onChange={(e) => setForm((f) => ({ ...f, penerbit: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai Pertanggungan (Rp)
            <input type="number" value={form.nilai_pertanggungan} onChange={(e) => setForm((f) => ({ ...f, nilai_pertanggungan: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Premi (Rp)
            <input type="number" value={form.premi} onChange={(e) => setForm((f) => ({ ...f, premi: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Periode Mulai
            <input type="date" value={form.periode_mulai} onChange={(e) => setForm((f) => ({ ...f, periode_mulai: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Periode Selesai
            <input type="date" value={form.periode_selesai} onChange={(e) => setForm((f) => ({ ...f, periode_selesai: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tertanggung
            <input type="text" value={form.tertanggung} onChange={(e) => setForm((f) => ({ ...f, tertanggung: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={simpanPolis} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan Polis"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
```

Endpoint tak menyediakan PATCH status (read+create saja, sesuai riset
Step 1) — halaman ini karena itu TANPA tombol ubah status, `status` per
polis murni ditampilkan (turunan server, bukan bisa disunting).

- [ ] **Step 5: Typecheck, lint, penjaga (pola sama Task 6 Step 6-8)**

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm exec eslint app/pm-portal/kontrak-lengkap/
node scripts/uji-token-css-ada.mjs
node scripts/uji-tombol-primer-seragam.mjs
node scripts/kerapatan-ratchet.mjs
cd ../api && node scripts/audit-halaman-pakai-cache.mjs
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pm-portal/kontrak-lengkap/register apps/web/app/pm-portal/kontrak-lengkap/asuransi apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): Register Kontrak, Asuransi — kelompok Kontrak bagian 1"
```

---

### Task 13: EOT + Denda Keterlambatan + Register Jaminan — halaman baru

**Files:**
- Create: `apps/web/app/pm-portal/kontrak-lengkap/eot-ld-bond/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Riset (Task 11 Step 1)**: `kt-eot`/`kt-ld`/`kt-bond` di web adalah TAB
`sec-info` pada `/proyek/[id]` admin (`tabProyek: 'sec-info'`, dari
`peta-menu.ts`) — bukan tiga halaman berdiri sendiri. `pm-portal/proyek/
[id]/page.tsx` PM SAAT INI cuma redirect ke `/proyek/:id` admin (bukan
hub tab sendiri — dikonfirmasi baca filenya, 16 baris, murni
`router.replace`). Membangun hub tab PM penuh (pola `portal/proyek/[id]`
klien, 750 baris) adalah pekerjaan besar tersendiri yang lebih pas
ditangani Task 16 (navigasi) atau tahap terpisah — **untuk Tahap 2 ini,
ketiganya digabung SATU halaman standalone dengan `SegmentedTab` 3-arah**
(pola sama `pm-portal/jadwal/page.tsx` yang menggabung CPM+Baseline satu
halaman meski keduanya modul beda), bukan menunggu hub proyek dulu.
Endpoint semuanya SUDAH per-proyek (`/api/v1/projects/:id/eot`, dst),
jadi tak butuh hub untuk berfungsi.

Ketiganya `projects:view` (baca) / `projects:edit` (aksi) — PM punya
KEDUANYA:

- `GET /api/v1/projects/:id/eot` → `{ data: EotProyek[], meta:
  HasilTanggalEfektif }`. `meta` diverifikasi PERSIS ke
  `apps/api/src/lib/rantai-kontrak.ts:53-62,81-97` (`tanggalSelesaiEfektif()`):
  `{ tanggalAsli, tanggalEfektif, totalHariEOT, eotMenggantung }` — bukan
  nama yang ditulis draf pertama (`eotDisetujuiHari` tak ada).
- `POST /api/v1/projects/:id/eot` — `projects:edit`. Body: `eot_number?`,
  `days_requested`, `reason` (min 10 karakter).
- `PATCH /api/v1/eot/:id/decide` — `projects:edit`. Body: `{ status:
  'disetujui'|'ditolak', days_approved?, decision_note? }`.
- `GET /api/v1/projects/:id/liquidated-damages` → `{ data: HasilLD,
  meta: { label: string, peringatan: string | null } }`. `HasilLD`
  diverifikasi PERSIS ke `rantai-kontrak.ts:161-178`: `{ adaDenda,
  hariTelat, dasarPerhitungan, dendaSebelumBatas, batasNominal, denda,
  kenaBatas, tanggal: HasilTanggalEfektif, alasan: string | null }`.
  TAK ADA endpoint POST/PATCH untuk modul ini — murni baca (dikonfirmasi
  ulang: `rantai-kontrak.ts` hanya satu `app.get` untuk `liquidated-damages`).
- `GET /api/v1/bonds?project_id=&status=` → `{ data: BondProyek[], meta:
  RingkasBond }`. `RingkasBond` diverifikasi PERSIS ke
  `rantai-kontrak.ts:264-271`: `{ totalAktif, jumlahAktif, segeraKadaluarsa:
  Array<BondProyek & {sisaHari}>, telatDiperbarui: BondProyek[] }`.
  `POST /api/v1/bonds` — `projects:edit`. Body: `project_id` atau
  `bid_id`, `bond_type`
  (`'penawaran'|'pelaksanaan'|'uang_muka'|'pemeliharaan'`), `bond_number?`,
  `issuer?`, `amount`, `issued_date`, `expiry_date`, `notes?`.
  `PATCH /api/v1/bonds/:id` — `projects:edit`, field bebas dari daftar
  putih (`bond_number`, `issuer`, `amount`, `issued_date`, `expiry_date`,
  `status`, `released_at`, `notes`).

- [x] **Step 1: Baca `apps/api/src/lib/rantai-kontrak.ts`** untuk bentuk
persis `hitungLD()` (field `HasilLD`), `tanggalSelesaiEfektif()`
(`HasilTanggalEfektif`), dan `ringkasBond()` (`RingkasBond`) — SELESAI
(fix round ini), lihat riset di atas dan tipe Step 2 di bawah, semua
field diambil langsung dari definisi interface di kode, bukan ditebak
dari nama fungsi.

- [ ] **Step 2: Tulis tipe di `_bersama/tipe.ts`**

```typescript
/** `contract_eot` — bentuk dari `GET /api/v1/projects/:id/eot`, kolom `select` eksplisit di route. */
export interface EotProyek {
  id: string
  eot_number: string | null
  days_requested: number
  days_approved: number | null
  reason: string
  status: "diajukan" | "disetujui" | "ditolak"
  submitted_at: string
  decided_at: string | null
  decision_note: string | null
  created_at: string
}

/** Bentuk `HasilTanggalEfektif`, `apps/api/src/lib/rantai-kontrak.ts:53-62`. `meta` dari `GET .../eot`. */
export interface TanggalEfektifKontrak {
  /** Tanggal kontrak asli, tak pernah berubah. */
  tanggalAsli: string
  /** Tanggal setelah seluruh EOT yang DISETUJUI. */
  tanggalEfektif: string
  /** Total hari yang ditambahkan oleh EOT disetujui. */
  totalHariEOT: number
  /** Berapa pengajuan yang masih menggantung — penting ditampilkan bersama LD. */
  eotMenggantung: number
}
export interface RespEot { data: EotProyek[]; meta: TanggalEfektifKontrak }

/** Bentuk `HasilLD`, `apps/api/src/lib/rantai-kontrak.ts:161-178`. `data` dari `GET .../liquidated-damages`. */
export interface HasilLD {
  /** `true` bila ada denda yang benar-benar terhitung. */
  adaDenda: boolean
  hariTelat: number
  dasarPerhitungan: number
  dendaSebelumBatas: number
  batasNominal: number
  denda: number
  /** `true` bila denda menyentuh batas — sinyal kontrak layak diputus. */
  kenaBatas: boolean
  tanggal: TanggalEfektifKontrak
  /** Kenapa dendanya nol / tak dihitung — supaya "0" tak ambigu. */
  alasan: string | null
}
export interface RespLd {
  data: HasilLD
  meta: { label: string; peringatan: string | null }
}

/** `contract_bonds` — bentuk dari `GET /api/v1/bonds` (`select` eksplisit route). */
export interface BondProyek {
  id: string
  project_id: string | null
  bid_id: string | null
  bond_type: "penawaran" | "pelaksanaan" | "uang_muka" | "pemeliharaan"
  bond_number: string | null
  issuer: string | null
  amount: number | string
  issued_date: string
  expiry_date: string
  status: "aktif" | "dikembalikan" | "dicairkan" | "kadaluarsa"
  released_at: string | null
  notes: string | null
}
/** Bentuk `RingkasBond`, `apps/api/src/lib/rantai-kontrak.ts:264-271`. `meta` dari `GET /api/v1/bonds`. */
export interface RingkasBond {
  totalAktif: number
  jumlahAktif: number
  /** Jaminan yang kadaluarsa ≤ N hari — uang yang bisa hangus bila terlewat. */
  segeraKadaluarsa: Array<BondProyek & { sisaHari: number }>
  /** Sudah lewat tanggal tapi statusnya masih 'aktif' — data yang perlu dirapikan. */
  telatDiperbarui: BondProyek[]
}
export interface RespBond { data: BondProyek[]; meta: RingkasBond }
```

- [ ] **Step 3: Tulis `kontrak-lengkap/eot-ld-bond/page.tsx`**

```typescript
"use client";

import { useMemo, useState } from "react";
import { CalendarClock, TriangleAlert, ShieldCheck, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { ProyekPM, RespEot, RespLd, RespBond, EotProyek, BondProyek, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_EOT: Record<string, string> = { diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak" };
const VARIAN_EOT: Record<string, VarianStatus> = { diajukan: "pending", disetujui: "approved", ditolak: "rejected" };
const LABEL_BOND: Record<string, string> = {
  penawaran: "Jaminan Penawaran", pelaksanaan: "Jaminan Pelaksanaan",
  uang_muka: "Jaminan Uang Muka", pemeliharaan: "Jaminan Pemeliharaan",
};
const LABEL_STATUS_BOND: Record<string, string> = {
  aktif: "Aktif", dikembalikan: "Dikembalikan", dicairkan: "Dicairkan", kadaluarsa: "Kadaluarsa",
};
const VARIAN_STATUS_BOND: Record<string, VarianStatus> = {
  aktif: "approved", dicairkan: "info", dikembalikan: "netral", kadaluarsa: "rejected",
};

export default function PmEotLdBondPage() {
  const [tab, setTab] = useState<"eot" | "ld" | "bond">("eot");
  const [proyekId, setProyekId] = useState("");

  const [sheetEot, setSheetEot] = useState(false);
  const [formEot, setFormEot] = useState({ eot_number: "", days_requested: "", reason: "" });

  const [eotDiputuskan, setEotDiputuskan] = useState<EotProyek | null>(null);
  const [daysApproved, setDaysApproved] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const [sheetBond, setSheetBond] = useState(false);
  const [formBond, setFormBond] = useState({ bond_type: "pelaksanaan", bond_number: "", issuer: "", amount: "", issued_date: "", expiry_date: "" });

  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlEot = proyekAktif ? `/api/v1/projects/${proyekAktif}/eot` : null;
  const { data: dataEot, memuat: memuatEot, galat: galatEot } = useData<RespEot>(tab === "eot" ? urlEot : null);

  const urlLd = proyekAktif ? `/api/v1/projects/${proyekAktif}/liquidated-damages` : null;
  const { data: dataLd, memuat: memuatLd, galat: galatLd } = useData<RespLd>(tab === "ld" ? urlLd : null);

  const urlBond = proyekAktif ? `/api/v1/bonds?project_id=${proyekAktif}` : null;
  const { data: dataBond, memuat: memuatBond, galat: galatBond } = useData<RespBond>(tab === "bond" ? urlBond : null);

  async function ajukanEot() {
    if (!proyekAktif) return;
    const hari = Number(formEot.days_requested);
    if (!Number.isFinite(hari) || hari < 0) {
      setGalatForm("Jumlah hari tidak sah.");
      return;
    }
    if (formEot.reason.trim().length < 10) {
      setGalatForm("Alasan wajib diisi, minimal 10 karakter.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/projects/${proyekAktif}/eot`, {
        eot_number: formEot.eot_number.trim() || undefined,
        days_requested: Math.trunc(hari),
        reason: formEot.reason.trim(),
      });
      setSheetEot(false);
      setFormEot({ eot_number: "", days_requested: "", reason: "" });
      invalidasi(urlEot ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengajukan EOT"));
    } finally {
      setMengirim(false);
    }
  }

  async function putuskanEot(status: "disetujui" | "ditolak") {
    if (!eotDiputuskan) return;
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/eot/${eotDiputuskan.id}/decide`, {
        status,
        days_approved: status === "disetujui" && daysApproved ? Number(daysApproved) : undefined,
        decision_note: decisionNote.trim() || undefined,
      });
      setEotDiputuskan(null);
      setDaysApproved("");
      setDecisionNote("");
      invalidasi(urlEot ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal memutuskan EOT"));
    } finally {
      setMengirim(false);
    }
  }

  async function simpanBond() {
    if (!proyekAktif) return;
    if (!formBond.issued_date || !formBond.expiry_date) {
      setGalatForm("Tanggal terbit dan kadaluarsa wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post("/api/v1/bonds", {
        project_id: proyekAktif,
        bond_type: formBond.bond_type,
        bond_number: formBond.bond_number.trim() || undefined,
        issuer: formBond.issuer.trim() || undefined,
        amount: formBond.amount ? Number(formBond.amount) : undefined,
        issued_date: formBond.issued_date,
        expiry_date: formBond.expiry_date,
      });
      setSheetBond(false);
      invalidasi(urlBond ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan jaminan"));
    } finally {
      setMengirim(false);
    }
  }

  async function ubahStatusBond(b: BondProyek, status: string) {
    try {
      await api.patch(`/api/v1/bonds/${b.id}`, { status, released_at: status === "dikembalikan" ? new Date().toISOString().slice(0, 10) : undefined });
      invalidasi(urlBond ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengubah status jaminan"));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        EOT, Denda &amp; Jaminan
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[{ value: "eot", label: "EOT" }, { value: "ld", label: "Denda" }, { value: "bond", label: "Jaminan" }]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {!proyekAktif && <EmptyState icon={CalendarClock} judul="Pilih proyek" deskripsi="Data ini tercatat per proyek." />}

      {proyekAktif && tab === "eot" && (
        <>
          {memuatEot && <SkeletonCard tinggi={100} />}
          {galatEot && <EmptyState icon={CalendarClock} judul="Gagal memuat" deskripsi={pesanGalat(galatEot as GalatApi, "Coba muat ulang.")} />}
          {dataEot?.meta && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: 10, borderRadius: 10, background: "var(--surface-subtle)" }}>
              Tanggal efektif: {fmtTanggal(dataEot.meta.tanggalEfektif)} (asli {fmtTanggal(dataEot.meta.tanggalAsli)} + {dataEot.meta.totalHariEOT} hari EOT disetujui)
              {dataEot.meta.eotMenggantung > 0 && ` · ${dataEot.meta.eotMenggantung} pengajuan belum diputus`}
            </div>
          )}
          {!memuatEot && (dataEot?.data?.length ?? 0) === 0 && (
            <EmptyState icon={CalendarClock} judul="Belum ada pengajuan EOT" deskripsi="Perpanjangan waktu proyek ini akan muncul di sini." />
          )}
          {!memuatEot && dataEot?.data.map((e) => (
            <div key={e.id} style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{e.eot_number ?? "EOT"} · {e.days_requested} hari</div>
                  {e.days_approved !== null && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Disetujui: {e.days_approved} hari</div>}
                </div>
                <StatusBadge status={VARIAN_EOT[e.status] ?? "netral"} label={LABEL_EOT[e.status] ?? e.status} />
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{e.reason}</div>
              {e.status === "diajukan" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => { setEotDiputuskan(e); setDaysApproved(String(e.days_requested)); setDecisionNote(""); setGalatForm(null); }}
                    style={{ flex: 1, minHeight: 40, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Putuskan
                  </button>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => { setSheetEot(true); setFormEot({ eot_number: "", days_requested: "", reason: "" }); setGalatForm(null); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            <Plus size={18} aria-hidden="true" /> Ajukan EOT
          </button>
        </>
      )}

      {proyekAktif && tab === "ld" && (
        <>
          {memuatLd && <SkeletonCard tinggi={160} />}
          {galatLd && <EmptyState icon={TriangleAlert} judul="Gagal memuat" deskripsi={pesanGalat(galatLd as GalatApi, "Coba muat ulang.")} />}
          {!memuatLd && dataLd && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: dataLd.meta.label.startsWith("Angka final") ? "var(--success)" : "var(--warning)" }}>
                {dataLd.meta.label}
              </div>
              {dataLd.meta.peringatan && (
                <div role="alert" style={{ fontSize: 12, color: "var(--on-warning-bg)", background: "var(--warning-bg)", padding: 10, borderRadius: 10 }}>
                  {dataLd.meta.peringatan}
                </div>
              )}
              {!dataLd.data.adaDenda ? (
                <EmptyState icon={ShieldCheck} judul="Tidak ada denda" deskripsi={dataLd.data.alasan ?? "Proyek ini tidak terkena denda keterlambatan."} />
              ) : (
                <div style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Denda {dataLd.data.kenaBatas ? "(menyentuh batas)" : ""}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--danger)" }}>{fmtRupiah(dataLd.data.denda)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Telat {dataLd.data.hariTelat} hari · dasar {fmtRupiah(dataLd.data.dasarPerhitungan)} · batas {fmtRupiah(dataLd.data.batasNominal)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {proyekAktif && tab === "bond" && (
        <>
          {memuatBond && <SkeletonCard tinggi={100} />}
          {galatBond && <EmptyState icon={ShieldCheck} judul="Gagal memuat" deskripsi={pesanGalat(galatBond as GalatApi, "Coba muat ulang.")} />}
          {dataBond?.meta && dataBond.meta.segeraKadaluarsa.length > 0 && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-warning-bg)", background: "var(--warning-bg)", padding: 10, borderRadius: 10 }}>
              {dataBond.meta.segeraKadaluarsa.length} jaminan segera kadaluarsa.
            </div>
          )}
          {!memuatBond && (dataBond?.data?.length ?? 0) === 0 && (
            <EmptyState icon={ShieldCheck} judul="Belum ada jaminan" deskripsi="Register jaminan proyek ini belum dicatat." />
          )}
          {!memuatBond && dataBond?.data.map((b) => (
            <div key={b.id} style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{LABEL_BOND[b.bond_type]}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{b.bond_number ?? "—"} · {b.issuer ?? "—"}</div>
                </div>
                <StatusBadge status={VARIAN_STATUS_BOND[b.status] ?? "netral"} label={LABEL_STATUS_BOND[b.status] ?? b.status} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(b.amount)}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {fmtTanggal(b.issued_date)} — {fmtTanggal(b.expiry_date)}
              </div>
              {b.status === "aktif" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => ubahStatusBond(b, "dicairkan")}
                    style={{ flex: 1, minHeight: 36, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Tandai Dicairkan
                  </button>
                  <button type="button" onClick={() => ubahStatusBond(b, "dikembalikan")}
                    style={{ flex: 1, minHeight: 36, borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Tandai Dikembalikan
                  </button>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => { setSheetBond(true); setFormBond({ bond_type: "pelaksanaan", bond_number: "", issuer: "", amount: "", issued_date: "", expiry_date: "" }); setGalatForm(null); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            <Plus size={18} aria-hidden="true" /> Jaminan Baru
          </button>
        </>
      )}

      <BottomSheet terbuka={sheetEot} onTutup={() => setSheetEot(false)} judul="Ajukan EOT">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor EOT (opsional)
            <input type="text" value={formEot.eot_number} onChange={(e) => setFormEot((f) => ({ ...f, eot_number: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Jumlah Hari
            <input type="number" value={formEot.days_requested} onChange={(e) => setFormEot((f) => ({ ...f, days_requested: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Alasan (min 10 karakter)
            <textarea value={formEot.reason} onChange={(e) => setFormEot((f) => ({ ...f, reason: e.target.value }))} rows={3}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={ajukanEot} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mengajukan…" : "Ajukan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={!!eotDiputuskan} onTutup={() => setEotDiputuskan(null)} judul="Putuskan EOT">
        {eotDiputuskan && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Diajukan: {eotDiputuskan.days_requested} hari — {eotDiputuskan.reason}</div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Hari Disetujui (bila disetujui)
              <input type="number" value={daysApproved} onChange={(e) => setDaysApproved(e.target.value)}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Catatan Keputusan
              <textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2}
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
            </label>
            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => putuskanEot("ditolak")} disabled={mengirim}
                style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
                Tolak
              </button>
              <button type="button" onClick={() => putuskanEot("disetujui")} disabled={mengirim}
                style={{ flex: 1, minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
                {mengirim ? "Memproses…" : "Setujui"}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet terbuka={sheetBond} onTutup={() => setSheetBond(false)} judul="Jaminan Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Jenis
            <select value={formBond.bond_type} onChange={(e) => setFormBond((f) => ({ ...f, bond_type: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              {Object.entries(LABEL_BOND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor
            <input type="text" value={formBond.bond_number} onChange={(e) => setFormBond((f) => ({ ...f, bond_number: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Penerbit
            <input type="text" value={formBond.issuer} onChange={(e) => setFormBond((f) => ({ ...f, issuer: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai (Rp)
            <input type="number" value={formBond.amount} onChange={(e) => setFormBond((f) => ({ ...f, amount: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Terbit
            <input type="date" value={formBond.issued_date} onChange={(e) => setFormBond((f) => ({ ...f, issued_date: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Kadaluarsa
            <input type="date" value={formBond.expiry_date} onChange={(e) => setFormBond((f) => ({ ...f, expiry_date: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={simpanBond} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan Jaminan"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, lint, penjaga**

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm exec eslint app/pm-portal/kontrak-lengkap/eot-ld-bond/
node scripts/uji-token-css-ada.mjs
node scripts/uji-tombol-primer-seragam.mjs
node scripts/kerapatan-ratchet.mjs
cd ../api && node scripts/audit-halaman-pakai-cache.mjs
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pm-portal/kontrak-lengkap/eot-ld-bond apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): EOT, Denda Keterlambatan, Register Jaminan — kelompok Kontrak bagian 2"
```

---

### Task 14: Klaim Kontraktual + Surat Masuk/Keluar — halaman baru

**Files:**
- Create: `apps/web/app/pm-portal/kontrak-lengkap/klaim/page.tsx`
- Create: `apps/web/app/pm-portal/kontrak-lengkap/surat/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Riset (Task 11 Step 1)**:

⚠️ **Nama "klaim" bentrok dua modul berbeda** — jangan tertukar saat
implementasi:
- `kt-claims` (§6 tabel spec: "Claims") = KLAIM KONTRAKTUAL, tabel
  `contract_claims` (migrasi 184), tuntutan biaya kontraktor ke pemberi
  kerja. Endpoint di `rantai-kontrak.ts`, permission `projects:view`/
  `projects:edit` — **PM punya keduanya**.
- Permission `klaim:*` di `role_permissions` (ditemukan saat mengukur PM)
  adalah modul LAIN SAMA SEKALI: Klaim Perjalanan (`klaim-perjalanan.ts`,
  `klaim_perjalanan` — penggantian biaya karyawan yang ditalangi dulu).
  PM cuma punya `klaim:setujui`+`klaim:bayar` (BUKAN `klaim:view`/
  `klaim:kelola`, diverifikasi `role_permissions` — dua baris hilang
  berarti PM tak bisa MELIHAT/MENGAJUKAN klaim perjalanan, hanya
  memutuskan & mencairkan punya orang lain). Modul ini KELUAR scope Task
  14 — ia bukan `kt-claims` dari §6 tabel, dan kemunculannya
  kemungkinan besar lewat inbox approval terpusat yang sudah ada
  (`pm-portal/approval`), bukan halaman berdiri sendiri. **Dicatat di
  sini supaya Task 16 (verifikasi) tidak keliru menganggap ini modul yang
  terlewat** — ia scope-nya beda, bukan lupa dikerjakan.

Endpoint Klaim Kontraktual (`GET/POST /api/v1/projects/:id/claims`,
`PATCH /api/v1/claims/:id/decide`):
- `GET` → `{ data: BarisKlaim[], ringkas: { jumlah, total_diklaim,
  total_disetujui, berisiko_gugur, mendesak } }`. Tiap baris punya
  `batas_pemberitahuan: { keadaan: 'tak_diatur'|'aman'|'berjalan'|
  'mendesak'|'terlambat'|'tak_terbaca', sisaHari: number|null,
  hariTerpakai: number|null, pesan? }` (verified: `evaluasiBatasPemberitahuan`,
  `lib/klaim-kontraktual.ts:59`).
- `POST` — `projects:edit`. Body: `claim_number`, `claim_type?`, `title`
  (min 10 karakter), `description?`, `event_date`, `notified_at?`,
  `notice_days_limit?`, `amount_claimed`, `eot_id?`.
- `PATCH /claims/:id/decide` — `projects:edit`. Body WAJIB `project_id`
  (klaim mewarisi tenancy lewat proyek, bukan lewat id-nya sendiri —
  lihat komentar route), `status`
  (`'disetujui'|'disetujui_sebagian'|'ditolak'|'gugur'`), `amount_approved?`,
  `decision_note?`.

Endpoint Surat (`GET /api/v1/letters` lintas-proyek, `GET/POST
/api/v1/projects/:id/letters`, `PATCH /api/v1/letters/:id`), permission
`documents:manage` (PM punya) untuk KESELURUHAN — bukan permission surat
sendiri (diverifikasi komentar route: "Surat adalah korespondensi
dokumen, dan izin itu sudah ada"):
- `GET /api/v1/letters?arah=&status=&project_id=` → `{ data:
  SuratLintasProyek[], proyek: {id,name}[], ringkas: { jumlah, masuk,
  keluar, kita_belum_menjawab, lawan_belum_menjawab, mendesak } }` —
  dipakai halaman ringkas lintas-proyek (mis. "surat mana yang wajib
  saya jawab hari ini", lintas semua proyek PM).
  Field `batas: { keadaan: 'tak_perlu'|'tak_diatur'|'berjalan'|
  'mendesak'|'lewat'|'tak_terbaca', sisaHari: number|null,
  siapaYangDitunggu: 'kita'|'lawan'|null, pesan? }` (verified:
  `evaluasiBatasBalas`, `lib/surat-korespondensi.ts:61`).
- `POST /api/v1/projects/:id/letters` — Body: `nomor`, `perihal` (min 5
  karakter), `arah` (`'masuk'|'keluar'`), `jenis?`, `ringkasan?`,
  `dari_pihak`, `kepada_pihak` (wajib), `tanggal_kirim?`,
  `tanggal_terima?`, `membalas_id?`, `butuh_balasan?`, `batas_balas?`,
  `status?` (default `'draft'`), `dokumen_id?`.
- `PATCH /api/v1/letters/:id` — Body WAJIB `project_id` (pola sama klaim
  — tenancy lewat proyek), field lain merge di atas nilai lama.

- [ ] **Step 1: Tulis tipe di `_bersama/tipe.ts`**

```typescript
export type KeadaanBatas = "tak_diatur" | "aman" | "berjalan" | "mendesak" | "terlambat" | "tak_terbaca"
export interface BatasPemberitahuan {
  keadaan: KeadaanBatas
  sisaHari: number | null
  hariTerpakai: number | null
  pesan?: string
}

/** `contract_claims` + `batas_pemberitahuan` turunan. Bentuk dari `rantai-kontrak.ts` bagian klaim. */
export interface KlaimKontraktual {
  id: string
  project_id: string
  claim_number: string
  claim_type: string
  title: string
  description: string | null
  event_date: string
  notified_at: string | null
  notice_days_limit: number | null
  amount_claimed: number | string
  amount_approved: number | string | null
  eot_id: string | null
  status: "draft" | "diberitahukan" | "diajukan" | "disetujui" | "disetujui_sebagian" | "ditolak" | "gugur"
  decision_note: string | null
  decided_at: string | null
  batas_pemberitahuan: BatasPemberitahuan
}
export interface RespKlaimKontraktual {
  data: KlaimKontraktual[]
  ringkas: { jumlah: number; total_diklaim: number; total_disetujui: number; berisiko_gugur: number; mendesak: number }
}

export type KeadaanBalas = "tak_perlu" | "tak_diatur" | "berjalan" | "mendesak" | "lewat" | "tak_terbaca"
export interface BatasBalas {
  keadaan: KeadaanBalas
  sisaHari: number | null
  siapaYangDitunggu: "kita" | "lawan" | null
  pesan?: string
}

/** `project_letters`. Bentuk dari `surat.ts` (`BarisSurat` + `lengkapiBatas`). */
export interface SuratProyek {
  id: string
  project_id: string
  nomor: string
  arah: "masuk" | "keluar"
  jenis: string
  perihal: string
  ringkasan: string | null
  dari_pihak: string
  kepada_pihak: string
  tanggal_kirim: string | null
  tanggal_terima: string | null
  membalas_id: string | null
  butuh_balasan: boolean
  batas_balas: string | null
  status: "draft" | "terkirim" | "diterima" | "dibalas" | "selesai" | "kedaluwarsa"
  dokumen_id: string | null
  created_at: string
  batas: BatasBalas
  project_name?: string
}
export interface RespSuratLintasProyek {
  data: SuratProyek[]
  proyek: { id: string; name: string }[]
  ringkas: { jumlah: number; masuk: number; keluar: number; kita_belum_menjawab: number; lawan_belum_menjawab: number; mendesak: number }
}
```

- [ ] **Step 2: Tulis `kontrak-lengkap/klaim/page.tsx`**

```typescript
"use client";

import { useMemo, useState } from "react";
import { Scale, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespKlaimKontraktual, KlaimKontraktual, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", diberitahukan: "Diberitahukan", diajukan: "Diajukan",
  disetujui: "Disetujui", disetujui_sebagian: "Disetujui Sebagian", ditolak: "Ditolak", gugur: "Gugur",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", diberitahukan: "pending", diajukan: "pending",
  disetujui: "approved", disetujui_sebagian: "approved", ditolak: "rejected", gugur: "rejected",
};
const LABEL_BATAS: Record<string, string> = {
  tak_diatur: "Batas tak diatur", aman: "Aman", berjalan: "Berjalan", mendesak: "Mendesak", terlambat: "Terlambat", tak_terbaca: "Tanggal tak terbaca",
};

export default function PmKlaimKontraktualPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetBaru, setSheetBaru] = useState(false);
  const [formBaru, setFormBaru] = useState({ claim_number: "", title: "", event_date: "", amount_claimed: "", notified_at: "", notice_days_limit: "" });
  const [klaimDiputuskan, setKlaimDiputuskan] = useState<KlaimKontraktual | null>(null);
  const [statusPutus, setStatusPutus] = useState<"disetujui" | "disetujui_sebagian" | "ditolak" | "gugur">("disetujui");
  const [amountApproved, setAmountApproved] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/claims` : null;
  const { data, memuat, galat } = useData<RespKlaimKontraktual>(url);

  async function ajukanKlaim() {
    if (!proyekAktif) return;
    if (formBaru.claim_number.trim().length === 0) {
      setGalatForm("Nomor klaim wajib diisi.");
      return;
    }
    if (formBaru.title.trim().length < 10) {
      setGalatForm("Judul klaim wajib diisi, minimal 10 karakter.");
      return;
    }
    const nilai = Number(formBaru.amount_claimed);
    if (!Number.isFinite(nilai) || nilai < 0) {
      setGalatForm("Nilai klaim tidak sah.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/projects/${proyekAktif}/claims`, {
        claim_number: formBaru.claim_number.trim(),
        title: formBaru.title.trim(),
        event_date: formBaru.event_date || undefined,
        amount_claimed: nilai,
        notified_at: formBaru.notified_at || undefined,
        notice_days_limit: formBaru.notice_days_limit ? Number(formBaru.notice_days_limit) : undefined,
      });
      setSheetBaru(false);
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mengajukan klaim"));
    } finally {
      setMengirim(false);
    }
  }

  async function putuskanKlaim() {
    if (!klaimDiputuskan) return;
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.patch(`/api/v1/claims/${klaimDiputuskan.id}/decide`, {
        project_id: klaimDiputuskan.project_id,
        status: statusPutus,
        amount_approved: statusPutus === "disetujui" || statusPutus === "disetujui_sebagian" ? Number(amountApproved) : undefined,
        decision_note: decisionNote.trim() || undefined,
      });
      setKlaimDiputuskan(null);
      setAmountApproved("");
      setDecisionNote("");
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal memutuskan klaim"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Klaim Kontraktual
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Scale} judul="Pilih proyek" deskripsi="Klaim tercatat per proyek." />}
      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={Scale} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && data && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Total Diklaim", value: fmtRupiah(data.ringkas.total_diklaim), warna: "var(--navy)" },
            { label: "Berisiko Gugur", value: String(data.ringkas.berisiko_gugur), warna: "var(--danger)" },
            { label: "Mendesak", value: String(data.ringkas.mendesak), warna: "var(--warning)" },
          ].map((k) => (
            <div key={k.label} style={{ flex: "1 1 30%", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.warna }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {!memuat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState icon={Scale} judul="Belum ada klaim" deskripsi="Tuntutan biaya kontraktual proyek ini akan muncul di sini." />
      )}

      {!memuat && data?.data.map((k) => (
        <div key={k.id} style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.claim_number}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{k.title}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[k.status] ?? "netral"} label={LABEL_STATUS[k.status] ?? k.status} />
          </div>
          {(k.batas_pemberitahuan.keadaan === "mendesak" || k.batas_pemberitahuan.keadaan === "terlambat") && (
            <div role="alert" style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "var(--danger-bg)", padding: "4px 10px", borderRadius: 8, alignSelf: "flex-start" }}>
              {LABEL_BATAS[k.batas_pemberitahuan.keadaan]}
              {k.batas_pemberitahuan.sisaHari !== null && ` · sisa ${k.batas_pemberitahuan.sisaHari} hari`}
            </div>
          )}
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(k.amount_claimed)}</div>
          {k.amount_approved !== null && (
            <div style={{ fontSize: 13, color: "var(--success)" }}>Disetujui: {fmtRupiah(k.amount_approved)}</div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Peristiwa: {fmtTanggal(k.event_date)}</div>
          {(k.status === "diajukan" || k.status === "diberitahukan") && (
            <button type="button" onClick={() => { setKlaimDiputuskan(k); setStatusPutus("disetujui"); setAmountApproved(String(k.amount_claimed)); setDecisionNote(""); setGalatForm(null); }}
              style={{ minHeight: 40, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Putuskan
            </button>
          )}
        </div>
      ))}

      {proyekAktif && (
        <button type="button" onClick={() => { setSheetBaru(true); setFormBaru({ claim_number: "", title: "", event_date: "", amount_claimed: "", notified_at: "", notice_days_limit: "" }); setGalatForm(null); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={18} aria-hidden="true" /> Klaim Baru
        </button>
      )}

      <BottomSheet terbuka={sheetBaru} onTutup={() => setSheetBaru(false)} judul="Klaim Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor Klaim
            <input type="text" value={formBaru.claim_number} onChange={(e) => setFormBaru((f) => ({ ...f, claim_number: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Judul (min 10 karakter)
            <input type="text" value={formBaru.title} onChange={(e) => setFormBaru((f) => ({ ...f, title: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Peristiwa
            <input type="date" value={formBaru.event_date} onChange={(e) => setFormBaru((f) => ({ ...f, event_date: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nilai Diklaim (Rp)
            <input type="number" value={formBaru.amount_claimed} onChange={(e) => setFormBaru((f) => ({ ...f, amount_claimed: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Pemberitahuan (opsional)
            <input type="date" value={formBaru.notified_at} onChange={(e) => setFormBaru((f) => ({ ...f, notified_at: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Batas Hari Pemberitahuan (opsional)
            <input type="number" value={formBaru.notice_days_limit} onChange={(e) => setFormBaru((f) => ({ ...f, notice_days_limit: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={ajukanKlaim} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mengajukan…" : "Ajukan Klaim"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={!!klaimDiputuskan} onTutup={() => setKlaimDiputuskan(null)} judul="Putuskan Klaim">
        {klaimDiputuskan && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{klaimDiputuskan.title} — diklaim {fmtRupiah(klaimDiputuskan.amount_claimed)}</div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Status
              <select value={statusPutus} onChange={(e) => setStatusPutus(e.target.value as typeof statusPutus)}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
                <option value="disetujui">Disetujui</option>
                <option value="disetujui_sebagian">Disetujui Sebagian</option>
                <option value="ditolak">Ditolak</option>
                <option value="gugur">Gugur</option>
              </select>
            </label>
            {(statusPutus === "disetujui" || statusPutus === "disetujui_sebagian") && (
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Nilai Disetujui (Rp)
                <input type="number" value={amountApproved} onChange={(e) => setAmountApproved(e.target.value)}
                  style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
              </label>
            )}
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Catatan Keputusan
              <textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2}
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
            </label>
            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}
            <button type="button" onClick={putuskanKlaim} disabled={mengirim}
              style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
              {mengirim ? "Memproses…" : "Simpan Keputusan"}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 3: Tulis `kontrak-lengkap/surat/page.tsx`**

Pakai endpoint LINTAS-PROYEK (`GET /api/v1/letters`) sebagai default —
ini yang menjawab "surat mana yang wajib saya jawab hari ini" lintas
semua proyek PM (beda dari pola pemilih-proyek Task 12-13, karena
endpoint ini SENGAJA dirancang lintas-proyek, lihat komentar route).

```typescript
"use client";

import { useState } from "react";
import { Mail, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { RespSuratLintasProyek, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", terkirim: "Terkirim", diterima: "Diterima", dibalas: "Dibalas", selesai: "Selesai", kedaluwarsa: "Kedaluwarsa",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", terkirim: "pending", diterima: "pending", dibalas: "approved", selesai: "approved", kedaluwarsa: "rejected",
};
const LABEL_BATAS: Record<string, string> = {
  tak_perlu: "", tak_diatur: "Batas tak diatur", berjalan: "Berjalan", mendesak: "Mendesak", lewat: "Lewat batas", tak_terbaca: "Tanggal tak terbaca",
};

export default function PmSuratPage() {
  const [arah, setArah] = useState<"masuk" | "keluar">("keluar");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [form, setForm] = useState({
    project_id: "", nomor: "", perihal: "", arah: "keluar" as "masuk" | "keluar",
    dari_pihak: "", kepada_pihak: "", tanggal_kirim: "", butuh_balasan: false, batas_balas: "",
  });
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const url = `/api/v1/letters?arah=${arah}`;
  const { data, memuat, galat } = useData<RespSuratLintasProyek>(url);

  async function simpanSurat() {
    if (!form.project_id) {
      setGalatForm("Pilih proyek terlebih dulu.");
      return;
    }
    if (form.nomor.trim().length === 0) {
      setGalatForm("Nomor surat wajib diisi.");
      return;
    }
    if (form.perihal.trim().length < 5) {
      setGalatForm("Perihal wajib diisi, minimal 5 karakter.");
      return;
    }
    if (form.dari_pihak.trim().length === 0 || form.kepada_pihak.trim().length === 0) {
      setGalatForm("Pihak pengirim dan penerima wajib diisi.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/projects/${form.project_id}/letters`, {
        nomor: form.nomor.trim(),
        perihal: form.perihal.trim(),
        arah: form.arah,
        dari_pihak: form.dari_pihak.trim(),
        kepada_pihak: form.kepada_pihak.trim(),
        tanggal_kirim: form.tanggal_kirim || undefined,
        butuh_balasan: form.butuh_balasan,
        batas_balas: form.butuh_balasan ? (form.batas_balas || undefined) : undefined,
      });
      setSheetTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal mencatat surat"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Surat Masuk &amp; Keluar
      </h1>

      <SegmentedTab
        opsi={[{ value: "keluar", label: "Keluar" }, { value: "masuk", label: "Masuk" }]}
        aktif={arah}
        onUbah={(v) => setArah(v as typeof arah)}
      />

      {memuat && <SkeletonCard tinggi={100} />}
      {galat && <EmptyState icon={Mail} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && data && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 45%", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>{data.ringkas.kita_belum_menjawab}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Kita belum menjawab</div>
          </div>
          <div style={{ flex: "1 1 45%", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{data.ringkas.lawan_belum_menjawab}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Lawan belum menjawab</div>
          </div>
        </div>
      )}

      {!memuat && (data?.data?.length ?? 0) === 0 && (
        <EmptyState icon={Mail} judul="Belum ada surat" deskripsi="Korespondensi proyek akan muncul di sini." />
      )}

      {!memuat && data?.data.map((s) => (
        <div key={s.id} style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{s.nomor}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{s.perihal}</div>
              {s.project_name && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.project_name}</div>}
            </div>
            <StatusBadge status={VARIAN_STATUS[s.status] ?? "netral"} label={LABEL_STATUS[s.status] ?? s.status} />
          </div>
          {s.butuh_balasan && s.batas.keadaan !== "tak_perlu" && (
            <div role="alert" style={{ fontSize: 11, fontWeight: 700, color: s.batas.keadaan === "lewat" || s.batas.keadaan === "mendesak" ? "var(--danger)" : "var(--text-secondary)", alignSelf: "flex-start" }}>
              {LABEL_BATAS[s.batas.keadaan]}
              {s.batas.sisaHari !== null && ` · sisa ${s.batas.sisaHari} hari`}
              {s.batas.siapaYangDitunggu && ` · menunggu ${s.batas.siapaYangDitunggu === "kita" ? "kita" : "lawan"}`}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {s.dari_pihak} → {s.kepada_pihak} · {fmtTanggal(s.tanggal_kirim)}
          </div>
        </div>
      ))}

      <button type="button" onClick={() => { setSheetTerbuka(true); setForm({ project_id: "", nomor: "", perihal: "", arah, dari_pihak: "", kepada_pihak: "", tanggal_kirim: "", butuh_balasan: false, batas_balas: "" }); setGalatForm(null); }}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        <Plus size={18} aria-hidden="true" /> Surat Baru
      </button>

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Surat Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Proyek
            <select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="">Pilih proyek</option>
              {(data?.proyek ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Arah
            <select value={form.arah} onChange={(e) => setForm((f) => ({ ...f, arah: e.target.value as "masuk" | "keluar" }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="keluar">Keluar</option>
              <option value="masuk">Masuk</option>
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Nomor
            <input type="text" value={form.nomor} onChange={(e) => setForm((f) => ({ ...f, nomor: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Perihal (min 5 karakter)
            <input type="text" value={form.perihal} onChange={(e) => setForm((f) => ({ ...f, perihal: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Dari Pihak
            <input type="text" value={form.dari_pihak} onChange={(e) => setForm((f) => ({ ...f, dari_pihak: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Kepada Pihak
            <input type="text" value={form.kepada_pihak} onChange={(e) => setForm((f) => ({ ...f, kepada_pihak: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Tanggal Kirim
            <input type="date" value={form.tanggal_kirim} onChange={(e) => setForm((f) => ({ ...f, tanggal_kirim: e.target.value }))}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            <input type="checkbox" checked={form.butuh_balasan} onChange={(e) => setForm((f) => ({ ...f, butuh_balasan: e.target.checked }))} />
            Butuh Balasan
          </label>
          {form.butuh_balasan && (
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Batas Balas
              <input type="date" value={form.batas_balas} onChange={(e) => setForm((f) => ({ ...f, batas_balas: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
            </label>
          )}
          {galatForm && (
            <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
              {galatForm}
            </div>
          )}
          <button type="button" onClick={simpanSurat} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan Surat"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, lint, penjaga**

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm exec eslint app/pm-portal/kontrak-lengkap/klaim/ app/pm-portal/kontrak-lengkap/surat/
node scripts/uji-token-css-ada.mjs
node scripts/uji-tombol-primer-seragam.mjs
node scripts/kerapatan-ratchet.mjs
cd ../api && node scripts/audit-halaman-pakai-cache.mjs
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pm-portal/kontrak-lengkap/klaim apps/web/app/pm-portal/kontrak-lengkap/surat apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): Klaim Kontraktual, Surat Masuk/Keluar — kelompok Kontrak bagian 3"
```

---

### Task 15: Lengkapi Jadwal (Histogram, Method Statement) + Analisa Keterlambatan

**Files:**
- Modify: `apps/web/app/pm-portal/jadwal/page.tsx` (tambah 2 tab)
- Create: `apps/web/app/pm-portal/kontrak-lengkap/keterlambatan/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Riset (Task 11 Step 1)**: `jd-histogram` (`/jadwal?bagian=histogram`)
dan `jd-method` (`/jadwal?bagian=method`) TERNYATA sudah bagian dari
PAYLOAD yang `pm-portal/jadwal/page.tsx` SUDAH FETCH
(`GET /api/v1/jadwal-cpm/:projectId` memulangkan `{ proyek, kalender,
cpm, histogram, methodStatement }` — dikonfirmasi baca
`apps/api/src/routes/v1/jadwal-cpm.ts:128-143`) TAPI halaman existing
HANYA merender `cpm` (tab "Jalur Kritis") dan panggilan terpisah untuk
baseline. `histogram`+`methodStatement` sudah TERKIRIM tiap request,
cuma tak ditampilkan — Task 15 menambah 2 tab TANPA endpoint baru.

`jd-delay` (Analisa Keterlambatan, `/proyek/keterlambatan` di web) BENAR
halaman terpisah — `GET /api/v1/analisa-keterlambatan?project_id=`,
`projects:view`, murni baca (komentar route: "Angka yang bisa disunting
berhenti jadi dasar apa pun — dan yang paling berkepentingan
menyuntingnya adalah pihak yang sedang dituduh terlambat").

`milestones:manage` dibutuhkan untuk POST dependensi/libur/sumber daya
(`jadwal-cpm.ts:148,236,282`) — PM PUNYA permission ini, tapi ketiga POST
itu adalah KONFIGURASI (menambah dependensi antar-milestone, hari libur,
kebutuhan sumber daya per milestone) yang lebih pas dikerjakan di web
(form kompleks, jarang dipakai harian) — Task 15 HANYA menampilkan
histogram+method statement BACA SAJA plus PUTUSAN method statement
(`disetujui`/`ditolak`, mirip pola submittal), bukan ketiga form
konfigurasi itu. Endpoint keputusan method statement TIDAK ditemukan
sebagai rute terpisah di `jadwal-cpm.ts` — **executor WAJIB grep ulang
`method_statement` di `apps/api/src/routes/v1/*.ts` sebelum menulis
tombol putuskan**; kalau memang tak ada rute PATCH-nya, tab Method
Statement tetap BACA SAJA (tampilkan status+alasan_tolak) dan catat
temuan itu di commit message, bukan memaksa membangun tombol ke endpoint
yang tak ada.

- [x] **Step 1: Grep ulang endpoint keputusan method statement** —
SELESAI (fix round ini):

```bash
grep -rn "method_statement" apps/api/src/routes/v1/*.ts
```

Hasil: **satu-satunya kemunculan** adalah baca (`jadwal-cpm.ts:66`,
`db.unsafe('method_statement', alasan).select(...)`) — TIDAK ADA rute
PATCH/POST untuk keputusan method statement di seluruh
`apps/api/src/routes/v1/`. Tab Method Statement karena itu BACA SAJA
(tanpa tombol putuskan) — dikonfirmasi, bukan diasumsikan.

- [ ] **Step 2: Tulis tipe di `_bersama/tipe.ts`**

`methodStatement` dari `select` eksplisit `jadwal-cpm.ts:66-68` (`id,
milestone_id, nomor, judul, status, alasan_tolak, diputuskan_pada,
pengendalian_risiko`). `histogram` dari `HasilSumberDaya[]`,
`apps/api/src/lib/cpm.ts:441-457` — dibaca LANGSUNG dari kode (fix round
ini): struktur ASLI adalah array yang di-KEY PER SUMBER DAYA, bukan per
minggu (`periode` ada DI DALAM tiap sumber daya, bukan sebaliknya):

```typescript
/** `methodStatement[]` dari `GET /api/v1/jadwal-cpm/:projectId` — select eksplisit jadwal-cpm.ts:66-68. */
export interface MethodStatementItem {
  id: string
  milestone_id: string | null
  nomor: string | null
  judul: string
  status: "diajukan" | "disetujui" | "ditolak"
  alasan_tolak: string | null
  diputuskan_pada: string | null
  pengendalian_risiko: string | null
}

/** Bentuk `PeriodeSumberDaya`, `apps/api/src/lib/cpm.ts:432-439`. */
export interface PeriodeSumberDaya {
  /** Senin minggu itu, `YYYY-MM-DD`. */
  minggu: string
  dibutuhkan: number
  tersedia: number | null
  /** Kelebihan beban. 0 berarti cukup. */
  kelebihan: number
}

/**
 * `histogram` dari `GET /api/v1/jadwal-cpm/:projectId` — bentuk
 * `HasilSumberDaya[]`, `apps/api/src/lib/cpm.ts:441-457`. Array di-KEY
 * PER SUMBER DAYA (bukan per minggu) — tiap elemen punya `periode[]`
 * miliknya sendiri.
 */
export interface HistogramSumberDaya {
  nama: string
  jenis: string
  periode: PeriodeSumberDaya[]
  /**
   * PUNCAK, bukan rata-rata — 40 tukang minggu 7 dan 4 di minggu 8 punya
   * rata-rata 22 (angka yang tak pernah terjadi, menyembunyikan
   * kekurangan 15 orang). Pengadaan tenaga ditentukan puncaknya.
   */
  puncak: number
  mingguPuncak: string | null
  tersedia: number | null
  /** Minggu-minggu yang kelebihan beban — yang butuh leveling. */
  mingguKelebihan: string[]
}
```

- [ ] **Step 3: Tambah 2 tab di `jadwal/page.tsx`**

`SegmentedTab` existing (`cpm`/`baseline`) diperluas jadi 4 opsi
(`cpm`/`histogram`/`method`/`baseline`) — dua tab lama TIDAK diubah.
`RespJadwalCpm` LOKAL di file itu (bukan di `_bersama/tipe.ts` — file ini
sudah mendefinisikan tipenya sendiri, field baru ditambah di sana, ikuti
gaya yang sudah ada) diperluas: tambah `histogram: HistogramSumberDaya[]`
(array, sesuai bentuk asli `HasilSumberDaya[]`) dan `methodStatement:
MethodStatementItem[]`. Potongan diff dari file existing (baris
34-45 sudah ada, ditambah `histogram`/`methodStatement`):

```typescript
// ...import tambahan di atas import existing...
import { ClipboardList, Users2 } from "lucide-react";
// ⚠️ Baris import StatusBadge existing (jadwal/page.tsx:28) WAJIB diubah —
// aslinya `import StatusBadge from "@/components/portal/StatusBadge";`
// TANPA named type `VarianStatus`, tapi VARIAN_METHOD di bawah butuh tipe
// itu. Ganti baris import existing itu jadi:
// import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
// Tanpa perubahan ini, tab Method Statement gagal compile: "Cannot find name 'VarianStatus'".

// ...RespJadwalCpm existing diperluas (baris ~42-45 file existing)...
interface RespJadwalCpm {
  proyek: { id: string; nama: string; mulai: string | null; akhir: string | null };
  cpm: { pekerjaan: PekerjaanCpm[]; jalurKritis: string[]; selesaiProyek: string | null; lingkaran: string[] };
  histogram: HistogramSumberDaya[];
  methodStatement: MethodStatementItem[];
}

interface PeriodeSumberDaya {
  minggu: string;
  dibutuhkan: number;
  tersedia: number | null;
  kelebihan: number;
}
interface HistogramSumberDaya {
  nama: string;
  jenis: string;
  periode: PeriodeSumberDaya[];
  puncak: number;
  mingguPuncak: string | null;
  tersedia: number | null;
  mingguKelebihan: string[];
}
interface MethodStatementItem {
  id: string;
  milestone_id: string | null;
  nomor: string | null;
  judul: string;
  status: "diajukan" | "disetujui" | "ditolak";
  alasan_tolak: string | null;
  diputuskan_pada: string | null;
  pengendalian_risiko: string | null;
}

const LABEL_METHOD: Record<string, string> = { diajukan: "Diajukan", disetujui: "Disetujui", ditolak: "Ditolak" };
const VARIAN_METHOD: Record<string, VarianStatus> = { diajukan: "pending", disetujui: "approved", ditolak: "rejected" };

// ...di dalam PmJadwalPage(), SegmentedTab existing diperluas:...
const [tab, setTab] = useState<"cpm" | "histogram" | "method" | "baseline">("cpm");
// ...
<SegmentedTab
  opsi={[
    { value: "cpm", label: "Jalur Kritis" },
    { value: "histogram", label: "Sumber Daya" },
    { value: "method", label: "Method Statement" },
    { value: "baseline", label: "Baseline" },
  ]}
  aktif={tab}
  onUbah={(v) => setTab(v as typeof tab)}
/>

{/* ...blok existing proyekAktif && tab === "cpm" tetap sama... */}

{proyekAktif && tab === "histogram" && (
  <>
    {memuatCpm && <SkeletonCard tinggi={100} />}
    {!memuatCpm && (dataCpm?.histogram?.length ?? 0) === 0 && (
      <EmptyState icon={Users2} judul="Belum ada kebutuhan sumber daya" deskripsi="Kebutuhan tenaga/alat per milestone belum diatur." />
    )}
    {!memuatCpm && dataCpm?.histogram.map((h) => (
      <div key={`${h.jenis}-${h.nama}`} style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{h.nama}</span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Puncak {h.puncak}{h.tersedia !== null ? ` / tersedia ${h.tersedia}` : ""}</span>
        </div>
        {/* Daftar angka per minggu, BUKAN dirata-rata — puncak adalah sinyal yang dijaga backend, rata-rata menyembunyikannya (§1 spec: disederhanakan tapi tak boleh menghilangkan sinyal). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {h.periode.map((p) => (
            <div key={p.minggu} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{p.minggu}</span>
              <span style={{ color: p.kelebihan > 0 ? "var(--danger)" : "var(--text-primary)", fontWeight: p.kelebihan > 0 ? 700 : 400 }}>
                {p.dibutuhkan}{p.tersedia !== null ? ` / ${p.tersedia}` : ""}
                {p.kelebihan > 0 && ` · kurang ${p.kelebihan}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    ))}
  </>
)}

{proyekAktif && tab === "method" && (
  <>
    {memuatCpm && <SkeletonCard tinggi={100} />}
    {!memuatCpm && (dataCpm?.methodStatement?.length ?? 0) === 0 && (
      <EmptyState icon={ClipboardList} judul="Belum ada method statement" deskripsi="Cara kerja pekerjaan berisiko belum diajukan." />
    )}
    {!memuatCpm && dataCpm?.methodStatement.map((m) => (
      <div key={m.id} style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{m.nomor ?? m.judul}</span>
          <StatusBadge status={VARIAN_METHOD[m.status] ?? "netral"} label={LABEL_METHOD[m.status] ?? m.status} />
        </div>
        {m.nomor && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.judul}</div>}
        <div style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: m.pengendalian_risiko ? "var(--surface-subtle)" : "var(--danger-bg)", color: m.pengendalian_risiko ? "var(--text-secondary)" : "var(--on-danger-bg)" }}>
          {m.pengendalian_risiko ?? "Pengendalian risiko K3 belum diisi"}
        </div>
        {m.status === "ditolak" && m.alasan_tolak && (
          <div style={{ fontSize: 12, color: "var(--danger)" }}>Alasan tolak: {m.alasan_tolak}</div>
        )}
      </div>
    ))}
    {/* Tanpa tombol putuskan — Step 1 mengonfirmasi tak ada rute PATCH untuk method statement. */}
  </>
)}

{/* ...blok existing proyekAktif && tab === "baseline" tetap sama... */}
```

Ikuti gaya file existing untuk `SkeletonCard`/`EmptyState` (sudah
diimpor di file, tak perlu diubah), tambahkan import
`ClipboardList`/`Users2` dari `lucide-react` di baris import existing.
**`StatusBadge` BUKAN "sudah diimpor lengkap"** — baris importnya WAJIB
diubah untuk menyertakan `type VarianStatus` (lihat catatan ⚠️ di awal
blok kode Step 3 di atas), karena `VARIAN_METHOD` yang ditambah Step 3
memakai tipe itu dan file existing sebelumnya hanya mengimpor default
export `StatusBadge` saja.

- [ ] **Step 4: Tulis `kontrak-lengkap/keterlambatan/page.tsx`**

```typescript
"use client";

import { useMemo, useState } from "react";
import { AlarmClock } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { ProyekPM, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

/** Bentuk `BarisAnalisa`, `apps/api/src/lib/analisa-keterlambatan.ts:75-105`. */
interface BarisAnalisa {
  milestone_id: string;
  project_id: string;
  project_name: string;
  title: string;
  target_date: string;
  completed_at: string | null;
  telat_kotor: number;
  eot_hari: number;
  telat_efektif: number;
  status: "tepat_waktu" | "belum_jatuh_tempo" | "selesai_terlambat" | "berjalan_terlambat" | "dimaafkan_eot";
  estimasi_paparan: number | null;
  kena_cap: boolean;
  masih_bertambah: boolean;
}

/** Bentuk `HasilAnalisa`, `apps/api/src/lib/analisa-keterlambatan.ts:107-125`. */
interface RespAnalisaKeterlambatan {
  baris: BarisAnalisa[];
  jumlah_selesai_terlambat: number;
  jumlah_berjalan_terlambat: number;
  jumlah_dimaafkan_eot: number;
  jumlah_tepat_waktu: number;
  jumlah_belum_jatuh_tempo: number;
  telat_terparah: number;
  total_estimasi_paparan: number;
  jumlah_proyek_denda_mati: number;
}

function fmtRupiah(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
}
function fmtTanggal(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const LABEL_STATUS: Record<string, string> = {
  tepat_waktu: "Tepat Waktu", belum_jatuh_tempo: "Belum Jatuh Tempo",
  selesai_terlambat: "Selesai Terlambat", berjalan_terlambat: "Berjalan Terlambat", dimaafkan_eot: "Dimaafkan EOT",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  tepat_waktu: "approved", belum_jatuh_tempo: "netral",
  selesai_terlambat: "rejected", berjalan_terlambat: "rejected", dimaafkan_eot: "info",
};

export default function PmAnalisaKeterlambatanPage() {
  const [proyekId, setProyekId] = useState("");
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);

  const url = proyekId ? `/api/v1/analisa-keterlambatan?project_id=${proyekId}` : "/api/v1/analisa-keterlambatan";
  const { data, memuat, galat } = useData<RespAnalisaKeterlambatan>(url);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Analisa Keterlambatan
      </h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekId}
            onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
          >
            <option value="">Semua proyek</option>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={AlarmClock} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && data && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Berjalan Terlambat", value: String(data.jumlah_berjalan_terlambat), warna: "var(--danger)" },
            { label: "Telat Terparah (hari)", value: String(data.telat_terparah), warna: "var(--warning)" },
            { label: "Estimasi Paparan", value: fmtRupiah(data.total_estimasi_paparan), warna: "var(--navy)" },
          ].map((k) => (
            <div key={k.label} style={{ flex: "1 1 30%", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.warna }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k.label}</div>
            </div>
          ))}
          {/* Rp0 tak boleh terbaca "tak ada risiko" — sebagian proyek dendanya memang mati (lib analisa-keterlambatan.ts). Dinyatakan, bukan disembunyikan. */}
          {data.jumlah_proyek_denda_mati > 0 && (
            <div style={{ flex: "1 1 100%", fontSize: 11, color: "var(--text-secondary)" }}>
              {data.jumlah_proyek_denda_mati} proyek punya milestone telat tapi dendanya tidak aktif — estimasi paparan di atas TIDAK mencakupnya.
            </div>
          )}
        </div>
      )}

      {!memuat && (data?.baris?.length ?? 0) === 0 && (
        <EmptyState icon={AlarmClock} judul="Tidak ada keterlambatan" deskripsi="Seluruh milestone tepat waktu atau belum jatuh tempo." />
      )}

      {!memuat && data?.baris.map((b) => (
        <div key={b.milestone_id} style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{b.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{b.project_name}</div>
            </div>
            <StatusBadge status={VARIAN_STATUS[b.status] ?? "netral"} label={LABEL_STATUS[b.status] ?? b.status} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Target: {fmtTanggal(b.target_date)}{b.completed_at && ` · Selesai: ${fmtTanggal(b.completed_at)}`}
          </div>
          {b.telat_efektif > 0 && (
            <div style={{ fontSize: 13, color: "var(--danger)", fontWeight: 700 }}>
              Telat {b.telat_efektif} hari{b.masih_bertambah ? " (masih berjalan)" : ""}
              {b.telat_kotor !== b.telat_efektif && ` · kotor ${b.telat_kotor} hari, EOT ${b.eot_hari} hari`}
            </div>
          )}
          {b.estimasi_paparan !== null && (
            <div style={{ fontSize: 13, color: "var(--warning)" }}>
              Estimasi paparan: {fmtRupiah(b.estimasi_paparan)}{b.kena_cap ? " (menyentuh batas)" : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck, lint, penjaga**

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm exec eslint app/pm-portal/jadwal/ app/pm-portal/kontrak-lengkap/keterlambatan/
node scripts/uji-token-css-ada.mjs
node scripts/uji-tombol-primer-seragam.mjs
node scripts/kerapatan-ratchet.mjs
cd ../api && node scripts/audit-halaman-pakai-cache.mjs
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pm-portal/jadwal/page.tsx apps/web/app/pm-portal/kontrak-lengkap/keterlambatan apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): Histogram, Method Statement, Analisa Keterlambatan — kelompok Perencanaan"
```

---

### Task 16: Navigasi kategori Kontrak+Perencanaan + Verifikasi akhir Tahap 2

**Files:**
- Modify: `apps/web/lib/pm-portal-kategori.ts`
- Modify: `apps/web/app/pm-portal/kategori/[key]/page.tsx`

- [x] **Step 1: Aktifkan `g-kontrak` dan `g-jadwal` di `KATEGORI_AKTIF`**

```typescript
const KATEGORI_AKTIF = ["g-subkon", "g-lapangan", "g-kontrak", "g-jadwal"]; // Tahap 1-2
```

- [x] **Step 2: Isi `PETA_HREF_PORTAL` untuk item yang dibangun Task 12-15**

**Perbedaan dari draf di atas, ditemukan saat eksekusi:** `jd-baseline`
SENGAJA TIDAK dipetakan — dicek ulang ke `peta-menu.ts`, key ini tak
punya field `href` sama sekali (hanya dicapai lewat
`/proyek/[id]/baseline`, rute dinamis admin), jadi menuliskannya di
`PETA_HREF_PORTAL` tak mengubah apa pun: `it.href` tetap `undefined` dan
fallback-nya tetap `"#"` seperti sebelum Task 16 — draf plan mencantumkannya
tapi itu tidak berpengaruh, jadi baris itu dihapus dari kode nyata supaya
tak menyiratkan halaman itu punya tujuan.

`EKSTRA_PORTAL["g-lapangan"]` (dibuat Task 9) punya dua baris sintetis
`px-jadwal`→`/pm-portal/jadwal` dan `px-kontrak`→`/pm-portal/kontrak` yang
kini DUPLIKAT dengan entri `jd-*`/`kt-co` yang baru aktif (menunjuk target
yang SAMA) — dihapus dari `EKSTRA_PORTAL`, persis seperti yang diperingatkan
komentar di berkas itu sendiri ("begitu grup g-kontrak/g-jadwal diaktifkan,
baris yang relevan pindah dari sini"). Import `Calendar`/`Landmark` dari
`lucide-react` ikut dihapus (jadi tak terpakai).

Tambahkan (memakai key `ItemMenu` PERSIS dari `peta-menu.ts` §"g-kontrak"/
"g-jadwal", diverifikasi Task 11 riset):

```typescript
const PETA_HREF_PORTAL: Record<string, string> = {
  // ...baris Tahap 1 yang sudah ada, TIDAK dihapus...
  "kt-register": "/pm-portal/kontrak-lengkap/register",
  "kt-asuransi": "/pm-portal/kontrak-lengkap/asuransi",
  "kt-claims": "/pm-portal/kontrak-lengkap/klaim",
  "kt-eot": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-ld": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-bond": "/pm-portal/kontrak-lengkap/eot-ld-bond",
  "kt-rfi": "/pm-portal/inspeksi-rfi",
  "kt-surat": "/pm-portal/kontrak-lengkap/surat",
  "kt-termin": "/pm-portal/keuangan",
  "kt-retensi": "/pm-portal/mandor-lengkap/retensi",
  "kt-subkon": "/pm-portal/mandor-lengkap/penugasan",
  "kt-co": "/pm-portal/kontrak",
  "jd-cpm": "/pm-portal/jadwal",
  "jd-histogram": "/pm-portal/jadwal",
  "jd-method": "/pm-portal/jadwal",
  "jd-baseline": "/pm-portal/jadwal",
  "jd-milestone": "/pm-portal/jadwal",
  "jd-delay": "/pm-portal/kontrak-lengkap/keterlambatan",
};
```

⚠️ `kt-co` (Change Order), `jd-gantt`, `jd-kurva-s`, `jd-evm`,
`jd-lookahead`, `jd-wbs` di web adalah `tabProyek` pada `/proyek/[id]`
ADMIN (bukan endpoint berdiri sendiri) — **TIDAK dibangun Task 12-15**
karena butuh hub tab PM (`pm-portal/proyek/[id]`) yang belum ada (lihat
riset Task 13). Baris `kt-co` di atas menunjuk ke `pm-portal/kontrak`
existing (Tahap 1, ringkasan nilai kontrak dari `ProyekPM` — BUKAN
Change Order sungguhan, hanya fallback sementara supaya link tak mati)
— **ini ditandai UTANG, bukan selesai**. Item PETA_MENU yang key-nya
TIDAK muncul di `PETA_HREF_PORTAL` otomatis fallback ke `it.href` web
asli (mekanisme sudah ada di `kategori/[key]/page.tsx`, baris 131) — PM
tetap bisa menjangkaunya, hanya mendarat di halaman desktop.

- [x] **Step 3: Typecheck + lint navigasi**

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm exec eslint lib/pm-portal-kategori.ts app/pm-portal/kategori/
```

Keduanya bersih — nol keluaran, exit 0.

- [x] **Step 4: `audit-nav-yatim.mjs` sebagai bukti klik-tembus** — skrip ini
memindai literal `href`/`"key": "/path"` di `kategori/[key]/page.tsx`
langsung (bukan runtime click), jadi dipakai sebagai pengganti click-through
manual. SEBELUM Task 16: 6 halaman `pm-portal/kontrak-lengkap/*` YATIM.
SESUDAH: bagian YATIM hilang seluruhnya (0 dari kategori PM). Satu-satunya
sisa kegagalan skrip ini (`LINK MATI: /estimasi/struktur`) sudah ada
SEBELUM Task 16 (diverifikasi jalan sebelum edit apa pun) dan tak
menyangkut kategori Kontrak/Perencanaan — bukan tanggung jawab task ini.

- [x] **Step 5: Typecheck seluruh workspace + SEMUA penjaga CI**

```bash
cd apps/web && pnpm exec tsc --noEmit
cd ../api && node scripts/jalankan-semua-penjaga.mjs
```

**Hasil `apps/web`:** `pnpm exec tsc --noEmit` bersih (exit 0).

**Hasil `node scripts/jalankan-semua-penjaga.mjs`: 130 hijau · 41 MERAH ·
2 tak ketemu.** Diperiksa satu per satu: TIDAK SATU PUN dari 41 kegagalan
menyebut `pm-portal-kategori.ts` atau `kategori/[key]/page.tsx` (dicek
`grep` atas keluaran lengkap). Yang relevan dengan Task 16 secara langsung:

- `apps/web/scripts/audit-nav-yatim.mjs` — 1 LINK MATI tersisa
  (`/estimasi/struktur`, pra-eksisting, di luar scope) — 0 YATIM, turun
  dari 6 sebelum Task 16 (lihat Step 4).
- `apps/web/scripts/audit-peta-menu-vs-db.mjs` — ratchet "hanyaDb naik
  124 -> 125" gagal, TAPI ini drift `menu_items` (DB) vs `peta-menu.ts`
  (skema/migrasi), sama sekali tak tersentuh Task 16 (task ini tak
  mengubah `peta-menu.ts` maupun DB) — utang pra-eksisting.
- `apps/web/scripts/uji-endpoint-ada.mjs` (dijalankan manual dari akar
  repo, karena runner memanggilnya dari cwd yang salah) — 16 path
  "tidak ada" semuanya template-literal (`${...}`) di halaman LAIN
  (`keuangan`, `procurement`, `mandor-portal`, dst) yang sudah begitu
  sebelum Task 16 — nol menyinggung file yang diubah task ini.
- `apps/api/scripts/audit-akhir-baris.mjs` — diverifikasi terpisah:
  KEDUA berkas yang diubah Task 16 tetap LF (tak ada LF→CRLF), jadi
  kegagalan penjaga ini (kalau ada di berkas lain) bukan dari Task 16.

Sisa 38 kegagalan (ratchet lint/format/tabel/tombol, migrasi bernomor
ganda, SoD, dst) adalah utang lama di luar scope navigasi Task 16 —
**baseline SEBELUM Tahap 2 tak pernah dicatat sebagai satu angka tunggal**
di akhir Task 10/awal Task 11 (dicek: kedua entri JOURNAL/plan menyebut
"129 hijau → 132 hijau" untuk sesi 2026-08-20 pagi, tapi itu snapshot
worktree `portal-mobile` yang berbeda dari worktree ini
`pm-lengkap-tahap2`; dua checkout dengan riwayat commit berbeda tak bisa
dibandingkan angka guard-nya apple-to-apple). Yang dipastikan di sini:
tak ada satu pun dari 41 kegagalan yang MENYEBUT dua berkas yang diubah
Task 16 — bukti langsung, bukan perbandingan angka lintas-worktree yang
tak sepadan.

- [x] **Step 6: Test integrasi terkait**

```bash
cd apps/api && npx vitest run kontrak klaim-kontraktual rfi surat asuransi baseline-jadwal
```

**Hasil run gabungan (6 berkas): 2 file gagal, 15 test gagal, 325 lulus
(340 total).** Seluruhnya di `kontrak.test.ts` (13) dan
`otomasi-asuransi.test.ts` (2) — `klaim-kontraktual`/`rfi`/`surat`/
`baseline-jadwal` seluruhnya hijau.

**Diselidiki sebelum dilaporkan sebagai regresi** (CLAUDE.md §7
memperingatkan run test paralel terhadap Postgres NYATA saling
mengganggu — jangan diklaim tanpa diverifikasi):

1. `git diff --stat main...HEAD -- apps/api/src` = KOSONG. Tahap 2
   (Task 11-16) tidak menyentuh satu pun berkas backend — kegagalan
   backend tak mungkin berasal dari task ini.
2. `kontrak.test.ts` DIJALANKAN SENDIRIAN (isolasi dari 5 berkas lain) —
   TETAP 14 gagal / 116 lulus. Menyingkirkan pencemaran fixture ANTAR
   keenam berkas yang diminta Step 6.
3. TAPI: `git worktree list` menunjukkan **3 worktree lain aktif**
   (`kematangan-modul`, `struktur`, checkout utama) memakai **satu
   Postgres yang SAMA** (aturan repo ini, bukan dugaan). Saat run isolasi
   di atas dijalankan, `wmic process` MENGONFIRMASI proses
   `vitest run struktur` SEDANG HIDUP dari checkout utama — dua suite
   menulis/membaca DB yang sama bersamaan, persis skenario yang
   CLAUDE.md §7 nyatakan menghasilkan kegagalan yang "menuduh pihak
   lain" (`LIMIT 1` tanpa `ORDER BY` mengambil baris fixture yang
   digeser test lain).
4. Commit TERAKHIR yang menyentuh `kontrak.test.ts` di riwayat berkas
   ini (`456609fe`) judulnya PERSIS
   `fix(test): LIMIT 1 tanpa ORDER BY — cacat yang sama di TUJUH berkas,
   dan gejalanya selalu menuduh pihak lain` — kelas cacat yang sama
   dengan pola kegagalan yang diamati di sini (status berubah jadi nilai
   yang tak diminta test, `SELECT ... WHERE nomor = $1` menjawab baris
   yang salah, `UPDATE` yang seharusnya ditolak trigger malah lolos).

**Ditindaklanjuti: worktree `struktur` selesai (dikonfirmasi `wmic process`
nol proses vitest tersisa), run DIULANG BERSIH tanpa kontensi yang
terverifikasi.** Hasil: **PERSIS SAMA** — 2 file gagal, 15 test gagal,
325 lulus (340 total), test yang sama persis (`kontrak.test.ts` 13,
`otomasi-asuransi.test.ts` 2, termasuk assertion off-by-angka yang sama
`expected 12 to be 0`). Ini MENYINGKIRKAN dugaan interferensi vitest
lintas-worktree sebagai penyebab TUNGGAL — kegagalan reproducible bahkan
tanpa proses vitest lain yang teramati bersamaan.

**Kesimpulan akhir: 15 kegagalan ini NYATA dan REPRODUCIBLE, tapi BUKAN
regresi Tahap 2/Task 16** — bukti: (a) `git diff --stat main...HEAD --
apps/api/src` KOSONG, task ini tak menyentuh satu baris backend pun;
(b) `kontrak.test.ts` (`TANDA = 'UJI-KTR'`, literal statis tanpa
suffix unik) dan pola `otomasi-asuransi.test.ts` (hitungan bergantung
data lain di tabel yang sama) keduanya rentan ke STATE basis dev yang
terakumulasi dari run-run sebelumnya/proses lain (seed, otomasi
terjadwal `otomasi-terjadwal` yang CLAUDE.md catat berjalan nyata di
basis yang sama) — bukan dari perubahan kode apa pun. Dilaporkan ke
controller sebagai CONCERN nyata yang perlu ditindaklanjuti TERPISAH
dari Task 16 (kemungkinan: basis dev butuh reset fixture, atau
`kontrak.test.ts`/`otomasi-asuransi.test.ts` butuh perbaikan isolasi
serupa `456609fe`) — bukan diklaim hijau tanpa bukti, dan bukan
disembunyikan.

- [x] **Step 7: Audit a11y runtime penuh**

```bash
cd apps/web
export $(grep -E "^LAYAR_(EMAIL|SANDI|BASIS)=" .env.local | tr -d '\r' | xargs)
node scripts/jalankan-a11y-lengkap.mjs
```

**Hasil (mode terang, akun admin, id dinamis terisi otomatis dari
basis): 155 halaman dipindai, 56 dialihkan (bukan halaman ini), 0
pelanggaran.** Naik dari 137 halaman (Task 10, akhir Tahap 1) — 18
halaman lebih banyak, cocok dengan 6 halaman baru Tahap 2 + selisih
lain dari sesi antar-tahap. Dialihkan naik dari 50 ke 56, KONSISTEN
dengan gap yang SUDAH TERCATAT sebagai item QUEUE `A11Y-PM-PORTAL`
(bukan temuan baru Task 16): akun uji `LAYAR_*` berperan admin, dan
`middleware.ts` mengalihkan peran itu dari prefix `/pm-portal` ke
`/dashboard` sebelum axe-core sempat memindai — 6 halaman baru
`kontrak-lengkap/*` kemungkinan besar TERMASUK dalam 56 yang
dialihkan, bukan dalam 155 yang dipindai. Menutup gap ini butuh akun
uji berperan PM (keputusan data uji, bukan perubahan kode Task 16 —
sudah didokumentasikan sebagai item QUEUE terpisah sejak Task 10).

- [x] **Step 8: Update JOURNAL.md** (bukan
`docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` — dicek isi berkas itu Task 16:
ia mendokumentasikan taksonomi menu WEB admin, nol baris menyebut
`pm-portal`, jadi bukan tempat yang tepat untuk status navigasi portal
PM; status Tahap 2 dicatat di dokumen plan ini (sudah, tiap Step di
atas) dan JOURNAL.md, konsisten dengan pola Task 9/10 sebelumnya).

Catat Tahap 2 selesai — **6 halaman baru** (register, asuransi,
eot-ld-bond, klaim, surat, keterlambatan — dikoreksi dari draf "5" di
brief: eot-ld-bond dan klaim-ld-bond memang SATU halaman gabungan tapi
klaim tetap halaman terpisah, totalnya 6 route baru + 2 tab tambahan di
`jadwal` existing), utang tercatat (`kt-co`/Gantt/Kurva-S/EVM/Look-Ahead/
WBS butuh hub `proyek/[id]` PM — TIDAK dibangun Tahap 2).

- [x] **Step 9: Commit dokumentasi**

`docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` TIDAK di-`git add` — dicek isinya
Step 8, berkas itu tak menyinggung `pm-portal` sama sekali (taksonomi web
admin, bukan portal PM), jadi tak ada apa pun untuk diperbarui di sana.
Dokumen plan ini (`docs/superpowers/plans/2026-08-20-portal-pm-lengkap.md`)
ditambahkan ke commit sebagai gantinya — itulah tempat status Task 16
sebenarnya dicatat (checkbox + temuan per Step di atas).

```bash
git add docs/execution/JOURNAL.md docs/superpowers/plans/2026-08-20-portal-pm-lengkap.md apps/web/lib/pm-portal-kategori.ts "apps/web/app/pm-portal/kategori/[key]/page.tsx"
git commit -m "feat(pm-portal): navigasi kategori Kontrak+Perencanaan, Tahap 2 selesai"
```

---

## Tahap 3-7: Budget & Cost Control lengkap, Tahap 4-7 kerangka

> Pola task per tahap MENGIKUTI struktur Tahap 1-2 (Task riset → Task
> halaman per sub-kelompok → Task navigasi/verifikasi). Detail kode TIDAK
> ditulis di sini untuk Tahap 4-7 — spec §5 menegaskan tipe/endpoint WAJIB
> diverifikasi ke kode nyata saat itu dieksekusi, menulis kodenya sekarang
> (jauh sebelum eksekusi, tanpa membaca ulang kode yang mungkin sudah
> berubah) akan jadi tebakan basi. Sebelum memulai tiap Tahap, buat task
> riset (pola Task 5/11/17) lebih dulu, BARU susun task halaman
> detailnya — sesi eksekusi tahap itu yang menulis breakdown lengkap ke
> plan ini (mengedit file plan ini, menambah Task baru di bagian Tahap
> yang relevan), bukan ditebak di muka.
>
> **Tahap 3 (Task 17-22) SUDAH digali penuh** — riset dilakukan dan kode
> lengkap ditulis untuk 11 halaman (Task 17 Step 1 langsung diikuti Task
> 18-21 kode lengkap + Task 22 navigasi), pola sama Tahap 2. Tahap 4-7
> (Task 23-26) TETAP kerangka riset — belum digali sesi ini.

### Task 17: [Tahap 3] Budget & Cost Control — riset & breakdown

- [x] **Step 1: Riset endpoint+permission** modul `cecep` (estimasi/RAP/
AHSP/WBS/markup).

  **Dokumen dibaca lebih dulu** (peringatan brief diikuti penuh):
  `docs/KEPUTUSAN-SCOPE-ERP-AI.md` (GL/WIP masih gerbang §4-5, tapi CECEP
  sendiri TIDAK disebut sebagai item yang ditahan — engine AHSP/RAB/RAP
  sudah lama hidup, ini soal UI mobile bukan soal scope baru) ·
  `docs/PETA-PRIORITAS-ERP.md` §2 (baris `CECEP/` — planning SELESAI,
  Progres verified 2026-07-26/27, rombak UI 2026-08-16/17 SELESAI) ·
  `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` (baris "Estimating / AHSP" —
  UI dirombak 2026-08-16, `/estimasi` dipecah jadi 7 rute) ·
  `docs/superpowers/specs/2026-08-16-cecep-rombak-ui-design.md` (spec
  rombak UI web yang BARU SAJA selesai — desktop CECEP bukan lagi satu
  file 4.070 baris, sudah jadi 7 rute berdiri sendiri sejak 2026-08-17)
  · `~/.claude/…/memory/project-cecep-progress.md` (CI isolation tuntas,
  sumbu edisi migrasi 117, temuan SE47-vs-Cibuluh −13,47%, gerbang
  founder GL/asset/opname masih forward-draft — tak menghalangi kerja
  UI ini).

  **Koreksi PALING PENTING atas brief**: brief menulis "modul `cecep`" dan
  "`estimasi/rab` 1140 baris dan `master/ahsp` 950 baris" seolah modul ini
  MASIH satu berkas raksasa seperti yang ditemukan audit 2026-08-16. **Itu
  sudah BASI sejak 2026-08-17** — `docs/superpowers/specs/2026-08-16-cecep-
  rombak-ui-design.md` §8 mencatat rombak itu SUDAH SELESAI (8/8 langkah
  ✅). Diukur ulang hari ini (`wc -l`), angkanya PERSIS SAMA (1140 & 950)
  — tapi itu bukan lagi SATU berkas 4.070 baris bertab, melainkan DUA dari
  TUJUH rute web yang sudah berdiri sendiri:

  ```
  apps/web/app/(dashboard)/estimasi/page.tsx           434 baris  (dashbor daftar RAB)
  apps/web/app/(dashboard)/estimasi/rab/page.tsx       1140 baris  (susun RAB — inti)
  apps/web/app/(dashboard)/estimasi/rap/page.tsx        613 baris  (RAP)
  apps/web/app/(dashboard)/estimasi/kas/page.tsx        278 baris  (proyeksi kas)
  apps/web/app/(dashboard)/estimasi/varians/page.tsx    246 baris  (varians)
  apps/web/app/(dashboard)/master/ahsp/page.tsx         950 baris  (katalog AHSP)
  apps/web/app/(dashboard)/master/harga/page.tsx        871 baris  (price book)
  ```

  Ini MENGUBAH breakdown: bukan "satu modul monolitik yang harus dipotong
  jadi versi mobile", melainkan TUJUH modul yang sudah terpisah secara
  arsitektural di desktop — breakdown Step 2 mengikuti garis pemisah yang
  SAMA (bukan garis baru), karena itulah yang sudah terbukti masuk akal
  bagi orang yang memakainya.

  **Permission — 19 KEY DISTINCT terverifikasi ke `role_permissions`**
  (brief benar; dihitung dari kunci UNIK, tabel `role_permissions` punya
  baris ganda per company jadi hitungan mentah 38 turun jadi 19 distinct).
  Query langsung ke Supabase (bukan tebakan dari kode):

  ```sql
  -- role='pm', key LIKE 'cecep:%', DISTINCT
  cecep:assembly:view · cecep:cbs:view · cecep:cost_code:view ·
  cecep:cost_map:view · cecep:edition:view · cecep:estimate:manage ·
  cecep:estimate:view · cecep:formula:view · cecep:lessons:view ·
  cecep:markup:view · cecep:price:view · cecep:productivity:view ·
  cecep:rap:manage · cecep:rap:view · cecep:resource:view ·
  cecep:struktur:view · cecep:takeoff:manage · cecep:takeoff:view ·
  cecep:wbs:view
  ```

  PM hanya `manage` untuk TIGA: `estimate`, `rap`, `takeoff` — sisanya
  VIEW-ONLY (`assembly`/`cbs`/`cost_code`/`cost_map`/`price`/`markup`/
  `wbs`/`struktur`/`resource`/`lessons` semua view saja, PM tak bisa
  create/edit master data AHSP/harga/WBS dari mobile). Ini keputusan
  ARSITEKTURAL yang mengikat breakdown: halaman Katalog AHSP & Price Book
  mobile WAJIB read-only (nol tombol tambah/ubah), bukan kelalaian.

  Total permission `cecep:*` di katalog: **35** (bukan 19 — 19 adalah
  subset milik PM). `cecep:estimate:approve` dan `cecep:lessons:approve`
  ada di katalog tapi PM TIDAK memilikinya — approval estimasi bukan
  wewenang PM di skema permission saat ini (diverifikasi, bukan diasumsikan).

  **Temuan kritis — dua DATASET berbeda dengan nama mirip, JANGAN tertukar:**

  | | `rab_items` (RAB proyek) | `estimate_items` (Komposer CECEP) |
  |---|---|---|
  | Route file | `rab.ts` | `estimate-versions.ts` |
  | Gerbang | `authenticate` (baca) / `projects:edit` (tulis) — **PM PUNYA PENUH, BUKAN `cecep:*`** | `cecep:estimate:view`/`:manage` |
  | Dipakai oleh | Gantt, Kurva-S, EVM, Look-Ahead, progress fisik, `sec-rab`/`sec-gantt`/`sec-kurvas` admin | Komposer `/estimasi/rab` desktop, dashbor `/estimasi` |
  | Hubungan | `estimate_items` **DISALIN** (bukan dirujuk) ke `rab_items` lewat `POST /estimate-versions/:id/terapkan-ke-rab` — sekali salin, dua tabel lepas lagi | — |

  Ini KENAPA `cc-rab`/`jd-gantt`/`jd-kurva-s`/`jd-evm`/`cc-etc`/`cc-bac`
  di `peta-menu.ts` semuanya `tabProyek` pada `/proyek/[id]` admin (bukan
  `cecep:*`): mereka membaca `rab_items`+`projects`, gerbangnya sudah
  `projects:edit`/`projects:view` yang PM PUNYA PENUH — TIDAK ada
  permission baru yang perlu dicek untuk bagian ini, hanya endpoint
  standalone yang perlu ditemukan (sudah, lihat Step di bawah) supaya
  tak terjebak `tabProyek` seperti dugaan awal.

  **`GET /api/v1/projects/:projectId/kurva-s` (`kurva-s.ts`, 517 baris,
  gerbang `authenticate` SAJA — PM otomatis bisa)** adalah SATU endpoint
  yang memuat KEEMPAT `tabProyek` sekaligus: Kurva-S (`chartData` per
  minggu), EVM (`meta.evm` — `bac/ac/ev/pv/cpi/spi/sv/cv/eac/etc/vac/
  tcpi`, BAC berjenjang RAP-terkunci→RAB→contract_value lewat
  `meta.evm.bacSource`), Cost-to-Complete (`meta.evm.etc`), dan Cost
  Baseline/BAC (`meta.evm.bac`+`bacSource`). **Satu panggilan API,
  empat entri `peta-menu.ts`** — breakdown Task 21 memakainya sebagai
  SATU halaman, bukan empat.

  **Gantt** (`GET /api/v1/projects/:projectId/rab/gantt`, di `rab.ts`,
  gerbang `authenticate`) memulangkan `tasks[]` dengan `planned_start/
  end`, `dep_rules`, dan **actual_start/actual_end/execution_end**
  (earned-completion — `actual_end` = pertama kali progress ≥100%,
  BUKAN log terakhir; lihat memory `project-earned-completion-design`).
  Field ini gampang tertukar dan sudah pernah jadi cacat historis di
  modul lain — dicatat eksplisit di sini supaya Task 21 tak menebak.

  **Look-Ahead** (`GET /rab/look-ahead?minggu=N`, `rab.ts`) — SUDAH ADA
  di `pm-portal/jadwal` sejak Task 15 (Tahap 2, dari payload
  `jadwal-cpm`). **TIDAK perlu dibangun ulang** — dicek: field yang
  dikembalikan `rab.ts` (`categoryCode`/`plannedStart`/`plannedEnd`/
  `progressPct`/`totalPrice`) BUKAN sumber yang sama dengan yang dipakai
  `jadwal-cpm.ts` (field CPM), jadi ini catatan untuk Task 21 memverifikasi
  ulang — TAPI kapasitasnya sudah tercakup secara FUNGSIONAL (pertanyaan
  "apa yang harus disiapkan minggu ini" sudah terjawab jalur lain).
  Tidak dibuatkan halaman terpisah.

  **Change Order** (`kt-co`, `change-orders.ts`, endpoint PENUH berdiri
  sendiri: `GET/POST /projects/:projectId/change-orders`, item CRUD,
  `submit`/`approve`/`reject`, gerbang `projects:edit` — PM punya).
  **BUKAN murni `tabProyek`** seperti dugaan Task 11/16 — ini KOREKSI
  atas catatan Task 16 ("`kt-co` … TIDAK dibangun Task 12-15 karena butuh
  hub tab PM… dicatat sebagai UTANG"). Endpoint berdiri sendiri per
  proyek SUDAH ADA sejak awal; yang tak ada cuma halaman PM-nya. Breakdown
  Task 21 menutup utang ini LANGSUNG tanpa menunggu hub `proyek/[id]`.

  **RAP** (`rap.ts`) — `GET/POST /projects/:projectId/rap` (daftar+buat),
  `GET /rap/:id` (detail: material+labor+total), `PATCH /rap/:id/material/
  :lineId` (qty_adjusted, HANYA saat draft), `POST /rap/:id/labor`,
  `PATCH /rap/:id/lock` (beku permanen — TAK ADA jalur buka kunci),
  `POST`+`GET /rap/:id/change-log` (alasan WAJIB, trigger DB). Gerbang
  `cecep:rap:view`/`:manage` — PM punya KEDUANYA.

  **Markup** — `GET /markup/berlaku` (baca aturan aktif per jenis+biaya
  pokok), `POST` (buat versi baru — markup APPEND-ONLY, versi lama tetap
  ada sebagai riwayat, bukan di-update), `DELETE /markup/:id`. Gerbang
  `cecep:markup:view`/`:manage` — **PM HANYA VIEW**, jadi mobile
  read-only (lihat aturan markup berlaku, tak bisa ubah dari HP).

  **Template WBS** (`template-wbs.ts`) — `GET /template-wbs` (daftar),
  `GET /template-wbs/:id` (detail pohon), `POST` (buat), `PATCH /:id/
  status`, `POST /:id/terapkan` (MENOLAK proyek yang sudah ber-RAB —
  guard destruktif, lihat catatan `md-wbs` di `peta-menu.ts`). Gerbang
  `cecep:wbs:view` — **PM HANYA VIEW**, jadi mobile read-only (lihat
  template, tak bisa terapkan/buat dari HP — aksi destruktif "hapus RAB
  proyek" tak cocok jadi aksi satu ketuk di layar kecil).

  **Cost Control** (`cost-control.ts`) — `cost-codes`, `cost-map` (+
  saran), `belanja-aktual`, `cvr` (Cost Value Reconciliation, status
  `sebagian` — catatan `cc-cvr` di `peta-menu.ts` menjelaskan panjang
  KENAPA sebagian: dua taksonomi kategori yang tak pernah bertemu secara
  struktural, BUKAN kode yang kurang), `varians`. Gerbang campuran:
  `cecep:cost_code:view` (PM punya), `cecep:cost_map:view`/`:manage`
  (PM hanya view), `reports:view` (untuk `cvr`/`varians` — **PM TIDAK
  diverifikasi punya `reports:view`**, dicek terpisah di Task 21).

  **Contingency** (`contingency.ts`, migrasi 200) — gerbang
  `projects:view`/`projects:edit` (bukan `cecep:*`), PM punya penuh.
  Terpisah dari CECEP secara modul tapi masuk grup `g-cost` yang sama.

  **WIP/PSAK** (`wip.ts`, `GET /reports/wip`) — gerbang `reports:view`,
  SENGAJA di luar scope (§4 `KEPUTUSAN-SCOPE-ERP-AI.md`: "TOOL AI
  FINANSIAL … TETAP MENUNGGU #15 WIP/PSAK" — endpoint baca-nya sendiri
  ada, tapi ini laporan pengakuan pendapatan tingkat perusahaan, bukan
  kerja harian PM per proyek; `cc-wip` di `peta-menu.ts` menunjuk
  `/laporan?tab=wip`, tetap fallback web, TIDAK dibangun versi mobile
  Tahap 3 ini — beda alasan dari yang lain: bukan kurang endpoint,
  tapi salah lapis kerja untuk PM harian).

- [x] **Step 2: Tulis breakdown Task 18-21** (plus Task 22 navigasi;
  placeholder lama "Task 18: [Tahap 4] Pengadaan…" digeser ke Task 23,
  dan lama Task 19/20/21 digeser ke Task 24/25/26 — lihat pemetaan
  renumbering di laporan). Dipecah jadi EMPAT task kode (bukan
  satu task CECEP raksasa) mengikuti prinsip *task right-sizing*
  (`writing-plans`): tiap task adalah unit yang punya siklus test sendiri
  dan modul yang tak saling bergantung kuat secara data (Master Data
  view-only ≠ RAB kerja harian ≠ RAP anggaran ≠ Cost Control lintas-tab
  admin) — mem-paksanya jadi satu task akan membuat satu commit menyentuh
  8+ halaman sekaligus, terlalu besar untuk direview segar sekali baca.

  Pembagian (alasan detail di riset atas):
  - **Task 18** — Master Data CECEP, READ-ONLY (Katalog AHSP + Price
    Book + Template WBS). PM view-only untuk ketiganya — halaman paling
    aman untuk dibangun duluan karena nol risiko tulis.
  - **Task 19** — RAB per proyek: dashbor daftar RAB (`GET
    /estimate-versions`, pola §3c spec rombak — satu baris per RAB,
    dikelompokkan per proyek) + detail versi + tambah item LUMPSUM
    (sederhana) — item ASSEMBLY (perlu pencarian AHSP + resolve harga)
    disediakan lewat picker sederhana yang memanggil endpoint yang SAMA
    dengan desktop, bukan endpoint baru.
  - **Task 20** — RAP: anggaran pelaksanaan (material+labor+lock+
    change-log) + Markup (read-only, PM hanya view).
  - **Task 21** — Cost Control lintas-proyek: Kurva-S+EVM+ETC+BAC (SATU
    halaman, endpoint sama), Change Order (menutup utang Task 16 —
    endpoint berdiri sendiri, TIDAK perlu menunggu hub `proyek/[id]`),
    Cashflow (`/estimasi/kas` — endpoint `estimate-versions/:id/
    cashflow-forecast`), Varians (`cost-control.ts`), Contingency.

  **Hub `pm-portal/proyek/[id]` — TIDAK dibangun di Tahap 3 juga.**
  Riset Step 1 membalik dugaan brief: SEMUA `tabProyek` CECEP
  (`cc-rab`/`jd-gantt`/`jd-kurva-s`/`jd-evm`/`cc-etc`/`cc-bac`) ternyata
  py endpoint standalone per-proyek (`rab.ts`, `kurva-s.ts`) — pola
  PERSIS sama dengan yang Task 11 temukan untuk `kt-eot`/`kt-ld`/`kt-bond`
  di Tahap 2. Change Order (`kt-co`) yang tadinya dicatat "murni tabProyek,
  butuh hub" di Task 16 pun ternyata punya endpoint sendiri. **Hasilnya:
  hub belum benar-benar dibutuhkan sampai Tahap 7** (Task 22 lama →
  Task 26 lama → kini Task 29, setelah Tahap 4 disisipkan Task 23) —
  dicatat ulang di sana, bukan dibangun prematur di sini.

### Task 18: Master Data CECEP (read-only) — Katalog AHSP, Price Book, Template WBS

**Files:**
- Create: `apps/web/app/pm-portal/cecep/ahsp/page.tsx`
- Create: `apps/web/app/pm-portal/cecep/harga/page.tsx`
- Create: `apps/web/app/pm-portal/cecep/wbs/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Kenapa read-only**: diverifikasi Task 17 Step 1 ke `role_permissions` —
PM hanya punya `cecep:resource:view`/`cecep:price:view`/`cecep:wbs:view`,
BUKAN `:manage` untuk ketiganya. Halaman ini sengaja TANPA tombol tambah/
ubah/hapus — bukan kelalaian, keputusan permission yang sudah ada.

- [ ] **Step 1: Tipe di `_bersama/tipe.ts`**

Bentuk `assemblies` diverifikasi PERSIS ke `apps/api/src/routes/v1/
ahsp.ts:283-289` (`GET /cecep/assemblies`). **Price Book dan Template
WBS dikoreksi ULANG 2026-08-21** — draf pertama menebak dua bentuk
salah (fields flat yang ternyata bersarang, kunci `data` yang ternyata
`template`); koreksi ini dibaca baris-per-baris LANGSUNG dari
`price-book.ts` (baris 63-69, SELECT utama) dan `template-wbs.ts`
(baris 33-77, endpoint list) + `lib/template-wbs.ts` (baris 36,
`StatusTemplate`; baris 203-211, `RingkasTemplate`) — bukan ditebak
dari nama field yang lazim.

```typescript
/** Baris katalog AHSP nasional. `GET /api/v1/cecep/assemblies`. */
export interface AssemblyKatalog {
  id: string
  code: string
  name: string
  source: string
  version_number: number
  status: "draft" | "active" | "deprecated" | string
  waste_factor: number | string | null
  output_unit_code: string | null
  is_import_baseline: boolean
  edit_type: string | null
  edition: { code: string; name: string } | null
  components: Array<{
    coefficient: number | string
    sort_order: number | null
    resource: { code: string; name: string; category: string | null; unit_code: string | null } | null
  }>
}
export interface RespAssemblyKatalog {
  data: AssemblyKatalog[]
  total: number | null
  limit: number
}

/**
 * Baris price book. Bentuk PERSIS `GET /cecep/price-book`,
 * `price-book.ts:63-69` — `resource` BERSARANG dari PostgREST
 * (`resource:resources(id, code, name, category, unit_code)`), BUKAN
 * field flat `resource_code`/`resource_name` seperti draf pertama.
 * `supplier` (BUKAN `source_note`) — field itu tak ada di endpoint ini
 * sama sekali. `status` di sini adalah status HARGA
 * (draft→verified→active→expired), BUKAN status assembly di atas — dua
 * enum berbeda, jangan disatukan.
 */
export interface HargaSatuan {
  id: string
  amount: number | string
  currency: string
  version_number: number
  effective_date: string
  expired_date: string | null
  location: string | null
  supplier: string | null
  confidence_level: string | null
  status: "draft" | "verified" | "active" | "expired"
  verified_at: string | null
  created_at: string
  resource: { id: string; code: string; name: string; category: string | null; unit_code: string | null } | null
}
export interface RespHargaSatuan {
  data: HargaSatuan[]
  total: number | null
  limit: number
}

/**
 * Baris ringkasan Template WBS. Bentuk PERSIS `RingkasTemplate`,
 * `apps/api/src/lib/template-wbs.ts:203-211`, dikirim `GET /template-
 * wbs` (`template-wbs.ts:67-76`) — field TAMBAHAN dari route (bukan
 * dari `RingkasTemplate` lib) disertakan juga: `description`,
 * `activated_at`, `created_at`, dan `milik_bersama` (turunan
 * `company_id === null` — katalog `standard` lintas-tenant, tak bisa
 * disunting tenant ini).
 *
 * ⚠️ Status BUKAN "draft"|"published"|"archived" (tebakan draf
 * pertama) — union ASLI dari `lib/template-wbs.ts:36`:
 * "draft"|"active"|"superseded". "active" berarti SIAP DITERAPKAN ke
 * proyek, "superseded" berarti sudah digantikan versi lebih baru
 * (draf tak bisa kembali jadi aktif — trigger DB menegakkan alur maju
 * saja, lihat `template-wbs.ts:241-246`).
 */
export interface TemplateWbsRingkas {
  id: string
  code: string
  name: string
  description: string | null
  source: string
  version_number: number
  status: "draft" | "active" | "superseded"
  activated_at: string | null
  created_at: string
  jumlahNode: number
  milik_bersama: boolean
}
/** Bentuk PERSIS `reply.send({ template: [...] })`, `template-wbs.ts:52,67`
 * — kunci `template`, BUKAN `data` seperti draf pertama. Membaca
 * `data?.data` pada respons asli SELALU jadi `[]` — halaman akan
 * SELALU menampilkan "Belum ada template" walau datanya ada. */
export interface RespTemplateWbsList {
  template: TemplateWbsRingkas[]
}
```

- [ ] **Step 2: `cecep/ahsp/page.tsx`** — pencarian SERVER-SIDE (parameter
`q`, bukan filter di klien — riset Step 1 Task 17 menegaskan katalog
3.000+ baris tak boleh disaring di klien setelah termuat sebagian).
Input pencarian dengan debounce 300ms, daftar kartu (kode, nama, satuan
output, jumlah komponen), tap kartu buka `BottomSheet` berisi rincian
komponen (resource+koefisien) — read-only, tanpa tombol edit.

```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Layers, ChevronRight } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespAssemblyKatalog, AssemblyKatalog, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function PmKatalogAhspPage() {
  const [cari, setCari] = useState("");
  const cariDebounced = useDebounced(cari, 300);
  const [dipilih, setDipilih] = useState<AssemblyKatalog | null>(null);

  const url = `/api/v1/cecep/assemblies?limit=100${cariDebounced ? `&q=${encodeURIComponent(cariDebounced)}` : ""}`;
  const { data, memuat, galat } = useData<RespAssemblyKatalog>(url);

  const daftar = data?.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Katalog AHSP
      </h1>

      <div style={{ position: "relative" }}>
        <Search size={16} color="var(--text-secondary)" aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari kode atau nama analisa…"
          aria-label="Cari analisa AHSP"
          style={{ width: "100%", minHeight: 44, padding: "0 12px 0 36px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        />
      </div>

      {data?.total != null && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Menampilkan {daftar.length} dari {data.total} analisa
        </div>
      )}

      {memuat && <SkeletonCard tinggi={72} />}
      {galat && <EmptyState icon={Layers} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && !galat && daftar.length === 0 && (
        <EmptyState icon={Layers} judul={cariDebounced ? "Tidak ditemukan" : "Katalog kosong"} deskripsi={cariDebounced ? `Tak ada analisa cocok "${cariDebounced}".` : "Belum ada analisa AHSP terdaftar."} />
      )}

      {daftar.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => setDipilih(a)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "left", cursor: "pointer" }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{a.code}</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {a.output_unit_code ?? "—"} · {a.components.length} komponen · {a.edition?.code ?? a.source}
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-secondary)" aria-hidden="true" style={{ flexShrink: 0 }} />
        </button>
      ))}

      <BottomSheet terbuka={dipilih !== null} onTutup={() => setDipilih(null)} judul={dipilih?.code ?? ""}>
        {dipilih && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{dipilih.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Satuan {dipilih.output_unit_code ?? "—"} · Faktor limbah {dipilih.waste_factor ?? "—"}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginTop: 4 }}>Komponen</div>
            {dipilih.components.map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{c.resource?.name ?? "—"}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{c.coefficient} {c.resource?.unit_code ?? ""}</div>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 3: `cecep/harga/page.tsx`** — daftar harga terkini, dikelompokkan
per status (`active` dulu, lalu `verified`/`draft`/`expired` dilipat
default). Badge status berwarna (`active`=approved, `expired`=rejected,
`draft`/`verified`=netral). Read-only, tanpa form tambah harga. **Dikoreksi
2026-08-21**: nama resource dibaca dari `h.resource?.name`/`h.resource?.code`
(objek bersarang), bukan `h.resource_name`/`h.resource_code` flat — draf
pertama salah bentuk dan SETIAP baris akan jatuh ke fallback "—" secara
senyap. Baris "sumber" memakai `h.supplier`, bukan `h.source_note` (field
itu tak ada di respons endpoint ini).

```typescript
"use client";

import { useMemo, useState } from "react";
import { DollarSign, ChevronDown } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespHargaSatuan, HargaSatuan, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", verified: "Terverifikasi", active: "Aktif", expired: "Kedaluwarsa",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", verified: "info", active: "approved", expired: "rejected",
};
const URUTAN_STATUS = ["active", "verified", "draft", "expired"];

export default function PmPriceBookPage() {
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set(["active"]));
  const { data, memuat, galat } = useData<RespHargaSatuan>("/api/v1/cecep/price-book?limit=300");

  const kelompok = useMemo(() => {
    const m = new Map<string, HargaSatuan[]>();
    for (const h of data?.data ?? []) {
      const k = h.status;
      m.set(k, [...(m.get(k) ?? []), h]);
    }
    return m;
  }, [data]);

  function toggle(status: string) {
    setTerbuka((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Price Book
      </h1>

      {memuat && <SkeletonCard tinggi={72} />}
      {galat && <EmptyState icon={DollarSign} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && !galat && (data?.data ?? []).length === 0 && (
        <EmptyState icon={DollarSign} judul="Belum ada harga" deskripsi="Price book perusahaan masih kosong." />
      )}

      {URUTAN_STATUS.map((status) => {
        const baris = kelompok.get(status) ?? [];
        if (baris.length === 0) return null;
        const buka = terbuka.has(status);
        return (
          <div key={status} style={{ borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => toggle(status)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, background: "transparent", border: "none", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusBadge status={VARIAN_STATUS[status] ?? "netral"} label={LABEL_STATUS[status] ?? status} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{baris.length} harga</span>
              </div>
              <ChevronDown size={16} color="var(--text-secondary)" aria-hidden="true" style={{ transform: buka ? "none" : "rotate(-90deg)", transition: "transform 150ms" }} />
            </button>
            {buka && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                {baris.map((h) => (
                  <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{h.resource?.name ?? h.resource?.code ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {h.location ?? "Umum"} · berlaku {h.effective_date}
                        {h.supplier ? ` · ${h.supplier}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", flexShrink: 0 }}>{fmtRupiah(h.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: `cecep/wbs/page.tsx`** — daftar template (kode, nama,
jumlah baris struktur, versi, status), tap buka detail pohon read-only.
Tanpa tombol "Terapkan" (aksi destruktif — menolak proyek ber-RAB, tak
cocok jadi aksi mobile satu ketuk tanpa konteks penuh). **Dikoreksi
2026-08-21**: dibaca `data?.template` (bukan `data?.data`), status
`draft|active|superseded` (bukan `draft|published|archived`), dan
`jumlahNode` ditampilkan — field ini yang dicatat komentar backend
sebagai "angka paling menentukan di layar" (template tanpa baris
struktur terlihat sama dengan yang berisi 40 baris sampai dibuka).

```typescript
"use client";

import { useState } from "react";
import { GitBranch, ChevronRight } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespTemplateWbsList, TemplateWbsRingkas, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = { draft: "Draf", active: "Aktif", superseded: "Tergantikan" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "netral", active: "approved", superseded: "rejected" };

export default function PmTemplateWbsPage() {
  const { data, memuat, galat } = useData<RespTemplateWbsList>("/api/v1/template-wbs");
  const daftar = data?.template ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Template WBS
      </h1>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
        Kerangka pekerjaan siap pakai. Menerapkan template ke proyek hanya
        tersedia di web — aksi ini menolak proyek yang sudah punya RAB.
      </p>

      {memuat && <SkeletonCard tinggi={64} />}
      {galat && <EmptyState icon={GitBranch} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && !galat && daftar.length === 0 && (
        <EmptyState icon={GitBranch} judul="Belum ada template" deskripsi="Template WBS belum dibuat." />
      )}

      {daftar.map((t: TemplateWbsRingkas) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {t.code} · {t.name}
              {t.milik_bersama && (
                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: "var(--text-secondary)" }}>· Katalog bersama</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Versi {t.version_number} · {t.jumlahNode} baris struktur
            </div>
          </div>
          <StatusBadge status={VARIAN_STATUS[t.status] ?? "netral"} label={LABEL_STATUS[t.status] ?? t.status} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + penjaga**

```bash
cd apps/web && pnpm exec tsc --noEmit
node scripts/uji-token-css-ada.mjs
node scripts/uji-judul-halaman-ada.mjs
node scripts/uji-remah-lengkap.mjs
node scripts/audit-halaman-pakai-cache.mjs
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pm-portal/cecep apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): Master Data CECEP read-only — Katalog AHSP, Price Book, Template WBS"
```

### Task 19: RAB per proyek — dashbor daftar + susun item

**Files:**
- Create: `apps/web/app/pm-portal/cecep/rab/page.tsx`
- Create: `apps/web/app/pm-portal/cecep/rab/[id]/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Riset (Task 17 Step 1)**: `GET /api/v1/estimate-versions` (dashbor
datar, gerbang `cecep:estimate:view` — PM punya) mengembalikan
`{id, version_number, status, total_amount, created_at, scenario_id,
scenario_name, project_id, project_name, edition_code}[]` beserta
`meta:{jumlah, batas, terpotong}` — dipetakan sesuai spec rombak §3c
(satu baris per RAB, dikelompokkan per proyek, `total_amount: null`
tetap "—" bukan Rp 0). `GET /estimate-versions/:id` (gerbang sama)
mengembalikan detail + `items: estimate_items[]` bersarang dengan
`cost_code`+`assembly` (lihat bentuk PERSIS di riset Task 17 —
`assembly:assemblies(id, code, name, output_unit_code, source,
version_number)`, BUKAN medan datar `assembly_name`/`assembly_code`).

- [ ] **Step 1: Tipe di `_bersama/tipe.ts`**

```typescript
/** Satu baris RAB — bentuk PERSIS `GET /api/v1/estimate-versions`,
 * `estimate-versions.ts:296-321`. `total_amount: null` = belum dihitung,
 * BEDA dari 0 rupiah (spec rombak §3c). */
export interface BarisRabDaftar {
  id: string
  version_number: number
  status: "draft" | "under_review" | "approved" | "rejected" | string
  total_amount: number | null
  created_at: string
  scenario_id: string | null
  scenario_name: string | null
  project_id: string | null
  project_name: string | null
  edition_code: string | null
}
export interface RespRabDaftar {
  data: BarisRabDaftar[]
  meta: { jumlah: number; batas: number; terpotong: boolean }
}

/** Item RAB dalam satu versi. Bentuk PERSIS `estimate-versions.ts:432-436`
 * — `assembly` BERSARANG dari PostgREST, bukan medan datar. Item lumpsum
 * (`assembly: null`) memakai `notes` sebagai nama tampilnya. */
export interface ItemEstimasi {
  id: string
  quantity: number | string
  amount: number | string
  sort_order: number | null
  notes: string | null
  cost_code: { code: string; name: string } | null
  assembly: { id: string; code: string; name: string; output_unit_code: string | null; source: string; version_number: number } | null
}
export interface RespRabDetail {
  data: {
    id: string
    scenario_id: string
    version_number: number
    status: "draft" | "under_review" | "approved" | "rejected" | string
    total_amount: number | string | null
    approved_by: string | null
    approved_at: string | null
    frozen_at: string | null
    created_at: string
    edition: { code: string; name: string } | null
    items: ItemEstimasi[]
  }
}

/** Hasil pencarian analisa untuk picker tambah-item — subset field dari
 * `AssemblyKatalog` (Task 18), cukup untuk memilih + menghitung. */
export interface AssemblyRingkasPicker {
  id: string
  code: string
  name: string
  output_unit_code: string | null
}
```

- [ ] **Step 2: `cecep/rab/page.tsx`** — dashbor daftar, satu baris per
RAB dikelompokkan per `project_id` (pola spec rombak §3c yang SUDAH
disetujui founder untuk versi web — dipakai lagi di sini karena masalah
yang dipecahkannya sama persis: "orang gagal MENEMUKAN KEMBALI RAB yang
sudah ada", bukan soal cara membuatnya). Filter status via `SegmentedTab`
(Semua/Draf/Diajukan/Disetujui). Search nama proyek client-side (jumlah
RAB realistis per company jauh di bawah ambang server-side search).

```typescript
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Search } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { RespRabDaftar, BarisRabDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Masih disusun", under_review: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", under_review: "pending", approved: "approved", rejected: "rejected",
};
const FILTER_OPSI = [
  { value: "semua", label: "Semua" },
  { value: "draft", label: "Draf" },
  { value: "under_review", label: "Diajukan" },
  { value: "approved", label: "Disetujui" },
];

export default function PmRabDaftarPage() {
  const [filter, setFilter] = useState("semua");
  const [cari, setCari] = useState("");
  const { data, memuat, galat } = useData<RespRabDaftar>("/api/v1/estimate-versions?limit=200");

  const tersaring = useMemo(() => {
    let baris = data?.data ?? [];
    if (filter !== "semua") baris = baris.filter((b) => b.status === filter);
    if (cari.trim()) {
      const q = cari.trim().toLowerCase();
      baris = baris.filter((b) => (b.project_name ?? "").toLowerCase().includes(q));
    }
    return baris;
  }, [data, filter, cari]);

  const perProyek = useMemo(() => {
    const m = new Map<string, { nama: string; baris: BarisRabDaftar[] }>();
    for (const b of tersaring) {
      const key = b.project_id ?? "tanpa-proyek";
      const entry = m.get(key) ?? { nama: b.project_name ?? "Tanpa proyek", baris: [] };
      entry.baris.push(b);
      m.set(key, entry);
    }
    return [...m.entries()];
  }, [tersaring]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        RAB
      </h1>

      <div style={{ position: "relative" }}>
        <Search size={16} color="var(--text-secondary)" aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama proyek…"
          aria-label="Cari RAB berdasarkan proyek"
          style={{ width: "100%", minHeight: 44, padding: "0 12px 0 36px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
        />
      </div>

      <SegmentedTab opsi={FILTER_OPSI} aktif={filter} onUbah={setFilter} />

      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={FileSpreadsheet} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && !galat && perProyek.length === 0 && (
        <EmptyState icon={FileSpreadsheet} judul="Tidak ada RAB" deskripsi={cari || filter !== "semua" ? "Tak ada yang cocok dengan filter ini." : "Belum ada RAB tersusun."} />
      )}

      {perProyek.map(([projectId, { nama, baris }]) => (
        <div key={projectId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{nama}</div>
          {baris.map((b) => (
            <Link
              key={b.id}
              href={`/pm-portal/cecep/rab/${b.id}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {b.scenario_name ?? "Utama"} · revisi {b.version_number}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {b.edition_code ?? "edisi belum dipilih"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(b.total_amount)}</div>
                <StatusBadge status={VARIAN_STATUS[b.status] ?? "netral"} label={LABEL_STATUS[b.status] ?? b.status} />
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `cecep/rab/[id]/page.tsx`** — detail versi: header
(status, edisi, total), daftar item (kode/nama, volume, jumlah), tombol
"+ Item" buka `BottomSheet` dua-mode (Lumpsum sederhana vs cari Analisa
AHSP — pola picker Task 18 dipakai ulang lewat query `q` server-side),
tombol hapus item per-baris (hanya saat `draft`), tombol submit/approve/
reject sesuai status (pola transisi status Task 12). Item hanya bisa
ditambah/dihapus saat `draft` (ditegakkan backend, UI menyembunyikan
tombolnya di status lain supaya tak mengundang 409 yang membingungkan).

```typescript
"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { FileSpreadsheet, Plus, Trash2, Search, HelpCircle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { RespRabDetail, ItemEstimasi, RespAssemblyKatalog, AssemblyRingkasPicker, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Masih disusun", under_review: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", under_review: "pending", approved: "approved", rejected: "rejected",
};

export default function PmRabDetailPage() {
  const params = useParams<{ id: string }>();
  const versiId = params.id;

  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [modeTambah, setModeTambah] = useState<"lumpsum" | "assembly">("lumpsum");
  const [cariAssembly, setCariAssembly] = useState("");
  const [assemblyDipilih, setAssemblyDipilih] = useState<AssemblyRingkasPicker | null>(null);
  const [qty, setQty] = useState("");
  const [lumpsumNama, setLumpsumNama] = useState("");
  const [lumpsumJumlah, setLumpsumJumlah] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [galatTolak, setGalatTolak] = useState("");
  const [sheetTolakTerbuka, setSheetTolakTerbuka] = useState(false);

  const url = `/api/v1/estimate-versions/${versiId}`;
  const { data, memuat, galat } = useData<RespRabDetail>(url);
  const v = data?.data;

  const { data: dataCari } = useData<RespAssemblyKatalog>(
    modeTambah === "assembly" && cariAssembly.trim().length >= 2
      ? `/api/v1/cecep/assemblies?limit=20&q=${encodeURIComponent(cariAssembly.trim())}`
      : null
  );

  function bukaTambah() {
    setModeTambah("lumpsum");
    setCariAssembly("");
    setAssemblyDipilih(null);
    setQty("");
    setLumpsumNama("");
    setLumpsumJumlah("");
    setGalatAksi(null);
    setSheetTerbuka(true);
  }

  async function simpanItem() {
    if (!v) return;
    setMengirim(true);
    setGalatAksi(null);
    try {
      if (modeTambah === "lumpsum") {
        if (lumpsumNama.trim().length === 0 || !lumpsumJumlah || Number(lumpsumJumlah) <= 0) {
          setGalatAksi("Nama dan jumlah (Rp) wajib diisi.");
          setMengirim(false);
          return;
        }
        // cost_code_id wajib di backend — mobile pakai kode umum "LAIN"
        // sebagai default; pemilihan cost code spesifik tetap di web.
        await api.post(`/api/v1/estimate-versions/${versiId}/items`, {
          item_type: "lumpsum",
          amount: Number(lumpsumJumlah),
          notes: lumpsumNama.trim(),
        });
      } else {
        if (!assemblyDipilih || !qty || Number(qty) <= 0) {
          setGalatAksi("Pilih analisa dan isi volume.");
          setMengirim(false);
          return;
        }
        await api.post(`/api/v1/estimate-versions/${versiId}/items`, {
          item_type: "assembly",
          assembly_id: assemblyDipilih.id,
          quantity: Number(qty),
          buk_fraction: 0,
          rounding: { mode: "none", step: 1 },
        });
      }
      setSheetTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menambah item"));
    } finally {
      setMengirim(false);
    }
  }

  async function hapusItem(itemId: string) {
    try {
      await api.delete(`/api/v1/estimate-versions/${versiId}/items/${itemId}`);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menghapus item"));
    }
  }

  async function submitVersi() {
    try {
      await api.patch(`/api/v1/estimate-versions/${versiId}/submit`);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengajukan RAB"));
    }
  }

  async function approveVersi() {
    try {
      await api.patch(`/api/v1/estimate-versions/${versiId}/approve`);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menyetujui RAB"));
    }
  }

  async function tolakVersi() {
    if (galatTolak.trim().length < 10) {
      setGalatAksi("Alasan penolakan minimal 10 karakter.");
      return;
    }
    try {
      await api.patch(`/api/v1/estimate-versions/${versiId}/reject`, { reason: galatTolak.trim() });
      setSheetTolakTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menolak RAB"));
    }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !v) {
    return <EmptyState icon={FileSpreadsheet} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "RAB tidak ditemukan.")} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Revisi {v.version_number}
        </h1>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
          {v.edition?.code ?? "edisi belum dipilih"}
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Status</span>
          <StatusBadge status={VARIAN_STATUS[v.status] ?? "netral"} label={LABEL_STATUS[v.status] ?? v.status} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(v.total_amount)}</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v.items.length} item</div>
      </div>

      {galatAksi && (
        <div role="alert" style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}>
          {galatAksi}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {v.status === "draft" && (
          <>
            <button type="button" onClick={bukaTambah} style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={16} aria-hidden="true" /> Item
            </button>
            <button type="button" onClick={submitVersi} disabled={v.items.length === 0} style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, cursor: v.items.length === 0 ? "not-allowed" : "pointer", opacity: v.items.length === 0 ? 0.5 : 1 }}>
              Ajukan
            </button>
          </>
        )}
        {v.status === "under_review" && (
          <>
            <button type="button" onClick={approveVersi} style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Setujui
            </button>
            <button type="button" onClick={() => setSheetTolakTerbuka(true)} style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Tolak
            </button>
          </>
        )}
      </div>

      {v.items.length === 0 && (
        <EmptyState icon={FileSpreadsheet} judul="Belum ada item" deskripsi="Tambahkan item dari analisa AHSP atau lumpsum." />
      )}

      {v.items.map((it: ItemEstimasi) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {it.assembly ? `${it.assembly.code} · ${it.assembly.name}` : (it.notes ?? "Item lumpsum")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {it.assembly ? `${it.quantity} ${it.assembly.output_unit_code ?? ""}` : "Lumpsum"} · {it.cost_code?.name ?? "—"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(it.amount)}</div>
            {v.status === "draft" && (
              <button type="button" onClick={() => hapusItem(it.id)} aria-label={`Hapus item ${it.assembly?.code ?? it.notes ?? ""}`} style={{ minHeight: 32, minWidth: 32, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Trash2 size={14} color="var(--danger)" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ))}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Tambah Item">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SegmentedTab
            opsi={[{ value: "lumpsum", label: "Lumpsum" }, { value: "assembly", label: "Cari Analisa" }]}
            aktif={modeTambah}
            onUbah={(v) => setModeTambah(v as "lumpsum" | "assembly")}
          />

          {modeTambah === "lumpsum" ? (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nama pekerjaan</span>
                <input value={lumpsumNama} onChange={(e) => setLumpsumNama(e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jumlah (Rp)</span>
                <input type="number" value={lumpsumJumlah} onChange={(e) => setLumpsumJumlah(e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
              </label>
            </>
          ) : (
            <>
              <div style={{ position: "relative" }}>
                <Search size={16} color="var(--text-secondary)" aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  type="search"
                  value={cariAssembly}
                  onChange={(e) => { setCariAssembly(e.target.value); setAssemblyDipilih(null); }}
                  placeholder="Ketik minimal 2 huruf…"
                  style={{ width: "100%", minHeight: 44, padding: "0 12px 0 36px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
                />
              </div>
              {!assemblyDipilih && (dataCari?.data ?? []).slice(0, 8).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAssemblyDipilih({ id: a.id, code: a.code, name: a.name, output_unit_code: a.output_unit_code })}
                  style={{ textAlign: "left", padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>{a.code}</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{a.name}</div>
                </button>
              ))}
              {assemblyDipilih && (
                <div style={{ padding: 10, borderRadius: 10, background: "var(--info-bg)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{assemblyDipilih.code} · {assemblyDipilih.name}</div>
                </div>
              )}
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Volume ({assemblyDipilih?.output_unit_code ?? "satuan"})</span>
                <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
              </label>
            </>
          )}

          {galatAksi && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>}

          <button type="button" onClick={simpanItem} disabled={mengirim} style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "wait" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan Item"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetTolakTerbuka} onTutup={() => setSheetTolakTerbuka(false)} judul="Tolak RAB">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Alasan (minimal 10 karakter)</span>
            <textarea value={galatTolak} onChange={(e) => setGalatTolak(e.target.value)} rows={4} style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <button type="button" onClick={tolakVersi} style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--danger)", color: "var(--on-danger)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Tolak RAB
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
```

⚠️ **Catatan yang WAJIB diverifikasi ulang saat eksekusi**: `POST
/estimate-versions/:id/items` mode `lumpsum` mewajibkan `cost_code_id`
(bukan opsional — lihat riset Task 17). Kode di atas TIDAK mengirimnya,
yang berarti backend akan menolak dengan 400 `cost_code_id wajib untuk
item lumpsum`. Ini SENGAJA ditulis sebagai draf awal yang salah di sini
— eksekutor Task 19 WAJIB menambah satu langkah sebelum Step 3: riset
ulang cara memilih cost code sederhana (mis. dropdown 1-2 pilihan
paling umum, atau endpoint `GET /cecep/cost-codes` dari `cost-control.ts`
Task 17 Step 1 sebagai picker kedua) dan memperbarui `simpanItem()` di
atas sebelum di-commit — dicatat eksplisit di sini alih-alih diam-diam
dibiarkan salah, mengikuti aturan "verifikasi field SETIAP sub-bagian
sebelum ditulis" yang plan ini pegang sejak Tahap 2.

- [ ] **Step 4: Typecheck + penjaga** (pola sama Task 18 Step 5, tambah
`uji-galat-muat-terpisah.mjs` karena halaman ini py aksi DI LUAR
BottomSheet — tombol hapus item per-baris — pelajaran Tahap 2 poin 3).

```bash
cd apps/web && pnpm exec tsc --noEmit
node scripts/uji-token-css-ada.mjs
node scripts/uji-judul-halaman-ada.mjs
node scripts/uji-remah-lengkap.mjs
node scripts/audit-halaman-pakai-cache.mjs
node scripts/uji-galat-muat-terpisah.mjs
node scripts/uji-rute-id-tak-basi.mjs
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pm-portal/cecep/rab apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): RAB per proyek — dashbor daftar + susun item"
```

### Task 20: RAP (anggaran pelaksanaan) + Markup (read-only)

**Files:**
- Create: `apps/web/app/pm-portal/cecep/rap/page.tsx`
- Create: `apps/web/app/pm-portal/cecep/rap/[id]/page.tsx`
- Create: `apps/web/app/pm-portal/cecep/markup/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Riset (Task 17 Step 1)**: `rap.ts` — daftar+detail+lock+change-log,
gerbang `cecep:rap:view`/`:manage`, PM punya keduanya. `qty_adjusted`
HANYA bisa diubah saat status bukan `locked` (ditegakkan backend); sekali
`locked`, TAK ADA jalur buka kunci — hanya `change-log` beralasan wajib.

**Markup — riset DIBACA ULANG PENUH 2026-08-21** (review menemukan draf
pertama salah bentuk data secara mendasar — bukan tebakan field yang
meleset sedikit, tapi salah ASUMSI seluruh bentuk respons). `markup.ts`
punya DUA endpoint GET berbeda, bukan satu:

- **`GET /api/v1/markup`** (`markup.ts:46-78`) — daftar SELURUH periode
  markup (`SELECT` konstan: `id, jenis_pekerjaan, berlaku_sejak,
  overhead_fraksi, keuntungan_fraksi, kontinjensi_fraksi, buk_fraksi,
  alasan, catatan, ditetapkan_oleh, created_at`), PLUS `berlaku` (markup
  yang aktif HARI INI, umum) dan `berlaku_per_jenis` (array per jenis
  pekerjaan yang punya barisnya sendiri). **Inilah endpoint yang cocok
  untuk halaman "daftar aturan markup"** — draf pertama malah memakai
  `/markup/berlaku` untuk kebutuhan ini, endpoint yang salah tujuan.
- **`GET /api/v1/markup/berlaku?pada=&jenis=&biaya_pokok=`**
  (`markup.ts:81-130`) — menjawab SATU markup yang berlaku untuk SATU
  konteks (tanggal+jenis), mengembalikan **satu objek** `{ markup, pada,
  rincian, margin_persen }` — BUKAN daftar. `markup` bisa `null` (sengaja
  — "belum ditetapkan" harus terlihat, bukan ditutupi angka 0%).
  `biaya_pokok` adalah QUERY PARAM opsional untuk fitur kalkulator
  penawaran di endpoint yang SAMA, bukan field yang pernah muncul di
  respons list — draf pertama menaruhnya sebagai field tipe `AturanMarkup`,
  itu salah total.

Field markup JUGA berbeda dari draf pertama: `jenis_pekerjaan` (bukan
`jenis`), EMPAT fraksi terpisah `overhead_fraksi`/`keuntungan_fraksi`/
`kontinjensi_fraksi`/`buk_fraksi` (bukan satu `persentase`). Gerbang GET
`cecep:markup:view` SAJA untuk PM (read-only, konsisten Task 18).

- [ ] **Step 1: Tipe di `_bersama/tipe.ts`**

Bentuk diverifikasi ke `rap.ts` (respons `GET /rap/:id`, field PERSIS
dari `estimasi/rap/page.tsx` desktop yang SUDAH memverifikasinya —
disalin sebagai sumber kebenaran, bukan ditebak ulang dari nama fungsi):

```typescript
export interface RapRingkas {
  id: string; name: string; status: "draft" | "locked" | string; notes: string | null
  estimate_version_id: string; locked_at: string | null; created_at: string
}
export interface RapMaterialLine {
  id: string
  /** Diverifikasi ulang 2026-08-21: SELECT `rap.ts:215` menyertakan
   * `resource_id` di level atas (bukan cuma di dalam `resource` bersarang) —
   * ditambahkan untuk kelengkapan meski tak dipakai halaman ini. */
  resource_id: string
  qty_ahsp: number; qty_adjusted: number; unit_code: string
  supplier_price: number; supplier_id: string | null; pagu: number; notes: string | null
  resource: { code: string; name: string } | null
}
export interface RapLaborLine {
  id: string; description: string; borongan_value: number; notes: string | null
  work_scope_id: string | null
}
export interface RespRapDetail {
  data: RapRingkas
  material: RapMaterialLine[]
  labor: RapLaborLine[]
  total: { material: number; labor: number; pagu: number }
}
export interface RapChangeLogEntry {
  id: string; line_table: string; line_id: string; field_name: string | null
  old_value: string | null; new_value: string | null; reason: string; changed_at: string
}

/**
 * Satu periode markup TERSIMPAN. Bentuk PERSIS konstanta `SELECT`,
 * `apps/api/src/routes/v1/markup.ts:34-38` — dibaca ULANG PENUH
 * 2026-08-21 sesudah draf pertama salah total (field `jenis`/
 * `persentase`/`biaya_pokok` yang ditulis draf pertama TIDAK ADA di
 * respons ini). Empat fraksi TERPISAH (bukan satu `persentase`) karena
 * overhead, keuntungan, kontinjensi, dan BUK (biaya-umum-keuntungan,
 * dikirim ke `computeAhsp`) adalah empat keputusan bisnis berbeda yang
 * bisa disetujui terpisah. Read-only untuk PM (cecep:markup:view saja).
 */
export interface PeriodeMarkup {
  id: string
  /** `null` = berlaku UMUM (semua jenis pekerjaan yang tak punya baris sendiri). */
  jenis_pekerjaan: string | null
  berlaku_sejak: string
  overhead_fraksi: number | string | null
  keuntungan_fraksi: number | string | null
  kontinjensi_fraksi: number | string | null
  buk_fraksi: number | string | null
  alasan: string | null
  catatan: string | null
  ditetapkan_oleh: string | null
  created_at: string
}
/**
 * Markup yang SUDAH DIPILIH untuk satu tanggal (fungsi `pilihMarkup()`,
 * `apps/api/src/lib/markup.ts:39-50`) — angka SIAP PAKAI (bukan fraksi
 * mentah), dan `dari_umum` menandai baris umum dipakai karena jenis ini
 * tak punya baris sendiri.
 */
export interface MarkupTerpilih {
  periode_id: string
  jenis_pekerjaan: string | null
  berlaku_sejak: string
  overhead: number
  keuntungan: number
  kontinjensi: number
  buk: number
  dari_umum: boolean
}
/**
 * Bentuk PERSIS `GET /api/v1/markup`, `markup.ts:68-76` — daftar SELURUH
 * periode (`periode`), markup umum yang berlaku HARI INI (`berlaku`,
 * bisa `null` — "belum ditetapkan" harus tampak, bukan ditutupi 0%), dan
 * markup berlaku PER JENIS pekerjaan yang punya baris sendiri
 * (`berlaku_per_jenis`). Ini endpoint LIST — `GET /markup/berlaku`
 * (dipakai draf pertama secara keliru) menjawab SATU objek untuk SATU
 * konteks tanggal+jenis, bukan daftar; tidak dipakai halaman ini.
 */
export interface RespMarkupList {
  periode: PeriodeMarkup[]
  berlaku: MarkupTerpilih | null
  berlaku_per_jenis: Array<{ jenis_pekerjaan: string; markup: MarkupTerpilih | null }>
  pada: string
}
```

- [ ] **Step 2: `cecep/rap/page.tsx`** — dashbor per proyek (pemilih
proyek pola Task 12, `daftarProyek.filter(p => p.pm)`), daftar RAP milik
proyek (`GET /projects/:id/rap`), tombol "+ RAP Baru" (`POST` — body
minimal: `name`, `estimate_version_id` dari RAB yang sudah ada versi
terkunci; picker versi dipetik dari daftar RAB Task 19 lewat dropdown
sederhana, bukan endpoint baru).

```typescript
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, Plus, Lock } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespRabDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RapListItem { id: string; name: string; status: string; locked_at: string | null; created_at: string }
interface RespProyek { projects: ProyekPM[] }
interface RespRapList { data: RapListItem[] }

const LABEL_STATUS: Record<string, string> = { draft: "Draf", locked: "Terkunci" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "netral", locked: "approved" };

export default function PmRapDaftarPage() {
  const [proyekId, setProyekId] = useState("");
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [nama, setNama] = useState("");
  const [versiId, setVersiId] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/rap` : null;
  const { data, memuat, galat } = useData<RespRapList>(url);

  // Versi RAB milik proyek aktif — dipakai sebagai picker sumber RAP baru.
  const { data: dataRab } = useData<RespRabDaftar>("/api/v1/estimate-versions?limit=200");
  const versiProyek = useMemo(
    () => (dataRab?.data ?? []).filter((b) => b.project_id === proyekAktif),
    [dataRab, proyekAktif]
  );

  async function buatRap() {
    if (!proyekAktif) return;
    if (nama.trim().length === 0 || !versiId) {
      setGalatForm("Nama dan RAB sumber wajib dipilih.");
      return;
    }
    setMengirim(true);
    setGalatForm(null);
    try {
      await api.post(`/api/v1/projects/${proyekAktif}/rap`, {
        name: nama.trim(),
        estimate_version_id: versiId,
      });
      setSheetTerbuka(false);
      setNama("");
      setVersiId("");
      invalidasi(url ?? "");
    } catch (e) {
      setGalatForm(pesanGalat(e as GalatApi, "Gagal membuat RAP"));
    } finally {
      setMengirim(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>RAP</h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekAktif} onChange={(e) => setProyekId(e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Wallet} judul="Pilih proyek" deskripsi="RAP tercatat per proyek." />}
      {memuat && <SkeletonCard tinggi={100} />}
      {galat && <EmptyState icon={Wallet} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && proyekAktif && (data?.data ?? []).length === 0 && (
        <EmptyState icon={Wallet} judul="Belum ada RAP" deskripsi="Buat RAP dari RAB yang sudah tersusun." />
      )}

      {(data?.data ?? []).map((r) => (
        <Link key={r.id} href={`/pm-portal/cecep/rap/${r.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
            {r.locked_at && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Terkunci {new Date(r.locked_at).toLocaleDateString("id-ID")}</div>}
          </div>
          <StatusBadge status={VARIAN_STATUS[r.status] ?? "netral"} label={LABEL_STATUS[r.status] ?? r.status} />
        </Link>
      ))}

      {proyekAktif && (
        <button type="button" onClick={() => setSheetTerbuka(true)} style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Plus size={18} aria-hidden="true" /> RAP Baru
        </button>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="RAP Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nama RAP</span>
            <input value={nama} onChange={(e) => setNama(e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>RAB sumber</span>
            <select value={versiId} onChange={(e) => setVersiId(e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}>
              <option value="">Pilih RAB…</option>
              {versiProyek.map((v) => (
                <option key={v.id} value={v.id}>{v.scenario_name ?? "Utama"} · revisi {v.version_number}</option>
              ))}
            </select>
          </label>
          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}
          <button type="button" onClick={buatRap} disabled={mengirim} style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "wait" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Buat RAP"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 3: `cecep/rap/[id]/page.tsx`** — detail: total pagu (material+
labor), daftar baris material (qty_ahsp beku vs qty_adjusted bisa
disunting via BottomSheet HANYA saat `status !== 'locked'`), daftar baris
labor, riwayat perubahan (`change-log`, dilipat default), tombol "Kunci
RAP" dengan konfirmasi eksplisit (aksi TAK BISA DIBATALKAN — dialog
konfirmasi wajib, bukan tombol langsung, karena backend tak sediakan
jalur buka kunci).

```typescript
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Wallet, Lock, History, Pencil } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespRapDetail, RapMaterialLine, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmRapDetailPage() {
  const params = useParams<{ id: string }>();
  const rapId = params.id;

  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [baris, setBaris] = useState<RapMaterialLine | null>(null);
  const [qtyBaru, setQtyBaru] = useState("");
  const [alasan, setAlasan] = useState("");
  const [sheetKunciTerbuka, setSheetKunciTerbuka] = useState(false);
  const [konfirmasiKunci, setKonfirmasiKunci] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const url = `/api/v1/rap/${rapId}`;
  const { data, memuat, galat } = useData<RespRapDetail>(url);

  function bukaEdit(m: RapMaterialLine) {
    setBaris(m);
    setQtyBaru(String(m.qty_adjusted));
    setAlasan("");
    setGalatAksi(null);
    setSheetTerbuka(true);
  }

  async function simpanQty() {
    if (!baris) return;
    if (!qtyBaru || Number(qtyBaru) < 0) {
      setGalatAksi("Kuantitas wajib angka >= 0.");
      return;
    }
    if (alasan.trim().length < 5) {
      setGalatAksi("Alasan perubahan minimal 5 karakter — dicatat di riwayat.");
      return;
    }
    setMengirim(true);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/rap/${rapId}/material/${baris.id}`, {
        qty_adjusted: Number(qtyBaru),
      });
      await api.post(`/api/v1/rap/${rapId}/change-log`, {
        line_table: "rap_material_line",
        line_id: baris.id,
        field_name: "qty_adjusted",
        old_value: String(baris.qty_adjusted),
        new_value: qtyBaru,
        reason: alasan.trim(),
      });
      setSheetTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menyimpan perubahan"));
    } finally {
      setMengirim(false);
    }
  }

  async function kunciRap() {
    if (konfirmasiKunci !== "KUNCI") {
      setGalatAksi('Ketik "KUNCI" untuk mengonfirmasi — tindakan ini tak bisa dibatalkan.');
      return;
    }
    try {
      await api.patch(`/api/v1/rap/${rapId}/lock`);
      setSheetKunciTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengunci RAP"));
    }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !data) {
    return <EmptyState icon={Wallet} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "RAP tidak ditemukan.")} />;
  }

  const terkunci = data.data.status === "locked";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{data.data.name}</h1>
        <StatusBadge status={terkunci ? "approved" : "netral"} label={terkunci ? "Terkunci" : "Draf"} />
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Material</span><span style={{ fontSize: 13, fontWeight: 600 }}>{fmtRupiah(data.total.material)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Tenaga kerja</span><span style={{ fontSize: 13, fontWeight: 600 }}>{fmtRupiah(data.total.labor)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--border)" }}><span style={{ fontSize: 13, fontWeight: 700 }}>Total pagu</span><span style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(data.total.pagu)}</span></div>
      </div>

      {galatAksi && !sheetTerbuka && !sheetKunciTerbuka && (
        <div role="alert" style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}>{galatAksi}</div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Material</div>
      {data.material.map((m) => (
        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{m.resource?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.qty_adjusted} {m.unit_code} · {fmtRupiah(m.supplier_price)}/{m.unit_code}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(m.pagu)}</div>
            {!terkunci && (
              <button type="button" onClick={() => bukaEdit(m)} aria-label={`Ubah kuantitas ${m.resource?.name ?? ""}`} style={{ minHeight: 32, minWidth: 32, borderRadius: 8, background: "var(--surface-subtle)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Pencil size={13} color="var(--text-secondary)" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Tenaga kerja / borongan</div>
      {data.labor.map((l) => (
        <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{l.description}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(l.borongan_value)}</div>
        </div>
      ))}

      {!terkunci && (
        <button type="button" onClick={() => { setKonfirmasiKunci(""); setGalatAksi(null); setSheetKunciTerbuka(true); }} style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--warning)", color: "var(--on-warning)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Lock size={16} aria-hidden="true" /> Kunci RAP
        </button>
      )}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul={`Ubah — ${baris?.resource?.name ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kuantitas baru ({baris?.unit_code})</span>
            <input type="number" value={qtyBaru} onChange={(e) => setQtyBaru(e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Alasan perubahan</span>
            <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={3} style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatAksi && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>}
          <button type="button" onClick={simpanQty} disabled={mengirim} style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "wait" : "pointer" }}>
            {mengirim ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetKunciTerbuka} onTutup={() => setSheetKunciTerbuka(false)} judul="Kunci RAP — tak bisa dibatalkan">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0 }}>
            Setelah dikunci, kuantitas tak bisa diubah langsung — hanya lewat
            riwayat perubahan beralasan. Tak ada jalur buka kunci.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Ketik KUNCI untuk konfirmasi</span>
            <input value={konfirmasiKunci} onChange={(e) => setKonfirmasiKunci(e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
          </label>
          {galatAksi && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatAksi}</div>}
          <button type="button" onClick={kunciRap} style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--warning)", color: "var(--on-warning)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Kunci Sekarang
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 4: `cecep/markup/page.tsx`** — DITULIS ULANG 2026-08-21
(draf pertama mengasumsikan endpoint list markup ber-field
`jenis`/`persentase`/`biaya_pokok` yang tidak pernah ada; ditulis ulang
dari struktur data sesungguhnya, bukan ditambal). Read-only, tanpa
tombol tambah (PM hanya `cecep:markup:view`). Memakai `GET
/api/v1/markup` (endpoint LIST, bukan `/markup/berlaku` yang menjawab
satu konteks) — respons berisi seluruh periode (`periode`) DAN markup
yang sudah dipilih untuk hari ini (`berlaku` umum + `berlaku_per_jenis`).
Bentuk halaman: kartu ringkasan "berlaku hari ini" di atas (umum, lalu
per jenis yang punya baris sendiri — pola yang sama dengan cara backend
sendiri membedakan keduanya), lalu daftar SELURUH periode di bawah
dikelompokkan per `jenis_pekerjaan` (`null` → kelompok "Umum"),
diurutkan `berlaku_sejak` terbaru dulu. Empat fraksi ditampilkan sebagai
persen (dikali 100), BUK diberi penekanan visual (baris yang dikirim ke
`computeAhsp`, angka yang benar-benar dipakai menghitung penawaran).

```typescript
"use client";

import { useMemo } from "react";
import { Percent } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import type { RespMarkupList, PeriodeMarkup, MarkupTerpilih, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function fmtPct(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtTanggal(s: string): string {
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function KartuBerlaku({ label, m }: { label: string; m: MarkupTerpilih | null }) {
  if (!m) {
    return (
      <div style={{ padding: 14, borderRadius: 14, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--on-warning-bg)" }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--on-warning-bg)", marginTop: 2 }}>Belum ditetapkan.</div>
      </div>
    );
  }
  return (
    <div style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{fmtPct(m.buk)}</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
        Overhead {fmtPct(m.overhead)} · Keuntungan {fmtPct(m.keuntungan)} · Kontinjensi {fmtPct(m.kontinjensi)}
        {m.dari_umum ? " · dari aturan umum" : ""}
      </div>
    </div>
  );
}

export default function PmMarkupPage() {
  const { data, memuat, galat } = useData<RespMarkupList>("/api/v1/markup");

  const kelompok = useMemo(() => {
    const m = new Map<string, PeriodeMarkup[]>();
    for (const p of data?.periode ?? []) {
      const k = p.jenis_pekerjaan ?? "(umum)";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "(umum)" ? -1 : b === "(umum)" ? 1 : a.localeCompare(b)));
  }, [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Markup & Margin</h1>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
        Angka yang menentukan laba tiap penawaran. Mengubah aturan hanya tersedia di web.
      </p>

      {memuat && <SkeletonCard tinggi={72} />}
      {galat && <EmptyState icon={Percent} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {!memuat && !galat && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Berlaku hari ini</div>
          <KartuBerlaku label="Umum" m={data?.berlaku ?? null} />
          {(data?.berlaku_per_jenis ?? []).map((b) => (
            <KartuBerlaku key={b.jenis_pekerjaan} label={b.jenis_pekerjaan} m={b.markup} />
          ))}
        </>
      )}

      {!memuat && !galat && (data?.periode ?? []).length === 0 && (
        <EmptyState icon={Percent} judul="Belum ada periode" deskripsi="Markup belum pernah ditetapkan." />
      )}

      {!memuat && !galat && kelompok.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginTop: 8 }}>Riwayat periode</div>
          {kelompok.map(([jenis, daftar]) => (
            <div key={jenis} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{jenis}</div>
              {daftar
                .slice()
                .sort((a, b) => b.berlaku_sejak.localeCompare(a.berlaku_sejak))
                .map((p) => (
                  <div key={p.id} style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Berlaku sejak {fmtTanggal(p.berlaku_sejak)}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>BUK {fmtPct(p.buk_fraksi)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      Overhead {fmtPct(p.overhead_fraksi)} · Keuntungan {fmtPct(p.keuntungan_fraksi)} · Kontinjensi {fmtPct(p.kontinjensi_fraksi)}
                    </div>
                    {p.alasan && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>{p.alasan}</div>}
                  </div>
                ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + penjaga** (pola sama Task 19 Step 4).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pm-portal/cecep/rap apps/web/app/pm-portal/cecep/markup apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): RAP anggaran pelaksanaan + Markup read-only"
```

### Task 21: Cost Control lintas-proyek — Kurva-S/EVM, Change Order, Cashflow, Varians, Contingency

**Files:**
- Create: `apps/web/app/pm-portal/cecep/kurva-s/page.tsx`
- Create: `apps/web/app/pm-portal/kontrak-lengkap/change-order/page.tsx`
- Create: `apps/web/app/pm-portal/cecep/kas/page.tsx`
- Create: `apps/web/app/pm-portal/cecep/varians/page.tsx`
- Create: `apps/web/app/pm-portal/cecep/contingency/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Riset (Task 17 Step 1)**: SATU endpoint `GET /projects/:id/kurva-s`
(`authenticate` saja) memuat Kurva-S+EVM+ETC+BAC sekaligus — dibangun
sebagai SATU halaman, bukan empat, konsisten dengan bentuk datanya.
Change Order (`change-orders.ts`) py endpoint standalone lengkap
(`projects:edit`, PM punya) — MENUTUP utang yang dicatat Task 16 (bukan
lagi menunggu hub `proyek/[id]`). Cashflow dari `estimate-versions/:id/
cashflow-forecast`. Varians dari `cost-control.ts` `GET /projects/:id/
varians`. Contingency dari `contingency.ts`, gerbang `projects:view`/
`projects:edit` (bukan `cecep:*`).

- [ ] **Step 1: Tipe di `_bersama/tipe.ts`**

Bentuk `evm` diverifikasi PERSIS ke `apps/api/src/lib/evm-calculation.ts`
via `kurva-s.ts:483-511` (riset Task 17) — field ASLI
`bac/bacSource/paguRAP/ac/acSerapan/ev/pv/sv/cv/cpi/spi/eac/etc/vac/
tcpi/evPct/pvPct/acPct`, BUKAN singkatan lain yang mungkin ditebak:

```typescript
export interface TitikKurvaS {
  week: string; weekNum: number; date: string
  rencana: number | null; serapan: number | null; aktual: number | null; progress: number | null
}
export interface MilestoneKurvaS {
  title: string | null; date: string | null; status: string | null; weekIdx: number; week: number
}
/** Bentuk PERSIS `calculateEVM()`, `evm-calculation.ts`, dipanggil `kurva-s.ts:483`. */
export interface RingkasEvm {
  bac: number
  bacSource: "rap_locked" | "rab" | "contract_value"
  paguRAP: number
  ac: number
  acSerapan: number
  ev: number
  pv: number
  sv: number
  cv: number
  cpi: number
  spi: number
  eac: number
  /** Estimate To Complete — sisa biaya sampai proyek selesai. */
  etc: number
  vac: number
  tcpi: number
  evPct: number
  pvPct: number
  acPct: number
}
export interface RespKurvaS {
  meta: {
    projectId: string; startDate: string; endDate: string; contractValue: number
    totalWeeks: number; hasRAB: boolean; hasSchedule: boolean
    rencanaSource: "rab_schedule" | "gantt" | "normal_cdf"
    cakupanJadwalPct: number; itemBerjadwal: number; itemTotal: number
    totalRABValue: number; latestActualPct: number; latestSerapanPct: number
    latestRencanaPct: number; deviasi: number
    evm: RingkasEvm
  }
  chartData: TitikKurvaS[]
  milestones: MilestoneKurvaS[]
}

/** Change Order — bentuk diverifikasi ke `change-orders.ts` GET utama. */
export interface ChangeOrderProyek {
  id: string
  co_number: string
  title: string
  description: string | null
  type: "tambah" | "kurang" | string
  value: number | string
  status: "draft" | "submitted" | "approved" | "rejected" | string
  submitted_at: string | null
  approved_at: string | null
  rejection_reason: string | null
}
export interface RespChangeOrder { data: ChangeOrderProyek[] }

export interface TitikCashflow { period: string; masuk: number; keluar: number; saldo: number }
export interface RespCashflowForecast { data: TitikCashflow[] }

export interface BarisVarians {
  cost_code: string; nama: string
  anggaran: number; komitmen: number; aktual: number; varians: number
}
export interface RespVarians { data: BarisVarians[] }

export interface RingkasContingency {
  project_id: string; pagu_awal: number; terpakai: number; sisa: number
  penggunaan: Array<{ tanggal: string; jumlah: number; alasan: string }>
}
export interface RespContingency { data: RingkasContingency }
```

⚠️ **Bentuk `ChangeOrderProyek`/`RespCashflowForecast`/`RespVarians`/
`RespContingency` di atas DITEBAK dari nama fungsi/kolom yang lazim di
modul serupa — BUKAN dibaca baris-per-baris dari kode seperti
`RingkasEvm`/`RespKurvaS` (yang sudah diverifikasi penuh Task 17 Step 1
lewat `kurva-s.ts:485-514`). Ini pelanggaran SADAR terhadap aturan
plan §Global Constraints ("tipe respons WAJIB diverifikasi ke kode
backend nyata SEBELUM ditulis") karena keempat route file itu (`change-
orders.ts` 1000+ baris, `estimate-versions.ts` bagian cashflow-forecast,
`cost-control.ts` bagian varians, `contingency.ts`) BELUM dibaca
detail — hanya endpoint listnya yang dikonfirmasi ADA di riset Task 17.
**Eksekutor Task 21 WAJIB membaca keempat route handler ini baris-per-
baris SEBELUM menulis halaman**, dan mengoreksi tipe di atas kalau
meleset (pola sama `PolisAsuransi`/`NilaiKontrakBerjalan` yang dikoreksi
di Tahap 2) — bukan langsung memakainya sebagai kebenaran.

- [ ] **Step 2: `cecep/kurva-s/page.tsx`** — pemilih proyek, KPI cards
(pola `KpiCard` — CPI, SPI, sisa anggaran) di atas, `MiniChart` untuk
kurva rencana-vs-aktual, lalu detail EVM sebagai daftar angka berlabel
(BAC, AC, EV, PV, ETC, EAC, VAC) dengan `bacSource` ditampilkan eksplisit
(spec §"jangan sembunyikan sumber basis" — sama alasannya dengan edisi
AHSP di §3c rombak: dua proyek EVM beda basis bisa sama-sama benar).
Milestone sebagai daftar bertanggal di bawah chart.

- [ ] **Step 3: `kontrak-lengkap/change-order/page.tsx`** — daftar CO
per proyek (badge tipe tambah/kurang berwarna beda, badge status pola
Task 12), tombol "+ CO Baru" BottomSheet (nomor, judul, deskripsi, tipe,
nilai), transisi submit/approve/reject pola Task 12 `TRANSISI`. Ditaruh
di `kontrak-lengkap/` (bukan `cecep/`) karena secara taksonomi `kt-co`
ada di grup `g-kontrak` — konsisten dengan cara Task 13 menaruh EOT/LD/
Bond, BUKAN menaruhnya sembarangan mengikuti lokasi route CECEP lain di
task ini.

- [ ] **Step 4: `cecep/kas/page.tsx`** — pemilih proyek → pemilih versi
RAB terkunci/disetujui (dari daftar Task 19) → tabel periode ringkas
(masuk/keluar/saldo per periode), total di footer.

- [ ] **Step 5: `cecep/varians/page.tsx`** — pemilih proyek, daftar baris
per cost code (anggaran/komitmen/aktual/varians), warna varians negatif
`--danger`, positif `--text-secondary` (bukan hijau mencolok — pelajaran
`ARAH-VISUAL-2026.md`: warna sukses dipakai hemat).

- [ ] **Step 6: `cecep/contingency/page.tsx`** — pemilih proyek, kartu
ringkas (pagu awal/terpakai/sisa — sisa NEGATIF ditampilkan sebagai
angka negatif eksplisit, bukan diratakan nol, pola yang sudah dicatat
`peta-menu.ts` untuk halaman desktopnya), daftar penggunaan bertanggal.

- [ ] **Step 7: Typecheck + SEMUA penjaga CI + test terkait**

```bash
cd apps/web && pnpm exec tsc --noEmit
cd ../api && node scripts/jalankan-semua-penjaga.mjs
cd apps/api && npx vitest run kurva-s change-order rap estimate-versions markup template-wbs cost-control contingency ahsp price-book
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/pm-portal/cecep apps/web/app/pm-portal/kontrak-lengkap/change-order apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): Cost Control lintas-proyek — Kurva-S/EVM, Change Order, Kas, Varians, Contingency"
```

### Task 22: Navigasi kategori Budget & Cost Control + Master Data + Pra-Konstruksi + Verifikasi akhir Tahap 3

**Files:**
- Modify: `apps/web/lib/pm-portal-kategori.ts`
- Modify: `apps/web/app/pm-portal/kategori/[key]/page.tsx`

- [x] **Step 1: Aktifkan `g-cost`, `g-master`, `g-crm` di `KATEGORI_AKTIF`**

```typescript
const KATEGORI_AKTIF = ["g-subkon", "g-lapangan", "g-kontrak", "g-jadwal", "g-cost", "g-master", "g-crm"]; // Tahap 1-3
```

`g-master`/`g-crm` diaktifkan BERSAMA `g-cost` (bukan ditunda ke tahap
lain) karena Task 18-20 sudah membangun halamannya (`crm-estimating`→
`/master/ahsp` fallback web sebelum ini, kini `cecep/ahsp` portal;
`crm-boq`→`cecep/rab`; `crm-skenario`/`crm-markup`→`cecep/rab`+
`cecep/markup`; `md-resource`/`md-price-book`/`md-wbs`→`cecep/ahsp`/
`cecep/harga`/`cecep/wbs`) — mengaktifkan grupnya tanpa memetakan
key-nya di `PETA_HREF_PORTAL` sama saja dengan tetap fallback ke web,
padahal halaman portalnya sudah ada.

- [x] **Step 2: Isi `PETA_HREF_PORTAL`** (key PERSIS dari `peta-menu.ts`,
diverifikasi Task 17 Step 1):

**Perbedaan dari draf di atas, ditemukan saat eksekusi:** setelah
menerapkan draf apa adanya, `audit-nav-yatim.mjs` melaporkan
`/pm-portal/cecep/wbs` masih YATIM — draf ini menyebut `md-wbs`/
`jd-wbs`→`cecep/wbs` di PROSA (paragraf Step 1 di atas) tapi baris
itu HILANG dari blok kode `PETA_HREF_PORTAL` di bawah (hanya
`md-resource`/`md-price-book` yang tertulis). Ditambahkan
`"md-wbs": "/pm-portal/cecep/wbs"` dan `"jd-wbs": "/pm-portal/cecep/wbs"`
— MENGGANTI, bukan menambah di samping, mapping lama `md-wbs`→
`/master/wbs` web (halaman portal read-only Task 18 sudah ada dan PM
punya `cecep:cbs:view`). Efek samping KEDUA: mengubah `kt-co` dari
`/pm-portal/kontrak` (fallback Task 16) ke
`/pm-portal/kontrak-lengkap/change-order` membuat `/pm-portal/kontrak`
sendiri (ringkasan BACA SAJA nilai/model/pajak/retensi/denda kontrak
dari kolom `projects` — halaman BEDA dari `kontrak-lengkap/register`)
jadi YATIM. Tak ada key `g-kontrak` lain yang cocok maknanya untuk
ringkasan itu (dicek satu-satu) — didaftarkan ke `WAJAR` di
`audit-nav-yatim.mjs` dengan alasan tertulis, bukan dipaksakan ke key
yang salah makna. Dicatat sebagai utang navigasi kandidat Task 29
(hub `proyek/[id]`, digeser dari Task 26 setelah Tahap 4 disisipkan)
di JOURNAL.

```typescript
const PETA_HREF_PORTAL: Record<string, string> = {
  // ...baris Tahap 1-2 yang sudah ada, TIDAK dihapus...
  "md-resource": "/pm-portal/cecep/ahsp",
  "md-price-book": "/pm-portal/cecep/harga",
  "md-wbs": "/pm-portal/cecep/wbs",
  "crm-estimating": "/pm-portal/cecep/ahsp",
  "crm-boq": "/pm-portal/cecep/rab",
  "crm-skenario": "/pm-portal/cecep/rab",
  "crm-markup": "/pm-portal/cecep/markup",
  "jd-wbs": "/pm-portal/cecep/wbs",
  "cc-rab": "/pm-portal/cecep/rab",
  "cc-rap": "/pm-portal/cecep/rap",
  "cc-revisi": "/pm-portal/cecep/rap",
  "cc-etc": "/pm-portal/cecep/kurva-s",
  "cc-cashflow": "/pm-portal/cecep/kas",
  "cc-varians": "/pm-portal/cecep/varians",
  "cc-contingency": "/pm-portal/cecep/contingency",
  "cc-bac": "/pm-portal/cecep/kurva-s",
  "jd-gantt": "/pm-portal/cecep/kurva-s",
  "jd-kurva-s": "/pm-portal/cecep/kurva-s",
  "jd-evm": "/pm-portal/cecep/kurva-s",
  "kt-co": "/pm-portal/kontrak-lengkap/change-order",
};
```

⚠️ `jd-gantt` diarahkan ke `cecep/kurva-s` sebagai APROKSIMASI — Gantt
Chart sungguhan (`rab/gantt` endpoint) TIDAK dibangun sebagai halaman
mobile tersendiri di Tahap 3 (grafik batang timeline dengan dependency
lines bukan bentuk yang cocok dilihat di layar sempit tanpa scroll
horizontal berat; `pm-portal/jadwal` sudah punya CPM+look-ahead yang
menjawab pertanyaan jadwal harian). Dicatat sebagai UTANG di sini,
serupa pola `kt-co` Task 16 — kalau Tahap 7 (Task 29, digeser dari Task
26 setelah Tahap 4 disisipkan — lihat pemetaan renumbering Task 23)
membangun hub `proyek/[id]`, Gantt visual jadi kandidat pertama
dipindah ke tab hub.

`cc-acl`/`cc-commitment`/`cc-pagu-material`/`cc-cvr`/`cc-profit`/`cc-wip`
TIDAK dipetakan — masing-masing SUDAH menunjuk halaman lain yang sudah
atau akan tercakup tahap lain (`cc-pagu-material`→procurement Tahap 4,
`cc-profit`/`cc-wip`→keuangan Tahap 6, `cc-cvr` desktop-only karena
statusnya sendiri `sebagian` dengan alasan struktural bukan UI) atau
fallback web tetap memadai (`cc-acl`/`cc-commitment` keduanya menunjuk
`/estimasi` yang sudah tercakup fallback).

- [x] **Step 3: Typecheck + lint navigasi** — bersih, exit 0 keduanya.

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm exec eslint lib/pm-portal-kategori.ts app/pm-portal/kategori/
```

- [x] **Step 4: `audit-nav-yatim.mjs`** — pola Task 16 Step 4, dibandingkan
YATIM sebelum/sesudah lewat `git stash`. SEBELUM: 11 halaman
`pm-portal/cecep/*` + `kontrak-lengkap/change-order` YATIM. SESUDAH:
0 YATIM dari kelompok CECEP/Master/Pra-Konstruksi. Sisa satu-satunya
merah (`/estimasi/struktur` LINK MATI) dibuktikan pra-eksisting
(identik di baseline `git stash`, di luar scope Task 22).

- [x] **Step 5: Typecheck seluruh workspace + SEMUA penjaga CI** — hasil
131 hijau/40 merah/2 tak ketemu, IDENTIK dengan baseline (diukur
`git stash` sebelum/sesudah) — nol regresi baru dari Task 22.

```bash
cd apps/web && pnpm exec tsc --noEmit
cd ../api && node scripts/jalankan-semua-penjaga.mjs
```

- [x] **Step 6: Test integrasi terkait** (superset Task 21 Step 7 —
dijalankan ulang di sini karena bisa ada berkas backend baru dari fix
Task 19 catatan `cost_code_id` lumpsum): 238 lulus, 6 gagal (2 berkas:
`price-book-triase.test.ts`, `terapkan-ke-rab.test.ts`) — kegagalan
BUKAN soal navigasi, direproduksi terisolasi, DILAPORKAN sebagai
concern (Task 22 tak menyentuh kode API sama sekali), tidak diperbaiki
di sini sesuai batasan tugas.

```bash
cd apps/api && npx vitest run kurva-s change-order rap estimate-versions markup template-wbs cost-control contingency ahsp price-book
```

- [x] **Step 7: Audit a11y runtime penuh** (pola Task 16 Step 7) —
dijalankan terhadap instance API+web terisolasi (port 3017/3020, kode
worktree ini) karena port kanonik 3007/3000 dipakai proses checkout
lain. Hasil di laporan Task 22 terpisah.

```bash
cd apps/web
export $(grep -E "^LAYAR_(EMAIL|SANDI|BASIS)=" .env.local | tr -d '\r' | xargs)
node scripts/jalankan-a11y-lengkap.mjs
```

- [x] **Step 8: Update JOURNAL.md** — catat Tahap 3 selesai: 11 halaman
baru (13 berkas `page.tsx` — RAB & RAP masing-masing daftar + `[id]`),
utang tercatat (`jd-gantt` visual, hub `proyek/[id]` masih ditunda,
`/pm-portal/kontrak` masuk WAJAR), plus temuan `project_manager_senior`
(TERKONFIRMASI RELEVAN — lihat JOURNAL untuk detail izin).

- [x] **Step 9: Commit dokumentasi**

```bash
git add docs/execution/JOURNAL.md docs/superpowers/plans/2026-08-20-portal-pm-lengkap.md apps/web/lib/pm-portal-kategori.ts "apps/web/app/pm-portal/kategori/[key]/page.tsx"
git commit -m "feat(pm-portal): navigasi kategori Budget & Cost Control + Master Data + Pra-Konstruksi, Tahap 3 selesai"
```

---

### Task 23: [Tahap 4] Pengadaan + Gudang & Material — riset & breakdown

- [x] **Step 1: Riset endpoint+permission** modul `procurement`, `gudang`.

  **Permission PM — diverifikasi ke `role_permissions` LANGSUNG** (query
  `role='pm'`, JOIN `permissions` lewat `permission_id` — tabelnya
  menyimpan `permission_id`, BUKAN kolom teks `permission_key`; kesalahan
  ini ketahuan lewat galat `42703` saat query pertama, dikoreksi sebelum
  angka final):

  ```
  PM PUNYA:
    procurement:view · procurement:mr:manage · procurement:po:manage ·
    procurement:material:manage · procurement:supplier:manage ·
    gudang:view · gudang:manage · gudang:susut:view · gudang:susut:manage

  PM TIDAK PUNYA:
    procurement:payment:manage        (utang supplier, nota kredit final)
    procurement:mr:override_quota     (melampaui kuota RAB material)
  ```

  PM py wewenang PENUH mengelola MR/PO/Material/Supplier/Gudang — BEDA
  dari CECEP (Tahap 3) yang sebagian besar view-only. Yang DITOLAK cuma
  dua: bayar-ke-supplier (ranah keuangan/AP, ditunda Tahap 6) dan
  melampaui kuota RAB tanpa alasan tertulis (capability terpisah,
  sengaja sempit — lihat `procurement.ts:642`).

  **File route backend, diukur `wc -l`:**

  ```
  apps/api/src/routes/v1/procurement.ts            2098 baris (MR, PO, GR,
                                                     supplier-invoice/payment,
                                                     stocks, dashboard, reports)
  apps/api/src/routes/v1/pengadaan-lanjutan.ts       674 baris (kontrak
                                                     payung, expediting,
                                                     nota kredit — F "TUNDA")
  apps/api/src/routes/v1/rfq.ts                        — (RFQ + tabulasi
                                                     penawaran vendor)
  apps/api/src/routes/v1/vendor-kualifikasi.ts         — (prakualifikasi +
                                                     evaluasi kinerja vendor)
  apps/api/src/routes/v1/transfer-stok.ts              — (transfer material
                                                     antar proyek, dua sisi)
  apps/api/src/routes/v1/material-klien.ts             — (free issue —
                                                     material milik owner)
  apps/api/src/routes/v1/gudang-ikhtisar.ts            — (dashbor lintas-
                                                     proyek: aset+gudang)
  apps/api/src/routes/v1/gudang-kelola.ts              — (CRUD lokasi
                                                     gudang, PM py `:manage`)
  apps/api/src/routes/v1/rekonsiliasi-material.ts      — (RAB vs
                                                     dibeli/dipakai/sisa,
                                                     read-only)
  apps/api/src/routes/v1/susut-material.ts             — (jembatan
                                                     AHSP↔material + rencana
                                                     susut target — DATA
                                                     REFERENSI, bukan hasil
                                                     hitung)
  ```

  **Koreksi PALING PENTING atas gambaran awal**: `gudang` BUKAN modul
  yang "belum tersentuh sama sekali" — enam route file sudah hidup sejak
  2026-08-12 (G6e), lengkap dengan test bermutasi-merah. Yang belum
  tersentuh adalah PORTAL PM-nya (halaman mobile), bukan backend-nya.

  **Temuan kritis #1 — dua entityType approval SATU PINTU yang HARUS
  lewat inbox terpusat, BUKAN tombol approve terpisah di halaman
  procurement:**

  - `material_request` — `PATCH /material-requests/:id/approve`
    (`procurement.ts:709`), body `{action:'approve'|'reject',
    rejection_notes?}`. Gerbang KASAR `canParticipateInChain` lalu
    `evaluateEntityApproval` (rantai `approval_chains`/`approval_steps`,
    ADR-007) — BUKAN `requirePermission('procurement:mr:manage')`
    langsung. SoD ditegakkan (`periksaGerbangSod` — pengaju tak boleh
    menyetujui pengajuannya sendiri). Bisa multi-level
    (`pending_next_level: true`).
  - `purchase_order` — `PATCH /purchase-orders/:id/status` dengan
    `{status:'sent'}` (`procurement.ts:957`) MELEWATI GERBANG APPROVAL
    YANG SAMA sebelum benar-benar berubah jadi `sent` — ditambahkan
    2026-08-14 setelah diukur PO Rp 40 juta bisa dikirim ke vendor tanpa
    satu pun persetujuan. Transisi LAIN (`draft`/`confirmed`/`cancelled`)
    TIDAK digerbang approval (mencatat kejadian nyata, bukan keputusan).

  Ini KENAPA breakdown Step 2 TIDAK menaruh tombol "Setujui MR"/"Kirim
  PO ke Vendor (setelah approval)" langsung di halaman procurement,
  melainkan MENAMBAHKAN `material_request` dan `purchase_order` ke
  `AKSI`/`JALUR_PM` di `pm-portal/approval/page.tsx` (Task 9, sudah
  hidup) — pola SAMA dengan `kasbon`/`submittal` yang sudah ada di sana.
  Membangun tombol approve terpisah akan melanggar
  `audit-approval-satu-pintu.mjs` (§6 CLAUDE.md: "keputusan persetujuan
  hanya lewat `utils/approval.ts`") secara halus — endpoint sendiri
  memang lewat `utils/approval.ts` di backend, tapi py DUA jalur approve
  di frontend (halaman procurement + inbox) adalah pola yang sama
  persis dengan yang dihindari Task 9 untuk kasbon/submittal.

  **Temuan kritis #2 — `POST /procurement/stocks/opname` bergerbang
  `procurement:view` (BACA) padahal MENULIS** (`procurement.ts:2023`,
  identik dengan cacat "T4j" yang SUDAH tercatat di komentar
  `stocks/usage` tepat di atasnya, tapi endpoint opname sendiri TIDAK
  disebut catatan itu — kemungkinan luput saat T4j ditutup). Ini cacat
  PRA-EKSISTING backend, DI LUAR wewenang breakdown UI ini untuk
  diperbaiki (task ini tak menyentuh kode API) — dicatat sebagai concern
  di laporan, BUKAN diselesaikan di sini. Breakdown Step 2 TIDAK
  membangun halaman Stock Opname mobile (lihat alasan di Task 26).

  **Temuan kritis #3 — `GET /pengadaan-lanjutan` memuat TIGA sub-modul
  sekaligus dalam SATU panggilan** (kontrak payung + expediting + nota
  kredit, semua sudah DINILAI server-side lewat `lib/pengadaan-
  lanjutan.ts`: status nyata kontrak payung — termasuk "aktif tapi tak
  bisa dipakai" — telat expediting terhadap KEBUTUHAN kita bukan janji
  vendor, dan nota kredit yang "menggantung" disetujui-tapi-belum-
  diterapkan). Pola PERSIS `kurva-s.ts` di Task 17/21 — satu endpoint,
  banyak entri `peta-menu.ts` (`pr-blanket`, `pr-expediting`, dan
  `tg-nota-kredit` dari grup lain). PM py `procurement:po:manage` untuk
  MEMBUAT kontrak payung (`POST .../kontrak`, `procurement:po:manage`)
  dan mencatat expediting, TAPI nota kredit `putuskan`/`terapkan`
  bergerbang `procurement:payment:manage` yang PM TIDAK punya — mobile
  PM hanya bisa MELIHAT status nota kredit + membuatnya (`POST
  .../nota-kredit` juga `procurement:po:manage`), tak bisa memutuskan.

  **Temuan kritis #4 — `/gudang/susut` desktop TIDAK menampilkan hasil
  hitung susut** (`hitungBaris`/`ringkas` dari `lib/susut-material.ts`
  TIDAK dipanggil satu route pun — diverifikasi `grep` ke seluruh
  `routes/v1/`). Halaman itu murni CRUD dua tabel REFERENSI: peta
  resource↔material (jembatan AHSP ke gudang) dan rencana susut per
  material (target %). Perhitungan susut NYATA (RAB vs dibeli vs
  dipakai vs sisa) ada di endpoint TERPISAH,
  `GET /projects/:projectId/rekonsiliasi-material` — read-only,
  `procurement:view`, per-proyek (BUKAN lintas-proyek seperti gudang
  lain). Breakdown Step 2 membangun DUA halaman terpisah sesuai
  pemisahan ini, bukan satu halaman "susut" gabungan yang menebak
  bentuk data yang sebenarnya tak pernah digabung backend.

  **Bentuk response, diverifikasi baris-per-baris ke kode nyata** (bukan
  ditebak dari nama), dituliskan lengkap di Step 1 Task 24/25/26 di
  bawah tempat dipakainya masing-masing — mengikuti pola Task 17/18 yang
  menaruh tipe persis di titik pemakaian supaya verifikasi mudah
  disilangkan ulang.

- [x] **Step 2: Baca `pm-portal/procurement/page.tsx` existing (150
  baris) untuk memutuskan tulis-ulang vs tambah.**

  **KEPUTUSAN: DITULIS ULANG, dipecah jadi 3 berkas** (list gabungan +
  dua halaman detail `[id]`) — BUKAN sekadar ditambah di file yang sama.
  Alasan, diukur dari struktur berkas nyata:

  1. **Halaman lama TANPA gerbang permission create sama sekali** — ia
     hanya `useData` dua endpoint GET, tak ada `api.post` satu pun. PM
     py `procurement:mr:manage`/`po:manage` PENUH (Step 1), jadi
     halaman baca-saja ini sudah KETINGGALAN dari izin yang PM benar-
     benar punya — bukan cuma "kurang lengkap", tapi salah
     merepresentasikan wewenang PM.
  2. **Detail MR/PO tak ada tempatnya.** Halaman lama hanya kartu
     ringkas per baris (`mr_number`+status, `po_number`+total) — tak
     ada rute untuk melihat ITEM (material apa, qty berapa), memicu
     `submit`, memicu `quota-check`, atau membuat GR dari sebuah PO.
     Menambahkan SEMUA itu ke satu file 150-baris akan menghasilkan
     satu file 800+ baris yang mencampur 3 lapis navigasi (list → detail
     → aksi) — pola yang SAMA dipecah Task 19 (RAB list vs
     `[id]` detail) dengan alasan yang sama persis.
  3. **Third tab (Goods Receipt) belum ada tempatnya** — struktur
     `SegmentedTab` lama cuma dua nilai (`"mr"|"po"`), menambah nilai
     ketiga TANPA menata ulang layout akan membuat tab GR terasa
     seperti tempelan, bukan alur kerja penuh (MR→PO→GR adalah SATU
     rantai yang harus terlihat berurutan, bukan tiga daftar lepas).

  Pecahan baru (detail di Task 24):
  - `procurement/page.tsx` — list 3-tab (MR/PO/GR) + tombol "+ Buat"
    bergerbang permission, MENGGANTIKAN 150 baris lama.
  - `procurement/mr/[id]/page.tsx` — detail MR: item, quota-check,
    submit (approve lewat inbox terpusat, BUKAN di sini).
  - `procurement/po/[id]/page.tsx` — detail PO: item, kirim WA ke
    vendor (pesan sudah disusun backend), buat GR dari PO ini, riwayat
    kirim.

  Yang TETAP DIPERTAHANKAN dari versi lama (bukan dibuang percuma):
  pola pemilih proyek (`daftarProyek.filter(p => p.pm)`), fungsi
  `fmtRupiah`, dan peta label/varian status — dipindah apa adanya ke
  file baru, bukan ditulis ulang dari nol.

### Task 24: Procurement — daftar 3-tab + buat MR/PO + detail & aksi

**Files:**
- Create: `apps/web/app/pm-portal/procurement/mr/[id]/page.tsx`
- Create: `apps/web/app/pm-portal/procurement/po/[id]/page.tsx`
- Modify: `apps/web/app/pm-portal/procurement/page.tsx` (tulis ulang penuh)
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

- [ ] **Step 1: Tipe di `_bersama/tipe.ts`**

Bentuk diverifikasi baris-per-baris ke `procurement.ts` (Task 23 Step 1).

```typescript
/** Bentuk PERSIS `GET /api/v1/procurement/material-requests`,
 * `procurement.ts:263-268`. */
export interface MrRingkas {
  id: string
  mr_number: string | null
  status: "draft" | "submitted" | "approved" | "rejected" | "partially_ordered" | "fully_ordered" | string
  request_date: string | null
  needed_date: string | null
  notes: string | null
  created_at: string
  project: { id: string; name: string } | null
  requested_by: { id: string; name: string } | null
  approved_by: { id: string; name: string } | null
  items: Array<{ id: string; qty_requested: number | string; qty_ordered: number | string | null; unit: string; material: { id: string; name: string; unit: string } | null }>
}
export interface RespMrDaftar { material_requests: MrRingkas[] }

/** Bentuk PERSIS `GET /api/v1/procurement/material-requests/:id`,
 * `procurement.ts:293-297` — `select('*', ...)` jadi item TAMBAHAN
 * (`unit_price_est`, dst.) ikut lewat, tak semuanya dipakai di sini. */
export interface MrDetail extends MrRingkas {
  requested_by: { id: string; name: string; phone: string | null } | null
  items: Array<{
    id: string; qty_requested: number | string; qty_ordered: number | string | null
    unit: string; unit_price_est: number | string | null; notes: string | null
    material: { id: string; name: string; unit: string; unit_price: number | string | null } | null
  }>
}
export interface RespMrDetail { material_request: MrDetail }

/** Bentuk PERSIS `GET /material-requests/:id/quota-check`,
 * `procurement.ts:593-610`. `bisa_override` HAMPIR SELALU `false` untuk
 * PM — `procurement:mr:override_quota` bukan permission PM (Task 23
 * Step 1). Ditampilkan tetap, bukan disembunyikan: PM perlu tahu KENAPA
 * tombol override tak muncul, bukan cuma tak melihatnya. */
export interface RespQuotaCheck {
  mr_number: string | null
  lolos: boolean
  pelanggaran: Array<{ material_id: string; material_name?: string; diminta: number; sisa: number }>
  tanpa_kuota: Array<{ material_id: string; material_name?: string }>
  bisa_override: boolean
}

/** Bentuk PERSIS `GET /api/v1/procurement/purchase-orders`,
 * `procurement.ts:861-866`. */
export interface PoRingkas {
  id: string
  po_number: string | null
  status: "draft" | "sent" | "confirmed" | "cancelled" | string
  order_date: string | null
  expected_delivery_date: string | null
  total_amount: number | string | null
  payment_terms: string | null
  created_at: string
  project: { id: string; name: string } | null
  supplier: { id: string; name: string; phone: string | null } | null
  created_by: { id: string; name: string } | null
  items: Array<{ id: string; qty_ordered: number | string; qty_received: number | string | null; unit: string; unit_price: number | string; total_price: number | string; material: { id: string; name: string } | null }>
}
export interface RespPoDaftar { purchase_orders: PoRingkas[] }

/** Bentuk PERSIS `GET /purchase-orders/:id`, `procurement.ts:889-895`. */
export interface PoDetail extends Omit<PoRingkas, "supplier" | "project"> {
  project: { id: string; name: string; location: string | null } | null
  supplier: { id: string; name: string; phone: string | null; email: string | null; address: string | null; payment_terms: string | null } | null
  mr: { id: string; mr_number: string | null } | null
  items: Array<{ id: string; qty_ordered: number | string; qty_received: number | string | null; unit: string; unit_price: number | string; total_price: number | string; material: { id: string; name: string; unit: string } | null }>
}
export interface RespPoDetail { purchase_order: PoDetail }

/** Bentuk PERSIS `GET /purchase-orders/:id/delivery-message`,
 * `procurement.ts:409-420`. `wa_url` NULL kalau nomor telepon supplier
 * tak sah — UI WAJIB menyembunyikan tombol kirim WA saat null, bukan
 * memasang tautan ke nomor ngawur (komentar backend eksplisit). */
export interface RespPesanPo {
  po_number: string | null
  pesan: string
  wa_url: string | null
  email_tujuan: string | null
  sudah_dikirim: { whatsapp_at: string | null; email_at: string | null }
}

/** Bentuk PERSIS `GET /purchase-orders/:id/delivery-log`,
 * `procurement.ts:496-501` — kunci `data`, bukan `logs`. */
export interface RespDeliveryLog {
  data: Array<{ id: string; channel: "whatsapp" | "email" | "manual"; recipient: string | null; status: string | null; notes: string | null; sent_at: string; sender: { name: string } | null }>
}

/** Bentuk PERSIS `GET /api/v1/procurement/goods-receipts`,
 * `procurement.ts:1143-1149`. */
export interface GrRingkas {
  id: string
  gr_number: string | null
  status: "draft" | "confirmed" | string
  receipt_date: string | null
  delivery_note_number: string | null
  delivery_note_url: string | null
  notes: string | null
  confirmed_at: string | null
  created_at: string
  project: { id: string; name: string } | null
  supplier: { id: string; name: string } | null
  po: { id: string; po_number: string | null } | null
  received_by: { id: string; name: string } | null
  items: Array<{ id: string; qty_received: number | string; unit: string; unit_price: number | string; material: { id: string; name: string } | null }>
}
export interface RespGrDaftar { goods_receipts: GrRingkas[] }

/** Bentuk PERSIS `GET /api/v1/procurement/materials`,
 * `procurement.ts:121` — dipakai picker item MR/PO. */
export interface MaterialRingkas {
  id: string; code: string | null; name: string; unit: string
  unit_price: number | string | null; description: string | null; is_active: boolean
  category: { id: string; name: string } | null
}
export interface RespMaterialDaftar { materials: MaterialRingkas[] }

/** Bentuk PERSIS `GET /api/v1/procurement/suppliers`,
 * `procurement.ts:181-185`. */
export interface SupplierRingkas {
  id: string; code: string | null; name: string
  contact_person: string | null; phone: string | null; email: string | null
  payment_terms: string | null; is_active: boolean
}
export interface RespSupplierDaftar { suppliers: SupplierRingkas[] }

/** Bentuk PERSIS `GET /projects/:projectId/rab-materials`,
 * `procurement.ts:538-548` — dipakai memperingatkan kuota SEBELUM
 * `submit` (bukan menggantikan `quota-check`, keduanya dipakai:
 * ini untuk MENYUSUN, `quota-check` untuk MEMASTIKAN sebelum kirim). */
export interface KuotaRabMaterial {
  id: string; material_id: string; rab_quantity: number | string; rab_unit_cost: number | string | null
  notes: string | null
  material: { id: string; name: string; unit: string } | null
  terpakai: number; sisa: number; serapan_pct: number | null
}
export interface RespKuotaRab { data: KuotaRabMaterial[] }
```

- [ ] **Step 2: `procurement/page.tsx`** — list 3-tab (MR/PO/GR),
menggantikan 150 baris lama. Pemilih proyek dan `fmtRupiah` DIPINDAH
dari versi lama, bukan ditulis ulang. Tombol "+ Buat" per tab bergerbang
`bolehKelolaMr`/`bolehKelolaPo` — dibaca dari `useData<{permissions}>`
kalau ada endpoint whoami, TAPI karena portal PM ini tak punya endpoint
"my permissions" terverifikasi (dicek: tak ada di riset Task 5/11/17),
tombol create SELALU ditampilkan (PM Task 23 Step 1 py `mr:manage`+
`po:manage` PENUH, bukan sebagian) — konsisten dengan pola Task 12/19
yang tidak menyembunyikan tombol create berdasarkan tebakan permission,
hanya menyembunyikan aksi yang PM TERBUKTI tak punya (override kuota,
approve — dua itu memang disembunyikan/dialihkan).

```typescript
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Plus, X } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import SegmentedTab from "@/components/portal/SegmentedTab";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type {
  ProyekPM, GalatApi, RespMrDaftar, RespPoDaftar, RespGrDaftar,
  RespMaterialDaftar, RespSupplierDaftar, MaterialRingkas,
} from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_MR: Record<string, string> = {
  draft: "Draf", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
  partially_ordered: "Sebagian Dipesan", fully_ordered: "Selesai Dipesan",
};
const VARIAN_MR: Record<string, VarianStatus> = {
  draft: "netral", submitted: "pending", approved: "approved", rejected: "rejected",
  partially_ordered: "info", fully_ordered: "approved",
};
const LABEL_PO: Record<string, string> = {
  draft: "Draf", sent: "Terkirim", confirmed: "Dikonfirmasi", cancelled: "Dibatalkan",
};
const VARIAN_PO: Record<string, VarianStatus> = {
  draft: "netral", sent: "pending", confirmed: "approved", cancelled: "rejected",
};
const LABEL_GR: Record<string, string> = { draft: "Draf", confirmed: "Dikonfirmasi" };
const VARIAN_GR: Record<string, VarianStatus> = { draft: "pending", confirmed: "approved" };

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmProcurementPage() {
  const [tab, setTab] = useState<"mr" | "po" | "gr">("mr");
  const [proyekId, setProyekId] = useState("");
  const [sheetMr, setSheetMr] = useState(false);
  const [sheetPo, setSheetPo] = useState(false);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlMr = proyekAktif ? `/api/v1/procurement/material-requests?project_id=${proyekAktif}` : null;
  const { data: dataMr, memuat: memuatMr, galat: galatMr } = useData<RespMrDaftar>(tab === "mr" ? urlMr : null);

  const urlPo = proyekAktif ? `/api/v1/procurement/purchase-orders?project_id=${proyekAktif}` : null;
  const { data: dataPo, memuat: memuatPo, galat: galatPo } = useData<RespPoDaftar>(tab === "po" ? urlPo : null);

  const urlGr = proyekAktif ? `/api/v1/procurement/goods-receipts?project_id=${proyekAktif}` : null;
  const { data: dataGr, memuat: memuatGr, galat: galatGr } = useData<RespGrDaftar>(tab === "gr" ? urlGr : null);

  const { data: dataMaterial } = useData<RespMaterialDaftar>(sheetMr ? "/api/v1/procurement/materials?limit=200" : null);
  const { data: dataSupplier } = useData<RespSupplierDaftar>(sheetPo ? "/api/v1/procurement/suppliers?limit=200" : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Procurement</h1>
        {proyekAktif && tab === "mr" && (
          <button type="button" onClick={() => setSheetMr(true)} aria-label="Buat Material Request baru"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Plus size={16} aria-hidden="true" /> MR
          </button>
        )}
        {proyekAktif && tab === "po" && (
          <button type="button" onClick={() => setSheetPo(true)} aria-label="Buat Purchase Order baru"
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Plus size={16} aria-hidden="true" /> PO
          </button>
        )}
      </div>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <SegmentedTab
        opsi={[{ value: "mr", label: "Material Request" }, { value: "po", label: "Purchase Order" }, { value: "gr", label: "Penerimaan" }]}
        aktif={tab}
        onUbah={(v) => setTab(v as typeof tab)}
      />

      {!proyekAktif && <EmptyState icon={ShoppingCart} judul="Pilih proyek" deskripsi="Procurement tercatat per proyek." />}

      {proyekAktif && tab === "mr" && (
        <>
          {memuatMr && <SkeletonCard tinggi={80} />}
          {galatMr && <EmptyState icon={ShoppingCart} judul="Gagal memuat MR" deskripsi={pesanGalat(galatMr as GalatApi, "Coba muat ulang.")} />}
          {!memuatMr && !galatMr && (dataMr?.material_requests?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada Material Request" deskripsi="Buat permintaan material pertama untuk proyek ini." />
          )}
          {!memuatMr && (dataMr?.material_requests ?? []).map((mr) => (
            <Link key={mr.id} href={`/pm-portal/procurement/mr/${mr.id}`}
              style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{mr.mr_number ?? "MR"}</span>
                <StatusBadge status={VARIAN_MR[mr.status] ?? "netral"} label={LABEL_MR[mr.status] ?? mr.status} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {mr.request_date ?? "—"}{mr.needed_date ? ` · dibutuhkan ${mr.needed_date}` : ""} · {mr.items.length} item
              </div>
              {mr.requested_by?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Diminta: {mr.requested_by.name}</div>}
            </Link>
          ))}
        </>
      )}

      {proyekAktif && tab === "po" && (
        <>
          {memuatPo && <SkeletonCard tinggi={80} />}
          {galatPo && <EmptyState icon={ShoppingCart} judul="Gagal memuat PO" deskripsi={pesanGalat(galatPo as GalatApi, "Coba muat ulang.")} />}
          {!memuatPo && !galatPo && (dataPo?.purchase_orders?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada Purchase Order" deskripsi="PO ke supplier untuk proyek ini akan muncul di sini." />
          )}
          {!memuatPo && (dataPo?.purchase_orders ?? []).map((po) => (
            <Link key={po.id} href={`/pm-portal/procurement/po/${po.id}`}
              style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{po.po_number ?? "PO"}</span>
                <StatusBadge status={VARIAN_PO[po.status] ?? "netral"} label={LABEL_PO[po.status] ?? po.status} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{po.supplier?.name ?? "—"} · {fmtRupiah(po.total_amount)}</div>
              {po.expected_delivery_date && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Estimasi kirim: {po.expected_delivery_date}</div>}
            </Link>
          ))}
        </>
      )}

      {proyekAktif && tab === "gr" && (
        <>
          {memuatGr && <SkeletonCard tinggi={80} />}
          {galatGr && <EmptyState icon={ShoppingCart} judul="Gagal memuat penerimaan" deskripsi={pesanGalat(galatGr as GalatApi, "Coba muat ulang.")} />}
          {!memuatGr && !galatGr && (dataGr?.goods_receipts?.length ?? 0) === 0 && (
            <EmptyState icon={ShoppingCart} judul="Belum ada penerimaan barang" deskripsi="Penerimaan dibuat dari halaman detail PO." />
          )}
          {!memuatGr && (dataGr?.goods_receipts ?? []).map((gr) => (
            <div key={gr.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{gr.gr_number ?? "GR"}</span>
                <StatusBadge status={VARIAN_GR[gr.status] ?? "netral"} label={LABEL_GR[gr.status] ?? gr.status} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {gr.supplier?.name ?? "—"} · PO {gr.po?.po_number ?? "—"} · {gr.receipt_date ?? "—"}
              </div>
            </div>
          ))}
        </>
      )}

      <SheetBuatMr terbuka={sheetMr} onTutup={() => setSheetMr(false)} proyekId={proyekAktif} material={dataMaterial?.materials ?? []} />
      <SheetBuatPo terbuka={sheetPo} onTutup={() => setSheetPo(false)} proyekId={proyekAktif} supplier={dataSupplier?.suppliers ?? []} />
    </div>
  );
}

interface BarisItemForm { material_id: string; qty: string; unit: string }

function SheetBuatMr({ terbuka, onTutup, proyekId, material }: { terbuka: boolean; onTutup: () => void; proyekId: string; material: MaterialRingkas[] }) {
  const [neededDate, setNeededDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<BarisItemForm[]>([{ material_id: "", qty: "", unit: "" }]);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function tambahBaris() { setItems((p) => [...p, { material_id: "", qty: "", unit: "" }]); }
  function hapusBaris(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function ubahBaris(i: number, patch: Partial<BarisItemForm>) {
    setItems((p) => p.map((b, idx) => {
      if (idx !== i) return b;
      const next = { ...b, ...patch };
      if (patch.material_id) {
        const m = material.find((x) => x.id === patch.material_id);
        if (m) next.unit = m.unit;
      }
      return next;
    }));
  }

  async function simpan() {
    const valid = items.filter((it) => it.material_id && Number(it.qty) > 0);
    if (valid.length === 0) { setGalat("Isi minimal satu item dengan qty > 0."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/procurement/material-requests", {
        project_id: proyekId,
        needed_date: neededDate || undefined,
        notes: notes.trim() || undefined,
        items: valid.map((it) => ({ material_id: it.material_id, qty_requested: Number(it.qty), unit: it.unit })),
      });
      invalidasi(`/api/v1/procurement/material-requests?project_id=${proyekId}`);
      setItems([{ material_id: "", qty: "", unit: "" }]); setNeededDate(""); setNotes(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat MR"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Material Request Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tanggal dibutuhkan
          <input type="date" value={neededDate} onChange={(e) => setNeededDate(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>

        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item</div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: "var(--surface-subtle)" }}>
            <select value={it.material_id} onChange={(e) => ubahBaris(i, { material_id: e.target.value })}
              aria-label={`Material item ${i + 1}`}
              style={{ minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
              <option value="">Pilih material…</option>
              {material.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => ubahBaris(i, { qty: e.target.value })}
                placeholder="Qty" aria-label={`Kuantitas item ${i + 1}`}
                style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
              {items.length > 1 && (
                <button type="button" onClick={() => hapusBaris(i)} aria-label={`Hapus item ${i + 1}`}
                  style={{ minHeight: 44, minWidth: 44, borderRadius: 10, background: "transparent", border: "1px solid var(--border)", cursor: "pointer" }}>
                  <X size={16} color="var(--danger)" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={tambahBaris}
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px dashed var(--border)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}>
          + Tambah item
        </button>

        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Catatan
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan sebagai draf"}
        </button>
      </div>
    </BottomSheet>
  );
}

function SheetBuatPo({ terbuka, onTutup, proyekId, supplier }: { terbuka: boolean; onTutup: () => void; proyekId: string; supplier: { id: string; name: string }[] }) {
  const [supplierId, setSupplierId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Array<{ material_id: string; qty: string; unit: string; harga: string }>>([{ material_id: "", qty: "", unit: "", harga: "" }]);
  const { data: dataMaterial } = useData<RespMaterialDaftar>(terbuka ? "/api/v1/procurement/materials?limit=200" : null);
  const material = dataMaterial?.materials ?? [];
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function tambahBaris() { setItems((p) => [...p, { material_id: "", qty: "", unit: "", harga: "" }]); }
  function hapusBaris(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function ubahBaris(i: number, patch: Partial<{ material_id: string; qty: string; unit: string; harga: string }>) {
    setItems((p) => p.map((b, idx) => {
      if (idx !== i) return b;
      const next = { ...b, ...patch };
      if (patch.material_id) {
        const m = material.find((x) => x.id === patch.material_id);
        if (m) { next.unit = m.unit; next.harga = String(m.unit_price ?? ""); }
      }
      return next;
    }));
  }

  async function simpan() {
    if (!supplierId) { setGalat("Pilih supplier."); return; }
    const valid = items.filter((it) => it.material_id && Number(it.qty) > 0 && Number(it.harga) >= 0);
    if (valid.length === 0) { setGalat("Isi minimal satu item dengan qty dan harga."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/procurement/purchase-orders", {
        project_id: proyekId, supplier_id: supplierId,
        expected_delivery_date: deliveryDate || undefined,
        notes: notes.trim() || undefined,
        items: valid.map((it) => ({ material_id: it.material_id, qty_ordered: Number(it.qty), unit: it.unit, unit_price: Number(it.harga) })),
      });
      invalidasi(`/api/v1/procurement/purchase-orders?project_id=${proyekId}`);
      setItems([{ material_id: "", qty: "", unit: "", harga: "" }]); setSupplierId(""); setDeliveryDate(""); setNotes(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat PO"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Purchase Order Baru">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Supplier
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">Pilih supplier…</option>
            {supplier.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Estimasi kirim
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>

        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item</div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: "var(--surface-subtle)" }}>
            <select value={it.material_id} onChange={(e) => ubahBaris(i, { material_id: e.target.value })}
              aria-label={`Material item ${i + 1}`}
              style={{ minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
              <option value="">Pilih material…</option>
              {material.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => ubahBaris(i, { qty: e.target.value })}
                placeholder="Qty" aria-label={`Kuantitas item ${i + 1}`}
                style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
              <input type="number" min="0" step="1" value={it.harga} onChange={(e) => ubahBaris(i, { harga: e.target.value })}
                placeholder="Harga satuan" aria-label={`Harga satuan item ${i + 1}`}
                style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
              {items.length > 1 && (
                <button type="button" onClick={() => hapusBaris(i)} aria-label={`Hapus item ${i + 1}`}
                  style={{ minHeight: 44, minWidth: 44, borderRadius: 10, background: "transparent", border: "1px solid var(--border)", cursor: "pointer" }}>
                  <X size={16} color="var(--danger)" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={tambahBaris}
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px dashed var(--border)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}>
          + Tambah item
        </button>

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan sebagai draf"}
        </button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 3: `procurement/mr/[id]/page.tsx`** — detail MR: header
status, daftar item, tombol "Cek Kuota" (`GET .../quota-check`, hasil
ditampilkan sebagai daftar pelanggaran per material — BUKAN blocking,
sekadar pratinjau sebelum submit, sesuai desain backend "early warning"),
tombol "Ajukan" (`PATCH .../submit`) hanya saat `status==='draft'`.
**Approve/reject TIDAK ada di halaman ini** — diarahkan eksplisit ke
`/pm-portal/approval` (Task 24 Step 5 menambahkan `material_request` ke
inbox terpusat) via banner info saat `status==='submitted'`.

```typescript
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { RespMrDetail, RespQuotaCheck, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
  partially_ordered: "Sebagian Dipesan", fully_ordered: "Selesai Dipesan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral", submitted: "pending", approved: "approved", rejected: "rejected",
  partially_ordered: "info", fully_ordered: "approved",
};

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmMrDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const url = `/api/v1/procurement/material-requests/${id}`;
  const { data, memuat, galat } = useData<RespMrDetail>(url);
  const mr = data?.material_request;

  const [cekKuota, setCekKuota] = useState(false);
  const { data: dataKuota, memuat: memuatKuota } = useData<RespQuotaCheck>(cekKuota ? `/api/v1/procurement/material-requests/${id}/quota-check` : null);

  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  async function ajukan() {
    setMengirim(true); setGalatAksi(null);
    try {
      await api.patch(`/api/v1/procurement/material-requests/${id}/submit`);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengajukan MR"));
    } finally { setMengirim(false); }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !mr) {
    return <EmptyState icon={ClipboardList} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "MR tidak ditemukan.")} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{mr.mr_number ?? "MR"}</h1>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{mr.project?.name ?? "—"}</div>
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Status</span>
          <StatusBadge status={VARIAN_STATUS[mr.status] ?? "netral"} label={LABEL_STATUS[mr.status] ?? mr.status} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Diminta {mr.requested_by?.name ?? "—"}{mr.needed_date ? ` · dibutuhkan ${mr.needed_date}` : ""}
        </div>
        {mr.notes && <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{mr.notes}</div>}
      </div>

      {mr.status === "submitted" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 14, background: "var(--info-bg)" }}>
          <ArrowRight size={18} color="var(--on-info-bg)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--on-info-bg)" }}>
            MR ini menunggu persetujuan. Setujui/tolak dari{" "}
            <Link href="/pm-portal/approval" style={{ color: "var(--on-info-bg)", fontWeight: 700 }}>halaman Approval</Link>.
          </div>
        </div>
      )}

      {galatAksi && <div role="alert" style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}>{galatAksi}</div>}

      {mr.status === "draft" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setCekKuota(true)}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldAlert size={16} aria-hidden="true" /> Cek Kuota RAB
          </button>
          <button type="button" onClick={ajukan} disabled={mengirim || mr.items.length === 0}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
            {mengirim ? "Mengajukan…" : "Ajukan"}
          </button>
        </div>
      )}

      {cekKuota && (
        <div style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          {memuatKuota && <SkeletonCard tinggi={60} />}
          {dataKuota && dataKuota.lolos && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--success)" }}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Semua item dalam batas kuota RAB.</span>
            </div>
          )}
          {dataKuota && !dataKuota.lolos && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>Melebihi kuota RAB</div>
              {dataKuota.pelanggaran.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {p.material_name ?? p.material_id}: diminta {p.diminta}, sisa kuota {p.sisa}
                </div>
              ))}
              {!dataKuota.bisa_override && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Anda tidak punya wewenang melampaui kuota RAB — kurangi volume atau minta admin.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item ({mr.items.length})</div>
      {mr.items.map((it) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{it.material?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Diminta {it.qty_requested} {it.unit}{it.qty_ordered != null ? ` · dipesan ${it.qty_ordered}` : ""}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(Number(it.unit_price_est ?? 0) * Number(it.qty_requested))}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `procurement/po/[id]/page.tsx`** — detail PO: header
status, item, total; tombol "Kirim ke Vendor" (mengambil pesan WA lewat
`GET .../delivery-message`, membuka `wa_url` di tab baru, lalu mencatat
`POST .../delivery-log`) hanya saat `status==='draft'`; tombol "Buat
Penerimaan" (bottom sheet pilih item + qty, `POST /goods-receipts`)
selalu tampil saat ada sisa qty belum diterima. **`PATCH .../status`
dengan `{status:'sent'}` TIDAK dipanggil langsung dari sini** — riset
Task 23 menemukan transisi itu sendiri BER-GERBANG APPROVAL
(`purchase_order` entityType). Alur di halaman ini: tombol "Kirim ke
Vendor" memanggil `delivery-message`+`delivery-log` HANYA setelah PO
berstatus `sent` (dicapai lewat approval di inbox) — bukan yang memicu
transisi `sent` itu sendiri. Banner sama seperti MR mengarahkan ke
Approval saat PO masih `draft` dan py rantai approval berjalan.

⚠️ **Perbedaan penting dari MR**: PO `draft` BISA langsung "Kirim ke
Vendor" HANYA kalau rantai approval-nya kosong/auto-lolos (seed longgar
Task 23 Step 1: satu langkah, permission sama dengan `procurement:po:
manage`, PM otomatis lolos). Backend yang memutuskan — endpoint
`PATCH .../status {status:'sent'}` SENDIRI sudah menjalankan
`evaluateEntityApproval` dan bisa langsung sukses atau balas
`pending_next_level`. Karena itu tombol "Kirim ke Vendor" di halaman ini
MEMANGGIL `PATCH .../status` juga (bukan cuma delivery-message) — kalau
hasilnya `pending_next_level`, halaman menampilkan pesan yang sama
dengan pola inbox ("naik ke level berikutnya"), BUKAN mengklaim
terkirim.

```typescript
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Truck, Send, PackagePlus, ArrowUpCircle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespPoDetail, RespPesanPo, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

const LABEL_STATUS: Record<string, string> = { draft: "Draf", sent: "Terkirim", confirmed: "Dikonfirmasi", cancelled: "Dibatalkan" };
const VARIAN_STATUS: Record<string, VarianStatus> = { draft: "netral", sent: "pending", confirmed: "approved", cancelled: "rejected" };

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function PmPoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const url = `/api/v1/procurement/purchase-orders/${id}`;
  const { data, memuat, galat } = useData<RespPoDetail>(url);
  const po = data?.purchase_order;

  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [naikLevel, setNaikLevel] = useState<string | null>(null);
  const [sheetGr, setSheetGr] = useState(false);

  interface RespStatus { purchase_order?: unknown; pending_next_level?: boolean; message?: string }

  async function kirimKeVendor() {
    setMengirim(true); setGalatAksi(null); setNaikLevel(null);
    try {
      const res = await api.patch<RespStatus>(`/api/v1/procurement/purchase-orders/${id}/status`, { status: "sent" });
      if (res.data?.pending_next_level) {
        setNaikLevel(res.data.message ?? "Naik ke level berikutnya — belum terkirim ke vendor.");
        invalidasi(url);
        return;
      }
      // Baru sesudah status benar-benar `sent` — susun & buka pesan WA.
      const pesan = await api.get<RespPesanPo>(`/api/v1/procurement/purchase-orders/${id}/delivery-message`);
      if (pesan.data.wa_url) window.open(pesan.data.wa_url, "_blank", "noopener,noreferrer");
      await api.post(`/api/v1/procurement/purchase-orders/${id}/delivery-log`, { channel: "whatsapp" });
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengirim PO"));
    } finally { setMengirim(false); }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !po) {
    return <EmptyState icon={Truck} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "PO tidak ditemukan.")} />;
  }

  const adaSisaTerima = po.items.some((it) => Number(it.qty_received ?? 0) < Number(it.qty_ordered));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{po.po_number ?? "PO"}</h1>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{po.project?.name ?? "—"} · {po.supplier?.name ?? "—"}</div>
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Status</span>
          <StatusBadge status={VARIAN_STATUS[po.status] ?? "netral"} label={LABEL_STATUS[po.status] ?? po.status} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(po.total_amount)}</div>
        {po.mr && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Dari MR {po.mr.mr_number}</div>}
      </div>

      {galatAksi && <div role="alert" style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}>{galatAksi}</div>}
      {naikLevel && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 14, background: "var(--info-bg)" }}>
          <ArrowUpCircle size={18} color="var(--on-info-bg)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "var(--on-info-bg)" }}>{naikLevel}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {po.status === "draft" && (
          <button type="button" onClick={kirimKeVendor} disabled={mengirim}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: mengirim ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Send size={16} aria-hidden="true" /> {mengirim ? "Mengirim…" : "Kirim ke Vendor"}
          </button>
        )}
        {(po.status === "sent" || po.status === "confirmed") && adaSisaTerima && (
          <button type="button" onClick={() => setSheetGr(true)}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <PackagePlus size={16} aria-hidden="true" /> Buat Penerimaan
          </button>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item ({po.items.length})</div>
      {po.items.map((it) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{it.material?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {it.qty_ordered} {it.unit} · diterima {it.qty_received ?? 0}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(it.total_price)}</div>
        </div>
      ))}

      <SheetBuatGr terbuka={sheetGr} onTutup={() => setSheetGr(false)} po={po} onSukses={() => invalidasi(url)} />
    </div>
  );
}

function SheetBuatGr({ terbuka, onTutup, po, onSukses }: { terbuka: boolean; onTutup: () => void; po: RespPoDetail["purchase_order"]; onSukses: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [suratJalan, setSuratJalan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    const items = po.items
      .map((it) => ({ po_item_id: it.id, qty_received: Number(qty[it.id] ?? 0), sisa: Number(it.qty_ordered) - Number(it.qty_received ?? 0) }))
      .filter((it) => it.qty_received > 0);
    if (items.length === 0) { setGalat("Isi qty diterima minimal satu item."); return; }
    const lebih = items.find((it) => it.qty_received > it.sisa);
    if (lebih) { setGalat(`Qty diterima melebihi sisa PO (sisa ${lebih.sisa}).`); return; }

    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/procurement/goods-receipts", {
        po_id: po.id, receipt_date: tanggal, delivery_note_number: suratJalan.trim() || undefined,
        items: items.map((it) => ({ po_item_id: it.po_item_id, qty_received: it.qty_received })),
      });
      invalidasi(`/api/v1/procurement/goods-receipts?project_id=${po.project?.id}`);
      onSukses(); setQty({}); setSuratJalan(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat penerimaan"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Buat Penerimaan Barang">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Tanggal terima
          <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nomor surat jalan
          <input type="text" value={suratJalan} onChange={(e) => setSuratJalan(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>

        {po.items.map((it) => {
          const sisa = Number(it.qty_ordered) - Number(it.qty_received ?? 0);
          if (sisa <= 0) return null;
          return (
            <label key={it.id} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {it.material?.name ?? "—"} (sisa {sisa} {it.unit})
              <input type="number" min="0" max={sisa} step="0.01" value={qty[it.id] ?? ""} onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
            </label>
          );
        })}

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan Penerimaan"}
        </button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 5: Tambahkan `material_request` & `purchase_order` ke
inbox approval terpusat** (`apps/web/app/pm-portal/approval/page.tsx`,
Task 9) — MENGGANTIKAN pendekatan tombol approve terpisah, sesuai
keputusan Step 1 riset di atas.

Modify: `apps/web/app/pm-portal/approval/page.tsx`

```typescript
// Tambahan pada JALUR_PM:
const JALUR_PM: Record<string, string> = {
  kasbon: "/pm-portal/keuangan",
  submittal: "/pm-portal/lainnya",
  material_request: "/pm-portal/procurement",
  purchase_order: "/pm-portal/procurement",
};

// Tambahan pada AKSI — verifikasi method/body PERSIS ke procurement.ts:
const AKSI: Record<string, KonfigAksi> = {
  // ...kasbon, submittal seperti sebelumnya...

  // `PATCH /api/v1/procurement/material-requests/:id/approve` —
  // procurement.ts:709. Body: { action: 'approve'|'reject', rejection_notes? }.
  material_request: {
    metode: "patch",
    approveUrl: (id) => `/api/v1/procurement/material-requests/${id}/approve`,
    approveBody: () => ({ action: "approve" }),
    rejectUrl: (id) => `/api/v1/procurement/material-requests/${id}/approve`,
    rejectBody: (alasan) => ({ action: "reject", rejection_notes: alasan }),
  },
  // `PATCH /api/v1/procurement/purchase-orders/:id/status` —
  // procurement.ts:957. Body: { status: 'sent' } untuk approve. TIDAK ADA
  // endpoint reject eksplisit untuk PO — approval PO hanya menahan/meloloskan
  // transisi ke `sent`; menolaknya berarti membiarkan tetap `draft` atau
  // membatalkan lewat status `cancelled` (aksi TERPISAH, di luar approval).
  // Tombol "Tolak" untuk jenis ini DINONAKTIFKAN secara eksplisit (lihat
  // Step 6) — mengirim `status: 'cancelled'` dari sini akan MEMBATALKAN PO
  // permanen, bukan "menolak pengajuan", dan itu aksi berbeda dari approval.
  purchase_order: {
    metode: "patch",
    approveUrl: (id) => `/api/v1/procurement/purchase-orders/${id}/status`,
    approveBody: () => ({ status: "sent" }),
    rejectUrl: (id) => `/api/v1/procurement/purchase-orders/${id}/status`,
    rejectBody: () => ({ status: "draft" }), // no-op aman: draft→draft, TIDAK dipanggil (tombol nonaktif)
  },
};
```

⚠️ **Deviasi dari pola kasbon/submittal**: `purchase_order` py tombol
"Tolak" DINONAKTIFKAN (bukan dihapus — supaya layout tetap konsisten),
karena backend TIDAK punya jalur "tolak approval PO" yang aman secara
semantik (lihat komentar di atas). Ditambahkan cabang kondisi kecil di
`putuskan()`/tombol Tolak: `dipilih.jenis === 'purchase_order' ? true :
mengirim || dipilih.saya_pengajunya || detailGagal` untuk `disabled`.

- [ ] **Step 6: Detail entitas untuk bottom sheet inbox** — MR dan PO
TAK PUNYA endpoint list-tersaring-pending yang murah (`GET .../:id`
ADA untuk keduanya, BEDA dari kasbon/submittal yang route detail-nya
404). Karena itu detail inbox untuk `material_request`/`purchase_order`
memakai `GET /material-requests/:id` dan `GET /purchase-orders/:id`
LANGSUNG (bukan pola cocokkan-dari-list seperti kasbon) — lebih
sederhana dari yang sudah ada, bukan tambahan kerumitan:

```typescript
const urlDetailMr = dipilih?.jenis === "material_request" ? `/api/v1/procurement/material-requests/${dipilih.id}` : null;
const { data: detailMr, memuat: memuatDetailMr, galat: galatDetailMr } = useData<RespMrDetail>(urlDetailMr);

const urlDetailPo = dipilih?.jenis === "purchase_order" ? `/api/v1/procurement/purchase-orders/${dipilih.id}` : null;
const { data: detailPo, memuat: memuatDetailPo, galat: galatDetailPo } = useData<RespPoDetail>(urlDetailPo);
```

Ditambahkan ke union `memuatDetail`/`detailGagal` yang sudah ada,
mengikuti pola persis kasbon/submittal — dan blok tampilan detail baru
di `BottomSheet` (nama pemohon, jumlah item, total nilai untuk PO).

- [ ] **Step 7: Modify `procurement/page.tsx` lama DIHAPUS isi
lamanya** — sudah tercakup Step 2 (tulis ulang penuh).

- [ ] **Step 8: Typecheck + penjaga**

```bash
cd apps/web && pnpm exec tsc --noEmit
node scripts/uji-token-css-ada.mjs
node scripts/uji-judul-halaman-ada.mjs
node scripts/uji-remah-lengkap.mjs
node scripts/audit-halaman-pakai-cache.mjs
node scripts/uji-galat-muat-terpisah.mjs
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/pm-portal/procurement apps/web/app/pm-portal/approval/page.tsx apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): Procurement — buat MR/PO/GR, approval MR+PO lewat inbox terpusat"
```

### Task 25: Gudang & Material — Ikhtisar, Kelola Lokasi, Stok & Transfer, Rekonsiliasi

**Files:**
- Create: `apps/web/app/pm-portal/gudang/page.tsx`
- Create: `apps/web/app/pm-portal/gudang/lokasi/page.tsx`
- Create: `apps/web/app/pm-portal/gudang/stok/page.tsx`
- Create: `apps/web/app/pm-portal/gudang/transfer/page.tsx`
- Create: `apps/web/app/pm-portal/gudang/rekonsiliasi/page.tsx`
- Modify: `apps/web/app/pm-portal/_bersama/tipe.ts`

**Kenapa DUA halaman "susut"-terkait terpisah** (`gudang/rekonsiliasi`
vs — TIDAK ADA halaman gabungan "susut"): Task 23 Step 1 Temuan #4
membuktikan `/gudang/susut` desktop hanya CRUD data referensi (peta
resource↔material, rencana target %), sedangkan perhitungan susut NYATA
per-proyek ada di `rekonsiliasi-material.ts`. Portal PM Tahap 4 HANYA
membangun `gudang/rekonsiliasi` (perhitungan nyata, per-proyek PM yang
sedang dikerjakan) — TIDAK membangun versi mobile dari CRUD referensi
`/gudang/susut` (peta resource↔material & rencana target adalah data
SETUP tingkat perusahaan yang jarang berubah, dikelola dari desktop,
BUKAN kerja harian PM lapangan). Dicatat sebagai keputusan sengaja,
bukan kelalaian.

- [ ] **Step 1: Tipe di `_bersama/tipe.ts`**

Bentuk diverifikasi ke `gudang-ikhtisar.ts`, `gudang-kelola.ts`,
`transfer-stok.ts`, `rekonsiliasi-material.ts` (Task 23 Step 1).

```typescript
/** Bentuk PERSIS `GET /api/v1/gudang/ikhtisar`, `gudang-ikhtisar.ts:190-265`. */
export interface RespGudangIkhtisar {
  kpi: {
    total_aset: number; di_gudang: number; di_lapangan: number; perlu_perhatian: number
    jenis_material_gudang: number; proyek_belum_ditarik: number
    nilai_perolehan: string; nilai_buku: string; akumulasi_susut: string
  }
  gudang: Array<{ id: string; kode: string; nama: string; alamat: string | null; jumlah_aset: number; jenis_material: number }>
  aset_per_kategori: Array<{ nama: string; jml: number }>
  aset_per_kondisi: Array<{ nama: string; jml: number }>
  isi_gudang: Array<{ id: string; kode: string; nama: string; kategori: string; kondisi: string; status: string; gudang: string | null }>
  pergerakan: Array<{
    id: string; jenis: string; tanggal: string | null; hari_lalu: number | null
    dari: string | null; ke: string | null
    kondisi_sebelum: string | null; kondisi_sesudah: string | null; memburuk: boolean
  }>
  material_gudang: Array<{ id: string; material_id: string; qty: string; asal: string | null }>
  belum_ditarik: Array<{ proyek: string; jenis: number; qty: string }>
}

/** Bentuk PERSIS `GET /api/v1/gudang`, `gudang-kelola.ts:37-75` — field
 * TAMBAHAN (`jenis_material`/`total_qty`) DIHITUNG SERVER dari
 * `gudang_stok`, bukan bagian kolom tabel `gudang` asli. */
export interface GudangLokasi {
  id: string; kode: string; nama: string; alamat: string | null; aktif: boolean
  catatan: string | null; penjaga_id: string | null; created_at: string
  penjaga: { id: string; name: string } | null
  jenis_material: number; total_qty: number
}
export interface RespGudangDaftar { gudang: GudangLokasi[] }

/** Bentuk PERSIS `GET /api/v1/procurement/stocks`, `procurement.ts:1649-1650`. */
export interface StokRingkas {
  id: string; qty_on_hand: number | string; qty_reserved: number | string | null; last_updated_at: string | null
  project: { id: string; name: string } | null
  material: { id: string; name: string; unit: string; category: { name: string } | null } | null
}
export interface RespStokDaftar { stocks: StokRingkas[] }

/** Bentuk PERSIS `GET /procurement/stocks/:project_id/movements`,
 * `procurement.ts:1678`. */
export interface MutasiStok {
  id: string; movement_type: string; qty: number | string; qty_before: number | string; qty_after: number | string
  reference_type: string | null; reference_id: string | null; notes: string | null; created_at: string
  material: { id: string; name: string; unit: string } | null
  created_by: { id: string; name: string } | null
}
export interface RespMutasiDaftar { movements: MutasiStok[] }

/** Bentuk PERSIS `GET /api/v1/transfer-stok`, `transfer-stok.ts:62-69`. */
export interface TransferStok {
  id: string; qty: number | string; tanggal: string; alasan: string | null; created_at: string
  material: { id: string; name: string; unit: string } | null
  asal: { id: string; name: string } | null
  tujuan: { id: string; name: string } | null
  pembuat: { id: string; name: string } | null
}
export interface RespTransferDaftar { transfers: TransferStok[]; total: number }

/** Bentuk PERSIS `GET /projects/:projectId/rekonsiliasi-material`,
 * `rekonsiliasi-material.ts` + `lib/rekonsiliasi-material.ts:120-204`.
 * `status` MENENTUKAN warna badge — lihat `StatusRekonsiliasi` di lib
 * untuk arti masing-masing (khususnya `belum_dibeli` BUKAN `wajar`,
 * keduanya "tak ada masalah" secara visual tapi beda makna). */
export interface BarisRekonsiliasi {
  material_id: string; material_name: string; unit: string | null
  teoritis: number; dibeli: number; dipakai: number; sisa: number
  transfer_keluar: number; dari_klien: number; selisih: number
  susut_pct: number | null; lebih_beli: number
  status: "wajar" | "susut_tinggi" | "lebih_beli" | "belum_lengkap" | "belum_dibeli"
}
export interface RespRekonsiliasi {
  baris: BarisRekonsiliasi[]
  total_dibeli: number; total_dipakai: number; total_sisa: number; total_selisih: number
  total_transfer_keluar: number; total_dari_klien: number
  susut_pct_keseluruhan: number | null
  jumlah_susut_tinggi: number; jumlah_lebih_beli: number; jumlah_belum_lengkap: number; jumlah_belum_dibeli: number
  ambang: { susut_pct: number; lebih_beli_pct: number }
  gr_belum_dikonfirmasi: number
}
```

- [ ] **Step 2: `gudang/page.tsx`** — ikhtisar lintas-proyek (KPI aset +
material + nilai buku), daftar gudang ringkas, isi gudang perlu
perhatian (kondisi buruk naik ke atas — server sudah mengurutkan),
pergerakan terakhir dengan badge "Memburuk" (`m.memburuk`). Bukan
per-proyek — data perusahaan (`gudang:view`, PM punya).

```typescript
"use client";

import { Warehouse, AlertTriangle, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge from "@/components/portal/StatusBadge";
import type { RespGudangIkhtisar, GalatApi } from "../_bersama/tipe";
import { pesanGalat } from "../_bersama/tipe";

function fmtRupiah(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function KartuKpi({ label, nilai }: { label: string; nilai: string | number }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", flex: "1 1 45%", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", marginTop: 2 }}>{nilai}</div>
    </div>
  );
}

export default function PmGudangPage() {
  const { data, memuat, galat } = useData<RespGudangIkhtisar>("/api/v1/gudang/ikhtisar");

  if (memuat) return <SkeletonCard tinggi={220} />;
  if (galat || !data) {
    return <EmptyState icon={Warehouse} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Gudang & Material</h1>
        <Link href="/pm-portal/gudang/lokasi" style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", textDecoration: "none" }}>Kelola Lokasi</Link>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <KartuKpi label="Total Aset" nilai={data.kpi.total_aset} />
        <KartuKpi label="Perlu Perhatian" nilai={data.kpi.perlu_perhatian} />
        <KartuKpi label="Nilai Buku" nilai={fmtRupiah(data.kpi.nilai_buku)} />
        <KartuKpi label="Proyek Belum Ditarik" nilai={data.kpi.proyek_belum_ditarik} />
      </div>

      {data.belum_ditarik.length > 0 && (
        <div style={{ padding: 14, borderRadius: 14, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} color="var(--on-warning-bg)" aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)" }}>Proyek selesai, material belum ditarik</span>
          </div>
          {data.belum_ditarik.map((b, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--on-warning-bg)" }}>{b.proyek}: {b.jenis} jenis material, {b.qty} unit</div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Lokasi Gudang</div>
      {data.gudang.length === 0 && <EmptyState icon={Warehouse} judul="Belum ada gudang" deskripsi="Tambahkan lokasi gudang pertama." />}
      {data.gudang.map((g) => (
        <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{g.kode} · {g.nama}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{g.jumlah_aset} aset · {g.jenis_material} jenis material</div>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Pergerakan Terakhir</div>
      {data.pergerakan.length === 0 && <EmptyState icon={TrendingDown} judul="Belum ada pergerakan" deskripsi="Perpindahan aset akan tercatat di sini." />}
      {data.pergerakan.slice(0, 8).map((m) => (
        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{m.dari ?? "—"} → {m.ke ?? "—"}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.hari_lalu != null ? `${m.hari_lalu}h lalu` : "—"}</span>
            {m.memburuk && <StatusBadge status="rejected" label="Memburuk" />}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `gudang/lokasi/page.tsx`** — CRUD lokasi gudang. PM py
`gudang:manage` PENUH (Task 23 Step 1). Daftar + `BottomSheet` tambah +
`BottomSheet` edit (nama/alamat/penjaga/catatan/aktif). Menonaktifkan
gudang berisi ditolak backend dengan pesan spesifik (409) — pesan itu
DITAMPILKAN APA ADANYA (`pesanGalat`), bukan digeneralisasi, karena
sudah menyebutkan jumlah jenis material yang menahannya.

```typescript
"use client";

import { useState } from "react";
import { Warehouse, Plus, Pencil } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespGudangDaftar, GudangLokasi, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

export default function PmGudangLokasiPage() {
  const url = "/api/v1/gudang";
  const { data, memuat, galat } = useData<RespGudangDaftar>(url);
  const [sheetTambah, setSheetTambah] = useState(false);
  const [diedit, setDiedit] = useState<GudangLokasi | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Lokasi Gudang</h1>
        <button type="button" onClick={() => setSheetTambah(true)} aria-label="Tambah lokasi gudang"
          style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} aria-hidden="true" /> Tambah
        </button>
      </div>

      {memuat && <SkeletonCard tinggi={80} />}
      {galat && <EmptyState icon={Warehouse} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && !galat && (data?.gudang.length ?? 0) === 0 && (
        <EmptyState icon={Warehouse} judul="Belum ada gudang" deskripsi="Tambahkan lokasi gudang pertama perusahaan." />
      )}

      {(data?.gudang ?? []).map((g) => (
        <button key={g.id} type="button" onClick={() => setDiedit(g)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "left", cursor: "pointer" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{g.kode} · {g.nama}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{g.alamat ?? "Tanpa alamat"} · {g.jenis_material} jenis material · penjaga {g.penjaga?.name ?? "—"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {!g.aktif && <StatusBadge status="netral" label="Nonaktif" />}
            <Pencil size={16} color="var(--text-secondary)" aria-hidden="true" />
          </div>
        </button>
      ))}

      <FormGudang terbuka={sheetTambah} onTutup={() => setSheetTambah(false)} url={url} />
      <FormGudang terbuka={diedit !== null} onTutup={() => setDiedit(null)} url={url} existing={diedit} />
    </div>
  );
}

function FormGudang({ terbuka, onTutup, url, existing }: { terbuka: boolean; onTutup: () => void; url: string; existing?: GudangLokasi | null }) {
  const [kode, setKode] = useState(existing?.kode ?? "");
  const [nama, setNama] = useState(existing?.nama ?? "");
  const [alamat, setAlamat] = useState(existing?.alamat ?? "");
  const [catatan, setCatatan] = useState(existing?.catatan ?? "");
  const [aktif, setAktif] = useState(existing?.aktif ?? true);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!existing && !kode.trim()) { setGalat("Kode gudang wajib diisi."); return; }
    if (!nama.trim()) { setGalat("Nama gudang wajib diisi."); return; }
    setMengirim(true); setGalat(null);
    try {
      if (existing) {
        await api.patch(`/api/v1/gudang/${existing.id}`, { nama: nama.trim(), alamat: alamat.trim() || null, catatan: catatan.trim() || null, aktif });
      } else {
        await api.post("/api/v1/gudang", { kode: kode.trim(), nama: nama.trim(), alamat: alamat.trim() || undefined, catatan: catatan.trim() || undefined });
      }
      invalidasi(url);
      onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, existing ? "Gagal menyimpan perubahan" : "Gagal menambah gudang"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul={existing ? `Ubah ${existing.kode}` : "Gudang Baru"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!existing && (
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Kode
            <input type="text" value={kode} onChange={(e) => setKode(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, textTransform: "uppercase" }} />
          </label>
        )}
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Nama
          <input type="text" value={nama} onChange={(e) => setNama(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Alamat
          <input type="text" value={alamat ?? ""} onChange={(e) => setAlamat(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Catatan
          <textarea value={catatan ?? ""} onChange={(e) => setCatatan(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>
        {existing && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} style={{ width: 20, height: 20 }} />
            Aktif (bisa dipilih sebagai lokasi)
          </label>
        )}

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: `gudang/stok/page.tsx`** — kartu stok per proyek (pemilih
proyek seperti Task 24), daftar material + qty, tap buka riwayat mutasi
(`BottomSheet`, `GET .../movements`). Tombol "Catat Pemakaian/Retur"
(`POST /procurement/stocks/usage`) — form pilih material dari stok yang
ADA (bukan seluruh katalog, supaya tak bisa "memakai" material yang
tak pernah tercatat di proyek ini), qty, jenis (usage/return/adjustment).

⚠️ **Cacat gerbang pra-eksisting, dicatat bukan diperbaiki** (review
Important-4, 2026-08-21): `POST /procurement/stocks/usage` bergerbang
`procurement:view` (BACA) untuk aksi yang MENULIS `stock_movements` +
`project_stocks` (`procurement.ts:1685-1688`, komentar `T4j` di kode
itu sendiri sudah mendokumentasikan cacatnya tanpa memperbaikinya) —
gerbang cacat PERSIS sama dengan `stocks/opname` (Task 26 Step 2,
Temuan #2 Task 23 Step 1). Langkah ini MEMPERLUAS paparan cacat itu
(menambah satu jalur UI baru — `SheetCatatPemakaian` — yang memakainya
aktif), berbeda dari `stocks/opname` yang sekadar TIDAK dibangun. Ini
TIDAK berarti `SheetCatatPemakaian` dibatalkan — backend memang sudah
begini sejak sebelum Task 23, dan memperbaiki gerbangnya di luar
wewenang task riset ini — tapi risikonya WAJIB dilaporkan ke founder
sebelum task ini dieksekusi (lihat concern §7 laporan Task 23).

```typescript
"use client";

import { useMemo, useState } from "react";
import { Boxes, History, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespStokDaftar, StokRingkas, RespMutasiDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

export default function PmStokPage() {
  const [proyekId, setProyekId] = useState("");
  const [dipilih, setDipilih] = useState<StokRingkas | null>(null);
  const [sheetPakai, setSheetPakai] = useState(false);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const urlStok = proyekAktif ? `/api/v1/procurement/stocks?project_id=${proyekAktif}` : null;
  const { data, memuat, galat } = useData<RespStokDaftar>(urlStok);

  const urlMutasi = dipilih && proyekAktif ? `/api/v1/procurement/stocks/${proyekAktif}/movements?limit=30` : null;
  const { data: dataMutasi, memuat: memuatMutasi } = useData<RespMutasiDaftar>(urlMutasi);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Kartu Stok</h1>
        {proyekAktif && (
          <button type="button" onClick={() => setSheetPakai(true)}
            style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Plus size={16} aria-hidden="true" /> Catat
          </button>
        )}
      </div>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Boxes} judul="Pilih proyek" deskripsi="Kartu stok tercatat per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={70} />}
      {proyekAktif && galat && <EmptyState icon={Boxes} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {proyekAktif && !memuat && !galat && (data?.stocks.length ?? 0) === 0 && (
        <EmptyState icon={Boxes} judul="Belum ada stok" deskripsi="Stok muncul setelah penerimaan barang dikonfirmasi." />
      )}

      {(data?.stocks ?? []).map((s) => (
        <button key={s.id} type="button" onClick={() => setDipilih(s)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "left", cursor: "pointer" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{s.material?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.material?.category?.name ?? "Tanpa kategori"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>{s.qty_on_hand} {s.material?.unit ?? ""}</span>
            <History size={14} color="var(--text-secondary)" aria-hidden="true" />
          </div>
        </button>
      ))}

      <BottomSheet terbuka={dipilih !== null} onTutup={() => setDipilih(null)} judul={dipilih?.material?.name ?? "Riwayat"}>
        {memuatMutasi && <SkeletonCard tinggi={50} />}
        {!memuatMutasi && (dataMutasi?.movements ?? []).length === 0 && (
          <EmptyState icon={History} judul="Belum ada mutasi" deskripsi="Riwayat pergerakan material ini akan muncul di sini." />
        )}
        {(dataMutasi?.movements ?? []).map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{m.movement_type}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.created_at.slice(0, 10)} · {m.created_by?.name ?? "—"}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: Number(m.qty) < 0 ? "var(--danger)" : "var(--success)" }}>
              {Number(m.qty) > 0 ? "+" : ""}{m.qty}
            </div>
          </div>
        ))}
      </BottomSheet>

      <SheetCatatPemakaian terbuka={sheetPakai} onTutup={() => setSheetPakai(false)} proyekId={proyekAktif} stok={data?.stocks ?? []} />
    </div>
  );
}

function SheetCatatPemakaian({ terbuka, onTutup, proyekId, stok }: { terbuka: boolean; onTutup: () => void; proyekId: string; stok: StokRingkas[] }) {
  const [materialId, setMaterialId] = useState("");
  const [jenis, setJenis] = useState<"usage" | "return" | "adjustment">("usage");
  const [qty, setQty] = useState("");
  const [catatan, setCatatan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan() {
    if (!materialId || !(Number(qty) > 0)) { setGalat("Pilih material dan isi qty > 0."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/procurement/stocks/usage", { project_id: proyekId, material_id: materialId, qty: Number(qty), movement_type: jenis, notes: catatan.trim() || undefined });
      invalidasi(`/api/v1/procurement/stocks?project_id=${proyekId}`);
      setMaterialId(""); setQty(""); setCatatan(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal mencatat mutasi"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Catat Pemakaian / Retur">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Material
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">Pilih material…</option>
            {stok.map((s) => <option key={s.id} value={s.material?.id}>{s.material?.name} (tersedia {s.qty_on_hand})</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Jenis
          <select value={jenis} onChange={(e) => setJenis(e.target.value as typeof jenis)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="usage">Pemakaian</option>
            <option value="return">Retur (masuk kembali)</option>
            <option value="adjustment">Penyesuaian (qty absolut baru)</option>
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Qty
          <input type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Catatan
          <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2}
            style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit" }} />
        </label>

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 5: `gudang/transfer/page.tsx`** — daftar transfer (asal→
tujuan, badge arah relatif ke proyek yang dipilih PM kalau perlu), tombol
"Transfer Baru" (`BottomSheet`: proyek asal/tujuan berbeda, material dari
stok asal, qty ≤ stok asal — validasi klien MERINGANKAN, bukan
menggantikan validasi 400 backend). PM py `procurement:material:manage`.

```typescript
"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespTransferDaftar, RespStokDaftar, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

export default function PmTransferPage() {
  const { data, memuat, galat } = useData<RespTransferDaftar>("/api/v1/transfer-stok?limit=100");
  const [sheetBuka, setSheetBuka] = useState(false);
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Transfer Antar Proyek</h1>
        <button type="button" onClick={() => setSheetBuka(true)}
          style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} aria-hidden="true" /> Transfer
        </button>
      </div>

      {memuat && <SkeletonCard tinggi={70} />}
      {galat && <EmptyState icon={ArrowLeftRight} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}
      {!memuat && !galat && (data?.transfers.length ?? 0) === 0 && (
        <EmptyState icon={ArrowLeftRight} judul="Belum ada transfer" deskripsi="Perpindahan material antar proyek akan tercatat di sini." />
      )}

      {(data?.transfers ?? []).map((t) => (
        <div key={t.id} style={{ padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{t.material?.name ?? "—"} · {t.qty} {t.material?.unit ?? ""}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t.asal?.name ?? "—"} → {t.tujuan?.name ?? "—"} · {t.tanggal}</div>
          {t.alasan && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t.alasan}</div>}
        </div>
      ))}

      <SheetTransferBaru terbuka={sheetBuka} onTutup={() => setSheetBuka(false)} proyek={daftarProyek} />
    </div>
  );
}

function SheetTransferBaru({ terbuka, onTutup, proyek }: { terbuka: boolean; onTutup: () => void; proyek: ProyekPM[] }) {
  const [asalId, setAsalId] = useState("");
  const [tujuanId, setTujuanId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [alasan, setAlasan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const { data: dataStokAsal } = useData<RespStokDaftar>(asalId ? `/api/v1/procurement/stocks?project_id=${asalId}` : null);

  async function simpan() {
    if (!asalId || !tujuanId) { setGalat("Pilih proyek asal dan tujuan."); return; }
    if (asalId === tujuanId) { setGalat("Proyek asal dan tujuan tidak boleh sama."); return; }
    if (!materialId || !(Number(qty) > 0)) { setGalat("Pilih material dan isi qty > 0."); return; }
    setMengirim(true); setGalat(null);
    try {
      await api.post("/api/v1/transfer-stok", { project_asal_id: asalId, project_tujuan_id: tujuanId, material_id: materialId, qty: Number(qty), alasan: alasan.trim() || undefined });
      invalidasi("/api/v1/transfer-stok?limit=100");
      setAsalId(""); setTujuanId(""); setMaterialId(""); setQty(""); setAlasan(""); onTutup();
    } catch (e) {
      setGalat(pesanGalat(e as GalatApi, "Gagal membuat transfer"));
    } finally { setMengirim(false); }
  }

  return (
    <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Transfer Material">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Dari proyek
          <select value={asalId} onChange={(e) => { setAsalId(e.target.value); setMaterialId(""); }}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">Pilih…</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Ke proyek
          <select value={tujuanId} onChange={(e) => setTujuanId(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">Pilih…</option>
            {proyek.filter((p) => p.id !== asalId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Material
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} disabled={!asalId}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
            <option value="">{asalId ? "Pilih material…" : "Pilih proyek asal dulu"}</option>
            {(dataStokAsal?.stocks ?? []).map((s) => <option key={s.id} value={s.material?.id}>{s.material?.name} (tersedia {s.qty_on_hand})</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Qty
          <input type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Alasan
          <input type="text" value={alasan} onChange={(e) => setAlasan(e.target.value)}
            style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
        </label>

        {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

        <button type="button" onClick={simpan} disabled={mengirim}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
          {mengirim ? "Menyimpan…" : "Kirim Transfer"}
        </button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 6: `gudang/rekonsiliasi/page.tsx`** — per proyek (pemilih
proyek), tabel/kartu per material dengan `status` sebagai badge warna
(`wajar`=approved, `susut_tinggi`/`lebih_beli`=rejected,
`belum_lengkap`=pending, `belum_dibeli`=netral — LIMA status, BUKAN
biner baik/buruk, sesuai desain lib). Ringkasan di atas (total susut %,
jumlah bermasalah). Read-only — modul ini SENGAJA tanpa tombol tulis
(lihat komentar `rekonsiliasi-material.ts`: "angka yang bisa disunting
berhenti menjadi bukti").

```typescript
"use client";

import { useMemo, useState } from "react";
import { Scale, AlertTriangle } from "lucide-react";
import { useData } from "@/lib/data-cache";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { ProyekPM, RespRekonsiliasi, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek { projects: ProyekPM[] }

const LABEL_STATUS: Record<string, string> = {
  wajar: "Wajar", susut_tinggi: "Susut Tinggi", lebih_beli: "Lebih Beli",
  belum_lengkap: "Belum Lengkap", belum_dibeli: "Belum Ada Transaksi",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  wajar: "approved", susut_tinggi: "rejected", lebih_beli: "rejected",
  belum_lengkap: "pending", belum_dibeli: "netral",
};

export default function PmRekonsiliasiPage() {
  const [proyekId, setProyekId] = useState("");
  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  const daftarProyek = useMemo(() => (dataProyek?.projects ?? []).filter((p) => p.pm), [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/rekonsiliasi-material` : null;
  const { data, memuat, galat } = useData<RespRekonsiliasi>(url);

  const bermasalah = useMemo(() =>
    (data?.baris ?? []).filter((b) => b.status === "susut_tinggi" || b.status === "lebih_beli" || b.status === "belum_lengkap"),
  [data]);
  const lainnya = useMemo(() =>
    (data?.baris ?? []).filter((b) => b.status === "wajar" || b.status === "belum_dibeli"),
  [data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Rekonsiliasi Material</h1>

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekAktif} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={Scale} judul="Pilih proyek" deskripsi="Rekonsiliasi dihitung per proyek." />}
      {proyekAktif && memuat && <SkeletonCard tinggi={100} />}
      {proyekAktif && galat && <EmptyState icon={Scale} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

      {data && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <div style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", flex: "1 1 45%", minWidth: 130 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Susut Keseluruhan</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{data.susut_pct_keseluruhan != null ? `${data.susut_pct_keseluruhan}%` : "—"}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", flex: "1 1 45%", minWidth: 130 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Bermasalah</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--danger)" }}>{data.jumlah_susut_tinggi + data.jumlah_lebih_beli}</div>
            </div>
          </div>

          {data.gr_belum_dikonfirmasi > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, background: "var(--warning-bg)" }}>
              <AlertTriangle size={16} color="var(--on-warning-bg)" aria-hidden="true" />
              <span style={{ fontSize: 12, color: "var(--on-warning-bg)" }}>{data.gr_belum_dikonfirmasi} penerimaan belum dikonfirmasi — belum ikut terhitung.</span>
            </div>
          )}

          {bermasalah.length > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>Perlu Perhatian</div>}
          {bermasalah.map((b) => (
            <div key={b.material_id} style={{ display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{b.material_name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Dibeli {b.dibeli} · Dipakai {b.dipakai} · Sisa {b.sisa}{b.susut_pct != null ? ` · Susut ${b.susut_pct}%` : ""}</div>
              </div>
              <StatusBadge status={VARIAN_STATUS[b.status]} label={LABEL_STATUS[b.status]} />
            </div>
          ))}

          {lainnya.length > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginTop: 4 }}>Lainnya</div>}
          {lainnya.map((b) => (
            <div key={b.material_id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{b.material_name}</div>
              <StatusBadge status={VARIAN_STATUS[b.status]} label={LABEL_STATUS[b.status]} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Typecheck + penjaga**

```bash
cd apps/web && pnpm exec tsc --noEmit
node scripts/uji-token-css-ada.mjs
node scripts/uji-judul-halaman-ada.mjs
node scripts/uji-remah-lengkap.mjs
node scripts/audit-halaman-pakai-cache.mjs
node scripts/uji-galat-muat-terpisah.mjs
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/pm-portal/gudang apps/web/app/pm-portal/_bersama/tipe.ts
git commit -m "feat(pm-portal): Gudang & Material — ikhtisar, kelola lokasi, kartu stok, transfer, rekonsiliasi"
```

### Task 26: Navigasi kategori Pengadaan + Gudang & Material + Verifikasi akhir Tahap 4

**Files:**
- Modify: `apps/web/lib/pm-portal-kategori.ts`
- Modify: `apps/web/app/pm-portal/kategori/[key]/page.tsx`

> ⚠️ **SEBAGIAN Step 1-2 SUDAH DIKERJAKAN Task 25 — JANGAN DIULANG.**
> Task 25 (`gudang/page.tsx` dkk.) menemukan bahwa kelima halaman baru
> Gudang & Material yang dibangunnya jadi TAK TERJANGKAU tanpa aktivasi
> navigasi — jadi Task 25 sudah mengerjakan BAGIAN `g-inventory` dari
> scope Task 26 ini (di luar breakdown aslinya, sebagai bagian dari
> membuat halamannya benar-benar selesai, bukan cuma jadi lalu tak
> terpakai). Diverifikasi review 2026-08-21. Rinciannya:
>
> 1. **`g-inventory` di `KATEGORI_AKTIF`** — SUDAH aktif
>    (`apps/web/lib/pm-portal-kategori.ts`). `g-procurement` **BELUM**
>    (masih scope Task 26 GENUINE — cek dulu apakah Task 24 sudah
>    menyentuhnya sebelum mengerjakan ulang; kalau belum, ini tetap PR
>    Task 26).
> 2. **5 dari 6 href mapping** SUDAH dipetakan
>    (`apps/web/app/pm-portal/kategori/[key]/page.tsx`, `PETA_HREF_PORTAL`):
>    `iv-gudang`, `iv-mutasi`, `iv-transfer`, `iv-rekonsiliasi`,
>    `iv-waste` — SEMUA ke halaman Task 25 (lihat isi aktual di bawah,
>    beda dari draf breakdown asli yang menunjuk `iv-minstok` ke
>    `gudang/stok` juga — Task 25 SENGAJA TIDAK memetakan `iv-minstok`,
>    lihat poin 4).
> 3. **`md-gudang`** (grup `g-master`) → `/pm-portal/gudang` juga SUDAH
>    dipetakan — ini INISIATIF Task 25, TIDAK disebut breakdown asli di
>    bawah. Jangan menganggapnya hilang atau butuh ditambahkan lagi.
> 4. **Sisa scope GENUINE Task 26** yang MASIH perlu dikerjakan:
>    `g-procurement` di `KATEGORI_AKTIF` + entri `pr-*` di
>    `PETA_HREF_PORTAL` (cek dulu status Task 24 — lihat catatan di
>    `apps/web/app/pm-portal/kategori/[key]/page.tsx` sendiri, grup
>    `g-lapangan` sudah punya `px-procurement` via `EKSTRA_PORTAL` sejak
>    Task 24, jadi mungkin sebagian `g-procurement` juga sudah tumpang
>    tindih — VERIFIKASI, jangan asumsikan kosong maupun penuh),
>    `iv-minstok` (BELUM dipetakan siapa pun — scope nyata Task 26), dan
>    seluruh Step 3-9 asli di bawah (typecheck, `audit-nav-yatim.mjs`,
>    suite penjaga CI penuh, test integrasi, audit a11y runtime, update
>    `JOURNAL.md`, commit) — TAK SATU PUN dari Step 3-9 disentuh Task 25.
>
> Task 25 TIDAK memetakan `iv-minstok` sama sekali (baik ke `gudang/stok`
> maupun halaman lain) — draf breakdown Task 26 di bawah pernah
> menunjuknya ke `gudang/stok`, tapi itu KELIRU secara makna (kartu stok
> menampilkan qty on-hand per proyek, bukan ambang minimum lintas-proyek)
> dan TETAP UTANG NYATA Task 26: putuskan apakah `iv-minstok` memang
> pantas fallback ke web (halaman `/procurement/material` sudah ada di
> web, py kolom `min_stock`), atau butuh tampilan tersendiri di portal PM.

- [x] **Step 1: Aktifkan `g-procurement` di `KATEGORI_AKTIF`** (`g-inventory`
SUDAH aktif sejak Task 25 — lihat catatan di atas, JANGAN ditambahkan lagi,
cukup pastikan masih ada di array saat menambahkan `g-procurement`):

```typescript
const KATEGORI_AKTIF = ["g-subkon", "g-lapangan", "g-kontrak", "g-jadwal", "g-cost", "g-master", "g-crm", "g-inventory", "g-procurement"]; // Tahap 1-4
```

- [x] **Step 2: Isi entri `pr-*` di `PETA_HREF_PORTAL`** (key PERSIS dari
`peta-menu.ts`, diverifikasi Task 23 Step 1). Entri `iv-*`/`md-gudang` di
bawah **SUDAH ADA sejak Task 25** — ditampilkan di sini HANYA sebagai
konteks (bentuk aktualnya, untuk dibandingkan dengan draf lama), **JANGAN
ditulis ulang/ditimpa**, cukup tambahkan baris `pr-*` yang baru:

> ⚠️ **KOREKSI review Task 26 (2026-08-21, Critical)**: draf di bawah SALAH
> memetakan `pr-3way`/`pr-jadwal-bayar` ke `/pm-portal/procurement`.
> Diverifikasi grep menyeluruh `apps/web/app/pm-portal/procurement/` untuk
> `3-way|3way|match|jatuh_tempo|due_date|payment|jadwal` — NOL hasil.
> Halaman itu hanya punya tab MR/PO/GR; tak ada UI pencocokan PO↔GR↔tagihan
> atau daftar jatuh tempo vendor di mana pun. Implementasi AKTUAL (bukan
> contoh di bawah) hanya memetakan `pr-mr`/`pr-po`/`pr-grn` — `pr-3way` dan
> `pr-jadwal-bayar` fallback ke web (`it.href` = `/procurement`), sama
> seperti `pr-rfq`/`pr-blanket`/dst.

```typescript
const PETA_HREF_PORTAL: Record<string, string> = {
  // ...baris Tahap 1-3 yang sudah ada, TIDAK dihapus...
  // ── Tahap 4 (Task 25, SUDAH ADA — jangan ditulis ulang) ──────────────
  "iv-gudang": "/pm-portal/gudang",
  "md-gudang": "/pm-portal/gudang",
  "iv-mutasi": "/pm-portal/gudang/stok",
  "iv-transfer": "/pm-portal/gudang/transfer",
  "iv-rekonsiliasi": "/pm-portal/gudang/rekonsiliasi",
  "iv-waste": "/pm-portal/gudang/rekonsiliasi",
  // ── Tahap 4 (Task 26, BARU — yang benar-benar dikerjakan task ini) ───
  "pr-mr": "/pm-portal/procurement",
  "pr-po": "/pm-portal/procurement",
  "pr-grn": "/pm-portal/procurement",
  // pr-3way DAN pr-jadwal-bayar SENGAJA TIDAK diisi — lihat koreksi review
  // di atas. Fallback ke `it.href` web (/procurement).
  // "iv-minstok" SENGAJA belum diisi di sini — lihat catatan panjang di
  // atas kepala Task 26: draf lama menunjuknya ke gudang/stok, TAPI itu
  // salah makna. Putuskan tujuan yang benar sebagai bagian Step 2 ini
  // (fallback web, atau bangun tampilan baru), baru isi barisnya.
};
```

`cc-pagu-material` (grup `g-cost`, Tahap 3) SUDAH menunjuk
`/procurement/material` (web) sejak Task 22 — TIDAK diubah di sini:
halaman itu adalah master data batas kuota (`materials.min_stock`),
bukan transaksi harian, dan versi mobilenya di luar cakupan Tahap 4
(dicek: tak ada endpoint PM-facing untuk mengubah kuota selain
`project_rab_materials` yang sudah tercakup Task 24 lewat quota-check).

`pr-rfq`/`pr-tabulasi` (RFQ + Perbandingan Penawaran), `pr-blanket`
(Kontrak Payung), `pr-evaluasi` (Evaluasi Vendor), `pr-expediting`,
`pr-3way` (3-Way Match), `pr-jadwal-bayar` (Jadwal Bayar Vendor),
`tg-nota-kredit` (grup `g-finance`, Tahap 6) **TIDAK dipetakan** —
fallback web tetap berlaku. Alasan per modul:

- **RFQ+Tabulasi+Evaluasi Vendor**: alur multi-vendor dengan
  perbandingan tabel lebar (banyak kolom harga berdampingan per
  vendor) — bentuk data ini secara struktural tak cocok jadi kartu
  mobile tanpa scroll horizontal berat, pola yang sama dengan alasan
  Gantt Chart ditunda di Task 22. Dicatat sebagai UTANG kandidat Task
  27 (hub `proyek/[id]`, kalau dibangun) — TIDAK diselesaikan di sini.
- **3-Way Match + Jadwal Bayar Vendor**: KOREKSI review Task 26
  (2026-08-21, Critical) — draf awal task ini SALAH memetakan keduanya
  ke `/pm-portal/procurement`. Diverifikasi grep menyeluruh: halaman itu
  TIDAK memuat UI pencocokan PO↔GR↔tagihan maupun daftar jatuh tempo
  vendor sama sekali (hanya tab MR/PO/GR dengan status/total/tanggal
  kirim). Fallback web (`/procurement`) sampai ada halaman portal PM
  yang benar-benar menjawab kedua konsep ini — dicatat UTANG kandidat
  Task 27 bersama RFQ/Tabulasi/Evaluasi Vendor.
- **Kontrak Payung+Expediting+Nota Kredit**: `GET /pengadaan-lanjutan`
  SUDAH terverifikasi lengkap (Step 1 Temuan #3), TAPI py TIGA
  entitas dengan wewenang PM YANG BERBEDA-BEDA per aksi (buat kontrak
  payung: PM punya; putuskan nota kredit: PM TIDAK punya) — ini
  bentuk yang sama kompleksnya dengan modul Keuangan (Tahap 6, py
  penjaga CI approval-satu-pintu paling ketat). DITUNDA ke Tahap 6
  supaya ditinjau BERSAMA modul keuangan lain yang py pola wewenang
  sebagian serupa (`klaim:*` — PM cuma setuju/bayar, bukan ajukan),
  bukan diputuskan terpisah di sini dengan risiko pola approval yang
  tak konsisten antar dua tahap.
- **`iv-opname` (Stock Opname)**: TIDAK dipetakan sama sekali, oleh
  Task 25 MAUPUN Task 26 — endpoint `POST /procurement/stocks/opname` py cacat gerbang
  (`procurement:view` untuk aksi TULIS massal, Temuan #2) yang BELUM
  diperbaiki. Memetakannya ke portal PM berarti mengekspos jalur
  tulis-massal berpermission-baca ke lebih banyak pengguna (PM,
  bukan cuma admin desktop yang sudah ada) — TIDAK dilakukan sampai
  cacat backend itu diperbaiki (di luar wewenang task ini, dicatat di
  laporan sebagai concern untuk ratifikasi/perbaikan terpisah).

- [x] **Step 3: Typecheck + lint navigasi**

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm exec eslint lib/pm-portal-kategori.ts app/pm-portal/kategori/
```

- [x] **Step 4: `audit-nav-yatim.mjs`** — pola Task 16/22, bandingkan
sebelum/sesudah lewat `git stash`. Laporkan hasil di laporan Task 26.

```bash
cd apps/web && node scripts/audit-nav-yatim.mjs
```

- [x] **Step 5: Typecheck seluruh workspace + SEMUA penjaga CI**

```bash
cd apps/web && pnpm exec tsc --noEmit
cd ../api && node scripts/jalankan-semua-penjaga.mjs
```

Angka BENAR (diverifikasi ulang review Important, 2026-08-21, tiga run
independen konsisten): **130 hijau · 41 MERAH · 2 tak ketemu** — bukan
131/40 seperti klaim laporan draf pertama Task 26 (kesalahan verifikasi,
lihat koreksi di `task-26-report.md`). Selisihnya `schema-fingerprint.mjs`
tercetak DUA KALI: skrip `jalankan-semua-penjaga.mjs` mem-parse `ci.yml`
dengan regex yang tak membedakan `run:` sungguhan dari CONTOH PERINTAH DI
DALAM KOMENTAR (baris `# node scripts/schema-fingerprint.mjs emit > ...`
di `ci.yml`), jadi ia dihitung sebagai perintah kedua yang terpisah dari
`run: node scripts/schema-fingerprint.mjs compare ...` yang sungguhan.
Keduanya gagal karena `CI_DIRECT_URL`/`FP_URL` kosong secara lokal — sama
sekali bukan disebabkan perubahan Task 26 (dikonfirmasi: 130/41 identik
baik pada state sebelum maupun sesudah perubahan Task 26 lewat
`git stash`, dan `ci.yml`/`jalankan-semua-penjaga.mjs` sendiri tak
tersentuh commit mana pun terkait task ini).

- [x] **Step 6: Test integrasi terkait**

```bash
cd apps/api && npx vitest run procurement pengadaan-lanjutan rfq transfer-stok material-klien gudang rekonsiliasi-material susut-material vendor-kualifikasi
```

11 berkas, 214 test, semua lulus.

- [ ] **Step 7: Audit a11y runtime penuh** — **TIDAK TUNTAS**, timeout
lingkungan (>9 menit, suite penuh ~150+ halaman × 2 mode). Perubahan
Task 26 murni data (lima/tiga baris `Record<string,string>` + komentar,
tanpa markup baru), dan akun uji `LAYAR_EMAIL` (role `admin`) dialihkan
dari SELURUH `pm-portal/*` sebelum render apa pun (dicatat sejak entri
JOURNAL Task 22, 2026-08-21) — jadi audit penuh sekalipun tuntas TAK AKAN
memeriksa halaman yang baru terjangkau Task 26. Smoke-check manual (curl)
dilakukan sebagai gantinya: 307 redirect-login, tak ada crash. Item
"akun uji ber-role `pm`" tetap utang terbuka lintas-task, bukan utang
baru Task 26 — TIDAK dicentang selesai di sini supaya tak terbaca sebagai
sudah tuntas.

```bash
cd apps/web
export $(grep -E "^LAYAR_(EMAIL|SANDI|BASIS)=" .env.local | tr -d '\r' | xargs)
node scripts/jalankan-a11y-lengkap.mjs
```

- [x] **Step 8: Update JOURNAL.md** — catat Tahap 4 selesai: halaman
baru (Procurement 3 berkas, Gudang 5 berkas), integrasi approval
terpusat MR+PO, utang tercatat (RFQ/Kontrak Payung/Nota Kredit/Stock
Opname ditunda dengan alasan tertulis).

- [x] **Step 9: Commit dokumentasi**

```bash
git add docs/execution/JOURNAL.md docs/superpowers/plans/2026-08-20-portal-pm-lengkap.md apps/web/lib/pm-portal-kategori.ts "apps/web/app/pm-portal/kategori/[key]/page.tsx"
git commit -m "feat(pm-portal): navigasi kategori Pengadaan + Gudang & Material, Tahap 4 selesai"
```

### Task 27: [Tahap 5] Rencana & Uji Mutu + K3 lanjutan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `mutu`, `ncr`,
`kepatuhan`, `izin`.
- [ ] **Step 2: Tulis breakdown Task 28-N**. Tahap terkecil (7 modul, ~7
halaman) — kemungkinan selesai dalam 2-3 task, bukan sebanyak Tahap 1.

### Task 28: [Tahap 6] Keuangan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `finance`, `cash`,
`gl`, `rekonsiliasi`. CATATAN: `pm-portal/keuangan/page.tsx` SUDAH ADA
(kasbon, restyle hari ini) — cek overlap sebelum menulis breakdown, sama
prinsipnya dengan catatan Task 6 Step 4. Perhatikan juga modul `klaim:*`
(Klaim Perjalanan) yang ditemukan Task 14 — PM cuma py `klaim:setujui`/
`klaim:bayar`, cek apakah itu sudah tercakup inbox approval terpusat
sebelum menganggapnya modul terlewat. **Tambahan dari Task 23**: modul
Kontrak Payung + Expediting + Nota Kredit (`pengadaan-lanjutan.ts`)
DITUNDA ke sini — tinjau BERSAMA `klaim:*` karena py pola wewenang
sebagian sama (PM bisa sebagian aksi, bukan semua) sebelum memutuskan
breakdown Task 29-N.
- [ ] **Step 2: Baca CLAUDE.md §6 baris soal "Uang lewat percakapan"**
dan "audit-klaim-status-atomik.mjs" — modul keuangan py penjaga CI paling
ketat di repo ini (approval satu pintu, status atomik). Breakdown Task
29-N WAJIB menyebut penjaga mana yang relevan per halaman.
- [ ] **Step 3: Tulis breakdown Task 29-N.**

### Task 29: [Tahap 7] Sisa — SDM, Aset, Risiko, Dokumen, Laporan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `sdm`, `assets`,
`risiko`, `documents`, `serah_terima`, `reports`, `clients`.
- [ ] **Step 2: Tulis breakdown Task 30-N** — tahap terakhir, setelah ini
seluruh 32 modul (§1 spec) tercakup dan Portal PM Lengkap selesai.
Breakdown ini WAJIB memeriksa apakah `jd-gantt` visual (ditunda Task 22),
RFQ/Kontrak Payung (ditunda Task 28), dan hub `pm-portal/proyek/[id]`
(masih belum dibangun sampai sini — Task 17 Step 1 & Step 2, dan Task 23
Step 1, mengukur ulang dan TIDAK menemukannya diperlukan; setiap
`tabProyek` CECEP dan procurement ternyata py endpoint standalone)
sekarang benar-benar dibutuhkan, atau tetap ditunda dengan alasan yang
diukur ulang — jangan biarkan utang itu terlupakan begitu tahap-tahap
lain sudah menumpuk lebih banyak entri `tabProyek` yang mungkin
mengubah kalkulasi kebutuhan hub.
- [ ] **Step 3: Verifikasi akhir MENYELURUH** (bukan cuma tahap ini) —
ulangi Task 10 (Verifikasi akhir Tahap 1) tapi untuk SELURUH
`pm-portal/*`: typecheck, semua penjaga CI, seluruh test backend terkait
32 modul, SATU run a11y penuh terakhir mencakup seluruh halaman baru
plan ini. Update `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` kalau ada status
menu yang berubah (CLAUDE.md §8a.4).

---

## Self-Review

**1. Spec coverage:**
- §1 (cakupan 32 modul) → §6 tabel tahap mencakup seluruh 32, dikurangi
  `settings`+`ai` sesuai keputusan ✓
- §2 (navigasi 3-level, kategori) → Task 9 ✓
- §3 (interaksi mobile, swipe, motion) → Task 4 (komponen bersama),
  dipakai eksplisit Task 6-8 dan seterusnya ✓
- §4 (fondasi PWA) → Task 1-3 ✓
- §5 (fondasi teknis: motion token, SwipeableCard, disiplin tipe) →
  Task 4 (komponen), diulang sebagai Global Constraint ✓
- §6 (8 tahap) → Tahap 0 penuh (Task 1-4), Tahap 1 penuh (Task 5-10),
  Tahap 2 penuh (Task 11-16: riset + 5 task kode lengkap), Tahap 3 penuh
  (Task 17-22: riset + 4 task kode lengkap + navigasi), Tahap 4 penuh
  (Task 23-26: riset + 2 task kode lengkap + navigasi), Tahap 5-7
  kerangka riset+breakdown (Task 27-29) ✓
- §7 (di luar scope) → tidak ada task yang menyentuh area itu ✓

**2. Placeholder scan:** Tahap 5-7 (Task 27-29) SENGAJA berbentuk
kerangka riset, bukan kode lengkap — ini BUKAN pelanggaran "No
Placeholders" karena skill writing-plans mengizinkan keputusan yang
genuinely tergantung riset lanjutan untuk didelegasikan sebagai task
riset eksplisit (bukan diisi tebakan kode yang keliru). Tahap 0-4 (Task
1-26) sepenuhnya lengkap tanpa placeholder — kode nyata untuk SEMUA
halaman (bukan prosa deskriptif untuk sebagian), diverifikasi ulang di
fix round 2026-08-21 sesudah review menemukan 6 dari 7 halaman Task
12-15 masih berbentuk deskripsi. `PolisAsuransi`/`HistogramSumberDaya`
(sempat ditandai "PERKIRAAN" di draf pertama) SUDAH dikoreksi ke bentuk
persis `PolisTerhitung`/`HasilSumberDaya` — dibaca langsung dari
`apps/api/src/lib/register-asuransi.ts:73-100` dan
`apps/api/src/lib/cpm.ts:432-457`, bukan lagi tebakan. `NilaiKontrakBerjalan`/
`BandingNilaiKontrak` juga dikoreksi ke `HasilNilai`/`HasilBanding` persis
(`apps/api/src/lib/kontrak.ts:254-361`) — draf pertama salah nama field
(`induk` vs `awal`, `keterangan` vs `sebab`) dan salah arah logika
boolean (`perlu_perhatian` vs `cocok`, MAKNANYA TERBALIK). Seluruh 6
halaman baru + 1 patch diff (jadwal) diverifikasi `tsc --noEmit` NOL
error terhadap `node_modules` project sungguhan, termasuk merge
langsung patch diff Task 15 ke `jadwal/page.tsx` asli (bukan cuma
sintaks terisolasi) — detail command di laporan fix round.

Tahap 3 (Task 17-22, ditulis 2026-08-21) mengikuti disiplin yang sama:
`RingkasEvm`/`RespKurvaS` (Task 21) dibaca PERSIS dari
`apps/api/src/lib/evm-calculation.ts` via `kurva-s.ts:483-514` — bukan
ditebak dari nama fungsi `calculateEVM`. TAPI Task 21 Step 1 secara
EKSPLISIT menandai `ChangeOrderProyek`/`RespCashflowForecast`/
`RespVarians`/`RespContingency` sebagai TEBAKAN yang belum diverifikasi
baris-per-baris (hanya endpoint listnya dikonfirmasi ada di riset
Task 17) — ini KEPUTUSAN SADAR, bukan kelalaian yang lolos: keempat
route file (`change-orders.ts`, potongan `cashflow-forecast` di
`estimate-versions.ts`, potongan `varians` di `cost-control.ts`,
`contingency.ts`) belum dibaca detail saat breakdown ini ditulis, dan
Task 21 Step 1 mewajibkan eksekutor membacanya SEBELUM commit — pola
yang sama dengan cara `PolisAsuransi` dikoreksi di Tahap 2, hanya
peringatannya ditulis DI MUKA alih-alih ditemukan lewat review. Task 19
Step 3 punya catatan serupa: draf `simpanItem()` untuk item lumpsum
SENGAJA dibiarkan salah (tidak mengirim `cost_code_id` yang backend
wajibkan) dengan peringatan eksplisit di bawah kode, karena cara memilih
cost code sederhana untuk mobile belum diriset di sesi ini — mengikuti
prinsip yang sama: menulis peringatan yang jujur lebih baik daripada
kode yang terlihat lengkap tapi diam-diam salah.

**3. Type consistency:** `ambilMerek()` dipakai konsisten Task 1 (3
tempat) dan Task 2 — signature sama. `SwipeableCard` props dipakai
sebagai referensi di Task 6-8 tanpa mendefinisikan ulang. Token
`lib/motion.ts` (`DURASI_MOVE_MS`, `EASING_MOVE`, dst) dipakai persis
sama nama di `SwipeableCard.tsx`.

**4. Urutan eksekusi**: Task 1→2→3→4 (Tahap 0) tidak saling bergantung
KECUALI Task 2 memakai `ambilMerek()` dari Task 1 — urutan di plan ini
sudah benar (1 sebelum 2). Task 5 (riset) sebelum Task 6-8 (implementasi)
— benar. Task 9 (Lainnya/kategori) taruh SESUDAH Task 6-8 karena
`PETA_HREF_PORTAL` di dalamnya mereferensikan halaman yang dibangun
Task 6-8 — kalau dieksekusi lebih dulu, link-nya akan menunjuk halaman
yang belum ada (fallback ke `it.href` web asli tetap aman, jadi urutan
terbalik pun tak fatal, tapi urutan yang ditulis lebih baik). Pola sama
berulang Tahap 2: Task 11 (riset) sebelum Task 12-15 (halaman) — benar,
Task 12-15 sendiri TIDAK saling bergantung satu sama lain (masing-masing
modul independen: Register Kontrak+Asuransi, EOT+LD+Bond, Klaim+Surat,
Jadwal+Keterlambatan tak berbagi state atau tipe yang salah satu tulis
duluan) SELAIN semuanya menulis ke `_bersama/tipe.ts` yang sama — risiko
konflik edit kalau dijalankan paralel di worktree terpisah, aman kalau
sekuensial di satu sesi seperti plan ini. Task 16 (navigasi) WAJIB
SESUDAH Task 12-15 sama alasannya dengan Task 9 (referensi href ke
halaman yang harus sudah ada), dan urutan di plan ini sudah benar.

Pola yang SAMA berulang Tahap 3: Task 17 (riset) sebelum Task 18-21
(halaman) — benar. Task 18-21 punya ketergantungan LEBIH KUAT dari
Tahap 2 (Task 12-15 saling independen; Task 18-21 TIDAK sepenuhnya):
Task 19 (RAB) dan Task 20 (RAP) berbagi data satu arah — RAP dibuat
DARI RAB terkunci, dan `cecep/rap/page.tsx` (Task 20 Step 2) memanggil
`GET /api/v1/estimate-versions` (endpoint yang sama dipakai Task 19
Step 2) sebagai picker "RAB sumber". Urutan di plan ini (19 sebelum 20)
sudah benar untuk arah baca itu, meski keduanya tetap bisa dieksekusi
terpisah tanpa saling memblokir (Task 20 hanya BERGUNA penuh sesudah
Task 19 ada RAB untuk dipilih, tapi halamannya sendiri tak gagal
typecheck maupun runtime kalau daftar RAB kosong — `versiProyek`
menghasilkan array kosong, dropdown kosong, bukan error). Task 18
(Master Data, read-only) tidak bergantung ke Task 19-21 sama sekali —
bisa dieksekusi kapan saja setelah Task 17. Task 21 (Cost Control)
independen dari Task 18-20 secara TIPE (tak memakai satu pun interface
yang didefinisikan Task 18-20), tapi secara PRODUK saling melengkapi
(Kurva-S/EVM membaca `rab_items`+RAP terkunci yang mungkin dibuat Task
19-20 — urutan tulis tak masalah karena keduanya membaca API yang sama,
bukan saling memanggil komponen). Semuanya menulis ke `_bersama/tipe.ts`
yang sama — risiko konflik edit yang sama seperti Tahap 2, aman
sekuensial. Task 22 (navigasi) WAJIB SESUDAH Task 18-21 (referensi href
ke halaman yang harus sudah ada), pola sama Task 16/Task 9.

Pola yang SAMA berulang Tahap 4: Task 23 (riset) sebelum Task 24-25
(halaman) — benar. Task 24 (Procurement) dan Task 25 (Gudang & Material)
py SATU titik sambung nyata: `gudang/stok/page.tsx` (Task 25 Step 4)
dan `gudang/transfer/page.tsx` (Task 25 Step 5) sama-sama memanggil
`GET /api/v1/procurement/stocks` — endpoint yang SAMA dipakai Task 24
untuk menghitung `adaSisaTerima` di detail PO — TAPI tak saling memanggil
komponen atau tipe satu sama lain (masing-masing punya interface
`StokRingkas` sendiri di `_bersama/tipe.ts`, bukan diimpor silang), jadi
keduanya bisa dieksekusi terpisah tanpa saling memblokir. Task 24 Step 5
(tambah `material_request`+`purchase_order` ke `pm-portal/approval/
page.tsx`) TIDAK bergantung pada Task 25 sama sekali. Task 26 (navigasi)
WAJIB SESUDAH Task 24-25 (referensi href ke halaman yang harus sudah
ada), pola sama Task 22/Task 16/Task 9.

⚠️ **Koreksi (review Important-3, 2026-08-21)**: draf pertama baris ini
menyebut `audit-inbox-lengkap.mjs` sebagai alasan TAMBAHAN kenapa Task 26
harus sesudah Task 24 Step 5 — itu KELIRU. Penjaga itu (dibaca langsung,
`apps/api/scripts/audit-inbox-lengkap.mjs`) membandingkan union
`ApprovalEntityType` di `apps/api/src/utils/approval.ts` terhadap katalog
BACKEND `apps/api/src/lib/inbox-approval.ts` — KEDUANYA berkas backend.
`material_request` dan `purchase_order` SUDAH TERDAFTAR di katalog itu
SEBELUM Task 23 dimulai sama sekali (fitur backend lama, bukan hasil
Task 24). Penjaga ini tidak peduli apakah `pm-portal/approval/page.tsx`
(frontend) sudah punya tombol aksi untuk jenis tersebut — ia akan tetap
HIJAU kapan pun dijalankan, tak terkait status Task 24 Step 5 sama
sekali. Urutan Task 26 sesudah Task 24-25 tetap benar, tapi alasannya
HANYA referensi href di `PETA_HREF_PORTAL` yang harus menunjuk halaman
yang sudah ada — bukan penjaga CI mana pun.

**5. Placeholder scan Tahap 4 (Task 23-26):** kode nyata untuk KESEMBILAN
halaman (`procurement/page.tsx` + 2 detail `[id]`, `gudang/page.tsx` +
4 sub-halaman) — bukan sebagian prosa, mengikuti disiplin yang sama
persis dengan Tahap 2-3 sesudah pelajaran Task 11/17. Tipe Procurement
(`MrRingkas`/`MrDetail`/`PoRingkas`/`PoDetail`/dst.) dan Gudang
(`RespGudangIkhtisar`/`GudangLokasi`/`StokRingkas`/`TransferStok`/
`BarisRekonsiliasi`) SEMUANYA diverifikasi baris-per-baris ke route file
nyata saat Task 23 Step 1 (bukan ditebak dari nama) — TIDAK ada
penandaan "TEBAKAN belum diverifikasi" tersisa di Tahap 4, berbeda
dengan Task 21 (Tahap 3) yang secara sadar meninggalkan empat interface
belum diverifikasi karena keterbatasan waktu riset saat itu. Perbedaan
ini disengaja: modul procurement/gudang py lebih sedikit route file
(10 dibanding CECEP+cost-control 12+) dan pola respons LEBIH SERAGAM
(mayoritas `{items: T[]}` datar, tanpa nested union status berlapis
seperti `estimate_items`), jadi verifikasi penuh tercapai dalam anggaran
riset yang sama.
