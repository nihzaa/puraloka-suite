# 03 — Team Topology and Resourcing

**Kedudukan dokumen ini:** Orkestrasi Baru — belum ada dokumen manapun yang membahas struktur tim, karena seluruh Architecture Repository/Phase1/Engineering Constitution ditulis dari sudut pandang "bagaimana kode ditulis dengan benar," bukan "siapa yang menulisnya." **Sumber fakta kondisi hari ini:** [Phase1/00-current-state-audit.md](../Phase1/00-current-state-audit.md) (solo developer, bus factor 1) dan [Engineering-Constitution/05-team-process/](../Engineering-Constitution/05-team-process/) (proses yang sudah disiapkan menunggu kontributor kedua).

---

## 1. Prinsip Team Topology untuk Puraloka Suite

Mengadaptasi konsep [Team Topologies (Skelton & Pais)](https://teamtopologies.com) — empat tipe tim (Stream-Aligned, Enabling, Complicated-Subsystem, Platform) — **hanya sejauh relevan** untuk skala Puraloka Suite hari ini sampai L2/L3. Tidak seluruh model diadopsi penuh; ini adalah kerangka berpikir, bukan struktur organisasi yang dipaksakan pada tim satu orang.

**Prinsip governing:** Team Topology berevolusi **mengikuti** kompleksitas sistem (Program yang sedang dikerjakan), **bukan** ditentukan di depan lalu sistem dipaksa masuk struktur itu. Ini konsisten [Engineering-Constitution/00-principles/00-engineering-principles.md Prinsip Strict YAGNI](../Engineering-Constitution/00-principles/00-engineering-principles.md#3-principles) — merekrut/membentuk tim sebelum ada pekerjaan nyata yang membutuhkannya adalah over-engineering organisasi, sama seperti over-engineering kode.

## 2. Kondisi Hari Ini — Solo Developer (Bus Factor 1)

**Fakta terverifikasi:** [Phase1/00-current-state-audit.md](../Phase1/00-current-state-audit.md) dan [04-roadmap-governance-and-delivery.md § Risk Register item #5](../04-roadmap-governance-and-delivery.md#risk-register) mengonfirmasi: satu orang (Nizar, dibantu AI coding assistant) memegang seluruh pengetahuan 67 tabel dan 159 endpoint. Ini **risiko struktural terdaftar**, bukan sekadar kondisi netral — mitigasi eksplisit sudah tercatat: "Dokumentasi arsitektur ini sendiri adalah mitigasi parsial; hire kedua menjadi prioritas begitu Phase 2-3 mulai terasa berat untuk 1 orang."

**Peran solo developer hari ini mencakup implisit seluruh tipe tim:**
- **Stream-Aligned** (mengerjakan Program A-F langsung)
- **Platform** (memelihara infrastruktur: Supabase, deployment, CI/CD begitu ada)
- **Enabling** (menulis Engineering Constitution, Architecture Repository — dokumentasi yang "melatih" kontributor masa depan sebelum mereka ada)

**AI coding assistant sebagai force-multiplier, bukan pengganti tim:** [Engineering-Constitution/07-domain-specific/36-ai-coding-guideline.md](../Engineering-Constitution/07-domain-specific/36-ai-coding-guideline.md) menetapkan batasan eksplisit — AI mengeksekusi presisi teknis, manusia tetap satu-satunya pemegang keputusan bisnis dan approval perubahan finansial-kritis. AI mengurangi beban implementasi, **tidak** mengurangi bus factor 1 untuk keputusan strategis.

## 3. Trigger Point untuk Menambah Kontributor

Bukan tanggal kalender — **kondisi teknis konkret** yang menandakan kapasitas solo sudah tidak memadai:

| Trigger | Sinyal Konkret | Program Terkait |
|---|---|---|
| **Trigger 1 — Beban Program B terasa berat** | Workflow Engine migration (3 domain finansial: kasbon, CO, procurement) berjalan >2x estimasi awal, atau backlog Program C menumpuk karena Program B tidak selesai-selesai | Program B/C — sesuai [04 § Risk Register item #5](../04-roadmap-governance-and-delivery.md#risk-register): "hire kedua menjadi prioritas begitu Phase 2-3 mulai terasa berat" |
| **Trigger 2 — Paralelisme nyata dibutuhkan** | Dependency graph ([02-master-dependency-graph.md § 4](02-master-dependency-graph.md#4-parallel-development-strategy)) menunjukkan pekerjaan valid paralel, tapi solo developer secara fisik tidak bisa mengeksekusi keduanya bersamaan dan salah satu Program mulai stagnan | Program C (non-Workflow Epic) ‖ Program B |
| **Trigger 3 — Domain expertise spesifik dibutuhkan** | Program E (AI/Automation) atau Program F (SaaS billing) butuh kedalaman teknis yang berbeda signifikan dari CRUD/RAB/kasbon (mis. AI prompt engineering, payment gateway integration) | Program E, Program F |
| **Trigger 4 — Pelanggan eksternal committed (Phase 8 gate)** | [04 § Phase 8](../04-roadmap-governance-and-delivery.md#phase-8--multi-tenant-saas-platform): gate masuk paling ketat di roadmap — begitu terpenuhi, kebutuhan tim (support, onboarding, billing ops) berubah drastis dari solo-technical menjadi butuh fungsi non-engineering juga | Program F |

## 4. Topology per Skala — Evolusi Bertahap

### Skala 1 — Solo (Hari Ini, sampai Trigger 1/2 terpenuhi)
Struktur: 1 developer + AI coding assistant. Semua Program dikerjakan sekuensial mengikuti [Critical Path](02-master-dependency-graph.md#3-critical-path-analysis) — paralelisme dependency-valid ada, tapi eksekusi tetap satu-per-satu.

### Skala 2 — Solo + Kontributor Kedua (Trigger 1 atau 2 terpenuhi)
Struktur: 2 developer. Pola pembagian yang **valid secara dependency** (bukan sembarang split):
- **Split A (mengikuti Bagian 3 Trigger 2):** Developer 1 lanjut Program B (Workflow Engine, butuh konteks finansial mendalam yang sudah dipegang), Developer 2 mulai Program C Epic non-Workflow (QC Checklist, HSE, Punch List — area kode independen, [02-master-dependency-graph.md § 4](02-master-dependency-graph.md#4-parallel-development-strategy)).
- **Governance yang berubah:** [Engineering-Constitution/05-team-process/14-git-workflow-standard.md Mandatory Rule #4](../Engineering-Constitution/05-team-process/14-git-workflow-standard.md#4-mandatory-rules) mulai berlaku penuh — branch protection `main` aktif, review wajib untuk domain finansial-kritis ([Engineering-Constitution/05-team-process/15-code-review-checklist.md Mandatory Rule #3](../Engineering-Constitution/05-team-process/15-code-review-checklist.md#4-mandatory-rules)).
- **Bus factor naik dari 1 ke 2, belum ke titik aman** — dokumentasi (Architecture Repository, Engineering Constitution) tetap mitigasi utama sampai tim lebih besar.

### Skala 3 — Tim Kecil Stream-Aligned (Trigger 3 terpenuhi, mendekati Phase 5-6)
Struktur: 3-4 orang. Mulai terbentuk spesialisasi longgar:
- 1-2 developer fokus **Core Domain** (Program C-D, construction/enterprise modules — butuh domain knowledge konstruksi)
- 1 developer fokus **Platform/Automation** (Program E — Trigger/Event Engine, AI Agent Registry, butuh familiaritas infrastruktur berbeda)
- Peran **Enabling** mulai terpisah dari Stream-Aligned murni — seseorang menjaga Engineering Constitution tetap updated ([Engineering-Constitution/06-governance/24-documentation-standard.md](../Engineering-Constitution/06-governance/24-documentation-standard.md)) alih-alih setiap developer mengurus sendiri.

### Skala 4 — Tim dengan Fungsi Non-Engineering (Trigger 4 terpenuhi, Phase 8+)
Struktur: 5+ orang, mulai menyertakan fungsi non-teknis (customer success/support untuk pelanggan eksternal, minimal 1 orang). Ini di luar cakupan detail Blueprint — konsisten prinsip [00-executive-delivery-vision.md § 4](00-executive-delivery-vision.md#4-prinsip-governance-program-baru), Program F sengaja tidak direncanakan presisi jauh di muka.

## 5. Resourcing per Program — Estimasi Kualitatif

**Kenapa kualitatif, bukan angka pasti (man-days/story points):** Konsisten kejujuran status yang dipegang di seluruh Engineering Constitution — memberi angka presisi palsu untuk pekerjaan yang efortnya sendiri sudah dinilai kualitatif di [04-roadmap-governance-and-delivery.md § Foundational Engines Prioritization](../04-roadmap-governance-and-delivery.md#foundational-engines-prioritization) (Rendah/Menengah/Tinggi) akan menciptakan ilusi presisi yang tidak didukung data historis velocity tim (belum ada, karena belum ada tim).

| Program | Estimasi Effort Relatif (dari doc 04) | Kapasitas Minimal | Kandidat Paralelisasi Tim |
|---|---|---|---|
| Program A | Medium (item #1-2), Rendah (item #3-4) | Solo cukup | Item #1‖#2‖#3 bisa dipecah 2 orang jika tersedia |
| Program B | Tinggi (item #5), Menengah (item #6) | Solo bisa, lebih cepat dengan 2 | Item #5‖#6 area kode berbeda |
| Program C | Bervariasi per Epic (Rendah-Menengah per Epic individual) | Solo cukup per Epic | Epic paralel valid, lihat Bagian 4 Skala 2 |
| Program D | Tinggi (Enterprise Modules baru dari nol) + Tinggi (`company_id` migration, "paling invasif di roadmap") | Butuh minimal 2 untuk migrasi `company_id` (review wajib, tidak solo untuk perubahan seinvasif ini) | Terbatas — migrasi skema lintas-tabel sulit dipecah paralel aman |
| Program E | Tinggi (Trigger/Event Engine + AI Registry) | Solo bisa untuk pilot 1 agent, butuh tim untuk 14 agent penuh | Trigger/Event Engine ‖ AI Registry setelah keduanya punya fondasi masing-masing |
| Program F | Sangat Tinggi (infrastruktur SaaS penuh) | Tim (bukan solo) — gate Phase 8 sendiri mengasumsikan skala tim sudah berbeda | Billing ‖ Tenant Lifecycle ‖ Marketplace — ketiganya area independen |

## 6. Anti-Pattern yang Dihindari

**Membentuk Tim Sebelum Ada Pekerjaan Nyata** — merekrut developer baru "untuk jaga-jaga" sebelum Trigger di Bagian 3 terpenuhi, menciptakan overhead koordinasi (code review, onboarding, komunikasi) tanpa throughput tambahan yang sepadan — bertentangan Principle di Bagian 1.

**Memaksa Spesialisasi Dini** — menetapkan "developer X hanya boleh kerjakan Program E" saat tim masih di Skala 2, padahal domain expertise spesifik (Bagian 3 Trigger 3) belum benar-benar dibutuhkan sampai Program E dimulai — mengurangi fleksibilitas tim kecil tanpa manfaat nyata.

## 7. References

- [Phase1/00-current-state-audit.md](../Phase1/00-current-state-audit.md)
- [04-roadmap-governance-and-delivery.md § Risk Register item #5](../04-roadmap-governance-and-delivery.md#risk-register)
- [02-master-dependency-graph.md § 4 Parallel Development Strategy](02-master-dependency-graph.md#4-parallel-development-strategy)
- [Engineering-Constitution/05-team-process/14-git-workflow-standard.md](../Engineering-Constitution/05-team-process/14-git-workflow-standard.md)
- [Engineering-Constitution/07-domain-specific/36-ai-coding-guideline.md](../Engineering-Constitution/07-domain-specific/36-ai-coding-guideline.md)

---

*File selanjutnya: [04-delivery-orchestration.md](04-delivery-orchestration.md)*
