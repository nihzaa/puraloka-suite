# CI Isolation — Proyek Supabase CI Terpisah (aksi founder)

**Status:** ⛔ MENUNGGU PROVISIONING FOUNDER. Wiring `ci.yml` + seed skema dikerjakan
setelah 4 secret di bawah tersedia.

## Kenapa

Test handler CECEP memakai klien `service_role` (`apps/api/src/utils/supabase.ts`)
yang **hardcoded ke `public`** proyek dev. Akibatnya setiap run test/CI menulis baris
nyata ke DB **dev** dan menumpuk residu (per 2026-07-25: 263 `estimate_versions`,
285 `estimate_items`, 43+43 lessons, dst). `TEST_SCHEMA=test_<run_id>` hanya
mengisolasi jalur `test-db.ts` (schema-`test`), **bukan** jalur `service_role`.

Founder memilih (2026-07-25): **proyek Supabase CI terpisah** — paling bersih,
dev tak pernah disentuh CI. (Alternatif "schema ephemeral di dev" ditolak karena
tetap satu proyek dengan dev.)

## Yang harus founder lakukan (sekali)

1. Buat proyek Supabase baru, mis. `puraloka-suite-ci` (region bebas; boleh free tier —
   CI hanya butuh Postgres, bukan Auth/Storage).
2. Ambil 4 nilai koneksi proyek CI itu.
3. Set sebagai **GitHub Actions secrets** (Settings → Secrets and variables → Actions),
   dengan **nama baru berprefiks `CI_`** supaya tak menimpa secret dev:

   | Secret baru        | Isi                                               |
   |--------------------|---------------------------------------------------|
   | `CI_SUPABASE_URL`  | Project URL proyek CI                              |
   | `CI_SUPABASE_SECRET_KEY` | service_role key proyek CI                   |
   | `CI_DATABASE_URL`  | Pooler/connection string proyek CI                |
   | `CI_DIRECT_URL`    | Direct connection string proyek CI (port 5432)    |

4. Beri tahu saya sudah selesai.

## Yang SAYA kerjakan setelah secret ada

1. `ci.yml`: ganti env test dari `secrets.SUPABASE_*`/`DIRECT_URL` (dev) ke
   `secrets.CI_*`. Job test tak lagi menyentuh dev.
2. **Seed skema CI**: langkah CI yang menjalankan seluruh migrasi `001…115` ke DB CI
   yang kosong sebelum test (proyek CI mulai kosong; test yang butuh baris referensi —
   users/roles/clients — di-seed minimal oleh langkah ini). Ini menggantikan
   ketergantungan test RLS-harness pada data dev.
3. Verifikasi satu run CI hijau penuh terhadap DB CI, lalu residu dev **berhenti tumbuh**.
4. Baru jalankan cleanup sekali-jalan (lihat di bawah) untuk membersihkan residu lama.

## Cleanup residu lama (item 1b) — SETELAH langkah di atas

Script: `apps/api/scripts/cleanup-cecep-residue.mjs` (sudah ada, teruji dry-run).
- Default **dry-run** (hanya menghitung). Destruktif hanya dengan `--execute`.
- **Dev-only** (menolak koneksi selain proyek dev `tgozokxyvwmyvajgqfxw`).
- Hanya tabel CECEP + smoke; bypass guard **inline**, hanya trigger `*_no_delete`
  spesifik per tabel — **bukan** `session_replication_role` (yang mematikan semua
  trigger termasuk guard finansial).

```bash
cd apps/api
node scripts/cleanup-cecep-residue.mjs            # lihat yang akan dihapus
node scripts/cleanup-cecep-residue.mjs --execute  # hapus (transaksi)
```

Jangan jalankan `--execute` sebelum CI dipisah — run CI berikutnya akan mengotori lagi.
