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
`useData`+komponen portal bersama (`PortalShell`, `KpiCard`, `BottomSheet`,
`lib/motion.ts` — semua sudah ada dari Portal PM), verifikasi (typecheck,
lint, penjaga CI, a11y) sebelum commit.

⚠ **Koreksi (Task 2, riset live):** `SwipeableCard` yang disebut di sini
saat ditulis Task 1 TERNYATA dead code untuk approval — Portal PM
(`pm-portal/approval/page.tsx`) TIDAK memakainya sama sekali untuk approve/
reject, dan memilih pola tap→`BottomSheet` dengan tombol eksplisit karena
keputusan approval punya syarat (alasan wajib saat tolak, deteksi SoD,
`pending_next_level`, guard `detailGagal`) yang tak cocok gestur sekali-
swipe tanpa konfirmasi. `SwipeableCard` tetap ADA dan valid untuk aksi lain
tanpa syarat/konfirmasi (dipakai tempat lain di Portal PM, mis. punch-list)
— jangan asumsikan ia komponen approval bersama di tahap-tahap berikutnya
plan ini; lihat detail Task 2 di bawah.

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

### Hasil riset Task 2 (2026-08-22) — ringkasan sebelum Task 3/4/5

**Dashboard Eksekutif** — `GET /api/v1/dashboard?period=…` (`apps/api/src/
routes/v1/dashboard.ts:38`) TIDAK punya `requirePermission` sendiri — hanya
`authenticate`. Company-wide penuh lewat `request.db` (sadar tenant, T4c).
Field KPI yang dipakai beranda web: `kpis.active_projects`,
`kpis.total_contract_value`, `kpis.invoice_outstanding`,
`kpis.net_cash_estimate`, `kpis.kasbon_active_total`, plus `alerts.
{kasbon_pending,invoice_overdue,milestone_late}`. Ada juga
`GET /api/v1/dashboard/deret` (riwayat 8 bulan per metrik, untuk sparkline)
dan `GET /api/v1/dashboard/fokus` (ringkas "berapa lewat tenggat vs
menunggu" — juga tanpa `requirePermission`, company-wide). **Tak perlu
endpoint baru** — ketiganya sudah company-wide dan cukup untuk KPI ringkas
admin-portal.

**Approval Inbox** — `GET /api/v1/approval/inbox`
(`apps/api/src/routes/v1/approval-inbox.ts`) juga TIDAK punya
`requirePermission` sendiri; siapa boleh melihat baris jenis tertentu
ditentukan `canParticipateInChain()` (`apps/api/src/utils/approval.ts:193`)
per jenis — kalau user (lewat role-nya) memegang salah satu
`required_permission` dari langkah rantai jenis itu, baris jenis itu
tampil. `admin`/`direktur` BUKAN role `pm`, jadi `pmProjectIds === null` →
tidak ada penyempitan proyek — inbox admin/direktur sungguh company-wide
(beda dari PM yang disaring `project.pm_id`).

⚠ **TEMUAN PENTING — inbox TIDAK punya approve/reject inline.** Halaman web
`(dashboard)/approval-inbox/page.tsx` HANYA me-list + link keluar
(`jalur_ui`) ke halaman MODUL (`/mandor/kasbon`, `/kas`,
`/procurement/permintaan`, dst — bukan halaman detail per-item). Keputusan
approve/reject sesungguhnya terjadi di endpoint MASING-MASING entity type
lewat rute berbeda-beda (13 jenis terdaftar di `SUMBER_INBOX`
(`apps/api/src/lib/inbox-approval.ts`), masing-masing method HTTP + body +
field nominal/judul yang BERBEDA — tak ada satu endpoint generik "putuskan
entitas apa pun"). **Portal PM SUDAH memecahkan ini** di
`apps/web/app/pm-portal/approval/page.tsx`: bottom-sheet tap-to-open (BUKAN
swipe) dengan katalog `AKSI: Record<string, KonfigAksi>` berisi
`approveUrl`/`approveBody`/`rejectUrl`/`rejectBody` PER JENIS, plus
detail-fetch per jenis (sebagian jenis punya `GET /:id` sendiri — MR/PO/RMP
— sebagian tidak dan harus dicocokkan dari list, sebagian lagi tak punya
detail-fetch sama sekali dan tampil generik dari `BarisInbox`). **Pola ini
WAJIB disalin, bukan ditulis ulang** — 7 dari 13 jenis (`kasbon`,
`submittal`, `material_request`, `purchase_order`, `rencana_mutu`,
`klaim_perjalanan`, `project_expense`) sudah punya `KonfigAksi` teruji di
sana; Task 4 menyalinnya dan menambah field bila perlu, BUKAN meriset ulang
dari nol.

⚠ **`SwipeableCard` TIDAK dipakai PM Portal untuk approval inbox sama
sekali** — kontradiksi dengan asumsi brief. PM memilih tap→BottomSheet
karena keputusan approve/reject punya SYARAT (alasan wajib saat tolak,
deteksi `pending_next_level`, deteksi `saya_pengajunya`/SoD, deteksi
`detailGagal`) yang tak cocok dengan gestur sekali-swipe tanpa konfirmasi —
menyetujui pencairan uang lewat swipe tanpa melihat nama pemohon adalah
risiko yang sama persis yang dicegah `detailGagal` guard di PM Portal.
Task 4 mengikuti pola PM (tap→BottomSheet), BUKAN memaksakan
`SwipeableCard` — swipe hanya cocok untuk aksi tanpa syarat/konfirmasi
(bandingkan pola aslinya di punch-list PM Portal, bukan approval).

**Permission admin vs direktur — LIVE query 2026-08-22** (pisah per
role_id, `roles.name IN ('admin','direktur')`, masing-masing 2 baris
global+tenant, company uji `48befb54-…d8a0`):

```
admin    (global company_id=null):        227 permission
admin    (tenant company_id=48befb54…):    227 permission
direktur (global company_id=null):         143 permission
direktur (tenant company_id=48befb54…):    143 permission
```

`required_permission` tiap langkah, per `entity_type` (13 jenis, semua SATU
langkah pada data uji ini) — skema PERSIS: `entity_type` hidup di
`approval_chains`, `required_permission` di `approval_steps`, dijoin lewat
`approval_steps.chain_id = approval_chains.id` (bukan `entity_type` langsung
di `approval_steps`). Dibanding kepemilikan admin/direktur:

| entity_type | required_permission | admin | direktur |
|---|---|---|---|
| kasbon | `mandor:kasbon:approve` | ✅ | ✅ |
| material_request | `procurement:mr:manage` | ✅ | ✅ |
| purchase_order | `procurement:po:manage` | ✅ | ✅ |
| opname_bersama | `opname:verifikasi` | ✅ | ✅ |
| back_charge | `backcharge:setujui` | ✅ | ✅ |
| klaim_perjalanan | `klaim:setujui` | ✅ | ✅ |
| cuti_karyawan | `sdm:cuti:approve` | ✅ | ✅ |
| project_expense | `cash:expense:approve` | ✅ | ✅ |
| submittal | `submittal:decide` | ✅ | ✅ |
| rencana_mutu | `mutu:rmp:approve` | ✅ | ✅ |
| estimate_version | `cecep:estimate:approve` | ✅ | ❌ |
| change_order | `change_order:approve` | ✅ | ❌ |
| lessons_learned | `cecep:lessons:approve` | ✅ | ❌ |

⚠ **Koreksi atas asumsi "direktur subset murni, tak pernah perlu exclude
eksplisit" dari Global Constraints plan ini — BENAR untuk gerbang
`hasPermission()` UI, TAPI perlu dicatat presisi untuk approval:** direktur
TIDAK memegang 3 dari 13 `required_permission` approval (`estimate_version`,
`change_order`, `lessons_learned`). Ini BUKAN kontradiksi terhadap "direktur
subset murni admin" (143 vs 227 tetap benar, direktur nol permission yang
admin tidak punya) — konsekuensinya justru SEARAH: karena rantai
ketiganya cuma 1 langkah dan syaratnya persis permission yang direktur tak
punya, `canParticipateInChain()` mengembalikan `false` untuk direktur pada
ketiga jenis itu, dan baris jenis itu **otomatis tak pernah muncul** di
`GET /api/v1/approval/inbox` milik user direktur — inbox-nya company-wide
tapi jenisnya lebih sedikit dari admin. Tak perlu exclude manual di
frontend; ini sepenuhnya ditentukan server. Task 4 TIDAK perlu menyaring
apa pun berdasar role — `AKSI` di klien tetap sama untuk admin/direktur,
bedanya murni apa yang SERVER kirim di `data[]`.

**Komponen portal yang dipakai ulang** (dari Portal PM, semua generik/tanpa
asumsi role): `KpiCard`+`MiniChart` (`components/portal/{KpiCard,MiniChart}.tsx`)
untuk kartu KPI beranda, `BottomSheet`/`StatusBadge`/`EmptyState`/
`SkeletonCard` untuk approval inbox. `formatRupiahSingkat()`
(`apps/web/lib/format.ts:105`) sudah ada untuk notasi ringkas "Rp 1,25 jt" —
dipakai di kartu KPI, bukan menulis ulang `fmtShort` seperti di
`(dashboard)/dashboard/page.tsx`.

---

## Tahap 1 lanjutan: Task 3-5

### Task 3: Dashboard Eksekutif — Beranda admin-portal sesungguhnya

**Files:**
- Modify: `apps/web/app/admin-portal/page.tsx` (ganti placeholder Task 1
  Step 6 dengan KPI company-wide sungguhan)
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah tipe respons
  `/api/v1/dashboard`, `/api/v1/dashboard/deret`, `/api/v1/dashboard/fokus`
  — HANYA field yang benar-benar dipakai halaman ini, disalin dari
  interface nyata `apps/api/src/routes/v1/dashboard.ts`, bukan seluruh
  bentuk respons)

**Interfaces:**
- Consumes: `GET /api/v1/dashboard?period=last_30_days` (default portal:
  30 hari, HP dibuka untuk cek cepat — beda dari default web `last_3_
  months` yang dibuka di desktop untuk analisis), `GET /api/v1/dashboard/
  deret` (sparkline opsional), `GET /api/v1/dashboard/fokus` (badge
  "X lewat tenggat" bila > 0).
- Produces: Beranda admin-portal dengan KPI grid 2 kolom (pola
  `pm-portal/page.tsx`), pintasan ke Approval Inbox bila ada yang menunggu.

- [ ] **Step 1: Baca ulang bentuk respons PERSIS sebelum menulis tipe**

  Baca ulang `apps/api/src/routes/v1/dashboard.ts` baris 253-291 (bentuk
  `kpis`/`alerts` yang dikembalikan `GET /api/v1/dashboard`) dan baris
  546-556 (bentuk `deret` dari `GET /api/v1/dashboard/deret`). Field
  `kpis.active_projects`, `total_contract_value`, `invoice_outstanding`,
  `net_cash_estimate`, `kasbon_active_total` semuanya `number` (dihitung
  server dari `Number(...)`, bukan string mentah dari Postgres). Field
  `alerts.kasbon_pending`/`invoice_overdue`/`milestone_late` juga `number`.

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  ```ts
  // Tipe bersama Portal Admin/Direktur — SATU interface per bentuk respons
  // API nyata, diverifikasi ke kode backend (route handler + SELECT/
  // interface aslinya) SEBELUM ditulis. Jangan menebak dari nama field.
  // Diisi progresif per Tahap (lihat docs/superpowers/plans/
  // 2026-08-22-portal-admin-direktur-lengkap.md).

  /**
   * KPI ringkas dari `GET /api/v1/dashboard` — HANYA field yang dipakai
   * Beranda admin-portal (bentuk lengkap di
   * `apps/api/src/routes/v1/dashboard.ts:253-291` jauh lebih besar; field
   * lain seperti `active_progress`/`outstanding_invoices`/`pending_kasbons`
   * TIDAK diambil di sini — Tahap 2 (Proyek) dan Tahap 3 (Keuangan) yang
   * akan menambah tipe untuk field itu saat modulnya dibangun).
   */
  export interface DashboardEksekutif {
    kpis: {
      active_projects: number;
      total_contract_value: number;
      invoice_outstanding: number;
      income_this_month: number;
      kasbon_active_total: number;
      net_cash_estimate: number;
    };
    alerts: {
      kasbon_pending: number;
      invoice_overdue: number;
      milestone_late: number;
    };
  }

  /** `GET /api/v1/dashboard/fokus` — ringkasan lintas-modul (dashboard.ts:417-431). */
  export interface DashboardFokus {
    lewat: number;
    menunggu: number;
    tautan: string;
    rincian: {
      invoice_jatuh_tempo: number;
      klaim_lewat_batas: number;
      instruksi_belum_dikonfirmasi: number;
      kasbon_menunggu: number;
      penagihan_menunggu: number;
    };
  }

  /**
   * `GET /api/v1/dashboard/deret` — riwayat BULANAN per metrik untuk
   * sparkline KPI (`apps/api/src/routes/v1/dashboard.ts:546-556`). Tiap
   * array bisa LEBIH PENDEK dari `bulan` — bulan kosong di UJUNG dibuang
   * server (`rataUrut()`, dashboard.ts:495-504), jadi array `[]` berarti
   * "belum ada riwayat", BUKAN error. Jangan asumsikan panjang tetap 8.
   */
  export interface DashboardDeret {
    bulan: number;
    mulai: string;
    deret: {
      proyek_aktif: number[];
      nilai_kontrak: number[];
      invoice_belum_lunas: number[];
      kas_masuk: number[];
      kasbon: number[];
    };
  }
  ```

  ⚠ Tempatkan setelah baris `export {};` yang ada — HAPUS baris `export {}`
  itu begitu ada isi nyata (dulu placeholder Tahap 0 supaya file bukan
  modul kosong).

- [ ] **Step 3: `admin-portal/page.tsx` — KPI grid + pintasan approval**

  Pola KpiCard 2 kolom seperti `pm-portal/page.tsx`, TAPI 4 kartu (bukan 2 —
  admin butuh lebih banyak angka company-wide sekaligus: proyek aktif, nilai
  kontrak, invoice belum lunas, kasbon beredar):

  ```tsx
  "use client";

  import Link from "next/link";
  import { getStoredUser } from "@/lib/api";
  import { useData } from "@/lib/data-cache";
  import { formatRupiahSingkat } from "@/lib/format";
  import { namaSapaan } from "@/lib/nama-sapaan";
  import {
    Inbox, Building2, TrendingUp, FileText, Coins,
    ChevronRight, AlertTriangle,
  } from "lucide-react";
  import KpiCard from "@/components/portal/KpiCard";
  import SkeletonCard from "@/components/portal/SkeletonCard";
  import type { DashboardEksekutif, DashboardFokus, DashboardDeret, ResponsInbox, GalatApi } from "./_bersama/tipe";
  import { pesanGalat } from "./_bersama/tipe";

  export default function AdminBerandaPage() {
    const user = getStoredUser();

    // Default 30 hari — portal dibuka di HP untuk cek cepat, bukan analisis
    // mendalam (beda dari default web `last_3_months`, dibuka di desktop).
    const { data, memuat, galat } =
      useData<DashboardEksekutif>("/api/v1/dashboard?period=last_30_days");
    const { data: fokus } = useData<DashboardFokus>("/api/v1/dashboard/fokus");
    const { data: inbox } = useData<ResponsInbox>("/api/v1/approval/inbox");
    // Sparkline KPI — pelengkap, kegagalannya TAK BOLEH menjatuhkan KPI utama
    // (pola sama `(dashboard)/dashboard/page.tsx`, `galat` dari hook ini
    // sengaja tak dibaca). Array bisa `[]` — KpiCard sudah menangani panjang
    // < 2 dengan tak merender sparkline (lihat `KpiCard.tsx` syarat
    // `sparklineData.length > 1`).
    const { data: deret } = useData<DashboardDeret>("/api/v1/dashboard/deret");

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Halo, {namaSapaan(user?.name)}
        </h1>

        {!memuat && galat && (
          <div
            role="alert"
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: 14,
              borderRadius: "var(--portal-radius-card)", background: "var(--danger-bg)",
              border: "1px solid var(--danger-border)",
            }}
          >
            <AlertTriangle size={18} color="var(--on-danger-bg)" aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--on-danger-bg)" }}>
              {pesanGalat(galat as GalatApi, "Gagal memuat ringkasan. Pastikan API server berjalan.")}
            </span>
          </div>
        )}

        {memuat ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <SkeletonCard tinggi={110} />
            <SkeletonCard tinggi={110} />
            <SkeletonCard tinggi={110} />
            <SkeletonCard tinggi={110} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <KpiCard
              label="Proyek Aktif"
              nilai={String(data?.kpis.active_projects ?? 0)}
              icon={Building2}
              sparklineData={deret?.deret.proyek_aktif}
            />
            <KpiCard
              label="Nilai Kontrak"
              nilai={formatRupiahSingkat(data?.kpis.total_contract_value ?? 0)}
              icon={TrendingUp}
              sparklineData={deret?.deret.nilai_kontrak}
            />
            <KpiCard
              label="Invoice Belum Lunas"
              nilai={formatRupiahSingkat(data?.kpis.invoice_outstanding ?? 0)}
              icon={FileText}
              sparklineData={deret?.deret.invoice_belum_lunas}
            />
            <KpiCard
              label="Kasbon Beredar"
              nilai={formatRupiahSingkat(data?.kpis.kasbon_active_total ?? 0)}
              icon={Coins}
              sparklineData={deret?.deret.kasbon}
            />
          </div>
        )}

        {!memuat && (inbox?.total ?? 0) > 0 && (
          <Link
            href="/admin-portal/inbox"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              padding: 16, borderRadius: "var(--portal-radius-card)", background: "var(--warning-bg)",
              border: "1px solid var(--warning-border)", textDecoration: "none", minHeight: 44,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Inbox size={20} color="var(--on-warning-bg)" aria-hidden="true" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)" }}>
                {inbox?.total} pengajuan menunggu keputusan Anda
              </span>
            </div>
            <ChevronRight size={18} color="var(--on-warning-bg)" aria-hidden="true" />
          </Link>
        )}

        {!memuat && (fokus?.lewat ?? 0) > 0 && (
          <Link
            href={fokus!.tautan}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              padding: 16, borderRadius: "var(--portal-radius-card)", background: "var(--danger-bg)",
              border: "1px solid var(--danger-border)", textDecoration: "none", minHeight: 44,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={20} color="var(--on-danger-bg)" aria-hidden="true" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-danger-bg)" }}>
                {fokus!.lewat} hal sudah lewat tenggat
              </span>
            </div>
            <ChevronRight size={18} color="var(--on-danger-bg)" aria-hidden="true" />
          </Link>
        )}
      </div>
    );
  }
  ```

  ⚠ **Verifikasi props `KpiCard`/`SkeletonCard` PERSIS** sebelum commit —
  kerangka di atas ditulis dari baca `components/portal/KpiCard.tsx` nyata
  (Step 1 riset task ini), tapi selalu cek ulang signature sebelum commit,
  bukan asumsi dari sini.

  ⚠ **`pesanGalat`/`GalatApi` HARUS didefinisikan di `_bersama/tipe.ts`**
  (pola sama pm-portal — lihat `apps/web/app/pm-portal/_bersama/tipe.ts:
  3885-3891`, DIDUPLIKASI per portal, bukan diimpor lintas portal). Task ini
  menambahkannya ke `admin-portal/_bersama/tipe.ts` sekali di Step 2 kalau
  belum ada dari Task 1.

- [ ] **Step 4: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 5: Verifikasi manual dengan API hidup (kalau memungkinkan)**

  ```bash
  UJI_EMAIL=… UJI_SANDI=… curl -s http://127.0.0.1:<port-terukur>/api/v1/dashboard?period=last_30_days
  ```

  Cocokkan bentuk respons ke tipe yang ditulis Step 2 — pastikan tak ada
  field yang berbeda dari yang diasumsikan.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/app/admin-portal/page.tsx apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): dashboard eksekutif company-wide — Tahap 1"
  ```

### Task 4: Approval Inbox — list + bottom-sheet putuskan (pola Portal PM)

**Files:**
- Create: `apps/web/app/admin-portal/inbox/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah `BarisInbox`/
  `ResponsInbox` — SAMA PERSIS bentuknya dengan pm-portal, disalin dari
  `apps/api/src/routes/v1/approval-inbox.ts`, BUKAN diimpor lintas portal —
  ikuti pola duplikasi yang sudah dipakai 3 portal lain)

**Interfaces:**
- Consumes: `GET /api/v1/approval/inbox` (company-wide untuk admin/direktur
  — TIDAK disaring `pm_id` karena role bukan `pm`), lalu endpoint keputusan
  PER JENIS (13 kemungkinan, tabel `AKSI` di bawah menyalin 7 yang sudah
  diverifikasi PM Portal + TIDAK menambah jenis baru yang belum
  diverifikasi — jenis lain tampil sebagai kartu "lihat detail" seperti pola
  PM untuk jenis yang belum punya `AKSI`).
- Produces: Halaman list approval + BottomSheet putuskan, `/admin-portal/
  inbox` masuk `NAV_ITEMS` Task 1 (sudah ada di kerangka Task 1 Step 2 —
  `{ href: "/admin-portal/inbox", label: "Approval", icon: Inbox }`).

⚠ **TIDAK memakai `SwipeableCard`** (lihat temuan riset Task 2 di atas) —
mengikuti pola PM Portal APA ADANYA: tap kartu → BottomSheet → tombol
Setujui/Tolak eksplisit. Alasan sama persis: approve/reject di sini
menyentuh uang dan/atau berjenjang, dan swipe tanpa konfirmasi menghapus
kesempatan melihat detail sebelum memutuskan (guard `detailGagal`
membutuhkan bentuk tap-buka-sheet, bukan gestur sekali jalan).

- [ ] **Step 1: Salin tipe `BarisInbox`/`ResponsInbox` ke `_bersama/tipe.ts`**

  Identik `apps/web/app/pm-portal/_bersama/tipe.ts:17-41` (sudah
  diverifikasi field-nya cocok dengan `apps/api/src/routes/v1/
  approval-inbox.ts` interface `BarisInbox`) — salin apa adanya, JANGAN
  menulis ulang dari nol:

  ```ts
  /**
   * Satu baris di approval inbox — bentuk dari `GET /api/v1/approval/inbox`
   * (`apps/api/src/routes/v1/approval-inbox.ts`, interface `BarisInbox`).
   * Identik salinan pm-portal (`_bersama/tipe.ts:17-33`) — portal ini
   * memakai endpoint yang SAMA PERSIS, company-wide (bukan disaring pm_id
   * karena admin/direktur bukan role `pm`).
   */
  export interface BarisInbox {
    jenis: string;
    label: string;
    id: string;
    judul: string | null;
    nomor: string | null;
    nominal: number | null;
    pengaju_id: string | null;
    dibuat_pada: string | null;
    project_id: string | null;
    level_selesai: number;
    jalur_ui: string;
    saya_pengajunya: boolean;
  }

  export interface ResponsInbox {
    data: BarisInbox[];
    total: number;
    ringkas: Record<string, number>;
    dilewati: Array<{ jenis: string; sebab: string }>;
  }

  export interface GalatApi {
    error?: string;
    message?: string;
  }

  export function pesanGalat(e: unknown, bawaan: string): string {
    const g = e as GalatApi;
    return g?.error ?? g?.message ?? bawaan;
  }
  ```

  ⚠ Kalau Task 3 sudah menulis `GalatApi`/`pesanGalat` lebih dulu, JANGAN
  duplikasi — tambahkan hanya `BarisInbox`/`ResponsInbox` yang belum ada.

- [ ] **Step 2: `admin-portal/inbox/page.tsx` — salin kerangka `pm-portal/
  approval/page.tsx` APA ADANYA, sesuaikan 3 hal**

  Baca ULANG `apps/web/app/pm-portal/approval/page.tsx` PENUH (848 baris)
  sebelum menulis — kerangka di bawah HANYA menandai apa yang BERBEDA dari
  file itu, bukan menyalin ulang bagian yang sama:

  1. **`JALUR_PM` → HAPUS SELURUHNYA.** Portal PM butuh mapping ke halaman
     PM sendiri karena `jalur_ui` dari API menunjuk dashboard admin. Portal
     ADMIN **memakai `jalur_ui` API APA ADANYA** — admin-portal dan
     dashboard admin sama-sama berhak membuka `/mandor/kasbon`, `/kas`, dst
     (halaman itu sendiri sudah digerbang `hasPermission()` masing-masing).
     Untuk jenis yang belum punya `AKSI` (tak didukung tombol), tombol
     "Lihat detail" memakai `<a href={jalurUi}>` biasa (bukan Next `<Link>`
     — `jalur_ui` menuju rute DASHBOARD WEB `(dashboard)/*`, bukan rute
     admin-portal, jadi ini navigasi LINTAS APLIKASI Next yang benar
     lewat anchor tag, bukan client-side route Next yang tak mengenal
     segmen itu).

  2. **`AKSI` — SALIN 7 entri yang sudah diverifikasi (`kasbon`,
     `submittal`, `material_request`, `purchase_order`, `rencana_mutu`,
     `klaim_perjalanan`, `project_expense`) APA ADANYA** dari
     `pm-portal/approval/page.tsx:210-333` — endpoint/body/method sama
     PERSIS, karena backend tak beda per role pemanggil. JANGAN menambah
     jenis baru (`back_charge`, `opname_bersama`, `cuti_karyawan`, dst) di
     task ini tanpa riset endpoint terpisah — di luar cakupan breakdown
     yang sudah diriset Task 2. Komentar per-entri (nomor baris kode
     backend, catatan tombol Tolak nonaktif untuk PO/RMP) ikut disalin —
     itu bukti riset, bukan hiasan.

     ⚠ Perbedaan permission admin/direktur (temuan Task 2 tabel di atas)
     TIDAK mengubah `AKSI` sama sekali — 7 jenis di `AKSI` semuanya jenis
     yang admin DAN direktur sama-sama pegang permission-nya
     (`mandor:kasbon:approve`, `submittal:decide`, `procurement:mr:manage`,
     `procurement:po:manage`, `mutu:rmp:approve`, `klaim:setujui`,
     `cash:expense:approve` — cek tabel Step riset di atas, semuanya ✅/✅).

     ⚠ **Koreksi review Task 2 — 5 dari 6 jenis TERSISA SUDAH punya UI
     keputusan nyata, hanya di TEMPAT LAIN, bukan "belum pernah diriset".**
     Verifikasi ulang (review Task 2, dikonfirmasi baca kode langsung):
     `back_charge` → `(dashboard)/mandor/penagihan/page.tsx` (`PanelBackCharge`,
     gerbang `useIzin("backcharge:setujui")`); `opname_bersama` →
     `(dashboard)/mandor/opname/page.tsx` (`PATCH /api/v1/opname/:id/
     verifikasi`, gerbang `opname:verifikasi`); `cuti_karyawan` →
     `(dashboard)/sdm/cuti/page.tsx` (`POST /api/v1/sdm/cuti/:id/putuskan`);
     `change_order` → `components/change-order-section.tsx` (dipakai
     `(dashboard)/proyek/[id]/page.tsx`, `PATCH /api/v1/change-orders/:id/
     {approve,reject}`) DAN `pm-portal/kontrak-lengkap/change-order/
     page.tsx` (gerbang `hasPermission("change_order:approve")`);
     `estimate_version` → `pm-portal/cecep/rab/[id]/page.tsx` (`PATCH
     /api/v1/estimate-versions/:id/approve`, gerbang
     `hasPermission("cecep:estimate:approve")`). **HANYA `lessons_learned`
     yang genuinely nol UI keputusan di mana pun** (dicek: hanya muncul di
     komentar fallback `kategori/[key]/page.tsx` dan label
     `shell/rail-asisten.tsx`, tak ada satu halaman pun dengan tombol
     approve/reject).

     Keputusan scope Tahap 1 TETAP: `AKSI` di admin-portal HANYA 7 jenis di
     atas (yang endpoint/gate-nya sudah diverifikasi PM Portal) — 5 jenis
     dengan UI di tempat lain BOLEH ditautkan langsung ke halaman
     existing-nya via `jalur_ui` (bukan "lihat detail" generik tanpa makna,
     karena halamannya SUDAH punya tombol keputusan sungguhan di sana) kalau
     ringan menambahkannya; kalau perlu riset field-mapping tambahan untuk
     `AKSI` inline di admin-portal sendiri, catat sebagai utang Tahap
     berikutnya — BUKAN klaim "belum pernah diriset di portal manapun" untuk
     lima jenis ini, karena itu keliru dan bisa membuat task berikutnya
     meriset ulang dari nol sesuatu yang sudah ada.

  3. **Judul halaman & `<h1>`** — "Approval" cukup (sama pm-portal), TAPI
     tambahkan `<h1>` eksplisit kalau kerangka PM memakainya sebagai teks
     biasa (cek ulang — `pm-portal/approval/page.tsx:526` sudah pakai
     `<h1>`, jadi kemungkinan besar tinggal salin apa adanya).

  Detail-fetch (kasbon dari list `?status=pending&limit=200`, submittal
  dari list per-proyek, MR/PO/RMP dari `GET /:id` masing-masing),
  `detailGagal` guard, `pending_next_level` handling, SoD (`saya_
  pengajunya`) — SEMUA disalin apa adanya, tak ada logic baru. Ini
  konsumsi ulang murni, bukan implementasi baru.

- [ ] **Step 3: Tambahkan komentar kepala berkas menjelaskan riset company-
  wide (bukan disalin dari PM)**

  ```tsx
  // ============================================================================
  // Approval Inbox — Portal Admin/Direktur (Task 4).
  //
  // Kerangka SALINAN `pm-portal/approval/page.tsx` (komentar detail di
  // sana tetap berlaku) dengan DUA beda:
  //   1. Company-wide, bukan disaring `pm_id` — admin/direktur bukan role
  //      `pm`, jadi `GET /api/v1/approval/inbox` mengembalikan SELURUH
  //      baris company (`approval-inbox.ts:117-128` — `pmProjectIds` hanya
  //      diisi untuk `user.role === 'pm'`).
  //   2. `jalur_ui` dipakai APA ADANYA (bukan `JALUR_PM` lokal) — admin
  //      berhak membuka halaman dashboard web yang ditunjuknya.
  //
  // `AKSI` (7 jenis: kasbon/submittal/material_request/purchase_order/
  // rencana_mutu/klaim_perjalanan/project_expense) disalin APA ADANYA dari
  // pm-portal — endpoint backend tak beda per role pemanggil. Permission
  // ketujuh jenis ini dipegang admin DAN direktur (live 2026-08-22,
  // docs/superpowers/plans/2026-08-22-portal-admin-direktur-lengkap.md
  // Task 2).
  //
  // 6 jenis lain TAMPIL sebagai kartu tanpa tombol aksi INLINE di sini
  // (link `jalur_ui` apa adanya) — TAPI koreksi review Task 2: 5 dari 6
  // (back_charge, opname_bersama, cuti_karyawan, change_order,
  // estimate_version) SUDAH punya UI keputusan nyata di tempat lain
  // (dashboard admin dan/atau PM Portal — lihat rincian per-jenis di plan,
  // Task 4 Step 2 poin 2), jadi `jalur_ui` di sini membawa admin ke halaman
  // yang BENAR-BENAR bisa memutuskan, bukan halaman baca-saja. HANYA
  // `lessons_learned` genuinely nol UI keputusan di mana pun (diverifikasi:
  // tak ada satu halaman pun dengan tombol approve/reject untuk jenis ini).
  // ============================================================================
  ```

- [ ] **Step 4: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 5: Verifikasi manual — admin melihat SEMUA jenis, bukan
  hanya yang bisa diputuskan**

  Kalau API/web hidup dengan akun admin uji: buka `/admin-portal/inbox`,
  konfirmasi baris untuk jenis TANPA `AKSI` (mis. `back_charge` bila ada
  data pending di company uji) tetap TAMPIL dengan link "Lihat detail" ke
  `jalur_ui`, bukan hilang senyap.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/app/admin-portal/inbox apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): approval inbox company-wide — pola Portal PM, Tahap 1"
  ```

### Task 5: Navigasi kategori Tahap 1 + verifikasi akhir tahap

**Files:**
- Modify: `apps/web/lib/admin-portal-kategori.ts` (isi `KATEGORI_AKTIF` —
  LEVEL GRUP, lihat koreksi mekanisme di bawah)
- Modify: `apps/web/app/admin-portal/kategori/[key]/page.tsx` (isi
  `PETA_HREF_PORTAL` inline — LEVEL ITEM, file BERBEDA dari yang berisi
  `KATEGORI_AKTIF`)

**Interfaces:**
- Consumes: hasil Task 3 (dashboard) + Task 4 (inbox) berfungsi.
- Produces: kategori `bi-eksekutif` (Dashboard Eksekutif) dan
  `sy-inbox-approval` (Menunggu Persetujuan) — KUNCI ITEM PERSIS dari
  `apps/web/lib/peta-menu.ts:354` dan `:373` — muncul di halaman
  `/admin-portal/kategori` sebagai AKTIF, bukan lagi placeholder kosong.

⚠ **KOREKSI MEKANISME (review — bug nyata di draf sebelumnya).** Riset awal
Task 2 salah mengasumsikan `KATEGORI_AKTIF` disaring level ITEM. Dibaca
ulang kode nyata Task 1 (`apps/web/lib/admin-portal-kategori.ts` +
`apps/web/app/admin-portal/kategori/[key]/page.tsx`, PERSIS pola
`pm-portal-kategori.ts`/`pm-portal/kategori/[key]/page.tsx`):

```ts
// admin-portal-kategori.ts — KATEGORI_AKTIF module-private, disaring level GRUP
const KATEGORI_AKTIF: string[] = [];
export function kategoriUntukAdmin(): GrupMenu[] {
  return PETA_MENU.filter((g) => KATEGORI_AKTIF.includes(g.key));
}
```

`g.key` di sini adalah kunci GRUP (`g-laporan`, `g-sistem`, dst — lihat
`peta-menu.ts:79-432`), BUKAN kunci item (`bi-eksekutif`, `sy-inbox-
approval`). Mengisi `KATEGORI_AKTIF` dengan kunci ITEM (draf sebelumnya)
membuat `filter()` TIDAK PERNAH cocok dengan `g.key` grup mana pun —
halaman `/admin-portal/kategori` akan tampil KOSONG selamanya meski Task 3
dan Task 4 sudah selesai, tanpa satu pun error (gejalanya identik "belum
ada modul dibangun", padahal modulnya sudah ada).

`PETA_HREF_PORTAL` TETAP level ITEM seperti draf sebelumnya (itu sudah
benar) — tapi hidup di file BERBEDA: inline di
`admin-portal/kategori/[key]/page.tsx` (bukan di
`admin-portal-kategori.ts`), persis pola pm-portal
(`PETA_HREF_PORTAL` ada di `pm-portal/kategori/[key]/page.tsx`, bukan di
`pm-portal-kategori.ts`).

- [ ] **Step 1: Konfirmasi grup yang menaungi `bi-eksekutif`/
  `sy-inbox-approval`**

  Sudah dikonfirmasi baca `apps/web/lib/peta-menu.ts` langsung:
  `bi-eksekutif` (Dashboard Eksekutif) ada di grup `key: 'g-laporan'`
  (baris 352, label "Laporan & BI"); `sy-inbox-approval` (Menunggu
  Persetujuan) ada di grup `key: 'g-sistem'` (baris 366, label
  "Administrasi"). Verifikasi ULANG ke file nyata sebelum menulis — jangan
  percaya nomor baris ini kalau `peta-menu.ts` sempat berubah antara riset
  ini dan implementasi Task 5.

  ⚠ Mengaktifkan grup `g-laporan`/`g-sistem` berarti SEMUA item `status:
  'hidup'` lain di kedua grup itu (bukan hanya `bi-eksekutif`/
  `sy-inbox-approval`) ikut tampil di halaman kategori — `itemHidup =
  grup.items.filter((it) => it.status === "hidup")` di
  `kategori/[key]/page.tsx` menyaring per STATUS item, bukan per item yang
  sudah punya `PETA_HREF_PORTAL`. Item lain di kedua grup itu yang belum
  punya baris di `PETA_HREF_PORTAL` akan tetap TAMPIL tapi tautannya
  fallback ke `it.href` web (pola sama persis pm-portal — "item ada tapi
  belum punya versi portal" bukan cacat, itu perilaku yang disengaja
  dijelaskan di komentar `pm-portal/kategori/[key]/page.tsx:21-28`). Baca
  ulang isi grup `g-laporan`/`g-sistem` PENUH di `peta-menu.ts` sebelum
  commit supaya tak kaget item lain ikut muncul.

- [ ] **Step 2: Update `admin-portal-kategori.ts` — level GRUP**

  ```ts
  // Kategori yang SUDAH punya halaman portal admin dibangun.
  // Diisi manual satu-per-satu tiap Tahap selesai membangun grup itu —
  // BUKAN dihitung dari permission live (lib/peta-menu.ts tidak
  // menyimpan field permission per grup). Pola identik
  // pm-portal-kategori.ts, jangan didesain ulang.
  //
  // Tahap 1 (Task 3-4): "Laporan & BI" (g-laporan, item bi-eksekutif —
  // Dashboard Eksekutif jadi Beranda admin-portal) dan "Administrasi"
  // (g-sistem, item sy-inbox-approval — Menunggu Persetujuan) — KEDUA
  // GRUP diaktifkan meski Task 3/4 baru membangun SATU item di
  // masing-masing; item lain grup itu yang statusnya 'hidup' akan ikut
  // tampil dengan fallback href web (lihat Task 5 Step 1).
  const KATEGORI_AKTIF: string[] = ["g-laporan", "g-sistem"]; // Tahap 1
  ```

  ⚠ `KATEGORI_AKTIF` di file ini TIDAK diekspor (module-private,
  `kategoriUntukAdmin()` yang diekspor) — JANGAN tambahkan `export` di
  depannya, ikuti bentuk asli Task 1 apa adanya.

- [ ] **Step 3: Update `PETA_HREF_PORTAL` inline di
  `kategori/[key]/page.tsx` — level ITEM**

  ```ts
  /**
   * Peta href web (key `ItemMenu` di `lib/peta-menu.ts`) ke href portal
   * Admin/Direktur — DIISI PROGRESIF tiap Task menambah halaman baru.
   *
   * Tahap 1 (Task 3-4): bi-eksekutif (Dashboard Eksekutif, grup
   * g-laporan) → Beranda admin-portal sendiri (Task 3 mengganti
   * placeholder Task 1 di halaman itu, BUKAN halaman terpisah — href
   * yang sama dengan Beranda). sy-inbox-approval (Menunggu Persetujuan,
   * grup g-sistem) → halaman inbox Task 4.
   */
  const PETA_HREF_PORTAL: Record<string, string> = {
    "bi-eksekutif": "/admin-portal",
    "sy-inbox-approval": "/admin-portal/inbox",
  };
  ```

  ⚠ File ini SUDAH ADA dari Task 1 dengan `PETA_HREF_PORTAL` kosong
  (`{}`) — tambahkan kedua baris ke objek yang sudah ada, JANGAN menulis
  ulang seluruh file atau membuat deklarasi kedua.

- [ ] **Step 4: Verifikasi lantai penjaga ratchet TIDAK naik dari baseline
  Task 1**

  ```bash
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && node scripts/format-ratchet.mjs
  cd apps/web && node scripts/audit-halaman-pakai-cache.mjs
  ```

  Bandingkan angka ke commit `ab10f5f0` (Task 1) — laporkan SELISIH, bukan
  cuma exit code.

- [ ] **Step 5: typecheck + build + guard lengkap**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && pnpm build
  cd apps/api && node scripts/jalankan-semua-penjaga.mjs
  ```

  Tempel ringkasan run sungguhan (CHARTER §7) — SEMUA penjaga, bukan
  subset yang "dirasa relevan" (pelajaran §7 CLAUDE.md 2026-08-18).

- [ ] **Step 6: a11y runtime penuh (akun admin)**

  ```bash
  LAYAR_EMAIL=$(grep '^LAYAR_EMAIL' apps/web/.env.local|cut -d= -f2-|tr -d '"\r') \
  LAYAR_SANDI=$(grep '^LAYAR_SANDI' apps/web/.env.local|cut -d= -f2-|tr -d '"\r') \
    node apps/web/scripts/jalankan-a11y-lengkap.mjs
  ```

  Cek `/admin-portal` dan `/admin-portal/inbox` termasuk yang di-scan.
  Catat di JOURNAL kalau ada jalur direktur-spesifik yang MATERIAL berbeda
  dari admin dan perlu akun uji terpisah (0 user aktif direktur saat plan
  ini ditulis — lihat Global Constraints).

- [ ] **Step 7: Update dokumen**

  - `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` — tandai `bi-eksekutif` dan
    `sy-inbox-approval` sebagai punya halaman admin-portal (bukan hanya
    dashboard web).
  - `docs/execution/JOURNAL.md` — entri ringkas Tahap 1 selesai.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/lib/admin-portal-kategori.ts apps/web/app/admin-portal/kategori/\[key\]/page.tsx docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md docs/execution/JOURNAL.md
  git commit -m "feat(admin-portal): navigasi kategori Tahap 1 + verifikasi akhir tahap"
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
