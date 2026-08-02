# 09 — VISI & GAP ANALYSIS

---

# BAGIAN 9 — VISI MENURUT AUDITOR

*Ditulis dari pembacaan repo, sebelum membaca pernyataan visi pemilik.*

## 9.1 Visi yang saya simpulkan

Puraloka Suite adalah **ERP kontraktor Indonesia** yang sedang bertransformasi dari
"aplikasi internal satu perusahaan" menjadi **produk SaaS multi-tenant**. Ambisinya
bukan sekadar mencatat proyek, melainkan menjadi **tulang punggung operasional +
akuntansi** kontraktor: dari estimasi (AHSP/CECEP) → RAB/RAP → pengadaan → lapangan →
penagihan → **buku besar**.

Yang membuat saya yakin ini serius, bukan proyek hobi:
- Ia membangun **mesin estimasi berbasis AHSP/SNI sendiri** dengan uji angka eksak
  (`HSP=278300`) dan golden file RAB nyata Rp 3,63 M.
- Ia menaruh **GL/jurnal in-app** (migrasi 167–174) alih-alih menyerah ke akuntansi eksternal.
- Ia punya **CECEP** — cost code registry, WBS/CBS, produktivitas, lessons-learned,
  root cause analysis — yang bukan fitur ERP umum, melainkan **rekayasa nilai konstruksi**.

## 9.2 Untuk siapa

Bertingkat, dan tercermin di kode sebagai portal terpisah:
- **Pemilik/direktur** — dashboard, EVM, laporan konsolidasi
- **PM/admin kantor** — proyek, pengadaan, keuangan, approval berjenjang
- **Mandor (lapangan)** — portal sendiri + mobile Expo: progress, kasbon, rekapitulasi
- **Klien** — portal read-only dengan transparansi **kecuali data kas** (keputusan sadar)
- **Supplier** — tersentuh lewat procurement/WA deep-link, belum jadi portal

## 9.3 Sumber kesimpulan

`docs/KEPUTUSAN-SCOPE-ERP-AI.md` (paling menentukan), `ADR-011-multi-tenant-strategy.md`,
`docs/ERP_MASTER_PLAN.md`, `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md`, `STATUS.md`,
`db/migrations/167_gl_chart_of_accounts.sql` (bagian "Kenapa sekarang"), dan struktur
`apps/web/app/(dashboard)` + `portal` + `mandor-portal`.

## 9.4 Yang TIDAK jelas dari repo

1. **Model bisnis SaaS** — harga, paket, unit billing (per proyek? per user? per PT?)
   tak disebut di mana pun. Tak ada tabel `subscriptions`/`plans`.
2. **Siapa pelanggan pertama** — ADR-011 menyebut "calon pelanggan konkret sudah ada",
   tapi profil, ukuran, dan kebutuhannya tak terdokumentasi.
3. **Bentuk AI yang dimaksud** — "berbasis AI" dinyatakan sebagai tujuan, tapi
   **nol baris kode AI, nol dependency** (dinyatakan `STATUS.md` sendiri).
4. **Definisi "selesai"** — 134 item roadmap, 119 sub-menu, 93 belum punya rancangan.
   Tak ada kriteria kapan produk layak dijual.
5. **Strategi mobile** — Expo baru "Fase 1"; apakah lapangan wajib mobile atau cukup web
   responsif, tak diputuskan.
6. **Operasional produksi** — nol dokumen soal backup, DR, SLA, on-call, monitoring.

---

# BAGIAN 10 — GAP ANALYSIS TERHADAP VISI PEMILIK

Visi pemilik: **ERP konstruksi SaaS multi-tenant**, lengkap & matang, **terintegrasi AI**,
**UI/UX immersive**, dengan fitur yang bahkan tak dimiliki ERP besar, mendukung teknik
sipil/arsitektur/konstruksi + operasional kantor.

**Verdict awal: visi ini konsisten dengan arah repo, dan sebagian pondasinya sudah nyata
terpasang.** Yang membedakan proyek ini dari kebanyakan "mimpi SaaS": ADR-011 sudah
ACCEPTED, `companies` sudah ada, 42 tabel sudah ber-`company_id`, dan 157/164 rute sudah
bergerbang tenant. Ini bukan nol.

## 10.1 Multi-tenant readiness

### Yang SUDAH ada (terverifikasi)

| Bukti | Nilai |
|---|---|
| Tabel `companies` | EXISTS, 1 baris (gerbang "tepat satu company" dipatuhi) |
| Tabel `company_members` | EXISTS — model D5 "1 email = 1 akun + keanggotaan" |
| Tabel ber-`company_id` | **42 / 122** |
| Policy RLS | **375**, RLS aktif 122/122 |
| Rute bergerbang tenant | **157 / 164** (ratchet CI = 7) |
| Helper tenancy | 19 fungsi (`proyekMilikTenant`, `tolakRoleTenantLain`, dll.) |
| Test tenancy | `multitenant-core`, `tenant-isolation-nyata`, `t5a-policy-tenant`, `t7-company-switcher`, `t10-peran-per-company`, `search-tenant-isolation` — semua lulus |
| Per-company | `company_menu_settings`, `company_settings`, `financial_config`, `document_number_series`, `project_price_override` |

**Model yang dipilih: discriminator column (`company_id`) + RLS**, bukan schema-per-tenant.
Untuk PostgreSQL/Supabase dengan ratusan tenant, ini **pilihan yang benar** — schema-per-tenant
meledak di jumlah objek katalog dan mimpi buruk saat migrasi.

### Yang BELUM (gap nyata)

| Gap | Bukti | Bobot |
|---|---|---|
| **80 tabel tanpa `company_id`** | 42/122 | **L–XL** — perlu klasifikasi: mana global (AHSP nasional, `units`, `permissions`), mana turunan (aman lewat parent), mana yang benar-benar bocor |
| **53 role literal** | `cash.ts:511`, `kasbons.ts:135`, dll. | **L** — bahaya spesifik yang STATUS.md sendiri catat: role global `admin` membawa 95 permission ke company tempat orangnya hanya `mandor` |
| **`authenticate()` masih global** | STATUS.md rev-19 | **M** — `auth_role()` sudah per-company sejak migrasi 144, API belum sejajar |
| **7 rute tanpa gerbang** | audit-gerbang-tenancy | **S** — terutama `POST /mandor/kasbon-photo/upload` (menulis) |
| **Billing/subscription** | nol tabel | **L** — tak ada `plans`, `subscriptions`, `invoices_saas`, metering |
| **Onboarding tenant** | nol alur | **M** — provisioning company + admin pertama + seed CoA |
| **Storage per-tenant** | bucket global | **M** — path/policy belum tenant-scoped (`BELUM DIVERIFIKASI`) |
| **1.039 hex ter-hardcode** | 60 file | **L** — white-label mustahil |

### Titik tanpa jalan kembali

1. **`company_id` pada 80 tabel sisa** — biaya naik **linear terhadap volume data**, dan
   ADR-011 mencatat alasannya: begitu ledger berisi jurnal dua entitas, backfill **tidak
   lagi lossless**. `journal_entries` **kini 0 baris** → ini **jendela termurah yang akan
   pernah ada**, dan jendela itu sedang menutup.
2. **Role global → role per-company** — begitu tenant kedua lahir dengan role global,
   memisahkannya berarti menebak niat historis.
3. **Penomoran dokumen** (`document_number_series`) — sudah per-company ✅ (migrasi t6).
4. **Warna ter-hardcode** — tiap halaman baru menambah utang.

**Gerbang founder yang sudah benar:** "tenant kedua TIDAK BOLEH dibuat di produksi
sebelum Tahap 4 & 5 selesai". Pertahankan mati-matian.

## 10.2 Group/holding — beda dari multi-tenant biasa

Satu owner, banyak PT **bukan** sekadar N tenant terpisah. Bedanya:

| Aspek | SaaS multi-tenant biasa | Group/holding |
|---|---|---|
| Isolasi | Mutlak — tenant A tak boleh tahu B ada | **Sengaja bocor terkontrol** — owner ingin lihat A+B sekaligus |
| Laporan | Per tenant | **Konsolidasi** + eliminasi transaksi antar-PT |
| Permission | Per tenant | **Lintas-tenant untuk peran tertentu** (owner/direktur grup) |
| CoA | Independen | **Bagan akun induk** + pemetaan per PT agar konsolidasi bermakna |
| Sumber daya | Tak berpindah | Alat berat/mandor **dipinjamkan antar-PT** → butuh transfer pricing |

Implikasi konkret yang **belum ada di repo**: konsep `group_id` di atas `company_id`,
laporan konsolidasi, dan eliminasi antar-perusahaan. `company_members` menangani
"satu orang banyak company", tapi belum "satu grup banyak company".

**Ini keputusan arsitektur yang harus diambil SEBELUM CoA per-company diisi banyak tenant** —
karena konsolidasi menuntut pemetaan akun yang lebih mudah dirancang di depan.

## 10.3 AI — di mana benar-benar bernilai

Kondisi: **nol baris AI, nol dependency** (STATUS.md). Gerbangnya kualitas data.

**Prasyarat yang SUDAH ada** (lebih baik dari dugaan):
- `audit_logs` + 192 trigger → jejak keputusan
- `lessons_learned_records`, `root_cause_analyses`, `lesson_propagation_proposals` →
  **struktur pembelajaran organisasi sudah dimodelkan**
- `productivity_records`, `price_book_entries`, `ahsp_editions` → data historis berlabel
- `cost_codes` (44) + WBS/CBS → **taksonomi** yang membuat RAG bermakna

**Prasyarat yang BELUM ada:** vector store/embedding, event log terpadu, dan yang
terpenting — **volume data historis nyata** (journal 0 baris, submittals 0 baris).

**Yang bisa dikerjakan sekarang tanpa refactor besar:**
1. **Ekstraksi dokumen** — OCR nota/invoice supplier → draft `project_expenses`. Tak butuh data historis.
2. **NL → query laporan** — "berapa serapan Cibuluh bulan lalu" di atas skema yang sudah rapi.
3. **Pencocokan item RAB ke AHSP** — embedding atas 2.620 assembly nasional; data sudah ada.
4. **Ringkasan progress harian** dari `progress_logs` + foto.

**Yang harus menunggu data:** prediksi cost overrun, deteksi anomali harga, estimasi
durasi berbasis produktivitas historis. Urutan founder ("8 item roadmap dulu, baru AI")
**benar secara teknis** — dan alasan yang ditulis di STATUS.md ("AI di atas pembukuan yang
belum benar menjawab dengan percaya diri dan salah") adalah penilaian yang tepat.

## 10.4 Immersive UX — penghalang arsitektural

Lihat `07-FRONTEND-UX.md §7.6` untuk 10 butir konkret. Ringkas penghalang struktural:

1. **`useEffect` di 56/59 halaman** — tanpa React Query/SWR tak ada cache, dedup, atau
   optimistic update. Ini penghalang **nomor satu**; "immersive" mustahil dengan refetch penuh tiap navigasi.
2. **1.039 hex** — tak ada satu sumber kebenaran visual.
3. **Nol realtime** — Supabase Realtime tersedia tapi tak dipakai.
4. **Nol offline** — fatal untuk lapangan (sinyal buruk adalah norma di proyek konstruksi).
5. **Keyboard-first baru sebatas Ctrl+K.**

## 10.5 Kandidat fitur yang tak dimiliki ERP besar

Semua bertumpu pada data yang **sudah** ada di repo ini.

| # | Fitur | Masalah nyata | Kenapa ERP besar tak punya | Prasyarat | Sulit |
|---|---|---|---|---|---|
| 1 | **AHSP/SNI native + sumbu edisi** | Estimasi Indonesia wajib basis AHSP; ERP asing tak kenal | Regulasi lokal | `ahsp_editions` ✅ | — sudah ada |
| 2 | **Kasbon mandor & tukang** | Realitas kas lapangan Indonesia; tak ada padanan di SAP/Oracle | Praktik lokal informal | `kasbons` ✅ | — sudah ada |
| 3 | **Rekap PPh final 2% / PPN dua-field** | Pajak konstruksi ID punya rezim khusus | Lokal | `tax_records` ✅ | S |
| 4 | **Portal klien transparan-kecuali-kas** | Klien perorangan ingin lihat progres tanpa lihat margin | ERP besar all-or-nothing | ✅ ada | — sudah ada |
| 5 | **Lessons-learned + propagasi otomatis antar-proyek** | Pelajaran proyek A tak pernah sampai ke B | Butuh taksonomi cost code | `lesson_propagation_proposals` ✅ | M |
| 6 | **Produktivitas mandor → estimasi adaptif** | Koefisien AHSP nasional ≠ realita tim sendiri | ERP pakai koefisien statis | `productivity_records` ✅ | M |
| 7 | **Foto progress ber-geotag + verifikasi lokasi** | Klaim progres fiktif dari lapangan | Terlalu spesifik lapangan | `project_photos` + GPS | M |
| 8 | **Punch list + verifikasi terpisah dari perbaikan** | Yang memperbaiki tak boleh menyatakan sah | ERP samakan keduanya | `punch_items` ✅ + `punch:verify` ✅ | — sudah ada |
| 9 | **Rantai kontrak (owner→main→sub) satu layar** | Kontraktor ID berlapis; retensi/termin bertingkat | Model kontrak datar | `rantai-kontrak` route ✅ | M |
| 10 | **Rebar takeoff + profil baja** | Pembesian = biaya terbesar & paling salah hitung | Butuh domain sipil | `rebar_takeoff`, `steel_profiles` ✅ | M |
| 11 | **Absorption log manual per minggu** | Serapan lapangan tak selalu terekam sistem | ERP asumsikan semua transaksi digital | `rab_absorption_log` ✅ | — sudah ada |
| 12 | **WhatsApp sebagai antarmuka utama lapangan** | Mandor tak akan buka ERP; WA pasti dibuka | Kultural | WA Business API (gerbang biaya) | L |
| 13 | **Mode offline lapangan + sync konflik** | Sinyal buruk di lokasi proyek | ERP asumsikan konektivitas | Refactor data layer | XL |
| 14 | **Cuaca → klaim perpanjangan waktu (EOT)** | Hujan = dasar klaim EOT kontraktual | Butuh integrasi BMKG + model kontrak | `contract_eot` ✅ + API cuaca | M |
| 15 | **Opname stok bergulir + selisih otomatis** | Material hilang tak terdeteksi sampai proyek rugi | ERP punya, tapi berat | `stock_movements` ✅ | — sudah ada |
| 16 | **Transfer alat & mandor antar-PT dengan transfer pricing** | Grup usaha saling pinjam sumber daya | ERP anggap entitas terpisah | `group_id` (belum ada) | L |
| 17 | **Konsolidasi laporan lintas-PT + eliminasi** | Owner banyak PT butuh angka gabungan | Fitur enterprise mahal | `group_id` + pemetaan CoA | L |
| 18 | **Denda keterlambatan otomatis dari kontrak** | Sering tak ditagih karena lupa hitung | Butuh model kontrak lokal | `invoice_penalties` ✅ | — sudah ada |
| 19 | **Bid/tender → estimasi → RAP tanpa entri ulang** | Data tender diketik ulang saat menang | ERP pisahkan CRM & proyek | `bids` ✅ + `estimate_versions` ✅ | M |
| 20 | **Skenario estimasi (what-if) berversi** | Negosiasi butuh 3 varian harga cepat | ERP hanya satu angka resmi | `scenarios` ✅ | M |
| 21 | **Root cause analysis terhubung cost code** | "Rugi di mana" tak pernah terjawab sistematis | Terlalu spesifik | `root_cause_analyses` ✅ | M |
| 22 | **Buku besar dengan dimensi proyek native** | Akuntansi ID sering pisah dari proyek | ERP butuh modul PA mahal | `journal_entry_lines.project_id` ✅ | M |
| 23 | **Approval berjenjang yang dikonfigurasi UI** | Tiap perusahaan beda alur | ERP butuh konsultan | `approval_chains` ✅ | — sudah ada |
| 24 | **OCR nota supplier → jurnal draft** | Entri manual = sumber galat & keterlambatan | ERP besar punya, mahal | AI vision | M |
| 25 | **Harga acuan bersama + override per-PT** | Harga beda per daerah/entitas | ERP satu price list | `project_price_override` ✅ | — sudah ada |

**Catatan penting: 10 dari 25 kandidat sudah punya tabelnya.** Ini keunggulan struktural
nyata — pekerjaannya menghidupkan, bukan merancang dari nol.

## 10.6 Kontradiksi visi vs keputusan yang sudah diambil

Diminta jujur, jadi jujur:

1. **"Tak ada multi-currency" vs SaaS multi-perusahaan** — **masih masuk akal.**
   Semua kontraktor Indonesia bertransaksi Rupiah. Risiko nyata hanya bila menjual ke
   kontraktor yang mengerjakan proyek berpendanaan asing (ADB/World Bank) yang
   melaporkan USD. **Rendah, terima.**

2. **"Tak ada i18n" vs SaaS** — **masih masuk akal untuk pasar Indonesia**, TAPI ada
   risiko yang tak terlihat: seluruh kode, komentar, nama fungsi, dan pesan error
   berbahasa Indonesia (`proyekMilikTenant`, `tolakRoleTenantLain`). Ini **mempersempit
   kolam rekrutmen developer** dan menyulitkan kontribusi asing. Itu biaya nyata, meski
   bukan biaya produk. **Terima dengan mata terbuka.**

3. **"Tak ada SSO/SAML" vs SaaS B2B** — **INI YANG PALING BERISIKO.** Begitu pelanggan
   naik kelas (kontraktor 200+ karyawan, apalagi BUMN karya), SSO bukan kemewahan
   melainkan **syarat pengadaan**. Supabase Auth mendukung SAML di tier berbayar, jadi
   biayanya moderat — tetapi keputusan "tak dibangun" sebaiknya diubah menjadi
   **"ditunda sampai pelanggan pertama yang memintanya"**, bukan "tak akan dibangun".

4. **"PSAK bukan IFRS"** — **benar** untuk pasar Indonesia. PSAK sendiri sudah konvergen
   ke IFRS. Non-isu.

5. **Kontradiksi terbesar yang tak disebut siapa pun:** visi menuntut **"fitur sangat
   lengkap dan matang"** sementara `docs/RANCANGAN-DIKERJAKAN.md` mencatat **93 dari 119
   sub-menu belum punya rancangan**, dan tenant masih tepat satu. Menjual SaaS sambil
   membangun 93 sub-menu adalah risiko **fokus**, bukan risiko teknis. Rekomendasi jujur:
   **pilih satu vertikal sempit** (kontraktor gedung menengah, 5–50 proyek/tahun) dan
   nyatakan sisanya di luar scope v1 — daripada lengkap-di-atas-kertas tapi dangkal di semua.
