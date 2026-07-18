# 34 — Schema Migration Policy

> **Maturity:** 🟡 Partial — disiplin dasar (append-only, idempotent-safe, `IF NOT EXISTS`) sudah Enforced di 57 migration existing; strategi Expand-Contract untuk perubahan berisiko tinggi (RLS refactor) sudah didesain rinci tapi belum dieksekusi.

**Kedudukan:** Batch 3 — Implementasi Inti. Detail lengkap dari aturan singkat di [22-project-conventions.md § Mandatory Rule #3-4](../01-foundations/22-project-conventions.md#4-mandatory-rules). Melengkapi [05-database-engineering-standard.md](05-database-engineering-standard.md) — file ini fokus pada **proses** migrasi (urutan, rollback, verifikasi), bukan desain skema itu sendiri.

---

## 1. Purpose

Menjamin setiap migration schema — dari penambahan kolom sederhana sampai refactor RLS 50 tabel — bisa dijalankan, diverifikasi, dan (jika perlu) dibatalkan tanpa merusak data produksi atau menyebabkan downtime yang tidak direncanakan.

## 2. Background

57 migration file existing terverifikasi 100% konsisten memakai pola idempotent-safe (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) tanpa insiden penamaan atau konflik tercatat ([Phase1/00-current-state-audit.md § 7](../../Phase1/00-current-state-audit.md#7-skala-database--sanity-check)). Migrasi terberat yang akan datang — RLS sinkronisasi ke RBAC v2 ([Phase1/03-migration-strategy.md § Migrasi 1A.2](../../Phase1/03-migration-strategy.md#migrasi-1a2--rls-sinkronisasi-migrasi-paling-berisiko-di-seluruh-phase-1)) — sudah didesain eksplisit sebagai "migrasi paling berisiko di seluruh Phase 1," dengan urutan per-kelompok-tabel (reference table dulu, financial table terakhir) dan rollback plan tertulis. File ini menggeneralisasi pola tersebut menjadi kebijakan untuk semua migrasi berisiko sedang-tinggi di masa depan, bukan hanya migrasi RLS ini.

## 3. Principles

1. **Migration adalah operasi satu-arah dalam sejarahnya, dua-arah dalam kemampuannya.** Sekali di-apply, file migration itu sendiri tidak diedit ([22-project-conventions.md](../01-foundations/22-project-conventions.md)) — tapi efeknya **MUST** bisa dibatalkan lewat migration baru yang membalikkan perubahan, terutama untuk migrasi berisiko tinggi.
2. **Migrasi berisiko tinggi dipecah per kelompok, bukan big-bang.** Preseden Migrasi 1A.2: RLS disinkronkan per kelompok tabel (reference → operational → field ops → financial), bukan seluruh 50 tabel dalam satu migration — jika ada masalah di tengah jalan, blast radius terbatas ke kelompok yang sedang dikerjakan.
3. **Expand sebelum Contract, selalu.** Struktur baru (kolom, policy, tabel) ditambahkan dan diverifikasi berjalan benar berdampingan dengan struktur lama sebelum struktur lama dihapus — pola ini bukan opsional untuk migrasi yang menyentuh data produksi/development aktif ([GLOSSARY.md — Expand-Contract Migration](../GLOSSARY.md)).

## 4. Mandatory Rules

1. Setiap migration file **MUST** idempotent-safe (`IF NOT EXISTS`/`IF EXISTS` pattern) — **MUST NOT** mengasumsikan migration hanya akan dijalankan sekali di lingkungan yang selalu bersih (development sering di-reset dan di-replay).
2. Migration yang sudah di-apply ke environment manapun (termasuk development) **MUST NOT** diedit — perbaikan **MUST** berupa migration baru bernomor lebih tinggi.
3. Migrasi yang mengubah struktur pada tabel dengan data eksisting yang berpotensi merusak akses aplikasi yang sedang berjalan (rename kolom, ubah tipe, RLS policy baru menggantikan lama) **MUST** mengikuti Expand-Contract: (a) tambah struktur baru, (b) verifikasi aplikasi tetap berjalan dengan struktur lama+baru berdampingan, (c) migrasi baru terpisah untuk menghapus struktur lama — **MUST NOT** digabung jadi satu migration yang expand dan contract sekaligus.
4. Migrasi yang menyentuh lebih dari satu kelompok tabel berisiko tinggi (mis. RLS lintas domain finansial) **MUST** dipecah per kelompok dengan urutan eksplisit (reference/lookup table dulu, tabel finansial-kritis terakhir) — **MUST NOT** dijalankan sebagai satu migration monolitik untuk seluruh domain sekaligus.
5. Migration yang berpotensi merusak akses (RLS refactor, constraint baru yang bisa menolak data existing) **MUST** disertai rencana rollback tertulis di komentar migration atau PR description sebelum dijalankan — **MUST NOT** dijalankan tanpa jalur mundur yang sudah dipikirkan.

## 5. Recommended Rules

1. Migration yang menyentuh lebih dari satu domain bisnis **SHOULD** menyertakan komentar rationale di baris awal file (mulai diterapkan sejak migration 049) — dijadikan wajib bertahap begitu tim bertambah.
2. Migration berisiko tinggi **SHOULD** dites di environment development dengan data mendekati skala production sebelum dijalankan ke environment yang lebih tinggi.

## 6. Anti-Pattern

**Big-Bang RLS Migration** — mengganti seluruh ~110 CREATE POLICY di 50 tabel dalam satu migration file tunggal. Jika ada satu policy yang salah (mis. mengunci akses admin sendiri), seluruh sistem terkunci sekaligus tanpa jalur mundur granular — bertentangan Mandatory Rule #4, alasan eksplisit kenapa [Phase1/03-migration-strategy.md](../../Phase1/03-migration-strategy.md#urutan-migrasi-per-kelompok-tabel) memecahnya per kelompok.

**Migration yang Diedit Setelah Di-apply** — sudah didefinisikan sebagai anti-pattern di [22-project-conventions.md § Anti-Pattern](../01-foundations/22-project-conventions.md#6-anti-pattern); dirujuk ulang di sini karena konsekuensinya paling parah justru pada migrasi schema berisiko tinggi (divergensi skema antar environment persis saat migrasi paling kompleks).

## 7. Example Good

```sql
-- Migrasi 1A.2 (rencana, per Phase1/03) — Expand step untuk satu kelompok tabel
-- Step 1 (expand): tambah policy baru berdampingan dengan policy lama
CREATE POLICY kasbons_select_v2 ON kasbons FOR SELECT USING (has_permission(auth_role(), 'kasbons:read'));
-- (policy lama kasbons_select TETAP ADA sampai verifikasi selesai)
```
```sql
-- Migrasi terpisah, setelah verifikasi (contract step)
DROP POLICY kasbons_select ON kasbons; -- policy lama baru dihapus di migration terpisah
```
Dua migration terpisah untuk expand dan contract — konsisten Mandatory Rule #3.

## 8. Example Bad

```sql
-- Anti-pattern: expand + contract dalam satu migration, tanpa jeda verifikasi
DROP POLICY kasbons_select ON kasbons;
CREATE POLICY kasbons_select ON kasbons FOR SELECT USING (has_permission(auth_role(), 'kasbons:read'));
-- Jika has_permission() punya bug, akses kasbon langsung rusak tanpa fallback ke policy lama
```
Melanggar Mandatory Rule #3 — tidak ada periode berdampingan untuk memverifikasi policy baru bekerja benar sebelum policy lama hilang selamanya.

## 9. Migration Strategy

N/A — file ini **adalah** kebijakan migrasi itu sendiri, bukan aturan yang butuh migrasi mundur. Berlaku penuh sejak commit pertama untuk migrasi baru manapun, termasuk Migrasi 1A.1-1D yang sudah didesain di [Phase1/02-target-architecture.md](../../Phase1/02-target-architecture.md) dan [Phase1/03-migration-strategy.md](../../Phase1/03-migration-strategy.md).

## 10. Checklist

- [ ] Migration file idempotent-safe (`IF NOT EXISTS`/`IF EXISTS`)
- [ ] Tidak mengedit migration yang sudah di-apply
- [ ] Perubahan berisiko pada tabel berdata eksisting mengikuti Expand-Contract (migration terpisah untuk expand vs contract)
- [ ] Migrasi lintas kelompok tabel berisiko tinggi dipecah per kelompok, urutan eksplisit
- [ ] Rencana rollback tertulis untuk migrasi yang berpotensi merusak akses

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Migration file diedit setelah di-apply | 0 | Audit `git log` per file migration |
| Migrasi berisiko tinggi tanpa rencana rollback tertulis | 0 | Review PR migration |
| Migrasi expand+contract digabung satu file untuk tabel berdata eksisting | 0 | Review PR migration |

## 12. References

- [22-project-conventions.md](../01-foundations/22-project-conventions.md)
- [05-database-engineering-standard.md](05-database-engineering-standard.md)
- [Phase1/03-migration-strategy.md](../../Phase1/03-migration-strategy.md)
- [Phase1/03-migration-strategy.md § Migrasi 1A.2](../../Phase1/03-migration-strategy.md#migrasi-1a2--rls-sinkronisasi-migrasi-paling-berisiko-di-seluruh-phase-1)
- [GLOSSARY.md — Expand-Contract Migration](../GLOSSARY.md)

---

*Batch 3 selesai. File selanjutnya (Batch 4 — Kualitas & Observability): [04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md)*
