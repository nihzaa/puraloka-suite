# Execution Plan — 1B.4 users.role enum → FK (RED-LINE #1)

**⚠️ OPERASI PALING BERISIKO DI PROYEK.** Migration destruktif (mengubah kolom `users.role` yang dibaca di seluruh auth path). AUTOPILOT §5 Red-Line #1 — **DANGER GATE + ack founder wajib** sebelum eksekusi. Dokumen ini adalah rencana, bukan izin jalan.

## Masalah yang diselesaikan

`users.role` = enum `user_role` 4-nilai (admin/pm/mandor/client, `001_extensions_and_enums.sql:17`). RBAC v2 (tabel `roles`) mendukung role custom, tapi role custom (`direktur`) **tak bisa di-assign ke user** — enum menolak. RBAC config-driven setengah jadi. Ini kebutuhan nyata yang rusak diam-diam.

## KEPUTUSAN FOUNDER (prasyarat mutlak)

- **Opsi A:** migrasi enum→FK sekarang (dokumen ini). Menuntaskan config-driven.
- **Opsi B:** tunda. 1B.4 tidak dikerjakan; gate core 1B tetap lulus.

**Dokumen ini hanya relevan jika Opsi A dipilih.**

## Blast radius (kenapa Red-Line)

`users.role` dibaca di:
- `plugins/auth.ts` — **setiap request** (`select role`, dipakai `requirePermission`/`hasPermission` via `get_role_permissions(role)`)
- **Semua RLS policy** via `auth_role()` (`049`-era + `has_permission()` yang query `roles.name = auth_role()`)
- `get_role_permissions(role_name)` RPC
- ~55 inline `user.role === '...'` (data-scoping)

Satu kesalahan = auth rusak untuk semua user.

## Strategi: Expand-Contract (pola Epic 4, diperketat)

### Fase 1 — EXPAND (reversible)
1. Migration 078: `ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id)` (nullable).
2. Backfill: `UPDATE users SET role_id = (SELECT id FROM roles WHERE name = users.role::text)`.
3. **Dual-write:** kode yang set role menulis KEDUA (`role` enum + `role_id`).
4. `auth_role()` / read path **tetap** baca `role` enum (belum pindah). Nol perubahan behavior.
5. **Verifikasi:** setiap user punya `role_id` benar (count match); `auth_role()` masih resolve.

### Fase 2 — SWAP READ (bertahap, per-titik)
6. `auth_role()` diubah baca dari `roles.name JOIN role_id` (bukan enum). Verifikasi RLS masih benar (smoke test 4 role).
7. `plugins/auth.ts` baca role via role_id join.
8. Test setiap titik: nol lockout, nol permission berubah.

### Fase 3 — CONTRACT (destruktif, paling akhir, maintenance window)
9. Setelah stabil beberapa hari + independent review: drop kolom `role` enum, drop type `user_role`.
10. `users.role` sepenuhnya via FK.

## DANGER GATE (tampilkan sebelum eksekusi Fase 1)

Isi wajib: (1) aksi, (2) blast radius di atas, (3) SQL migration 078 lengkap, (4) rollback (`DROP COLUMN role_id` — enum masih hidup, nol data hilang selama expand), (5) verdict risiko + rekomendasi urutan. Tunggu ack founder eksplisit.

## Smoke test wajib (tiap fase)

Login 4 role + **buat 1 user role custom `direktur`** (kini bisa!) → verifikasi:
- Semua role akses sesuai `role_permissions` (nol lockout — pelajaran lockout 1A).
- `direktur` (custom) berfungsi end-to-end (bukti tujuan 1B.4 tercapai).
- Negative test 403 untuk role tanpa permission.

## Rollback

- Fase 1-2 (expand/swap): revert kode + `DROP COLUMN role_id`; enum `role` masih sumber kebenaran → instan, nol data hilang.
- Fase 3 (contract): re-create enum dari `001` + backfill balik role_id→role. TINGGI — hanya setelah independent review.

## DoD

Expand-contract selesai; `users.role` via FK; role custom bisa di-assign & berfungsi; smoke test 4+1 role hijau; `auth_role()`/RLS tetap benar; nol lockout; rollback teruji; independent review sebelum contract.
