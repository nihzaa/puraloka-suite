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
| **Estimating / AHSP** | ✅ | CECEP: engine (`lib/ahsp-engine.ts`) + 17 tabel + 500+ test; **UI `/estimasi` kini hidup** (2026-07-30 — sebelumnya tak terjangkau `middleware.ts`) + tombol "kenapa angkanya segini?" (2026-08-01). **Dirombak 2026-08-16**: satu berkas 4.070 baris (6 tab, 4 di antaranya merender NOL tabel) dipecah jadi `/estimasi` + `/estimasi/{rab,rap,kas,varians}` + `/master/{ahsp,harga}`; alur "skenario→versi→edisi→item" jadi satu tombol "Susun di sini"; layar kosong wajib berjalan-keluar (penjaga `uji-layar-kosong-menjelaskan.mjs`). Tautan `?tab=` lama dialihkan, lulus 6/6. Detail: `docs/superpowers/specs/2026-08-16-cecep-rombak-ui-design.md` |
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
| Master schedule + baseline | ✅ | **Klaim lama SEBAGIAN SALAH, dikoreksi 2026-08-12 (G6b).** `rab_schedule` diukur **NOL BARIS** — ia rencana per item/minggu yang tak pernah terpakai, dan menyebutnya "baseline" membuat modul yang benar-benar hilang terlihat sudah ada. Baseline SUNGGUHAN baru dibangun G6b: migrasi 303 `baseline_jadwal` + `baseline_jadwal_item` · `lib/baseline-jadwal.ts` (30 test, 16/16 mutasi MERAH) · `routes/v1/baseline-jadwal.ts` (14 test, 9/10 mutasi MERAH) · `/proyek/[id]/baseline`. Sebelum ini `planned_start/end` dipakai 6 berkas tetapi **nol kolom baseline** — dan karena `spi = ev / pv` diturunkan dari tanggal itu, tiap penundaan ikut memundurkan PV sehingga **SPI selalu mendekati 1**. Tanggal DISALIN bukan dirujuk; item baseline **append-only** (UPDATE ditolak, DELETE hanya lewat CASCADE) dibuktikan lewat SQL langsung; satu baseline aktif per proyek dengan yang lama tetap jadi riwayat; rata-rata pergeseran ditimbang bobot |
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
| Tracking waste / susut | ✅ | **Koreksi dari 🔴 (2026-08-08)** — dibangun sebagai **Rekonsiliasi Material** `/gudang/rekonsiliasi` (552 baris) · `lib/rekonsiliasi-material.ts` (34 test) · `GET /api/v1/projects/:projectId/rekonsiliasi-material`. Ia mengadu empat sumber angka yang tak pernah dibandingkan: RAB · penerimaan · pemakaian lapangan · sisa gudang. **Tanpa tabel `waste_tracking`** — dan itu sebabnya status ini bertahan salah: yang dicari nama tabelnya, bukan gunanya. Sisa yang dulu ditunda — "rencana susut vs susut nyata" — **SELESAI G6e 2026-08-12**: migrasi 310 (`peta_resource_material` + `rencana_susut_material`) & 311 · `lib/susut-material.ts` (36 test, 15/15 mutasi MERAH) · `routes/v1/susut-material.ts` (16 test, 11/11 mutasi MERAH) · `/gudang/susut`. **Penundaannya sah tetapi sebabnya keliru dicatat**: `waste_factor` diukur ulang MASIH 1 dari 3.043, tetapi jalur assembly→material bukan "belum dibuat" melainkan **tak mungkin dibuat tanpa keputusan manusia** — `resources` (2.830, kode `AHSP-*`) dan `materials` (24, kode `MAT-*`) punya NOL kode yang cocok. Menyambungkannya lewat pencocokan nama adalah tebakan yang menghasilkan angka susut menuduh orang atas material yang tak pernah mereka pegang — **dan saya membuktikannya sendiri**: saat menguji, hasil pencarian "semen" yang pertama ternyata `AHSP-R0260 Plafon Serat Semen/GRC` (satuan m²), dan saya sempat memetakannya ke `MAT-001 Semen Portland 50kg`. Pemetaan itu dihapus. Yang dibangun: jembatan sebagai DATA (nol ter-seed) + **faktor konversi** (tanpanya 500 kg AHSP vs 10 sak gudang = "susut 98%", angka yang menuduh orang atas kesalahan satuan) + rencana susut per MATERIAL (puluhan, bukan 3.043). Penilaian HANYA diberikan bila rencananya ada — `tak_terukur` keadaan sah yang harus terlihat. `hilang` NEGATIF dibiarkan negatif: memaksanya nol menyembunyikan cacat pencatatan dan membuat susutnya terlihat sempurna. |
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
| Non-Conformance Report (NCR) | 🟡 | UI hidup: `mutu/ncr/page.tsx` (diukur 2026-08-06). **2026-08-11 (G1b)** — sambungan NCR ← inspeksi ditutup. Diukur: `inspection_requests` **24 baris** (3 `tidak_lolos`), `ncr_items.inspection_request_id` terisi **0**; kolomnya ada, `POST /ncr` menerimanya, datanya ada di KEDUA sisi — yang tak ada satu pun cara di layar untuk mengirimkannya. Ditambahkan `lib/inspeksi-ke-ncr.ts` (16 test, 8 mutasi MERAH) + `GET /projects/:id/ncr/kandidat` (8 test Postgres nyata, 3 mutasi MERAH) + panel kandidat di `/mutu/ncr`. **Mengusulkan, bukan membuat otomatis**: NCR menugaskan orang dan `biaya_dampak`-nya masuk laporan. `severity` sengaja TIDAK ditebak dari teks — manusia yang memilih. **Diverifikasi di layar 2026-08-11**: panel muncul ("2 inspeksi gagal belum jadi NCR"), jalur penuh terbukti **2 kandidat → catat → 1 kandidat**, dan di basis `inspection_request_id` naik **0 → 1** (`NCR-001 ← IR-2608-023`). axe **0 pelanggaran**, termasuk saat modal terbuka. Satu cacat ditemukan dari tangkapan layar: `diperiksa_pada` bertipe `timestamptz` (bukan `date`), dan pola `+ "T00:00:00"` menghasilkan **"Invalid Date"** — lolos TypeScript karena keduanya `string`. **G1c 2026-08-11 — Tindakan Korektif**: diukur `ditugaskan_ke` terisi **0 dari 19**, termasuk **enam NCR berstatus `perbaikan`** — enam pekerjaan "sedang diperbaiki" tanpa penanggung jawab. API sudah menerimanya DAN mengirim notifikasi (`ncr.ts:322`), tapi notifikasi itu tak pernah terkirim karena tak ada yang bisa mengisi kolomnya. Ditutup: `ModalTindakLanjut` (penugasan + akar masalah + tindakan + target dalam satu `PATCH`). Dibuktikan di layar: 9 tombol Tugaskan, 26 opsi petugas, axe **0**, dan di basis `ditugaskan_ke` naik **0 → 1**. Akar masalah sengaja TERPISAH dari tindakan — tindakan tanpa akar memperbaiki gejala, dan sepuluh NCR berakar sama adalah masalah proses. **Tetap 🟡**: 5 sub-item Mutu lain menyusul (ITP · checklist inspeksi · uji material · rencana mutu · audit mutu) |
| Punch list / daftar cacat | ✅ | Migrasi 156 · `/lapangan/punch-list` · `punch:verify` terpisah dari `punch:manage` |
| Dokumentasi foto | ✅ | Live sejak 097/098 (bucket privat + all-or-nothing); **geotag 🔴** (0 kolom GPS) |
| Serah terima (PHO/FHO) | 🟡 | BAST hanya sebagai jenis dokumen upload; proses tidak ada |

---

## 10. QUALITY MANAGEMENT (QA/QC)

Semua 🔴 — terkonfirmasi (0 hit di kode). Bangun saat tender mensyaratkan.

---

## 11. HSE / K3 & LINGKUNGAN

**Diperbarui 2026-08-12 (G4).** Baris "Semua 🔴 · bangun saat tender
mensyaratkan" sudah BASI — dan alasan pembangunannya ternyata BUKAN tender.

> **Pemicunya ditemukan saat mengukur, bukan saat merencanakan.**
> `lib/kepatuhan-k3.ts` sudah **menggugurkan subkon dari pekerjaan** bila
> `jumlah_kecelakaan > 0` — dan angka itu **diketik manual**, tanpa satu pun
> baris yang menjelaskan kecelakaan apa, kapan, siapa yang terluka. Jadi
> sistem ini sudah mengambil keputusan berat tentang orang berdasarkan angka
> tanpa sumber: yang mengetik bisa salah ingat, dan yang dinilai tak punya
> cara membantah karena tak ada yang bisa ditunjuk.

| Menu | Status | Catatan |
|---|---|---|
| Laporan insiden | ✅ | Migrasi 293 · `insiden_k3` · `/k3/insiden`. **Inti G4.** `GET /proyek/:id/k3/selaras` membandingkan angka kecelakaan yang DIKETIK di evaluasi subkon dengan yang DIHITUNG dari insiden, beserta **id insidennya** — supaya yang dinilai bisa membantah dengan menunjuk baris, bukan berdebat soal ingatan. Terbukti di layar: *"Toko Bangunan Maju Jaya — evaluasi menulis 0, tercatat 1 kecelakaan · subkon yang seharusnya gugur tetap dipakai"*. **`nyaris_celaka` TIDAK menggugurkan dan ditampilkan NETRAL, bukan merah**: kalau ia ikut menggugurkan, tak akan ada yang melaporkannya lagi — dan satu kecelakaan berat biasanya didahului puluhan nyaris celaka yang tak dilaporkan karena "tidak ada apa-apa". Angka nyaris celaka yang NAIK adalah kabar baik. TRIR (per 200.000 jam, baku OSHA) `null` bila jam kerja belum didata — bukan 0, karena 0 berarti "tak ada insiden". Insiden `ditutup` wajib bertindakan korektif ≥10 huruf: yang ditutup tanpa perbaikan hanya menunggu terulang. Tanggal di masa depan ditolak trigger — angka itu masuk ke rekap yang menggugurkan orang. Dibuka untuk **mandor**: yang mengalami insiden adalah orang di lapangan, dan melapor tak boleh menuntut kewenangan administratif |
| Job Safety Analysis | ✅ | Migrasi 293 · `jsa` + `jsa_langkah` · `/k3/jsa`. **Tabel sendiri meski `izin_kerja.pengendalian_risiko` sudah ada** (4/4 baris terisi): izin menjawab pengendalian untuk PEKERJAAN INI hari ini; JSA menjawab analisa untuk JENIS pekerjaan yang **dipakai ulang**. JSA yang ditulis ulang tiap izin akan berbeda-beda tiap kali — dan yang berbeda-beda itu justru pengendalian yang menyelamatkan orang. `izin_kerja.jsa_id` menautkan keduanya; **`insiden_k3.jsa_id` adalah jalan pelajaran insiden MASUK KEMBALI**, berlaku untuk semua izin berikutnya. Skor kolom TERHITUNG, skala 1–5 **sama dengan register risiko** (dua skala untuk hal yang sama membuat orang salah ingat, dan yang salah ingat adalah angka keselamatan). Langkah tanpa pengendalian ditolak constraint: itu daftar bahaya, bukan analisa. Yang ditandai **bukan** bahaya berskor tinggi — hampir semua pekerjaan konstruksi punya itu — melainkan langkah yang MASIH tinggi SESUDAH pengendalian |
| Inspeksi K3 | ✅ | Migrasi 293 · `inspeksi_k3` + `temuan_k3` · `/k3`. Yang membuatnya berguna bukan daftar temuannya melainkan **PENGULANGANNYA**: tiga kali "APD tak dipakai di area las" adalah SATU masalah yang tak pernah selesai, bukan tiga temuan yang masing-masing ditutup — dan daftar yang memperlakukannya sebagai tiga baris terpisah menyembunyikan bahwa perbaikannya tak bekerja. Kategori dinormalkan huruf kecil; temuan tanpa kategori TIDAK dipaksa dibandingkan lewat teks uraian (itu akan menyatukan "APD tak dipakai" dengan "APD rusak") |
| Induksi & pelatihan K3 | ✅ | Migrasi 293 · `induksi_k3` · TAB di `/k3`. Persentase dihitung terhadap pekerja **PROYEK INI** (`mandor_assignments.mandor_id` → `workers.mandor_id`), bukan seluruh pekerja perusahaan. Cacat itu terlihat di LAYAR sebagai *"3 dari 60 pekerja · 5%"* untuk proyek berpekerja 30 — dan komentar di kodenya sendiri sudah menyatakan niat yang benar sementara kodenya melakukan sebaliknya. Angka yang menuduh proyek baik-baik saja membuat orang berhenti mempercayai seluruh kartunya. Nol pekerja terdata menjawab `null`, BUKAN 0% |
| Alat pelindung diri | ✅ | Migrasi 293 · `apd_serah_terima` · TAB di `/k3`. Menyimpan `ganti_sebelum`: helm punya masa pakai, harness wajib diperiksa berkala — **APD kedaluwarsa memberi rasa aman TANPA melindungi**, dan itu lebih berbahaya daripada tak punya APD sama sekali |
| Pengelolaan lingkungan | ✅ | Migrasi 293 · `pemantauan_lingkungan` · TAB di `/k3`. Baku mutu **disimpan bersama hasilnya**: baku mutu berubah lewat peraturan, dan hasil lama harus tetap terbaca dengan baku yang berlaku saat itu. Satuan WAJIB (constraint) — "55" bisa berarti aman atau tiga kali ambang. Pengukuran tanpa baku mutu menjawab `null` dan dihitung TERPISAH sebagai "belum bisa dinilai", bukan diam-diam masuk hitungan aman |
| RK3K | 🟢 | `/k3/rk3k` + `GET /proyek/:id/k3/rk3k.pdf` (2026-08-17, migrasi 451). **Penundaannya dicabut karena syaratnya terpenuhi** — catatan lama menulis syarat itu sendiri: RK3K adalah RANGKUMAN dari keenam di atas, dan menyusunnya sebelum isinya ada menghasilkan template kosong yang diisi asal supaya tender lolos. Isinya sudah ada (jsa 3 · inspeksi 3 · induksi 25 · APD 5 · insiden 6), jadi yang dibangun BUKAN formulir: layarnya tak punya satu pun medan isian, ia MEMBACA kelima sumber dan menyatakan mana yang kosong. Cetak PDF-nya tetap terbit walau ada bagian kosong — menguncinya mendorong orang menyusunnya di Word, di luar jangkauan aplikasi ini; bagian kosong tercetak "BELUM ADA CATATAN" plus pernyataan cakupan. |

**Belum:** statistik keselamatan lintas proyek, papan skor K3 per mandor, dan
integrasi pelaporan Disnaker untuk insiden fatal.

---

## 12. HR & PAYROLL

| Menu | Status | Catatan |
|---|---|---|
| Master karyawan & struktur organisasi | 🟡 | `users` saja |
| Rekrutmen & onboarding | 🟡 | **G2e 2026-08-11** — migrasi 290 `lamaran_kerja`, tab di `/sdm/kompetensi`. **Sengaja TIDAK ATS penuh**: pencatat lamaran + tahapnya saja, karena bentuk alur seleksi bergantung cara kerja yang belum ada (kanal lamaran, tahap wawancara berjenjang) — menebaknya untuk perusahaan yang belum pernah merekrut lewat sistem berarti membangun yang pasti dibongkar. Tahap boleh melompat maju tapi TAK BISA mundur (mundur menghapus jejak bahwa pelamar pernah sampai sejauh itu); `diterima` WAJIB tersambung ke pegawainya. Mutasi membuktikan penjaga "dari diterima/ditolak" tak pernah diuji — yang lolos justru `diterima → ditolak`, yang meninggalkan lamaran ditolak tersambung ke pegawai aktif. **Tetap 🟡**: onboarding (checklist hari pertama, serah terima aset) belum ada — itu menunggu perekrutan pertama lewat sistem ini. |
| Absensi & timesheet | ✅ | **G2b SELESAI 2026-08-11** — migrasi 286 `pegawai` + `timesheet_staf`, `lib/timesheet-staf.ts` (21 test, 12 mutasi MERAH), 5 endpoint (17 test Postgres nyata, 8 mutasi MERAH), halaman `/sdm/timesheet`. **Bukan menyusul pola `absensi_harian`** — catatan lama keliru di situ: staf kantor digaji BULANAN TETAP, jadi jamnya tak menentukan gajinya melainkan menentukan biaya overhead yang dibebankan ke tiap proyek. Lembur diisi SENDIRI, tak diturunkan dari selisih jam standar (lembur harus diperintahkan; lembur hari libur tetap penuh meski total di bawah standar). Hari tanpa baris = BELUM DIISI, bukan nol jam; akhir pekan tak ikut diperingatkan. Satu baris per hari — mengisi ulang MEMPERBARUI, dibuktikan dari layar 7 baris tetap 7. Melahirkan penjaga baru `audit-rute-terkunci.mjs`: `nav-yatim` hijau sementara halamannya ditolak middleware (redirect diam-diam, nol pesan galat). |
| Cuti & izin | ✅ | **G2d SELESAI 2026-08-11** — migrasi 288 `cuti_hak` + `cuti_ambil` + 289 (rantai approval), `lib/cuti-karyawan.ts` (24 test, 14 mutasi MERAH), 5 endpoint (23 test Postgres nyata, 15 mutasi MERAH), halaman `/sdm/cuti`. **Catatan lama benar**: saldo DIHITUNG dari transaksi (SUM hak − SUM ambil disetujui), tak pernah disimpan — kolom `sisa_cuti` menyimpang diam-diam dari riwayatnya, dan yang paling berkepentingan angkanya benar (karyawan) tak punya cara memeriksa. Sebaliknya **`jumlah_hari` DISIMPAN** saat diajukan: kalender libur bisa berubah (cuti bersama diumumkan di tengah tahun), dan cuti yang sudah disetujui tak boleh tiba-tiba memakan jatah berbeda — dibuktikan test dengan menambah libur baru di tengah rentang yang sudah diajukan. Akhir pekan & libur nasional tak memotong jatah; libur ber-`tetap_bekerja` TETAP memotong. Hanya jenis `tahunan` memakai jatah — memotong cuti sakit dari jatah berarti karyawan yang sakit kehilangan liburannya (mutasi membuktikan test menangkapnya). Sisa boleh NEGATIF, tak dipotong ke nol. Koreksi jatah = baris NEGATIF, bukan edit baris lama. Persetujuan lewat MESIN approval (`cuti_karyawan` masuk `ApprovalEntityType` + inbox terpusat dengan tenancy `C-pegawai` baru); PENOLAKAN sengaja tak menuntut rantai — pengajuan yang jelas salah tak boleh menggantung menunggu level berikutnya. |
| **Payroll staf** | ✅ | **G2c SELESAI 2026-08-11** — migrasi 287 `payroll_periode` + `slip_gaji` + `slip_komponen`, `lib/payroll-staf.ts` (22 test, 11 mutasi MERAH), 5 endpoint (18 test Postgres nyata, 10 mutasi MERAH), halaman `/sdm/payroll`. **Slip MENYIMPAN hasilnya** — dibuktikan test: ubah tarif drastis sesudah slip dibuat, angka tersimpan TETAP SAMA. Slip yang sudah dibayarkan adalah pernyataan tentang uang yang SUDAH berpindah; menghitungnya ulang membuat angka di layar tak cocok dengan angka di rekening, dan penerimanya tak punya cara membuktikan mana yang benar. ID periode tarif ikut disimpan supaya bisa DITUNJUK saat dipertanyakan, bukan sekadar "5% menurut sistem". Periode DIKUNCI beku total — trigger dua sisi menolak ubah/hapus slip DAN ubah/tambah/hapus komponen, terbukti lewat SQL langsung. PPh 21 dari BRUTO (TER sudah mengandung PTKP; mengurangkannya lagi menghitung dua kali — mutasi membuktikan test menangkapnya). BPJS bagian perusahaan masuk `informasi`, TIDAK mengurangi yang diterima. Masa pajak DESEMBER dilaporkan sebagai penghalang, tak ditebak. **Cacat ditemukan dari layar**: periode tarif ada tapi barisnya kosong membuat `tarif_*_id` terisi, pemeriksaan lolos, dan periode nyaris dikunci dengan potongan Rp 0 untuk semua orang — ditutup penjaga `slip-nol-potongan` yang memeriksa HASIL, bukan keberadaan periode. |
| Upah harian mandor/tukang | ✅ | |
| Potongan statutori (BPJS) | 🟡 | **G2a SELESAI 2026-08-11** — migrasi 284 `tarif_payroll_periode` + `tarif_payroll_baris`, `lib/tarif-payroll.ts` (28 test, 14 mutasi MERAH), 4 endpoint (15 test Postgres nyata, 6 mutasi MERAH), halaman `/pengaturan/tarif-payroll`. Persentase iuran + batas upah (ceiling) jadi data ber-tanggal-berlaku. **Nol tarif ter-seed** — migrasi 284 GAGAL kalau ada yang menanam angka bawaan. Ceiling terbukti MENGGIGIT (iuran dihitung dari batas, bukan dari gaji penuh) dan pihak yang tak menanggung mengembalikan `null`, bukan 0. **Tetap 🟡**: perhitungan potongannya baru dipakai saat payroll staf (G2c) dibangun. |
| PPh 21 | 🟡 | **G2a SELESAI 2026-08-11** — PTKP + lapisan TER (PMK-168/2023) jadi data ber-tanggal-berlaku di halaman yang sama dengan BPJS; ketiganya satu keputusan. Batas bawah INKLUSIF, batas atas EKSKLUSIF — dua sisi inklusif membuat satu nilai penghasilan cocok di DUA lapisan dan yang menang bergantung urutan baris. Tarif yang tak ada mengembalikan `null`, BUKAN 0: nol adalah jawaban yang bisa salah dan tampak sah. **Tetap 🟡**: pemotongan sesungguhnya menyusul di G2c. |
| Sertifikasi & kompetensi | ✅ | **G2e SELESAI 2026-08-11** — migrasi 290 `sertifikat_pegawai`, `lib/kompetensi-sdm.ts` (33 test, 15 mutasi MERAH), 8 endpoint (28 test Postgres nyata, 14 mutasi MERAH), tab di `/sdm/kompetensi`. **Catatan lama tepat**: yang dibangun memang masa berlaku + pengingat kedaluwarsa. Pemicunya nyata — `prakualifikasi_vendor` 5 baris sudah hidup, dan sertifikat KEDALUWARSA tak boleh terhitung bukti kompetensi: melampirkannya ke penawaran adalah dokumen palsu di mata panitia, sementara yang menandatangani adalah direktur. `POST /sdm/periksa-syarat` memeriksa terhadap TANGGAL ACUAN, bukan hari ini — prakualifikasi bulan lalu diperiksa dengan keadaan bulan lalu. TIGA keadaan (berlaku · akan habis ≤60 hari · kedaluwarsa) karena tindakannya berbeda; menyamakan dua yang terakhir membuat peringatan menyala untuk yang masih sah, dan orang berhenti membacanya. Kolom `berjangka` memisahkan "seumur hidup" dari "berjangka tapi tanggalnya lupa diisi" — tanpa itu, SKA tanpa tanggal terbaca "berlaku selamanya". Batas kedaluwarsa `< 0` bukan `<= 0`: sertifikat habis pada AKHIR hari itu, dan `<=` menolaknya sehari lebih cepat. |
| Penilaian kinerja | ✅ | **G2e SELESAI 2026-08-11** — migrasi 290 `penilaian_kinerja`, tab di `/sdm/kompetensi` (satu route = satu link, aturan 232). Dibangun untuk MENCATAT, bukan menghitung skor gabungan: formula pembobotan adalah kebijakan yang belum diputuskan founder, dan menebaknya berarti membangun yang pasti dibongkar. Skala DISIMPAN bersama skornya — skala berubah antar-periode (1–5 lalu 1–100), dan skor 4 tanpa skalanya bisa berarti bagus atau buruk; ringkasan menormalkan ke persen supaya sebanding, tapi angka mentahnya tetap terlihat agar cocok dengan lembar penilaian di kertas. Rata-rata `null` saat nol final, BUKAN 0 (nol berarti "dinilai buruk"). Yang FINAL tak bisa diubah — penilaian yang sudah disampaikan adalah dasar keputusan tentang orang. Ada kolom `tanggapan_pegawai`: penilaian tanpa hak jawab adalah vonis. |
| Klaim perjalanan & reimburse | 🟡 | Via `project_expenses` |

**Portal PM (mobile, `pm-portal/*`)** — ditambahkan Task 39, Tahap 7 Portal
PM Lengkap (2026-08-22): Timesheet + Cuti + Kompetensi/Rekrutmen/Penilaian
Kinerja READ-ONLY-sebagian tersedia di `pm-portal/sdm/*` (PM punya
`sdm:timesheet:manage`+`sdm:cuti:manage` untuk data SENDIRI, tapi HANYA
`sdm:sertifikat:view`+`sdm:rekrutmen:view` — read-only penuh untuk
Kompetensi, dan PM sama sekali TIDAK PUNYA `sdm:kinerja:manage`, bukan cuma
view-only). Master karyawan, Payroll staf, dan tarif statutori (BPJS/PPh21)
TIDAK direplikasi ke portal — di luar scope §1 spec Portal PM Lengkap
(administrasi, bukan kerja proyek harian PM).

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

**Portal PM (mobile, `pm-portal/*`)** — ditambahkan Task 40, Tahap 7 Portal
PM Lengkap (2026-08-22): `pm-portal/aset` + `pm-portal/aset/[id]` — Register,
Mutasi antar-proyek, Sewa, Operasional, DAN tombol "Jurnalkan Penyusutan"
(PM punya `assets:manage` PENUH + keempat kunci `gl:*`, diverifikasi LIVE ke
`role_permissions`). Tab Penyusutan di detail aset sengaja INFORMASI SAJA
tanpa tombol catat/jurnalkan dari tab itu — mencatat baris penyusutan tanpa
menjurnalkannya membuat neraca dan register aset saling menyimpang.

---

## 14. KEUANGAN & AKUNTANSI

| Menu | Status | Catatan |
|---|---|---|
| **General Ledger + COA** | ✅ | **Koreksi dari 🔵 (2026-08-12)** — status "belum di-apply, 0 kode" sudah BASI. Diukur: `accounts` 38 baris (bagan lengkap aset→beban), `routes/v1/gl.ts` 10 endpoint, `/akuntansi` + `components/buku-besar.tsx` + `neraca-laba-rugi.tsx`, dan **48 test** (`gl-api` · `gl-invarian` · `gl-coa-seed`). Enam trigger invariant sudah terpasang: `trg_gl_wajib_seimbang` (debit=kredit saat posting), `trg_gl_posted_immutable`, `trg_gl_baris_posted_immutable`, `trg_gl_akun_satu_company`, plus constraint `jel_debit_xor_credit` & `jel_tak_negatif`. Keputusan lama "in-app vs eksternal" sudah terjawab oleh kenyataan: yang in-app sudah dibangun dan berjalan |
| Jurnal umum | ✅ | `journal_entries` + `journal_entry_lines` · `POST/GET /gl/journal-entries` · post & void. Draft boleh tak seimbang (memang keadaan setengah jadi); yang di-**posting** wajib seimbang DAN punya baris — jurnal kosong yang "berhasil" diposting adalah kelas cacat "berhasil tanpa melakukan apa-apa". `source`/`ref_type`/`ref_id` sudah ada di skema, menunggu penjurnalan otomatis (lihat baris Tutup buku) |
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
| Tutup buku periode | ✅ | **G5 SELESAI 2026-08-12** — migrasi 294–296 · `periode_akuntansi` + `periode_akuntansi_riwayat` · `lib/tutup-buku.ts` (37 test, 24 mutasi MERAH) · 6 endpoint (31 test Postgres nyata) · `/akuntansi/periode`. ⚠️ **EMBER [C]**: penguncian ditegakkan **TRIGGER di basis**, bukan pemeriksaan rute — skrip impor, migrasi data, dan perbaikan manual lewat SQL pun ditolak; test membuktikannya lewat SQL LANGSUNG, bukan lewat rute. Yang dikunci `entry_date` **bukan** `created_at`: jurnal yang dibuat hari ini untuk transaksi bulan lalu justru itulah yang dijaga. Draft dibiarkan (belum masuk laporan mana pun; menahannya hanya menghalangi orang menyiapkan koreksi). Periode tak boleh tumpang tindih — `EXCLUDE USING gist`, bukan pemeriksaan aplikasi yang bisa dilewati dua permintaan bersamaan. Membuka kembali **DIIZINKAN** dengan alasan ≥20 huruf, tercatat permanen di riwayat append-only: larangan mutlak justru mendorong orang mengubah basis lewat SQL langsung, yang tak berjejak sama sekali. Satu-satunya PENGHALANG penutupan: periode sebelumnya yang masih terbuka (saldo awalnya diambil dari sana). Draft & periode kosong hanya peringatan — memaksanya jadi penghalang membuat orang MENGHAPUS draft asal periodenya bisa ditutup |
| **Penjurnalan otomatis** (invoice/pembayaran → GL) | ✅ | **R-012 SELESAI 2026-08-12** — migrasi 297–300 · `peta_akun_jurnal` + akun `2131 PPN Keluaran` & `5950 Beban PPh Final` · `lib/penjurnalan-otomatis.ts` (39 test, 23/24 mutasi MERAH) · `routes/v1/penjurnalan-otomatis.ts` (22 test Postgres nyata, 15/15 mutasi MERAH) · `/akuntansi/peta-akun` + `/akuntansi/jurnalkan`. **Keempat pertanyaan yang dulu tercatat "tak boleh saya tebak" SUDAH DIJAWAB** — dan pemeriksaannya menunjukkan tiga di antaranya sebenarnya "belum saya cari", bukan "tak boleh ditebak": (1) akrual PSAK 72, dasar yang SAMA dengan `lib/wip-psak.ts` yang sudah berjalan — memilih basis kas membuat dua laporan bercerita berbeda tentang bulan yang sama; (2) retensi → `1124` **aset**, karena pekerjaannya selesai dan pendapatannya diakui penuh, yang tertunda adalah hak menagih; (3) uang muka → `2150` **liabilitas** kontrak, mencatatnya sebagai pendapatan membuat laba melonjak lalu rugi saat dikerjakan; (4) pertanyaan PPN **salah sasaran** — diukur 16/16 proyek `pph_final`, dan bedanya PPh final = BEBAN vs PPN = UTANG titipan. **Nol baris ter-seed**: migrasi 297 GAGAL bila ada satu baris pun tertanam — peta akun menentukan bentuk seluruh laporan keuangan, dan bawaan yang terisi sendiri tak pernah ditanyakan siapa pun karena hasilnya terlihat wajar. Layar MENAWARKAN usulan beserta dasar PSAK-nya; founder yang menekan simpan. Jurnal dibuat **draft** (tafsir bisa salah; draft menangkap peta keliru sebelum masuk neraca). Satu invoice = satu jurnal, dijaga `uq_jurnal_satu_per_rujukan` di BASIS bukan aplikasi: dua permintaan bersamaan lolos pemeriksaan aplikasi, dan jurnal gandanya **tetap seimbang** sehingga tak ada invariant pembukuan yang menangkapnya. **Yang tetap manual**: penyusutan, koreksi audit, jurnal penutup — otomatisasi berhenti di tempat yang jawabannya tunggal |
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

**Portal PM (mobile, `pm-portal/*`)** — ditambahkan Task 42/45, Tahap 7
Portal PM Lengkap (2026-08-22): `pm-portal/dokumen-kendali` — lima tab
(Gambar, Transmittal, Tindakan, Tanda Tangan, Distribusi). Tab Tindakan
READ-ONLY (nol endpoint PATCH/POST untuk `notulen_tindakan` di seluruh
`kendali-dokumen.ts` — tak ada tombol "Selesaikan" yang bisa dibangun
jujur). Tab Distribusi (ditambahkan Task 45, sebelumnya utang Task 44)
juga READ-ONLY — nol endpoint tulis untuk `matriks_distribusi`.
⚠️ **Keterbatasan backend belum diperbaiki** (di luar scope frontend-only
plan ini): endpoint `GET /kendali-dokumen` tidak menyaring `tindakan` dan
`tandaTangan` ke `project_id` yang dipilih — keduanya selalu mengembalikan
data SELURUH tenant. Dicatat sebagai temuan Task 45 di `JOURNAL.md`.

---

## 17. RISIKO & KEPATUHAN

**Diperbarui 2026-08-12 (G3).** Baris "Semua 🔴 — terkonfirmasi" sudah BASI:
empat dari lima item hidup, dan salah satunya ternyata sudah hidup sejak
migrasi 218 tanpa pernah dicatat di sini.

> **Yang paling penting dari kelompok ini bukan apa yang dibangun, melainkan
> apa yang TIDAK dibangun.** Diukur ke basis sebelum menulis kode: tiga dari
> lima item ternyata bukan lahan kosong. Membangun ulang yang sudah ada adalah
> cara paling mahal untuk terlihat produktif.

| Menu | Status | Catatan |
|---|---|---|
| Register risiko | ✅ | Migrasi 291 · `risiko_proyek` · `lib/risiko-proyek.ts` (56 test, 27 mutasi MERAH) · `/risiko`. **`skor` kolom TERHITUNG** (`dampak * kemungkinan`) — tak bisa diketik, jadi tak bisa menyimpang dari faktornya; migrasi memverifikasi `is_generated = 'ALWAYS'` supaya penurunannya jadi kolom biasa tak lolos senyap. Skor SESUDAH mitigasi disimpan TERPISAH: menimpanya menghapus bukti bahwa mitigasinya berguna, padahal itu pertanyaan pertama saat risikonya terjadi. Constraint menolak skor sisa yang MELEBIHI skor awal — mitigasi yang menaikkan risiko adalah salah input, dan angka itu yang dibawa ke rapat sebagai "sudah kami tangani". Menutup risiko wajib beralasan ≥10 huruf: tanpa itu, "kami memutuskan menerimanya" tak bisa dibedakan dari "kami lupa", dan keduanya terlihat sama — barisnya tidak ada. Yang ditandai merah **bukan yang skornya tinggi** melainkan yang menuntut tindakan; alasannya ditulis di barisnya, bukan disembunyikan di balik klik |
| Rencana mitigasi | ✅ | Migrasi 291 · `tindakan_mitigasi` · **TAB di `/risiko`**, bukan halaman sendiri. Sebagai TABEL memang terpisah (satu risiko banyak tindakan); sebagai HALAMAN tidak boleh — mitigasi tanpa risikonya adalah daftar tugas tanpa alasan, dan itu hal pertama yang diabaikan orang. Tiap tindakan menyebut risiko yang dijawabnya beserta skornya. Tenancy lewat `risiko_id`, BUKAN `project_id` — salah argumen `viaProject` mengembalikan nol baris tanpa galat, dan halamannya terlihat seperti risiko yang memang belum punya mitigasi (diuji khusus) |
| Perizinan (IMB/PBG, lingkungan) | ✅ | Migrasi 291 · `izin_proyek` · `/risiko/izin`. **Tabel sendiri, bukan menumpang `dokumen_kepatuhan`**: yang itu menjawab *"PIHAK ini boleh bekerja?"* (kunci `supplier_id`), yang ini *"PEKERJAAN ini boleh dimulai?"* (kunci `project_id`) — menumpangkannya menuntut aturan "kalau jenisnya imb maka supplier_id NULL" yang tak bisa dijaga constraint dan hanya hidup di kepala penulisnya. Dinilai terhadap **rentang proyek**, bukan hari ini: izin yang habis sebelum proyek selesai sudah bermasalah SEKARANG, karena perpanjangan PBG makan waktu berminggu-minggu. Enam keadaan — `dicabut` dipisah dari `ditolak` justru karena lebih berbahaya: pekerjaan mungkin sudah berjalan atas dasarnya. **Nol izin tercatat menjawab `null`, bukan "boleh jalan"** (pelajaran sama dengan ITP kosong, G1e) |
| Kepatuhan regulasi | ✅ | **SUDAH ADA sejak migrasi 218** (`dokumen_kepatuhan`, 9 baris) — diukur 2026-08-12 dan TIDAK dibangun ulang. Halamannya `/kepatuhan?bagian=dokumen`, hidup lewat `kep-dokumen`. Menu `rk-kepatuhan` sengaja `is_active=false`: dua item aktif untuk satu route melanggar aturan 232. Register risiko menautkannya lewat `risiko_proyek.dokumen_kepatuhan_id`. **Baris ini pernah 🔴 selama berbulan-bulan padahal modulnya hidup** — persis cacat yang dijaga `audit-taksonomi-vs-kode.mjs` |
| Sengketa & klaim | ✅ | Migrasi 291 · `sengketa` · `/risiko/sengketa`. Dibangun sebagai **ESKALASI** dari `contract_claims` yang sudah ada (migrasi 184), bukan modul lepas: enum `claim_status` berakhir di `ditolak`/`gugur`, dan di situlah lubangnya — klaim yang ditolak tidak hilang, ia jadi sengketa. Modul lepas memaksa orang mengetik ulang nilai dan tanggalnya, dan **selisih angka antara dua dokumen milik sendiri adalah senjata pihak lawan**. Trigger DB menolak sengketa dari klaim yang MASIH DIPROSES — pada INSERT *dan* UPDATE (diuji keduanya). Tahap boleh melompat maju, tak boleh mundur; `selesai` terkunci. Dua angka dipisah sengaja: paparan berjalan, dan berapa yang **nilainya belum dicatat** — menghitung yang kedua sebagai nol adalah cara paling halus berbohong dengan angka yang benar |

**Belum:** analisis risiko kuantitatif (Monte Carlo), matriks risiko korporat
lintas proyek, dan sambungan register risiko → izin kerja K3 (`izin_kerja_id`
ada di skema, pemilihnya menunggu G4 karena JSA ↔ izin kerja akan mengubah
bentuknya — syarat pencabutan tertulis di `kolom-tersambung-lantai.json`).

**Portal PM (mobile, `pm-portal/*`)** — ditambahkan Task 41, Tahap 7 Portal
PM Lengkap (2026-08-22): `pm-portal/risiko` (Register Risiko + Mitigasi,
tabProyek) dan `pm-portal/klien`+`pm-portal/klien/[id]` (grup `g-master`,
key `md-klien`). Perizinan sudah tercakup sebelumnya di `pm-portal/risiko/
izin` (Task 8, Tahap 1). Klien READ-ONLY penuh — PM hanya `clients:view`,
endpoint tulis (`POST`/`PATCH`/`toggle-active`) bergerbang `clients:manage`
yang TIDAK DIMILIKI. Sengketa & Klaim (`rk-sengketa`) TIDAK dibangun ke
portal — PM TIDAK PUNYA `sengketa:view` ATAU `:manage` sama sekali.

---

## 18. PELAPORAN & BUSINESS INTELLIGENCE

| Menu | Status | Catatan |
|---|---|---|
| Dashboard eksekutif | ✅ | |
| Dashboard per proyek | 🟡 | Detail proyek sudah kaya; halaman KPI khusus belum |
| Laporan biaya | ✅ | |
| Laporan arus kas | ✅ | |
| KPI: CPI, SPI, margin, DSO, backlog | 🟡 | Koreksi dari 🔴: CPI/SPI ✅ per proyek; margin ✅; DSO/backlog 🔴 |
| Report builder | ✅ | **G6d SELESAI 2026-08-12** — `lib/laporan-susun.ts` (36 test, 15/15 mutasi MERAH) · `routes/v1/laporan-susun.ts` · migrasi 308 (izin `reports:susun`) & 309 (menu) · `/laporan/susun`. Peringatan lama **"membangun Excel di dalam ERP" DIPATUHI sebagai batas bentuk**: yang dibangun bukan layar tempat orang mengetik kondisi, melainkan pemilihan dari **sumber data terdaftar di kode**. Dua sebabnya — (1) kondisi yang diketik adalah teks yang berakhir di query, dan tiap penyaring hanyalah tebakan tentang apa yang berbahaya; (2) lebih halus dan lebih mahal, query bebas melewati `request.db` yang sadar-tenant, dan satu JOIN ke tabel tanpa `company_id` sudah cukup menarik data perusahaan lain — hasilnya terlihat seperti laporan yang wajar, nol galat, nol gejala. **TIGA lapis penjagaan**: tsc menolak tabel di luar peta tenancy (`tabel: TabelTerklasifikasi`, dan `.unsafe()` memang menuntut tipe itu — memaksanya lewat `as` membuat sumber yang lupa didaftarkan lolos diam-diam), `audit-sumber-laporan-nyata.mjs` mencocokkan tiap tabel & kolom dengan `information_schema` DAN memeriksa kolom penyaring tenant-nya (ambang NOL, terbukti MERAH pada 3 mutasi termasuk "invoices tenancy company"), lalu 36 test. Penjaga itu lahir dari cacat nyata: `project_expenses.amount` yang saya daftarkan tak ada — kolom karangan LOLOS seluruh pemeriksaan pustaka karena ia ada di daftar, lalu gagal di basis dengan pesan yang menunjuk query. **Dua gerbang izin**: `reports:susun` untuk fiturnya, izin milik tiap sumber untuk sumbernya. Saringan bernilai kosong DITOLAK (dibuktikan lewat UI nyata), batas maks 5.000 baris, `terpotong` dinyatakan, nilai enum diterjemahkan ke bahasa manusia di layar DAN di ekspor Excel — angka/tanggal dibiarkan mentah supaya kolomnya masih bisa dijumlah di Excel |
| Export Excel / PDF | ✅ | Keduanya ada (XLSX + `reports/export-pdf` + invoice PDF) |
| Distribusi laporan terjadwal | 🟡 | Migrasi 215 · `jadwal_distribusi_laporan` · `/dokumen/kendali`. Jadwal + deteksi **MACET** hidup: gagal 3× berturut ATAU telat >2× iramanya sendiri meski nol galat tercatat (proses penjadwal yang mati tak meninggalkan galat). Pengiriman surel otomatisnya sendiri belum dijalankan |

**Portal PM (mobile, `pm-portal/*`)** — ditambahkan Task 43, Tahap 7 Portal
PM Lengkap (2026-08-22): `pm-portal/laporan` (tab KPI Perusahaan + Arus Kas
periode) dan `pm-portal/laporan/susun` (Report Builder mobile, sumber &
gerbang izin sama dengan `/laporan/susun` web). `bi-eksekutif`/`bi-proyek`
TIDAK direplikasi (sudah ada sebagai halaman lain); `bi-terjadwal`
(`status: 'sebagian'`) di luar scope §1 spec (hanya modul `hidup`).

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
| API & integrasi | ✅ | **G6c SELESAI 2026-08-12** — migrasi 305 `api_key` + `api_key_pakai`, 306 (penghitung ATOMIK), 307 (menu) · `lib/api-key.ts` (37 test, 17/18 mutasi MERAH) · `plugins/api-key-auth.ts` · `routes/v1/api-key.ts` (24 test Postgres nyata, 11/11 mutasi MERAH) · `/pengaturan/api-key`. **Yang terukur sebelum dibangun:** nol tabel `api_key` di seluruh skema, dan satu-satunya jalan masuk adalah token Supabase Auth (`plugins/auth.ts:103`) — sesi MANUSIA. Tiap integrasi menuntut kredensial login seseorang ditaruh di sistem lain: kewenangan penuh, tak bisa dicabut tanpa mengunci orangnya, jejak tercatat sebagai perbuatan orang itu bukan mesin. `otomasi_alur.jalur_webhook` yang sudah ada berjalan ke arah SEBALIKNYA (Puraloka → n8n, 14 alur). Kunci di-**HASH satu arah** bukan dienkripsi — `lib/kredensial-sandi.ts` bisa dibalik, jadi memakainya berarti siapa pun yang memegang server bisa membaca kunci setiap pelanggan; konsekuensinya disengaja: nilai muncul SEKALI. SHA-256 bukan bcrypt karena kunci adalah 32 byte acak (KDF lambat melindungi dari serangan kamus yang tak berlaku, sementara biayanya dibayar tiap permintaan). Izin bawaan KOSONG · **tak ada wildcard** (`*` = izin bernama bintang; satu salah ketik tak boleh memberi akses penuh) · masa berlaku WAJIB maks 730 hari · hash BEKU lewat trigger · kunci dicabut tak bisa dihidupkan lagi · header `X-API-Key` bukan `Authorization` · middleware jalur TERPISAH (menambah cabang di `authenticate()` membuat setiap rute diam-diam ikut menerima API key) |
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
