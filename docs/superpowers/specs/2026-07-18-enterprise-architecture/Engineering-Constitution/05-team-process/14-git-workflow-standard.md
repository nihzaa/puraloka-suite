# 14 — Git Workflow Standard

> **Maturity:** 🟡 Partial — Conventional Commits dan `feature/`/`fix/` branch naming sudah 100% konsisten diikuti ([22-project-conventions.md](../01-foundations/22-project-conventions.md)); yang belum ada adalah proses PR terstruktur (branch protection, required review) karena pengembangan hari ini masih solo developer.

**Kedudukan:** Batch 5 — Proses Tim. Detail proses di atas konvensi penamaan yang sudah ditetapkan [22-project-conventions.md](../01-foundations/22-project-conventions.md). Melengkapi [11-devsecops-standard.md](11-devsecops-standard.md) (gate otomatis) dan [15-code-review-checklist.md](15-code-review-checklist.md) (gate manual).

---

## 1. Purpose

Menyiapkan proses Git yang **skalanya siap bertambah dari solo developer ke tim** — konvensi yang sudah baik hari ini (Conventional Commits, branch naming) dipertahankan, ditambah struktur yang baru relevan begitu ada lebih dari satu kontributor (branch protection, review wajib).

## 2. Background

Riwayat commit Puraloka Suite hari ini 100% konsisten Conventional Commits tanpa satu pun pelanggaran tercatat ([22-project-conventions.md § Mandatory Rule #2](../01-foundations/22-project-conventions.md#4-mandatory-rules)). Branch naming `feature/nama-fitur`, `fix/nama-bug` sudah ditetapkan di CLAUDE.md sejak awal proyek. Karena pengembangan hari ini masih solo developer (Nizar), proses PR formal (required review, branch protection) belum diterapkan — bukan kelalaian, tapi belum ada kontributor kedua yang membutuhkannya. File ini menyiapkan proses tersebut untuk diaktifkan begitu tim bertambah.

## 3. Principles

1. **`main` MUST selalu dalam kondisi deployable.** Commit langsung ke `main` tanpa lewat branch fitur berisiko membawa kondisi setengah-jadi ke branch yang seharusnya selalu siap deploy.
2. **Riwayat commit adalah dokumentasi, bukan hanya mekanisme versi.** Sudah menjadi prinsip di [22-project-conventions.md Principle #2](../01-foundations/22-project-conventions.md#3-principles) — dipertegas di sini untuk proses branching: satu PR **SHOULD** mewakili satu unit kerja logis yang bisa dijelaskan dalam satu judul, bukan gabungan beberapa fitur tidak berhubungan.
3. **Proses bertambah ketat seiring tim bertambah, bukan diterapkan berlebihan di awal.** Branch protection wajib review baru bermakna begitu ada reviewer kedua — mewajibkannya untuk solo developer hanya menambah friksi tanpa manfaat keamanan nyata.

## 4. Mandatory Rules

1. Branch baru **MUST** mengikuti pola `feature/nama-fitur` atau `fix/nama-bug` — konsisten [22-project-conventions.md Mandatory Rule #5](../01-foundations/22-project-conventions.md#4-mandatory-rules), tidak diulang detailnya di sini.
2. Commit message **MUST** Conventional Commits — sama, dirujuk dari [22-project-conventions.md Mandatory Rule #2](../01-foundations/22-project-conventions.md#4-mandatory-rules).
3. Perubahan pada domain finansial-kritis (enam file yang sama dengan [03-clean-architecture-rules.md § Migration Strategy](../02-architecture/03-clean-architecture-rules.md#9-migration-strategy)) **MUST** lewat branch terpisah dan PR (bahkan untuk solo developer) — **MUST NOT** commit langsung ke `main` untuk domain ini, karena riwayat PR menjadi dokumentasi keputusan yang berharga saat diaudit belakangan.
4. Begitu kontributor kedua bergabung, `main` **MUST** diaktifkan branch protection: minimal satu review approval sebelum merge, status check CI ([11-devsecops-standard.md](11-devsecops-standard.md)) wajib lolos — **MUST NOT** ditunda setelah kontributor kedua benar-benar mulai commit.

## 5. Recommended Rules

1. Satu PR **SHOULD** dijaga fokus pada satu unit kerja logis — PR yang mencampur refactor tidak terkait dengan fitur baru **SHOULD** dipecah, kecuali refactor tersebut adalah prasyarat langsung fitur (selaras [00-principles/00-engineering-principles.md Prinsip YAGNI](../00-principles/00-engineering-principles.md#3-principles) — tidak ada PR "sambil beresin ini juga" tanpa kaitan).
2. Branch fitur yang berumur lebih dari ~2 minggu tanpa merge **SHOULD** ditinjau — kemungkinan besar terlalu besar dan perlu dipecah, atau terhambat blocker yang perlu diselesaikan.

## 6. Anti-Pattern

**Commit Langsung ke Main untuk Perubahan Finansial** — melewati proses branch/PR untuk perubahan yang menyentuh kalkulasi kasbon/RAB/pembayaran dengan alasan "cuma perubahan kecil, solo developer juga." Risiko: hilangnya jejak PR description yang menjelaskan *kenapa* perubahan dibuat — informasi yang sangat berharga saat debugging insiden finansial belakangan, bahkan untuk solo developer di masa depan yang lupa konteks aslinya.

**Branch Protection Diaktifkan Terlalu Dini untuk Solo Developer** — mewajibkan review approval saat hanya ada satu developer memaksa self-approval yang tidak bermakna, hanya menambah langkah administratif tanpa manfaat keamanan — bertentangan Principle #3.

## 7. Example Good

```
feat: RAB komponen biaya, progress dual-mode & Kurva S/EVM (migration 052)
```
Commit riil dari riwayat proyek — jelas, Conventional Commits, menyebut migration terkait, konsisten Mandatory Rule #2.

## 8. Example Bad

*(Hipotetis)*: `git commit -m "update"` langsung ke `main` untuk perubahan pada `kasbons.ts` — melanggar Mandatory Rule #2 (bukan Conventional Commits) dan Mandatory Rule #3 (domain finansial-kritis, seharusnya lewat branch+PR).

## 9. Migration Strategy

**Untuk Mandatory Rule #1, #2** — N/A, sudah 100% konsisten (sama dengan [22-project-conventions.md § Migration Strategy](../01-foundations/22-project-conventions.md#9-migration-strategy)).

**Untuk Mandatory Rule #3 (branch+PR wajib untuk domain finansial)** — berlaku mulai commit pertama setelah Engineering Constitution ini disahkan; commit langsung ke `main` untuk domain finansial sebelum tanggal ini tidak dianggap pelanggaran retroaktif.

**Untuk Mandatory Rule #4 (branch protection)** — 🔵 Designed, N/A sampai kontributor kedua benar-benar bergabung — dicatat sebagai trigger kondisional eksplisit, bukan tanggal pasti.

## 10. Checklist

- [ ] Branch baru mengikuti `feature/`/`fix/` pattern
- [ ] Commit message Conventional Commits
- [ ] Perubahan domain finansial-kritis lewat branch + PR, tidak langsung ke `main`
- [ ] (Setelah kontributor kedua bergabung) branch protection `main` aktif

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Commit langsung ke `main` untuk domain finansial | 0 sejak Engineering Constitution disahkan | Audit `git log --first-parent main` |
| Branch tidak mengikuti naming convention | 0 | Review manual periodik |
| Waktu aktivasi branch protection setelah kontributor kedua bergabung | Sama hari | Audit langsung |

## 12. References

- [01-foundations/22-project-conventions.md](../01-foundations/22-project-conventions.md)
- [11-devsecops-standard.md](11-devsecops-standard.md)
- [15-code-review-checklist.md](15-code-review-checklist.md)
- CLAUDE.md § Naming Conventions (internal)

---

*File selanjutnya: [15-code-review-checklist.md](15-code-review-checklist.md)*
