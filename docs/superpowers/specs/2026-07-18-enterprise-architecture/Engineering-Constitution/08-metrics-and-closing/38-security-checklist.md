# 38 — Security Checklist

> **Maturity:** 🟡 Partial — checklist ini mengagregasi item MUST keamanan dari [03-core-implementation/07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md) dan file terkait lain; status sama dengan sumbernya (sebagian Enforced, sebagian Partial menunggu Sub-Fase 1A). v1.1: menambah item session/token/CORS ([07 Mandatory Rule #7-8](../03-core-implementation/07-security-engineering-standard.md#4-mandatory-rules)) dan dependency scanning ([11 Mandatory Rule #5](../05-team-process/11-devsecops-standard.md#4-mandatory-rules)).

**Kedudukan:** Batch 8 — Metrics & Penutup. Titik verifikasi keamanan tunggal, mengagregasi [03-core-implementation/07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md) dan [02-security-and-compliance-architecture.md § Security Checklist](../../02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable) menjadi satu daftar yang bisa dicek cepat sebelum rilis besar.

---

## 1. Purpose

Memberikan satu checklist ringkas yang bisa dijalankan sebelum rilis besar atau audit berkala — tanpa perlu membaca ulang seluruh [03-core-implementation/07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md) dari awal setiap kali.

## 2. Background

[02-security-and-compliance-architecture.md § Security Checklist](../../02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable) sudah menetapkan checklist ringkas di level arsitektur — file ini menerjemahkannya menjadi checklist yang selaras dengan Mandatory Rules di [03-core-implementation/07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md), sehingga satu daftar yang sama dipakai baik untuk review PR individual maupun audit menyeluruh berkala.

## 3. Principles

1. **Checklist ini adalah verifikasi cepat, bukan pengganti threat model lengkap.** Untuk analisis mendalam, rujuk [02-security-and-compliance-architecture.md § Threat Model](../../02-security-and-compliance-architecture.md#threat-model) — checklist ini adalah permukaan cepat untuk verifikasi rutin.
2. **Item yang gagal MUST diselidiki, tidak dilewati dengan asumsi "biasanya juga begitu."**

## 4. Mandatory Rules

1. Checklist Bagian 6 **MUST** dijalankan sebelum setiap rilis yang menyentuh domain finansial-kritis atau perubahan RLS/permission scope — **MUST NOT** dilewati untuk perubahan kategori ini meski terlihat kecil.
2. Item yang gagal saat checklist dijalankan **MUST** diselesaikan atau didokumentasikan sebagai risiko yang diterima sadar (dengan justifikasi tertulis) sebelum rilis — **MUST NOT** dibiarkan tanpa keputusan eksplisit.

## 5. Recommended Rules

1. Checklist ini **SHOULD** dijalankan juga secara berkala (mis. tiap akhir Sub-Fase) di luar konteks rilis spesifik, sebagai audit kesehatan keamanan menyeluruh.

## 6. Checklist Keamanan (Verifikasi Sebelum Rilis Besar)

**Otorisasi & Akses:**
- [ ] Endpoint baru memakai `requirePermission()`, bukan `requireRole`/inline role check ([03-core-implementation/06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md))
- [ ] Fungsi otorisasi fail-closed — default tolak saat evaluasi tidak jelas ([03-core-implementation/07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md))
- [ ] RLS aktif untuk tabel transaksional baru, tidak hardcode role string di policy baru ([03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md))
- [ ] Token sesi disimpan `HttpOnly`, endpoint baru tunduk CORS whitelist eksplisit — bukan `localStorage` atau wildcard origin ([03-core-implementation/07-security-engineering-standard.md Mandatory Rule #7-8](../03-core-implementation/07-security-engineering-standard.md#4-mandatory-rules))

**Data & Kredensial:**
- [ ] Tidak ada kredensial baru di kode/commit/log ([03-core-implementation/07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md))
- [ ] Data sensitif tidak muncul plaintext di log ([04-quality-and-observability/29-logging-standard.md](../04-quality-and-observability/29-logging-standard.md))
- [ ] Input user ke SQL memakai parameterized query
- [ ] File upload divalidasi MIME type + ukuran
- [ ] Dependency baru (`package.json`/`pnpm-lock.yaml` berubah) sudah lolos scan kerentanan, tidak ada Critical/High tanpa mitigasi terdokumentasi ([05-team-process/11-devsecops-standard.md Mandatory Rule #5](../05-team-process/11-devsecops-standard.md#4-mandatory-rules))

**Data Finansial & Portal:**
- [ ] Kolom finansial baru yang di-expose ke portal client/mandor sudah diperiksa terhadap keputusan transparansi (CLAUDE.md § ERP Proyek Upgrade — Keputusan Desain, internal — kecuali serapan aktual kas & cashflow)
- [ ] Constraint integritas data ada untuk kolom finansial-kritis baru ([03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md))

**Migrasi & Rollback:**
- [ ] Migration berisiko tinggi (RLS, constraint baru) punya rencana rollback tertulis ([03-core-implementation/34-schema-migration-policy.md](../03-core-implementation/34-schema-migration-policy.md))
- [ ] Perubahan RLS/permission scope tercatat di PR description atau audit log

## 7. Anti-Pattern

**Checklist Dijalankan Sebagai Formalitas** — mencentang semua item tanpa benar-benar memverifikasi (mis. mencentang "tidak ada kredensial di log" tanpa benar-benar membaca log sample) — kehilangan seluruh nilai checklist sebagai gate nyata.

## 8. Example Good / 9. Migration Strategy

Tidak berlaku dalam bentuk kode — file ini murni checklist. Migration Strategy mengikuti status sumbernya di [03-core-implementation/07-security-engineering-standard.md § Migration Strategy](../03-core-implementation/07-security-engineering-standard.md#9-migration-strategy).

## 10. Checklist

*(Bagian ini merujuk balik ke Bagian 6 di atas — checklist file ini ADALAH kontennya sendiri.)*

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Rilis besar finansial-kritis tanpa checklist dijalankan | 0 | Audit riwayat rilis |
| Item checklist gagal tanpa keputusan eksplisit (fix atau accepted risk) | 0 | Review dokumentasi rilis |
| Rilis dengan dependency Critical/High belum dimitigasi | 0 | `pnpm audit` gate ([11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)) |

## 12. References

- [02-security-and-compliance-architecture.md § Security Checklist](../../02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable)
- [03-core-implementation/07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md)
- [05-team-process/11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)
- [05-team-process/21-checklist-before-release.md](../05-team-process/21-checklist-before-release.md)

---

*File selanjutnya: [39-final-engineering-manifesto.md](39-final-engineering-manifesto.md)*
