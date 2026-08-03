# 01 — INVENTARISASI FAKTUAL

Semua angka di bawah berasal dari perintah yang dijalankan 2026-08-02, bukan dari dokumen.

## 1.1 Struktur & skala

| Area | File | LOC | Perintah |
|---|---:|---:|---|
| `apps/api` | 531 | 104.267 | `find … -name '*.ts' \| wc -l` + `cat \| wc -l` |
| `apps/web` | 234 | 87.696 | idem |
| `apps/mobile` | 20 | 2.261 | idem |
| `packages/shared` | **0** | **0** | idem — paket terdaftar di workspace tapi **kosong** |
| `db` | 173 | 23.004 | idem |
| `e2e` | 2 | 278 | idem |
| `scripts` (root) | 2 | 203 | idem |
| **TOTAL kode** | **~962** | **~217.700** | |

`packages/shared` = 0 file. CLAUDE.md mendaftarkannya sebagai "Types & constants bersama". **Yatim.**

## 1.2 Migrasi

- Berkas di `db/migrations/`: **174** (`001` … `174_gl_menu_ke_halaman_nyata.sql`)
- Berkas di `supabase/migrations/`: **158** — **selisih 16 berkas** vs `db/migrations`
- Tercatat di `supabase_migrations.schema_migrations`: **160 baris**, versi tertinggi **162**
- Migrasi 163–174 (12 berkas) **tidak tercatat di buku**, tetapi objeknya **ADA** di DB
  (diverifikasi langsung: `accounts` 38 baris, `journal_entries`, `journal_entry_lines` semua `EXISTS`).

Artinya: buku migrasi **meleset ~12 versi terhadap kenyataan**. Repo sudah punya alat
sadar-masalah untuk ini: `apps/api/scripts/rekonsiliasi-schema-migrations.mjs`
(mode baca-saja secara default), yang melaporkan 6 "TERBUKTI JALAN tapi tak tercatat".

## 1.3 Database dev (live introspection)

| Metrik | Nilai | Query |
|---|---:|---|
| Tabel `public` (BASE TABLE) | **122** | `information_schema.tables` |
| Tabel dengan RLS aktif | **122 / 122 (100%)** | `pg_class.relrowsecurity` |
| Policy RLS | **375** | `pg_policies` |
| Index | **505** | `pg_indexes` |
| Trigger (non-internal) | **192** | `pg_trigger WHERE NOT tgisinternal` |
| Kolom `timestamp` | **249, seluruhnya `timestamptz`** | `information_schema.columns` |
| Kolom `double precision`/`real` | **0** | idem |
| Tabel ber-`company_id` | **42 / 122 (34%)** | idem |

Dua temuan positif yang jarang: **nol kolom float** (uang aman dari galat biner) dan
**100% `timestamptz`** (nol ambiguitas zona waktu).

## 1.4 API & Frontend

| Metrik | Nilai |
|---|---:|
| File route (`apps/api/src/routes/v1`) | **49** |
| Deklarasi endpoint (`.get/.post/.put/.patch/.delete`) | **198** (205 termasuk non-v1) |
| Endpoint **tanpa** `preHandler` dalam 14 baris | **5** (semuanya publik by design — lihat 04) |
| Pemakaian `requirePermission` | **286** |
| Halaman Next.js (`page.tsx`) | **59** |
| Komponen (`apps/web/components/*.tsx`) | **36** |
| File test | **211** total; **81** di `routes/v1/__tests__` |

## 1.5 Dependency

| Paket | deps | devDeps |
|---|---:|---:|
| root | 0 | 1 |
| `apps/api` | 17 | 13 |
| `apps/web` | 17 | 16 |

`pnpm audit`: **`{"info":0,"low":0,"moderate":1,"high":0,"critical":0}`** — 1 moderate, nol high/critical.
Jumlah dependency sangat ramping untuk ERP sebesar ini (34 runtime deps total).

## 1.6 Dokumentasi

- Total `.md` (exclude `node_modules`, `graphify-out`): **584**
- **Namun** `.worktrees/docs-protokol/` dan `.worktrees/warm-clay-design-system/`
  menduplikasi **seluruh pohon `docs/`** (48 + 32 + 27 … berkas). Duplikat ini
  **bukan** dokumen aktif, tapi ikut terbaca oleh `grep`/agent → sumber halusinasi.
- `.md` di luar worktree: `docs/` (13 di akar) + 7 di root repo + subfolder spesifikasi.

## 1.7 Hal yang tidak bisa diverifikasi

- **File terbesar / top-15 LOC**: tidak dijalankan sebagai daftar terurut penuh — dilewati
  demi anggaran waktu audit. `BELUM DIVERIFIKASI`.
- **Dependency terpasang tapi tak pernah di-import**: `BELUM DIVERIFIKASI` — butuh
  `depcheck`/`knip` yang tidak boleh di-install (aturan read-only).
- **Ukuran repo (byte)**: `BELUM DIVERIFIKASI`.
- **Outdated mayor**: `BELUM DIVERIFIKASI` — `pnpm outdated` tidak dijalankan.
