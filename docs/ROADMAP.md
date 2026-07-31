# ROADMAP — Puraloka Suite

**Satu tempat untuk menjawab "apa berikutnya?"** · Diperbarui: 2026-07-31

> **Kenapa dokumen ini ada.** Rencana kerja sebelumnya tersebar di lima dokumen
> dengan status yang saling bertentangan: `ERP_MASTER_PLAN.md` masih menandai
> Modul 4 "🔴 Not Started" padahal procurement sudah live berbulan-bulan;
> `PETA-PRIORITAS-ERP.md` §3 punya ranking sendiri; `Master-Delivery-Blueprint`
> punya 6 Capability; `STATUS.md` §AUDIT menambah 7 gap baru; build-order CECEP
> punya 10 langkahnya sendiri. Tak ada satu pun yang bisa menjawab pertanyaan
> paling dasar itu secara utuh.
>
> **Ini juga TRACKER, bukan sekadar peta.** Setiap item diperbarui saat
> pekerjaannya selesai — bagian dari Definition of Done, pola yang sudah
> terbukti di `DEVELOPMENT_LOG.md`.

## Aturan main dokumen ini

Dokumen rencana di repo ini punya sejarah jadi basi lalu dipercaya buta —
`PETA-PRIORITAS-ERP.md` §2 sendiri mencatat 8 kontradiksi yang lahir dari itu.
Tiga aturan supaya ROADMAP tidak jadi dokumen basi keenam:

1. **Status wajib merujuk bukti, bukan klaim.** Format: `✅ PR #120 (2026-07-31)`.
   "Sudah selesai" tanpa nomor PR/commit tidak dihitung.
2. **Satu sumber kebenaran.** Dokumen yang di-merge ke sini ditandai di
   headernya masing-masing dan menunjuk balik ke ROADMAP. Dua daftar pekerjaan
   yang hidup berdampingan = kontradiksi berikutnya tinggal menunggu waktu.
3. **`PETA-PRIORITAS-ERP.md` tetap hidup** — fungsinya berbeda: registry
   "dokumen mana AKTIF/STALE", bukan daftar pekerjaan.

---

## Sedang dikerjakan / baru selesai

| # | Item | Status | Bukti |
|---|---|---|---|
| 1 | **BAC EVM dari pagu RAP** — CPI/SPI tak lagi disamarkan margin RAB | ✅ Selesai | PR #120 (2026-07-31) |
| 2 | **A1 — `apps/web` masuk CI** + 2 bug pre-existing (5 error TS2322, 6.070 lint semu) | ✅ Selesai | PR #121 merged (2026-07-31), commit `5bb284d` |
| 3 | **A2 — dependency & secret scanning** · 1 critical + 35 high ditutup | ✅ Selesai | PR #121 merged (2026-07-31) |
| 4 | **A4 — aksesibilitas** · 498 temuan terukur + ratchet | ✅ Selesai | PR #121 merged (2026-07-31) |
| 5 | **A3 — `no-explicit-any` dinyalakan** + ratchet (227 terukur) | ✅ Selesai | PR #121 merged (2026-07-31) |
| 6 | **Graphify diperbaiki** — 7.161 node, query berfungsi | ✅ Selesai | 2026-07-31 (di luar git, `graphify-out/` ter-gitignore) |
| 7 | **Perapian `docs/`** — 60 tautan rusak + 3 cacat administratif + pemindai di CI | ✅ Selesai | 2026-07-31, job CI `dokumentasi` |
| E1–E8 | **Estimasi/CECEP bisa dipakai** — 8 cacat yang membuat halaman tak terpakai | ✅ Selesai | 2026-07-31, 10 commit — lihat §Tingkat 0 |

---

## Antrean utama — urut dampak

Urutan ini berbasis **kerugian nyata bila tidak ada**, bukan kemudahan
pengerjaan. Sumber tiap item disebut supaya bisa ditelusuri ke dokumen aslinya.

### Tingkat 1 — Cost control (Lima Pembeda #1 = 3/5)

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 8 | ~~**Rekonsiliasi pagu RAP vs realisasi belanja**~~ | CECEP §D7 · PETA #4 | ⛔ **DIPINDAH ke "Sengaja TIDAK dikerjakan"** — discovery 2026-07-31 membuktikan gerbangnya BELUM terbuka: `rap_material_line` **0 baris**, kecocokan `resources`↔`materials` **0,1%** (2 dari 2.680, granularitas beda), dan `project_expenses` tak punya kolom material sama sekali. Bukti: [`DISCOVERY-RAP-VS-REALISASI.md`](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/DISCOVERY-RAP-VS-REALISASI.md) | — |
| 9 | **Commitment & varians per cost code** | PETA #5 | ✅ **Selesai 2026-07-31** — tab **Varians Biaya** di `/estimasi` + 4 endpoint (`/cost-codes`, `/projects/:id/cost-map`, `PUT /cost-map/:categoryId`, `/projects/:id/varians`). ACL migrasi 112 akhirnya terpakai: lahir ber-test tapi 0 baris & nol endpoint selama ini. Commitment (PO mengikat) dipisah dari actual — exposure = keduanya. Aritmetikanya di `lib/varians-cost-code.ts`, 12 test + mutation-tested. ⚠️ Pagu & commitment **per baris** belum tersedia (jembatan resource/material ↔ cost_code belum ada) — ditampilkan “—”, bukan Rp 0 | Sedang |
| 10 | ~~**Cost-to-complete forecast (UI)**~~ → **Proyeksi Kas (UI)** | PETA #6 | ✅ **Selesai 2026-07-31.** ⚠️ Judul lamanya keliru: *cost-to-complete* (ETC/EAC) **sudah lama tampil** di EVM cards `kurva-s-section.tsx:416`. Yang benar-benar tak ber-UI adalah **cashflow forecast** — endpoint `GET /estimate-versions/:id/cashflow-forecast` hidup sejak Milestone 4 tapi tak pernah dipanggil satu baris pun dari web. Kini jadi tab **Proyeksi Kas** di `/estimasi` | Kecil |

### Tingkat 2 — Kebocoran di titik paling awal

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 11 | **Modul 9a — RAB hard-guard di Material Request** | ERP_MASTER_PLAN | ✅ **Selesai 2026-07-31** (migrasi 142). Submit MR ditolak 422 bila `sudah_di_MR + diminta > volume_RAB`; override butuh capability BARU `procurement:mr:override_quota` (admin & direktur saja — sengaja lebih sempit dari `mr:manage` yang juga dipegang pm & mandor) + alasan ≥10 karakter, tercatat di `mr_quota_override` + audit. ⚠️ **Temuan serius:** migrasi 043 tercatat SUKSES tapi `project_rab_materials` tak pernah ada di DB — dipulihkan 142 dengan blok verifikasi `RAISE EXCEPTION` | Sedang |
| 12 | **Modul 9b — PO ke WhatsApp/email vendor** | ERP_MASTER_PLAN | ✅ **Selesai 2026-07-31** (migrasi 143). Tautan WA sebenarnya **sudah ada** tapi tak berguna & tak berjejak: teks dirakit di UI dan hanya memuat TOTAL (supplier tetap harus menelepon untuk tahu isinya), dan tombolnya tak memanggil server sama sekali — `whatsapp_sent_at` terisi pada **0 dari 4 PO**. Kini pesan disusun server dengan **rincian item** (`lib/pesan-po.ts`, 18 test), pengiriman **dicatat** di `po_delivery_log` + audit, dan nomor tak sah menyembunyikan tombolnya alih-alih membuka tautan ngawur. `po_delivery_log` juga korban migrasi hantu 043 — dibangun ulang dengan FK yang benar | Kecil |

### Tingkat 3 — Utang multi-tenant (menggigit saat badan usaha kedua dibuat)

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 13 | **T10 — `auth_role()` per-company** | ADR-011-T9 §5 | ✅ **Selesai 2026-07-31** (migrasi 144). Kini baca `company_members.role_id` untuk company aktif, meniru pola `auth_company_id()`; fallback ke `users.role_id` **dipertahankan** supaya user tanpa keanggotaan tak terkunci keluar. Dipakai **100 RLS policy**. Behavior-preserving **dibuktikan**: 23 user diperiksa, nol perubahan jawaban — dan uji rollback membuktikan fungsinya kini benar-benar peka-company (peran global `client` vs peran di company uji `admin` → mengembalikan `admin`) | Kecil |
| 14 | **ADR-011-T4 — 468 akses `supabase` mentah di 9 modul** | ADR-011-T4 | Ratchet mencegah memburuk, **tidak menyelesaikan**. `clients`, `users`, `roles`, `settings`, `audit`, `documents`, dst | Besar |

| 14b | **`financial_config` anti-overlap lintas-tenant** | Temuan 2026-07-31 | ✅ **Selesai** (migrasi 145). Constraint `no_overlap_financial_config` (086) mengunci `(key, daterange)` SAJA; migrasi 127 menambah `company_id NOT NULL` tapi constraint-nya tak ikut. Akibatnya **badan usaha kedua TIDAK BISA menetapkan tarif pajaknya sendiri** — perusahaan pertama memegang rentang tanggalnya. Dibuktikan di dev sebelum & sesudah (rollback): `23P01` → berhasil. Ikut ditutup: `setFinancialConfig()` menutup rentang lama **tanpa filter company** (menyapu tarif SELURUH perusahaan) dan menyisip tanpa `company_id`; `companyId` kini **wajib** di tipenya, jadi "lupa" gagal saat kompilasi. 6 test + mutation-tested 3 arah | Kecil |

| 14c | **Buku besar migrasi meleset dua arah** | Temuan 2026-07-31 | ✅ **Selesai.** `schema_migrations` tak bisa dipercaya: **20 migrasi sudah jalan tapi tak tercatat** (seluruh seri multi-tenant 126–137, RAP 138, provenance 139/140) — sebabnya DDL dijalankan lewat skrip sekali-pakai tanpa menulis bukunya. Bahayanya konkret: `ci-project-setup.mjs` memutuskan "apa yang perlu dijalankan" murni dari buku itu, jadi diarahkan ke dev ia akan **menjalankan ulang 20 migrasi** termasuk penulisan ulang policy RLS (131–134) dan backfill (127). Alat rekonsiliasi baru membuktikan tiap migrasi ke `pg_class`/`pg_proc`/`pg_indexes`/`pg_constraint` dulu dan **menolak** mencatat yang tak lengkap — bukan `INSERT` buta, karena mencatat yang belum jalan sebagai "sudah" persis mengulang cacat 043–047. Hasil: 15 terbukti otomatis + 5 diverifikasi manual (policy/data-only) → **0 tersisa**, dan simulasi membuktikan nol migrasi akan dijalankan ulang. Akar masalahnya ditutup di AUTOPILOT §9b | Kecil |

| 14d | **Aksesibilitas: 296 pelanggaran WCAG AA + penjaganya** | Audit axe login nyata 2026-07-31 | 🟡 **Sebagian.** Audit axe dengan login NYATA menemukan 296 pelanggaran di 17 halaman (kontras ×260, button-name ×14, select-name ×9, label ×9) — **nol** di antaranya terlihat oleh `eslint-plugin-jsx-a11y` yang sudah aktif penuh, karena plugin itu tak punya rule untuk kontrol yang berdiri TANPA label. Ditutup + penjaga statis baru (`a11y-ratchet.mjs`) di CI. **Hutang tersisa: 28 `<select>` + 25 tombol tanpa nama**, hampir semuanya di dalam modal yang tak terbuka saat halaman dimuat sehingga axe tak menjangkaunya — 67 `<select>` sudah diberi nama manual (2026-07-31) dengan label yang diturunkan dari konteks pemakaiannya — mis. `statusFilter` di procurement muncul 4x di tab berbeda dan diberi nama per-tab, bukan disamakan. Sisa 28 hampir semuanya di dalam modal. **Kontras warna tak dijaga otomatis** (butuh browser + login; kredensial di CI ditolak sadar) | Sedang |

| 14e | **scope-item bisa disunting lintas-tenant** | Audit gerbang 2026-07-31 | ✅ **Selesai.** `resolveScopeItemOwnership()` hanya menerima `itemId`, mencari baris dengan `.eq('id')` SAJA, lalu pemanggil memeriksa `pm_id`/`mandor_id`. Yang terlewat: **admin tak difilter sama sekali** — admin company A yang tahu UUID scope-item company B bisa PATCH volume/harga, DELETE item, atau ubah realisasi progres (ketiganya menulis; `unit_price × volume` masuk nilai pekerjaan mandor). Dibuktikan di dev (rollback). Diperbaiki: helper menerima `request`, query membawa `company_id` proyek induk, dibandingkan ke company aktif. 5 test + uji mutasi. **Alat baru `audit-gerbang-tenancy.mjs`** memisahkan "akses mentah SESUDAH gerbang" (aman, hutang adopsi) dari "tanpa gerbang" (celah) — ratchet 468 selama ini mencampur keduanya. Nama gerbang DITURUNKAN dari sumber, bukan didaftar tangan: daftar manual selalu ketinggalan satu dan tiap yang ketinggalan adalah tuduhan palsu (58 → 36 → 17 saat daftarnya dilengkapi). Hasil: 202 rute ber-supabase-mentah, **185 bergerbang**, 17 perlu ditinjau | Kecil |

| 14f | **5 celah tenancy lagi dari tinjauan 17 rute** | Audit gerbang 2026-07-31 | ✅ **Selesai.** Ditemukan dengan meninjau satu per satu rute yang dilaporkan `audit-gerbang-tenancy.mjs`: (a) `PATCH /reports/rekap-pajak/:id/status` — sunting status pelaporan pajak + nomor e-Faktur perusahaan mana pun yang id-nya diketahui; (b) `GET /procurement/stocks/:project_id/movements` — baca seluruh mutasi stok proyek tenant lain, bahkan tanpa permission khusus; (c) `GET /cash/expenses/summary-by-category` **tanpa** `project_id` menjumlahkan pengeluaran approved SEMUA perusahaan jadi satu angka — bukan bocor per-baris, tapi menyajikan total keuangan tenant lain; (d) `POST /mandor/work-scopes` mempercayai `assignment_id` dari body, jadi lingkup kerja (+`borongan_value`) bisa disisipkan ke penugasan perusahaan lain; (e) `feature_flags` `UNIQUE(key)` GLOBAL padahal kategori AB — **pola identik migrasi 145**, dan upsert-nya `onConflict: 'key'` menimpa baris tenant lain. Ditutup migrasi 146 (`UNIQUE(company_id,key) NULLS NOT DISTINCT`) + endpoint di-scope. Tinjauan dilanjutkan ke 12 rute sisa dan menemukan 3 lagi: `GET /reports/rekap-pajak` (daftar pajak SEMUA perusahaan, lengkap NPWP & nama klien — data pribadi pihak ketiga), `POST /roles` (role custom lahir tanpa `company_id` → dianggap role BAWAAN dan muncul di perusahaan lain), `GET /mandor/list` (dropdown assign menampilkan mandor seluruh perusahaan + no. HP & email). Hasil akhir: **192 dari 201 rute bergerbang** (dari 182); 9 sisanya sah lintas-tenant by design (login, katalog global `modules`, tulisan self-scoped `.eq(id, user.id)`) | Kecil |

| 14g | **Modul "hidup di API, mati di UI" — hasil audit jalur hidup** | AUTOPILOT §9a, 2026-07-31 | 🟡 **Terdata, belum dibangun.** Diverifikasi satu per satu, bukan diasumsikan: **(a) Lessons Learned** — 3 endpoint workflow (submit/approve/reject) + tabel berisi 668 baris, TAPI **668-nya `[TEST]` dan seluruhnya yatim** (project induk terhapus). Nol data nyata, nol UI, nol menu. Sempat terlihat seperti "fitur hidup yang kurang UI" justru KARENA residu itu — penghapusannya menunggu izin (keputusan terbuka #1c). **(b) `GET /settings/config`** — Configuration Engine (Sub-Fase 1B.1), ber-test, nol pemanggil dari web; nilai config hanya bisa diubah lewat halaman khusus yang sudah ada (keuangan/notifikasi), bukan dari satu layar config terpadu. **(c) `price-overrides`** — endpoint ada, UI-nya belum. Ketiganya BUKAN bug: kodenya benar dan teruji. Yang kurang jalur pemakaiannya — persis kelas cacat yang §9a dibuat untuk menangkap | Sedang |

### Tingkat 4 — Pelaporan & kepatuhan

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 15 | **WIP / pengakuan pendapatan (PSAK)** | PETA #8 · Lima Pembeda #3 = **0/5** | Tanpa ini L/R kontraktor tidak bermakna. Bank & pemberi kerja besar memintanya. Bisa dibangun sebagai laporan tanpa GL penuh | Sedang |
| 16 | **Rantai kontrak** — LD arah kontraktor, EOT, register jaminan/bond | PETA #9 · Lima Pembeda #5 = 2.5/5 | Tender pemerintah: denda keterlambatan & jaminan = uang nyata. ⚠️ Penalty engine 091 arahnya TERBALIK (denda klien telat bayar) | Sedang |
| 17 | **Paritas golden end-to-end 1 RAB nyata** | GOLDEN-FILE-SPEC | Harness sudah ada; yang terbukti baru level HSP per item. Klaim "kemampuan sistem = Excel" belum pernah dibuktikan di level dokumen utuh | Kecil |

### Tingkat 5 — Nilai tampak, dependensi sudah lunas

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 18 | **Executive Cost Analytics** | CECEP/52 Gap-3 | Agregasi lintas proyek dari 3 sumber yang sudah hidup. ⚠️ Syarat lamanya "kerjakan SETELAH #8" **gugur** — #8 ternyata terkunci gerbang. Boleh dikerjakan lebih dulu, TAPI dashboard-nya wajib menyatakan eksplisit bahwa angkanya belum diadu ke realisasi belanja | Kecil |
| 19 | **Explainability trail** (`/explain` per item) | CECEP/50 · Constraint #1 | Constraint TERTINGGI CECEP, bukan fitur pinggiran. Fondasi sudah ada (migrasi 139/140); yang kurang endpoint+UI yang merangkai jejaknya jadi penjelasan | Sedang |
| 20 | **Laporan perbandingan antar-edisi AHSP** | AHSP-EDITION-BUILDER §3.5 | Sumbu edisi sudah dibangun penuh tapi **manfaat utamanya belum dipanen**. Taruhannya konkret: pindah edisi mengubah RAB −13,47% pada cakupan terukur | Sedang |
| 21 | **Baseline schedule + look-ahead** | PETA #11 | PV di EVM dari input manual → SPI kurang terpercaya | Sedang |

### Tingkat 6 — Domain baru

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 22 | **Bid register + backlog** | PETA #10 | Tender kalah tak terpelajari; backlog tak terlihat saat memutuskan ambil kerja | Kecil |
| 23 | **Modul 12 — asset/alat (versi ringan sewa)** | ERP_MASTER_PLAN · PETA #12 | Kalau alat mayoritas sewa, cukup tracking sewa + utilisasi | Kecil |
| 24 | **Capability Tier-2** — RFI, Submittals, Punch List, QC, HSE | Blueprint 01-capability-to-task | Dependency "butuh Workflow Engine" **sudah lunas** (Program B selesai) — blocker lama hilang | Besar (cicil per-Epic) |

---

## Tingkat 0 — Lahir dari pemakaian nyata, bukan dari perencanaan

**Kelompok ini tidak ada di dokumen rencana mana pun.** Ia lahir 2026-07-31 saat
founder benar-benar membuka `/estimasi` dan mencoba memakainya — dan tiap
pertanyaannya menemukan cacat yang tak terlihat dari audit kode.

Dicatat di sini karena dua alasan. Pertama, supaya ROADMAP tetap jadi tracker
yang jujur: 10 commit hari itu tak terwakili sama sekali oleh item #1–#24.
Kedua, karena polanya sendiri adalah temuan — **fitur bisa "selesai" menurut
kode dan tetap tak terpakai**, dan yang mengungkapnya cuma pemakaian.

Dinamai Tingkat 0 karena mendahului yang lain: fitur yang tak bisa dipakai tak
memberi nilai apa pun, sebagus apa pun rancangannya.

| # | Item | Yang ditemukan | Status |
|---|---|---|---|
| E1 | **Analisa perusahaan tak pernah muncul di Komposer** | Komposer memfilter `?edition=`, tapi 423 analisa perusahaan punya `edition_id = NULL` — terbuang seluruhnya. Analisa yang justru dibuat untuk dipakai tak pernah bisa dipilih | ✅ `b183ebf` |
| E2 | **Katalog & harga dipotong diam-diam** | Pencarian hanya menyaring 200 baris yang terlanjur termuat dari 3.043; tab Harga bahkan hanya 100 dari 2.637. Analisa di baris ke-500 tak pernah bisa ditemukan | ✅ `ed2f7e3` + `0739e82` |
| E3 | **Batas keras 1.000 PostgREST** | Cap API dinaikkan ke 5.000 tapi PostgREST tetap memotong di 1.000 — `.limit()`/`.range()` tak menembusnya. Klaim "muat semua" sempat TIDAK akurat | ✅ `0739e82` (paging bertahap) |
| E4 | **Dropdown 3.040 pilihan tanpa pencarian** | `<select>` asli hanya bisa diloncati huruf awal. Orang yang tahu barangnya tapi tak hafal urutan katalog praktis tak bisa memakainya | ✅ `fa7b4c4` (`components/pilih-cari.tsx`) |
| E5 | **Katalog terbuka dalam keadaan TERSARING** | Edisi ber-`source_sha256` dipilih otomatis saat halaman dibuka — 423 analisa perusahaan tak terlihat sejak awal, tanpa pemakai memintanya | ✅ `0739e82` |
| E6 | **Komposer tak tersambung ke RAB proyek** | `estimate_items` dan `rab_items` dua sistem terpisah tanpa FK. RAB yang disusun dari analisa AHSP tak berpengaruh apa pun pada Kurva S, EVM, progress fisik | ✅ `d38078a` (tombol "Terapkan ke RAB Proyek") |
| E7 | **712 analisa (23%) tak bisa hitung HSP** | 255 resource tanpa harga. Ditelusuri: harganya **ADA semua di Excel** — hanya di dalam baris analisa, bukan di sheet daftar harga yang dibaca ekstraktor | ✅ `f93dc11` → `be1a119` (5 putaran) |
| E8 | **Halaman "ngambang", kanan kosong** | `maxWidth: 1200` tanpa `margin: 0 auto` — satu-satunya halaman yang begitu; audit/dashboard/kalender semuanya punya | ✅ `0739e82` |
| E11 | **Sistem tata letak lintas halaman** | 26 halaman memakai SEMBILAN lebar berbeda, dan **13 tak memusatkan diri sama sekali** — di 1920px isinya melebar sampai 1700px. Angkanya tak pernah diputuskan siapa pun; ia diwarisi dari halaman yang kebetulan disalin lebih dulu | ✅ token `--w-form/page/luas` + penjaga CI |
| E14 | **Rate limit tertelan jadi 500** | Login yang kena limit membalas "Internal server error", bukan "coba lagi dalam 1 menit" — user mengira sistemnya rusak lalu mencoba terus, yang justru memperpanjang blokirnya. Regresi 200-bukan-500 ikut tertangkap uji SEBELUM ter-commit | ✅ 8 test + uji mutasi 3 arah |
| E15 | **Kontras GAGAL WCAG di halaman login** | `--text-muted` 2,53:1 (syarat 4,5:1) di layar PERTAMA yang dilihat semua pengguna; dipakai 1.001×. Mode gelap lebih parah (2,57–3,19) dan tak pernah diaudit. Tombol "Masuk" 2,72:1 — putih di atas biru terang | ✅ 0 pelanggaran axe, terang & gelap |

### Yang BELUM selesai dari kelompok ini

| # | Item | Kenapa penting | Ukuran |
|---|---|---|---|
| E9 | **19 harga bentrok butuh keputusan founder** | 17 dari 19 resource tersisa punya beberapa harga di workbook: `Kaso-Kaso 5/7` Rp 3jt/6jt/9,7jt/**16jt** per m³ (jelas jenis kayu berbeda dengan nama sama), `Kanstin` 5 harga, `List Gypsum` 4 harga. **Tidak boleh ditebak** — menyebar ke belasan analisa. Datanya sudah tersaji lengkap (tiap nilai + berapa kali muncul + baris mana) | Kecil — tapi butuh founder |
| E10 | **81 harga draft menunggu diaktifkan** | Hasil ekstraksi sheet analisa Cibuluh, masuk sebagai `draft` supaya bisa dibedakan dari yang diverifikasi manusia. Draft TIDAK dipakai menghitung HSP. Begitu diaktifkan, **112 analisa perusahaan langsung hidup** | Kecil — tapi butuh founder |
| E12 | **Dua edisi AHSP kosong** | `SE-68-2024` & `SNI-2013` terdaftar di registry (migrasi 117, sebagai reference data) tapi nol analisa. Kini ditandai "belum ada analisa" & tak bisa dipilih — tapi isinya tetap belum ada. Menghalangi #20 (perbandingan antar-edisi): tak ada yang bisa dibandingkan. **Butuh file workbook dari founder** | Sedang |
| E13 | ~~**7 tabel hantu — migrasi 016/044/045**~~ | ❌ **SALAH — dicabut 2026-07-31.** Dua kesalahan saya sendiri: (a) nomor migrasinya keliru — `accounts`/`journal_*` berasal dari **047**, bukan 016 (016 = cash management, hidup dan dipakai); (b) lebih penting, ketujuhnya **bukan hantu** melainkan **forward-draft yang disengaja** — 043–047 sudah tercatat sebagai SKEMA-MATI di `ERP-KONTRAKTOR-TAKSONOMI-MENU.md` §19 sejak 2026-07-26, dan GL (047) memang **tidak boleh** di-apply sebelum CoA divalidasi akuntan. Alat auditnya yang diperbaiki: forward-draft kini dipisahkan dari hantu, lengkap dengan alasan + rujukan keputusannya. Pelajarannya: laporan yang mencampur "kecelakaan" dengan "keputusan sadar" melatih pembacanya mengabaikan seluruh bagian itu | ✅ alat diperbaiki |

### Pelajaran yang layak diingat

**Fitur bisa lengkap di DB dan lib, tapi mati karena tak ada endpoint atau UI.**
Berulang kali: ACL cost code (migrasi 112, ber-test, 0 baris), cashflow forecast
(ber-test, nol pemanggil), kuota RAB (tabelnya bahkan tak pernah terbentuk),
jejak PO (kolom ada, terisi 0 dari 4). Semuanya "selesai" menurut commit.

**Perbaikan yang "terlihat lebih aman" bisa justru lebih berbahaya.** Saat
memperbaiki rate-limit, `err.statusCode ?? reply.statusCode ?? 500` terasa lebih
defensif daripada `?? 500`. Ternyata untuk `throw new Error(...)` biasa,
`reply.statusCode` masih 200 — sehingga kesalahan server sungguhan terkirim
sebagai **200 SUKSES**. Monitoring yang menghitung rasio 5xx tak akan pernah
melihatnya. Tertangkap hanya karena uji perbandingan ("error sungguhan TETAP
500") ditulis bersama uji utamanya, bukan sesudahnya.

**Verifikasi bisa mengukur benda yang salah tanpa memberi tanda.** Berjam-jam
terbuang menyimpulkan "token CSS-nya dibuang compiler" — padahal yang terjadi:
server yang jalan adalah `next start` (bundel produksi lama), bukan `next dev`.
Sumbernya benar sejak awal. Pelajarannya bukan "periksa server", melainkan:
kalau hasil ukur tak masuk akal, curigai ALAT UKURNYA sebelum menyimpulkan
tentang benda yang diukur.

**Aksesibilitas tak pernah diperiksa ≠ aksesibilitas baik.** Satu jalan axe-core
di halaman login — layar pertama semua orang — menemukan kontras 2,53:1 pada
token yang dipakai 1.001 kali, plus mode gelap yang tak pernah diaudit sama
sekali. Lint statis (`jsx-a11y`) tak bisa menemukannya: kontras hanya ada saat
warna benar-benar dirender.

**Komponen tanpa pemakai dihapus, bukan disimpan "untuk nanti".** `Halaman`
sempat dibuat sebagai kerangka bersama, lalu ternyata tak cocok dengan halaman
yang ada (masing-masing punya header sendiri). Menyimpannya berarti melanggar
§9a yang baru ditulis sehari sebelumnya. Ia dihapus.

**Keyakinan founder soal datanya sendiri terbukti benar tiga kali berturut-turut.**
"Saya yakin di Excel ada isinya" — dan memang ada, tiga kali, dengan tiga sebab
berbeda. Audit kode tak akan pernah menemukan itu; hanya orang yang tahu
datanya yang bisa.

---

## Sengaja TIDAK dikerjakan

Bukan karena terlupa — masing-masing punya gerbang yang belum terbuka.
Membangunnya sekarang = pekerjaan yang nilainya belum terbukti.

| Item | Gerbangnya |
|---|---|
| **CECEP langkah 9** — split `dpp_factor` PPN | Menunggu data PPN nyata. Guardrail-nya ada tapi lulus **VACUOUS** (0 `tax_record` ber-PPN di dev) — jadi ia belum membuktikan apa pun |
| **#8 Rekonsiliasi pagu RAP vs realisasi** | Menunggu **tiga**-nya, bukan salah satu: (1) ada RAP terkunci dengan baris material — kini `rap_material_line` **0 baris**; (2) `project_expenses` punya atribusi item — kini nol kolom material, 72 dari 84 baris belanja buta; (3) ada belanja nyata yang menunjuk pos RAP. Join by-name **dilarang**: kecocokan hanya 0,1% dan granularitasnya beda (item AHSP vs barang toko). Ukur ulang: `node apps/api/scripts/discovery-rap-realisasi.mjs` |
| **T5c** — lepas `service_role` | Menunggu pemicu: perusahaan kedua di-onboard · pemakai di luar founder · data operasional nyata masuk |
| **T8 / L3** — SaaS (billing, tenant lifecycle, SLA) | Menunggu pelanggan eksternal **berbayar**. Doc 09 §3 menyebut membangunnya lebih awal sebagai *enterprise theater* |
| **GL in-app** (Modul 10) | Keputusan owner masih terbuka: in-app vs akuntansi eksternal + export |
| **Never Build List** (9 item) | EAV penuh · multi-currency L1/L2 · BIM 3D viewer · LMS · ESG native · FM/O&M · microservices default · Kafka · rebuild Supabase Auth/Storage |
| **140 automation AI** | 0 berstatus "Now" **by design**. Irisan 13 `Next` kini dependency-nya lunas pasca Program B — itu satu-satunya bagian yang layak dilihat, dan semuanya rule-based **tanpa AI** |

---

## Utang teknis yang terkunci ratchet

Tidak masuk antrean karena bukan fitur — tapi tercatat supaya tak terlupa, dan
tak bisa memburuk diam-diam.

| Hutang | Jumlah | Penjaga |
|---|---|---|
| `any` di `apps/api` | 227 | `apps/api/scripts/lint-ratchet.mjs` |
| Temuan aksesibilitas `apps/web` | 498 | `apps/web/scripts/lint-ratchet.mjs` |
| Lint lain `apps/web` | 428 | idem |
| Akses `supabase` mentah | 468 | `tenancy-ratchet.test.ts` |

**Ratchet = boleh turun, tak boleh naik.** Kalau CI gagal karena angkanya naik,
perbaiki kode barunya — jangan naikkan ambangnya.

---

## Riwayat perubahan roadmap

| Tanggal | Perubahan |
|---|---|
| 2026-07-31 | Dokumen dibuat. Merge dari `ERP_MASTER_PLAN` (13 Modul + FASE 0–7), `PETA-PRIORITAS-ERP` §3 (12 item), `Master-Delivery-Blueprint/01` (6 Capability), `STATUS.md` §AUDIT (7 gap), build-order CECEP (10 langkah). Dedup + urut ulang berdasar dampak. Item #1–#6 sudah selesai di hari yang sama |
| 2026-07-31 | PR #121 merged (`5bb284d`) — item #2–#5 tuntas. Job `web` hijau untuk PERTAMA KALINYA; sebelumnya `apps/web` nol penegakan CI |
| 2026-07-31 | Item #7 tuntas. 60 tautan rusak diperbaiki + 3 cacat administratif ditutup + pemindai tautan jadi job CI `dokumentasi`. **Rencana awalnya keliru dan dikoreksi di lapangan** — lihat catatan di bawah |
| 2026-07-31 | Item #8 **dipindah ke "sengaja tidak dikerjakan"** setelah discovery terukur. ROADMAP menempatkannya di Tingkat 1 dengan asumsi "gerbang sudah lewat" — data membuktikan sebaliknya. Konsekuensi: syarat #18 "kerjakan setelah #8" gugur. Ini contoh ROADMAP bekerja sebagaimana mestinya: status berubah karena **bukti**, bukan karena rencananya begitu |
| 2026-07-31 | Item #10 tuntas — tab **Proyeksi Kas** di `/estimasi`. Judul item lamanya keliru dan dikoreksi: ETC/EAC sudah lama ber-UI; yang menganggur adalah endpoint cashflow forecast. Ratchet sempat MERAH (73 vs ambang 71) menangkap 2 `set-state-in-effect` baru — diperbaiki dengan memindahkan reset ke handler & membuat effect murni asinkron, bukan menaikkan ambang |
| 2026-07-31 | Item #9 tuntas — tab **Varians Biaya** + 4 endpoint. Pola berulang lagi: fondasi ada & ber-test (ACL migrasi 112), yang hilang endpoint+UI. Ratchet API sempat MERAH (17 vs 16 `no-unused-vars`) — sisa refactor, dibersihkan bukan dinaikkan |
| 2026-07-31 | Item #11 tuntas — hard-guard kuota RAB di submit MR (migrasi 142). Menemukan **migrasi hantu**: 043 tercatat sukses di `schema_migrations` lengkap dengan 9 statement, tapi `pg_class` tak punya `project_rab_materials` maupun `po_delivery_log`. Nol endpoint pernah memakainya, jadi tak ada yang menabraknya sampai sekarang — lihat catatan di bawah |
| 2026-07-31 | Ratchet tenancy T4f sempat MERAH (486 vs 468) — `cost-control.ts` & endpoint kuota memakai `supabase` mentah. Diperbaiki ke wrapper tenant-db, kembali PERSIS 468. Ditemukan pula jebakan: `viaProject('cost_code_category_map', projectId)` akan menyaring `category_id = projectId` (kolom `lewat` bukan `project_id`) — nol baris tanpa error, pola bug yang sama dengan rap.ts |
| 2026-07-31 | Item #12 tuntas — pengiriman PO ke vendor kini berjejak (migrasi 143). `po_delivery_log` dibangun ulang setelah jadi korban migrasi hantu 043 yang sama |
| 2026-07-31 | Item #13 tuntas — `auth_role()` per-company (migrasi 144). Dikerjakan **sekarang justru karena dampaknya masih nol** (1 company, nol user lintas-company): saat badan usaha kedua berisi data nyata, perbedaannya langsung berdampak pada siapa-melihat-apa dan perbaikannya jadi jauh lebih mahal |
| 2026-07-31 | **Tingkat 0 ditambahkan** — 10 commit Estimasi/harga/UI hari itu TIDAK terwakili sama sekali oleh item #1–#24, karena pekerjaannya lahir dari founder memakai halamannya, bukan dari dokumen rencana. Tanpa dicatat, ROADMAP berhenti jadi tracker yang jujur. Empat item baru (E9–E12) juga lahir dari temuan itu |

## Jebakan CI yang sudah dibayar mahal — jangan diulang

Empat siklus CI habis di PR #121 untuk dua hal yang tak terlihat dari kode.
Dicatat di sini supaya tak ada yang membayarnya dua kali.

**1. `pnpm <script>` mati sebelum script-nya jalan.** pnpm v11 memeriksa status
dependensi sebelum setiap `pnpm run`. Pemeriksaan itu tak bisa memverifikasi
`xlsx` yang dipasang dari tarball CDN sheetjs — untuk paket ber-URL tarball,
entri `snapshots:` di lockfile v9 memang kosong (`{}`, `pnpm-lock.yaml:14900`)
sementara `integrity`-nya hidup di blok `packages:` (`:7072`). Gejalanya
menyesatkan: `pnpm install --frozen-lockfile` **berhasil**, step script
sesudahnya yang mati dengan `ERR_PNPM_MISSING_TARBALL_INTEGRITY`.
→ Job `web` memanggil binari langsung (`node scripts/…`, `./node_modules/.bin/tsc`,
`./node_modules/.bin/next build`). **Jangan "dirapikan" jadi `pnpm <script>`.**
`verifyDepsBeforeRun: false` di `pnpm-workspace.yaml` menolong lokal, **tidak di CI**.

**2. Konfigurasi pnpm harus di `pnpm-workspace.yaml`, bukan `.npmrc`/`package.json`.**
Di tempat yang salah ia diabaikan **diam-diam** — tanpa peringatan apa pun. Sudah
menggigit dua kali di PR yang sama: `overrides` di `package.json`, lalu `.npmrc`
yang ternyata berisi JSON (`.npmrc` kini dihapus; `allowBuilds` sudah di tempat benar).

**3. `next build` butuh env, meski cuma dummy.** `lib/supabase.ts` memanggil
`createClient()` di module scope, jadi klien ikut dievaluasi saat prerender —
`/auth/callback` mati dengan "supabaseUrl is required". Lokal selalu lolos karena
ada `.env.local`, jadi kegagalannya eksklusif CI. Step Build memakai nilai dummy;
kredensial asli justru akan menaruh rahasia di log CI.

---

## Catatan hasil #7 — perapian `docs/`

**Rencana awal keliru, dikoreksi setelah memverifikasi ke berkas nyata.**
Rencana menyebut 60 tautan itu putus dan mengusulkan memindahkan enam folder
arsip ke `docs/archive/`. Yang benar-benar terjadi berbeda:

**60 tautan rusak bukan berkas hilang — hanya jalur relatifnya salah.** Ke-12
target (`08a`–`08k`) **ada semua** di `enterprise-architecture-framework/`, tapi
ditulis seolah bertetangga dengan `CECEP/`. Baris di tabel yang sama bahkan tidak
konsisten: `08` dan `09` sudah memakai `../enterprise-architecture-framework/`,
`08a`–`08k` tidak. Diperbaiki dengan menyisipkan prefiks yang benar.

**Pemindahan arsip TIDAK dilakukan — sengaja.** Manfaatnya kosmetik, risikonya
nyata: 224 dari 234 berkas ada di bawah satu pohon `superpowers/specs/`, dan
`Phase1/` di dalamnya disitasi 10+ berkas kode produksi termasuk jalur lengkap di
`apps/api/vitest.config.ts`. Memindahkan tetangganya menaikkan peluang salah
sasaran tanpa menambah satu pun jaminan. Yang benar-benar mengurangi risiko —
pemindai tautan otomatis — sudah dipasang, dan itu justru **prasyarat** kalau
suatu saat pemindahan memang dikerjakan.

**3 cacat administratif ditutup:**

| Cacat | Kenapa berbahaya | Perlakuan |
|---|---|---|
| `SUB-FASE-1B-COMPLETION-AUDIT.md` template kosong | `PHASE-1-COMPLETION-AUDIT.md` §1 mengutipnya **berdampingan dengan audit asli** sebagai bukti kelengkapan 1B — pembaca mengira 1B punya dua audit, padahal satu | Ditandai SUPERSEDED + menunjuk ke audit yang terisi; klaim ganda di `PHASE-1-COMPLETION-AUDIT.md` dihapus |
| `CI-ISOLATION-SETUP.md` "⛔ MENUNGGU PROVISIONING FOUNDER" | Pekerjaannya tuntas berbulan-bulan sebelumnya — keempat secret terpakai di `ci.yml:56,71-75,83` | Status → ✅ dengan bukti run CI |
| `runbook-kasbon-workflow-cutover.md` | Prosedur cutover ke engine yang objek DB-nya sudah di-`DROP` (migrasi 092/095, engine 1C diretire per ADR-006) | Ditandai TIDAK BISA DIJALANKAN + menunjuk ke Program B yang menggantikannya |

**Penjaga baru:** `scripts/cek-tautan-docs.mjs` + job CI `dokumentasi`. Diuji
mutasi (tautan palsu disisipkan → pemindai merah), bukan sekadar "kebetulan hijau".

---

## Migrasi hantu — 043 tercatat sukses tanpa pernah membuat tabelnya

Ditemukan 2026-07-31 saat mengerjakan #11. Layak dicatat karena **bisa berulang
dan tak berbunyi**.

`supabase_migrations.schema_migrations` memuat versi `043` lengkap dengan 9
statement tersimpan — termasuk `CREATE INDEX` dan `CREATE TRIGGER` yang merujuk
`project_rab_materials`. Tapi `pg_class`, diperiksa lewat koneksi baru, tak
punya satu pun dari `project_rab_materials` maupun `po_delivery_log`.

Migrasi terlihat berhasil sementara objeknya nihil. Siapa pun yang membaca
daftar migrasi akan menyimpulkan Modul 9a sudah punya fondasi DB. Tak ada yang
menabraknya selama berbulan-bulan karena **nol endpoint pernah memakai tabel
itu** — cacatnya baru muncul saat fiturnya benar-benar dibangun.

**Cara memeriksa, bukan mengandaikan:**

```sql
-- JANGAN percaya schema_migrations sendirian
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = '<tabel_yang_diharapkan>';
```

Wajib lewat **koneksi baru** — katalog bisa basi pada koneksi yang sama
(`reference-supabase-pooler-ddl`).

**Perlakuan yang dipakai di 142, dan yang seharusnya dipakai lagi:**

1. **Jangan edit migrasi lama.** Berkas yang sudah tercatat di riwayat tak boleh
   berubah isinya — itu membuat riwayat berbohong pada lingkungan yang benar-benar
   pernah menjalankannya. Perbaikan datang sebagai migrasi maju yang idempoten.
2. **Pasang blok verifikasi di akhir migrasi.** 142 diakhiri `DO $$ … RAISE
   EXCEPTION … $$` yang menggagalkan migrasi bila tabel/capability tak terbentuk.
   Migrasi yang bisa "sukses" tanpa menghasilkan apa pun adalah cacat desain,
   bukan nasib buruk.
3. **Verifikasi pasca-apply lewat koneksi baru**, memeriksa `pg_class`/
   `pg_attribute`/`pg_policies` — bukan `information_schema` pada koneksi yang
   sama, dan bukan sekadar "tidak ada error".
