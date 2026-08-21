# Portal Admin/Direktur Lengkap — Design Spec

> Status: DRAFT — menunggu review founder sebelum ditransisikan ke implementation plan.
> Ditulis 2026-08-22, sesudah Portal PM Lengkap (32 modul, 45 task) selesai dan
> di-merge ke `main` (`feat/pm-lengkap-tahap2`, commit `18f6ad2a`).

## 0. Kenapa dokumen ini ada

`2026-08-20-portal-pm-lengkap-design.md` §7 mencatat "Portal admin/superadmin —
siklus terpisah" sebagai di luar scope, dengan catatan tambahan: sistem ini
**tidak punya role `superadmin` terpisah** — yang ada adalah role `admin`
(224 permission, `(dashboard)/*`, 32 folder menu, 154 halaman) dan role
`direktur` (terpisah dari admin, overlap besar, beberapa permission eksklusif
seperti `gl:periode:reopen`).

Founder sekarang meminta portal mobile untuk **admin, superadmin, dan
direktur sekaligus**. Riset sebelum brainstorming ini menemukan:

- **"Superadmin" bukan role yang ada di database** — yang dimaksud founder
  adalah konsep **pemilik/owner lintas-company** (satu pemilik banyak PT),
  yang SEBAGIAN sudah dibangun sejak migrasi 137 (`owner_user_id` +
  `is_group_owner()` + `company_group_root()` + company-switcher hidup di
  `apps/web/components/company-switcher.tsx`) — TAPI sengaja dibatasi hanya
  untuk mendirikan/kelola PT baru, bukan untuk **melihat data agregat semua
  PT sekaligus dalam satu layar**. Fitur rollup lintas-company itu **belum
  ada**, dan migrasi 137 eksplisit mencatat alasan kenapa itu ditolak saat
  itu (mengubah model akses data/RLS yang tidak diminta).
- **`direktur` adalah role terpisah dari `admin`**, bukan alias — TAPI
  diukur ulang lewat live query (2026-08-22, riset Task 1): permission
  `direktur` (143) adalah **SUBSET MURNI** dari `admin` (227), bukan overlap
  dua-arah seperti dugaan awal. `gl:periode:reopen` ternyata dipegang
  **admin DAN direktur** (bukan direktur-eksklusif seperti tercatat semula).
  `approval:override_sod` ada di katalog permission tapi **NOL role
  memilikinya saat ini** (termasuk admin) — bukan admin-eksklusif, sekadar
  belum digrant ke siapa pun. Yang terkonfirmasi BENAR admin-only:
  `settings:credentials:*` (direktur nol baris). **0 user aktif berperan
  direktur** saat ini (dikonfirmasi live, sama seperti catatan migrasi 295).

**Keputusan pembagian kerja (brainstorming 2026-08-22):**

1. **Sub-project A (dokumen ini)**: Portal mobile untuk `admin` + `direktur`,
   satu codebase, menu digerbangi `hasPermission()` (ADR-004) — BUKAN dua
   portal terpisah. Feature parity PENUH dengan dashboard web (154 halaman
   sumber), termasuk area sensitif (`settings`, `ai`) yang PM kecualikan,
   dengan pembatasan read-only khusus mobile untuk area itu (§1).
2. **Sub-project B (terpisah, BELUM dimulai)**: Rollup lintas-company untuk
   pemilik grup ("superadmin" dalam istilah founder) — ini perubahan
   arsitektur akses data (bukan sekadar UI), perlu meninjau ulang keputusan
   migrasi 137 secara sadar. Siklus brainstorm→spec→plan SENDIRI, sesudah
   Sub-project A ini selesai atau berjalan paralel di worktree terpisah.

Dokumen ini **hanya mencakup Sub-project A**. Rollup lintas-company (Sub-project
B) TIDAK dibahas lebih jauh di sini selain sebagai catatan batas (§7).

## 1. Cakupan — feature parity penuh, 154 halaman sumber

Berbeda dari keputusan PM (§1 spec PM: 32 dari 34 modul, `settings`/`ai`
dikecualikan), founder eksplisit meminta **parity penuh** untuk portal ini —
tidak ada modul yang dikecualikan berdasar "administratif vs operasional".

**Justru sebaliknya**: `settings` (~25 sub-halaman: API key, kredensial pihak
ketiga, WhatsApp, role/permission, Badan Usaha) dan `ai` (konfigurasi
asisten, biaya, plafon) MASUK inti scope untuk role admin/direktur — mereka
adalah pemilik area itu, bukan pengunjung.

**Tapi dengan satu pembatasan mengikat, khusus mobile** (keputusan
brainstorming, alasan keamanan — kredensial di layar HP lebih rawan
shoulder-surfing/perangkat hilang dibanding di workstation kantor):

> **Read-only di mobile untuk `settings:credentials:*` dan seluruh modul
> `ai`.** Admin/direktur BISA melihat status koneksi, konfigurasi aktif,
> saldo/plafon dari HP — TIDAK BISA create/edit/rotate/delete kredensial
> atau mengubah konfigurasi AI dari portal mobile, walau permission mereka
> di database mengizinkan write. Ini pembatasan UI/UX tambahan DI ATAS
> gerbang permission API yang sudah ada (bukan menggantikannya) — tombol
> aksi tulis untuk dua area ini disembunyikan total di mobile, bukan
> disabled. Perubahan kredensial/konfigurasi AI tetap harus lewat web
> dashboard.

Modul lain (154 - ~25 settings - ~beberapa ai = sisanya) mengikuti pola PM:
kedalaman fungsi ikut permission API apa adanya (kalau admin/direktur punya
`<modul>:manage`, portal mobile-nya BISA create/edit).

**Batas status**: sama seperti PM — hanya modul `status: 'hidup'` di
`lib/peta-menu.ts` direplikasi. Modul `rencana`/`gerbang`/`eksternal` dilewati.

**Admin vs Direktur — satu codebase, bukan dua portal**: setiap halaman
digerbangi `hasPermission()` per menu/aksi, TIDAK PERNAH literal role. Untuk
permission yang HANYA dipegang satu peran (mis. `gl:periode:reopen` hanya
`direktur`), tombol/menu terkait otomatis tersembunyi untuk admin yang tak
punya izin itu — dan sebaliknya untuk permission admin-only
(`settings:credentials:*` write, `approval:override_sod`) tersembunyi untuk
direktur. Verifikasi permission WAJIB lewat query live ke `role_permissions`
per tahap (pola yang sudah terbukti di Portal PM untuk 2-baris-role-`pm`;
kemungkinan besar admin/direktur juga akan punya lebih dari satu baris role
per company — cek ini di riset setiap tahap, jangan asumsikan 1 baris).

## 2. Arsitektur navigasi

Route baru `apps/web/app/admin-portal/*` — bukan perluasan `pm-portal`
(scope/pengguna berbeda total). Gunakan `PortalShell`
(`apps/web/components/portal/PortalShell.tsx`) yang sama, sudah terbukti
dipakai lintas portal PM/mandor/klien.

**Gerbang layout**: `admin-portal/layout.tsx` redirect role selain
admin/direktur ke `/dashboard` (pola sama `pm-portal/layout.tsx`). PM/mandor/
client yang salah masuk diarahkan ke portal masing-masing.

**Company-wide by default, project-picker opsional per modul** (keputusan
brainstorming — beda dari PM yang selalu mulai dari project-picker karena PM
di-scope ke proyeknya):

- Modul agregat company-wide (approval-inbox, dashboard eksekutif, keuangan
  ringkas, SDM, users/roles, master data, sistem/settings/ai) tampil LANGSUNG
  tanpa perlu pilih proyek dulu — sama seperti versi web dashboard admin
  sekarang yang tidak memfilter per-proyek untuk modul-modul ini.
- Modul yang memang per-proyek (mis. detail RAB satu proyek, jadwal CPM satu
  proyek) baru memunculkan picker proyek — pola inline sama seperti versi web
  (`(dashboard)/proyek/[id]` sudah begini), bukan dipaksa di awal seperti pola
  PM.
- Company-switcher (`components/company-switcher.tsx`, sudah hidup) dipakai
  APA ADANYA untuk admin/direktur yang jadi member di >1 company — tidak
  dibangun ulang, tidak diberi versi mobile khusus. Behavior full-reload saat
  ganti company DIPERTAHANKAN (alasan isolasi tenant di komentar komponen
  asli tetap berlaku).

**Kategori navigasi**: sama pola dua-level PM (Bottom-nav → Kategori →
Modul), pakai `lib/peta-menu.ts` grup APA ADANYA — TIDAK membuat taksonomi
baru untuk admin. Kategori yang admin/direktur tak punya satu pun permission
di dalamnya disembunyikan (bukan abu-abu), sama seperti pola PM.

**Bottom-nav 5 slot**: kandidat awal (diverifikasi ulang saat riset tahap 1,
bukan diputuskan mati di sini) — Beranda, Approval Inbox, Proyek, Keuangan,
Lainnya. Berbeda dari PM (yang juga 5 slot serupa) hanya dalam isi "Proyek"
(company-wide list, bukan proyek-PM-scoped) dan "Keuangan" (agregat company,
bukan per-proyek).

## 3. Interaksi & feel mobile

Identik dengan §3 spec PM (`ui-animation` + `ui-ux-pro-max`, token
`lib/motion.ts` yang SUDAH dibangun Portal PM — dipakai ulang, bukan dibuat
ulang). Tidak diulang detailnya di sini; rujuk spec PM §3 sebagai definisi
mengikat yang sama berlaku di portal ini.

**Tambahan khusus portal ini**: kartu di area sensitif (`settings`, `ai`)
TIDAK mendapat swipe-to-action sama sekali (§1 — read-only, tak ada aksi
tulis untuk di-swipe). Kartu approval-inbox company-wide tetap dapat pola
swipe approve/reject seperti PM (`gesture-alternative`: tombol tetap ada).

## 4. Fondasi PWA

**Sudah selesai** oleh Portal PM Tahap 0 — `app/manifest.ts`, ikon PWA
dinamis per-tenant, `sw.js` diperluas dengan app-shell caching, registrasi
service worker saat app dibuka. Ini **infrastruktur bersama**, bukan
per-portal — admin-portal otomatis mewarisi PWA installability tanpa
pekerjaan tambahan. Satu-satunya hal yang perlu diverifikasi ulang saat
eksekusi: apakah `start_url`/redirect logic PWA perlu tahu tentang
`admin-portal/*` sebagai entry point tambahan (cek `manifest.ts` dan pola
redirect berdasar role saat app dibuka dari homescreen).

## 5. Fondasi teknis tambahan

- `_bersama/tipe.ts` per kategori di `admin-portal/` — pola sama PM: bentuk
  field diverifikasi ke kode API asli SEBELUM ditulis, bukan ditebak dari
  nama. Cakupan modul portal ini 2x lebih besar dari PM — disiplin verifikasi
  ini makin kritis, bukan boleh dilonggarkan.
- `hasPermission()` + `useSyncExternalStore` (pola sudah ada,
  `lib/use-izin.ts`) — dipakai identik, tidak dibuat ulang.
- `usePengguna()` (`lib/use-pengguna.ts`, dibangun Portal PM Task 29) —
  dipakai ulang untuk cek identitas user (mis. SoD: direktur tak boleh
  approve pengajuannya sendiri, `apps/api/src/lib/sod.ts` sudah menjaga di
  backend, frontend cukup sembunyikan tombol untuk kasus itu bila
  terverifikasi via API, bukan duplikasi logic SoD di client).
- **Verifikasi 2-baris-role** (pola PM, kemungkinan berulang di sini):
  sebelum setiap tahap, ukur ke `role_permissions` apakah `admin`/`direktur`
  punya lebih dari satu baris `roles` (mis. global template company_id NULL
  + tenant-scoped) — JANGAN asumsikan struktur PM (2 baris) otomatis sama,
  ukur ulang untuk role ini secara spesifik.

## 6. Struktur eksekusi — tahap tentatif (diverifikasi ulang saat riset)

| Tahap | Cakupan | Alasan urutan |
|---|---|---|
| 0 | Fondasi route/layout/shell `admin-portal/*` | Wiring dasar — PWA sudah ada (§4), tahap ini murni gerbang role + shell + navigasi kategori kosong |
| 1 | Approval Inbox + Dashboard Eksekutif | Dua hal paling sering dicek dari HP — keputusan tertunda & KPI ringkas |
| 2 | Proyek (company-wide) + Kontrak + Jadwal | Kelanjutan alami dari Tahap 1 — proyek adalah unit kerja utama |
| 3 | Keuangan (Kas/GL/Piutang/IPC/Rekonsiliasi) + Akuntansi | Area besar, butuh riset permission mendalam (gl:periode:reopen direktur-only, dst) |
| 4 | Procurement + Gudang + Aset | Operasional, pola mirip Tahap 4 Portal PM (bisa banyak dipelajari langsung) |
| 5 | Mutu/K3 + Risiko + Dokumen + Kepatuhan | Mirip Tahap 5 Portal PM, cakupan admin lebih luas (lintas proyek, bukan per-PM) |
| 6 | SDM (lengkap: termasuk payroll, tarif statutori — beda dari PM yang read-only sebagian) + Klien + Tender | SDM di sini FULL karena admin punya `sdm:*` penuh, tak seperti PM |
| 7 | Sistem: Settings (read-only §1) + AI (read-only §1) + Audit + Users/Roles + Master Data + sisa (notifikasi, kalender, peta-modul) | Area sensitif paling akhir — pola sama Portal PM (Tahap 7 juga area yang butuh kehati-hatian ekstra) |
| Final | Verifikasi menyeluruh: typecheck, build, SEMUA penjaga CI, test backend terkait, a11y penuh, update dokumentasi taksonomi | Disiplin sama Portal PM Task 45 |

**Perkiraan skala**: 154 halaman sumber vs 78 halaman nyata Portal PM (dari
32 modul rencana) — kemungkinan realistis portal ini menghasilkan **~150-200
halaman mobile** kalau pola pembengkakan serupa terulang (PM membengkak
~2.4x dari rencana awal karena riset menemukan sub-modul yang tak disebut
ringkasan awal). Jumlah task per tahap TIDAK ditetapkan di spec ini — riset
per tahap (task pertama tiap tahap, pola SDD yang sama) akan menghasilkan
breakdown task presisi berdasar kode nyata, bukan tebakan di spec.

**Tiap tahap dieksekusi sebagai bagian dari SATU implementation plan besar**
(pola sama Portal PM — `docs/superpowers/plans/2026-08-20-portal-pm-lengkap.md`
sebagai preseden), dieksekusi lintas sesi via `subagent-driven-development`:
riset→breakdown task konkret→implementer→reviewer→fix loop, per tahap,
dengan verifikasi a11y+guard+test di akhir tiap tahap (bukan ditunda ke akhir
seluruh plan).

## 7. Yang di luar scope dokumen ini

- **Sub-project B — Rollup lintas-company ("superadmin")**: pemilik grup
  melihat data AGREGAT semua PT-nya sekaligus dalam satu layar. Ini
  perubahan arsitektur akses data (bukan sekadar UI mobile) — migrasi 137
  eksplisit MENOLAK model ini saat pertama dibangun (kepemilikan grup adalah
  gerbang PENDIRIAN badan usaha, bukan gerbang AKSES DATA lintas-tenant).
  Membuka ini kembali butuh brainstorming+spec TERSENDIRI yang meninjau
  ulang keputusan itu secara sadar — kemungkinan melibatkan: `auth_company_id()`
  jadi mendukung banyak company sekaligus (perubahan RLS besar), ATAU
  endpoint agregat terpisah yang query per-company lalu digabung di app
  layer (tak menyentuh RLS sama sekali, lebih aman tapi N+1 query per
  pemilik). Role/label "superadmin" itu sendiri — apakah dipetakan ke
  `is_group_owner()` yang sudah ada atau permission baru — juga keputusan
  Sub-project B, bukan di sini.
- Portal mandor "selengkap web" — siklus terpisah (belum dimulai; PM sudah
  selesai duluan).
- Portal klien "selengkap web" — siklus terpisah.
- `apps/mobile/` (native Expo) — gelombang berikutnya sesudah PWA terbukti
  di SEMUA portal (PM sudah, admin/direktur ini akan menambah bukti kedua).
- Modul berstatus non-`hidup` di `peta-menu.ts` — otomatis ikut nanti begitu
  versi webnya jadi.
- Redesign dashboard admin/web itu sendiri — tunduk `ARAH-VISUAL-2026.md`
  seperti biasa, tak disentuh di sini.
- **Write access ke `settings:credentials:*` dan `ai` dari mobile** — lihat
  §1, ini pembatasan permanen untuk portal ini (bukan sekadar "belum
  dikerjakan"), butuh keputusan founder terpisah untuk dicabut di masa depan.
