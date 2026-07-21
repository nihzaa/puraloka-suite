# Implementation Kickoff — 04. Database Migration Plan

**Sumber tunggal:** [Phase1/03-migration-strategy.md](../Phase1/03-migration-strategy.md). Dokumen ini menerjemahkan strategi itu menjadi **penomoran file presisi**, sesuatu yang belum ada di korpus manapun (Phase1/03 mendesain prosedur per kelompok, bukan nomor file konkret).

**⚠️ Ground truth migration terakhir — KOREKSI TERHADAP DRAFT AWAL DOKUMEN INI (ditemukan saat adversarial review):** Draft pertama dokumen ini keliru mengklaim `db/migrations/` dan `supabase/migrations/` masing-masing 58 file, sinkron 100% — klaim itu **salah**, dikonfirmasi via `diff` langsung. Fakta sebenarnya per hari ini: `db/migrations/` = **57 file** (terakhir `058_procurement_enhancements.sql`), `supabase/migrations/` = **58 file** (terakhir `059_seed_dummy_data.sql`, di-commit 18 Juli 2026 sebagai bagian remediation B2 sebelumnya). File `059_seed_dummy_data.sql` **tidak punya pasangan** di `db/migrations/` — kedua folder **TIDAK sinkron** per hari ini, kontradiksi langsung dengan hasil B2 remediation yang sebelumnya melaporkan sinkron 100%.

**Ini adalah temuan baru, di luar cakupan dokumen ini untuk diputuskan sepihak — dilaporkan sebagai Finding F3 (lihat [10-go-no-go-checklist.md § Findings Baru](10-go-no-go-checklist.md#dua-finding-baru-dari-adversarial-review-dilaporkan-bukan-diperbaiki-diam-diam)).** Nomor `059` di seluruh dokumen Implementation-Kickoff ini (04, 03, 02, 05, 08) **ditulis sebagai placeholder yang mengasumsikan gap 059 sudah diselesaikan** (baik dengan backfill `db/migrations/059_seed_dummy_data.sql`, atau dengan keputusan sadar bahwa file itu memang supabase-only) — **penomoran migration Sub-Fase 1A yang sebenarnya (`059` vs `060` sebagai titik mulai) MUST diverifikasi ulang tepat sebelum Task pertama Epic 3 dieksekusi**, bukan diasumsikan dari dokumen ini apa adanya. Ini ditambahkan sebagai item eksplisit di [08-day-one-checklist.md](08-day-one-checklist.md).

---

## Prinsip Non-Negotiable (Verbatim, Tidak Diparafrase — Wajib Dipatuhi Persis)

1. Tidak ada migration yang mengubah data existing secara destruktif tanpa backup terverifikasi lebih dulu.
2. Setiap migration schema baru bersifat additive dalam satu deploy — kolom baru selalu nullable dulu, `NOT NULL` adalah migration terpisah setelah backfill.
3. Perubahan RLS/authorization di belakang kemampuan rollback cepat (per-langkah, bukan feature-flag runtime — lihat catatan di bawah).
4. **Migrasi 049/050 yang sudah di-apply TIDAK PERNAH di-edit** — migration baru ditambahkan, bukan mengubah file lama.

**Catatan klarifikasi (bukan koreksi, penajaman):** [Phase1/03-migration-strategy.md:13](../Phase1/03-migration-strategy.md) menyebut "feature flag" untuk perubahan RLS/authorization berisiko tinggi, sementara mekanisme rollback konkret yang didesain di seluruh dokumen yang sama (§ Rollback per migrasi) adalah **DROP POLICY / re-create migration**, bukan flag runtime yang bisa dimatikan tanpa deploy. Untuk Sub-Fase 1A, mekanisme yang benar-benar dipakai adalah **expand-contract dengan migration file terpisah per langkah** — ini secara fungsional setara "cepat dimatikan" (satu `DROP POLICY` migration), tapi bukan literal feature flag di kode aplikasi. Tidak ada kontradiksi teknis, hanya perlu dipahami: "feature flag" di sini adalah istilah payung untuk *kemampuan mundur cepat*, bukan implementasi `feature_flags` table (yang sendiri baru dibangun di 1B).

---

## Penomoran Migration File — Urutan Presisi

Dimulai dari **059** (nomor berikutnya setelah `058_procurement_enhancements.sql`).

### Blok 1 — Permission Engine (1A.1)

| # | Nama File | Isi | Tipe |
|---|---|---|---|
| 059 | `059_permission_scopes.sql` | `CREATE TABLE permission_scopes` (additive), `ALTER TABLE permissions ADD COLUMN scope_type`, `ADD COLUMN resource_type` | Additive murni |

**Tidak ada migration lain di Blok 1** — penghapusan `requireRole` (langkah 3-4 di [Phase1/03-migration-strategy.md § Migrasi 1A.1](../Phase1/03-migration-strategy.md#migrasi-1a1--permission-engine-konsolidasi)) adalah perubahan kode aplikasi murni, bukan migration SQL.

### Blok 2 — RLS Sinkronisasi (1A.2) — Per Tabel/Kelompok, Bukan Monolitik

| # | Nama File | Isi | Kelompok Risiko |
|---|---|---|---|
| 060 | `060_has_permission_function.sql` | `CREATE OR REPLACE FUNCTION has_permission(permission_key TEXT)` — sekali saja, dipakai semua policy baru di bawah | Fondasi (tidak menyentuh policy manapun) |
| 061 | `061_rls_sync_referensi.sql` | `CREATE POLICY` baru (permission-aware) untuk `material_categories`, `materials` — policy lama **tidak dihapus** | 🟢 Rendah — validasi pola |
| 062 | `062_rls_sync_operasional.sql` | `CREATE POLICY` baru untuk `milestones`, `documents`, `project_photos` | 🟡 Sedang |
| 063 | `063_rls_sync_field_ops.sql` | `CREATE POLICY` baru untuk `progress_logs`, `work_scopes`, `workers` | 🟡 Sedang |
| 064 | `064_rls_sync_finansial_expand.sql` | `CREATE POLICY` baru untuk `kasbons`, `invoices`, `payments`, `cash_accounts`, `expense_reports` — **expand only**, policy lama tetap hidup | 🔴 Tinggi — **MUST** dijadwalkan jam operasional rendah, independent review wajib sebelum lanjut (lihat 07) |
| 065 | `065_rls_enumerate_uncovered_tables.sql` | Hasil enumerasi eksplisit ~17 tabel tanpa RLS — setiap tabel dapat keputusan sadar (RLS baru ATAU didokumentasikan sengaja terbuka) | Task terpisah, **wajib sebelum** 066 |
| 066+ | `066_rls_sync_referensi_contract.sql`, dst | Hapus policy lama per kelompok — **hanya setelah** kelompok itu stabil beberapa hari tanpa insiden | Contract, per kelompok, urutan sama seperti expand |

**Kelompok Finansial (064) — kondisi tambahan wajib sebelum "contract" (hapus policy lama):**
- Independent review logika policy oleh sesi/konteks terpisah dari yang menulis policy (safeguard B6).
- Query verifikasi harian (expected vs. visible row count per role) selama masa observasi (safeguard B7).
- Dijadwalkan di luar jam operasional (safeguard B8).

Ketiga syarat ini adalah hasil remediation B6/B7/B8 yang sudah tertanam permanen di [Phase1/03-migration-strategy.md:51-52](../Phase1/03-migration-strategy.md) — **tidak boleh dilewati** untuk migration 064's contract phase.

**RBAC v2 sendiri (`roles`, `permissions`, `role_permissions`) — TIDAK ada migration baru.** Sudah benar dari migration 050, tidak disentuh sama sekali di Blok 2.

### Blok 3 — Audit Trail (1A.3, Paralel)

| # | Nama File | Isi |
|---|---|---|
| 067 | `067_audit_trail_columns.sql` | `ALTER TABLE audit_logs ADD COLUMN correlation_id UUID, ADD COLUMN workflow_id UUID NULL, ADD COLUMN reason TEXT NULL` — semua nullable, additive |
| 068 | `068_audit_logs_append_only_trigger.sql` *(kondisional — lihat catatan)* | Trigger append-only untuk `audit_logs`, direkomendasikan [Phase1/07-security-review.md:57](../Phase1/07-security-review.md) — **butuh keputusan founder eksplisit** sebelum dibuat (lihat [09-definition-of-ready.md](09-definition-of-ready.md)) |

**Catatan penomoran 067 vs 060-066:** Karena 1A.3 berjalan paralel dengan 1A.2 (bukan sekuensial), nomor migration aktualnya bisa saja terselip di antara 060-066 tergantung urutan commit riil — **prinsip yang mengikat bukan angka persis, tapi urutan logis dalam kelompoknya sendiri** (audit trail selalu sebelum instrumentasi event yang memakainya). Dieksekusi solo developer, jadi migration akan tetap sekuensial secara waktu meski "paralel" secara dependency graph.

---

## Rollback Plan — Per Blok

| Blok | Rollback Sebelum Contract | Rollback Setelah Contract |
|---|---|---|
| 1 (Permission Scopes) | `DROP TABLE permission_scopes` — aman, nol FK masuk dari tabel lain | N/A — tidak ada fase contract untuk tabel baru |
| 2 (RLS per kelompok) | `DROP POLICY` pada policy baru saja — sistem kembali ke behavior lama sepenuhnya | Re-create policy lama dari `049_rls_policies.sql` (disimpan sebagai referensi) sebagai migration baru — **bukan** git revert schema |
| 3 (Audit Trail) | Kolom nullable — `ALTER TABLE audit_logs DROP COLUMN` aman jika belum ada data ditulis ke kolom itu | Setelah data ditulis: kolom **tidak di-drop**, cukup berhenti mengisi (instrumentasi adalah kode aplikasi, revert Git) |

---

## Backup & Verification Sebelum Setiap Blok Berisiko Tinggi

**Sebelum Blok 2 dimulai (RLS, seluruh kelompok):**
1. Verifikasi status PITR (Point-In-Time Recovery) Supabase — administratif, item terbuka dari [Phase1/07-security-review.md:56](../Phase1/07-security-review.md), **belum diverifikasi per hari ini**.
2. Snapshot `049_rls_policies.sql` sudah tersimpan sebagai referensi rollback (file ini sendiri, tidak perlu backup terpisah — ia adalah bagian dari riwayat migration).

**Khusus sebelum migration 064 (Finansial):**
1. Backup terverifikasi (bukan asumsi backup otomatis Supabase cukup — verifikasi eksplisit sebelum migrasi tabel finansial dijalankan).
2. Jadwal maintenance window disepakati (akhir pekan/malam hari, mengikuti perlakuan R7 di [Risk Register](../Phase1/04-risk-register.md#r7)).
3. Query interim detection (row count per role) disiapkan dan ditest **sebelum** migration 064 di-deploy, bukan ditulis setelahnya.

---

## Maintenance Window — Kelompok Finansial (Migration 064)

**MUST** dijadwalkan di luar jam operasional (akhir pekan atau malam hari) — sama seperti perlakuan Risiko R7 (migrasi Workflow Registry 1C) di [Risk Register](../Phase1/04-risk-register.md#r7--workflow-registry-migration-1c-mengubah-alur-approval-yang-sedang-berjalan-in-flight). Ini bukan berarti risiko yang sama persis (R7 adalah risiko *state in-flight*, migration 064 adalah risiko *kebocoran/lockout data*) — keduanya mendapat perlakuan jam-operasional-rendah untuk alasan berbeda namun sama-sama valid, dikonfirmasi tidak kontradiktif saat B8 remediation.

**Durasi estimasi:** Deploy migration (expand, additive) sendiri berdurasi detik — window yang dibutuhkan bukan untuk migration-nya, tapi untuk **periode observasi pasca-deploy** di mana query interim detection dijalankan manual sebelum yakin lanjut ke tabel/langkah berikutnya.

---

## RLS Migration Order — Ringkasan Final

```
060 (has_permission function)
  → 061 (Referensi, 🟢)
    → 062 (Operasional, 🟡)
      → 063 (Field ops, 🟡)
        → 065 (Enumerasi ~17 tabel tanpa RLS — task sadar, bisa paralel dengan 061-063)
          → 064 (Finansial, 🔴 — expand, maintenance window + independent review)
            → 066+ (Contract per kelompok, urutan sama: Referensi dulu, Finansial terakhir)
```

**Catatan urutan 065 vs 064:** Ditempatkan sebelum 064 di tabel Blok 2 di atas secara penomoran sekuensial, tapi **secara dependency**, enumerasi ~17 tabel tanpa RLS tidak bergantung pada kelompok manapun — ia bisa dikerjakan kapan saja sebagai task sadar terpisah selama sebelum Gate 1A→1B ditutup. Ditulis di posisi 065 di sini murni untuk keterbacaan urutan file, bukan klaim dependency keras.

---

*Dokumen selanjutnya: [05 — Feature Implementation Order](05-feature-implementation-order.md) — breakdown Epic/Feature/Task/Subtask.*
