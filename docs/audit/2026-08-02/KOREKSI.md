# KOREKSI — Angka Audit yang Diverifikasi Ulang

**Dibuat:** 2026-08-02 (Fase 0, butir 0.2)
**Alat tunggal:** `node scripts/db/introspect.mjs` — lihat `scripts/db/_koneksi.mjs`
untuk alasan pemilihan metode koneksi.

**Identitas koneksi saat pengukuran** (dicetak tiap run, inilah yang dulu tidak ada):

```
host               aws-1-ap-southeast-1.pooler.supabase.com:5432
database           postgres
user               postgres
schema             public
server             PostgreSQL 17.6
kolom_terhitung    1563
schema_hash        7a4be5d7d87d9892
```

Determinisme terbukti: tiga run berturut-turut menghasilkan `schema_hash` identik,
dan dua run `tables --json` menghasilkan SHA-256 byte-identik
(`70e228687d26ad5c9adc4ae6d3f36ba263243d6151e549cc22d2aafd2b317d03`).

---

## Tabel koreksi

Format: `klaim lama → angka benar → cara mengukurnya`

| # | Metrik | Klaim audit | **Angka benar** | Cara mengukur | Verdict |
|---|---|---:|---:|---|---|
| 1 | Jumlah tabel `public` | 122 | **122** | `introspect tables` | ✅ **BENAR** |
| 2 | Tabel ber-`company_id` | 42 | **42** (dari 122) | `introspect tenancy-coverage` | ✅ **BENAR** — kini disertai **daftar lengkap 80 tabel yang belum**, yang sebelumnya tidak ada sehingga temuan tak bisa ditindaklanjuti |
| 3 | Tabel dengan RLS aktif | 122/122 | **122/122** | `introspect rls` | ✅ **BENAR** — catatan baru: `relforcerowsecurity` = **0**, artinya pemilik tabel tetap mem-bypass RLS |
| 4 | Jumlah policy | 375 | **375** | `introspect policies` | ✅ **BENAR** |
| 5 | Jumlah index | 505 | **505** | `introspect indexes` | ✅ **BENAR** |
| 6 | **Jumlah trigger** | **192** | **156** (`public`) / **175** (semua schema) | `introspect triggers` & `triggers-all-schemas` | ❌ **SALAH** — lihat §1 |
| 7 | Kolom uang bertipe float | 0 | **0** | `introspect money-types` | ✅ **BENAR** — lihat §2 untuk buktinya |
| 8 | Kolom timestamp | 249, 100% `timestamptz` | **249, 100% `timestamptz`** | `introspect timestamp-types` | ✅ **BENAR** |
| 9 | **Berkas migrasi** | **174** | **171 berkas** (nomor tertinggi **174**) | `introspect migration-ledger` | ❌ **SALAH** — lihat §3 |
| 10 | Migrasi tercatat di buku | 160, tertinggi 162 | **160, tertinggi 162** | idem | ✅ **BENAR** |

**Skor kejujuran audit: 8 dari 10 angka benar; 2 salah.** Dua yang salah keduanya
berasal dari kesalahan metode yang sama — mengukur tanpa menyatakan batas
pengukuran.

---

## §1 — Trigger: 192 → 156 / 175

**Sebab kesalahan.** Audit memakai `SELECT count(*) FROM pg_trigger WHERE NOT
tgisinternal` **tanpa menyaring schema**. Angka itu mencakup trigger milik
Supabase (`storage`, `realtime`) dan — yang paling mengejutkan — schema **`mut6`**.

Sebaran sesungguhnya:

| Schema | Trigger |
|---|---:|
| `public` (aplikasi) | **156** |
| `mut6` | 14 |
| `storage` | 4 |
| `realtime` | 1 |
| **Total** | **175** |

Angka 192 **tidak cocok dengan keduanya**, yang berarti pengukuran audit dilakukan
pada saat schema sementara lain masih ada. Ini justru memperkuat cacat C-1:
pengukuran tanpa identitas koneksi + tanpa `schema_hash` tidak bisa direproduksi
maupun dibantah.

**Temuan turunan (baru):** schema **`mut6` berisi 14 trigger** — sisa mutation-test
yang menggantung di database dev bersama. Masuk antrean sebagai `F0-8`.

## §2 — Bukti "nol kolom float"

Klaim ini benar, dan sekarang bisa dibuktikan alih-alih dipercaya. Alat memindai
**semua** kolom bertipe `double precision`/`real`/`money`, **ditambah** semua kolom
yang namanya menyiratkan uang (`amount|total|price|harga|nilai|biaya|cost|value|saldo|balance|upah|bayar|tarif`).

- Kolom bertipe float/money: **0**
- Kolom bernama-uang yang diperiksa: **116**
- Sebaran tipenya: `numeric` **94**, `uuid` 8, `jsonb` 6, `text` 6, `date` 1, `varchar` 1

Tidak satu pun nominal disimpan sebagai floating point. Kelas galat pembulatan
biner memang tidak ada di sistem ini.

## §3 — Migrasi: 174 → 171 berkas

**Sebab kesalahan — dua lapis, dan lapis kedua serius.**

*Lapis 1:* audit menyamakan "nomor tertinggi" dengan "jumlah berkas". Nomor
tertinggi memang `174`, tetapi jumlah berkas **171** — penomorannya melompat.

*Lapis 2 (jauh lebih penting):* saat memulai Fase 0 saya berpindah ke `main` dan
mendapati hanya **163** berkas. Ternyata **seluruh seri GL (167–174) belum
ter-merge ke `main`** — hanya ada di branch `fix/search-proyek-gagal-senyap`
(8 commit, 3.890 baris), **padahal tabelnya sudah dipasang ke database dev bersama**.

Jadi selama ini ada ketidakcocokan: *kode* di `main` tidak punya GL, *database* dev
punya GL. Audit saya membaca pohon kode dari satu branch dan database dari
kenyataan bersama, tanpa menyadari keduanya berbeda. Inilah bentuk paling murni
dari cacat C-1, dan baru terlihat karena alat baru memaksa identitas dinyatakan.

Diajukan sebagai **R-003** di `RATIFIKASI.md`.

---

## Angka non-DB yang TETAP berlaku

Angka berikut tidak berasal dari introspeksi DB sehingga tidak terpengaruh C-1,
dan tidak diubah:

| Metrik | Nilai | Sumber |
|---|---:|---|
| Endpoint terdaftar | 198 (49 file route) | parser AST-ringan atas `routes/v1` |
| Endpoint tanpa `preHandler` | 5 (semua sah by design) | idem |
| Halaman Next.js | 59 | `find app -name page.tsx` |
| File test | 211 | `find` |
| Hasil test | **1276 lulus / 24 skip / 1 suite gagal**, 213,9 s | run nyata `vitest run` |
| Literal hex di web | 1.039 di 60 berkas | `grep` |
| Role literal sebagai gerbang | 53 | `grep` |
| `any` / `@ts-ignore` | 358 / 130 | `grep` |

---

## Konsekuensi untuk rencana

1. **Daftar 80 tabel tanpa `company_id`** kini tersedia lengkap dan menjadi bahan
   masukan Fase 2 (`introspect tenancy-coverage --json`).
2. **`relforcerowsecurity = 0`** di seluruh 122 tabel — perlu keputusan tersendiri
   di Fase 2: apakah RLS perlu dipaksa juga untuk pemilik tabel.
3. **Schema `mut6`** harus dibersihkan dari dev (G-2 → butuh ratifikasi).
4. **Nomor migrasi melompat** — penjaga penomoran masuk antrean.
