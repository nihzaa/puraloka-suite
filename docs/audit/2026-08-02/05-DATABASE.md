# 05 — AUDIT DATABASE & DATA

## 5.1 Angka dasar (live dev, 2026-08-02)

| Metrik | Nilai |
|---|---:|
| Tabel `public` | 122 |
| RLS aktif | 122/122 (100%) |
| Policy | 375 |
| Index | 505 |
| Trigger non-internal | 192 |
| Kolom timestamp | 249 — **100% `timestamptz`** |
| Kolom float (`double precision`/`real`) | **0** |
| Tabel ber-`company_id` | 42 (34%) |

### Uang & waktu — dua hal yang paling sering salah, di sini benar

- **Nol kolom float.** Semua nominal `numeric`. Tidak ada kelas galat pembulatan biner.
- **100% `timestamptz`.** Nol kolom `timestamp without time zone` → tidak ada ambiguitas WIB/UTC.

## 5.2 Buku migrasi vs kenyataan — DRIFT TERKONFIRMASI

| Sumber | Angka |
|---|---:|
| Berkas `db/migrations/` | **174** |
| Berkas `supabase/migrations/` | **158** |
| Baris `supabase_migrations.schema_migrations` | **160** (maks versi **162**) |

**Migrasi 163–174 tidak tercatat di buku, tetapi objeknya nyata ada.**
Dibuktikan langsung, bukan disimpulkan:

```
accounts               EXISTS rows=38
journal_entries        EXISTS rows=0
journal_entry_lines    EXISTS rows=0
submittals             EXISTS rows=0
```

38 baris di `accounts` persis sama dengan klaim commit `9f6261a` ("CoA 38 akun"),
dan seed-nya berasal dari `170_gl_seed_coa_kontraktor.sql`. Jadi **GL-1 nyata hidup**,
bukan klaim kosong.

### Kenapa ini berbahaya (dan repo sudah tahu)

`scripts/ci-project-setup.mjs` memutuskan apa yang perlu dijalankan **murni dari buku ini**.
Buku yang meleset 12 versi berarti alat itu bisa menjalankan ulang migrasi yang sudah jalan —
termasuk yang menulis ulang policy RLS dan melakukan backfill. Komentar di
`rekonsiliasi-schema-migrations.mjs:9-40` mendokumentasikan bahaya ini dengan tepat.

**Status: P1 — sudah dikenali, alat perbaikannya ada, belum dijalankan (`--tulis`).**

### Koreksi atas laporan alatnya sendiri

`rekonsiliasi-schema-migrations.mjs` melaporkan 6 migrasi "TERBUKTI JALAN". Untuk
`167_gl_chart_of_accounts.sql` verifikasi ini **benar** — tabel yang dijanjikan
(`accounts`, `journal_entries`, `journal_entry_lines`) memang ada. Sempat ada dugaan
alat ini melapor palsu; dugaan itu **salah** dan dicabut: penyebabnya nama tabel yang
saya duga (`gl_accounts`) berbeda dari nama sebenarnya (`accounts`).

## 5.3 Kegagalan test = drift schema nyata

Satu suite gagal dari 129:

```
FAIL src/routes/v1/__tests__/multitenant-t3-rollback.test.ts
error: relation "assembly_components" does not exist
  ❯ bootstrap src/routes/v1/__tests__/multitenant-t3-rollback.test.ts:81:3
```

**Namun** `assembly_components` **ADA** di dev (diverifikasi `to_regclass` → `EXISTS`).
Artinya kegagalan bukan "tabel hilang di dev", melainkan test ini membangun schema
terisolasinya sendiri dan **urutan bootstrap-nya tidak menciptakan `assembly_components`**
sebelum `CREATE OR REPLACE FUNCTION fn_assembly_component_parent_draft()` dipanggil.
Ini **cacat harness test**, bukan cacat produksi. `[FIX-LATER]` — P2.

## 5.4 CECEP — kondisi nyata

Tabel yang ADA & terisi:
- `cost_codes` — **44 baris** (registry nyata, bukan tabel kosong)
- `assemblies`, `assembly_components`, `estimate_items`, `estimate_versions`,
  `wbs_nodes`, `cbs_nodes`, `cbs_templates`, `scenarios`, `rap_budget`,
  `rap_labor_line`, `rap_material_line`, `rap_change_log`, `price_book_entries`,
  `productivity_records`, `resources`, `formula_definitions`, `units`,
  `rebar_takeoff`, `steel_profiles`, `material_pack`, `ahsp_editions`,
  `lessons_learned_records`, `lesson_propagation_proposals`, `root_cause_analyses`

**Sumbu edisi (edition axis): ADA** — tabel `ahsp_editions` hadir, dan ada test
khusus `edition-axis.test.ts` yang lulus. Ini menjawab pertanyaan brief: seed AHSP
**tidak** akan merusak apa pun karena sumbunya sudah terpasang lebih dulu.

## 5.5 Golden file — DIJALANKAN, LULUS

Brief menanyakan angka jangkar. Ditemukan di `apps/api/src/lib/ahsp-engine.test.ts`:

```
✓ src/lib/ahsp-engine.test.ts (10 tests) 3ms
✓ src/lib/__tests__/golden-cibuluh.test.ts (6 tests | 1 skipped) 5ms
 Test Files  2 passed (2)
      Tests  15 passed | 1 skipped (16)
   Duration  938ms
```

Assertion nyata yang lulus:
- `ahsp-engine.test.ts:42` — `ΣA=73840, ΣB=179217, D=253057, E=25305.7, F=278362.7, HSP=278300`
- `:50` — `expect(r.hspRounded).toBe(278300)` **EKSAK**
- `:53,58` — `D=242367, E=24236.7, F=266603.7, HSP=266600` **EKSAK**
- `:69,70` — pembulatan `278362.7 → 278300`, `266603.7 → 266600`

Golden Cibuluh (`golden-cibuluh.test.ts`) mengunci `totalBiaya: 3_629_860_295.31`,
`divisi: 9`, `item: 55`, dan `diLuarSubtotal: 37_876_001` (Retaining Wall yang batal).
Berkas sumbernya **ADA** (`_source/ahsp/golden/RAB Gudang Cibuluh Sumedang bobot.xlsx`,
3,5 MB) sehingga `describe.skipIf(!ada)` **aktif menguji**, bukan terlewat.

Angka `1.657.839.590,39` dan `109,5` / `7875` yang disebut brief **tidak ditemukan**
sebagai assertion. `BELUM DIVERIFIKASI` — kemungkinan berasal dari dokumen lain.

## 5.6 Belum diverifikasi

- **Schema diff dev vs CI level kolom**: `BELUM DIVERIFIKASI`. CI memakai project Supabase
  terpisah yang kredensialnya hanya ada di GitHub Secrets; tidak dapat dijangkau read-only
  dari sesi lokal ini.
- **Migrasi 012 (`CREATE POLICY IF NOT EXISTS`)**: `BELUM DIVERIFIKASI` status per-lingkungan.
- Orphan record, FK hilang, nullable-yang-seharusnya-NOT NULL, duplikat: `BELUM DIVERIFIKASI` —
  butuh query integritas per-tabel yang tidak sempat dijalankan.
- Konsistensi filter `is_deleted` di seluruh query: `BELUM DIVERIFIKASI`.
- Kontaminasi seed vs data riil: `BELUM DIVERIFIKASI`.
