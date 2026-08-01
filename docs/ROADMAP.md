# ROADMAP — Puraloka Suite

**Satu tempat untuk menjawab "apa berikutnya?"** · Diperbarui: 2026-08-01

> ## 🎯 SCOPE DIPERLUAS 2026-08-01 — lihat [`KEPUTUSAN-SCOPE-ERP-AI.md`](./KEPUTUSAN-SCOPE-ERP-AI.md)
>
> Tujuan founder: **ERP kontraktor lengkap, terintegrasi, berbasis AI.** Empat
> kantong yang sebelumnya sengaja dicoret kini MASUK (GL in-app · QA/QC+HSE ·
> payroll · aset penuh), dan keempat bentuk integrasi dipakai sekaligus
> (antar-modul · WhatsApp · sistem luar · mobile lapangan).
>
> **Urutan diputuskan: selesaikan 8 item sisa di bawah DULU, baru AI.** Alasannya
> teknis, bukan selera — #15 WIP/PSAK & #16 rantai kontrak adalah data yang akan
> DIBACA AI; membangun AI di atas pembukuan yang belum benar menghasilkan jawaban
> yang percaya diri dan salah.
>
> Konsekuensi jujur: **angka 71% di bawah akan turun** begitu gelombang 2–4 masuk
> sebagai item, karena penyebutnya membesar. Itu penyebut yang akhirnya jujur
> terhadap tujuan, bukan kemunduran.

> **"Kalau seluruh ROADMAP selesai, jadi selengkap apa?"** Dijawab dengan angka di
> `ERP-KONTRAKTOR-TAKSONOMI-MENU.md` §"KALAU SELURUH ROADMAP SELESAI".
> Ringkasnya: 24 item di sini **tidak** memetakan 1:1 ke 71 sub-menu 🔴 taksonomi —
> satu item sering menutup satu kelompok penuh, dan sebagian besar merah memang
> sengaja tak ditargetkan. **Temuan yang butuh keputusan founder: ± 30 merah
> belum punya alasan tertulis** — belum diputus dikerjakan, dieksternalkan, atau
> dicoret. Memutuskannya jauh lebih murah daripada membangunnya.

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
| 15 | ~~**WIP / pengakuan pendapatan (PSAK)**~~ | PETA #8 · Lima Pembeda #3 = **0/5** | ✅ **SELESAI 2026-08-01.** Tripwire "keputusan multi-company DULU" **sudah terbuka** (Program D tuntas) — diverifikasi ke `KEPUTUSAN-MULTI-COMPANY.md`, bukan diasumsikan. `lib/wip-psak.ts`: **21 test + 6/6 uji mutasi**. Dua metode persentase dipertahankan berdampingan — **cost-to-cost** (standar audit, berbasis angka terekam) dan **fisik** (lebih dekat kenyataan tapi berbasis penilaian); memilih salah satu diam-diam menyembunyikan sinyal justru pada proyek yang paling perlu diperiksa. Yang paling dijaga: **CIE ≠ BIE** — BIE adalah uang yang sudah diterima untuk pekerjaan yang BELUM ADA, dan kontraktor yang tak membedakannya merasa kaya di tengah proyek lalu kehabisan uang di akhir. Keduanya dijumlahkan TERPISAH (di neraca satu aset, satu liabilitas — saling menghapuskannya menyembunyikan kedua-duanya). Biaya melampaui estimasi dijepit 100% & dilaporkan sebagai KERUGIAN, bukan pendapatan ekstra. **Terverifikasi ke data nyata:** 15 proyek, pendapatan diakui Rp 1,82 M, **BIE Rp 730 jt** (utang pekerjaan yang selama ini terlihat seperti kas) dan **1 proyek rugi Rp 393 jt** — keduanya tak pernah bisa ditampilkan sistem sebelumnya. UI: tab **WIP / Pengakuan** di halaman Laporan, keterbatasan DI ATAS tabel | Sedang |

| 15e | 🔴 **Lima bug kolom-salah lagi, semuanya gagal senyap** | Temuan 2026-08-01 | ✅ **Diperbaiki.** Menyisir SELURUH rute terhadap `information_schema` (bukan menebak) menemukan lima lagi di luar kurva-S, semuanya kelas cacat yang sama — query gagal, `?? []` menelannya, fitur mati tanpa gejala: **(a)** `search.ts` — `clients.name` (→`company_name`), jadi **pencarian klien SELALU nol hasil**; **(b)** `projects.ts` — `expense_category_templates.description` tak ada, jadi auto-clone kategori ke proyek baru **tak pernah sekali pun berhasil** (dibuktikan: `project_expense_categories` berisi **NOL baris**), dan `description` juga tak ada di tabel TUJUAN sehingga memperbaiki satu sisi saja cuma memindahkan cacatnya; **(c)** `procurement.ts` — `company_settings.company_name`, padahal tabel itu key-value; yang benar `company_profile`, jadi **nama perusahaan di pesan WA ke supplier selalu kosong**; **(d)** `reports.ts` — `documents.name/document_type` (→`title`/`doc_type`), daftar dokumen di laporan proyek selalu kosong; **(e)** `reports.ts` — `milestones.name/actual_date` (→`title`/`completed_at`), tabel milestone di PDF selalu kosong. Kelimanya kini memeriksa `error` | Kecil |

| 15d | 🔴 **CI merah 2 commit: `IF NOT EXISTS` tak melindungi dari tabel yang dibuat migrasi LAIN** | Temuan 2026-08-01 | ✅ **Diperbaiki + diuji mutasi.** Migrasi 149 gagal di CI dengan `column "company_id" does not exist`, tapi **lulus sempurna di dev** — dan perbedaan itulah petunjuknya. Di dev, forward-draft **045 tak pernah dijalankan** (tabelnya nihil di `pg_class`). Di project CI, `ci-project-setup.mjs` menjalankan SELURUH berkas berurutan dan 045 tak ada di allowlist — jadi di sana `assets` benar-benar terbentuk dengan skema lama **tanpa `company_id`**. Akibatnya `CREATE TABLE IF NOT EXISTS assets` dilewati diam-diam, lalu `CREATE UNIQUE INDEX … (company_id, asset_code)` gagal. **Pelajaran: `IF NOT EXISTS` melindungi dari "sudah dibuat oleh migrasi INI", bukan dari "sudah dibuat migrasi LAIN dengan bentuk berbeda".** Migrasi yang menulis ulang forward-draft WAJIB membuang bentuk lamanya lebih dulu. Ditutup blok DROP ber-syarat di 149; diuji mutasi — blok dibuang → gagal dengan pesan **identik CI**. Sekaligus: uji fungsional di 149/151/152 diturunkan jadi NOTICE (di CI migrasi jalan SEBELUM seed, jadi keadaan data berbeda), verifikasi STRUKTUR tetap keras & diuji mutasi | Kecil |

| 15f | **4 integration test gagal di dev: `runMigrations` tak bisa membangun schema test dari nol** | Temuan 2026-08-01 | 🟡 **Terdata, BUKAN regresi.** `kasbons`, `change-orders`, dan 2 backfill-test membangun schema-nya sendiri dengan menjalankan seluruh migrasi berurutan (`test-db.ts:190`), dan berhenti di 046 dengan `column al.user_id does not exist` — `audit_logs` di schema test belum punya kolom itu pada titik tersebut. **Dibuktikan bukan dari perubahan hari ini**: dijalankan di HEAD bersih, gagal identik. Keempatnya lulus di CI (schema-nya dibangun `ci-project-setup.mjs`, bukan `runMigrations`). Perbaikannya: samakan jalur pembangunan schema test dengan jalur CI, atau lengkapi bootstrap 046 | Kecil |

| 15c | **DB dev sempat rusak — SALAH SAYA, bukan test-nya** | Temuan 2026-08-01 | ✅ **Dipulihkan + dikoreksi.** Awalnya saya menuduh `multitenant-t3-rollback.test.ts` merusak schema. **Tuduhan itu salah dan dicabut**: test itu memakai `SET search_path TO <test_schema>, extensions` — `public` TIDAK ada di dalamnya, jadi ia memang tak bisa menyentuh tabel nyata. Yang merusak adalah **skrip simulasi CI yang saya tulis sendiri**: ia memakai `SET search_path TO uji_ci, public`, sehingga DDL yang gagal di `uji_ci` jatuh ke `public` — dan migrasi 127 di sana men-`DROP` `company_id` dari `projects`/`roles`/`role_permissions`. Akibatnya 60 test merah. Dipulihkan **lima lapis**, dan tiap lapis baru ketahuan SETELAH lapis sebelumnya beres — 60 merah → 5 merah → 0. Pengingat keras bahwa "sudah pulih" wajib diverifikasi, bukan diasumsikan: (1) kolom `company_id` di 3 tabel (jalankan ulang bagian 127); (2) policy `tenant_isolation` yang ikut ter-`DROP … CASCADE`; (3) **trigger `fn_isi_company_id` 13→20** (jalankan ulang 128) — tanpa itu 30+ test gagal `null value in column "company_id"`; (4) policy dasar `rab_items` & `document_access_logs` yang jadi **MATI TOTAL** (restrictive tanpa permissive — cacat identik migrasi 149 kemarin, kali ini muncul sebagai kerusakan); (5) jalankan ulang 130/131/132 + 149/150/152. Seluruh pemulihan memakai migrasi sebagai sumber, **tak satu pun DDL diketik ulang dari ingatan**.<br><br>**Yang layak dicatat: penjaga `t5a`/`t7` membuktikan diri DUA KALI dalam satu hari** — kemarin menangkap 4 tabel aset yang lahir mati total (migrasi 149), hari ini menangkap `rab_items` & `document_access_logs` yang MENJADI mati total karena kerusakan. Dua sebab yang berlawanan, satu penjaga, dan keduanya tak akan berbunyi lewat jalur lain mana pun karena `service_role` mem-bypass RLS. **Pelajaran: `, public` di ujung `search_path` mengubah sandbox jadi bukan sandbox** — dan yang membuatnya berbahaya justru karena ia terlihat seperti kehati-hatian ("supaya fungsi bawaan tetap terjangkau").<br><br>**Akarnya ditutup, bukan cuma kejadiannya:** `assertTestIsolation()` kini menolak `search_path` yang memuat `public` — sebelumnya ia hanya memeriksa schema test ADA di sana, sehingga `test, public` lolos mulus. Gerbang itu juga dipasang di `multitenant-t3-rollback` (berkas paling destruktif: DROP kolom & policy di 32 tabel) yang selama ini **tak memakainya sama sekali** — dari sekian test ber-DDL, hanya 1 yang memanggilnya. Diuji mutasi: `test, extensions` lolos · `test, public` DITOLAK · `public` DITOLAK | Kecil |

| 15b | 🔴 **Kurva-S kehilangan Rp 755,7 jt dari AC — EMPAT dari lima sumber gagal senyap** | Temuan 2026-08-01 | ✅ **Diperbaiki.** Berawal dari enum: menguji WIP ke data nyata membuat Postgres menolak `status IN ('approved','paid')` — `expense_status` hanya punya draft/submitted/approved/rejected. Menelusurinya ke `kurva-s.ts` menemukan yang jauh lebih serius: `.select('amount, expense_date')` padahal kolomnya **`total_amount`**. PostgREST membalas *"column … does not exist"*, `data` jadi `null`, dan `for (const e of expenseRes.data ?? [])` **diam-diam melewati nol baris**.<br><br>Menyisir seluruh rute terhadap `information_schema` membuktikan cacatnya **bukan satu baris**: **4 dari 5 sumber AC** memakai nama kolom yang tak ada — `daily_wage_logs.total_wage` (→`total_amount`/`work_date`, dan tabelnya tak punya kolom `status` sama sekali), `progress_payments.amount` (→`net_payment`/`paid_at`), `borongan_settlements.net_settlement` (→`remaining_balance`/`settled_at`). Total **Rp 755,7 juta** tak pernah masuk AC; satu proyek sendirian Rp 477,2 jt. CPI karena itu terlalu optimis — proyek yang boros terlihat sehat.<br><br>Dibuktikan sebelum & sesudah untuk keempatnya: semua GAGAL → semua OK. Kegagalan query kini di-log, tak lagi menyamar jadi "nol baris". **Pelajaran: `?? []` mengubah KEGAGALAN jadi HASIL KOSONG yang terlihat sah** — nol gejala, laporan tetap terbit. Ditutup penjaga CI baru (lihat Utang Teknis) | Kecil |
| 16 | ~~**Rantai kontrak**~~ — LD arah kontraktor, EOT, register jaminan | PETA #9 · Lima Pembeda #5 = 2.5/5 | ✅ **SELESAI 2026-08-01** (migrasi 152). ⚠️ Peringatan lama **TERKONFIRMASI**: 091 memang denda **klien telat BAYAR** — arah berlawanan. Yang membuatnya bukan sekadar "salin lalu balik tanda": dasar hitungnya berbeda. 091 dari `invoices.due_date` yang TETAP; LD dari `projects.end_date` yang **bisa bergeser sah lewat EOT** (cuaca, lahan, perubahan lingkup). Menghitung LD dari `end_date` mentah = **menagih denda atas keterlambatan yang sudah dimaafkan secara kontraktual** — bukan angka salah, tapi tagihan yang tak bisa dipertahankan. Itulah kenapa EOT & LD lahir di migrasi yang sama: memisahkannya menciptakan jendela ketika LD hidup tanpa EOT, dan tiap angka di jendela itu salah. `lib/rantai-kontrak.ts`: **33 test + 6 uji mutasi**. Yang dipakai ulang dari 091: `daysLateWIB()` & pola `resolve*Terms()` (netral arah). **DEFAULT OFF** mengikuti 091 — nol perubahan perilaku sampai dinyalakan. UI: section di detail proyek (EOT + denda + jaminan bersama, karena satu persetujuan EOT bisa menghapus dendanya) | Sedang |

| 16b | **Uji mutasi menangkap test yang tak menjaga apa pun** | Temuan 2026-08-01 | ✅ **Diperbaiki.** Test "progres di luar 0..100 dijepit" hanya memeriksa `denda === 0` dan **lolos saat jepitnya dihapus**: progres 130 memberi dasar −300 jt yang tertangkap cabang `dasar <= 0`, jadi dendanya kebetulan tetap 0. Test menguji HASIL, bukan JALUR. Diperbaiki memeriksa `dasarPerhitungan` langsung + kasus progres negatif (yang tanpa jepit bawah memberi dasar 1,2 M — denda melampaui nilai kontraknya sendiri). Setelah diperbaiki: 6/6 mutasi tertangkap. Ini kedua kalinya uji mutasi menemukan test-yang-terlihat-menjaga dalam dua hari | Kecil |
| 17 | ~~**Paritas golden end-to-end 1 RAB nyata**~~ | GOLDEN-FILE-SPEC | ✅ **SELESAI 2026-08-01.** ⚠️ Catatan lama "menunggu workbook founder" **KELIRU** — `_source/ahsp/golden/RAB Gudang Cibuluh Sumedang bobot.xlsx` sudah ada sejak 26 Juli; item ini tak pernah benar-benar terblokir. `golden-boq-adapter.ts` (12 test + **5/5 uji mutasi**) + `golden-cibuluh.test.ts` (5 test terhadap RAB nyata). **Hasil: 65 pemeriksaan, NOL selisih** pada RAB Rp 3.629.860.295,31 — 55 item, 9 divisi, tiga level (item = vol × harga · divisi = Σ item · total = Σ divisi).<br><br>**Yang membuatnya sulit bukan aritmetikanya, melainkan STRUKTUR RAB nyata** — lima kali berturut-turut asumsi saya salah dan tiap kali gejalanya "Excel yang meleset": (a) `[IVXLC]+` menerima huruf `C` sub-kelompok sebagai romawi 100 → selisih semu Rp 550 jt; (b) divisi `IX`/`XIV` ditulis TANPA titik; (c) nomor `IV.` muncul DUA KALI (salah ketik dokumen yang tak pernah diperbaiki); (d) baris ber-nilai muncul SESUDAH subtotal; (e) `\w+(\d+)` serakah — `Q12` terbaca sebagai baris 2, membuang SELURUH item sementara laporannya terlihat rapi "9 divisi, 0 item".<br><br>Kunci penyelesaiannya: **rentang `SUM()` dibaca dari RUMUS Excel**, bukan diasumsikan dari posisi. Uji paritas yang menuduh sumbernya salah lebih berbahaya daripada tak ada uji — ia melatih orang mengabaikan hasilnya | Kecil |

| 17b | 💰 **TEMUAN: Rp 37.876.001 di RAB Cibuluh tertulis tapi TAK dijumlahkan** | Temuan 2026-08-01 | 🟡 **Butuh keputusan founder.** Rumus subtotal divisi III berbunyi `=SUM(Q34:Q65)`, sementara "Retaining Wall" (Pondasi Beton K225 + Dinding Beton K225 + Urugan Pasir) ada di baris 30–33. Uangnya tertulis di dokumen tapi tak masuk TOTAL Rp 3,63 M. **Dua kemungkinan, konsekuensinya berlawanan:** (1) disengaja — pekerjaan dibatalkan, barisnya sengaja ditinggal sebagai catatan; (2) salah ketik rentang saat menyisipkan baris — dan berarti RAB kurang Rp 37,8 juta. Sistem melaporkan, tidak memutuskan; angkanya di-assert di test supaya perubahan pada dokumen acuan tak lewat begitu saja | Kecil — butuh founder |

### Tingkat 5 — Nilai tampak, dependensi sudah lunas

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 18 | **Executive Cost Analytics** | CECEP/52 Gap-3 | 🟡 **API SELESAI 2026-08-01** (`GET /cost-analytics/portfolio` + `lib/cost-analytics.ts`). Agregasi lintas proyek dgn pagu BERJENJANG: RAP terkunci (rencana belanja) → RAB (rencana jual) → contract_value. Urutannya penting — memakai RAB berarti membandingkan belanja dengan harga JUAL, jadi serapannya terlihat lebih hemat dari kenyataan, dan itu dinyatakan di `meta.keterbatasan`. Syarat ROADMAP dipenuhi: respons SELALU membawa peringatan bahwa angkanya belum diadu ke realisasi belanja per-material (§D7 terkunci). Proyek tanpa pagu → `null`, BUKAN 0% (0% terbaca sebagai proyek paling hemat). Terverifikasi ke data nyata: 15 proyek, pagu Rp 8,96 M vs serapan Rp 631 jt, 3 keterbatasan tampil. 16 test + uji mutasi 3 arah. **UI SELESAI** — tab "Portofolio Biaya" di halaman Laporan; keterbatasan ditampilkan DI ATAS tabel (bukan catatan kaki — catatan kaki tak pernah dibaca sebelum keputusan diambil), dan kolom "Dasar pagu" membedakan serapan-vs-RAP dari serapan-vs-RAB. **#18 SELESAI** ✅ | Agregasi lintas proyek dari 3 sumber yang sudah hidup. ⚠️ Syarat lamanya "kerjakan SETELAH #8" **gugur** — #8 ternyata terkunci gerbang. Boleh dikerjakan lebih dulu, TAPI dashboard-nya wajib menyatakan eksplisit bahwa angkanya belum diadu ke realisasi belanja | Kecil |
| 19 | **Explainability trail** (`/explain` per item) | CECEP/50 · Constraint #1 | 🟡 **API SELESAI 2026-08-01** (`GET /estimate-items/:id/explain` + `lib/explain-item.ts`). Merangkai `hsp_snapshot` (migrasi 139) jadi 5 langkah yang bisa DIBACAKAN: harga tiap komponen pada tanggal berlaku → koefisien×harga → BUK → pembulatan → volume×HSP. **SNAPSHOT, bukan hitung ulang** — menghitung ulang hari ini memberi angka LAIN karena harga berubah, sehingga penjelasannya tak cocok dengan angka di dokumen penawaran (kebalikan dari tujuannya). Yang paling dijaga: penjelasan BOLONG harus MENGAKU bolong — item pra-139 tak ditebak-tebak, jumlah komponen yang tak cocok subtotal dilaporkan, harga override wajib disebut. 11 test + uji mutasi 3 arah. **UI SELESAI** — tombol "?" di tiap baris Komposer membuka dialog berisi 5 langkah + rincian komponen; peringatan ditampilkan MENONJOL di atas, bukan disembunyikan di bawah. **#19 SELESAI** ✅ | Constraint TERTINGGI CECEP, bukan fitur pinggiran. Fondasi sudah ada (migrasi 139/140); yang kurang endpoint+UI yang merangkai jejaknya jadi penjelasan | Sedang |
| 20 | **Laporan perbandingan antar-edisi AHSP** | AHSP-EDITION-BUILDER §3.5 | ⛔ **TERBLOKIR — terverifikasi ke DB 2026-08-01, bukan diasumsikan.** `ahsp_editions` berisi tiga edisi tapi hanya SATU yang ada isinya: `SE-47-2026` **2.620 analisa**, `SE-68-2024` **0**, `SNI-2013` **0**. Perbandingan antar-edisi mustahil kalau cuma ada satu edisi — tak ada yang bisa dibandingkan. **Butuh workbook AHSP SE-68-2024 dan/atau SNI-2013 dari founder.** Sumbu edisinya sendiri sudah dibangun penuh & teruji; yang hilang murni datanya. Taruhannya konkret: pindah edisi mengubah RAB −13,47% pada cakupan terukur | Sedang — butuh founder |
| 21 | ~~**Baseline schedule + look-ahead**~~ | PETA #11 | ✅ **SELESAI 2026-07-31 — PV kini berjenjang.** Sebelumnya PV cuma punya 2 sumber: `rab_schedule` manual (**0 baris di dev** — tak pernah diisi) dan normal CDF. Yang kedua benar secara matematis tapi tak ada hubungannya dengan rencana proyek ini, jadi SPI mengukur penyimpangan terhadap TEBAKAN. Padahal `rab_items.planned_start/end` (migrasi 052, dipakai Gantt) sudah berisi rencana sungguhan — kurva-S tak pernah membacanya. Ditambah **tingkat 2**: PV diturunkan dari tanggal Gantt, linear per hari. Terverifikasi ke data nyata: proyek pertama **cakupan 100%** (13/15 kategori, PV Rp 1,3 M dari rencana sungguhan), proyek kedua nol tanggal → jatuh ke CDF dengan benar. Respons kini membawa `rencanaSource` + `cakupanJadwalPct` supaya SPI-dari-rencana bisa dibedakan dari SPI-dari-tebakan. **Look-ahead 3-minggu SELESAI** (`GET /projects/:id/rab/look-ahead`): daftar apa yang harus dikerjakan minggu ini s.d. 3 minggu ke depan + yang sudah telat, diurut menurut PERHATIAN (telat terlama → berjalan → akan mulai; di dalam kelompok, nilai terbesar di atas). Terverifikasi ke data nyata: proyek-1 menyurfacekan **11 item telat senilai Rp 879 jt** (terlama 166 hari) — informasi yang sebelumnya tak bisa ditampilkan sistem sama sekali. **UI look-ahead SELESAI** — section baru di halaman proyek (tepat sesudah Gantt, karena keduanya membaca `planned_start/end` yang sama dan pertanyaan "harus siapkan apa?" muncul persis setelah melihat jadwal). Status dibedakan warna DAN teks (WCAG 1.4.1 — pemakai banyak membaca di HP di bawah sinar matahari), nilai rupiah ditonjolkan pada kelompok telat, dan daftar kosong dibedakan antara "tak ada pekerjaan" vs "jadwalnya belum diisi". UI pengisian baseline per-minggu **ternyata SUDAH ADA & terjangkau** (`RabScheduleModal`, dipicu tombol di section RAB — diverifikasi rantainya tombol→modal→API). Jadi `rab_schedule` yang 0 baris adalah soal PEMAKAIAN, bukan fitur yang hilang; dan itu justru alasan tingkat-2 (dari tanggal Gantt) dibangun. **#21 SELESAI** ✅ | Sedang |

### Tingkat 6 — Domain baru

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 22 | ~~**Bid register + backlog**~~ | PETA #10 | 🟡 **API SELESAI 2026-08-01** (migrasi 147 + `bids.ts` + `lib/bid-backlog.ts`). Satu tabel, SENGAJA bukan CRM pipeline (dicoret di PETA §Sengaja-tidak-dibangun). Menjawab dua hal yang tak terekam di mana pun: **(a)** kenapa tender kalah — `winner_value` membuat selisih harga terukur, jadi "kalah karena harga" bisa dibedakan dari "kalah karena syarat" (kalau kita LEBIH MURAH dan tetap kalah, menurunkan harga berikutnya membuang margin tanpa menambah peluang); **(b)** backlog — nilai yang sudah dimenangkan tapi proyeknya belum selesai, beban kapasitas yang menentukan layak-tidaknya ambil tender baru. `no_go`/`batal` sengaja tak masuk win-rate supaya kedisiplinan memilih tender tak dihukum. 24 test + uji mutasi. **UI SELESAI** — halaman `/tender` (tabel, bukan kanban: kanban mengundang pemakaian sebagai CRM yang justru dicoret, dan tabel lebih baik membandingkan angka antar-baris). **#22 SELESAI** ✅ | Kecil |
| 23 | ~~**Modul 12 — asset/alat (versi ringan sewa)**~~ → **Aset & alat PENUH** | ERP_MASTER_PLAN · PETA #12 | ✅ **SELESAI 2026-08-01.** Scope naik dari "ringan sewa" jadi PENUH mengikuti `KEPUTUSAN-SCOPE-ERP-AI.md`: register + mutasi antar-proyek + penyusutan + sewa. **Migrasi 149** (4 tabel, kategori B/C) — forward-draft 045 TIDAK dipakai apa adanya karena ditulis sebelum multi-tenant: nol `company_id`, nol RLS, dan `asset_code UNIQUE` **global** (perusahaan kedua tak bisa memakai 'AST-001') — cacat identik `financial_config` (145) & `feature_flags` (146), yang berarti menjalankannya apa adanya mengulangi pola yang sama untuk ketiga kalinya. `lib/aset.ts`: 27 test + **5 uji mutasi**, keduanya menjaga angka yang salahnya tak berbunyi — nilai buku tak pernah menembus residu (alat habis umur masih laku dijual, menyusutkannya ke nol menyatakan perusahaan tak punya apa-apa), utilisasi tumpang-tindih dihitung SEKALI (dua catatan di hari sama → >100%, angka mustahil yang meruntuhkan kepercayaan seluruh laporan), sewa mingguan dibulatkan KE ATAS seperti tagihan sebenarnya. **UI `/aset`** 2 tab + §9a lengkap (halaman + `middleware.ts` + `menu_items` migrasi 151). ⚠️ **Dua cacat tertangkap penjaga, bukan review** — lihat baris 23b/23c | Kecil → Sedang |

| 23b | **149 membuat 4 tabel MATI TOTAL — tertangkap `t5a`/`t7`** | Temuan 2026-08-01 | ✅ **Selesai (migrasi 150).** 149 memasang `tenant_isolation` RESTRICTIVE tapi **nol policy permissive**. Di PostgreSQL gabungannya `(semua RESTRICTIVE) AND (ada PERMISSIVE yang lolos)`, dan himpunan permissive KOSONG bernilai FALSE — jadi keempat tabel tak terbaca **siapa pun**. Cacatnya SENYAP: API tetap bekerja hari ini karena `service_role` mem-bypass RLS; ia baru muncul saat T5c dikerjakan, dengan gejala "halaman aset kosong tanpa error" — kegagalan yang paling lama dilacak. Uji mutasi membuktikan penjaganya nyata: policy dihapus → merah, dipulihkan → hijau | Kecil |

| 23d | **Migrasi `059` tercatat di buku tapi berkasnya tak ada** | Temuan 2026-08-01 | 🟡 **Terdata, belum ditindak.** Rekonsiliasi memberi 148 berkas vs **149 tercatat**; selisihnya versi `059`, yang tak punya berkas di `db/migrations/`, nol jejak di `git log -S`, dan nol sebutan di dokumen mana pun. Ini **kebalikan** dari migrasi hantu 043 (berkas ada, objek tidak): di sini catatannya ada, berkasnya yang hilang. Dampak praktisnya kecil — `ci-project-setup.mjs` hanya melewatinya — tapi ia membuat rekonsiliasi tak pernah bisa "bersih sempurna", dan penjaga yang selalu menyisakan satu anomali melatih pembacanya mengabaikannya. **Tidak disentuh**: menghapus catatan tanpa tahu apa yang pernah dijalankan berisiko lebih besar daripada membiarkannya | Kecil |

| 23c | **Generator peta tenancy buta terhadap anak tabel-B** | Temuan 2026-08-01 | ✅ **Selesai.** `gen-tenant-map.mjs` hanya melacak rantai FK ke `projects`; tabel anak dari tabel **B** jatuh ke kategori **A — katalog bersama, TANPA scope sama sekali**. Ketahuan saat `asset_movements`/`asset_depreciation_logs` lahir. Ini **bukan cacat khusus aset**: tabel B mana pun yang punya anak akan kena, jadi diperbaiki di akar (lacak rantai ke akar mana pun) bukan dengan mengecualikan empat tabel. Perbaikannya sempat memindahkan `worker_kasbons` dari `project_id` ke `worker_id` — keduanya sah, tapi mengubah jalur scope tabel yang SUDAH dipakai adalah perubahan perilaku diam-diam, jadi `projects` diberi prioritas. Hasil: **hanya 4 tabel aset bertambah, 107 tabel lama identik** | Kecil |
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
| Sidebar: tinggi collapse & state grup | penjaga struktural (bukan angka) | `apps/web/scripts/sidebar-ratchet.mjs` — **penjaga baru 2026-08-01**. Melarang `maxHeight` ber-angka-mati, state collapse per-nama-grup, hilangnya `prefers-reduced-motion` & `aria-expanded`. Diuji mutasi 4/4 |
| Kolom `.select()` yang tak ada di skema | 6 (semuanya false-positive terverifikasi: regex memasangkan `select` ke `from` yang salah dalam satu `Promise.all`) | `apps/api/scripts/audit-kolom-select.mjs` — **penjaga baru 2026-08-01**, lahir dari 6 bug kelas ini dalam satu hari. Menjaga PENYEBAB (nama kolom salah); pasangannya di bawah menjaga GEJALA. Diuji mutasi: kolom ngawur → exit 1 |
| Query yang errornya tak pernah dilihat (`?? []`) | 186 | `apps/api/scripts/audit-kegagalan-senyap.mjs` — **penjaga baru 2026-08-01**, lahir dari Rp 631,7 jt yang hilang di kurva-S. Diuji mutasi: pola berbahaya baru → exit 1 |

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
| 2026-08-01 | Item **#17 tuntas** — paritas golden terhadap RAB nyata Rp 3,63 M: 65 pemeriksaan, NOL selisih. Catatan lama "menunggu workbook founder" ternyata keliru — berkasnya sudah ada sejak 26 Juli. Lima kali berturut-turut asumsi struktur RAB saya salah, dan tiap kali gejalanya menyesatkan: "Excel meleset Rp 550 juta" padahal pembacaan yang keliru. Ikut ditemukan: Rp 37,8 juta di RAB itu tertulis tapi di luar rentang `SUM()` — butuh keputusan founder |
| 2026-08-01 | **Peta menu penuh** (migrasi 153) — permintaan founder: daftarkan semua menu yang nantinya akan ada, jangan hanya yang sudah dibangun. 20 grup + 202 sub-menu dari taksonomi, dikurangi 6 yang dicoret owner; QA/QC, HSE & Risiko dirinci sendiri karena taksonomi hanya menulis "semua merah". Menu tanpa halaman menunjuk `/m/<key>` yang menjelaskan APA yang akan dibangun, KENAPA belum ada (dibedakan: *belum sempat* vs *menunggu tender mensyaratkan* vs *sengaja pakai tool luar*), dan KE MANA sementara ini. **Sidebar diperbaiki di akar**: `maxHeight` angka mati (140px/80px) dan state per-nama grup diganti tinggi terukur + satu Set — pola lama akan memotong **13 dari 18 submenu tanpa gejala** dan membuat grup ke-21 mustahil dibuka. Fitur per-proyek (Kurva S, Gantt, EVM) tidak jadi menu global: halamannya menampilkan daftar proyek untuk dipilih, mengikuti pola Primavera/Odoo — menu adalah tempat kerja, bukan daftar fitur |
| 2026-08-01 | Item **#16 tuntas** — rantai kontrak (migrasi 152). Peringatan "091 arahnya terbalik" terkonfirmasi, dan akarnya lebih dalam dari dugaan: bukan cuma arah uang, tapi **dasar tanggalnya** — `due_date` tetap vs `end_date` yang bergeser lewat EOT. Pelajaran 149 langsung diterapkan: RESTRICTIVE **dan** PERMISSIVE dipasang sekaligus, dan blok verifikasi migrasi ikut memeriksa "nol permissive = tabel mati total". Uji mutasi kembali menangkap test yang tak menjaga apa pun (lihat 16b) |
| 2026-08-01 | Item **#23 tuntas** — aset & alat PENUH (migrasi 149/150/151). Dua penjaga membuktikan diri pada tabel yang baru lahir: `t5a`/`t7` menangkap 4 tabel MATI TOTAL (restrictive tanpa permissive) yang tak terlihat di review dan takkan berbunyi sampai T5c; dan penjaga rute + ratchet lint menangkap regresi `set-state-in-effect` (71 vs ambang 70) yang diperbaiki dengan memisahkan `muatUlang()` dari `muat()`, **bukan** dengan menaikkan ambang. Ikut lahir `apply-migrasi.mjs` yang apply + catat buku dalam satu langkah — menutup akar 20 migrasi tak tercatat |
| 2026-08-01 | **Aturan #2 diaudit — 2 dari 5 sumber merge ternyata belum ditandai.** Hanya 4 dari 235 dokumen `docs/` yang menyebut ROADMAP; `PETA-PRIORITAS-ERP.md` masih mengaku "menyatukan semua rencana" dan Blueprint 01 tak menyebutnya sama sekali. Keduanya kini ditandai. Auditnya menemukan **satu item yang tak ada di ROADMAP**: PETA §3 #7 "aktifkan audit append-only (073)" — dan verifikasi ke `pg_trigger` membuktikan **trigger-nya SUDAH aktif** (`tgenabled='O'`, PR #13). Yang salah adalah komentar `⚠️ DORMAN` di berkas migrasi 073 yang tak pernah diperbarui setelah gerbang founder dibuka; dua dokumen mengutipnya sebagai gap terbuka berbulan-bulan. Header migrasi + taksonomi dikoreksi. **Kriteria Kualitas #1 naik dari "kuat sebagian" ke "kuat"** — tanpa satu baris kode pun ditulis |
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
