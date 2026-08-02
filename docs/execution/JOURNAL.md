# JOURNAL — Catatan Sesi

Satu blok per sesi. **Ditambahkan, tidak pernah ditulis ulang.**
Entri terbaru di ATAS.

---

## 2026-08-02 · Sesi 1 — Fase 0 dimulai

### Pengakuan tujuh koreksi (tanpa pembelaan)

**C-1 — Introspeksi DB tidak stabil. Saya salah.**
Saya membalik kesimpulan soal GL empat kali dan membiarkan `process.cwd()`
melayang ke `apps/api` tanpa menyadarinya. Akar teknisnya saya temukan hari ini
dan lebih memalukan dari dugaan: setiap alat menulis ulang logika baca-`.env`
sendiri, dan salah satunya **tidak melucuti tanda kutip** pembungkus nilai
`DIRECT_URL` (`"postgresql://…"`). Driver `pg` gagal mem-parsing string berawalan
`"`, jatuh ke variabel lingkungan, lalu memakai `HOST=` dari `.env` sebagai
hostname — menghasilkan galat menyesatkan `getaddrinfo ENOTFOUND base`. Angka DB
di laporan audit saya **memang layak dicurigai**. Sudah diverifikasi ulang (§0.2).

**C-2 — Urutan kerja saya terbalik. Saya salah.**
Saya menaruh `company_id` di #7 dan keputusan grup/holding di #9. Bentuk grup
menentukan bentuk CoA dan jumlah tingkat kolom tenancy; mengerjakan `company_id`
lebih dulu berarti menyentuh 122 tabel dua kali. Urutan sudah dibalik di
`CHARTER.md` §3: **keputusan struktural mendahului migrasi struktural.**

**C-3 — Rekomendasi saya berbahaya. Saya salah, dan ini yang paling serius.**
Saya membuktikan sendiri parser `rekonsiliasi-schema-migrations.mjs` buta terhadap
DDL dinamis, lalu tetap merekomendasikan `--tulis` ke buku migrasi. Buku itu
menentukan apa yang di-replay CI; satu entri palsu = migrasi dilewati senyap
selamanya, tanpa gejala. Rekomendasi **ditarik**. Alat baru `ledger-diff.mjs`
dibuat, **tanpa flag tulis sama sekali**, dan menandai migrasi ber-DDL-dinamis
sebagai `PERLU-MATA-MANUSIA` alih-alih menghijaukannya.

**C-4 — Saya memvonis tanpa bukti. Saya salah.**
"Cacat bootstrap harness, bukan produksi" adalah hipotesis yang saya tulis sebagai
kesimpulan. Belum diselesaikan sesi ini; masuk antrean sebagai `F0-4` dan
**tidak** akan saya tutup sebelum ada bukti.

**C-5 — Golden file tidak cocok. Saya salah.**
`1.657.839.590,39`, `109,5`, `7875` tidak saya temukan, dan saya melaporkannya
sebagai "kemungkinan dari dokumen lain" alih-alih menyelidikinya. Ditemukan hari
ini: ada **dua** berkas Cibuluh (`.xls` 6,9 MB dan `.xlsx` 3,5 MB) — kandidat
penjelasan yang belum saya buka. Masuk antrean `F0-7`.

**C-6 — Skor Testing 80 belum dibayar. Saya salah.**
Coverage tidak diukur, jadi angka itu tidak punya dasar. Masuk antrean `F0-5`
sebagai ratchet, bukan target aspirasional.

**C-7 — Temuan terpenting saya kubur. Saya salah.**
93 dari 119 sub-menu tanpa rancangan saya taruh sebagai catatan kaki §10.6,
padahal itu risiko yang paling mungkin membunuh proyek. Dinaikkan menjadi Fase 5
tersendiri di `CHARTER.md`.

### Yang dikerjakan

- **0.1 SELESAI** — `scripts/db/introspect.mjs` + `scripts/db/_koneksi.mjs`.
  Satu metode koneksi (driver `pg`, alasan ditulis di header), identitas +
  `schema_hash` dicetak tiap run, penjaga cwd menolak jalan dari luar root repo.
- **0.2 SELESAI** — tujuh angka kepala diverifikasi ulang → `KOREKSI.md`.
- **0.6 SEBAGIAN** — `ledger-diff.mjs` jadi, `LEDGER-DIFF.md` terbit.
  Penulisan ke buku **tidak** dilakukan (G-2) → `RATIFIKASI.md` R-001.

### Yang ditemukan (tidak ada di audit kemarin)

1. **🔴 P0 — tabrakan definisi GL 047 ↔ 167.** Migrasi 047 **tercatat sudah jalan**
   dan mendefinisikan `accounts` **single-tenant** (`account_type`, nol `company_id`).
   Migrasi 167 mendefinisikan `accounts` **tenant-aware** (`company_id` 18×, kolom
   `type`) dengan `CREATE TABLE IF NOT EXISTS`. Dev memakai desain 167 (terverifikasi
   `introspect columns`). Di lingkungan baru, `ci-project-setup.mjs` menjalankan 047
   lebih dulu (SQL-nya valid → tidak error → tidak masuk `SKIP_ALLOWLIST` → tidak
   HARD FAIL), lalu 167 **no-op senyap**. Hasil: **GL tenant-blind di CI/produksi**
   tanpa satu pun pesan galat. Diajukan sebagai R-001.
2. **Seluruh seri GL (167–174) belum ter-merge ke `main`** — hanya ada di branch
   `fix/search-proyek-gagal-senyap` (8 commit, 3.890 baris), padahal tabelnya sudah
   di-apply ke DB dev bersama. Branch Fase 0 saya rebase ke sana agar tidak
   membangun di atas baseline palsu.
3. **Jumlah trigger: 156 (`public`), 175 (semua schema).** Angka 192 di audit saya
   tidak cocok dengan keduanya. Ada schema `mut6` berisi 14 trigger — sisa
   mutation-test yang menggantung di DB dev.
4. `.env` diawali **BOM** dan nilainya dibungkus tanda kutip — dua jebakan parser
   yang kini ditangani terpusat di `_koneksi.mjs`.

### Yang berubah dari rencana

Fase 0 ternyata harus mencakup **rebase ke branch yang benar** — tidak terduga,
tapi wajib: tanpa itu seluruh pengukuran Fase 0 dilakukan atas pohon kode yang
tidak memuat GL, sementara DB-nya memuat GL. Persis kelas kesalahan C-1.

### F0-4 — jaring pengaman rollback: saya salah DUA KALI, dengan cara berbeda

Audit saya menulis "cacat bootstrap harness, bukan produksi" sebagai kesimpulan
padahal itu hipotesis (C-4). Hari ini saya mengukurnya, dan hipotesis itu **salah** —
tapi kesimpulan turunannya ("bukan cacat produksi") ternyata **benar karena alasan
yang berbeda**. Keduanya perlu dicatat supaya tidak diklaim sebagai tebakan beruntung.

**Bukti yang dikumpulkan:**

1. Dijalankan sendirian, `multitenant-t3-rollback.test.ts` **LULUS 23/23**, tiga kali
   berturut-turut. Jadi bukan cacat bootstrap: tabel `assembly_components` memang
   terbentuk dengan benar oleh `bootstrap()`.
2. Dijalankan sebagai bagian suite penuh hari ini: **129/129 berkas lulus,
   1299 lulus, 0 gagal, 217,4 detik.** Kegagalan kemarin **tidak reproduksi**.
3. Akarnya ada di `test-utils/test-db.ts` dan **sudah terdokumentasi di sana**:
   27 berkas test berbagi satu schema `test`, dan `resetTestSchema()` melakukan
   `DROP SCHEMA … CASCADE` yang butuh ACCESS EXCLUSIVE lock. Koneksi berkas test
   sebelumnya kadang belum lepas di sisi server (pooler session-mode menutup
   asinkron), sehingga DROP menunggu dan hook timeout menembak duluan. Komentar di
   kode menyebut frekuensinya "intermiten, ~30-50% run penuh".

**Jadi:** ini **flake infrastruktur test yang sudah dikenal**, bukan cacat produksi
dan bukan cacat bootstrap. Yang salah dari audit saya bukan verdict akhirnya,
melainkan **saya menyatakannya tanpa mengukur** — dan kebetulan-benar adalah
kegagalan metode, bukan keberhasilan.

**Konsekuensi yang belum selesai:** `F0-4` TIDAK saya tutup. Suite yang lulus
sekali tidak membuktikan flake-nya hilang; ia hanya tidak muncul hari ini. Kriteria
selesainya diperketat menjadi: *lulus 3 run penuh berturut-turut* + *test rollback
untuk tiap tipe migrasi tenancy*. Sisanya dikerjakan sebelum Fase 2, karena Fase 2
justru yang paling bergantung pada jaring ini.

**Temuan turunan:** jumlah "skipped" ikut berubah antar-run (24 → 1). Dua puluh tiga
di antaranya adalah test milik berkas yang gagal, bukan test yang sengaja di-skip.
Angka "24 skipped" di laporan audit karenanya menyesatkan; yang benar-benar
di-skip secara sengaja hanya **1** (`golden-cibuluh` — pasangan `skipIf` yang memang
mati saat berkas golden-nya ada).

### F0-5 — coverage: skor Testing 80 akhirnya dibayar (C-6)

Diukur pertama kali: **statements/lines 31,98%**, branches 68,49%, functions 81,96%.
Yang mengkhawatirkan bukan angkanya melainkan **sebarannya**: 27 berkas route
ber-coverage NOL, termasuk `users.ts`, `notifications.ts`, `documents.ts`,
`audit.ts`, dan `companies.ts` (inti multi-tenant). Jalur uang tipis:
`penalty.ts` 4,2%, `kasbon-limit.ts` 5,3%.

Membangun ratchet-nya justru menemukan dua cacat pada penjaga itu sendiri:

1. **Tanpa toleransi, penjaga jadi cerewet.** v8 bergoyang antar-run
   (branches 68,49 → 68,48). Penjaga yang berteriak untuk 0,01% akan dimatikan orang.
2. **Penjaga bisa berbohong.** Run `src/lib` saja menghasilkan statements 8,57%
   terhadap lantai 31,98% → vonis "TURUN" **palsu**. Sidik cakupan yang benar
   adalah **baris tereksekusi** (1.821 vs 6.794), bukan jumlah berkas — v8 tetap
   mendaftar semua berkas yang di-`include` walau nol tercakup, sehingga jumlah
   berkas nyaris tak berubah. Ratchet kini MENOLAK membandingkan (exit 2) alih-alih
   memberi vonis palsu.

### F0-7 — golden file: hipotesis saya sendiri gugur (C-5)

Saya menduga selisih angka berasal dari "dua berkas Cibuluh berbeda". **Salah.**
`.xls` dan `.xlsx` isinya identik — 22 sheet sama, nilai di sel sama; `.xlsx` hanya
hasil simpan-ulang. Jadi bukan itu penjelasannya.

`1.657.839.590,39` **tidak ada** di kedua berkas, seluruh 22 sheet. Semua angka
1–9 miliar disapu; terdekat `1.642.531.571` (subtotal Pekerjaan Beton), selisih
15,3 juta — bukan PPN, bukan PPh, bukan pembulatan. `109,5` dan `7875` juga nihil.

**Yang sengaja tidak saya lakukan:** menambahkan assertion untuk ketiganya.
Mengunci angka yang sumbernya tak diketahui = menjadikan tebakan sebagai kebenaran,
persis kelas kesalahan yang Fase 0 ada untuk memberantasnya. → R-005.

### F0-9 — penjaga penomoran migrasi

171 berkas, nomor tertinggi 174, lompatan lama 30/59/64 (059 = `seed_dummy_data`;
030 & 064 tak pernah ada di histori git). Lompatan lama dikecualikan **beserta
alasannya**; yang dijaga lompatan baru dan nomor ganda. Diuji dua arah.

Alasan nomor ganda berbahaya bukan estetika: `ci-project-setup` mencatat keduanya
sebagai satu versi, sehingga yang kedua **dilewati senyap selamanya** — mekanisme
yang sama persis dengan cacat P0 047↔167.

### Temuan proses: CI tidak berjalan untuk PR bertumpuk

PR #134 dibuat menargetkan `fix/search-proyek-gagal-senyap` (PR #133), bukan `main`,
karena seri GL 167–174 belum ter-merge. Akibatnya **nol check berjalan**:
`ci.yml` hanya ter-trigger pada `pull_request.branches: [main]`.

Ini konsekuensi nyata dari R-003 yang tak saya antisipasi. Selama rantai PR belum
sampai ke `main`, **CI tidak memverifikasi apa pun** — dan mengklaim "CI hijau"
dalam kondisi itu akan jadi persis jenis klaim tak berdasar yang CHARTER §7 larang.

Sebagai ganti, seluruh langkah CI dijalankan **lokal**, dan hasilnya ditempel:
13 penjaga exit 0 · api `lint:ratchet` 0 error / `tsc` exit 0 / `build` exit 0 ·
web `lint:ratchet` 0 error / `tsc` exit 0 · suite penuh 3 run berturut hijau.

`F0-3` karenanya tetap **wip**, bukan done: kriteria "penjaga CI hijau" baru
benar-benar terpenuhi saat rantai PR di-merge ke `main`.

### Status gerbang Fase 0 — BELUM hijau penuh (dinyatakan jujur)

Selesai: F0-1, F0-2, F0-5, F0-6, F0-7, F0-9.
Belum: **F0-3** (penjaga docs jalan, CI penuh belum diverifikasi end-to-end),
**F0-4** (3 run berturut hijau, tapi isolasi schema per-berkas + rollback tiap
tipe migrasi tenancy belum dibangun).

Sesuai CHARTER §3, Fase 1 **tidak** dimulai sebelum keduanya tuntas.

### Menunggu di RATIFIKASI

- **R-001** 🔴 P0 — tabrakan GL 047↔167 (G-2). Memblokir pekerjaan GL apa pun.
- **R-002** — pencatatan 12 migrasi ke buku (G-2; harus SETELAH R-001).
- **R-003** — bekerja di atas `fix/search-proyek-gagal-senyap`, bukan `main`.
- **R-004** — penarikan rekomendasi `rekonsiliasi --tulis`.
- **R-005** — 3 angka jangkar golden file tak dikenali sumbernya (pertanyaan, tidak memblokir).
- **F0-8** — pembersihan schema `mut6` dari DB dev (G-2).
