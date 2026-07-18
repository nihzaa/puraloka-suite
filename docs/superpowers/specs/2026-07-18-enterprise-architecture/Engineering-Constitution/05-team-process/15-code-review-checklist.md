# 15 — Code Review Checklist

> **Maturity:** 🔵 Designed — belum ada proses review formal (solo developer hari ini); kontrak yang berlaku penuh begitu kontributor kedua bergabung, dirancang sebagai agregasi checklist dari file lain, bukan daftar baru independen.

**Kedudukan:** Batch 5 — Proses Tim. Sesuai [README.md § Jalur 3 — Reviewer](../README.md#jalur-3--reviewer-verifikasi-pr-terhadap-checklist) dan [ADR-002 § Bagian 10](../adr/ADR-002-enforcement-levels-and-template.md), file ini mengagregasi item Checklist (Bagian 10) dari file lain yang relevan — bukan menciptakan aturan baru independen.

---

## 1. Purpose

Memberikan reviewer satu titik masuk untuk verifikasi PR, tanpa harus membuka 39 file Engineering Constitution satu per satu setiap kali review — checklist ini mengagregasi, bukan menggantikan detail di file sumber.

## 2. Background

Setiap file Engineering Constitution punya Bagian 10 "Checklist" sendiri ([ADR-002 § format 12-bagian](../adr/ADR-002-enforcement-levels-and-template.md)) — file ini mengumpulkan item yang **paling sering relevan lintas domain** (bukan seluruh item dari 39 file, yang akan membuat checklist ini sendiri tidak terpakai karena terlalu panjang). Item spesifik-domain (mis. constraint RAB) tetap dirujuk ke file sumbernya untuk PR yang menyentuh domain tersebut.

## 3. Principles

1. **Checklist ini adalah indeks, bukan pengganti membaca file sumber untuk perubahan domain-spesifik.** Reviewer PR yang menyentuh RLS **MUST** tetap membuka [03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md) untuk detail lengkap, bukan hanya mengandalkan baris ringkas di sini.
2. **Item MUST di checklist ini adalah blocking — PR tidak lolos tanpa semua tercentang atau deviasi terjustifikasi.** Item SHOULD boleh dideviasi dengan catatan di PR description (konsisten [README.md § Jalur 2](../README.md#jalur-2--engineer-berpengalaman-referensi-cari-aturan-spesifik)).

## 4. Mandatory Rules

1. Reviewer **MUST** memverifikasi checklist umum di Bagian 5 pada setiap PR, tanpa terkecuali.
2. Reviewer **MUST** memverifikasi checklist domain-spesifik tambahan (Bagian 6) jika PR menyentuh domain yang relevan (finansial, database schema, endpoint API baru).
3. PR yang menyentuh domain finansial-kritis **MUST** direview oleh seseorang selain penulis PR begitu kontributor kedua tersedia — **MUST NOT** self-approve untuk domain ini bahkan setelah tim bertambah (pengecualian solo developer per [14-git-workflow-standard.md](14-git-workflow-standard.md) hanya berlaku sebelum kontributor kedua ada).

## 5. Checklist Umum (Setiap PR)

- [ ] `tsc --noEmit` lolos ([01-foundations/01-coding-standards.md](../01-foundations/01-coding-standards.md))
- [ ] Nama file/variabel/fungsi konsisten konvensi (`kebab-case` file, `camelCase`/`PascalCase` kode — [01-foundations/01-coding-standards.md](../01-foundations/01-coding-standards.md))
- [ ] File baru ditempatkan sesuai domain, bukan folder generik ([01-foundations/02-folder-architecture.md](../01-foundations/02-folder-architecture.md))
- [ ] Commit message Conventional Commits, branch naming sesuai pola ([01-foundations/22-project-conventions.md](../01-foundations/22-project-conventions.md))
- [ ] Tidak ada `any` implisit/eksplisit tanpa justifikasi ([01-foundations/01-coding-standards.md](../01-foundations/01-coding-standards.md))
- [ ] Endpoint baru pakai `requirePermission()`, response shape `{ data }`/`{ error }` konsisten ([03-core-implementation/06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md))
- [ ] Tidak ada kredensial/data sensitif baru di kode atau log ([03-core-implementation/07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md), [04-quality-and-observability/29-logging-standard.md](../04-quality-and-observability/29-logging-standard.md))

## 6. Checklist Domain-Spesifik (Jika Relevan)

**Menyentuh skema database:**
- [ ] Migration idempotent-safe, tidak mengedit migration yang sudah di-apply ([03-core-implementation/34-schema-migration-policy.md](../03-core-implementation/34-schema-migration-policy.md))
- [ ] Constraint integritas data ada untuk kolom finansial-kritis baru ([03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md))
- [ ] RLS aktif untuk tabel transaksional baru ([03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md))

**Menyentuh domain finansial-kritis (kasbon, RAB, termin, kurva-S, progress):**
- [ ] Fungsi kalkulasi murni diekstrak ke `services/` dengan unit test ([02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md), [04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md))
- [ ] Lewat branch + PR, tidak commit langsung `main` ([14-git-workflow-standard.md](14-git-workflow-standard.md))
- [ ] Log operasi menyertakan `correlation_id`, `user_id`, `action`, `entity_type`, `entity_id` ([04-quality-and-observability/29-logging-standard.md](../04-quality-and-observability/29-logging-standard.md))

**Menyentuh UI/frontend:**
- [ ] Konsisten Warm Clay design system dan [07-domain-specific/12-ui-engineering-standard.md](../07-domain-specific/12-ui-engineering-standard.md)

## 7. Anti-Pattern

**Review Rubber-Stamp** — approve PR tanpa benar-benar membuka file yang diubah, hanya berdasarkan judul PR terlihat masuk akal. Checklist ini ada justru untuk mencegah ini — setiap item **MUST** benar-benar diverifikasi, bukan diasumsikan benar.

## 8. Example Good / 9. Example Bad

Tidak berlaku dalam bentuk kode untuk file jenis checklist — lihat Bagian 5 dan 6 sebagai representasi konkret standar yang diharapkan.

## 9. Migration Strategy

🔵 Designed murni — N/A untuk migrasi mundur, berlaku penuh begitu kontributor kedua bergabung dan proses review formal dimulai. Sebelum itu, checklist ini **SHOULD** tetap dipakai sebagai self-review oleh solo developer (nilainya tetap ada meski tanpa reviewer kedua), tapi tidak *mandatory blocking* karena tidak ada pihak kedua yang menegakkannya.

## 10. Checklist

*(Bagian ini merujuk balik ke Bagian 5 dan 6 di atas — checklist file ini ADALAH kontennya sendiri.)*

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| PR domain finansial-kritis tanpa review kedua (setelah kontributor kedua ada) | 0 | Audit riwayat PR approval |
| Item checklist yang terlewat menyebabkan bug ditemukan pasca-merge | Menurun dari waktu ke waktu | Post-mortem insiden |

## 12. References

- [ADR-002 § Bagian 10](../adr/ADR-002-enforcement-levels-and-template.md)
- [README.md § Jalur 3 — Reviewer](../README.md#jalur-3--reviewer-verifikasi-pr-terhadap-checklist)
- [14-git-workflow-standard.md](14-git-workflow-standard.md)
- [20-checklist-before-merge.md](20-checklist-before-merge.md)

---

*File selanjutnya: [16-definition-of-ready.md](16-definition-of-ready.md)*
