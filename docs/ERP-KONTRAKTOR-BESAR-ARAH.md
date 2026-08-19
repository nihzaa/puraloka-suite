# ERP Kontraktor Besar — apa yang membedakannya, dan bagaimana 8 sisa `sebagian` tuntas

> Ditulis 2026-08-19 menjawab pertanyaan founder: *"coba kamu pikirkan
> bagaimana ERP profesional yg dipakai kontraktor besar itu seperti apa agar
> semua yg masih sebagian ini bisa tuntas"*.
>
> **Angka di dokumen ini dari pengukuran 2026-08-19**, dan seperti seluruh
> dokumen di repo ini: kalau bisa basi, cara mengukurnya ikut ditulis.

---

## 0. Satu kalimat yang membedakannya

Yang membedakan ERP kontraktor besar dari aplikasi manajemen proyek biasa
**bukan jumlah fiturnya** — melainkan bahwa **setiap angka bisa ditelusuri
sampai ke dokumen yang ditandatangani seseorang.**

Kontraktor kecil bisa hidup dengan "kira-kira segini". Kontraktor besar tidak
bisa, karena tiga hal:

1. **Sengketa itu normal, bukan kecelakaan.** Proyek Rp 50 M punya klaim,
   addendum, dan back-charge sebagai bagian dari pekerjaan biasa. Yang
   menentukan siapa menang bukan siapa yang benar — melainkan siapa yang
   punya kertasnya.
2. **Yang memutuskan bukan yang mengerjakan.** Direktur menyetujui pembayaran
   untuk pekerjaan yang tak pernah ia lihat. Satu-satunya yang ia punya
   adalah jejak: siapa mengukur, siapa memverifikasi, kapan.
3. **Uang keluar sebelum uang masuk.** Kontraktor membiayai pekerjaan lebih
   dulu, ditagih belakangan. Selisih beberapa minggu pada Rp 50 M adalah
   selisih antara jalan dan berhenti.

Ketiganya menuntut hal yang sama: **rantai yang tak putus dari lapangan ke
kertas.**

---

## 1. Empat rantai yang tak boleh putus

ERP kontraktor besar yang matang punya empat rantai. Modul boleh banyak;
yang menentukan adalah **tak ada rantai yang putus di tengah**.

### Rantai A — dari orang ke uang

    mitra → kontrak/SPK → lingkup kerja → opname → berita acara
          → tagihan → pembayaran → jurnal

**Sudah tersambung penuh sejak 2026-08-19.** Simpul terakhirnya — identitas
mitra yang terpecah tiga tabel — ditutup migrasi 461-464: satu tabel `mitra`
ber-kolom `bentuk` (orang | badan usaha), dan daftar hitam yang menutup
SEMUA pintu sekaligus. Sebelumnya evaluasi buruk di satu jalur tak
menghalangi pihak yang sama masuk lewat jalur lain — dan diukur, kedelapan
penawaran tender memang masuk lewat pintu yang tak dijaga.

### Rantai B — dari rencana ke kenyataan

    RAB → RAP → PO/SPK → realisasi biaya → CVR → laporan laba

**Masih putus di CVR, tapi putusnya kini TERLIHAT** (`cc-cvr`, 2026-08-19).
Nilai terpasang tetap dihitung dari upah borongan — dan itu tak bisa berubah
tanpa perubahan skema, karena taksonomi biaya dan taksonomi RAB tak saling
menunjuk. Yang berubah: layar kini menyebut **berapa besar** yang di luar
jangkauannya (Rp 263,5 juta), alih-alih membiarkannya terbaca sebagai nol.

### Rantai C — dari gambar ke pertanggungjawaban

    gambar/dokumen → revisi → distribusi → tanda tangan
                   → arsip yang bisa dibuktikan tak berubah

**Tersambung penuh sejak 2026-08-19 — dan saya SALAH menilainya di atas.**

Kalimat aslinya berbunyi *"`documents.version` bertipe TEKS ber-default 1.0
dengan nol constraint"*. Diukur ke `pg_constraint`: keliru. Migrasi 445 sudah
menambah `revisi`, `menggantikan_id` (FK self-reference), CHECK
`documents_tak_mengganti_diri`, dan dua index — plus 24 test hijau.

Yang benar-benar kurang cuma satu, dan tak seorang pun menyebutnya: rantainya
lengkap di basis dan API lalu **putus tepat sebelum mata orang**. Keempat
medan revisi sudah dikirim API sejak 445, dengan **nol** rujukan di seluruh
`apps/web`. Ditutup hari ini di `components/document-section.tsx`.

### Rantai D — dari kewajiban ke bukti kepatuhan

    kontrak → kewajiban (pajak, K3, asuransi, izin)
            → bukti → pelaporan ke pihak luar

**Menunggu pihak ketiga**: e-meterai Peruri (`dk-esign`), integrasi DJP
(`fn-efaktur`), SMTP tenant (`bi-terjadwal`).

---

## 2. Lima hal yang selalu ada di ERP kontraktor besar

Ini yang saya pakai sebagai ukuran, bukan daftar fitur vendor.

### 2.1 Satu identitas mitra, banyak peran

Satu pihak bisa sekaligus: peserta tender, pelaksana, pemasok material, dan
subjek evaluasi. ERP yang matang menyimpannya **sekali**, lalu memberi peran.

Yang dibeli dengan itu bukan kerapian — melainkan **gerbang kelayakan yang
menutup semua pintu.** Selama identitasnya terpecah, memblokir seseorang
hanya memblokir satu pintu.

→ **`md-subkon` ✅ SELESAI 2026-08-19** (migrasi 461-464). Dibuktikan lewat
mutasi: melumpuhkan gerbangnya menghasilkan HTTP 200 dan status `"menang"`
untuk mitra berdaftar-hitam.

### 2.2 Setiap angka menyebut CAKUPANNYA

"Rugi Rp 40 juta" tak berarti apa-apa tanpa tahu: sudah termasuk material?
Sudah termasuk alat? Sampai tanggal berapa?

ERP kontraktor besar **selalu** menyertakan cakupan pada angka finansial.
Yang berbahaya bukan angka tak lengkap — melainkan angka tak lengkap yang
**terlihat lengkap**.

→ **`cc-cvr` ✅ SELESAI 2026-08-19** — dua cakupan berdampingan, masing-masing
berlabel, **tak pernah dijumlahkan**. Menjumlahkannya berarti mengadu biaya
material dengan nilai upah lalu menyebut selisihnya "rugi".

### 2.3 Dokumen punya VERSI, dan versi lama tak pernah hilang

Kontrak yang ditandatangani harus bisa dicetak ulang **persis** seperti saat
ditandatangani — meski template-nya sudah berubah tiga kali sejak itu.

Repo ini sudah menerapkannya di dua tempat, dan alasannya identik:
- klausul kontrak (migrasi 450): `versi` naik, yang lama dinonaktifkan
- addendum SPK (migrasi 454): DELTA disimpan, induk tak pernah berubah

`documents` menyusul lewat migrasi 445 — dan lencana revisinya baru sampai
ke layar 2026-08-19.

→ **`dk-register` ✅ SELESAI 2026-08-19**

### 2.4 Template dokumen milik TENANT, bukan milik produk

Tiap perusahaan punya bunyi pasal, kop, dan format berita acara sendiri —
sering ditentukan penasihat hukumnya. ERP yang memaksakan template produk
akan ditinggalkan begitu klien pertama minta perubahan.

Klausul kontrak pindah ke tenant lewat migrasi 450; SPK dan berita acara
menyusul lewat **migrasi 465** (kolom `jenis_dokumen` pada tabel yang sama —
yang membedakan keduanya bukan strukturnya melainkan untuk kertas apa ia
dicetak).

→ **`md-template-dok` ✅ SELESAI 2026-08-19**

### 2.5 Kepatuhan punya JADWAL, bukan diingat orang

Pajak, sertifikat K3, polis asuransi, izin — semuanya punya tanggal jatuh
tempo, dan semuanya mahal kalau lewat. ERP kontraktor besar menjadwalkannya,
bukan mengandalkan ingatan.

Repo ini sudah punya 58 tugas terjadwal. Yang menahan tiga sisa bukan kode.

→ **`dk-esign`**, **`fn-efaktur`**, **`bi-terjadwal`** — menunggu pihak ketiga

---

## 3. Peta 8 sisa terhadap kelima ukuran itu

| # | Entri | Rantai | Ukuran | Yang menahan |
|---|---|---|---|---|
| 1 | `md-subkon` | A | 2.1 | ✅ **SELESAI 2026-08-19** (migrasi 461-464) |
| 2 | `cc-cvr` | B | 2.2 | ✅ **SELESAI 2026-08-19** (dua cakupan) |
| 3 | `dk-register` | C | 2.3 | ✅ **SELESAI 2026-08-19** (445 + lencana UI) |
| 4 | `md-template-dok` | C | 2.4 | ✅ **SELESAI 2026-08-19** (migrasi 465) |
| 5 | `dk-esign` | D | 2.5 | kontrak Peruri |
| 6 | `fn-efaktur` | D | 2.5 | integrasi DJP |
| 7 | `bi-terjadwal` | D | 2.5 | kredensial SMTP tenant |
| 8 | `mb-progres` | A | — | build & sebar aplikasi mobile |

**KEEMPAT pekerjaan kode SELESAI 2026-08-19.** Empat sisanya menunggu di luar
kode — kontrak Peruri, integrasi DJP, kredensial SMTP tenant, dan pemakaian
sungguhan aplikasi mobile oleh mandor.

Sebelumnya saya menghitung hanya SATU pekerjaan kode. Yang berubah: jawaban
founder memindahkan `cc-cvr` dari "keputusan" ke "kode", dan `md-template-dok`
ternyata bukan "sengaja dibatasi" melainkan penambahan wajar yang belum
dikerjakan.

---

## 4. Urutan yang disarankan, dan alasannya

### Urutan 1 — `cc-cvr` (dua cakupan) — ✅ **SELESAI 2026-08-19**

**Kenapa pertama:** nol risiko migrasi, nol menunggu data, dan ia memperbaiki
angka yang **sudah dibaca orang sekarang**.

**Saya salah menebak cacatnya, dan pengukuran memperbaikinya.** Dugaan saya:
"layar menampilkan angka tanpa menyebut cakupannya". Diukur — tidak benar,
spanduk cakupan sudah ada sejak 2026-08-08 dan berbunyi jelas. Yang benar
lebih halus dan lebih berbahaya:

    work_scopes.rab_category_id  → rab_items                  (BoQ)
    project_expenses.category_id → project_expense_categories (bagan biaya)

**Dua taksonomi yang tak pernah bertemu** — nol kolom di sisi biaya menunjuk
`rab_items` (diukur ke `pg_constraint`). Jembatan `cost_code_category_map`
berhenti di cost_code. Jadi rencana "isi kategorinya lalu cakupan jadi penuh"
tak akan pernah berhasil: mengisi kategori pada 20 scope tak membuat satu
rupiah pun biaya material ikut terhitung.

Yang justru terlihat begitu diukur — biaya `approved` pada proyek
ber-work_scope, total **Rp 263,5 juta**:

    Pak Andi — Buah Batu    upah 126,6 jt   di luar hitungan  88,3 jt
    Dapur & KM Pak Hendra   upah      0     di luar hitungan  80,3 jt
    Gudang — Gedebage       upah      0     di luar hitungan  48,7 jt
    Bu Sari — Dago          upah      0     di luar hitungan  46,2 jt

Tiga proyek terakhir tampil di CVR **seolah tak punya biaya sama sekali**.
Cacatnya bukan angka yang kurang lengkap — melainkan angka yang **terlihat
lengkap**, karena layar tak pernah menyebut berapa besar yang di luar
jangkauannya, dan angka yang tak disebut dibaca sebagai nol.

**Yang dibangun:** `ringkasBiayaLuarScope()` + kartu "Biaya di luar hitungan"
berikut rincian per kategori — didampingkan, **tak pernah dijumlahkan** ke
margin. Menjumlahkannya berarti mengadu biaya material dengan nilai upah lalu
menyebut selisihnya "rugi", dan itu kesalahan aritmetika, bukan temuan.

Kartunya sengaja tampil juga saat **nol scope** — justru di sanalah ia paling
menentukan (tiga proyek di atas).

**Bukti:** 37 test hijau (27 pustaka + 10 endpoint), 4 mutasi terbukti MERAH.
Mutasi keempat **LOLOS** lebih dulu: test cuma memeriksa rincian menjumlah ke
totalnya, dan itu tetap benar saat semua nama kategori hilang ke satu ember
"Tanpa kategori". Dipertajam ke NAMA-nya, lalu MERAH.

**Tetap `sebagian`, dan itu jujur:** cakupan penuh per-pekerjaan menuntut
perubahan skema (rujukan dari sisi biaya ke RAB), bukan pengisian data.

### Urutan 2 — `md-subkon` (identitas mitra) — ✅ **SELESAI 2026-08-19**

**Kenapa kedua:** rancangannya sudah disetujui, dan **sekarang waktu termurah
yang akan pernah ada** — `workers` 60 baris, `suppliers` 5 baris, nol nama
yang sama di keduanya, jadi backfill-nya tak perlu menebak.

**Cacatnya lebih tajam dari yang saya duga.** Dugaan awal: "identitas terpecah
tiga tabel, tak rapi". Diukur, dan yang ditemukan bukan soal kerapian:

    evaluasi_subkon.supplier_id       → suppliers   (5 evaluasi)
    prakualifikasi_vendor.supplier_id → suppliers   (5 prakualifikasi)
    penawaran_subkon.worker_id        → workers     (8 penawaran)

**Kedelapan penawaran tender datang lewat `workers`**, sementara
`evaluasi_subkon.masuk_daftar_hitam` — satu-satunya penanda daftar hitam —
hanya bisa menunjuk `suppliers`. Dan `tender-subkon.ts` maupun `spk.ts` **nol
rujukan** padanya.

Jadi pihak yang di-blacklist bisa menawar **dan menang**. Bukan karena
penjaganya lalai — karena penjaganya berdiri di pintu yang lain. Dibuktikan
lewat mutasi: melumpuhkan gerbangnya menghasilkan HTTP 200 dan status
`"menang"` untuk mitra berdaftar-hitam.

**Yang dibangun:**

| | |
|---|---|
| migrasi 461 | tabel `mitra` ber-kolom `bentuk` (`orang`\|`badan_usaha`), RLS + FORCE, backfill 60+5 = **65 mitra, nol yatim** |
| migrasi 462 | izin `mitra:view` / `manage` / `daftar_hitam` — yang ketiga **sengaja tak diwariskan** |
| migrasi 463 | menu `md-subkon` akhirnya menunjuk halaman yang ada |
| migrasi 464 | induknya dipindah ke grup yang **hidup** (463 lulus verifikasinya sendiri tapi menggantung di grup mati) |
| `lib/gerbang-kelayakan.ts` | satu penanda, semua pintu |
| `routes/v1/mitra.ts` | CRUD + endpoint daftar hitam **terpisah** |
| `/mandor/mitra` | layarnya — §8: "kolom DB sudah ada" bukan selesai |

**Tiga tabel lama tetap hidup, nol FK dipindah, nol rute berubah.** Diukur
lebih dulu: 8 tabel merujuk `workers`, 14 merujuk `suppliers` — 22 FK yang
tak perlu disentuh.

**Bukti:** 38 test hijau, 3 mutasi MERAH, nol penjaga baru merah.

### Urutan 3 — `md-template-dok` — ✅ **SELESAI 2026-08-19**

Dugaannya tepat kali ini: polanya memang sudah terbukti (klausul kontrak
migrasi 450). Yang ditambahkan cuma satu kolom `jenis_dokumen` pada tabel
yang sama — bukan tabel kedua, karena yang membedakan klausul kontrak dari
klausul SPK bukan strukturnya melainkan untuk kertas apa ia dicetak.

Diukur sebelum dibangun: `contracts.ts` membaca klausul tenant di empat
tempat; `spk.ts` **nol rujukan**. Tiap perusahaan menerbitkan SPK dengan
syarat yang ditulis pembuat aplikasi.

**Cacat yang ditemukan SAAT membangun, dan itu yang paling berharga:** DELETE
klausul menyaring hanya `nomor`. Sesudah 465, "pulihkan bawaan Pasal 6 SPK"
menonaktifkan **Pasal 6 KONTRAK** — kertas bertanda tangan — lalu membalas
200. Sebabnya ketiga rute klausul hidup sejak migrasi 450 **tanpa satu pun
test endpoint**.

### Urutan 4 — `dk-register` — ✅ **SELESAI 2026-08-19**, dan saya salah menilainya

**Rencana saya salah dari awal.** Saya menulis bahwa ini "satu-satunya yang
menyentuh data lama (backfill seluruh `documents` jadi revisi 1)" dan butuh
izin terpisah §8a.5.

Diukur: **backfill-nya sudah dikerjakan migrasi 445.** Kolom `revisi`,
`menggantikan_id`, CHECK, dua index, pustaka `lib/revisi-dokumen.ts`, dan 24
test — semuanya sudah ada. Tak ada data lama yang perlu disentuh, jadi tak
ada izin yang perlu diminta.

Yang benar-benar kurang **tak tertulis di rencana mana pun**: rantainya
lengkap di basis dan API lalu putus tepat sebelum mata orang. Keempat medan
revisi (`digantikan`, `digantikan_oleh`, `revisi_hitung`, `revisi_terkini`)
dikirim API sejak 445 dengan **nol** rujukan di seluruh `apps/web`.

Dokumen yang sudah digantikan tampil persis seperti yang berlaku. Untuk
gambar kerja, salah revisi berarti pekerjaan dibongkar.

Pelajarannya sama dengan yang sudah tertulis di pembuka `CLAUDE.md`:
**rencana pun bisa basi.** Rencana yang ditulis dari membaca dokumen — bukan
dari mengukur kode — akan mengarahkan pekerjaan ke tempat yang salah, dan
tetap terdengar meyakinkan sepanjang jalan.

---

## 5. Yang TIDAK akan dikerjakan, dan kenapa itu keputusan

Empat sisa lain menunggu di luar kode. Menyebutnya "belum dikerjakan"
menciptakan hutang yang tak ada:

- **`dk-esign`** — verifikasi sidik SHA-256 + layarnya sudah jalan. Yang
  kurang cuma materai berkekuatan hukum, dan itu **kontrak komersial dengan
  Peruri**, bukan baris kode.
- **`fn-efaktur`** — ekspor DJP (e-Faktur FK/LT/OF + bukti potong) sudah
  jalan, PKP per tenant sudah ada. Yang tersisa **integrasi langsung ke
  sistem DJP** — wilayah pihak ketiga.
- **`bi-terjadwal`** — pemicunya sudah terdaftar (2026-08-17). Begitu SMTP
  diisi lewat Pengaturan, ia jalan **tanpa perubahan kode**.
- **`mb-progres`** — kodenya lengkap (357 baris, dua mode, foto + izin
  runtime). Yang belum: **dipakai mandor sungguhan**. Fitur yang tak pernah
  dipakai orang belum terbukti bekerja di tangan penggunanya, dan mandor di
  lapangan punya HP lama, sinyal buruk, dan kebiasaan yang tak bisa ditebak
  dari kode.

---

## 6. Cara mengukur ulang seluruh angka di dokumen ini

```bash
# Peta Modul
node -e "const s=require('fs').readFileSync('apps/web/lib/peta-menu.ts','utf8');
const c={};for(const m of s.matchAll(/status: '(\w+)'/g))c[m[1]]=(c[m[1]]||0)+1;console.log(c)"

# Identitas mitra: berapa baris, berapa yang bisa dicocokkan
psql -c "SELECT (SELECT count(*) FROM workers) w,
                (SELECT count(*) FROM suppliers) s,
                (SELECT count(*) FROM workers x JOIN suppliers y
                  ON lower(btrim(x.name))=lower(btrim(y.name))) sama"

# CVR: lingkup kerja per sistem bayar, dan berapa yang berkategori
psql -c "SELECT payment_system, count(*), count(rab_category_id)
           FROM work_scopes GROUP BY payment_system"

# Berapa proyek ber-lingkup kerja punya kategori RAB
psql -c "SELECT count(DISTINCT p.id) FILTER (WHERE
           EXISTS (SELECT 1 FROM rab_items ri
                    WHERE ri.project_id=p.id AND ri.level='category')) berkategori,
         count(DISTINCT p.id) total
    FROM projects p JOIN mandor_assignments ma ON ma.project_id=p.id
    JOIN work_scopes ws ON ws.assignment_id=ma.id"
```
