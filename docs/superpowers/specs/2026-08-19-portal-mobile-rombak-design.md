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

PM punya grant seluas admin dikurangi segelintir permission destruktif
(`projects:status/delete`, `cash:account:manage`, `users:*`, dll). `pm-portal/`
saat ini cuma 4 halaman (dashboard, mandor, keuangan, proyek).

| Modul | Route API | Kenapa penting |
|---|---|---|
| **Approval inbox** | `approval-inbox.ts` (`GET /api/v1/approval/inbox`) | **Prioritas tertinggi.** PM approver hampir semua entity (kasbon, change order, opname bersama, back-charge, submittal, PO, cuti) tapi TIDAK PUNYA UI approval di portalnya — harus ke dashboard admin |
| K3 (manage), Punch list (verify), Inspeksi (periksa), Submittal (decide) | masing-masing route di atas | PM satu-satunya (di luar admin) berwenang verifikasi/keputusan |
| Dokumen proyek | `documents.ts` | `documents:manage` — upload/hapus dokumen kontrak/SPK |
| Jadwal & baseline | `jadwal-cpm.ts`, `baseline-jadwal.ts` | `projects:baseline:manage` |
| Opname bersama & back-charge | `opname-bersama.ts`, `back-charge.ts` | alur uang lapangan, PM berwenang penuh |
| Kontrak / change order / instruksi lapangan | `kontrak.ts`, `change-orders.ts`, `instruksi-lapangan.ts` | `projects:contract/edit` |
| Procurement (approve MR/PO, gudang) | `procurement.ts`, `pengadaan-lanjutan.ts`, `gudang-kelola.ts` | belum ada UI di luar kasbon+keuangan |

### 2.3 Klien — sudah relatif representatif, gap kecil

Permission klien tak pernah bertambah sejak migrasi 050 (`projects:view`,
`finance:view`, `reports:progress` + derived view-only). Gap:

| Modul | Permission |
|---|---|
| Punch list (read-only — lihat status temuan cacat) | `punch:view` (derived) |
| Inspeksi & submittal (read-only — status pengajuan) | `inspeksi:view`, `submittal:view` (derived) |

Dokumen & notifikasi klien sudah tercakup (endpoint dokumen cuma butuh
`authenticate`, bukan `documents:manage`).

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

## 7. Cakupan fitur final per portal

### 7.1 Mandor
Semua 9 halaman existing dipertahankan & direstyle total + tambahan modul
dari §2.1: K3 lapangan, Punch List, Inspeksi/RFI, Submittal, Jadwal
(Gantt/CPM read + input relevan), Retensi. Beranda dapat feed aktivitas
(progress log masuk, kasbon disetujui/ditolak, upah dibayar) — belum ada
sebelumnya.

### 7.2 PM
Dibangun paling besar — dari 4 halaman jadi portal setara mandor/klien.
**Approval Inbox jadi modul prioritas tertinggi** (temuan §2.2, paling
berdampak nyata). Ditambah: K3/Punch/Inspeksi/Submittal (versi
verify/decide untuk PM), Dokumen proyek, Jadwal & Baseline, Opname
bersama & Back-charge, Kontrak/Change Order/Instruksi Lapangan,
Procurement (approve MR/PO, gudang). "Mode Mandor/PM" switcher yang sudah
ada di `mandor-portal/layout.tsx` dipertahankan sebagai jembatan antar
kedua portal untuk user dual-role.

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

## 9. Yang di luar scope dokumen ini

- `apps/mobile/` (native Expo) — gelombang 2, dibrainstorm terpisah.
- App mobile untuk dashboard admin/super-admin — gelombang 3, terpisah.
- Perubahan permission/role baru di backend — dokumen ini hanya
  meng-UI-kan permission yang SUDAH ADA, bukan menambah wewenang baru.
- Redesign dashboard admin itu sendiri — tunduk `ARAH-VISUAL-2026`
  seperti biasa, tidak disentuh di sini.
