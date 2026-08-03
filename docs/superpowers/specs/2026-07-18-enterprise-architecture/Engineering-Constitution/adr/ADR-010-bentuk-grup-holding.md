# ADR-010 — Bentuk grup/holding: konsolidasi, transfer antar-PT, dan kebocoran terkendali

**Status:** DIUSULKAN — menunggu ratifikasi founder
**Tanggal:** 2026-08-03
**Melengkapi:** `ADR-011-multi-tenant-strategy.md` (yang memutuskan bentuk
`companies`; dokumen ini mengisi yang belum diputuskan di sana)
**Antrean:** `QUEUE.yaml` F2-1
**Mengunci:** F2-2 (klasifikasi tabel) tak boleh mulai sebelum ini diratifikasi

---

## 1. Kenapa ADR ini ada, padahal sudah ada ADR-011

ADR-011 memutuskan **bentuk `companies`** — `parent_company_id`, tanpa
pewarisan data. Itu menjawab satu dari empat pertanyaan F2-1.

Tiga sisanya **belum pernah diputuskan di dokumen mana pun** — diperiksa dengan
mencari kata kuncinya di seluruh ADR-011: nol kecocokan untuk `eliminasi`,
`transfer alat`, `harga transfer`, `intercompany`, dan `kebocoran terkendali`.

Ketiganya adalah keputusan **struktural**: paling mahal diubah setelah data
tumbuh. Karena itu `QUEUE.yaml` menempatkannya **sebelum** sapuan `company_id`
(F2-3), bukan sesudah — koreksi C-2 dari founder.

> **Aturan yang dipegang dokumen ini:** setiap angka berasal dari pengukuran
> yang perintahnya ditulis, bukan dari ingatan. Ukur ulang kapan saja.

### Kenyataan yang diukur (2026-08-03)

```bash
node scripts/db/introspect.mjs tenancy-coverage   # cakupan company_id
node scripts/db/introspect.mjs tables             # jumlah tabel + RLS
```

| Fakta | Nilai |
|---|---|
| tabel di `public` | 123 |
| tabel punya `company_id` | 43 |
| **tabel belum** punya `company_id` | **80** ← pekerjaan F2-2/F2-3 |
| `companies` terisi | 1 akar · 0 anak |
| `accounts` (CoA) | 38 akun · 1 perusahaan · **sudah** ber-`company_id` |
| `company_members` | 23 anggota · 23 user · 1 company |

**Implikasi penting:** belum ada satu pun grup nyata. Seluruh keputusan di
bawah dibuat **sebelum** data grup lahir — itu waktu termurah untuk memutuskan,
dan satu-satunya waktu ketika salah pilih masih bisa diperbaiki tanpa migrasi
data.

---

## 2. K1 — Bentuk grup: SUDAH diputuskan ADR-011, dikonfirmasi

**Keputusan: `companies.parent_company_id`, tanpa tabel `groups` terpisah.**

Dikonfirmasi terhadap kenyataan: tak ada tabel `groups`/`company_groups`/
`holdings` di database (diperiksa `information_schema.tables`).

### Kenapa bukan `group_id` sebagai kolom sendiri

Kolom `group_id` di samping `company_id` berarti **setiap tabel per-tenant
menanggung dua kolom tenancy**, dan setiap query harus benar tentang keduanya.
Dua sumbu tenancy pada 123 tabel adalah dua kali permukaan salah.

`parent_company_id` menaruh hierarki di **satu tempat** (`companies`), bukan
menyebarkannya ke seluruh skema.

### Kenapa bukan tabel `groups` terpisah

Tabel `groups` masuk akal bila sebuah company bisa masuk **beberapa** grup.
Kenyataan bisnisnya tidak begitu: satu PT punya satu induk. Struktur yang lebih
umum daripada kenyataannya adalah struktur yang harus dijaga benar tanpa pernah
memberi manfaat.

Bila kelak muncul kebutuhan multi-grup, `parent_company_id` bisa dinaikkan ke
tabel penghubung **tanpa menyentuh 123 tabel lain** — karena hierarkinya
memang tidak pernah menyebar ke sana.

---

## 3. K2 — Chart of Accounts: **per-PT + peta konsolidasi**

**Keputusan: setiap PT punya CoA sendiri (`accounts.company_id`). Konsolidasi
lewat peta pemetaan eksplisit, BUKAN pewarisan dari induk.**

Ini mengesahkan bentuk yang **sudah ada**: `accounts` sudah ber-`company_id`
(migrasi 167), berisi 38 akun untuk 1 perusahaan.

### Alasan — spesifik konstruksi Indonesia, bukan generik

**Bagan akun warisan tidak seragam.** Setiap PT konstruksi biasanya sudah
punya bagan akun sendiri sebelum bergabung ke grup — sering dari akuntan yang
berbeda, dengan penomoran yang berbeda. Memaksakan CoA induk berarti memaksa
setiap PT membuang riwayat pembukuannya, dan itu **menghalangi penjualan
produk** ke perusahaan yang sudah berjalan.

**Konsolidasi butuh pemetaan, bukan kesamaan.** Bahkan bila dua PT memakai
nomor akun sama, artinya bisa berbeda. Peta eksplisit memaksa perbedaan itu
**ditulis**, bukan diasumsikan.

### Ditolak: induk-diwarisi-override

Pewarisan berarti akun anak "mengikuti" induk kecuali ditimpa. Tiga
masalahnya:

1. **Ambigu saat induk berubah.** Mengubah nama akun di induk diam-diam
   mengubah laporan seluruh anak — termasuk periode yang sudah ditutup.
2. **Tak bisa diaudit.** "Akun ini berasal dari mana" jadi pertanyaan yang
   butuh penelusuran rekursif, dan jawabannya berubah seiring waktu.
3. **Melanggar invarian ADR-011.** `parent_company_id` **tidak** memberi
   pewarisan data. Membuat CoA jadi pengecualian akan menciptakan satu jalur
   pewarisan implisit — persis yang ADR-011 §4 sebut "cara paling halus
   membocorkan data".

### Bentuk peta konsolidasi

```
consolidation_maps
  id, group_company_id  → companies(id)   -- akar grup pemilik peta
  source_company_id     → companies(id)   -- PT anak
  source_account_id     → accounts(id)    -- akun di PT anak
  target_account_code   text              -- kode di bagan konsolidasi grup
  UNIQUE (group_company_id, source_account_id)
```

`target_account_code` sengaja **text**, bukan FK ke `accounts`: bagan
konsolidasi grup adalah **artefak pelaporan**, bukan buku besar yang
menerima jurnal. Menjadikannya FK akan mengundang orang memposting ke sana,
dan jurnal di level grup melanggar invarian pembukuan berpasangan per-entitas.

> Tabel ini **belum dibuat**. Ia bagian F2-3, setelah ADR ini diratifikasi.

---

## 4. K3 — Konsolidasi, eliminasi, transfer antar-PT

### 4.1 Konsolidasi — **laporan, bukan tabel**

**Keputusan: konsolidasi dihitung saat laporan diminta. Tidak ada tabel
`consolidated_*` yang menyimpan hasilnya.**

Hasil konsolidasi yang disimpan akan **basi** setiap kali jurnal anak berubah,
dan tak ada cara memaksa mereka sinkron tanpa menulis mesin invalidasi yang
lebih rumit daripada perhitungannya sendiri.

Skala membenarkan ini: 38 akun × jumlah PT. Menghitung ulang murah; menjaga
salinan tetap benar mahal.

### 4.2 Eliminasi — **eksplisit, tak pernah otomatis**

**Keputusan: transaksi antar-PT dalam satu grup ditandai eksplisit, dan
eliminasi hanya menghapus yang bertanda.**

```
intercompany_links
  id, group_company_id → companies(id)
  journal_entry_id_a   → journal_entries(id)   -- sisi PT penjual
  journal_entry_id_b   → journal_entries(id)   -- sisi PT pembeli
  jenis ∈ penjualan|sewa_alat|pinjaman|alokasi_biaya
  UNIQUE (journal_entry_id_a, journal_entry_id_b)
```

**Kenapa tidak dideteksi otomatis** (mis. "cocokkan nominal & tanggal antar-PT"):
dua transaksi bisa kebetulan bernominal sama pada hari yang sama tanpa ada
hubungan apa pun. Eliminasi otomatis atas kebetulan itu **menghapus pendapatan
yang nyata** dari laporan konsolidasi — kesalahan yang mengecilkan angka dan
karena itu jarang dipertanyakan.

Salah-eliminasi lebih berbahaya daripada tidak-eliminasi: yang kedua terlihat
(angka ganda mencolok), yang pertama tidak.

### 4.3 Transfer alat & mandor — **pindah kepemilikan + jejak**

**Keputusan: `assets.company_id` dan penugasan mandor BERUBAH saat transfer,
dan setiap perpindahan dicatat sebagai baris riwayat yang tak dihapus.**

Alternatif "alat dimiliki grup, dipakai bersama" **ditolak**: ia memaksa
`assets` jadi tabel level-grup, dan setiap query alat harus tahu tentang grup.
Itu memasukkan sumbu tenancy kedua lewat pintu belakang — persis yang ditolak
di §2.

Kondisi saat ini (diukur): `assets` **sudah** ber-`company_id` (0 baris),
`workers` sudah (3 baris). Yang **belum**: `mandor_assignments` (16 baris) dan
`asset_movements` (0 baris) — keduanya masuk daftar kerja F2-3.

### 4.4 Harga transfer — **wajib diisi, tak boleh nol diam-diam**

**Keputusan: transfer antar-PT WAJIB punya nilai. Nol hanya sah bila ditulis
eksplisit beserta alasannya.**

Alasannya pajak, bukan kerapian: transfer aset antar-badan-usaha adalah
peristiwa yang punya konsekuensi PPh/PPN. Sistem yang membiarkan nilainya
kosong akan menghasilkan pembukuan yang **tidak bisa dipertanggungjawabkan saat
diperiksa**, dan pemakainya tak akan tahu sampai pemeriksaan datang.

Default `0` yang diam adalah bentuk paling halus dari kegagalan ini —
angkanya ada, terlihat sah, dan salah. Karena itu kolomnya `NOT NULL` tanpa
default.

---

## 5. K4 — Kebocoran terkendali untuk pemilik grup

Ini bagian yang paling mudah salah, karena godaannya masuk akal: "pemilik grup
kan berhak melihat semua anaknya."

**Keputusan: pemilik grup TIDAK mendapat akses otomatis. Ia melihat anak hanya
lewat dua jalur yang keduanya eksplisit dan tercatat.**

### Jalur 1 — keanggotaan eksplisit (operasional)

Untuk melihat **data operasional** anak (proyek, invoice, kasbon), pemilik grup
harus punya baris `company_members` di PT itu. Sama seperti orang lain.

Konsisten dengan ADR-011 §4: *"Pewarisan implisit lewat rekursi = cara paling
halus membocorkan data, dan tak bisa diuji exhaustive."*

### Jalur 2 — laporan konsolidasi (agregat saja)

Pemilik grup boleh melihat **angka agregat** seluruh anak tanpa keanggotaan —
tetapi **hanya agregat**. Tidak ada jalur dari laporan konsolidasi menuju baris
detail milik anak.

| Boleh | Tidak boleh |
|---|---|
| total pendapatan per PT | daftar invoice PT itu |
| neraca konsolidasi | jurnal yang membentuknya |
| jumlah proyek aktif per PT | nama/nilai proyeknya |

**Kenapa batas ini keras.** Kalau laporan agregat bisa "diklik untuk detail",
maka izin melihat agregat sama dengan izin melihat segalanya — dan pembatasan
di UI bukan pembatasan, karena API-nya tetap terbuka.

### Pemaksaan — di DB, bukan di UI

Akses agregat lewat **`SECURITY DEFINER` khusus** yang hanya mengembalikan
angka teragregasi, bukan lewat pelonggaran RLS:

```sql
-- BENTUK; implementasi di F2-3
CREATE FUNCTION lap_konsolidasi_grup(p_group uuid)
RETURNS TABLE (company_id uuid, akun text, saldo numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT ... FROM journal_entry_lines ...
   WHERE company_id IN (SELECT id FROM companies WHERE parent_company_id = p_group)
   GROUP BY 1, 2      -- ⚠️ GROUP BY inilah pembatasnya. Menghapusnya
                      --    mengubah fungsi ini jadi pintu bocor.
$$;
```

Fungsi ini **wajib** memverifikasi pemanggilnya pemilik grup yang dimaksud —
`SECURITY DEFINER` tanpa pemeriksaan itu adalah bypass RLS untuk siapa saja.

### Ember [C] — tidak boleh dikonfigurasi

Batas ini masuk **Ember [C]** (`CLAUDE.md` §5.3): tidak boleh ada tombol di UI
yang memberi pemilik grup "akses penuh ke semua anak". Sekalipun diminta.

Alasannya: satu pemilik dengan beberapa PT hari ini bisa **menjual salah satu
PT-nya** besok. Akses yang diberikan lewat konfigurasi akan tertinggal, dan
tak ada yang ingat mencabutnya.

---

## 6. Yang tidak diputuskan di sini

Jujur tentang batas dokumen ini:

| Hal | Kenapa ditunda |
|---|---|
| Mata uang berbeda antar-PT | Multi-currency **dicoret** dari scope (keputusan owner 2026-07-26) |
| Konsolidasi bertingkat (cucu perusahaan) | Belum ada kebutuhannya; `parent_company_id` sudah mendukung bila perlu |
| Periode fiskal berbeda antar-PT | Butuh contoh nyata dulu; menebak bentuknya sekarang = menebak |

---

## 7. Konsekuensi

### Positif

- Bentuk grup **satu tempat** (`companies`), tak menyebar ke 123 tabel
- CoA per-PT → produk bisa dijual ke PT yang **sudah berjalan**
- Eliminasi eksplisit → nol risiko menghapus pendapatan nyata
- Batas pemilik grup dipaksa **di DB**, bukan di UI

### Negatif — dan diterima sadar

- **Peta konsolidasi harus diisi manual.** Tidak ada tebakan otomatis. Ini
  kerja tambahan bagi pengguna, dan itu disengaja: tebakan yang salah pada
  laporan keuangan lebih mahal daripada pengisian yang membosankan.
- **Pemilik grup tak bisa "lihat semua" dalam satu klik.** Ia harus jadi
  anggota tiap PT untuk data detail. Ini akan terasa merepotkan, dan akan ada
  permintaan melonggarkannya. Permintaan itu harus ditolak.
- **Konsolidasi dihitung tiap kali** — akan melambat bila jumlah PT tumbuh
  besar. Ambang tindak lanjut: **> 20 PT dalam satu grup** atau laporan
  konsolidasi > 3 detik. Sebelum itu, mengoptimalkan adalah menebak.

---

## 8. Cara memverifikasi ADR ini dijalankan

```bash
# CoA harus per-company, bukan diwarisi
node scripts/db/introspect.mjs columns | grep -A5 '"accounts"'

# tak boleh ada tabel hasil konsolidasi yang disimpan
node scripts/db/introspect.mjs tables | grep -i consolidat

# assets/workers per-company (dan mandor_assignments SETELAH F2-3)
node scripts/db/introspect.mjs tenancy-coverage
```

---

## 9. Rujukan

- `ADR-011-multi-tenant-strategy.md` — bentuk `companies`, `company_members`,
  RLS dual-axis (dokumen yang ini lengkapi)
- `CLAUDE.md` §5.3 — Ember [C], daftar yang tak boleh dikonfigurasi
- `docs/execution/QUEUE.yaml` — F2-1 (ini), F2-2, F2-3
- `docs/KEPUTUSAN-SCOPE-ERP-AI.md` — multi-currency dicoret dari scope
