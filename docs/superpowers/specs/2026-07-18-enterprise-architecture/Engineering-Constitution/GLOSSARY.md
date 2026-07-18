# Glossary — Definisi Istilah Otoritatif

**Kedudukan:** Sesuai [ADR-001 § Kesenjangan 3](adr/ADR-001-structure-and-governance-model.md), ini adalah **satu-satunya sumber definisi** untuk istilah yang dipakai lintas 40 file Engineering Constitution (39 file asli + [40-ai-governance-and-agent-engineering-standard.md](07-domain-specific/40-ai-governance-and-agent-engineering-standard.md) sejak v1.1). Jika sebuah file mendefinisikan istilah secara berbeda dari sini, file itu **salah** — laporkan sebagai inkonsistensi untuk diperbaiki, bukan dianggap definisi alternatif yang sah.
**Prinsip penyusunan:** Setiap definisi di sini **diwarisi**, bukan dibuat baru, dari [Enterprise Architecture Repository](../00-vision-and-business-architecture.md) atau [Phase 1 Planning Package](../Phase1/00-current-state-audit.md) — glosarium ini adalah kompilasi, bukan sumber definisi independen kedua.

---

## A

**ABAC (Attribute-Based Access Control)** — Model otorisasi berbasis atribut environment (waktu, lokasi, device). Status: 🔵 Belum diimplementasikan di Puraloka Suite — lihat [01 — RBAC vs ABAC vs PBAC](../01-application-and-data-architecture.md#dynamic-permission-engine).

**ADR (Architecture Decision Record)** — Dokumen yang mencatat satu keputusan arsitektur signifikan: masalah, alternatif, trade-off, keputusan, konsekuensi. Format presisi: [06-governance/19-architecture-decision-record-guide.md](06-governance/19-architecture-decision-record-guide.md).

**Aggregate Root** — Istilah DDD: entitas yang menjadi titik akses tunggal untuk mengubah sekelompok entitas terkait (aggregate), menjaga invariant tetap konsisten. Di Puraloka Suite, `projects` adalah aggregate root paling dominan — hampir semua domain (RAB, mandor, kasbon, dokumen) berelasi ke `project_id`. Lihat [01 — Entity Strategy](../01-application-and-data-architecture.md#entity-strategy).

**Audit Trail** — Catatan permanen setiap perubahan data kritis (siapa, kapan, apa yang berubah). Skema: `audit_logs` table (migration 009+046). Status implementasi: lihat [Phase1/00 § 3](../Phase1/00-current-state-audit.md#3-audit-trail--current-state).

## B

**Bounded Context** — Istilah DDD: batas konseptual di mana satu model domain (istilah, aturan, entitas) berlaku konsisten. Lihat [00 — Domain Map & Bounded Contexts](../00-vision-and-business-architecture.md#domain-map--bounded-contexts).

## C

**Clean Architecture** — Pola arsitektur yang memisahkan logic bisnis (domain) dari detail teknis (framework, database, UI) lewat lapisan dan Dependency Inversion. Detail penerapan: [02-architecture/03-clean-architecture-rules.md](02-architecture/03-clean-architecture-rules.md).

**Company Scoped Permission** — Izin akses yang dibatasi ke satu company/badan usaha tertentu (relevan mulai L2 — lihat definisi **L1/L2/L3/L4** di bawah). Skema: `permission_scopes` table, [Phase1/02 § 1A.1.1](../Phase1/02-target-architecture.md#1a11-skema-perluasan--rowfieldaction-permission).

**Correlation ID** — Identifier unik per-request (UUID) yang menghubungkan log, audit trail, dan workflow instance yang berasal dari request yang sama, memudahkan penelusuran end-to-end. Lihat [Phase1/08 § Correlation ID](../Phase1/08-observability-plan.md#correlation-id--kontrak-lintas-sub-sistem).

## D

**DDD (Domain-Driven Design)** — Pendekatan desain yang menyelaraskan struktur kode dengan model domain bisnis nyata, memakai Bounded Context, Aggregate Root, Ubiquitous Language. Detail penerapan: [02-architecture/04-domain-driven-design-rules.md](02-architecture/04-domain-driven-design-rules.md).

**Dependency Inversion** — Prinsip SOLID: modul level-tinggi tidak bergantung pada modul level-rendah, keduanya bergantung pada abstraksi. Contoh konkret di Puraloka Suite: route handler bergantung pada `requirePermission(key)` (abstraksi), bukan implementasi RBAC/PBAC konkret. Lihat [Phase1/02 § Prinsip Rekayasa](../Phase1/02-target-architecture.md#prinsip-rekayasa-yang-diterapkan-konkret-bukan-jargon).

## E

**Expand-Contract Migration** — Pola migrasi skema database berisiko rendah: tambah struktur baru (expand), verifikasi berjalan benar, baru hapus struktur lama (contract) — bukan hard-switch sekaligus. Diterapkan presisi untuk RLS refactor di [Phase1/03 § Migrasi 1A.2](../Phase1/03-migration-strategy.md#migrasi-1a2--rls-sinkronisasi-migrasi-paling-berisiko-di-seluruh-phase-1).

## F

**Fail-Closed** — Prinsip keamanan: saat sistem tidak yakin/gagal mengevaluasi otorisasi, defaultnya adalah **menolak akses**, bukan mengizinkan. Contoh: fungsi `has_permission()` mengembalikan `false` untuk permission key yang tidak dikenal. Lihat [Phase1/02 § Prinsip Rekayasa](../Phase1/02-target-architecture.md#prinsip-rekayasa-yang-diterapkan-konkret-bukan-jargon).

**Feature Flag** — Mekanisme mengaktifkan/menonaktifkan fitur tanpa deploy kode, biasanya untuk rollout bertahap. Skema: `feature_flags` table, [Phase1/02 § 1B.3](../Phase1/02-target-architecture.md#1b3-module-registry--feature-flags).

**Field Permission** — Izin akses ke kolom/field spesifik dalam satu entitas (mis. "role X tidak boleh lihat kolom margin"). Status: 🔵 Belum diimplementasikan — nol kasus nyata teramati di audit, lihat [Phase1/02 § 1A.1.1](../Phase1/02-target-architecture.md#1a11-skema-perluasan--rowfieldaction-permission).

## G

**Golden Path** — Skenario penggunaan utama/paling umum dari sebuah fitur, yang harus selalu berfungsi benar dan diuji prioritas tertinggi. Lihat [Phase1/06 § Integration Test](../Phase1/06-test-strategy.md#integration-test--golden-path--kegagalan-finansial-paling-mungkin).

## H

**HITL (Human-in-the-Loop)** — Prinsip desain AI: keputusan yang mengubah data finansial/kontraktual selalu berhenti di titik persetujuan manusia, agent AI tidak pernah mengeksekusi sendiri. Tiga pola: human-in-command, human-on-the-loop, human-after-the-loop. Lihat [06 — Prinsip 5](../06-agentic-ai-and-automation-architecture.md#prinsip-5--human-in-the-loop-hitl-design).

## I

**Idempotency** — Sifat operasi yang menghasilkan efek sama persis meski dijalankan berulang kali dengan input sama (mis. retry aman tanpa duplikasi). Wajib untuk operasi finansial yang mungkin di-retry. Lihat [06 — Idempotency Strategy](../06-agentic-ai-and-automation-architecture.md#queue-strategy-retry-strategy-dead-letter-queue-idempotency-strategy).

## L

**L1 / L2 / L3 / L4** — Empat horizon evolusi arsitektur Puraloka Suite: L1 = single-tenant internal (Puraloka Persada saja, kondisi hari ini), L2 = multi-company (grup usaha, belum multi-tenant), L3 = commercial SaaS (pelanggan eksternal), L4 = regional enterprise. Lihat [00 — Long-Term SaaS Vision](../00-vision-and-business-architecture.md#long-term-saas-vision-l1--l4-evolution-model).

## M

**Maturity Badge** — Penanda status implementasi per file Engineering Constitution: 🟢 Enforced, 🟡 Partial, 🔵 Designed. Lihat [README § Maturity Badge](README.md#maturity-badge--cara-membaca-status-setiap-file).

**Modular Monolith** — Gaya arsitektur: satu deployable unit (proses aplikasi tunggal), tapi kode dipisah secara jelas per domain/modul secara internal. Gaya arsitektur default Puraloka Suite hingga ada driver operasional nyata untuk ekstraksi service. Lihat [01 — Modular Monolith Strategy](../01-application-and-data-architecture.md#modular-monolith-strategy).

## P

**PBAC (Policy-Based Access Control)** — Model otorisasi berbasis kombinasi role + atribut resource (mis. "PM hanya boleh approve kasbon untuk proyek yang dia pimpin"). Status: 🟡 Fondasi diletakkan Phase 1A, generalisasi penuh ditunda. Lihat [Phase1/02 § RBAC → PBAC](../Phase1/02-target-architecture.md#1a1-permission-engine-v2--desain-konsolidasi).

**Permission Scope** — Lihat **Company Scoped Permission** / **Project Scoped Permission**.

**Project Scoped Permission** — Izin akses yang dibatasi ke proyek tertentu (mis. PM hanya mengelola proyek yang di-assign ke dia). Contoh nyata sudah teramati di kode sebelum diformalkan sebagai data eksplisit — lihat [Phase1/00 § 1.5](../Phase1/00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file).

## R

**RBAC (Role-Based Access Control)** — Model otorisasi berbasis role (admin/pm/mandor/client), permission melekat ke role bukan ke user langsung. Fondasi Puraloka Suite (migration 050: `roles`/`permissions`/`role_permissions`). Status: 🟡 Konsolidasi sedang berjalan Phase 1A — lihat [Phase1/01 — Gap 1](../Phase1/01-gap-analysis.md#gap-1--permission-engine-tiga-mekanisme-paralel).

**RFC 2119** — Standar kosakata kewajiban (MUST/SHOULD/MAY) yang dipakai seragam di seluruh Engineering Constitution. Lihat [ADR-002](adr/ADR-002-enforcement-levels-and-template.md).

**RLS (Row Level Security)** — Fitur PostgreSQL yang membatasi baris mana yang bisa diakses/dimodifikasi tiap user langsung di level database, independen dari application layer. Status kritis: lihat [Phase1/00 § 2](../Phase1/00-current-state-audit.md#2-rls-row-level-security--current-state) — saat ini nol sinkron dengan RBAC v2.

**Row Permission** — Lihat **RLS**.

## S

**Sub-Fase 1A/1B/1C/1D** — Empat pembagian Phase 1 (Core Platform Foundation): 1A Security Foundation, 1B Configuration Foundation, 1C Workflow Foundation, 1D Platform Foundation (Observability). Lihat [Phase1/02 — Struktur Sub-Fase](../Phase1/02-target-architecture.md#struktur-dokumen-sub-fase-1a--1d).

## T

**Tenant** — Satu entitas pelanggan independen dalam sistem multi-tenant (relevan L3+). Di L1, hanya ada 1 tenant implisit (Puraloka Persada). Lihat [00 Glossary](../00-vision-and-business-architecture.md#glossary).

## W

**Workflow Instance** — Satu eksekusi konkret dari sebuah workflow definition (mis. satu pengajuan kasbon spesifik yang sedang berjalan lewat state approval). Skema: `workflow_instances` table, [Phase1/02 § 1C](../Phase1/02-target-architecture.md#sub-fase-1c--workflow-foundation).

---

*Istilah baru yang muncul selama penulisan constitution (39 file asli, kini 40 sejak v1.1) ditambahkan ke sini secara berkelanjutan (living document, sama seperti seluruh Engineering Constitution — lihat [Amendment Process](00-principles/00-engineering-principles.md#9-amendment-process)).*
