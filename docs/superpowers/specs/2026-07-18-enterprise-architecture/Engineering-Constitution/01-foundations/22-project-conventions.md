# 22 — Project Conventions

> **Maturity:** 🟢 Enforced — seluruh konvensi di file ini sudah diikuti konsisten di codebase existing, terverifikasi langsung, bukan target baru.

**Kedudukan:** Batch 1 — Fondasi. Melengkapi [01-coding-standards.md](01-coding-standards.md) dan [02-folder-architecture.md](02-folder-architecture.md) — file ini fokus pada konvensi *lintas-layer* (database, Git, commit) yang tidak spesifik satu bahasa/framework.

---

## 1. Purpose

Mengonsolidasikan konvensi yang sudah **teruji berjalan baik** di 57 migration file dan seluruh riwayat commit Puraloka Suite — mendokumentasikan apa yang sudah bekerja supaya tetap konsisten saat tim bertambah, bukan menciptakan konvensi baru.

## 2. Background

CLAUDE.md (root proyek) sudah mendokumentasikan sebagian konvensi ini secara informal. File ini **memformalkan** konvensi yang sama ke dalam Engineering Constitution — sengaja tidak mendesain ulang, karena konvensi existing sudah terbukti bekerja melalui 57 migration file tanpa insiden penamaan yang tercatat di [Phase1/00-current-state-audit.md](../../Phase1/00-current-state-audit.md).

## 3. Principles

1. **Konvensi yang sudah terbukti dipertahankan, bukan diganti demi "praktik terbaik" generik.** `snake_case` untuk database adalah konvensi PostgreSQL standar yang sudah konsisten 67 tabel — tidak ada alasan menggantinya.
2. **Commit message adalah dokumentasi sejarah proyek** — pesan yang jelas memudahkan `git blame`/`git log` menjadi alat debugging yang berguna, bukan sekadar formalitas.
3. **Migration adalah append-only log** — sekali di-apply ke database manapun (termasuk development), migration **tidak** diedit, hanya ditambah migration baru yang memperbaiki/memperluas.

## 4. Mandatory Rules

1. Nama tabel dan kolom database **MUST** memakai `snake_case`, tabel **MUST** dalam bentuk jamak (`projects`, bukan `project`) — konsisten 100% di 67 tabel existing.
2. Commit message **MUST** mengikuti Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, dst.) — sudah 100% konsisten di riwayat commit yang diperiksa.
3. Migration file **MUST** idempotent-safe (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) — pola yang sudah konsisten dipakai di seluruh 57 migration.
4. Migration yang **sudah di-apply** **MUST NOT** diedit — perbaikan/perluasan **MUST** berupa migration baru bernomor lebih tinggi. *(Lihat [03-core-implementation/34-schema-migration-policy.md](../03-core-implementation/34-schema-migration-policy.md) untuk detail lengkap strategi migrasi skema.)*
5. Nama branch Git **MUST** mengikuti pola `feature/nama-fitur`, `fix/nama-bug` — konsisten konvensi yang sudah ditetapkan CLAUDE.md.

## 5. Recommended Rules

1. Migration file **SHOULD** menyertakan komentar rationale di baris awal untuk migration yang menyentuh lebih dari satu domain — pola yang sudah mulai muncul di migration 049 ([00 — Naming Conventions](../../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase)), direkomendasikan jadi standar wajib bertahap.
2. Commit yang menyentuh logic finansial-kritis **SHOULD** menyebutkan file test yang diverifikasi di deskripsi commit (begitu [04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md) berjalan).

## 6. Anti-Pattern

**Migration yang Diedit Setelah Di-apply** — mengubah isi file migration yang sudah dijalankan (bukan menambah migration baru) merusak integritas riwayat, dan menyebabkan environment berbeda (development vs staging vs production) berpotensi punya skema berbeda meski nomor migration sama. Prinsip ini sudah dipegang teguh di seluruh proyek ([04 — Migration Strategy](../../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase): "migrasi 049/050 yang sudah di-apply tidak di-edit").

**Commit Message Generik** — `"update"`, `"fix bug"`, `"wip"` tanpa konteks. Tidak ditemukan sebagai pola dominan di riwayat commit existing (baik) — dicatat sebagai anti-pattern eksplisit untuk mencegah kemunculan di masa depan seiring tim bertambah.

## 7. Example Good

```sql
-- db/migrations/052_rab_komponen_biaya.sql (pola nyata)
ALTER TABLE rab_items ADD COLUMN IF NOT EXISTS material_pct NUMERIC(5,2) DEFAULT 0;
```
Idempotent-safe (`IF NOT EXISTS`), `snake_case`, additive — konsisten Mandatory Rule #1, #3.

```
feat: RAB komponen biaya, progress dual-mode & Kurva S/EVM (migration 052)
```
Commit message riil dari riwayat proyek — jelas, Conventional Commits, menyebut migration terkait.

## 8. Example Bad

*(Hipotetis — tidak ditemukan di codebase, dicantumkan sebagai pencegahan sesuai [ADR-002](../adr/ADR-002-enforcement-levels-and-template.md))*: `ALTER TABLE Projects ADD COLUMN ClientName` — PascalCase untuk tabel/kolom, singular table name — bertentangan langsung Mandatory Rule #1, akan memutus konsistensi 67 tabel existing jika pernah terjadi.

## 9. Migration Strategy

N/A untuk seluruh Mandatory Rules di file ini — konvensi sudah 100% konsisten di codebase existing (Maturity: 🟢 Enforced). Tidak ada migrasi mundur yang dibutuhkan; aturan berlaku sebagai penegasan formal atas apa yang sudah menjadi praktik nyata.

## 10. Checklist

- [ ] Nama tabel/kolom baru `snake_case`, tabel jamak
- [ ] Commit message Conventional Commits
- [ ] Migration baru idempotent-safe (`IF NOT EXISTS`)
- [ ] Tidak ada edit ke migration yang sudah di-apply
- [ ] Nama branch mengikuti `feature/`, `fix/` pattern

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Migration file yang diedit setelah di-apply | 0 | Audit `git log` per migration file — tidak boleh ada commit kedua yang mengubah file migration lama |
| Commit tidak mengikuti Conventional Commits | 0 | Review manual / commit-lint di masa depan |
| Tabel/kolom baru melanggar `snake_case`/jamak | 0 | Review migration baru |

## 12. References

- [Phase1/00-current-state-audit.md § 7](../../Phase1/00-current-state-audit.md#7-skala-database--sanity-check) — 57 migration, 67 tabel, verifikasi konsistensi
- [04-roadmap-governance-and-delivery.md § Migration Strategy](../../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase)
- [03-core-implementation/34-schema-migration-policy.md](../03-core-implementation/34-schema-migration-policy.md)
- CLAUDE.md (internal — sumber konvensi asli yang diformalkan di sini)

---

*Batch 1 selesai. File selanjutnya (Batch 2 — Prinsip Arsitektur): [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md)*
