# Kickoff Package — Sub-Fase 1B (Configuration Foundation)

**Program A (= Phase 1), Sub-Fase 1B.** Bagian kedua Program A setelah Sub-Fase 1A (Security Foundation) selesai & Gate 1A→1B approved (2026-07-23). Penomoran: [../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md](../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md).

## Isi paket

**Perencanaan (00-10)** — ditulis sebelum mulai:
| File | Isi |
|---|---|
| [00-executive-summary.md](00-executive-summary.md) | Readiness score + starting point |
| [01-implementation-readiness.md](01-implementation-readiness.md) | Skor per dimensi + evidence file:line |
| [02-sub-fase-1b-sequence.md](02-sub-fase-1b-sequence.md) | 1B.1-1B.4 sebagai unit eksekusi |
| [03-folder-and-module-order.md](03-folder-and-module-order.md) | Urutan file/modul presisi |
| [04-database-migration-plan.md](04-database-migration-plan.md) | Migration mulai 075 |
| [05-feature-implementation-order.md](05-feature-implementation-order.md) | Dependency graph Epic-level |
| [06-testing-execution-plan.md](06-testing-execution-plan.md) | Kapan tiap test dijalankan |
| [07-release-and-rollback-plan.md](07-release-and-rollback-plan.md) | Branch/rollback per migration |
| [08-day-one-checklist.md](08-day-one-checklist.md) | Pre-coding checklist |
| [09-definition-of-ready.md](09-definition-of-ready.md) | DoR per task |
| [10-go-no-go-checklist.md](10-go-no-go-checklist.md) | Go/No-Go + adversarial review |

**Eksekusi** — hidup selama fase:
| File | Isi |
|---|---|
| [STATUS.md](STATUS.md) | Living ledger status per-epik |
| [execution/1b2-menu-registry.md](execution/1b2-menu-registry.md) | Execution plan refactor sidebar (kompleks) |
| [execution/1b4-role-enum-migration.md](execution/1b4-role-enum-migration.md) | Execution plan enum→FK (Red-Line) |
| [SUB-FASE-1B-COMPLETION-AUDIT.md](SUB-FASE-1B-COMPLETION-AUDIT.md) | Template audit gate akhir (kosong) |

`execution/` untuk 1B.1 & 1B.3 **sengaja di-skip** — additive + pola lugas, cukup di sequence doc (alasan di [02](02-sub-fase-1b-sequence.md)). Decision log **tidak diperlukan** untuk core 1B — satu-satunya keputusan founder (1B.4 Opsi A/B) dicatat di sequence § 1B.4.

## Lingkup (dari Phase1/02-target-architecture.md § SUB-FASE 1B)

1B.1 Configuration Engine · 1B.2 Menu Registry · 1B.3 Module Registry & Feature Flags · 1B.4 users.role enum→FK (opsional, terakhir, Red-Line).

## Autopilot

Fase ini dijalankan di bawah [../../../../../AUTOPILOT.md](../../../../../AUTOPILOT.md): otonom penuh di Green-Zone (1B.1-1B.3 additive), **DANGER GATE** di 1B.4 (enum migration = Red-Line #1).
