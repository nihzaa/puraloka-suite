# PETA PRIORITAS ERP — Dokumen Induk Pemersatu

**Tanggal:** 2026-07-26 · **Sifat:** LENSA PRIORITAS di atas roadmap yang sudah ada —
**bukan roadmap tandingan**. Dokumen ini menyatukan semua rencana yang tersebar di
`docs/` menjadi satu peta untuk MEMILIH, sesuai permintaan owner: "peta untuk memilih,
bukan daftar tugas".

**Basis:** verifikasi kode nyata 2026-07-26 (migration s.d. 116, 34 route API, UI,
222 file docs disensus). Detail status per-menu: `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md`
(terverifikasi). Keputusan arsitektur: `docs/KEPUTUSAN-MULTI-COMPANY.md`.

---

## 1. REGISTRY DOKUMEN PERENCANAAN — semua rencana yang ada, satu tabel

Legend: **AKTIF** (mengikat hari ini) · **STALE** (basi sebagian/seluruhnya — jangan
dipercaya tanpa cek) · **SELESAI** (tugasnya tuntas, jadi arsip) · **ASPIRASIONAL**
(peta jangka panjang, bukan janji) · **REFERENSI** (standar/aturan, bukan rencana).

### Root repo
| Dokumen | Status | Catatan |
|---|---|---|
| `CLAUDE.md` | **STALE sebagian** | Masih bilang "migration 001-058"; nyatanya 116. Konten fitur lama akurat, konten skala basi |
| `AUTOPILOT.md` | **AKTIF** | Charter operasi otonom + Red-Line. `STATUS.md` yang diwajibkan §2 kini DIBUAT (lihat root) |
| `DOMAIN.md` | **AKTIF** | Otoritas domain + jawaban owner 2026-07-24 |
| `HARDCODE-CENSUS.md` | **AKTIF** | Ember [A]/[B]/[C] |
| `AUDIT_REPORT.md` | **AKTIF** | Temuan keamanan/kualitas terbuka (OPEN-1..OPEN-4 + STORAGE-1) — wajib dibaca per AUTOPILOT §2.9 |
| `DEMO.md` | **REFERENSI (operasional)** | Cara demo via Cloudflare tunnel — bukan dokumen rencana |
| `STATUS.md` (root) | **AKTIF (baru)** | Penunjuk satu-pintu, dibuat sesi ini |

### docs/ root
| Dokumen | Status | Catatan |
|---|---|---|
| `ERP_MASTER_PLAN.md` (v2.0) | **CAMPURAN** | Header = keputusan founder 2026-07-26 "CECEP Option 2" → **AKTIF & MENGIKAT**. Badan dokumen (13 Modul, Fase 0–7, tabel status) = **STALE** (2026-06-17, pra-CECEP; tabel statusnya kontradiktif internal — Modul 4 "✅" di header tapi "🔴" di tabel). ⚠️ Penomorannya ("Fase 7 = GL") TABRAKAN dengan roadmap EA ("Phase 7 = multi-company") — selalu sebut sumbernya |
| `MODULE_STATUS.md` | **STALE** | Tracker fitur per 2026-06-17, pra-CECEP/pra-Program A/B |
| `DATABASE_SCHEMA.md` | **STALE** | Klaim "RLS AKTIF" tanpa nuansa dormant; pra-102–116 |
| `API_ENDPOINTS.md` | **STALE** | Pra-CECEP |
| `DEVELOPMENT_LOG.md` | **AKTIF** | Log berjalan de-facto (entry terakhir 2026-07-25) — sumber status harian terbaik |
| `ERP-KONTRAKTOR-TAKSONOMI-MENU.md` | **AKTIF (terverifikasi)** | Dikoreksi sesi ini; kembaran di folder EA identik |
| `KEPUTUSAN-MULTI-COMPANY.md` | **AKTIF (rekomendasi)** | Menunggu ack owner → lalu jadi ADR |
| `PETA-PRIORITAS-ERP.md` | **AKTIF** | Dokumen ini |

### docs/superpowers/specs/2026-07-18-enterprise-architecture/
| Dokumen/folder | Status | Catatan |
|---|---|---|
| `00–06` (vision, app/data, security, platform, roadmap, design, agentic) | **AKTIF (strategis)** | Roadmap makro Phase 0–9 + L1–L4 + Never Build List (04 §155) |
| `PHASE-1-STATUS.md`, `PHASE-1-COMPLETION-AUDIT.md` | **SELESAI** | Phase 1 tuntas; memuat temuan penting RLS dormant/storage/otorisasi |
| `PHASE-2-STATUS.md` | **SELESAI** | Program B tuntas |
| `Master-Delivery-Blueprint/` (16 file) | **AKTIF (strategis)** | Termasuk `NUMBERING-GLOSSARY.md` (⚠️ tabel status Sub-Fase-nya STALE) dan `09-saas-and-tenancy-readiness.md` (desain retrofit company) |
| `Implementation-Kickoff/` + `-Sub-Fase-1B/` (38 file) | **SELESAI** | Arsip eksekusi Phase 1 |
| `Phase1/` (10 file) | **SELESAI** | Perencanaan awal Phase 1 |
| `adr/ADR-003` (level EA) | **REFERENSI (mengikat)** | Master-Delivery-Blueprint sebagai orchestration layer |
| `Engineering-Constitution/` (53 file: 40 standar + 10 ADR + amendments) | **REFERENSI (mengikat)** | Termasuk `18-never-build-list.md` (enforced) dan ADR-004/005/007/008/009 |
| `CECEP/` (49 file) | **AKTIF** | Planning SELESAI (Derived & Frozen); build order 10 langkah TERKUNCI di `MATERIAL-RAP-COMPANY-UI-DESIGN.md`. Progres verified 2026-07-26/27 (PR #86–94): **langkah 1 CI isolation ✅ · 4 seed AHSP nasional ✅ (2.620 assemblies, verified 100%) · 5 endpoint hitung + golden ✅ · 2 config Lapis1/2 sebagian (PPN reuse; BUK/rounding BELUM di-config, masih wajib eksplisit per-request) · 8 AHSP Company sebagian (struktur DB ada, endpoint create-assembly sedang dikerjakan) · 10 UI sebagian (`/estimasi`: komposer+katalog+harga+rekap PPN hidup; layar Material/RAP belum ada)**. **Langkah 6 (Material take-off/BBS/steel_profiles) dan 7 (RAP/Pagu) BELUM DIMULAI — 0 tabel di migration manapun** — ini titik-bocor #1 yang jadi alasan utama CECEP diprioritaskan, JANGAN dianggap selesai sebelum keduanya ada. Langkah 9 (dpp_factor split) sengaja ditunda (gerbang D10). |
| `enterprise-architecture-framework/` (32 file) | **REFERENSI** | Metodologi generik, sengaja dipisah dari CECEP (ADR framework-separation) |
| `superpowers/plans/2026-07-15-warm-clay-design-system.md` | **SELESAI** | Worktree-nya 0 commit ahead, sudah merged |

### Hierarki otoritas kalau bentrok
`AUTOPILOT.md` (Red-Line) → `DOMAIN.md` + keputusan owner tertanggal (mis. header
ERP_MASTER_PLAN 2026-07-26, koreksi scope 2026-07-26) → roadmap `04` + Never Build
List + ADR → kickoff/desain per-modul (CECEP dkk) → dokumen status → dokumen STALE
(kalah dari semuanya; koreksi, jangan ikuti).

---

## 2. KONTRADIKSI YANG DITEMUKAN & RESOLUSINYA (tidak ada yang dipilih diam-diam)

| # | Kontradiksi | Resolusi |
|---|---|---|
| 1 | Taksonomi awal: multi-currency/company "murah sekarang" ↔ roadmap 04/ADR-009: tunda | Currency: **dicoret owner** (+ verifikasi NUMERIC ✅). Company: tetap Phase 7 **+ 2 tripwire baru** — `KEPUTUSAN-MULTI-COMPANY.md` |
| 2 | Taksonomi awal menandai item CECEP "✅" ↔ kode: DB+engine saja, 0 route/UI | Taksonomi dikoreksi (🟡 dengan catatan lapisan) |
| 3 | Taksonomi awal EVM/inventory "🔴" ↔ kode: sudah hidup | Dikoreksi (✅) — dua koreksi terbesar arah sebaliknya |
| 4 | **"Phase 7" bermakna ganda**: EA = multi-company; ERP_MASTER_PLAN = GL | Wajib sebut sumber saat menulis; kandidat perluasan NUMBERING-GLOSSARY (sumbu ke-4: "Fase/Modul MASTER_PLAN") |
| 5 | ERP_MASTER_PLAN Modul 10: **GL in-app MUST HAVE** (kerjakan terakhir) ↔ rekomendasi sesi ini: **jangan bangun GL penuh in-app** (akuntansi eksternal + export + WIP report) | ⚠️ **KEPUTUSAN PRODUK TERBUKA — milik Nizar** (lihat §5). Kedua posisi sepakat "bukan sekarang", jadi tidak memblokir apa pun hari ini |
| 6 | AUTOPILOT §2 wajib baca `STATUS.md` ↔ file tidak ada | Dibuat sesi ini (root `STATUS.md`, penunjuk tipis) |
| 7 | `DATABASE_SCHEMA.md` "RLS AKTIF" ↔ kenyataan: table-RLS dormant, storage-RLS live | Sudah dinuansakan di PHASE-1-COMPLETION-AUDIT (otoritatif); DATABASE_SCHEMA ditandai STALE |
| 8 | CLAUDE.md "migration 058" ↔ nyata 116 | Ditandai STALE; koreksi CLAUDE.md = tugas kecil tersendiri (perlu edit hati-hati, di luar sesi ini) |

---

## 3. URUTAN PEMBANGUNAN — ranking KERUGIAN-JIKA-TIDAK-ADA

Konteks bisnis: kontraktor Indonesia, proyek pabrik & gudang, pemberi kerja swasta +
pemerintah, tim kecil, sistem mandor/borongan. Dinilai dengan 5 kriteria kualitas
owner, bukan kelengkapan menu. **Keputusan founder yang mengikat: CECEP Option 2 —
#1 tidak boleh disela oleh apa pun di bawahnya.**

| # | Modul | Kerugian nyata jika ditunda | Dependensi | Ukuran | Rumah di roadmap |
|---|---|---|---|---|---|
| 1 | **Tuntaskan CECEP sampai siap-pakai** (build order 10 langkah: CI isolation → config → seed AHSP → endpoint hitung → take-off material → **RAP/pagu**) | Estimasi tetap Excel: tender lambat & rawan salah; **tanpa pagu, belanja material tak terkendali — titik bocor #1 MASIH TERBUKA** (langkah 6/7 belum dimulai) | Langkah 1/3/4/5 ✅ (CI isolation tuntas, seed 2.620 assemblies verified, endpoint hitung+golden hidup, PR #86–91). **Langkah 6 (take-off material/BBS) & 7 (RAP/Pagu) — 0 tabel, BELUM DIMULAI**, ini yang menutup titik-bocor #1 sesungguhnya | Besar | Phase 3 / Program C — **AKTIF, prioritas berikutnya = langkah 6→7** |
| 2 | **Tutup celah 3-way match** — ✅ **SELESAI 2026-07-27** (diselipkan saat jeda menunggu gate CECEP, sesuai catatan kolom terakhir): invoice manual wajib ter-link GR + validasi supplier, total invoice ≤ nilai GR pada HARGA PO (`lib/three-way-match.ts`), anti-dobel 3 lapis (satu GR satu invoice, nomor faktur unik per supplier, auto-invoice cek existing) + backstop DB migration 121 (2 partial unique index). Detail terverifikasi: taksonomi §6 | ~~Invoice manual tanpa validasi = supplier bisa menagih melebihi/dobel~~ → tertutup, dijaga test positif & negatif | Procurement (ada) | Kecil | Perpanjangan Modul 4; tidak bentrok CECEP (boleh diselipkan bila ada jeda menunggu gate) |
| 3 | **Register piutang: AR aging + jadwal pelepasan retensi + recoupment uang muka** | Retensi 5% lupa ditagih = rugi murni; DP tak dipotong di termin = bayar dobel; telat nagih = cashflow mati | Invoice/termin (ada) | Kecil–sedang | Perpanjangan Modul 2 |
| 4 | **Rekonsiliasi material** (take-off teoritis vs PO/GR/usage/opname) | Titik kebocoran terbesar kontraktor; stok & opname sudah live tapi tak pernah diadu ke angka teoritis | #1 (take-off, langkah 6) | Sedang | Program C langkah 6–7 + hidupkan/ganti `project_rab_materials` |
| 5 | **Commitment & varians per cost code** (budget vs commit [PO + borongan mandor] vs aktual) | Bocor ketahuan SETELAH uang keluar, bukan saat komitmen diteken | RAP (#1) + ACL map (112) | Sedang | Program C downstream |
| 6 | **Cost-to-complete / forecast akhir proyek** | Proyek rugi ketahuan di akhir, bukan saat masih bisa dikoreksi | #5 | Sedang | Program C downstream |
| 7 | **Aktifkan audit append-only (073)** | Kriteria kualitas #1 belum penuh: audit_logs masih bisa diubah diam-diam | **Red-Line — butuh ack Nizar** (memang dirancang begitu) | Kecil | Sudah ditulis, tinggal keputusan |
| 8 | **WIP / laporan persentase penyelesaian (PSAK)** — tanpa GL penuh | L/R per proyek tidak bermakna; bank & pemberi kerja besar memintanya | Progress + biaya per proyek (ada kasar). ⚠️ **Tripwire company berlaku: keputusan multi-company DULU** | Sedang | Celah roadmap — kandidat Phase 4 EA |
| 9 | **Rantai kontrak pemerintah**: LD arah kontraktor (reuse pola penalty 091), adendum/EOT ringan di CO, register jaminan/bond | Tender pemerintah: denda keterlambatan & jaminan = uang nyata + syarat administrasi | Penalty engine + CO (ada) | Kecil–sedang | Perpanjangan Modul 1/3 EA |
| 10 | **Bid register + backlog ringan** | Tender kalah tak terpelajari; backlog tak terlihat saat memutuskan ambil kerja | Nol | Kecil | Domain pra-konstruksi (baru) |
| 11 | **Baseline schedule + look-ahead** | PV di EVM dari input manual → SPI kurang terpercaya | Gantt/rab_schedule (ada) | Sedang | Perpanjangan monitoring |
| 12 | **Log alat & sewa alat ringan** | Proyek pabrik/gudang padat alat; kalau mayoritas sewa cukup tracking sewa+utilisasi | Expenses (ada); skema 045 tersedia bila butuh lebih | Kecil | Modul 12 MASTER_PLAN (versi ringan) |

Modul yang direncanakan ERP_MASTER_PLAN dan tetap valid tapi **di belakang antrian
ini**: Modul 9a RAB hard-guard MR (setelah #4 memberi angka teoritis), 11a opname
hard-lock (skema 044 sudah ada), 9b PO WhatsApp/email, 11b signing internal,
Mobile Phase 2–3 (eksplisit ditunda oleh keputusan CECEP Option 2).

---

## 4. YANG SENGAJA TIDAK DIBANGUN (perluasan Never Build List)

Never Build List resmi (roadmap 04 §155, enforced oleh Engineering-Constitution 18)
sudah memuat: EAV penuh, multi-currency L1/L2, BIM 3D viewer, LMS, ESG native,
FM/O&M penuh, microservices default, Kafka, rebuild Supabase Auth/Storage.

**Dicoret owner 2026-07-26 (scope):** multi-currency & revaluasi FX (final),
i18n/multi-bahasa, SSO/SAML, GDPR/data residency, adapter pajak multi-negara,
transaksi antar-perusahaan lintas negara, impor & kepabeanan.

**Kandidat TAMBAHAN dari sesi ini** (perlu ack owner; alasan: tidak menghasilkan
apa-apa untuk skala bisnis — tool eksternal lebih murah dan lebih benar):

| Item | Pengganti |
|---|---|
| GL double-entry penuh + Neraca/L-R + tutup buku in-app | Software akuntansi eksternal (Accurate/Jurnal) + jembatan export transaksi. ⚠️ Bertentangan dengan ERP_MASTER_PLAN Modul 10 — keputusan owner, lihat §5 |
| Payroll staf (PPh21/BPJS) + absensi karyawan | Tool payroll eksternal; sistem fokus upah mandor/tukang (sudah kuat) |
| e-Faktur generator | Coretax/DJP; pencatatan nomor sudah ada |
| Rekonsiliasi bank | Akuntan / software eksternal |
| HSE/K3 & QA/QC suite penuh | Bangun HANYA saat tender mensyaratkan; sampai itu form + rekap eksternal |
| CRM pipeline penuh | Bid register ringan (#10) cukup |
| CPM engine + resource leveling | Gantt soft-dependency cukup untuk tim kecil |
| Transmittal / matriks distribusi / e-signature legal | Email/Drive/e-materai; signing internal Modul 11b tetap boleh (bukan legal-grade) |
| Report builder kustom + distribusi terjadwal | Export Excel/PDF (ada) cukup |
| Prakualifikasi vendor, evaluasi vendor formal, blanket order | Vendor pool kecil; catatan sederhana cukup |
| Kalender kerja & hari libur master | Tunda sampai ada pemakainya |
| Multi-tenant SaaS | Tetap gate Program F: wajib pelanggan eksternal committed |

---

## 5. KEPUTUSAN TERBUKA UNTUK NIZAR (tiga saja)

1. **GL in-app vs akuntansi eksternal** — ERP_MASTER_PLAN Modul 10 (in-app,
   terakhir) vs rekomendasi sesi ini (eksternal + export + WIP report). Tidak
   mendesak (dua posisi sepakat "bukan sekarang"), tapi menentukan bentuk #8 dan
   memicu tripwire multi-company.
2. **Entitas hukum kedua (PT/CV) — realistis 1–2 tahun?** Jika ya, Phase 7
   (multi-company) dimajukan ke setelah-CECEP. Detail: `KEPUTUSAN-MULTI-COMPANY.md`.
3. **Aktifkan trigger audit append-only (073)?** Red-Line by design; menutup gap
   terakhir kriteria kualitas #1.

---

## 6. SKOR LIMA PEMBEDA & LIMA KRITERIA KUALITAS

**Lima pembeda ERP kontraktor** (verifikasi kode — detail di taksonomi):
cost control berlapis **2/5** · EVM **3.5/5** (taksonomi lama salah tandai 🔴) ·
WIP/PSAK **0/5** · rekonsiliasi material **1.5/5** · rantai kontrak **2.5/5**.
Ranking §3 = jalur menaikkan kelimanya: #1/#4/#5/#6 → pembeda 1 & 4; #8 → pembeda 3;
#3/#9 → pembeda 5; #11 → pembeda 2.

**Lima kriteria kualitas owner**: (1) pertanggungjawaban angka — kuat sebagian,
gap = append-only dorman (#7); (2) cost control — 2/5, jalur di atas; (3) tahan
orang — kuat (approval engine + RBAC + anti-lockout), sisa RLS-dormant sebagai
gerbang mobile; (4) data historis tahan aturan baru — kuat (effective-dating +
baseline snapshot; pola WAJIB dipertahankan di modul baru); (5) UI orang lapangan —
paling lemah (mobile tipis, input mandor nyatanya masih WhatsApp) — naik prioritas
setelah CECEP siap-pakai, selaras keputusan Mobile Phase 2–3 ditunda.
