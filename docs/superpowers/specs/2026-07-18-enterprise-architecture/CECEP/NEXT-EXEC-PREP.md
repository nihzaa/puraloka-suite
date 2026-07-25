# CECEP — Persiapan Eksekusi (D10 gate · CI isolation · konstanta)

> Disiapkan, BELUM dijalankan. Gerbang founder: wire ci.yml → CI hijau di project CI →
> bukti nol jalur tulis ke dev → BARU cleanup `--execute`. Jangan sentuh seed/DB dulu.

## 1. Gerbang split dpp_factor (D10) — ADR ringkas

**Keputusan:** split PPN satu-fraksi (0,11) → dua-angka (`ppn_rate` 0,12 × `dpp_factor` 11/12)
TIDAK BOLEH dinyalakan pada lingkungan yang punya **invoice PPN nyata** sebelum guardrail
`ppn-dpp-guardrail.test.ts` **dijalankan ulang DI LINGKUNGAN ITU** dan benar-benar memeriksa baris.

**Kenapa:** guardrail (b) di dev **lulus VACUOUS** — dev punya 0 `tax_record` ber-PPN, jadi
regresi tak menguji apa pun. Bukti number-preserving saat ini HANYA dari (a) model-equivalence
(`0,12×11/12 ≡ 0,11` sampai rupiah). Test sekarang **melaporkan "0 record diperiksa" secara
eksplisit** (console.warn VACUOUS) — hijau tak lagi tanpa keterangan. Guardrail permanen di CI.

**Konsekuensi:** saat lingkungan produksi/nyata punya invoice PPN, jalankan guardrail di sana;
kalau (b) memeriksa >0 baris dan hijau → syarat b terpenuhi nyata. Split tetap **per-proyek**
(proyek lama tanda-tangan tak berubah) + menunggu aba-aba founder.

## 2. CI Isolation — project cloud terpisah (`puraloka-suite-ci`, ref `ldsufklhthskrwyzifgh`, Tokyo)

**Region Tokyo (ap-northeast-1) vs dev Singapore: aman** — hanya menambah latensi jaringan test
(beberapa ms/query). Tak ada konsekuensi korektheid; migration & test tak peduli region.

### 2.1 Jenis API key — PAKAI FORMAT BARU `sb_secret_…` (BUKAN legacy JWT)
Diverifikasi: dev memakai `SUPABASE_SECRET_KEY=sb_...` (format "Publishable and secret" baru) dan
`@supabase/supabase-js ^2.107.0` **sudah mendukungnya** (dev jalan di atasnya). Maka:
- `CI_SUPABASE_SECRET_KEY` = ambil **service secret `sb_secret_...`** project CI (API → secret key).
- JANGAN pakai legacy `eyJ...` — supaya sama dengan dev, tak mengejar error auth palsu.

### 2.2 Direct connection kemungkinan IPv6-only → PAKAI SESSION POOLER (IPv4)
Runner GitHub Actions = IPv4. Direct connection Supabase (`db.<ref>.supabase.co:5432`) umumnya
**IPv6-only** (tanpa add-on IPv4). Maka:
- `CI_DIRECT_URL` = **Session Pooler** (host `aws-0-ap-northeast-1.pooler.supabase.com`, **port 5432**,
  user `postgres.ldsufklhthskrwyzifgh`) — IPv4 **dan** mode sesi (dukung DDL/DROP SCHEMA/advisory
  lock yang dibutuhkan migration + rls-harness + drop-test-schema). **JANGAN** Direct (IPv6) dan
  **JANGAN** Transaction pooler 6543 (mode transaksi tak dukung fitur sesi yang test pakai).
- `CI_DATABASE_URL` = boleh sama (Session Pooler 5432) — kode kita tak memakainya di jalur test,
  tapi isi konsisten agar tak membingungkan.
- Ambil string dari dashboard: Database → Connection string → **"Session pooler"** (bukan "Direct",
  bukan "Transaction"). Konfirmasikan port 5432 + host `...pooler.supabase.com` sebelum tempel.

### 2.3 Project bekas rename — VERIFIKASI KOSONG dulu (jalankan SETELAH secret ada)
Sebelum apply migration, script inventaris read-only: daftar schema/tabel/row di `public`.
Kalau ADA sisa → **lapor dulu**, jangan reset/timpa. (Belum bisa dijalankan — butuh CI_DIRECT_URL.)

### 2.4 Bukti isolasi — NOL jalur tulis ke dev dari CI (sweep, bukan pernyataan)
- `grep` `tgozokxyvwmyvajgqfxw` / `supabase.co` di `apps/api/src` + `.github` + `db/scripts` → **NIHIL**.
- SEMUA 6 titik akses DB baca `process.env`: `supabase.ts` (`SUPABASE_URL`,`SUPABASE_SECRET_KEY`),
  `rls-harness.ts`/`test-db.ts`/`drop-test-schema.ts`/`audit-integration.test.ts` (`DIRECT_URL`).
- Satu-satunya literal ref dev = **guard keselamatan** di `scripts/cleanup-cecep-residue.mjs`
  (`assertIsDev` MENOLAK selain dev) — dijalankan manual, bukan di CI; kalau pun jalan di CI ia
  menolak project CI. **Bukan** jalur tulis.
- **Kesimpulan bukti:** begitu ci.yml memetakan env test dari `CI_*`, CI menulis HANYA ke project
  yang ditunjuk `CI_*`. Tak ada koneksi hardcoded ke dev.

### 2.5 Draft perubahan ci.yml (BELUM diterapkan — aktifkan setelah secret + verifikasi)
Ganti env langkah **Test** + **Drop per-run test schema** dari `secrets.SUPABASE_*`/`DIRECT_URL`
(dev) menjadi `secrets.CI_*`:
```yaml
        env:
          SUPABASE_URL:        ${{ secrets.CI_SUPABASE_URL }}
          SUPABASE_SECRET_KEY: ${{ secrets.CI_SUPABASE_SECRET_KEY }}
          JWT_SECRET:          ${{ secrets.JWT_SECRET }}
          DATABASE_URL:        ${{ secrets.CI_DATABASE_URL }}
          DIRECT_URL:          ${{ secrets.CI_DIRECT_URL }}
          TEST_SCHEMA:         test_${{ github.run_id }}
```
Tambah langkah **"apply pending migration"** (idempoten, sebelum Test) — pakai tabel
`supabase_migrations.schema_migrations` untuk melewati yang sudah, apply yang baru saja. BUKAN
push-semua tiap run.

### 2.6 Setup sekali-jalan (setelah secret, urut)
1. Inventaris kosong (2.3).
2. Apply migration `001…116` ke `CI_DIRECT_URL` (script pg berurutan) + catat ke `schema_migrations`.
3. Seed data referensi yang test butuh (lihat 2.7).
4. Jalankan CI → buktikan hijau di project CI.
5. Buktikan lagi nol tulis ke dev (2.4) + cek `supabase_migrations` dev tak bertambah.
6. BARU cleanup dev `--execute`.

### 2.7 Test yang butuh SEED di project CI (jangan di-skip diam-diam)
Test RLS-harness (`createRlsClient` → `public`) meng-query data referensi nyata:
- `authz-endpoints`, `estimate-approval`, `approval-chain-berjenjang`, `approval-chains`,
  `lessons-writeback`, `rls-contract`, dll → butuh **users (+auth_id), roles, role_permissions,
  permissions, clients**; sebagian butuh **projects, cost_codes**.
- `ppn-dpp-guardrail` → baca `tax_records` (0 baris OK, vacuous — lihat §1).
- **Risiko yang harus diverifikasi saat setup:** `users.auth_id` FK → `auth.users`. Project CI
  fresh punya `auth.users` KOSONG. Seed harus membuat entri auth (via Auth admin API atau insert
  langsung ke `auth.users`) ATAU `authIdForRole` di-handle. Ini **titik yang saya verifikasi saat
  setup**; kalau ada test yang tak bisa jalan, saya **daftarkan + alasannya**, tak di-skip diam-diam.

### 2.8 Keep-alive cron (draft — cegah auto-pause project free)
Workflow terpisah `.github/workflows/ci-keepalive.yml`, `schedule: cron` harian, satu query
`SELECT 1` ke `CI_DIRECT_URL`. Free project pause ~7 hari nganggur → ping harian menahannya.

## 3. Konstanta hardcoded (#4 founder — CATATAN, jangan bangun)
Klasifikasi untuk penempatan yang benar nanti (memperjelas D4 di daftar cacat):
- **`3,14` = π dipotong** → **PENGUBAH ANGKA** (selisih ~0,05% vs π). Perbaikan lewat **flag
  DEFAULT OFF + ADR**, seperti pengubah-angka lain. Bukan sekadar ganti konstanta diam-diam.
- **`0,006165` (kg/m besi), densitas 1400/1600/1800, sak = 50 kg** → **KONSTANTA FISIK**, bukan
  config bisnis. Tempatnya **tabel referensi ter-seed** (mis. `material_physical_constants`), BUKAN
  halaman setting yang bisa diutak-atik user. **Bedakan tegas** dari `BUK%` & `PPN%` yang memang
  config bisnis effective-dated.
