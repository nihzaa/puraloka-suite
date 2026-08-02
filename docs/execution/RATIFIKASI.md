# RATIFIKASI — Satu-satunya Berkas yang Perlu Dibaca Founder

**Cara membaca:** tiap entri adalah keputusan yang sudah diambil dan/atau sudah
dijalankan. **Diam berarti setuju.** Untuk membatalkan, tulis `TOLAK` + alasan di
bawah entrinya.

---

# ✅ B-1 & B-2 SELESAI — repo dijadikan publik (keputusan founder 2026-08-03)

Anda memilih opsi B. **Keduanya langsung teratasi**, dan keduanya sudah terbukti
bekerja — bukan diasumsikan.

## Pemeriksaan keamanan SEBELUM repo dibuka

Menjadikan repo publik tak bisa dibatalkan secara praktis: seluruh histori jadi
permanen terlihat dan bisa disalin siapa pun. Audit sebelumnya hanya memindai
berkas ter-track di HEAD, **belum pernah** `git log -p`. Jadi itu dijalankan dulu:

| Yang dicari di SELURUH histori | Hasil |
|---|---|
| Berkas `.env` pernah ter-commit | **tidak pernah** (hanya `.env.example`) |
| Kunci JWT/Supabase (`eyJ…`) | **0** |
| `sb_secret_` / `sbp_` | **0** |
| Connection string ber-password | hanya placeholder `[YOUR-PASSWORD]` |
| VAPID private key | hanya `your_vapid_private_key_here` |
| Token GitHub/Slack/AWS/OpenAI | **0** |

Satu hal yang memang terbuka: **ref project Supabase dev** (`tgozokxyvwmyvajgqfxw`)
muncul di 13 berkas. Itu **bukan kredensial** — dan tidak bisa dipakai tanpa kunci:
anon/publishable key tidak pernah ter-commit, dan **RLS aktif di 122/122 tabel**.
Risikonya rendah; yang terekspos hanyalah *nama* infrastruktur, bukan aksesnya.

## B-1 — Actions kini benar-benar berjalan

Sebelum: job selesai 2–12 detik, `steps: []`, `runner_name: ""`, log 22 byte.
Sesudah (run 30759365545): berjalan **~2,5 menit**, runner ditugaskan
(`GitHub Actions 1000000967`), **32 langkah** dieksekusi.

**4 dari 5 job HIJAU** — Web, Dokumentasi, Keamanan, Browser. Satu gagal, dan
justru itu yang berharga (lihat R-001 di bawah).

## B-2 — Branch protection aktif dan TERBUKTI memblokir

```
strict: true · 5 check wajib · force_push: false · deletions: false
```

Bukti ia benar-benar bekerja, bukan sekadar terpasang: PR #133 yang CI-nya merah
berubah status dari `MERGEABLE` → **`BLOCKED`**.

Catatan: `enforce_admins` sengaja **false** — Anda tetap bisa menerobos bila
benar-benar perlu. Bilang saja kalau ingin dikencangkan.

---

# ✅ SUDAH DIJALANKAN — tinggal dikonfirmasi

## R-001 · P0 · SELESAI (opsi A + ketiga syarat)

**Migrasi 047 dipensiunkan** menjadi no-op berkomentar. Berkasnya sengaja tidak
dihapus — nomor 047 sudah tercatat di buku migrasi, menghapusnya membuat buku
menunjuk ke sesuatu yang tak ada.

**Syarat 1 — periksa DB CI lebih dulu. SUDAH DIJALANKAN.**

Begitu Actions hidup, `ci-periksa-bentuk-gl.mjs` dijalankan terhadap project CI
yang sesungguhnya. Hasilnya **membuktikan cacat P0 ini nyata, bukan teoretis**:

```
accounts               ADA · 0 baris · company_id=TIDAK · ⚠️ penanda 047 (account_type)
journal_entries        ADA · 0 baris · company_id=TIDAK
journal_entry_lines    ADA · 0 baris · company_id=TIDAK
buku migrasi: 047=TERCATAT · 167=tidak

VERDICT: C. ⚠️ `accounts` memakai bentuk 047 (TANPA company_id) — GL TENANT-BLIND.
```

Persis skenario yang saya perkirakan sesi lalu: **047 menang, 167 dilewati diam-diam.**
Dan CI utama gagal dengan galat yang sama akarnya:

```
HARD FAIL — migrasi GAGAL di LUAR allowlist: 167_gl_chart_of_accounts.sql
  column "company_id" does not exist
```

Karena verdict = kondisi C, fallback yang Anda tetapkan dijalankan:
**reset CI dari nol** (`-f action=setup-clean`). Aman — ketiga tabel berisi
**0 baris**, jadi nol data hilang.

Hasil reset: WIPE berhasil, replay berjalan, dan **047 + 167 + 175 LULUS
seluruhnya** (replay lolos melewati migrasi 125+). Perbaikan R-001 **terbukti
bekerja di lingkungan bersih** — bukan hanya di dev.

Replay kemudian berhenti di migrasi **137**, karena sebab yang sama sekali
berbeda dan sudah ada sebelum R-001 → lihat **F0-12** di bawah.

**Syarat 2 — migrasi penegas bentuk.** `175_gl_penegas_bentuk.sql`: gagal keras
bila `accounts` tanpa `company_id` atau masih punya `account_type`. Sengaja
**tidak menambal sendiri** — bila tabel sudah berisi baris dua perusahaan, tidak
ada cara mekanis memisahkannya (ADR-011).

Membangunnya menemukan **tiga cacat pada penegas itu sendiri**, semuanya ketahuan
karena diuji, bukan karena dibaca ulang:
1. Terlalu ketat — menuntut `company_id` di `journal_entry_lines`, padahal 167
   sengaja memberinya tenancy lewat induk. Penjaga yang salah melatih orang
   mengabaikan kegagalannya.
2. Buta schema — `to_regclass('public.…')` selalu memeriksa `public`. Uji negatif
   membuktikan ia **lolos** padahal bentuknya 047.
3. Pesan galat rusak (`malformed array literal`) sehingga diagnosisnya tertutup.

Uji akhir: positif (dev) LULUS · negatif (bentuk 047 di schema sementara) MENOLAK.

**Syarat 3 — sapu seluruh 171 migrasi.** `audit-tabrakan-definisi-tabel.mjs`
menemukan **13 tabel bertabrakan**. Kabar baiknya: **047↔167 satu-satunya yang
tak terjaga**. Yang lain sudah aman — dan `assets` (045↔149) menarik: repo ini
**sudah pernah** menyelesaikan cacat yang sama persis, lengkap dengan komentarnya.
Perbaikan R-001 mengikuti preseden itu.

Penjaga baru terpasang di CI: `CREATE TABLE IF NOT EXISTS` pada tabel yang punya
lebih dari satu pendefinisi wajib disertai penegas bentuk.

**Cara membatalkan:** `git revert` — hanya menyentuh berkas migrasi & skrip.
Belum ada data produksi, biaya pembatalan **nol**.

## R-003 · Rebase diterima; TIDAK merge ke main sebelum R-001 tuntas

Dipatuhi. Urutan yang Anda tetapkan (perbaiki pemicu CI → R-001 → baru merge)
diikuti. Rantai PR belum di-merge.

Catatan: langkah "baru merge" **tertahan B-1** — tanpa Actions, merge ke `main`
berarti menggabungkan tanpa verifikasi apa pun.

## R-004 · Penarikan rekomendasi `rekonsiliasi --tulis`

Berlaku. Penggantinya `ledger-diff.mjs` tanpa kemampuan menulis sama sekali.

## R-005 · TERJAWAB — saya salah, Anda benar menyuruh menyapu lebih luas

Sesi lalu saya menyimpulkan ketiga angka "hampir pasti bukan dari Cibuluh" lalu
berhenti. Kesimpulan yang benar: **belum saya cari di berkas lain.**

Disapu ke seluruh `_source/ahsp/`. **Ketiganya ketemu**, di
`Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm`:

| Angka | Lokasi | Makna |
|---|---|---|
| `1.657.839.590,39` | `REKAPITULASI!E15` | **TOTAL BIAYA** proyek (sebelum PPN) |
| `109,5` | `LAPORAN RAB!H114` | **volume m²** bata merah ½ batu |
| `7875` | `DINDING BATA MERAH!L41` | **jumlah buah** bata merah |

Terverifikasi silang: `109,5 × 146.308,162 = 16.020.743,74` ✅

**Kenapa berbeda dari Cibuluh:** dua proyek yang berbeda. Cibuluh = RAB gudang
nyata (Rp 3,63 M, 9 divisi). RAB Control = Engineering Estimate template SE-47
(Rp 1,66 M, 8 divisi). Bukan beda edisi, bukan subtotal-vs-total, bukan PPN.

**Temuan sampingan yang berguna:** baris PPN di dokumen itu berlabel **"PPN 11%"**
tapi pengalinya **0,12**, dan hasilnya cocok. Jadi model dua-angka yang dipakai
sistem memang **berasal dari praktik dokumen nyata** — bukan karangan.

Assertion belum ditambahkan (butuh harness `.xlsm` 117 sheet) → antrean F0-10.

## R-006 · `companies.ts` masuk gerbang Fase 1

Perintah Anda dilaksanakan: `F1-8` di `QUEUE.yaml`. **Fase 2 tidak dimulai
sebelum `companies.ts` punya coverage nyata**, termasuk uji 403 lintas-tenant.

---

# 🔴 TEMUAN BARU — F0-12 · rantai migrasi tak bisa di-replay dari nol

Ditemukan saat menjalankan `setup-clean` untuk R-001. **Bukan akibat perubahan
R-001** — justru sebaliknya, 047/167/175 lulus dengan bersih.

```
HARD FAIL — migrasi GAGAL di LUAR allowlist: 137_t9_pemilik_grup.sql
  137: 1 akar grup tanpa owner_user_id. Grup itu tak akan bisa menambah
       badan usaha baru dari UI.
```

**Akarnya, dilacak sampai selesai:**

1. Migrasi **126** membuat perusahaan pertama, mengisi `created_by` dari `v_admin`
   = "admin aktif tertua". Di database yang **baru di-wipe belum ada user sama
   sekali** — seed dijalankan **setelah** semua migrasi. Jadi `v_admin` = NULL.
2. Migrasi **137** mengisi `owner_user_id` dari `COALESCE(created_by, admin-tertua)`.
   Keduanya NULL.
3. Penjaga di 137 melempar — **dan itu benar**. Grup tanpa pemilik memang tak bisa
   menambah badan usaha lewat UI, dan tak ada jalan memperbaikinya dari dalam aplikasi.

**Penjaga 137 tidak boleh dilemahkan.** Yang salah bukan penjaganya, melainkan
urutan seed-vs-migrasi.

**Kelas cacatnya sama persis dengan 047:** hanya muncul di lingkungan yang dibangun
dari nol, tak pernah terlihat di dev yang tumbuh bertahap. Ini kedua kalinya dalam
satu sesi pola yang sama muncul — dan keduanya hanya ketahuan karena ada yang
benar-benar mencoba membangun ulang dari kosong.

**Belum saya perbaiki**: di luar cakupan yang Anda ratifikasi, dan perbaikannya
menyentuh urutan bootstrap yang punya beberapa pendekatan sah (seed user minimal
sebelum 126 · buat user sistem di 126 · longgarkan 137 untuk DB kosong). Masuk
antrean **F0-12**; saya kerjakan setelah ini kalau tak ada arahan lain.

---

# ✅ R-002 · SELESAI — 12 migrasi dicatat, semuanya terbukti fisik

Dijalankan setelah R-001 tuntas, persis urutan yang Anda tetapkan.

**Buku migrasi: 160 → 172 baris tercatat.**

Tiap baris dibuktikan dengan kueri katalog yang ditulis dan diperiksa **manusia**,
satu per satu, terhadap nama objek yang benar-benar ada di berkas migrasinya —
bukan diturunkan regex. Itu penting: seluruh migrasi 163–176 memakai DDL dinamis
(`DO $$`/`EXECUTE`), yang justru membuat parser lama menghasilkan verdict palsu
(cacat C-3).

Proses manual itu sendiri menangkap **dua kesalahan tebakan saya**: artefak 164
dan 174 sempat saya laporkan "tak ada" hanya karena saya menebak nama objeknya
salah. Kalau saya percaya tebakan pertama, dua migrasi yang nyata-nyata sudah
berjalan akan tercatat sebagai belum.

| Migrasi | Bukti fisik |
|---|---|
| 163 | body `trigger_calc_invoice_amount_due()` memuat `GREATEST(0,…)` |
| 164 | `trg_kasbon_approved_create_expense` + `trg_settle_borongan_deduct_cash` |
| 165 | fungsi kasbon→expense sadar-schema |
| 166 | trigger `protect_*_created_at` terpasang kembali |
| 167 | `accounts.company_id` (bentuk tenant-aware) |
| 168 | `fn_gl_wajib_seimbang()` + `trg_gl_wajib_seimbang` |
| 169 | constraint `posted_at` pada `journal_entries` |
| 170 | baris CoA ter-seed di `accounts` |
| 171 | permission ber-prefix `gl:` |
| 172 | policy pada `accounts` |
| 173 | policy **RESTRICTIVE** pada `accounts` |
| 174 | menu Buku Besar terdaftar |

**Dua migrasi SENGAJA tidak dicatat**, dan alasannya ditulis di alat supaya tak
dipertanyakan ulang:

- **175** — penegas bentuk. Hanya *memeriksa* dan melempar; **tidak membuat objek
  apa pun**. Tak ada artefak fisik yang bisa jadi bukti, jadi tak boleh diklaim terbukti.
- **176** — belum pernah dijalankan ke dev (`trg_isi_pemilik_grup_yatim` tidak ada
  di katalog). Mencatatnya berarti migrasi itu **dilewati selamanya**.

Alatnya (`scripts/db/catat-migrasi-terbukti.mjs`) **menolak menulis** bila ada
satu saja baris yang tak terbukti — bukan menulis sebagian lalu melapor.

**Cara membatalkan:** `DELETE FROM supabase_migrations.schema_migrations WHERE
version IN ('163',…,'174')`. Reversibel penuh; belum ada produksi.
