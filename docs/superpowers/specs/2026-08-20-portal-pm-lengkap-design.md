# Portal PM Lengkap — Design Spec

> Status: DRAFT — menunggu review founder sebelum ditransisikan ke implementation plan.
> Ditulis 2026-08-20, sesudah portal-mobile-rombak (mandor/PM dasar/klien) tuntas.

## 0. Kenapa dokumen ini ada

`2026-08-19-portal-mobile-rombak-design.md` §9 mencatat "App mobile untuk dashboard
admin/super-admin — gelombang 3, terpisah" sebagai di luar scope, dan
mengasumsikan portal mandor/PM/klien akan tetap **ringkas** (3-5 menu utama,
sisanya di halaman "Lainnya" berbentuk grid datar).

Founder membalik dua asumsi itu di sesi ini:

1. Portal PM (dan nantinya mandor, klien, admin) **bukan versi ringkas** —
   harus selengkap dashboard web, modul demi modul, tanpa disaring berdasar
   dugaan "yang penting saja".
2. Portal ini akan menjadi **aplikasi mobile sungguhan** — dimulai sebagai
   PWA installable, native (Expo) menyusul kemudian sesuai catatan gelombang
   2 di spec lama.

Dokumen ini hanya mencakup **Portal PM**. Portal lain (mandor, klien, admin/
superadmin) masing-masing dapat siklus spec→plan→implementasi sendiri
sesudah Portal PM tuntas — keputusan founder eksplisit: satu portal
dituntaskan dulu, bukan empat role paralel.

## 1. Cakupan — 32 modul, bukan 34

Role `pm` punya permission di 34 grup (diukur ke `role_permissions` +
`permissions`, bukan ditebak). Dua dikeluarkan atas keputusan founder:

| Modul dikeluarkan | Alasan |
|---|---|
| `settings` (~25 sub-halaman, ~11.500 baris: API key, kredensial, WhatsApp, role) | Administrasi sistem, bukan pekerjaan proyek harian PM — wilayah portal admin/superadmin nanti |
| `ai` (konfigurasi asisten: pemilik/staf/wawasan, ingatan, biaya, plafon) | Sama alasannya — administrasi konfigurasi, bukan operasional |

**32 modul tersisa, SEMUANYA masuk scope, tanpa pengecualian lebih lanjut.**
Termasuk yang secara pola kerja terlihat jarang dipakai PM (GL, aset,
SDM, rekonsiliasi bank) — founder eksplisit menolak penyaringan lebih jauh
saat ditawarkan.

**Batas status**: hanya modul berstatus `hidup` di `lib/peta-menu.ts` yang
direplikasi. Modul `rencana`/`gerbang`/`eksternal` (belum ada UI web sama
sekali) dilewati — portal ikut otomatis begitu versi webnya jadi, itu bukan
pekerjaan spec ini.

**Kedalaman fungsi**: ikuti permission API apa adanya. Kalau PM punya
`<modul>:manage` (bukan cuma `:view`), portal mobile-nya BISA create/edit —
form disederhanakan tapi fungsinya lengkap. Konsisten dengan pola K3/Punch/
Inspeksi/Submittal yang sudah terbukti (PM verifikasi/tutup, bukan cuma
lihat).

**Modul kompleks**: tetap dibangun, disederhanakan sebisa mungkin (bukan
dilewati, bukan berhenti minta konfirmasi per kasus). Untuk form 10+ field,
executor boleh memecah jadi multi-step atau meringkas ke field terpenting +
tautan "kelola lengkap" ke versi web untuk kasus jarang — keputusan di
tangan executor per halaman, dicatat alasannya di komentar kode.

## 2. Arsitektur navigasi

Struktur route tetap `apps/web/app/pm-portal/*` — memperluas yang sudah
ada, bukan portal baru.

**Bottom-nav tetap 5 slot** (Beranda, Approval, Proyek, Keuangan, Lainnya —
`bottom-nav-limit`, Material Design). Tidak berubah dari hari ini.

**"Lainnya" berubah bentuk**: dari grid 9 ikon datar (bentuk hari ini) jadi
**halaman kategori** — list kartu, satu kartu per kategori navigasi resmi
(`lib/peta-menu.ts`, 20 kelompok, dipakai APA ADANYA — bukan taksonomi baru).
Tiap kartu kategori menampilkan badge count ringkas kalau relevan (mis.
"Pengadaan · 3 PO menunggu terima") supaya orang tahu ke mana harus pergi
sebelum masuk — bukan nama kategori kosong. Kategori yang PM tak punya satu
pun permission di dalamnya TIDAK ditampilkan (bukan ditampilkan abu-abu
disabled — kalau kosong, sembunyikan, jangan mengundang klik ke tempat
kosong).

Kategori → sub-halaman dalamnya: list kedua, kartu per modul (mis. kategori
"Mandor & Subkon" membuka list: Penugasan, Kasbon, SPK, Tender, ...).

**Tiga level navigasi**: Bottom-nav → Kategori → Modul → (Halaman/BottomSheet
aksi). Empat level untuk `proyek/[id]` yang sudah ber-tab (Modul → Tab).
Ini LEBIH DALAM dari portal hari ini (dua level: Bottom-nav → Halaman), dan
itu konsekuensi wajar dari 32 modul — meratakan semuanya ke satu grid akan
menghasilkan puluhan ikon yang tak bisa di-scan.

## 3. Interaksi & feel mobile — mengikat, bukan saran

Dasar: pedoman resmi skill `ui-animation` + `ui-ux-pro-max` (Touch &
Interaction, Navigation Patterns, Animation — prioritas CRITICAL/HIGH),
disaring untuk konteks portal ini. Warna/tipografi TIDAK berubah dari
`ARAH-VISUAL-2026.md` (navy `#003366` + `--grad-aksen`) — skill dipakai
untuk pola interaksi & struktur, bukan skin baru.

### 3a. Navigasi & transisi

- Kategori → Modul → Halaman: **slide dari kanan** saat maju, **slide dari
  kiri** saat kembali (`navigation-direction`, arah motion mengikuti posisi
  spasial). Bukan fade datar, bukan reload halaman penuh.
- `BottomSheet` (sudah ada) tetap muncul dari trigger-nya (`modal-motion`),
  bukan center-screen generik — pola ini sudah benar hari ini, dipertahankan.
- Durasi standar 200-300ms, easing `cubic-bezier(0.22, 1, 0.36, 1)` (enter)
  / `cubic-bezier(0.25, 1, 0.5, 1)` (slide/move) — daftar lengkap di
  `ui-animation` SKILL.md §Easing defaults, dipakai sebagai token bersama
  (lihat §5, `lib/motion.ts` baru).

### 3b. Interaksi kartu

- Tap kartu list → `scale(0.97)` sesaat lalu kembali (`scale-feedback`,
  80-150ms) — feedback fisik instan, bukan cuma perubahan warna.
- **Swipe untuk aksi cepat berulang**: kartu approval/verifikasi (approve/
  reject di inbox, tutup temuan punch/K3) mendukung swipe kanan = aksi
  positif (approve/tutup), swipe kiri = aksi negatif (reject/tolak) — warna
  latar (hijau/merah) terungkap progresif mengikuti jarak geser jari
  (`gesture-feedback`: harus real-time mengikuti pointer, bukan animasi
  terpisah dari gesture). **Tombol tetap ada sebagai jalur utama** —
  gesture adalah percepatan, bukan satu-satunya cara (`gesture-alternative`).
  Threshold drag sebelum aksi terpicu (`drag-threshold`) mencegah swipe tak
  sengaja.
- List yang baru dimuat: stagger masuk kartu 30-50ms per item, total
  di bawah 300ms (`stagger-sequence`) — bukan semua muncul serentak.

### 3c. Aksesibilitas motion (tidak dinegosiasikan)

- Semua animasi transform/gesture punya jalur `prefers-reduced-motion:
  reduce` — motion dimatikan, state berubah instan atau fade opacity saja.
- Swipe-to-action WAJIB punya tombol setara (§3b) — pemakai keyboard/pembaca
  layar/switch-control tak pernah kehilangan akses ke aksi yang sama.
- Kartu ber-swipe tetap punya `role`/label yang benar; arah swipe diumumkan
  lewat label tombol yang menyertainya (mis. "Setujui" tetap ada sebagai
  teks terjangkau, bukan makna yang cuma ada di warna/gesture).

## 4. Fondasi PWA (Tahap 0, sebelum modul apa pun)

**Keadaan hari ini**: `public/sw.js` sudah ada tapi HANYA untuk web push
notification (58 baris, tanpa strategi cache), dan HANYA didaftarkan saat
user opt-in push (`lib/webpush.ts:48`, dipanggil dari `subscribeToPush()`)
— bukan otomatis saat app dibuka. `manifest.json` **tidak ada sama
sekali**.

**⚠ Temuan yang mengubah rencana ikon**: aplikasi ini **sudah multi-tenant**
dan favicon-nya BUKAN file statis — `app/icon.tsx` men-generate ikon
on-the-fly lewat `next/og` `ImageResponse`, mengambil `logo_url` per
company dari `GET /api/v1/public/merek`, jatuh ke inisial+navy kalau logo
tak ada (lihat komentar lengkap di file itu — keputusan founder 2026-08-09,
"favicon nya ganti dengan logo yg diupload perusahaan"). Ikon
`/icon-192.png`/`/icon-72.png` yang direferensikan `sw.js` **tidak ada di
disk** (`ls public/*.png` kosong) — push notification yang sudah jalan pun
sebenarnya mengirim path ikon yang 404.

Ikon PWA (untuk "Add to Home Screen") **WAJIB ikut pola dinamis yang
sama** — bukan file statis dari brand Puraloka. Menaruh logo Puraloka
statis akan membuat SEMUA tenant (termasuk yang akan datang) melihat ikon
perusahaan lain di homescreen mereka sendiri — cacat arsitektur yang sama
persis dengan yang favicon sudah selesaikan setahun lalu, diperkenalkan
ulang lewat jalur berbeda.

**Yang dibangun**:

- `app/manifest.ts` (Next.js App Router route handler, BUKAN
  `public/manifest.json` statis — didukung sejak Next 13, project ini di
  Next 16): nama app dari `ambilMerek()` (fungsi yang sama dipakai
  `app/icon.tsx`, diekspor ulang atau dipindah ke `lib/` supaya dipakai
  bersama), ikon 192/512/maskable **dihasilkan lewat rute serupa
  `app/icon.tsx`** tapi berukuran PWA-standar (bukan 64×64 favicon),
  `theme-color` `#003366` (navy, dari `lib/warna-merek.ts` — TIDAK ditulis
  hex baru, ikuti pola larangan hex mentah yang sudah dijaga
  `hex-ratchet`), `display: standalone`, `start_url` mengarah ke rute yang
  benar tergantung sesi (perlu diverifikasi ke pola redirect
  `pm-portal/layout.tsx` saat eksekusi).
- Rute ikon PWA baru (mis. `app/icon-192.tsx`, `app/icon-512.tsx`, atau
  satu rute dinamis `app/icon/[size]/route.tsx`) yang MEMANGGIL ULANG
  logika `ambilMerek()` dari `app/icon.tsx` — jangan duplikasi fetch+fallback
  logic, ekstrak ke `lib/` yang dipakai kedua rute. `runtime = "nodejs"`,
  `revalidate = 3600` (sama seperti favicon — logo jarang berubah, satu
  jam cukup).
- `sw.js` **diperluas, bukan diganti** — push notification yang sudah
  jalan TIDAK disentuh. Ditambahkan strategi cache MINIMAL: app-shell
  (layout, CSS, JS inti) di-cache supaya app **terbuka** saat offline
  (splash + navigasi tampil), tapi panggilan API tetap gagal dengan pesan
  "Tidak ada koneksi" yang jelas — **bukan** caching data transaksional
  (approval, proyek, dsb.). Keputusan founder eksplisit: offline penuh
  ditunda, risiko data basi/konflik terlalu besar untuk fase ini.
- Registrasi service worker dipindah dari "hanya saat opt-in push"
  (`lib/webpush.ts`) ke **selalu saat app dibuka** — app-shell caching
  harus aktif dari awal, bukan menunggu user menyalakan notifikasi.
  `lib/webpush.ts` tetap dipertahankan untuk logic push-subscribe-nya,
  tapi register service worker-nya disatukan supaya tak register dua kali
  dengan scope yang sama.
- Halaman `pm-portal/layout.tsx` menyediakan prompt "Install App"
  non-mengganggu (satu kali, bisa ditutup, tidak muncul ulang tiap sesi).

## 5. Fondasi teknis tambahan

- `lib/motion.ts` (baru): token durasi/easing bersama (§3a) supaya semua
  halaman baru memakai token yang sama, bukan angka ditulis ulang tiap
  file — pola yang sama dengan token kerapatan (`--pad-kartu-lega` dst)
  yang sudah terbukti menjaga konsistensi di CI (`kerapatan-ratchet.mjs`).
- Komponen baru yang dibutuhkan pola swipe (`components/portal/
  SwipeableCard.tsx` atau serupa) — dibangun sekali di Tahap 1, dipakai
  ulang di seluruh tahap berikutnya. CSS transition diprioritaskan atas
  JS (`ui-animation` — CSS interruptible, JS drop frame di bawah tekanan).
- Struktur `_bersama/tipe.ts` per kategori TETAP mengikuti pola yang sudah
  terbukti (bentuk field diverifikasi ke kode API asli sebelum ditulis,
  BUKAN ditebak dari nama). Ini sudah menangkap kesalahan nyata hari ini
  (bentuk respons baseline jadwal, keberadaan `punch:verify` vs
  `punch:manage`) — disiplin yang sama wajib diteruskan, apalagi dengan
  cakupan 32 modul yang jauh lebih rawan salah tebak.

## 6. Struktur eksekusi — 8 tahap

| Tahap | Cakupan | Modul PM (grup permission) | Perkiraan halaman sumber |
|---|---|---|---|
| 0 | Fondasi PWA | — (manifest, ikon, sw diperluas) | — |
| 1 | Operasi Lapangan + Mandor & Subkon | k3✓, punch✓, inspeksi✓, submittal✓ (restyle/lengkapi), progress, mandor, workers, mitra, backcharge, opname, spk | ~20 |
| 2 | Kontrak + Perencanaan | projects (bagian kontrak), rfi, klaim, milestones, jadwal | ~15 |
| 3 | Budget & Cost Control | cecep (estimasi/RAP/AHSP/WBS/markup) | ~10 |
| 4 | Pengadaan + Gudang & Material | procurement, gudang | ~19 |
| 5 | Rencana & Uji Mutu + K3 lanjutan | mutu, ncr, kepatuhan, izin | ~7 |
| 6 | Keuangan | finance, cash, gl, rekonsiliasi | ~15 |
| 7 | Sisa (SDM, Aset, Risiko, Dokumen, Laporan) | sdm, assets, risiko, documents, serah_terima, reports, clients | ~15 |

Urutan mengikuti kedekatan dengan kerja proyek harian PM (lapangan/kontrak
dulu, administratif belakangan) — keputusan founder eksplisit, bukan
alfabetis.

Tiap tahap dieksekusi sebagai kelompok task dalam satu implementation plan
besar (bukan spec terpisah per tahap) — progres tersimpan di plan seperti
`2026-08-19-portal-mobile-rombak.md`, dieksekusi lintas sesi, tak harus
tuntas sekaligus.

**Verifikasi per tahap** mengikuti disiplin yang sudah terbukti hari ini:
baca kode backend dulu (endpoint + permission + bentuk respons) sebelum
menulis halaman, typecheck, lint, penjaga token/tombol/kerapatan, audit
a11y runtime penuh sesudah tiap tahap selesai (bukan ditunda ke akhir —
run a11y penuh makan ~50 menit untuk 155 halaman, akan lebih lama lagi
dengan 90+ halaman baru; menjalankannya bertahap per-tahap mencegah satu
run raksasa yang gagal di tengah dan harus diulang dari nol).

## 7. Yang di luar scope dokumen ini

- Portal mandor "selengkap web" — siklus spec terpisah, sesudah Portal PM
  tuntas.
- Portal klien "selengkap web" — sama, siklus terpisah.
- Portal admin/superadmin — sama, siklus terpisah. Catatan: sistem ini
  TIDAK punya role `superadmin` terpisah (diverifikasi ke tabel `roles`) —
  yang dimaksud adalah role `admin` (224 permission, dashboard penuh
  `(dashboard)/*`, 32 folder menu, 154 halaman total).
- `apps/mobile/` (native Expo) — gelombang berikutnya sesudah PWA
  terbukti, dicatat di spec lama, tidak diubah di sini.
- Modul `settings` dan `ai` — lihat §1, keluar dari scope PM secara
  eksplisit.
- Modul berstatus non-`hidup` di `peta-menu.ts` — otomatis ikut nanti
  begitu versi webnya jadi, bukan pekerjaan spec ini.
- Redesign dashboard admin/web itu sendiri — tunduk `ARAH-VISUAL-2026.md`
  seperti biasa, tak disentuh di sini.
