# STATUS — Puraloka Suite (penunjuk satu pintu)

**Diperbarui:** 2026-07-28 (rev-2: multi-tenant) · File ini adalah `STATUS.md` yang diwajibkan AUTOPILOT §2
— penunjuk TIPIS, bukan duplikasi konten. Update tanggal + baris "Fase aktif" setiap
kali keadaan berubah; detail selalu di dokumen rujukan.

## Fase aktif

> ### 🔄 PERUBAHAN ARAH BESAR — 2026-07-28
> **CECEP DITUNDA. Multi-tenant (Program D / L2→L3) jadi prioritas tunggal.**
>
> Pemicu: founder menetapkan sistem akan dijual sebagai **SaaS** (calon pelanggan
> konkret sudah ada) DAN akan ada **badan usaha kedua**. Ini memicu **kedua tripwire**
> di `docs/KEPUTUSAN-MULTI-COMPANY.md` §2 sekaligus.
>
> Keputusan lengkap + roadmap 8 tahap: **`.../Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md`** (ACCEPTED).
> Mandat "CECEP Option 2" (2026-07-26) **ditunda**, bukan dicabut — CECEP dilanjutkan
> setelah multi-tenant TUNTAS (bukan setengah matang).
>
> **Rasionalisasi founder:** sistem **belum dipakai operasional nyata (masih
> development)** → nol data produksi = waktu TERMURAH untuk retrofit pondasi.
> Titik-bocor #1 belum menimbulkan kerugian aktual.
>
> **GERBANG MUTLAK:** tenant kedua TIDAK BOLEH dibuat di produksi sebelum Tahap 4
> dan 5 selesai penuh. Selama itu sistem berisi tepat satu company.

**Program D — Multi-Tenant (AKTIF).** Tahap: T0 ADR ✅ → T1 audit 94 tabel →
T2 skema inti (`companies`, `company_members`, `document_number_series`) →
T3 `company_id` [RED-LINE] → T4 repository wrapper (XL) → T5 RLS dual-axis →
T6 numbering → T7 exit criteria L2. CECEP langkah 7+ dilanjutkan **setelah T7**.

**Phase 3 / Program C (CECEP) — DITUNDA di langkah 6 (hasil 1–6 TETAP UTUH & dipakai).**
migration 102–123, 72 test-file hijau (PR #86–101). Langkah 1/3/4/5/6 ✅ selesai;
langkah 7 (RAP/Pagu) **ditahan** — ia commitment ledger, wajib menunggu multi-tenant
(tripwire #1). Kompensasi: RAP nanti lahir dengan `company_id` sejak baris pertama
→ nol backfill. **Syarat lanjut CECEP: multi-tenant TUNTAS** (seluruh checklist L2
doc 09 §2 tercentang), bukan sekadar "tahapnya sudah dikerjakan".

**Build order 10 langkah (`.../CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md`) — status
per-langkah, verified 2026-07-26/28:**
- ✅ **1** CI isolation tuntas (project CI terpisah; repo public + branch protection)
- 🟡 **2** Config Lapis1/2 — PPN reuse (`tax.ppn_rate` existing); **BUK & rounding
  BELUM di-config**, masih wajib eksplisit per-request (C1, tanpa default diam-diam)
- ✅ **3** Metode per-estimasi + wiring engine↔config (engine paritas nyambung)
- ✅ **4** Seed AHSP nasional PENUH: 2.620 assemblies (SE-47-2026) + 2.429 resources +
  15.149 komponen, terverifikasi 100% struktural (dataset↔DB↔workbook, nol mismatch)
  + fungsional (2.573 HSP cocok persis vs F workbook; 42 selisih = cacat internal
  workbook terdokumentasi, bukan bug pipeline). Idempotent — re-import file sama =
  no-op aman
- ✅ **5** Endpoint hitung RAB end-to-end + golden-file (HSP 278300, dari data dev)
- ✅ **6 Material Take-off SELESAI** — D2 agregasi lintas item (PR #98: satu baris
  per resource + drill-down provenance) · D3 BBS besi per-Ø + D4 katalog profil baja
  + D5 faktor kemasan (PR #100, migration 122/123: `rebar_takeoff`, `steel_profiles`
  58 profil ter-seed dari DAFTAR BESI verbatim, `material_pack`). Konstanta besi
  0,006165 diverifikasi = turunan fisika (ρ7850×π/4÷1e6) DAN cocok tabel baku SNI.
  **Titik-bocor #1: sisi take-off tertutup; pagu (langkah 7) masih terbuka**
- ❌ **7 RAP/Pagu** + sambung realisasi — **0 tabel, BELUM DIMULAI** (butuh 6 tuntas)
- 🟡 **8** AHSP Company: struktur DB ada sejak 107/117 · endpoint create-assembly
  hidup (PR #96) · **KATALOG COMPANY TER-SEED** (PR #101): 417 analisa Cibuluh +
  2.682 koefisien, verifikasi DB 100% nol-mismatch, idempoten. Paritas 87,1%
  (metode Cibuluh terverifikasi: BUK 10% → TRUNC Rp10 pada TOTAL, bukan per-kolom;
  status per-analisa TERSIMPAN: exact 366 / cacat-SUM-workbook 39 / unexplained 6).
  **Belum ada**: tombol Edit (correction/deviation) & Duplikat national→company di UI
- ⏸️ **9** dpp_factor split PPN — sengaja ditunda (gerbang D10, butuh guardrail
  di-run ulang di env ber-PPN nyata + aba-aba founder)
- 🟡 **10** UI `/estimasi` (Komposer+Katalog+Harga+rekap-PPN) hidup; **layar
  Material/RAP belum ada**

**Rantai "bikin RAB dari UI" hidup end-to-end** (langkah 1/3/4/5 + sebagian 2/8/10):
proyek → skenario → versi (menyatakan edisi) → item dari **katalog** / **custom
company mid-estimasi** (§2.2, menyentuh gerbang immutability `assemblies`, ditutup
approval desain) / **lump-sum** (§2.3, pekerjaan bukan-beranalisa) → price book
(lifecycle draft→verified→active) → engine paritas → **rekap per kategori + PPN**
→ Ajukan. Tiap rupiah ter-telusur ke `price_book_entry_id` + koefisien + edisi.

**PR #86–96 merged** (sumbu edisi 117/118 · thin-slice+seed penuh · price-resolver
+ compute path · scenario/price-book endpoints · UI 3-tab · rekap+PPN · polish
harga · item-custom/lump-sum). Analisis SE47-vs-Cibuluh selesai (report untracked
— nunggu keputusan masking; temuan: SE = SNI-2013 modernisasi, upah −33%, mortar
M/S/N/O = 1:2/3/4/5). AI-import edisi baru (masa depan) = inisiatif terpisah, tak
bertabrakan (parser+auditor, bukan penghasil angka) — lihat plan
`humming-weaving-snail.md`.

**Katalog AHSP di dev (terverifikasi 2026-07-28):** 2.620 nasional (SE-47-2026) +
418 company (417 Cibuluh + 1 fixture) · 2.827 resources · 58 profil baja.

**Prioritas CECEP SETELAH multi-tenant tuntas** (bukan sekarang — lihat kotak
perubahan arah di atas): langkah 7 (RAP/Pagu, D6) — `rap_budget` /
`rap_material_line` / `rap_labor_line` / `rap_change_log` + kunci pagu, **lahir
dengan `company_id` sejak baris pertama**. Lalu langkah 8 (UI builder AHSP company:
edit + duplikat — jadi jauh lebih bermakna pasca-multi-tenant karena
`source='company'` akhirnya punya arti "company yang mana") & 10 (layar Material/RAP).

Sisipan saat jeda gate (sesuai PETA §3 #2, tidak menyela CECEP): **celah 3-way match
procurement DITUTUP 2026-07-27** (invoice manual wajib link GR, harga vs PO, anti
invoice dobel + migration 121) — detail: `docs/DEVELOPMENT_LOG.md` entry 2026-07-27
+ taksonomi §6.

Phase 1 (Program A) ✅ · Phase 2 (Program B) ✅.

## Ke mana membaca apa

| Butuh | Baca |
|---|---|
| Log berjalan harian (per-migration/PR) | `docs/DEVELOPMENT_LOG.md` |
| Peta prioritas + registry semua dokumen rencana (mana AKTIF/STALE) | `docs/PETA-PRIORITAS-ERP.md` ← **dokumen induk** |
| Status per-menu ERP terverifikasi kode | `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md` |
| Keputusan multi-company + tripwire | `docs/KEPUTUSAN-MULTI-COMPANY.md` |
| Status Phase 1/2 + temuan RLS/storage | `docs/superpowers/specs/2026-07-18-enterprise-architecture/PHASE-{1,2}-STATUS.md` |
| Urutan build CECEP (terkunci, 10 langkah) | `.../CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md` + `.../CECEP/NEXT-EXEC-PREP.md` |
| Peta penomoran Program A–F ↔ Phase 0–9 | `.../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md` (⚠️ "Phase 7" EA = multi-company; "Fase 7" ERP_MASTER_PLAN = GL — selalu sebut sumber) |

## Keputusan terbuka menunggu Nizar

**A. (BARU, memblokir T1 multi-tenant) "≥2 kontributor review"** — checklist L2
   (`09-saas-and-tenancy-readiness.md` §2 item 6) eksplisit: migrasi ini **tidak
   solo-safe**. Tim saat ini 1 orang. Opsi: reviewer eksternal untuk T3 & T5 saja
   (dua tahap paling berisiko), atau ack tertulis founder yang mengakui pengecualian
   secara sadar. Detail: ADR-011 §10 R7.
**B. (BARU, tidak memblokir) Pelanggan pertama punya >1 badan usaha?** Menentukan
   apakah butuh level `tenants` di atas `companies` sekarang atau cukup nanti.
   Default sementara: cukup `companies` + `parent_company_id`. ADR-011 §3.

0. **KEAMANAN (mendesak, repo public):** rotasi 4 password test yang sempat bocor di
   `gate-1a-preconditions-response.md` (sudah diredaksi; nilai asli tetap di riwayat
   git) — terutama login admin dev.
1. Masking angka Cibuluh di dokumen public (4 baris AHSP-GOLDEN-PROVENANCE +
   report SE47-vs-Cibuluh yang masih untracked).
1b. Drop policy dev `"Allow all access on users"` (only-in-dev, permisif, tanpa
   migrasi pembuat — temuan schema-diff 4a) + konfirmasi migrasi 043–047
   (GL/asset/opname/SCM) tetap forward-draft.
1c. Izin A5 `--execute`: schema `test` residu di dev + residu CECEP
   (570 estimate_items dll — dry-run sudah dilaporkan).
2. GL in-app vs akuntansi eksternal (`docs/PETA-PRIORITAS-ERP.md` §5).
3. Entitas PT/CV kedua realistis 1–2 tahun? (`docs/KEPUTUSAN-MULTI-COMPANY.md` §2).
4. Aktifkan trigger audit append-only 073 (Red-Line by design).
