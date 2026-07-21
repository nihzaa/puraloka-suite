# Implementation Kickoff — 01. Implementation Readiness Scorecard

**Tanggal penilaian:** 18 Juli 2026, setelah Phase 1A.0 Repository Remediation selesai (commit `43ad54d`).
**Metodologi:** Setiap dimensi diberi skor 0-10, alasan, dan evidence file:line. Skor **bukan** rata-rata perasaan — ia mencerminkan "seberapa siap dimensi ini untuk menyerap baris kode Sub-Fase 1A pertama tanpa henti-mendadak karena kekurangan fondasi."
**Sumber:** Sintesis dari [Phase1/00-09](../Phase1/00-current-state-audit.md), [Master-Delivery-Blueprint/04](../Master-Delivery-Blueprint/04-delivery-orchestration.md), ground-truth grep langsung terhadap `apps/api/src/` per 18 Juli 2026 (lihat catatan verifikasi di tiap baris).

---

## Skor per Dimensi

| # | Dimensi | Skor | Alasan | Evidence |
|---|---|---|---|---|
| 1 | **Architecture** | 9/10 | Desain Sub-Fase 1A (Permission Engine, RLS, Audit, Test, CI/CD) sudah lengkap sampai level skema SQL dan kontrak TypeScript — bukan lagi konsep. -1 karena satu dokumen sumber (`00-current-state-audit.md:52`) masih menyebut "103" `requirePermission` sementara dokumen lain dan grep langsung menyebut 102 — inkonsistensi kecil di dalam korpus yang sudah "final," dilaporkan sebagai finding, bukan blocker. | [Phase1/02-target-architecture.md](../Phase1/02-target-architecture.md), lihat juga F1 di [02-phase-1a-sequence.md](02-phase-1a-sequence.md) |
| 2 | **Repository** | 6/10 *(direvisi turun dari 8/10 — lihat koreksi)* | Branch `main` bersatu dengan `origin/main` (`ahead 37, behind 0`). **⚠️ Klaim migration folder sinkron 100% di draft awal dimensi ini SALAH** — adversarial review + reverifikasi `diff` langsung menemukan `db/migrations/`=57 file, `supabase/migrations/`=58 file, TIDAK sinkron (`059_seed_dummy_data.sql` tanpa pasangan). Ini kontradiksi langsung dengan hasil B2 remediation sebelumnya yang melaporkan sinkron — lihat Finding F3 di [10-go-no-go-checklist.md](10-go-no-go-checklist.md). -2 tambahan untuk gap sinkronisasi yang harus diselesaikan (backfill atau keputusan sadar) sebelum migration Sub-Fase 1A pertama; -2 untuk belum ada `.github/` sama sekali; working tree belum pernah di-push ke origin (37 commit lokal murni). | `diff <(cd db/migrations && ls *.sql \| sort) <(cd supabase/migrations && ls *.sql \| sort)` → `057a58 > 059_seed_dummy_data.sql`, `git log --oneline -8` (HEAD `43ad54d`), `git status --short --branch` → `## main...origin/main [ahead 37]` |
| 3 | **Database** | 7/10 | 58 migration file berurutan rapi, RLS aktif di 50 statement, skema RBAC v2 (migration 050) sudah solid dan berjalan di production. -3 karena RLS 100% buta terhadap RBAC v2 (nol referensi ke `role_permissions` di `049_rls_policies.sql`, dikonfirmasi grep) — ini gap tunggal terbesar di seluruh Phase 1A. | [Phase1/00-current-state-audit.md § 2](../Phase1/00-current-state-audit.md#2-rls-row-level-security--current-state), [Phase1/01-gap-analysis.md § Gap 2](../Phase1/01-gap-analysis.md#gap-2--rls-tidak-sinkron-dengan-rbac-v2) |
| 4 | **API** | 8/10 | `requirePermission` sudah pola dominan (102 call site live-verified, bukan estimasi), kontrak endpoint tidak akan berubah selama migrasi (permission check adalah isi fungsi, bukan interface). -2 untuk 4 sisa `requireRole` + ~21 baris inline authorization-gate yang masih harus dimigrasi. | `grep -n "requireRole(" apps/api/src/routes/v1/*.ts apps/api/src/plugins/*.ts` = 4 hasil (`audit.ts:10`, `audit.ts:59`, `reports.ts:967`, `reports.ts:1038`), `grep -c "requirePermission("` total = 102 (re-verified 18 Juli 2026) |
| 5 | **Permission** | 7/10 | Sumber kebenaran tunggal (`role_permissions`) sudah ada dan dominan di API layer. -3 karena RLS layer sepenuhnya independen (lihat Database) dan klasifikasi 57 baris inline `.role === 'x'` (21 authorization-gate vs 36 data-scoping) baru estimasi manual, belum diverifikasi baris-per-baris — [Phase1/02-target-architecture.md:49](../Phase1/02-target-architecture.md) sendiri mewajibkan reverifikasi jumlah ini di awal eksekusi 1A, bukan diasumsikan permanen. | [Phase1/00-current-state-audit.md § 1.5](../Phase1/00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file) |
| 6 | **Security** | 7/10 | Threat model dan OWASP Top 10 review sudah dilakukan ([Phase1/07-security-review.md](../Phase1/07-security-review.md)), safeguard B6/B7/B8 (independent review, interim detection, maintenance window) sudah melekat ke prosedur migrasi RLS Finansial. -3 karena safeguard ini baru **prosedur di atas kertas** — belum pernah dieksekusi sungguhan, dan PITR Supabase belum diverifikasi status-nya (item administratif, belum dikerjakan). | [Phase1/03-migration-strategy.md:51-52](../Phase1/03-migration-strategy.md), [Phase1/07-security-review.md:56](../Phase1/07-security-review.md) |
| 7 | **Testing** | 2/10 | Nol infrastruktur — dikonfirmasi ulang hari ini: tidak ada `*.test.ts`, tidak ada `vitest.config.*`, tidak ada script `test` fungsional di `apps/api/package.json` maupun root `package.json` (root hanya placeholder `"echo Error: no test specified && exit 1"`). +2 karena strategi test (Vitest, pure-function extraction, coverage 90% khusus `lib/`, RLS test pattern) sudah didesain lengkap dan realistis — bukan "belum dipikirkan," hanya "belum dieksekusi." | `find apps -iname "*.test.ts" -o -iname "vitest.config*"` = kosong, [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md) |
| 8 | **CI/CD** | 1/10 | Nol infrastruktur — dikonfirmasi ulang hari ini: tidak ada folder `.github/` sama sekali di root repo. `apps/web/package.json` punya script `lint`, `apps/api/package.json` bahkan tidak punya script `lint`. +1 karena desain `ci.yml` (lint→typecheck→test→build) sudah konkret di [Phase1/02-target-architecture.md § 1A.5](../Phase1/02-target-architecture.md#1a5-cicd-foundation). | `find . -maxdepth 2 -iname ".github"` = kosong, `cat apps/api/package.json` scripts = `{dev, build, start}` (tidak ada `lint`, `test`) |
| 9 | **Migration** | 8/10 | Prinsip non-negotiable migrasi (additive-first, no destructive edit ke migration ter-apply, expand-contract untuk RLS, per-tabel bukan big-bang) sudah eksplisit dan konsisten di seluruh Phase1 set. -2 karena migration 1A.2 (RLS Finansial) adalah migrasi paling berisiko di seluruh Phase 1, dan ~17 tabel tanpa RLS belum dienumerasi eksplisit satu per satu (baru estimasi angka). | [Phase1/03-migration-strategy.md § Prinsip Non-Negotiable](../Phase1/03-migration-strategy.md#prinsip-non-negotiable-untuk-seluruh-migrasi-phase-1) |
| 10 | **Observability** | 6/10 | Desain lengkap untuk 1D (environment-aware logger, correlation ID via `genReqId` built-in Fastify, RED metrics contract, `/health` diperluas) — 1D eksplisit **persiapan**, bukan full APM, jadi ekspektasi sudah dikalibrasi realistis sejak awal. -4 karena 1D urutannya **setelah** 1A-1C selesai (lihat [Phase1/05-rollout-plan.md](../Phase1/05-rollout-plan.md)) — dimensi ini tidak relevan untuk hari-pertama-coding, skor mencerminkan kesiapan desain bukan kesiapan eksekusi-sekarang. | [Phase1/08-observability-plan.md](../Phase1/08-observability-plan.md) |
| 11 | **Deployment** | N/A (di luar cakupan Sub-Fase 1A) | Keputusan platform hosting eksplisit di luar cakupan Phase 1 ([Phase1/02-target-architecture.md:175](../Phase1/02-target-architecture.md)) — CI adalah *gate*, bukan *deploy pipeline*, di Sub-Fase 1A. Tidak diberi skor numerik karena bukan gap yang harus ditutup untuk mulai coding 1A.1. | [Phase1/02-target-architecture.md § 1A.5](../Phase1/02-target-architecture.md#1a5-cicd-foundation) |
| 12 | **Documentation** | 9/10 | 10 dokumen Phase1 set + 13 dokumen Master-Delivery-Blueprint + 40 dokumen Engineering Constitution, semuanya cross-linked, semuanya melalui minimal 2 pass independent re-review. -1 untuk dua stale number yang sudah dilaporkan sebelumnya (103-vs-102 di dua lokasi berbeda — Blueprint dan `Phase1/00`/`01`, lihat F1 di [02-phase-1a-sequence.md](02-phase-1a-sequence.md)). | [Phase1/09-definition-of-done.md](../Phase1/09-definition-of-done.md) |
| 13 | **Engineering Process** | 8/10 | Engineering Constitution v1.1 FROZEN sebagai governance baseline, Amendment Process eksplisit, RFC 2119 vocabulary konsisten, git tag `engineering-constitution-v1.1` sebagai repository baseline. -2 karena proses ini belum pernah diuji lewat implementasi kode sungguhan — semua sejauh ini adalah dokumentasi murni. | [Engineering-Constitution/](../Engineering-Constitution/README.md), `2026-07-18-v1.1-freeze.md` |
| 14 | **Release** | 3/10 | Belum ada branch strategy, tag strategy, atau rollback strategy yang ditulis eksplisit untuk *implementasi kode* (berbeda dari rollback *migration* yang sudah didesain lengkap per-langkah di [Phase1/03-migration-strategy.md](../Phase1/03-migration-strategy.md)). +3 karena prinsip dasarnya (Git revert murni untuk kode, migration terpisah untuk schema rollback) sudah konsisten disebut berulang. Dokumen ini (07) mengisi gap tersebut. | Lihat [07-release-and-rollback-plan.md](07-release-and-rollback-plan.md) untuk penutupan gap ini |
| 15 | **Business Readiness** | 8/10 | Founder (solo developer + pemilik keputusan) sudah memberikan otorisasi eksplisit dan presisi untuk setiap fase remediasi sebelumnya, menunjukkan pola keterlibatan aktif di setiap gate keputusan (bukan rubber-stamp). -2 karena Gate 1 doc04 (Architecture Review Gate) untuk Sub-Fase 1A **belum pernah benar-benar dijalankan sebagai entry terpisah** — ini persis item baru di [Phase1/09-definition-of-done.md:11-12](../Phase1/09-definition-of-done.md) yang harus dipenuhi **sebelum** baris kode 1A.1 pertama. | [Phase1/09-definition-of-done.md § Architecture Review Gate](../Phase1/09-definition-of-done.md#architecture-review-gate-v11--item-baru) |

---

## Ringkasan Skor

| Kategori | Skor |
|---|---|
| Architecture | 9/10 |
| Repository | 6/10 *(direvisi turun dari 8/10 setelah adversarial review menemukan klaim migration-sync draft awal salah — lihat baris 2 di atas)* |
| Database | 7/10 |
| API | 8/10 |
| Permission | 7/10 |
| Security | 7/10 |
| Testing | 2/10 |
| CI/CD | 1/10 |
| Migration | 8/10 |
| Observability | 6/10 |
| Deployment | N/A |
| Documentation | 9/10 |
| Engineering Process | 8/10 |
| Release | 3/10 |
| Business Readiness | 8/10 |
| **Rata-rata (14 dimensi berskor, Deployment dikecualikan)** | **6.4/10** *(direvisi dari 6.5/10)* |

---

## Interpretasi — Kenapa 6.4/10 Bukan Sinyal "Belum Siap"

Skor rata-rata 6.4/10 **bukan** ukuran "seberapa jauh dari selesai" — dua dimensi dengan skor terendah (Testing 2/10, CI/CD 1/10) **memang secara sengaja nol** hari ini karena keduanya **adalah** item pertama yang dikerjakan di Sub-Fase 1A itu sendiri ([Phase1/05-rollout-plan.md](../Phase1/05-rollout-plan.md): "Setup Vitest + CI/CD di paling awal, bukan di tengah"). Skor rendah di sini bukan blocker untuk memulai — ia **adalah** definisi pekerjaan hari pertama. Repository turun ke 6/10 bukan karena kondisi repo memburuk, tapi karena penilaian **awal terhadap kondisi itu** sempat salah (migration sync) dan sekarang dikoreksi ke angka yang jujur mencerminkan gap nyata (folder desync yang harus diselesaikan sebelum migration pertama).

Dimensi yang benar-benar relevan sebagai **prasyarat mulai coding** (Architecture, Repository, Documentation, Engineering Process, Migration strategy) semuanya di atas 7.5/10. Tidak ada dimensi prasyarat yang berada di bawah ambang blocking.

**Satu gap prosedural nyata yang harus ditutup sebelum baris kode pertama:** Architecture Review Gate (Business Readiness, item 15) — bukan karena desainnya belum matang, tapi karena ia adalah *entry* administratif yang menurut definisinya sendiri harus dicatat sebagai keputusan terpisah dengan jeda minimal 1 hari, bukan diasumsikan otomatis terpenuhi oleh checklist teknis. Lihat [08-day-one-checklist.md](08-day-one-checklist.md) item pertama.

---

*Dokumen selanjutnya: [02 — Phase 1A Sequence](02-phase-1a-sequence.md) — breakdown eksekusi 1A.1 hingga 1A.5.*
