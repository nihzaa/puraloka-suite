# 05 — Database Engineering Standard

> **Maturity:** 🟡 Partial — naming/migration hygiene sudah Enforced (lihat [22-project-conventions.md](../01-foundations/22-project-conventions.md)), tapi RLS-RBAC sinkronisasi dan invariant enforcement lewat constraint masih gap nyata, sedang dikerjakan Sub-Fase 1A.

**Kedudukan:** Batch 3 — Implementasi Inti. Melengkapi [22-project-conventions.md](../01-foundations/22-project-conventions.md) (konvensi penamaan) dengan aturan desain skema dan keamanan level-database. Dirujuk oleh [34-schema-migration-policy.md](34-schema-migration-policy.md) dan [07-security-engineering-standard.md](07-security-engineering-standard.md).

---

## 1. Purpose

Menetapkan bagaimana skema database dirancang dan dievolusikan supaya integritas data (financial correctness, tenant isolation) ditegakkan **di level database**, bukan hanya diasumsikan benar dari disiplin application layer yang bisa gagal atau ter-bypass.

## 2. Background

Puraloka Suite hari ini punya 67 tabel lewat 57 migration file ([Phase1/00-current-state-audit.md § 7](../../Phase1/00-current-state-audit.md#7-skala-database--sanity-check)), 50 RLS-enable statements, 207 indexes. RLS ([migration 049](../../Phase1/00-current-state-audit.md#2-rls-row-level-security--current-state)) sudah aktif tapi terverifikasi via grep langsung memiliki **nol referensi** ke tabel RBAC v2 (`roles`/`permissions`/`role_permissions` dari migration 050) — seluruh ~110 CREATE POLICY hardcode ke 4 literal role string. Ini adalah gap paling kritis yang didefinisikan file ini bersama [Phase1/02 § 1A.2](../../Phase1/02-target-architecture.md#1a2-rls-refactor--desain-sinkronisasi).

## 3. Principles

1. **Database adalah baris pertahanan terakhir, bukan yang pertama diasumsikan aman.** Application layer boleh punya bug atau di-bypass (query langsung, script admin) — constraint dan RLS di database **MUST** tetap menegakkan invariant terlepas dari jalur masuk mana pun.
2. **RLS dan RBAC MUST bersumber dari satu tempat, tidak dua sistem paralel yang bisa divergen.** Kondisi hari ini (RLS hardcode 4 role, RBAC v2 punya tabel dinamis terpisah) adalah anti-pattern yang sedang diperbaiki, bukan target akhir.
3. **Index ditambahkan berdasarkan pola query nyata, bukan spekulasi.** 207 index existing sudah menunjukkan disiplin ini — index baru **SHOULD** disertai justifikasi query yang dipercepat, bukan ditambahkan preventif tanpa bukti.

## 4. Mandatory Rules

1. Constraint integritas data pada kolom finansial-kritis (persentase, nominal, status enum) **MUST** ditegakkan lewat `CHECK` constraint di level tabel — **MUST NOT** diasumsikan cukup divalidasi di API layer saja. *(Contoh existing: `rab_items_pct_sum` — lihat [04-domain-driven-design-rules.md § Example Good](../02-architecture/04-domain-driven-design-rules.md#7-example-good).)*
2. Tabel baru yang menyimpan data transaksional (bukan tabel referensi statis) **MUST** mengaktifkan RLS (`ENABLE ROW LEVEL SECURITY`) sejak migration yang membuatnya — **MUST NOT** ditunda ke migration terpisah "nanti."
3. Policy RLS baru **MUST** merujuk fungsi helper terpusat (`auth_role()`, `auth_user_id()`, `auth_client_id()`, dan `has_permission()` setelah [Phase1/02 § 1A.2](../../Phase1/02-target-architecture.md#1a2-rls-refactor--desain-sinkronisasi) selesai) — **MUST NOT** menulis literal role string (`'admin'`, `'pm'`) langsung di dalam policy baru begitu helper terpusat tersedia.
4. Foreign key **MUST** secara eksplisit menyatakan `ON DELETE` behavior (`CASCADE`, `SET NULL`, atau `RESTRICT`) — **MUST NOT** mengandalkan default Postgres tanpa keputusan sadar (preseden: `audit_logs.user_id ON DELETE SET NULL` sengaja dipilih agar audit trail bertahan meski user dihapus).
5. Migration yang mengubah kolom pada tabel dengan data eksisting (rename, ubah tipe, tambah `NOT NULL` tanpa default) **MUST** mengikuti Expand-Contract pattern ([GLOSSARY.md — Expand-Contract Migration](../GLOSSARY.md)) — **MUST NOT** langsung menjalankan perubahan destruktif dalam satu migration terhadap tabel yang sudah punya data produksi/development aktif.

## 5. Recommended Rules

1. Kolom `created_at`/`updated_at` **SHOULD** ditambahkan ke tabel transaksional baru mengikuti pola existing (beberapa tabel finansial-kritis sudah punya trigger `protect_created_at` — CLAUDE.md § Known Issues & TODO, internal) — dipertimbangkan sejak desain awal, bukan ditambah belakangan.
2. Index **SHOULD** ditambahkan untuk kolom yang dipakai di `WHERE`/`JOIN` pada query yang dipanggil per-request (bukan laporan batch jarang) — prioritas kolom foreign key yang sering di-filter (`project_id`, `mandor_id`).

## 6. Anti-Pattern

**RLS Policy Hardcode Role String** — pola yang ada di seluruh 049_rls_policies.sql hari ini (~110 CREATE POLICY, nol referensi RBAC v2). Bahayanya: begitu RBAC v2 dipakai untuk mengubah permission secara dinamis (mis. admin ingin menambah role baru "supervisor" lewat UI), RLS di database sama sekali tidak ikut berubah — dua sistem otorisasi yang terlihat konsisten tapi sebenarnya independen dan bisa divergen tanpa terdeteksi. Ini adalah alasan utama [Phase1/01-gap-analysis.md Gap 2](../../Phase1/01-gap-analysis.md#gap-2--rls-tidak-sinkron-dengan-rbac-v2) diklasifikasi Blast Radius 🔴.

**Constraint yang Diasumsikan dari Application Layer** — kolom seperti `progress_pct` yang divalidasi hanya di `<input min=0 max=100>` frontend tanpa `CHECK (progress_pct BETWEEN 0 AND 100)` di database. Satu bug di frontend atau satu pemanggilan API langsung (Postman, script) merusak data tanpa penghalang apa pun.

## 7. Example Good

```sql
-- rab_items_pct_sum (migration 052, pola nyata) — invariant di level database
ALTER TABLE rab_items ADD CONSTRAINT rab_items_pct_sum CHECK (
  (material_pct + upah_pct + alat_pct + other_pct) = 0
  OR (material_pct + upah_pct + alat_pct + other_pct) BETWEEN 99.9 AND 100.1
);
```
Konsisten Mandatory Rule #1 — invariant bisnis (komponen biaya harus total 100% atau belum diisi) ditegakkan di database, tidak bisa dilanggar lewat jalur mana pun.

```sql
-- audit_logs.user_id (migration 009+046, pola nyata)
user_id UUID REFERENCES users(id) ON DELETE SET NULL
```
`ON DELETE` eksplisit dan sengaja (audit trail bertahan meski user dihapus) — konsisten Mandatory Rule #4.

## 8. Example Bad

```sql
-- Pola hari ini di 049_rls_policies.sql (paraphrase, ~110 kejadian serupa)
CREATE POLICY kasbons_select ON kasbons FOR SELECT USING (
  auth_role() = 'admin' OR auth_role() = 'pm' OR requested_by = auth_user_id()
);
```
Literal role string hardcode di policy — bertentangan Mandatory Rule #3 (setelah `has_permission()` tersedia). Bukan salah hari ini (migration 050/RBAC v2 memang belum disinkronkan), tapi ditandai eksplisit sebagai target migrasi, bukan pola yang boleh direplikasi untuk RLS policy baru selama Sub-Fase 1A berjalan.

## 9. Migration Strategy

**Untuk Mandatory Rule #3 (RLS merujuk helper terpusat)** — 🟡 Partial, migrasi aktif: mengikuti Expand-Contract yang sudah didesain rinci di [Phase1/03-migration-strategy.md § Migrasi 1A.2](../../Phase1/03-migration-strategy.md#migrasi-1a2--rls-sinkronisasi-migrasi-paling-berisiko-di-seluruh-phase-1) — policy baru ditambahkan di samping policy lama per kelompok tabel (reference → operational → field ops → financial terakhir), diverifikasi berjalan benar, baru policy lama dihapus. **MUST NOT** dikerjakan big-bang satu migration untuk seluruh 50 tabel sekaligus — risiko lockout production/development terlalu tinggi.

**Untuk Mandatory Rule #1, #2, #4, #5** — berlaku penuh sejak commit pertama untuk tabel/kolom baru; tidak retroaktif wajib untuk tabel existing yang belum punya constraint setara, tapi **SHOULD** ditambahkan bertahap saat tabel tersebut disentuh untuk pekerjaan lain (selaras [03-clean-architecture-rules.md § Migration Strategy](../02-architecture/03-clean-architecture-rules.md#9-migration-strategy) — dipicu oleh event, bukan proyek retrofit terpisah).

## 10. Checklist

- [ ] Kolom finansial-kritis baru punya `CHECK` constraint, bukan hanya validasi frontend
- [ ] Tabel transaksional baru punya RLS aktif sejak migration pembuatannya
- [ ] Policy RLS baru merujuk helper terpusat, bukan literal role string
- [ ] Foreign key baru punya `ON DELETE` eksplisit dan disengaja
- [ ] Perubahan kolom pada tabel berdata eksisting mengikuti Expand-Contract

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| RLS policy yang merujuk RBAC v2 helper (bukan literal role) | 100% pada akhir Migrasi 1A.2 | Grep `role_permissions`/`has_permission` di file policy SQL |
| Tabel transaksional baru tanpa RLS aktif | 0 | Review migration PR |
| Kolom finansial-kritis tanpa `CHECK` constraint terkait | Menurun dari baseline audit | Audit manual per Sub-Fase |

## 12. References

- [Phase1/00-current-state-audit.md § 2](../../Phase1/00-current-state-audit.md#2-rls-row-level-security--current-state)
- [Phase1/02-target-architecture.md § 1A.2](../../Phase1/02-target-architecture.md#1a2-rls-refactor--desain-sinkronisasi)
- [Phase1/03-migration-strategy.md § Migrasi 1A.2](../../Phase1/03-migration-strategy.md#migrasi-1a2--rls-sinkronisasi-migrasi-paling-berisiko-di-seluruh-phase-1)
- [Phase1/01-gap-analysis.md § Gap 2](../../Phase1/01-gap-analysis.md#gap-2--rls-tidak-sinkron-dengan-rbac-v2)
- [22-project-conventions.md](../01-foundations/22-project-conventions.md)
- [34-schema-migration-policy.md](34-schema-migration-policy.md)
- [GLOSSARY.md — Expand-Contract Migration, RLS, RBAC](../GLOSSARY.md)

---

*File selanjutnya: [06-api-engineering-standard.md](06-api-engineering-standard.md)*
