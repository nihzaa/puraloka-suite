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

---

## Antrean utama — urut dampak

Urutan ini berbasis **kerugian nyata bila tidak ada**, bukan kemudahan
pengerjaan. Sumber tiap item disebut supaya bisa ditelusuri ke dokumen aslinya.

### Tingkat 1 — Cost control (Lima Pembeda #1 = 3/5)

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 8 | ~~**Rekonsiliasi pagu RAP vs realisasi belanja**~~ | CECEP §D7 · PETA #4 | ⛔ **DIPINDAH ke "Sengaja TIDAK dikerjakan"** — discovery 2026-07-31 membuktikan gerbangnya BELUM terbuka: `rap_material_line` **0 baris**, kecocokan `resources`↔`materials` **0,1%** (2 dari 2.680, granularitas beda), dan `project_expenses` tak punya kolom material sama sekali. Bukti: [`DISCOVERY-RAP-VS-REALISASI.md`](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/DISCOVERY-RAP-VS-REALISASI.md) | — |
| 9 | **Commitment & varians per cost code** | PETA #5 | Bocor ketahuan SETELAH uang keluar, bukan saat komitmen diteken | Sedang |
| 10 | **Cost-to-complete forecast (UI)** | PETA #6 | Engine `cashflow-forecast.ts` sudah ada, **tanpa UI** — proyek rugi ketahuan di akhir, bukan saat masih bisa dikoreksi | Kecil |

### Tingkat 2 — Kebocoran di titik paling awal

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 11 | **Modul 9a — RAB hard-guard di Material Request** | ERP_MASTER_PLAN | Rancangan lengkap termasuk rumus validasi kuota. Menolak MR melebihi volume RAB; override hanya admin dengan alasan tertulis. Menutup kebocoran di titik paling awal | Sedang |
| 12 | **Modul 9b — PO ke WhatsApp/email vendor** | ERP_MASTER_PLAN | Rancangan siap; mempercepat siklus PO yang kini manual | Kecil |

### Tingkat 3 — Utang multi-tenant (menggigit saat badan usaha kedua dibuat)

| # | Item | Sumber | Kenapa penting | Ukuran |
|---|---|---|---|---|
| 13 | **T10 — `auth_role()` per-company** | ADR-011-T9 §5 | Kini baca `users.role_id` (peran **global**), bukan `company_members.role_id`. Diverifikasi di DB: benar. Orang yang admin di PT A tapi PM di PT B akan dapat peran yang salah | Kecil |
| 14 | **ADR-011-T4 — 468 akses `supabase` mentah di 9 modul** | ADR-011-T4 | Ratchet mencegah memburuk, **tidak menyelesaikan**. `clients`, `users`, `roles`, `settings`, `audit`, `documents`, dst | Besar |

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
