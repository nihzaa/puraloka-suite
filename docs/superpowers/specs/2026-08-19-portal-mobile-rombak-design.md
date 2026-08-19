# Rombak Portal Mandor, PM, dan Klien — Gaya Aplikasi Mobile

Status: disetujui founder (brainstorming 2026-08-19), siap masuk `writing-plans`.
Sub-proyek 1 dari 3 (lihat §0 Peta Keseluruhan).

## 0. Peta keseluruhan (konteks, bukan scope dokumen ini)

Permintaan awal founder mencakup 3 gelombang kerja. Dokumen ini HANYA membahas
gelombang 1. Gelombang 2 dan 3 dibrainstorm terpisah nanti.

1. **[Dokumen ini] Portal web** — `mandor-portal/`, `pm-portal/`, `portal/`
   (klien) di `apps/web/`, dirombak jadi bergaya aplikasi mobile profesional.
2. **[Nanti]** Port pola yang sudah matang dari (1) ke `apps/mobile/`
   (native Expo/React Native) — supaya app native mandor/klien setara.
3. **[Nanti, terpisah]** Aplikasi mobile untuk portal utama (admin/super-admin)
   — ditunda karena dashboard admin 33 modul, butuh keputusan sendiri
   (native penuh vs PWA vs subset fitur).

## 1. Tujuan & prinsip

Tiga portal ini (mandor, PM, klien) saat ini jauh tertinggal dari dashboard
utama: total ~5.100 baris gabungan, inline `style={}` tanpa component
library, dan — temuan audit paling penting — **beberapa role kehilangan akses
ke modul yang secara permission memang berhak mereka pakai**, terutama PM
yang harus login ke dashboard admin untuk approve apa pun.

Prinsip kerja untuk rombak ini:

- **Tuntaskan yang relevan, bukan tiru 33 menu admin apa adanya.** Tiap role
  hanya melihat modul yang levelnya, tapi modul itu dibangun setuntas versi
  admin — bukan versi kurus.
- **Kalau data/kapabilitas itu ada di backend dan role ini berhak (secara
  `requirePermission`), munculkan.** Jangan sembunyikan demi "kesederhanaan".
- **Warna tetap senada** (navy `#003366` — brand Puraloka), tapi ARAH-VISUAL-2026
  (yang mengikat dashboard admin) TIDAK berlaku di sini. Portal ini boleh
  — dan memang harus — terasa seperti aplikasi mobile asli, bukan web yang
  diciutkan.
- **Ganti langsung di tempat.** Route/URL yang sudah ada dipertahankan;
  isinya ditulis ulang total. Tak ada versi paralel `-v2`.
- Tunduk pada aturan tak bisa ditawar di `CLAUDE.md`: `requirePermission`
  (bukan literal role), akses data lewat `request.db`, nominal `numeric`,
  waktu `timestamptz`, WCAG 2.1 AA (a11y BUKAN opsional).

## 2. Audit gap fitur (temuan faktual, dasar keputusan scope)

Diukur dari `requirePermission` di route API vs pemanggilan nyata dari tiap
portal (agen Explore, 2026-08-19). Ini yang membedakan dokumen ini dari
sekadar "redesign visual" — beberapa modul di bawah adalah fitur BARU bagi
portalnya, bukan sekadar restyle yang sudah ada.

### 2.1 Mandor — permission ada, UI tidak ada

| Modul | Route API | Permission |
|---|---|---|
| K3 lapangan (lapor insiden, lihat JSA/inspeksi) | `k3-lapangan.ts` | `k3:insiden:view/manage`, `k3:jsa:view` |
| Punch list (catat & tugaskan perbaikan cacat) | `punch-list.ts` | `punch:manage` |
| Inspeksi/RFI (ajukan inspeksi, lihat jawaban RFI) | `rfi-inspeksi.ts` | `inspeksi:manage`, `rfi:view` |
| Submittal (ajukan material/shop drawing) | `submittal.ts` | `submittal:manage` |
| Jadwal proyek (Gantt/CPM) | `jadwal-cpm.ts` | `projects:view` (klien sudah punya, mandor belum) |
| Retensi | `mandor.ts` (`retensi-register`, `retensi-releases`) | sudah ter-scope mandor, tak pernah dipanggil dari portal |

### 2.2 PM — gap terbesar, approval inbox paling kritis

⚠️ **Klaim di bawah diverifikasi LANGSUNG ke tabel `role_permissions` produksi**
(bukan cuma migrasi/kode) — karena arsitektur permission di repo ini bersifat
runtime/dinamis (ADR-004): siapa memegang permission apa BUKAN hardcode di
migrasi, melainkan data `role_permissions` yang bisa diubah lewat role editor
UI. Query dijalankan 2026-08-19 terhadap role `pm` (133 permission distinct).
Beberapa klaim awal saya SALAH dan sudah dikoreksi di tabel ini.

PM punya grant seluas admin dikurangi segelintir permission destruktif.
`pm-portal/` saat ini cuma 4 halaman (dashboard, mandor, keuangan, proyek).

| Modul | Route API | Permission (dikonfirmasi PM PUNYA) |
|---|---|---|
| **Approval inbox** — kasbon, MR, K3, punch, inspeksi, submittal, PO | `approval-inbox.ts` + `utils/approval.ts` | **Prioritas tertinggi.** `mandor:kasbon:approve`, `procurement:mr:manage`, `submittal:decide`, `punch:verify`, `inspeksi:periksa` — semua terkonfirmasi PM punya. Lihat §2.4 untuk detail alur & 2 modul yang DICORET. |
| K3 (manage), Punch list (verify), Inspeksi (periksa), RFI (manage) | masing-masing route di atas | `k3:insiden/jsa/inspeksi:manage`, `punch:verify`, `inspeksi:periksa`, `rfi:manage` — semua terkonfirmasi |
| Dokumen proyek | `documents.ts` | `documents:manage` — terkonfirmasi |
| Jadwal & baseline | `jadwal-cpm.ts`, `baseline-jadwal.ts` | `projects:baseline:manage` — terkonfirmasi |
| Kontrak / instruksi lapangan | `kontrak.ts`, `instruksi-lapangan.ts` | `projects:contract`, `projects:edit` — terkonfirmasi |
| Procurement (approve PO, gudang) | `procurement.ts`, `pengadaan-lanjutan.ts`, `gudang-kelola.ts` | `procurement:po:manage` — terkonfirmasi |
| Opname bersama (KELOLA/catat, bukan verifikasi) | `opname-bersama.ts` | `opname:kelola` — PM boleh CATAT opname, **TIDAK boleh** memverifikasi (lihat §2.4) |

**Dicoret dari scope PM** (permission TIDAK dimiliki PM di data aktual,
berbeda dari asumsi awal saya): **Change Order approval** (`change_order:approve`
— PM tidak punya), **Opname Bersama verifikasi/putuskan** (`opname:verifikasi`
tidak dimiliki, hanya `opname:kelola`/pencatatan), **Back-charge putuskan**
(`backcharge:setujui` tidak dimiliki, hanya `backcharge:kelola`/pencatatan),
**Cash expense approve** (`cash:expense:approve` tidak dimiliki). Modul-modul
ini tetap boleh punya UI *pencatatan/pengajuan* di PM portal kalau PM punya
permission `:kelola`-nya, tapi TOMBOL APPROVE/VERIFIKASI-nya tidak boleh
muncul di PM portal — approver sesungguhnya (kemungkinan direktur/keuangan)
di luar scope dokumen ini.

### 2.3 Klien — sudah relatif representatif, gap kecil

Permission klien tak pernah bertambah sejak migrasi 050 (`projects:view`,
`finance:view`, `reports:progress` + derived view-only). Gap:

| Modul | Permission |
|---|---|
| Punch list (read-only — lihat status temuan cacat) | `punch:view` (derived) |
| Inspeksi & submittal (read-only — status pengajuan) | `inspeksi:view`, `submittal:view` (derived) |

Dokumen & notifikasi klien sudah tercakup (endpoint dokumen cuma butuh
`authenticate`, bukan `documents:manage`).

### 2.4 Approval inbox PM — detail alur (WAJIB dibaca sebelum implementasi)

Riset mendalam ke `approval-inbox.ts` dan `utils/approval.ts` menemukan 3 hal
yang mengubah cara modul ini harus dibangun, bukan sekadar "pasang UI di atas
endpoint yang ada":

1. **Endpoint inbox murni listing generik, bukan detail.** Respons
   `GET /api/v1/approval/inbox` (`jenis, label, id, judul, nomor, nominal,
   pengaju_id, project_id, level_selesai, jalur_ui, saya_pengajunya`) TIDAK
   membawa nama pemohon maupun detail entity (mis. kasbon: sumber dana,
   scope kerja). Kartu approval di bottom-sheet PM portal **wajib fetch
   tambahan** ke endpoint detail per-entity (`GET /api/v1/kasbons/:id`, dst)
   sebelum ditampilkan — bukan sekali panggil selesai.

2. **⚠️ Endpoint inbox TIDAK memfilter berdasarkan proyek milik PM.**
   `canParticipateInChain` menyaring berdasarkan PERMISSION (apakah user
   punya salah satu permission di rantai approval), BUKAN berdasarkan
   apakah `project_id` baris itu adalah proyek yang di-PM-i user tsb.
   Pembatasan proyek baru terjadi di endpoint approve/reject-nya masing-
   masing (mis. `kasbons.ts` cek `project.pm_id !== user.id`). Kalau UI
   PM portal menampilkan hasil inbox mentah, **PM berisiko melihat baris
   approval dari proyek yang bukan tanggung jawabnya** — bukan bug baru
   yang dibuat rombak ini, tapi kondisi existing yang jadi lebih terlihat
   begitu UI-nya sungguhan dipakai. **Wajib**: PM portal menambah filter
   `project_id IN (proyek yang di-PM-i user ini)` di sisi pemanggilan
   (route baru atau query param), sebelum daftar ditampilkan.

3. **`jalurUi` tidak bisa dipakai apa adanya di PM portal.** Field ini satu
   nilai global per jenis entity, dan SEMUANYA menunjuk halaman dashboard
   admin (mis. kasbon → `/mandor/kasbon`, submittal → `/lapangan/submittal`).
   Mengubah nilai `jalurUi` di katalog akan memutus dashboard admin dan
   melanggar `audit-inbox-jalur-nyata.mjs`. **Pendekatan yang benar**: PM
   portal punya mapping `jenis → path pm-portal` sendiri di sisi frontend
   (tidak menyentuh katalog `SUMBER_INBOX`), dipakai untuk tombol "lihat
   detail" — `jalur_ui` dari API diabaikan di konteks PM portal.

4. **Alur approve bertingkat, bukan selalu 1 langkah.** Rantai approval per
   `entity_type` bisa multi-level (`approval_chains`/`approval_steps`,
   data per-tenant) — PM belum tentu approver final. UI wajib menampilkan
   `level_selesai` vs total level, dan setelah PM approve di langkah
   non-final, statusnya TETAP "menunggu" (bukan langsung "disetujui") —
   pesan konfirmasi di UI harus mencerminkan ini, jangan klaim "disetujui"
   kalau sebenarnya baru naik satu level.

5. **Reject: alasan wajib TIDAK seragam per entity type** (back-charge
   mewajibkan validasi server-side, kasbon/change-order opsional) — UI
   tetap tampilkan field alasan di semua kasus untuk konsistensi, tapi
   tombol submit tidak boleh diblok di sisi klien untuk entity yang
   tidak mewajibkan (biarkan server yang menegakkan).

## 3. Arah visual — "Navy Ledger"

Warna brand yang sama (`#003366`, gradien `--grad-merek: #001F3D → #003366 →
#0059B3` dari `globals.css`), dipakai jauh lebih berani daripada dashboard
admin: gradien terang di CTA, glow bernuansa navy, angka KPI besar bergaya
tabular, kartu radius besar. Bukan warna baru — kepadatan & cara warna itu
tampil yang berubah, supaya tetap senada dengan brand tapi terasa seperti
app fintech modern (Revolut/Cash App-esque), bukan web dashboard.

- **Palet**: `--navy-deep #001F3D` (hero/scrim), `--navy #003366` (brand,
  gradient stop), `--navy-mid #0059B3` (gradient end/active), surface putih
  / `#0F1117` gelap, canvas `#F5F7FA` / `#0A0C10` gelap (bukan putih polos —
  menghindari kesan "web admin"). Semantik dipakai ulang dari token yang
  ada: sukses `#15803d`, warning `#B45309`, bahaya `#B91C1C`.
- **Diferensiasi per-role** hanya lewat tint/weight (bukan hue baru): Mandor
  = navy-mid, PM = navy-deep + pulsa amber untuk approval pending, Klien =
  navy + glow lembut.
- **Tipografi**: tetap Bricolage Grotesque (display) + Plus Jakarta Sans
  (body) — dipakai lebih agresif (KPI 48–64px, weight 700+, tracking rapat)
  dibanding dashboard admin.
- **Bentuk**: radius besar (20–28px), tombol/badge pill, shadow berwarna
  navy (bukan abu-abu netral).
- **Dark mode**: wajib ada sejak awal (bukan ditambah belakangan), pola
  token sama seperti `globals.css` (`--navy` berbalik terang di mode gelap).

## 4. Visualisasi data & perbandingan periode

Prinsip: KPI tidak boleh cuma angka mentah — tiap KPI utama dapat sparkline
tren + badge naik/turun vs periode sebelumnya (ikon panah + teks angka,
bukan warna saja — WCAG `color-not-only`).

- **Pembanding default**: periode sama sebelumnya (minggu ini vs minggu
  lalu, bulan ini vs bulan lalu), dengan toggle rentang (7 hari/30 hari/3
  bulan).
- **Grafik pakai `recharts`** (sudah ada di `package.json`, tak nambah
  dependency) tapi di-restyle total: sumbu minimal, tooltip berbasis
  sentuh, palet 1 gradasi navy + abu netral, animasi masuk halus
  (menghormati `prefers-reduced-motion`).
- **Per portal**:
  - Mandor: grafik batang upah per-periode, donut kasbon vs pendapatan
    bersih di Rekapitulasi.
  - PM: grafik progress proyek (versi ringkas Kurva-S) + target vs
    realisasi di dashboard.
  - Klien: tab Kurva S (recharts) dipertahankan & diperkaya; beranda dapat
    ringkasan progress lintas-proyek dalam satu tampilan (bukan cuma card
    teks berbaris).

## 5. Arsitektur navigasi

Masalah pola lama: nav sampai 9 item, dipotong paksa jadi 5 pertama di
mobile (`navItems.slice(0, 5)`) — beberapa menu jadi tak terjangkau lewat
bottom nav sama sekali di layar kecil. Ini pola web yang diciutkan, bukan
pola app mobile asli.

- **Bottom nav maksimal 5 item, dikurasi per-peran** (bukan potongan
  otomatis array besar): Beranda + 2 aksi tersering peran itu + Notifikasi
  + "Lainnya".
- **Halaman "Lainnya"**: grid ikon besar berisi semua modul sekunder
  (pola umum app perbankan — Livin/Jenius/Gojek tab "Lainnya").
- **Bottom sheet menggantikan modal desktop** untuk semua form (ajukan
  kasbon, submit laporan upah, approve dari inbox, dst) — pola native
  mobile, bukan modal tengah layar.
- **Pull-to-refresh & skeleton loading**, bukan spinner tengah layar.
- Satu **shell (`PortalShell`)** dipakai oleh ketiga portal dengan
  konfigurasi nav berbeda per role — konsisten, satu tempat untuk
  dirawat, bukan 3 layout yang berbeda-beda.

## 6. Component library baru — `apps/web/components/portal/`

Belum ada folder ini sama sekali (diverifikasi audit awal) — semua halaman
portal saat ini pakai inline `style={}` mandiri. Dibangun dari nol:

| Komponen | Fungsi |
|---|---|
| `PortalShell` | Header + bottom nav + safe-area, dipakai 3 portal |
| `KpiCard` | Angka besar tabular + sparkline + badge tren vs periode lalu |
| `ActionCard` | Kartu aksi/ringkasan di beranda & grid "Lainnya" |
| `BottomSheet` | Pengganti modal — form naik dari bawah |
| `SegmentedTab` | Ganti tab desktop untuk switch konten dalam 1 halaman |
| `StatusBadge` | Status approval/pembayaran, dengan ikon (bukan warna saja) |
| `EmptyState` | Pola kosong konsisten lintas modul |
| `SkeletonCard` | Loading state pengganti spinner |
| `MiniChart` | Wrapper recharts bergaya mobile (dipakai KpiCard & grafik utama) |

### 6.1 Batas portabilitas ke `apps/mobile/` (koreksi asumsi awal)

Riset ke `apps/mobile/` (gelombang 2, di luar scope eksekusi dokumen ini)
mengoreksi rencana awal saya bahwa component library ini bisa "dirancang
portable" ke native lewat shared hooks. Faktanya:

- **JSX/styling TIDAK portable.** `apps/mobile/components/ui/` pakai
  `StyleSheet.create` + RN primitives (`View`/`Text`/`TouchableOpacity`)
  murni, tanpa NativeWind. `PortalShell`/`KpiCard`/`BottomSheet` versi web
  (DOM + CSS) dan versi native akan selalu jadi **2 implementasi terpisah**
  — jangan berinvestasi waktu mengejar portabilitas JSX yang tak akan
  terpakai.
- **Yang layak dipisah jadi shared logic** (murni `.ts`, tanpa import
  React/JSX) untuk dipakai ulang nanti di gelombang 2: fungsi format angka/
  tanggal, `statusVariant`/`statusLabel` (mapping status → warna/label),
  validasi form, shape data/types (`DashboardData`, dsb). Taruh di
  `apps/web/lib/portal/` sebagai modul polos — bukan di `components/portal/`
  — supaya jelas batasnya dari awal.
- **Jangan bangun `useData()`/cache hook baru untuk portal ini** dengan
  asumsi nanti dipakai bareng mobile. `apps/web/lib/data-cache.ts` (`useData`)
  sudah ada tapi **0 dari 164 halaman web memakainya** (`audit-halaman-
  pakai-cache.mjs` — ratchet, bukan wajib-baru). Portal ini sebaiknya
  **memakai `useData()` yang sudah ada** (bukan bikin cache layer kedua)
  untuk sekaligus menaikkan angka ratchet itu — tapi ini keputusan
  implementasi, dicek ulang saat `writing-plans`.
- **Offline-queue mandor**: web sudah punya (`antrean-offline.ts`,
  `antrean-foto.ts`, `kirim-lapangan.ts`, `lokasi-perangkat.ts`), mobile
  belum punya sama sekali. Jangan asumsikan pola queue web akan "tinggal
  dipindah" ke native saat gelombang 2 — kemungkinan besar perlu didesain
  ulang dari nol karena arsitektur storage & background-sync di RN beda
  dari browser (`localStorage`/`IndexedDB` vs `expo-secure-store`/native
  background tasks). Dicatat sebagai risiko gelombang 2, bukan dipecahkan
  di sini.

## 7. Cakupan fitur final per portal

### 7.1 Mandor
Semua 9 halaman existing dipertahankan & direstyle total + tambahan modul
dari §2.1: K3 lapangan, Punch List, Inspeksi/RFI, Submittal, Jadwal
(Gantt/CPM read + input relevan), Retensi. Beranda dapat feed aktivitas
(progress log masuk, kasbon disetujui/ditolak, upah dibayar) — belum ada
sebelumnya.

### 7.2 PM
Dibangun paling besar — dari 4 halaman jadi portal setara mandor/klien.
**Approval Inbox jadi modul prioritas tertinggi** (temuan §2.2 & §2.4,
paling berdampak nyata) — dengan filter wajib proyek-milik-PM (§2.4 poin 2)
dan mapping `jalurUi` sendiri (§2.4 poin 3). Ditambah: K3/Punch/Inspeksi/
Submittal (versi manage/verify/periksa/decide untuk PM — dikonfirmasi ke
`role_permissions`), Dokumen proyek, Jadwal & Baseline, Kontrak/Instruksi
Lapangan, Procurement (approve PO, gudang). Opname bersama masuk sebagai
modul **pencatatan** (`opname:kelola`) tanpa tombol verifikasi — PM
TIDAK punya `opname:verifikasi`. **Change Order dan Back-charge approval
DICORET dari scope PM portal** (PM tidak punya `change_order:approve`
maupun `backcharge:setujui` di data aktual — lihat §2.2) — kalau PM tetap
perlu melihat status CO/back-charge proyeknya, itu tampilan read-only,
bukan tombol approve. "Mode Mandor/PM" switcher yang sudah ada di
`mandor-portal/layout.tsx` dipertahankan sebagai jembatan antar kedua
portal untuk user dual-role.

### 7.3 Klien
Struktur 7-tab `proyek/[id]` dipertahankan (sudah paling matang), direstyle
total. Ditambah dari §2.3: tab Punch List (read-only), tab Inspeksi &
Submittal (read-only, status saja). Beranda dapat ringkasan progress
lintas-proyek dalam satu grafik.

## 8. Testing & verifikasi

Mengikuti CLAUDE.md §8a.2 (tiap sektor wajib ditest & diaudit):

- Setiap halaman portal baru wajib lolos audit a11y runtime
  (`jalankan-a11y-lengkap.mjs`) — 0 pelanggaran, termasuk 3 portal ini
  yang SAAT INI justru termasuk rute yang terlewat audit (butuh akun uji
  per peran: mandor/PM/klien — lihat catatan §5.4 CLAUDE.md).
- Penjaga CI relevan yang HARUS tetap hijau setelah rombak:
  `audit-halaman-pakai-cache.mjs`, `uji-galat-muat-terpisah.mjs`,
  `uji-rute-id-tak-basi.mjs`, `uji-judul-halaman-ada.mjs`,
  `uji-remah-lengkap.mjs`, `audit-gerbang-tenancy.mjs`,
  `audit-izin-benar-ada.mjs`.
- Modul approval inbox PM baru WAJIB melewati
  `audit-approval-satu-pintu.mjs` dan `audit-inbox-lengkap.mjs` — jangan
  bikin jalur approval kedua di luar `utils/approval.ts`.
- Test integrasi Vitest untuk tiap endpoint yang mulai dipanggil dari
  portal (kalau belum ada test-nya).

## 8a. Peringatan: permission adalah data runtime, bukan konstanta

Semua tabel permission di §2 diukur langsung ke `role_permissions` pada
2026-08-19 dan BISA berubah kapan saja lewat role editor UI (ADR-004 — role
adalah data konfigurasi per-tenant, bukan literal kode). Sebelum membangun
tiap modul di `writing-plans`, ukur ulang dengan query yang sama (lihat
riwayat commit dokumen ini untuk skrip query `role_permissions` yang dipakai)
— JANGAN asumsikan tabel di §2.2 masih akurat tanpa diverifikasi ulang,
terutama kalau ada jeda waktu antara brainstorming ini dan implementasinya.
Kode UI sendiri tetap WAJIB pakai `requirePermission`/pengecekan permission
dinamis (bukan hardcode "PM boleh X") — tabel di dokumen ini hanya untuk
KEPUTUSAN SCOPE (modul mana yang dibangun), bukan untuk logic run-time.

## 9. Yang di luar scope dokumen ini

- `apps/mobile/` (native Expo) — gelombang 2, dibrainstorm terpisah.
- App mobile untuk dashboard admin/super-admin — gelombang 3, terpisah.
- Perubahan permission/role baru di backend — dokumen ini hanya
  meng-UI-kan permission yang SUDAH ADA, bukan menambah wewenang baru.
- Redesign dashboard admin itu sendiri — tunduk `ARAH-VISUAL-2026`
  seperti biasa, tidak disentuh di sini.
