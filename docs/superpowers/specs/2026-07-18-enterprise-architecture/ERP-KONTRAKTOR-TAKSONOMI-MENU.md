# Taksonomi Menu ERP Kontraktor — Referensi Lengkap (TERVERIFIKASI)

**Tujuan dokumen:** peta lengkap modul & menu ERP kontraktor kelas profesional,
dipetakan ke status Puraloka Suite **hasil verifikasi kode nyata** — bukan perkiraan.

**Verifikasi:** 2026-07-26, langsung ke migration (`supabase/migrations/` s.d. **116**),
route API (`apps/api/src/routes/v1/` — 34 file), UI (`apps/web/`), dan dokumen status.
Temuan metodologis penting: ada **tiga lapisan** yang mudah tertukar —
(a) migration SQL, (b) lib/engine + test, (c) route HTTP + UI. Banyak item hanya
sampai (a) atau (b). Status di bawah menilai **end-to-end (c)**, dengan catatan
lapisan mana yang sudah ada.

**Cara membaca status:**
- ✅ **ADA** — berfungsi end-to-end (route + UI)
- 🟡 **SEBAGIAN** — ada tapi belum lengkap / hanya sebagian lapisan
- 🔵 **SKEMA-MATI** — file migration tertulis tapi **TIDAK di-apply ke dev** dan **0 referensi kode** (terverifikasi schema-baseline 4a, 2026-07-26: dev nyata = 90 tabel; `accounts`/`journal_*`/`assets`/`field_opname_reports`/`project_rab_materials`/`po_delivery_log` TIDAK ADA di DB — hanya forward-draft)
- 🔴 **BELUM** — belum dimulai
- ⛔ **DICORET** — keputusan owner 2026-07-26: di luar target (lihat bagian Tolok Ukur)

> **Scope resmi (koreksi owner 2026-07-26):** target = **KUALITAS sekelas ERP
> perusahaan besar untuk bisnis sendiri di Indonesia**, BUKAN kesiapan dipakai
> perusahaan internasional. Semua proyek Rupiah. UI Bahasa Indonesia. Acuan
> akuntansi PSAK.

---

## 1. MASTER DATA & KONFIGURASI INTI

| Menu | Status | Catatan verifikasi |
|---|---|---|
| Perusahaan / badan hukum (multi-entity) | 🔴 | Keputusan: tetap Phase 7 + 2 tripwire — lihat `docs/KEPUTUSAN-MULTI-COMPANY.md`. Hari ini: `company_profile` single-row; 1 kolom `company_id` yatim di `feature_flags` |
| Chart of Accounts (COA) | 🔵 | Migration 047 (`accounts`, view `trial_balance`) — 0 referensi kode. Keputusan GL: lihat PETA-PRIORITAS |
| Struktur Cost Code / CBS | 🟡 | CECEP 102/108: tabel + test lengkap, **0 route/UI** |
| WBS template | 🟡 | CECEP 109 (`wbs_nodes`) DB-only; "WBS" di Gantt UI = pohon `rab_items`, bukan `wbs_nodes` |
| Master Resource (tenaga/bahan/alat) | 🟡 | CECEP 103 (`resources`) DB-only; yang ber-endpoint hanya `materials` (bahan) via procurement |
| Price Book / rate library | 🟡 | CECEP 104, versioned + effective-dated, DB+test only, 0 endpoint |
| Satuan (Unit of Measure) | ✅ | `units` (090) + `dimension` (115/116) + route `units.ts` + UI `/pengaturan/satuan` |
| Master Supplier/Vendor | ✅ | CRUD + edit + credit_limit di `procurement.ts`; prakualifikasi tidak ada |
| Prakualifikasi vendor | 🔴 | |
| Master Subkontraktor | 🟡 | Sistem mandor ✅ (padanan lokal); subkon formal ber-kontrak 🔴 |
| Master Klien | ✅ | `clients.ts` CRUD + toggle + NPWP + link user |
| Master Karyawan | 🟡 | `users` (akun) + `workers` (tukang); bukan master HR |
| Master Aset/Alat berat | 🔵 | Migration 045 (3 tabel) — 0 referensi kode |
| Gudang / lokasi | 🟡 | Stok per proyek (`project_stocks`) ada; entitas gudang/multi-lokasi tidak |
| Mata uang & kurs (multi-currency) | ⛔ | Dicoret owner. Syarat tersisa TERPENUHI: uang 100% NUMERIC (verifikasi: nol FLOAT di seluruh migration) |
| Konfigurasi pajak | ✅ | `financial_config` effective-dated (086) + `lib/tax-calculation.ts` + guardrail test |
| Kalender kerja & hari libur | 🔴 | Tunda sampai ada pemakainya |
| Penomoran dokumen (numbering series) | 🟡 | Mayoritas HARDCODED: MR/PO/GR di trigger DB (041), `CO-001` di TS; invoice semi-config (prefix dari company_profile) |
| Template dokumen | 🟡 | Kontrak SPK PDF ada (`contracts.ts`); template lain tidak |

---

## 2. CRM & PRA-KONSTRUKSI (Bid Management)

| Menu | Status | Catatan |
|---|---|---|
| Pipeline lead / prospek | 🔴 | |
| Register tender / bid | 🔴 | |
| Keputusan Go / No-Go | 🔴 | |
| Dokumen prakualifikasi | 🔴 | |
| **Estimating / AHSP** | 🟡 | CECEP: engine (`lib/ahsp-engine.ts`) + 17 tabel + 500+ test — **0 route/UI**; seed AHSP diblokir gate CI isolation + review founder |
| **Quantity takeoff / BOQ** | 🟡 | Read-model `GET /estimate-versions/:id/boq` ada (tanpa UI); CRUD takeoff belum; RAB produksi via upload Excel |
| Skenario penawaran (what-if) | 🟡 | Tabel `scenarios` (110) DB-only, 0 endpoint |
| Analisa markup, margin, contingency | 🔴 | Tidak ditemukan di kode |
| Eskalasi harga | 🔴 | |
| Generate proposal / dokumen penawaran | 🟡 | Baru kontrak SPK PDF; proposal penawaran belum |
| Jaminan penawaran (bid bond) | 🔴 | |
| Analisa menang/kalah | 🔴 | |
| Backlog / order book | 🔴 | |

---

## 3. MANAJEMEN KONTRAK

| Menu | Status | Catatan |
|---|---|---|
| Register kontrak induk | 🟡 | Data kontrak = kolom di `projects`; tanpa tabel kontrak/amendment |
| Termin & syarat pembayaran | ✅ | |
| Retensi (retention) | ✅ | `retention_pct` + trigger amount + potongan invoice + `invoice_type='retention_release'` + config 087. Kurang: register/jadwal pelepasan |
| **Change Order / Variation Order** | ✅ | Lengkap: CRUD + items + submit + approve berjenjang (engine ADR-007) + baseline snapshot + update `contract_value` + audit critical |
| Claims management | 🔴 | |
| Extension of Time (EOT) | 🔴 | CO tidak punya dimensi waktu |
| Denda keterlambatan (LD) | 🟡 | ⚠️ **ARAH TERBALIK**: penalty engine 091 = denda KLIEN telat bayar invoice. LD kontraktor-telat-selesai (yang diminta tender pemerintah) = 🔴 |
| Bank garansi & bond register | 🔴 | |
| Register asuransi | 🔴 | |
| Surat masuk/keluar (correspondence) | 🔴 | |
| Kontrak subkontraktor | 🟡 | `work_scopes` + rencana signing internal (Modul 11b ERP_MASTER_PLAN) |

---

## 4. PERENCANAAN & PENJADWALAN

| Menu | Status | Catatan |
|---|---|---|
| WBS proyek | 🟡 | UI Gantt pakai pohon `rab_items`; `wbs_nodes` CECEP DB-only |
| Master schedule + baseline | 🔴 | Tidak ada snapshot baseline jadwal |
| Gantt chart | 🟡 | Custom renderer: dual-bar plan/aktual, SVG dependency arrows, soft-dependency + threshold (054); tanpa lag/lead/constraint |
| Critical path (CPM) | 🔴 | |
| Kurva S (rencana vs aktual) | ✅ | 3 garis (`kurva-s.ts` 376 baris) |
| Resource histogram / leveling | 🔴 | |
| Look-ahead schedule | 🔴 | |
| Milestone tracking | ✅ | |
| **Earned Value Management** | ✅ | ⚠️ Status lama 🔴 **SALAH** — CPI/SPI/SV/CV/EAC/ETC/VAC/TCPI hidup di `lib/evm-calculation.ts` + `kurva-s.ts` + UI + test. Kelemahan: kualitas PV (input manual `rab_schedule`), EV self-reported |
| Analisa keterlambatan | 🔴 | |
| Method statement | 🔴 | |

---

## 5. BUDGET & COST CONTROL

Jantung ERP kontraktor. Lihat skor Lima Pembeda di bawah.

| Menu | Status | Catatan |
|---|---|---|
| **RAB (anggaran penawaran)** | ✅ | `rab_items` + komponen biaya + upload Excel; jalur CECEP estimate→RAB masih DB-only |
| **RAP (anggaran pelaksanaan)** | 🔴 | Dirancang lengkap di `CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md` §D6 — langkah 7 build order, kode nol |
| Revisi & transfer anggaran | 🔴 | |
| Commitment tracking (PO + borongan) | 🔴 | |
| Actual Cost Ledger (ACL) | 🟡 | ⚠️ Koreksi: 112 = `cost_code_category_map` (mapping, anti-corruption layer), BUKAN ledger; actual cost tersebar, diagregasi ad-hoc di `kurva-s.ts` |
| Cost-to-complete forecast | 🔴 | |
| **Cashflow forecast** | 🟡 | `lib/cashflow-forecast.ts` + endpoint `/estimate-versions/:id/cashflow-forecast` — **tanpa UI**. Cashflow aktual (✅) terpisah di `finance.ts` |
| Manajemen contingency | 🔴 | |
| Analisa varians (budget vs commit vs aktual) | 🔴 | |
| Profitabilitas per proyek / per cost code | 🟡 | `/finance/profitability` per proyek ✅; per cost code 🔴 |
| **WIP / persentase penyelesaian (PSAK)** | 🔴 | |
| **Cost Value Reconciliation (CVR)** | 🔴 | |
| Pagu belanja per material | 🔴 | Dirancang (§D6), kode nol |

---

## 6. PROCUREMENT / PENGADAAN

| Menu | Status | Catatan |
|---|---|---|
| Material Request (MR) | ✅ | + approval berjenjang via engine |
| RFQ ke vendor | 🔴 | Koreksi dari 🟡: 0 hit di kode |
| Perbandingan penawaran (bid tabulation) | 🔴 | Koreksi dari 🟡: PO langsung dari MR |
| Purchase Order | ✅ | + cancel + auto-number (trigger) |
| Kontrak payung / blanket order | 🔴 | |
| Goods Receipt Note (GRN) | ✅ | Koreksi dari 🟡: create + confirm + trigger auto-stok |
| **3-way match (PO–GRN–Invoice)** | ✅ | Ketiga celah DITUTUP 2026-07-27 (PR feat/procurement-3way-match): (a) invoice manual wajib ter-link `goods_receipt_id` + supplier dicek cocok GR + insert whitelist field, (b) total invoice ≤ nilai GR pada HARGA PO (`lib/three-way-match.ts`, murni ber-test), (c) anti-dobel 3 lapis — satu GR satu invoice (409), nomor faktur unik per supplier (409), auto-invoice saat GR confirm cek invoice existing; backstop DB migration 121 (2 partial unique index). Guard over-receipt GR vs PO tetap. Test: 24 (unit+integration+route, positif & negatif, mutation-tested) |
| Evaluasi kinerja vendor | 🔴 | |
| Jadwal pembayaran vendor | ✅ | Koreksi dari 🟡: aging + overdue + alokasi FIFO |
| Impor & kepabeanan | ⛔ | Dicoret (scope domestik) |
| Expediting & logistik | 🔴 | |

---

## 7. INVENTORY / GUDANG & MATERIAL

⚠️ Status lama section ini hampir seluruhnya SALAH (semua 🔴) — nyatanya sebagian besar sudah live sejak migration 039–042.

| Menu | Status | Catatan |
|---|---|---|
| Gudang proyek / site store | 🟡 | `project_stocks` per proyek; tanpa entitas gudang |
| Stok masuk / keluar | ✅ | `stock_movements`: GR otomatis + usage/return/adjustment |
| Transfer stok antar proyek | 🔴 | |
| Stock opname | ✅ | `POST /stocks/opname` bulk + OpnameModal + selisih real-time |
| Minimum stok & reorder point | 🟡 | `min_stock` + alert dashboard; reorder point/auto-PO belum |
| **Rekonsiliasi material (teoritis vs aktual)** | 🔴 | `project_rab_materials` (043) = 🔵 skema-mati; sisi teoritis menunggu take-off CECEP (§D) |
| Tracking waste / susut | 🔴 | `waste_factor` hanya kolom di `assembly_components` (DB-only) |
| Material milik klien (free issue) | 🔴 | |

---

## 8. SUBKONTRAKTOR & MANDOR

| Menu | Status | Catatan |
|---|---|---|
| Paket subkontrak | 🟡 | Via work_scopes mandor |
| Tender & award subkontraktor | 🔴 | |
| Kontrak subkontrak + BOQ | 🟡 | |
| Work order ke subkontraktor | 🟡 | |
| **Opname / berita acara bersama** | 🟡 | `field_opname_reports` (044) = 🔵 skema-mati; hard-lock opname→pembayaran = rencana Modul 11a |
| Progress claim / payment certificate | 🟡 | `progress_payments` ada; sertifikat formal belum |
| Retensi subkontrak | 🔴 | |
| Back-charge / potongan | 🟡 | Potongan kasbon di settlement + `wage_deductions` ada; back-charge formal belum |
| Evaluasi kinerja subkontraktor | 🔴 | |
| Kepatuhan (izin, asuransi, pajak) | 🔴 | |
| **Manajemen mandor** | ✅ | |
| Kasbon mandor & tukang | ✅ | |
| Upah harian / borongan / progress | ✅ | |
| Settlement borongan | ✅ | |

---

## 9. OPERASI LAPANGAN (Site Management)

| Menu | Status | Catatan |
|---|---|---|
| Laporan harian proyek (DPR) | 🟡 | `progress_logs` (weather, worker_count, foto, notes) = bahan DPR; tanpa format/cetak DPR resmi |
| Log tenaga kerja harian | 🟡 | `worker_count` agregat, bukan per orang |
| Log pemakaian alat | 🔴 | |
| Log cuaca | 🟡 | Field `weather` di progress_logs |
| Instruksi lapangan | 🔴 | |
| Izin kerja (work permit) | 🔴 | |
| **Request for Inspection (RFI)** | 🔴 | |
| **Submittal register** | 🔴 | |
| Non-Conformance Report (NCR) | 🔴 | |
| Punch list / daftar cacat | 🔴 | |
| Dokumentasi foto | ✅ | Live sejak 097/098 (bucket privat + all-or-nothing); **geotag 🔴** (0 kolom GPS) |
| Serah terima (PHO/FHO) | 🟡 | BAST hanya sebagai jenis dokumen upload; proses tidak ada |

---

## 10. QUALITY MANAGEMENT (QA/QC)

Semua 🔴 — terkonfirmasi (0 hit di kode). Bangun saat tender mensyaratkan.

---

## 11. HSE / K3 & LINGKUNGAN

Semua 🔴 — terkonfirmasi. Bangun saat tender mensyaratkan (syarat prakualifikasi proyek besar).

---

## 12. HR & PAYROLL

| Menu | Status | Catatan |
|---|---|---|
| Master karyawan & struktur organisasi | 🟡 | `users` saja |
| Rekrutmen & onboarding | 🔴 | |
| Absensi & timesheet | 🔴 | Koreksi dari 🟡: 0 hit; `wage_items` = rekap upah, bukan absensi |
| Cuti & izin | 🔴 | |
| **Payroll staf** | 🔴 | Rekomendasi: tool eksternal — lihat Tugas "tidak dibangun" |
| Upah harian mandor/tukang | ✅ | |
| Potongan statutori (BPJS) | 🔴 | Eksternal |
| PPh 21 | 🔴 | Eksternal |
| Sertifikasi & kompetensi | 🔴 | `workers.skills` ada sebagai array teks |
| Penilaian kinerja | 🔴 | |
| Klaim perjalanan & reimburse | 🟡 | Via `project_expenses` |

---

## 13. ALAT BERAT & ASET

Semua item 🔴, KECUALI: register aset + mutasi + penyusutan = 🔵 **skema-mati**
(migration 045: `assets`, `asset_movements`, `asset_depreciation_logs` — 0 kode).
Rekomendasi: jika alat mayoritas sewa, cukup tracking sewa + utilisasi ringan.

---

## 14. KEUANGAN & AKUNTANSI

| Menu | Status | Catatan |
|---|---|---|
| **General Ledger + COA** | 🔵 | Migration 047 = forward-draft (**belum di-apply ke dev** per schema-diff 4a; desainnya sudah benar: rule di AccountingEngine app-layer, bukan stempel per-baris — lihat `JOURNAL-READY-METADATA-DESIGN.md` §H). ⚠️ KEPUTUSAN TERBUKA: in-app (ERP_MASTER_PLAN Modul 10) vs akuntansi eksternal + export. Lihat PETA-PRIORITAS §5 |
| Jurnal umum | 🔵 | idem |
| **Accounts Payable** | ✅ | Koreksi dari 🟡: supplier invoice + payment + aging + FIFO + overdue |
| **Accounts Receivable** | 🟡 | Invoice + payment + notif overdue ✅; aging bucket 30/60/90 🔴 |
| Bank & kas | ✅ | |
| Rekonsiliasi bank | 🔴 | Rekomendasi: eksternal |
| Kas kecil / petty cash | ✅ | |
| Aset tetap & penyusutan | 🔵 | Migration 045, 0 kode |
| Pajak: PPN, PPh | ✅ | Effective-dated + guardrail test |
| e-Faktur / e-Bupot | 🟡 | Koreksi dari 🔴: pencatatan nomor + rekap pajak + status ada; generate = pakai Coretax (jangan dibangun) |
| Multi-currency & revaluasi FX | ⛔ | Dicoret owner |
| Transaksi antar-perusahaan | ⛔ | Relevan lagi hanya jika multi-company terpicu |
| **Laporan keuangan** | 🟡 | Arus kas ✅; Neraca & L/R 🔴 (rekomendasi: eksternal) |
| **Pengakuan pendapatan / persentase penyelesaian (PSAK)** | 🔴 | Acuan PSAK (bukan IFRS 15). Tanpa ini L/R kontraktor tidak bermakna — lihat Lima Pembeda |
| Tutup buku periode | 🔴 | Eksternal |
| Audit trail | ✅ | + correlation_id + severity + diff. ⚠️ Gap: trigger append-only (073) masih DORMAN — audit_logs masih bisa diubah service_role |

---

## 15. PENAGIHAN & PENDAPATAN

| Menu | Status | Catatan |
|---|---|---|
| Progress billing / payment application | ✅ | Berbasis termin; bukan per kuantitas BOQ terpasang |
| Termin | ✅ | |
| Interim Payment Certificate (IPC) | 🔴 | Koreksi dari 🟡: 0 hit |
| Pelepasan retensi | 🟡 | `invoice_type='retention_release'` ada; register jatuh tempo retensi 🔴 |
| Pemotongan uang muka | 🔴 | Koreksi dari 🟡: DP sebagai termin ada, recoupment di invoice progres 0 hit |
| Penagihan pekerjaan tambah | 🟡 | Via CO→contract_value→termin manual |
| Invoice & faktur pajak | ✅ | + PDF + QR verifikasi publik (`/verify/invoice/[id]`) |
| Follow-up penagihan | 🟡 | Notif + email overdue ✅; AR aging 🔴 |
| Nota kredit | 🔴 | |

---

## 16. MANAJEMEN DOKUMEN

| Menu | Status | Catatan |
|---|---|---|
| Register dokumen + kontrol revisi | 🟡 | Kolom `version` saja, tanpa riwayat revisi |
| Transmittal | 🔴 | `document_access_logs` = jejak baca, bukan transmittal |
| Register gambar | 🔴 | |
| Notulen rapat | 🔴 | |
| Approval workflow dokumen | ✅ | Engine Program B |
| Matriks distribusi | 🔴 | |
| Tanda tangan elektronik | 🔴 | Rencana signing internal = Modul 11b ERP_MASTER_PLAN |

---

## 17. RISIKO & KEPATUHAN

Semua 🔴 — terkonfirmasi.

---

## 18. PELAPORAN & BUSINESS INTELLIGENCE

| Menu | Status | Catatan |
|---|---|---|
| Dashboard eksekutif | ✅ | |
| Dashboard per proyek | 🟡 | Detail proyek sudah kaya; halaman KPI khusus belum |
| Laporan biaya | ✅ | |
| Laporan arus kas | ✅ | |
| KPI: CPI, SPI, margin, DSO, backlog | 🟡 | Koreksi dari 🔴: CPI/SPI ✅ per proyek; margin ✅; DSO/backlog 🔴 |
| Report builder | 🔴 | Rekomendasi: jangan dibangun |
| Export Excel / PDF | ✅ | Keduanya ada (XLSX + `reports/export-pdf` + invoice PDF) |
| Distribusi laporan terjadwal | 🔴 | |

---

## 19. ADMINISTRASI SISTEM

| Menu | Status | Catatan |
|---|---|---|
| User & role management | ✅ | |
| Permission matrix | ✅ | Program A: permission-based (ADR-004) + anti-lockout |
| Konfigurasi approval | ✅ | Program B |
| Konfigurasi notifikasi | ✅ | Program B |
| Konfigurasi penomoran | 🟡 | Mayoritas hardcoded (lihat §1) |
| Audit log | ✅ | Append-only trigger masih dorman |
| API & integrasi | 🟡 | |
| Import/export data | 🟡 | Import hanya RAB Excel; export XLSX/PDF ada |
| Backup & restore | 🔴 | |
| Multi-bahasa (i18n) | ⛔ | Dicoret owner — UI Bahasa Indonesia |
| SSO / SAML | ⛔ | Dicoret owner |
| Multi-tenant | 🔴 | Program F — gate: pelanggan eksternal committed |

---

## 20. MOBILE / FIELD APP

| Menu | Status | Catatan |
|---|---|---|
| Mode offline | 🔴 | |
| Input laporan harian | 🟡 | Screen input progress + foto ada |
| Foto + geotag | 🟡 | Foto ✅, geotag 🔴 |
| Absensi lapangan | 🔴 | |
| Material request | 🔴 | Direncanakan ERP_MASTER_PLAN Mobile Phase 1, belum ada |
| Approval mobile | 🟡 | Approve/reject inline dari notifikasi |
| Checklist inspeksi | 🔴 | |
| *(Total: 9 screen Expo)* | | dashboard, proyek×2, progress, kasbon×2, mandor, notifikasi, login |

---

## MENU YANG ADA TAPI TIDAK TERCANTUM DI TAKSONOMI ASLI

Ditemukan saat verifikasi (bukti = route/UI nyata):

- **Penalty engine denda telat bayar klien** + waiver ber-audit (091, `finance.ts`)
- **Verifikasi invoice publik via QR** (`/verify/invoice/[id]`)
- **Lessons learned + write-back gate manusia** (CECEP 113/114 + `lessons-learned.ts`)
- **Module registry + feature flags** (077, `modules.ts`)
- **Menu registry dari DB** (076, `menu.ts` — sidebar = data)
- **Notification routing config** (101, `/pengaturan/notifikasi`)
- **Approval chains config** (099, `/pengaturan/approval`)
- **Permission scopes per-user** (060)
- **Master lookup ber-UI**: satuan+dimensi, kasbon purposes, kategori pekerjaan
- **3 portal terpisah**: client portal, PM portal, mandor portal (rekapitulasi keuangan)
- **Command palette / global search** (Ctrl+K, role-aware)
- **Kalender proyek** (milestone/termin/progress/start-end)
- **Financial config effective-dated + UI** (`/pengaturan/keuangan`)

---

# TOLOK UKUR: "KUALITAS KELAS BESAR" (definisi owner, 2026-07-26)

> Menggantikan bagian lama "Syarat dipakai perusahaan internasional" — target
> yang benar adalah kualitas, bukan geografi. Dicoret dari pertimbangan:
> multi-currency, i18n, SSO/SAML, GDPR/data residency, adapter pajak multi-negara,
> IFRS 15 (ganti: **PSAK**).

| # | Kriteria | Posisi hari ini (terverifikasi) |
|---|---|---|
| 1 | **Angka finansial selalu bisa dipertanggungjawabkan** | Kuat sebagian: audit trail + diff + correlation_id + QR invoice ✅; **gap: trigger append-only (073) dorman** — audit log masih bisa diubah diam-diam oleh service_role |
| 2 | **Cost control berlapis benar-benar jalan** | 2/5 — lihat Lima Pembeda |
| 3 | **Sistem tahan orang** (tidak bergantung satu orang jujur) | Kuat: approval berjenjang ber-invariant CI, permission-based RBAC, anti-lockout ✅; sisa: RLS table dormant (gerbang mobile), checklist service_role ☐ |
| 4 | **Data historis tidak rusak oleh aturan baru** | Kuat: effective-dating config finansial, baseline snapshot CO, penalty immutable ✅ — pola WAJIB dipertahankan di modul baru |
| 5 | **UI tidak bikin pusing orang lapangan** | Lemah: mobile 9 screen tanpa offline/geotag; input harian mandor nyatanya masih WhatsApp (DOMAIN.md §8) |
| + | **Timezone UTC di DB** | ✅ terverifikasi: 224 TIMESTAMPTZ, nol TIMESTAMP polos |
| + | **Tipe data uang** | ✅ terverifikasi: 100% NUMERIC, nol float |

---

# LIMA PEMBEDA ERP KONTRAKTOR ASLI — SKOR TERVERIFIKASI

1. **Cost control berlapis** (RAB→RAP→commitment→aktual→forecast) — **2/5**.
   RAB ✅; RAP dirancang belum dibangun; commitment 🔴; aktual tersebar (ACL = mapping
   saja); forecast endpoint tanpa UI.
2. **EVM** — **3.5/5**. SUDAH ADA (koreksi status lama). Kelemahan di kualitas
   input (PV manual, EV self-reported), bukan di mesin hitung.
3. **WIP / pengakuan pendapatan (PSAK)** — **0/5**. Nihil. Bisa dibangun sebagai
   laporan tanpa GL penuh.
4. **Rekonsiliasi material** — **1.5/5**. Stok/usage/opname ✅ live; sisi teoritis
   (take-off) & pengaduannya belum — persis scope Program C langkah 6–7.
5. **Rantai kontrak lengkap** — **2.5/5**. CO kuat; retensi terhitung; yang bolong:
   claims/EOT, LD arah kontraktor, recoupment DP, register retensi/jaminan.

Kalau lima ini kuat, sistem sudah lebih berguna daripada banyak ERP komersial
yang menu-nya lengkap tapi cost control-nya dangkal. **Urutan penguatan lima
pembeda + daftar yang sengaja TIDAK dibangun: lihat `docs/PETA-PRIORITAS-ERP.md`
(dokumen induk).**
