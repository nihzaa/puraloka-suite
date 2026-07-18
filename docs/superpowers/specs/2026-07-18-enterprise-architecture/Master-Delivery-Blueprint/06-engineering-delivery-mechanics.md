# 06 — Engineering Delivery Mechanics: Migration, Release, Branching, Versioning, Rollback

**Kedudukan dokumen ini:** Referensi Penuh — kelima topik ini sudah punya jawaban lengkap dan matang di dokumen lain. File ini murni **navigasi cepat**, sengaja dibuat ringkas tanpa narasi tambahan — menambah kata-kata di sini tanpa menambah informasi baru justru bertentangan dengan tujuan orkestrasi ([ADR-003](../adr/ADR-003-master-delivery-blueprint-as-orchestration-layer.md)).

---

| Topik | Sumber Tunggal (Prinsip Lintas-Fase) | Sumber Tunggal (Aturan Kode) |
|---|---|---|
| **Migration Strategy** | [04-roadmap-governance-and-delivery.md § Migration Strategy](../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase) — backward-compatible per deploy cycle, strangler-fig untuk engine hardcoded, feature flag untuk perubahan authorization | [Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md](../Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md) (Expand-Contract, idempotent-safe) + [Phase1/03-migration-strategy.md](../Phase1/03-migration-strategy.md) (detail Migrasi 1A.1-1D) |
| **Release Strategy** | [04-roadmap-governance-and-delivery.md § Release Strategy](../04-roadmap-governance-and-delivery.md#release-strategy) — Now (manual, L1), Next (CI gate wajib, L2+), Later (blue-green/canary, multi-company) | [Engineering-Constitution/05-team-process/21-checklist-before-release.md](../Engineering-Constitution/05-team-process/21-checklist-before-release.md) |
| **Branching Strategy** | *(tidak ada prinsip lintas-fase terpisah — sama di seluruh fase)* | [Engineering-Constitution/05-team-process/14-git-workflow-standard.md](../Engineering-Constitution/05-team-process/14-git-workflow-standard.md) (`feature/`/`fix/` pattern, branch protection dipicu kontributor kedua) |
| **Versioning Strategy** | *(tidak ada prinsip lintas-fase terpisah)* | [Engineering-Constitution/06-governance/25-versioning-standard.md](../Engineering-Constitution/06-governance/25-versioning-standard.md) (`/api/v1/` sudah ada, breaking change butuh Expand-Contract atau versi baru) |
| **Rollback Strategy** | [04-roadmap-governance-and-delivery.md § Rollback Strategy](../04-roadmap-governance-and-delivery.md#rollback-strategy-prinsip-lintas-fase) | [Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md § Migration Strategy](../Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md#9-migration-strategy) (rencana rollback tertulis wajib untuk migrasi berisiko tinggi) |

## Satu Titik Orkestrasi yang Perlu Ditambahkan

**Urutan penerapan lintas Program:** Kelima mekanika di atas berlaku **sama** di seluruh Program A-F — tidak ada mekanika migrasi/release/branching/versioning/rollback yang berbeda per Program. Satu-satunya yang **berubah** seiring Program berjalan adalah **ketatnya penerapan**, mengikuti evolusi tim di [03-team-topology-and-resourcing.md § 4](03-team-topology-and-resourcing.md#4-topology-per-skala--evolusi-bertahap):

- **Skala 1 (Solo, Program A-B awal):** Release manual masih diterima ([04 § Release Strategy "Now"](../04-roadmap-governance-and-delivery.md#release-strategy)), branch protection belum aktif.
- **Skala 2 (2 kontributor, mulai Program B/C):** CI gate wajib aktif ([04 § Release Strategy "Next"](../04-roadmap-governance-and-delivery.md#release-strategy)), branch protection `main` aktif ([Engineering-Constitution/05-team-process/14-git-workflow-standard.md Mandatory Rule #4](../Engineering-Constitution/05-team-process/14-git-workflow-standard.md#4-mandatory-rules)).
- **Skala 3-4 (Program D2 `company_id` ke atas):** Blue-green/canary deployment mulai relevan ([04 § Release Strategy "Later"](../04-roadmap-governance-and-delivery.md#release-strategy)) — begitu lebih dari satu company bergantung pada uptime yang sama.

## References

- [04-roadmap-governance-and-delivery.md § Migration Strategy, Rollback Strategy, Release Strategy](../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase)
- [Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md](../Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md)
- [Engineering-Constitution/05-team-process/14-git-workflow-standard.md](../Engineering-Constitution/05-team-process/14-git-workflow-standard.md)
- [Engineering-Constitution/06-governance/25-versioning-standard.md](../Engineering-Constitution/06-governance/25-versioning-standard.md)
- [Engineering-Constitution/05-team-process/21-checklist-before-release.md](../Engineering-Constitution/05-team-process/21-checklist-before-release.md)
- [03-team-topology-and-resourcing.md § 4](03-team-topology-and-resourcing.md#4-topology-per-skala--evolusi-bertahap)

---

*File selanjutnya: [07-quality-and-validation-gates.md](07-quality-and-validation-gates.md)*
