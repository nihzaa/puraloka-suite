# 04 — Roadmap, Governance & Delivery

**Repository:** Puraloka Suite Architecture Repository
**Dokumen:** 5 dari 7 (lihat [00](00-vision-and-business-architecture.md), [01](01-application-and-data-architecture.md), [02](02-security-and-compliance-architecture.md), [03](03-platform-and-intelligence-architecture.md), [05](05-design-system-and-ui-ux-architecture.md), [06](06-agentic-ai-and-automation-architecture.md))
**Upstream dependency:** Dokumen ini mensintesis temuan dari keempat dokumen sebelumnya menjadi urutan eksekusi konkret. Setiap item roadmap merujuk balik ke bagian relevan di dokumen 00-03.
**Status:** Living document — ini dokumen yang paling sering direvisi seiring setiap fase selesai

---

## Assumptions & Non-Goals

- Roadmap ini diasumsikan dieksekusi oleh **tim kecil** ([00 — Assumptions](00-vision-and-business-architecture.md#assumptions)) — estimasi effort dan urutan fase mengasumsikan 1-3 engineer, bukan tim besar.
- Non-goal: dokumen ini tidak menjadwalkan tanggal kalender pasti (bukan Gantt chart proyek) — itu adalah keputusan operasional yang dibuat saat setiap fase dimulai, dengan kapasitas tim nyata saat itu. Yang didefinisikan di sini adalah **urutan dan dependency**, bukan tanggal.
- **Setiap fase di bawah WAJIB melalui 5 gate berikut sebelum implementasi dimulai** (instruksi eksplisit yang mengikat seluruh roadmap ini): (1) Architecture Review, (2) Risk Assessment, (3) Security Review, (4) Migration Strategy, (5) Rollback Strategy. Detail proses ada di [Architecture Governance](#architecture-governance--phase-gates).

---

## Gap Analysis

Ringkasan delta antara current state (L1, [00](00-vision-and-business-architecture.md#current-state-assessment)) dan target transitional state (L2), disusun per kategori.

| Kategori | Current (L1) | Target (L2) | Gap | Dokumen Rujukan |
|---|---|---|---|---|
| Tenancy | Tidak ada kolom isolasi | `company_id` di seluruh tabel transaksional | Migrasi skema + backfill + RLS dual-axis | [01](01-application-and-data-architecture.md#entity-strategy), [02](02-security-and-compliance-architecture.md#row-level-security--tenant-isolation) |
| Authorization | RBAC sebagian konsisten (permission table ada, tapi RLS + `requireRole` + inline checks tidak sinkron) | RBAC konsisten penuh, RLS baca tabel yang sama dengan API | Hapus 4 `requireRole`, audit inline checks, generalisasi RLS | [01](01-application-and-data-architecture.md#dynamic-permission-engine), [02](02-security-and-compliance-architecture.md#authorization-strategy) |
| Workflow/Approval | Hardcoded per modul (kasbon, CO, procurement masing-masing reimplementasi) | Workflow Engine generik, approval chain konfigurabel per company | Bangun `workflow_definitions`/`states`/`transitions`, migrasi 3+ modul existing | [01](01-application-and-data-architecture.md#dynamic-workflow--approval-engine) |
| Notification Routing | Hardcoded per event type | Rule-driven, template-based | Bangun `notification_rules`, migrasi fungsi resolusi existing | [01](01-application-and-data-architecture.md#dynamic-notification-routing-engine) |
| Dashboard Persistence | `localStorage` saja | Backend-persisted, sinkron lintas device | Tabel `dashboard_layouts` + endpoint CRUD | [01](01-application-and-data-architecture.md#dynamic-menu--dashboard-registry) |
| Menu Structure | Hardcoded JSX + permission visibility | Registry-driven | Tabel `menu_items`, refactor `sidebar.tsx` jadi renderer | [01](01-application-and-data-architecture.md#dynamic-menu--dashboard-registry) |
| Testing | **Tidak ada test suite** | Test coverage untuk business logic kritis (finansial, approval) | Setup Vitest/Jest, prioritas: kasbon, EVM calculation, RAB bubble-up | [Engineering Standards](#engineering-standards) di bawah |
| CI/CD | Tidak ada | Pipeline dasar: lint, typecheck, test, deploy | Setup GitHub Actions | [Engineering Standards](#engineering-standards) |
| Observability | Pino log lokal saja | Metrics + logs tersalurkan ke backend terpusat | OTel instrumentation, Grafana/Loki/Prometheus setup | [03](03-platform-and-intelligence-architecture.md#observability-architecture) |
| Deployment | Manual, lokal | Cloud deployment dengan environment terkelola | Pilih platform, setup env vars terkelola, CDN otomatis | [02](02-security-and-compliance-architecture.md#secrets-management), [03](03-platform-and-intelligence-architecture.md#cdn--storage-architecture) |
| Audit Log Integrity | Bisa diedit/dihapus | Append-only enforced | Trigger Postgres penolak UPDATE/DELETE | [02](02-security-and-compliance-architecture.md#audit-logging--tamper-proof-logging) |

---

## Foundational Engines Prioritization

Ranking ROI eksplisit, digabung dari analisis [01](01-application-and-data-architecture.md#dynamic-engines-architecture--ringkasan-prioritas) dan [02](02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable), dengan estimasi effort/impact kualitatif.

| # | Engine/Item | Effort | Impact | Urgensi | Kenapa Urutan Ini |
|---|---|---|---|---|---|
| 1 | **Perbaikan konsistensi Permission Engine** (hapus `requireRole`, audit inline checks, sinkronkan RLS) | Medium | **Kritis** | Now | Ini bukan fitur baru — ini menutup gap keamanan yang **sudah aktif hari ini**. Semua engine lain dibangun di atas asumsi otorisasi yang benar; membangun Workflow Engine di atas Permission Engine yang bocor mewariskan kerentanan. |
| 2 | **Test suite untuk business logic kritis** | Medium | **Kritis** | Now | Zero test coverage pada sistem yang menangani uang sungguhan (kasbon, invoice, EVM) adalah risiko operasional, bukan sekadar gap teknis. Ini juga prasyarat aman untuk melakukan refactor #1 dan #3 tanpa takut merusak logic finansial yang sudah berjalan. |
| 3 | **Dashboard layout → backend persistence** | Rendah | Menengah | Now | Quick win — biaya sangat rendah, manfaat langsung dirasakan bahkan di L1 (user ganti device tidak kehilangan layout). Baik untuk momentum sambil mengerjakan #1-2 yang lebih berat. |
| 4 | **CI/CD dasar** | Rendah-Medium | Tinggi | Now | Prasyarat untuk semua fase berikutnya berjalan aman — tanpa ini, setiap perubahan besar (terutama #1, #5, #6) berisiko regresi tak terdeteksi. |
| 5 | **Dynamic Workflow & Approval Engine** | Tinggi | Tinggi | Next | Prasyarat keras sebelum company kedua (L2) bisa punya SOP approval berbeda tanpa fork kode. Effort tinggi karena menyentuh 3+ modul finansial-kritis sekaligus — harus dikerjakan setelah #2 (test coverage) ada sebagai jaring pengaman. |
| 6 | **Dynamic Notification Routing Engine** | Menengah | Menengah-Tinggi | Next | Bisa dikerjakan paralel dengan #5 (berbeda area kode), ROI tinggi dengan biaya lebih rendah dari Workflow Engine. |
| 7 | **`company_id` migration + dual-axis RLS** | Tinggi | Tinggi (prasyarat L2) | Next | Perubahan skema paling invasif di roadmap ini — butuh #1 (permission konsisten) dan #2 (test coverage) selesai lebih dulu sebagai fondasi aman. |
| 8 | **Observability dasar (metrics + logs terpusat)** | Menengah | Tinggi | Next | Idealnya paralel dengan persiapan deployment cloud pertama — tanpa ini, deployment publik pertama berjalan "buta". |
| 9 | **Audit log append-only trigger** | Sangat Rendah | Menengah | Next | Effort minimal (satu trigger SQL), bisa diselipkan kapan saja setelah #1, prioritas naik begitu multi-admin (L2) mendekat. |
| 10 | **Menu Registry** | Rendah-Medium | Rendah (kosmetik) | Later | Manfaat baru terasa nyata setelah ada company kedua dengan kebutuhan menu berbeda. |
| 11 | **AI Assistant (pilot)** | Menengah | Sedang (validasi pola) | Later | Lihat [03](03-platform-and-intelligence-architecture.md#nownextlateroptional-untuk-ai-platform) — sengaja ditunda sampai Permission Engine (#1) benar-benar solid, karena guardrail AI bergantung penuh padanya. |
| 12 | **Field Registry / Metadata System formal** | Tinggi | Rendah-Menengah (belum ada driver nyata) | Later/Optional | Perluas pola JSONB existing dulu; sistem generik penuh menunggu bukti kebutuhan dari 2+ company. |

---

## Phase 0-9 Transformation Program

Setiap fase **wajib menghasilkan working software** — tidak ada fase yang murni riset tanpa deliverable yang berjalan (kecuali Phase 0, yang deliverable-nya adalah dokumen arsitektur ini sendiri).

### Phase 0 — Discovery & Architecture
**Status: SELESAI (dokumen ini adalah deliverable-nya).**
Deliverable: 5 dokumen architecture repository (00-04), disetujui dan di-commit ke version control.
Gate keluar: User me-review dan menyetujui isi repository ini (lihat [Definition of Done](#definition-of-done) di bawah untuk Phase 0 secara spesifik).

### Phase 1 — Core Platform Foundation
**Tujuan:** Menutup gap fondasi yang membuat semua fase berikutnya aman dikerjakan.
**Cakupan:** Item #1-4 di [Foundational Engines Prioritization](#foundational-engines-prioritization) — perbaikan Permission Engine, test suite untuk logic finansial kritis, dashboard persistence, CI/CD dasar.
**Working software di akhir fase:** Sistem yang sudah berjalan hari ini, sekarang dengan RBAC yang benar-benar konsisten end-to-end, test coverage untuk jalur finansial kritis, dan pipeline CI yang menjalankan test tersebut otomatis.
**Bukan cakupan fase ini:** Multi-company, Workflow Engine, deployment cloud — ini murni memperkuat fondasi L1 yang ada.

### Phase 2 — Configuration Driven Platform
**Tujuan:** Membangun Dynamic Workflow Engine dan Notification Routing Engine — dua engine dengan ROI tertinggi setelah fondasi (Phase 1) aman.
**Cakupan:** Item #5-6 — `workflow_definitions`/`states`/`transitions`, migrasi kasbon/change-order/procurement ke engine generik; `notification_rules` + migrasi fungsi resolusi existing.
**Working software di akhir fase:** Approval chain kasbon/CO/procurement berjalan di atas state machine generik yang sama (bukan 3 implementasi terpisah); notifikasi di-route lewat rule table, bukan fungsi hardcoded.
**Dependency:** Membutuhkan test coverage dari Phase 1 sebagai jaring pengaman — memindahkan logic finansial-kritis tanpa test adalah risiko yang tidak sepadan.

### Phase 3 — Construction Core Modules
**Tujuan:** Memperkuat Core Domain ([00](00-vision-and-business-architecture.md#core-domains)) — bukan modul baru dari nol, tapi mengisi gap Tier 1/2 yang paling berdampak pada operasional Puraloka Persada nyata.
**Kandidat cakupan (diprioritaskan saat fase ini dimulai, dengan data kebutuhan nyata saat itu):** BOQ/AHSP (standar konstruksi Indonesia, gap Tier 2 yang mungkin naik prioritas jika terasa nyata di operasional), Quality Control checklist, HSE incident report dasar.
**Working software di akhir fase:** Minimal 1-2 modul Tier 2 dari [Module Catalog](00-vision-and-business-architecture.md#module-catalog--tiering) berjalan, dipilih berdasarkan kebutuhan operasional paling mendesak saat fase ini dimulai — bukan diputuskan sekarang secara spekulatif.

### Phase 4 — Enterprise Modules
**Tujuan:** Modul yang bernilai untuk grup usaha dengan beberapa company (mendekati L2 penuh) — Payroll dasar, HR dasar, GL/Accounting yang lebih formal.
**Prasyarat:** Company/tenant model dari Phase 5 di bawah **secara konseptual perlu matang** sebelum modul-modul ini bernilai penuh — namun karena roadmap ini eksplisit meminta Phase 4 (Enterprise Modules) sebelum Phase 7 (Multi Company), interpretasi yang benar adalah: modul-modul ini dibangun *single-company-aware* dulu di Phase 4, dan mendapat kesadaran multi-company saat Phase 7 menambahkan `company_id`. Ini valid selama modul di Phase 4 dirancang tidak berasumsi hardcoded satu company (mis. jangan hardcode nama Puraloka Persada di logic).

### Phase 5 — Automation Platform
**Cakupan:** Trigger Engine (cron job otomatis menggantikan trigger manual `/sistem`), Event Engine in-process, migrasi notifikasi menjadi event-consumer. Lihat [03](03-platform-and-intelligence-architecture.md#automation-platform--event-platform).
**Working software di akhir fase:** `check-milestones`/`check-deadlines` berjalan otomatis via scheduler, bukan diklik manual; event emitter internal menjadi jalur baku untuk memicu efek samping lintas-domain.

### Phase 6 — AI Native Platform
**Cakupan:** AI Agent Registry, mulai dari AI Assistant sebagai pilot (lihat [03](03-platform-and-intelligence-architecture.md#ai-architecture)).
**Prasyarat keras:** Phase 1 (Permission Engine konsisten) dan Phase 2 (Workflow Engine) harus benar-benar selesai — guardrail AI yang didesain di [03](03-platform-and-intelligence-architecture.md) secara eksplisit bergantung pada RBAC/PBAC yang solid. Membangun AI Platform sebelum ini adalah *out of order* menurut prinsip governing di dokumen ini.

### Phase 7 — Multi Company Support
**Cakupan:** `company_id` migration, dual-axis RLS, tabel `companies` dengan `parent_company_id` — item #7 di prioritization.
**Working software di akhir fase:** Puraloka Suite bisa mengoperasikan 2+ badan usaha (misalnya jika Puraloka Persada punya anak perusahaan) dalam satu instance, data terisolasi benar secara logis. Ini adalah **pencapaian L2 secara resmi**.

### Phase 8 — Multi Tenant SaaS Platform
**Cakupan:** Billing per tenant, self-service onboarding, SLA per tenant, tenant provisioning — lapisan bisnis di atas mekanisme `company_id`/isolasi yang sudah ada dari Phase 7 (lihat [01 — Entity Strategy](01-application-and-data-architecture.md#entity-strategy) untuk penjelasan kenapa L2 dan L3 berbagi mekanisme data yang sama).
**Gate masuk paling ketat di seluruh roadmap:** Fase ini **tidak dimulai** tanpa minimal satu pelanggan eksternal (di luar grup usaha Puraloka) yang sudah committed — membangun infrastruktur SaaS tanpa pelanggan adalah *enterprise theater* yang eksplisit dilarang di [00](00-vision-and-business-architecture.md#non-goals).

### Phase 9 — Enterprise Scale Platform
**Cakupan:** Kandidat ekstraksi service (sesuai [Service Extraction Strategy](01-application-and-data-architecture.md#service-extraction-strategy), dipicu driver nyata bukan jadwal), multi-region jika ekspansi regional (L4) benar terjadi, compliance formal (SOC2/ISO) jika pelanggan enterprise mensyaratkan.
**Catatan:** Ini horizon 5-10 tahun — detail konkret fase ini **sengaja tidak didesain mendalam sekarang** (lihat [01 — Target Architecture](01-application-and-data-architecture.md#target-architecture-l3-l4)), akan direvisi total berdasarkan realita bisnis saat mendekati fase ini.

---

## Migration Strategy (Prinsip Lintas-Fase)

1. **Setiap migration schema harus backward-compatible dalam satu deploy cycle** — tambah kolom nullable dulu, backfill, baru jadikan `NOT NULL` di migration terpisah. Ini sudah sebagian jadi kebiasaan baik di project ini (57 migration file aditif) — pertahankan disiplin ini terutama untuk migrasi `company_id` yang menyentuh hampir semua tabel.
2. **Strangler fig untuk penggantian engine hardcoded** — Workflow Engine (Phase 2) tidak mengganti logic kasbon/CO/procurement sekaligus. Urutan: bangun engine generik → migrasi kasbon dulu (paling sederhana) sebagai bukti konsep → validasi dengan test suite dari Phase 1 → migrasi change-orders → migrasi procurement (paling kompleks, banyak status). Setiap langkah adalah deploy terpisah dengan kemungkinan rollback independen.
3. **Feature flag untuk perubahan authorization** — perbaikan Permission Engine (Phase 1) yang mengubah RLS adalah kandidat paling berisiko untuk regresi silent (kebocoran data atau, sebaliknya, akses yang salah diblokir). Deploy di belakang flag yang bisa dimatikan cepat jika perilaku tak terduga muncul di production.

## Rollback Strategy (Prinsip Lintas-Fase)

- **Migration schema:** Setiap migration baru punya migration "down" yang diverifikasi bisa dijalankan (bukan hanya ditulis, tapi benar-benar dites di environment staging) sebelum migration "up" di-apply ke production — ini gap nyata hari ini (57 migration file, kemungkinan besar tidak semua punya rollback path teruji).
- **Perubahan authorization/RLS:** Rollback path harus lebih cepat dari rollback schema biasa, karena dampak salah-konfigurasi RLS langsung terasa sebagai user terkunci dari data mereka sendiri — idealnya via feature flag (poin di atas), bukan menunggu deploy rollback penuh.
- **Workflow Engine migration per-modul:** Karena migrasi dilakukan strangler-fig per modul (kasbon dulu, baru CO, baru procurement), rollback satu modul tidak memengaruhi modul lain yang belum dimigrasikan — ini keuntungan tambahan dari pendekatan bertahap.

---

## Risk Register

| # | Risiko | Kategori | Likelihood | Impact | Mitigasi | Dokumen Rujukan |
|---|---|---|---|---|---|---|
| 1 | Role kustom yang dibuat via UI mendapat cakupan RLS nol, menyebabkan silent access failure atau (lebih buruk) silent data leak jika policy default-nya salah arah | Security | Tinggi (kondisi sudah ada hari ini) | Tinggi | Phase 1, item #1 prioritas tertinggi | [00](00-vision-and-business-architecture.md), [02](02-security-and-compliance-architecture.md) |
| 2 | Perubahan logic finansial (kasbon, EVM, RAB bubble-up) tanpa test coverage menyebabkan regresi silent yang tidak terdeteksi sampai laporan keuangan salah | Operasional/Finansial | Tinggi (zero test coverage hari ini) | Tinggi | Phase 1, item #2 — test suite sebelum refactor besar apa pun | [00](00-vision-and-business-architecture.md#kualitas-rekayasa--fakta-terverifikasi) |
| 3 | Migrasi `company_id` (Phase 7) menyentuh hampir seluruh skema — human error saat backfill menyebabkan data ter-assign ke company salah | Data Integrity | Menengah | Tinggi | Migration strategy bertahap + backup terverifikasi sebelum migrasi + dry-run di staging | [01](01-application-and-data-architecture.md#entity-strategy) |
| 4 | Tidak ada disaster recovery terverifikasi — jika Supabase project bermasalah tanpa PITR aktif, kehilangan data permanen | Operasional | Rendah-Menengah (belum diverifikasi, bisa jadi sudah aman) | Sangat Tinggi jika terjadi | Verifikasi status backup SEGERA (Now item, biaya nyaris nol) | [02](02-security-and-compliance-architecture.md#incident-response-disaster-recovery-business-continuity) |
| 5 | Solo engineer = bus factor 1 — seluruh pengetahuan sistem (67 tabel, 159 endpoint) ada di satu kepala | Organisasi | Tinggi (kondisi struktural, bukan bug) | Sangat Tinggi | Dokumentasi arsitektur ini sendiri adalah mitigasi parsial; hire kedua menjadi prioritas begitu Phase 2-3 mulai terasa berat untuk 1 orang | [00](00-vision-and-business-architecture.md) |
| 6 | Membangun Phase 8 (Multi-Tenant SaaS) tanpa pelanggan eksternal nyata — investasi besar untuk pasar yang belum tervalidasi | Bisnis/Strategis | Menengah (tergoda karena "sudah didesain") | Tinggi (waktu engineer terbatas terbuang) | Gate masuk Phase 8 eksplisit: wajib ada komitmen pelanggan sebelum mulai | [00](00-vision-and-business-architecture.md#non-goals) |
| 7 | AI Platform (Phase 6) dibangun sebelum Permission Engine benar-benar solid, mewariskan gap otorisasi ke agent yang punya jangkauan lebih luas dari manusia biasa | Security | Rendah (dapat dicegah oleh ordering roadmap) | Tinggi jika terjadi | Gate masuk Phase 6 eksplisit: Phase 1 & 2 harus selesai dan diverifikasi | [03](03-platform-and-intelligence-architecture.md#ai-architecture) |
| 8 | Deployment cloud pertama terjadi tanpa observability (Phase 1 CI/CD ada, tapi metrics/logs terpusat baru Next di [03](03-platform-and-intelligence-architecture.md)) — sistem "buta" di production | Operasional | Menengah | Menengah-Tinggi | Pastikan observability dasar (item #8) selesai sebelum atau bersamaan dengan deployment publik pertama, bukan sesudahnya | [03](03-platform-and-intelligence-architecture.md#observability-architecture) |
| 9 | `SUPABASE_SECRET_KEY` (bypass semua RLS) bocor — blast radius terbesar dari kredensial mana pun di sistem | Security | Rendah | Sangat Tinggi jika terjadi | `.gitignore` diverifikasi, secret scanning di CI (Phase 1), migrasi ke vault di Later | [02](02-security-and-compliance-architecture.md#secrets-management) |

## Technical Debt Register

Item yang **secara sadar** ditunda (bukan terlupa) dengan kondisi kapan harus diangkat kembali:

| Item | Kenapa Ditunda | Kondisi untuk Diangkat Kembali |
|---|---|---|
| CQRS/Event Sourcing formal | Pola ringan sudah organik terjadi, formalisasi penuh belum perlu | Read-load jadi bottleneck terukur di metrics (Phase 1 observability akan mendeteksi ini) |
| Saga pattern | Tidak relevan selama modular monolith | Service Extraction Strategy benar-benar mengekstrak domain yang saling bertransaksi |
| Field-level encryption | Tidak ada persyaratan compliance hari ini | Pelanggan enterprise L3 mensyaratkan secara kontraktual |
| Full HRIS/Payroll native | Integrasi pihak ketiga lebih masuk akal | Volume pengguna HR/Payroll jadi besar cukup untuk membenarkan biaya bangun sendiri |
| Microservices/Kafka | Overkill untuk skala saat ini | Service Extraction Strategy trigger nyata (beban divergen, tim terpisah, atau isolasi kegagalan kritis) |

## Never Build List

Item yang **secara eksplisit tidak akan dibangun** kecuali ada perubahan fundamental pada model bisnis (bukan sekadar "belum", tapi "kemungkinan besar tidak pernah"):

- **Full EAV (entity-attribute-value) untuk seluruh sistem** — anti-pattern performa; JSONB spec fields yang sudah ada cukup untuk kebutuhan fleksibilitas nyata
- **Multi-currency di L1/L2** — tidak relevan untuk kontraktor domestik Indonesia; hanya dipertimbangkan jika L4 regional benar terjadi
- **BIM viewer 3D native + Clash Detection** — investasi besar (rendering engine, format IFC/Revit), nilai belum tervalidasi; integrasi dengan tool BIM eksisting (Autodesk, dll.) lebih masuk akal daripada membangun viewer sendiri (lihat [Module Catalog — Project Delivery](00-vision-and-business-architecture.md#domain-project-delivery-core))
- **LMS (Learning Management System) penuh** — tidak ada sinyal permintaan apa pun
- **ESG/Sustainability Reporting native** — hanya relevan jika klien enterprise besar mewajibkan; integrasi/ekspor data ke tool ESG pihak ketiga lebih masuk akal
- **Facilities Management / O&M penuh (post-construction asset lifecycle)** — lini bisnis berbeda dari kontraktor; digital handover package (deliverable proyek) tetap Tier 3/Optional, tapi mengelola aset bertahun-tahun setelah serah terima bukan bisnis Puraloka kecuali model bisnis berubah nyata (lihat [Module Catalog — Facilities Management](00-vision-and-business-architecture.md#domain-facilities-management--om-handover-domain-baru--hilang-sepenuhnya))
- **Microservices sebagai default arsitektur** — modular monolith tetap default permanen kecuali driver nyata muncul (lihat [Service Extraction Strategy](01-application-and-data-architecture.md#service-extraction-strategy))
- **Kafka sebagai starting point event infrastructure** — selalu mulai dari primitif lebih sederhana, naik tier hanya dengan bukti kebutuhan nyata
- **Membangun ulang Supabase Auth/Storage sendiri** — Generic Domain yang sudah solved

---

## Architecture Governance & Phase Gates

Setiap fase (Phase 1-9) **wajib** melalui 5 gate berikut sebelum implementasi boleh dimulai — ini bukan birokrasi, ini disiplin yang mencegah "jalan pintas" pada sistem yang menangani uang sungguhan:

1. **Architecture Review** — apakah desain fase ini konsisten dengan prinsip di 4 dokumen sebelumnya (config-driven, modular monolith, avoid premature complexity)? Siapa yang review: minimal 1 orang selain penulis kode (jika masih solo, ini bisa berupa dokumentasi tertulis singkat + jeda 1 hari sebelum eksekusi — mencegah keputusan impulsif).
2. **Risk Assessment** — item baru apa yang perlu ditambahkan ke [Risk Register](#risk-register) untuk fase ini secara spesifik?
3. **Security Review** — apakah fase ini menyentuh authorization, data isolasi, atau secret? Jika ya, cross-check eksplisit terhadap [02 — Security Checklist](02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable).
4. **Migration Strategy** — sesuai [prinsip lintas-fase](#migration-strategy-prinsip-lintas-fase) di atas, didokumentasikan spesifik untuk fase ini.
5. **Rollback Strategy** — sesuai [prinsip lintas-fase](#rollback-strategy-prinsip-lintas-fase), didokumentasikan spesifik untuk fase ini.

**Output setiap gate:** update ke dokumen ini (terutama Risk Register dan Gap Analysis) — architecture repository ini adalah *living document* yang direvisi setiap fase selesai, bukan ditulis sekali dan dilupakan.

## Definition of Done

**Untuk Phase 0 (dokumen ini):** 5 dokumen ditulis, cross-reference konsisten, di-commit ke git, direview dan disetujui oleh user.

**Untuk Phase 1-9 (pola umum, disesuaikan per fase saat dimulai):** Working software di production/staging + test coverage untuk logic yang diubah + 5 gate di atas terpenuhi dan terdokumentasi + Risk Register dan Gap Analysis di dokumen ini diperbarui.

## Engineering Standards

Prinsip yang mengikat **seluruh** kode yang ditulis dari Phase 1 dan seterusnya (kode existing tidak di-refactor massal hanya untuk memenuhi ini — diterapkan pada kode baru dan area yang disentuh):

- **SOLID, DRY, KISS, YAGNI** — khususnya YAGNI: prinsip ini adalah alasan utama kenapa dokumen ini menolak membangun Form Builder/SLA Engine/Rules Engine generik sebelum ada 2+ company dengan kebutuhan nyata berbeda (lihat [01](01-application-and-data-architecture.md#engine-yang-sengaja-tidak-diprioritaskan-di-l2)).
- **Clean Architecture / Hexagonal** — diterapkan secara pragmatis lewat [Modular Monolith Strategy](01-application-and-data-architecture.md#modular-monolith-strategy) (repository/service/routes per domain), bukan lapisan abstraksi berlebihan untuk aplikasi CRUD sederhana.
- **Strict typing** — TypeScript sudah dipakai konsisten; pertahankan, perketat `strict: true` di `tsconfig.json` jika belum (item verifikasi Phase 1).
- **Testing** — prioritas coverage: business logic finansial (kasbon, EVM, RAB bubble-up) dan authorization (permission checks) dulu, UI component testing belakangan.
- **Twelve Factor App** — relevan terutama untuk config (env vars, sudah diikuti), dan statelessness API (sudah terpenuhi secara tidak sengaja, lihat [03 — Horizontal Scaling](03-platform-and-intelligence-architecture.md#horizontal-scaling-strategy)).
- **RFC/ADR process:** Untuk keputusan arsitektur signifikan di luar yang sudah tercakup dokumen ini, catat sebagai entry singkat (konteks, keputusan, konsekuensi) — bisa berupa file `docs/adr/NNNN-judul.md` per keputusan, dimulai saat keputusan pertama yang benar-benar butuh dicatat muncul (bukan dibuat kerangka kosong sekarang).

## Release Strategy

**Now (L1/Phase 1):** Deploy manual tetap dapat diterima sampai CI/CD (Phase 1 item) selesai — tidak perlu menunggu CI/CD sempurna untuk terus mengembangkan fitur, tapi CI/CD adalah prioritas Now, bukan Next.

**Next (Phase 2 dan seterusnya):** Setiap deploy melalui CI (test otomatis lulus) sebelum ke production. Strangler-fig migration (lihat Migration Strategy) berarti rilis Workflow Engine per-modul adalah rilis terpisah, bukan big-bang.

**Later (L2/L3):** Blue-green atau canary deployment begitu ada lebih dari satu company bergantung pada uptime sistem yang sama — downtime yang bisa diterima untuk 1 perusahaan (maintenance window malam hari) tidak lagi cukup sopan untuk banyak perusahaan dengan jam kerja berbeda.

---

## Rekomendasi Fase Implementasi Berikutnya

Setelah menimbang seluruh Gap Analysis, Risk Register, dan Foundational Engines Prioritization di atas, rekomendasi tunggal untuk langkah implementasi paling bernilai berikutnya:

> **Mulai Phase 1 — Core Platform Foundation, dimulai dari perbaikan konsistensi Permission Engine (item #1) berjalan paralel dengan setup test suite dasar (item #2).**

**Kenapa ini, bukan yang lain:**

1. **Ini bukan fitur baru yang mewah — ini menutup kerentanan yang sudah aktif hari ini.** Gap RLS-tidak-menjangkau-role-kustom bukan risiko teoretis masa depan, itu kondisi nyata di production sekarang. Setiap hari ditunda adalah eksposur berkelanjutan.
2. **Semua fase lain di roadmap ini (Workflow Engine, company_id migration, AI Platform) secara eksplisit bergantung pada Permission Engine yang solid** — mengerjakan fase lain lebih dulu berarti membangun di atas fondasi yang diketahui retak.
3. **Test suite adalah jaring pengaman untuk fase ini sendiri** — memperbaiki RLS dan menghapus hardcoded role check menyentuh logic otorisasi finansial-kritis; melakukan ini tanpa test adalah mengulangi pola risiko yang sama yang sedang diperbaiki.
4. **Effort-nya proporsional dengan kapasitas tim solo** — ini bukan proyek multi-bulan seperti Workflow Engine; ini pekerjaan yang bisa diselesaikan dalam hitungan minggu, memberi kemenangan cepat sebelum masuk ke Phase 2 yang lebih berat.

Setelah Phase 1 selesai dan diverifikasi (5 gate governance terpenuhi), urutan alami berikutnya adalah Phase 2 (Workflow + Notification Engine) — tapi keputusan itu ditinjau ulang saat Phase 1 selesai, bukan dikunci sekarang.

---

*Dokumen governance ini dilengkapi oleh [05 — Design System & UI/UX Architecture](05-design-system-and-ui-ux-architecture.md) dan [06 — Agentic AI & Automation Architecture](06-agentic-ai-and-automation-architecture.md), yang menerapkan proses phase-gate yang sama untuk domain desain dan AI/automation. Kembali ke [00 — Vision & Business Architecture](00-vision-and-business-architecture.md) untuk ringkasan menyeluruh.*
