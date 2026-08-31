# LEDGER-DIFF — Buku Migrasi vs Artefak Fisik

**Alat:** `node scripts/db/ledger-diff.mjs`
**Sifat:** BACA SAJA. Alat ini tidak punya flag `--tulis`. Menulis ke buku migrasi
adalah Gerbang Keras **G-2** dan wajib lewat `RATIFIKASI.md`.

## ⚠ Angka di dokumen ini BUSUK — ukur sendiri

Versi sebelumnya memuat tabel ringkasan bertanggal 2026-08-02: 171 berkas
migrasi, 15 `TERCATAT-TAPI-ARTEFAK-HILANG`. **Ketiga angka itu sudah salah
sebelum siapa pun menyadarinya.** Diukur 2026-08-31 — 29 hari kemudian:

```
berkas migrasi                    171  →  518
TERCATAT-TAPI-ARTEFAK-HILANG       15  →   25
PERLU-MATA-MANUSIA                 12  →  152
```

Sebelas versi baru masuk kategori "artefak hilang" tanpa ada yang tahu, karena
`ledger-diff` **exit code-nya 0** — ia melaporkan, ia tak pernah merah.

Aturannya sama dengan pembuka `CLAUDE.md`: **kalau sebuah fakta bisa basi,
jangan tulis faktanya — tulis cara mengukurnya.**

```bash
node scripts/db/ledger-diff.mjs        # verdict lengkap, JSON
```

## ⚠ "ARTEFAK HILANG" ≠ "MIGRASINYA TIDAK JALAN"

Ini salah baca yang paling mahal di dokumen ini, dan saya hampir melakukannya
2026-08-31: kesebelas versi baru itu **artefaknya ADA SEMUA**. Diperiksa satu
per satu ke basis:

| Versi | Artefak yang dicari | Ada? |
|---|---|---|
| 006 | `invoices`, `payments` | ✅ 2 tabel |
| 238 | `gudang`, `assets.gudang_id`, `assets_lokasi_tunggal`, 2 kolom `asset_movements` | ✅ keempatnya |
| 258 | tabel `wa_*` | ✅ 8 |
| 301 | tabel markup/margin | ✅ 1 |
| 373 | policy `tenant_isolation` | ✅ 266 |
| 374 | `cbs_*` RESTRICTIVE | ✅ 2 |
| 414 | tabel pengingat | ✅ 1 |
| 437 | tabel subkon | ✅ 4 |
| 447 | kolom PKP/efaktur | ✅ 3 |
| 450 | tabel klausul | ✅ 1 |
| 519 | pagar 3 tabel turunan | ✅ 3 RESTRICTIVE |

Jadi verdict "hilang" di sini berarti **pemindainya tak mengenali bentuk
artefaknya**, bukan bahwa migrasinya tak berjalan.

⚠ Dan satu jebakan yang saya masuki sendiri saat memeriksa: probe pertama saya
untuk 238 mencari tabel bernama `%lokasi%` dan memulangkan **0**, lalu saya
sempat menulis "1 benar-benar kosong". Migrasi 238 membuat tabel bernama
**`gudang`** — tebakan sayalah yang salah, bukan basisnya. **Nol hasil bukan
bukti ketiadaan**; periksa dulu apa yang sungguh dibuat migrasinya
(`grep 'CREATE TABLE\|ADD COLUMN' db/migrations/238_*.sql`).

Verdict yang bisa dipercaya untuk "apakah migrasi X benar-benar jalan" adalah
**artefak fisiknya terbukti ada** — bukan nama yang ditebak.

## Koreksi metodologi (cacat C-3)

Alat lama (`rekonsiliasi-schema-migrations.mjs`) menurunkan "objek yang dijanjikan"
lewat regex atas teks SQL. Regex itu **buta terhadap DDL di dalam blok
`DO $$ … $$` dan `EXECUTE format(…)`**. Karena migrasi 163–174 seluruhnya memakai
blok dinamis, alat lama menggolongkannya "tak bisa dibuktikan" lalu — pada
sebagian kasus — melaporkannya sebagai **TERBUKTI JALAN** hanya karena daftar
janjinya kosong.

Rekomendasi audit 2026-08-02 untuk menjalankan `--tulis` atas dasar itu **DITARIK**.
Alasannya: buku migrasi menentukan apa yang di-*replay* `ci-project-setup.mjs`.
Satu entri palsu "sudah jalan" membuat migrasi **dilewati senyap selamanya** di
setiap lingkungan baru, termasuk produksi, tanpa gejala apa pun.

Alat baru menandai migrasi ber-DDL-dinamis sebagai `PERLU-MATA-MANUSIA` dan
**tidak pernah** memberi verdict hijau otomatis. Ragu = tidak hijau.

## 🔴 TEMUAN P0 — Tabrakan definisi GL (047 vs 167)

**Ini temuan terpenting Fase 0, dan tidak terlihat pada audit sebelumnya.**

| | Migrasi 047 | Migrasi 167 |
|---|---|---|
| Status di buku | **TERCATAT (dianggap sudah jalan)** | tidak tercatat |
| Artefak di dev | **HILANG** (9 objek) | **ADA** |
| `company_id` | **0 kemunculan** — single-tenant | **18 kemunculan** — tenant-aware |
| Kolom tipe akun | `account_type` | `type` |

Skema `accounts` yang **nyata hidup di dev** adalah desain **167**
(`company_id`, `type`) — terverifikasi lewat `introspect columns`.

### Kenapa ini berbahaya

`ci-project-setup.mjs` menerapkan migrasi **berurutan pada schema yang di-wipe**.
Pada lingkungan baru (CI, dan kelak produksi):

1. Migrasi **047** jalan lebih dulu → membuat `accounts` versi **single-tenant**.
   SQL-nya valid, jadi tidak error, jadi **tidak masuk `SKIP_ALLOWLIST`** dan
   tidak memicu HARD FAIL.
2. Migrasi **167** menyusul dengan `CREATE TABLE IF NOT EXISTS accounts` (baris 52)
   → karena tabelnya sudah ada, perintah ini **no-op senyap**.
3. Hasil akhir: **GL di CI/produksi tenant-blind**, sementara dev tenant-aware.

Ini persis kelas cacat yang paling ditakuti: **tidak ada pesan galat, tidak ada
test merah, dan baru terlihat ketika perusahaan kedua melihat jurnal perusahaan pertama.**

`[FIX-LATER → dinaikkan ke P0]` Belum diperbaiki di sesi ini — perbaikannya
menyentuh berkas migrasi bernomor yang sudah tercatat, sehingga tunduk G-2.
Diajukan di `RATIFIKASI.md` sebagai **R-001**.

## Daftar `TERCATAT-TAPI-ARTEFAK-HILANG` (15)

| Versi | Artefak hilang | Penilaian awal |
|---|---:|---|
| 002 | 1 (`idx_users_role`) | Wajar — kolom `role` di-drop oleh migrasi FK role (1B.4). Index ikut hilang. **Benign.** |
| 012, 014, 015, 016 | 3 tiap | Policy di schema **`storage`**, bukan `public`. Di-supersede 097/098. Sebagian ada di `SKIP_ALLOWLIST`. **Perlu cek terpisah** — alat ini hanya memindai `public`. |
| 043 | 5 | Forward-draft; `project_rab_materials` ada tapi fungsi/index tidak. **Perlu mata manusia.** |
| 044 | 6 (`field_opname_reports` dst.) | Tabel **tidak ada**. Forward-draft yang tak pernah di-apply tapi **tercatat**. Kelas cacat 043–047. |
| 045 | 7 | `assets` ada, index tidak. **Perlu mata manusia.** |
| **047** | **9** | **P0 — lihat di atas.** |
| 049 | 54 | Di-*contract*/dihapus migrasi **071** secara sadar (RLS literal-role → permission-based). **Benign & terdokumentasi.** |
| 081, 093 | 21 tiap | Workflow engine **sengaja dipensiunkan** oleh **ADR-006**. **Benign & terdokumentasi.** |
| 097, 098 | 3 & 2 | Policy schema `storage`. **Perlu cek terpisah.** |
| 127 | 3 index | Sebagian index tenancy tak terbentuk. **Perlu mata manusia** — relevan untuk Fase 2. |

## Daftar `PERLU-MATA-MANUSIA` (12) — semuanya tidak di buku

`163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174`

Semua memakai DDL dinamis (`DO $$`/`EXECUTE`). **Tidak diberi verdict otomatis.**
Bukti fisik parsial yang sudah terverifikasi manual lewat `introspect`:

- `accounts` **ADA**, berisi **38 baris** (cocok dengan klaim seed migrasi 170).
- `journal_entries`, `journal_entry_lines` **ADA**, 0 baris.

Artinya seri GL **memang pernah dijalankan ke dev**, hanya bukunya yang tak dicatat.
Namun pencatatannya **tetap tidak boleh dilakukan** sebelum tabrakan 047↔167 selesai —
mencatat 167 sebagai "sudah jalan" tanpa menyelesaikan 047 justru mengunci cacat P0.

## Tindakan yang TIDAK diambil (sengaja)

- ❌ Tidak menulis satu baris pun ke `supabase_migrations.schema_migrations`.
- ❌ Tidak mengubah berkas migrasi mana pun.
- ❌ Tidak menjalankan `--tulis` pada alat lama.

Semuanya tunduk G-2 dan menunggu ratifikasi. Pekerjaan lain di antrean tetap jalan.
