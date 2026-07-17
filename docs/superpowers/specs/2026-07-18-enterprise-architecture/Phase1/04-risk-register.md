# Phase 1 — 04. Risk Register

**Upstream:** Konsolidasi risiko yang disinggung di [00](00-current-state-audit.md), [01](01-gap-analysis.md), [03](03-migration-strategy.md), plus risiko baru dari [04 — Risk Register utama](../04-roadmap-governance-and-delivery.md#risk-register) yang relevan langsung ke Phase 1.
**Status:** Planning only.

---

## Format

Setiap risiko: **Likelihood** (Rendah/Sedang/Tinggi) × **Impact** (Rendah/Sedang/Tinggi/Sangat Tinggi) → **Mitigasi** → **Pemilik Keputusan**.

---

## Risiko Keamanan

### R1 — RLS Policy Baru Salah Desain, Menyebabkan Kebocoran Data Lintas Role

**Likelihood:** Sedang (perubahan menyentuh 45 tabel, permukaan kesalahan besar)
**Impact:** Sangat Tinggi (data finansial klien/mandor bocor ke role yang tidak berhak)
**Mitigasi:**
- Pola expand-contract ([03-migration-strategy.md](03-migration-strategy.md)) — policy baru dan lama hidup berdampingan sampai terverifikasi, bukan hard-switch.
- Test RLS otomatis wajib per tabel sebelum policy lama dihapus ([06-test-strategy.md](06-test-strategy.md)).
- Urutan migrasi risiko-rendah-ke-tinggi (tabel referensi dulu, finansial terakhir).
**Pemilik Keputusan:** Founder menyetujui urutan migrasi per kelompok tabel sebelum dieksekusi.

### R2 — RLS Policy Baru Terlalu Ketat, Mengunci Pengguna Sah dari Data Sendiri

**Likelihood:** Sedang
**Impact:** Tinggi (operasional terganggu — mandor tidak bisa lihat kasbon sendiri, dll — tapi tidak ada kebocoran data, arah kesalahan lebih aman dari R1)
**Mitigasi:** Sama seperti R1 (expand-contract). Tambahan: rollback R2 lebih cepat terdeteksi (user melapor "tidak bisa akses") dibanding R1 (kebocoran data seringkali tidak terdeteksi sampai audit/insiden).
**Pemilik Keputusan:** Tim teknis, eskalasi ke founder jika berdampak operasional harian mandor/PM.

### R3 — Migrasi Authorization-Gate Inline Terlewat (21 Titik), Menyisakan Celah

**Likelihood:** Sedang (57 titik total perlu diklasifikasi manual — human error mungkin terjadi)
**Impact:** Tinggi
**Mitigasi:** Checklist eksplisit per file:line di [00-current-state-audit.md §1.5](00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file) — setiap baris punya status tercentang di [09-definition-of-done.md](09-definition-of-done.md), bukan asumsi "sudah semua."
**Pemilik Keputusan:** Tim teknis — verifikasi checklist adalah gate wajib sebelum sub-fase 1A ditutup.

### R4 — SUPABASE_SECRET_KEY Bocor Selama Kerja Migrasi Intensif

**Likelihood:** Rendah
**Impact:** Sangat Tinggi (bypass semua RLS — kredensial dengan blast radius terbesar di seluruh sistem, sesuai [02 — Secrets Management](../02-security-and-compliance-architecture.md#secrets-management))
**Mitigasi:** Tidak berubah dari baseline — `.gitignore` diverifikasi, tidak ada perubahan cara kredensial disimpan di Phase 1 (migrasi vault ditunda ke Later sesuai keputusan sebelumnya). Perhatian tambahan: migrasi RLS/permission butuh akses database intensif — pastikan tidak ada query manual yang menempelkan secret ke log/output yang ter-commit.
**Pemilik Keputusan:** Tim teknis, kebiasaan kerja.

## Risiko Finansial/Operasional

### R5 — Refactor Kasbon/CO/Procurement Tanpa Test Coverage Menghasilkan Regresi Silent

**Likelihood:** Tinggi jika urutan Phase 1 tidak diikuti (test suite harus lebih dulu dari refactor apa pun)
**Impact:** Sangat Tinggi (laporan keuangan salah, pembayaran salah jumlah/salah pihak)
**Mitigasi:** **Ini alasan utama kenapa urutan sub-fase 1A tidak boleh dibalik** — Financial Test Suite (Gap 5) dikerjakan **sebelum atau bersamaan** dengan Permission Engine/RLS refactor, bukan setelahnya. Lihat [05-rollout-plan.md](05-rollout-plan.md) untuk urutan presisi.
**Pemilik Keputusan:** Founder — ini adalah keputusan urutan kerja yang tidak boleh dikompromikan demi kecepatan.

### R6 — Tax Rate Migration ke Config Table Menghasilkan Nilai Salah untuk Invoice yang Sedang Diproses

**Likelihood:** Rendah
**Impact:** Tinggi (invoice dengan pajak salah adalah masalah hukum/kepercayaan klien)
**Mitigasi:** Fallback ke hardcode lama selama masa transisi ([03-migration-strategy.md § Migrasi 1B](03-migration-strategy.md#migrasi-1b--configuration-menu-module-registry)) — nilai baru divalidasi identik dengan nilai lama sebelum fallback dihapus.
**Pemilik Keputusan:** Tim teknis, verifikasi manual invoice test sebelum go-live.

### R7 — Workflow Registry Migration (1C) Mengubah Alur Approval yang Sedang Berjalan (In-Flight)

**Likelihood:** Sedang (kasbon/CO yang statusnya "pending" saat migrasi terjadi)
**Impact:** Tinggi (approval hilang jejak, atau macet di state yang tidak dikenali sistem baru)
**Mitigasi:** Strangler-fig per modul ([03-migration-strategy.md § Migrasi 1C](03-migration-strategy.md#migrasi-1c--workflow-registry-strangler-fig)) — migrasi kasbon dilakukan saat **tidak ada kasbon berstatus pending** (jendela waktu, mis. akhir pekan) ATAU data pending di-backfill eksplisit ke skema `workflow_instances` baru sebagai bagian migrasi (bukan diabaikan).
**Pemilik Keputusan:** Founder menentukan jendela waktu migrasi yang aman secara operasional.

## Risiko Teknis/Delivery

### R8 — Scope Creep: "Phase 1" 4-Sub-Fase Menjadi Terlalu Besar untuk Tim Kecil

**Likelihood:** Tinggi (9 objective sekaligus, tim 1 engineer per [00 — Assumptions](../00-vision-and-business-architecture.md#assumptions))
**Impact:** Sedang (bukan risiko keamanan/finansial, tapi risiko delivery — momentum hilang, fase tidak pernah "selesai")
**Mitigasi:** Struktur sub-fase 1A→1B→1C→1D dengan **gate approval eksplisit** di setiap batas ([05-rollout-plan.md](05-rollout-plan.md)) — setiap sub-fase punya definisi selesai sendiri yang bisa dirayakan sebagai working software, bukan menunggu keempatnya selesai bersamaan.
**Pemilik Keputusan:** Founder — persetujuan eksplisit "lanjut ke sub-fase berikutnya" di setiap gate, bukan asumsi otomatis lanjut.

### R9 — Mobile App Rusak karena Perubahan Authorization yang Tidak Terverifikasi di Platform Itu

**Likelihood:** Sedang (mobile app punya alur auth/role nav yang terpisah dari web, mudah terlewat saat fokus di web/API)
**Impact:** Tinggi (mandor lapangan kehilangan akses ke app kerja utama mereka)
**Mitigasi:** [03 — Compatibility Strategy — Mobile App](03-migration-strategy.md#compatibility-strategy--mobile-app) — checklist test manual mobile app eksplisit di setiap migrasi permission/RLS, bukan diasumsikan aman.
**Pemilik Keputusan:** Tim teknis — item wajib di Definition of Done setiap sub-fase.

### R10 — CI/CD Gate Memperlambat Kerja Solo Engineer Tanpa Manfaat Proporsional

**Likelihood:** Rendah
**Impact:** Rendah
**Mitigasi:** CI dirancang sebagai *safety net*, bukan birokrasi — untuk 1 engineer, CI terutama berguna sebagai pengingat otomatis ("aku lupa test ini") bukan gate persetujuan orang lain. Branch protection (yang benar-benar bisa memperlambat) eksplisit **opsional** dan butuh keputusan founder terpisah, bukan default aktif.
**Pemilik Keputusan:** Founder — opsional, bisa ditunda tanpa mengurangi nilai CI dasar.

## Risiko yang SENGAJA Diterima (Bukan Diabaikan)

Konsisten dengan pola [04 — Technical Debt Register](../04-roadmap-governance-and-delivery.md#technical-debt-register) di architecture repo utama — risiko berikut **sadar** dibiarkan untuk Phase 1, dengan kondisi jelas kapan diangkat kembali:

| Risiko yang Diterima | Kenapa Diterima Sekarang | Kondisi Diangkat Kembali |
|---|---|---|
| ABAC belum diimplementasi | Tidak ada kasus nyata yang membutuhkan atribut environment (lokasi, waktu, device) | Muncul kebutuhan konkret (mis. akses hanya dari device terverifikasi untuk approval besar — baru relevan mulai [06 — WhatsApp Device Trust](../06-agentic-ai-and-automation-architecture.md#identity-verification--device-trust)) |
| Field-level permission belum diimplementasi | Nol kasus nyata teramati di audit | Ada permintaan eksplisit "role X tidak boleh lihat kolom Y" |
| Quotation validity / payment terms config tidak dikerjakan di Phase 1 | Fitur belum ada sama sekali (bukan hardcode) — mendesain fitur baru sekarang adalah scope creep dari fokus Phase 1 (menutup gap fondasi, bukan bangun fitur baru) | Modul Tender/Sales ([00 — Module Catalog](../00-vision-and-business-architecture.md#module-catalog--tiering)) dimulai |
| Deployment Prometheus/Grafana sungguhan tidak dikerjakan | Butuh keputusan hosting cloud yang di luar cakupan Phase 1 | Deployment cloud pertama terjadi |
| Vault untuk `SUPABASE_SECRET_KEY` tidak dikerjakan | `.env` lokal cukup untuk skala tim saat ini ([02 — Secrets Management](../02-security-and-compliance-architecture.md#secrets-management)) | Deployment cloud pertama, atau tim bertambah |

---

*Dokumen selanjutnya: [05 — Rollout Plan](05-rollout-plan.md) — urutan eksekusi presisi antar sub-fase, termasuk gate approval di setiap batas.*
