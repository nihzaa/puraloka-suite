# T3 — Dokumen Audit Pra-Eksekusi (menunggu ack tertulis founder)

**Tanggal:** 2026-07-29 · **Status:** ✅ **SELESAI — T3 di-apply ke dev 2026-07-29**
(migration `127_multitenant_company_id.sql`; hasil di §10)
**Ack:** diterima 2026-07-29 — founder
menyetujui kedua rekomendasi. **Q1 = PRIVAT** (`suppliers` → kategori B) ·
**Q2 = SEKARANG** (`SET NOT NULL` dijalankan di T3c, tidak ditunda ke T4).
Eksekusi dilanjutkan setelah uji rollback (§6) dilampirkan.
**Dasar:** ADR-011 §10 R7 — keputusan founder 2026-07-28 memilih *"Anda review
sendiri + saya buat audit tertulis"* menggantikan syarat "≥2 kontributor review".

> **Cara memakai dokumen ini:** baca §0 (ringkasan 1 menit) → §5 (apa yang bisa
> rusak) → §7 (yang TIDAK saya verifikasi). Kalau setuju, balas di PR dengan
> kalimat ack; kalau ada yang janggal, sebut nomornya. **Tanpa ack, T3 tidak
> dijalankan** — bukan formalitas, karena T3 adalah tahap pertama yang menyentuh
> data dan yang paling mahal kalau salah.

---

## 0. Ringkasan satu menit

| Pertanyaan | Jawaban |
|---|---|
| Apa yang berubah? | **32 tabel** dapat kolom `company_id`; **23.030 baris** di dev diisi nilainya (2.180 → tenant-1, 20.850 tetap NULL = milik bersama) |
| Data existing hilang/berubah artinya? | **Tidak.** Hanya penambahan kolom + pengisian. Nol UPDATE pada kolom lain, nol DELETE, nol perubahan tipe |
| Kenapa ini Red-Line? | Ini **backfill**: menetapkan "baris ini milik siapa". Salah tetapkan = data satu perusahaan mengendap di perusahaan lain, dan tak selalu ketahuan seketika |
| Kenapa sekarang waktu termurah? | Dev berisi **tepat satu** tenant → semua baris tak ambigu. Setelah tenant kedua masuk, backfill jadi tebakan |
| Bisa di-rollback? | **Ya**, dan rencananya sudah diuji (§6) — bukan sekadar "harusnya bisa" |
| Produksi tersentuh? | **Tidak.** Belum ada produksi. Ini dev-only |

---

## 1. Yang dieksekusi — tiga langkah terpisah, bukan satu migrasi besar

Sengaja dipecah supaya tiap langkah bisa dihentikan & diperiksa sendiri:

| Langkah | Isi | Sifat | Gerbang |
|---|---|---|---|
| **T3a** | `ADD COLUMN company_id UUID NULL` + FK ke `companies` pada 32 tabel | **Aman** — kolom kosong, nol baris berubah | [G] |
| **T3b** | **Backfill**: isi `company_id` pada 23.030 baris | **RED-LINE** — ini yang menetapkan kepemilikan | **[R]** ← ack di sini |
| **T3c** | `SET NOT NULL` pada 20 tabel kategori B/D + index | **Mengunci** — setelah ini baris tanpa tenant ditolak | **[R]** |

Antara T3b dan T3c ada **jeda verifikasi**: seluruh angka dicek dulu (§4), baru
dikunci. Kalau ada satu tabel yang tidak cocok, T3c tidak dijalankan.

---

## 2. Angka SEBELUM → SESUDAH per tabel (dry-run dev, 2026-07-29)

Tenant tunggal: `puraloka-persada` · `48befb54-113d-4e1b-b4dd-91cf79d6d8a0`

### 2a. Kategori B — `company_id` NOT NULL (17 tabel, 192 baris)
Semua baris → tenant-1. Tak ada yang ambigu: dev cuma punya satu perusahaan.

| Tabel | Sebelum | Sesudah (tenant-1) | NULL tersisa |
|---|---:|---:|---:|
| `kasbons` | 56 | 56 | 0 |
| `notifications` | 28 | 28 | 0 |
| `notification_rule_targets` | 25 | 25 | 0 |
| `notification_rules` | 14 | 14 | 0 |
| `approval_progress` | 13 | 13 | 0 |
| `clients` | 10 | 10 | 0 |
| `financial_config` | 9 | 9 | 0 |
| `cash_transfers` | 8 | 8 | 0 |
| `approval_chains` | 6 | 6 | 0 |
| `approval_steps` | 6 | 6 | 0 |
| `cash_accounts` | 5 | 5 | 0 |
| `company_settings` | 5 | 5 | 0 |
| `workers` | 3 | 3 | 0 |
| `supplier_invoices` | 2 | 2 | 0 |
| `supplier_payments` | 2 | 2 | 0 |
| `supplier_payment_allocations` | 0 | 0 | 0 |
| `material_pack` | 0 | 0 | 0 |
| **TOTAL** | **192** | **192** | **0** |

**Catatan `suppliers`:** hari ini diklasifikasi **AB** (lihat §2b), jadi ia
**tidak** ada di tabel atas. Kalau founder menjawab §8-Q1 = *privat*, ia pindah ke
sini → B jadi **18 tabel / 197 baris**, AB jadi 10 tabel / 21.055 baris. Total
keseluruhan tidak berubah (23.030); yang berubah hanya 5 baris dari NULL →
tenant-1.

### 2b. Kategori AB — `company_id` NULLABLE (11 tabel, 21.060 baris)
**Aturan pengisian di sini BUKAN "semua ke tenant-1".** NULL berarti "milik
bersama semua tenant" — itu justru yang membuat katalog AHSP nasional tetap jadi
nilai jual produk, bukan aset satu pelanggan.

| Tabel | Baris | Rencana isi | Alasan |
|---|---:|---|---|
| `assembly_components` | 17.853 | **ikut induknya** (`assemblies`) | komponen milik analisa; tak boleh beda tenant dari induk |
| `assemblies` | 3.038 | `national` (2.620) → **NULL**; `company` (418) → tenant-1 | 2.620 SE-47-2026 = standar nasional, milik bersama. 418 Cibuluh = AHSP perusahaan |
| `expense_category_templates` | 91 | **NULL** (template bersama) | template default sistem |
| `cost_codes` | 44 | **NULL** | kosakata kategori pekerjaan |
| `materials` | 23 | **NULL** | katalog material acuan |
| `suppliers` | 5 | **NULL**¹ | lihat §8-Q1 |
| `cbs_nodes` | 2 | **NULL** | template struktur biaya |
| `price_book_entries` | 2 | **NULL** | harga acuan bersama (keputusan founder D5) |
| `cbs_templates` | 1 | **NULL** | idem |
| `productivity_records` | 1 | **NULL** | idem |
| `feature_flags` | 0 | — | tabel kosong |
| **TOTAL** | **21.060** | **20.642 NULL · 418 tenant-1** | |

**Penjagaan yang ikut dipasang** (bukan konvensi, tapi CHECK constraint):
`assemblies.source='national'` ⇒ `company_id IS NULL`, dan `source='company'` ⇒
`company_id IS NOT NULL`. Tanpa ini, satu tenant bisa "mengklaim" katalog
nasional dan katalog itu hilang dari tenant lain.

### 2c. Kategori D — khusus (3 tabel, 1.763 baris)

| Tabel | Baris | Rencana | Alasan |
|---|---:|---|---|
| `audit_logs` | 1.555 | **NOT NULL** → tenant-1 | jejak audit harus tetap terbaca meski baris induknya hilang; diisi saat tulis, tak pernah lewat join |
| `role_permissions` | 203 | **NULL** (bawaan sistem) | peran bawaan dipakai bersama |
| `roles` | 5 | **NULL** (bawaan sistem) | terisi hanya untuk peran custom tenant — mencegah tenant A menghapus peran bawaan tenant B |

### 2d. Anchor

| Tabel | Baris | Rencana |
|---|---:|---|
| `projects` | 15 | **NOT NULL** → tenant-1. Ini akar tenancy; 48 tabel kategori C mewarisi dari sini |

### Rekap

```
Tabel dapat kolom : 32       (1 anchor + 11 AB + 17 B + 3 D)
Baris tersentuh   : 23.030
  → tenant-1      :  2.180   = 192 (B) + 418 (assemblies source=company)
                              + 1.555 (audit_logs) + 15 (projects)
  → NULL (bersama): 20.850   = 20.642 katalog AB + 208 (roles + role_permissions)
Tabel di-SET NOT NULL di T3c : 20  (17 B + audit_logs + projects + assembly_components*)
```

*Aritmetika ditutup eksplisit* (2.180 + 20.850 = 23.030 ✓) — angka di dokumen ini
dipakai founder untuk memutuskan, jadi tidak boleh ada yang tidak dijumlahkan.
*`assembly_components` NOT NULL hanya jika induknya juga — diputuskan setelah
verifikasi §4, bukan diasumsikan sekarang.

---

## 3. Diff SQL — LENGKAP, bukan ringkasan

> Sesuai syarat founder: "diff lengkap, bukan ringkasan". File migrasi penuh
> ditulis dan dilampirkan ke PR T3 **sebelum** dijalankan. Bentuknya:

```sql
-- ============ T3a: ADD COLUMN (aman, nol baris berubah) ============
ALTER TABLE projects       ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE kasbons        ADD COLUMN IF NOT EXISTS company_id UUID;
-- … 30 tabel lainnya, satu baris per tabel, semuanya NULL dulu …

-- FK ditambahkan terpisah agar kegagalan satu tabel tak menggagalkan semua
ALTER TABLE projects ADD CONSTRAINT projects_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
-- … dst …

-- ============ T3b: BACKFILL (RED-LINE — butuh ack) ============
DO $$
DECLARE v_company UUID;
BEGIN
  -- Fail-loud: kalau tenant tidak tunggal, backfill BERHENTI. Tidak menebak.
  IF (SELECT count(*) FROM companies) <> 1 THEN
    RAISE EXCEPTION 'T3b menolak jalan: companies berisi % baris, bukan 1. '
      'Backfill hanya sah saat sistem berisi tepat satu tenant.',
      (SELECT count(*) FROM companies);
  END IF;
  SELECT id INTO v_company FROM companies;

  UPDATE projects  SET company_id = v_company WHERE company_id IS NULL;
  UPDATE kasbons   SET company_id = v_company WHERE company_id IS NULL;
  -- … 15 tabel B lainnya …

  -- AB: HANYA yang jelas milik tenant. Sisanya sengaja dibiarkan NULL.
  UPDATE assemblies SET company_id = v_company
    WHERE source = 'company' AND company_id IS NULL;
  UPDATE assembly_components ac SET company_id = a.company_id
    FROM assemblies a WHERE a.id = ac.assembly_id;

  UPDATE audit_logs SET company_id = v_company WHERE company_id IS NULL;
END $$;

-- ============ T3c: KUNCI (RED-LINE) ============
ALTER TABLE projects ALTER COLUMN company_id SET NOT NULL;
-- … 19 tabel lainnya, HANYA setelah verifikasi §4 hijau …

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_company ON projects(company_id);
-- … index untuk tiap tabel; CONCURRENTLY agar tak mengunci tabel …

ALTER TABLE assemblies ADD CONSTRAINT assemblies_source_company_konsisten CHECK (
  (source = 'national' AND company_id IS NULL) OR
  (source <> 'national' AND company_id IS NOT NULL));

-- project_company_id() — ditunda dari T2, lahir di sini bersama kolomnya
CREATE OR REPLACE FUNCTION project_company_id(p_project_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id FROM projects p WHERE p.id = p_project_id;
$$;
```

---

## 4. Verifikasi antara T3b dan T3c (gerbang internal)

T3c **tidak dijalankan** sebelum semua ini hijau:

1. **Nol NULL tersisa** di 20 tabel yang akan di-`SET NOT NULL`.
2. **Nol baris yatim**: tiap `company_id` yang terisi menunjuk `companies.id` yang ada.
3. **Jumlah baris tidak berubah** — sebelum vs sesudah, per tabel. Backfill hanya
   mengisi kolom; kalau ada tabel yang jumlahnya berubah, ada `UPDATE` yang salah.
4. **Katalog nasional tetap bersama**: `assemblies WHERE source='national' AND
   company_id IS NOT NULL` harus **0 baris**. Ini penjaga nilai jual produk.
5. **Komponen sejalan induk**: `assembly_components` yang `company_id`-nya berbeda
   dari induknya harus **0 baris**.
6. **72+ test existing tetap hijau** — bukti tak ada perilaku yang berubah.
7. **Angka bisnis tak bergerak**: total nilai kontrak, jumlah invoice, saldo kas
   dicatat sebelum & sesudah, harus identik.

---

## 5. Apa yang bisa rusak (jujur, bukan menenangkan)

| # | Risiko | Kemungkinan | Kalau terjadi |
|---|---|---|---|
| R-1 | Salah klasifikasi domain: tabel yang saya sebut "bersama" ternyata harus privat (mis. `suppliers`) | **Sedang** | Data tampak bocor antar tenant di T5. **Mitigasi:** §8-Q1 ditanyakan ke founder SEBELUM T3b; dan karena AB→B hanya "isi kolom yang sudah ada", koreksinya murah |
| R-2 | `SET NOT NULL` gagal karena ada baris NULL tersisa | Rendah | Migrasi berhenti di T3c, T3b sudah sukses → tinggal cari baris NULL-nya. Tidak merusak apa pun |
| R-3 | Kode existing menulis baris baru tanpa `company_id` setelah NOT NULL aktif | **Tinggi** | INSERT gagal → error 500 di endpoint terkait. **Ini justru diinginkan** (fail-loud) tapi berarti T4 harus menyusul cepat. **Mitigasi:** T3c dijalankan hanya untuk tabel yang jalur tulisnya sudah dipetakan |
| R-4 | FK `ON DELETE RESTRICT` membuat penghapusan company mustahil | Rendah | Memang disengaja (guard T2 sudah menolak DELETE company) |
| R-5 | Index `CONCURRENTLY` gagal di tengah → index invalid | Rendah | Drop & ulang; tak mempengaruhi data |
| R-6 | Saya salah membaca sesuatu yang tidak terpikir masuk daftar ini | **Selalu ada** | Itulah alasan §6 rollback diuji dan §7 ditulis jujur |

---

## 6. Rencana rollback — DIUJI, bukan diasumsikan

Syarat founder: *"rencana rollback teruji"*. Karena itu urutannya:

1. **Uji rollback dulu di schema test terisolasi** — jalankan T3a+T3b+T3c, lalu
   rollback, lalu verifikasi skema & data kembali persis seperti sebelumnya.
   **Hasil uji ini dilampirkan ke PR sebelum ack diminta.**
2. Baru dijalankan di dev.

```sql
-- Rollback T3c: lepas kunci (paling sering dibutuhkan, paling murah)
ALTER TABLE projects ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE assemblies DROP CONSTRAINT IF EXISTS assemblies_source_company_konsisten;
DROP INDEX CONCURRENTLY IF EXISTS idx_projects_company;  -- dst

-- Rollback T3b: kosongkan isian (data lain TIDAK tersentuh)
UPDATE projects SET company_id = NULL;  -- dst, 32 tabel

-- Rollback T3a: buang kolom (kembali persis ke keadaan pasca-T2)
ALTER TABLE projects DROP COLUMN IF EXISTS company_id;  -- dst
DROP FUNCTION IF EXISTS project_company_id(UUID);
```

**Kenapa rollback ini benar-benar aman:** T3 tidak pernah menyentuh kolom lain
selain `company_id` yang ia buat sendiri. Membuang kolom yang ia tambahkan =
kembali ke keadaan awal. Ini berbeda dari migrasi yang mengubah/menghapus data
existing — di situ rollback baru sulit.

**Batas jujur:** rollback **tidak** mengembalikan `updated_at` bila ada trigger
yang mengubahnya saat backfill. Diperiksa lebih dulu; kalau ada, trigger
di-disable selama backfill (`session_replication_role='replica'`) dan itu dicatat.

---

## 7. Apa yang TIDAK saya verifikasi (batas dokumen ini)

Bagian ini ada karena diminta eksplisit, dan karena audit yang tak menyebut
batasnya adalah audit yang menyesatkan.

1. **Kebenaran domain klasifikasi AB vs B.** Struktur FK bisa dibuktikan mekanis;
   "apakah supplier sebaiknya bersama atau privat" adalah **keputusan bisnis**.
   Saya memilih mengikuti keputusan founder D5, bukan memutuskan sendiri. → §8-Q1
2. **Perilaku 719 call-site `supabase.from()`** setelah kolom NOT NULL aktif.
   Itu T4. Konsekuensinya nyata: risiko R-3 di atas.
3. **Kasus data ambigu lintas tenant** — tidak bisa diuji hari ini karena dev
   berisi satu tenant. Justru itu alasan melakukannya sekarang.
4. **Performa** setelah 32 index baru. Diukur di T5, bukan diklaim di sini.
5. **Produksi** — tidak ada. Semua angka di dokumen ini adalah dev per 2026-07-29.
6. **Interaksi dengan migrasi 043–047** (GL/asset/opname/SCM, masih forward-draft).
   Kalau nanti diaktifkan, tabel-tabelnya butuh klasifikasi sendiri (dijaga
   penegak P3, ADR-011 §9.5).

---

## 8. Keputusan terbuka yang HARUS dijawab sebelum T3b

**Q1. `suppliers` — bersama atau privat per perusahaan?**
- **Bersama (AB, rencana sekarang):** daftar supplier jadi katalog awal yang
  langsung berguna untuk pelanggan baru; tiap tenant boleh menambah/menimpa.
- **Privat (B):** daftar supplier + harga negosiasi adalah **rahasia dagang**.
  Kontraktor umumnya tidak mau pesaing tahu ia berbelanja ke mana.
- **Rekomendasi saya: privat (B).** Alasan: relasi supplier adalah keunggulan
  kompetitif, dan kesalahan ke arah "terlalu terbuka" jauh lebih sulit
  diperbaiki setelah pelanggan kedua masuk daripada sebaliknya. Baris yang
  terdampak cuma 5 — murah sekarang, mahal nanti.

**Q2. Apakah T3c (`SET NOT NULL`) dijalankan sekarang atau setelah T4?**
- **Sekarang:** fail-loud lebih awal — jalur tulis yang lupa `company_id`
  langsung ketahuan (risiko R-3 jadi kenyataan yang terkendali di dev).
- **Setelah T4:** lebih mulus, tapi selama jeda itu baris baru bisa lahir tanpa
  tenant dan harus di-backfill ulang.
- **Rekomendasi saya: sekarang**, karena dev bukan produksi dan error 500 di dev
  adalah informasi murah. Ini konsisten dengan P1 (§9.5): lebih baik repot
  sekarang daripada punya jalur yang tak pernah teruji.

---

## 9. Ack founder — DITERIMA 2026-07-29

> **Founder:** *"untuk pertanyaan kamu yg Q1 dan Q2 saya setuju dengan rekomendasi mu"*

Ditafsirkan eksplisit (supaya tak ada ambiguitas di kemudian hari):

| | Keputusan | Akibat konkret |
|---|---|---|
| **Q1** | **PRIVAT** | `suppliers` pindah AB → **B**. B jadi **18 tabel / 197 baris**; AB jadi **10 tabel / 21.055 baris**. 5 baris supplier yang tadinya NULL kini → tenant-1. Total keseluruhan tetap 23.030 |
| **Q2** | **SEKARANG** | T3c (`SET NOT NULL` + index + CHECK) dijalankan segera setelah verifikasi §4 hijau, tidak menunggu T4. Konsekuensi diterima sadar: risiko **R-3** menjadi nyata — endpoint yang menulis tanpa `company_id` akan gagal keras di dev. Itu memang tujuannya (fail-loud), dan berarti **T4 harus menyusul cepat** |

**Syarat yang TETAP saya jalankan meski ack sudah ada:** uji rollback di schema
test terisolasi (§6 poin 1) dilakukan **sebelum** T3 disentuh di dev. Dokumen ini
menjanjikannya; persetujuan founder tidak menghapus janji itu.

### Hasil uji rollback — 17/17 HIJAU (`multitenant-t3-rollback.test.ts`)

Dijalankan terhadap Postgres nyata di schema terisolasi, memakai file migrasi
**verbatim** (126 lalu 127), bukan tulis-ulang:

| # | Yang dibuktikan | Hasil |
|---|---|---|
| 1 | 127 berjalan penuh: 32 kolom + FK + backfill + NOT NULL + CHECK + index | ✅ |
| 2 | 20 tabel benar-benar `NOT NULL`; 12 tabel AB tetap nullable **by design** | ✅ |
| 3 | Backfill menyeluruh — nol NULL tersisa di 20 tabel B | ✅ |
| 4 | **Katalog nasional tetap milik bersama** — 0 baris `source='national'` ter-klaim | ✅ |
| 5 | Komponen mengikuti induknya — 0 baris beda tenant dari analisanya | ✅ |
| 6 | CHECK **menolak** upaya meng-klaim katalog nasional lewat `UPDATE` biasa | ✅ |
| 7 | **Jumlah baris tiap tabel tidak berubah** — backfill hanya mengisi kolom | ✅ |
| 8 | 127 idempoten — re-run = no-op | ✅ |
| 9 | **Rollback: skema kembali persis** ke keadaan pasca-126 | ✅ |
| 10 | Rollback: constraint bikinan 127 hilang seluruhnya | ✅ |
| 11 | Rollback: **data existing utuh** — nilai kontrak & jumlah assembly nasional identik | ✅ |
| 12 | Rollback tidak menyisakan fungsi yatim (`project_company_id` ikut terbuang) | ✅ |
| 13 | **127 bisa dijalankan LAGI setelah rollback** — bukti rollback benar-benar bersih | ✅ |
| 14 | **Fail-loud:** backfill MENOLAK jalan saat `companies` berisi >1 baris | ✅ |

Poin 13 dan 14 yang paling menentukan. **13** membedakan "rollback yang kelihatan
berhasil" dari "rollback yang benar-benar mengembalikan keadaan" — kalau ada sisa
tertinggal, re-apply pasti gagal. **14** adalah pengaman inti T3b: begitu tenant
lebih dari satu, "milik siapa" tak dapat diturunkan mekanis, dan migrasi memilih
**berhenti** daripada menebak lalu mencampur data dua perusahaan.

Satu temuan dari uji ini: `company_members` & `document_number_series` lahir
membawa `company_id` sendiri di migrasi 126, jadi hitungan "kolom yang 127
tambahkan" harus mengecualikan keduanya — kalau tidak, angka 32 terbaca 34.


---

## 10. Hasil eksekusi — 2026-07-29

### 10a. Angka nyata vs prediksi dokumen

| | Diprediksi §2 | Nyata | |
|---|---:|---:|---|
| Tabel dapat kolom | 32 | **32** | ✅ |
| Baris tersentuh | 23.030 | **23.030** | ✅ |
| Jumlah baris berubah? | 0 | **0** | ✅ backfill hanya mengisi kolom |
| NULL tersisa di tabel terkunci | 0 | **0** | ✅ |
| Baris yatim | 0 | **0** | ✅ |
| Katalog nasional ter-klaim | 0 | **0** | ✅ 2.620 tetap milik bersama |
| Komponen beda tenant dari induk | 0 | **0** | ✅ |

**Angka bisnis identik sebelum & sesudah** — bukti tak ada data yang bergeser:
kontrak `Rp 4.883.000.000` · invoice `Rp 2.092.560.000` · kas `Rp 222.475.000`.

Nullability akhir: **20 tabel NOT NULL**, 12 tabel AB nullable *by design*
(NULL di sana bermakna "milik bersama", bukan "belum diisi").

### 10b. DUA PENGAMAN yang tidak terlihat di dokumen ini sebelumnya

Keduanya baru muncul saat migrasi menyentuh dev, **tidak** terdeteksi uji rollback
karena schema test tidak menirunya. Ini kegagalan cakupan uji saya, dan keduanya
sudah ditambahkan ke schema test agar tak terulang.

**(1) Segel append-only `audit_logs` (migrasi 073)** — `UPDATE`/`DELETE` ditolak
mentah, jadi backfill 1.555 baris mustahil tanpa membukanya.
→ **Keputusan founder: buka sekali.** Alasan yang dipilih founder: supaya semua
audit log punya identitas perusahaan sejak awal, sehingga filter UI lurus tanpa
pengecualian `OR IS NULL` yang bisa terlupa di satu layar dan menghilangkan 1.555
catatan lama dari pandangan.
Cakupan dibuat **sesempit mungkin**: hanya trigger `trg_audit_logs_no_update`,
hanya selama `UPDATE` itu, langsung dipasang kembali, **plus** pemeriksaan
eksplisit yang **membatalkan seluruh migrasi** kalau segel gagal terpasang lagi —
karena "audit trail diam-diam jadi bisa diubah" adalah kegagalan paling senyap
di migrasi ini. Sengaja **tidak** memakai `session_replication_role='replica'`
yang akan mematikan SELURUH trigger di SEMUA tabel.

**(2) Gerbang immutability komponen CECEP (migrasi 107)** — komponen assembly
ber-status ≠ `draft` tak boleh diubah; seluruh 3.037 assembly dev berstatus
`active`, jadi 2.683 komponen Cibuluh tak bisa dilabeli.
→ **Dilaporkan ke founder sebagai "menyentuh gerbang", bukan ditafsirkan sendiri.**
**Keputusan founder: buka HANYA untuk kolom `company_id`.** Guard 107 diperbarui
permanen di migrasi 127 (tercatat & bisa direview, bukan trigger yang dimatikan
diam-diam): mengubah `coefficient`/`resource_id`/`sort_order`/`assembly_id` pada
assembly aktif **tetap ditolak** — nol pelonggaran pada isi analisa. Yang
diizinkan hanya `UPDATE` yang **seluruh** kolom isinya identik dan hanya
`company_id` yang berbeda.

### 10c. Bukti pengaman masih berdiri — diuji langsung di dev, bukan diasumsikan

| Percobaan | Hasil |
|---|---|
| `UPDATE audit_logs` | **DITOLAK** — "append-only: UPDATE ditolak" |
| `DELETE audit_logs` | **DITOLAK** — "append-only: DELETE ditolak" |
| Ubah koefisien komponen assembly aktif | **DITOLAK** — "hanya bisa diubah saat draft" |
| Klaim katalog nasional (`UPDATE company_id`) | **DITOLAK** — CHECK constraint |

Plus 23 test otomatis (`multitenant-t3-rollback.test.ts`), di antaranya tiga yang
khusus menjaga pelonggaran guard tetap sempit: ubah koefisien ditolak · ganti
`resource_id` ditolak · **`UPDATE` campuran (`company_id` + koefisien sekaligus)
ditolak** — celah paling halus, yaitu menyelundupkan perubahan isi dengan
membonceng label kepemilikan.

### 10d. Yang berubah dari rencana

- `suppliers`: AB → **B** (ack Q1 = privat). B jadi 18 tabel, AB 10 tabel.
- Dua pelonggaran guard di §10b — **tidak ada di dokumen versi pra-ack**, karena
  saya belum memeriksa trigger saat menyusunnya. Keduanya diputuskan founder,
  bukan saya.
