# 00 — RINGKASAN EKSEKUTIF

**Audit read-only, 2026-08-02.** Nol perubahan kode/DB/git. Satu-satunya tulisan adalah
berkas laporan di direktori ini.

## Verdict (5 kalimat)

Puraloka Suite adalah codebase dengan **disiplin rekayasa jauh di atas rata-rata** —
1276 test lulus, RLS aktif di 122/122 tabel, nol kolom float untuk uang, dan sepuluh lebih
penjaga arsitektural yang dieksekusi CI (termasuk detektor "kegagalan senyap" dan
"penulisan tanpa periksa" yang sangat jarang saya temui). Namun ia **belum siap dijual**:
kesiapan multi-tenant baru ~52 (80 dari 122 tabel belum ber-`company_id`, 53 gerbang
otorisasi masih memakai literal role), tak ada billing, tak ada runbook operasional.
Frontend adalah titik terlemah (48) — 1.039 warna ter-hardcode di 60 berkas dan
`useEffect` di 56 dari 59 halaman membuat target "UI/UX immersive" mustahil tanpa refactor
lapis data. Dokumentasi terbelah: `STATUS.md`/`ROADMAP` mutakhir dan jujur, sementara
`CLAUDE.md` — berkas yang dibaca agent AI tiap sesi — menyatakan 58 migrasi & 27 tabel
padahal kenyataannya **174 migrasi & 122 tabel**. Skor tertimbang **≈63/100**: fondasinya
benar, produknya belum jadi, dan jendela termurah untuk menyelesaikan multi-tenant
(`journal_entries` masih 0 baris) sedang menutup.

## Angka kunci terverifikasi

| Metrik | Klaim dokumen | **Kenyataan terukur** |
|---|---|---|
| Migrasi | "001–058" (CLAUDE.md) | **174 berkas**, buku tercatat s.d. **162** |
| Tabel DB | "27+" (CLAUDE.md) | **122** |
| RLS | "~46 tabel" | **122/122 (100%)**, 375 policy |
| Endpoint | ~100 terdokumentasi | **198** (49 file route) |
| Test | — | **1276 lulus / 24 skip / 1 suite gagal**, 213,9 s |
| LOC | — | **~217.700** |
| Kolom float | — | **0** |
| Timestamp | — | **249, 100% `timestamptz`** |
| `company_id` | — | **42 / 122 tabel** |

## Lima temuan terpenting

1. **F-001 (P0)** — 80 tabel belum ber-`company_id`. Selagi `journal_entries` = 0 baris,
   biayanya S–M; setelah dua entitas mengisi ledger, ADR-011 sendiri menyatakan backfill
   **berhenti lossless**.
2. **F-002 (P1)** — 53 role literal (`cash.ts:511`, `kasbons.ts:135`) melanggar ADR-004
   dan menjadi bahaya nyata saat tenant kedua lahir.
3. **F-004 (P1)** — `CLAUDE.md` salah berat; ia adalah sumber halusinasi agent paling produktif.
4. **F-006 (P1)** — 1.039 hex di 60 berkas memblokir white-label, dark mode, dan immersive UX.
5. **F-003 (P1)** — buku migrasi meleset 12 versi; alat perbaikannya sudah ada, tinggal dijalankan.

## Yang patut dibanggakan

Penjaga arsitektural CI, integritas skema (float/timezone/trigger), test yang mengumumkan
dirinya hampa alih-alih lulus diam-diam, golden file angka eksak (`HSP=278300`, RAB Cibuluh
Rp 3,63 M) yang **dijalankan dan lulus**, serta governance dokumen yang benar-benar bekerja
(ADR-011 mengamandemen dokumen lama lewat tripwire yang dokumen itu sendiri rancang).

## Peta berkas laporan

| Berkas | Isi |
|---|---|
| `01-INVENTORY.md` | Angka faktual repo, DB, dependency |
| `02-DOCS-INVENTORY.md` | Tabel dokumen, peta ADR, kontradiksi, duplikasi worktree |
| `03-CODE-QUALITY.md` | Type safety, layering, transaksi, uang & angka |
| `04-SECURITY.md` | Matriks otorisasi, gerbang tenancy, rahasia |
| `05-DATABASE.md` | Drift migrasi, CECEP, golden file, integritas |
| `06-API.md` | Inventaris endpoint, modul tak terdokumentasi, idempotensi |
| `07-FRONTEND-UX.md` | Design system, state per halaman, penilaian immersive |
| `08-TEST-CI.md` | Hasil run sesungguhnya, penjaga CI, DX |
| `09-VISION-GAP.md` | Visi menurut auditor + gap multi-tenant/AI/UX + 25 fitur |
| `10-SCORECARD-RISKS.md` | Skor 12 dimensi, top 15 risiko, titik tanpa jalan kembali |
| `FINDINGS.csv` | 25 temuan sebagai backlog (P0–P3, effort S–XL) |

## Batas audit ini

Yang **tidak** berhasil diverifikasi, dengan alasan, tercantum di tiap berkas dan
diringkas di ringkasan chat. Yang terpenting: **schema diff dev vs CI level kolom**
(kredensial CI hanya ada di GitHub Secrets), **coverage numerik**, **audit aksesibilitas**
(butuh menjalankan aplikasi), dan **pemindaian `git log -p` penuh untuk secret historis**.
