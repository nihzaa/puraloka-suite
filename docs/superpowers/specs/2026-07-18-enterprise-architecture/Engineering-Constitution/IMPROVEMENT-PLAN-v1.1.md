# Engineering Constitution v1.1 — Improvement Plan

**Status:** ✅ **IMPLEMENTED & FROZEN** — seluruh 7 item (G1-G7) selesai diimplementasikan, diverifikasi, dan di-commit (Batch J/K/L). Lihat [Bagian 13 — Implementation Summary & Freeze Declaration](#13-implementation-summary--freeze-declaration) untuk ringkasan lengkap dan commit hash tiap item.
**Kedudukan:** Rencana perbaikan terhadap 39 file existing Engineering Constitution (kini 40 setelah G1), disusun dari dua audit evidence-based ([lihat Bagian 8 — Metodologi Audit](#8-metodologi-audit-dan-sumber-temuan)). Dokumen ini **bukan** amandemen itu sendiri — begitu tiap item diimplementasikan dan disetujui, entry ringkas dicatat di [amendments/](amendments/) sesuai [00-principles/00-engineering-principles.md § 9 Amendment Process](00-principles/00-engineering-principles.md#9-amendment-process). **Sejak status Frozen (Bagian 13), dokumen ini tidak lagi diedit** — perubahan berikutnya terhadap Engineering Constitution WAJIB dokumen v1.2+ baru mengikuti Amendment Process.
**Prinsip yang mengikat rencana ini:** Single Source of Truth, Architecture First, Documentation Driven Development, No Duplicate Documentation, Backward Compatible whenever possible, ADR hanya dibuat bila memenuhi kriteria [19-architecture-decision-record-guide.md § Mandatory Rule #1](06-governance/19-architecture-decision-record-guide.md#4-mandatory-rules).

---

## 1. Keputusan ADR — Sudah Ditentukan, Tidak Diperlukan

Merujuk kriteria ADR wajib ([19-architecture-decision-record-guide.md](06-governance/19-architecture-decision-record-guide.md#4-mandatory-rules): perubahan struktur folder/file *secara luas*, penggantian library inti, pola arsitektur baru, atau pembalikan Never Build List) — **seluruh 8 item di rencana ini adalah perluasan konten** (Mandatory Rule baru di file existing, atau satu file baru di folder yang sudah ada mengikuti pola 39 file lain). Tidak ada item yang mengubah struktur 9-folder, mengganti library, atau membalik keputusan Never Build List. **ADR tidak dibuat untuk rencana ini** — keputusan ini sendiri didokumentasikan di sini sebagai jejak audit, bukan di file ADR terpisah, karena "tidak butuh ADR" bukan keputusan arsitektur yang perlu dicatat sebagai preseden.

## 2. Ringkasan 8 Item (7 dari Audit Awal + 1 AI Governance dari Verifikasi Susulan)

| # | Item | Prioritas | File Terdampak | Jenis Perubahan |
|---|---|---|---|---|
| G1 | AI Governance & AI Agent Engineering Standard (digabung — lihat Bagian 4) | **Critical** | Baru: `07-domain-specific/40-ai-governance-and-agent-engineering-standard.md` | 1 file baru |
| G2 | Dependency/Vulnerability Scanning | **Critical** | `05-team-process/11-devsecops-standard.md` | Extend (Mandatory Rule baru) |
| G3 | OWASP ASVS V2/V3/V9 (Session, Token, TLS/CORS) | **High** | `03-core-implementation/07-security-engineering-standard.md`, `08-metrics-and-closing/38-security-checklist.md` | Extend |
| G4 | Ubiquitous Language Enforcement Mechanism | **Medium** | `02-architecture/04-domain-driven-design-rules.md` | Extend |
| G5 | Aksesibilitas (WCAG) | **Medium** | `07-domain-specific/12-ui-engineering-standard.md` | Extend |
| G6 | Cross-reference Multi-Tenancy Readiness | **Medium** | `03-core-implementation/05-database-engineering-standard.md` | Extend (1-2 kalimat + link) |
| G7 | DORA Four Keys sebagai Target Placeholder | **Low** | `08-metrics-and-closing/37-engineering-metrics.md` | Extend |

**Catatan penomoran:** G1 (AI Governance, ditemukan lewat verifikasi susulan Anda) digabung menjadi satu item dengan Gap #1 audit awal (AI Agent Engineering) — sesuai instruksi eksplisit Anda: "bukan sebagai dokumen yang berdiri sendiri, tetapi sebagai perluasan standar AI Engineering." Total tetap 8 baris rencana (bukan 8 dokumen terpisah), menghasilkan **7 perubahan** karena G1 gabungan hanya 1 file baru.

---

## 3. Detail per Item

### G1 — AI Governance & AI Agent Engineering Standard

**Prioritas: Critical**

**Alasan bisnis:** Puraloka Suite eksplisit menargetkan "Construction Operating System berbasis AI" ([06-agentic-ai-and-automation-architecture.md](../06-agentic-ai-and-automation-architecture.md) — 14 agent, WhatsApp-first Executive Copilot). Tanpa governance (siapa approve perubahan prompt, apa yang boleh dikirim ke provider AI, berapa lama log AI disimpan), setiap agent yang menyentuh data finansial (AI CFO, AI Auditor) beroperasi tanpa jejak akuntabilitas yang setara dengan yang sudah diwajibkan untuk aksi manusia (`audit_logs`). Ini adalah risiko reputasi dan legal (privasi data klien) yang skalanya sama dengan gap security — konsisten penilaian Anda bahwa ini "sama pentingnya dengan Security Engineering."

**Alasan teknis:** Verifikasi menyeluruh (lihat Bagian 8) mengonfirmasi 0 dari 16 topik AI Governance mencapai status COVERED-EC — 6 baru COVERED-ARCHITECTURE (dijelaskan doc06, tidak pernah jadi Mandatory Rule), 3 PARTIAL, 7 ZERO (termasuk Prompt Approval Workflow, AI Evaluation Dataset, AI Response Traceability, AI Privacy Policy, AI Data Retention — semua dikonfirmasi nol hit lewat grep). `38-security-checklist.md`, gate pre-rilis EC yang sesungguhnya, dikonfirmasi 0 item terkait AI dari pembacaan penuh. Digabung dengan Gap #1 audit awal (testing tool-calling, prompt versioning mechanism, cost governance) karena keduanya adalah lapisan yang sama: "bagaimana agent dibangun, diuji, dan diawasi" — terpisah dari `36-ai-coding-guideline.md` (AI *coding assistant*, bukan AI *product*) dan terpisah dari doc06 (arsitektur, bukan aturan mengikat kode).

**Dependency:** Tidak bergantung item lain di rencana ini. **Prasyarat implisit dari luar rencana ini:** doc06 sendiri menyatakan AI Agent Registry (Phase 6) **MUST NOT** dimulai sebelum Program A (Permission Engine) dan Program B (Workflow Engine) selesai ([Master-Delivery-Blueprint/02-master-dependency-graph.md § 2, B→E](../Master-Delivery-Blueprint/02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit)) — **tapi ini adalah gate untuk implementasi agent, bukan untuk menulis standarnya**. Menulis standar sekarang (sebelum Phase 6) adalah documentation-driven-development yang benar: standar siap sebelum kode pertama ditulis, bukan disusulkan setelah agent pertama sudah live tanpa aturan.

**Backward compatible / migration:** Backward compatible penuh — file baru, tidak ada kode existing yang terdampak (belum ada AI agent product yang berjalan hari ini). Migration Strategy di file itu sendiri akan menyatakan "N/A — berlaku penuh sejak commit pertama yang menyentuh domain AI agent," konsisten pola Maturity Badge 🔵 Designed di file lain.

**Estimasi effort:** **L (Large)** — 16 topik governance + testing/eval/cost dari Gap #1 audit awal berarti file ini akan menjadi salah satu file terpanjang di Constitution (dibandingkan `06-agentic-ai-and-automation-architecture.md` yang jadi rujukan utamanya, ini juga cakupan luas). Realistis dipecah jadi 2 sesi penulisan dengan self-review masing-masing.

**Independen atau digabung batch lain:** **Independen** — bisa dikerjakan sebagai satu unit penuh di Batch K tanpa bergantung item lain.

---

### G2 — Dependency/Vulnerability Scanning

**Prioritas: Critical**

**Alasan bisnis:** Kerentanan dependency yang tidak terdeteksi (mis. CVE di package npm yang dipakai) adalah salah satu vektor serangan paling umum di aplikasi modern — biaya mendeteksi lewat scanning otomatis jauh lebih rendah daripada biaya insiden setelah eksploitasi, terutama untuk aplikasi yang menangani data finansial klien.

**Alasan teknis:** Audit mengonfirmasi `23-dependency-management.md § Recommended Rule #1` dan `11-devsecops-standard.md` saling merujuk melingkar — `23` menyatakan `pnpm audit` jadi Mandatory "begitu 11 mengintegrasikan security scanning ke pipeline," tapi `11` sendiri tidak pernah benar-benar mengklaim ini sebagai Mandatory Rule. Ini adalah bug logis di Constitution itu sendiri (dua file saling menunjuk tanpa satu pun benar-benar mendeklarasikan aturannya) — bukan gap fitur, tapi gap tata bahasa governance.

**Dependency:** Tidak bergantung item lain. Bergantung pada infrastruktur CI/CD yang sudah didesain (Sub-Fase 1A item #4, `Phase1/02-target-architecture.md § 1A.5`) tapi belum diimplementasikan — konsisten pola 🔵 Designed yang sudah dipakai `11-devsecops-standard.md` untuk seluruh isinya hari ini.

**Backward compatible / migration:** Backward compatible — menambah satu Mandatory Rule ke file yang sudah menyatakan dirinya 🔵 Designed (belum ada pipeline CI nyata hari ini), sehingga tidak ada "pelanggaran mendadak" terhadap kode existing. Migration Strategy: sama seperti Mandatory Rule lain di `11`, berlaku begitu pipeline pertama dibuat.

**Estimasi effort:** **S (Small)** — satu Mandatory Rule baru + update Recommended Rule di `23` supaya tidak lagi merujuk melingkar (ubah dari "menunggu 11" menjadi "sudah dideklarasikan di 11").

**Independen atau digabung batch lain:** **Independen**, tapi **secara alami digabung dengan G3** di Batch J karena keduanya sama-sama memperkuat `11-devsecops-standard.md`/`38-security-checklist.md` — mengerjakan bersamaan mengurangi risiko dua PR terpisah saling tumpang tindih di file yang sama.

---

### G3 — OWASP ASVS V2/V3/V9 (Session, Token Lifecycle, TLS/CORS)

**Prioritas: High**

**Alasan bisnis:** V3 (session/token) langsung terkait pain point yang **sudah tercatat nyata** di CLAUDE.md — "Token Supabase expire setelah ~1 jam. Jika masih 401 padahal ada token, hapus cookie... lalu login ulang." Ini bukan risiko teoretis, ini masalah UX yang sudah dialami pengguna. Mendasarkan aturan session lifecycle di Constitution akan mencegah tambal-sulam berulang di masa depan.

**Alasan teknis:** Audit ASVS sistematis (10 kategori dicek) menemukan V4 (Access Control) dan V7 (Error Handling/Logging) solid, tapi V2, V3, dan V9 nol sebutan di `07-security-engineering-standard.md` maupun `38-security-checklist.md`. V3 paling mendesak karena sudah ada gejala nyata; V2 (MFA/password policy) dan V9 (TLS/CORS/security headers) penting untuk kelengkapan tapi belum ada insiden tercatat.

**Dependency:** Tidak bergantung item lain di rencana ini.

**Backward compatible / migration:** **Tidak sepenuhnya backward compatible** — jika Mandatory Rule baru mewajibkan mis. token refresh otomatis atau CORS whitelist eksplisit, ini berpotensi menyentuh kode auth existing (`apps/api/src/plugins/auth.ts`, `apps/web/lib/api.ts`). Migration Strategy **wajib** ditulis eksplisit di file, mengikuti pola Expand-Contract dari `03-core-implementation/34-schema-migration-policy.md` — Mandatory Rule baru berlaku penuh untuk kode baru, kode existing diaudit dan diperbaiki bertahap, bukan retrofit big-bang.

**Estimasi effort:** **M (Medium)** — tiga sub-kategori ASVS (V2, V3, V9), masing-masing butuh riset singkat kondisi existing sebelum menulis Mandatory Rule (mis. cek dulu apakah CORS sudah dikonfigurasi di Fastify sebelum menulis aturan "CORS wajib eksplisit").

**Independen atau digabung batch lain:** **Digabung dengan G2** di Batch J (alasan sama: kedua file yang terdampak, `11` dan `07`/`38`, berdekatan secara tematik — sama-sama security/DevSecOps).

---

### G4 — Ubiquitous Language Enforcement Mechanism

**Prioritas: Medium**

**Alasan bisnis:** Istilah domain yang tidak konsisten (mis. "kasbon" ditulis "cash advance" di satu tempat) menciptakan friksi komunikasi antara kode dan percakapan bisnis nyata dengan Nizar/PM/mandor — biaya kecil per kejadian, tapi berulang dan bertambah seiring tim/AI agent yang menulis kode bertambah.

**Alasan teknis:** Audit menemukan `04-domain-driven-design-rules.md` mensyaratkan istilah domain baku hanya sebagai **SHOULD** (cek GLOSSARY.md), tanpa mekanisme verifikasi otomatis — inkonsistensi internal, karena `00-principles/00-engineering-principles.md` sendiri mensyaratkan setiap Mandatory Rule punya "mekanisme verifikasi konkret." Ini bukan pelanggaran (SHOULD memang boleh tanpa gate otomatis), tapi given AI coding assistant sekarang aktif menulis kode di repo ini, risiko istilah asing menyelinap masuk naik signifikan dibanding saat murni ditulis manusia yang familiar konteks bisnis.

**Dependency:** Tidak bergantung item lain.

**Backward compatible / migration:** Backward compatible penuh — menambah Recommended Rule yang lebih konkret (mis. daftar istilah terlarang eksplisit) tidak mengubah kode apa pun, murni panduan penulisan.

**Estimasi effort:** **S (Small)** — memperjelas mekanisme verifikasi (mis. grep list istilah terlarang sebagai bagian code review checklist), bukan membangun tooling baru.

**Independen atau digabung batch lain:** **Independen**, cocok di Batch L bersama item Medium/Low lain.

---

### G5 — Aksesibilitas (WCAG)

**Prioritas: Medium**

**Alasan bisnis:** Ambisi "enterprise SaaS kelas internasional" ([Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md](../Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md)) berarti calon pelanggan enterprise (Phase 8+) berpotensi mensyaratkan kepatuhan aksesibilitas secara kontraktual — beberapa yurisdiksi/institusi mewajibkan WCAG AA sebagai syarat procurement.

**Alasan teknis:** `12-ui-engineering-standard.md` nol sebutan WCAG/aksesibilitas meski sudah mengatur dark/light mode dan responsivitas — dua area yang biasanya beririsan langsung dengan aksesibilitas (kontras warna, ukuran target sentuh).

**Dependency:** Tidak bergantung item lain. **Prasyarat kontekstual:** paling bernilai jika ditambahkan bersamaan dengan kesadaran bahwa ini belum jadi kebutuhan mendesak di L1 (Puraloka Persada internal) — nilainya naik signifikan begitu mendekati Phase 8.

**Backward compatible / migration:** Backward compatible — UI existing tidak otomatis melanggar (belum diaudit, bukan berarti pasti gagal), aturan berlaku penuh untuk komponen baru, audit retroaktif komponen lama bersifat bertahap (pola sama dengan Mandatory Rule lain di file ini terkait Warm Clay token).

**Estimasi effort:** **S (Small)** — menambah beberapa Mandatory/Recommended Rule dasar (kontras warna minimum, keyboard navigation, alt text) mengikuti pola file existing, bukan audit WCAG penuh sekarang.

**Independen atau digabung batch lain:** **Independen**, Batch L.

---

### G6 — Cross-reference Multi-Tenancy Readiness

**Prioritas: Medium**

**Alasan bisnis:** Mencegah fitur yang menyentuh batas company/tenant dibangun tanpa menyadari checklist readiness yang sudah ada di Blueprint — biaya kecil (satu link), mencegah kerja ulang mahal (retrofit isolasi data setelah fitur sudah dibangun asumsi single-tenant).

**Alasan teknis:** Audit menemukan "tenant isolation" disebut sekali di Purpose `05-database-engineering-standard.md` tapi tidak pernah dioperasionalkan — Blueprint sudah punya [09-saas-and-tenancy-readiness.md](../Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md) lengkap, EC hanya perlu **merujuk**, bukan menulis ulang (konsisten prinsip No Duplicate Documentation).

**Dependency:** Tidak bergantung item lain — murni menambah link ke dokumen yang sudah ada.

**Backward compatible / migration:** Backward compatible penuh — tidak ada perubahan aturan, hanya penambahan referensi.

**Estimasi effort:** **S (Small)** — satu-dua kalimat + link, item paling kecil di seluruh rencana.

**Independen atau digabung batch lain:** **Independen**, Batch L — bisa digabung kapan saja karena risikonya nyaris nol.

---

### G7 — DORA Four Keys sebagai Target Placeholder

**Prioritas: Low**

**Alasan bisnis:** DORA metrics (deployment frequency, lead time, MTTR, change failure rate) adalah standar industri untuk mengukur kematangan delivery — bernilai untuk investor due diligence dan kredibilitas eksternal, tapi tidak actionable sampai CI/CD nyata ada.

**Alasan teknis:** `37-engineering-metrics.md` sudah punya pola "target masa depan begitu infrastruktur tersedia" (dipakai untuk RED metrics) — DORA seharusnya mengikuti pola yang sama, saat ini nol disebut bahkan sebagai placeholder.

**Dependency:** **Bergantung pada G2** secara longgar — DORA "change failure rate" akan lebih bermakna begitu dependency scanning (G2) sudah jadi bagian pipeline, meski tidak strictly blocking.

**Backward compatible / migration:** Backward compatible penuh — menambah baris placeholder ke tabel Success Metrics yang sudah ada, N/A migration (metric belum terukur hari ini, sama seperti metric lain di file yang sama).

**Estimasi effort:** **S (Small)** — empat baris tabel tambahan dengan catatan "diukur begitu CI/CD tersedia."

**Independen atau digabung batch lain:** **Independen**, prioritas terendah — kandidat pertama untuk digeser ke luar Batch L jika waktu terbatas, karena murni placeholder tanpa dampak fungsional.

---

## 4. Urutan Implementasi Terbaik (Sequencing)

```
Batch J (Critical + High — Security & Governance Foundation)
├─ G2 (Dependency Scanning)      ─┐
└─ G3 (ASVS V2/V3/V9)             ┼─ dikerjakan bersamaan, file berdekatan (11, 07, 38)
                                   │  tidak saling bergantung, hanya berdekatan tematik

Batch K (Critical — AI Standard)
└─ G1 (AI Governance + Agent Engineering) ─ independen penuh, effort L, sesi terpisah

Batch L (Medium + Low — Cleanup & Alignment)
├─ G4 (Ubiquitous Language)   ─┐
├─ G5 (WCAG)                   ┼─ independen satu sama lain, effort kecil, aman digabung
├─ G6 (Multi-Tenancy Xref)     │  satu batch karena tidak ada risiko saling tumpang tindih
└─ G7 (DORA Placeholder)      ─┘  (bergantung longgar G2, tapi G2 sudah selesai di Batch J)
```

**Kenapa urutan ini menjaga konsistensi repository:**
1. **Batch J duluan** — dua gap Critical/High yang sama-sama menyentuh domain security (`11`, `07`, `38`) dikerjakan berdekatan supaya tidak ada dua PR terpisah mengubah file yang sama di waktu berbeda tanpa konteks satu sama lain (risiko konflik/inkonsistensi jika dipisah jauh).
2. **Batch K setelah J, bukan sebelum** — G1 (AI Governance) secara tematik independen dari security, tapi ditempatkan setelah J karena effort-nya paling besar (L) dan berdiri sendiri — mengerjakan file kecil-cepat (J) dulu memberi momentum sebelum masuk file besar (K), pola yang sama dipakai saat menulis 39 file asli (batch kecil dulu, batch besar belakangan dalam grup temanya).
3. **Batch L terakhir** — seluruhnya Medium/Low, tidak ada dependency keras ke J/K kecuali G7 yang longgar ke G2 (sudah selesai di J), aman dikerjakan kapan saja setelah J selesai.
4. **Tidak ada batch yang saling bergantung secara hard-blocking** — J, K, L bisa dikerjakan dalam urutan lain jika prioritas bisnis berubah, tapi urutan di atas meminimalkan risiko PR yang saling tumpang tindih di file yang sama.

## 5. Ringkasan Tabel Keputusan

| Item | Prioritas | Effort | Backward Compatible | Dependency | Batch |
|---|---|---|---|---|---|
| G1 — AI Governance & Agent Engineering | Critical | L | Ya (file baru) | Tidak ada (dalam rencana ini) | K |
| G2 — Dependency Scanning | Critical | S | Ya | Tidak ada | J |
| G3 — ASVS V2/V3/V9 | High | M | **Tidak sepenuhnya** — perlu Migration Strategy eksplisit | Tidak ada | J |
| G4 — Ubiquitous Language | Medium | S | Ya | Tidak ada | L |
| G5 — WCAG | Medium | S | Ya | Tidak ada | L |
| G6 — Multi-Tenancy Xref | Medium | S | Ya | Tidak ada | L |
| G7 — DORA Placeholder | Low | S | Ya | Longgar → G2 | L |

## 6. Prinsip yang Ditegakkan Rencana Ini

- **Single Source of Truth:** G6 murni link ke Blueprint, tidak menulis ulang readiness checklist. G1 merujuk doc06 untuk arsitektur, tidak mendefinisikan ulang katalog 14 agent.
- **Architecture First:** G1 (AI Governance) baru ditulis setelah doc06 (arsitektur) sudah lengkap — Constitution mengoperasionalkan, bukan mendahului, keputusan arsitektur.
- **Documentation Driven Development:** Seluruh 7 item ditulis sebagai standar **sebelum** kode AI agent/session-handling/dependency-scanning pertama diimplementasikan — bukan didokumentasikan setelah fakta.
- **No Duplicate Documentation:** G6 eksplisit menghindari duplikasi. G1 tidak mengulang katalog automation doc06, hanya menambah lapisan "bagaimana diuji dan diawasi" yang belum ada di manapun.
- **Backward Compatible whenever possible:** 6 dari 7 item backward compatible penuh; G3 satu-satunya yang eksplisit diberi Migration Strategy karena berpotensi menyentuh kode auth existing.
- **ADR hanya bila memenuhi kriteria:** Dikonfirmasi Bagian 1 — tidak ada satu pun dari 7 item yang memenuhi ambang ADR.

## 7. Kriteria Selesai Rencana Ini

Rencana ini dianggap **disetujui** begitu Anda mengonfirmasi lanjut ke Batch J. Setiap Batch (J, K, L) akan melalui pola yang sama dengan penulisan 39 file asli: tulis → self-review (placeholder scan + cross-link verification) → commit terpisah per batch → laporan singkat sebelum lanjut batch berikutnya.

## 8. Metodologi Audit dan Sumber Temuan

Dua audit independen dijalankan sebelum rencana ini disusun:
1. **Audit 10 kategori gap** (governance, engineering, documentation, quality, maintainability, scalability, DevSecOps, testing, AI engineering, review process) — menghasilkan Gap #1-7 asli.
2. **Audit framework spesifik** (OWASP ASVS, NIST SSDF, DORA/Accelerate, Twelve-Factor App, OpenTelemetry/CNCF, Clean Architecture/DDD, SaaS multi-tenancy) + maturity score per 39 file — mengonfirmasi dan memperdalam temuan audit pertama, menghasilkan skor rata-rata 4.0/5 dengan 9 file bernilai 3/5 (gap nyata, bukan asumsi).
3. **Verifikasi susulan AI Governance** (16 topik spesifik: Prompt Versioning, Prompt Registry, Prompt Approval Workflow, AI Evaluation Dataset, AI Benchmark, AI Hallucination Policy, AI Cost Budget, AI Model Routing Policy, HITL Policy, AI Audit Log, AI Response Traceability, AI Safety Guardrails, AI Fallback Strategy, AI Provider Failover, AI Privacy Policy, AI Data Retention) — dikonfirmasi 0/16 mencapai status enforceable EC rule, menghasilkan G1.

Item yang secara eksplisit **dikonfirmasi tetap tepat ditunda** (bukan gap, YAGNI valid): contract/chaos/load testing, adopsi OpenTelemetry/W3C Trace Context formal, Anti-Corruption Layer formal untuk batas multi-tenant, AI Provider Failover otomatis (doc06 eksplisit **menolak** ini by design untuk task finansial/reasoning, bukan sekadar belum sempat dibangun). Item-item ini **tidak** masuk rencana v1.1 — akan ditinjau ulang saat kondisi pemicu masing-masing (service extraction nyata, tim besar, Phase 8 mendekat) benar-benar terjadi.

## 13. Implementation Summary & Freeze Declaration

**Seluruh 7 item (G1-G7) selesai diimplementasikan, diverifikasi, dan di-commit** lewat tiga batch terpisah, masing-masing melalui audit-ulang-terhadap-kode-nyata sebelum implementasi, self-review, dan repository validation menyeluruh sebelum commit — sesuai proses yang dijanjikan Bagian 7.

| Item | Batch | File Terdampak | Commit Hash | Catatan |
|---|---|---|---|---|
| G2 — Dependency/Vulnerability Scanning | J | `11-devsecops-standard.md`, `23-dependency-management.md` | `5765ceb` | Menutup referensi melingkar 23↔11 (23 kini memegang kriteria severity, 11 memegang mekanisme deteksi) |
| G3 — OWASP ASVS V2/V3/V9 | J | `07-security-engineering-standard.md`, `38-security-checklist.md` | `5765ceb` | Diverifikasi terhadap kode nyata (`apps/web/lib/api.ts`, `apps/api/src/index.ts`), bukan saran generik |
| G1 — AI Governance & Agent Engineering Standard | K | Baru: `40-ai-governance-and-agent-engineering-standard.md`; extend: `36-ai-coding-guideline.md`, `38-security-checklist.md`, `README.md` | `f66e059` | 17 Mandatory Rule, 16 topik AI Governance + Agent Engineering; README diupdate 39→40 file |
| G4 — Ubiquitous Language Enforcement | L | `04-domain-driven-design-rules.md` | `655a2da` | Recommended Rule #3 baru, mekanisme verifikasi via code review checklist |
| G5 — Aksesibilitas (WCAG) | L | `12-ui-engineering-standard.md` | `655a2da` | **Dikoreksi saat self-review** — draft awal duplikasi standar WCAG yang sudah ada di [05-design-system-and-ui-ux-architecture.md § Accessibility Standards](../05-design-system-and-ui-ux-architecture.md#accessibility-standards); ditulis ulang untuk merujuk, bukan mendefinisikan ulang |
| G6 — Multi-Tenancy Cross-Reference | L | `05-database-engineering-standard.md` | `655a2da` | Minimal — 1 kalimat + link ke Blueprint, sesuai rencana |
| G7 — DORA Four Keys Placeholder | L | `37-engineering-metrics.md` | `655a2da` | Target belum terukur (nol pipeline CI/CD), bukan angka karangan |

**Findings dicatat selama proses, tidak diperbaiki (di luar scope tiap batch saat ditemukan):**

| # | Finding | Lokasi | Alasan Tidak Diperbaiki |
|---|---|---|---|
| F1 | "Engineering Constitution — 39 file, selesai" basi (kini 40) | `08-metrics-and-closing/39-final-engineering-manifesto.md` | Di luar scope Batch K/L; file bukan target batch manapun |
| F2 | "lintas 39 file Engineering Constitution" basi | `GLOSSARY.md` | Di luar scope Batch K/L |
| F3 | "39 file" disebut 2×, basi | `05-team-process/15-code-review-checklist.md` | Di luar scope Batch K/L |
| F4 | "39 file" disebut di 3 lokasi (README Blueprint, traceability matrix, ADR-003) | `Master-Delivery-Blueprint/` | **MUST NOT** diubah — eksplisit dilarang aturan batch ("Jangan pernah mengubah Blueprint") |
| F5 | "38 file lain" basi (line 11) — dikoreksi ulang saat Freeze: "36 file" di baris lain **terverifikasi tetap akurat** (36 file di folder 01-07, tidak berubah sejak file 40 masuk `07-domain-specific/`), bukan stale seperti dugaan awal Batch L | `08-metrics-and-closing/37-engineering-metrics.md` | Di luar scope spesifik G7 (soal DORA, bukan akurasi hitungan file); sempat tidak sengaja diperbaiki lalu di-revert di Batch L untuk menjaga scope discipline |

**Resolusi findings F1-F5 di Freeze ini:** Konsisten [00-principles/00-engineering-principles.md § 9 Amendment Process](00-principles/00-engineering-principles.md#9-amendment-process), perbaikan typo/kejelasan tanpa mengubah makna aturan **MUST NOT** butuh ADR atau justifikasi khusus — PR langsung cukup. F1, F2, F3, F5 (di dalam Engineering Constitution, bukan Blueprint) diperbaiki sebagai bagian aktivitas Freeze ini (lihat commit Freeze) karena declaring v1.1 sebagai baseline resmi **MUST** konsisten secara internal terhadap jumlah file yang benar-benar ada — F4 (Blueprint) **tetap tidak diperbaiki**, tercatat sebagai temuan untuk siklus kerja Blueprint terpisah, karena aturan "Jangan pernah mengubah Blueprint" mengikat penuh bahkan saat Freeze.

**Deklarasi Freeze:**

Per konfirmasi eksplisit pemilik proyek, Engineering Constitution v1.1 (40 file + README + GLOSSARY + 3 ADR) dinyatakan sebagai **baseline engineering resmi Puraloka Suite** — standar mengikat untuk seluruh implementasi Phase 1 sampai Phase 9, sampai amandemen berikutnya disahkan lewat proses yang sama ([19-architecture-decision-record-guide.md](06-governance/19-architecture-decision-record-guide.md) untuk perubahan MUST/struktural, PR langsung untuk SHOULD/MAY/typo).

**Efek Freeze:**
1. `IMPROVEMENT-PLAN-v1.1.md` (dokumen ini) **tidak diedit lagi** setelah commit Freeze — dokumen sejarah, bukan living document.
2. Perubahan berikutnya terhadap Engineering Constitution **WAJIB** dokumen versi baru (v1.2, v1.3, dst.) mengikuti pola yang sama, atau amandemen individual per [Amendment Process](00-principles/00-engineering-principles.md#9-amendment-process) tanpa nomor versi payung jika perubahannya kecil dan terisolasi.
3. Git tag `engineering-constitution-v1.1` menunjuk commit Freeze ini sebagai **Repository Baseline** — titik rollback dan acuan audit terpisah dari Governance Baseline (dokumen ini).

---

*Engineering Constitution v1.1 — IMPLEMENTED & FROZEN. Governance Baseline resmi Puraloka Suite.*
