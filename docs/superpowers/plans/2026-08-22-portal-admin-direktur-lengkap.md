# Portal Admin/Direktur Lengkap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal mobile baru (`apps/web/app/admin-portal/*`) menjangkau
seluruh permission role `admin` (227) dan `direktur` (143, subset murni dari
admin) — feature parity penuh dengan dashboard web `(dashboard)/*` (154
halaman sumber), satu codebase digerbangi `hasPermission()` per menu/aksi
(ADR-004), TERMASUK `settings`/`ai` (read-only khusus mobile untuk area
kredensial/konfigurasi AI).

**Architecture:** Tahap 0 membangun fondasi route/layout/gerbang
`admin-portal/*` (PWA sendiri sudah selesai di Portal PM, diwarisi otomatis
sebagai infrastruktur bersama — TIDAK dibangun ulang di sini). Tahap 1-7
menambah modul per kategori navigasi resmi (`lib/peta-menu.ts`, 20 grup),
company-wide by default (bukan project-picker-first seperti PM), dengan
project-picker inline hanya untuk modul yang genuinely per-proyek. Tiap
tahap: riset endpoint+permission dari kode backend nyata dulu, tulis tipe
`_bersama/tipe.ts` diverifikasi ke bentuk respons asli, tulis halaman pakai
`useData`+komponen portal bersama (`PortalShell`, `SwipeableCard`,
`lib/motion.ts` — semua sudah ada dari Portal PM), verifikasi (typecheck,
lint, penjaga CI, a11y) sebelum commit.

**Tech Stack:** Next.js 16 App Router, TypeScript, Fastify API (existing).
PWA/manifest/service-worker/motion-token infrastruktur SUDAH ADA (Portal PM
Tahap 0) — tidak diulang.

**Spec:** `docs/superpowers/specs/2026-08-22-portal-admin-direktur-design.md`

## Global Constraints

- Warna: HANYA token CSS (`var(--token)`) di komponen; hex mentah hanya di
  `lib/warna-merek.ts` (dijaga `uji-token-merek.mjs`).
- Tombol aksi utama: `var(--grad-aksen)`, BUKAN `var(--navy)` padat
  (`uji-tombol-primer-seragam.mjs`, ratchet lantai).
- Padding/gap kartu: token kerapatan (`--pad-kartu`, `--pad-kartu-lega`,
  `--gap-bagian`, `--gap-grid`), bukan angka ditulis manual
  (`kerapatan-ratchet.mjs`). **Catatan dari Portal PM**: lantai
  `kerapatan-ratchet`/`format-ratchet`/`judul-ratchet` sempat dinaikkan
  sebagai keputusan pragmatis gerbang akhir branch itu (lihat
  `docs/execution/QUEUE.yaml` item `FORMAT-RATCHET-PORTAL-MOBILE`,
  `JUDUL-RATCHET-PORTAL-MOBILE`) — JANGAN tambah pelanggaran baru dengan
  asumsi "lantainya sudah longgar", verifikasi lantai TERKINI di awal plan
  ini dan usahakan NOL tambahan baru dari plan ini sendiri.
- Disabled-state teks: swap warna solid, TIDAK PERNAH `opacity`
  (`uji-opacity-teks.mjs`).
- Tiap halaman baru WAJIB `<h1>` sekali.
- Tipe respons API WAJIB diverifikasi ke kode backend nyata (route handler
  + bentuk data) SEBELUM ditulis — bukan ditebak dari nama field.
- **Permission admin/direktur: SELALU pisah per role_id.** Kedua role
  masing-masing punya 2 baris di `roles` (global `company_id IS NULL` +
  tenant-scoped) — pola sama seperti `pm` di Portal PM. JANGAN gabung query
  count tanpa filter role_id (bug class yang pernah terjadi di Task 38
  Portal PM sebelum dikoreksi).
- **`direktur` adalah SUBSET permission murni dari `admin`** (143 vs 227,
  dikonfirmasi live 2026-08-22 — direktur nol permission yang admin tidak
  punya). Artinya: menu/aksi yang admin bisa lihat TAPI direktur tidak,
  cukup digerbangi `hasPermission()` seperti biasa — TIDAK ADA kasus
  sebaliknya (direktur bisa sesuatu yang admin tidak bisa) yang perlu
  ditangani khusus di portal ini. **0 user aktif berperan direktur** saat
  plan ini ditulis — semua path direktur-spesifik butuh verifikasi manual
  via akun uji yang dibuat sengaja, bukan pengamatan pengguna nyata.
- **`middleware.ts` WAJIB diupdate di Task 1** — `ROLE_ALLOWED.admin`
  (`apps/web/middleware.ts:113`) TIDAK memuat `/admin-portal` secara
  default; tanpa update ini, admin akan di-redirect SENYAP ke `/dashboard`
  sebelum layout React sempat jalan (pola cacat yang sama seperti
  ditemukan 2026-08-02 untuk PM dan 2026-08-17 untuk `/master`). `direktur`
  jatuh ke cabang "custom role" (blocklist, bukan allowlist) — pastikan
  `/admin-portal` TIDAK masuk `blockedPrefixes` (baris ~179).
- Area sensitif (`settings:credentials:*`, seluruh modul `ai`): READ-ONLY
  di mobile — lihat spec §1. Tombol write/create/edit/rotate/delete untuk
  dua area ini disembunyikan TOTAL di admin-portal, terlepas dari
  permission API yang dimiliki user. Ini pembatasan UI tambahan DI ATAS
  gerbang permission, bukan pengganti.
- Setelah tiap Tahap selesai: typecheck bersih, lint bersih (warning tak
  bertambah dari baseline sebelum tahap itu), `uji-token-css-ada.mjs`,
  `uji-tombol-primer-seragam.mjs`, `kerapatan-ratchet.mjs`,
  `format-ratchet.mjs`, `audit-halaman-pakai-cache.mjs` — dibandingkan ke
  baseline SEBELUM tahap itu (bukan cuma "exit 0").
- Audit a11y runtime penuh (`node apps/web/scripts/jalankan-a11y-lengkap.mjs`)
  dijalankan SEKALI per Tahap selesai. **Catatan dari Portal PM**: akun uji
  (`LAYAR_EMAIL`/`LAYAR_SANDI`) berperan `admin` — portal PM TIDAK PERNAH
  ter-scan a11y karena akun itu di-redirect keluar dari pm-portal. Untuk
  portal INI justru sebaliknya: akun `admin` yang ada SEKARANG BISA
  men-scan admin-portal (dia memang admin), tapi TIDAK BISA men-scan jalur
  `direktur`-spesifik (0 user aktif berperan itu). Item QUEUE baru perlu
  dibuat untuk cakupan a11y `direktur` kalau ada jalur yang berbeda secara
  material dari admin.
- `git stash` DILARANG di worktree ini (CLAUDE.md §8a.1). Untuk
  membandingkan baseline, pakai `git show HEAD:<path>` atau worktree
  terpisah, bukan stash.
- Backend: boleh MENAMBAH (bukan mengubah/menghapus) kalau memang perlu
  endpoint agregat company-wide baru yang belum ada versi webnya sekalipun
  — TAPI ini butuh justifikasi eksplisit per task, karena default-nya
  portal ini mengikuti endpoint yang SUDAH ADA dashboard web (bukan
  membangun backend baru). Kalau ragu, catat sebagai riset item, jangan
  bangun backend baru tanpa konfirmasi endpoint itu benar-benar tak ada.

---

## Tahap 0: Fondasi Route + Layout + Gerbang

### Task 1: `admin-portal/layout.tsx` + update `middleware.ts` + kategori kosong

**Files:**
- Create: `apps/web/app/admin-portal/layout.tsx`
- Create: `apps/web/lib/admin-portal-kategori.ts`
- Create: `apps/web/app/admin-portal/kategori/[key]/page.tsx`
- Create: `apps/web/app/admin-portal/_bersama/tipe.ts`
- Create: `apps/web/app/admin-portal/page.tsx` (Beranda — placeholder ringkas Tahap 0, diperkaya Tahap 1)
- Modify: `apps/web/middleware.ts` (`ROLE_ALLOWED.admin`, cek `blockedPrefixes` custom-role)

**Interfaces:**
- Consumes: `getStoredUser()` (`apps/web/lib/api.ts`), `hasPermission()`
  + `useIzin()` (`apps/web/lib/use-izin.ts`), `usePengguna()`
  (`apps/web/lib/use-pengguna.ts`), `PortalShell`
  (`apps/web/components/portal/PortalShell.tsx`), `lib/peta-menu.ts` (20
  grup `GrupMenu`).
- Produces: `KATEGORI_AKTIF: string[]` (array kosong di Task ini, diisi
  progresif Tahap 1-7 — pola PERSIS `apps/web/lib/pm-portal-kategori.ts`),
  route `/admin-portal` yang lolos middleware untuk role `admin`.

- [ ] **Step 1: Baca pola rujukan sebelum menulis apa pun**

  Baca SELURUH `apps/web/app/pm-portal/layout.tsx` (67 baris),
  `apps/web/lib/pm-portal-kategori.ts` (168 baris komentar historis —
  pahami MENGAPA array itu ditulis manual, bukan filter permission live),
  `apps/web/app/pm-portal/kategori/[key]/page.tsx`, dan
  `apps/web/middleware.ts` baris 100-190 (ROLE_HOME, ROLE_ALLOWED, cabang
  custom-role). Jangan menulis kode sebelum paham keempatnya.

- [ ] **Step 2: `admin-portal/layout.tsx`**

  Pola gerbang KEBALIKAN dari pm-portal (yang blacklist role lain) —
  di sini WHITELIST admin+direktur:

  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import { useRouter } from "next/navigation";
  import { getStoredUser, type PuralokaUser } from "@/lib/api";
  import PortalShell from "@/components/portal/PortalShell";
  import type { NavItem } from "@/components/portal/PortalShell";
  import {
    LayoutGrid,
    Inbox,
    Building2,
    Wallet,
    Grid3x3,
  } from "lucide-react";

  const NAV_ITEMS: NavItem[] = [
    { href: "/admin-portal", label: "Beranda", icon: LayoutGrid },
    { href: "/admin-portal/inbox", label: "Approval", icon: Inbox },
    { href: "/admin-portal/proyek", label: "Proyek", icon: Building2 },
    { href: "/admin-portal/keuangan", label: "Keuangan", icon: Wallet },
  ];

  export default function AdminPortalLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    const router = useRouter();
    const [user, setUser] = useState<PuralokaUser | null>(null);

    useEffect(() => {
      const u = getStoredUser();
      if (!u) {
        router.replace("/login");
        return;
      }
      if (u.role !== "admin" && u.role !== "direktur") {
        // Role lain (pm, mandor, client) TIDAK dikenal portal ini —
        // pulangkan ke dashboard umum, biarkan middleware/role masing2
        // yang menentukan tujuan akhir mereka.
        router.replace("/dashboard");
        return;
      }
      setUser(u);
    }, [router]);

    if (!user) return null;

    return (
      <PortalShell
        user={user}
        portalLabel="Portal Admin"
        navItems={NAV_ITEMS}
        lainnyaHref="/admin-portal/kategori"
        onLogout={() => {
          localStorage.removeItem("puraloka_token");
          localStorage.removeItem("puraloka_user");
          localStorage.removeItem("puraloka_permissions");
          router.replace("/login");
        }}
      >
        {children}
      </PortalShell>
    );
  }
  ```

  ⚠ **Verifikasi props `PortalShell` PERSIS** sebelum commit — baca ulang
  `PortalShell.tsx` untuk signature `NavItem` yang benar (field `icon` bisa
  jadi tipe komponen berbeda dari asumsi di atas, cek nyata). Kode di atas
  adalah KERANGKA, bukan final — sesuaikan ke signature nyata yang dibaca
  Step 1.

- [ ] **Step 3: `lib/admin-portal-kategori.ts`**

  ```ts
  // Kategori yang SUDAH punya halaman portal admin dibangun.
  // Diisi manual satu-per-satu tiap Tahap selesai membangun grup itu —
  // BUKAN dihitung dari permission live (lib/peta-menu.ts tidak
  // menyimpan field permission per grup). Pola identik
  // pm-portal-kategori.ts, jangan didesain ulang.
  export const KATEGORI_AKTIF: string[] = [];
  ```

- [ ] **Step 4: `admin-portal/kategori/[key]/page.tsx`**

  Salin struktur PERSIS dari `pm-portal/kategori/[key]/page.tsx` — ganti
  referensi `KATEGORI_AKTIF`/`PETA_HREF_PORTAL` ke versi
  `admin-portal-kategori.ts` yang baru dibuat Step 3. `PETA_HREF_PORTAL`
  mulai sebagai objek kosong `{}` (ditambah entri progresif tiap Tahap,
  sama seperti `KATEGORI_AKTIF`).

- [ ] **Step 5: `admin-portal/_bersama/tipe.ts`**

  File kosong dengan komentar header saja untuk Tahap 0 (pola sama
  `pm-portal/_bersama/tipe.ts` — tipe ditambah progresif per Tahap,
  diverifikasi ke bentuk respons API nyata SEBELUM ditulis):

  ```ts
  // Tipe bersama Portal Admin/Direktur — SATU interface per bentuk respons
  // API nyata, diverifikasi ke kode backend (route handler + SELECT/
  // interface aslinya) SEBELUM ditulis. Jangan menebak dari nama field.
  // Diisi progresif per Tahap (lihat docs/superpowers/plans/
  // 2026-08-22-portal-admin-direktur-lengkap.md).
  export {};
  ```

- [ ] **Step 6: `admin-portal/page.tsx` (Beranda placeholder)**

  Halaman minimal — `<h1>Portal Admin</h1>` + pesan sementara "Modul akan
  ditambah bertahap" + tautan ke `/admin-portal/kategori`. Diperkaya jadi
  dashboard eksekutif sungguhan di Tahap 1 (lihat Task 2). Jangan
  membangun konten dashboard di Task ini — murni bukti route+layout
  berfungsi.

- [ ] **Step 7: Update `middleware.ts` — WAJIB, bukan opsional**

  Baca `apps/web/middleware.ts` baris 100-190 dulu untuk bentuk PERSIS
  `ROLE_ALLOWED`/`ROLE_HOME`/cabang custom-role sebelum mengedit (jangan
  tebak struktur array/objeknya). Tambahkan `/admin-portal` ke
  `ROLE_ALLOWED.admin`. Untuk `direktur` — putuskan berdasar bentuk kode
  nyata yang dibaca:
  - Kalau `direktur` sudah lolos lewat cabang "custom role" (blocklist,
    bukan allowlist) dan `/admin-portal` TIDAK ada di `blockedPrefixes`,
    tidak perlu entri tambahan — direktur otomatis bisa akses.
  - Kalau ternyata ada allowlist eksplisit untuk role tertentu yang
    berlaku juga untuk direktur, tambahkan `/admin-portal` ke situ juga.
  - Verifikasi via manual test: cek `blockedPrefixes` TIDAK memuat
    `/admin-portal` sebelum lanjut ke Step 8.

- [ ] **Step 8: Verifikasi manual routing (BUKAN otomatis, tak ada test middleware)**

  Karena tak ada test otomatis untuk middleware, verifikasi manual WAJIB:
  baca ulang hasil `ROLE_ALLOWED.admin`/`blockedPrefixes` sesudah edit,
  pastikan `/admin-portal` benar-benar lolos untuk kedua role tanpa
  redirect. Kalau API/web hidup, uji langsung dengan curl/browser
  memakai akun admin — cek TIDAK ter-redirect ke `/dashboard`.

- [ ] **Step 9: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && pnpm build   # pastikan admin-portal ter-generate, 0 error
  ```

  Tempel ringkasan run sungguhan (CHARTER §7 — dilarang klaim tanpa bukti).

- [ ] **Step 10: Commit**

  ```bash
  git add apps/web/app/admin-portal apps/web/lib/admin-portal-kategori.ts apps/web/middleware.ts
  git commit -m "feat(admin-portal): fondasi route+layout+gerbang — Tahap 0"
  ```

### Task 2: Riset & breakdown — Approval Inbox + Dashboard Eksekutif (Tahap 1)

**Files:**
- Modify (dokumen ini): tambah Task 3+ dengan breakdown lengkap Tahap 1
  berdasar riset task ini.

**Interfaces:**
- Consumes: hasil Task 1 (shell+layout+gerbang admin-portal berfungsi).
- Produces: daftar Task konkret bernomor untuk Tahap 1, ditulis LANGSUNG
  ke dokumen plan ini (pola sama Portal PM Task 11/17/23/27/31/38 —
  riset&breakdown menulis task berikutnya, bukan spec terpisah).

- [ ] **Step 1: Baca dashboard eksekutif & approval-inbox WEB yang sudah ada**

  Baca penuh `apps/web/app/(dashboard)/dashboard/page.tsx` (atau lokasi
  sebenarnya — cek `lib/peta-menu.ts` untuk href persis "Dashboard
  Eksekutif") dan `apps/web/app/(dashboard)/approval-inbox/page.tsx`.
  Catat: endpoint API apa yang dipanggil, bentuk data agregat (company-wide
  vs per-proyek), field apa yang paling sering dibaca cepat di HP (KPI
  ringkas: total proyek aktif, kas, piutang jatuh tempo, approval
  menunggu).

- [ ] **Step 2: Baca endpoint backend untuk kedua modul**

  Cek `apps/api/src/routes/v1/` untuk endpoint dashboard/KPI eksekutif
  (kemungkinan `dashboard.ts` atau serupa) dan approval-inbox
  (`approval-inbox.ts` atau sejenis, lihat pola `utils/approval.ts` yang
  jadi satu-pintu keputusan approval — Portal PM sudah pakai pola ini,
  RUJUK `apps/web/app/pm-portal/*/approval` kalau ada, jangan bangun ulang
  logic approval dari nol). Bentuk field PERSIS, permission gate PERSIS
  (`requirePermission` apa untuk baca vs putuskan).

- [ ] **Step 3: Live query permission admin+direktur untuk kedua modul**

  Pisah per role_id (2 baris masing-masing). Konfirmasi apakah direktur
  (0 user aktif) tetap dapat menu ini kalau permission-nya ada (ingat:
  direktur SUBSET admin, jadi kalau admin bisa approve sesuatu dan
  direktur juga punya permission yang sama, tombolnya sama-sama render —
  TIDAK perlu exclude direktur secara eksplisit di mana pun kecuali
  areanya benar admin-only seperti `settings:credentials`).

- [ ] **Step 4: Tulis Task 3+ ke dokumen ini**

  Berdasar riset Step 1-3, tulis task-task konkret dengan kode LENGKAP
  (bukan deskripsi) untuk: (a) Dashboard Eksekutif — KPI ringkas
  company-wide sebagai Beranda admin-portal yang sesungguhnya (mengganti
  placeholder Task 1 Step 6); (b) Approval Inbox — list+swipe
  approve/reject (pakai `SwipeableCard` yang sudah ada dari Portal PM);
  (c) Navigasi kategori Tahap 1 + verifikasi akhir tahap. Ikuti pola
  penomoran Portal PM: task riset bernomor genap dengan task
  implementasi langsung sesudahnya di dokumen yang sama.

- [ ] **Step 5: Commit breakdown**

  ```bash
  git add docs/superpowers/plans/2026-08-22-portal-admin-direktur-lengkap.md
  git commit -m "docs(plan): breakdown Tahap 1 — Approval Inbox + Dashboard Eksekutif"
  ```

---

## Tahap 2-7: Belum di-breakdown

Mengikuti pola Portal PM: setiap Tahap (2: Proyek+Kontrak+Jadwal, 3:
Keuangan+Akuntansi, 4: Procurement+Gudang+Aset, 5: Mutu/K3+Risiko+Dokumen+
Kepatuhan, 6: SDM+Klien+Tender, 7: Sistem/Settings/AI [read-only]+Audit+
Users/Roles+Master+sisa) dimulai dengan SATU task "riset & breakdown" yang
menulis task-task konkret ke dokumen ini begitu tahap sebelumnya selesai —
BUKAN ditulis sekaligus di awal (perkiraan skala terlalu tak pasti untuk
menulis kode konkret sebelum tahap sebelumnya membuktikan pola yang
sesungguhnya berlaku, persis alasan yang sama kenapa Portal PM
membengkak 32→78 halaman).

**Final**: task terakhir plan ini adalah verifikasi menyeluruh SELURUH
portal admin/direktur (typecheck, build, SEMUA penjaga CI, test backend
terkait, a11y penuh untuk admin, catatan eksplisit cakupan direktur yang
tak bisa diverifikasi karena 0 user aktif, update
`docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md`) — pola identik Portal PM Task 45.
