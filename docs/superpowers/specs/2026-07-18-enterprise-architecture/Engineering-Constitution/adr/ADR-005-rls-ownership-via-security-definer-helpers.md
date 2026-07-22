# ADR-005 — RLS Ownership Checks via SECURITY DEFINER Helpers

**Status:** Diterima (solusi kanonik, bukan pilihan produk)
**Tanggal:** 2026-07-23
**Kedudukan:** Melengkapi [ADR-004](ADR-004-permission-is-architecture-role-is-configuration.md) dan [05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md). Dipicu oleh bug RLS recursion yang ditemukan saat Epic 4 (RLS Synchronization).

---

## Konteks — Bug yang Ditemukan

RLS test harness Epic 4 (impersonasi role nyata, yang sebelumnya tak pernah ada) langsung mengekspos **infinite recursion** di RLS existing (migration 049), tak terdeteksi sejak awal karena API selalu pakai `service_role` yang bypass RLS:

- `projects_mandor_select` (049:141) → subquery `EXISTS (SELECT 1 FROM mandor_assignments ...)`
- `mandor_assignments_pm_select` (049:342) → subquery `project_id IN (SELECT id FROM projects WHERE pm_id = ...)`

Saat Postgres mengevaluasi policy `projects`, ia harus mengevaluasi RLS `mandor_assignments`, yang balik mengevaluasi RLS `projects` → rekursi tak terbatas (`ERROR: infinite recursion detected in policy for relation "mandor_assignments"`). Ini memblokir query ke `projects`, `mandor_assignments`, dan **semua tabel project-scoped** (milestones, documents, progress_logs, work_scopes, kasbons, dst) lewat jalur non-service-role — termasuk seluruh sisa Epic 4.

## Keputusan

Ownership check antar-tabel di RLS **MUST** dilakukan lewat fungsi `SECURITY DEFINER`, bukan subquery langsung ke tabel ber-RLS.

Fungsi `SECURITY DEFINER` dieksekusi dengan hak pemilik fungsi (bypass RLS di dalamnya), sehingga subquery-nya **tidak memicu RLS bersarang** — memutus rantai rekursi. Ini pola kanonik yang direkomendasikan luas oleh dokumentasi PostgreSQL dan Supabase untuk RLS policy yang perlu mereferensikan tabel lain.

Helper yang dibuat (migration 065):
- `is_assigned_mandor(p_project_id UUID) → BOOLEAN` — user saat ini adalah mandor yang di-assign ke proyek itu.
- `is_pm_of_project(p_project_id UUID) → BOOLEAN` — user saat ini PM proyek itu.
- `is_owning_client(p_project_id UUID) → BOOLEAN` — user saat ini client pemilik proyek itu.

Semua `STABLE SECURITY DEFINER`, membaca `auth_user_id()`/`auth_client_id()` (yang sudah SECURITY DEFINER), fail-closed.

## Kenapa ini solusi kanonik, bukan salah satu dari beberapa alternatif

- **SECURITY DEFINER helper (dipilih):** standar de-facto PostgreSQL/Supabase untuk memutus RLS recursion. Minimal, behavior-preserving, tidak menambah data.
- **Denormalisasi ownership ke kolom (ditolak):** menduplikasi state, butuh trigger sinkronisasi, menambah permukaan bug — inferior untuk kasus ini.
- **JWT-claim cache ownership (ditolak):** menaruh daftar proyek di token, basi saat assignment berubah, membengkakkan token — tidak dipakai komunitas untuk ini.

Karena hanya SECURITY DEFINER yang kanonik (dua lainnya adalah workaround inferior dengan konsekuensi lebih buruk), ini keputusan engineering langsung, bukan trade-off arsitektur yang butuh keputusan produk.

## Mandatory Rules

1. Policy RLS yang perlu mengecek ownership lintas tabel **MUST** memanggil helper `SECURITY DEFINER`, **MUST NOT** subquery langsung ke tabel ber-RLS lain (mencegah rekursi).
2. Helper `SECURITY DEFINER` baru **MUST** `STABLE`, fail-closed, dan hanya membaca — tidak menulis.
3. Setiap tabel project-scoped yang dimigrasikan di Epic 4 **MUST** diverifikasi oleh RLS test harness (impersonasi role) sebelum policy lama-nya di-contract.

## Migration Strategy

`projects` dan `mandor_assignments` (akar rekursi) dimigrasikan lebih dulu ke helper (migration 065), memutus rekursi, sebelum kelompok tabel lain yang bergantung padanya. Expand-contract tetap berlaku: policy baru berdampingan dengan lama, contract setelah harness hijau.

## References

- [ADR-004](ADR-004-permission-is-architecture-role-is-configuration.md) — permission-based authorization
- [Phase1/03-migration-strategy.md](../../Phase1/03-migration-strategy.md) — urutan kelompok tabel RLS
- PostgreSQL docs — RLS + SECURITY DEFINER functions
- Supabase docs — RLS performance & avoiding recursion
