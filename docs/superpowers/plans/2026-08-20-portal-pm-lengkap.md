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

- [ ] **Step 1: Aktifkan `g-kontrak` dan `g-jadwal` di `KATEGORI_AKTIF`**

```typescript
const KATEGORI_AKTIF = ["g-subkon", "g-lapangan", "g-kontrak", "g-jadwal"]; // Tahap 1-2
```

- [ ] **Step 2: Isi `PETA_HREF_PORTAL` untuk item yang dibangun Task 12-15**

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

- [ ] **Step 3: Typecheck + lint navigasi**

```bash
cd apps/web && pnpm exec tsc --noEmit
pnpm exec eslint lib/pm-portal-kategori.ts app/pm-portal/kategori/
```

- [ ] **Step 4: Manual click-through** (tak ada test otomatis untuk
navigasi kategori) — buka `/pm-portal/lainnya`, klik kategori Kontrak
dan Perencanaan, konfirmasi seluruh item Task 12-15 punya tautan yang
membuka halaman baru (bukan 404), dan item yang sengaja fallback (`kt-co`
dst) membuka halaman web dashboard dengan benar (bukan link mati).

- [ ] **Step 5: Typecheck seluruh workspace + SEMUA penjaga CI**

```bash
cd apps/web && pnpm exec tsc --noEmit
cd ../api && node scripts/jalankan-semua-penjaga.mjs
```

Tempel ringkasan lengkap, bandingkan terhadap baseline SEBELUM Tahap 2
(dicatat di akhir Task 10 / awal Task 11).

- [ ] **Step 6: Test integrasi terkait**

```bash
cd apps/api && npx vitest run kontrak klaim-kontraktual rfi surat asuransi baseline-jadwal
```

Backend TIDAK diubah Tahap 2 — seluruhnya harus tetap hijau.

- [ ] **Step 7: Audit a11y runtime penuh**

```bash
cd apps/web
export $(grep -E "^LAYAR_(EMAIL|SANDI|BASIS)=" .env.local | tr -d '\r' | xargs)
node scripts/jalankan-a11y-lengkap.mjs
```

Jalankan di background, tempel hasil (jumlah halaman, jumlah
pelanggaran, target 0).

- [ ] **Step 8: Update JOURNAL.md + `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md`**

Catat Tahap 2 selesai, jumlah halaman baru (5: register, asuransi,
eot-ld-bond, klaim, surat, keterlambatan — plus 2 tab tambahan di
jadwal existing), utang tercatat (`kt-co`/Gantt/Kurva-S/EVM/Look-Ahead/
WBS butuh hub `proyek/[id]` PM, method statement mungkin baca-saja
tergantung hasil Step 1 Task 15).

- [ ] **Step 9: Commit dokumentasi**

```bash
git add docs/execution/JOURNAL.md docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md apps/web/lib/pm-portal-kategori.ts apps/web/app/pm-portal/kategori/
git commit -m "feat(pm-portal): navigasi kategori Kontrak+Perencanaan, Tahap 2 selesai"
```

---

## Tahap 3-7: Kerangka (detail digali saat eksekusi)

> Pola task per tahap MENGIKUTI struktur Tahap 1-2 (Task riset → Task
> halaman per sub-kelompok → Task navigasi/verifikasi). Detail kode TIDAK
> ditulis di sini — spec §5 menegaskan tipe/endpoint WAJIB diverifikasi ke
> kode nyata saat itu dieksekusi, menulis kodenya sekarang (jauh sebelum
> eksekusi, tanpa membaca ulang kode yang mungkin sudah berubah) akan
> jadi tebakan basi. Sebelum memulai tiap Tahap, buat task riset (pola
> Task 5/11) lebih dulu, BARU susun task halaman detailnya — sesi
> eksekusi tahap itu yang menulis breakdown lengkap ke plan ini (mengedit
> file plan ini, menambah Task baru di bagian Tahap yang relevan), bukan
> ditebak di muka.

### Task 17: [Tahap 3] Budget & Cost Control — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `cecep` (estimasi/RAP/
AHSP/WBS/markup) — modul PALING besar (19 permission, 10 halaman web,
termasuk `estimasi/rab` 1140 baris dan `master/ahsp` 950 baris). Baca
`docs/KEPUTUSAN-SCOPE-ERP-AI.md` dan dokumen CECEP terkait (disebut
memory project sebagai area sensitif dengan riwayat migrasi rumit) SEBELUM
menulis breakdown — modul ini py lebih banyak jebakan sejarah dari modul
lain manapun di plan ini. Perhatikan juga `jd-wbs`/`jd-gantt`/`jd-kurva-s`/
`jd-evm`/`cc-rab`/`cc-etc`/`cc-bac` yang SEMUANYA `tabProyek` pada
`/proyek/[id]` admin (pola sama Task 13 menemukan `kt-co`/`kt-eot`/
`kt-ld`/`kt-bond`) — modul ini kemungkinan BESAR menjadi pendorong utama
membangun hub `pm-portal/proyek/[id]` penuh (utang yang dicatat Task 16),
bukan lagi bisa ditunda.
- [ ] **Step 2: Tulis breakdown Task 18-N**, pola sama, dengan perhatian
KHUSUS ke §1 spec "modul kompleks tetap dibangun, disederhanakan" — RAB/
RAP 1000+ baris web PASTI butuh penyederhanaan signifikan untuk mobile
(kemungkinan: list item RAB dengan filter/search, BottomSheet untuk edit
satu item, BUKAN tabel spreadsheet-like yang jadi ciri halaman webnya).

### Task 18: [Tahap 4] Pengadaan + Gudang & Material — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `procurement`, `gudang`
— CATATAN: `pm-portal/procurement/page.tsx` SUDAH ADA (dibangun hari ini,
Task 10 sesi sebelumnya) tapi BACA SAJA (ringkasan MR+PO). Tahap ini
memperluas ke CREATE/EDIT (kalau PM py `procurement:*:manage`) dan modul
gudang yang belum tersentuh sama sekali.
- [ ] **Step 2: Tulis breakdown Task 19-N**, cek dulu apakah
`procurement/page.tsx` existing perlu DITULIS ULANG (kalau strukturnya
tak cocok diperluas) atau cukup DITAMBAH (kalau strukturnya sudah
modular) — keputusan ini masuk breakdown, jangan diasumsikan sekarang.

### Task 19: [Tahap 5] Rencana & Uji Mutu + K3 lanjutan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `mutu`, `ncr`,
`kepatuhan`, `izin`.
- [ ] **Step 2: Tulis breakdown Task 20-N**. Tahap terkecil (7 modul, ~7
halaman) — kemungkinan selesai dalam 2-3 task, bukan sebanyak Tahap 1.

### Task 20: [Tahap 6] Keuangan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `finance`, `cash`,
`gl`, `rekonsiliasi`. CATATAN: `pm-portal/keuangan/page.tsx` SUDAH ADA
(kasbon, restyle hari ini) — cek overlap sebelum menulis breakdown, sama
prinsipnya dengan catatan Task 6 Step 4. Perhatikan juga modul `klaim:*`
(Klaim Perjalanan) yang ditemukan Task 14 — PM cuma py `klaim:setujui`/
`klaim:bayar`, cek apakah itu sudah tercakup inbox approval terpusat
sebelum menganggapnya modul terlewat.
- [ ] **Step 2: Baca CLAUDE.md §6 baris soal "Uang lewat percakapan"**
dan "audit-klaim-status-atomik.mjs" — modul keuangan py penjaga CI paling
ketat di repo ini (approval satu pintu, status atomik). Breakdown Task
21-N WAJIB menyebut penjaga mana yang relevan per halaman.
- [ ] **Step 3: Tulis breakdown Task 21-N.**

### Task 21: [Tahap 7] Sisa — SDM, Aset, Risiko, Dokumen, Laporan — riset & breakdown

- [ ] **Step 1: Riset endpoint+permission** modul `sdm`, `assets`,
`risiko`, `documents`, `serah_terima`, `reports`, `clients`.
- [ ] **Step 2: Tulis breakdown Task 22-N** — tahap terakhir, setelah ini
seluruh 32 modul (§1 spec) tercakup dan Portal PM Lengkap selesai. Kalau
Task 17 (CECEP) membangun hub `pm-portal/proyek/[id]`, breakdown ini
WAJIB memeriksa apakah `kt-co`/`jd-gantt`/dst yang ditunda Task 16 bisa
sekarang dipindah dari fallback web ke tab hub tersebut — jangan
biarkan utang itu terlupakan begitu fondasinya sudah ada.
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
  Tahap 2 penuh (Task 11-16: riset + 5 task kode lengkap), Tahap 3-7
  kerangka riset+breakdown (Task 17-21) ✓
- §7 (di luar scope) → tidak ada task yang menyentuh area itu ✓

**2. Placeholder scan:** Tahap 3-7 (Task 17-21) SENGAJA berbentuk
kerangka riset, bukan kode lengkap — ini BUKAN pelanggaran "No
Placeholders" karena skill writing-plans mengizinkan keputusan yang
genuinely tergantung riset lanjutan untuk didelegasikan sebagai task
riset eksplisit (bukan diisi tebakan kode yang keliru). Tahap 0-2 (Task
1-16) sepenuhnya lengkap tanpa placeholder — kode nyata untuk SEMUA
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
