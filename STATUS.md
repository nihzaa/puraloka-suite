# STATUS — Puraloka Suite (penunjuk satu pintu)

**Diperbarui:** 2026-07-26 · File ini adalah `STATUS.md` yang diwajibkan AUTOPILOT §2
— penunjuk TIPIS, bukan duplikasi konten. Update tanggal + baris "Fase aktif" setiap
kali keadaan berubah; detail selalu di dokumen rujukan.

## Fase aktif

**Phase 3 / Program C (CECEP)** — migration 102–119, 65 test-file (585 test) hijau.
**RANTAI "BIKIN RAB DARI UI" TERSAMBUNG (thin-slice)**: menu `/estimasi` (3 tab:
Komposer · Katalog AHSP · Harga) → skenario → versi (menyatakan edisi) → item dari
assembly × price book → engine paritas → total + Ajukan. PR #86–#90 merged:
sumbu EDISI (117/118) · seed verbatim 3.6.1.1–10 ber-provenance (golden 278300 dari
data dev) · price-resolver + POST items ter-telusur (provenance price_book_entry_id)
· scenario/versi/price-book endpoints · UI /estimasi + menu 119.
CI isolation TUNTAS (project CI terpisah; repo public + branch protection).
Analisis SE47-vs-Cibuluh selesai (report untracked — nunggu keputusan masking;
temuan: SE = SNI-2013 modernisasi, upah −33%, mortar M/S/N/O = 1:2/3/4/5).
Keputusan founder 2026-07-26 (header `docs/ERP_MASTER_PLAN.md`): **CECEP Option 2 —
tuntaskan CECEP sampai siap-pakai sebelum modul besar lain.**
**Impor PENUH katalog SE-47-2026 SELESAI** (PR #91 merged, migration 120): 2.620
assemblies aktif ber-edisi (dari 10 thin-slice) · 2.429 resources · 15.149 komponen ·
terverifikasi 100% struktural (dataset↔DB↔workbook, nol mismatch) + fungsional
(2.573 HSP cocok persis vs F workbook; 42 selisih = cacat internal workbook
terdokumentasi per-analisa, bukan bug pipeline) · idempotent (identity constraint
117 + cek existing) — re-import file sama = no-op aman.

Sisa ke siap-pakai penuh (urutan disepakati, lihat plan
`humming-weaving-snail.md`): **(b)** polish UI tab Harga (confidence_level +
expired_date belum di form) → **(c)** endpoint+UI rekap RAB per kategori + PPN
(pakai flat `tax.ppn_rate` 0.11 — split dpp_factor 11/12 TETAP gated D10, jangan
disentuh) → **(d)** alur item-tak-di-katalog (lump-sum dulu, lalu create-assembly
company di-tengah-estimasi — menyentuh gerbang immutability `assemblies`, disebut
eksplisit saat dikerjakan). AI-import edisi baru = inisiatif terpisah, tak
bertabrakan (parser+auditor, bukan penghasil angka).

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
