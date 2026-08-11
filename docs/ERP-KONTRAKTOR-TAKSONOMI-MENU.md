# Taksonomi Menu ERP Kontraktor — Referensi Lengkap (TERVERIFIKASI)

**Tujuan dokumen:** peta lengkap modul & menu ERP kontraktor kelas profesional,
dipetakan ke status Puraloka Suite **hasil verifikasi kode nyata** — bukan perkiraan.

**Verifikasi:** basis 2026-07-26 (migration s.d. 116), **diperbarui sebagian 2026-07-31**
untuk §5 Budget & Cost Control + Lima Pembeda #1/#2 (migration s.d. **141**; RAP live,
BAC dari pagu RAP), **dan 2026-08-01** untuk §2 CRM (migrasi 147/148: register tender
live end-to-end). Baris di luar §2 dan §5 masih bertanggal 26 Juli — perlakukan sebagai
"terverifikasi saat itu", bukan hari ini. Verifikasi langsung ke migration, route API
(`apps/api/src/routes/v1/`), UI (`apps/web/`), dan dokumen status.
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

> **Scope resmi (founder 2026-08-01):** target = **ERP kontraktor LENGKAP,
> TERINTEGRASI, BERBASIS AI** — lihat [`KEPUTUSAN-SCOPE-ERP-AI.md`](./KEPUTUSAN-SCOPE-ERP-AI.md).
> Empat kantong yang sebelumnya dicoret kini MASUK: QA/QC+HSE (§10/§11), GL
> in-app (§14), payroll+BPJS+PPh 21 (§12), aset & alat berat penuh (§13).
> **Konsekuensi baca:** baris 🔴 di keempat bagian itu adalah **utang pekerjaan**,
> bukan lagi keputusan sadar untuk tidak membangun.
>
> **Yang TETAP dicoret** (2026-07-26, tak dibatalkan): multi-currency · i18n ·
> SSO enterprise · IFRS (tetap **PSAK**) · seluruh Never Build List. Semua proyek
> Rupiah, UI Bahasa Indonesia, satu negara.

---

## 1. MASTER DATA & KONFIGURASI INTI

| Menu | Status | Catatan verifikasi |
|---|---|---|
| Perusahaan / badan hukum (multi-entity) | 🟡 | tabel `companies` + `/api/v1/companies` (migrasi 127) — badan usaha & keanggotaan hidup; UI pengelolaannya belum |
| Chart of Accounts (COA) | 🔵 | Migration 047 (`accounts`, view `trial_balance`) — 0 referensi kode. Keputusan GL: lihat PETA-PRIORITAS |
| Struktur Cost Code / CBS | ✅ | **Koreksi dari 🟡 (2026-08-08)** — klaim "0 route/UI" salah. Diukur: **3 query API** + **12 rujukan UI** di `/estimasi` · 44 baris `cost_codes` terisi. Laba per cost code juga hidup (`lib/varians-cost-code.ts` 12 test + `GET /projects/:id/varians`). |
| WBS template | 🔴 | **Satu-satunya klaim DB-only yang TERBUKTI (2026-08-08)**: `wbs_nodes` nol query API, nol rujukan UI, **nol baris di basis**. "WBS" di Gantt UI memang pohon `rab_items`, bukan tabel ini. Belum terpakai sama sekali. |
| Master Resource (tenaga/bahan/alat) | ✅ | **Koreksi dari 🟡 (2026-08-08)** — klaim "DB-only" salah. Diukur: **7 query API** + **90 rujukan UI** · **2.830 baris** `resources` terisi. Ia justru salah satu tabel paling terpakai di modul estimasi. |
| Price Book / rate library | ✅ | **Koreksi dari 🟡 (2026-08-08)** — klaim "0 endpoint" salah. Diukur: **10 query API** (`/api/v1/cecep/price-book` GET/POST/PATCH status) + dipanggil `/estimasi` · **3.025 harga** terisi (2.943 active, 81 draft, 0 bentrok). Sisa yang menunggu founder: apakah 81 draft diaktifkan (E9/E10/E12). |
| Satuan (Unit of Measure) | ✅ | `units` (090) + `dimension` (115/116) + route `units.ts` + UI `/pengaturan/satuan` |
| Master Supplier/Vendor | ✅ | CRUD + edit + credit_limit di `procurement.ts`; prakualifikasi tidak ada |
| Prakualifikasi vendor | ✅ | migrasi 210 · `/procurement/kualifikasi` (2026-08-07) · skor berbobot 4 dimensi · **vendor "lolos" dengan izin kedaluwarsa ditandai TIDAK boleh diundang** · 26 invarian, 14 test, 4 mutasi |
| Master Subkontraktor | 🟡 | Sistem mandor ✅ (padanan lokal); subkon formal ber-kontrak 🔴 |
| Master Klien | ✅ | `clients.ts` CRUD + toggle + NPWP + link user |
| Master Karyawan | 🟡 | `users` (akun) + `workers` (tukang); bukan master HR |
| Master Aset/Alat berat | 🔵 | Migration 045 (3 tabel) — 0 referensi kode |
| Gudang / lokasi | 🟡 | Stok per proyek (`project_stocks`) ada; entitas gudang/multi-lokasi tidak |
| Mata uang & kurs (multi-currency) | ⛔ | Dicoret owner. Syarat tersisa TERPENUHI: uang 100% NUMERIC (verifikasi: nol FLOAT di seluruh migration) |
| Konfigurasi pajak | ✅ | `financial_config` effective-dated (086) + `lib/tax-calculation.ts` + guardrail test |
| Kalender kerja & hari libur | ✅ | Migrasi 212 · `pola_kerja` + `hari_libur` · `/jadwal`. Pola mingguan per-company/proyek; libur ber-`tetap_bekerja` TETAP hari kerja (jejaknya disimpan karena menentukan tarif upah, tapi jadwalnya berjalan). Constraint menolak pola tanpa satu pun hari kerja — pola begitu membuat SETIAP durasi tak terhingga. Migrasi 213 menutup cacat `UNIQUE` yang tak mengikat saat `project_id` NULL |
| Penomoran dokumen (numbering series) | 🟡 | Mayoritas HARDCODED: MR/PO/GR di trigger DB (041), `CO-001` di TS; invoice semi-config (prefix dari company_profile) |
| Template dokumen | 🟡 | Kontrak SPK PDF ada (`contracts.ts`); template lain tidak |

---

## 2. CRM & PRA-KONSTRUKSI (Bid Management)

| Menu | Status | Catatan |
|---|---|---|
| Pipeline lead / prospek | 🟡 | `bids.status='prospek'` (147) — satu status di register tender, belum pipeline lead tersendiri |
| Register tender / bid | ✅ | Migrasi 147 + `/tender` (2026-08-01), end-to-end |
| Keputusan Go / No-Go | ✅ | `bids.status` go/no_go + `decision_note`; `no_go`/`batal` sengaja dikeluarkan dari win-rate |
| Dokumen prakualifikasi | ✅ | migrasi 210 · `dokumen_prakualifikasi` 9 jenis (NIB/SIUJK/SBU/…) dengan masa berlaku · peringatan 60 hari sebelum habis |
| **Estimating / AHSP** | 🟡 | CECEP: engine (`lib/ahsp-engine.ts`) + 17 tabel + 500+ test; **UI `/estimasi` kini hidup** (2026-07-30 — sebelumnya tak terjangkau `middleware.ts`) + tombol "kenapa angkanya segini?" (2026-08-01). Sisa: seed AHSP diblokir gate CI isolation + review founder |
| **Quantity takeoff / BOQ** | 🟡 | Read-model `GET /estimate-versions/:id/boq` ada (tanpa UI); CRUD takeoff belum; RAB produksi via upload Excel |
| Skenario penawaran (what-if) | ✅ | **Koreksi dari 🟡 (2026-08-08)** — klaim "DB-only, 0 endpoint" salah. Diukur: **5 query API** + **16 rujukan UI** · **208 baris** `scenarios` terisi. |
| Analisa markup, margin, contingency | 🟡 | markup & margin ada di `/estimate-versions`; contingency belum terpisah |
| Eskalasi harga | ✅ | migrasi 197 · `/procurement/riwayat-harga` — dibangun sebagai **Riwayat Harga Material** (arahnya netral; data nyata justru TURUN 16,7%) |
| Generate proposal / dokumen penawaran | 🟡 | Baru kontrak SPK PDF; proposal penawaran belum |
| Jaminan penawaran (bid bond) | 🟡 | tabel `contract_bonds` (migrasi 152) — register jaminan ada; alur bid bond khusus belum |
| Analisa menang/kalah | ✅ | `winner_value` memisahkan "kalah karena harga" dari "kalah karena syarat"; win-rate `null` (bukan 0) saat belum ada yang diputus |
| Backlog / order book | ✅ | `bids.project_id` → nilai dimenangkan yang proyeknya belum selesai (`lib/bid-backlog.ts`) |

---

## 3. MANAJEMEN KONTRAK

| Menu | Status | Catatan |
|---|---|---|
| Register kontrak induk | 🟡 | Data kontrak = kolom di `projects`; tanpa tabel kontrak/amendment |
| Termin & syarat pembayaran | ✅ | |
| Retensi (retention) | ✅ | `retention_pct` + trigger amount + potongan invoice + `invoice_type='retention_release'` + config 087. Kurang: register/jadwal pelepasan |
| **Change Order / Variation Order** | ✅ | Lengkap: CRUD + items + submit + approve berjenjang (engine ADR-007) + baseline snapshot + update `contract_value` + audit critical |
| Claims management | 🟡 | UI hidup: `klaim-section.tsx` → `/api/v1/projects/{id}/claims` (diukur 2026-08-06). **Diukur ulang 2026-08-08**: tabelnya `contract_claims` (bukan `project_claims`), **0 baris** — modulnya utuh, hanya belum dipakai. Tetap 🟡 sampai ada klaim nyata; status naik dari PEMAKAIAN, bukan dari kode |
| Extension of Time (EOT) | ✅ | **2026-08-01** (migrasi 152): `contract_eot` + ajukan/setujui/tolak + UI. `days_approved` (bukan `days_requested`) yang menggeser tanggal — kalau tidak, kontraktor menentukan tenggatnya sendiri |
| Denda keterlambatan (LD) | ✅ | **2026-08-01** (migrasi 152) — ~~arah terbalik~~ **DITUTUP**. Kini ADA DUA arah dan sengaja terpisah: 091 = klien telat BAYAR · 152 = kontraktor telat SELESAI. Dihitung dari tanggal **efektif sesudah EOT**, bukan `end_date` mentah. DEFAULT OFF; capability waiver-nya terpisah (`contract:ld:waive` vs `finance:penalty:waive`) — memaafkan denda klien dan denda sendiri adalah dua wewenang berbeda |
| Bank garansi & bond register | ✅ | **2026-08-01** (migrasi 152): `contract_bonds` 4 jenis (penawaran/pelaksanaan/uang muka/pemeliharaan) + peringatan kadaluarsa ≤30 hari. Jaminan kadaluarsa tanpa diperpanjang = uang hilang, jadi yang ditonjolkan bukan totalnya melainkan yang segera jatuh tempo |
| Register asuransi | ✅ | migrasi 199 · `/kontrak/asuransi` · 18 invarian · celah pertanggungan 2 arah |
| Surat masuk/keluar (correspondence) | 🟡 | UI hidup: `surat-section.tsx` → `/api/v1/projects/{id}/letters` (diukur 2026-08-06) |
| Kontrak subkontraktor | 🟡 | `work_scopes` + rencana signing internal (Modul 11b ERP_MASTER_PLAN) |

---

## 4. PERENCANAAN & PENJADWALAN

| Menu | Status | Catatan |
|---|---|---|
| WBS proyek | 🟡 | UI Gantt pakai pohon `rab_items`; `wbs_nodes` CECEP DB-only |
| Master schedule + baseline | ✅ | `rab-schedule.ts` + tabel `rab_schedule` — rencana per item/minggu jadi baseline PV berjenjang |
| Gantt chart | 🟡 | Custom renderer: dual-bar plan/aktual, SVG dependency arrows, soft-dependency + threshold (054); tanpa lag/lead/constraint |
| Critical path (CPM) | ✅ | Migrasi 212 · `milestone_dependencies` · `apps/api/src/lib/cpm.ts` · `/jadwal`. Empat jenis relasi (FS/SS/FF/SF) + jeda. Durasi dalam HARI KERJA, bukan hari kalender. **Lingkaran dependensi dinyatakan** dan jalur kritisnya dikosongkan, bukan dikarang. Float negatif sebanding dengan besar keterlambatan — bukan −1 untuk semua. 33 test · 14 mutasi tertangkap |
| Kurva S (rencana vs aktual) | ✅ | 3 garis (`kurva-s.ts` 376 baris) |
| Resource histogram / leveling | ✅ | Migrasi 212 · `kebutuhan_sumber_daya` · `/jadwal`. Yang dilaporkan **PUNCAK**, bukan rata-rata: 40 orang di minggu 7 dan 4 di minggu 8 punya rata-rata 22 — angka yang tak pernah terjadi dan menyembunyikan kekurangan 15 orang. Kuantitas dianggap serentak (10 tukang × 5 hari = 10, bukan 50). Minggu kelebihan beban ditandai |
| Look-ahead schedule | ✅ | `rab-schedule.ts` + tabel `rab_schedule` |
| Milestone tracking | ✅ | |
| **Earned Value Management** | ✅ | `routes/v1/kurva-s.ts` `meta.evm` (BAC/AC/EV/PV/CPI/SPI/EAC/ETC/VAC/TCPI) + `kurva-s-section.tsx` EVM cards |
| Analisa keterlambatan | ✅ | migrasi 198 · `/proyek/keterlambatan` · EOT disetujui mengurangi telat · 8/8 mutasi |
| Method statement | ✅ | Migrasi 212 · `method_statement` · `/jadwal`. Penolakan WAJIB beralasan (≥10 huruf) dan keputusan wajib bertanggal — **constraint DB**, bukan aturan UI. Kolom pengendalian risiko K3 ditandai merah kalau kosong: method statement tanpa itu adalah jadwal kerja yang menyamar, dan justru bagian itu yang ditanya saat ada kecelakaan |

---

## 5. BUDGET & COST CONTROL

Jantung ERP kontraktor. Lihat skor Lima Pembeda di bawah.

| Menu | Status | Catatan |
|---|---|---|
| **RAB (anggaran penawaran)** | ✅ | `rab_items` + komponen biaya + upload Excel; jalur CECEP estimate→RAB masih DB-only |
| **RAP (anggaran pelaksanaan)** | ✅ | **Live (2026-07-30/31)**: migrasi 138 (`rap_budget`/`rap_material_line`/`rap_labor_line`/`rap_change_log`) + `routes/v1/rap.ts` + UI tab "Material & RAP" di `/estimasi`. Qty diturunkan dari take-off, harga supplier & borongan mandor manual, kunci pagu (guard DB, tak bisa dibuka), perubahan pasca-kunci lewat change-log ber-alasan |
| Revisi & transfer anggaran | ✅ | tabel `rap_change_log` + `/api/v1/rap` — revisi pagu terekam, arsip murni |
| Commitment tracking (PO + borongan) | ✅ | tabel `purchase_orders` + `/procurement/purchase-orders`; varians per cost code di `/cost-analytics` |
| Actual Cost Ledger (ACL) | 🟡 | ⚠️ Koreksi: 112 = `cost_code_category_map` (mapping, anti-corruption layer), BUKAN ledger; actual cost tersebar, diagregasi ad-hoc di `kurva-s.ts`. **2026-08-08** — peta itu diukur **nol baris** meski endpoint & UI-nya ada berbulan-bulan; layar berisi sepuluh dropdown kosong tanpa petunjuk adalah pekerjaan rumah, bukan alat. Ditambahkan `lib/saran-cost-map.ts` (kemiripan KATA, bukan jarak huruf — "Beton"/"Besi" beda dua huruf tapi bahan berbeda) + `GET /projects/:id/cost-map/saran` + panel saran di tab Varians `/estimasi`. **Tetap 🟡**: menyarankan bukan mengisi — endpoint tak menulis apa pun (diuji), manusia menyetujui per baris. Status naik saat peta benar-benar terisi, bukan saat alatnya ada. **2026-08-08 (kedua)** — cacat yang jauh lebih besar ditemukan: seluruh laporan biaya membaca `project_expenses` yang **NOL BARIS**, sementara biaya nyata tercatat di tabel lain (**upah Rp 243.600.100** · **faktur supplier Rp 50.485.000**). Kartu "Belanja aktual Rp 0" bukan berarti belum ada belanja — ia melihat ke tabel yang salah. Ditutup: `lib/belanja-aktual.ts` (16 test, 8 mutasi MERAH) + `GET /projects/:id/belanja-aktual` (7 test Postgres nyata, 6 mutasi MERAH) + kartu KPI di tab Varians. Dibuktikan di layar: **Rp 0 → Rp 168.165.100** pada proyek Pak Andi, dengan rincian `upah Rp 126.600.100 · faktur Rp 41.565.000`. PO dipisah sebagai komitmen (menjumlahkannya ke biaya menghitung ganda saat fakturnya terbit) |
| Cost-to-complete forecast | ✅ | `/cashflow-forecast` + `/cost-analytics` — Proyeksi Kas di `/laporan` |
| **Cashflow forecast** | ✅ | **Koreksi dari 🟡 (2026-08-08)** — klaim "tanpa UI" salah. Diukur: `/estimasi` memanggil `estimate-versions/:id/cashflow-forecast` **dan** varian `?periods=`. `lib/cashflow-forecast.ts` ber-test. Cashflow aktual (✅) memang terpisah di `finance.ts`, dan itu benar: proyeksi vs realisasi adalah dua angka berbeda. |
| Manajemen contingency | ✅ | migrasi 200 · `/keuangan/contingency` · 21 invarian · sisa dihitung, tak disimpan. **2026-08-08** — ditemukan `audit-kolom-tak-tersambung.mjs`: halaman hanya bisa MEMBUAT POS, **tak ada satu pun jalur penarikan di seluruh UI**, jadi kolom `terpakai`/`sisa` yang dihitung rapi selalu nol. Ditutup: modal penarikan (`contingency-tarik-modal.tsx`, `DialogBersama`) + `GET /contingency/co-sumber` + `lib/co-sumber-contingency.ts` (14 test, 6 mutasi MERAH) + 12 test endpoint Postgres nyata (5 mutasi MERAH). Hanya CO **disetujui** yang bisa jadi dasar — penarikan yang mengaku bersumber dari CO ditolak adalah jejak audit yang berbohong. Sekalian menutup celah: `sumber_change_order_id` dulu di-insert **tanpa diperiksa**. axe **0 dengan dialog TERBUKA**, Esc menutup |
| Analisa varians (budget vs commit vs aktual) | ✅ | `/cost-analytics` — tab Varians Biaya di `/estimasi` |
| Profitabilitas per proyek / per cost code | ✅ | **Koreksi dari 🟡 (2026-08-08)** — per proyek `/finance/profitability` ✅ **dan** per cost code ✅: `lib/varians-cost-code.ts` (12 test) · `GET /api/v1/projects/:projectId/varians` (`cost-control.ts:296`) · tab Varians Biaya di `/estimasi`. Catatan "per cost code 🔴" sudah salah sejak F5-1 §3d mencatatnya hidup. |
| **WIP / persentase penyelesaian (PSAK)** | ✅ | `lib/wip-psak.ts` + `routes/v1/wip.ts` + `/api/v1/reports/wip`, dipanggil `/laporan` |
| **Cost Value Reconciliation (CVR)** | 🟡 | **Naik dari 🔴 (2026-08-08)** — 🔴 TERAKHIR yang bukan "jangan dibangun". Penundaannya (F5-1) beralasan: sisi biaya kosong. Diukur ulang, separuhnya sudah tak berlaku — biaya nyata ADA (upah Rp 243,6jt · faktur Rp 50,5jt), hanya di tabel lain. Dibangun **per SCOPE BORONGAN**: `lib/cvr.ts` (22 test, 10 mutasi MERAH) + `GET /projects/:id/cvr` (8 test Postgres nyata, 6 mutasi MERAH) + `/keuangan/cvr` (halaman, bukan tab — ARAH-VISUAL §6a). Nilai terpasang = borongan × progres, **bukan** nilai kontrak penuh: membandingkan biaya-hari-ini dengan kontrak-penuh membuat tiap pekerjaan tampak untung besar sampai hampir selesai. Enam keadaan, bukan dua — `tanpa_biaya` (progres jalan, nol upah tercatat) adalah tanda bahaya, bukan untung. **Tetap 🟡**: cakupannya UPAH BORONGAN saja, dan itu **dinyatakan di layar**. Material & faktur belum bisa dipecah per pekerjaan — `work_scopes.rab_category_id` **0 dari 20**, dan itu pemicu yang benar sekarang (F5-1 §PEMBEDA CVR), bukan lagi "biaya belum dicatat" |
| Pagu belanja per material | ✅ | Live bersama RAP — `rap_material_line.pagu` kolom GENERATED (`qty_adjusted × supplier_price`), beku setelah lock |
| **Cost Baseline EVM (BAC)** | ✅ | **2026-07-31**: BAC berjenjang — pagu RAP terkunci (BIAYA) → RAB → contract_value. Sebelumnya selalu RAB (nilai JUAL, mengandung margin) sehingga CPI/SPI sistematis optimistis — akar masalah `CECEP/03` §6, solusi `CECEP/52` Gap-2. `meta.evm.bacSource` menyatakan basis yang dipakai; UI menyebutnya eksplisit. Mutation-tested |

---

## 6. PROCUREMENT / PENGADAAN

| Menu | Status | Catatan |
|---|---|---|
| Material Request (MR) | ✅ | + approval berjenjang via engine |
| RFQ ke vendor | ✅ | migrasi 195 · `/procurement/rfq` · 19 invarian. **2026-08-08** — `rfq.mr_id` ada di schema dan `POST /rfq` sudah menerimanya, tapi diukur **3 dari 3 RFQ ber-`mr_id` NULL**: UI tak punya satu pun cara mengisinya (kelas cacat yang sama dengan `po_id` dibaca-tapi-tak-pernah-ditulis). Ditutup: `lib/mr-layak-rfq.ts` (24 test, 9 mutasi MERAH) + `GET /rfq/mr-layak` (11 test Postgres nyata, 5 mutasi MERAH) + pemilih MR di form buat RFQ. Qty yang ditawarkan adalah **SISA** (diminta − dipesan), bukan qty penuh — MR-2026-003 `partially_ordered` menawarkan 30, bukan 115. Sekalian menutup celah: `mr_id` dulu di-insert **tanpa diperiksa**, jadi RFQ proyek A bisa menunjuk kebutuhan proyek B |
| Perbandingan penawaran (bid tabulation) | ✅ | satu layar dengan RFQ · `tabulasi-penawaran.ts` 14 test |
| Putusan RFQ → terbitkan PO | ✅ | `POST /rfq/:id/putuskan` · `putusan-rfq.ts` 17 test + 13 test endpoint · alasan WAJIB saat bukan termurah (2026-08-08) |
| Purchase Order | ✅ | + cancel + auto-number (trigger) |
| Kontrak payung / blanket order | ✅ | Migrasi 219 · `kontrak_payung` + `kontrak_payung_item` · `/procurement/lanjutan`. Kuota per-item dijaga **constraint DB** (`terpakai <= kuota`) — INSERT maupun UPDATE ditolak, jadi PO tak bisa menarik 1.200 ton dari kontrak 1.000 ton. Kontrak berstatus `aktif` yang kuota/masanya habis ditandai **tak bisa dipakai**: PO berikutnya ditagih di luar harga kontrak, dan itu baru ketahuan saat tagihannya datang. `purchase_orders.kontrak_payung_id` menautkan PO ke kontraknya |
| Goods Receipt Note (GRN) | ✅ | Koreksi dari 🟡: create + confirm + trigger auto-stok |
| **3-way match (PO–GRN–Invoice)** | ✅ | Ketiga celah DITUTUP 2026-07-27 (PR feat/procurement-3way-match): (a) invoice manual wajib ter-link `goods_receipt_id` + supplier dicek cocok GR + insert whitelist field, (b) total invoice ≤ nilai GR pada HARGA PO (`lib/three-way-match.ts`, murni ber-test), (c) anti-dobel 3 lapis — satu GR satu invoice (409), nomor faktur unik per supplier (409), auto-invoice saat GR confirm cek invoice existing; backstop DB migration 121 (2 partial unique index). Guard over-receipt GR vs PO tetap. Test: 24 (unit+integration+route, positif & negatif, mutation-tested) |
| Evaluasi kinerja vendor | ✅ | migrasi 210 · skor berbobot vs rata polos bersanding · titik lemah per-dimensi dinyatakan · daftar hitam WAJIB beralasan |
| Jadwal pembayaran vendor | ✅ | Koreksi dari 🟡: aging + overdue + alokasi FIFO |
| Impor & kepabeanan | ⛔ | Dicoret (scope domestik) |
| Expediting & logistik | ✅ | Migrasi 219 · `expediting` + `expediting_jejak` · `/procurement/lanjutan`. Telat diukur dari **kebutuhan kita** (`purchase_orders.expected_delivery_date`), BUKAN dari `janji_vendor` — keduanya disimpan terpisah dan ditampilkan bersama supaya selisihnya terlihat. Yang dilaporkan telat **terparah**, bukan rata-rata. BUKAN `po_delivery_log` (itu jejak kirim dokumen PO ke vendor, bukan pelacakan barangnya) |

---

## 7. INVENTORY / GUDANG & MATERIAL

⚠️ Status lama section ini hampir seluruhnya SALAH (semua 🔴) — nyatanya sebagian besar sudah live sejak migration 039–042.

| Menu | Status | Catatan |
|---|---|---|
| Gudang proyek / site store | 🟡 | `project_stocks` per proyek; tanpa entitas gudang |
| Stok masuk / keluar | ✅ | `stock_movements`: GR otomatis + usage/return/adjustment |
| Transfer stok antar proyek | ✅ | migrasi 193 · `/gudang/transfer` · RLS dua sisi |
| Stock opname | ✅ | `POST /stocks/opname` bulk + OpnameModal + selisih real-time |
| Minimum stok & reorder point | 🟡 | `min_stock` + alert dashboard; reorder point/auto-PO belum |
| **Rekonsiliasi material (teoritis vs aktual)** | ✅ | `/procurement/stocks/opname` — opname massal + selisih real-time |
| **Ikhtisar Gudang (dashboard modul)** | ✅ | **Baru 2026-08-09** — `/gudang`. Bentuknya meniru referensi "Material Management", pertanyaannya TIDAK: referensi memodelkan alur MASUK (beli → gudang → proyek), Puraloka kebalikannya. Founder: *"setelah proyek selesai, semua barang, alat-alat akan disimpan lagi ke gudang."* Migrasi 238 (tabel `gudang` + `gudang_stok` + `assets.gudang_id`, constraint `assets_lokasi_tunggal`) · 239 (seed 18 aset, 20 pergerakan, 8 material) · 240 (menu). `GET /api/v1/gudang/ikhtisar` 15 test + `lib/ikhtisar-gudang.ts` 15 test. Kartu yang TAK ada di referensi dan justru paling berharga: **proyek selesai yang materialnya belum ditarik** |
| Tracking waste / susut | ✅ | **Koreksi dari 🔴 (2026-08-08)** — dibangun sebagai **Rekonsiliasi Material** `/gudang/rekonsiliasi` (552 baris) · `lib/rekonsiliasi-material.ts` (34 test) · `GET /api/v1/projects/:projectId/rekonsiliasi-material`. Ia mengadu empat sumber angka yang tak pernah dibandingkan: RAB · penerimaan · pemakaian lapangan · sisa gudang. **Tanpa tabel `waste_tracking`** — dan itu sebabnya status ini bertahan salah: yang dicari nama tabelnya, bukan gunanya. Sisa yang memang DITUNDA: "rencana susut vs susut nyata" (`waste_factor` terisi di 1 dari 3.043 assembly — F5-1 §4). |
| Material milik klien (free issue) | ✅ | migrasi 194 · `/gudang/material-klien` · tabel tersendiri (G-2 terhindar) |

---

## 8. SUBKONTRAKTOR & MANDOR

| Menu | Status | Catatan |
|---|---|---|
| Paket subkontrak | 🟡 | Via work_scopes mandor |
| Tender & award subkontraktor | ✅ | migrasi 201 + 203 · backend 22 invarian · `/mandor/tender` (2026-08-07) · perbandingan penawaran, penanda pemenang-bukan-termurah & penawaran terlalu rendah · a11y nol pelanggaran kedua mode |
| Kontrak subkontrak + BOQ | 🟡 | |
| Work order ke subkontraktor | 🟡 | |
| **Opname / berita acara bersama** | 🟡 | `field_opname_reports` (044) = 🔵 skema-mati; hard-lock opname→pembayaran = rencana Modul 11a |
| Progress claim / payment certificate | 🟡 | `progress_payments` ada; sertifikat formal belum |
| Retensi subkontrak | 🟡 | UI hidup: `mandor/retensi/page.tsx` + `retensi-section.tsx` (diukur 2026-08-06) |
| Back-charge / potongan | 🟡 | Potongan kasbon di settlement + `wage_deductions` ada; back-charge formal belum |
| Evaluasi kinerja subkontraktor | ✅ | Migrasi 218 · `evaluasi_subkon` · `/kepatuhan`. Lima dimensi berbobot (K3 25%, kepatuhan 20% — sengaja besar). **Kecelakaan kerja MENGGUGURKAN**, bukan diratakan: subkon berskor K3 90 dengan satu kecelakaan bukan subkon yang aman, dan rata-rata lima dimensi menelan kejadian itu sepenuhnya |
| Kepatuhan (izin, asuransi, pajak) | ✅ | Migrasi 218 · `dokumen_kepatuhan` · `/kepatuhan`. 15 jenis (NIB/SIUJK/SBU/BPJS/asuransi CAR-TPL-CPM/SMK3/ISO…). Dokumen bercentang `terverifikasi` yang masa berlakunya HABIS ditandai khusus — centang itu hanya berarti seseorang **pernah** memeriksanya. Jawaban gabungan `bolehBekerja` menyatukan dokumen + kinerja: data nyata di dev, PT berskor 89,1 (tertinggi) TIDAK boleh bekerja karena asuransinya mati |
| **Manajemen mandor** | ✅ | |
| Kasbon mandor & tukang | ✅ | |
| Upah harian / borongan / progress | ✅ | |
| Settlement borongan | ✅ | |

---

## 9. OPERASI LAPANGAN (Site Management)

| Menu | Status | Catatan |
|---|---|---|
| **Ikhtisar Lapangan (dashboard modul)** | ✅ | **Baru 2026-08-09** — `/lapangan` dirombak mengikuti referensi "Site Progress": 6 KPI · grafik progres harian · kehadiran tukang · milestone · temuan mutu · daftar proyek. Dilayani SATU endpoint `GET /api/v1/lapangan/ringkasan` (13 test terhadap Postgres nyata) + `lib/ringkas-lapangan.ts` (11 test). Versi lama memasang spanduk "belum ada angka lintas-proyek" untuk punch/NCR/inspeksi — batasan itu sah saat ditulis dan **dicabut bersama spanduknya** begitu endpoint agregatnya ada |
| Laporan harian proyek (DPR) | 🟡 | `progress_logs` (weather, worker_count, foto, notes) = bahan DPR; tanpa format/cetak DPR resmi |
| Log tenaga kerja harian | 🟡 | `worker_count` agregat, bukan per orang |
| Log pemakaian alat | ✅ | Migrasi 211 · `pemakaian_alat` · `/aset/operasional`. Meter terkini diambil dari pembacaan **tertinggi**, bukan entri terbaru — koreksi mundur tak boleh membuat alat terlihat belum waktunya diservis. `UNIQUE(asset_id, tanggal)` mencegah jam operasi terhitung dua kali |
| Log cuaca | 🟡 | Field `weather` di progress_logs |
| Instruksi lapangan | 🟡 | UI hidup: `instruksi-lapangan-section.tsx` → `/field-instructions` (diukur 2026-08-06) |
| Izin kerja (work permit) | ✅ | Migrasi 218 · `izin_kerja` · `/kepatuhan`. 9 jenis pekerjaan berisiko. **Pemutus WAJIB berbeda dari pengaju** — constraint DB + permission terpisah `k3:permit:decide`; dua lapis untuk satu aturan karena inilah yang pertama ditanya saat ada kecelakaan. Izin berstatus `disetujui` yang jendela waktunya lewat ditandai TIDAK BERIZIN: izin kerja bukan dokumen abadi |
| **Request for Inspection (RFI)** | ✅ | Migrasi 157 · `/lapangan/inspeksi` · pemeriksa terpisah dari pemohon; gagal → temuan punch list |
| **Submittal register** | ✅ | Migrasi 159 · `/lapangan/submittal` · lewat Workflow Engine; revisi dirantai ke pengajuan pertama |
| Non-Conformance Report (NCR) | 🟡 | UI hidup: `mutu/ncr/page.tsx` (diukur 2026-08-06). **2026-08-11 (G1b)** — sambungan NCR ← inspeksi ditutup. Diukur: `inspection_requests` **24 baris** (3 `tidak_lolos`), `ncr_items.inspection_request_id` terisi **0**; kolomnya ada, `POST /ncr` menerimanya, datanya ada di KEDUA sisi — yang tak ada satu pun cara di layar untuk mengirimkannya. Ditambahkan `lib/inspeksi-ke-ncr.ts` (16 test, 8 mutasi MERAH) + `GET /projects/:id/ncr/kandidat` (8 test Postgres nyata, 3 mutasi MERAH) + panel kandidat di `/mutu/ncr`. **Mengusulkan, bukan membuat otomatis**: NCR menugaskan orang dan `biaya_dampak`-nya masuk laporan. `severity` sengaja TIDAK ditebak dari teks — manusia yang memilih. **Diverifikasi di layar 2026-08-11**: panel muncul ("2 inspeksi gagal belum jadi NCR"), jalur penuh terbukti **2 kandidat → catat → 1 kandidat**, dan di basis `inspection_request_id` naik **0 → 1** (`NCR-001 ← IR-2608-023`). axe **0 pelanggaran**, termasuk saat modal terbuka. Satu cacat ditemukan dari tangkapan layar: `diperiksa_pada` bertipe `timestamptz` (bukan `date`), dan pola `+ "T00:00:00"` menghasilkan **"Invalid Date"** — lolos TypeScript karena keduanya `string`. **Tetap 🟡**: 6 sub-item Mutu lain menyusul (ITP · checklist · uji material · rencana mutu · audit mutu · tindakan korektif) |
| Punch list / daftar cacat | ✅ | Migrasi 156 · `/lapangan/punch-list` · `punch:verify` terpisah dari `punch:manage` |
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
| Rekrutmen & onboarding | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G2 · dari nol; `users` 26 baris sebagai titik mula. |
| Absensi & timesheet | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G2 · `absensi_harian` **1.279 baris** (2026-07-10…08-08) sudah jadi fondasi — timesheet staf kantor menyusul pola yang sama. |
| Cuti & izin | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G2 · dari nol; saldo cuti wajib dihitung, bukan disimpan (pola contingency). |
| **Payroll staf** | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G2 · **config-first WAJIB** — tarif tak boleh jadi konstanta di kode. Sampai founder mengisinya, layar menyatakan "tarif belum ditetapkan". |
| Upah harian mandor/tukang | ✅ | |
| Potongan statutori (BPJS) | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G2 · persentase BPJS jadi data ber-tanggal-berlaku di halaman pengaturan, bukan hardcode. |
| PPh 21 | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G2 · PTKP + lapisan tarif jadi data ber-tanggal-berlaku. Salah hitung = urusan hukum, jadi angkanya HARUS dari founder. |
| Sertifikasi & kompetensi | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G2 · `workers.skills` (array teks) sudah ada; yang belum: masa berlaku + pengingat kedaluwarsa. |
| Penilaian kinerja | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G2 · dari nol. |
| Klaim perjalanan & reimburse | 🟡 | Via `project_expenses` |

---

## 13. ALAT BERAT & ASET

**Diperbarui 2026-08-01 — dari 🔵 skema-mati jadi ✅ hidup** (ROADMAP #23,
migrasi 149/150/151).

| Menu | Status | Catatan |
|---|---|---|
| Register aset | ✅ | `assets` + UI `/aset`; kode unik **per-company** |
| Mutasi antar-proyek | ✅ | `asset_movements` + POST `/assets/:id/movements`; lokasi & status aset ikut berubah |
| Penyusutan | ✅ | Garis lurus & saldo menurun ganda; metode di-**snapshot** per baris log (mengubah metode tak menulis ulang sejarah). `journal_entry_id` sudah disiapkan untuk GL |
| Sewa alat | ✅ | `asset_rentals`; biaya sewa **berjalan** ikut dihitung, tak muncul mendadak saat ditutup |
| Utilisasi | ✅ | Diturunkan dari mutasi; periode tumpang tindih dihitung sekali (mencegah >100%) |
| Maintenance terjadwal | ✅ | Migrasi 211 · `jadwal_perawatan` + `riwayat_perawatan` · `/aset/operasional`. Interval **ganda**: `setiap_jam` ATAU `setiap_hari`, mana yang tercapai lebih dulu — excavator 300 jam/bulan butuh oli meski jadwal 180-harinya baru separuh. Kolom "dipicu oleh" menyebut yang mana. Rasio servis mendadak ≥50% ditandai **preventif tak bekerja** — "sering dirawat" ≠ terawat |
| Biaya operasional per alat (BBM, operator) | ✅ | Migrasi 211 · `biaya_operasional_alat` · `/aset/operasional`. Biaya **perawatan ikut dijumlah** — tanpa itu alat yang paling sering rusak justru terlihat paling murah. Biaya per jam bernilai "—" saat jam operasi nol, bukan hasil bagi-nol yang terlihat masuk akal |
| Integrasi penyusutan → GL | 🟡 | Migrasi 211 · `penyusutan_alat` + `journal_entry_id` hidup & terisi; constraint menolak jurnal setengah jadi (`journal_entry_id` ada tapi `dijurnal_pada` kosong) dan penyusutan ganda per periode. **Penjurnalan otomatis** menunggu R-001 (bentrok definisi 047/167), bukan menunggu Modul 10 |

⚠️ Forward-draft **045 TIDAK dipakai apa adanya**: ditulis sebelum multi-tenant
(nol `company_id`, nol RLS, `asset_code UNIQUE` global). 149 menulis ulang
sebagai kategori B/C. 045 dibiarkan di tempatnya — riwayat tak diubah.

---

## 14. KEUANGAN & AKUNTANSI

| Menu | Status | Catatan |
|---|---|---|
| **General Ledger + COA** | 🔵 | Migration 047 = forward-draft (**belum di-apply ke dev** per schema-diff 4a; desainnya sudah benar: rule di AccountingEngine app-layer, bukan stempel per-baris — lihat `JOURNAL-READY-METADATA-DESIGN.md` §H). ⚠️ KEPUTUSAN TERBUKA: in-app (ERP_MASTER_PLAN Modul 10) vs akuntansi eksternal + export. Lihat PETA-PRIORITAS §5 |
| Jurnal umum | 🔵 | idem |
| **Accounts Payable** | ✅ | Koreksi dari 🟡: supplier invoice + payment + aging + FIFO + overdue |
| **Accounts Receivable** | ✅ | Koreksi dari 🟡 (2026-07-28): invoice + payment + notif overdue + **aging bucket 30/60/90** (`GET /finance/ar-aging`, `lib/ar-register.ts` ber-test, halaman `/piutang`) |
| Bank & kas | ✅ | |
| Rekonsiliasi bank | ✅ | **Koreksi dari 🔴 (2026-08-08)** — status itu sudah salah sejak modulnya dibangun. Nyatanya: migrasi 234 (`rekening_koran`, `rekening_koran_baris`, `penyesuaian_rekonsiliasi`) · `lib/rekonsiliasi-bank.ts` 22 test · 6 endpoint · halaman `/kas/rekonsiliasi` (15 test endpoint). Rekomendasi lama "eksternal" tak lagi berlaku: pencocokan otomatis butuh akses ke buku kas internal, dan itu justru yang tak dimiliki alat eksternal. |
| Kas kecil / petty cash | ✅ | |
| Aset tetap & penyusutan | 🔵 | Migration 045, 0 kode |
| Pajak: PPN, PPh | ✅ | Effective-dated + guardrail test |
| e-Faktur / e-Bupot | 🟡 | Koreksi dari 🔴: pencatatan nomor + rekap pajak + status ada; generate = pakai Coretax (jangan dibangun) |
| Multi-currency & revaluasi FX | ⛔ | Dicoret owner |
| Transaksi antar-perusahaan | ⛔ | Relevan lagi hanya jika multi-company terpicu |
| **Laporan keuangan** | ✅ | Arus kas ✅; **Neraca & L/R ✅** — `lib/laporan-keuangan.ts` (13 test) · `GET /api/v1/gl/laporan` (`gl.ts:443`) · `components/neraca-laba-rugi.tsx` dipakai `akuntansi/page.tsx:258`. Diukur 2026-08-07; status 🔴 sebelumnya SALAH (F5-1 §3c). Neraca & L/R dari SATU perhitungan saldo — dua endpoint terpisah membuat laba di neraca bisa beda dari laba di L/R |
| **Pengakuan pendapatan / persentase penyelesaian (PSAK)** | ✅ | **2026-08-01** (ROADMAP #15): `lib/wip-psak.ts` + `GET /reports/wip` + tab **WIP / Pengakuan** di Laporan. Dua metode berdampingan — cost-to-cost (standar audit) & fisik; selisih besar = sinyal, bukan bug. **CIE/BIE dipisah** (aset vs liabilitas, tak saling menghapus). Kerugian diakui SEKARANG sesuai PSAK. ⚠️ Ini **laporan, bukan jurnal** — belum masuk buku besar (menunggu Modul 10 GL) |
| Tutup buku periode | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G5 · `accounts` 38 baris ADA, `journal_entries` **0**. Paling berisiko: pembukuan berpasangan masuk Ember [C], tak boleh bisa dikonfigurasi. |
| Audit trail | ✅ | + correlation_id + severity + diff + **append-only AKTIF**. ~~Gap: trigger 073 dorman~~ **KELIRU, dikoreksi 2026-08-01**: `trg_audit_logs_no_update` & `trg_audit_logs_no_delete` `tgenabled='O'` di DB — di-apply via PR #13 (`d9ea114`) setelah founder menyetujui. Klaim "dorman" berasal dari komentar di berkas migrasi 073 yang tak pernah diperbarui setelah gerbangnya dibuka |

---

## 15. PENAGIHAN & PENDAPATAN

| Menu | Status | Catatan |
|---|---|---|
| Progress billing / payment application | ✅ | Berbasis termin; bukan per kuantitas BOQ terpasang |
| Termin | ✅ | |
| Interim Payment Certificate (IPC) | ✅ | migrasi 204 · `/keuangan/ipc` (2026-08-07) · 22 invarian skema · 15 test + 7 mutasi · progres yang diakui DIBEKUKAN, retensi dari nilai periode bukan kumulatif · a11y nol pelanggaran kedua mode |
| Pelepasan retensi | ✅ | 2026-07-28: `retention_release` + **register retensi** (`GET /finance/retention-register`: ditahan vs dicairkan per proyek + estimasi jatuh tempo `end_date + due_days`, DILABELI estimasi karena BAST formal belum ada) di `/piutang` |
| Pemotongan uang muka | ✅ | 2026-07-28: recoupment DP di invoice progres HIDUP — migration 124 (`invoices.dp_deduction_amount/pct`), validasi saldo = DP TERBAYAR − sudah dipotong (`lib/ar-register.ts`), toggle di form invoice termin + register DP (`GET /finance/dp-register`) di `/piutang`. ⚠️ Terbuka: perlakuan pajak atas porsi DP yang dipotong (lihat DEVELOPMENT_LOG 2026-07-28) |
| Penagihan pekerjaan tambah | 🟡 | Via CO→contract_value→termin manual |
| Invoice & faktur pajak | ✅ | + PDF + QR verifikasi publik (`/verify/invoice/[id]`) |
| Follow-up penagihan | ✅ | Koreksi dari 🟡 (2026-07-28): notif + email overdue + AR aging bucket 30/60/90 di `/piutang` |
| Nota kredit | ✅ | Migrasi 219 · `nota_kredit` · `/procurement/lanjutan`. Pemutus WAJIB berbeda dari pengaju (constraint DB, pola sama dengan izin kerja 218). `disetujui` dan `diterapkan` adalah **dua kejadian terpisah** — constraint menolak `diterapkan` tanpa `diputuskan_pada`, dan jarak di antaranya ditandai: potongan yang disepakati tapi belum mengurangi tagihan adalah uang hilang dengan persetujuan lengkap |

---

## 16. MANAJEMEN DOKUMEN

| Menu | Status | Catatan |
|---|---|---|
| Register dokumen + kontrol revisi | ✅ | **Koreksi dari 🟡 (2026-08-08)** — catatan "kolom `version` saja, tanpa riwayat revisi" sudah salah. Diukur: `register_gambar` punya `revisi` + `digantikan_oleh`, dan `lib/kendali-dokumen.ts` menandai USANG dari **perbandingan revisi lintas-baris**, bukan dari kolom status yang bisa basi. Dibuktikan di layar `/dokumen/kendali`: STR-101 rev 1 tampil "Usang — ada rev 2" dan naik ke atas daftar, padahal **status DB-nya masih `berlaku`** — persis kasus yang berbahaya (dua gambar pondasi sama-sama sah). axe 0 pelanggaran |
| Transmittal | ✅ | Migrasi 215 · `transmittal` + `transmittal_item` · `/dokumen/kendali`. Bukti KIRIM dan bukti TERIMA disimpan terpisah — keduanya klaim berbeda, dan selisihnya yang diperdebatkan saat pekerjaan salah gambar dibongkar. Constraint menolak `diterima` tanpa tanggal, dan terima-sebelum-kirim. Yang tak berjawab >7 hari ditandai menggantung |
| Register gambar | ✅ | Migrasi 215 · `register_gambar` · `/dokumen/kendali`. Gambar berstatus `berlaku` yang sudah punya revisi lebih tinggi ditandai **USANG** — dihitung dari perbandingan revisi, bukan dari kolom status yang mudah lupa diperbarui. Constraint menolak `digantikan` tanpa menyebut penggantinya |
| Notulen rapat | ✅ | Migrasi 215 · `notulen_rapat` + `notulen_tindakan` · `/dokumen/kendali`. Butir tindakan WAJIB punya penanggung jawab (constraint DB). Butir terbuka TANPA tenggat dihitung terpisah — ia tak akan pernah muncul sebagai `lewat tenggat`, hanya mengendap sampai rapat berikutnya membahasnya lagi |
| Approval workflow dokumen | ✅ | Engine Program B |
| Matriks distribusi | ✅ | Migrasi 215 · `matriks_distribusi` · `/dokumen/kendali`. Penerima WAJIB bisa dihubungi: akun sistem ATAU surel ber-@ (constraint DB). Penerima yang tak bisa dihubungi bukan penerima |
| Tanda tangan elektronik | 🟡 | Migrasi 215 · `tanda_tangan_elektronik` · `/dokumen/kendali`. Yang disimpan **sidik SHA-256** isi dokumen saat ditandatangani, dihitung DI SERVER (klien tak bisa mengirim hash dokumen lain) — bisa dibuktikan dokumennya tak berubah sesudahnya. e-meterai tersertifikasi Peruri BELUM; itu yang menjadikannya sebagian |

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
| Report builder | 🔴 | **Masuk lingkup 2026-08-11** (R-011 — larangan dicabut founder). G6 · catatan lama "membangun Excel di dalam ERP" tetap jadi peringatan bentuk, bukan larangan. |
| Export Excel / PDF | ✅ | Keduanya ada (XLSX + `reports/export-pdf` + invoice PDF) |
| Distribusi laporan terjadwal | 🟡 | Migrasi 215 · `jadwal_distribusi_laporan` · `/dokumen/kendali`. Jadwal + deteksi **MACET** hidup: gagal 3× berturut ATAU telat >2× iramanya sendiri meski nol galat tercatat (proses penjadwal yang mati tak meninggalkan galat). Pengiriman surel otomatisnya sendiri belum dijalankan |

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
| Backup & restore | ✅ | F0-13/F0-14 · `.github/workflows/cadangan-harian.yml` (terenkripsi) + `uji-pemulihan.yml` (latihan mingguan). **RTO terukur 61 detik**, tabel 124/124 · RLS 123/123 · policy 377/377. `scripts/db/cadangan-darurat.mjs` sebagai jalur COPY saat `pg_dump` gagal (R-006) |
| Multi-bahasa (i18n) | ⛔ | Dicoret owner — UI Bahasa Indonesia |
| SSO / SAML | ⛔ | Dicoret owner |
| Multi-tenant | 🟡 | **Naik dari 🔴 2026-08-04 — diukur, bukan ditaksir.** Isolasi datanya HIDUP: 45/123 tabel ber-`company_id`, sisanya lewat rantai FK (klasifikasi F2-2), RLS aktif 123/123. Fase 2 menutup **lima kebocoran lintas-tenant nyata** (`audit_logs` 13.691 baris · `permission_scopes` · 3 bucket storage). ADR-010 memutuskan bentuk grup/holding. Yang BELUM: penyediaan tenant, onboarding, langganan, batas paket — itu F7-1, dan gerbangnya tetap pelanggan eksternal committed |

---

## 20. MOBILE / FIELD APP

| Menu | Status | Catatan |
|---|---|---|
| Mode offline | 🟡 | **TULIS: F4-3** (`antrean-offline.ts`, localStorage, 6 jalur, 4 jaminan, mutasi 6/6). **BACA: 2026-08-07** (`cache-baca.ts`, IndexedDB — bertahan saat aplikasi ditutup, beda dari `data-cache.ts` F4-2 yang `Map` di memori). Jaringan DULU, cache hanya saat gagal; data dari cache selalu BERTANDA (`PenandaCache`) beserta usianya, karena data lama yang tak ditandai lebih berbahaya daripada layar kosong. 19 test · 11/11 mutasi · bukti perilaku browser nyata (`uji-baca-offline.mjs`). **Belum 5/5**: foto belum ikut diantre |
| Input laporan harian | 🟡 | Screen input progress + foto ada |
| Foto + geotag | ✅ | **Koreksi dari 🟡 (2026-08-08)** — catatan "geotag 🔴" separuh benar dan menyesatkan: kolom (`lintang`/`bujur`/`akurasi_m`/`sumber_lokasi`), pustaka `lib/geotag.ts` (haversine, ber-test), penjaga CI `uji-invarian-geotag.mjs`, jalur penautan foto, dan UI `penanda-lokasi.tsx` **semuanya sudah ada**. Yang hilang dua mata rantai, dan hasilnya **0 dari 36 foto ber-geotag**: (1) nol kode aplikasi memanggil `getCurrentPosition` — ditutup `web/lib/lokasi-perangkat.ts` (10 test, 5 mutasi MERAH); (2) kedua jalur insert foto laporan harian MEMBUANG koordinatnya — ditutup `barisGeotag()` di `lib/geotag.ts` (9 test, 5 mutasi MERAH) + 6 test endpoint Postgres nyata. Gagal ambil lokasi TIDAK membatalkan unggahan dan sebabnya dinyatakan di layar |
| Absensi lapangan | ✅ | **Naik dari 🟡 (2026-08-08)** — migrasi 191 (`absensi_harian`) · 4 endpoint · UI `mandor/absensi/page.tsx` (518 baris) · **`lib/rekap-absensi.ts` 15 test + 14 test endpoint**. Yang menahannya di 🟡 bukan fitur yang kurang melainkan **nol test** — dan `porsi_hari`/`jam_lembur` menentukan UPAH. Aritmetikanya diangkat keluar dari route jadi pustaka murni; 5 mutasi pustaka + 3 mutasi endpoint dibuktikan MERAH. |
| Material request | ✅ | `/procurement/permintaan` terbaca **tanpa sinyal** sejak 2026-08-07 — 9 MR lengkap (nomor, proyek, tanggal dibutuhkan, item) tampil dari IndexedDB dengan pita penanda. Sebelumnya `.catch(() => null)` menampilkan daftar KOSONG, yang di lokasi terbaca "tak ada permintaan" padahal ada belasan menunggu persetujuan |
| Approval mobile | 🟡 | Approve/reject inline dari notifikasi |
| Checklist inspeksi | ✅ | `/lapangan/inspeksi` terbaca **tanpa sinyal** sejak 2026-08-07. Daftar PROYEK ikut di-cache — ia prasyarat halaman ini, dan tanpanya `muat()` tak pernah berjalan sehingga layar tetap kosong meski checklistnya sudah tersimpan. Ketahuan dari `uji-baca-offline.mjs`, BUKAN dari test unit |
| *(Total: 9 screen Expo)* | | dashboard, proyek×2, progress, kasbon×2, mandor, notifikasi, login |

---

## KEPUTUSAN ATAS 68 SUB-MENU MERAH — 2026-08-01

Founder meminta ini diputuskan lebih dulu: *"30 sub menu itu kerjakan aja dulu,
emang isinya apa? dan menurut kamu kerjakan atau tidak untuk jangka panjang?"*

Angka "±30" di catatan lama adalah yang **belum punya alasan tertulis**, bukan
seluruh merah. Setelah taksonomi diperbarui (RFI, Submittal, Punch List hidup
2026-08-01), sisanya **68**. Ini keputusan atas seluruhnya.

### 🟢 KERJAKAN — 23 item, nilainya nyata untuk kontraktor

| Kelompok | Item |
|---|---|
| **Cost control** (7) | WIP/PSAK · commitment tracking · cost-to-complete forecast · analisa varians · CVR · revisi & transfer anggaran · manajemen contingency |
| **Kontrak & klaim** (6) | claims · surat masuk/keluar · register asuransi · analisa keterlambatan · retensi subkontrak · IPC |
| **Jadwal** (4) | master schedule + baseline · CPM · look-ahead · method statement |
| **Lapangan** (3) | NCR · instruksi lapangan · izin kerja |
| **Procurement** (3) | RFQ ke vendor · bid tabulation · evaluasi kinerja vendor |

Kelompok cost control adalah yang **membedakan ERP kontraktor dari aplikasi
pencatat biasa** — Lima Pembeda #1. Kelompok kontrak & klaim adalah bukti saat
sengketa; nilainya baru terasa ketika dibutuhkan, dan saat itu terlambat
membangunnya.

### 🟡 TAHAN sampai ada pemicu

> **Daftar ini pernah basi.** Ditulis "18 item" lalu memuat 26 nama, dan
> sebagian di antaranya sudah hidup berbulan-bulan. Angka di depan daftar
> dibuang: yang mengikat adalah tanda ✅ per nama, dan jumlah resminya
> diukur di `F5-1-TRIASE-SUBMENU.md` §6 — bukan disalin dari sini.

**Sudah dikerjakan meski pemicunya belum menyala** (keputusan founder
2026-08-07, basis belum operasional sehingga bentuknya diturunkan dari
praktik lapangan, bukan dari pemakai nyata):

✅ prakualifikasi vendor · ✅ dokumen prakualifikasi · ✅ evaluasi kinerja
vendor · ✅ log pemakaian alat · ✅ maintenance terjadwal · ✅ biaya
operasional alat · ✅ tender subkontraktor · ✅ transfer stok antar proyek ·
✅ material milik klien · ✅ rekonsiliasi material · ✅ eskalasi harga ·
✅ backup & restore · ✅ absensi lapangan

Diukur ke kode 2026-08-07, bukan diingat: tiap ✅ punya route di
`apps/api/src/routes/v1/` **dan** halaman di `apps/web/app/`.

**Masih menunggu pemicunya:**

kalender kerja · resource histogram · kontrak payung · expediting ·
tracking waste · kepatuhan subkon · register gambar · notulen rapat ·
transmittal · matriks distribusi · distribusi laporan terjadwal ·
mode offline (baca) · material request mobile · checklist inspeksi mobile

Sisanya berguna, tapi **tak ada yang menunggunya sekarang**. Membangun sebelum
ada pemakai berarti menebak bentuknya — dan bentuk yang salah lebih mahal
daripada belum ada.

### 🔴 JANGAN DIBANGUN — 12 item

| Item | Alasan |
|---|---|
| payroll staf · BPJS · PPh 21 | Aturan pajak berubah tiap tahun; salah hitung PPh 21 adalah urusan hukum, bukan bug. Tool eksternal. |
| rekonsiliasi bank · tutup buku periode | Software akuntansi melakukannya lebih baik, dan integrasinya lebih murah daripada membangunnya |
| report builder | Taksonomi sendiri sudah menandai "jangan dibangun". Ini jebakan klasik: membangun Excel di dalam ERP. |
| multi-tenant (Program F) | Gerbangnya jelas — menunggu pelanggan berbayar |
| rekrutmen · cuti · penilaian kinerja · sertifikasi | Ini HRIS, bukan ERP kontraktor |

### ⚪ SUDAH TERCAKUP — 5 item

RFI · Submittal · Punch list (hidup 2026-08-01) · bid bond (ROADMAP #16) ·
penyusutan → GL (Gelombang 2).

### Konsekuensi pada angka

Kalau 23 dikerjakan dan 12 dicoret, penyebutnya berubah dari 191 jadi **179**
menu yang benar-benar ditargetkan. Yang 18 ditahan tetap dihitung — ia bukan
dicoret, hanya belum waktunya.

**⚠️ Ini TIDAK berarti 23 item itu dikerjakan sekarang.** Keputusan founder yang
berlaku: **pondasi dulu, fitur ditahan** (ROADMAP §Peta Seluruh Visi). Ke-23
item ini masuk Gelombang 1–2, dikerjakan setelah utang teknis bersih.

---

## KALAU SELURUH ROADMAP SELESAI — JADI SEBERAPA LENGKAP?

> ### ⚠️ SEBAGIAN BAGIAN INI SUDAH DIGANTI — [`KEPUTUSAN-SCOPE-ERP-AI.md`](./KEPUTUSAN-SCOPE-ERP-AI.md) (2026-08-01)
>
> Bagian ini ditulis pagi 2026-08-01, beberapa jam sebelum founder menyatakan
> tujuan **"ERP lengkap, terintegrasi, berbasis AI"**. Keputusan itu **MEMBALIK**
> empat kantong yang di bawah masih tertulis sebagai "sengaja tak ditargetkan":
> QA/QC+HSE, GL in-app, payroll, dan aset penuh — keempatnya **kini MASUK**.
>
> **Yang masih berlaku di bawah:** metode hitungnya (kolom Status, bukan semua
> tanda), angka 183 sub-menu, dan sebarannya. **Yang sudah TIDAK berlaku:**
> pembagian "empat kantong" beserta kesimpulan bahwa ±40 merah tak perlu
> dikerjakan. Sekarang perlu.
>
> Dibiarkan apa adanya, bukan dihapus — supaya terlihat bahwa keputusan scope
> BERUBAH, dan kapan. Menghapusnya akan membuat riwayatnya berbohong.

Ditulis 2026-08-01 menjawab pertanyaan founder: *"kalau seluruh roadmap
selesai, ini akan jadi gimana? bukannya menu di taksonomi itu banyak ya?"*

**Jawaban singkat: ROADMAP selesai ≠ taksonomi habis. Dan itu memang disengaja.**

### Angkanya

Dihitung dari **kolom Status**, bukan dari semua tanda yang muncul di baris —
banyak baris memuat tanda tambahan di kolom Catatan sebagai keterangan
("Foto ✅, geotag 🔴"), dan ikut menghitungnya menggelembungkan angka ±12%.

| | Jumlah |
|---|---|
| Sub-menu di 20 kelompok taksonomi (tertabel) | **183** |
| — ✅ hidup end-to-end | 53 (29%) |
| — 🟡 sebagian (ada lapisan, belum utuh) | 48 (26%) |
| — 🔵 skema-mati (migrasi ada, 0 kode) | 5 |
| — ⛔ dicoret owner | 6 |
| — 🔴 belum dimulai | **71 (39%)** |
| Ditambah 4 kelompok yang seluruhnya 🔴 tanpa tabel (§10 QA/QC, §11 HSE, §13 Alat Berat, §17 Risiko) | ± 40 lagi |

ROADMAP punya **24 item**, 16 sudah ✅. Delapan sisanya (#14, #15, #16, #17,
#20, #23, #24, dan #8 yang dicoret) **tidak** memetakan 1:1 ke 71 merah itu.

### Kenapa 24 item bisa "cukup" padahal merahnya 71+

Karena satu item ROADMAP sering menutup satu **kelompok** taksonomi sekaligus,
sementara sebagian besar merah lainnya **sengaja tidak ditargetkan**:

1. **Satu item ROADMAP ≠ satu sub-menu.** #22 (bid register) sendirian
   mengubah 4 baris §2 dari 🔴 jadi ✅/🟡. #24 (Capability Tier-2) mencakup
   seluruh §10 QA/QC + §11 HSE — dua kelompok penuh.
2. **Sebagian besar merah adalah keputusan "tidak dibangun", bukan utang.**
   §12 HR & Payroll: 8 merah, dan payroll staf/BPJS/PPh 21 sudah diputuskan
   **pakai tool eksternal**. Membangunnya bukan kemajuan — itu menambah beban
   pemeliharaan untuk pekerjaan yang sudah beres di tempat lain.
3. **Sebagian menunggu pemicu bisnis, bukan menunggu waktu.** §10 QA/QC dan
   §11 HSE ditandai "bangun saat tender mensyaratkan". Membangunnya sekarang =
   menebak bentuk yang disyaratkan tender yang belum pernah diikuti.
4. **§13 Alat Berat sengaja diperkecil.** Kalau alat mayoritas **sewa**, register
   aset + penyusutan adalah jawaban untuk masalah yang tidak dimiliki. ROADMAP #23
   dengan sadar hanya mengambil versi ringan (tracking sewa + utilisasi).

### Ke mana 71 merah itu bermuara

Dihitung per kelompok, bukan diperkirakan:

| Nasib | Jumlah | Isinya |
|---|---|---|
| **Ditutup 8 item ROADMAP sisa** | ± 21 | §3 kontrak (5, via #16) · §5 cost control (7, via #14/#15) · §4 penjadwalan (6, via #21 lanjutan) · §2 sisa (3, via #24) |
| **Sudah diputus pakai tool eksternal** | ± 12 | §12 payroll/BPJS/PPh 21 · §14 neraca & L/R |
| **Menunggu pemicu tender** | ± 40 | §10 QA/QC · §11 HSE · §17 risiko — seluruhnya, tak bertabel |
| **Sengaja diperkecil** | ± 8 | §13 alat berat (sewa saja) · §20 mobile offline/geotag |
| **Belum punya alasan tertulis** | **± 30** | §9 operasi lapangan (7) · §16 dokumen (5) · §6 procurement (5) · §7 inventory (4) · §8 subkon (4) · sisanya tersebar |

Baris terakhir itu yang paling penting, dan sengaja tidak dihaluskan: **± 30 merah
belum pernah diputuskan apa pun.** Bukan "dikerjakan nanti" — belum ada
keputusan bahwa ia dikerjakan atau tidak.

### Yang jujur harus dikatakan

Setelah 24 item ROADMAP tuntas, taksonomi **tidak** akan hijau semua — dan
tidak seharusnya. Yang tersisa berada di empat kantong di atas, tiga di
antaranya punya alasan tertulis.

Itu bukan kekurangan rencana. Taksonomi ini **peta ERP kontraktor kelas dunia
secara umum** — bukan daftar kebutuhan Puraloka. Menghijaukan 100% berarti
membangun modul untuk masalah yang perusahaan ini belum punya, dan itu persis
yang dilarang "Never Build List" + scope owner 2026-07-26.

**Yang harus dijaga:** tiap merah yang dilewati wajib punya **alasan tertulis** di
kolom Catatan. Merah tanpa alasan = utang tersembunyi. Merah dengan alasan =
keputusan.

Per 2026-08-01 masih ada **± 30 merah tanpa alasan apa pun** — 41% dari seluruh
merah. Selama itu dibiarkan, pertanyaan "kalau roadmap selesai jadi gimana?" tak
bisa dijawab dengan pasti, karena tak ada yang tahu 30 baris itu **wajib** atau
**tidak relevan**. Memutuskannya jauh lebih murah daripada membangunnya, dan
hasilnya bisa saja "coret" — yang juga kemajuan.

Ini pekerjaan **keputusan founder**, bukan pekerjaan membangun fitur: tiap baris
cuma perlu satu dari tiga label — *dikerjakan* / *eksternal* / *coret*.

---

## "SUDAH BERAPA PERSEN?" — tiga angka, tiga arti

Ditambahkan 2026-08-01 menjawab pertanyaan founder. Pertanyaannya sederhana,
jawabannya **tak bisa satu angka** — karena "persen dari apa" mengubah hasilnya
dari 67% jadi 29%, dan keduanya benar untuk pertanyaan yang berbeda.

| Diukur terhadap | Angka | Artinya |
|---|---|---|
| **ROADMAP** (rencana yang dipilih) | **32 dari 45 = 71%** | 20/30 item bernomor + 12/15 Tingkat 0. Inilah jawaban untuk "pekerjaan yang kita sepakati, sudah sejauh mana" |
| **Taksonomi tanpa yang dicoret** | (53 + 48 sebagian) dari 177 → **30% penuh, 27% sebagian** | Peta ERP kontraktor kelas dunia secara umum. Dipakai untuk melihat apa yang BELUM terpikirkan, bukan untuk menilai kemajuan |
| **Kriteria Kualitas** (5 kriteria owner) | **3 kuat · 1 sedang · 1 lemah** | Paling dekat dengan "sistem ini sudah bisa dipercaya belum" |

**Angka yang paling jujur dipakai: 71%** — karena itu diukur terhadap pekerjaan
yang benar-benar diputuskan dikerjakan. Persentase terhadap taksonomi menyesatkan
ke dua arah sekaligus: ia menghukum keputusan sadar untuk TIDAK membangun sesuatu,
sekaligus menyembunyikan bahwa yang tersisa bukan 70% pekerjaan melainkan 13 item.

### Kalau seluruh ROADMAP selesai (100%), sistem ini jadi apa

Bukan "ERP lengkap". Yang tepat: **sistem cost-control kontraktor yang setiap
angkanya bisa dipertahankan di hadapan klien, bank, dan pemeriksa** —

- RAB dari analisa AHSP resmi, tiap baris bisa dijelaskan 5 langkah sampai ke
  sumber harga & tanggal berlakunya (#19 ✅)
- Rencana vs realisasi terukur per proyek DAN lintas portofolio (#18 ✅, #21 ✅)
- Kebocoran tertutup di titik paling awal — kuota RAB di MR, commitment PO,
  3-way match (#11 ✅, #9 ✅)
- Pengakuan pendapatan PSAK sehingga L/R per proyek bermakna (#15, sisa)
- Rantai kontrak pemerintah: denda arah kontraktor, EOT, register jaminan (#16, sisa)

Yang TETAP tidak dimiliki, dengan sadar: GL/jurnal in-app · payroll & pajak
karyawan · QA/QC & HSE formal · manajemen aset berat · BIM · multi-currency.
Enam-enamnya punya alasan tertulis, dan lima di antaranya jawabannya adalah
"pakai yang sudah ada di luar", bukan "belum sempat".

### Apakah semua yang di docs/ akan dikerjakan? Tidak — dan itu bukan kelalaian

235 dokumen di `docs/` **98% saling tersambung** (diukur 2026-08-01: hanya 4
berdiri sendiri, dan 2 di antaranya justru sumber ROADMAP #17/#20). Jadi
dokumennya memang satu jaringan, bukan tumpukan lepas.

Tapi tersambung ≠ akan dikerjakan. Dokumen di sini punya **tiga peran berbeda**,
dan hanya satu yang berisi pekerjaan:

1. **Rencana kerja** → sudah di-merge ke `ROADMAP.md`. Ini yang dikerjakan.
2. **Konstitusi & keputusan** (ADR, Engineering-Constitution, arsitektur 00–06) →
   aturan yang MENGIKAT tiap pekerjaan baru. Tak pernah "selesai", ia dipatuhi.
3. **Discovery & teardown** (AHSP-TEARDOWN-DEFECTS, discovery RAP, audit) →
   hasilnya sudah terpakai jadi dasar keputusan. Nilainya sudah dipetik.

Dokumen kategori 2 dan 3 yang membuat `docs/` terlihat "banyak sekali pekerjaan".
Padahal yang berupa pekerjaan tersisa cuma **13 item** — 8 di ROADMAP + 5 yang
menunggu keputusan/berkas dari founder (E9, E10, E12, #17, #20).

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
- **Situs publik (compro) berbasis CMS** (205-208, `/pengaturan/situs`) —
  seluruh teks, foto, urutan seksi, dan warna merek halaman depan diedit dari
  dashboard; nol string konten di kode. Endpoint publik read-only ber-rate-limit,
  revalidate-on-save. App terpisah `apps/web-publik`.

---

# TOLOK UKUR: "KUALITAS KELAS BESAR" (definisi owner, 2026-07-26)

> Menggantikan bagian lama "Syarat dipakai perusahaan internasional" — target
> yang benar adalah kualitas, bukan geografi. Dicoret dari pertimbangan:
> multi-currency, i18n, SSO/SAML, GDPR/data residency, adapter pajak multi-negara,
> IFRS 15 (ganti: **PSAK**).

| # | Kriteria | Posisi hari ini (terverifikasi) |
|---|---|---|
| 1 | **Angka finansial selalu bisa dipertanggungjawabkan** | **Kuat** — audit trail + diff + correlation_id + QR invoice ✅, dan **append-only AKTIF** (dikoreksi 2026-08-01: klaim "073 dorman" salah, trigger `tgenabled='O'` sejak PR #13). Audit log tak bisa diubah lewat jalur aplikasi |
| 2 | **Cost control berlapis benar-benar jalan** | 3/5 (naik 2026-07-31: RAP live + BAC dari pagu RAP) — lihat Lima Pembeda |
| 3 | **Sistem tahan orang** (tidak bergantung satu orang jujur) | Kuat: approval berjenjang ber-invariant CI, permission-based RBAC, anti-lockout ✅; sisa: RLS table dormant (gerbang mobile), checklist service_role ☐ |
| 4 | **Data historis tidak rusak oleh aturan baru** | Kuat: effective-dating config finansial, baseline snapshot CO, penalty immutable ✅ — pola WAJIB dipertahankan di modul baru |
| 5 | **UI tidak bikin pusing orang lapangan** | Lemah: mobile 9 screen tanpa offline/geotag; input harian mandor nyatanya masih WhatsApp (DOMAIN.md §8) |
| + | **Timezone UTC di DB** | ✅ terverifikasi: 224 TIMESTAMPTZ, nol TIMESTAMP polos |
| + | **Tipe data uang** | ✅ terverifikasi: 100% NUMERIC, nol float |

---

# LIMA PEMBEDA ERP KONTRAKTOR ASLI — SKOR TERVERIFIKASI

1. **Cost control berlapis** (RAB→RAP→commitment→aktual→forecast) — **3/5**
   *(naik dari 2/5, 2026-07-31)*. RAB ✅; **RAP ✅ live** (migrasi 138 + UI, pagu
   terkunci ber-guard DB); commitment 🔴 (PO+borongan belum diadu ke pagu);
   aktual tersebar (ACL = mapping saja); forecast endpoint tanpa UI.
   Sisa terbesar: **rekonsiliasi pagu RAP vs realisasi belanja** (§D7 desain
   CECEP — gerbang "jangan bangun" sudah lewat karena RAP kini ada).
2. **EVM** — **4/5** *(naik dari 3.5/5, 2026-07-31)*. Mesin hitung sudah lengkap,
   dan **basis BAC kini benar**: pagu RAP terkunci (biaya) dipakai lebih dulu
   sebelum RAB (nilai jual). Sebelumnya CPI/SPI sistematis optimistis karena
   margin RAB menyamarkan pembengkakan. Sisa kelemahan ada di kualitas *input*
   (PV dari `rab_schedule` manual, EV self-reported), bukan di rumus.
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
