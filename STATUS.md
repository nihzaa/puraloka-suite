# STATUS — Puraloka Suite (penunjuk satu pintu)

**Diperbarui:** 2026-07-27 · File ini adalah `STATUS.md` yang diwajibkan AUTOPILOT §2
— penunjuk TIPIS, bukan duplikasi konten. Update tanggal + baris "Fase aktif" setiap
kali keadaan berubah; detail selalu di dokumen rujukan.

## Fase aktif

**Phase 3 / Program C (CECEP)** — migration 102–121, 70 test-file hijau (PR #86–96).
Keputusan founder 2026-07-26 (header `docs/ERP_MASTER_PLAN.md`): **CECEP Option 2 —
tuntaskan CECEP sampai siap-pakai sebelum modul besar lain.**

**Build order 10 langkah (`.../CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md`) — status
per-langkah, verified 2026-07-26/27:**
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
- ❌ **6 Material Take-off** (agregasi, BBS besi per-Ø, `steel_profiles`) — **0
  tabel, BELUM DIMULAI** — **titik-bocor #1 MASIH TERBUKA** (tanpa pagu, belanja
  material tak terkendali)
- ❌ **7 RAP/Pagu** + sambung realisasi — **0 tabel, BELUM DIMULAI** (butuh 6)
- 🟡 **8** AHSP Company: struktur DB ada sejak 107/117; **endpoint create-assembly
  hidup** (PR #96, `POST /cecep/assemblies`, `source='company'`, mid-estimasi)
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

**Prioritas berikutnya (mengikat, urutan build-order): langkah 6 (Material
Take-off) → 7 (RAP/Pagu).** Ini yang menutup titik-bocor #1 sesungguhnya —
JANGAN anggap CECEP "siap-pakai" sebelum keduanya ada.

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
