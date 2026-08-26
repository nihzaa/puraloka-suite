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

## Tahap 2: Proyek + Kontrak + Jadwal

### Task 6: Riset & breakdown — Proyek (company-wide) + Kontrak + Jadwal (Tahap 2)

**Files:**
- Modify (dokumen ini): tambah Task 7+ dengan breakdown lengkap Tahap 2
  berdasar riset task ini.

**Interfaces:**
- Consumes: hasil Tahap 1 (shell+layout+gerbang+Dashboard+Inbox berfungsi,
  pola `useData`/`hasPermission`/token kerapatan established).
- Produces: daftar Task konkret bernomor untuk Tahap 2, ditulis LANGSUNG
  ke dokumen plan ini (pola sama Task 2).

- [ ] **Step 1: Baca halaman web yang sudah ada untuk Proyek, Kontrak, Jadwal**

  Baca `apps/web/app/(dashboard)/proyek/page.tsx` (list company-wide) dan
  `proyek/[id]/page.tsx` (detail + tab-tab-nya — kemungkinan CPM/Gantt/
  Kurva-S/dst sebagai tab, BUKAN halaman terpisah, verifikasi ke kode
  bukan ditebak). Baca modul Kontrak (`kontrak.ts`, `asuransi.ts`,
  `rantai-kontrak.ts` di backend — lihat pola sudah dipetakan Portal PM
  Task 11 sebagai rujukan, TAPI verifikasi ULANG untuk konteks admin:
  apakah endpoint sama tapi tanpa filter `pm_id`, atau ada endpoint
  company-wide terpisah). Baca Jadwal (`jadwal-cpm.ts` atau sejenis).

- [ ] **Step 2: Live query permission admin+direktur untuk ketiga modul**

  Pisah per role_id (2 baris masing-masing). Catat permission APA yang
  menggerbangi create/edit vs view-only untuk Kontrak (Register Kontrak,
  Asuransi, EOT/Denda/Jaminan, Klaim Kontraktual, Surat) dan Jadwal (CPM,
  Analisa Keterlambatan).

- [ ] **Step 3: Tentukan pola company-wide vs project-picker untuk tiap sub-modul**

  Proyek List → company-wide (tanpa picker, halaman list itu sendiri).
  Proyek Detail → perlu memilih SATU proyek (inherent ke konsepnya,
  bukan project-picker tambahan — user tap dari list). Kontrak/Jadwal →
  tentukan dari kode: apakah datanya company-wide (list semua kontrak
  lintas proyek) atau per-proyek (`proyek/[id]` tab)? Verifikasi ke
  endpoint API, jangan asumsikan dari nama modul.

- [ ] **Step 4: Tulis Task 7+ ke dokumen ini**

  Berdasar riset Step 1-3, tulis task-task konkret dengan kode LENGKAP
  untuk: Proyek List (company-wide), Proyek Detail (kalau perlu halaman
  admin-portal sendiri, atau cukup deep-link ke rute existing kalau
  sudah company-wide-friendly — verifikasi dulu, jangan bangun ulang
  yang sudah ada), Kontrak (Register+Asuransi+EOT dst — bisa dipecah
  multi-task seperti Portal PM Task 12-14), Jadwal (CPM+Analisa
  Keterlambatan), lalu satu task navigasi+verifikasi akhir Tahap 2
  (pola sama Task 5, termasuk cek ulang `KATEGORI_AKTIF` grup yang
  relevan: kemungkinan `g-kontrak`, `g-jadwal`, dan grup Proyek kalau
  ada grup tersendiri — verifikasi ke `peta-menu.ts`).

- [ ] **Step 5: Commit breakdown**

  ```bash
  git add docs/superpowers/plans/2026-08-22-portal-admin-direktur-lengkap.md
  git commit -m "docs(plan): breakdown Tahap 2 — Proyek + Kontrak + Jadwal"
  ```

### Hasil riset Task 6 (2026-08-22) — ringkasan sebelum Task 7-12

**Proyek** — `GET /api/v1/projects` (`apps/api/src/routes/v1/projects.ts:14-48`)
sudah COMPANY-WIDE APA ADANYA untuk admin/direktur: satu-satunya penyempitan
di kode adalah `role === 'client'` (baris 34), tak ada cabang untuk `pm`
sama sekali — daftar proyek yang dikembalikan API untuk PM pun sebenarnya
SUDAH seluruh tenant; `pm-portal/proyek/page.tsx` menyaringnya sendiri di
KLIEN lewat `.filter((p) => p.pm)` (yang sebetulnya bukan "proyek milik saya"
melainkan "proyek yang punya PM apa pun" — potensi bug PM Portal, DI LUAR
scope Task ini, dicatat sebagai temuan bukan diperbaiki). Untuk admin-portal:
**tidak perlu filter apa pun**, tampilkan `projects` apa adanya.

`GET /api/v1/projects/:id` (baris 51+) sudah menangani ownership per-role —
`admin bebas` (baris 137-140 hanya menolak `pm`/lainnya, admin lolos tanpa
syarat). `pm-portal/proyek/[id]/page.tsx` (16 baris) TERBUKTI **hanya
redirect** ke `/proyek/:id` (dashboard web, bukan halaman portal sendiri) —
komentar di kode menyatakan eksplisit "PM punya akses penuh ke detail
proyek". Untuk admin-portal: pola IDENTIK berlaku, bahkan lebih sederhana
(admin memang sudah pemilik penuh) — Task 7 membangun List sebagai halaman
admin-portal sungguhan, tapi Detail cukup REDIRECT ke `/proyek/:id` yang
sudah ada, TIDAK membangun tab-hub baru.

⚠ **Halaman `/proyek/:id` (`apps/web/app/(dashboard)/proyek/[id]/page.tsx`,
2082 baris) adalah dashboard WEB biasa** — bukan komponen portal (tidak
pakai `PortalShell`/token `--portal-*`), dan berat untuk viewport mobile
(tab CPM/Gantt/Kurva-S/Milestone/Change-Order/dst semuanya HIDUP DI SINI
sebagai tab, dikonfirmasi `peta-menu.ts` — `jd-gantt`/`jd-kurva-s`/`kt-co`/
dst semua `tabProyek: 'sec-*'` menunjuk `href: '/proyek'`). Redirect keluar
dari `admin-portal/*` ke halaman non-portal ini SAMA PERSIS pola PM
(`pm-portal/proyek/[id]/page.tsx`) — bukan penyimpangan baru, dan
alternatifnya (membangun ulang 2082 baris + belasan tab jadi versi portal)
di luar skala breakdown yang masuk akal untuk satu Tahap.

**Kontrak (`g-kontrak`, 12 item, urutan 30)** — TIGA pola berbeda ditemukan,
harus dipecah task sesuai polanya (bukan satu task generik "Kontrak"):

| Sub-modul | Endpoint | Company-wide? | Permission |
|---|---|---|---|
| Register Kontrak (`kt-register`) | `GET/POST /api/v1/kontrak`, `PATCH /api/v1/kontrak/:id/status` | **YA** — `GET /api/v1/kontrak` tanpa `project_id` sudah company-wide (`kontrak.ts:42-63`, hanya `.eq('company_id', ...)`), PM Portal TIDAK memakainya (pilih endpoint per-proyek `/kontrak/proyek/:id` + picker) | `projects:view` (baca), `projects:contract` (tulis) |
| Asuransi (`kt-asuransi`) | `GET/POST /api/v1/asuransi` | **YA** — `project_id` OPSIONAL (`asuransi.ts:32-46`, default `idProyek` = SELURUH `db.projectIds()`); PM Portal SUDAH memakainya company-wide by default (`url = ... : "/api/v1/asuransi"` tanpa query saat `proyekId` kosong) | `projects:contract` (baca DAN tulis — satu permission untuk keduanya, tak ada endpoint PATCH) |
| EOT + LD + Bond (`kt-eot`/`kt-ld`/`kt-bond`) | `GET/POST /api/v1/projects/:id/eot`, `GET /api/v1/projects/:id/liquidated-damages`, `GET/POST/PATCH /api/v1/bonds` | **TIDAK** — ketiganya butuh `:id` proyek di path (EOT/LD) atau `project_id` di body (Bond POST); PM Portal pakai project-picker wajib | `projects:view` (baca), `projects:edit` (tulis EOT+Bond; LD baca-saja, nol POST/PATCH) |
| Klaim Kontraktual (`kt-claims`) | `GET/POST /api/v1/projects/:id/claims`, `PATCH /api/v1/claims/:id/decide` | **TIDAK** — per-proyek, `PATCH` mewarisi tenancy lewat `project_id` di BODY | `projects:view` (baca), `projects:edit` (tulis) |
| Surat (`kt-surat`) | `GET /api/v1/letters` (lintas-proyek), `GET/POST /api/v1/projects/:id/letters`, `PATCH /api/v1/letters/:id` | **YA** untuk BACA (`GET /letters` sengaja lintas-proyek — dipakai PM Portal sebagai default) — form "Surat Baru" tetap pilih SATU proyek karena `POST` per-proyek | `documents:manage` (baca DAN tulis, live 2026-08-22: admin DAN direktur sama-sama punya) |
| Change Order (`kt-co`) | `GET/POST /api/v1/projects/:id/change-orders`, item CRUD, `PATCH .../submit`, `PATCH /api/v1/change-orders/:id/{approve,reject}` | **TIDAK** — per-proyek murni | `projects:edit` (create/edit/submit — admin DAN direktur punya); `change_order:approve` (approve/reject — **HANYA admin, direktur TIDAK**, live 2026-08-22, konsisten dengan temuan Task 2) |

`kt-termin`/`kt-retensi`/`kt-rfi`/`kt-subkon` (4 item sisa grup `g-kontrak`)
TIDAK masuk breakdown Task 7-11 — hrefnya menunjuk modul LAIN (`/keuangan/
pembayaran`, `/piutang`, `/kontrak/rfi`, `/kontrak/subkon`) yang bukan bagian
riset ini (Termin/Retensi masuk Tahap 3 Keuangan; RFI/Subkon belum
diriset). Task navigasi (Task 12) tetap mengaktifkan grup `g-kontrak` penuh
sehingga keempatnya TAMPIL dengan fallback href web, pola sama Task 5.

**Jadwal (`g-jadwal`, 9 item, urutan 40)** — SEMUA per-proyek kecuali satu:

| Sub-modul | Endpoint | Company-wide? |
|---|---|---|
| CPM + Kalender + Sumber Daya + Method Statement (`jd-cpm`, sebagian `jd-histogram`) | `GET /api/v1/jadwal-cpm/:projectId` | TIDAK — `:projectId` wajib di path |
| Baseline (`jd-baseline`) | `GET/POST /api/v1/proyek/:id/baseline`, `GET /api/v1/proyek/:id/baseline/pergeseran` | TIDAK — per-proyek |
| Analisa Keterlambatan (`jd-delay`) | `GET /api/v1/analisa-keterlambatan?project_id=` | **YA** — `project_id` OPSIONAL (PM Portal sudah default company-wide, `url = proyekId ? ...?project_id=... : "/api/v1/analisa-keterlambatan"`), READ-ONLY (nol POST/PATCH — "angka yang bisa disunting berhenti jadi dasar apa pun") |

`jd-wbs`/`jd-gantt`/`jd-kurva-s`/`jd-lookahead`/`jd-milestone`/`jd-evm` (6
item sisa) semuanya `tabProyek` — hidup sebagai tab `/proyek/[id]`, BUKAN
halaman jadwal-cpm ini. Tak ada endpoint company-wide untuk keenamnya (belum
diriset — di luar cakupan Task 6).

**Permission live 2026-08-22** (pisah role_id, format sama Task 2):

```
projects:view                 admin ✅  direktur ✅  (global+tenant, keduanya)
projects:create                admin ✅  direktur ✅
projects:edit                  admin ✅  direktur ✅
projects:contract              admin ✅  direktur ✅
projects:baseline:manage       admin ✅  direktur ✅
documents:manage               admin ✅  direktur ✅
change_order:approve           admin ✅  direktur ❌   ← satu-satunya beda di Tahap 2
```

`direktur` tetap SUBSET murni admin (konsisten Task 2) — tapi `change_order:
approve` adalah kasus KONKRET pertama di Tahap 2 di mana perbedaan itu
bermakna di UI (bukan cuma di approval inbox): tombol Setujui/Tolak Change
Order harus digerbang eksplisit, disalin APA ADANYA dari pola
`pm-portal/kontrak-lengkap/change-order/page.tsx` (`useSyncExternalStore` +
`hasPermission("change_order:approve")`, tombol TIDAK DIRENDER — bukan
disabled — saat izin tak ada).

**Komponen & tipe yang dipakai ulang** — SELURUH tipe respons (`ProyekPM`,
`DokumenKontrak`, `RespKontrakProyek`, `NilaiKontrakBerjalan`,
`BandingNilaiKontrak`, `PolisAsuransi`, `RespAsuransi`, `EotProyek`,
`TanggalEfektifKontrak`, `RespEot`, `HasilLD`, `RespLd`, `BondProyek`,
`BarisBondRingkas`, `RingkasBond`, `RespBond`, `KlaimKontraktual`,
`BatasPemberitahuan`, `RespKlaimKontraktual`, `SuratProyek`, `BatasBalas`,
`RespSuratLintasProyek`) SUDAH ada diverifikasi di
`apps/web/app/pm-portal/_bersama/tipe.ts` — Task 7-11 MENYALIN definisinya
ke `admin-portal/_bersama/tipe.ts` (pola duplikasi antar-portal yang sudah
dipakai Task 4), BUKAN menulis ulang dari nol. `ChangeOrderProyek`/
`RespChangeOrder`/`RespApproveCo` (dipakai Task 10) ada di file yang sama,
belum dibaca detail — Task 10 membacanya ulang sebelum menyalin (Step 1
task itu). Komponen: `BottomSheet`, `SegmentedTab` (props: `opsi: {value,
label}[]`, `aktif: string`, `onUbah: (v)=>void` — dibaca `SegmentedTab.tsx`
langsung), `EmptyState`, `SkeletonCard`, `StatusBadge` (+ `VarianStatus`) —
semuanya generik, sudah dipakai lintas 3 portal.

---

## Tahap 2 lanjutan: Task 7-12

### Task 7: Proyek — List company-wide + Detail (deep-link)

**Files:**
- Create: `apps/web/app/admin-portal/proyek/page.tsx`
- Create: `apps/web/app/admin-portal/proyek/[id]/page.tsx` (redirect, pola
  `pm-portal/proyek/[id]/page.tsx`)
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah `ProyekPM`,
  disalin dari `pm-portal/_bersama/tipe.ts:58-84`)

**Interfaces:**
- Consumes: `GET /api/v1/projects` (company-wide, TANPA filter — lihat
  riset Task 6: satu-satunya penyempitan di endpoint ini adalah
  `role === 'client'`, admin/direktur menerima seluruh tenant apa adanya).
- Produces: `/admin-portal/proyek` (sudah ada di `NAV_ITEMS` Task 1 Step 2),
  `/admin-portal/proyek/:id` redirect ke `/proyek/:id` (dashboard web).

⚠ **Halaman ini BUKAN salinan PM Portal apa adanya** — PM Portal MENYARING
`.filter((p) => p.pm)` (temuan Task 6: sebenarnya "proyek berpunya PM apa
pun", bukan "proyek saya" — kemungkinan bug PM Portal, DI LUAR scope Task
ini, JANGAN diperbaiki di sini karena berisiko mengubah perilaku modul lain
tanpa riset terpisah). Admin-portal TIDAK menyaring apa pun — seluruh
`projects` tampil, termasuk yang belum punya PM ditugaskan (`draft`/baru
dibuat), karena admin justru pihak yang MENUGASKAN PM.

- [ ] **Step 1: Baca ulang `pm-portal/proyek/page.tsx` PENUH sebelum
  menulis (146 baris)** — kerangka di bawah adalah TURUNAN, bukan salinan
  identik (lihat catatan filter di atas).

- [ ] **Step 2: Tambah `ProyekPM` ke `_bersama/tipe.ts`**

  Salin PERSIS `pm-portal/_bersama/tipe.ts:58-84` — field `contract_value`,
  `progress_pct`, `end_date`, `clients`, `pm` semuanya dipakai kartu daftar.

- [ ] **Step 3: `admin-portal/proyek/page.tsx`**

  ```tsx
  "use client";

  // ============================================================================
  // Proyek — Portal Admin/Direktur (Task 7). COMPANY-WIDE tanpa saringan
  // kepemilikan — beda dari `pm-portal/proyek/page.tsx` yang menyaring
  // `.filter((p) => p.pm)` (riset Task 6: `GET /api/v1/projects` TIDAK
  // menyempitkan apa pun untuk role selain `client`; PM Portal menyaring di
  // klien, bukan endpoint). Admin melihat SELURUH proyek tenant, termasuk
  // yang belum ditugaskan PM-nya — admin adalah pihak yang menugaskan.
  // ============================================================================

  import { useState } from "react";
  import Link from "next/link";
  import { useData } from "@/lib/data-cache";
  import { MapPin, Calendar, ChevronRight, AlertCircle, FolderKanban } from "lucide-react";
  import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
  import SkeletonCard from "@/components/portal/SkeletonCard";
  import EmptyState from "@/components/portal/EmptyState";
  import type { ProyekPM, GalatApi } from "../_bersama/tipe";
  import { pesanGalat } from "../_bersama/tipe";

  interface RespProyek { projects: ProyekPM[] }

  function fmt(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  function fmtDate(s: string | null | undefined) {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }

  const LABEL_STATUS: Record<string, string> = {
    planning: "Perencanaan", active: "Aktif", on_hold: "Ditunda",
    completed: "Selesai", cancelled: "Dibatalkan",
  };
  const VARIAN_STATUS: Record<string, VarianStatus> = {
    planning: "info", active: "approved", on_hold: "pending",
    completed: "approved", cancelled: "netral",
  };
  const FILTER_OPSI = ["all", "active", "planning", "on_hold", "completed"];

  export default function AdminProyekPage() {
    const [filter, setFilter] = useState("all");
    const { data, memuat, galat } = useData<RespProyek>("/api/v1/projects");
    // TANPA `.filter((p) => p.pm)` — company-wide sungguhan, lihat komentar berkas.
    const projects = data?.projects ?? [];
    const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Proyek
        </h1>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTER_OPSI.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              style={{
                padding: "6px 14px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 600,
                cursor: "pointer", minHeight: 32,
                border: `1px solid ${filter === s ? "var(--navy)" : "var(--border)"}`,
                background: filter === s ? "var(--info-bg)" : "var(--surface)",
                color: filter === s ? "var(--navy)" : "var(--text-secondary)",
              }}
            >
              {s === "all" ? "Semua" : LABEL_STATUS[s] ?? s}
            </button>
          ))}
        </div>

        {memuat && <><SkeletonCard tinggi={110} /><SkeletonCard tinggi={110} /></>}

        {!memuat && galat && (
          <EmptyState icon={AlertCircle} judul="Gagal memuat proyek" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang halaman ini.")} />
        )}

        {!memuat && !galat && filtered.length === 0 && (
          <EmptyState icon={FolderKanban} judul="Belum ada proyek" deskripsi="Proyek perusahaan akan muncul di sini." />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((p) => {
            const terlambat = p.status === "active" && p.end_date && new Date(p.end_date) < new Date();
            const progres = p.progress_pct ?? 0;
            return (
              <Link key={p.id} href={`/admin-portal/proyek/${p.id}`} style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--surface)", borderRadius: 16, padding: 16,
                  border: `1px solid ${terlambat ? "var(--danger-border)" : "var(--border)"}`,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{p.name}</h2>
                        <StatusBadge status={VARIAN_STATUS[p.status ?? ""] ?? "netral"} label={LABEL_STATUS[p.status ?? ""] ?? p.status ?? "—"} />
                        {terlambat && <StatusBadge status="rejected" label="Terlambat" />}
                        {/* Beda dari PM: admin butuh tahu proyek BELUM berpenanggung jawab — sinyal yang tak relevan buat PM sendiri. */}
                        {!p.pm && <StatusBadge status="pending" label="Belum ada PM" />}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                        {p.pm?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>PM: {p.pm.name}</div>}
                        {p.clients?.contact_person && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.clients.contact_person}</div>}
                        {p.location && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                            <MapPin size={12} aria-hidden="true" />{p.location}
                          </div>
                        )}
                        {p.start_date && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                            <Calendar size={12} aria-hidden="true" />{fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  </div>

                  {p.status === "active" && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Serapan Anggaran</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>{progres}%</span>
                      </div>
                      <div style={{ height: 6, background: "var(--surface-subtle)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 999, width: `${progres}%`,
                          background: terlambat ? "var(--danger)" : "var(--grad-aksen)",
                          transition: "width 0.5s",
                        }} />
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(Number(p.contract_value) || 0)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }
  ```

  ⚠ Label KPI "Serapan Anggaran" (bukan "Progres Fisik" seperti PM Portal) —
  konsisten dengan koreksi istilah yang SUDAH ditulis `(dashboard)/proyek/
  page.tsx` (§header berkas itu): `progress_pct` adalah bobot RAB terserap,
  BUKAN kemajuan fisik lapangan. PM Portal-nya sendiri memakai label lama
  "Progres Fisik" yang keliru — JANGAN disalin labelnya, hanya strukturnya.

- [ ] **Step 4: `admin-portal/proyek/[id]/page.tsx` — redirect**

  ```tsx
  "use client";

  // Redirect ke halaman detail proyek dashboard web — admin punya akses
  // penuh ke SELURUH tab (`/proyek/[id]`, 2082 baris, CPM/Gantt/Kurva-S/
  // Change-Order/dst semuanya tab di sana, bukan halaman terpisah — lihat
  // riset Task 6). Pola IDENTIK `pm-portal/proyek/[id]/page.tsx`. Membangun
  // versi portal (PortalShell + belasan tab) adalah pekerjaan tersendiri
  // yang JAUH melebihi skala satu Task — di luar cakupan Tahap 2.
  import { useEffect } from "react";
  import { useParams, useRouter } from "next/navigation";

  export default function AdminProyekDetailRedirect() {
    const { id } = useParams();
    const router = useRouter();

    useEffect(() => {
      if (id) router.replace(`/proyek/${id}`);
    }, [id, router]);

    return null;
  }
  ```

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/app/admin-portal/proyek apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): proyek company-wide + deep-link detail — Tahap 2"
  ```

### Task 8: Kontrak — Register + Asuransi (company-wide)

**Files:**
- Create: `apps/web/app/admin-portal/kontrak/register/page.tsx`
- Create: `apps/web/app/admin-portal/kontrak/asuransi/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah
  `DokumenKontrak`, `NilaiKontrakBerjalan`, `BandingNilaiKontrak`,
  `RespKontrakProyek`, `PolisAsuransi`, `RespAsuransi`)

**Interfaces:**
- Consumes: `GET /api/v1/kontrak` (company-wide, opsional `?project_id=`/
  `?status=`/`?jenis=`), `POST /api/v1/kontrak`, `PATCH /api/v1/kontrak/:id/
  status` — semuanya `projects:contract`; `GET/POST /api/v1/asuransi`
  (company-wide, opsional `?project_id=`) — `projects:contract` (baca+tulis,
  satu permission, nol endpoint PATCH).
- Produces: `/admin-portal/kontrak/register`, `/admin-portal/kontrak/
  asuransi` (dua rute terpisah — BEDA dari PM Portal yang menaruh keduanya
  di `kontrak-lengkap/`, penamaan `admin-portal/kontrak/*` dipilih supaya
  konsisten dengan grup `g-kontrak` yang akan diaktifkan Task 12).

⚠ **Register Kontrak DITULIS ULANG untuk company-wide** (BUKAN salinan
`pm-portal/kontrak-lengkap/register/page.tsx` apa adanya) — riset Task 6
menemukan `GET /api/v1/kontrak` (tanpa `project_id`) sudah company-wide dan
PM Portal SENGAJA tidak memakainya (pilih endpoint per-proyek +
picker-wajib, karena "kontrak tercatat per proyek" cocok untuk PM yang
memang kerja di satu/sedikit proyek). Untuk admin yang perlu **melihat
seluruh kontrak lintas proyek sekaligus**, endpoint list company-wide lebih
tepat — form create/ubah-status TETAP perlu memilih satu proyek (endpoint
POST mewajibkan `project_id`), tapi LIST-nya tidak.

⚠ **Asuransi HAMPIR salinan langsung** — `pm-portal/kontrak-lengkap/
asuransi/page.tsx` SUDAH default company-wide (opsi "Semua proyek" di
picker, `url` tanpa `project_id` bila `proyekId` kosong). Task ini menyalin
strukturnya, hanya mengubah kepala halaman & path impor.

- [ ] **Step 1: Baca ulang KEDUA halaman PM PENUH** sebelum menulis
  (`register/page.tsx` 369 baris, `asuransi/page.tsx` 251 baris) — pahami
  BottomSheet form create, alur pembatalan (Register) sebelum menulis
  turunannya.

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  Salin PERSIS dari `pm-portal/_bersama/tipe.ts:208-323` — `DokumenKontrak`,
  `NilaiKontrakBerjalan`, `BandingNilaiKontrak`, `RespKontrakProyek`,
  `PolisAsuransi`, `RespAsuransi` (6 interface, kode di riset Task 6 di
  atas).

- [ ] **Step 3: `admin-portal/kontrak/register/page.tsx` — LIST company-wide**

  ```tsx
  "use client";

  // ============================================================================
  // Register Kontrak — Portal Admin/Direktur (Task 8). COMPANY-WIDE:
  // `GET /api/v1/kontrak` TANPA `project_id` sudah mengembalikan SELURUH
  // kontrak tenant (`kontrak.ts:42-63`, hanya `.eq('company_id', ...)`) —
  // riset Task 6 menemukan PM Portal TIDAK memakai endpoint ini (pilih
  // per-proyek `/kontrak/proyek/:id` + picker wajib). Admin butuh melihat
  // seluruh kontrak lintas proyek sekaligus, jadi halaman ini BEDA STRUKTUR
  // dari versi PM — bukan salinan.
  //
  // Endpoint:
  //   GET   /api/v1/kontrak                — projects:view
  //   POST  /api/v1/kontrak                — projects:contract (wajib project_id)
  //   PATCH /api/v1/kontrak/:id/status     — projects:contract
  //
  // ⚠️ `banding.cocok: true` = SESUAI — dibanding PER-PROYEK, jadi field itu
  // hanya relevan saat memilih SATU kontrak induk untuk lihat detail; list
  // company-wide di sini menampilkan status & nilai per baris tanpa banding
  // (banding butuh proyek spesifik, endpoint `/kontrak/proyek/:id` terpisah
  // yang TIDAK dipanggil halaman ini).
  // ============================================================================

  import { useMemo, useState } from "react";
  import { FileSignature, Plus } from "lucide-react";
  import { useData, invalidasi } from "@/lib/data-cache";
  import { api } from "@/lib/api";
  import EmptyState from "@/components/portal/EmptyState";
  import SkeletonCard from "@/components/portal/SkeletonCard";
  import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
  import BottomSheet from "@/components/portal/BottomSheet";
  import type { ProyekPM, DokumenKontrak, GalatApi } from "../../_bersama/tipe";
  import { pesanGalat } from "../../_bersama/tipe";

  interface RespProyek { projects: ProyekPM[] }
  interface RespKontrakList { kontrak: DokumenKontrak[] }

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
  const FILTER_STATUS = ["semua", "draf", "berlaku", "selesai", "dibatalkan"] as const;

  export default function AdminRegisterKontrakPage() {
    const [filterStatus, setFilterStatus] = useState<typeof FILTER_STATUS[number]>("semua");
    const [sheetTerbuka, setSheetTerbuka] = useState(false);
    const [jenisBaru, setJenisBaru] = useState<"induk" | "addendum">("induk");
    const [indukDipilih, setIndukDipilih] = useState<DokumenKontrak | null>(null);
    const [proyekForm, setProyekForm] = useState("");
    const [form, setForm] = useState({ nomor: "", judul: "", tanggal_tanda_tangan: "", nilai: "", retensi_pct: "", syarat_pembayaran: "" });
    const [mengirim, setMengirim] = useState(false);
    const [galatForm, setGalatForm] = useState<string | null>(null);

    const [galatHalaman, setGalatHalaman] = useState<string | null>(null);
    const [batalTarget, setBatalTarget] = useState<DokumenKontrak | null>(null);
    const [alasanBatal, setAlasanBatal] = useState("");
    const [mengirimBatal, setMengirimBatal] = useState(false);
    const [galatBatal, setGalatBatal] = useState<string | null>(null);

    // Company-wide — TANPA project_id, beda dari versi PM.
    const url = "/api/v1/kontrak";
    const { data, memuat, galat } = useData<RespKontrakList>(url);
    const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
    const daftarProyek = dataProyek?.projects ?? [];

    const daftar = useMemo(() => {
      const semua = data?.kontrak ?? [];
      return filterStatus === "semua" ? semua : semua.filter((k) => k.status === filterStatus);
    }, [data, filterStatus]);
    const induk = useMemo(() => daftar.filter((k) => k.jenis === "induk"), [daftar]);
    const addendumPerInduk = useMemo(() => {
      const m = new Map<string, DokumenKontrak[]>();
      for (const k of daftar) {
        if (k.jenis !== "addendum" || !k.kontrak_induk_id) continue;
        m.set(k.kontrak_induk_id, [...(m.get(k.kontrak_induk_id) ?? []), k]);
      }
      return m;
    }, [daftar]);

    function bukaForm(jenis: "induk" | "addendum", indukBaris?: DokumenKontrak) {
      setJenisBaru(jenis);
      setIndukDipilih(indukBaris ?? null);
      setProyekForm(indukBaris?.project_id ?? daftarProyek[0]?.id ?? "");
      setForm({ nomor: "", judul: "", tanggal_tanda_tangan: "", nilai: "", retensi_pct: "", syarat_pembayaran: "" });
      setGalatForm(null);
      setSheetTerbuka(true);
    }

    async function simpanKontrak() {
      if (!proyekForm) {
        setGalatForm("Pilih proyek terlebih dulu.");
        return;
      }
      if (form.nomor.trim().length === 0 || form.judul.trim().length === 0) {
        setGalatForm("Nomor dan judul wajib diisi.");
        return;
      }
      setMengirim(true);
      setGalatForm(null);
      try {
        await api.post("/api/v1/kontrak", {
          project_id: proyekForm,
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
        invalidasi(url);
      } catch (e) {
        setGalatForm(pesanGalat(e as GalatApi, "Gagal menyimpan kontrak"));
      } finally {
        setMengirim(false);
      }
    }

    async function ubahStatus(k: DokumenKontrak, status: string) {
      if (status === "dibatalkan") {
        setBatalTarget(k);
        setAlasanBatal("");
        setGalatBatal(null);
        return;
      }
      setGalatHalaman(null);
      try {
        await api.patch(`/api/v1/kontrak/${k.id}/status`, { status });
        invalidasi(url);
      } catch (e) {
        setGalatHalaman(pesanGalat(e as GalatApi, "Gagal mengubah status kontrak"));
      }
    }

    async function konfirmasiBatal() {
      if (!batalTarget) return;
      if (alasanBatal.trim().length === 0) {
        setGalatBatal("Alasan pembatalan wajib diisi.");
        return;
      }
      setMengirimBatal(true);
      setGalatBatal(null);
      try {
        await api.patch(`/api/v1/kontrak/${batalTarget.id}/status`, {
          status: "dibatalkan",
          alasan: alasanBatal.trim(),
        });
        setBatalTarget(null);
        invalidasi(url);
      } catch (e) {
        setGalatBatal(pesanGalat(e as GalatApi, "Gagal membatalkan kontrak"));
      } finally {
        setMengirimBatal(false);
      }
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Register Kontrak
        </h1>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTER_STATUS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              aria-pressed={filterStatus === s}
              style={{
                padding: "6px 14px", borderRadius: "var(--portal-radius-pill)", fontSize: 12, fontWeight: 600,
                cursor: "pointer", minHeight: 32,
                border: `1px solid ${filterStatus === s ? "var(--navy)" : "var(--border)"}`,
                background: filterStatus === s ? "var(--info-bg)" : "var(--surface)",
                color: filterStatus === s ? "var(--navy)" : "var(--text-secondary)",
              }}
            >
              {s === "semua" ? "Semua" : LABEL_STATUS[s]}
            </button>
          ))}
        </div>

        {memuat && <SkeletonCard tinggi={160} />}
        {galat && <EmptyState icon={FileSignature} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

        {galatHalaman && (
          <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
            {galatHalaman}
          </div>
        )}

        {!memuat && induk.length === 0 && (
          <EmptyState icon={FileSignature} judul="Belum ada kontrak" deskripsi="Kontrak induk perusahaan akan muncul di sini." />
        )}

        {!memuat && induk.map((k) => (
          <div key={k.id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{k.nomor}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{k.judul}</div>
                {/* Beda dari PM: company-wide berarti nama proyek WAJIB tampil (PM sudah tahu proyeknya sendiri). */}
                {k.proyek?.name && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{k.proyek.name}</div>}
              </div>
              <StatusBadge status={VARIAN_STATUS[k.status] ?? "netral"} label={LABEL_STATUS[k.status] ?? k.status} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(k.nilai)}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              TTD {fmtTanggal(k.tanggal_tanda_tangan)}
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
                  onClick={() => void ubahStatus(k, tujuan)}
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

        <button
          type="button"
          onClick={() => bukaForm("induk")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "var(--pad-kartu-lega)", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          <Plus size={18} aria-hidden="true" /> Kontrak Induk Baru
        </button>

        <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul={jenisBaru === "induk" ? "Kontrak Induk Baru" : `Addendum — ${indukDipilih?.nomor ?? ""}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Company-wide berarti proyek WAJIB dipilih di form — beda dari PM
                yang sudah dalam konteks satu proyek lewat picker halaman. */}
            {jenisBaru === "induk" && (
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Proyek
                <select value={proyekForm} onChange={(e) => setProyekForm(e.target.value)}
                  style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }}>
                  <option value="">Pilih proyek</option>
                  {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Nomor
              <input type="text" value={form.nomor} onChange={(e) => setForm((f) => ({ ...f, nomor: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Judul
              <input type="text" value={form.judul} onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Tanggal Tanda Tangan
              <input type="date" value={form.tanggal_tanda_tangan} onChange={(e) => setForm((f) => ({ ...f, tanggal_tanda_tangan: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Nilai (Rp)
              <input type="number" value={form.nilai} onChange={(e) => setForm((f) => ({ ...f, nilai: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Retensi (%)
              <input type="number" value={form.retensi_pct} onChange={(e) => setForm((f) => ({ ...f, retensi_pct: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Syarat Pembayaran (opsional)
              <input type="text" value={form.syarat_pembayaran} onChange={(e) => setForm((f) => ({ ...f, syarat_pembayaran: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box" }} />
            </label>
            {galatForm && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatForm}
              </div>
            )}
            <button type="button" onClick={() => void simpanKontrak()} disabled={mengirim}
              style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer" }}>
              {mengirim ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </BottomSheet>

        <BottomSheet terbuka={!!batalTarget} onTutup={() => setBatalTarget(null)} judul={`Batalkan — ${batalTarget?.nomor ?? ""}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              {batalTarget?.judul} akan ditandai <strong>Dibatalkan</strong>. Tindakan ini
              butuh alasan — pihak yang menandatangani berhak tahu kenapa kontraknya ditarik.
            </p>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Alasan pembatalan
              <textarea
                value={alasanBatal}
                onChange={(e) => setAlasanBatal(e.target.value)}
                rows={3}
                style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
              />
            </label>
            {galatBatal && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatBatal}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button" onClick={() => setBatalTarget(null)} disabled={mengirimBatal}
                style={{ flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, cursor: mengirimBatal ? "default" : "pointer" }}
              >
                Batal
              </button>
              <button
                type="button" onClick={() => void konfirmasiBatal()} disabled={mengirimBatal}
                style={{ flex: 1, minHeight: 48, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--danger)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirimBatal ? "default" : "pointer" }}
              >
                {mengirimBatal ? "Membatalkan…" : "Ya, Batalkan Kontrak"}
              </button>
            </div>
          </div>
        </BottomSheet>
      </div>
    );
  }
  ```

- [ ] **Step 4: `admin-portal/kontrak/asuransi/page.tsx`**

  Salin `pm-portal/kontrak-lengkap/asuransi/page.tsx` HAMPIR APA ADANYA
  (sudah company-wide by default) — hanya ganti:
  1. Judul halaman "Register Asuransi" tetap sama (tak perlu diubah).
  2. Path impor `../../_bersama/tipe` → `../../_bersama/tipe` (relatif SAMA
     — struktur folder `admin-portal/kontrak/asuransi/` persis
     `pm-portal/kontrak-lengkap/asuransi/`, dua level ke `_bersama`).
  3. Komentar kepala berkas — jelaskan ini Task 8 Portal Admin, BUKAN Task
     12 Portal PM.

  Fungsionalitas (picker "Semua proyek" sebagai default, form Polis Baru,
  4 kartu ringkas aktif/segera-berakhir/kadaluarsa/tanpa-polis) disalin
  IDENTIK — tak ada logic baru.

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/app/admin-portal/kontrak apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): register kontrak company-wide + asuransi — Tahap 2"
  ```

### Task 9: Kontrak — EOT + Denda Keterlambatan + Register Jaminan + Klaim Kontraktual (per-proyek)

**Files:**
- Create: `apps/web/app/admin-portal/kontrak/eot-ld-bond/page.tsx`
- Create: `apps/web/app/admin-portal/kontrak/klaim/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah `EotProyek`,
  `TanggalEfektifKontrak`, `RespEot`, `HasilLD`, `RespLd`, `BondProyek`,
  `BarisBondRingkas`, `RingkasBond`, `RespBond`, `KlaimKontraktual`,
  `BatasPemberitahuan`, `RespKlaimKontraktual`)

**Interfaces:**
- Consumes: `GET/POST /api/v1/projects/:id/eot`, `PATCH /api/v1/eot/:id/
  decide`, `GET /api/v1/projects/:id/liquidated-damages` (baca-saja),
  `GET/POST/PATCH /api/v1/bonds` — semuanya per-proyek, `projects:view`
  (baca)/`projects:edit` (tulis); `GET/POST /api/v1/projects/:id/claims`,
  `PATCH /api/v1/claims/:id/decide` — per-proyek, `projects:view`/
  `projects:edit`.
- Produces: `/admin-portal/kontrak/eot-ld-bond`, `/admin-portal/kontrak/
  klaim` — DUA halaman terpisah (bukan digabung satu SegmentedTab 4-arah)
  supaya tiap halaman tetap fokus satu domain; EOT/LD/Bond sudah 3-arah
  sendiri lewat SegmentedTab, menambah klaim jadi tab ke-4 di halaman yang
  sama membuatnya terlalu padat untuk satu layar HP.

⚠ **KEDUANYA per-proyek murni — project-picker WAJIB**, beda dari Task 7-8.
Salinan APA ADANYA dari PM Portal (endpoint backend tak beda per role
pemanggil, admin/direktur punya `projects:view`+`projects:edit` PERSIS sama
seperti PM — live 2026-08-22).

- [ ] **Step 1: Baca ulang KEDUA halaman PM PENUH sebelum menulis**
  (`eot-ld-bond/page.tsx` 474 baris, `klaim/page.tsx` 354 baris).

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  Salin PERSIS `pm-portal/_bersama/tipe.ts:1038-1198` (11 interface + 1 type
  alias — `EotProyek`, `TanggalEfektifKontrak`, `RespEot`, `HasilLD`,
  `RespLd`, `BondProyek`, `BarisBondRingkas`, `RingkasBond`, `RespBond`,
  `KeadaanBatasPemberitahuan`, `BatasPemberitahuan`, `KlaimKontraktual`,
  `RespKlaimKontraktual` — kode lengkap di riset Task 6 di atas).

- [ ] **Step 3: `admin-portal/kontrak/eot-ld-bond/page.tsx`**

  Salin `pm-portal/kontrak-lengkap/eot-ld-bond/page.tsx` (474 baris) APA
  ADANYA — struktur SegmentedTab 3-arah (EOT/LD/Bond), project-picker,
  form pengajuan EOT + keputusan, form jaminan baru. HANYA ubah:
  1. Komentar kepala berkas (Task 9 Portal Admin, bukan Task 13 Portal PM).
  2. Path impor tipe (`../../_bersama/tipe` — struktur folder sama persis).
  3. `daftarProyek` TIDAK memfilter `.filter((p) => p.pm)` — pola sama
     Task 7 (`GET /api/v1/projects` company-wide, admin lihat SEMUA proyek
     sebagai kandidat picker, bukan hanya yang PM-nya assigned).

  ⚠ Poin 3 adalah SATU-SATUNYA perbedaan fungsional dari versi PM — picker
  di sini menawarkan proyek TANPA PM assigned juga (relevan buat admin yang
  mungkin mengurus proyek sebelum PM ditugaskan).

- [ ] **Step 4: `admin-portal/kontrak/klaim/page.tsx`**

  Salin `pm-portal/kontrak-lengkap/klaim/page.tsx` (354 baris) APA ADANYA
  dengan perubahan IDENTIK 3 poin Step 3 (komentar kepala, path impor,
  `daftarProyek` tanpa filter `.pm`).

  ⚠ Perhatikan komentar asli soal validasi: `validasiKeputusanKlaim` menolak
  422 bila status `disetujui` tapi `amount_approved !== amount_claimed` —
  form di halaman PM sudah menyediakan field nilai disetujui untuk KEDUA
  status (disetujui/disetujui_sebagian) supaya galat 422 tersurfeskan lewat
  `galatForm`, bukan disembunyikan. Perilaku ini disalin apa adanya.

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/app/admin-portal/kontrak apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): EOT+LD+Bond dan klaim kontraktual per-proyek — Tahap 2"
  ```

### Task 10: Kontrak — Surat (lintas-proyek) + Change Order (per-proyek, gerbang approve admin-only)

**Files:**
- Create: `apps/web/app/admin-portal/kontrak/surat/page.tsx`
- Create: `apps/web/app/admin-portal/kontrak/change-order/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah
  `SuratProyek`, `KeadaanBalas`, `BatasBalas`, `RespSuratLintasProyek`, dan
  — SETELAH Step 1 membaca ulang bentuk asli — `ChangeOrderProyek`/
  `RespChangeOrder`/`RespApproveCo` dari `pm-portal/_bersama/tipe.ts`)

**Interfaces:**
- Consumes: `GET /api/v1/letters` (lintas-proyek, opsional `?arah=`/
  `?status=`/`?project_id=`), `GET/POST /api/v1/projects/:id/letters`,
  `PATCH /api/v1/letters/:id` — `documents:manage` (admin DAN direktur,
  live 2026-08-22); `GET/POST /api/v1/projects/:id/change-orders` + item
  CRUD + `PATCH .../submit` — `projects:edit` (admin+direktur); `PATCH
  /api/v1/change-orders/:id/{approve,reject}` — otoritas SESUNGGUHNYA di
  `approval_chains`/`approval_steps` (`required_permission =
  'change_order:approve'`, HANYA admin, live 2026-08-22 — direktur TIDAK).
- Produces: `/admin-portal/kontrak/surat` (company-wide baca), `/admin-
  portal/kontrak/change-order` (per-proyek, tombol approve/reject
  disembunyikan TOTAL untuk direktur).

⚠ **Surat HAMPIR salinan langsung** (`GET /api/v1/letters` SENGAJA dirancang
lintas-proyek, PM Portal sudah memakainya sebagai default) — perubahan
hanya komentar kepala + path impor, TANPA perubahan filter (tak ada
`.filter((p) => p.pm)` di halaman aslinya untuk disunting — form "Surat
Baru" memang sudah memilih project_id dari SELURUH daftar proyek yang
tersedia lewat select, bukan daftar yang difilter kepemilikan).

⚠ **Change Order WAJIB menyalin gerbang `change_order:approve` PERSIS** —
ini kasus KONKRET pertama Tahap 2 di mana direktur (subset permission
murni admin) benar-benar kehilangan sebuah kemampuan tulis: direktur bisa
membuat CO, menambah item, submit — TAPI TIDAK bisa approve/reject. Tombol
itu TIDAK DIRENDER (bukan `disabled`) untuk direktur, pola identik PM
Portal (`useSyncExternalStore` + `hasPermission`).

- [ ] **Step 1: Baca ulang KEDUA halaman PM PENUH sebelum menulis** —
  `surat/page.tsx` (267 baris) dan `change-order/page.tsx` (605 baris,
  BACA SELURUHNYA termasuk komentar riset Task 21 PM di kepala berkas
  perihal bentuk `ChangeOrderProyek` — brief lama menebak salah total,
  dan Task 21 sudah mengoreksinya lewat riset langsung ke
  `change-orders.ts`, 1017 baris). Salin bentuk `ChangeOrderProyek`/
  `RespChangeOrder`/`RespApproveCo` PERSIS dari `pm-portal/_bersama/
  tipe.ts` yang sudah diverifikasi Task 21 — JANGAN meriset ulang dari nol.

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  Salin PERSIS `pm-portal/_bersama/tipe.ts:1216-1249` (`KeadaanBalas`,
  `BatasBalas`, `SuratProyek`, `RespSuratLintasProyek` — kode lengkap di
  riset Task 6 di atas) DAN bentuk `ChangeOrderProyek`/`RespChangeOrder`/
  `RespApproveCo` dibaca ulang Step 1 (tak disalin di sini karena belum
  dibaca detail saat breakdown ini ditulis — Task 10 WAJIB membacanya
  sendiri sebelum menyalin, bukan menebak dari nama field).

- [ ] **Step 3: `admin-portal/kontrak/surat/page.tsx`**

  Salin `pm-portal/kontrak-lengkap/surat/page.tsx` (267 baris) APA ADANYA —
  SegmentedTab masuk/keluar, `GET /api/v1/letters?arah=` sebagai default,
  form Surat Baru dengan pemilih proyek + saklar butuh-balasan. HANYA ubah
  komentar kepala berkas (Task 10 Portal Admin) dan path impor.

- [ ] **Step 4: `admin-portal/kontrak/change-order/page.tsx`**

  Salin `pm-portal/kontrak-lengkap/change-order/page.tsx` (605 baris) APA
  ADANYA — TERMASUK gerbang `bolehApprove = useSyncExternalStore(langganan,
  () => hasPermission("change_order:approve"), () => false)` dan seluruh
  logic `billing_mode`/item CRUD/`recalcTotalDelta()` sisi klien. HANYA
  ubah:
  1. Komentar kepala berkas (Task 10 Portal Admin) — TETAP JELASKAN gerbang
     permission (komentar asli sudah akurat: `change_order:approve` HANYA
     admin/`project_manager_senior` — untuk admin-portal berarti admin
     LOLOS, direktur TIDAK, dikonfirmasi ulang live 2026-08-22).
  2. Path impor tipe.
  3. `daftarProyek` TIDAK memfilter `.filter((p) => p.pm)` — pola sama
     Task 7/9.

  ⚠ JANGAN mengubah gerbang `bolehApprove` dengan asumsi "admin-portal
  pasti admin, jadi tak perlu digerbang" — portal ini dipakai DUA role
  (admin+direktur), dan direktur genuinely tak boleh approve. Menghapus
  gerbang berarti direktur mendapat tombol yang pasti 403 saat diklik.

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Verifikasi manual — akun direktur uji (0 user aktif, wajib
  akun sengaja dibuat)**

  Buka `/admin-portal/kontrak/change-order` dengan akun direktur uji —
  konfirmasi tombol Setujui/Tolak TIDAK TAMPIL sama sekali (bukan
  disabled), sementara form buat CO + tambah item tetap berfungsi.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/app/admin-portal/kontrak apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): surat lintas-proyek + change order (gerbang approve admin-only) — Tahap 2"
  ```

### Task 11: Jadwal — CPM + Histogram + Method Statement + Baseline (per-proyek) + Analisa Keterlambatan (company-wide)

**Files:**
- Create: `apps/web/app/admin-portal/jadwal/page.tsx`
- Create: `apps/web/app/admin-portal/jadwal/keterlambatan/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah tipe CPM/
  histogram/method-statement/baseline dari `pm-portal/jadwal/page.tsx`
  inline interfaces — file itu mendefinisikan tipenya LOKAL, bukan di
  `_bersama/tipe.ts`, lihat Step 1)

**Interfaces:**
- Consumes: `GET /api/v1/jadwal-cpm/:projectId` (per-proyek,
  `projects:view`), `GET/POST /api/v1/proyek/:id/baseline`, `GET /api/v1/
  proyek/:id/baseline/pergeseran` (per-proyek, baca `projects:view`, tulis
  `projects:baseline:manage` — admin+direktur SAMA-SAMA punya, live
  2026-08-22); `GET /api/v1/analisa-keterlambatan?project_id=` (company-
  wide, `project_id` opsional, READ-ONLY — nol endpoint tulis).
- Produces: `/admin-portal/jadwal` (sudah ada di grup navigasi yang akan
  diaktifkan Task 12), `/admin-portal/jadwal/keterlambatan`.

⚠ **`pm-portal/jadwal/page.tsx` mendefinisikan tipe CPM/histogram/method-
statement/baseline SEBAGAI INTERFACE LOKAL di file itu sendiri** (`
PekerjaanCpm`, `PeriodeSumberDaya`, `HistogramSumberDaya`,
`MethodStatementItem`, `RespJadwalCpm`, `BaselineRingkas`,
`RespBaselineList`, `RingkasPergeseran`, `BarisPergeseran`,
`RespPergeseran` — 10 interface, baris 36-98 file itu) — BUKAN di
`_bersama/tipe.ts` seperti modul lain. Task ini punya DUA pilihan yang sah:
(a) salin kesepuluh interface itu ke `admin-portal/_bersama/tipe.ts`
mengikuti pola modul lain di plan ini, atau (b) definisikan lokal di
`admin-portal/jadwal/page.tsx` sendiri mengikuti pola PM Portal APA ADANYA.
**Pilih (b)** — konsisten dengan sumber aslinya, dan tipe CPM/histogram
genuinely spesifik untuk satu halaman ini saja (tak dipakai halaman admin
lain), beda dari `DokumenKontrak`/`EotProyek`/dst yang dipakai lintas
beberapa file portal.

- [ ] **Step 1: Baca ulang KEDUA halaman PM PENUH** — `jadwal/page.tsx`
  (403 baris, termasuk 10 interface lokal baris 36-98) dan
  `kontrak-lengkap/keterlambatan/page.tsx` (159 baris).

- [ ] **Step 2: `admin-portal/jadwal/page.tsx`**

  Salin `pm-portal/jadwal/page.tsx` (403 baris, TERMASUK 10 interface
  lokal) APA ADANYA — SegmentedTab 4-arah (CPM/Histogram/Method
  Statement/Baseline), project-picker, form "Tetapkan Baseline Baru".
  HANYA ubah:
  1. Komentar kepala berkas (Task 11 Portal Admin, bukan versi PM).
  2. Path impor `../_bersama/tipe` (struktur folder sama — satu level ke
     `_bersama`).
  3. `daftarProyek` TIDAK memfilter `.filter((p) => p.pm)` — pola sama
     Task 7/9/10.

  ⚠ Baseline TETAP append-only (tak bisa disunting/dihapus) — peringatan
  di BottomSheet form disalin apa adanya, ini invariant backend (trigger
  DB), bukan sekadar teks UI.

- [ ] **Step 3: `admin-portal/jadwal/keterlambatan/page.tsx`**

  ```tsx
  "use client";

  // ============================================================================
  // Analisa Keterlambatan — Portal Admin/Direktur (Task 11). COMPANY-WIDE:
  // `GET /api/v1/analisa-keterlambatan` TANPA `project_id` sudah lintas
  // seluruh proyek tenant (`analisa-keterlambatan.ts`, riset Task 6) — PM
  // Portal SUDAH memakainya company-wide by default (proyekId kosong =
  // "Semua proyek"). Salinan HAMPIR langsung, hanya beda kepala berkas.
  //
  // GET /api/v1/analisa-keterlambatan?project_id=  — projects:view, READ-ONLY.
  //
  // Kenapa read-only (komentar route asli, apps/api/src/routes/v1/
  // analisa-keterlambatan.ts): "Angka yang bisa disunting berhenti jadi
  // dasar apa pun — dan yang paling berkepentingan menyuntingnya adalah
  // pihak yang sedang dituduh terlambat." Tidak ada tombol tulis di
  // halaman ini sama sekali.
  // ============================================================================

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

  export default function AdminAnalisaKeterlambatanPage() {
    const [proyekId, setProyekId] = useState("");
    // Company-wide — TANPA filter `.pm`, beda dari versi PM (pola Task 7/9/10).
    const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
    const daftarProyek = dataProyek?.projects ?? [];

    const url = proyekId ? `/api/v1/analisa-keterlambatan?project_id=${proyekId}` : "/api/v1/analisa-keterlambatan";
    const { data, memuat, galat } = useData<RespAnalisaKeterlambatan>(url);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Analisa Keterlambatan
        </h1>

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

        {memuat && <SkeletonCard tinggi={140} />}
        {galat && <EmptyState icon={AlarmClock} judul="Gagal memuat" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />}

        {!memuat && data && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Berjalan Terlambat", value: String(data.jumlah_berjalan_terlambat), warna: "var(--danger)" },
              { label: "Telat Terparah (hari)", value: String(data.telat_terparah), warna: "var(--warning)" },
              { label: "Estimasi Paparan", value: fmtRupiah(data.total_estimasi_paparan), warna: "var(--navy)" },
            ].map((k) => (
              <div key={k.label} style={{ flex: "1 1 30%", padding: "var(--pad-kartu)", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.warna }}>{k.value}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k.label}</div>
              </div>
            ))}
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
          <div key={b.milestone_id} style={{ padding: "var(--pad-kartu-lega)", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
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

  ⚠ Beda SATU baris dari versi PM: `daftarProyek` tanpa filter `.filter((p)
  => p.pm)` (pola konsisten Task 7/9/10 — company-wide berarti admin
  melihat SEMUA proyek di picker, bukan hanya yang PM-nya sudah assigned).

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

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/admin-portal/jadwal apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): jadwal CPM+baseline per-proyek + analisa keterlambatan company-wide — Tahap 2"
  ```

### Task 12: Navigasi kategori Tahap 2 + verifikasi akhir tahap

**Files:**
- Modify: `apps/web/lib/admin-portal-kategori.ts` (tambah `g-kontrak`,
  `g-jadwal` ke `KATEGORI_AKTIF`)
- Modify: `apps/web/app/admin-portal/kategori/[key]/page.tsx` (tambah 8
  entri ke `PETA_HREF_PORTAL`)
- Modify: `apps/web/app/admin-portal/layout.tsx` (opsional — pertimbangkan
  menambah "Kontrak"/"Jadwal" ke `NAV_ITEMS` bottom-nav bila ruang cukup;
  default TETAP lewat `/admin-portal/kategori` seperti Tahap 1 bila
  bottom-nav sudah padat, lihat Step 1)

**Interfaces:**
- Consumes: hasil Task 7-11 (Proyek + Kontrak + Jadwal berfungsi).
- Produces: kategori `g-kontrak` (Kontrak) dan `g-jadwal` (Perencanaan)
  AKTIF di `/admin-portal/kategori`, dengan 8 item mengarah ke halaman
  admin-portal sungguhan (bukan fallback href web).

⚠ Mengikuti KOREKSI MEKANISME Task 5 — `KATEGORI_AKTIF` level GRUP
(`g-kontrak`/`g-jadwal`), `PETA_HREF_PORTAL` level ITEM (kunci `ItemMenu`
seperti `kt-register`), dan mengaktifkan grup berarti item LAIN di grup
yang sama (`kt-termin`/`kt-retensi`/`kt-rfi`/`kt-subkon` di `g-kontrak`;
`jd-wbs`/`jd-gantt`/`jd-kurva-s`/`jd-lookahead`/`jd-milestone`/`jd-evm` di
`g-jadwal`) IKUT TAMPIL dengan fallback href web — perilaku disengaja, pola
sama Task 5.

- [ ] **Step 1: Konfirmasi ulang isi grup `g-kontrak`/`g-jadwal` PENUH di
  `peta-menu.ts`** sebelum commit — baca ulang baris 121-151 (riset Task 6
  di atas mengutipnya, TAPI verifikasi ke file nyata kalau sudah berubah
  antara riset dan implementasi Task 12). Putuskan penambahan `NAV_ITEMS`
  di Step Files berdasar jumlah entri final (bottom-nav mobile biasanya
  maksimal 5 item termasuk "Lainnya" — Tahap 1 sudah pakai 4, cek
  `PortalShell` apakah ada batas keras sebelum menambah).

- [ ] **Step 2: Update `admin-portal-kategori.ts`**

  ```ts
  // Tahap 2 (Task 7-11): "Kontrak" (g-kontrak, item kt-register/kt-
  // asuransi/kt-co/kt-eot/kt-ld/kt-bond/kt-claims/kt-surat — 8 dari 12 item
  // grup ini) dan "Perencanaan" (g-jadwal, item jd-cpm/jd-delay — 2 dari 9
  // item grup ini). Proyek TIDAK di sini — bukan grup `peta-menu.ts`
  // tersendiri (Proyek adalah entitas inti, bukan menu), diakses lewat
  // NAV_ITEMS langsung (Task 1 Step 2, href /admin-portal/proyek).
  const KATEGORI_AKTIF: string[] = ["g-laporan", "g-sistem", "g-kontrak", "g-jadwal"]; // Tahap 1-2
  ```

- [ ] **Step 3: Update `PETA_HREF_PORTAL` inline di `kategori/[key]/page.tsx`**

  ```ts
  const PETA_HREF_PORTAL: Record<string, string> = {
    "bi-eksekutif": "/admin-portal",
    "sy-inbox-approval": "/admin-portal/inbox",
    // Tahap 2 — Kontrak (g-kontrak)
    "kt-register": "/admin-portal/kontrak/register",
    "kt-asuransi": "/admin-portal/kontrak/asuransi",
    "kt-co": "/admin-portal/kontrak/change-order",
    "kt-eot": "/admin-portal/kontrak/eot-ld-bond",
    "kt-ld": "/admin-portal/kontrak/eot-ld-bond",
    "kt-bond": "/admin-portal/kontrak/eot-ld-bond",
    "kt-claims": "/admin-portal/kontrak/klaim",
    "kt-surat": "/admin-portal/kontrak/surat",
    // Tahap 2 — Perencanaan (g-jadwal)
    "jd-cpm": "/admin-portal/jadwal",
    "jd-delay": "/admin-portal/jadwal/keterlambatan",
  };
  ```

  ⚠ `kt-eot`/`kt-ld`/`kt-bond` SAMA-SAMA menunjuk satu halaman
  (`eot-ld-bond`, SegmentedTab 3-arah) — pola sama `jd-cpm` yang menaungi
  4 tab (CPM/Histogram/Method/Baseline) dalam satu href. Ini KONSISTEN
  dengan `peta-menu.ts` sendiri, yang juga memakai satu `href` untuk
  beberapa `tabProyek` berbeda pada item lain.

- [ ] **Step 4: Verifikasi lantai penjaga ratchet TIDAK naik dari baseline
  Task 5**

  ```bash
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && node scripts/format-ratchet.mjs
  cd apps/web && node scripts/audit-halaman-pakai-cache.mjs
  ```

  Bandingkan angka ke commit Task 5 — laporkan SELISIH, bukan cuma exit
  code.

- [ ] **Step 5: typecheck + build + guard lengkap**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && pnpm build
  cd apps/api && node scripts/jalankan-semua-penjaga.mjs
  ```

  Tempel ringkasan run sungguhan (CHARTER §7) — SEMUA penjaga.

- [ ] **Step 6: a11y runtime penuh (akun admin) + catatan direktur**

  ```bash
  LAYAR_EMAIL=$(grep '^LAYAR_EMAIL' apps/web/.env.local|cut -d= -f2-|tr -d '"\r') \
  LAYAR_SANDI=$(grep '^LAYAR_SANDI' apps/web/.env.local|cut -d= -f2-|tr -d '"\r') \
    node apps/web/scripts/jalankan-a11y-lengkap.mjs
  ```

  Cek `/admin-portal/proyek`, `/admin-portal/proyek/:id` (redirect — pastikan
  TIDAK di-flag sebagai pelanggaran karena halaman kosong sesaat),
  `/admin-portal/kontrak/*` (6 halaman), `/admin-portal/jadwal`,
  `/admin-portal/jadwal/keterlambatan` termasuk yang di-scan. Catat di
  JOURNAL: tombol approve/reject Change Order TIDAK bisa di-a11y-scan untuk
  kondisi "direktur tanpa tombol itu" memakai akun admin (0 user direktur
  aktif) — butuh akun uji terpisah untuk memverifikasi keadaan itu benar2
  hilang dari DOM (bukan cuma disabled), bukan hanya dari kode.

- [ ] **Step 7: Verifikasi backend terkait**

  ```bash
  cd apps/api && npx vitest run kontrak
  cd apps/api && npx vitest run asuransi
  cd apps/api && npx vitest run rantai-kontrak
  cd apps/api && npx vitest run jadwal-cpm
  cd apps/api && npx vitest run analisa-keterlambatan
  cd apps/api && npx vitest run surat
  ```

  Tempel ringkasan run sungguhan — memastikan Tahap 2 tidak menyentuh
  backend (constraint global plan ini), test yang ADA tetap hijau tanpa
  perubahan.

- [ ] **Step 8: Update dokumen**

  - `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` — tandai `kt-register`,
    `kt-asuransi`, `kt-co`, `kt-eot`, `kt-ld`, `kt-bond`, `kt-claims`,
    `kt-surat`, `jd-cpm`, `jd-delay` sebagai punya halaman admin-portal.
  - `docs/execution/JOURNAL.md` — entri ringkas Tahap 2 selesai, termasuk
    catatan direktur/`change_order:approve` dari Step 6.

- [ ] **Step 9: Commit**

  ```bash
  git add apps/web/lib/admin-portal-kategori.ts apps/web/app/admin-portal/kategori/\[key\]/page.tsx apps/web/app/admin-portal/layout.tsx docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md docs/execution/JOURNAL.md
  git commit -m "feat(admin-portal): navigasi kategori Tahap 2 + verifikasi akhir tahap"
  ```

---

## Tahap 3: Keuangan + Akuntansi

### Task 13: Riset & breakdown — Keuangan + Akuntansi (Tahap 3)

**Files:**
- Modify (dokumen ini): tambah Task 14+ dengan breakdown lengkap Tahap 3
  berdasar riset task ini.

**Interfaces:**
- Consumes: hasil Tahap 1-2 (shell+layout+gerbang+Dashboard+Inbox+Proyek+
  Kontrak+Jadwal berfungsi, pola `useData`/`hasPermission`/token kerapatan/
  `formatRupiah`/`formatTanggal`/cross-link+WAJAR established).
- Produces: daftar Task konkret bernomor untuk Tahap 3, ditulis LANGSUNG
  ke dokumen plan ini (pola sama Task 2/6).

- [ ] **Step 1: Baca halaman web yang sudah ada untuk Keuangan + Akuntansi**

  Baca `apps/web/app/(dashboard)/keuangan/*` (dashboard, kas, gl,
  rekonsiliasi-bank, piutang, ipc, pengadaan-lanjutan — verifikasi struktur
  PERSIS ke `lib/peta-menu.ts` grup `g-keuangan`/`g-tagih`, JANGAN
  menebak dari nama folder) dan `apps/web/app/(dashboard)/akuntansi/*`
  (kalau ada folder terpisah — cek `peta-menu.ts` untuk grup yang benar,
  akuntansi mungkin bagian `g-keuangan` juga, bukan grup sendiri).

- [ ] **Step 2: Baca endpoint backend**

  `apps/api/src/routes/v1/finance.ts`, `cash.ts`, `gl.ts`,
  `rekonsiliasi-bank.ts`, `pengadaan-lanjutan.ts` (atau nama sebenarnya).
  Rujuk Portal PM Tahap 6 (`docs/superpowers/plans/
  2026-08-20-portal-pm-lengkap.md`, Task 32-37) sebagai peta AWAL kalau
  ada, TAPI verifikasi ULANG semua endpoint/field/permission untuk
  konteks admin — JANGAN asumsikan sama persis (pola sama Task 6:
  Register Kontrak PM vs admin punya shape company-wide BERBEDA).

  **PERHATIAN KHUSUS — money-safety hard constraint (CLAUDE.md §6):**
  `payments` adalah SATU-SATUNYA entitas tulis tanpa kolom `status`.
  `cash_account_id` DIPAKU NULL sengaja di `apps/api/src/lib/
  tulis-klaim.ts` untuk cegah kalimat WhatsApp salah dengar memindahkan
  uang sungguhan. JANGAN PERNAH menyentuh file itu atau "melengkapi"
  kolom itu — ini larangan PERMANEN, bukan spesifik plan ini.

  **GL void non-atomicity** (dicatat JOURNAL.md dari Portal PM Task 34):
  `PATCH /gl/journal/:id/void` kurang `.eq('status','posted')` — bug
  backend YANG SUDAH DIKETAHUI, JANGAN diperbaiki di sini (backend-only,
  di luar scope plan frontend-only ini), cukup diwarisi sebagai catatan
  kalau halaman GL admin-portal menyentuh area ini.

- [ ] **Step 3: Live query permission admin+direktur untuk SEMUA sub-modul**

  Pisah per role_id (2 baris masing-masing, KONSISTEN pola 6 task
  sebelumnya). Permission APA yang menggerbangi `gl:post`/`gl:void`/
  `gl:periode:reopen` (INGAT: riset Task 6 mengoreksi `gl:periode:reopen`
  BUKAN direktur-eksklusif seperti tercatat semula di spec — dipegang
  admin JUGA, verifikasi ulang untuk memastikan koreksi itu masih akurat).

- [ ] **Step 4: Tentukan company-wide vs per-proyek per sub-modul**

  Dashboard Keuangan/Piutang/IPC kemungkinan company-wide (agregat).
  Kas/GL/Rekonsiliasi Bank kemungkinan company-wide juga (akun kas/GL
  milik company, bukan proyek). Pengadaan-lanjutan (kontrak
  payung/expediting/nota kredit) verifikasi ke endpoint — bisa jadi
  campuran.

- [ ] **Step 5: Tulis Task 14+ ke dokumen ini**

  Kode LENGKAP untuk: Dashboard Keuangan/Piutang/IPC, Kas Management, GL
  (dengan perhatian KHUSUS pada gerbang `gl:post`/`gl:void`/
  `gl:periode:reopen` — verifikasi render-gate bukan disabled, pola sama
  Task 10 Change Order), Rekonsiliasi Bank, Kontrak Payung/Expediting/
  Nota Kredit. Sertakan task navigasi+verifikasi akhir Tahap 3 di akhir
  (pola sama Task 5/12).

- [ ] **Step 6: Commit breakdown**

  ```bash
  git add docs/superpowers/plans/2026-08-22-portal-admin-direktur-lengkap.md
  git commit -m "docs(plan): breakdown Tahap 3 — Keuangan + Akuntansi"
  ```

### Hasil riset Task 13 (2026-08-22) — ringkasan sebelum Task 14-19

**Struktur `peta-menu.ts` — VERIFIKASI, bukan tebakan dari nama folder.**
Keuangan + Akuntansi hidup di **DUA grup**, bukan satu, dan "Akuntansi" BUKAN
grup sendiri:

- `g-keuangan` (Keuangan, urutan 140) — 18 item: GL/Jurnal (`fn-gl`/
  `fn-jurnal` → `/akuntansi?tab=besar`/`?tab=jurnal`), Kunci API/Markup
  (`set-api-key`/`set-markup`, TIDAK relevan Tahap 3 — sudah `pengaturan`),
  Peta Akun/Jurnalkan Invoice (`gl-peta-akun`/`gl-jurnalkan` →
  `/akuntansi/peta-akun`/`/akuntansi/jurnalkan`), Utang Supplier (`fn-ap` →
  `/procurement/hutang`, LUAR cakupan Tahap 3 — domain procurement), Piutang
  Klien (`fn-ar` → `/piutang`), Kas & Bank + Rekonsiliasi + Kas Kecil
  (`fn-kas`/`fn-rekonsiliasi`/`fn-petty` → `/kas`/`/kas/rekonsiliasi`),
  Aset Tetap (`fn-aset-tetap` → `/aset`, LUAR cakupan — domain Aset Tahap
  4), PPN & PPh/e-Faktur (`fn-pajak`/`fn-efaktur` → `/laporan?tab=pajak`,
  LUAR cakupan Tahap 3 — laporan pajak, bukan GL/Kas), Laporan Keuangan/
  Pengakuan Pendapatan (`fn-laporan`/`fn-wip` → `/akuntansi?tab=laporan`/
  `/laporan?tab=wip`), Tutup Buku (`fn-tutup-buku` → `/akuntansi/periode`),
  Audit Trail (`fn-audit` → `/audit`, LUAR cakupan — modul Sistem Tahap 7).
- `g-tagih` (Penagihan, urutan 150) — 8 item: Progress Billing/Termin/
  Tagihan Pekerjaan Tambah (`tg-progress`/`tg-termin`/`tg-tambah` →
  `/keuangan`), IPC (`tg-ipc` → `/keuangan/ipc`), Retensi/Uang Muka
  (`tg-retensi`/`tg-uangmuka` → `/piutang`), Invoice & Faktur Pajak
  (`tg-invoice` → `/keuangan/invoice`, LUAR cakupan — form invoice detail,
  tak diriset Task 2/6 sebagai pola portal), Follow-Up Penagihan
  (`tg-followup` → `/piutang`), Nota Kredit (`tg-nota-kredit` →
  `/procurement/lanjutan?bagian=nota`).

**Tak ada folder `apps/web/app/(dashboard)/akuntansi/` terpisah secara
konsep** — ia ADA sebagai folder fisik (`akuntansi/page.tsx` 883 baris +
`akuntansi/{jurnalkan,periode,peta-akun}`), tapi `peta-menu.ts` memetakannya
ke item-item `g-keuangan` (`fn-gl`, `fn-jurnal`, `fn-laporan`, `fn-wip`,
`fn-tutup-buku`, `gl-peta-akun`, `gl-jurnalkan`) — bukan grup navigasi
sendiri. Portal ini karena itu punya SATU kategori "Keuangan" yang
menaungi keduanya, konsisten pendekatan Task 3 (Dashboard Eksekutif sudah
company-wide tanpa distingsi GL-vs-Kas).

**Cakupan Tahap 3 dipersempit dari 26 item mentah jadi 6 sub-modul** —
Dashboard Keuangan/Piutang/IPC, Kas, GL, Rekonsiliasi Bank, Pengadaan
Lanjutan (Kontrak Payung/Expediting/Nota Kredit). Item yang DIKELUARKAN
eksplisit (dan alasannya): Utang Supplier + PPN&PPh/e-Faktur (domain
procurement/pajak, bukan Keuangan inti), Aset Tetap (Tahap 4), Audit Trail
(Tahap 7), Kunci API/Markup (`pengaturan`, sudah tercakup gerbang settings
read-only Tahap 7), Invoice & Faktur Pajak detail (form kompleks, di luar
pola ringkas mobile — dicatat sebagai concern, bukan silent drop).

**Portal PM SUDAH membangun modul yang HAMPIR identik** —
`apps/web/app/pm-portal/keuangan/{dashboard,piutang,ipc,kas,kas/[id],
gl,gl/jurnal/[id],rekonsiliasi-bank,rekonsiliasi-bank/[id],
pengadaan-lanjutan}/page.tsx` (Portal PM Task 32-36, 3.106 baris total).
Pola breakdown Tahap 3 karena itu **menyalin APA ADANYA + menghapus filter
`.pm`/menambah tombol yang PM tak punya tapi admin/direktur punya** — BUKAN
menulis dari nol. Ini kasus PALING BANYAK PENYIMPANGAN dari pola "salin
lurus" sejauh plan ini, karena permission admin/direktur BERBEDA dari PM
di banyak titik (tabel di bawah), bukan cuma "admin+direktur = superset PM".

**GL detail jurnal (`pm-portal/keuangan/gl/jurnal/[id]/page.tsx`) TIDAK
PUNYA render-gate `hasPermission` sama sekali** untuk tombol "+ Akun"/
"+ Jurnal"/"Posting"/"Batalkan" — PM mengandalkan backend 403 murni karena
SELURUH PM yang mencapai modul Keuangan sudah dipastikan `gl:manage`/
`gl:post`/`gl:void` (dikonfirmasi komentar kepala `gl/page.tsx`: "PM di
modul ini punya akses PENUH... BUKAN cuma view"). **Untuk admin-portal, pola
itu TIDAK BOLEH disalin apa adanya** — live query 2026-08-22 membuktikan
`direktur` TIDAK punya `gl:manage`/`gl:post`/`gl:void` sama sekali (lihat
tabel di bawah), jadi Task 15 WAJIB menambah render-gate yang tak ada di
sumber PM-nya. Ini kebalikan pola Task 10 (di mana PM SUDAH gerbang dan
admin-portal tinggal menyalin) — di sini admin-portal MENAMBAH gerbang baru.

**Live query permission admin vs direktur 2026-08-22** (pisah per role_id,
tenant uji `48befb54-…d8a0`, dikonfirmasi juga IDENTIK di seluruh 53 tenant
yang PUNYA peran admin/direktur (dari 1.018 company total di basis —
mayoritas tenant tak punya kedua role ini sama sekali) — satu SET
permission unik per role di antara 53 itu, bukan kebetulan company uji ini):

| permission | admin | direktur | menggerbangi |
|---|---|---|---|
| `finance:view:all` | ✅ | ❌ | `finance/summary`, `/cashflow-chart`, `/ar-aging`, `/retention-register`, `/dp-register`, `keuangan/ikhtisar` |
| `finance:view` | ✅ | ✅ | `sertifikat-ipc` GET (daftar+detail) |
| `finance:invoice:create` | ✅ | ✅ | `sertifikat-ipc` POST+setujui, `finance/invoices` POST |
| `finance:invoice:pay` | ✅ | ✅ | `finance/payments` (bayar invoice) |
| `finance:penalty:waive` | ✅ | ❌ | pembebasan denda keterlambatan (di luar cakupan 6 sub-modul Tahap 3 ini) |
| `cash:view` | ✅ | ✅ | `cash/accounts/:id` detail |
| `cash:account:manage` | ✅ | ✅ | buat akun kas, `cash/transfers/:id/cancel` |
| `cash:transfer:create` | ✅ | ✅ | `cash/transfers` POST |
| `cash:transfer:confirm` | ✅ | ✅ | `cash/transfers/:id/confirm` |
| `cash:expense:approve` | ✅ | ✅ | approve pengeluaran (lewat Inbox Task 4, TIDAK dibangun ulang di Kas) |
| `gl:view` | ✅ | ✅ | SEMUA GET `/gl/*` (accounts, journal-entries, ledger, trial-balance, laporan) |
| `gl:manage` | ✅ | ❌ | POST akun baru, POST jurnal baru |
| `gl:post` | ✅ | ❌ | `PATCH /gl/journal-entries/:id/post` |
| `gl:void` | ✅ | ❌ | `PATCH /gl/journal-entries/:id/void` |
| `gl:periode:view` | ✅ | ✅ | `GET /gl/periode`, `/kesiapan`, `/riwayat` |
| `gl:periode:manage` | ✅ | ✅ | `POST /gl/periode` (buat), `POST /gl/periode/:id/tutup` |
| `gl:periode:reopen` | ✅ | ✅ | `POST /gl/periode/:id/buka` — **koreksi Task 6 TERKONFIRMASI ULANG akurat**: BUKAN direktur-eksklusif seperti komentar kepala `tutup-buku.ts` ("hanya peran direktur"), admin JUGA punya. Komentar basi itu ADA DI DUA TEMPAT — baris ~24 (kepala berkas, "Membuka kembali... yang menandatanganinya direktur (`gl:periode:reopen`, hanya peran `direktur`)") DAN baris ~390 (di atas registrasi rute `POST /gl/periode/:id/buka`, "Capability TERPISAH (`gl:periode:reopen`, hanya direktur). Lihat kepala berkas.") — dicatat sebagai temuan, TIDAK diperbaiki keduanya (backend di luar scope). |
| `rekonsiliasi:view` | ✅ | ✅ | `GET /rekonsiliasi`, `/:id` |
| `rekonsiliasi:manage` | ✅ | ❌ | `POST /rekonsiliasi` (impor), `/cocokkan`, `/penyesuaian`, `DELETE /cocokkan/:id` |
| `rekonsiliasi:lock` | ✅ | ❌ | `POST /rekonsiliasi/:id/kunci` |
| `procurement:view` | ✅ | ✅ | `GET /pengadaan-lanjutan` |
| `procurement:po:manage` | ✅ | ✅ | POST kontrak payung/expediting/nota-kredit (MEMBUAT) |
| `procurement:payment:manage` | ✅ | ✅ | `PATCH .../nota-kredit/:id/{putuskan,terapkan}` — **BEDA dari PM**: PM Portal TIDAK punya izin ini (dicatat eksplisit di komentar `pm-portal/keuangan/pengadaan-lanjutan/page.tsx`), admin+direktur PUNYA — Task 18 WAJIB menambah tombol putuskan/terapkan yang TIDAK ADA di versi PM. |

⚠ **Temuan paling penting: `finance:view:all` adalah gerbang BACA yang
direktur TIDAK punya** — beda dari pola dominan plan ini ("direktur subset
permission murni, kehilangan kapabilitas TULIS tapi tetap bisa baca").
Dashboard Keuangan (`keuangan/ikhtisar`), Piutang (`ar-aging`/
`retention-register`/`dp-register`), dan ringkasan arus kas
(`finance/summary`/`cashflow-chart`) SEMUANYA di baliknya —
direktur mengakses `/admin-portal/keuangan` akan mendapat **403 pada
seluruh dashboard+piutang**, bukan sekadar tombol tulis yang hilang. Ini
kasus KEDUA (sesudah `change_order`/`estimate_version`/`lessons_learned` di
Task 2) di mana direktur genuinely kehilangan sesuatu — dan yang PERTAMA
di mana yang hilang adalah KEMAMPUAN BACA, bukan tulis. Task 14 WAJIB
menangani ini sebagai empty-state/pesan yang jelas ("Dashboard Keuangan
memerlukan izin `finance:view:all`"), BUKAN sebagai galat generik "gagal
memuat" yang terlihat seperti bug.

⚠ **GL benar-benar terbelah ADMIN vs DIREKTUR** — direktur hanya bisa
MELIHAT (`gl:view`, `gl:periode:view`) dan MENUTUP/MEMBUKA PERIODE
(`gl:periode:manage`/`gl:periode:reopen`), TAPI TIDAK bisa membuat akun/
jurnal baru maupun posting/void (`gl:manage`/`gl:post`/`gl:void` — nol
untuk direktur). Ini pola yang MASUK AKAL secara bisnis (direktur
mengawasi & mengunci buku, staf keuangan/admin yang menjurnal harian) tapi
BERBEDA TOTAL dari PM (yang justru sebaliknya: `gl:manage`/`gl:post`/
`gl:void` PENUH, tapi tak pernah disebut apakah PM punya `gl:periode:*`
sama sekali — tak relevan karena PM tak dapat modul Tutup Buku).

⚠ **Kas & Bank company-wide TANPA gerbang permission untuk baca** —
`cash/accounts` dan `cash/summary` hanya `authenticate` (bukan
`requirePermission`), sama untuk admin MAUPUN direktur. Ini beda dari
Piutang/Dashboard yang digerbang `finance:view:all`. `cash_accounts` bisa
terikat `project_id` (kolom `projects` di-join, filterable via query
`?project_id=`) TAPI defaultnya menampilkan SEMUA akun tenant — Kas karena
itu company-wide by default dengan opsi penyempitan per-proyek, BUKAN
per-proyek dengan agregasi company-wide seperti Dashboard Keuangan.

⚠ **`gl:void` non-atomicity (JOURNAL.md, Portal PM Task 34) DIWARISI apa
adanya** — `PATCH /gl/journal-entries/:id/void` (`gl.ts:287-321`) TIDAK
menyertakan `.eq('status','posted')` di WHERE update (beda dari `/post`
yang atomik lewat `.eq('status','draft')`). Diverifikasi ULANG langsung ke
kode saat riset Task 13 (baris 302-310) — bug backend YANG SUDAH ADA,
TIDAK diperbaiki di sini (backend di luar scope plan frontend-only ini).
Dampaknya dibatasi trigger `fn_gl_posted_immutable` (field lain tak bisa
berubah pada baris posted) — race window hanya bisa menimpa `notes` dua
kali, bukan memindahkan uang atau mengubah saldo. Task 15 mewarisi
peringatan ini di komentar kepala berkas, PERSIS pola PM Portal Task 34.

**Company-wide vs per-proyek — dikonfirmasi per sub-modul:**

| sub-modul | cakupan | alasan |
|---|---|---|
| Dashboard Keuangan (`keuangan/ikhtisar`) | company-wide | `db.projectIds()` = SEMUA proyek tenant untuk admin (tak ada penyempitan `pm_id` di route ini) |
| Piutang (`ar-aging`/`retention-register`/`dp-register`) | company-wide | tabel lintas-proyek, tanpa parameter `project_id` |
| IPC (`sertifikat-ipc`) | **per-proyek** | `?project_id=` WAJIB, satu proyek satu waktu — project-picker sama pola Task 7/9 (TANPA filter `.pm`) |
| Kas (`cash/accounts`, `/summary`, `/transfers`, `/expenses`) | company-wide (opsional per-proyek) | akun kas MILIK company, sebagian `project_id`-linked; default tampil semua |
| GL (`gl/*`) | company-wide | akun/jurnal milik badan usaha (`viaCompany`, BUKAN `viaProject` — komentar kepala `gl.ts`), `project_id` di baris jurnal cuma dimensi laporan |
| Rekonsiliasi Bank (`rekonsiliasi`) | company-wide | per AKUN KAS (yang company-wide), bukan per proyek |
| Pengadaan Lanjutan (kontrak payung/expediting/nota kredit) | company-wide | milik SUPPLIER, bukan proyek — `GET /pengadaan-lanjutan` tanpa `project_id` sama sekali |

Prediksi awal brief ("Kas/GL/Rekonsiliasi kemungkinan company-wide,
Pengadaan-lanjutan bisa campuran") **TERKONFIRMASI SEMUANYA company-wide,
TANPA campuran** — satu-satunya sub-modul per-proyek genuine adalah IPC
(sertifikat pembayaran memang diterbitkan per kontrak/proyek).

**Konfirmasi eksplisit — `apps/api/src/lib/tulis-klaim.ts` TIDAK disentuh**
riset ini sama sekali (dibaca 0 kali, diedit 0 kali) — larangan permanen
CLAUDE.md §6 dipatuhi penuh. Endpoint `payments` (`finance.ts:1232`,
`finance:invoice:pay`) yang dipakai Task 14 untuk "Terbayar" HANYA
DIBACA sebagai agregat lewat `keuangan/ikhtisar`, bukan ditulis lewat jalur
WhatsApp/asisten yang jadi alasan larangan itu.

---

## Tahap 3 lanjutan: Task 14-19

### Task 14: Dashboard Keuangan + Piutang + IPC — halaman baru (company-wide + per-proyek)

**Files:**
- Create: `apps/web/app/admin-portal/keuangan/page.tsx` (Dashboard, company-wide)
- Create: `apps/web/app/admin-portal/keuangan/piutang/page.tsx` (company-wide)
- Create: `apps/web/app/admin-portal/keuangan/ipc/page.tsx` (per-proyek)
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah
  `RespKeuanganIkhtisar`, `BarisArAging`/`RespArAging`, `BarisRetensi`/
  `RespRetensi`, `BarisDp`/`RespDp`, `HasilIpc`/`SertifikatIpc`/
  `RespSertifikatDaftar` — salinan PERSIS `pm-portal/_bersama/tipe.ts:
  2657-2769`, tabel referensi lengkap di riset Task 13 di atas)

**Interfaces:**
- Consumes: `GET /api/v1/keuangan/ikhtisar` (`finance:view:all`,
  company-wide via `db.projectIds()`), `GET /api/v1/finance/ar-aging`,
  `GET /api/v1/finance/retention-register`, `GET /api/v1/finance/
  dp-register` (ketiganya `finance:view:all`, company-wide), `GET /api/v1/
  sertifikat-ipc?project_id=` + `POST /api/v1/sertifikat-ipc` + `PATCH
  /api/v1/sertifikat-ipc/:id/setujui` (`finance:view`/`finance:invoice:
  create`, admin+direktur SAMA-SAMA punya — per-proyek).
- Produces: `/admin-portal/keuangan` (Beranda modul — KPI + grafik + per
  proyek + invoice tertunggak), `/admin-portal/keuangan/piutang` (3 tab:
  Aging/Retensi/Uang Muka), `/admin-portal/keuangan/ipc` (project-picker +
  terbitkan + setujui).

⚠ **Dashboard dan Piutang WAJIB menangani 403 `finance:view:all` untuk
direktur secara EKSPLISIT** — beda dari pola dominan plan ini di mana
direktur tetap bisa BACA. Bila `useData` memulangkan status 403 untuk
kedua endpoint ini, tampilkan `EmptyState` yang menyebut IZIN yang kurang
("Dashboard Keuangan memerlukan izin `finance:view:all`, hubungi admin"),
BUKAN pesan galat generik "Gagal memuat, coba muat ulang" yang terbaca
seperti bug transien. IPC TIDAK terkena ini (`finance:view`, direktur
punya) — halaman itu render normal untuk kedua role.

- [ ] **Step 1: Baca ulang KETIGA halaman PM PENUH sebelum menulis** —
  `pm-portal/keuangan/dashboard/page.tsx` (197 baris), `pm-portal/keuangan/
  piutang/page.tsx` (160 baris), `pm-portal/keuangan/ipc/page.tsx` (246
  baris). Baca juga `apps/api/src/lib/keuangan-ikhtisar.ts` header komentar
  (kenapa RAB SENGAJA tak dipakai — keputusan founder 2026-08-09, JANGAN
  menambah agregasi RAB kalau kepikiran "lebih lengkap") dan `finance.ts`
  baris 237-444 (`ar-aging`/`retention-register`/`dp-register`).

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  Salin PERSIS `pm-portal/_bersama/tipe.ts:2657-2769` — `RespKeuanganIkhtisar`
  (nominal SEMUA STRING, `.toFixed(2)` backend), `BarisArAging`/`RespArAging`
  (nominal NUMBER — endpoint BEDA dari ikhtisar), `BarisRetensi`/`RespRetensi`,
  `BarisDp`/`RespDp`, `HasilIpc`/`SertifikatIpc`/`RespSertifikatDaftar`.
  JANGAN menyeragamkan tipe nominal antara `RespKeuanganIkhtisar` (string)
  dan `RespArAging`/dst (number) — keduanya endpoint berbeda dengan
  konvensi serialisasi berbeda, diverifikasi baris-per-baris di PM Portal
  Task 32, bukan asumsi yang bisa "dirapikan".

- [ ] **Step 3: `admin-portal/keuangan/page.tsx` — salin `pm-portal/
  keuangan/dashboard/page.tsx` APA ADANYA**

  KPI grid (nilai kontrak/tertagih/terbayar/piutang/kasbon beredar/invoice
  lewat tempo) + grafik batang tagih-vs-bayar 12 bulan + komposisi kasbon +
  umur piutang + tabel per-proyek (`<Tabel>` bersama `@/components/dasar`,
  BUKAN `<table>` mentah) + invoice tertunggak. HANYA ubah:
  1. Komentar kepala berkas (Task 14 Portal Admin, sebut gerbang
     `finance:view:all` admin-only secara eksplisit — BEDA dari PM yang
     tak perlu menyebutnya karena semua PM yang sampai modul ini otomatis
     punya izin viewnya sendiri).
  2. Path impor tipe (`../_bersama/tipe`, satu level — bukan `../../_bersama/
     tipe` seperti PM yang bersarang dua level `keuangan/dashboard/`).
  3. TAMBAH penanganan 403 eksplisit (lihat catatan ⚠ di atas Task ini) —
     ini SATU-SATUNYA tambahan logic di luar "salin", karena versi PM tak
     pernah menghadapi kasus role yang kehilangan `finance:view:all`.

  ```tsx
  // Tambahan di atas render normal, sebelum blok `{!memuat && data && (...)}`
  // yang disalin dari PM. Deteksi lewat STATUS CODE (403), BUKAN isi pesan
  // — pesan asli `requirePermission` (`apps/api/src/plugins/auth.ts:221-223`)
  // berbunyi `Akses ditolak. Butuh permission: ${permissionKey}`, TIDAK
  // PERNAH mengandung kata "izin". Cek string sempat ditulis sebagai
  // `.includes("izin")` di draf awal Task 14 — SELALU false terhadap pesan
  // asli, direktur akan jatuh ke cabang galat generik "Gagal memuat" alih-
  // alih pesan yang menjelaskan gerbangnya (bahaya tersembunyi: halaman tak
  // crash, jadi terlihat berfungsi normal sampai diuji dengan akun direktur
  // sungguhan). `GalatApi` (`_bersama/tipe.ts:107-110`) SUDAH punya
  // `response.status` — tak perlu field baru:
  {!memuat && galat && (galat as GalatApi)?.response?.status === 403 && (
    <EmptyState
      icon={AlertTriangle}
      judul="Akses terbatas"
      deskripsi="Dashboard Keuangan memerlukan izin finance:view:all. Peran Anda saat ini tidak memilikinya — hubungi admin bila ini keliru."
    />
  )}
  {!memuat && galat && (galat as GalatApi)?.response?.status !== 403 && (
    <EmptyState icon={AlertTriangle} judul="Gagal memuat"
      deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")}
      aksi={{ label: "Muat ulang", onClick: () => void muatUlang() }} />
  )}
  ```

  ⚠ **Bentuk `galat` SUDAH diverifikasi ke `apps/web/lib/data-cache.ts`**
  (riset review Task 13): `useData` menyimpan `e as Error` dari `catch (e)`
  TANPA membungkus ulang (`jalankan()`, baris ~211-221), dan `ambilData()`
  memanggil `api.get()` (instance axios) — jadi `galat` yang diterima
  komponen adalah error axios ASLI dengan `response.status`/
  `response.data.error`, cocok `GalatApi` apa adanya. `.response.status ===
  403` di atas AMAN dipakai langsung, TIDAK perlu verifikasi ulang saat
  implementasi — tapi tetap baca ulang `data-cache.ts` sekali sebelum
  commit untuk memastikan tak ada perubahan di antara riset ini dan
  implementasi Task 14.

- [ ] **Step 4: `admin-portal/keuangan/piutang/page.tsx` — salin `pm-portal/
  keuangan/piutang/page.tsx` APA ADANYA**

  3 tab `SegmentedTab` (Umur Piutang/Retensi/Uang Muka). HANYA ubah
  komentar kepala + path impor + tambahan penanganan 403 (pola sama Step 3,
  ketiga `useData` di halaman ini gerbang `finance:view:all` yang sama).

- [ ] **Step 5: `admin-portal/keuangan/ipc/page.tsx` — salin `pm-portal/
  keuangan/ipc/page.tsx` APA ADANYA**

  Project-picker + terbitkan (BottomSheet form) + setujui (tombol per
  kartu, `disabled` saat `!s.hitung.layak_diajukan` — INI logic bisnis
  bawaan endpoint, BUKAN gerbang permission, tetap `disabled` bukan
  disembunyikan). HANYA ubah:
  1. Komentar kepala berkas (Task 14 Portal Admin — `finance:view`,
     admin+direktur SAMA-SAMA punya, TAK PERLU penanganan 403 khusus
     seperti Step 3/4).
  2. Path impor tipe.
  3. `daftarProyek` TIDAK memfilter `.filter((p) => p.pm)` — pola sama
     Task 7/9/10/11.

- [ ] **Step 6: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 7: Verifikasi manual — akun direktur uji untuk 403**

  Buka `/admin-portal/keuangan` dan `/admin-portal/keuangan/piutang` dengan
  akun direktur uji (0 user aktif, wajib akun sengaja dibuat) — konfirmasi
  EmptyState "Akses terbatas" tampil, BUKAN pesan galat generik atau
  halaman kosong tanpa penjelasan. Buka `/admin-portal/keuangan/ipc` dengan
  akun yang SAMA — konfirmasi halaman itu render NORMAL (KPI/daftar
  sertifikat tampil), membuktikan `finance:view` ≠ `finance:view:all`.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/app/admin-portal/keuangan apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): dashboard keuangan + piutang + ipc — Tahap 3"
  ```

### Task 15: General Ledger — Chart of Accounts, Jurnal, Buku Besar, Laporan (gerbang gl:manage/gl:post/gl:void admin-only)

**Files:**
- Create: `apps/web/app/admin-portal/keuangan/gl/page.tsx`
- Create: `apps/web/app/admin-portal/keuangan/gl/jurnal/[id]/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah `AkunGl`/
  `RespAkunGl`, `JurnalGl`/`RespJurnalDaftar`, `BarisJurnalGl`/
  `RespJurnalDetail`, `BarisBukuBesar`/`RespBukuBesar`,
  `KelompokLaporanGl`/`NeracaGl`/`LabaRugiGl`/`RespLaporanGl` — salinan
  PERSIS `pm-portal/_bersama/tipe.ts:2868-2981`)

**Interfaces:**
- Consumes: `GET /api/v1/gl/accounts` + `POST` (`gl:view`/`gl:manage`),
  `GET /api/v1/gl/journal-entries` + `GET /:id` + `POST`
  (`gl:view`/`gl:manage`), `PATCH /api/v1/gl/journal-entries/:id/post`
  (`gl:post`), `PATCH /api/v1/gl/journal-entries/:id/void` (`gl:void`),
  `GET /api/v1/gl/ledger` (`gl:view`), `GET /api/v1/gl/laporan`
  (`gl:view`).
- Produces: `/admin-portal/keuangan/gl` (4 tab: Jurnal/Bagan Akun/Buku
  Besar/Neraca & Laba-Rugi), `/admin-portal/keuangan/gl/jurnal/:id`
  (detail + posting/void).

⚠ **INI TASK PALING KRITIS Tahap 3 — GL benar-benar terbelah admin vs
direktur, dan sumber PM TIDAK punya render-gate untuk disalin.** Live
query Task 13: direktur `gl:view`/`gl:periode:*` ✅, TAPI `gl:manage`/
`gl:post`/`gl:void` ❌ TOTAL. Tombol "+ Akun", "+ Jurnal", "Posting
Jurnal", "Batalkan Jurnal" WAJIB digerbang `hasPermission()` +
`useSyncExternalStore` (pola PERSIS Task 10 Change Order) — TIDAK DIRENDER
(bukan `disabled`) untuk direktur. Tab "Bagan Akun"/"Buku Besar"/"Neraca &
Laba-Rugi" dan LIST jurnal tetap tampil penuh untuk direktur (`gl:view`
dimiliki keduanya) — hanya AKSI TULIS yang tersembunyi.

- [ ] **Step 1: Baca ulang KEDUA halaman PM PENUH** — `pm-portal/keuangan/
  gl/page.tsx` (551 baris) dan `pm-portal/keuangan/gl/jurnal/[id]/page.tsx`
  (218 baris). Perhatikan KEDUANYA TIDAK punya satu pun `hasPermission()`
  — ini pengecualian dari pola "salin gerbang PM apa adanya" karena
  gerbangnya memang tak ada di sumbernya (dijelaskan di riset Task 13 di
  atas). Baca ulang `gl.ts:52-321` (chart of accounts + jurnal + post +
  void) untuk memastikan bentuk respons belum berubah sejak PM Portal
  Task 34.

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  Salin PERSIS `pm-portal/_bersama/tipe.ts:2868-2981` (`AkunGl`,
  `RespAkunGl`, `JurnalGl`, `BarisJurnalGl`, `RespJurnalDaftar`,
  `RespJurnalDetail`, `BarisBukuBesar`, `RespBukuBesar`,
  `KelompokLaporanGl`, `NeracaGl`, `LabaRugiGl`, `RespLaporanGl`) —
  TERMASUK komentar `BarisJurnalGl.accounts` NULLABLE (`gl.ts:157` tak
  menormalisasi embed gagal, akses WAJIB `?.`, bukan langsung). JANGAN
  menyalin `RespTrialBalance`/`BarisSaldoAkun` — endpoint `/gl/trial-balance`
  nyata tapi TAK DIPAKAI halaman manapun (dead import kalau ditambahkan).

- [ ] **Step 3: `admin-portal/keuangan/gl/page.tsx` — salin `pm-portal/
  keuangan/gl/page.tsx`, TAMBAH gerbang `bolehTulisGl`/`bolehPost`/
  `bolehVoid` yang TIDAK ADA di sumber**

  Salin struktur 4-tab + BottomSheet "Akun Baru"/"Jurnal Manual" APA
  ADANYA (validasi `seimbangLini` sisi klien, batas 2+ baris, dst — SEMUA
  logic form tak berubah). TAMBAHKAN gerbang render pada:

  ```tsx
  import { useSyncExternalStore } from "react";
  import { hasPermission } from "@/lib/api";

  // `langganan`: pola PERSIS Task 10 — perubahan permission (login/switch
  // company) tercermin tanpa reload.
  const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

  export default function AdminGlPage() {
    // gl:manage HANYA admin (live 2026-08-22) — direktur TIDAK bisa buat
    // akun/jurnal baru. TIDAK DIRENDER (bukan disabled) saat tak ada,
    // pola sama `bolehApprove` Task 10 — JANGAN "perbaiki" jadi selalu
    // tampil dengan asumsi "direktur biasanya subset admin".
    const bolehTulisGl = useSyncExternalStore(
      langganan, () => hasPermission("gl:manage"), () => false);
    // ... sisa state SAMA PERSIS pm-portal/keuangan/gl/page.tsx
  ```

  Bungkus KEDUA tombol header ("+ Akun"/"+ Jurnal") dengan
  `{bolehTulisGl && (...)}`. Tab "Bagan Akun"/"Buku Besar"/"Laporan" dan
  list Jurnal TETAP dirender tanpa gerbang tambahan (`gl:view` dimiliki
  admin+direktur). HANYA ubah komentar kepala berkas (jelaskan pembelahan
  admin/direktur, RUJUK tabel live-query Task 13) dan path impor.

- [ ] **Step 4: `admin-portal/keuangan/gl/jurnal/[id]/page.tsx` — salin
  `pm-portal/keuangan/gl/jurnal/[id]/page.tsx`, TAMBAH gerbang `bolehPost`/
  `bolehVoid`**

  Salin kepala jurnal + tabel baris + BottomSheet "Batalkan Jurnal" APA
  ADANYA (termasuk komentar atomisitas `post` vs non-atomisitas `void` —
  WARISI, JANGAN perbaiki, lihat peringatan riset Task 13 di atas).
  TAMBAHKAN:

  ```tsx
  const bolehPost = useSyncExternalStore(langganan, () => hasPermission("gl:post"), () => false);
  const bolehVoid = useSyncExternalStore(langganan, () => hasPermission("gl:void"), () => false);
  ```

  Bungkus tombol "Posting Jurnal" (`j.status === "draft"`) dengan
  `{j.status === "draft" && bolehPost && (...)}` dan tombol "Batalkan
  Jurnal" (`j.status === "posted"`) dengan `{j.status === "posted" &&
  bolehVoid && (...)}`. Direktur yang membuka jurnal draft/posted TETAP
  bisa melihat SELURUH detail (kepala, baris, total debit/kredit) — hanya
  dua tombol aksi yang hilang total.

  ⚠ Komentar kepala berkas WAJIB mewarisi peringatan non-atomicity `void`
  PERSIS dari PM Portal Task 34 (`gl.ts:287-321` tak punya
  `.eq('status','posted')` di WHERE) — jangan dihapus dengan alasan "sudah
  dicatat di riset Task 13", pembaca kode di masa depan tak selalu
  membuka dokumen plan ini.

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Verifikasi manual — akun direktur uji (0 user aktif)**

  Buka `/admin-portal/keuangan/gl` dengan akun direktur uji — konfirmasi
  tombol "+ Akun"/"+ Jurnal" TIDAK TAMPIL sama sekali, sementara 4 tab
  tetap bisa dibuka dan menampilkan data. Buka detail jurnal draft —
  konfirmasi tombol "Posting Jurnal" TIDAK TAMPIL. Buka detail jurnal
  posted — konfirmasi tombol "Batalkan Jurnal" TIDAK TAMPIL. Bandingkan
  dengan akun admin — SEMUA tombol tampil di keempat kasus.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/app/admin-portal/keuangan/gl apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): general ledger — gerbang gl:manage/post/void admin-only — Tahap 3"
  ```

### Task 16: Rekonsiliasi Bank — halaman baru (gerbang rekonsiliasi:manage/lock admin-only)

**Files:**
- Create: `apps/web/app/admin-portal/keuangan/rekonsiliasi-bank/page.tsx`
- Create: `apps/web/app/admin-portal/keuangan/rekonsiliasi-bank/[id]/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah
  `BarisKoranRek`/`TransaksiBukuRek`/`UsulCocokRek`/`LaporanRekBank`/
  `KoranRekening`/`RespRekonsiliasiDaftar`/`KoranRekeningDetail`/
  `RespRekonsiliasiDetail` — salinan PERSIS `pm-portal/_bersama/tipe.ts:
  2991-3053`)

**Interfaces:**
- Consumes: `GET /api/v1/rekonsiliasi` (`rekonsiliasi:view`, daftar
  koran), `GET /api/v1/rekonsiliasi/:id` (`rekonsiliasi:view`, detail +
  laporan + usul pencocokan), `POST /api/v1/rekonsiliasi/:id/cocokkan`
  (`rekonsiliasi:manage`), `DELETE .../cocokkan/:cocokId`
  (`rekonsiliasi:manage`), `POST .../penyesuaian` (`rekonsiliasi:manage`),
  `POST .../kunci` (`rekonsiliasi:lock`).
- Produces: `/admin-portal/keuangan/rekonsiliasi-bank` (daftar koran),
  `/admin-portal/keuangan/rekonsiliasi-bank/:id` (detail + aksi).

⚠ **Sama polanya dengan GL (Task 15) — direktur hanya `rekonsiliasi:view`
(baca), TIDAK `rekonsiliasi:manage`/`rekonsiliasi:lock`.** Halaman daftar
(`page.tsx`) TIDAK punya tombol tulis sama sekali di versi PM (murni list
+ link, `POST /rekonsiliasi` impor koran memang TIDAK dibangun di mobile —
warisi keputusan itu, lihat komentar kepala `pm-portal/keuangan/
rekonsiliasi-bank/page.tsx`), jadi Task ini HANYA perlu menggerbang
halaman DETAIL (`[id]/page.tsx`): tombol "+ Penyesuaian", "Kunci Periode",
dan "Cocokkan (dari usul)".

- [ ] **Step 1: Baca ulang KEDUA halaman PM PENUH** — `pm-portal/keuangan/
  rekonsiliasi-bank/page.tsx` (115 baris) dan `[id]/page.tsx` (399 baris,
  termasuk komentar atomisitas `kunci` ATOMIK vs `cocokkan` non-atomik
  ringan — race window dibatasi UNIQUE constraint, WARISI apa adanya).

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  Salin PERSIS `pm-portal/_bersama/tipe.ts:2991-3053` — TERMASUK komentar
  yang membedakan `KoranRekening` (bentuk DAFTAR, dengan
  `jumlah_baris`/`jumlah_cocok`/`belum_cocok` DIHITUNG rute) dari
  `KoranRekeningDetail` (bentuk DETAIL, TANPA ketiga field itu — endpoint
  detail menyebar baris mentah + `nama_akun` saja). Menyamakan keduanya
  membuat kode membaca field yang `undefined` senyap di satu endpoint.

- [ ] **Step 3: `admin-portal/keuangan/rekonsiliasi-bank/page.tsx` — salin
  `pm-portal/keuangan/rekonsiliasi-bank/page.tsx` APA ADANYA**

  Daftar koran + status badge (terbuka/dikunci) + ringkasan cocok/belum
  cocok. TIDAK ADA tombol tulis di halaman ini di versi PM — TIDAK PERLU
  gerbang tambahan, salin murni ganti komentar kepala + path impor.

- [ ] **Step 4: `admin-portal/keuangan/rekonsiliasi-bank/[id]/page.tsx` —
  salin `pm-portal/keuangan/rekonsiliasi-bank/[id]/page.tsx`, TAMBAH
  gerbang `bolehKelola`/`bolehKunci`**

  Salin laporan 4-baris + baris belum cocok + BottomSheet penyesuaian APA
  ADANYA. TAMBAHKAN:

  ```tsx
  const bolehKelola = useSyncExternalStore(langganan, () => hasPermission("rekonsiliasi:manage"), () => false);
  const bolehKunci = useSyncExternalStore(langganan, () => hasPermission("rekonsiliasi:lock"), () => false);
  ```

  Bungkus tombol "+ Penyesuaian" dengan `{koran.status === "terbuka" &&
  bolehKelola && (...)}`, tombol "Cocokkan (dari usul)" dengan `{u &&
  koran.status === "terbuka" && bolehKelola && (...)}`, dan tombol "Kunci
  Periode" dengan `{koran.status === "terbuka" && bolehKunci && (...)}` —
  TIGA gerbang terpisah (bukan satu gabungan), karena `rekonsiliasi:manage`
  dan `rekonsiliasi:lock` adalah permission BERBEDA yang bisa saja
  suatu hari dipegang role berbeda pula (saat ini direktur nol keduanya,
  tapi kode tak boleh mengasumsikan keduanya SELALU sepasang).

  ⚠ Direktur yang membuka koran TERBUKA tanpa `rekonsiliasi:manage`/`:lock`
  akan melihat laporan + baris belum cocok TANPA satu pun tombol aksi —
  ini KEADAAN SAH (baca-saja), bukan bug tampilan setengah-jadi. Pastikan
  tak ada `<div>` kosong yang tertinggal dari struktur flex tombol yang
  dihapus render-nya.

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Verifikasi manual — akun direktur uji**

  Buka koran berstatus terbuka dengan akun direktur uji — konfirmasi TIDAK
  ADA tombol "+ Penyesuaian"/"Cocokkan"/"Kunci Periode", laporan tetap
  tampil penuh. Bandingkan akun admin — ketiga tombol tampil.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/app/admin-portal/keuangan/rekonsiliasi-bank apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): rekonsiliasi bank — gerbang manage/lock admin-only — Tahap 3"
  ```

### Task 17: Kas Management — halaman baru (company-wide, admin dapat cancel transfer yang PM tak punya)

**Files:**
- Create: `apps/web/app/admin-portal/keuangan/kas/page.tsx`
- Create: `apps/web/app/admin-portal/keuangan/kas/[id]/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah
  `RespCashSummary`, `CashAccount`/`RespCashAccounts`, `CashTransfer`/
  `RespCashTransfers`, `RespCashAccountDetail`, `ProjectExpense`/
  `RespCashExpenses`, `KategoriPengeluaran`/`RespKategoriPengeluaran` —
  salinan PERSIS `pm-portal/_bersama/tipe.ts:2781-2858`)

**Interfaces:**
- Consumes: `GET /api/v1/cash/summary` (`authenticate` saja, company-wide),
  `GET /api/v1/cash/accounts` (`authenticate` saja), `GET /api/v1/cash/
  accounts/:id` (`cash:view`), `POST /api/v1/cash/transfers`
  (`cash:transfer:create`), `PATCH .../confirm` (`cash:transfer:confirm`),
  `PATCH .../cancel` (`cash:account:manage` — **BEDA dari PM**: admin+
  direktur PUNYA, PM tidak), `POST /api/v1/cash/expenses` (`authenticate`
  saja — auto-approve untuk admin/pm sesuai `cash.ts:565`, VERIFIKASI
  ULANG baris ini untuk peran `direktur` sebelum menulis kode Step 4),
  `GET /api/v1/cash/categories`.
- Produces: `/admin-portal/keuangan/kas` (2 tab: Akun Kas/Pengeluaran),
  `/admin-portal/keuangan/kas/:id` (detail + konfirmasi + BARU: batalkan
  transfer).

⚠ **Satu-satunya penambahan FUNGSIONAL (bukan cuma gerbang) di seluruh
Tahap 3** — admin/direktur punya `cash:account:manage` yang PM tidak,
sehingga tombol "Batalkan" transfer (`PATCH /cash/transfers/:id/cancel`)
yang SENGAJA TAK DIBANGUN di PM Portal (komentar kepala `pm-portal/
keuangan/kas/[id]/page.tsx`: "TIDAK ADA tombol Batalkan... PM TIDAK
PUNYA") WAJIB ditambahkan di sini, bukan disalin sebagai ketiadaan.

- [ ] **Step 1: Baca ulang KEDUA halaman PM PENUH + verifikasi `cash.ts`
  baris 565 untuk `auto-approve`** — `pm-portal/keuangan/kas/page.tsx`
  (348 baris), `pm-portal/keuangan/kas/[id]/page.tsx` (149 baris), dan
  `apps/api/src/routes/v1/cash.ts` baris 355-385 (`PATCH .../cancel`,
  gerbang `cash:account:manage`) + sekitar baris 565 (logic auto-approve
  pengeluaran per-role) untuk memastikan `direktur` diperlakukan SAMA
  dengan `admin` di jalur itu (bukan diasumsikan dari nama variabel).

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  Salin PERSIS `pm-portal/_bersama/tipe.ts:2781-2858`.

- [ ] **Step 3: `admin-portal/keuangan/kas/page.tsx` — salin `pm-portal/
  keuangan/kas/page.tsx` APA ADANYA**

  2 tab (`SegmentedTab`) Akun Kas/Pengeluaran + tombol Transfer/Pengeluaran
  + BottomSheet form. HANYA ubah:
  1. Komentar kepala berkas (Task 17 Portal Admin — sebut BEDA
     `cash:account:manage` dari PM).
  2. Path impor tipe.
  3. `daftarProyek` (dipakai dropdown proyek form Pengeluaran) TIDAK
     memfilter `.filter((p) => p.pm)` — pola sama Task 7/9/10/11/14.

  TIDAK menambah tombol approve/reject pengeluaran di halaman ini —
  WARISI keputusan PM (Temuan #2 Task 31 PM): approve/reject
  `cash:expense:approve` HANYA lewat Inbox terpusat (Task 4 plan ini),
  BUKAN diduplikasi di modul Kas. `cash:expense:approve` admin+direktur
  SAMA-SAMA punya (tabel Task 13), tapi jalurnya tetap satu pintu.

- [ ] **Step 4: `admin-portal/keuangan/kas/[id]/page.tsx` — salin
  `pm-portal/keuangan/kas/[id]/page.tsx`, TAMBAH tombol "Batalkan"**

  Salin saldo + riwayat transfer + tombol "Konfirmasi Diterima" (transfer
  pending masuk, `cash:transfer:confirm`) + riwayat pengeluaran APA
  ADANYA. TAMBAHKAN gerbang + tombol baru:

  ```tsx
  const bolehBatalkan = useSyncExternalStore(langganan, () => hasPermission("cash:account:manage"), () => false);

  async function batalkan(transferId: string) {
    setMembatalkan(transferId);
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/cash/transfers/${transferId}/cancel`, {});
      if (url) invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal membatalkan transfer"));
    } finally {
      setMembatalkan(null);
    }
  }
  ```

  Render tombol "Batalkan" DI SAMPING tombol "Konfirmasi Diterima" yang
  sudah ada, hanya untuk transfer `status === "pending"` DAN `bolehBatalkan`
  — TIDAK bergantung pada `masuk`/`keluar` (pembatalan berlaku dari kedua
  sisi akun, beda dari konfirmasi yang HANYA sisi `to_account`). Style
  tombol: outline `var(--danger-border)` (sekunder, bukan aksi utama
  halaman), pola sama tombol "Tolak" di `admin-portal/inbox`.

  ⚠ Verifikasi ULANG bentuk respons `PATCH .../cancel` sebelum menulis
  (baca `cash.ts:355-385` PENUH) — apakah ia mengembalikan `{ transfer }`
  seperti `/confirm`, dan apakah ada syarat status selain "bukan sudah
  confirmed/cancelled" yang perlu ditampilkan sebagai pesan galat spesifik.

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Verifikasi manual — kedua role**

  Buka detail akun kas dengan transfer pending, akun admin DAN direktur —
  konfirmasi tombol "Batalkan" tampil untuk KEDUANYA (beda dari GL/
  Rekonsiliasi yang membelah admin-vs-direktur, di sini keduanya SAMA).
  Konfirmasi tombol itu TIDAK tampil untuk transfer berstatus
  confirmed/cancelled.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/app/admin-portal/keuangan/kas apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): kas management + batalkan transfer — Tahap 3"
  ```

### Task 18: Pengadaan Lanjutan — Kontrak Payung + Expediting + Nota Kredit (admin/direktur bisa putuskan, PM tidak)

**Files:**
- Create: `apps/web/app/admin-portal/keuangan/pengadaan-lanjutan/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah
  `ItemPayungPM`/`StatusPayungPM`/`HasilPayungPM`/`RespKontrakPayungPM`,
  `HasilExpeditingPM`/`RespExpeditingPM`, `HasilNotaKreditPM`/
  `RespNotaKreditPM`, `RespPengadaanLanjutan` — salinan PERSIS
  `pm-portal/_bersama/tipe.ts:3068-3117`; `RespSupplierDaftar` SUDAH ADA
  sejak Task 8/9, JANGAN duplikasi)

**Interfaces:**
- Consumes: `GET /api/v1/pengadaan-lanjutan` (`procurement:view`,
  company-wide, SATU fetch tiga sub-modul), `POST .../kontrak` + `POST
  .../expediting` + `PATCH .../expediting/:id` + `POST .../nota-kredit`
  (`procurement:po:manage`, admin+direktur SAMA dengan PM), `PATCH
  .../nota-kredit/:id/putuskan` + `PATCH .../nota-kredit/:id/terapkan`
  (`procurement:payment:manage` — **BEDA dari PM**: admin+direktur PUNYA,
  PM TIDAK — inilah tombol yang WAJIB DITAMBAHKAN, bukan disalin sebagai
  ketiadaan).
- Produces: `/admin-portal/keuangan/pengadaan-lanjutan` (3 tab: Kontrak
  Payung/Expediting/Nota Kredit).

⚠ **Kebalikan pola Task 15/16 (yang MENGURANGI tombol PM untuk direktur)
— Task ini MENAMBAH tombol yang PM tak pernah punya untuk KEDUA role
admin+direktur.** SoD (segregation of duties) diperiksa BACKEND
(`pengadaan-lanjutan.ts:585-589`, `diajukan_oleh === currentUser.id` →
403 "pemutus harus orang lain") — tombol putuskan TETAP dirender untuk
admin/direktur yang mengajukan nota kredit sendiri (backend yang menolak
dengan pesan jelas), BUKAN disembunyikan di klien berdasar
`n.diajukan_oleh === user.id` (menduplikasi logic SoD di klien berisiko
menyimpang dari aturan backend yang sesungguhnya — ikuti pola "render,
biarkan backend menolak dengan pesan manusiawi" seperti approval inbox
Task 4).

- [ ] **Step 1: Baca ulang PENUH `pm-portal/keuangan/pengadaan-lanjutan/
  page.tsx`** (538 baris, TERMASUK komentar kepala yang menjelaskan SoD
  dan kenapa tombol putuskan/terapkan sengaja tak ada). Baca ulang
  `pengadaan-lanjutan.ts:561-673` (`putuskan`/`terapkan`) untuk bentuk
  body request (`{ setujui: boolean; alasan_tolak?: string }` untuk
  putuskan, body kosong untuk terapkan) dan respons (`{ notaKredit: {...} }`).

- [ ] **Step 2: Tambah tipe ke `_bersama/tipe.ts`**

  Salin PERSIS `pm-portal/_bersama/tipe.ts:3068-3117` — TERMASUK komentar
  yang MENJELASKAN kenapa PM tak punya tombol putuskan (untuk konteks
  historis), tapi TAMBAHKAN catatan bahwa admin-portal BERBEDA di titik
  ini (lihat Step 4).

- [ ] **Step 3: `admin-portal/keuangan/pengadaan-lanjutan/page.tsx` — salin
  kerangka 3-tab + form Kontrak Baru/Nota Kredit Baru APA ADANYA**

  Tab Kontrak Payung (list + BottomSheet buat, dengan item dinamis) dan
  Expediting (list read-only, tak ada aksi di PM MAUPUN admin — expediting
  dicatat dari detail PO, di luar cakupan halaman ringkasan ini) disalin
  MURNI tanpa perubahan logic. HANYA ubah komentar kepala + path impor.

- [ ] **Step 4: Tab Nota Kredit — TAMBAH tombol Setujui/Tolak/Terapkan
  yang TIDAK ADA di versi PM**

  ```tsx
  const bolehPutuskan = useSyncExternalStore(langganan, () => hasPermission("procurement:payment:manage"), () => false);
  const [sheetPutuskan, setSheetPutuskan] = useState<HasilNotaKreditPM | null>(null);
  const [alasanTolak, setAlasanTolak] = useState("");
  const [memutuskan, setMemutuskan] = useState(false);
  const [galatPutus, setGalatPutus] = useState<string | null>(null);
  const [menerapkan, setMenerapkan] = useState<string | null>(null);

  async function putuskan(id: string, setujui: boolean) {
    if (!setujui && alasanTolak.trim().length < 10) {
      setGalatPutus("Alasan penolakan wajib minimal 10 karakter.");
      return;
    }
    setMemutuskan(true);
    setGalatPutus(null);
    try {
      await api.patch(`/api/v1/pengadaan-lanjutan/nota-kredit/${id}/putuskan`, {
        setujui,
        alasan_tolak: setujui ? undefined : alasanTolak.trim(),
      });
      setSheetPutuskan(null);
      setAlasanTolak("");
      invalidasi("/api/v1/pengadaan-lanjutan");
    } catch (e) {
      // SoD ("pemutus harus orang lain") dan status invalid ("hanya yang
      // diajukan bisa diputuskan") DATANG dari backend sebagai 403/422
      // berpesan manusiawi — diteruskan apa adanya, TIDAK diduplikasi
      // logicnya di klien.
      setGalatPutus(pesanGalat(e as GalatApi, "Gagal memutuskan nota kredit"));
    } finally {
      setMemutuskan(false);
    }
  }

  async function terapkan(id: string) {
    setMenerapkan(id);
    try {
      await api.patch(`/api/v1/pengadaan-lanjutan/nota-kredit/${id}/terapkan`, {});
      invalidasi("/api/v1/pengadaan-lanjutan");
    } catch (e) {
      setGalatPutus(pesanGalat(e as GalatApi, "Gagal menerapkan nota kredit"));
    } finally {
      setMenerapkan(null);
    }
  }
  ```

  Ganti komentar PM *"Keputusan (setujui/tolak) dan penerapan HANYA lewat
  peran ber-procurement:payment:manage, PM tidak punya — TIDAK ADA tombol
  di sini"* dengan tombol nyata, dirender kondisional per status:

  ```tsx
  {n.status === "diajukan" && bolehPutuskan && (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button type="button" onClick={() => { setSheetPutuskan(n); setGalatPutus(null); }}
        style={{ /* outline danger, pola tombol Tolak Task 4 */ }}>
        Tolak
      </button>
      <button type="button" onClick={() => void putuskan(n.id, true)} disabled={memutuskan}
        style={{ /* solid success, pola tombol Setuju Task 4 */ }}>
        {memutuskan ? "Menyetujui…" : "Setujui"}
      </button>
    </div>
  )}
  {n.status === "disetujui" && bolehPutuskan && (
    <button type="button" onClick={() => void terapkan(n.id)} disabled={menerapkan === n.id}
      style={{ /* solid navy/grad-aksen, aksi utama baris ini */ }}>
      {menerapkan === n.id ? "Menerapkan…" : "Terapkan Potongan"}
    </button>
  )}
  ```

  BottomSheet "Tolak Nota Kredit" (textarea alasan, min 10 karakter, tombol
  submit memanggil `putuskan(sheetPutuskan.id, false)`) — pola sama
  BottomSheet penolakan di `admin-portal/inbox` (Task 4).

  ⚠ **JANGAN sembunyikan tombol berdasar `n.diajukan_oleh === user.id`
  di klien** — biarkan backend menolak dengan pesan SoD-nya sendiri.
  Alasannya: kalau logic SoD klien menyimpang dari backend (mis. field
  `diajukan_oleh` ternyata tak selalu terisi untuk nota kredit lama),
  klien akan menyembunyikan tombol yang SEBENARNYA valid, atau
  menampilkan tombol yang PASTI 403 — kedua arah salah, dan hanya backend
  yang tahu aturan sesungguhnya (pola sama arahan Task 10 untuk approval
  chain).

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Verifikasi manual — SoD + kedua role**

  Buat nota kredit dengan akun admin, coba putuskan dengan akun admin YANG
  SAMA — konfirmasi 403 "pemutus harus orang lain" tampil sebagai pesan
  galat yang bisa dibaca (bukan JSON mentah). Putuskan dengan akun
  direktur (atau admin lain) — konfirmasi berhasil. Terapkan nota yang
  sudah disetujui — konfirmasi status berubah `diterapkan`.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/app/admin-portal/keuangan/pengadaan-lanjutan apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): pengadaan lanjutan — tombol putuskan/terapkan nota kredit — Tahap 3"
  ```

### Task 19: Navigasi kategori Tahap 3 + verifikasi akhir tahap

**Files:**
- Modify: `apps/web/lib/admin-portal-kategori.ts` (tambah `g-keuangan`,
  `g-tagih` ke `KATEGORI_AKTIF`)
- Modify: `apps/web/app/admin-portal/kategori/[key]/page.tsx` (tambah
  entri `PETA_HREF_PORTAL` untuk 6 sub-modul dibangun)
- Modify: `apps/web/app/admin-portal/layout.tsx` (`NAV_ITEMS` sudah
  memuat `{ href: "/admin-portal/keuangan", label: "Keuangan", icon:
  Wallet }` sejak Task 1 — TIDAK perlu diubah, cek ulang saja Step 1)

**Interfaces:**
- Consumes: hasil Task 14-18 (Dashboard/Piutang/IPC/GL/Rekonsiliasi/
  Kas/Pengadaan Lanjutan berfungsi).
- Produces: kategori `g-keuangan`/`g-tagih` AKTIF di `/admin-portal/
  kategori`, dengan item yang sudah dibangun mengarah ke halaman
  admin-portal sungguhan.

⚠ Mengikuti KOREKSI MEKANISME Task 5/12 — `KATEGORI_AKTIF` level GRUP,
`PETA_HREF_PORTAL` level ITEM, dan mengaktifkan grup berarti item LAIN
di grup yang sama (`fn-ap`/`fn-aset-tetap`/`fn-pajak`/`fn-efaktur`/
`fn-audit`/`set-api-key`/`set-markup` di `g-keuangan`; `tg-invoice` di
`g-tagih`) IKUT TAMPIL dengan fallback href web — perilaku disengaja,
pola sama Task 5/12.

- [ ] **Step 1: Konfirmasi ulang isi grup `g-keuangan`/`g-tagih` PENUH di
  `peta-menu.ts`** sebelum commit — baca ulang baris 291-327 (riset Task
  13 di atas mengutipnya, VERIFIKASI ke file nyata kalau sudah berubah
  antara riset dan implementasi Task 19). Cek `NAV_ITEMS` di
  `admin-portal/layout.tsx` — `{ href: "/admin-portal/keuangan", label:
  "Keuangan", icon: Wallet }` SUDAH ada sejak Task 1 Step 2 (bottom-nav 4
  item), jadi Task ini TIDAK menambah entri nav baru, hanya memastikan
  href itu benar-benar mengarah ke halaman Task 14 (bukan lagi placeholder).

- [ ] **Step 2: Update `admin-portal-kategori.ts`**

  ```ts
  // Tahap 3 (Task 14-18): "Keuangan" (g-keuangan, item fn-gl/fn-jurnal/
  // gl-peta-akun/gl-jurnalkan/fn-ar/fn-kas/fn-rekonsiliasi/fn-petty/
  // fn-laporan/fn-wip/fn-tutup-buku — 11 dari 18 item grup ini) dan
  // "Penagihan" (g-tagih, item tg-progress/tg-termin/tg-ipc/tg-retensi/
  // tg-uangmuka/tg-tambah/tg-followup/tg-nota-kredit — 8 dari 8 item grup
  // ini, SELURUHNYA tercakup karena "Progress Billing"/"Termin"/"Tagihan
  // Pekerjaan Tambah" sama-sama mengarah ke Beranda Dashboard Keuangan
  // Task 14, bukan halaman terpisah).
  const KATEGORI_AKTIF: string[] = ["g-laporan", "g-sistem", "g-kontrak", "g-jadwal", "g-keuangan", "g-tagih"]; // Tahap 1-3
  ```

- [ ] **Step 3: Update `PETA_HREF_PORTAL` inline di `kategori/[key]/page.tsx`**

  ```ts
  const PETA_HREF_PORTAL: Record<string, string> = {
    "bi-eksekutif": "/admin-portal",
    "sy-inbox-approval": "/admin-portal/inbox",
    // Tahap 2 — Kontrak (g-kontrak) & Perencanaan (g-jadwal)
    "kt-register": "/admin-portal/kontrak/register",
    "kt-asuransi": "/admin-portal/kontrak/asuransi",
    "kt-co": "/admin-portal/kontrak/change-order",
    "kt-eot": "/admin-portal/kontrak/eot-ld-bond",
    "kt-ld": "/admin-portal/kontrak/eot-ld-bond",
    "kt-bond": "/admin-portal/kontrak/eot-ld-bond",
    "kt-claims": "/admin-portal/kontrak/klaim",
    "kt-surat": "/admin-portal/kontrak/surat",
    "jd-cpm": "/admin-portal/jadwal",
    "jd-delay": "/admin-portal/jadwal/keterlambatan",
    // Tahap 3 — Keuangan (g-keuangan)
    "fn-gl": "/admin-portal/keuangan/gl",
    "fn-jurnal": "/admin-portal/keuangan/gl",
    "gl-peta-akun": "/admin-portal/keuangan/gl",
    "gl-jurnalkan": "/admin-portal/keuangan/gl",
    "fn-ar": "/admin-portal/keuangan/piutang",
    "fn-kas": "/admin-portal/keuangan/kas",
    "fn-rekonsiliasi": "/admin-portal/keuangan/rekonsiliasi-bank",
    "fn-petty": "/admin-portal/keuangan/kas",
    "fn-laporan": "/admin-portal/keuangan/gl",
    "fn-wip": "/admin-portal/keuangan/gl",
    "fn-tutup-buku": "/admin-portal/keuangan/gl",
    // Tahap 3 — Penagihan (g-tagih)
    "tg-progress": "/admin-portal/keuangan",
    "tg-termin": "/admin-portal/keuangan",
    "tg-ipc": "/admin-portal/keuangan/ipc",
    "tg-retensi": "/admin-portal/keuangan/piutang",
    "tg-uangmuka": "/admin-portal/keuangan/piutang",
    "tg-tambah": "/admin-portal/keuangan",
    "tg-followup": "/admin-portal/keuangan/piutang",
    "tg-nota-kredit": "/admin-portal/keuangan/pengadaan-lanjutan",
  };
  ```

  ⚠ `fn-gl`/`fn-jurnal`/`gl-peta-akun`/`gl-jurnalkan`/`fn-laporan`/`fn-wip`/
  `fn-tutup-buku` SEMUA menunjuk SATU halaman (`gl`, SegmentedTab 4-arah) —
  pola sama `kt-eot`/`kt-ld`/`kt-bond` di Task 12. `peta-akun`/`jurnalkan`/
  `periode` yang di web desktop punya halaman TERPISAH (`/akuntansi/
  peta-akun`, dst) SENGAJA digabung ke satu tab admin-portal — layar HP
  tak punya ruang untuk memisahkan konfigurasi jarang-diakses (peta akun,
  tutup buku) dari operasional harian (jurnal), dan keduanya sama-sama
  hidup di tab yang relevan pada halaman GL Task 15 (Bagan Akun/Laporan).

- [ ] **Step 4: Verifikasi lantai penjaga ratchet TIDAK naik dari baseline
  Task 12**

  ```bash
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && node scripts/format-ratchet.mjs
  cd apps/web && node scripts/audit-halaman-pakai-cache.mjs
  ```

  Bandingkan angka ke commit Task 12 — laporkan SELISIH, bukan cuma exit
  code.

- [ ] **Step 5: typecheck + build + guard lengkap**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && pnpm build
  cd apps/api && node scripts/jalankan-semua-penjaga.mjs
  ```

  Tempel ringkasan run sungguhan (CHARTER §7) — SEMUA penjaga.

- [ ] **Step 6: a11y runtime penuh (akun admin) + catatan direktur**

  ```bash
  LAYAR_EMAIL=$(grep '^LAYAR_EMAIL' apps/web/.env.local|cut -d= -f2-|tr -d '"\r') \
  LAYAR_SANDI=$(grep '^LAYAR_SANDI' apps/web/.env.local|cut -d= -f2-|tr -d '"\r') \
    node apps/web/scripts/jalankan-a11y-lengkap.mjs
  ```

  Cek `/admin-portal/keuangan`, `/admin-portal/keuangan/piutang`,
  `/admin-portal/keuangan/ipc`, `/admin-portal/keuangan/gl`,
  `/admin-portal/keuangan/gl/jurnal/:id`, `/admin-portal/keuangan/
  rekonsiliasi-bank`, `/admin-portal/keuangan/rekonsiliasi-bank/:id`,
  `/admin-portal/keuangan/kas`, `/admin-portal/keuangan/kas/:id`,
  `/admin-portal/keuangan/pengadaan-lanjutan` (10 halaman). Catat di
  JOURNAL: akun admin TIDAK BISA memverifikasi keadaan "tombol GL/
  Rekonsiliasi hilang untuk direktur" maupun "403 Dashboard/Piutang untuk
  direktur" secara otomatis (0 user direktur aktif) — kedua kondisi itu
  hanya diverifikasi MANUAL lewat akun uji direktur di Task 15/16/14 Step
  6/7 masing-masing, bukan lewat scan a11y otomatis.

- [ ] **Step 7: Verifikasi backend terkait**

  ```bash
  cd apps/api && npx vitest run keuangan-ikhtisar
  cd apps/api && npx vitest run finance
  cd apps/api && npx vitest run cash
  cd apps/api && npx vitest run gl
  cd apps/api && npx vitest run tutup-buku
  cd apps/api && npx vitest run rekonsiliasi-bank
  cd apps/api && npx vitest run pengadaan-lanjutan
  cd apps/api && npx vitest run sertifikat-ipc
  ```

  Tempel ringkasan run sungguhan — memastikan Tahap 3 tidak menyentuh
  backend (constraint global plan ini, dan LARANGAN PERMANEN terhadap
  `lib/tulis-klaim.ts` — CLAUDE.md §6), test yang ADA tetap hijau tanpa
  perubahan.

- [ ] **Step 8: Update dokumen**

  - `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` — tandai `fn-gl`, `fn-jurnal`,
    `gl-peta-akun`, `gl-jurnalkan`, `fn-ar`, `fn-kas`, `fn-rekonsiliasi`,
    `fn-petty`, `fn-laporan`, `fn-wip`, `fn-tutup-buku`, `tg-progress`,
    `tg-termin`, `tg-ipc`, `tg-retensi`, `tg-uangmuka`, `tg-tambah`,
    `tg-followup`, `tg-nota-kredit` sebagai punya halaman admin-portal.
  - `docs/execution/JOURNAL.md` — entri ringkas Tahap 3 selesai, termasuk
    catatan: (a) `finance:view:all` sebagai gerbang BACA admin-only
    (bukan cuma tulis) — kasus baru yang belum ada di Tahap 1-2; (b) GL
    dan Rekonsiliasi terbelah admin-vs-direktur untuk AKSI TULIS; (c)
    Pengadaan Lanjutan justru MENAMBAH kapabilitas admin+direktur di atas
    PM; (d) komentar basi `tutup-buku.ts` ("gl:periode:reopen hanya
    direktur") ADA DI DUA TEMPAT — baris ~24 (kepala berkas) DAN baris
    ~390 (di atas registrasi rute `POST /gl/periode/:id/buka`) — TIDAK
    diperbaiki keduanya (backend di luar scope), tapi dicatat DUA
    lokasinya supaya sesi berikutnya yang menyentuh backend tak memperbaiki
    satu lalu berhenti mengira sudah tuntas.

- [ ] **Step 9: Commit**

  ```bash
  git add apps/web/lib/admin-portal-kategori.ts apps/web/app/admin-portal/kategori/\[key\]/page.tsx apps/web/app/admin-portal/layout.tsx docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md docs/execution/JOURNAL.md
  git commit -m "feat(admin-portal): navigasi kategori Tahap 3 + verifikasi akhir tahap"
  ```

---

## Tahap 4: Procurement + Gudang + Aset

### Task 20: Riset & breakdown — Procurement + Gudang + Aset (Tahap 4)

**Files:**
- Modify (dokumen ini): tambah Task 21+ dengan breakdown lengkap Tahap 4
  berdasar riset task ini.

**Interfaces:**
- Consumes: hasil Tahap 1-3 (shell+layout+gerbang+Dashboard+Inbox+Proyek+
  Kontrak+Jadwal+Keuangan berfungsi, pola `useData`/`hasPermission`/token
  kerapatan/`formatRupiah`/`formatTanggal`/cross-link+WAJAR/render-gate
  `useSyncExternalStore` established dan terbukti di modul finansial
  paling sensitif).
- Produces: daftar Task konkret bernomor untuk Tahap 4, ditulis LANGSUNG
  ke dokumen plan ini (pola sama Task 2/6/13).

- [ ] **Step 1: Baca halaman web yang sudah ada untuk Procurement + Gudang + Aset**

  Baca `apps/web/app/(dashboard)/procurement/*` (verifikasi struktur
  PERSIS ke `lib/peta-menu.ts` grup `g-procurement`, JANGAN tebak dari
  nama folder), `gudang/*` (grup `g-inventory`), dan modul Aset (cari
  grup yang benar — mungkin `g-aset` tersendiri, verifikasi).

- [ ] **Step 2: Baca endpoint backend**

  `apps/api/src/routes/v1/procurement.ts`, `gudang-ikhtisar.ts`,
  `gudang-kelola.ts`, `transfer-stok.ts`, `rekonsiliasi-material.ts`,
  `alat-operasional.ts`, `assets.ts` (atau nama sebenarnya — verifikasi
  ke kode). Rujuk Portal PM Tahap 4 (`docs/superpowers/plans/
  2026-08-20-portal-pm-lengkap.md`, Task 24-26) DAN Tahap 7 (Task 40,
  Alat & Aset) sebagai peta AWAL, TAPI verifikasi ULANG semua endpoint/
  field/permission untuk konteks admin — pola sama Task 6/13 (jangan
  asumsikan sama persis, PM shape sering company-wide vs per-proyek
  berbeda, atau PM kurang permission yang admin/direktur punya).

- [ ] **Step 3: Live query permission admin+direktur untuk SEMUA sub-modul**

  Pisah per role_id (2 baris masing-masing, KONSISTEN pola 7 task
  sebelumnya). Fokus permission approve PO/MR, kelola gudang, transfer
  stok, kelola aset/alat — catat mana yang direktur BEDA dari admin
  (pola Task 15/16 GL/Rekon) vs mana yang admin+direktur SAMA (pola
  Task 17/18 Kas/Pengadaan) vs mana yang company-wide read (pola Task 14
  Dashboard Keuangan).

- [ ] **Step 4: Tentukan company-wide vs per-proyek per sub-modul**

  Procurement (MR/PO) kemungkinan per-proyek (material dipesan untuk
  proyek tertentu) tapi APPROVAL bisa company-wide (admin/direktur
  approve lintas proyek). Gudang bisa company-wide (gudang pusat) atau
  per-proyek (gudang lapangan) — verifikasi ke skema/endpoint. Aset/alat
  operasional kemungkinan company-wide (alat berat dipakai bergantian
  antar proyek).

- [ ] **Step 5: Tulis Task 21+ ke dokumen ini**

  Kode LENGKAP untuk: Procurement (MR/PO, approval-gate kalau ada beda
  admin/direktur), Gudang & Material (lokasi/stok/transfer/rekonsiliasi),
  Aset & Alat Operasional (register/mutasi/sewa/penyusutan — rujuk Portal
  PM Task 40 sbg peta field kalau relevan). Sertakan task navigasi+
  verifikasi akhir Tahap 4 di akhir (pola sama Task 5/12/19).

- [ ] **Step 6: Commit breakdown**

  ```bash
  git add docs/superpowers/plans/2026-08-22-portal-admin-direktur-lengkap.md
  git commit -m "docs(plan): breakdown Tahap 4 — Procurement + Gudang + Aset"
  ```

### Hasil riset Task 20 (2026-08-22) — ringkasan sebelum Task 21-25

**Struktur `peta-menu.ts` — VERIFIKASI, bukan tebakan dari nama folder.**
Tiga grup terpisah, PERSIS seperti dugaan brief:

- `g-procurement` (Pengadaan, urutan 60) — 10 item: Material Request
  (`pr-mr` → `/procurement/permintaan`), RFQ ke Vendor (`pr-rfq` →
  `/procurement/rfq`), Perbandingan Penawaran (`pr-tabulasi` →
  `/procurement/rfq`, satu layar dg RFQ), Purchase Order (`pr-po` →
  `/procurement/pesanan`), Kontrak Payung (`pr-blanket` →
  `/procurement/lanjutan?bagian=payung`, **SUDAH tercakup Task 18**),
  Goods Receipt (`pr-grn` → `/procurement/penerimaan`), 3-Way Match
  (`pr-3way` → `/procurement`), Evaluasi Kinerja Vendor (`pr-evaluasi` →
  `/procurement/kualifikasi`), Jadwal Bayar Vendor (`pr-jadwal-bayar` →
  `/procurement`), Expediting & Logistik (`pr-expediting` →
  `/procurement/lanjutan?bagian=expediting`, **SUDAH tercakup Task 18**).
- `g-inventory` (Gudang & Material, urutan 70) — **8 item**: Gudang Proyek
  (`iv-gudang` → `/procurement`, sebenarnya `/gudang` — catatan
  `peta-menu.ts` basi, lihat temuan di bawah), Stok Masuk & Keluar
  (`iv-mutasi` → `/procurement/stok`), Transfer Antar Proyek
  (`iv-transfer` → `/gudang/transfer`), Stock Opname (`iv-opname` →
  `/procurement`), Minimum Stok (`iv-minstok` → `/procurement/material`),
  Rekonsiliasi Material (`iv-rekonsiliasi` → `/gudang/rekonsiliasi`),
  Tracking Waste (`iv-waste` → `/gudang/rekonsiliasi`, SATU halaman
  dengan `iv-rekonsiliasi`), **`gd-susut`** (Rencana Susut, → `/gudang/
  susut`, CRUD referensi peta resource↔material + rencana target susut
  per material — company-wide, `gudang:susut:view`/`:manage`).
- `g-aset` (Alat & Aset, urutan 130) — 7 item: Register Aset
  (`as-register` → `/aset`), Mutasi Antar Proyek (`as-mutasi` →
  `/aset`), Penyusutan (`as-penyusutan` → `/aset`), Sewa Alat
  (`as-sewa` → `/aset?tab=sewa`), Utilisasi (`as-utilisasi` → `/aset`),
  Maintenance Terjadwal (`as-maintenance` → `/aset/operasional`), Biaya
  Operasional Alat (`as-opex` → `/aset/operasional`), Penyusutan → Jurnal
  (`as-gl` → `/aset/operasional`). SEMUANYA satu dari dua halaman fisik
  (`/aset` atau `/aset/operasional`) — pola SAMA `g-keuangan` Task 13
  (banyak item menu, sedikit halaman fisik).

⚠ **`iv-gudang` catatan `peta-menu.ts` menyebut href `/procurement` tapi
teksnya sendiri bilang "Tabel `gudang` + `gudang_stok`... halaman /gudang
beserta rekonsiliasi & susut"** — href FIELD-nya basi (menunjuk halaman
Procurement lama sebelum modul Gudang berdiri sendiri), TAPI catatan
prosa-nya benar. Portal admin memetakan `iv-gudang` ke halaman
`/admin-portal/gudang` (Task 22) mengikuti CATATAN, bukan field `href`
yang basi — pola sama `audit-taksonomi-vs-kode.mjs` yang dibangun untuk
menangkap kelas cacat ini.

**File route backend — SEMUA nama PERSIS tebakan brief**, diverifikasi
`ls`:

```
apps/api/src/routes/v1/procurement.ts            (MR/PO/GR/supplier-
                                                   invoice/payment/stocks/
                                                   dashboard/reports, 2048
                                                   baris — nomor baris
                                                   IDENTIK riset PM Task 23)
apps/api/src/routes/v1/gudang-ikhtisar.ts         (dashbor lintas-proyek)
apps/api/src/routes/v1/gudang-kelola.ts           (CRUD lokasi gudang)
apps/api/src/routes/v1/transfer-stok.ts           (transfer dua-sisi)
apps/api/src/routes/v1/rekonsiliasi-material.ts   (RAB vs beli/pakai,
                                                   read-only, per-proyek)
apps/api/src/routes/v1/susut-material.ts          (jembatan AHSP↔material
                                                   + rencana susut — DATA
                                                   REFERENSI, company-wide)
apps/api/src/routes/v1/assets.ts                  (register/mutasi/sewa/
                                                   penyusutan aset)
apps/api/src/routes/v1/alat-operasional.ts        (pemakaian/perawatan/
                                                   biaya/jurnalkan alat)
apps/api/src/routes/v1/material-klien.ts          (free-issue material —
                                                   TIDAK ADA di peta-menu.ts
                                                   sama sekali, LUAR
                                                   cakupan navigasi resmi)
```

**Live query permission admin vs direktur 2026-08-22** (pisah per
role_id, dikonfirmasi IDENTIK di seluruh **98 tenant** yang punya kedua
role — dua signature unik: satu utk `admin`, satu utk `direktur`, 0
variasi antar tenant, konsisten metodologi Task 13/17):

| permission | admin | direktur | menggerbangi |
|---|---|---|---|
| `procurement:view` | ✅ | ✅ | SEMUA GET material-requests/purchase-orders/goods-receipts/stocks/dashboard/reports |
| `procurement:mr:manage` | ✅ | ✅ | POST/PATCH/DELETE material-requests + items, `PATCH .../submit` |
| `procurement:mr:override_quota` | ✅ | ✅ | melampaui kuota RAB saat submit MR — **BEDA dari PM** (PM Task 23 TIDAK punya ini) |
| `procurement:po:manage` | ✅ | ✅ | POST/PATCH/cancel purchase-orders, POST goods-receipts, confirm GR, delivery-message/log |
| `procurement:payment:manage` | ✅ | ✅ | supplier-invoices/payments (LUAR cakupan Tahap 4 — sudah Task 18 Pengadaan Lanjutan utk nota kredit; supplier-invoice/payment sendiri TIDAK di `peta-menu.ts` sebagai item terpisah) |
| `procurement:material:manage` | ✅ | ✅ | POST/PATCH materials, PATCH min-stock, POST material-klien, POST transfer-stok |
| `procurement:supplier:manage` | ✅ | ✅ | POST/PATCH suppliers |
| `gudang:view` | ✅ | ✅ | GET `/gudang`, `/gudang/ikhtisar` |
| `gudang:manage` | ✅ | ❌ | POST/PATCH `/gudang` (buat & edit lokasi gudang) — **direktur TIDAK bisa kelola lokasi gudang** |
| `gudang:susut:view` | ✅ | ✅ | GET peta resource↔material, rencana susut |
| `gudang:susut:manage` | ✅ | ❌ | PUT/DELETE peta resource↔material, PUT rencana susut — **direktur TIDAK bisa edit data referensi susut** |
| `rekonsiliasi:view` | ✅ | ✅ | dipakai modul Keuangan Task 16 (Rekonsiliasi Bank) — **BUKAN** `rekonsiliasi-material.ts` (yang bergerbang `procurement:view`, lihat baris di atas — nama mirip TAPI dua fitur berbeda total, jangan tertukar) |
| `rekonsiliasi:manage` | ✅ | ❌ | idem, domain Rekonsiliasi Bank |
| `rekonsiliasi:lock` | ✅ | ❌ | idem, domain Rekonsiliasi Bank |
| `assets:view` | ✅ | ✅ | SEMUA GET `/assets`, `/asset-rentals`, `/alat-operasional`, movements, depreciation |
| `assets:manage` | ✅ | ❌ | POST/PATCH `/assets`, movements, depreciation; POST/PATCH `/asset-rentals`; POST pemakaian/perawatan/biaya `alat-operasional` — **direktur HANYA BISA MELIHAT aset & alat, TIDAK bisa mendaftarkan/memutasi/mencatat apa pun** |
| `gl:manage` | ✅ | ❌ | `POST /alat-operasional/penyusutan/jurnalkan` (dikonfirmasi ULANG Task 13 — direktur TIDAK punya `gl:manage` sama sekali, konsisten) |

⚠ **PENTING — `rekonsiliasi:*` dipakai DUA modul yang TAK BERHUBUNGAN.**
`rekonsiliasi-material.ts` (Gudang & Material, Tahap 4, halaman
`/gudang/rekonsiliasi`) bergerbang `procurement:view` — BUKAN
`rekonsiliasi:*`. Permission `rekonsiliasi:view`/`manage`/`lock` yang
tabelnya di atas HANYA berlaku untuk Rekonsiliasi BANK (`rekonsiliasi-
bank.ts`, sudah dibangun Task 16). Kemiripan nama ini sempat membuat
draf pertama riset ini salah menyimpulkan "Rekonsiliasi Material terbelah
admin-direktur" — SALAH, `rekonsiliasi-material.ts` (baca-saja,
`procurement:view`) sama-sama bisa diakses admin MAUPUN direktur.

⚠ **Pola dominan Tahap 4: admin+direktur SAMA untuk procurement (kecuali
nol — semua sama), TERBELAH untuk gudang-lokasi/susut-manage/aset/alat**
— campuran dua pola sebelumnya, bukan salah satu murni:

- **Procurement (MR/PO/GR/Material/Supplier) — pola Task 17/18 (SAMA)**:
  admin dan direktur punya PERSIS permission yang sama, termasuk
  `procurement:mr:override_quota` yang PM TIDAK punya. TIDAK ADA
  render-gate berbeda admin-vs-direktur di modul Procurement Tahap 4 ini
  — kalau ada tombol yang disembunyikan, itu perbandingan terhadap PM
  (Task 24 di bawah), bukan terhadap direktur.
- **Gudang Lokasi (buat/edit) + Susut (edit referensi) — pola Task 15/16
  (BEDA)**: `gudang:manage`/`gudang:susut:manage` admin-only. Ikhtisar
  gudang dan lihat data susut tetap sama-sama bisa (`gudang:view`/
  `gudang:susut:view`).
- **Aset & Alat Operasional — pola Task 15/16 (BEDA), PALING EKSTRIM
  Tahap 4**: `assets:manage` admin-only berarti direktur TIDAK bisa
  membuat SATU PUN tulisan di modul ini — bukan cuma satu tombol
  hilang seperti GL (yang direktur masih bisa tutup/buka periode),
  direktur di modul Aset murni PEMBACA. Sama seperti GL, `gl:manage`
  utk tombol Jurnalkan Penyusutan JUGA admin-only.
- **Rekonsiliasi Material — company-wide-baca utk KEDUANYA**: satu-
  satunya sub-modul Tahap 4 yang justru TIDAK py pembedaan sama sekali
  (read-only utk siapa pun ber-`procurement:view`, admin dan direktur
  identik).

**Company-wide vs per-proyek — dikonfirmasi per sub-modul (kode nyata,
BUKAN dugaan brief):**

| sub-modul | cakupan | alasan (verifikasi kode) |
|---|---|---|
| Material Request | **per-proyek, TAPI `project_id` OPSIONAL** | `proyekBolehDibaca()` (`procurement.ts:82-89`) — tanpa `project_id`, memulangkan SEMUA proyek tenant (`request.db!.projectIds()`) sekaligus; DIBERI `project_id`, mempersempit ke SATU. Admin/direktur BISA lihat lintas-proyek dalam SATU panggilan (beda dari PM yang wajib pilih satu proyek dulu) |
| Purchase Order | **per-proyek, opsional** | fungsi HELPER SAMA `proyekBolehDibaca()`, baris 871/912 |
| Goods Receipt | **per-proyek, opsional** | fungsi HELPER SAMA, baris 1153 |
| Stocks (kartu stok) | **per-proyek, opsional** | fungsi HELPER SAMA, baris 1653 |
| Transfer Stok | **company-wide** (dua sisi proyek asal+tujuan tenant) | `transfer-stok.ts:42` — `request.db!.projectIds()` dipakai menyaring KEDUA `project_asal_id`/`project_tujuan_id` sekaligus, TIDAK ada mode "satu proyek wajib" |
| Gudang (ikhtisar+lokasi) | **company-wide MURNI** | `gudang-ikhtisar.ts`/`gudang-kelola.ts` — `company_id`, NOL kolom `project_id` di tabel `gudang` |
| Rekonsiliasi Material | **per-proyek WAJIB** | `GET /projects/:projectId/rekonsiliasi-material` — `:projectId` di PATH, bukan query opsional; BEDA dari MR/PO/GR yang opsional |
| Susut (referensi) | **company-wide MURNI** | `susut-material.ts` — peta resource↔material & rencana susut per MATERIAL, tanpa dimensi proyek sama sekali |
| Aset (register+mutasi+penyusutan+sewa) | **company-wide MURNI** | `assets.ts` — `current_project_id` HANYA metadata "sedang di proyek mana", BUKAN filter akses; `assets:view`/`manage` company-scoped |
| Alat Operasional (pemakaian+perawatan+biaya+jurnalkan) | **company-wide MURNI** | `alat-operasional.ts` — `request.companyId!`, alat dipakai bergantian lintas proyek sesuai dugaan awal brief |

Prediksi awal brief ("Procurement per-proyek tapi approval company-wide,
Gudang campuran, Aset company-wide") **SEBAGIAN BENAR, dengan koreksi
penting**: Procurement memang per-proyek TAPI opsional (bisa company-
wide sekali panggil tanpa filter — bukan "per-proyek wajib + approval
terpisah company-wide" seperti dugaan), dan APPROVAL MR/PO TIDAK
dibangun sebagai tombol di modul ini sama sekali (lihat temuan approval
di bawah) — sudah tercakup Inbox Task 4.

**Temuan kritis #1 — APPROVAL MR/PO SATU PINTU, dan SUDAH TERCAKUP PENUH
sejak Task 4 (Inbox), SEBELUM riset Procurement ini ada.** `PATCH
/material-requests/:id/approve` dan `PATCH /purchase-orders/:id/status`
(transisi ke `sent`) SAMA-SAMA lewat `evaluateEntityApproval`/
`canParticipateInChain` (ADR-007), BUKAN `requirePermission` langsung —
identik temuan PM Task 23. Diverifikasi LANGSUNG ke
`admin-portal/inbox/page.tsx`: `material_request` (baris ~109) dan
`purchase_order` (baris ~126) SUDAH terdaftar PENUH di peta `AKSI`
(approve/reject URL, `tolakDinonaktifkan` utk `purchase_order` — pola
sama `rencana_mutu`), lengkap dengan `useData` detail per-jenis (baris
~273-305). **TIDAK ADA lubang yang perlu ditutup** — Task 4 sudah
menuntaskan approval MR/PO sebelum Tahap 4 ini dimulai. Task 21 KARENA
ITU TIDAK membangun tombol approve terpisah di halaman Procurement sama
sekali — bukan sekadar "menghindari", tapi karena tombolnya SUDAH ADA
di Inbox dan menambah jalur kedua akan melanggar
`audit-approval-satu-pintu.mjs`.

**Temuan kritis #2 — `POST /procurement/stocks/opname` bergerbang
`procurement:view` (BACA) padahal MENULIS**, PRA-EKSISTING (identik
temuan PM Task 23 Temuan #2, `procurement.ts:2023`). TIDAK diperbaiki
di sini (backend di luar scope plan frontend-only). Task 22 (Gudang)
KARENA ITU TIDAK membangun halaman Stock Opname — konsisten keputusan
PM Task 26 (menghindari mengekspos jalur tulis-massal bergerbang-baca
ke LEBIH BANYAK pengguna).

**Temuan kritis #3 — `iv-opname`/`iv-minstok` TIDAK dapat halaman baru**,
sama alasan PM (Temuan #2 di atas utk opname; minstok adalah master data
kuota RAB yang sudah tercakup `quota-check` MR — lihat Task 21). Kedua
key ini fallback ke href web `peta-menu.ts` di Task 24 (nav), BUKAN
dibiarkan tak dipetakan sama sekali seperti kelalaian PM Task 26 sempat
lakukan pada `iv-minstok` — Task 24 mengisi eksplisit dengan alasan
tertulis, bukan diam-diam kosong.

**Temuan kritis #4 — modul Aset py TIGA gerbang tulis berbeda dalam SATU
halaman gabungan**: `assets:manage` (register/mutasi/sewa/catat-
penyusutan) dan `gl:manage` (jurnalkan penyusutan) adalah DUA permission
TERPISAH yang KEBETULAN sama-sama admin-only untuk direktur — halaman
Task 23 WAJIB dua render-gate independen (`bolehKelolaAset` DAN
`bolehJurnalkan`), BUKAN satu gate gabungan, supaya kalau suatu saat
`gl:manage` diberikan ke role lain tanpa `assets:manage` (atau
sebaliknya), UI tetap benar tanpa perlu disentuh ulang.

**Konfirmasi eksplisit — TIDAK ADA duplikasi dengan Task 18 (Pengadaan
Lanjutan).** `pr-blanket`/`pr-expediting`/`tg-nota-kredit` SUDAH
dibangun Task 18 (`/admin-portal/keuangan/pengadaan-lanjutan`,
`GET /pengadaan-lanjutan`). Task 21 (Procurement Tahap 4 ini) HANYA
membangun MR/PO/GR — TIDAK menyentuh tiga item itu lagi. Namun
`PETA_HREF_PORTAL` untuk `pr-blanket`/`pr-expediting` **BELUM diisi**
sejak Task 19 (hanya `tg-nota-kredit` yang dipetakan) — Task 24 (nav
Tahap 4 ini) WAJIB menutup kekurangan Task 19 itu sekalian, supaya
mengaktifkan `g-procurement` tidak membuat dua item itu tampil dengan
fallback href web padahal halamannya SUDAH ADA sejak Task 18.

**Perbandingan eksplisit dengan Portal PM (Task 23-26, 40) — DELTA yang
mengubah breakdown, bukan sekadar "salin, hapus filter `.pm`":**

| aspek | Portal PM | Portal Admin/Direktur (Tahap 4 ini) |
|---|---|---|
| MR/PO list | WAJIB pilih satu proyek dulu (`daftarProyek.filter(p => p.pm)`, single `project_id`) | Opsional — company-wide sekali panggil TANPA filter proyek dulu (`proyekBolehDibaca` tanpa `project_id` = SEMUA), project-picker jadi PENYARING bukan PRASYARAT |
| `procurement:mr:override_quota` | PM TIDAK punya | Admin+direktur PUNYA — Task 21 WAJIB menambah tombol/opsi override yang TIDAK ADA di versi PM |
| `procurement:payment:manage` | PM TIDAK punya | Admin+direktur PUNYA, TAPI sudah tercakup Task 18 (luar cakupan Task 21) |
| `gudang:manage`/`susut:manage` | PM PUNYA PENUH | Direktur TIDAK punya — Task 22 WAJIB menambah render-gate yang TIDAK ADA di versi PM (PM tak pernah butuh gate ini) |
| `assets:manage`/`gl:manage` (aset) | PM PUNYA PENUH (dikonfirmasi ulang Task 40 review) | Direktur TIDAK punya SATU PUN dari keduanya — Task 23 WAJIB dua render-gate independen yang TIDAK ADA di versi PM |
| Rekonsiliasi Material | per-proyek PM sendiri (proyek yang sedang ditangani PM) | per-proyek TAPI admin/direktur pilih dari SEMUA proyek tenant (bukan hanya proyek sendiri) |

Kesimpulan pola: **Tahap 4 adalah kasus PALING BANYAK render-gate baru
dari SELURUH plan ini sejauh Task 20** — tiga sub-modul (Gudang-manage,
Susut-manage, Aset+Alat) SEMUANYA butuh gate admin-vs-direktur yang
tidak ada preseden di versi PM manapun, sementara Procurement sendiri
adalah kasus SAMA PERSIS Task 17/18 (admin=direktur, beda dari PM).

**Temuan bonus — `_bersama/tipe.ts` SUDAH memuat `MrRingkas`/`MrDetail`/
`RespMrDetail`/`PoRingkas`/`PoDetail`/`RespPoDetail` (baris 186-239)**,
ditambahkan Task 4 untuk kebutuhan detail Inbox approval MR/PO —
diverifikasi PERSIS baris-per-baris sama dengan bentuk yang dipakai di
sini. Task 21 KARENA ITU tidak menulis ulang enam tipe itu — cukup
IMPOR dari `_bersama/tipe.ts` yang sudah ada, dan hanya MENAMBAH tipe
yang belum ada (`RespMrDaftar`, `RespPoDaftar`, `RespGrDaftar`,
`RespQuotaCheck`, `RespMaterialDaftar`, `RespSupplierDaftar`,
`RespPesanPo`, `RespDeliveryLog`, `RespKuotaRab`).

---

## Tahap 4 lanjutan: Task 21-25

### Task 21: Procurement — daftar 3-tab company-wide + buat MR/PO + detail & aksi

**Files:**
- Create: `apps/web/app/admin-portal/procurement/page.tsx`
- Create: `apps/web/app/admin-portal/procurement/mr/[id]/page.tsx`
- Create: `apps/web/app/admin-portal/procurement/po/[id]/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah 9 tipe
  BARU — `MrRingkas`/`MrDetail`/`RespMrDetail`/`PoRingkas`/`PoDetail`/
  `RespPoDetail` SUDAH ADA sejak Task 4, JANGAN ditulis ulang)

**Interfaces:**
- Consumes: `GET /api/v1/procurement/material-requests?project_id=`
  (opsional — `procurement:view`, admin+direktur SAMA), `GET .../
  purchase-orders?project_id=`, `GET .../goods-receipts?project_id=`
  (ketiganya `procurement:view`, `project_id` OPSIONAL — lihat catatan
  ⚠ di bawah), `POST .../material-requests` + `POST .../purchase-
  orders` (`procurement:mr:manage`/`po:manage`, admin+direktur SAMA),
  `GET .../material-requests/:id/quota-check` (`procurement:view`),
  `PATCH .../material-requests/:id/submit` (`procurement:mr:manage`,
  body `{ override_quota?: true }` bila `procurement:mr:override_quota`
  — admin+direktur SAMA-SAMA PUNYA, BEDA dari PM), `GET .../materials`,
  `GET .../suppliers` (picker item), `GET .../purchase-orders/:id/
  delivery-message` + `POST/GET .../delivery-log` (kirim WA ke
  vendor), `POST .../goods-receipts` (buat GR dari PO).
- Produces: `/admin-portal/procurement` (list 3-tab MR/PO/GR, TANPA
  wajib pilih proyek dulu — project-picker OPSIONAL sebagai penyaring),
  `/admin-portal/procurement/mr/[id]` (detail + quota-check + submit +
  override), `/admin-portal/procurement/po/[id]` (detail + kirim WA +
  buat GR).

⚠ **BEDA STRUKTURAL dari Portal PM (Task 24) — project-picker OPSIONAL,
bukan WAJIB.** PM mewajibkan `daftarProyek.filter(p => p.pm)` lalu pilih
SATU proyek sebelum apa pun tampil (`proyekAktif = proyekId ||
daftarProyek[0]?.id`). Admin/direktur company-wide: TANPA memilih
proyek, list MR/PO/GR menampilkan SEMUA proyek tenant sekaligus (server
`proyekBolehDibaca()` tanpa `project_id` mengembalikan
`db.projectIds()` penuh). Project-picker di halaman ini adalah OPSI
"Semua Proyek" (default) + daftar proyek individual — BUKAN prasyarat
sebelum data muncul. Field `project.name` pada tiap baris WAJIB
ditampilkan di kartu (PM tidak perlu — satu proyek per layar; admin
company-wide butuh, atau baris-baris dari proyek berbeda tak
terbedakan).

⚠ **`procurement:mr:override_quota` — admin+direktur PUNYA, PM TIDAK.**
Detail MR (Task 21 Step 4) WAJIB menampilkan checkbox/toggle "Lampaui
kuota RAB" saat `quota-check` mengembalikan `lolos: false`, dan
mengirim `override_quota: true` ke `submit` — kapabilitas yang TIDAK
ADA di `pm-portal/procurement/mr/[id]/page.tsx` versi manapun (PM hanya
menampilkan pelanggaran sebagai info, tombol submit tetap terkunci).
Menyalin versi PM apa adanya di sini akan MENYEMBUNYIKAN kapabilitas
yang admin/direktur benar-benar punya.

- [ ] **Step 1: Tambah 9 tipe BARU ke `_bersama/tipe.ts`** (di bawah
  `RespPoDetail` yang sudah ada, baris ~239) — bentuk diverifikasi
  baris-per-baris ke `procurement.ts` (Task 20 Step 2):

  ```typescript
  /** Bentuk PERSIS `GET /api/v1/procurement/material-requests`,
   * `procurement.ts:263-268`. Memakai `MrRingkas` yang SUDAH ADA
   * (baris 187, ditambahkan Task 4 untuk kebutuhan Inbox). */
  export interface RespMrDaftar { material_requests: MrRingkas[] }

  /** Bentuk PERSIS `GET /material-requests/:id/quota-check`,
   * `procurement.ts:593-610`. `bisa_override` TRUE untuk admin/
   * direktur (`procurement:mr:override_quota` — BEDA dari PM). */
  export interface RespQuotaCheck {
    mr_number: string | null;
    lolos: boolean;
    pelanggaran: Array<{ material_id: string; material_name?: string; diminta: number; sisa: number }>;
    tanpa_kuota: Array<{ material_id: string; material_name?: string }>;
    bisa_override: boolean;
  }

  /** Bentuk PERSIS `GET /api/v1/procurement/purchase-orders`,
   * `procurement.ts:861-866`. Memakai `PoRingkas` yang SUDAH ADA. */
  export interface RespPoDaftar { purchase_orders: PoRingkas[] }

  /** Bentuk PERSIS `GET /purchase-orders/:id/delivery-message`,
   * `procurement.ts:363-428`. `wa_url` NULL kalau nomor telepon
   * supplier tak sah — UI WAJIB menyembunyikan tombol kirim WA saat
   * null, bukan memasang tautan ke nomor ngawur. */
  export interface RespPesanPo {
    po_number: string | null;
    pesan: string;
    wa_url: string | null;
    email_tujuan: string | null;
    sudah_dikirim: { whatsapp_at: string | null; email_at: string | null };
  }

  /** Bentuk PERSIS `GET /purchase-orders/:id/delivery-log`,
   * `procurement.ts:486-505` — kunci `data`, bukan `logs`. */
  export interface RespDeliveryLog {
    data: Array<{ id: string; channel: "whatsapp" | "email" | "manual"; recipient: string | null; status: string | null; notes: string | null; sent_at: string; sender: { name: string } | null }>;
  }

  /** Bentuk PERSIS `GET /api/v1/procurement/goods-receipts`,
   * `procurement.ts:1136-1149`. */
  export interface GrRingkas {
    id: string;
    gr_number: string | null;
    status: "draft" | "confirmed" | string;
    receipt_date: string | null;
    delivery_note_number: string | null;
    delivery_note_url: string | null;
    notes: string | null;
    confirmed_at: string | null;
    created_at: string;
    project: { id: string; name: string } | null;
    supplier: { id: string; name: string } | null;
    po: { id: string; po_number: string | null } | null;
    received_by: { id: string; name: string } | null;
    items: Array<{ id: string; qty_received: number | string; unit: string; unit_price: number | string; material: { id: string; name: string } | null }>;
  }
  export interface RespGrDaftar { goods_receipts: GrRingkas[] }

  /** Bentuk PERSIS `GET /api/v1/procurement/materials`,
   * `procurement.ts:114-134` — dipakai picker item MR/PO. */
  export interface MaterialRingkas {
    id: string; code: string | null; name: string; unit: string;
    unit_price: number | string | null; description: string | null; is_active: boolean;
    category: { id: string; name: string } | null;
  }
  export interface RespMaterialDaftar { materials: MaterialRingkas[] }

  /** Bentuk PERSIS `GET /api/v1/procurement/suppliers`,
   * `procurement.ts:174-197`. */
  export interface SupplierRingkas {
    id: string; code: string | null; name: string;
    contact_person: string | null; phone: string | null; email: string | null;
    payment_terms: string | null; is_active: boolean;
  }
  export interface RespSupplierDaftar { suppliers: SupplierRingkas[] }

  /** Bentuk PERSIS `GET /projects/:projectId/rab-materials`,
   * `procurement.ts:506-552` — dipakai memperingatkan kuota SEBELUM
   * `submit` (bukan menggantikan `quota-check`, keduanya dipakai). */
  export interface KuotaRabMaterial {
    id: string; material_id: string; rab_quantity: number | string; rab_unit_cost: number | string | null;
    notes: string | null;
    material: { id: string; name: string; unit: string } | null;
    terpakai: number; sisa: number; serapan_pct: number | null;
  }
  export interface RespKuotaRab { data: KuotaRabMaterial[] }
  ```

- [ ] **Step 2: `procurement/page.tsx`** — list 3-tab (MR/PO/GR),
  project-picker OPSIONAL ("Semua Proyek" default + daftar individual,
  TANPA filter `.pm`/`.filter((p) => p.pm)` — pola sama Task 7/9/10/11),
  tombol "+ Buat" per tab SELALU tampil (admin+direktur SAMA-SAMA punya
  `mr:manage`/`po:manage` penuh, tak perlu render-gate berbeda role).

  ```tsx
  "use client";

  import { useMemo, useState } from "react";
  import Link from "next/link";
  import { ShoppingCart, Plus } from "lucide-react";
  import { useData, invalidasi } from "@/lib/data-cache";
  import { api } from "@/lib/api";
  import { formatRupiah, formatTanggal } from "@/lib/format";
  import SegmentedTab from "@/components/portal/SegmentedTab";
  import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
  import EmptyState from "@/components/portal/EmptyState";
  import SkeletonCard from "@/components/portal/SkeletonCard";
  import BottomSheet from "@/components/portal/BottomSheet";
  import type {
    ProyekPM, GalatApi, RespMrDaftar, RespPoDaftar, RespGrDaftar,
    RespMaterialDaftar, RespSupplierDaftar, MaterialRingkas, SupplierRingkas,
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

  export default function AdminProcurementPage() {
    const [tab, setTab] = useState<"mr" | "po" | "gr">("mr");
    const [proyekId, setProyekId] = useState(""); // "" = SEMUA PROYEK (company-wide)
    const [sheetMr, setSheetMr] = useState(false);
    const [sheetPo, setSheetPo] = useState(false);

    const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
    // TANPA filter `.pm` — admin/direktur lihat SEMUA proyek tenant, beda dari PM.
    const daftarProyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

    const qs = proyekId ? `?project_id=${proyekId}` : ""; // kosong = company-wide, server proyekBolehDibaca() tanpa project_id
    const { data: dataMr, memuat: memuatMr, galat: galatMr } = useData<RespMrDaftar>(tab === "mr" ? `/api/v1/procurement/material-requests${qs}` : null);
    const { data: dataPo, memuat: memuatPo, galat: galatPo } = useData<RespPoDaftar>(tab === "po" ? `/api/v1/procurement/purchase-orders${qs}` : null);
    const { data: dataGr, memuat: memuatGr, galat: galatGr } = useData<RespGrDaftar>(tab === "gr" ? `/api/v1/procurement/goods-receipts${qs}` : null);

    const { data: dataMaterial } = useData<RespMaterialDaftar>(sheetMr ? "/api/v1/procurement/materials?limit=200" : null);
    const { data: dataSupplier } = useData<RespSupplierDaftar>(sheetPo ? "/api/v1/procurement/suppliers?limit=200" : null);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Procurement</h1>
          {tab === "mr" && (
            <button type="button" onClick={() => setSheetMr(true)} aria-label="Buat Material Request baru"
              style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Plus size={16} aria-hidden="true" /> MR
            </button>
          )}
          {tab === "po" && (
            <button type="button" onClick={() => setSheetPo(true)} aria-label="Buat Purchase Order baru"
              style={{ minHeight: 40, padding: "0 14px", borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Plus size={16} aria-hidden="true" /> PO
            </button>
          )}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select value={proyekId} onChange={(e) => setProyekId(e.target.value)}
            style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}>
            <option value="">Semua Proyek</option>
            {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        <SegmentedTab
          opsi={[{ value: "mr", label: "Material Request" }, { value: "po", label: "Purchase Order" }, { value: "gr", label: "Penerimaan" }]}
          aktif={tab}
          onUbah={(v) => setTab(v as typeof tab)}
        />

        {tab === "mr" && (
          <>
            {memuatMr && <SkeletonCard tinggi={80} />}
            {galatMr && <EmptyState icon={ShoppingCart} judul="Gagal memuat MR" deskripsi={pesanGalat(galatMr as GalatApi, "Coba muat ulang.")} />}
            {!memuatMr && !galatMr && (dataMr?.material_requests?.length ?? 0) === 0 && (
              <EmptyState icon={ShoppingCart} judul="Belum ada Material Request" deskripsi="Buat permintaan material pertama." />
            )}
            {!memuatMr && (dataMr?.material_requests ?? []).map((mr) => (
              <Link key={mr.id} href={`/admin-portal/procurement/mr/${mr.id}`}
                style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{mr.mr_number ?? "MR"}</span>
                  <StatusBadge status={VARIAN_MR[mr.status] ?? "netral"} label={LABEL_MR[mr.status] ?? mr.status} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {mr.project?.name ?? "—"} · {mr.request_date ? formatTanggal(mr.request_date) : "—"} · {mr.items.length} item
                </div>
                {mr.requested_by?.name && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Diminta: {mr.requested_by.name}</div>}
              </Link>
            ))}
          </>
        )}

        {tab === "po" && (
          <>
            {memuatPo && <SkeletonCard tinggi={80} />}
            {galatPo && <EmptyState icon={ShoppingCart} judul="Gagal memuat PO" deskripsi={pesanGalat(galatPo as GalatApi, "Coba muat ulang.")} />}
            {!memuatPo && !galatPo && (dataPo?.purchase_orders?.length ?? 0) === 0 && (
              <EmptyState icon={ShoppingCart} judul="Belum ada Purchase Order" deskripsi="PO ke supplier akan muncul di sini." />
            )}
            {!memuatPo && (dataPo?.purchase_orders ?? []).map((po) => (
              <Link key={po.id} href={`/admin-portal/procurement/po/${po.id}`}
                style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{po.po_number ?? "PO"}</span>
                  <StatusBadge status={VARIAN_PO[po.status] ?? "netral"} label={LABEL_PO[po.status] ?? po.status} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{po.project?.name ?? "—"} · {po.supplier?.name ?? "—"} · {formatRupiah(po.total_amount)}</div>
                {po.expected_delivery_date && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Estimasi kirim: {formatTanggal(po.expected_delivery_date)}</div>}
              </Link>
            ))}
          </>
        )}

        {tab === "gr" && (
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
                  {gr.project?.name ?? "—"} · {gr.supplier?.name ?? "—"} · PO {gr.po?.po_number ?? "—"} · {gr.receipt_date ? formatTanggal(gr.receipt_date) : "—"}
                </div>
              </div>
            ))}
          </>
        )}

        <SheetBuatMr terbuka={sheetMr} onTutup={() => setSheetMr(false)} proyekId={proyekId} daftarProyek={daftarProyek} material={dataMaterial?.materials ?? []} />
        <SheetBuatPo terbuka={sheetPo} onTutup={() => setSheetPo(false)} proyekId={proyekId} daftarProyek={daftarProyek} supplier={dataSupplier?.suppliers ?? []} />
      </div>
    );
  }

  interface BarisItemForm { material_id: string; qty: string; unit: string }

  function SheetBuatMr({ terbuka, onTutup, proyekId, daftarProyek, material }: {
    terbuka: boolean; onTutup: () => void; proyekId: string; daftarProyek: ProyekPM[]; material: MaterialRingkas[];
  }) {
    const [proyekForm, setProyekForm] = useState(proyekId);
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
      if (!proyekForm) { setGalat("Pilih proyek untuk MR ini."); return; }
      const valid = items.filter((it) => it.material_id && Number(it.qty) > 0);
      if (valid.length === 0) { setGalat("Isi minimal satu item dengan qty > 0."); return; }
      setMengirim(true); setGalat(null);
      try {
        await api.post("/api/v1/procurement/material-requests", {
          project_id: proyekForm,
          needed_date: neededDate || undefined,
          notes: notes.trim() || undefined,
          items: valid.map((it) => ({ material_id: it.material_id, qty_requested: Number(it.qty), unit: it.unit })),
        });
        invalidasi(`/api/v1/procurement/material-requests`); // menyapu SEMUA varian query (company-wide + per-proyek)
        setItems([{ material_id: "", qty: "", unit: "" }]); setNeededDate(""); setNotes(""); onTutup();
      } catch (e) {
        setGalat(pesanGalat(e as GalatApi, "Gagal membuat MR"));
      } finally { setMengirim(false); }
    }

    return (
      <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Material Request Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Proyek
            <select value={proyekForm} onChange={(e) => setProyekForm(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)" }}>
              <option value="">Pilih proyek…</option>
              {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

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
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => ubahBaris(i, { qty: e.target.value })}
                  placeholder="Qty" aria-label={`Kuantitas item ${i + 1}`}
                  style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
                {items.length > 1 && (
                  <button type="button" onClick={() => hapusBaris(i)} aria-label={`Hapus item ${i + 1}`}
                    style={{ minHeight: 36, minWidth: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}>×</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={tambahBaris}
            style={{ minHeight: 40, padding: "0 14px", borderRadius: 10, border: "1px dashed var(--border)", background: "transparent", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Tambah item
          </button>

          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Catatan
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, resize: "vertical" }} />
          </label>

          {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

          <button type="button" onClick={simpan} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer", opacity: mengirim ? 0.6 : 1 }}>
            {mengirim ? "Menyimpan…" : "Simpan MR"}
          </button>
        </div>
      </BottomSheet>
    );
  }

  interface BarisItemPoForm { material_id: string; qty: string; unit: string; harga: string }

  function SheetBuatPo({ terbuka, onTutup, proyekId, daftarProyek, supplier }: {
    terbuka: boolean; onTutup: () => void; proyekId: string; daftarProyek: ProyekPM[]; supplier: SupplierRingkas[];
  }) {
    const [proyekForm, setProyekForm] = useState(proyekId);
    const [supplierId, setSupplierId] = useState("");
    const [items, setItems] = useState<BarisItemPoForm[]>([{ material_id: "", qty: "", unit: "", harga: "" }]);
    const [mengirim, setMengirim] = useState(false);
    const [galat, setGalat] = useState<string | null>(null);

    async function simpan() {
      if (!proyekForm) { setGalat("Pilih proyek untuk PO ini."); return; }
      if (!supplierId) { setGalat("Pilih supplier."); return; }
      const valid = items.filter((it) => it.material_id && Number(it.qty) > 0 && Number(it.harga) >= 0);
      if (valid.length === 0) { setGalat("Isi minimal satu item dengan qty > 0 dan harga terisi."); return; }
      setMengirim(true); setGalat(null);
      try {
        await api.post("/api/v1/procurement/purchase-orders", {
          project_id: proyekForm,
          supplier_id: supplierId,
          items: valid.map((it) => ({ material_id: it.material_id, qty_ordered: Number(it.qty), unit: it.unit, unit_price: Number(it.harga) })),
        });
        invalidasi(`/api/v1/procurement/purchase-orders`);
        setItems([{ material_id: "", qty: "", unit: "", harga: "" }]); setSupplierId(""); onTutup();
      } catch (e) {
        setGalat(pesanGalat(e as GalatApi, "Gagal membuat PO"));
      } finally { setMengirim(false); }
    }

    return (
      <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Purchase Order Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Proyek
            <select value={proyekForm} onChange={(e) => setProyekForm(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)" }}>
              <option value="">Pilih proyek…</option>
              {daftarProyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Supplier
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
              style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)" }}>
              <option value="">Pilih supplier…</option>
              {supplier.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item</div>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: "var(--surface-subtle)" }}>
              <input value={it.material_id} onChange={(e) => setItems((p) => p.map((b, idx) => idx === i ? { ...b, material_id: e.target.value } : b))}
                placeholder="ID material (dari MR/katalog)" aria-label={`Material id item ${i + 1}`}
                style={{ minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => setItems((p) => p.map((b, idx) => idx === i ? { ...b, qty: e.target.value } : b))}
                  placeholder="Qty" aria-label={`Kuantitas item ${i + 1}`}
                  style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
                <input type="number" min="0" step="1" value={it.harga} onChange={(e) => setItems((p) => p.map((b, idx) => idx === i ? { ...b, harga: e.target.value } : b))}
                  placeholder="Harga satuan" aria-label={`Harga satuan item ${i + 1}`}
                  style={{ flex: 1, minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }} />
              </div>
            </div>
          ))}

          {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}

          <button type="button" onClick={simpan} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer", opacity: mengirim ? 0.6 : 1 }}>
            {mengirim ? "Menyimpan…" : "Simpan PO"}
          </button>
        </div>
      </BottomSheet>
    );
  }
  ```

  ⚠ **Picker item PO SENGAJA pakai input ID mentah, BUKAN dropdown
  material seperti MR** — `purchase_orders` tak WAJIB berasal dari MR
  (PO langsung tanpa MR sah, `procurement.ts:903-956` tak mensyaratkan
  `mr_id`), TAPI memilih material lewat nama di form PO mobile tanpa
  konteks proyek/kuota berisiko salah pilih. Keputusan sengaja: form PO
  MOBILE mengarahkan alur "dari MR" (via tombol "Buat PO dari MR ini" di
  Step 4 detail MR), dan form buat-PO-langsung ini TETAP disediakan
  untuk kasus supplier non-material (jasa, dst.) dengan input manual.
  Dicatat sebagai keterbatasan mobile, BUKAN kelalaian — desktop
  `/procurement/pesanan` tetap tersedia untuk PO material kompleks.

- [ ] **Step 3: `procurement/mr/[id]/page.tsx`** — detail MR: header
  (nomor/status/proyek/tanggal), daftar item, panel quota-check
  (`GET .../quota-check`), tombol Submit (`PATCH .../submit`) dengan
  checkbox "Lampaui kuota RAB" YANG TAMPIL saat `lolos: false` DAN
  `bisa_override: true` (admin/direktur SELALU `true` — beda dari PM).
  Tombol Approve/Reject **TIDAK ADA di halaman ini** — approval lewat
  Inbox (Task 4), link "Lihat di Inbox Approval" ditampilkan sebagai
  gantinya saat `status === 'submitted'`.

  ```tsx
  "use client";

  import { useState } from "react";
  import Link from "next/link";
  import { FileText, AlertTriangle } from "lucide-react";
  import { useData, invalidasi } from "@/lib/data-cache";
  import { api } from "@/lib/api";
  import { formatRupiah, formatTanggal } from "@/lib/format";
  import EmptyState from "@/components/portal/EmptyState";
  import SkeletonCard from "@/components/portal/SkeletonCard";
  import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
  import type { RespMrDetail, RespQuotaCheck, GalatApi } from "../../../_bersama/tipe";
  import { pesanGalat } from "../../../_bersama/tipe";

  const LABEL_MR: Record<string, string> = {
    draft: "Draf", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak",
    partially_ordered: "Sebagian Dipesan", fully_ordered: "Selesai Dipesan",
  };
  const VARIAN_MR: Record<string, VarianStatus> = {
    draft: "netral", submitted: "pending", approved: "approved", rejected: "rejected",
    partially_ordered: "info", fully_ordered: "approved",
  };

  export default function AdminMrDetailPage({ params }: { params: { id: string } }) {
    const { data, memuat, galat } = useData<RespMrDetail>(`/api/v1/procurement/material-requests/${params.id}`);
    const mr = data?.material_request ?? null;

    const { data: quota } = useData<RespQuotaCheck>(mr ? `/api/v1/procurement/material-requests/${params.id}/quota-check` : null);

    const [override, setOverride] = useState(false);
    const [mengirim, setMengirim] = useState(false);
    const [galatSubmit, setGalatSubmit] = useState<string | null>(null);

    async function submit() {
      setMengirim(true); setGalatSubmit(null);
      try {
        await api.patch(`/api/v1/procurement/material-requests/${params.id}/submit`, override ? { override_quota: true } : {});
        invalidasi(`/api/v1/procurement/material-requests/${params.id}`);
        invalidasi(`/api/v1/procurement/material-requests`);
      } catch (e) {
        setGalatSubmit(pesanGalat(e as GalatApi, "Gagal mengajukan MR"));
      } finally { setMengirim(false); }
    }

    if (memuat) return <SkeletonCard tinggi={220} />;
    if (galat || !mr) return <EmptyState icon={FileText} judul="Gagal memuat MR" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{mr.mr_number ?? "MR"}</h1>
          <StatusBadge status={VARIAN_MR[mr.status] ?? "netral"} label={LABEL_MR[mr.status] ?? mr.status} />
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {mr.project?.name ?? "—"} · Diminta: {mr.requested_by?.name ?? "—"} · {mr.request_date ? formatTanggal(mr.request_date) : "—"}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item</div>
        {mr.items.map((it) => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{it.material?.name ?? "—"}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Diminta {it.qty_requested} {it.unit} · Dipesan {it.qty_ordered ?? 0} {it.unit}</div>
            </div>
          </div>
        ))}

        {quota && !quota.lolos && (
          <div style={{ padding: 14, borderRadius: 14, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={18} color="var(--on-warning-bg)" aria-hidden="true" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-warning-bg)" }}>Melampaui kuota RAB</span>
            </div>
            {quota.pelanggaran.map((p, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--on-warning-bg)" }}>{p.material_name ?? p.material_id}: diminta {p.diminta}, sisa kuota {p.sisa}</div>
            ))}
            {/* `bisa_override` SELALU true utk admin/direktur (procurement:mr:override_quota) —
                BEDA dari Portal PM yang tak pernah menampilkan checkbox ini. */}
            {quota.bisa_override && mr.status === "draft" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--on-warning-bg)" }}>
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                Lampaui kuota RAB dan tetap ajukan
              </label>
            )}
          </div>
        )}

        {mr.status === "draft" && (
          <>
            {galatSubmit && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatSubmit}</div>}
            <button type="button" onClick={submit} disabled={mengirim || (quota ? !quota.lolos && !override : false)}
              style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer", opacity: mengirim ? 0.6 : 1 }}>
              {mengirim ? "Mengajukan…" : "Ajukan MR"}
            </button>
          </>
        )}

        {mr.status === "submitted" && (
          <Link href="/admin-portal/inbox" style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", textDecoration: "none" }}>
            Lihat & putuskan di Inbox Approval →
          </Link>
        )}
      </div>
    );
  }
  ```

  ⚠ **`disabled` tombol Submit MENGUNCI, bukan menyembunyikan** — MR
  yang melanggar kuota tanpa override dicentang tetap TERLIHAT
  tombolnya (nonaktif), supaya pengguna tahu alasannya lewat panel
  peringatan di atasnya, bukan bertanya-tanya kenapa tombolnya hilang.

- [ ] **Step 4: `procurement/po/[id]/page.tsx`** — detail PO: header,
  item, tombol "Kirim WA ke Vendor" (`GET delivery-message` → tampilkan
  pesan tersusun → `wa_url` sebagai link, DISEMBUNYIKAN bila null),
  riwayat kirim (`GET delivery-log`), tombol "Buat Penerimaan" (buka
  BottomSheet form GR sederhana: qty diterima per item →
  `POST /goods-receipts`).

  ```tsx
  "use client";

  import { useState } from "react";
  import { Truck, MessageCircle, Send } from "lucide-react";
  import { useData, invalidasi } from "@/lib/data-cache";
  import { api } from "@/lib/api";
  import { formatRupiah, formatTanggal } from "@/lib/format";
  import EmptyState from "@/components/portal/EmptyState";
  import SkeletonCard from "@/components/portal/SkeletonCard";
  import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
  import BottomSheet from "@/components/portal/BottomSheet";
  import type { RespPoDetail, RespPesanPo, RespDeliveryLog, GalatApi } from "../../../_bersama/tipe";
  import { pesanGalat } from "../../../_bersama/tipe";

  const LABEL_PO: Record<string, string> = { draft: "Draf", sent: "Terkirim", confirmed: "Dikonfirmasi", cancelled: "Dibatalkan" };
  const VARIAN_PO: Record<string, VarianStatus> = { draft: "netral", sent: "pending", confirmed: "approved", cancelled: "rejected" };

  export default function AdminPoDetailPage({ params }: { params: { id: string } }) {
    const { data, memuat, galat } = useData<RespPoDetail>(`/api/v1/procurement/purchase-orders/${params.id}`);
    const po = data?.purchase_order ?? null;
    const { data: pesan } = useData<RespPesanPo>(po ? `/api/v1/procurement/purchase-orders/${params.id}/delivery-message` : null);
    const { data: log } = useData<RespDeliveryLog>(po ? `/api/v1/procurement/purchase-orders/${params.id}/delivery-log` : null);
    const [sheetGr, setSheetGr] = useState(false);

    async function catatKirimWa() {
      if (!pesan?.wa_url) return;
      window.open(pesan.wa_url, "_blank", "noopener,noreferrer");
      try {
        await api.post(`/api/v1/procurement/purchase-orders/${params.id}/delivery-log`, { channel: "whatsapp" });
        invalidasi(`/api/v1/procurement/purchase-orders/${params.id}/delivery-log`);
      } catch { /* pengiriman WA-nya sendiri sudah terjadi via window.open; jejak gagal tak membatalkan itu */ }
    }

    if (memuat) return <SkeletonCard tinggi={220} />;
    if (galat || !po) return <EmptyState icon={Truck} judul="Gagal memuat PO" deskripsi={pesanGalat(galat as GalatApi, "Coba muat ulang.")} />;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{po.po_number ?? "PO"}</h1>
          <StatusBadge status={VARIAN_PO[po.status] ?? "netral"} label={LABEL_PO[po.status] ?? po.status} />
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {po.project?.name ?? "—"} · {po.supplier?.name ?? "—"} · {formatRupiah(po.total_amount)}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Item</div>
        {po.items.map((it) => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{it.material?.name ?? "—"}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Dipesan {it.qty_ordered} {it.unit} · Diterima {it.qty_received ?? 0} {it.unit}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{formatRupiah(it.total_price)}</div>
          </div>
        ))}

        {pesan?.wa_url && (
          <button type="button" onClick={catatKirimWa}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <MessageCircle size={18} aria-hidden="true" /> Kirim WA ke Vendor
          </button>
        )}
        {pesan && !pesan.wa_url && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Nomor telepon supplier tak tersedia/tak sah — kirim manual.</div>
        )}

        {(log?.data.length ?? 0) > 0 && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Terakhir dikirim: {log!.data[0].channel} · {formatTanggal(log!.data[0].sent_at)} oleh {log!.data[0].sender?.name ?? "—"}
          </div>
        )}

        <button type="button" onClick={() => setSheetGr(true)}
          style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Send size={18} aria-hidden="true" /> Buat Penerimaan (GR)
        </button>

        <SheetBuatGr terbuka={sheetGr} onTutup={() => setSheetGr(false)} po={po} />
      </div>
    );
  }

  function SheetBuatGr({ terbuka, onTutup, po }: { terbuka: boolean; onTutup: () => void; po: NonNullable<RespPoDetail["purchase_order"]> }) {
    const [qty, setQty] = useState<Record<string, string>>({});
    const [mengirim, setMengirim] = useState(false);
    const [galat, setGalat] = useState<string | null>(null);

    async function simpan() {
      const items = po.items
        .map((it) => ({ po_item_id: it.id, material_id: it.material?.id, qty_received: Number(qty[it.id] || 0), unit: it.unit }))
        .filter((it) => it.qty_received > 0);
      if (items.length === 0) { setGalat("Isi qty diterima minimal satu item."); return; }
      setMengirim(true); setGalat(null);
      try {
        await api.post("/api/v1/procurement/goods-receipts", { po_id: po.id, project_id: po.project?.id, items });
        invalidasi("/api/v1/procurement/goods-receipts");
        invalidasi(`/api/v1/procurement/purchase-orders/${po.id}`);
        onTutup();
      } catch (e) {
        setGalat(pesanGalat(e as GalatApi, "Gagal membuat penerimaan"));
      } finally { setMengirim(false); }
    }

    return (
      <BottomSheet terbuka={terbuka} onTutup={onTutup} judul="Penerimaan Barang">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {po.items.map((it) => (
            <label key={it.id} style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {it.material?.name ?? "—"} (sisa {Number(it.qty_ordered) - Number(it.qty_received ?? 0)} {it.unit})
              <input type="number" min="0" step="0.01" value={qty[it.id] ?? ""} onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))}
                style={{ width: "100%", marginTop: 6, minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }} />
            </label>
          ))}
          {galat && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galat}</div>}
          <button type="button" onClick={simpan} disabled={mengirim}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirim ? "default" : "pointer", opacity: mengirim ? 0.6 : 1 }}>
            {mengirim ? "Menyimpan…" : "Simpan Penerimaan"}
          </button>
        </div>
      </BottomSheet>
    );
  }
  ```

- [ ] **Step 5: Jalankan verifikasi**

  ```bash
  cd apps/web && pnpm exec tsc --noEmit
  cd apps/web && node scripts/uji-token-css-ada.mjs
  cd apps/web && node scripts/uji-judul-halaman-ada.mjs
  cd apps/web && node scripts/uji-tombol-primer-seragam.mjs
  cd apps/web && node scripts/kerapatan-ratchet.mjs
  cd apps/web && node scripts/audit-halaman-pakai-cache.mjs
  cd apps/web && pnpm build
  ```

  Tempel ringkasan run sungguhan.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/app/admin-portal/procurement apps/web/app/admin-portal/_bersama/tipe.ts
  git commit -m "feat(admin-portal): procurement MR/PO/GR company-wide — Tahap 4"
  ```

---

### Task 22: Gudang & Aset — ikhtisar company-wide + transfer stok

**Hasil riset 2026-08-27 — DIUKUR KE KODE, bukan ditebak dari nama menu.**

Pelajaran Task 21 masih berlaku: rencananya sendiri salah di tiga tempat
kontrak API, dan ketiganya gagal SENYAP. Karena itu seluruh bentuk di bawah
diverifikasi langsung ke `apps/api/src/routes/v1/`.

**Endpoint yang BENAR-BENAR ada (22 total di 6 berkas):**

| berkas | rute | izin |
|---|---|---|
| `gudang-ikhtisar.ts` | `GET /api/v1/gudang/ikhtisar` | `gudang:view` |
| `gudang-kelola.ts` | `GET/POST/PATCH /api/v1/gudang` | `gudang:view` / `gudang:manage` |
| `transfer-stok.ts` | `GET/POST /api/v1/transfer-stok` | `procurement:view` / `procurement:material:manage` |
| `rekonsiliasi-material.ts` | `GET /api/v1/projects/:projectId/rekonsiliasi-material` | `procurement:view` |
| `assets.ts` | 10 rute `/api/v1/assets*` | (ukur per-rute) |
| `alat-operasional.ts` | 5 rute | (ukur per-rute) |

**Kenapa SATU halaman, bukan dua (Gudang terpisah dari Aset):**

`GET /gudang/ikhtisar` sudah MENGGABUNGKAN keduanya dalam satu balasan —
`kpi` memuat `total_aset`, `nilai_buku`, `akumulasi_susut` (aset) BERSAMA
`jenis_material_gudang`, `proyek_belum_ditarik` (stok). Memecahnya jadi dua
halaman berarti memanggil endpoint yang sama dua kali lalu membuang separuh
hasilnya di masing-masing.

Itu juga cerminan kenyataannya: gudang menyimpan ALAT dan MATERIAL sekaligus,
dan orang yang membukanya bertanya "apa yang ada di gudang saya", bukan
"tunjukkan aset saja".

**Bentuk balasan `GET /gudang/ikhtisar` — diverifikasi baris-per-baris
(`gudang-ikhtisar.ts:190-260`):**

```typescript
export interface RespGudangIkhtisar {
  kpi: {
    total_aset: number; di_gudang: number; di_lapangan: number;
    perlu_perhatian: number; jenis_material_gudang: number;
    proyek_belum_ditarik: number;
    // ⚠ Ketiganya STRING, bukan number — server melewatkannya lewat
    // `rp = (n) => n.toFixed(2)` (gudang-ikhtisar.ts:45). Isinya angka
    // MENTAH berdesimal ("18750000.00"), BUKAN rupiah terformat.
    nilai_perolehan: string; nilai_buku: string; akumulasi_susut: string;
  };
  gudang: Array<{ id: string; kode: string; nama: string; alamat: string | null;
    jumlah_aset: number; jenis_material: number }>;
  aset_per_kategori: Record<string, number>;
  aset_per_kondisi: Record<string, number>;
  isi_gudang: Array<{ id: string; kode: string; nama: string; kategori: string;
    kondisi: string; status: string; gudang: string | null }>;
  pergerakan: Array<{ id: string; jenis: string; tanggal: string | null;
    hari_lalu: number | null; dari: string | null; ke: string | null;
    kondisi_sebelum: string | null; kondisi_sesudah: string | null;
    // Dihitung SERVER — jangan dibandingkan ulang di UI. Komentar di
    // `gudang-ikhtisar.ts` menjelaskan alasannya: urutan tingkat kondisi yang
    // ditulis ulang di tiap tempat akan salah di salah satunya, dan alat
    // sehat tertandai rusak.
    memburuk: boolean }>;
  material_gudang: Array<{ id: string; material_id: string; qty: string;
    asal: string | null }>;
  /** Proyek yang materialnya belum ditarik kembali ke gudang. */
  belum_ditarik: unknown[];
}
```

⚠ **Ketiganya `string`, dan itu MUDAH salah dibaca dua arah.**

Dugaan pertama saya: "sudah terformat, jangan diformat lagi". SALAH — diukur
ke `gudang-ikhtisar.ts:45`, `rp` hanyalah `(n) => n.toFixed(2)`. Isinya
`"18750000.00"`: angka mentah berdesimal, bukan rupiah.

Jadi UI **WAJIB** memformatnya (`formatRupiah` menerima `number | string` dan
menangani ini). Yang berbahaya adalah menampilkannya apa adanya — layar
keuangan yang berbunyi "18750000.00" terbaca seperti data rusak.

Pelajaran yang sama dengan Task 21: tipe `string` TIDAK memberi tahu apakah
isinya sudah diformat. Hanya membaca fungsinya yang memberi tahu.

**Files:**
- Create: `apps/web/app/admin-portal/gudang/page.tsx`
- Modify: `apps/web/app/admin-portal/_bersama/tipe.ts` (tambah
  `RespGudangIkhtisar` + `RespTransferStok`)
- Modify: `apps/web/app/admin-portal/kategori/[key]/page.tsx` (petakan key)
- Modify: `apps/web/lib/admin-portal-kategori.ts` (aktifkan `g-inventory`,
  `g-aset`)

**Key yang DIPETAKAN — hanya yang halamannya benar-benar ada:**

`iv-gudang`, `iv-mutasi`, `iv-opname` → `/admin-portal/gudang`
`as-register`, `as-utilisasi` → `/admin-portal/gudang`

Sisanya (`iv-transfer`, `iv-minstok`, `iv-rekonsiliasi`, `iv-waste`,
`gd-susut`, `as-mutasi`, `as-penyusutan`, `as-sewa`, `as-maintenance`,
`as-opex`, `as-gl`) SENGAJA jatuh ke fallback href web — pola sama Tahap 1-3.
Memetakannya ke halaman ini akan menjanjikan layar yang tak ada.

- [ ] **Step 1: tipe** — `RespGudangIkhtisar` sesuai bentuk di atas.
- [ ] **Step 2: halaman** — KPI ringkas, daftar gudang, isi gudang (10 teratas,
  kondisi buruk di atas — urutan sudah dari server), pergerakan terakhir
  dengan penanda `memburuk`, material teratas.
- [ ] **Step 3: navigasi** — aktifkan dua grup, petakan 5 key.
- [ ] **Step 4: verifikasi** — tsc, token CSS diadu ke globals.css, RENDER
  390x844 dan LIHAT, axe-core 0 pelanggaran, seluruh penjaga CI diadu ke
  baseline.

---

### Task 23: Alat Operasional — kesehatan alat + perawatan jatuh tempo

**Hasil riset 2026-08-27 — DIUKUR ke `alat-operasional.ts` + `lib/alat-operasional.ts`.**

Task 21 membuktikan rencana yang rinci pun bisa salah kontrak (tiga tempat,
semuanya gagal senyap). Task 22 membuktikan tipe `string` tak memberi tahu
apakah isinya sudah diformat. Karena itu seluruh bentuk di bawah dibaca dari
kode, bukan dari nama field.

**Endpoint (5 rute, `alat-operasional.ts`):**

| rute | metode | izin |
|---|---|---|
| `/api/v1/alat-operasional` | GET | `assets:view` |
| `/api/v1/alat-operasional/pemakaian` | POST | `assets:manage` |
| `/api/v1/alat-operasional/biaya` | POST | `assets:manage` |
| `/api/v1/alat-operasional/perawatan` | POST | `assets:manage` |
| `/api/v1/alat-operasional/penyusutan/jurnalkan` | POST | `gl:manage` |

**Kenapa halaman ini HANYA-BACA (tiga POST tidak dipakai):**

Ketiganya adalah pencatatan LAPANGAN — jam pakai alat, isi BBM, servis
selesai. Yang mencatatnya operator/mekanik di lokasi, bukan direktur di
kantor. Portal admin menjawab pertanyaan yang berbeda: *"alat mana yang
paling mahal, mana yang mau jatuh tempo, mana yang preventifnya gagal."*

`penyusutan/jurnalkan` sengaja TIDAK dipasang: ia menuntut `gl:manage` dan
MENULIS ke buku besar. Aksi akuntansi berkonsekuensi seperti itu sudah punya
rumahnya sendiri di `/admin-portal/keuangan/gl` (Tahap 3) — menaruh tombol
kedua di sini berarti dua pintu menuju jurnal yang sama.

**Bentuk `GET /api/v1/alat-operasional` — diverifikasi baris-per-baris
(`alat-operasional.ts:160-187`, tipe dari `lib/alat-operasional.ts`):**

```typescript
export interface AlatOperasional {
  id: string; asset_code: string; name: string;
  category: string; brand: string | null; model: string | null;
  status: string; condition: string;
  purchase_price: number | string | null;
  meter: number | null;
  jamOperasi: number;      // sudah dibulatkan 2 desimal di server
  hariDipakai: number;
  perawatan: Array<{
    id: string; nama: string;
    jatuhTempo: {
      // 'aman' | 'segera' (>=80% ambang) | 'jatuh_tempo' | dst — lib:42
      status: string;
      sisaJam: number | null;   // null bila jadwalnya tak pakai jam
      sisaHari: number | null;  // null bila jadwalnya tak pakai hari
    };
  }>;
  /** Perawatan paling mendesak, SUDAH dipilih & diurut server. null bila aman. */
  palingMendesak: { id: string; nama: string; jatuhTempo: {...} } | null;
  biaya: {
    /** Operasional + PERAWATAN. Server menjumlah keduanya — lihat ⚠ di bawah. */
    total: number;
    perJenis: Record<string, number>;
    perJam: number | null;
    bbmPerJam: number | null;
  };
  kesehatan: {
    servisTerjadwal: number;
    servisMendadak: number;
    rasioMendadak: number | null;
    /** >= 50% mendadak: preventifnya tak mencegah apa pun. */
    preventifGagal: boolean;
  };
  riwayat: unknown[];
  penyusutan: Array<{ jurnal_status: string | null; jurnal_nomor: string | null }>;
}
export interface RespAlatOperasional {
  alat: AlatOperasional[]; total: number; tanggal: string;
}
```

⚠ **EMPAT hal DIHITUNG SERVER — jangan dihitung ulang di UI:**

1. `palingMendesak` — sudah disaring (`jatuh_tempo`/`segera`) lalu diurut
   `sisaJam` menaik. Komentar servernya: *"layar tak boleh menuntut
   pembacanya membandingkan sendiri belasan baris."*
2. `biaya.total` — operasional **+ perawatan**. Komentarnya menjelaskan
   akibat kalau dipisah: *"dump truck dengan empat kerusakan mendadak senilai
   Rp 19,85 juta tampil Rp 0 karena tak sekali pun mengisi BBM lewat modul
   ini."* Menghitung ulang di klien dari `perJenis` akan mengulang cacat itu.
3. `kesehatan.preventifGagal` — ambang 50%, satu tempat.
4. `jatuhTempo.status` — ambang 80%, satu tempat.

⚠ **`purchase_price` bertipe `number | string | null`** (dari kolom numeric).
`formatRupiah` menerima keduanya. TIDAK sama dengan kasus Task 22: di sini
tak ada `toFixed()` di server, jadi nilainya bisa `number` asli.

**Files:**
- Create: `apps/web/app/admin-portal/aset/page.tsx`
- Modify: `_bersama/tipe.ts` (tambah `RespAlatOperasional` + `AlatOperasional`)
- Modify: `kategori/[key]/page.tsx` (petakan `as-maintenance`, `as-opex`)

**Key yang DIPETAKAN:** `as-maintenance`, `as-opex` → `/admin-portal/aset`.
`as-penyusutan`/`as-sewa`/`as-gl`/`as-mutasi` tetap fallback href web —
halamannya belum ada di admin-portal.

- [ ] **Step 1: tipe** sesuai bentuk di atas.
- [ ] **Step 2: halaman** — urut alat paling mendesak di atas; kartu per alat
  memuat kesehatan (rasio mendadak + penanda preventif gagal), biaya total &
  per-jam, dan perawatan paling mendesak.
- [ ] **Step 3: navigasi** — petakan dua key.
- [ ] **Step 4: verifikasi** — tsc, token CSS diadu globals.css, RENDER
  390x844 dan LIHAT, axe-core 0, seluruh penjaga diadu baseline.

---

## ✅ Tahap 4 SELESAI — 2026-08-27

Task 21 (Procurement: daftar 3-tab + detail MR + detail PO), Task 22 (Gudang
& Aset ikhtisar), Task 23 (Alat Operasional). Halaman admin-portal: 24 → 29.

**Verifikasi penutup tahap (Task 24-25), dijalankan 2026-08-27:**

| Yang diperiksa | Hasil |
|---|---|
| `tsc apps/web` | exit 0 |
| Penjaga CI penuh, diadu ke baseline main | 38 → 37, **NOL merah baru** |
| Pemetaan key → halaman nyata | 44 pemetaan, **0 masalah** |
| Grup aktif ada di `peta-menu.ts` | 9 grup, **0 hantu** |
| axe-core WCAG 2.1 AA per halaman baru | **0 pelanggaran** (5 halaman) |
| Token CSS diadu ke `globals.css` | 52 token, **0 hilang** |
| Tiap halaman dirender 390×844 dan DILIHAT | ya — 3 cacat tata letak ditemukan & diperbaiki |

**Tiga kekeliruan RENCANA yang tertangkap karena diadu ke kode:**

1. Task 21: `override_quota: true` → sebenarnya `override_reason` (teks,
   min 10 karakter). Boolean SELALU ditolak 422.
2. Task 21: `pelanggaran[].sisa` tak ada; `tanpa_kuota` `string[]`, bukan objek.
3. Task 22 (dugaan saya sendiri saat menulis breakdown): `nilai_buku` dkk
   dikira "sudah terformat" — ternyata `toFixed(2)`, angka MENTAH.

Semuanya gagal SENYAP kalau diikuti. Pelajarannya: **rencana yang rinci dan
percaya diri tetap harus diadu ke kode** — justru kerinciannya yang membuatnya
mudah diikuti tanpa diperiksa.

**Cacat yang HANYA tertangkap POTRET, bukan typecheck/penjaga:**

- Gerbang izin admin-portal menendang SEMUA orang (hidrasi) — portal mati total.
- Tombol "Lainnya" tergambar dua kali di bar bawah.
- "sisa -18 jam" untuk perawatan yang sudah lewat jadwal.

---

## Tahap 5: Mutu + K3 + Risiko + Dokumen

**Riset breakdown 2026-08-27 — DIUKUR ke kode, bukan ditebak dari nama menu.**

Tiga kekeliruan rencana di Tahap 4 (semuanya gagal senyap) membuat aturan ini
mengikat: setiap bentuk balasan dan setiap izin di bawah dibaca langsung dari
`apps/api/src/routes/v1/`.

### Yang DITEMUKAN berbeda dari dugaan

| Dugaan dari nama | Kenyataan di kode |
|---|---|
| grup `g-mutu` | **`g-qaqc`** — `g-mutu` TIDAK ADA di `peta-menu.ts` |
| `risiko.ts`, `mitigasi.ts` | rutenya di **`jadwal.ts`** |
| `temuan-audit.ts` | rutenya di **`audit-mutu.ts`** |
| `itp-titik.ts` | rutenya di **`rencana-mutu.ts`** |
| K3 tanpa izin | K3 **PAKAI** `k3:inspeksi:view`, `k3:insiden:view/manage` |

Memakai `g-mutu` akan menghasilkan grup yang tak pernah muncul — gagal senyap,
persis kelas yang sama dengan `override_quota`.

### Endpoint yang tersedia (55 rute di 8 berkas)

| berkas | rute | catatan |
|---|---|---|
| `mutu-ikhtisar.ts` | 1 | `GET /api/v1/mutu/ikhtisar` — **titik masuk** |
| `rencana-mutu.ts` | 7 | termasuk ITP |
| `ncr.ts` | 6 | register NCR |
| `inspeksi.ts` | 4 | |
| `k3-lapangan.ts` | 16 | per-proyek (`/proyek/:id/k3/*`) |
| `kepatuhan-k3.ts` | 7 | |
| `kendali-dokumen.ts` | 9 | |
| `documents.ts` | 5 | |

### Kenapa SATU halaman ikhtisar, bukan empat halaman terpisah

`GET /mutu/ikhtisar` sudah menjawab keempat grup sekaligus — bentuknya
memuat `ncr`, `inspeksi`, `punch`, `dokumen`, `izin_kerja`, dan `k3` dalam
satu balasan. Pola identik dengan Task 22 (Gudang & Aset), dan alasannya sama:
memecahnya berarti memanggil endpoint yang sama empat kali lalu membuang
tiga-perempat hasilnya di masing-masing.

⚠ **`GET /mutu/ikhtisar` TANPA `requirePermission`, hanya `authenticate`.**
Itu DISENGAJA dan tertulis alasannya di `mutu-ikhtisar.ts:207-217`: sub-menu
grup ini pun tak menyaring permission (`menu_items.required_permissions`
semuanya array KOSONG). Menuntut izin di ikhtisar berarti halaman induknya
lebih ketat daripada isinya — orang melihat "akses ditolak" untuk ringkasan
dari data yang boleh ia buka satu per satu.

Jadi halaman ini TIDAK memasang `useIzin` sebagai gerbang masuk. Tenancy tetap
dijaga `request.db` di server.

### Bentuk `GET /api/v1/mutu/ikhtisar` — diverifikasi `mutu-ikhtisar.ts:143-191`

```typescript
export interface RespMutuIkhtisar {
  ncr: {
    total: number; terbuka: number;
    /** NCR berat yang masih terbuka — DIPISAH dari total di server. */
    berat: number;
    daftar: Array<{ nomor: string; judul: string; severity: string;
      status: string; sisa_hari: number | null }>;
  };
  inspeksi: { total: number; menunggu: number };
  punch: { total: number; terbuka: number };
  dokumen: {
    total: number; belum_terverifikasi: number;
    kedaluwarsa: number; segera_habis: number;
    daftar: Array<{ pihak: string; jenis: string; sisa_hari: number | null }>;
  };
  izin_kerja: { total: number; aktif: number; menunggu: number };
  k3: {
    kecelakaan: number; daftar_hitam: number;
    skor_k3_terendah: number | null;
  };
}
```

⚠ **`ncr.berat` sudah DIPISAH di server** dari `terbuka`. Komentar servernya:
*"satu NCR major menuntut tindakan berbeda dari sepuluh yang minor, dan jumlah
total menyamarkan bedanya."* Menghitung ulang di klien dari `daftar` akan
SALAH — `daftar` hanya 8 teratas, sedangkan `berat` menghitung SEMUA.

⚠ **`dokumen.kedaluwarsa` vs `segera_habis`** dipisah lewat tanda `sisa_hari`
(`< 0` = sudah lewat). `sisa_hari` NEGATIF di `daftar` berarti kedaluwarsa —
tampilkan "lewat N hari", bukan "sisa -N hari" (cacat yang sama sudah
ditemukan & diperbaiki di Task 23).

⚠ **`k3.kecelakaan` dijumlahkan dari evaluasi subkon** — satu-satunya tempat
angkanya tercatat hari ini. Komentar servernya mencatat: kalau kelak ada tabel
insiden sendiri, sumbernya berpindah dan angkanya TIDAK boleh dijumlahkan dua
kali.

### Files

- Create: `apps/web/app/admin-portal/mutu/page.tsx`
- Modify: `_bersama/tipe.ts` (tambah `RespMutuIkhtisar`)
- Modify: `kategori/[key]/page.tsx` (petakan key)
- Modify: `lib/admin-portal-kategori.ts` (aktifkan 4 grup)

### Key yang DIPETAKAN

`qc-ncr`, `qc-checklist` → `/admin-portal/mutu`
`hse-insiden`, `hse-inspeksi` → `/admin-portal/mutu`
`dk-register` → `/admin-portal/mutu`

Sisanya (qc-rencana, qc-itp, qc-uji, qc-capa, mutu-pelajaran, qc-audit,
hse-rk3k, hse-jsa, hse-induksi, hse-apd, hse-lingkungan, rk-*, dk-transmittal,
dk-gambar, dk-notulen, dk-approval, dk-distribusi, dk-esign,
dk-verifikasi-ttd) SENGAJA jatuh ke fallback href web — halamannya belum ada
di admin-portal, dan memetakannya menjanjikan layar yang tak ada.

⚠ `g-risiko` diaktifkan TAPI nol key dipetakan: seluruh itemnya (register
risiko, mitigasi, perizinan, kepatuhan, sengketa) belum punya halaman
admin-portal. Grupnya tetap muncul di kategori dengan seluruh item menunjuk
href web — itu perilaku yang sama dengan item Tahap 1-4 yang belum dibangun,
dan lebih baik daripada menyembunyikan grupnya sama sekali.

### Langkah

- [ ] **Step 1: tipe** `RespMutuIkhtisar` sesuai bentuk di atas.
- [ ] **Step 2: halaman** — NCR terbuka (berat disorot), dokumen kedaluwarsa,
  izin kerja, ringkasan K3, inspeksi & punch list.
- [ ] **Step 3: navigasi** — aktifkan 4 grup, petakan 5 key.
- [ ] **Step 4: verifikasi** — tsc, token CSS diadu globals.css, RENDER
  390×844 dan LIHAT, axe-core 0, seluruh penjaga diadu baseline, dan cek
  pemetaan key (skrip sekali-pakai pola Tahap 4).

---

## Tahap 6-7: Belum di-breakdown

Mengikuti pola Portal PM: setiap Tahap (6: SDM+Klien+Tender, 7: Sistem/Settings/AI [read-only]+Audit+
Users/Roles+Master+sisa) dimulai dengan SATU task "riset & breakdown" yang
menulis task-task konkret ke dokumen ini begitu tahap sebelumnya selesai —
BUKAN ditulis sekaligus di awal.

**Final**: task terakhir plan ini adalah verifikasi menyeluruh SELURUH
portal admin/direktur (typecheck, build, SEMUA penjaga CI, test backend
terkait, a11y penuh untuk admin, catatan eksplisit cakupan direktur yang
tak bisa diverifikasi karena 0 user aktif, update
`docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md`) — pola identik Portal PM Task 45.
