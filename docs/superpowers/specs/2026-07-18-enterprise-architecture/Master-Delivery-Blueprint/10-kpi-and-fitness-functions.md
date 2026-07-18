# 10 — KPI Engineering, KPI Product, KPI Business, Architecture Fitness Functions

**Kedudukan dokumen ini:** Orkestrasi Baru sepenuhnya — belum ada KPI Product/Business di dokumen manapun (Engineering Constitution hanya punya Success Metrics per-file teknis, [Engineering-Constitution/08-metrics-and-closing/37-engineering-metrics.md](../Engineering-Constitution/08-metrics-and-closing/37-engineering-metrics.md)). **Sumber KPI Engineering:** agregasi dari 37-engineering-metrics.md (sudah ada, direferensikan bukan diduplikasi). KPI Product/Business dan Architecture Fitness Functions ditulis penuh baru di sini.

---

## 1. KPI Engineering

**Sumber tunggal:** [Engineering-Constitution/08-metrics-and-closing/37-engineering-metrics.md § 6](../Engineering-Constitution/08-metrics-and-closing/37-engineering-metrics.md#6-kategori-metrik-agregat) — 4 kategori (Security & Access Control, Testing & Quality, Governance & Process, Observability), masing-masing dengan target dan sumber. **Tidak diparafrase ulang** — baca langsung untuk daftar metric lengkap.

**Ringkasan orientasi:** KPI Engineering mengukur **kesehatan cara sistem dibangun** — coverage test, konsistensi RLS-RBAC, log terstruktur. Ini beda kategori dari KPI Product (Bagian 2) dan KPI Business (Bagian 3) di bawah, yang keduanya **belum pernah didefinisikan** di dokumen manapun sampai Blueprint ini.

## 2. KPI Product — Kontribusi Baru

**Prinsip:** KPI Product mengukur **apakah fitur yang dibangun benar-benar dipakai dan bernilai** untuk pengguna internal (PM, mandor, admin, client) — beda dari KPI Engineering yang mengukur kualitas kode.

| KPI | Definisi | Target Awal | Program Terkait |
|---|---|---|---|
| **Adoption Rate Modul Baru** | % user aktif yang memakai modul dalam 30 hari setelah rilis | >70% untuk modul yang menggantikan proses manual existing (mis. RFI menggantikan komunikasi WhatsApp informal) | Program C |
| **Time-to-Approve** | Rata-rata waktu dari pengajuan kasbon/CO/procurement sampai keputusan approve/reject | Menurun setelah Workflow Engine aktif (baseline diukur sebelum Program B, dibandingkan sesudah) | Program B |
| **Data Entry Error Rate** | % transaksi yang perlu dikoreksi setelah disimpan (indikasi UI/UX membingungkan atau validasi kurang) | Menurun dari baseline | Program A (validasi server-side), Program C (UI baru) |
| **Portal Client Engagement** | Frekuensi login client portal per klien aktif | Baseline diukur dulu (belum pernah diukur) | Existing — bukan Program spesifik |
| **AI Assistant Query Resolution Rate** | % query AI Assistant yang terjawab tanpa eskalasi ke manusia | >50% di fase pilot, meningkat seiring iterasi | Program E bagian 2 |

**Kenapa target "Menurun dari baseline" untuk beberapa item, bukan angka absolut:** Konsisten kejujuran status Engineering Constitution — tidak ada data historis Time-to-Approve atau Data Entry Error Rate hari ini (belum pernah diukur), sehingga target absolut akan jadi angka karangan. Baseline **MUST** diukur di titik awal Program terkait, target relatif terhadap baseline itu.

## 3. KPI Business — Kontribusi Baru

**Prinsip:** KPI Business mengukur **apakah Puraloka Suite mencapai tujuan bisnisnya** — dari efisiensi operasional Puraloka Persada hari ini sampai viabilitas SaaS di masa depan.

| KPI | Definisi | Fase Relevan |
|---|---|---|
| **Waktu Tutup Buku Bulanan** | Berapa lama proses rekonsiliasi keuangan proyek per bulan | L1, terukur segera — sudah bisa diukur hari ini sebagai baseline |
| **Jumlah Proyek Dikelola Simultan per PM** | Kapasitas operasional nyata per Project Manager | L1-L2, indikator apakah sistem benar-benar mengurangi beban manual |
| **Biaya Operasional per Proyek (Overhead Administratif)** | Proxy ROI investasi platform — apakah biaya administrasi turun seiring modul baru aktif | L1-L2 |
| **Jumlah Company Aktif dalam Grup** | Indikator pencapaian L2 riil (bukan hanya migrasi teknis selesai) | Gate keluar Program D |
| **Jumlah Pelanggan Eksternal Committed** | **Ini adalah gate Phase 8 itu sendiri** — [04-roadmap-governance-and-delivery.md § Phase 8](../04-roadmap-governance-and-delivery.md#phase-8--multi-tenant-saas-platform) | Gate masuk Program F |
| **Monthly Recurring Revenue (MRR) per Tenant** | Baru relevan setelah Program F dimulai | L3+ |
| **Churn Rate Tenant** | Baru relevan setelah ada >1 tenant eksternal | L3+ |

**Prinsip pengukuran:** KPI Business item pertama (Waktu Tutup Buku, Jumlah Proyek per PM, Biaya Operasional) **SHOULD** mulai diukur **segera**, tidak menunggu Program manapun — ini adalah baseline yang menunjukkan apakah Puraloka Suite hari ini (L1, sudah cukup matang) benar-benar memberi nilai, terlepas dari roadmap masa depan.

## 4. Architecture Fitness Functions — Kontribusi Baru

**Definisi (diadaptasi dari konsep [Building Evolutionary Architectures](https://www.thoughtworks.com/insights/books/building-evolutionary-architectures), diterapkan sesuai skala Puraloka Suite):** Test/check otomatis (atau semi-otomatis) yang memverifikasi properti arsitektural tetap terjaga **seiring sistem berevolusi** — bukan test fungsional biasa, tapi penjaga terhadap regresi arsitektural.

| Fitness Function | Apa yang Dijaga | Cara Verifikasi | Program Terkait |
|---|---|---|---|
| **Zero Inline Role Check Baru** | Konsolidasi ke `requirePermission()` tidak regresi | Grep periodik `\.role\s*===` di CI, gagal jika bertambah dari baseline | Program A, berlaku selamanya sesudahnya |
| **RLS-RBAC Sync Ratio** | % RLS policy yang merujuk `role_permissions`, bukan hardcode | Query `pg_policies` vs referensi `has_permission()`, target 100% setelah Program A | Program A |
| **Modular Monolith Boundary** | Tidak ada import lintas-domain yang melanggar batas modul (mis. `kasbons.ts` langsung import internal `procurement.ts`) | Lint rule custom (belum ada, kandidat Program B — saat domain mulai lebih banyak berinteraksi lewat Workflow Engine) | Program B ke atas |
| **company_id Coverage** | 100% tabel transaksional punya `company_id` setelah Program D2 | Query skema `information_schema.columns` otomatis, dibandingkan daftar tabel transaksional | Program D |
| **No Direct Cross-Tenant Query** | Tidak ada query yang bisa mengambil data lintas company tanpa filter eksplisit | Code review checklist + (Later) automated static analysis | Program D ke atas |
| **AI Agent Guardrail Compliance** | Setiap panggilan AI agent tercatat di audit log, tidak ada silent write | Audit log completeness check — setiap agent action punya entry berpasangan | Program E bagian 2 |
| **Never Build List Zero Violation** | Tidak ada implementasi item [Never Build List](../Engineering-Constitution/06-governance/18-never-build-list.md) tanpa ADR pembalik | Review manual per Program baru dimulai | Lintas-Program |

**Prinsip fitness function:** Setiap fitness function di atas **SHOULD** diotomatisasi begitu CI/CD (Program A item #4) tersedia — sebelum itu, verifikasi manual periodik tetap bernilai meski tidak otomatis, konsisten [Engineering-Constitution/05-team-process/11-devsecops-standard.md](../Engineering-Constitution/05-team-process/11-devsecops-standard.md).

## 5. Prinsip Pengukuran Lintas Kategori

1. KPI Engineering **MUST** diukur mulai Program A (infrastruktur test/CI adalah bagian Program A itu sendiri).
2. KPI Product **SHOULD** diukur mulai modul yang bersangkutan dirilis — tidak semua KPI Product relevan sebelum modulnya ada.
3. KPI Business item L1 **SHOULD** diukur **segera**, independen dari Program manapun.
4. Fitness Function **MUST** ditambahkan ke daftar ini begitu properti arsitektural baru yang perlu dijaga muncul (mis. fitness function SaaS-tenancy baru relevan begitu Program F dimulai) — daftar ini **living**, bukan final.

## 6. References

- [Engineering-Constitution/08-metrics-and-closing/37-engineering-metrics.md](../Engineering-Constitution/08-metrics-and-closing/37-engineering-metrics.md)
- [04-roadmap-governance-and-delivery.md § Phase 8](../04-roadmap-governance-and-delivery.md#phase-8--multi-tenant-saas-platform)
- [Engineering-Constitution/06-governance/18-never-build-list.md](../Engineering-Constitution/06-governance/18-never-build-list.md)
- [Engineering-Constitution/05-team-process/11-devsecops-standard.md](../Engineering-Constitution/05-team-process/11-devsecops-standard.md)

---

*File selanjutnya: [11-decision-gates-and-change-management.md](11-decision-gates-and-change-management.md)*
