# CECEP — Sumbu EDISI + Builder + Alur Item-Baru (RANCANGAN, belum dibangun)

> Prioritas founder: **3.1/3.2 sebelum seed** (ubah skema mumpung KB kosong = hampir gratis,
> pelajaran `unit`). Rancangan; belum dibangun. Analisis perbandingan SE 47/2026 vs Cibuluh
> (prompt sebelumnya) masih terutang — dikerjakan setelah ini.

## 3.1 — Temuan skema (KONFIRMASI: edisi TIDAK ADA)
`assemblies` punya: `source` (national/company/project/custom = **SUMBER**), `version_number`
(**VERSI** internal, revisi), `reference_standard` (TEXT bebas — label, bukan provenance).
**Tak ada** entitas edisi ber-provenance (nomor SE/SHA256/tanggal). → SNI 2013 / SE 68/2024 /
SE 47/2026 tak terbedakan di `source='national'`. **Perlu sumbu EDISI baru.**

## 3.2–3.4 — Rancangan sumbu EDISI (tiga sumbu ORTHOGONAL, jangan dicampur)

| Sumbu | Arti | Kolom/Tabel |
|---|---|---|
| **EDISI** | Dokumen SE mana (LUAR, otoritatif) — SNI 2013, SE 68/2024, SE 47/2026 | tabel `ahsp_editions` + `assemblies.edition_id` |
| **SUMBER** | Siapa yang punya (national/company/project/custom) | `assemblies.source` (sudah ada) |
| **VERSI** | Revisi satu analisa (DALAM, hasil edit) | `assemblies.version_number` (sudah ada) |

**`ahsp_editions`** (registry edisi, provenance — 3.4):
```sql
CREATE TABLE ahsp_editions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,      -- 'SE-47-2026' | 'SE-68-2024' | 'SNI-2013'
  name          TEXT NOT NULL,
  se_number     TEXT,                       -- 'SE 47/SE/Dk/2026'
  publish_date  DATE,
  source_file   TEXT,  source_sha256 TEXT,  -- provenance impor
  imported_at   TIMESTAMPTZ, imported_by UUID REFERENCES users(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- assemblies.edition_id UUID REFERENCES ahsp_editions(id)   (national wajib; company turunan
--   bawa edition_id INDUK sbg provenance; custom/project boleh NULL)
-- identitas: UNIQUE (code, edition_id, source, version_number)  ← satu 'code' hidup di banyak edisi
```
**Aturan (3.4):** edisi **MENAMBAH, tak pernah mengganti/hapus** (Lapis 3 guard: no-update/no-delete
pada `ahsp_editions` + assemblies lama). Tiap edisi bawa provenance. **Estimasi MENYATAKAN edisi**
(`estimate_version.edition_id`, permanen — sama pola metode B3). Estimasi lama **tak pernah berubah**
saat edisi baru masuk (immutability M1 + edition_id tersimpan).

## 1.1–1.3 — Builder + BASELINE IMPOR IMMUTABLE + jenis edit (national & company)

**Revisi founder: national BOLEH diedit + punya builder**, syaratnya baseline impor immutable +
overlay. Rancangan yang menjawab "SE aslinya bilang apa?" & "apa yang saya ubah?" kapan pun:

- **Baseline impor IMMUTABLE**: hasil impor = `assemblies` version 1, `is_import_baseline=true`,
  `edited_from=NULL`. **NEVER ditimpa** (guard Lapis 3: UPDATE koef/komponen pada baris
  is_import_baseline DITOLAK). Selalu bisa ditanya "SE bilang apa" → baca baseline.
- **Edit = VERSI BARU di atas baseline** (overlay), bukan mutate. `version_number++`,
  `edited_from = <versi sebelumnya>`, tercatat siapa/kapan/nilai lama-baru/alasan (3.3).
- **DUA JENIS EDIT ditanya saat edit (1.2)** — menentukan label:
  - **PERBAIKAN (`correction`)**: impor salah baca (SE 0,7 → terbaca 0,07), dibetulkan agar COCOK SE.
    Hasil **tetap sah SE 47/2026** (edisi tetap, label SE dipertahankan). Baseline (salah) tetap
    tersimpan sebagai jejak impor; versi correction = nilai SE yang benar.
  - **PENYIMPANGAN (`deviation`)**: SE 0,7 → founder mau 0,65 (cara kerja beda). Angka boleh diubah,
    TAPI hasil **BUKAN lagi SE 47/2026** → **otomatis jadi `source='company'`** (fork), `edition_id`
    tetap menunjuk edisi INDUK sbg provenance, label cetak "Company (turunan SE 47/2026)". **National
    tetap murni** — deviasi keluar dari katalog national.
  - Guard mencegah skenario terburuk (1.2): analisa berlabel SE **dijamin** cocok SE (baseline +
    correction saja yang boleh berlabel SE; deviation dilempar ke company). Saat diperiksa, tunjuk SE = cocok.
- **Analisa dipakai estimasi → tak berubah diam-diam** (1.3): estimasi menyimpan `assembly_id` +
  version; edit membuat versi baru, estimasi lama tetap ke versi lama (immutability M1-M2).

## 1.3/1.4 — Duplikat ke company + Impor batch national
- **Duplikat "salin jadi company"** (1.3 prompt lama): tombol di layar national → assembly baru
  `source='company'`, `derived_from_assembly_id`, `derived_from_edition_id`, `derived_at/by`
  (provenance). Bebas diubah. **Notifikasi induk berubah** (lihat 3.5).
- **Tambah national = IMPOR batch** (1.4): SE baru / item terlewat → admin impor dari file resmi,
  provenance (`ahsp_editions` row + file/SHA256/SE) + audit. **Bukan form bebas** untuk national
  (form bebas = jalur company/deviation). Guard: assembly `source='national'` hanya lahir dari
  jalur impor (bukan endpoint create biasa).

## 3.5 — Saat edisi baru terbit (rancangan)
- **Laporan perbandingan antar-edisi**: cocokkan by `code` (atau uraian bila kode beda skema) →
  koefisien berubah / item baru / item hilang. Founder lihat DAMPAK sebelum pindah.
- **Estimasi DRAFT**: boleh ditawari pindah edisi + **pratinjau selisih** → **wajib disetujui**
  (tak pernah otomatis). Ganti `estimate_version.edition_id` hanya setelah approve.
- **Estimasi submit/approved**: **TIDAK PERNAH** berubah (guard status ≠ draft).
- **Company turunan national**: kalau induk (`derived_from`) berubah di edisi baru → **notifikasi**
  founder ("induk berubah, mau ikut?"), keputusan manual ikut/tidak.

## 3.6 — KONFIRMASI: harga = sumbu TERPISAH dari edisi
**BENAR & sudah sesuai skema.** `price_book_entries` terikat `effective_date` + `location` +
`version_number` — **tak ada `edition_id`**. Harga = wilayah+tanggal (ADR harga lokal effective-date),
**bukan** terikat SE. Desain edisi **tidak** menyentuh price book. Satu harga Bandung 2026 dipakai
lintas edisi koefisien. (Konfirmasi: jangan pernah tambah `edition_id` ke price_book.)

## 2 — Item tak ada saat bikin RAB (TIGA sebab, penanganan beda — alur, jangan bangun)
Bikin RAB tak boleh berhenti karena satu item. Alur pencarian saat item tak ketemu di estimasi:
1. **CARI DI KATALOG NASIONAL DULU** (2.1): kalau ADA di edisi aktif tapi **belum ter-seed** →
   tawarkan **IMPOR item itu** (bukan bikin baru — supaya hak "standar" tak hilang). Kesalahan impor
   diobati impor ulang.
2. **TAK ADA di SE mana pun** (2.2 — paling sering: atap spandek, gording CNP, base plate, HTB) →
   **buat analisa company DI TENGAH layar estimasi**, tanpa keluar, **tanpa approval** (hanya dipakai
   sendiri). Tiga cara: dari nol / **duplikat analisa mirip** lalu sesuaikan / **impor dari Excel**.
3. **BUKAN pekerjaan beranalisa** (2.3 — lift/pompa/septictank/air kerja, 19 item Cibuluh) → jalur
   **harga langsung/lump-sum**, JANGAN dipaksa jadi AHSP. Alur pembuatan menawarkan jalur ini juga.
4. **Tinjau belakangan** (2.4): penanda "N analisa baru dibuat di estimasi ini" → cegah katalog
   berantakan tanpa sadar. (Flag `created_in_estimate_id` di assembly company.)

## Dampak ke skema (sebelum seed) — usul migrasi
1. `ahsp_editions` + `assemblies.edition_id` + identitas `UNIQUE(code, edition_id, source, version_number)`.
2. `assemblies`: `is_import_baseline BOOLEAN`, `edited_from UUID`, `edit_type` (correction/deviation),
   `edit_reason`, `derived_from_assembly_id`, `derived_from_edition_id`, `created_in_estimate_id`.
3. `estimate_versions.edition_id` (edisi yang dipakai, permanen — pola B3).
4. Guard Lapis 3: no-update/no-delete baseline; national hanya lahir dari impor; deviation → company.
5. **Price book TIDAK disentuh** (3.6).

> Rekomendasi: bangun sumbu edisi + kolom overlay ini **sebagai bagian fondasi sebelum seed AHSP**
> (langkah ② build order, sebelum ④ seed). Menunggu keputusan founder (seperti `unit`).

## Masih terutang (analisis, bukan skema)
- Cek seed Cibuluh (prompt lalu #2): verbatim vs modifikasi, jumlah item, pengecualian #REF!/lump-sum/harga.
- Perbandingan SE 47/2026 vs Cibuluh (prompt lalu #3): match by uraian, selisih koefisien same-price,
  recompute RAB Cibuluh dgn koef SE, top-10 by impact. **Dikerjakan berikutnya.**
