# Implementation Kickoff — 07. Release and Rollback Plan

**Tujuan:** Mengisi gap yang diidentifikasi di [01-implementation-readiness.md](01-implementation-readiness.md) dimensi "Release" (3/10) — strategi branch/merge/release/rollback/backup/hotfix untuk *implementasi kode*, melengkapi strategi rollback *migration* yang sudah lengkap di [Phase1/03-migration-strategy.md](../Phase1/03-migration-strategy.md).
**Prinsip dasar yang diwarisi (bukan baru):** Git revert murni untuk kode, migration terpisah untuk schema rollback — pola ini sudah konsisten disebut berulang di seluruh Phase1 set, dokumen ini hanya menjadikannya eksplisit sebagai satu tempat rujukan.

---

## Branch Strategy

**Kondisi saat ini (ground truth):** `main` adalah satu-satunya branch aktif, `ahead 37, behind 0` terhadap `origin/main`, belum pernah di-push.

**Untuk Sub-Fase 1A:**
- Setiap Task (level [05-feature-implementation-order.md](05-feature-implementation-order.md)) dikerjakan di branch `feature/1a-<epic>-<task-singkat>` — konsisten [CLAUDE.md § Naming Conventions](../../../../../CLAUDE.md) (`feature/nama-fitur`).
- Contoh: `feature/1a-permission-users-clients`, `feature/1a-rls-referensi`, `feature/1a-audit-helper`.
- **Tidak ada branch long-lived per Epic** — Epic terlalu besar untuk satu branch (Epic 3 saja 13 task berurutan); branch per Task menjaga PR tetap kecil dan revertable.

## Merge Strategy

- Setiap Task selesai → PR ke `main` → CI hijau (lint+typecheck+test+build) → merge.
- **Solo developer, jadi tidak ada review-orang-lain wajib** — tapi CI hijau adalah gate keras pengganti review manusia untuk Sub-Fase 1A (konsisten R10 di [Risk Register](../Phase1/04-risk-register.md#r10--cicd-gate-memperlambat-kerja-solo-engineer-tanpa-manfaat-proporsional): "CI terutama berguna sebagai pengingat otomatis, bukan gate persetujuan orang lain").
- **Pengecualian — kelompok Finansial RLS (migration 064):** independent review (safeguard B6) **MUST** terjadi meski solo developer — dilakukan lewat sesi AI terpisah tanpa konteks penulisan atau pembacaan manual founder baris-per-baris, **sebelum** merge PR yang menghapus policy lama (contract phase), bukan hanya sebelum expand.
- Push ke `origin` baru dilakukan setelah keputusan founder eksplisit untuk mulai sinkron ke remote — **belum terjadi hari ini**, di luar cakupan dokumen ini untuk memutuskan kapan (keputusan operasional founder, bukan blocker teknis Sub-Fase 1A).

## Release Strategy

**Tidak ada "release" berkala di Sub-Fase 1A** — konsisten [Phase1/02-target-architecture.md:175](../Phase1/02-target-architecture.md): "Deployment tetap manual sampai keputusan platform hosting dibuat (di luar cakupan Phase 1)." Setiap merge ke `main` yang hijau di CI adalah kandidat deploy manual kapan pun founder memutuskan, bukan mengikuti jadwal rilis tetap.

**Tag strategy:** Konsisten pola yang sudah dipakai (`engineering-constitution-v1.1` sebagai contoh Repository Baseline) — tag `phase-1a-complete` dibuat di commit yang memenuhi seluruh Gate 1A→1B checklist, **setelah** approval founder eksplisit, sebagai titik rollback/audit historis untuk seluruh Sub-Fase 1A.

## Rollback Strategy — Per Lapisan

| Lapisan | Mekanisme Rollback | Kecepatan |
|---|---|---|
| **Kode aplikasi** (route handler, helper, lib) | `git revert` per commit — setiap Task adalah satu PR/commit unit, revert murni tanpa efek samping schema | Instan |
| **Schema additive** (kolom nullable, tabel baru tanpa data kritis) | `DROP TABLE`/`DROP COLUMN` via migration baru | Menit |
| **RLS policy (sebelum contract)** | `DROP POLICY` pada policy baru — sistem kembali ke behavior lama sepenuhnya, policy lama tidak pernah disentuh | Instan, nol risiko |
| **RLS policy (setelah contract)** | Re-create policy lama dari `049_rls_policies.sql` (referensi tersimpan) sebagai migration baru — bukan git revert schema | Menit, butuh migration baru ditulis |
| **Data yang sudah dimigrasi/backfill** | Tidak dirancang untuk Sub-Fase 1A — tidak ada backfill data destruktif di 1A (semua additive), jadi rollback data tidak relevan sampai 1C (workflow in-flight backfill) | N/A untuk 1A |

## Backup Strategy

- **Sebelum migration berisiko rendah/sedang (Blok 1-3 di [04-database-migration-plan.md](04-database-migration-plan.md)):** Backup otomatis Supabase dianggap cukup — tidak ada langkah tambahan.
- **Sebelum migration 064 (Finansial):** Backup terverifikasi eksplisit — **bukan** asumsi backup otomatis cukup. Verifikasi status PITR terlebih dahulu (item terbuka, lihat [09-definition-of-ready.md](09-definition-of-ready.md)).

## Hotfix Strategy

**Skenario:** Bug production ditemukan di tengah Sub-Fase 1A (mis. RLS kelompok Operasional yang sudah di-contract ternyata salah desain).

1. Branch `hotfix/<deskripsi-singkat>` langsung dari `main` (bukan dari branch Task yang sedang berjalan).
2. Rollback mengikuti tabel "Rollback Strategy" di atas sesuai lapisan yang bermasalah.
3. **Tidak ada bypass CI untuk hotfix** — bahkan perbaikan darurat tetap lewat lint+typecheck+test+build, karena skala kerusakan RLS/permission yang salah desain justru butuh verifikasi ekstra, bukan lebih sedikit (konsisten prinsip "jangan skip safety net demi kecepatan" yang mengikat seluruh Phase 1).
4. Jika hotfix menyentuh kelompok Finansial: independent review tetap wajib meski darurat — pengecualian atas ini **butuh keputusan founder eksplisit** per insiden, bukan default.

---

*Dokumen selanjutnya: [08 — Day One Checklist](08-day-one-checklist.md) — checklist pre-coding presisi.*
