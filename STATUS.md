# STATUS — Puraloka Suite (penunjuk satu pintu)

**Diperbarui:** 2026-07-27 · File ini adalah `STATUS.md` yang diwajibkan AUTOPILOT §2
— penunjuk TIPIS, bukan duplikasi konten. Update tanggal + baris "Fase aktif" setiap
kali keadaan berubah; detail selalu di dokumen rujukan.

## Fase aktif

**Phase 3 / Program C (CECEP)** — struktur M1–M4 selesai (migration 102–116, 500+
test); **tertahan di gerbang CI isolation** sebelum seed AHSP. Titik STOP menunggu
founder: (a) ack seed AHSP, (b) keputusan sumbu EDISI, (c) dpp_factor split.
Keputusan founder 2026-07-26 (header `docs/ERP_MASTER_PLAN.md`): **CECEP Option 2 —
tuntaskan CECEP sampai siap-pakai sebelum modul besar lain.**

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

1. Ack seed AHSP + sumbu EDISI (gerbang CECEP).
2. GL in-app vs akuntansi eksternal (`docs/PETA-PRIORITAS-ERP.md` §5).
3. Entitas PT/CV kedua realistis 1–2 tahun? (`docs/KEPUTUSAN-MULTI-COMPANY.md` §2).
4. Aktifkan trigger audit append-only 073 (Red-Line by design).
