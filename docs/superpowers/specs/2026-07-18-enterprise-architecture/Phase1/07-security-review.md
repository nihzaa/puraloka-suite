# Phase 1 — 07. Security Review

**Upstream:** Menerapkan [02 — Security & Compliance Architecture](../02-security-and-compliance-architecture.md) ke desain Phase 1 spesifik. Dokumen ini **mereview desain sendiri** sebelum implementasi — bukan pentest, sesuai batasan yang sudah ditetapkan ([02 — Assumptions](../02-security-and-compliance-architecture.md#assumptions--non-goals): "bukan laporan penetration test formal").
**Status:** Planning only.

---

## Checklist Keamanan Phase 1 — Terhadap Security Checklist Utama

Merujuk [02 — Security Checklist](../02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable), berikut status setiap item `Now` yang relevan langsung ke Phase 1, dengan verifikasi bahwa desain di dokumen ini benar-benar menutupnya:

| Item Checklist Doc 02 | Ditutup oleh Desain Phase 1 Ini? | Bukti |
|---|---|---|
| Hapus 4 call site `requireRole('admin')` | ✅ Ya | [03-migration-strategy.md § Migrasi 1A.1](03-migration-strategy.md#migrasi-1a1--permission-engine-konsolidasi) langkah 3-4 |
| Audit & reklasifikasi inline `.role === 'x'` | ✅ Ya | [00-current-state-audit.md § 1.5](00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file) sudah mengklasifikasi seluruh 57 titik |
| Perbaiki RLS agar baca `roles`/`permissions` | ✅ Ya | [02-target-architecture.md § 1A.2](02-target-architecture.md#1a2-rls-refactor--desain-sinkronisasi) — fungsi `has_permission()` |
| Verifikasi status Point-in-Time Recovery Supabase | ⚠️ **Belum tercakup di desain Phase 1** | Ini adalah **tindakan verifikasi**, bukan desain — harus dilakukan sebagai langkah operasional terpisah, ditambahkan ke [09-definition-of-done.md](09-definition-of-done.md) sebagai item checklist |
| Aktifkan MFA opsional untuk admin | ⚠️ **Di luar cakupan Phase 1** | Ini konfigurasi Supabase Auth, bukan menyentuh kode aplikasi — valid dikerjakan paralel tapi tidak termasuk 9 objective yang diminta brief eksplisit |
| Tulis runbook incident response | ⚠️ **Di luar cakupan Phase 1** | Dokumentasi operasional, tidak menyentuh kode — dicatat sebagai rekomendasi tambahan, bukan blocker |
| Verifikasi token revocation saat user dinonaktifkan | ⚠️ **Di luar cakupan Phase 1** | Perilaku Supabase Auth, perlu diverifikasi terpisah |

**Kejujuran penting:** Phase 1 sebagaimana dirancang di sini **menutup seluruh item checklist yang bersifat perubahan kode** (Permission Engine, RLS). Item yang bersifat **operasional/konfigurasi** (PITR, MFA, runbook, token revocation) **tidak termasuk 9 objective yang diminta brief** — direkomendasikan ditambahkan sebagai item paralel berbiaya rendah (lihat rekomendasi di bagian akhir dokumen ini), bukan diam-diam diabaikan.

---

## Threat Model Tambahan — Spesifik untuk Perubahan Phase 1

Melengkapi [02 — Threat Model](../02-security-and-compliance-architecture.md#threat-model) dengan ancaman baru yang **muncul karena** perubahan Phase 1 sendiri (bukan ancaman existing):

| Ancaman Baru | Vektor | Mitigasi dalam Desain |
|---|---|---|
| **Policy RLS baru (expand phase) terlalu permisif**, membuka celah sementara selama masa transisi dua-policy | Selama expand-contract ([03-migration-strategy.md](03-migration-strategy.md)), policy lama DAN baru aktif bersamaan — kalau policy baru salah desain jadi terlalu longgar, celahnya aktif meski policy lama masih ada (RLS adalah OR, bukan AND, antar policy) | Setiap policy baru **wajib** lulus test RLS eksplisit ([06-test-strategy.md § Test untuk RLS](06-test-strategy.md#test-untuk-rls-bukan-bagian-dari-financial-test-suite-secara-harfiah-tapi-prasyarat-migrasi-1a2)) sebelum di-deploy ke production — bukan setelah |
| **`permission_scopes` tabel baru** (row-level PBAC) — jika salah diisi, bisa memberi user akses ke proyek yang bukan miliknya | Tabel baru, ownership PM-ke-proyek belum pernah diformalkan sebagai data eksplisit sebelumnya (dulu inline logic) | Migrasi data awal `permission_scopes` untuk PM existing **diverifikasi manual** terhadap `projects.pm_id` yang sudah ada — bukan dianggap otomatis benar |
| **Audit trail helper baru** yang menangkap lebih banyak data (`ip_address`, `user_agent` otomatis) — potensi menyimpan data personal lebih luas dari sebelumnya | Privasi — `ip_address`/`user_agent` sudah ada di skema sejak migration 009, tapi baru benar-benar terisi konsisten mulai Phase 1 (lihat [00 — bagian 3.3](00-current-state-audit.md#33-insersi-nyata-ke-audit_logs--hanya-1-titik-di-seluruh-codebase)) | Bukan data baru secara skema — hanya lebih konsisten terisi. Tidak perlu mitigasi tambahan karena kolomnya sudah dirancang sejak awal untuk tujuan forensik/audit yang sah |
| **CI/CD pipeline baru** — jika secret (`SUPABASE_SECRET_KEY`) tersimpan di GitHub Actions secrets dengan konfigurasi salah, bisa terekspos di log CI | CI adalah permukaan baru yang belum pernah ada | GitHub Actions secrets (built-in masking) dipakai untuk kredensial test, **bukan** kredensial production — test database terisolasi ([06-test-strategy.md](06-test-strategy.md)) memakai kredensial terpisah dari production, sehingga kebocoran log CI (jika terjadi) tidak membocorkan akses ke data production |

---

## OWASP Top 10 — Relevansi Langsung ke Phase 1

| Kategori OWASP | Relevan ke Phase 1? | Penjelasan |
|---|---|---|
| **A01: Broken Access Control** | ✅ **Sangat relevan — ini inti Phase 1** | Seluruh Gap 1 dan Gap 2 adalah perbaikan langsung kategori ini |
| **A04: Insecure Design** | ✅ Relevan | Pola expand-contract dan fail-closed (`has_permission()` return `false` untuk key tak dikenal) adalah penerapan *secure by design* |
| **A08: Software and Data Integrity Failures** | ✅ Relevan | Audit trail (Gap 3) adalah kontrol integritas — memastikan perubahan data finansial punya jejak yang bisa diverifikasi |
| **A09: Security Logging and Monitoring Failures** | ✅ Sangat relevan | Gap 3 (audit) dan Gap 7 (observability) langsung menutup kategori ini |
| **A05: Security Misconfiguration** | 🟡 Sebagian | Logger dev-config di production ([Gap 7](01-gap-analysis.md#gap-7--observability-logger-dev-config-di-production)) adalah contoh konkret kategori ini — ditutup oleh 1D |
| **A02, A03, A06, A07, A10** | ⚪ Tidak secara langsung disentuh Phase 1 | Injection (A03), Cryptographic Failures (A02), Vulnerable Components (A06), Auth Failures (A07 — sebagian lewat Permission Engine), SSRF (A10) — bukan fokus perubahan Phase 1, tidak berarti diabaikan selamanya, hanya di luar cakupan 9 objective yang diminta saat ini |

---

## Rekomendasi Tambahan Berbiaya Rendah (Opsional, Tidak Menghambat Phase 1)

Tiga item dari [02 — Security Checklist](../02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable) yang **bisa** diselipkan paralel dengan Phase 1 tanpa menambah risiko delivery signifikan (R8 di [Risk Register](04-risk-register.md#r8--scope-creep-phase-1-4-sub-fase-menjadi-terlalu-besar-untuk-tim-kecil)):

1. **Verifikasi PITR Supabase** — cek dashboard Supabase, murni administratif, hitungan menit.
2. **Trigger append-only untuk `audit_logs`** ([02 — Audit Logging](../02-security-and-compliance-architecture.md#audit-logging--tamper-proof-logging)) — satu `CREATE TRIGGER` SQL, biaya sangat rendah, memperkuat integritas audit trail yang sedang dibangun ulang di Gap 3. **Direkomendasikan masuk 1A** sebagai tambahan kecil (bukan objective terpisah) karena berbagi migration yang sama dengan Gap 3/4.

**Keputusan untuk founder:** Apakah item #2 (trigger append-only) dimasukkan ke cakupan 1A, atau dicatat sebagai item terpisah pasca-Phase-1? Direkomendasikan masuk 1A karena overhead-nya nyaris nol dan langsung memperkuat pekerjaan Gap 3 yang sudah dikerjakan di fase yang sama.

---

*Dokumen selanjutnya: [08 — Observability Plan](08-observability-plan.md) — detail 1D, termasuk kontrak metrics yang disiapkan untuk implementasi penuh pasca-Phase-1.*
