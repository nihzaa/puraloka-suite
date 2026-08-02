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

### Menunggu di RATIFIKASI

- **R-001** — perbaikan tabrakan GL 047↔167 (menyentuh migrasi tercatat → G-2).
- **R-002** — pencatatan 12 migrasi ke buku (harus SETELAH R-001).
- **R-003** — bekerja di atas `fix/search-proyek-gagal-senyap`, bukan `main`.
- **R-004** — penarikan rekomendasi `rekonsiliasi --tulis`.
