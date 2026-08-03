# ADR-010 — Bentuk grup/holding: bagan akun tiga lapis, konsolidasi, transfer antar-PT, dan akses lintas-PT berpagar

**Status:** REVISI 3 — menunggu ratifikasi final founder
**Tanggal:** 2026-08-03 (revisi 2 & 3: 2026-08-04)

**Riwayat ratifikasi**

| Putaran | Hasil |
|---|---|
| R-007 rev.1 | **SETUJU SEBAGIAN.** CoA per-PT disetujui + diperkuat alasan hukum (tiap PT badan hukum terpisah, SPT sendiri). Tiga koreksi wajib: konsolidasi tiga lapis, bedakan template dari pewarisan, dan **TOLAK** penguncian mati akses pemilik grup. |
| R-007 rev.2 | **Empat tambahan** sebelum ratifikasi final: (A) nyatakan siapa yang boleh memberi grant — dan jujurlah kalau pagarnya jejak, bukan pencegahan · (B) peta ditegakkan di **pembuatan akun**, bukan onboarding · (C) peta harus **berversi** · (D) konfirmasi cakupan eliminasi/transfer/harga transfer |
| R-007 rev.3 | menunggu — dokumen ini |

**Yang berubah di revisi 2**

- §3 ditulis ulang: **tiga lapis** bagan akun (statutori · pelaporan grup · peta), bukan satu
- §3a baru: **template** bagan akun — dibedakan tegas dari pewarisan
- §5 ditulis ulang: **jalur berpagar**, bukan pintu terkunci (mengganti usulan Ember [C] yang ditolak)
- §10 baru: pemeriksaan tabrakan terhadap ADR-011, terverifikasi

**Yang berubah di revisi 3**

| Butir | Perubahan | Bagian |
|---|---|---|
| A | Pemberi grant dinyatakan: **pemilik akar grup**, boleh memberi ke diri sendiri. Konsekuensinya ditulis terus terang — pagar ini **jejak + kedaluwarsa, bukan pencegahan** terhadap pemilik. Yang benar-benar dicegah: admin anak, penerima grant, pihak lain. | §5 |
| B | Penegakan peta pindah dari onboarding ke **pembuatan akun** (`NOT NULL`/trigger). Gerbang onboarding hanya menjaga hari pertama; akun ke-47 lolos tanpa gejala. | §3.3-B |
| C | Peta jadi **berversi** (`berlaku_sejak`/`berlaku_sampai` + `EXCLUDE gist`). Laporan periode lampau memakai peta saat itu — mengubah peta tak lagi mengubah SPT yang sudah dilaporkan. | §3.3-C |
| D | Cakupan dikonfirmasi ✅, **plus tiga celah yang tetap terbuka** dinyatakan eksplisit (eliminasi bertingkat, kewajaran harga transfer, eliminasi × versi peta). | §4 |

**Lokasi berkas:** dipindah ke `docs/adr/` atas permintaan founder
(sebelumnya di `docs/superpowers/.../Engineering-Constitution/adr/`).
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

## 3. K2 — Chart of Accounts: **TIGA LAPIS**

**Keputusan (revisi 2, sesuai koreksi R-007 butir 2):** bagan akun hidup di
tiga lapis yang terpisah tegas. Satu lapis saja tidak cukup — dan alasan
kenapa ada di §3.4.

| Lapis | Isi | Boleh menerima jurnal? |
|---|---|---|
| **(a) Statutori per-PT** | `accounts.company_id` — pencatatan resmi tiap badan hukum | ✅ ya, hanya di sini |
| **(b) Pelaporan grup** | akun kanonik untuk konsolidasi | ❌ tidak pernah |
| **(c) Peta (a)→(b)** | pemetaan akun PT ke akun grup | — |

### 3.1 Lapis (a) — bagan statutori per-PT

Mengesahkan bentuk yang **sudah ada**: `accounts` sudah ber-`company_id`
(migrasi 167), berisi 38 akun untuk 1 perusahaan.

**Alasan komersial.** Setiap PT konstruksi biasanya sudah punya bagan akun
sendiri sebelum bergabung ke grup — sering dari akuntan berbeda, dengan
penomoran berbeda. Memaksakan CoA induk berarti memaksa mereka membuang
riwayat pembukuan, dan itu **menghalangi penjualan produk** ke perusahaan
yang sudah berjalan.

**Alasan hukum** (ditambahkan founder saat ratifikasi, dan ini yang lebih
mengikat): **tiap PT adalah badan hukum terpisah dengan SPT sendiri.** Bagan
akun statutorinya bukan preferensi tata letak — ia dasar pelaporan pajak yang
harus bisa dipertanggungjawabkan sendiri-sendiri saat diperiksa. Bagan yang
"mengikuti induk" membuat pertanyaan *"angka ini dari akun yang mana, versi
kapan"* tak terjawab pada saat paling gawat.

### 3.2 Lapis (b) — bagan pelaporan grup

```
group_reporting_accounts
  id, group_company_id → companies(id)    -- akar grup
  code   text                              -- kode kanonik grup
  name   text
  type   text                              -- asset|liability|equity|revenue|expense
  UNIQUE (group_company_id, code)
```

**Ini BUKAN buku besar.** Ia tak punya `journal_entries`, tak menerima
posting, dan tak punya saldo yang disimpan. Ia hanya kosakata: daftar nama
yang dipakai laporan gabungan.

Kenapa tetap perlu tabel, bukan sekadar `text` bebas di peta: tanpa daftar
kanonik, setiap PT akan memetakan ke ejaan berbeda (`"Beban Gaji"` vs
`"Biaya Gaji"` vs `"BEBAN GAJI"`), dan laporan gabungan diam-diam memecah satu
akun jadi tiga baris. Kesalahan itu tak menimbulkan galat — ia hanya membuat
laporan salah.

### 3.3 Lapis (c) — peta pemetaan: ditegakkan di PEMBUATAN AKUN, BERVERSI

> **Koreksi R-007 rev-2 butir B & C.** Revisi 2 menegakkan peta "saat
> onboarding" dan membiarkannya bisa ditimpa. Keduanya salah, dan founder
> menunjuk kasus nyatanya dengan tepat.

#### B — penegakan di pembuatan akun, bukan di onboarding

> *"Akun ke-47 yang dibuat bulan keenam adalah kasus nyatanya; onboarding
> hanya kebetulan kali pertama aturan berlaku. Satu akun tak terpeta =
> laporan gabungan salah tanpa gejala."*

Ini benar, dan kekeliruan saya jenis yang berbahaya: **gerbang onboarding
hanya menjaga hari pertama.** Akun yang lahir kemudian — dan akun selalu lahir
kemudian — lolos tanpa satu pun pemeriksaan. Laporan gabungan lalu mengabaikan
akun itu diam-diam: tidak error, tidak kosong, hanya **kurang**. Persis kelas
cacat yang paling mahal di sistem ini.

**Keputusan: kolom pemetaan `NOT NULL` pada bagan akun PT.** Aturannya melekat
pada akun, bukan pada peristiwa onboarding.

```
accounts                                   -- lapis (a), sudah ada
  ...
  group_account_id  → group_reporting_accounts(id)
                      NOT NULL bila PT ini anggota grup
```

Diterapkan lewat constraint, bukan lewat pemeriksaan aplikasi yang bisa
dilupakan jalur baru:

```sql
-- BENTUK; implementasi di F2-3
ALTER TABLE accounts ADD CONSTRAINT akun_grup_wajib_bila_bergrup CHECK (
  group_account_id IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM companies c
                  WHERE c.id = accounts.company_id
                    AND c.parent_company_id IS NOT NULL)
);
```

> ⚠️ `CHECK` dengan subquery tak didukung Postgres — bentuk sebenarnya adalah
> **trigger `BEFORE INSERT OR UPDATE`**. Ditulis sebagai CHECK di sini karena
> *maksudnya* lebih terbaca begitu; F2-3 mengimplementasikannya sebagai
> trigger, dan itu ditandai supaya tak ada yang mencoba CHECK lalu bingung.

**Konsekuensi yang diterima:** menambah akun jadi butuh satu keputusan
tambahan — "akun grup mana pasangannya". Itu memang tujuannya. Keputusan yang
ditunda ke waktu laporan adalah keputusan yang diambil oleh orang yang tidak
tahu jawabannya.

Onboarding tetap jadi *kali pertama* aturan ini berlaku (seluruh akun awal
harus punya pasangan), tetapi ia **bukan lagi tempat penegakannya**.

#### C — peta BERVERSI, laporan historis tak berubah retroaktif

> *"Bagan grup akan berubah; kalau peta ditimpa, laporan konsolidasi periode
> lalu berubah retroaktif — melanggar prinsip immutability proyek ini."*

Benar, dan ini bertabrakan langsung dengan Ember [C] (`CLAUDE.md` §5.3:
immutability audit log) serta dengan alasan hukum di §3.1: **SPT yang sudah
dilaporkan tak boleh berubah karena seseorang memperbaiki pemetaan hari ini.**

**Keputusan: pemetaan punya masa berlaku. Laporan historis memakai peta yang
berlaku pada periode itu.**

```
account_mappings
  id, group_company_id     → companies(id)
  source_company_id        → companies(id)          -- PT anak
  source_account_id        → accounts(id)           -- akun statutori PT
  target_account_id        → group_reporting_accounts(id)
  berlaku_sejak            date NOT NULL            -- inklusif
  berlaku_sampai           date NULL                -- eksklusif; NULL = masih berlaku
  created_at, created_by
  alasan_perubahan         text                     -- wajib bila menggantikan baris lain

  -- Satu akun tak boleh punya dua pemetaan aktif pada tanggal yang sama.
  EXCLUDE USING gist (
    source_account_id WITH =,
    daterange(berlaku_sejak, berlaku_sampai) WITH &&
  )
```

**Mengubah pemetaan = MENUTUP baris lama + membuka baris baru**, bukan
`UPDATE`. Baris lama tetap ada selamanya dengan `berlaku_sampai` terisi.

```sql
-- Peta yang berlaku pada tanggal laporan — bukan peta hari ini.
SELECT m.target_account_id
  FROM account_mappings m
 WHERE m.source_account_id = $1
   AND m.berlaku_sejak <= $2                                  -- tanggal periode
   AND (m.berlaku_sampai IS NULL OR m.berlaku_sampai > $2);
```

Fungsi `lap_konsolidasi_grup` (§5) **wajib** menerima tanggal periode dan
menyaring dengan pola di atas. Fungsi yang memakai "peta terbaru" akan
menghasilkan laporan yang berubah setiap kali pemetaan diperbaiki — dan
perubahannya tak terlihat karena angkanya tetap wajar.

`EXCLUDE USING gist` membuat tumpang-tindih **mustahil di tingkat database**,
bukan sekadar dicegah aplikasi.

**Rancangan ini sudah diuji terhadap database sungguhan** (2026-08-04, di dalam
transaksi ber-`ROLLBACK` — nol perubahan permanen):

```
btree_gist terpasang                       ✅ ya
baris pertama                              ✅ diterima
periode TUMPANG-TINDIH                     ✅ DITOLAK constraint
periode bersambung (tutup lalu buka)       ✅ diterima
baris riwayat setelah perubahan            2 — yang lama TIDAK ditimpa
kueri "peta berlaku 2026-03-15"            mengembalikan baris LAMA (benar)
```

Baris terakhir yang paling penting: laporan untuk Maret memakai pemetaan yang
berlaku di Maret, bukan pemetaan hari ini. Itulah inti butir C.

`target_account_id` adalah **FK ke lapis (b)**, bukan `text` bebas — supaya
salah ketik tertangkap saat dimasukkan, bukan saat laporan dibaca.

> Ketiga tabel **belum dibuat**. Mereka bagian F2-3, setelah ADR diratifikasi.

### 3.4 Kenapa TIGA lapis, bukan dua

Revisi 1 dokumen ini hanya punya (a) dan sebuah `target_account_code` bertipe
text — tanpa lapis (b). Founder menolaknya, dan penolakannya benar:

- **Tanpa (b)**, tak ada daftar kanonik. Setiap PT memetakan ke ejaan
  masing-masing, dan laporan gabungan memecah satu akun jadi beberapa baris
  tanpa satu pun galat.
- **Tanpa (c) sejak onboarding**, pemetaan ditunda sampai laporan gabungan
  pertama diminta — saat itu jurnalnya sudah ribuan dan orang yang tahu bagan
  aslinya mungkin sudah pindah.

### Ditolak: induk-diwarisi-override

Pewarisan berarti akun anak "mengikuti" induk kecuali ditimpa. Tiga
masalahnya:

1. **Ambigu saat induk berubah.** Mengubah nama akun di induk diam-diam
   mengubah laporan seluruh anak — termasuk periode yang sudah ditutup dan
   SPT yang sudah dilaporkan.
2. **Tak bisa diaudit.** "Akun ini berasal dari mana" butuh penelusuran
   rekursif, dan jawabannya berubah seiring waktu.
3. **Melanggar invarian ADR-011.** `parent_company_id` **tidak** memberi
   pewarisan data. Membuat CoA jadi pengecualian menciptakan satu jalur
   pewarisan implisit — persis yang ADR-011 §4 sebut "cara paling halus
   membocorkan data".

---

## 3a. K2b — Template bagan akun: titik awal, BUKAN pewarisan

**Keputusan (koreksi R-007 butir 3): sediakan bagan akun bawaan yang bisa
diadopsi PT baru saat onboarding. Setelah diadopsi, ia MILIK PT itu
sepenuhnya.**

```
account_templates          -- katalog, milik platform/grup
  id, nama, keterangan, group_company_id NULL   -- NULL = template bawaan platform
account_template_items
  id, template_id → account_templates(id)
  code, name, type, parent_code
```

### Perbedaan yang menentukan

|  | Template (diterima) | Pewarisan (ditolak) |
|---|---|---|
| Kapan berlaku | sekali, saat adopsi | terus-menerus |
| Induk berubah nanti | **nol pengaruh** pada PT | ikut berubah diam-diam |
| Kepemilikan akun | PT sepenuhnya | ambigu |
| Bisa diaudit | ya — baris `accounts` nyata milik PT | tidak — hasil resolusi rekursif |

Adopsi = **menyalin baris** ke `accounts` milik PT itu. Setelah tersalin, tak
ada tautan hidup ke templatnya. Mengubah template besok tidak menyentuh satu
pun PT yang sudah mengadopsinya.

> Inilah yang membuat template **bukan** pewarisan terselubung: yang dilarang
> adalah *tautan yang tetap hidup*, bukan *titik awal yang praktis*. Menolak
> keduanya sekaligus akan memaksa tiap PT mengetik puluhan akun dari nol —
> hambatan onboarding tanpa manfaat keamanan apa pun.

Template juga tempat alami menaruh **bagan standar konstruksi Indonesia**
(beban proyek, retensi, uang muka, PPh 4(2) final) sehingga PT baru mulai
dari sesuatu yang sudah benar untuk industrinya.

---

## 4. K3 — Konsolidasi, eliminasi, transfer antar-PT

> **Konfirmasi R-007 rev-2 butir D.** Founder meminta kepastian apakah ketiga
> hal ini tercakup. Jawabannya:

| Hal | Tercakup? | Di mana |
|---|---|---|
| eliminasi transaksi antar-PT | ✅ ya | §4.2 — `intercompany_links`, penandaan eksplisit |
| transfer alat & mandor antar-PT | ✅ ya | §4.3 — pindah kepemilikan + baris riwayat |
| harga transfer | ✅ ya | §4.4 — `NOT NULL` tanpa default, alasan pajak |

**Celah yang TETAP terbuka — dinyatakan, bukan dibiarkan tak terkatakan:**

1. **Eliminasi bertingkat** (A→B→C dalam satu grup) belum dirancang.
   `intercompany_links` memasangkan **dua** jurnal; rantai tiga PT akan
   menghasilkan dua pasangan yang dieliminasi terpisah, dan itu **mungkin**
   benar — belum diverifikasi terhadap contoh nyata. Ditunda sampai ada
   kasusnya, karena menebak bentuknya sekarang sama dengan menebak.
2. **Harga transfer belum punya aturan kewajaran.** ADR ini mewajibkan
   nilainya ada; ia **tidak** memutuskan apakah nilai itu wajar menurut
   ketentuan transfer pricing DJP. Itu keputusan akuntansi/pajak, bukan
   keputusan arsitektur, dan menaruhnya di sini akan menyamarkan kebutuhan
   nasihat profesional sebagai fitur perangkat lunak.
3. **Eliminasi belum terhubung ke versi peta (§3.3-C).** Ketika sebuah
   eliminasi dihitung untuk periode lampau, ia harus memakai pemetaan yang
   berlaku saat itu. Bentuknya sudah ada (kolom masa berlaku), tetapi
   penggabungannya dengan `intercompany_links` **belum ditulis** — masuk F2-3.

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

## 5. K4 — Akses lintas-PT: **jalur berpagar**, bukan pintu terkunci

> **Revisi 2 — usul saya sebelumnya DITOLAK founder, dan penolakannya benar.**
>
> Revisi 1 mengusulkan penguncian mati lewat Ember [C]: tak boleh ada cara apa
> pun memberi pemilik grup akses lintas-PT. Founder menolak dengan alasan yang
> tak bisa dibantah:
>
> > *"Visi produk ini justru satu owner banyak PT. Kalau dikunci mati, tekanan
> > enam bulan lagi akan dijawab dengan jalan pintas yang melangkahi RLS tanpa
> > jejak. Bangun pintunya sekarang, berpagar, daripada didobrak nanti."*
>
> Saya menilai risiko kebocoran dan **melewatkan** risiko yang lebih besar:
> larangan tanpa jalan keluar tidak menghapus kebutuhan — ia hanya memastikan
> pemenuhannya terjadi di luar pengawasan, oleh orang yang sedang terburu-buru.
>
> Pagar yang dirancang hari ini lebih aman daripada tembok yang dijebol nanti.

**Keputusan: akses lintas-PT ADA, lewat satu jalur yang dirancang, dengan lima
pagar yang semuanya wajib.**

### Lima pagar — semuanya, bukan sebagian

| # | Pagar | Yang dicegah |
|---|---|---|
| 1 | **Hanya lewat jalur pelaporan konsolidasi** — tak pernah lewat endpoint operasional | "sekalian saja" endpoint biasa dilonggarkan |
| 2 | **Pemberian hak eksplisit per orang** — bukan turunan otomatis status pemilik | akses menyebar mengikuti kepemilikan tanpa ada yang memutuskan |
| 3 | **Setiap akses masuk audit log** | akses tak terlihat = akses tak bisa dipertanggungjawabkan |
| 4 | **Mati secara bawaan** | tenant baru lahir terbuka |
| 5 | **Baca-saja** — tak pernah menulis balik ke pembukuan PT mana pun | laporan grup berubah jadi jalur posting |

### Bentuk pemberian hak

```
cross_company_grants
  id
  group_company_id   → companies(id)     -- akar grup
  grantee_user_id    → users(id)         -- ORANG, bukan peran, bukan "pemilik"
  scope_company_ids  uuid[]              -- PT mana saja; NULL ≠ semua, harus disebut
  granted_by         → users(id)
  granted_at         timestamptz
  expires_at         timestamptz NULL    -- boleh berbatas waktu
  revoked_at         timestamptz NULL
  alasan             text NOT NULL       -- kenapa hak ini diberikan
  UNIQUE (group_company_id, grantee_user_id)
```

### Siapa yang boleh MEMBERI — dan pengakuan jujur soal batasnya

> Koreksi R-007 rev-2 butir A. Revisi 2 mencantumkan kolom `granted_by` tanpa
> pernah menyatakan siapa yang boleh mengisinya. Celah itu nyata, dan
> membiarkannya tak terjawab berarti orang pertama yang mengimplementasikan
> akan memutuskannya sendiri — diam-diam, dengan pilihan termudah.

**Keputusan: pemberi adalah pemilik akar grup (`companies.owner_user_id` pada
akar), dan ia BOLEH memberi kepada dirinya sendiri.**

**Konsekuensinya dinyatakan terus terang, sesuai permintaan founder:**

> Karena pemberi boleh sama dengan penerima, pagar "grant eksplisit"
> **TIDAK MENCEGAH** pemilik grup mengakses anaknya. Pemilik yang menginginkan
> akses bisa memberikannya kepada diri sendiri kapan saja.
>
> **Yang pagar ini benar-benar berikan adalah JEJAK dan KEDALUWARSA, bukan
> pencegahan.**

Ini pilihan sadar, bukan kelalaian. Tiga alasannya:

1. **Pencegahan terhadap pemilik itu fiksi.** Pemilik grup punya akses ke
   dasbor Supabase, kredensial database, dan seluruh kode. Mekanisme aplikasi
   apa pun yang "mencegah" dia hanya menambah satu langkah, bukan satu
   penghalang. Merancang seolah ia penghalang adalah membohongi diri sendiri.
2. **Yang nyata dilindungi adalah ORANG LAIN.** Staf keuangan grup, konsultan,
   auditor eksternal — mereka *tidak* bisa memberi hak kepada diri sendiri, dan
   untuk merekalah pagar ini benar-benar mencegah.
3. **Jejak mengubah sifat tindakan.** Akses yang meninggalkan baris ber-alasan,
   ber-tenggat, dan ber-audit-log adalah tindakan yang bisa dipertanggung-
   jawabkan — kepada auditor, kepada rekan pemilik PT lain, kepada diri
   sendiri enam bulan kemudian. Akses yang tak berjejak tidak.

**Yang TIDAK boleh memberi** — dan ini yang dijaga sungguhan:

| Peran | Boleh memberi? |
|---|---|
| pemilik akar grup | ✅ ya, termasuk kepada diri sendiri |
| admin PT anak | ❌ tidak — ia tak punya kewenangan atas saudaranya |
| penerima grant | ❌ tidak — hak tidak bisa memperpanjang dirinya |
| siapa pun lewat API tanpa peran di atas | ❌ tidak |

Baris kedua dan ketiga yang menentukan: tanpa keduanya, satu grant yang bocor
bisa **berkembang biak** — penerima memberi ke orang lain, atau memperpanjang
tenggatnya sendiri tanpa batas. Itu berubah dari kebocoran satu-orang jadi
kebocoran yang tumbuh.

```sql
-- BENTUK; implementasi di F2-3
-- Pemberian hak WAJIB lewat fungsi ini, bukan INSERT langsung.
CREATE FUNCTION beri_akses_lintas_pt(
  p_group uuid, p_penerima uuid, p_scope uuid[], p_alasan text, p_expires timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_alasan IS NULL OR btrim(p_alasan) = '' THEN
    RAISE EXCEPTION 'alasan wajib diisi';
  END IF;

  -- Hanya pemilik AKAR grup. Bukan admin anak, bukan penerima grant.
  IF NOT EXISTS (
    SELECT 1 FROM companies
     WHERE id = p_group AND parent_company_id IS NULL
       AND owner_user_id = auth_user_id()
  ) THEN
    RAISE EXCEPTION 'hanya pemilik grup yang boleh memberi akses lintas-perusahaan';
  END IF;

  -- Scope wajib disebut & harus benar-benar anak grup ini.
  IF p_scope IS NULL OR array_length(p_scope, 1) IS NULL THEN
    RAISE EXCEPTION 'scope_company_ids wajib disebut satu per satu';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_scope) s
     WHERE s NOT IN (SELECT id FROM companies WHERE parent_company_id = p_group)
  ) THEN
    RAISE EXCEPTION 'scope memuat perusahaan di luar grup ini';
  END IF;
  ...
END $$;
```

Empat hal yang disengaja di bentuk ini:

- **`grantee_user_id` adalah ORANG**, bukan peran dan bukan "siapa pun yang
  kebetulan pemilik". Menjual PT tidak otomatis memindahkan hak; mencabutnya
  jadi tindakan yang bisa dilakukan, bukan yang harus diingat.
- **`scope_company_ids` wajib disebut satu per satu.** Tak ada nilai yang
  berarti "semua". Grup yang bertambah anggota tidak diam-diam memperluas
  akses yang sudah ada.
- **`alasan` NOT NULL.** Hak yang tak bisa dijelaskan tak bisa ditinjau ulang,
  dan hak yang tak pernah ditinjau akan hidup selamanya.
- **`expires_at`** membuat akses sementara benar-benar sementara — jalan keluar
  untuk audit/uji tuntas yang selama ini jadi alasan utama minta akses penuh.

### Apa yang boleh dilihat lewat jalur ini

| Boleh | Tidak boleh |
|---|---|
| saldo per akun grup (hasil lapis 3b) | jurnal yang membentuknya |
| total pendapatan/beban per PT | daftar invoice PT itu |
| neraca & laba-rugi konsolidasi | nama klien, nilai kontrak, kasbon |

Yang dijual produk ini adalah **melihat kesehatan seluruh grup dalam satu
layar**. Itu terpenuhi oleh angka konsolidasi. Ia **tidak** menuntut daftar
kasbon tukang di PT sebelah, dan menyediakannya hanya menambah permukaan bocor
tanpa menambah nilai.

### Pemaksaan — di DB, bukan di UI

```sql
-- BENTUK; implementasi di F2-3
CREATE FUNCTION lap_konsolidasi_grup(p_group uuid)
RETURNS TABLE (company_id uuid, akun_grup text, saldo numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- PAGAR 2+4: tanpa grant aktif → TOLAK. Status pemilik saja tidak cukup,
  -- dan tidak adanya baris berarti MATI (bukan "boleh").
  IF NOT EXISTS (
    SELECT 1 FROM cross_company_grants g
     WHERE g.group_company_id = p_group
       AND g.grantee_user_id  = auth_user_id()
       AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'akses lintas-perusahaan tidak diberikan';
  END IF;

  -- PAGAR 3: dicatat SEBELUM data dikembalikan. Kalau dicatat sesudah,
  -- pemanggilan yang gagal di tengah tak meninggalkan jejak sama sekali.
  INSERT INTO audit_logs (company_id, table_name, action, user_id, severity, reason)
  VALUES (p_group, 'cross_company_grants', 'konsolidasi.baca',
          auth_user_id(), 'warning', 'laporan konsolidasi grup');

  RETURN QUERY
    SELECT l.company_id, gra.code, sum(l.amount)
      FROM journal_entry_lines l
      JOIN account_mappings m       ON m.source_account_id = l.account_id
      JOIN group_reporting_accounts gra ON gra.id = m.target_account_id
     WHERE l.company_id = ANY (
             SELECT unnest(scope_company_ids) FROM cross_company_grants
              WHERE group_company_id = p_group AND grantee_user_id = auth_user_id()
                AND revoked_at IS NULL)
     GROUP BY 1, 2;   -- ⚠️ PAGAR 1: GROUP BY inilah batasnya. Menghapusnya
                      --    mengubah fungsi ini jadi pintu bocor baris-per-baris.
END $$;
```

**PAGAR 5 (baca-saja) dipaksa oleh bentuk:** fungsi ini `RETURNS TABLE` dan tak
punya satu pun `UPDATE`/`INSERT` ke tabel pembukuan. Satu-satunya `INSERT`-nya
menuju `audit_logs`, yang append-only (migrasi 073).

### Yang masuk Ember [C] — dan yang tidak

Yang **tidak** boleh dikonfigurasi dari UI, sekalipun diminta:

- kelima pagar di atas — **mekanismenya**, bukan pemberian haknya
- kemampuan endpoint operasional melayani lintas-PT (PAGAR 1)
- pencatatan audit (PAGAR 3)

Yang **boleh** dan memang harus lewat UI: **memberi, membatasi cakupan,
memberi tenggat, dan mencabut hak**. Itu pekerjaan pemilik grup sehari-hari,
dan menguncinya adalah persis kesalahan revisi 1.

### Tripwire

Jumlah grant aktif adalah angka yang layak diperhatikan. Kalau ia tumbuh
melebihi jumlah orang yang benar-benar mengurus keuangan grup, mekanisme ini
sedang dipakai sebagai jalan pintas — dan itu sinyal untuk meninjau ulang,
bukan untuk memperlebar.

```sql
SELECT count(*) FROM cross_company_grants
 WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now());
```

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
- CoA statutori per-PT → produk bisa dijual ke PT yang **sudah berjalan**,
  dan tiap badan hukum tetap bisa mempertanggungjawabkan SPT-nya sendiri
- Bagan grup + peta → laporan gabungan **mungkin**, dan pemetaannya terjadi
  saat murah (onboarding), bukan saat mahal (retroaktif atas ribuan jurnal)
- Template → PT baru mulai dari bagan yang sudah benar untuk konstruksi,
  tanpa mengetik puluhan akun dari nol
- Eliminasi eksplisit → nol risiko menghapus pendapatan nyata
- **Akses lintas-PT ada dan berpagar** → kebutuhan nyata terpenuhi lewat jalur
  yang tercatat, bukan lewat jalan pintas yang dibuat saat terdesak

### Negatif — dan diterima sadar

- **Setiap akun baru butuh keputusan pemetaan — selamanya, bukan hanya saat
  onboarding.** Menambah akun ke-47 di bulan keenam sama wajibnya dengan akun
  pertama. Ini kerja tambahan yang berulang, dan itu disengaja: keputusan yang
  ditunda ke waktu laporan diambil oleh orang yang tidak tahu jawabannya, dan
  satu akun tak terpeta membuat laporan gabungan salah **tanpa gejala**.
- **Mengubah pemetaan tak bisa lagi "sekadar diperbaiki".** Ia menutup baris
  lama dan membuka yang baru, dengan alasan tertulis. Lebih berbelit daripada
  `UPDATE` — ditukar dengan laporan periode lampau yang tak berubah retroaktif,
  termasuk periode yang SPT-nya sudah dilaporkan.
- **Tiga lapis lebih rumit daripada satu.** Ada tiga tabel yang harus dijaga
  konsisten, bukan satu. Ditukar dengan laporan gabungan yang benar — dan
  tanpa lapis (b), laporan itu diam-diam memecah satu akun jadi beberapa baris.
- **Akses lintas-PT butuh pemberian hak eksplisit** — pemilik grup tidak
  otomatis melihat semuanya, harus ada yang memberi dan ada alasannya. Ini
  akan terasa sebagai langkah tambahan. Ditukar dengan pencabutan yang bisa
  dilakukan (bukan diingat) dan jejak yang bisa diaudit.
- **Detail operasional tetap butuh keanggotaan.** Jalur konsolidasi hanya
  memberi angka agregat. Kalau kelak terbukti ada kebutuhan nyata melihat
  detail lintas-PT, itu **revisi ADR**, bukan pelonggaran diam-diam.
- **Konsolidasi dihitung tiap kali** — akan melambat bila jumlah PT tumbuh
  besar. Ambang tindak lanjut: **> 20 PT dalam satu grup** atau laporan
  konsolidasi > 3 detik. Sebelum itu, mengoptimalkan adalah menebak.

---

## 8. Cara memverifikasi ADR ini dijalankan

```bash
# (a) CoA statutori per-company, bukan diwarisi
node scripts/db/introspect.mjs columns | grep -A5 '"accounts"'

# (b)+(c) tiga lapis benar-benar ada SETELAH F2-3
node scripts/db/introspect.mjs tables | grep -E 'group_reporting_accounts|account_mappings'

# tak boleh ada tabel yang MENYIMPAN hasil konsolidasi (ia dihitung, §4.1)
node scripts/db/introspect.mjs tables | grep -iE 'consolidated_'

# assets/workers per-company (dan mandor_assignments SETELAH F2-3)
node scripts/db/introspect.mjs tenancy-coverage
```

**Kelengkapan peta (butir B)** — nol berarti tiap akun PT anggota grup punya
pasangan. Ini pemeriksaan *keadaan*; penegakan sesungguhnya ada di trigger,
karena kueri yang dijalankan sesekali hanya menemukan pelanggaran **setelah**
laporan salah terbit:

```sql
SELECT a.company_id, count(*) AS akun_belum_dipetakan
  FROM accounts a
  JOIN companies c ON c.id = a.company_id AND c.parent_company_id IS NOT NULL
 WHERE a.group_account_id IS NULL
 GROUP BY 1;   -- harus NOL
```

**Peta berversi (butir C)** — nol tumpang-tindih, dan riwayat tak pernah
di-`UPDATE`:

```sql
-- nol baris: dua pemetaan aktif untuk akun yang sama pada rentang yang sama
SELECT source_account_id, count(*)
  FROM account_mappings
 WHERE berlaku_sampai IS NULL
 GROUP BY 1 HAVING count(*) > 1;

-- perubahan pemetaan HARUS menyisakan baris lama (tertutup), bukan menimpanya
SELECT count(*) FROM account_mappings WHERE berlaku_sampai IS NOT NULL;
```

**Pagar akses lintas-PT** — keempatnya harus benar:

```sql
-- PAGAR 4 (mati bawaan): nol grant di lingkungan baru
SELECT count(*) FROM cross_company_grants
 WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now());

-- PAGAR 2 (per-orang): tak boleh ada grant tanpa penerima/alasan
SELECT count(*) FROM cross_company_grants
 WHERE grantee_user_id IS NULL OR alasan IS NULL OR alasan = '';

-- PAGAR 3 (tercatat): tiap pembacaan konsolidasi meninggalkan jejak
SELECT count(*) FROM audit_logs WHERE action = 'konsolidasi.baca';
```

**PAGAR 1 & 5** dijaga oleh bentuk fungsinya (`GROUP BY`, `RETURNS TABLE`) —
dan wajib punya **test yang terbukti bisa merah**, sesuai disiplin yang sudah
berlaku di repo ini: penjaga yang tak pernah dibuktikan bisa gagal harus
dianggap tidak ada.

---

## 9. Rujukan

- `ADR-011-multi-tenant-strategy.md` — bentuk `companies`, `company_members`,
  RLS dual-axis (dokumen yang ini lengkapi)
- `CLAUDE.md` §5.3 — Ember [C], daftar yang tak boleh dikonfigurasi
- `docs/execution/QUEUE.yaml` — F2-1 (ini), F2-2, F2-3
- `docs/KEPUTUSAN-SCOPE-ERP-AI.md` — multi-currency dicoret dari scope

---

## 10. Pemeriksaan tabrakan dengan ADR-011 (koreksi R-007 butir 5)

Founder meminta bukti ADR ini **mengisi celah**, bukan menimpa. Diperiksa
2026-08-04, dan hasilnya bisa diulang siapa saja.

### Nomor 010 memang kosong

Audit 2026-08-02 mencatatnya sendiri:

> `docs/audit/2026-08-02/02-DOCS-INVENTORY.md:50` —
> *"**ADR-003 dan ADR-010 tidak ada.** Penomoran melompat tanpa penjelasan."*

Riwayat git membenarkan: satu-satunya berkas ADR-010 adalah commit `41b1179`
(dokumen ini). Tak ada yang ditimpa.

```bash
git log --all --oneline --diff-filter=A -- '**/ADR-010*'
```

### Nol tabrakan topik

```bash
A=docs/superpowers/specs/2026-07-18-enterprise-architecture/\
Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md
for k in "chart of account" konsolidasi "pemilik grup" eliminasi \
         "transfer alat" "harga transfer" intercompany; do
  printf "%-18s %s\n" "$k" "$(grep -ci "$k" "$A")"
done
```

| Topik ADR-010 | Kecocokan di ADR-011 |
|---|---|
| chart of account | **0** |
| konsolidasi | **0** |
| pemilik grup | **0** |
| eliminasi · transfer alat · harga transfer · intercompany | **0** |

### Dua penyebutan yang beririsan — diperiksa, bukan diabaikan

`grep accounts` menemukan 2 kecocokan di ADR-011:

- **baris 178-180** — mendaftar `accounts`/`journal_entries` sebagai contoh
  tabel **per-tenant** dalam klasifikasi. Itu *penggolongan tenancy*, bukan
  keputusan bentuk CoA. ADR-010 melanjutkannya, tidak membantahnya.
- **baris 242, 461** — `cross-tenant` dalam konteks **risiko kebocoran**
  (search global, R1). ADR-010 §5 justru memperketat area itu dengan lima
  pagar yang bisa diaudit.

### Yang harus tetap konsisten

ADR-010 **tunduk** pada invarian ADR-011 §4: *`parent_company_id` tidak
memberi pewarisan data.*

Dua keputusan di sini bisa disalahpahami melanggarnya, dan keduanya tidak:

| Terlihat seperti pewarisan | Kenyataannya |
|---|---|
| Template bagan akun (§3a) | **salinan sekali** saat adopsi; nol tautan hidup ke induk |
| Akses lintas-PT (§5) | **grant per-orang yang eksplisit**, bukan turunan otomatis status pemilik |

Bila kelak ADR-011 direvisi menyangkut `companies`/`company_members`/RLS,
§3.3 dan §5 dokumen ini yang harus ditinjau lebih dulu — keduanya bersandar
pada bentuk itu.
