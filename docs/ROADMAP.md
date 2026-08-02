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

## 🗺 PETA SELURUH VISI — empat gelombang

> **Ditambahkan 2026-08-01 karena dokumen ini pernah bohong tanpa sengaja.**
> Ia mengaku *"satu tempat untuk menjawab apa berikutnya"*, tapi isinya HANYA
> Gelombang 1. Gelombang 2–4 — GL in-app, QA/QC+HSE, payroll, aset penuh,
> mobile offline, 140 automation AI — nol heading, nol item, nol angka.
> Pembacanya menyimpulkan "tinggal 4 item lagi" padahal itu sebagian kecil.
> Penyebut yang tak jujur lebih berbahaya daripada angka yang besar.

### Dua keputusan founder yang mengikat seluruh dokumen ini

| Keputusan | Isi | Konsekuensi |
|---|---|---|
| **Urutan** (2026-08-01) | **Pondasi dulu, fitur ditahan.** | Sesudah peta ini rapi: habiskan utang teknis & keamanan sampai bersih SEBELUM menambah menu apa pun. Nol fitur baru untuk beberapa sesi. |
| **Definisi "matang"** (2026-08-01) | **Seluruh visi, termasuk AI.** | Sistem TIDAK dipakai operasional sampai Gelombang 4 selesai. Artinya nol umpan balik data nyata sampai saat itu — dan itu diterima sadar. |

Kombinasi keduanya konsisten: karena tak ada tenggat "harus cepat berguna",
memilih pondasi lebih dulu tidak mengorbankan apa pun.

### Penyebut yang jujur

Diukur dari `ERP-KONTRAKTOR-TAKSONOMI-MENU.md`, **256 baris menu** terverifikasi
ke kode (angka lama "191" menghitung sebagian tabel saja; diperbarui 2026-08-02
sesudah 12 status basi dikoreksi — lihat §"SELURUH SUB-MENU YANG BELUM TUNTAS"):

| Status | Jumlah | Arti |
|---|---:|---|
| ✅ selesai | 99 | hidup end-to-end |
| 🟡 sebagian | 63 | ada, belum lengkap |
| 🔴 belum | 77 | belum dibangun |
| 🔵 belum dibangun | 9 | Capability Tier-2 sisa |
| ⛔ dicoret | 8 | keputusan owner |

**39% selesai · 25% sebagian · 30% belum.** Angka "71%" yang pernah tertulis di
dokumen ini menghitung penyebut yang salah — hanya item ROADMAP yang sudah
terdaftar, bukan seluruh visi.

### Isi tiap gelombang

```
GELOMBANG 1 — PONDASI + ITEM SISA                        ← SEKARANG
  · item ROADMAP di bawah (#14, #24 sisa)
  · utang pondasi: tenantDb · kontras WCAG · RLS per-role · Web Push
  ↓ gerbang: pondasi bersih, bukan sekadar item habis

GELOMBANG 2 — KANTONG YANG BARU MASUK (KEPUTUSAN-SCOPE §2)
  · GL in-app + CoA + auto-jurnal      ← muara integrasi antar-modul
  · QA/QC formal (7 sub-menu)
  · HSE/K3 (7 sub-menu)
  · payroll + BPJS + PPh 21
  · aset & alat berat penuh
  ↓ gerbang: GL menerima dari seluruh modul

GELOMBANG 3 — MOBILE LAPANGAN PENUH + OFFLINE
  · menutup Kriteria Kualitas #5 yang kini LEMAH
  ↓ gerbang: modul menerima dari lapangan

GELOMBANG 4 — AI
  · pilot read-only → WhatsApp Gateway → 13 automation "Next"
  · gerbang EKSTERNAL: akun WhatsApp Business API (berbayar + verifikasi
    Meta) & kredensial integrasi luar — di luar kendali teknis
```

Urutan ini **bukan selera**: tiap panah adalah dependensi data. AI membaca GL,
GL menerima dari modul, modul menerima dari lapangan. Membangun AI di atas
pembukuan yang belum benar menghasilkan jawaban yang percaya diri dan salah.

### Yang belum punya keputusan

**± 30 sub-menu 🔴 belum punya alasan tertulis** — belum diputus dikerjakan,
dieksternalkan, atau dicoret. Memutuskannya jauh lebih murah daripada
membangunnya, dan tanpa keputusan itu penyebut di atas masih bisa bergeser.

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
| 14 | **ADR-011-T4 — 468 akses `supabase` mentah di 9 modul** | ADR-011-T4 | 🟡 **Sebagian — celah nyata tertutup, hutang adopsi tersisa.** Angka 468 selama ini mencampur dua hal berbeda; `audit-gerbang-tenancy.mjs` (14e) memisahkannya: **202 rute** ber-supabase-mentah, **195 bergerbang** (naik dari 193). Dari 9 rute tak-bergerbang, **satu celah nyata** ditemukan dan ditutup (14f); 7 sisanya sah lintas-tenant by design — login & Google callback (belum ada tenant saat dipanggil), `/permissions` & `/auth/me/permissions` (katalog capability bersama), subscribe/unsubscribe push (berkunci `user.id`), upload foto kasbon (berkunci pengunggah). Ambang ratchet dikencangkan 9 → 7. Yang tertinggal murni **hutang adopsi** — mengalihkan akses mentah ke `tenantDb()` supaya scoping tak lagi bergantung ingatan penulis rute. Bukan celah keamanan; ratchet menjaganya tak memburuk. **Dicicil 2026-08-01:** 9 query di `reports.ts` (laporan proyek) dialihkan ke `viaProject()`; dibuktikan **behavior-preserving** dengan membandingkan hasil kedua jalur pada data nyata (invoices 1, milestones 4, progress_logs 3, assignments 3 — identik). Ratchet T4f dikencangkan **468 → 459**, dan uji mutasi membuktikan ia menggigit lagi (satu akses mentah tambahan → merah). **Catatan metode:** tiga alat pengukur "berapa yang belum ter-scope" yang saya bangun berturut-turut semuanya MENUDUH PALSU — jendela 25 baris, lalu 12 baris, lalu per-statement — karena penyaring tenant sering berupa variabel yang dideklarasikan puluhan baris di atas (`const idProyek = await db.projectIds()` lalu `.in('project_id', idProyek)`), dan query kadang dibangun bertahap (`let q = …` lalu `q = q.in(...)`). Pengukuran akhirnya dilakukan dengan MEMBACA kode, bukan membangun alat keempat. Yang terungkap: sisa akses mentah terbagi **tiga jenis, dan dua di antaranya TAK BISA dialihkan** — (1) **`.storage`** 15 akses, bucket tak punya konsep tenant sama sekali (`tenantDb` menyediakan `.raw` justru untuk itu); (2) **operasi by-id lintas-proyek** `.eq('id', id).in('project_id', await db.projectIds())` — `viaProject()` butuh satu `projectId` yang di sini justru BELUM diketahui, karena yang dicari adalah "apakah id ini milik salah satu proyek saya". Pola yang BENAR untuk bentuknya, dipakai konsisten di `finance.ts` (38 akses) dan `procurement.ts` dengan komentar T4i yang menjelaskan sebabnya; (3) **gerbang tunggal di atas banyak query** — `reports.ts` memeriksa sekali lalu menjalankan 14 query, berkomentar "satu kelupaan = seluruh gerbang tak berguna". **Konsekuensinya: ambang ini tak akan sampai nol, dan itu bukan kegagalan** — dicatat di kepala `tenancy-ratchet.test.ts` supaya pembaca berikutnya tak mengejar angka yang tak bisa turun. Yang MASIH hutang: akses mentah pada tabel kategori C di rute yang `projectId`-nya sudah diketahui — itu yang harus terus turun. Ratchet **468 → 459 → 458** | Besar |

| 14b | **`financial_config` anti-overlap lintas-tenant** | Temuan 2026-07-31 | ✅ **Selesai** (migrasi 145). Constraint `no_overlap_financial_config` (086) mengunci `(key, daterange)` SAJA; migrasi 127 menambah `company_id NOT NULL` tapi constraint-nya tak ikut. Akibatnya **badan usaha kedua TIDAK BISA menetapkan tarif pajaknya sendiri** — perusahaan pertama memegang rentang tanggalnya. Dibuktikan di dev sebelum & sesudah (rollback): `23P01` → berhasil. Ikut ditutup: `setFinancialConfig()` menutup rentang lama **tanpa filter company** (menyapu tarif SELURUH perusahaan) dan menyisip tanpa `company_id`; `companyId` kini **wajib** di tipenya, jadi "lupa" gagal saat kompilasi. 6 test + mutation-tested 3 arah | Kecil |

| 14c | **Buku besar migrasi meleset dua arah** | Temuan 2026-07-31 | ✅ **Selesai.** `schema_migrations` tak bisa dipercaya: **20 migrasi sudah jalan tapi tak tercatat** (seluruh seri multi-tenant 126–137, RAP 138, provenance 139/140) — sebabnya DDL dijalankan lewat skrip sekali-pakai tanpa menulis bukunya. Bahayanya konkret: `ci-project-setup.mjs` memutuskan "apa yang perlu dijalankan" murni dari buku itu, jadi diarahkan ke dev ia akan **menjalankan ulang 20 migrasi** termasuk penulisan ulang policy RLS (131–134) dan backfill (127). Alat rekonsiliasi baru membuktikan tiap migrasi ke `pg_class`/`pg_proc`/`pg_indexes`/`pg_constraint` dulu dan **menolak** mencatat yang tak lengkap — bukan `INSERT` buta, karena mencatat yang belum jalan sebagai "sudah" persis mengulang cacat 043–047. Hasil: 15 terbukti otomatis + 5 diverifikasi manual (policy/data-only) → **0 tersisa**, dan simulasi membuktikan nol migrasi akan dijalankan ulang. Akar masalahnya ditutup di AUTOPILOT §9b | Kecil |

| 14d | **Aksesibilitas: 296 pelanggaran WCAG AA + penjaganya** | Audit axe login nyata 2026-07-31 | ✅ **SELESAI 2026-08-01 — nol kontrol tanpa nama, ambang dikencangkan ke 0/0.** Audit axe dengan login NYATA menemukan 296 pelanggaran di 17 halaman (kontras ×260, button-name ×14, select-name ×9, label ×9) — **nol** di antaranya terlihat oleh `eslint-plugin-jsx-a11y` yang sudah aktif penuh, karena plugin itu tak punya rule untuk kontrol yang berdiri TANPA label. Perjalanan angkanya **96/62 → 28/24 → 8/6 → 0/0**. Nama diturunkan dari konteks pemakaian, bukan disamakan: `purpose` muncul dua kali (kasbon tukang vs kasbon mandor), `cashAccountId` dua kali (menerima pembayaran vs memotong kasbon), dan dua pasang `<select>` identik ternyata milik dua modal berbeda (rencana vs serapan) — nama tetap akan membuat pembaca layar menyebut keduanya sama persis. Label dinamis dipakai di mana isinya dinamis (`Tampilkan proyek berstatus ${tab.label}`, `Ubah jadwal ${t.uraian}`). **Bagian yang jujur:** penurunan 8/6 sebagian **bukan** hasil memberi nama — jendela pencarian teks tombol yang 14 baris terlalu sempit untuk repo ini (tombol rutin punya `style` inline 10 baris + dua handler mouse, sehingga teksnya baru muncul di baris ke-19; `milestone-modal.tsx:263` berteks "Simpan Perubahan" dan tetap dilaporkan tanpa nama). Dilebarkan ke 40 baris; TIDAK melonggarkan karena batas sebenarnya `</button>`, dan dibuktikan uji mutasi — tombol ikon-saja tetap tertangkap. Hutang palsu sama merusaknya dengan kebutaan: ia melatih pembacanya mengabaikan laporan. Percobaan mengubah `Field` jadi label pembungkus **dibatalkan** — pembungkusan terjadi lintas berkas (label di komponen, kontrol di pemanggil), tak terdeteksi penjaga statis, jadi menambah kerumitan tanpa manfaat terukur. ✅ **Kontras warna AKHIRNYA DIJAGA 2026-08-01** (`kontras-ratchet.mjs`, di CI). Catatan lama berbunyi "butuh browser + login, kredensial di CI ditolak sadar" — benar untuk **axe**, tapi TIDAK untuk **token**: warnanya literal di `globals.css` dan kontras adalah aritmetika murni atas dua nilai hex. Yang memang tak bisa dijaga statis hanyalah "pasangan mana yang bertemu di layar" — dan itu sudah tercatat, karena tiap perbaikan 2026-07-31 menyebut latar yang diuji. **Penjaga ini menemukan pelanggaran pada jalan PERTAMANYA**: `--danger` mode gelap **4,47:1** (syarat 4,5) — 4,04 di `--surface-raised`, 3,83 di `--surface-hover`. Lolos berbulan-bulan karena audit axe hanya menjalankan **mode terang**; mode gelap tak pernah diaudit sama sekali. Diganti `#F87171` (lulus 5,21–6,82 di seluruh latar gelap, tetap jelas merah). 38 pasangan token dijaga di kedua mode; uji mutasi 2 arah. **Hutang tersisa terukur: 394 hex mentah** di komponen yang tak lewat token — persis cara 260 pelanggaran lolos dulu; ber-ambang, tak dipaksa nol karena mengubahnya sekaligus butuh audit axe ulang | Sedang |

| 14h | **`approval_chains`: badan usaha kedua tak bisa punya rantai sendiri** | Temuan 2026-08-01 (saat menyiapkan #24c) | ✅ **Selesai** (migrasi 158). **Pola yang sama untuk KEEMPAT kalinya.** `company_id NOT NULL` sudah ditambahkan T4h, tapi keunikannya masih **`UNIQUE (entity_type)` GLOBAL** — jadi `INSERT` rantai 'kasbon' untuk company B gagal 23505 karena company A sudah memakainya. Identik dengan `financial_config` (145), `feature_flags` (146), `modules` (155): kolom ditambahkan, constraint uniknya tidak ikut. Yang membuatnya lolos berulang adalah gejalanya **nol selama masih satu company**. **Akibatnya lebih besar daripada tiga pendahulunya**, karena `steps.length === 0` bersifat **fail-closed** (ADR-007): company kedua yang tak bisa punya rantai berarti **nol orang bisa menyetujui apa pun di sana** — kasbon, change order, pengeluaran, estimasi, semuanya beku, dan gejalanya "403 Akses ditolak" untuk semua orang, bukan pesan konfigurasi. Ditemukan karena asumsi kolom **diverifikasi ke `pg_constraint` sebelum menulis migrasi**, bukan setelah gagal. `loadSteps()` sudah membaca `.eq('company_id')` — kodenya sudah benar, hanya constraint yang menahan. Uji mutasi: mengembalikan UNIQUE global membuat **5 test merah** | Kecil |

| 14i | **API dan RLS memakai PERAN yang berbeda** | Audit lanjutan 14j, 2026-08-01 | ✅ **Selesai.** Migrasi 144 (item #13) mengubah `auth_role()` — dipakai **100 RLS policy** — jadi membaca `company_members.role_id` untuk company aktif. **Sisi API tidak ikut**: `authenticate()` mengambil peran dari `users.role_id` (global) dan menyerahkannya ke `get_role_permissions()`, yang menentukan SETIAP `requirePermission`. Dua lapis otorisasi menjawab peran berbeda. Dibuktikan di dev (rollback): user `wardianto` peran global `mandor` dinaikkan jadi `admin` hanya di companynya → `auth_role()` = **admin**, `currentUser.role` = **mandor**. Salah dua arah, dan arah kedua adalah **eskalasi hak akses**: global `admin` + peran company `mandor` → API memberi seluruh **95** permission admin di badan usaha yang bukan wewenangnya (`mandor` hanya 11). Diperbaiki di akar: `resolveCompanyId()` sekaligus mengembalikan peran keanggotaan. Nol divergensi hari ini karena baru satu badan usaha — tapi 22/22 keanggotaan sudah punya `role_id` dan endpoint ubah-peran-anggota sudah ada, jadi jalurnya hidup. **Pelajaran metode:** test pertama (`t10`, DB nyata) menulis ULANG query-nya, jadi mengembalikan `auth.ts` ke perilaku lama tetap **hijau 403/403** — uji mutasi yang menangkapnya. Ditambah `auth-peran-company.test.ts` yang memanggil `authenticate()` sungguhan; 13 test, mutasi 3 arah tertangkap. Komentar `auth.ts` yang berbunyi "di masa depan peran dibaca dari company_members" akhirnya benar | Kecil |

| 14j | **`modules`: satu perusahaan mematikan modul untuk SEMUA** | Audit 9 rute tak-bergerbang 2026-08-01 | ✅ **Selesai** (migrasi 155). `modules` berkategori **A (katalog global)** dan `is_enabled` disimpan di baris katalog itu — jadi `PATCH /api/v1/modules/:key` menulis ke baris yang dipakai bersama seluruh perusahaan: A mematikan "procurement" → mati untuk B, C, dan tiap pelanggan SaaS. Endpointnya **sudah** bergerbang `settings:manage`; yang salah bukan siapa boleh menekan, tapi **cakupan akibatnya**. Diubah ke kategori **AB** meniru `feature_flags`: baris `company_id IS NULL` = katalog "modul apa yang ada", baris ber-company = pengecualian. `UNIQUE (key)` global dilepas (kalau tidak, perusahaan kedua tak bisa punya pengecualian — cacat identik 145 & 146), diganti `UNIQUE (company_id, key) NULLS NOT DISTINCT`. Ikut ditutup: **cache `isModuleEnabled()` berkunci `key` saja**, jadi jawaban A disajikan ke B selama TTL 60 detik — kebocoran tanpa jejak di query log mana pun, karena querynya memang tak dijalankan; dan `isFeatureEnabled()` masih memaksa `company_id IS NULL` sehingga override yang sejak migrasi 146 **bisa disimpan tak pernah terbaca**. **Dampak hari ini nol** — `isModuleEnabled()` diverifikasi punya nol pemanggil (grep seluruh `src/`, bukan diasumsikan). Justru itu alasan memperbaikinya sekarang: saat pemanggil pertama lahir, cacatnya tampak sebagai "modul mati sendiri" dan dicari di tempat yang salah. 12 test, 4 arah uji mutasi | Kecil |

| 14e | **scope-item bisa disunting lintas-tenant** | Audit gerbang 2026-07-31 | ✅ **Selesai.** `resolveScopeItemOwnership()` hanya menerima `itemId`, mencari baris dengan `.eq('id')` SAJA, lalu pemanggil memeriksa `pm_id`/`mandor_id`. Yang terlewat: **admin tak difilter sama sekali** — admin company A yang tahu UUID scope-item company B bisa PATCH volume/harga, DELETE item, atau ubah realisasi progres (ketiganya menulis; `unit_price × volume` masuk nilai pekerjaan mandor). Dibuktikan di dev (rollback). Diperbaiki: helper menerima `request`, query membawa `company_id` proyek induk, dibandingkan ke company aktif. 5 test + uji mutasi. **Alat baru `audit-gerbang-tenancy.mjs`** memisahkan "akses mentah SESUDAH gerbang" (aman, hutang adopsi) dari "tanpa gerbang" (celah) — ratchet 468 selama ini mencampur keduanya. Nama gerbang DITURUNKAN dari sumber, bukan didaftar tangan: daftar manual selalu ketinggalan satu dan tiap yang ketinggalan adalah tuduhan palsu (58 → 36 → 17 saat daftarnya dilengkapi). Hasil: 202 rute ber-supabase-mentah, **185 bergerbang**, 17 perlu ditinjau | Kecil |

| 14f | **5 celah tenancy lagi dari tinjauan 17 rute** | Audit gerbang 2026-07-31 | ✅ **Selesai.** Ditemukan dengan meninjau satu per satu rute yang dilaporkan `audit-gerbang-tenancy.mjs`: (a) `PATCH /reports/rekap-pajak/:id/status` — sunting status pelaporan pajak + nomor e-Faktur perusahaan mana pun yang id-nya diketahui; (b) `GET /procurement/stocks/:project_id/movements` — baca seluruh mutasi stok proyek tenant lain, bahkan tanpa permission khusus; (c) `GET /cash/expenses/summary-by-category` **tanpa** `project_id` menjumlahkan pengeluaran approved SEMUA perusahaan jadi satu angka — bukan bocor per-baris, tapi menyajikan total keuangan tenant lain; (d) `POST /mandor/work-scopes` mempercayai `assignment_id` dari body, jadi lingkup kerja (+`borongan_value`) bisa disisipkan ke penugasan perusahaan lain; (e) `feature_flags` `UNIQUE(key)` GLOBAL padahal kategori AB — **pola identik migrasi 145**, dan upsert-nya `onConflict: 'key'` menimpa baris tenant lain. Ditutup migrasi 146 (`UNIQUE(company_id,key) NULLS NOT DISTINCT`) + endpoint di-scope. Tinjauan dilanjutkan ke 12 rute sisa dan menemukan 3 lagi: `GET /reports/rekap-pajak` (daftar pajak SEMUA perusahaan, lengkap NPWP & nama klien — data pribadi pihak ketiga), `POST /roles` (role custom lahir tanpa `company_id` → dianggap role BAWAAN dan muncul di perusahaan lain), `GET /mandor/list` (dropdown assign menampilkan mandor seluruh perusahaan + no. HP & email). Hasil akhir: **192 dari 201 rute bergerbang** (dari 182); 9 sisanya sah lintas-tenant by design (login, katalog global `modules`, tulisan self-scoped `.eq(id, user.id)`) | Kecil |

| 14g | **Modul "hidup di API, mati di UI" — hasil audit jalur hidup** | AUTOPILOT §9a, 2026-07-31 | 🟡 **Terdata, belum dibangun.** Diverifikasi satu per satu, bukan diasumsikan: **(a) Lessons Learned** — angka diperbarui 2026-08-01: **828**, bukan 668. Tabelnya `lessons_learned_records` (bukan `lessons_learned`). Diverifikasi ulang: **913 dari 913** ber-`[TEST]` (diverifikasi ulang 2026-08-01 malam; naik dari 828 karena suite test hari ini menambah barisnya sendiri — bukti bahwa angkanya memang tumbuh dari test, bukan dari pemakaian) — nol data nyata, nol UI, nol menu. Penghapusannya tetap menunggu izin (keputusan terbuka #1c). **⚠️ TEMUAN SAAT MEMERIKSANYA — lebih penting daripada Lessons Learned itu sendiri:** `cleanup-cecep-residue.mjs` memakai `DELETE FROM <tabel>` **TANPA `WHERE`** — ia MENGOSONGKAN tabel, bukan menyaring residu. Saat ditulis itu benar; keadaannya sudah berubah. Dry-run hari ini menunjukkan ia akan menghapus **34.691 baris**, di antaranya **8.923 baris yang NOL-nya bertanda `[TEST]`**: `assemblies` 3.043 (analisa AHSP SE-47-2026, satu-satunya edisi yang berisi) · `assembly_components` 17.873 · `resources` 2.830 · `price_book_entries` 3.006 (dipakai SETIAP perhitungan RAB) · `cost_codes` 44. Yang berbahaya bukan perintah DELETE-nya, melainkan jaraknya dengan nama skrip: "cleanup residu" terbaca seperti membuang sampah sampai seseorang membaca 40 baris ke bawah. ✅ **Ditutup**: `assertMemangResidu()` menolak jalan bila ada tabel berisi baris non-`[TEST]`, ditampilkan di dry-run juga (peringatan yang hanya muncul saat `--execute` baru terbaca ketika jarinya sudah di tombol), dan tanpa flag `--paksa` — mengosongkan tabel harus jadi penyuntingan sadar, bukan satu argumen jauhnya. Diuji: `--execute` ditolak exit 1, nol baris terhapus. **(b) `GET /settings/config`** — ⛔ **DIPERIKSA 2026-08-01: SENGAJA tidak dibangun UI-nya, dan catatan awal keliru menyebutnya "mati".** Configuration Engine HIDUP, hanya lewat endpoint spesifik, bukan endpoint generiknya: `company_settings` berisi **5 key**, dan seluruhnya sudah punya jalur pakai — `tax.pph_final_rate`/`tax.ppn_rate` lewat `/pengaturan/keuangan`, `project.dp_default_pct`/`project.maintenance_days` lewat `GET /settings/project-defaults` yang **sudah dipanggil** `project-modal.tsx:144`, `kasbon.limit.enabled` lewat pengaturan kasbon. Membangun layar config terpadu berarti membuat **dua tempat mengubah nilai yang sama** — persis kelas cacat `shadow 1C` yang ADR-006 sudah retire, dan yang di sini akibatnya lebih halus: dua layar yang menyimpang diam-diam pada tarif pajak. Yang nol pemanggil hanyalah endpoint GENERIKnya, dan itu memang cadangan untuk key yang belum punya layar sendiri. **Bukan hutang; keputusan.** **(c) `price-overrides`** — ✅ **DIHIDUPKAN 2026-08-01**: section "Harga khusus proyek" di tab Harga halaman Estimasi. Temuannya lebih tajam daripada catatan awal — `project_price_override` ternyata sudah dipakai **tiga jalur perhitungan** (`price-resolver.ts`, `ahsp.ts`, `estimate-versions.ts`) dan alasannya bahkan muncul di explainability trail, tapi nol pemanggil dari web: fitur yang SUDAH mempengaruhi angka RAB hanya bisa dipakai lewat panggilan API langsung, dan tabelnya nol baris. Diletakkan di dalam tab Harga, bukan tab sendiri — override adalah pengecualian atas price book, dan memisahkannya membuat orang menyetel harga khusus tanpa melihat harga umumnya. API menerima `resource_id` (UUID) sehingga form memakai cari-sambil-ketik ke `/cecep/resources`, bukan meminta orang mengetik UUID; hasil yang datang terlambat diabaikan supaya mengetik cepat tak menampilkan hasil kata yang sudah ditinggalkan. Dibuktikan ujung ke ujung: override Rp 999.999 disisipkan, terbaca, di-rollback. Sisa (a) & (b) belum. Ketiganya BUKAN bug: kodenya benar dan teruji — yang kurang jalur pemakaiannya, persis kelas cacat yang §9a dibuat untuk menangkap | Sedang |

### Tingkat 4 — Pelaporan & kepatuhan

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 15 | ~~**WIP / pengakuan pendapatan (PSAK)**~~ | PETA #8 · Lima Pembeda #3 = **0/5** | ✅ **SELESAI 2026-08-01.** Tripwire "keputusan multi-company DULU" **sudah terbuka** (Program D tuntas) — diverifikasi ke `KEPUTUSAN-MULTI-COMPANY.md`, bukan diasumsikan. `lib/wip-psak.ts`: **21 test + 6/6 uji mutasi**. Dua metode persentase dipertahankan berdampingan — **cost-to-cost** (standar audit, berbasis angka terekam) dan **fisik** (lebih dekat kenyataan tapi berbasis penilaian); memilih salah satu diam-diam menyembunyikan sinyal justru pada proyek yang paling perlu diperiksa. Yang paling dijaga: **CIE ≠ BIE** — BIE adalah uang yang sudah diterima untuk pekerjaan yang BELUM ADA, dan kontraktor yang tak membedakannya merasa kaya di tengah proyek lalu kehabisan uang di akhir. Keduanya dijumlahkan TERPISAH (di neraca satu aset, satu liabilitas — saling menghapuskannya menyembunyikan kedua-duanya). Biaya melampaui estimasi dijepit 100% & dilaporkan sebagai KERUGIAN, bukan pendapatan ekstra. **Terverifikasi ke data nyata:** 15 proyek, pendapatan diakui Rp 1,82 M, **BIE Rp 730 jt** (utang pekerjaan yang selama ini terlihat seperti kas) dan **1 proyek rugi Rp 393 jt** — keduanya tak pernah bisa ditampilkan sistem sebelumnya. UI: tab **WIP / Pengakuan** di halaman Laporan, keterbatasan DI ATAS tabel | Sedang |

| 15e | 🔴 **Lima bug kolom-salah lagi, semuanya gagal senyap** | Temuan 2026-08-01 | ✅ **Diperbaiki.** Menyisir SELURUH rute terhadap `information_schema` (bukan menebak) menemukan lima lagi di luar kurva-S, semuanya kelas cacat yang sama — query gagal, `?? []` menelannya, fitur mati tanpa gejala: **(a)** `search.ts` — `clients.name` (→`company_name`), jadi **pencarian klien SELALU nol hasil**; **(b)** `projects.ts` — `expense_category_templates.description` tak ada, jadi auto-clone kategori ke proyek baru **tak pernah sekali pun berhasil** (dibuktikan: `project_expense_categories` berisi **NOL baris**), dan `description` juga tak ada di tabel TUJUAN sehingga memperbaiki satu sisi saja cuma memindahkan cacatnya; **(c)** `procurement.ts` — `company_settings.company_name`, padahal tabel itu key-value; yang benar `company_profile`, jadi **nama perusahaan di pesan WA ke supplier selalu kosong**; **(d)** `reports.ts` — `documents.name/document_type` (→`title`/`doc_type`), daftar dokumen di laporan proyek selalu kosong; **(e)** `reports.ts` — `milestones.name/actual_date` (→`title`/`completed_at`), tabel milestone di PDF selalu kosong. Kelimanya kini memeriksa `error` | Kecil |

| 15d | 🔴 **CI merah 2 commit: `IF NOT EXISTS` tak melindungi dari tabel yang dibuat migrasi LAIN** | Temuan 2026-08-01 | ✅ **Diperbaiki + diuji mutasi.** Migrasi 149 gagal di CI dengan `column "company_id" does not exist`, tapi **lulus sempurna di dev** — dan perbedaan itulah petunjuknya. Di dev, forward-draft **045 tak pernah dijalankan** (tabelnya nihil di `pg_class`). Di project CI, `ci-project-setup.mjs` menjalankan SELURUH berkas berurutan dan 045 tak ada di allowlist — jadi di sana `assets` benar-benar terbentuk dengan skema lama **tanpa `company_id`**. Akibatnya `CREATE TABLE IF NOT EXISTS assets` dilewati diam-diam, lalu `CREATE UNIQUE INDEX … (company_id, asset_code)` gagal. **Pelajaran: `IF NOT EXISTS` melindungi dari "sudah dibuat oleh migrasi INI", bukan dari "sudah dibuat migrasi LAIN dengan bentuk berbeda".** Migrasi yang menulis ulang forward-draft WAJIB membuang bentuk lamanya lebih dulu. Ditutup blok DROP ber-syarat di 149; diuji mutasi — blok dibuang → gagal dengan pesan **identik CI**. Sekaligus: uji fungsional di 149/151/152 diturunkan jadi NOTICE (di CI migrasi jalan SEBELUM seed, jadi keadaan data berbeda), verifikasi STRUKTUR tetap keras & diuji mutasi | Kecil |

| 15g | **Efek turunan: `t7-exit-criteria` gagal begitu tetangganya HIDUP** | Temuan 2026-08-01 | ✅ **Diperbaiki.** Tepat setelah 154 membuat 6 integration test benar-benar berjalan, `t7-exit-criteria-l2` mulai merah pada "UNIQUE global sudah dilepas" — padahal 8/8 hijau saat dijalankan sendiri. Sebabnya **pola yang sama persis dengan cacat induknya**: kueri `pg_constraint` & `pg_proc` TANPA filter skema, sehingga ia ikut menghitung constraint yang dibuat `procurement.test.ts` di schema test. Bukan skema production yang berubah — melainkan tetangganya yang akhirnya hidup. Tiga kueri katalog diberi `nspname='public'`. Pelajarannya: **memperbaiki cacat yang menyembunyikan sesuatu akan memunculkan cacat lain yang selama ini terlindung olehnya** — dan itu tanda perbaikannya bekerja, bukan tanda ia merusak | Kecil |

| 15f | 🔴 **6 integration test tak pernah benar-benar berjalan — `to_regclass` menembus schema** | Temuan 2026-08-01 | ✅ **Diperbaiki (migrasi 154) + diuji mutasi.** Enam berkas (`kasbons`, `change-orders`, 2 backfill, `procurement`, `supplier-invoice-3way`) gagal membangun schema testnya dengan `column al.user_id does not exist`.<br><br>**Akarnya bukan di test, melainkan di migrasi 080.** Ia membangun view `critical_audit_events` di balik guard `IF to_regclass('audit_logs') IS NOT NULL` — niatnya benar dan tertulis di komentarnya ("tak relevan di schema test minimal"). Tapi `to_regclass` TANPA kualifikasi skema mengikuti `search_path`, **dan pencarian itu tidak berhenti di schema pertama**: dijalankan dengan `search_path = test, extensions`, ia tetap menemukan `public.audit_logs`. Guard lolos, view dibuat, lalu gagal karena di schema `test` tabelnya memang tak ada. Diverifikasi langsung: `SET search_path TO ujiA, extensions; SELECT to_regclass('audit_logs')` → **KETEMU**.<br><br>**Yang membuatnya bertahan lama: gejalanya "skipped", bukan "failed".** Keenam berkas melaporkan *"4 skipped"* — mudah dikira normal, dan saya sendiri dua kali mencatatnya sebagai "bukan regresi" tanpa memperbaiki. 24 test integration tak pernah sekali pun benar-benar dijalankan.<br><br>154 memakai `current_schema()` dan menulis ulang bagian 080 lainnya secara idempoten, jadi subset test memakainya SEBAGAI PENGGANTI 080. Uji mutasi: guard lama → 4 skipped, guard baru → 4 passed | Kecil |

| 15c | **DB dev sempat rusak — SALAH SAYA, bukan test-nya** | Temuan 2026-08-01 | ✅ **Dipulihkan + dikoreksi.** Awalnya saya menuduh `multitenant-t3-rollback.test.ts` merusak schema. **Tuduhan itu salah dan dicabut**: test itu memakai `SET search_path TO <test_schema>, extensions` — `public` TIDAK ada di dalamnya, jadi ia memang tak bisa menyentuh tabel nyata. Yang merusak adalah **skrip simulasi CI yang saya tulis sendiri**: ia memakai `SET search_path TO uji_ci, public`, sehingga DDL yang gagal di `uji_ci` jatuh ke `public` — dan migrasi 127 di sana men-`DROP` `company_id` dari `projects`/`roles`/`role_permissions`. Akibatnya 60 test merah. Dipulihkan **lima lapis**, dan tiap lapis baru ketahuan SETELAH lapis sebelumnya beres — 60 merah → 5 merah → 0. Pengingat keras bahwa "sudah pulih" wajib diverifikasi, bukan diasumsikan: (1) kolom `company_id` di 3 tabel (jalankan ulang bagian 127); (2) policy `tenant_isolation` yang ikut ter-`DROP … CASCADE`; (3) **trigger `fn_isi_company_id` 13→20** (jalankan ulang 128) — tanpa itu 30+ test gagal `null value in column "company_id"`; (4) policy dasar `rab_items` & `document_access_logs` yang jadi **MATI TOTAL** (restrictive tanpa permissive — cacat identik migrasi 149 kemarin, kali ini muncul sebagai kerusakan); (5) jalankan ulang 130/131/132 + 149/150/152. Seluruh pemulihan memakai migrasi sebagai sumber, **tak satu pun DDL diketik ulang dari ingatan**.<br><br>**Yang layak dicatat: penjaga `t5a`/`t7` membuktikan diri DUA KALI dalam satu hari** — kemarin menangkap 4 tabel aset yang lahir mati total (migrasi 149), hari ini menangkap `rab_items` & `document_access_logs` yang MENJADI mati total karena kerusakan. Dua sebab yang berlawanan, satu penjaga, dan keduanya tak akan berbunyi lewat jalur lain mana pun karena `service_role` mem-bypass RLS. **Pelajaran: `, public` di ujung `search_path` mengubah sandbox jadi bukan sandbox** — dan yang membuatnya berbahaya justru karena ia terlihat seperti kehati-hatian ("supaya fungsi bawaan tetap terjangkau").<br><br>**Akarnya ditutup, bukan cuma kejadiannya:** `assertTestIsolation()` kini menolak `search_path` yang memuat `public` — sebelumnya ia hanya memeriksa schema test ADA di sana, sehingga `test, public` lolos mulus. Gerbang itu juga dipasang di `multitenant-t3-rollback` (berkas paling destruktif: DROP kolom & policy di 32 tabel) yang selama ini **tak memakainya sama sekali** — dari sekian test ber-DDL, hanya 1 yang memanggilnya. Diuji mutasi: `test, extensions` lolos · `test, public` DITOLAK · `public` DITOLAK | Kecil |

| 15b | 🔴 **Kurva-S kehilangan Rp 755,7 jt dari AC — EMPAT dari lima sumber gagal senyap** | Temuan 2026-08-01 | ✅ **Diperbaiki.** Berawal dari enum: menguji WIP ke data nyata membuat Postgres menolak `status IN ('approved','paid')` — `expense_status` hanya punya draft/submitted/approved/rejected. Menelusurinya ke `kurva-s.ts` menemukan yang jauh lebih serius: `.select('amount, expense_date')` padahal kolomnya **`total_amount`**. PostgREST membalas *"column … does not exist"*, `data` jadi `null`, dan `for (const e of expenseRes.data ?? [])` **diam-diam melewati nol baris**.<br><br>Menyisir seluruh rute terhadap `information_schema` membuktikan cacatnya **bukan satu baris**: **4 dari 5 sumber AC** memakai nama kolom yang tak ada — `daily_wage_logs.total_wage` (→`total_amount`/`work_date`, dan tabelnya tak punya kolom `status` sama sekali), `progress_payments.amount` (→`net_payment`/`paid_at`), `borongan_settlements.net_settlement` (→`remaining_balance`/`settled_at`). Total **Rp 755,7 juta** tak pernah masuk AC; satu proyek sendirian Rp 477,2 jt. CPI karena itu terlalu optimis — proyek yang boros terlihat sehat.<br><br>Dibuktikan sebelum & sesudah untuk keempatnya: semua GAGAL → semua OK. Kegagalan query kini di-log, tak lagi menyamar jadi "nol baris". **Pelajaran: `?? []` mengubah KEGAGALAN jadi HASIL KOSONG yang terlihat sah** — nol gejala, laporan tetap terbit. Ditutup penjaga CI baru (lihat Utang Teknis) | Kecil |
| 16 | ~~**Rantai kontrak**~~ — LD arah kontraktor, EOT, register jaminan | PETA #9 · Lima Pembeda #5 = 2.5/5 | ✅ **SELESAI 2026-08-01** (migrasi 152). ⚠️ Peringatan lama **TERKONFIRMASI**: 091 memang denda **klien telat BAYAR** — arah berlawanan. Yang membuatnya bukan sekadar "salin lalu balik tanda": dasar hitungnya berbeda. 091 dari `invoices.due_date` yang TETAP; LD dari `projects.end_date` yang **bisa bergeser sah lewat EOT** (cuaca, lahan, perubahan lingkup). Menghitung LD dari `end_date` mentah = **menagih denda atas keterlambatan yang sudah dimaafkan secara kontraktual** — bukan angka salah, tapi tagihan yang tak bisa dipertahankan. Itulah kenapa EOT & LD lahir di migrasi yang sama: memisahkannya menciptakan jendela ketika LD hidup tanpa EOT, dan tiap angka di jendela itu salah. `lib/rantai-kontrak.ts`: **33 test + 6 uji mutasi**. Yang dipakai ulang dari 091: `daysLateWIB()` & pola `resolve*Terms()` (netral arah). **DEFAULT OFF** mengikuti 091 — nol perubahan perilaku sampai dinyalakan. UI: section di detail proyek (EOT + denda + jaminan bersama, karena satu persetujuan EOT bisa menghapus dendanya) | Sedang |

| 16b | **Uji mutasi menangkap test yang tak menjaga apa pun** | Temuan 2026-08-01 | ✅ **Diperbaiki.** Test "progres di luar 0..100 dijepit" hanya memeriksa `denda === 0` dan **lolos saat jepitnya dihapus**: progres 130 memberi dasar −300 jt yang tertangkap cabang `dasar <= 0`, jadi dendanya kebetulan tetap 0. Test menguji HASIL, bukan JALUR. Diperbaiki memeriksa `dasarPerhitungan` langsung + kasus progres negatif (yang tanpa jepit bawah memberi dasar 1,2 M — denda melampaui nilai kontraknya sendiri). Setelah diperbaiki: 6/6 mutasi tertangkap. Ini kedua kalinya uji mutasi menemukan test-yang-terlihat-menjaga dalam dua hari | Kecil |
| 17 | ~~**Paritas golden end-to-end 1 RAB nyata**~~ | GOLDEN-FILE-SPEC | ✅ **SELESAI 2026-08-01.** ⚠️ Catatan lama "menunggu workbook founder" **KELIRU** — `_source/ahsp/golden/RAB Gudang Cibuluh Sumedang bobot.xlsx` sudah ada sejak 26 Juli; item ini tak pernah benar-benar terblokir. `golden-boq-adapter.ts` (12 test + **5/5 uji mutasi**) + `golden-cibuluh.test.ts` (5 test terhadap RAB nyata). **Hasil: 65 pemeriksaan, NOL selisih** pada RAB Rp 3.629.860.295,31 — 55 item, 9 divisi, tiga level (item = vol × harga · divisi = Σ item · total = Σ divisi).<br><br>**Yang membuatnya sulit bukan aritmetikanya, melainkan STRUKTUR RAB nyata** — lima kali berturut-turut asumsi saya salah dan tiap kali gejalanya "Excel yang meleset": (a) `[IVXLC]+` menerima huruf `C` sub-kelompok sebagai romawi 100 → selisih semu Rp 550 jt; (b) divisi `IX`/`XIV` ditulis TANPA titik; (c) nomor `IV.` muncul DUA KALI (salah ketik dokumen yang tak pernah diperbaiki); (d) baris ber-nilai muncul SESUDAH subtotal; (e) `\w+(\d+)` serakah — `Q12` terbaca sebagai baris 2, membuang SELURUH item sementara laporannya terlihat rapi "9 divisi, 0 item".<br><br>Kunci penyelesaiannya: **rentang `SUM()` dibaca dari RUMUS Excel**, bukan diasumsikan dari posisi. Uji paritas yang menuduh sumbernya salah lebih berbahaya daripada tak ada uji — ia melatih orang mengabaikan hasilnya | Kecil |

| 17b | 💰 **TEMUAN: Rp 37.876.001 di RAB Cibuluh tertulis tapi TAK dijumlahkan** | Temuan 2026-08-01 | ✅ **TERJAWAB FOUNDER 2026-08-01: "tidak dikerjakan retaining wall itu".** Jadi kemungkinan (1) yang benar — pekerjaan dibatalkan, barisnya sengaja ditinggal sebagai catatan, dan rumus `=SUM(Q34:Q65)` yang melewati baris 30–33 memang disengaja. **Total Rp 3.629.860.295,31 SAHIH**; RAB tidak kurang Rp 37,8 juta. Angkanya tetap di-assert di `golden-cibuluh.test.ts` sebagai `diLuarSubtotal` — bukan karena masih dipertanyakan, tapi supaya perubahan pada dokumen acuan tak lewat begitu saja. Sistem melaporkan, founder memutuskan; ini contoh alurnya bekerja | Selesai |

### Tingkat 5 — Nilai tampak, dependensi sudah lunas

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 18 | **Executive Cost Analytics** | CECEP/52 Gap-3 | 🟡 **API SELESAI 2026-08-01** (`GET /cost-analytics/portfolio` + `lib/cost-analytics.ts`). Agregasi lintas proyek dgn pagu BERJENJANG: RAP terkunci (rencana belanja) → RAB (rencana jual) → contract_value. Urutannya penting — memakai RAB berarti membandingkan belanja dengan harga JUAL, jadi serapannya terlihat lebih hemat dari kenyataan, dan itu dinyatakan di `meta.keterbatasan`. Syarat ROADMAP dipenuhi: respons SELALU membawa peringatan bahwa angkanya belum diadu ke realisasi belanja per-material (§D7 terkunci). Proyek tanpa pagu → `null`, BUKAN 0% (0% terbaca sebagai proyek paling hemat). Terverifikasi ke data nyata: 15 proyek, pagu Rp 8,96 M vs serapan Rp 631 jt, 3 keterbatasan tampil. 16 test + uji mutasi 3 arah. **UI SELESAI** — tab "Portofolio Biaya" di halaman Laporan; keterbatasan ditampilkan DI ATAS tabel (bukan catatan kaki — catatan kaki tak pernah dibaca sebelum keputusan diambil), dan kolom "Dasar pagu" membedakan serapan-vs-RAP dari serapan-vs-RAB. **#18 SELESAI** ✅ | Agregasi lintas proyek dari 3 sumber yang sudah hidup. ⚠️ Syarat lamanya "kerjakan SETELAH #8" **gugur** — #8 ternyata terkunci gerbang. Boleh dikerjakan lebih dulu, TAPI dashboard-nya wajib menyatakan eksplisit bahwa angkanya belum diadu ke realisasi belanja | Kecil |
| 19 | **Explainability trail** (`/explain` per item) | CECEP/50 · Constraint #1 | 🟡 **API SELESAI 2026-08-01** (`GET /estimate-items/:id/explain` + `lib/explain-item.ts`). Merangkai `hsp_snapshot` (migrasi 139) jadi 5 langkah yang bisa DIBACAKAN: harga tiap komponen pada tanggal berlaku → koefisien×harga → BUK → pembulatan → volume×HSP. **SNAPSHOT, bukan hitung ulang** — menghitung ulang hari ini memberi angka LAIN karena harga berubah, sehingga penjelasannya tak cocok dengan angka di dokumen penawaran (kebalikan dari tujuannya). Yang paling dijaga: penjelasan BOLONG harus MENGAKU bolong — item pra-139 tak ditebak-tebak, jumlah komponen yang tak cocok subtotal dilaporkan, harga override wajib disebut. 11 test + uji mutasi 3 arah. **UI SELESAI** — tombol "?" di tiap baris Komposer membuka dialog berisi 5 langkah + rincian komponen; peringatan ditampilkan MENONJOL di atas, bukan disembunyikan di bawah. **#19 SELESAI** ✅ | Constraint TERTINGGI CECEP, bukan fitur pinggiran. Fondasi sudah ada (migrasi 139/140); yang kurang endpoint+UI yang merangkai jejaknya jadi penjelasan | Sedang |
| 20 | **Laporan perbandingan antar-edisi AHSP** | AHSP-EDITION-BUILDER §3.5 | ⛔ **DICORET OWNER 2026-08-01.** Founder: *"workbook AHSP SE-68-2024 / SNI-2013 gapunya, hapus aja"*. Dua edisi kosong DIHAPUS (migrasi 160) — bukan sekadar tak berguna, tapi **aktif menyesatkan**: dropdown edisi di halaman estimasi mengambil dari tabel itu, jadi seseorang bisa memilih "SNI-2013", menyimpan estimasi, lalu heran kenapa nol analisa muncul. Bukan kekhawatiran teoretis — **dua `estimate_versions` sudah terlanjur menunjuk keduanya** (keduanya draft Rp 0, residu percobaan). Migrasi ber-penjaga: menolak jalan bila edisinya ternyata sudah berisi (workbook menyusul) atau bila estimasi yang merujuk bukan draft-nol. Verifikasi: 1 edisi tersisa, **2.620 analisa SE-47 utuh**, assemblies/price book/resources tak tersentuh. **Sumbu edisinya sendiri tetap hidup dan teruji** — kalau workbook edisi lain datang kelak, perbandingan tinggal diaktifkan | Dicoret |
| 21 | ~~**Baseline schedule + look-ahead**~~ | PETA #11 | ✅ **SELESAI 2026-07-31 — PV kini berjenjang.** Sebelumnya PV cuma punya 2 sumber: `rab_schedule` manual (**0 baris di dev** — tak pernah diisi) dan normal CDF. Yang kedua benar secara matematis tapi tak ada hubungannya dengan rencana proyek ini, jadi SPI mengukur penyimpangan terhadap TEBAKAN. Padahal `rab_items.planned_start/end` (migrasi 052, dipakai Gantt) sudah berisi rencana sungguhan — kurva-S tak pernah membacanya. Ditambah **tingkat 2**: PV diturunkan dari tanggal Gantt, linear per hari. Terverifikasi ke data nyata: proyek pertama **cakupan 100%** (13/15 kategori, PV Rp 1,3 M dari rencana sungguhan), proyek kedua nol tanggal → jatuh ke CDF dengan benar. Respons kini membawa `rencanaSource` + `cakupanJadwalPct` supaya SPI-dari-rencana bisa dibedakan dari SPI-dari-tebakan. **Look-ahead 3-minggu SELESAI** (`GET /projects/:id/rab/look-ahead`): daftar apa yang harus dikerjakan minggu ini s.d. 3 minggu ke depan + yang sudah telat, diurut menurut PERHATIAN (telat terlama → berjalan → akan mulai; di dalam kelompok, nilai terbesar di atas). Terverifikasi ke data nyata: proyek-1 menyurfacekan **11 item telat senilai Rp 879 jt** (terlama 166 hari) — informasi yang sebelumnya tak bisa ditampilkan sistem sama sekali. **UI look-ahead SELESAI** — section baru di halaman proyek (tepat sesudah Gantt, karena keduanya membaca `planned_start/end` yang sama dan pertanyaan "harus siapkan apa?" muncul persis setelah melihat jadwal). Status dibedakan warna DAN teks (WCAG 1.4.1 — pemakai banyak membaca di HP di bawah sinar matahari), nilai rupiah ditonjolkan pada kelompok telat, dan daftar kosong dibedakan antara "tak ada pekerjaan" vs "jadwalnya belum diisi". UI pengisian baseline per-minggu **ternyata SUDAH ADA & terjangkau** (`RabScheduleModal`, dipicu tombol di section RAB — diverifikasi rantainya tombol→modal→API). Jadi `rab_schedule` yang 0 baris adalah soal PEMAKAIAN, bukan fitur yang hilang; dan itu justru alasan tingkat-2 (dari tanggal Gantt) dibangun. **#21 SELESAI** ✅ | Sedang |

### Tingkat 6 — Domain baru

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 22 | ~~**Bid register + backlog**~~ | PETA #10 | 🟡 **API SELESAI 2026-08-01** (migrasi 147 + `bids.ts` + `lib/bid-backlog.ts`). Satu tabel, SENGAJA bukan CRM pipeline (dicoret di PETA §Sengaja-tidak-dibangun). Menjawab dua hal yang tak terekam di mana pun: **(a)** kenapa tender kalah — `winner_value` membuat selisih harga terukur, jadi "kalah karena harga" bisa dibedakan dari "kalah karena syarat" (kalau kita LEBIH MURAH dan tetap kalah, menurunkan harga berikutnya membuang margin tanpa menambah peluang); **(b)** backlog — nilai yang sudah dimenangkan tapi proyeknya belum selesai, beban kapasitas yang menentukan layak-tidaknya ambil tender baru. `no_go`/`batal` sengaja tak masuk win-rate supaya kedisiplinan memilih tender tak dihukum. 24 test + uji mutasi. **UI SELESAI** — halaman `/tender` (tabel, bukan kanban: kanban mengundang pemakaian sebagai CRM yang justru dicoret, dan tabel lebih baik membandingkan angka antar-baris). **#22 SELESAI** ✅ | Kecil |
| 23 | ~~**Modul 12 — asset/alat (versi ringan sewa)**~~ → **Aset & alat PENUH** | ERP_MASTER_PLAN · PETA #12 | ✅ **SELESAI 2026-08-01.** Scope naik dari "ringan sewa" jadi PENUH mengikuti `KEPUTUSAN-SCOPE-ERP-AI.md`: register + mutasi antar-proyek + penyusutan + sewa. **Migrasi 149** (4 tabel, kategori B/C) — forward-draft 045 TIDAK dipakai apa adanya karena ditulis sebelum multi-tenant: nol `company_id`, nol RLS, dan `asset_code UNIQUE` **global** (perusahaan kedua tak bisa memakai 'AST-001') — cacat identik `financial_config` (145) & `feature_flags` (146), yang berarti menjalankannya apa adanya mengulangi pola yang sama untuk ketiga kalinya. `lib/aset.ts`: 27 test + **5 uji mutasi**, keduanya menjaga angka yang salahnya tak berbunyi — nilai buku tak pernah menembus residu (alat habis umur masih laku dijual, menyusutkannya ke nol menyatakan perusahaan tak punya apa-apa), utilisasi tumpang-tindih dihitung SEKALI (dua catatan di hari sama → >100%, angka mustahil yang meruntuhkan kepercayaan seluruh laporan), sewa mingguan dibulatkan KE ATAS seperti tagihan sebenarnya. **UI `/aset`** 2 tab + §9a lengkap (halaman + `middleware.ts` + `menu_items` migrasi 151). ⚠️ **Dua cacat tertangkap penjaga, bukan review** — lihat baris 23b/23c | Kecil → Sedang |

| 23b | **149 membuat 4 tabel MATI TOTAL — tertangkap `t5a`/`t7`** | Temuan 2026-08-01 | ✅ **Selesai (migrasi 150).** 149 memasang `tenant_isolation` RESTRICTIVE tapi **nol policy permissive**. Di PostgreSQL gabungannya `(semua RESTRICTIVE) AND (ada PERMISSIVE yang lolos)`, dan himpunan permissive KOSONG bernilai FALSE — jadi keempat tabel tak terbaca **siapa pun**. Cacatnya SENYAP: API tetap bekerja hari ini karena `service_role` mem-bypass RLS; ia baru muncul saat T5c dikerjakan, dengan gejala "halaman aset kosong tanpa error" — kegagalan yang paling lama dilacak. Uji mutasi membuktikan penjaganya nyata: policy dihapus → merah, dipulihkan → hijau | Kecil |

| 23d | **Migrasi `059` tercatat di buku tapi berkasnya tak ada** | Temuan 2026-08-01 | ✅ **TERPECAHKAN 2026-08-01 — bukan anomali.** Versi `059` bernama **`seed_dummy_data`**, dan berkasnya **ADA**: `db/seeds/seed_dummy_data.sql`, 1.027 baris. Ia memang **seed, bukan migrasi**, jadi tempatnya di `db/seeds/` — tak pernah ada yang hilang. Yang kurang adalah alat rekonsiliasi yang hanya memindai `db/migrations/` dan melaporkan selisih 148 vs 149 sebagai angka tanpa penjelasan. Catatan awal menyimpulkan "nol jejak di `git log -S`, nol sebutan di dokumen mana pun" — yang benar, tapi tak pernah membaca kolom `name` di katalognya sendiri, dan di situlah jawabannya. ✅ Alat diperbaiki: rekonsiliasi kini memeriksa **dua arah**, mencocokkan catatan-tanpa-berkas ke `db/seeds/`, dan memisahkan "cocok seed → bukan anomali" dari "tak ada di mana pun → jangan hapus catatannya". Hasil sekarang **bersih sempurna**: 0 terbukti-tak-tercatat · 0 tak-lengkap · 0 tak-bisa-dibuktikan · 1 catatan yang **dijelaskan**. Alasan aslinya tetap berlaku dan kini terbukti: penjaga yang selalu menyisakan satu anomali melatih pembacanya mengabaikannya | Kecil |

| 23c | **Generator peta tenancy buta terhadap anak tabel-B** | Temuan 2026-08-01 | ✅ **Selesai.** `gen-tenant-map.mjs` hanya melacak rantai FK ke `projects`; tabel anak dari tabel **B** jatuh ke kategori **A — katalog bersama, TANPA scope sama sekali**. Ketahuan saat `asset_movements`/`asset_depreciation_logs` lahir. Ini **bukan cacat khusus aset**: tabel B mana pun yang punya anak akan kena, jadi diperbaiki di akar (lacak rantai ke akar mana pun) bukan dengan mengecualikan empat tabel. Perbaikannya sempat memindahkan `worker_kasbons` dari `project_id` ke `worker_id` — keduanya sah, tapi mengubah jalur scope tabel yang SUDAH dipakai adalah perubahan perilaku diam-diam, jadi `projects` diberi prioritas. Hasil: **hanya 4 tabel aset bertambah, 107 tabel lama identik** | Kecil |
| 24 | **Capability Tier-2** — RFI, Submittals, Punch List, QC, HSE | Blueprint 01-capability-to-task | 🟡 **4 dari 5 SELESAI 2026-08-01** — Punch List (24a, migrasi 156) · RFI Inspeksi + RFI Informasi (24b, migrasi 157, dibangun sebagai **dua** modul atas keputusan founder) · Submittal Register (24c, migrasi 159). Dependency "butuh Workflow Engine" diverifikasi **lunas ke kode** tiap kali, bukan dibaca dari dokumen. Urutan dipilih dari dependency paling ringan lebih dulu — dan Punch List memang jadi rujukan modul sesudahnya: inspeksi yang tidak lolos melahirkan temuan punch list. **Sisa: QA/QC + HSE (14 sub-menu)** — dan keduanya **BUKAN pekerjaan berikutnya**: `KEPUTUSAN-SCOPE-ERP-AI.md` §5 menempatkannya di **Gelombang 2**, sesudah 8 item ROADMAP sisa. Peta menu masih menandainya `gerbang` ("menunggu tender mensyaratkan") — penanda itu sudah **dibalik** keputusan scope 2026-08-01 yang memasukkannya, tapi urutannya tetap Gelombang 2 | Besar (cicil per-Epic) |

| 24c | **Submittal Register** | ROADMAP #24 | ✅ **Selesai 2026-08-01** (migrasi 159). Pengajuan material/gambar untuk disetujui sebelum dipakai. Dependency Blueprint ("butuh Document Mgmt + Workflow Engine") diverifikasi lunas **ke kode**: bucket `project-documents` ada & privat, `approval_chains` 6 rantai/13 langkah dipakai 4 modul, dan `entity_type` bertipe **TEXT tanpa constraint** sehingga tipe baru tak butuh migrasi enum. **Persetujuan lewat Workflow Engine, bukan status sendiri** — tabelnya sengaja TIDAK punya kolom `disetujui_oleh`; jejaknya di `approval_progress`, satu tempat untuk seluruh sistem. Membuat mekanisme keempat berarti mengulang persis masalah yang Program B selesaikan (Blueprint melarangnya eksplisit). **Revisi adalah warga kelas satu**: submittal ditolak lalu diajukan ulang adalah alur normal, jadi `induk_id` merantai seluruh percobaan ke pengajuan **pertama** (bukan berjenjang — satu mata rantai putus menghilangkan separuh riwayat), dan UI menampilkannya bersarang. "Ditolak 3× sebelum disetujui" adalah fakta yang menjelaskan keterlambatan pengadaan. `disetujui_catatan` sama wajibnya beralasan dengan `ditolak` — "boleh dipakai" tanpa menyebut syaratnya membuat syaratnya hilang dan pekerjaan berjalan dengan asumsi salah. 19 test, **9 arah uji mutasi** (3 API + 6 DB). Nol akses `supabase` mentah | Sedang |

| 24b | **RFI — DUA modul: Inspeksi & Informasi** | ROADMAP #24 | ✅ **Selesai 2026-08-01** (migrasi 157). **Dokumen proyek konflik soal apa itu "RFI", dan keduanya dokumen resmi:** taksonomi menu + `lp-rfi` menulis Request for **Inspection**, Blueprint + `00-vision` menulis Request for **Information**. Bukan salah ketik — dalam praktik konstruksi keduanya nyata dengan alur berbeda, jadi ini keputusan produk, bukan teknis. **Founder memilih membangun keduanya, menu dipisah.** · **Inspeksi** (`/lapangan/inspeksi`, grup Lapangan): izin cor/tutup, harian, dari HP. `inspeksi:periksa` terpisah dari `inspeksi:manage` — pemohon tak memberi izin pada pekerjaannya sendiri (pola `punch:verify`). Yang tidak lolos **boleh** melahirkan temuan punch list; opsional, bukan otomatis — memaksa semuanya jadi temuan membuat angka "menghalangi serah terima" kehilangan arti. · **Informasi** (`/kontrak/rfi`, grup **Kontrak**, bertetangga Claims & EOT): pertanyaan resmi ke konsultan. Nilainya bukan menyimpan pertanyaan — itu bisa email — melainkan **menghitung lama menggantung** dan menautkannya ke klaim EOT. Aritmetikanya dijaga ketat: belum dikirim → `null` bukan `0` (nol = "dijawab seketika", kebohongan yang paling mudah dibantah); `Math.floor` pada selisih milidetik bukan selisih tanggal (dikirim 23.50 dijawab 00.10 = 20 menit, bukan "satu hari"); rekap memakai **terlama** bukan rata-rata (rata-rata menyamarkan satu pertanyaan tertahan 40 hari di antara sepuluh yang dijawab besoknya — dan yang 40 hari itu yang jadi perkara). Isi RFI **beku** begitu dilayangkan; yang sudah terkirim dibatalkan, bukan dihapus. Client **tidak** bisa membaca RFI kontrak — transparansi berhenti di korespondensi klaim. 19 test, **9 arah uji mutasi** (4 API + 5 constraint DB, tiap mutasi DB dipulihkan lalu diverifikasi ke katalog). Nol akses `supabase` mentah; ratchet 202 rute tak bergerak | Sedang |

| 24a | **Punch List / Snagging** | ROADMAP #24 | ✅ **Selesai 2026-08-01** (migrasi 156, kategori C). Bukti kebutuhannya sudah ada sebelum modulnya: `project_photos.category = 'defect'` dipakai **7 baris** — lapangan menandai cacat tanpa tempat mencatat apa cacatnya, siapa yang memperbaiki, dan kapan ditutup. **Keputusan yang menentukan modul ini berguna atau tidak: `punch:verify` DIPISAH dari `punch:manage`** — yang memperbaiki tak boleh menyatakan perbaikannya sah; tanpa itu punch list berubah jadi daftar niat. Ditegakkan tiga lapis: capability terpisah, cek `hasPermission` di rute, dan penolakan bila `ditugaskan_ke === currentUser` (capability menjawab "boleh apa", bukan "boleh atas perkara siapa"). Penerima capability **diturunkan** dari scope yang sudah berlaku (`projects:view` / `mandor:view` / `mandor:wage:approve`), bukan disebut per nama role — jadi role kustom `direktur` ikut kebagian tanpa disebut. Nomor unik **per proyek** dengan retry pada 23505: dua orang berkeliling lokasi yang sama dan mencatat pada menit yang sama adalah cara kerja normal, dan menolak yang kedua dengan 500 berarti temuan lapangan HILANG. Status `ditolak` ada supaya temuan keliru punya jejak, bukan dihapus diam-diam. **Nol akses `supabase` mentah** — seluruhnya lewat `request.db.viaProject()`, dibuktikan berfungsi dengan menyisipkan+membaca+menghapus baris nyata. 16 test, **6 arah uji mutasi** (2 API + 4 constraint DB, tiap mutasi DB dipulihkan lalu diverifikasi ke katalog). UI: `/lapangan/punch-list` — dikelompokkan per status (kolom di layar lebar, tumpukan di HP), severity pakai warna & status pakai posisi supaya keduanya tetap terbaca, target sentuh ≥44px. **Ikut diperbaiki:** penjaga `audit-gerbang-tenancy` buta terhadap gerbang yang dibangun DI ATAS gerbang lain — `ambilPunchMilikTenant` tak dikenali dan 4 rute dituduh bolong; kini penemuannya berlapis sampai stabil, dan jendela badan fungsi dipotong pada kurung penutupnya (versi lama menyerempet kode di luar fungsi, membuat `getMondayOf` terhitung gerbang — gerbang PALSU lebih berbahaya daripada tuduhan palsu) | Sedang |

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
| E16 | **Pengeluaran kas utama tak pernah memotong saldo** | `fn_update_main_cash_on_expense()` ADA di DB, TRIGGER-nya TIDAK — jadi tak pernah dieksekusi sekali pun. Kembarannya untuk kas kecil terpasang normal, jadi separuh jalur hidup dan separuh mati: orang melihat petty cash berkurang benar lalu menyimpulkan mekanismenya berfungsi. `project_expenses` masih 0 baris, jadi belum ada kerugian. | ✅ Migrasi 161 + 8 test, 5 mutasi tertangkap (2026-08-02) |
| E17 | **Pembayaran klien Rp 627 juta tak pernah masuk saldo kas** | Cacat yang sama pada `payments` — tapi yang ini SUDAH menggigit: 5 dari 23 pembayaran ber-`cash_account_id` senilai **Rp 627.075.000** tak pernah menambah saldo. Trigger dipasang; koreksi retroaktif sengaja TIDAK dilakukan — itu keputusan akuntansi yang harus dicocokkan ke rekening bank. | ✅ Migrasi 162 + 8 test (2026-08-02) · ⏳ koreksi saldo menunggu founder |
| E18 | **Lebih bayar membuat piutang perusahaan terlihat lebih kecil** | `amount_due = total - dibayar` tanpa batas bawah. Klien yang lebih bayar Rp 500rb menghasilkan sisa **−500rb**, dan `clients.ts:78` + `dashboard.ts:190` menjumlahkannya apa adanya — sehingga menutupi tunggakan klien LAIN. Sementara `ar-register.ts:71` memfilter `> 0` sehingga invoice itu hilang dari aging. Dua pembaca, dua perilaku, nol peringatan. | ✅ Migrasi 163 (`GREATEST(0, …)`) + 2 test (2026-08-02) |
| E19 | **Izin rute bocor lewat nama yang mirip** | `middleware.ts` mencocokkan izin dengan `startsWith`, jadi `/proyek` ikut cocok dengan `/proyeksi-kas` — mandor bisa membukanya tanpa ada yang pernah menambahkannya ke daftar izin. Bukan skenario karangan: "Proyeksi Kas" sudah antre di roadmap #10. | ✅ `cocokRute()` (batas segmen) + 9 test browser (2026-08-02) |
| E20 | **PM terjebak loop redirect tanpa akhir** | Home PM adalah `/dashboard`, tapi `/dashboard` tak ada di daftar izin PM — jadi setiap redirect "kembali ke home" ditolak lagi, selamanya. Browser menyerah dengan ERR_TOO_MANY_REDIRECTS: layar kosong, tanpa pesan. Diperbaiki dengan menurunkan home ke `/pm-portal` (haknya), BUKAN dengan membuka `/dashboard` — `routes/v1/dashboard.ts` tak menyaring per-role, jadi membukanya berarti memberi PM angka keuangan seluruh perusahaan. | ✅ Home PM + guard struktural yang menolak konfigurasi rusak saat boot (2026-08-02) |
| E21 | **7 pemeriksaan saldo bisa dilewati diam-diam** | `if (acc && Number(acc.balance) < jumlah)` terlihat defensif — justru itu masalahnya. Saat query gagal atau id salah, `acc` null, kondisi jadi false, pemeriksaan **dilewati**, dan transaksi lolos. Yang terburuk: approve kasbon di `kasbons.ts:325` tetap memotong saldo saat kasbonnya sendiri tak ketemu. | ✅ 7 penjaga diperbaiki (404 lebih dulu) + penjaga statis ambang NOL di CI (2026-08-02) |
| E22 | **4 trigger uang mandor hilang — Rp 67,6 juta** | Penelusuran menyeluruh sesudah E16/E17: bukan dua kasus terpencil, ada **7 fungsi `RETURNS trigger` tanpa trigger** di dev dan **4 menyentuh uang**. 16 kasbon approved (Rp 46.600.000) + 3 pembayaran progress (Rp 21.000.000) tak pernah memotong saldo — uangnya sudah diterima mandor di lapangan. Juga: kasbon approved tak tercatat sebagai beban proyek, sehingga serapan anggaran dan CPI/SPI ikut salah. | ✅ Migrasi 164 + 9 test, 3 mutasi tertangkap (2026-08-02) |
| E23 | **Bugfix yang tak pernah sampai ke tempat yang diuji** | `100_fix_kasbon_expense_trigger_on_conflict.sql` memperbaiki `ON CONFLICT` yang membuat SETIAP approve kasbon gagal — perbaikannya benar, tapi ditulis `CREATE FUNCTION **public.**fn_…`. Skema dipaku, jadi saat test membangun rantai migrasi di schema `test`, versi rusak dari migrasi 051 tak pernah tergantikan. **Selama setahun tak ada test yang bisa membuktikan bugfix itu bekerja** — dan test alur uang mandor yang baru langsung gagal dengan error yang katanya sudah diperbaiki. | ✅ Migrasi 165 (sadar-skema) + penjaga CI ambang NOL (2026-08-02) |
| E24 | **9 penulisan susulan gagal diam-diam** | Pola yang sama dengan E21 tapi sisi lain: operasi UTAMA berhasil, susulannya dibuang hasilnya. `finance.ts:1181` — pembayaran tersimpan & saldo kas naik lewat trigger, tapi invoice tetap terlihat **belum lunas**: klien ditagih untuk uang yang sudah dia bayar. `progress.ts:285` — log tersimpan, `projects.progress_pct` tertinggal, sehingga Kurva S/EVM/laporan klien memakai angka lama. Plus ×3 total estimasi, dua badan usaha default sekaligus, item tanpa spesifikasi teknis. | ✅ Ratchet 26 → 17, mutasi tertangkap (2026-08-02) |
| E25 | **Kontras hex-mentah lolos dari penjaga** | `kontras-ratchet.mjs` memeriksa 38 pasangan TOKEN dan pernah menemukan `--danger` mode gelap 4,47:1. Tapi ia berhenti di token: **394 warna ditulis sebagai hex langsung** di komponen, **302 untuk `color`** — yaitu teks, persis yang WCAG atur. Dua TOMBOL gagal AA: "+ Update" 3,35:1 dan tombol tutup dialog **2,45:1** (hampir setengah syarat). Pengguna aplikasi ini mandor & tukang, di layar terang, perangkat lama — tiga hal yang paling terdampak kontras rendah. | ✅ Diperbaiki pakai token + penjaga baru ambang NOL (2026-08-02) |
| E26 | **`created_at` bisa ditulis ulang di dev** | `protect_created_at()` ada di dev tapi **nol tabel** memakainya. Diuji langsung (rollback, nol data berubah): `UPDATE invoices SET created_at='2000-01-01'` **berhasil**. ⚠️ **Koreksi:** dugaan awal "migrasi 037 rusak" ternyata SALAH — rantai migrasi bersih menghasilkan 10/10 terlindungi, jadi CI & produksi aman; yang menyimpang **dev**. | ✅ Migrasi 166 memulihkan dev + 4 test, mutasi tertangkap (2026-08-02) |
| E27 | **Baseline schema basi 6 hari — penjaga drift praktis mati** | `schema-baseline-dev.json` dibuat 2026-07-27 dengan **91 tabel**; dev sudah 119. Laporan drift jadi **1.023 baris** dan `continue-on-error: true`, sehingga tak pernah dibaca siapa pun — penjaga yang ada tapi tak berfungsi sebagai penjaga. | ✅ Baseline diregenerasi + cara membacanya ditulis di CI (2026-08-02) |
| E28 | **Alat ukur baru melaporkan 22 celah tenant yang tak ada** | Penelusuran `tenantDb` menyimpulkan 22 query "menyaring `project_id` tapi tak memverifikasi tenant". **SALAH** — keduapuluh-duanya sudah bergerbang lewat EMPAT bentuk berbeda (`proyekMilikTenant` · `db.from('projects')` ANCHOR · `projectIds()` + `.in()` · `idProyek===null → 404`). Angkanya turun 22 → 16 → 10 → 7 → 0 karena **deteksinya** yang membaik, bukan kodenya. | ✅ Dikoreksi + dicatat di header ratchet (2026-08-02) |

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

**Fungsi tanpa trigger tidak memberi gejala apa pun.** Dua kali dalam satu hari
(E16, E17): fungsi ada di `pg_proc`, lengkap dan benar, tapi tak ada `pg_trigger`
yang memanggilnya. Request tetap 200, data tetap tersimpan, laporan tetap terbit
— hanya saldonya diam. Grep pada kode aplikasi tak menemukannya karena tak ada
kode aplikasi yang terlibat. Yang mengungkapnya: menulis test yang memeriksa
**uangnya berpindah**, bukan **statusnya berubah**.

**Menamai ulang objek DB yang sudah ada di migrasi lain menciptakan duplikat,
bukan pengganti.** Migrasi 162 versi pertama memakai nama karangan sendiri
(`trg_update_cash_on_payment`) padahal migrasi 019 sudah punya
`trg_update_cash_balance_on_payment`. Di dev tak terlihat — hanya 162 yang
pernah jalan di sana. Di database yang dibangun dari nol, KEDUANYA terpasang dan
setiap pembayaran menambah saldo **dua kali**. Tertangkap hanya karena test
alur uang menjalankan seluruh rantai migrasi dari kosong — persis yang dilakukan
CI, dan persis yang akan dilakukan environment produksi pertama.

**Satu temuan biasanya bukan satu kasus.** E16 dan E17 terlihat seperti dua
kecelakaan terpisah. Menelusurinya secara menyeluruh — bukan berhenti sesudah
yang terlihat — menemukan tujuh fungsi trigger yatim, empat di antaranya
menyentuh uang. Yang membedakan: bertanya "berapa banyak lagi yang seperti
ini?" alih-alih "sudah beres?".

**Perbaikan bisa mendarat di tempat yang salah tanpa memberi tanda.** Migrasi
100 memaku skema `public.`, sehingga bugfix-nya tak pernah sampai ke schema
tempat test berjalan. Ia "berhasil" di setiap environment, tapi hanya berefek
di satu — dan konsekuensinya bukan sekadar merepotkan test: selama setahun
tak ada cara membuktikan perbaikan itu bekerja. Kejadian kedua dengan sebab
yang sama (yang pertama `to_regclass` di migrasi 154).

**Kode yang terlihat defensif bisa justru melewati pemeriksaannya sendiri.**
`if (acc && saldo < jumlah)` membaca seperti kehati-hatian ekstra, tapi saat
`acc` null seluruh pemeriksaan dilewati — transaksi lolos tanpa satu pun pesan.
Tujuh kali polanya sama di jalur uang. Yang menemukannya bukan test (semuanya
hijau) melainkan penjaga statis yang ditulis SESUDAH pola pertamanya terlihat —
dan penjaga itu langsung menemukan dua kasus lagi yang terlewat saat perbaikan
manual.

**Lapisan yang tak punya test sama sekali menyimpan cacat paling lama.**
`middleware.ts` memutuskan siapa boleh melihat halaman apa, dan sampai
2026-08-02 nol test menyentuhnya — API test tak menjalankan Next, jsdom mulai
sesudah halaman diputuskan. Uji browser PERTAMA langsung menemukan dua cacat
(E19, E20). Bukan karena kodenya buruk, tapi karena tak ada yang pernah
menjalankannya dengan sengaja.

**Verifikasi bisa mengukur benda yang salah tanpa memberi tanda.** Berjam-jam
terbuang menyimpulkan "token CSS-nya dibuang compiler" — padahal yang terjadi:
server yang jalan adalah `next start` (bundel produksi lama), bukan `next dev`.

Terulang 2026-08-02 dengan bentuk lain: uji browser pertama dijalankan lewat
`127.0.0.1`, dan Next 16 memperlakukannya sebagai origin BERBEDA dari
`localhost` (`allowedDevOrigins` di `next.config.ts` tak memuatnya). HTML
terkirim utuh, teksnya benar, nol error di konsol maupun log server — yang mati
hanya hidrasi, jadi tak satu pun tombol atau hook bereaksi. Berjam-jam terbuang
mengejar "React tak mengambil alih" yang sebenarnya "origin-nya bukan yang
dipercaya". Dua kali polanya sama: yang diukur bukan yang dikira.
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


## 📋 SELURUH SUB-MENU YANG BELUM TUNTAS — dari taksonomi, bukan ringkasan

> **Ditambahkan 2026-08-02 menjawab pertanyaan founder: "apakah seluruh menu
> di taksonomi sudah masuk roadmap?" Jawabannya waktu itu TIDAK — 73 dari 78
> sub-menu 🔴 tak tercatat di mana pun.**
>
> Gelombang 2–4 sebelumnya hanya berupa nama kantong ("QA/QC formal (7
> sub-menu)") tanpa satu pun item. Pembacanya tak bisa tahu apa isinya — dan
> itu persis kesalahan yang header dokumen ini sendiri peringatkan.
>
> Status di sini **disalin dari taksonomi SESUDAH taksonomi itu diverifikasi
> ke kode** (2026-08-02). Dua belas sub-menu ternyata bertanda 🔴 padahal
> sudah hidup — `WIP/PSAK` (`lib/wip-psak.ts` + endpoint yang dipanggil
> halaman laporan) dan `Earned Value Management` (`meta.evm` di kurva-s
> dengan CPI/SPI/EAC/TCPI) yang paling menyolok.
>
> Alat ukur pertama untuk audit ini DIBUANG: ia melaporkan skor 1.00 untuk
> "Critical path (CPM)" yang berkas kodenya NOL, karena mencocokkan kata
> umum seperti "path" dan "analisa". Versi yang dipakai memeriksa bukti yang
> tak bisa palsu — nama berkas, `CREATE TABLE`, dan path endpoint —
> dengan peta yang ditulis tangan per-menu.

**Total 116 sub-menu belum tuntas.** 🟡 = ada sebagian · 🔴 = belum dibangun.

Penjaganya: `apps/api/scripts/audit-taksonomi-vs-kode.mjs` — dijalankan manual
saat meninjau roadmap, bukan gerbang CI. Menilai "menu ini sudah jadi atau
belum" butuh penilaian manusia; penjaga otomatis yang memaksakan jawaban akan
menghasilkan angka rapi yang tak berarti.

### 1. MASTER DATA & KONFIGURASI INTI  ·  Gelombang 2

- 🟡 Gudang / lokasi
- 🟡 Master Karyawan
- 🟡 Master Resource (tenaga/bahan/alat)
- 🟡 Master Subkontraktor
- 🟡 Penomoran dokumen (numbering series)
- 🟡 Perusahaan / badan hukum (multi-entity)
- 🟡 Price Book / rate library
- 🟡 Struktur Cost Code / CBS
- 🟡 Template dokumen
- 🟡 WBS template
- 🔴 Kalender kerja & hari libur
- 🔴 Prakualifikasi vendor

### 2. CRM & PRA-KONSTRUKSI (Bid Management)  ·  Gelombang 2

- 🟡 Analisa markup, margin, contingency
- 🟡 Estimating / AHSP
- 🟡 Generate proposal / dokumen penawaran
- 🟡 Jaminan penawaran (bid bond)
- 🟡 Pipeline lead / prospek
- 🟡 Quantity takeoff / BOQ
- 🟡 Skenario penawaran (what-if)
- 🔴 Dokumen prakualifikasi
- 🔴 Eskalasi harga

### 3. MANAJEMEN KONTRAK  ·  Gelombang 2

- 🟡 Kontrak subkontraktor
- 🟡 Register kontrak induk
- 🔴 Claims management
- 🔴 Register asuransi
- 🔴 Surat masuk/keluar (correspondence)

### 4. PERENCANAAN & PENJADWALAN  ·  Gelombang 2

- 🟡 Gantt chart
- 🟡 WBS proyek
- 🔴 Analisa keterlambatan
- 🔴 Critical path (CPM)
- 🔴 Method statement
- 🔴 Resource histogram / leveling

### 5. BUDGET & COST CONTROL  ·  Gelombang 2

- 🟡 Actual Cost Ledger (ACL)
- 🟡 Cashflow forecast
- 🟡 Profitabilitas per proyek / per cost code
- 🔴 Cost Value Reconciliation (CVR)
- 🔴 Manajemen contingency

### 6. PROCUREMENT / PENGADAAN  ·  Gelombang 2

- 🟡 Goods Receipt Note (GRN)
- 🟡 Jadwal pembayaran vendor
- 🔴 Evaluasi kinerja vendor
- 🔴 Expediting & logistik
- 🔴 Kontrak payung / blanket order
- 🔴 Perbandingan penawaran (bid tabulation)
- 🔴 RFQ ke vendor

### 7. INVENTORY / GUDANG & MATERIAL  ·  Gelombang 2

- 🟡 Gudang proyek / site store
- 🟡 Minimum stok & reorder point
- 🔴 Material milik klien (free issue)
- 🔴 Tracking waste / susut
- 🔴 Transfer stok antar proyek

### 8. SUBKONTRAKTOR & MANDOR  ·  Gelombang 2

- 🟡 Back-charge / potongan
- 🟡 Kontrak subkontrak + BOQ
- 🟡 Opname / berita acara bersama
- 🟡 Paket subkontrak
- 🟡 Progress claim / payment certificate
- 🟡 Work order ke subkontraktor
- 🔴 Evaluasi kinerja subkontraktor
- 🔴 Kepatuhan (izin, asuransi, pajak)
- 🔴 Retensi subkontrak
- 🔴 Tender & award subkontraktor

### 9. OPERASI LAPANGAN (Site Management)  ·  Gelombang 2

- 🟡 Laporan harian proyek (DPR)
- 🟡 Log cuaca
- 🟡 Log tenaga kerja harian
- 🟡 Serah terima (PHO/FHO)
- 🔴 Dokumentasi foto
- 🔴 Instruksi lapangan
- 🔴 Izin kerja (work permit)
- 🔴 Log pemakaian alat
- 🔴 Non-Conformance Report (NCR)

### 12. HR & PAYROLL  ·  Gelombang 2

- 🟡 Klaim perjalanan & reimburse
- 🟡 Master karyawan & struktur organisasi
- 🔴 Absensi & timesheet
- 🔴 Cuti & izin
- 🔴 PPh 21
- 🔴 Payroll staf
- 🔴 Penilaian kinerja
- 🔴 Potongan statutori (BPJS)
- 🔴 Rekrutmen & onboarding
- 🔴 Sertifikasi & kompetensi

### 13. ALAT BERAT & ASET  ·  Gelombang 2

- 🔴 Biaya operasional per alat (BBM, operator)
- 🔴 Integrasi penyusutan → GL
- 🔴 Maintenance terjadwal

### 14. KEUANGAN & AKUNTANSI  ·  Gelombang 2

- 🟡 Accounts Payable
- 🟡 Accounts Receivable
- 🟡 Laporan keuangan
- 🟡 e-Faktur / e-Bupot
- 🔴 Rekonsiliasi bank
- 🔴 Tutup buku periode

### 15. PENAGIHAN & PENDAPATAN  ·  Gelombang 2

- 🟡 Follow-up penagihan
- 🟡 Penagihan pekerjaan tambah
- 🔴 Interim Payment Certificate (IPC)
- 🔴 Nota kredit

### 16. MANAJEMEN DOKUMEN  ·  Gelombang 2

- 🟡 Register dokumen + kontrol revisi
- 🔴 Matriks distribusi
- 🔴 Notulen rapat
- 🔴 Register gambar
- 🔴 Tanda tangan elektronik
- 🔴 Transmittal

### 18. PELAPORAN & BUSINESS INTELLIGENCE  ·  Gelombang 2

- 🟡 Dashboard per proyek
- 🟡 KPI: CPI, SPI, margin, DSO, backlog
- 🔴 Distribusi laporan terjadwal
- 🔴 Report builder

### 19. ADMINISTRASI SISTEM  ·  Gelombang 2

- 🟡 API & integrasi
- 🟡 Import/export data
- 🟡 Konfigurasi penomoran
- 🔴 Backup & restore
- 🔴 Multi-tenant

### 20. MOBILE / FIELD APP  ·  Gelombang 3

- 🟡 Approval mobile
- 🟡 Foto + geotag
- 🟡 Input laporan harian
- 🟡 — 🟡 sebagian (ada lapisan, belum utuh)
- 🔴 Absensi lapangan
- 🔴 Checklist inspeksi
- 🔴 Ditambah 4 kelompok yang seluruhnya 🔴 tanpa tabel (§10 QA/QC, §11 HSE, §13 Alat Berat, §17 Risiko)
- 🔴 Material request
- 🔴 Mode offline
- 🔴 — 🔴 belum dimulai

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

## Pondasi — mandat "pondasi dulu, fitur ditahan" (2026-08-01)

| # | Item | Status |
|---|---|---|
| **P1** | **Kontras warna WCAG** | ✅ **Selesai** — `kontras-ratchet.mjs` di CI, 38 pasangan token dijaga di kedua mode. Menemukan `--danger` mode gelap **4,47:1** pada jalan pertamanya (audit axe dulu hanya mode terang). Hutang tersisa terukur: 394 hex mentah, ber-ambang. |
| **P2** | **Verifikasi RLS per role** | ✅ **Selesai** — dan hasilnya **berbeda dari yang dicatat**. Klaim lama "belum pernah diuji end-to-end" ternyata **salah**: 8 berkas / 60 test SUDAH mengimpersonasi user sungguhan lewat `asUser()` (set `request.jwt.claims`, role `authenticated`), sehingga `auth.uid()`/`auth_role()`/`has_permission()` dievaluasi persis seperti request browser. **Dibuktikan menjaga** lewat uji mutasi: membuat policy `USING (true)` pada `progress_logs` → merah. **Yang benar-benar cacat:** 17 titik `if (!x) return` yang membuat test **lulus diam-diam** bila prasyaratnya hilang — seluruh 60 test isolasi bisa hijau tanpa menguji satu pun kebocoran. Diganti `wajibAda()` yang gagal-nyaring dengan pesan menyebut seed mana yang kurang. Uji mutasi: menghilangkan mandor ter-assign → 3 merah dengan pesan yang menjelaskan. |
| **P3** | Adopsi `tenantDb` lanjut | 🔄 **dicicil — ratchet 468 → 426** (32 query). Diukur dengan alat yang mengategorikan menurut APAKAH BISA dialihkan: **67 bisa** (kategori C lewat `project_id` langsung + query menyaringnya), 387 tidak. Yang sudah: `reports.ts` 9 · `procurement` INSERT 1 · `kurva-s.ts` 6 · `rab.ts` 12 · `rab-schedule.ts` 6 · `progress.ts` 8. **Behavior-preserving dibuktikan pada NILAI, bukan hanya jumlah baris** — `rab_items` total **Rp 8.812.172.176,13** identik di kedua jalur (kurva-s pernah kehilangan Rp 755,7 juta karena kolom salah nama, jadi angkanya yang harus dibandingkan). `mandor.ts` diperiksa dan **bukan** hutang: `work_scope_items`/`specs` mewarisi lewat rantai `item_id → work_scope_id → assignment_id`, bukan `project_id` — `viaProject()` tak berlaku, dan `resolveScopeItemOwnership` (14e) yang menjaganya |
| **P6** | **ADR-004 dilanggar di sisi WEB** | ✅ **NOL, dan penjaganya sendiri harus diperbaiki dua kali** (2026-08-01). Seluruh 27 pemakaian `role === "..."` dipetakan ke capability yang **API benar-benar tuntut** — diverifikasi satu per satu ke `requirePermission` di rutenya, bukan ditebak dari nama tombolnya. Dua kasus butuh penilaian: `isMandor` → `!hasPermission("mandor:assign")` (efek sampingnya bagus — `direktur` kini melihat tab Penugasan yang dulu tersembunyi), dan `canEdit` di halaman kas ternyata **satu boolean untuk tiga wewenang** yang API pisahkan (transfer / konfirmasi / approve), jadi dipecah. **Yang lebih penting: angka nol pertama itu PALSU.** Ratchet-nya hanya mencari `===` dengan nama variabel `currentUser|user|me` — dan yang lolos justru bentuk paling berbahaya: `if (user?.role !== "admin") return <TidakBolehMasuk/>` di `/audit` dan `/sistem`, yaitu **gerbang halaman penuh**, bukan satu tombol. `direktur` yang punya `audit:view` ditolak di depan pintu oleh halaman yang API-nya sendiri akan melayani. Pola diperlebar dua kali (`!==` ikut ditangkap; nama variabel apa pun, bukan tiga nama), penyaringan daftar (`users.filter(u => u.role === "pm")`) dibedakan lewat **bentuknya** bukan lewat daftar nama. Tiga layout portal dikecualikan **dengan alasan tertulis**: pengalihan `/portal` ↔ `/mandor-portal` adalah IDENTITAS ("ini rumahmu"), bukan kewenangan — `hasPermission()` menjawab boleh/tidak, tak menjawab "ke mana". Uji mutasi: nama bebas → merah, penyaringan daftar → tetap hijau |
| **P7** | **Ratchet lint: 67 → 11, dan empat fitur mati ketahuan** | ✅ **Selesai 2026-08-01.** Pembersihan `no-unused-vars` dimulai sebagai kerja rapi-rapi (50 impor ikon yatim yang menumpuk saat P6 mencabut `getStoredUser()` dari 8 halaman) tapi **sisanya ternyata penanda fitur yang tak tersambung** — variabel yatim adalah gejala, bukan kotoran: **(1)** `setNotes` — modal pengeluaran kas mengirim `notes` ke API tapi TAK PUNYA input; catatan selalu kosong, padahal dua modal lain di berkas yang sama punya textarea-nya. **(2)** `setFundSource` — kasbon dari halaman mandor **selalu** tercatat "Dana Owner" karena pemilihnya tak pernah dirender; komentar di sana menjanjikan "sumber dana ditentukan admin/PM saat approve" yang **tidak pernah ada** — `fund_source` hanya bisa diisi saat POST, `PATCH /status` tak pernah menyentuhnya. Portal mandor sudah punya pemilihnya sejak awal; dashboard-lah yang tertinggal. **(3)** `rowOk` — validasi constraint DB (`rab_items_pct_sum`) dihitung lalu dibuang: baris salah tak ditandai dan tombol simpan tetap aktif sampai Postgres menolaknya dengan pesan mentah; kini border + **pesan teks** (bukan warna saja) + tombol dimatikan. **(4)** `hasBorongan` — dua saudaranya membuka menu portal, yang ini tidak. **Dugaan awal saya salah** dan sempat tercatat sebagai "halaman belum ada": settlement borongan justru sudah lengkap dan hidup (`GET`+`POST /mandor/borongan-settlements`, `SettlementBoronganModal` di `/mandor`). Ia dijaga `mandor:kasbon:approve` — wewenang admin/PM, yang mandor memang tak punya, karena settlement adalah PENCAIRAN bukan pengajuan. Jadi state itu memang pantas mati; menambahkan menunya justru menjanjikan wewenang yang API-nya tolak. Ikut ketemu: pencarian audit membandingkan kata kunci lowercase terhadap nilai yang **belum** di-lowercase (UUID dengan huruf besar tak pernah ketemu), dan kalender tak punya indikator memuat sama sekali — grid tanggal selalu terlukis, jadi tampak "tak ada acara bulan ini" alih-alih "belum selesai memuat", yang **lebih menyesatkan daripada halaman kosong**. Empat ambang dikencangkan; `no-unused-expressions` kini **0** |
| **P8** | **253 → 88 label tanpa kaitan; + penjaga "medan hantu"** | ✅ **Selesai 2026-08-01.** Codemod `pasangkan-label.mjs` memasangkan **213** (dua gelombang: 167 + 46) `<label>` ke kontrolnya lewat `htmlFor` ↔ `id`, dengan id **DITURUNKAN** dari `value={state}` yang sudah ada — tak dikarang, karena id yang salah memasangkan label ke kontrol yang keliru dan itu lebih menyesatkan daripada tak berpasangan. Manfaatnya bukan hanya untuk pembaca layar: teks label jadi bisa **diketuk** untuk memfokuskan kontrolnya, jadi target sentuh membesar — persis yang dibutuhkan mandor di HP, satu tangan, di bawah matahari. **Satu cacat ketahuan saat memeriksa hasilnya:** label di `progress-log-modal` bercabang ke DUA kontrol berbeda (`select` scope vs `input` jumlah pekerja); `htmlFor` statis menunjuk elemen yang tak dirender di salah satu cabang — label **MATI**, lebih buruk daripada tak berpasangan karena pembaca layar menyebutkan kaitan yang tak ada. Diperbaiki manual + pemindaian menyeluruh memastikan hanya satu yang berbentuk begitu. **Gelombang kedua** menutup celah di codemod-nya sendiri: label MULTI-BARIS (teks dipecah karena memuat penanda wajib atau ikon) tak dikenali sama sekali, sehingga 9 label di `termin-payment-modal.tsx` lolos tanpa pernah dilaporkan — bukan dilewati dengan alasan, melainkan tak terlihat. 253 → 88 → **44**. 44 sisanya dilewati **dengan alasan** (di dalam `.map()` → id tak unik; atau tak ada `value={state}` untuk menurunkan id). Sekaligus: penjaga **medan hantu** dipasang ke CI — mencari nilai yang dikirim ke API tapi tak punya cara diisi; penjaga ini sendiri salah **tiga kali** sebelum di-commit, yang terakhir paling penting: analisis per-berkas MELEWATKAN bug yang melahirkannya (`kas/page.tsx` punya tiga modal dengan `notes` masing-masing), dan hanya uji mutasi yang mengungkapnya |
| **P9** | **36 modal menjebak pemakai keyboard (WCAG 2.1.2)** | ✅ **Selesai 2026-08-01.** Berawal dari satu warning `click-events-have-key-events` pada latar modal halaman `/mandor`. Menambal latarnya dengan `role="button"` adalah yang disarankan lint kalau dibaca harfiah, dan itu **jawaban yang salah** — latar modal bukan tombol; menandainya begitu menambah perhentian Tab yang tak berarti apa-apa. Pertanyaan yang benar: bagaimana pemakai keyboard KELUAR? Jawabannya: **tidak bisa** — nol penanganan Esc di seluruh halaman itu, lalu ternyata **nol di seluruh aplikasi: 36 modal**. Modal terbuka, Tab berputar di dalamnya, satu-satunya jalan keluar adalah mengambil tetikus. WCAG 2.1.2 (Level A) — syarat dasar, bukan penyempurnaan. Ditutup dengan hook `lib/use-tutup-esc.ts` di **40 tempat** + penjaga CI ber-ambang **0** (perbaikannya satu baris, jadi tak ada alasan modal baru lahir tanpa itu). **Penjaganya sendiri menuduh palsu tiga komponen HALAMAN** yang cuma merender modal — mereka melewatkan `onClose` ke anaknya, tak punya `onClose` sendiri; sisipan otomatis di sana menghasilkan rujukan ke nama yang tak ada. tsc menangkapnya, tapi hanya karena kebetulan gagal keras: kalau ada variabel bernama sama, ia akan menutup hal yang salah tanpa satu pun peringatan. Diperbaiki jadi menuntut `onClose` di **signature**, bukan sekadar muncul di lingkup |
| **P10** | **11 penulisan yang gagal SENYAP — uang, stok, dan akses** | ✅ **Selesai 2026-08-01.** Kelas yang tak dijaga apa pun: `update`/`delete`/`insert` yang hasilnya dibuang. Tanpa `const { error } =`, kegagalan apa pun — constraint, RLS, kolom salah — lewat tanpa jejak; request tetap **200** dan datanya separuh jalan. Yang ditutup, semuanya mengubah keadaan: **(1)** pembayaran termin tercatat tapi invoice tak jadi lunas — klien **ditagih dua kali** dan laporan piutang menampilkan angka yang sudah dibayar. **(2)** saldo stok tak berkurang padahal `stock_movements` tetap mencatat mutasinya — riwayat bilang barang keluar, saldo bilang masih ada; selisihnya baru ketahuan saat opname fisik berminggu-minggu kemudian. **(3)** ganti-permission role memakai replace-all `DELETE` lalu `INSERT`; kalau DELETE gagal senyap, role keluar dengan permission **LAMA + BARU** — pada endpoint yang justru dipakai untuk MENCABUT wewenang, sehingga orang yang baru dikurangi haknya tetap memilikinya sementara layar menampilkan daftar barunya seolah berhasil. **(4)** settlement borongan lunas tapi scope tetap aktif. **(5)** `progress_pct` item & proyek tak tersimpan — Kurva S, EVM, dan SPI ikut salah, API tetap 200 sehingga orang mengetik ulang dan mengira dirinya yang keliru. **(6)** spesifikasi teknis item pekerjaan bisa bertumpuk lama+baru. **(7)** logo terunggah tapi tak terpasang. **(8)** MR tersangkut saat PO dibatalkan. Ditutup penjaga CI ber-ratchet 41 → **26** (sisanya memang best-effort dan kini ditandai eksplisit), plus **test integrasi baru** untuk replace-all permission yang menguji PERILAKUNYA — permission lama benar-benar hilang — bukan keberadaan satu baris `if (error)`; uji mutasi: melewati DELETE → dua test merah |
| **P11** | **18 `catch` yang menelan error tanpa jejak** | ✅ **Selesai 2026-08-01, ambang NOL.** Hampir semuanya membungkus pengiriman notifikasi, dan niatnya benar — notifikasi tak boleh membatalkan tindakan yang sudah sah. Yang salah adalah menelan **pesannya**. Bukan kekhawatiran teoretis: rantai Web Push di repo ini putus berbulan-bulan tanpa satu pun gejala (P4), dan alasannya persis ini — orang yang tak menerima notifikasi **tak tahu ada notifikasi yang seharusnya datang**, jadi tak ada keluhan yang bisa memicu penyelidikan. `catch {}` adalah tempat gejala itu seharusnya muncul. Diubah jadi `catch (err) { request.log.error(…) }`: non-blocking tetap non-blocking, hanya tak lagi senyap. Penjaga ber-ambang **0** (bukan ratchet — perbaikannya satu baris, tak ada alasan menumpuk hutang), mencakup `routes`, `lib`, `plugins`, DAN `utils` — yang terakhir sengaja ditambahkan karena di sanalah `webpush.ts` hidup, tepat tempat kegagalan senyap yang melahirkan penjaga ini |
| **P12** | **Tombol yang gagal tanpa memberi tahu — akun, kasbon, upah** | ✅ **Selesai 2026-08-01, ambang NOL.** Kelas yang sama dengan P11 tapi akibatnya berbeda dan lebih langsung: di web, `catch {}` pada AKSI PEMAKAI berarti orang menekan tombol, tak terjadi apa-apa, dan layar **tetap menampilkan seolah berhasil** — karena semuanya memperbarui tampilan lokal SEBELUM tahu servernya menerima. Yang ditutup: **menonaktifkan akun** (daftar berubah jadi "nonaktif", server menolak, orang itu masih bisa masuk — ini tindakan keamanan); **approve/reject kasbon** di DUA jalur (panel notifikasi & halaman notifikasi), barisnya jadi "sudah ditindak" sementara kasbonnya tak berubah, jadi mandor menunggu pencairan yang tak pernah disetujui sementara penyetujunya yakin sudah menyetujui; **menyetujui laporan upah** (persetujuan pembayaran); **membatalkan transfer** & **menolak pengeluaran** di halaman kas — kembarannya `handleApproveExpense` sudah memberi tahu sejak awal, jadi diamnya dua yang lain bukan keputusan melainkan kelupaan; **menghapus notifikasi** (baris hilang dari layar lalu muncul lagi saat dimuat ulang, dan orang mengira ada yang rusak alih-alih mengira penghapusannya gagal). Yang memang boleh diam — pemuatan latar, preferensi `localStorage` — kini **ditandai `best-effort` berikut alasannya**, supaya keputusan itu terbaca bukan tersirat |
| **P13** | **Penjaga modal ternyata buta pada portal mandor** | ✅ **Selesai 2026-08-01.** P9 melaporkan nol, dan itu **benar untuk bentuk yang dikenalinya**: modal ber-prop `onClose`. Seluruh portal mandor memakai bentuk lain — state lokal `const [showModal, setShowModal] = useState(false)` — sehingga **lima modal di sana menjebak pemakai keyboard tanpa terdeteksi**, tepat di portal yang penggunanya mandor di lapangan. Ditambah **empat modal inline** di halaman `/mandor` dan `/proyek/[id]` yang dirender langsung oleh komponen halaman (konfirmasi hapus, cetak ringkasan, approve/reject inline, lightbox foto nota). Penjaga diperluas ke bentuk state-lokal; sembilan modal ditutup. Sekalian: **empat toast portal mandor** jadi `<button>` — sebelumnya `<div onClick>` yang tak bisa difokus. `role="alert"` sengaja ditaruh di WADAHNYA, bukan tombolnya: versi pertama memasangnya langsung ke `<button>` dan lint benar menolak, karena `alert` adalah peran non-interaktif yang justru MENGHAPUS makna "bisa ditekan". click-events 102 → **98** · static-interactions 106 → **102** |
| **P14** | **Test menumpuk 913 baris di DB dev tanpa satu pun gejala** | ✅ **Selesai 2026-08-02.** `lessons-writeback.test.ts` membersihkan `projects` bertanda `[TEST]` tapi **tidak `lessons_learned_records` itu sendiri**. Akibatnya tak terlihat karena `session_replication_role='replica'` — dipasang di `purge()` itu juga — **mematikan FK cascade**: menghapus proyek tak menyeret lesson-nya, ia hanya jadi yatim yang menunjuk proyek yang tak ada. Tiap run menambah. Terverifikasi **913 dari 913 yatim FK**, dan angka itu sempat terbaca sebagai "modul Lessons Learned punya 828 data" — audit jalur hidup (§9a) pun **ikut tertipu**, karena tabelnya tampak berisi sehingga lolos dari daftar tabel nol-baris. Pembersihan yang melewatkan tabel utamanya bukan pembersihan. Diperbaiki lalu **dibuktikan dua kali**: run pertama menyapu 913 → 0, run kedua tetap 0. Ditambah alat `audit-residu-test.mjs` (potret jumlah baris sebelum/sesudah suite) — hasilnya sesudah suite penuh: **nol residu bertanda `[TEST]`**; sisa +11 `estimate_versions` dari 44 yang dibuat dicatat sebagai kebocoran kecil yang masih terbuka, bukan disembunyikan |
| **P15** | **Sisa a11y: kontrol nyata, bukan latar modal** | ✅ **SELESAI 2026-08-02.** `click-events` **98 → 86 → 63**, `no-static-element` **94 → 74**. Gelombang penutup menutup **25 kontrol nyata**: kartu proyek, baris mandor/scope/notifikasi yang melipat, **zona unggah dokumen & bukti bayar** (sebelumnya tak bisa dipakai sama sekali lewat keyboard), sel kalender, galeri foto, kategori laporan, widget dashboard. Sisa 63 hampir semuanya latar modal & penahan klik `stopPropagation` yang jalan keluarnya sudah dijamin Esc — bentuknya bukan tombol, tapi jebakan keyboardnya sudah tak ada. Dua pola dipakai per-kasus: `<button>` bila isinya sederhana, `role="button"`+`tabIndex`+`onKeyDown` bila isinya blok bersarang. |
| **P16** | **`apps/web` akhirnya punya harness test — sebelumnya NOL** | ✅ **Selesai 2026-08-02.** Sisi API punya 1.215 test yang berjalan tiap CI; sisi web hanya dijaga **bentuk kodenya** (lint, tsc, ratchet), bukan perilakunya. Celahnya konkret: `useTutupEsc` dipasang di **51 tempat** untuk menutup jebakan papan tik, dan `modal-esc-ratchet` menangkap **KEBERADAAN** panggilannya — bukan efeknya. Mengubah `'Escape'` jadi `'Esc'` (nama usang) akan lolos setiap pemeriksaan statis sementara 51 modal kembali menjebak tanpa satu pun gejala. Dipasang Vitest 3.2.7 (versi yang sama dengan API — satu runner, satu cara menjalankan) + Testing Library + jsdom. **56 test**: `useTutupEsc` 6, `dapatDitekan` 10, `PilihCari` 13, `hasPermission`+`logout` 10, `ToastProvider` 6, `useVirtualList` 11 — dua yang terakhir jalur KEAMANAN: gerbang yang menentukan siapa melihat tombol apa, dan pembersihan yang kalau melewatkan SATU kunci membuat orang berikutnya di perangkat itu terkunci 403 tanpa tahu sebabnya. **11 uji mutasi, semuanya tertangkap** — dan dua di antaranya menemukan test yang LEMAH lalu diperkuat: guard `if (!tutup) return` ternyata tak terjaga (mencegah PEMASANGAN listener, bukan cuma efeknya), dan batas sorotan `Math.min` lolos karena `if (hasil[sorot])` menelan indeks di luar batas diam-diam. **Yang paling lama: satu bug lingkungan.** Setiap komponen ber-ikon gagal `Cannot read properties of null (reading useContext)` — errornya menuduh React, lalu menuduh komponennya, keduanya salah alamat. Sebabnya `apps/web/node_modules/lucide-react` adalah symlink ke ROOT `.pnpm`, dan salinan root itu membawa React sendiri; versinya identik, objeknya berbeda. `dedupe`, `server.deps.inline`, `resolve.conditions`, dan alias `react` semuanya dicoba dan **tak satu pun menyelesaikannya** — mereka bekerja pada satu pohon, ini dua pohon |
| **P17** | **Hutang adopsi `tenantDb` — 426 → 369** | 🔄 **Dicicil 2026-08-02.** 40 query di empat berkas yang polanya paling seragam dialihkan ke `viaProject()`: `rab-schedule` (7), `progress` (10), `documents` (5), `rab` (1). Semuanya tabel **kategori C** di rute yang `projectId`-nya SUDAH diverifikasi `proyekMilikTenant()` beberapa baris di atas — jadi `viaProject()` menyatakan hal yang sama dengan cara yang **tak bisa lupa**: filter tenant melekat pada query, bukan pada ingatan penulis rute berikutnya. Satu perlu penyesuaian: access-log di `documents` memakai `documentId`, bukan `projectId` — sumbernya `docTenant.project_id` yang sudah divalidasi, dan **tsc yang menangkapnya**, bukan review. Uji mutasi: mencabut `.eq(kolom, projectId)` dari `viaProject` → 2 test merah, jadi filternya memang mengikat bukan sekadar berganti nama. **Gelombang kedua** menutup `termin-payment` (10) dan `cash` (7) — keduanya menyentuh UANG, jadi tiap lokasi diperiksa gerbangnya satu per satu alih-alih disapu: beberapa query di `cash` MENDAHULUI gerbangnya (resolusi id dulu, validasi kemudian), dan itu pola sah yang `viaProject` tak cocok. **Gelombang ketiga**: `milestones` (4, seragam sempurna) dan `change-orders` (**2 dari 25** — dan angka kedua itu penting dibaca benar: sisanya BUKAN hutang, karena rute `/change-orders/:id` bekerja by-id dan me-resolve `project_id` dari CO-nya dulu, jadi `projectId` memang belum diketahui saat query dijalankan; memaksakan `viaProject` di sana berarti mengarang nilai). Ikut dibersihkan: **7 impor `supabase` yatim** sisa migrasi bertahap — ratchet lint API 16 → **10**. **Alat pemilahnya sendiri salah EMPAT kali**, dan tiap kesalahan menaikkan angka palsu: (1) tak memeriksa gerbang per-handler — melaporkan 70 kandidat di `mandor.ts` yang sebenarnya 2; (2) menghitung `projectIds()` sebagai gerbang — membuat rute LINTAS-proyek terbaca "siap", 0 → 40 palsu di `procurement`; (3) tak memeriksa KATEGORI tabel — `viaProject` hanya menerima kategori C, sementara `projects` adalah ANCHOR; (4) tak membedakan `request.params` (selalu ada) dari `request.query` (bisa `undefined`) — mengalihkan yang kedua akan MEMECAHKAN rute "semua proyek" yang sekarang bekerja. Sesudah empat koreksi angkanya masih tak stabil, jadi sisanya diperiksa MANUAL alih-alih dipercaya. Sisa 378 masih memuat 28 by-id lintas-proyek (bentuknya memang begitu) dan 64 non-kategori-C |
| **P4** | **Web Push** | ✅ **DISAMBUNG 2026-08-01** — rantainya tadinya putus di TIGA tempat. `sendWebPushToUsers()` punya **nol sebutan di seluruh `src/`**, `subscribeToPush()` nol pemanggil dari UI, dan 0 dari 23 user punya `push_subscription` — konsisten. Notifikasi menulis `channel: 'push'` ke DB tanpa pernah mengirim apa pun; menguji di HP tak akan membuktikan apa-apa. **Disambung di satu titik**: `createNotification`/`createNotifications` → `sendWebPushToUsers`, dikelompokkan per ISI supaya satu kejadian untuk 5 admin jadi 1 panggilan, bukan 5. Gagal simpan → **tidak** kirim push (penerima akan mengetuk lalu tak menemukan apa pun). Di UI: tombol eksplisit di panel notifikasi — **bukan** prompt otomatis, karena browser modern memblokir permintaan izin yang tak lahir dari gestur, dan yang ditolak sekali tak bisa diminta lagi. **Bug yang ditemukan test, bukan review:** `await import()` di dalam loop membuat panggilan KEDUA dan seterusnya **tertelan diam-diam** — dua pesan berbeda hanya satu terkirim. Diganti impor statis. 8 test, uji mutasi 3 arah semuanya tertangkap. Sisa yang butuh HP fisik: memastikan push benar-benar muncul di layar perangkat — tapi itu kini menguji hal yang benar-benar dikirim |
| **P5** | **§9a buta terhadap util mati** | ✅ **Diperbaiki 2026-08-01.** `audit-jalur-hidup.mjs` hanya memindai `src/lib/`, sehingga `utils/webpush.ts` lolos — alat yang dibuat untuk menangkap "benar tapi mati" justru melewatkan contoh terbesarnya. Diperluas ke `utils/`, dan deteksinya diperbaiki agar tak menuduh palsu (versi pertama menuduh `uuid`, `golden-runner`, `tenant-map.generated` yang sebenarnya diimpor relatif `'./x.js'` di direktori yang sama). **Empat temuan nyata sekarang terlihat:** `utils/webpush.ts` · `lib/golden-boq-adapter.ts` (dipakai test golden saja) · `lib/golden-runner.ts` (idem) · `lib/retention-calculation.ts`. **⚠️ KOREKSI (jam yang sama):** penilaian awal saya — *"paling serius, finance.ts menghitung retensi sendiri, dua sumber kebenaran"* — **SALAH**, dan dicatat di sini alih-alih dihapus. Berkas itu bukan logika duplikat melainkan **helper test** yang membangun tabel probe di schema `test` untuk membuktikan trigger DB (`calc_retention_amount`) berperilaku benar; header berkasnya menjelaskan itu, dan saya tak membacanya sebelum menuduh. Diverifikasi: trigger produksi ADA dan hasilnya benar pada 3 proyek nyata (Rp 570 jt × 5% = Rp 28,5 jt, dst), helper-nya DIPAKAI `retention-calculation.test.ts`, dan nol residu probe tertinggal di DB. Pelajarannya sama dengan tiga alat yang menuduh palsu hari ini: **temuan otomatis adalah bahan tinjauan, bukan vonis** — dan itu berlaku juga untuk temuan saya sendiri |

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
| `to_regclass` tanpa kualifikasi skema | 4 | `apps/api/scripts/audit-guard-schema.mjs` — **penjaga baru 2026-08-01**, lahir dari 24 test yang tak pernah berjalan. Guard yang bermaksud "objek ini ada DI SINI" jadi menjawab "ada DI MANA PUN" karena pencarian `search_path` menembus schema. Diuji mutasi |
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
