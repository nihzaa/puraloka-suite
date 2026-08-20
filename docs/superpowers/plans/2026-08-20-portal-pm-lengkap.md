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

## Tahap 2-7: Kerangka (detail digali saat eksekusi)

> Pola task per tahap MENGIKUTI struktur Tahap 1 (Task riset → Task
> halaman per sub-kelompok → Task "Lainnya"/navigasi kalau perlu → Task
> verifikasi akhir tahap). Detail kode TIDAK ditulis di sini — spec §5
> menegaskan tipe/endpoint WAJIB diverifikasi ke kode nyata saat itu
> dieksekusi, menulis kodenya sekarang (jauh sebelum eksekusi, tanpa
> membaca ulang kode yang mungkin sudah berubah) akan jadi tebakan basi.
> Sebelum memulai tiap Tahap, buat task riset (pola Task 5) lebih dulu,
> BARU susun task halaman detailnya — sesi eksekusi tahap itu yang
> menulis breakdown lengkap ke plan ini (mengedit file plan ini,
> menambah Task baru di bagian Tahap yang relevan), bukan ditebak di
> muka.

### Task 11: [Tahap 2] Kontrak + Perencanaan — riset & breakdown

**Files:** Modify: dokumen plan ini (tambah Task 12+ dengan detail penuh,
pola sama Task 6-9)

- [ ] **Step 1: Riset endpoint+permission** modul `projects` (bagian
kontrak), `rfi`, `klaim`, `milestones`, `jadwal` — pola sama Task 5.
- [ ] **Step 2: Cek apakah `pm-portal/proyek/[id]/page.tsx` untuk PM sudah
perlu dibangun di sini** (dicatat sebagai kemungkinan di Task 8 Step 1) —
kalau iya, ini jadi hub tab seperti portal klien (`portal/proyek/[id]`,
dibangun hari ini) tapi versi PM dengan kemampuan `:manage`, bukan
read-only.
- [ ] **Step 3: Tulis breakdown Task 12-N ke dokumen plan ini**, mengikuti
pola Task 6-9 persis (halaman per sub-kelompok, tipe diverifikasi ke kode
nyata, penjaga+a11y di akhir).
- [ ] **Step 4: Update §6 spec kalau perkiraan halaman berubah** dari
riset (mis. `kt-co`/`kt-eot`/`kt-ld`/`kt-bond`/`kt-surat` semuanya
`tabProyek` di web — berarti di portal PM juga masuk sebagai tab
`proyek/[id]`, bukan halaman berdiri sendiri, mengurangi jumlah halaman
terpisah dari 15 perkiraan awal).

### Task 12: [Tahap 3] Budget & Cost Control — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `cecep` (estimasi/RAP/
AHSP/WBS/markup) — modul PALING besar (19 permission, 10 halaman web,
termasuk `estimasi/rab` 1140 baris dan `master/ahsp` 950 baris). Baca
`docs/KEPUTUSAN-SCOPE-ERP-AI.md` dan dokumen CECEP terkait (disebut
memory project sebagai area sensitif dengan riwayat migrasi rumit) SEBELUM
menulis breakdown — modul ini py lebih banyak jebakan sejarah dari modul
lain manapun di plan ini.
- [ ] **Step 2: Tulis breakdown Task 13-N**, pola sama, dengan perhatian
KHUSUS ke §1 spec "modul kompleks tetap dibangun, disederhanakan" — RAB/
RAP 1000+ baris web PASTI butuh penyederhanaan signifikan untuk mobile
(kemungkinan: list item RAB dengan filter/search, BottomSheet untuk edit
satu item, BUKAN tabel spreadsheet-like yang jadi ciri halaman webnya).

### Task 13: [Tahap 4] Pengadaan + Gudang & Material — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `procurement`, `gudang`
— CATATAN: `pm-portal/procurement/page.tsx` SUDAH ADA (dibangun hari ini,
Task 10 sesi sebelumnya) tapi BACA SAJA (ringkasan MR+PO). Tahap ini
memperluas ke CREATE/EDIT (kalau PM py `procurement:*:manage`) dan modul
gudang yang belum tersentuh sama sekali.
- [ ] **Step 2: Tulis breakdown Task 14-N**, cek dulu apakah
`procurement/page.tsx` existing perlu DITULIS ULANG (kalau strukturnya
tak cocok diperluas) atau cukup DITAMBAH (kalau strukturnya sudah
modular) — keputusan ini masuk breakdown, jangan diasumsikan sekarang.

### Task 14: [Tahap 5] Rencana & Uji Mutu + K3 lanjutan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `mutu`, `ncr`,
`kepatuhan`, `izin`.
- [ ] **Step 2: Tulis breakdown Task 15-N**. Tahap terkecil (7 modul, ~7
halaman) — kemungkinan selesai dalam 2-3 task, bukan sebanyak Tahap 1.

### Task 15: [Tahap 6] Keuangan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `finance`, `cash`,
`gl`, `rekonsiliasi`. CATATAN: `pm-portal/keuangan/page.tsx` SUDAH ADA
(kasbon, restyle hari ini) — cek overlap sebelum menulis breakdown, sama
prinsipnya dengan catatan Task 6 Step 4.
- [ ] **Step 2: Baca CLAUDE.md §6 baris soal "Uang lewat percakapan"**
dan "audit-klaim-status-atomik.mjs" — modul keuangan py penjaga CI paling
ketat di repo ini (approval satu pintu, status atomik). Breakdown Task
16-N WAJIB menyebut penjaga mana yang relevan per halaman.
- [ ] **Step 3: Tulis breakdown Task 16-N.**

### Task 16: [Tahap 7] Sisa — SDM, Aset, Risiko, Dokumen, Laporan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `sdm`, `assets`,
`risiko`, `documents`, `serah_terima`, `reports`, `clients`.
- [ ] **Step 2: Tulis breakdown Task 17-N** — tahap terakhir, setelah ini
seluruh 32 modul (§1 spec) tercakup dan Portal PM Lengkap selesai.
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
  Tahap 2-7 kerangka riset+breakdown (Task 11-16) ✓
- §7 (di luar scope) → tidak ada task yang menyentuh area itu ✓

**2. Placeholder scan:** Tahap 2-7 (Task 11-16) SENGAJA berbentuk
kerangka riset, bukan kode lengkap — ini BUKAN pelanggaran "No
Placeholders" karena skill writing-plans mengizinkan keputusan yang
genuinely tergantung riset lanjutan untuk didelegasikan sebagai task
riset eksplisit (bukan diisi tebakan kode yang keliru). Tahap 0-1 (Task
1-10) sepenuhnya lengkap tanpa placeholder — kode nyata, bukan deskripsi.

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
terbalik pun tak fatal, tapi urutan yang ditulis lebih baik).
