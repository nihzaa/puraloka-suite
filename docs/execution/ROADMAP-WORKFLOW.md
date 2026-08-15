# ROADMAP WORKFLOW — checklist, dan di mana tiap bagian dipasang

> **Kenapa berkas ini ada.** Founder, 2026-08-15: *"saya mau ada checklist
> roadmap dalam membangun semua workflow yg ada, dan dipasang dimananya,
> apakah disistem atau di n8n"*.
>
> Sebelum ini, "workflow mana yang sudah dan belum" hanya bisa dijawab dengan
> membaca ulang kode — dan jawaban itu **meleset dua kali** dalam dua sesi.
> Katalog `06-agentic-ai-*.md` tak membantu: kolom terakhirnya `N/N/L/O`
> adalah **prioritas**, bukan status, dan tujuh automation yang sudah hidup
> semuanya masih tertulis `Next` di sana.
>
> Berkas ini melengkapi — bukan menggantikan — `scripts/lapor-otomasi-hidup.mjs`.
> Skrip itu MENGUKUR apa yang hidup hari ini; berkas ini mencatat KEPUTUSAN
> dan urutan kerjanya.
>
> **Aturan mengikat:** kolom "Status" di bawah TIDAK boleh dipercaya begitu
> saja. Sebelum menyatakan sesuatu selesai, ukur:
>
> ```bash
> cd apps/api && node -r dotenv/config scripts/lapor-otomasi-hidup.mjs
> ```

---

## 1. Di mana tiap bagian dipasang

Diukur dari 14 alur yang sudah ada (2026-08-15), bukan dirancang di atas
kertas. Pembagiannya konsisten dan punya alasan:

| Lapis | Isinya | Kenapa di sana |
|---|---|---|
| **Sistem** (`apps/api`) | Aturan, ambang, query, dedup, pembuatan notifikasi | Ia menyentuh data ber-RLS. Memindahkannya ke n8n berarti memberi n8n kredensial basis dan menduplikasi seluruh lapisan tenancy |
| **n8n** | Pemicu terjadwal, panggilan HTTP ke sistem, format pesan, pengiriman WhatsApp | Ia bicara ke dunia luar. Menaruhnya di sistem berarti menulis ulang penjadwal dan integrasi WA yang sudah jadi |

Resep n8n hanya memakai empat jenis node — diukur dari
`scripts/n8n/bangun-alur.mjs`:

```
scheduleTrigger  →  httpRequest  →  code  →  httpRequest
webhook          →  code         →  httpRequest
```

**Tak ada logika bisnis di n8n.** Node `code` hanya memformat pesan. Ambang,
saringan, dan keputusan "siapa yang perlu tahu" seluruhnya di sistem.

### Konsekuensi praktis

* Otomasi **berpemicu jadwal** butuh DUA bagian: rute di sistem + workflow
  jadwal di n8n. Tanpa yang kedua, rutenya benar tetapi tak pernah dipanggil.
* Otomasi **berpemicu peristiwa** butuh jembatan `terbit-peristiwa.ts`
  (sistem) + workflow webhook di n8n.
* ⚠ **Baris ini SALAH dan sudah dikoreksi (2026-08-16).** Aslinya berbunyi:
  *"yang belum di-deploy (`SCHEDULER_URL` kosong) berarti bagian n8n-nya
  menunggu"*.

  Diukur: `SCHEDULER_URL` **tidak dipakai satu baris kode pun** di repo ini —
  ia hanya muncul sebagai kalimat di skrip laporan. Penjadwalnya justru ada di
  dalam API (`POST /api/v1/jadwal/jalankan` + tabel `jadwal_tugas`), memakai
  `SCHEDULER_SECRET` yang sudah terisi, dan menjalankan tiap tugas lewat
  `server.inject` — tak butuh jaringan, tak butuh n8n, tak butuh deploy.

  Lihat §9.

---

## 2. Checklist per otomasi

Kolom **Sistem** dan **n8n** diisi terpisah karena keduanya memang bisa
berbeda: rute yang sudah jadi tetapi workflow-nya belum dipasang adalah
keadaan yang wajar dan sering terjadi.

### Sudah hidup — prioritas `Next` di katalog (8 dari 8)

| # | Automation | Sistem | n8n | Catatan |
|---|---|---|---|---|
| 2.10 | Kasbon Outstanding Aging | ✅ `kasbon-outstanding` | ⬜ jadwal | dedup harian sempat mati karena pemisah `NUL` |
| 3.5 | Auto Purchase Request | ✅ `stok-menipis` | ✅ webhook | **memperingatkan, bukan membuat MR** — lihat §3 |
| 3.10 | Dependency Threshold Breach | ✅ `dependency-breach` | ⬜ jadwal | aturan dipakai bersama layar Gantt |
| 3.11 | Auto Progress Reminder | ✅ `progres-belum-lapor` | ⬜ jadwal | |
| 4.6 | PO Approval Fast-Track | ✅ rantai approval | — | lahir dari `max_amount`, bukan fitur terpisah |
| 4.10 | Auto GR Matching | ✅ `gr-matching` | ⬜ jadwal | |
| 5.1 | Invoice Generator | ✅ `invoice-termin` | ⬜ jadwal | |
| 6.6 | Kasbon Tukang Auto-Reminder | ✅ `kasbon-tukang` | ⬜ jadwal | |

### Sedang dikerjakan — Phase 3-5, prasyarat sudah ada di kode

Dipilih founder 2026-08-15: *"keenamnya"*. Diukur lebih dulu — seluruh
prasyaratnya sudah ada di kode, dan tak satu pun membutuhkan AI.

| # | Automation | Sistem | n8n | Aturan notifikasi | Catatan |
|---|---|---|---|---|---|
| 2.6 | Invoice Overdue Escalation | ✅ `invoice-terlambat` | ⬜ jadwal | ✅ `invoice_overdue` | membaca `amount_due`, bukan `status` |
| 2.11 | Cash Position Alert | ✅ `saldo-menipis` | ⬜ jadwal | ✅ migrasi 395 | ambang dari `company_settings` |
| 3.7 | Milestone Risk Flagging | ✅ `milestone-berisiko` | ⬜ jadwal | ✅ `milestone_approaching` | `completed_at`, bukan `status` |
| 2.2 | Vendor Payment Reminder | ✅ `hutang-supplier` | ⬜ jadwal | ✅ migrasi 395 | ditegur SEBELUM jatuh tempo |
| 4.9 | Material Price Trend | ✅ `harga-material-naik` | ⬜ jadwal | ✅ migrasi 395 | kenaikan yang SUDAH terjadi, bukan prediksi |
| 3.18 | Earned Value Trend Alert | ✅ `evm-kinerja` | ⬜ jadwal | ✅ migrasi 398 | MEMANGGIL rute kurva-S, tak menyalin rumusnya — §3 |

### Belum — butuh modul yang belum dibangun

Empat modul ini **nol halaman, nol rute** (diukur 2026-08-15). Otomasi tak
bisa mengingatkan sesuatu yang tak punya tempat penyimpanan.

| Modul | Otomasi yang menunggunya | Diukur ulang 2026-08-16 |
|---|---|---|
| Transmittal | ~~5.11~~ | ✅ **SELESAI** — tabel, rute, dan layar semuanya sudah ada; lihat §8 |
| Compliance | 9.1 Regulatory Compliance Checklist | benar-benar belum ada |
| Quality Checklist | 3.14 Quality Checklist Auto-Reminder | ⚠ tabel `inspeksi_checklist` ADA (5 baris) |
| Insurance & Surety | ~~5.7 · 9.2~~ | ✅ **SELESAI** — lihat §7 |

> ⚠ **Tabel di atas SALAH saat ditulis, dan begitulah cara ia salah.**
>
> Baris aslinya menyatakan keempat modul "nol halaman, nol rute (diukur
> 2026-08-15)". Diukur ulang sehari kemudian: **tiga dari empat sudah punya
> tabelnya**, dan dua di antaranya punya rute lengkap.
>
> Pengukuran pertama saya mencari berkas ber-kata `insurance`, `compliance`,
> `transmittal` — bahasa Inggris, di repo yang menamai berkasnya bahasa
> Indonesia (`asuransi.ts`, `register-asuransi.ts`). Nol hasil terbaca sebagai
> "belum ada", padahal artinya "saya mencari kata yang salah".
>
> Cara mengukurnya dengan benar — ke SCHEMA, bukan ke nama berkas:
>
> ```bash
> node scripts/db/introspect.mjs tables | grep -iE 'transmittal|polis|checklist'
> grep -rn "'/api/v1/" apps/api/src/routes/v1/<berkas>.ts
> ```

> ⚠ Katalog menandai `3.16 RFI Auto-Routing` sebagai butuh "modul baru".
> **Itu sudah basi** — RFI sudah punya halaman dan rute (diukur). Label di
> katalog belum diperbaiki.

### Belum — butuh kemampuan yang belum ada

| # | Automation | Yang kurang |
|---|---|---|
| 1.3 | Voice Note Accounting | STT Bahasa Indonesia |
| 1.10 | Photo-to-Record | OCR |

Sisanya (64 `Later` + 65 `Optional`) bergerbang Phase 6+; 49 di antaranya
bertipe Predictive/Agentic yang memang menuntut model AI untuk memperkirakan,
bukan sekadar aturan `if-then`.

---

## 3. Keputusan yang sudah diambil — jangan diulang perdebatannya

### 3.5 memperingatkan, TIDAK membuat MR otomatis

Katalog menulis *"Draft MR otomatis"*. Ditolak, dengan tiga alasan terukur
(lengkapnya di `otomasi-terjadwal.ts` dekat rute `stok-menipis`):

1. MR menentukan BERAPA BANYAK dibeli; ambang hanya bilang "kurang".
2. Sumber "berapa banyak" (3.4) bergerbang Phase 6.
3. MR draft yang lahir sendiri menumpuk, dan yang menumpuk tak dibaca.

Yang dikirim: peringatan yang MEMBAWA angkanya, supaya manusia menekan "Buat
MR" dengan angka yang sudah terhitung.

### 3.18 — ditunda, lalu diselesaikan lewat jalan lain (2026-08-16)

Alasan penundaannya tetap benar dan masih tertulis di bawah. Yang berubah cuma
jalan keluarnya.

**Alasan penundaan (2026-08-15).** Tak ada tabel ber-`spi`/`cpi`. EVM dihitung
di dalam handler `kurva-s.ts`, dan merakit ulang BAC/AC/EV/PV di otomasi butuh
~25 baris salinan. Dua sumber untuk satu angka adalah cara paling sunyi membuat
laporan dan notifikasi berselisih.

**Yang saya kira jalan keluarnya:** ekstrak perhitungannya jadi fungsi yang
bisa dipanggil keduanya.

**Yang ternyata benar.** Rumusnya SUDAH fungsi murni — `lib/evm-calculation.ts`
sejak Task 1.2.2. Yang mahal bukan rumusnya melainkan MENENTUKAN MASUKANNYA:

| Masukan | Kenapa tak bisa disalin |
|---|---|
| BAC | berjenjang: pagu RAP terkunci → nilai RAB → nilai kontrak |
| PV | dari kurva rencana mingguan, yang sumbernya sendiri berjenjang |
| AC | serapan dana manual, bukan aktual kas |

Jadi otomasinya **memanggil rute kurva-S** lewat `server.inject` — pola yang
sudah ada dan sudah beralasan di `lib/ai-setujui.ts` dan `routes/v1/jadwal.ts`.
Header asli pemanggil ikut, jadi `authenticate` dan saringan tenant berlaku
persis sama.

Klaimnya jadi satu kalimat yang bisa salah, dan diuji sebagai itu: **SPI di
notifikasi sama persis dengan SPI di layar Kurva-S** (`otomasi-evm.test.ts`,
dibandingkan dengan `toBe`, bukan `toBeCloseTo`).

**Ongkosnya nyata** — satu permintaan per proyek aktif, dan kurva-S bukan rute
ringan. Karena itu dibatasi proyek berstatus `active`.

### 4.9 bukan prediksi

Katalog menandainya `Predictive`. Yang dibangun bagian rule-based-nya:
kenaikan yang **sudah terjadi** dan melampaui ambang, diukur dari riwayat
`price_book_entries`. Menyebutnya prediksi akan mengklaim lebih dari yang ia
lakukan.

---

## 4. Cara kerja yang dipakai membangunnya

Ditetapkan sesudah kehilangan satu rute yang sudah selesai (2026-08-15).

**Commit tiap satu otomasi selesai.** Bukan menumpuk semuanya di working tree.

Penyebab kehilangannya: `git stash` untuk membandingkan ratchet ke HEAD, dan
satu `stash pop` yang tak berjalan. Yang benar untuk membandingkan:

```bash
git show HEAD:apps/api/src/routes/v1/berkas.ts   # tanpa menyentuh working tree
```

**Penjaga dijalankan SEBELUM commit, bukan sesudah.** Dua ratchet Gerbang
Keras sempat merah karena commit saya sendiri:

| Penjaga | Naik | Sebab |
|---|---|---|
| `audit-kegagalan-senyap` | 186 → 187 | query tanpa cek `error` |
| `audit-tulis-tanpa-periksa` | 76 → 77 | update tanpa `.select()` |

Keduanya cacat nyata, bukan formalitas — yang pertama membuat gangguan basis
terbaca sebagai "belum ada data", yang kedua membuat "tersimpan" muncul untuk
perubahan yang tak pernah terjadi.

**Tiap rute baru wajib masuk daftar `TUGAS`** di
`otomasi-terjadwal.test.ts`. Penjaga di berkas itu mencocokkan daftarnya
dengan kode sumber, jadi rute yang lupa diuji memerahkan CI — ia sudah
menangkap 2.6 begitu rutenya lahir.

---

## 5. Katalog di UI — dan cacat yang ditemukannya

Founder, 2026-08-15: *"saya juga mau ada katalog otomasi nya di ui yaa seperti
project TJS, beserta semua penjelasan dan flow kerja otomasi tersebut"*.

| Bagian | Tempat |
|---|---|
| Sumber penjelasan | `apps/api/src/lib/katalog-otomasi.ts` |
| Rute penggabung | `GET /api/v1/otomasi/katalog` |
| Halaman katalog | `/otomasi/katalog` |
| Halaman ambang | `/pengaturan/otomasi` |
| Penjaga | `audit-katalog-otomasi-nyata.mjs` (ambang NOL) |

### 5a. Katalog ini tidak menyimpan status — sengaja

Pembagiannya tegas, dan itulah yang membedakannya dari
`06-agentic-ai-*.md` yang membusuk:

```
ditulis di berkas   → penjelasan, pemicu, langkah kerja, penempatan
diukur saat dibaca  → terpasang/tidak, aktif, kapan terakhir jalan
```

Yang bisa basi tidak ditulis. Yang ditulis tidak bisa basi.

Penjaganya mencocokkan entri dengan rute yang benar-benar terdaftar, **dua
arah** — rute tanpa penjelasan, DAN penjelasan tanpa rute. Arah kedua lebih
mudah terlewat dan sama merusaknya: katalog yang menjelaskan otomasi yang
sudah dihapus membuat orang menunggu pesan yang tak akan datang.

Penjaganya juga menolak penjelasan yang memakai istilah teknis
(`SELECT`, `webhook`, `query`). Bukan soal selera — pembacanya mandor.

### 5b. Ambang tak punya halaman pengaturan, dan tak ada yang merah

Ketahuan saat halaman Katalog hendak menautkan tombol "ubah" untuk lima
ambang. Tautannya tak punya tujuan: ambangnya tersimpan sejak migrasi 396,
sudah dibaca rute otomasi, dan **tak ada satu pun tempat di UI untuk
mengubahnya**.

CLAUDE.md §8 menyebut pola ini persis: *"Kolom DB sudah ada" bukan selesai.
Config-first berarti ada halaman pengaturannya di UI.* Migrasi 396 berhenti
setengah jalan tanpa satu pun penjaga menandainya.

Yang perlu diingat untuk berikutnya: **penjaga yang ada memeriksa apakah
kolomnya benar, bukan apakah kolomnya bisa disentuh manusia.**

### 5c. Dua utang lain yang ikut terlihat

Keduanya bukan dari pekerjaan ini, dan keduanya sudah ditutup:

| Utang | Akibatnya | Sejak |
|---|---|---|
| `ai-ingatan` ada di `menu_items` tetapi tak di `peta-menu.ts` | `/m/ai-ingatan` menampilkan "Menu tidak dikenal" | commit `247b4607` |
| `_dibuang` tak terpakai di `kartu-asisten.tsx` | ratchet `no-unused-vars` (ambang NOL) merah | sebelum sesi ini |

Yang pertama sempat terbaca sebagai kenaikan ratchet 124 → 125 akibat
pekerjaan hari ini. Bukan. Memeriksanya lebih dulu mencegah lantai dinaikkan
untuk menutupi utang orang lain.

---

## 6. Dua cacat yang ditemukan saat membangun 3.18

Keduanya sudah ada di `main` sebelum pekerjaan ini, dan keduanya tak punya
gejala sendiri.

### 6a. `pembuatDedup` tak memeriksa kegagalan baca — dipakai 12 otomasi

```
const { data } = await request.db!.from('notifications')...
                                   ^ tanpa `error`
```

Query yang gagal memulangkan `data: null`, dan `?? []` mengubahnya jadi himpunan
kosong — artinya **tak ada satu pun yang dianggap sudah terkirim**. Kedua belas
otomasi lalu mengirim ulang semuanya, tanpa satu pun galat. Dari luar ia
terlihat persis seperti hari dengan banyak temuan baru.

Kerusakan yang sama pernah terjadi lewat jalan lain (pemisah `NUL` di 2.10) dan
butuh penjaga tersendiri untuk ditemukan.

Sekarang **dilempar**, bukan dikembalikan kosong: otomasi yang mati lebih baik
daripada otomasi yang membanjiri semua orang dengan pesan kembar. Yang mati
ketahuan; yang membanjiri membuat orang mematikan notifikasinya.

### 6b. `Math.trunc` pada seluruh ambang

`jepit()` memotong SEMUA nilai. Itu benar selama seluruh ambang bilangan bulat
— dan memang begitu sampai ambang EVM lahir sebagai desimal.

`Math.trunc(0.75)` = **0**, lalu dijepit naik ke `min` = 0.1. Ambang 0.75 diam-
diam jadi 0.1, dan otomasinya praktis berhenti menegur siapa pun. Nol
notifikasi terlihat persis seperti "semua proyek sehat".

Ditemukan test, bukan pembacaan kode. Saya justru menulis komentar yang
menyatakan *"`ambilAmbang` tak membulatkan (diperiksa, bukan diasumsikan)"* —
dan pemeriksaan itu keliru.

### 6c. Catatan terpisah: 570 tenant sampah di basis dev

Diukur 2026-08-16: `companies` berisi **571 baris, 570 di antaranya sisa test**
(`[UJI-S8] Tenant Lain`, `uji-rute-…`). Test membuat tenant per-run dan tak
menghapusnya.

Akibat yang sudah terasa: tiap migrasi per-tenant menulis ratusan baris untuk
tenant hantu — migrasi 398 memasang 1.142 baris ambang dan 1.142 target
notifikasi. Belum berbahaya, tetapi tumbuh tiap run.

**DITANGANI 2026-08-16 — dan bukan dengan menghapusnya.** Lihat §10.

---

## 7. 5.7 + 9.2 — selesai, dan modul yang ternyata sudah ada

Roadmap menyebut Insurance & Surety "nol halaman, nol rute". Diukur ulang
2026-08-16, salah pada semuanya:

| Yang dicari | Yang ternyata ada |
|---|---|
| tabel | `polis_asuransi` |
| rute | `/api/v1/asuransi` (GET + POST) |
| layar | `/kontrak/asuransi` |
| perhitungan | `lib/register-asuransi.ts` — **fungsi murni**, sudah menghitung status kedaluwarsa DAN celah pertanggungan |

Yang hilang cuma pengirimnya. Satu rute (`polis-berakhir`) menjawab kedua
automation karena keduanya lahir dari satu panggilan
`hitungRegisterAsuransi()` — memisahkannya berarti dua rute yang membaca tabel
yang sama dan menghitung hal yang sama dua kali.

**Notifikasinya tetap dua jenis.** `polis_segera_berakhir` diperpanjang,
`proyek_tanpa_asuransi` diasuransikan — tindakan berbeda. Dan dedup harian
bekerja per (jenis, record): satu jenis untuk keduanya membuat proyek yang
sudah dikirimi peringatan polis tak lagi bisa dikirimi peringatan "tak punya
polis" di hari yang sama, padahal keduanya benar.

### 7a. Satu cacat yang lahir dari pekerjaan ini

Migrasi 398 + 399 menambah aturan notifikasi per perusahaan, dan tabelnya
melewati **1.736 baris** — di atas batas potong senyap PostgREST.
`GET /api/v1/notification-rules` lalu menampilkan 1.000 dari 1.736 aturan
sambil terlihat menampilkan semuanya.

Ditemukan `audit-baca-tak-terpotong`, bukan oleh siapa pun yang membuka
halamannya. Diperbaiki dengan paging (`.range`), bukan dengan menaikkan
`.limit()` — menaikkan limit memindahkan ambangnya, dan cacat yang sama kembali
diam-diam saat tabelnya tumbuh lagi.

Akar sesungguhnya tetap §6c: 570 tenant sampah. Paging tetap benar terlepas
dari itu.

### 7b. "Test flaky" yang bukan flaky

Test dedup 5.7 merah dengan selisih tepat 5, lalu hijau pada run berikutnya.
Dua tebakan berturut-turut salah:

| Tebakan | Kenapa salah |
|---|---|
| berkas berjalan paralel | `vitest.config.ts` menyetel `fileParallelism: false` |
| dedup gagal menahan | diukur langsung: 80 → 80, panggilan kedua nol notifikasi |

Penyebabnya: **suite penuh sedang berjalan di latar terhadap basis yang sama.**
Sesudah dihentikan, lima test lulus tiga run berturut-turut.

Pelajarannya bukan tentang dedup: angka yang berubah-ubah bukan bukti kode
goyah, dan "flaky" adalah kesimpulan yang harus diukur — bukan label yang
dipakai untuk berhenti mencari.

---

## 8. 5.11 — dan kenapa ia BUKAN "auto-log"

Katalog menamainya *Transmittal Auto-Log*, yang menyiratkan otomasi mencatat
transmittal sendiri. **Ditolak**, dengan alasan yang sama persis dengan 3.5
(draft MR otomatis):

Transmittal menyatakan dokumen **apa** dikirim ke **siapa** untuk **maksud
apa**. Tak satu pun bisa disimpulkan dari perubahan dokumen — otomasi hanya
tahu sebuah berkas berubah, bukan bahwa seseorang bermaksud mengirimkannya.
Dan catatan yang lahir sendiri menumpuk; yang menumpuk tak dibaca.

Yang dibangun bagian yang benar-benar hilang: **transmittal terkirim yang tak
pernah dikonfirmasi diterima.** Itulah kegagalan mahal pada kendali dokumen —
gambar revisi terakhir yang tak sampai tidak menimbulkan galat apa pun, dan
pekerjaan berjalan dengan gambar lama sampai selisihnya terlihat di lapangan.

Statusnya diukur dari `pg_constraint`, bukan ditebak:

```sql
status IN ('draft', 'dikirim', 'diterima', 'ditolak')
status <> 'diterima' OR diterima_pada IS NOT NULL
```

Baris kedua yang membuat `dikirim` + `diterima_pada IS NULL` tak ambigu: basis
sendiri menjamin `diterima` selalu punya tanggalnya.

### 8a. Kunci izin yang salah — untuk keempat kalinya

Tebakan saya `dokumen:kendali`. Tabel `permissions` tak punya **satu pun**
kunci ber-kata "dokumen"; yang benar `documents:manage`.

Dan arahnya terbalik dari kesalahan §7: di sana saya menebak nama berkas
bahasa Inggris untuk repo berbahasa Indonesia, di sini saya menebak kunci
bahasa Indonesia untuk kunci yang ternyata bahasa Inggris.

Pelajarannya bukan tentang bahasa melainkan tentang menebak. Cara mengukur
yang benar, dan yang seharusnya dipakai sejak awal:

```bash
grep -n "requirePermission(" apps/api/src/routes/v1/<berkas>.ts
```

Empat kali dalam dua sesi, dan tiap kali penjaga berbeda yang menahannya:
FK basis (2×), `audit-izin-benar-ada` (1×), dan FK lagi (1×). Tak satu pun
tertangkap oleh pembacaan kode.
### 8b. Mutasi yang LOLOS — dan lubang yang ia buka

Mutasi pertama pada 5.11 **tidak** memerahkan test: membuang
`.eq('status','dikirim')` dari rute, semua test tetap hijau.

Sebabnya ketiga kasus uji tersaring oleh hal LAIN, bukan oleh status:

| Kasus | Yang sebenarnya menyaringnya |
|---|---|
| `draft` | tak punya `dikirim_pada` → tersaring `.lt(dikirim_pada, …)` |
| `diterima` | punya `diterima_pada` → tersaring `.is(diterima_pada, null)` |

Jadi testnya lulus karena kebetulan, dan saringan status bisa dibuang tanpa
ada yang tahu.

Ditutup dengan kasus `ditolak` — satu-satunya status yang **punya**
`dikirim_pada` lama **dan** `diterima_pada` kosong, jadi ia lolos kedua
saringan lain. Hanya `.eq('status','dikirim')` yang menahannya.

Dan ia bukan kasus karangan: transmittal yang ditolak sudah selesai urusannya.
Menagih konfirmasi terima untuk dokumen yang ditolak adalah pesan yang tak bisa
ditindaklanjuti siapa pun.

> **Ini alasan mutasi wajib dijalankan.** Test itu terlihat menyeluruh — empat
> kasus, tiap kasus beda satu variabel. Membacanya ulang tak akan menunjukkan
> lubangnya; hanya menjalankan mutasinya yang bisa.

### 8c. Test yang bergantung pada urutan

Test prioritas 5.11 membaca notifikasi sisa test sebelumnya, dan merah begitu
test `ditolak` disisipkan di antaranya — `bersihkan()` di test baru itu
menghapus yang diandalkan.

Diperbaiki dengan membuat datanya sendiri, bukan dengan mengubah urutan. Test
yang bergantung pada urutan merah untuk alasan yang tak ada hubungannya dengan
apa yang diuji, dan yang memperbaikinya akan tergoda menambal urutannya.

Sekalian diperkuat: sekarang ia menuntut KEDUA maksud terwakili. Tanpa itu,
test lulus bahkan bila hanya `untuk_informasi` yang menghasilkan notifikasi —
dan perbandingan prioritasnya tak menguji apa pun.

---

## 9. "Menunggu deploy" ternyata tak pernah benar

Founder, 2026-08-16: *"emang harus banget deploy dulu? ga bisa coba diakalin
dulu?"*

Bisa. Dan pertanyaannya membongkar klaim yang saya tulis sendiri dua hari
berturut-turut tanpa pernah mengukurnya.

### 9a. Yang sesungguhnya menahan

```bash
grep -rn "SCHEDULER_URL" apps/api/src apps/api/scripts
# → SATU hasil, dan itu KALIMAT di dalam skrip laporan saya sendiri
```

Nol baris kode memakainya. Yang benar-benar ada:

| Bagian | Keadaan sebelum hari ini |
|---|---|
| `POST /api/v1/jadwal/jalankan` | ✅ ada, lengkap dengan klaim atomik |
| `SCHEDULER_SECRET` di `.env` | ✅ terisi |
| 8 otomasi terdaftar di `KATALOG` | ❌ **tidak** |
| baris `jadwal_tugas` untuk 8 itu | ❌ **tidak** |
| sesuatu yang memanggil denyutnya | ❌ **tidak ada sama sekali** |

Komentar di endpoint berbunyi *"Dipanggil cron."* Tak ada cron. Delapan belas
tugas terjadwal, lima belas nol eksekusi seumur hidup.

**Pelajarannya melampaui kasus ini: bukan hanya angka yang membusuk, ALASAN pun
membusuk.** "Menunggu deploy" terdengar seperti kesimpulan teknis. Ia tebakan,
dan ia menahan delapan otomasi selama dua hari tanpa satu pun gejala.

### 9b. Bukti ujung-ke-ujung, tanpa deploy

```
SEBELUM → notif: 0 | jumlah_jalan: 0 | status: belum pernah

  node scripts/penjadwal-lokal.mjs --sekali --paksa transmittal-menggantung
         ✓ transmittal-menggantung   (+ 7 otomasi lain, semuanya sukses)

SESUDAH → notif: 5 | jumlah_jalan: 1 | status: sukses | durasi: 702ms
  contoh: "Transmittal TR-2026-002 'Revisi 2 gambar pondasi — MOHON
           KONFIRMASI' ke Ir. Bambang S. (PT …)"

Denyut kedua → 18 dilewati (klaim atomik menahan pengulangan)
```

n8n **tetap** arah akhirnya untuk produksi. `scripts/penjadwal-lokal.mjs`
bukan penggantinya melainkan yang membuat jalurnya bisa diuji hari ini.

### 9c. Dua cacat yang terbuka karenanya

**1. Migrasi 401 bentuk pertama menjadwalkan untuk SELURUH perusahaan.**

571 perusahaan × 8 tugas = 4.794 baris. Diukur: **hanya 1 dari 571 punya
anggota**; 570 sisanya tenant sampah test (§6c). Denyut pertama:

```
diperiksa 1000 · sukses 0 · gagal 71 · dilewati 929
galat: "Anda bukan anggota perusahaan tersebut" (403)
```

2.018 baris berakhir `gagal`. Sepuluh tugas LAMA di tabel itu semuanya
ter-scope ke satu perusahaan — bentuk yang sudah ada di tabel adalah tempat
paling murah untuk memeriksanya, dan saya tak memeriksanya.

Diperbaiki dengan syarat "punya anggota", bukan "kode = puraloka-persada":
yang kedua memaku satu tenant dan membuat tenant sungguhan berikutnya
diam-diam tak terjadwal.

**2. Pembacaan penjadwal terpotong senyap di 1.000 baris.**

`diperiksa: 1000` dari 4.794 — `.select('*')` tanpa `.range()`. Selama tabel
berisi sepuluh baris ia benar; ia berhenti benar pada baris ke-1.001, dan cara
berhentinya sunyi: tugas ke-1.001 dan seterusnya tak pernah dijalankan
sementara respons tetap `ok: true`.

Penyebab angkanya sudah hilang (scope migrasi diperbaiki), tetapi
pemotongannya belum — dan ia akan kembali pada tenant ke-56 (56 × 18 > 1.000).
Diperbaiki dengan paging.

### 9d. Dan pelapornya sendiri berbohong

`scripts/penjadwal-lokal.mjs` versi pertama membaca `badan.dijalankan ??
badan.jalan` — dua nama field yang tak satu pun ada. Tiap denyut melaporkan
"tak ada tugas jatuh tempo", **termasuk denyut yang menjalankan tugas dan gagal
71 kali.**

Bentuk sesungguhnya diukur dari respons: `{ok, waktu, diperiksa, sukses, gagal,
dilewati, hasil[]}`.

Pelapor yang berbohong lebih buruk daripada tak ada pelapor — tanpa `curl`
mentah ke endpoint-nya, kedua cacat di §9c tak akan pernah terlihat.

---

## 10. Tenant hantu: yang benar bukan menghapusnya

Ditutup 2026-08-16 sesudah founder menjawab *"saya ikut yg terbaik"*.

### 10a. Menghapus DITOLAK basis — dan itu benar

```
Company "[UJI-S4] Tenant Lain" tidak boleh dihapus. Nonaktifkan
(is_active=false) atau jalankan prosedur off-boarding tenant. Penghapusan
tenant = kehilangan data lintas puluhan tabel dan tidak dapat di-rollback.
```

130 tabel ber-FK ke `companies`, 86 di antaranya CASCADE. Pengaman itu
disengaja dan tidak dilewati.

### 10b. Dan ternyata tak perlu — mereka SUDAH nonaktif

Diukur: ke-597 tenant sisa test semuanya `is_active = false`.

**Yang salah bukan keberadaan mereka melainkan migrasi yang tak menyaringnya.**
Empat migrasi (396, 398, 399, 400) memakai `FROM companies` tanpa syarat:

| Tabel | Baris untuk tenant NONAKTIF |
|---|---|
| `notification_rules` | 2.291 |
| `notification_rule_targets` | 4.582 |
| `company_settings` | 2.291 |
| **total** | **9.164** |

Sesudah migrasi 402 + penyaringan `is_active` di ketiganya:

```
notification_rules        1.736 → 27
company_settings otomasi.*  ...  → 9
jadwal_tugas              4.794 → 18
```

Migrasi 396/398/399/400 idempoten — menyalakan kembali sebuah tenant lalu
menjalankan ulang migrasinya memulihkannya utuh. Tak ada yang hilang.

### 10c. Dua penjaga baru

| Penjaga | Menjaga | Ambang |
|---|---|---|
| `audit-migrasi-pertenant-aktif` | migrasi per-tenant menyaring `is_active`/keanggotaan | ratchet 8 |
| `audit-test-bersihkan-company` | test yang membuat perusahaan wajib menghapusnya | ratchet 23 |

Yang pertama semula berambang NOL dan langsung merah pada delapan migrasi
lama. Kedelapannya sudah jalan, dan §5.5 melarang mengeditnya — jadi ambang
nol di sini bukan ketegasan melainkan **penjaga yang tak mungkin hijau**, dan
penjaga yang tak mungkin hijau akan dimatikan orang pertama yang CI-nya merah
karenanya.

Yang kedua: 23 dari 29 berkas test membuat perusahaan tanpa menghapusnya. Itu
sumber ke-597 baris, dan satu kali menjalankan suite penuh menambah ~27.

Keduanya terbukti merah lewat mutasi (migrasi ke-9 tanpa saringan; berkas test
ke-24), lalu pulih hijau.

---

## 11. Dua otomasi yang riset BATALKAN — dan kenapa itu hasil, bukan kegagalan

Riset paralel 2026-08-16 membatalkan dua rencana. Keduanya akan lulus test,
lulus penjaga, dan **mengirim nol notifikasi selamanya** — persis kegagalan
`stok-menipis` yang sudah tercatat: diam berbulan-bulan sambil melaporkan
sehat.

### 11a. 2.9 Budget vs Actual — sumber realisasinya kosong

| Yang dipakai `analisaProyek` | Baris |
|---|---|
| `project_expenses` (status `approved`) | **0** |
| `kasbons` (approved + settled) — TAK DILIHAT | **Rp 545 jt di 11 proyek** |

Satu proyek terukur 45% dari nilai kontraknya, dan otomasi akan melaporkannya
0%.

Ditambah dua hal yang membuat ambang persen apa pun tak tercapai: RAB sebagian
proyek **3,7× nilai kontrak** (Rp 3,63 M vs Rp 970 jt), dan `rap_budget` belum
pernah dikunci sehingga pagunya jatuh ke RAB — yang harga JUAL, bukan biaya.

**Menunggu keputusan founder** (`RATIFIKASI-2.9`): apakah `analisaProyek` ikut
menghitung kasbons? Itu mengubah angka di layar Portofolio Biaya juga.

### 11b. 3.6 Subcontractor Scoring — tak ada periode kedua untuk dibandingkan

Deteksi penurunan butuh ≥2 periode per pihak. Terukur:

```
evaluasi_subkon : 1 dari 4 pihak punya ≥2 periode
evaluasi_vendor : 0 dari 4 supplier punya ≥2 periode
```

Dan satu-satunya yang punya tren **naik** — PT Baja Perkasa dari mutu 60 ke 90.

Dua cacat struktural membuatnya lebih buruk daripada sekadar tipis:

* **Identitas subkon tidak stabil.** 3 dari 5 baris ber-`supplier_id NULL`,
  dikenali hanya lewat teks bebas `pihak_nama`. Mengelompokkan tren dengan
  string bebas berarti satu salah ketik = subjek baru.
* **`dinilai_oleh` NULL di seluruh baris**, jadi penerima notifikasinya pun
  harus ditebak.

> ⚠ Dan satu asumsi saya yang salah: `penilaian_kinerja` **bukan** untuk
> subkontraktor — FK-nya `pegawai_id`, itu penilaian PEGAWAI. Saya
> memasukkannya ke daftar kandidat 3.6 tanpa memeriksa FK-nya.

**Syarat masuk yang terukur untuk membukanya kembali:** ≥3 subkon punya ≥3
periode dengan `supplier_id NOT NULL`.

### 11bb. 6.3 Attendance Validation — datanya BEKU dan SERAGAM

Bukan kosong seperti 2.9, dan justru itu yang membuatnya lebih menipu.

```
absensi_harian  1.279 baris, 60 pekerja, rentang 2026-07-10 … 2026-08-08
current_date    2026-08-15  → berhenti 7 hari lalu
```

Sebaran "hari sejak absensi terakhir" per pekerja aktif:

| hari | pekerja |
|---|---|
| 7 | 49 |
| 8 | 11 |

**60 dari 60 (100%)** tak absen ≥7 hari. Otomasi "tak absen berhari-hari"
mengirim 60 notifikasi hari pertama dan bertambah tiap hari — yang dilaporkan
bukan pekerja mangkir melainkan *"basis dev berhenti diisi"*.

Ketiga dimensi yang diminta, satu per satu:

| Dimensi | Kenyataan terukur |
|---|---|
| jam kerja tak masuk akal | **mustahil** — tak ada jam masuk/keluar, hanya `porsi_hari`; CHECK sudah mengunci 0–1 dan lembur 0–16. Pelanggaran: **0**. Detektornya akan SELALU melapor sehat |
| absen tanpa penugasan | **85%** baris (1.088 dari 1.279) di luar rentang scope-nya — kebisingan seed |
| timesheet staf | 7 baris, 1 pegawai dari 5 |

> Yang paling patut dicatat: satu-satunya detektor yang SUNYI justru sunyi
> karena CHECK constraint sudah menutup jalannya. Otomasi yang tak mungkin
> berbunyi adalah otomasi yang memberi rasa aman palsu.

**Syarat masuk terukur:** absensi bergerak dalam 3 hari terakhir, dan <20%
pekerja aktif yang jaraknya melampaui ambang.

### 11c. Yang menggantikannya — dan datanya ADA hari ini

Riset yang sama menemukan pengganti yang lebih kuat, dengan bukti nyata:

| Temuan | Angka |
|---|---|
| SIUJK sudah mati **137 hari**, tetapi `terverifikasi = true` | 1 |
| SBU habis dalam 34 hari | 1 |
| `dokumen_kepatuhan` kedaluwarsa / habis ≤60 hari | 1 + 1 |
| Subkon `bolehDipakai = false` (daftar hitam / kecelakaan) | 2 dari 5 |

Dan logikanya **sudah ada dan teruji**: `nilaiPrakualifikasi()` memulangkan
`peringatan: 'dokumen_kedaluwarsa' | 'dokumen_segera_habis'` dan
`bolehDiundang`; `nilaiKepatuhan()` + `AMBANG_SEGERA_HABIS = 60`;
`nilaiEvaluasiSubkon()` + `BOBOT_SUBKON` + `AMBANG_LEMAH_SUBKON = 60`.

Yang hilang bukan kode melainkan penjadwalnya.

> **Pelajaran yang berlaku melampaui dua kasus ini:** riset yang membatalkan
> rencana lebih berharga daripada riset yang membenarkannya. Dua otomasi yang
> tak dibangun hari ini adalah dua otomasi yang tak perlu dicabut enam bulan
> lagi sesudah tak seorang pun mempercayainya.

---

## 12. 9.1 — satu-satunya dari empat kandidat yang layak

Empat kandidat diriset paralel 2026-08-16. **Tiga dibatalkan** (§11), satu
dibangun.

### 12a. Lingkupnya sengaja dipersempit — dua tabel dikeluarkan

Enam tabel di repo ini punya `berlaku_sampai`. Hanya dua yang masuk:

| Tabel | Putusan | Alasan terukur |
|---|---|---|
| `dokumen_kepatuhan` | ✅ masuk | 9 baris — 1 lewat, 1 ≤60 hari, 1 belum verifikasi |
| `izin_proyek` | ✅ masuk | 5 baris — 1 lewat 283 hari ber-`menghalangi_mulai` |
| `izin_kerja` | ❌ keluar | **4 dari 4** sudah kedaluwarsa — data seed, bukan sinyal |
| `dokumen_prakualifikasi` | ❌ keluar | **7 dari 11** tanpa tanggal berlaku |
| `sertifikat_pegawai` | ❌ keluar | sudah dipegang 6.9 |
| `polis_asuransi` | ❌ keluar | sudah dipegang 5.7/9.2 |

Dua yang pertama akan mengirim peringatan usang; dua terakhir akan mengirim
pesan kedua untuk kejadian yang sama.

### 12b. Sinyal terkuatnya: `hijauTapiMati`

Dokumen yang masih bercentang **terverifikasi** padahal tanggalnya sudah lewat.
Terukur ada satu nyata:

```
Asuransi CAR milik PT Baja Perkasa sudah kedaluwarsa 106 hari lalu.
Dokumen ini masih bercentang terverifikasi — itu sebabnya tak ada yang
menyadarinya.
```

Orang yang melihat centang hijau berhenti memeriksanya. Itu yang membuat
keadaan ini lebih berbahaya daripada dokumen yang jelas-jelas merah — dan
pustakanya sudah menghitungnya; otomasi tinggal membawanya ke permukaan.

### 12c. Batas bawah yang terbukti perlu

Izin yang lewat **283 hari** benar-benar dilewati (ambang 120), sementara PBG
yang habis 46 hari lagi tertangkap. Tanpa batas itu, izin yang jelas
ditinggalkan akan ditagih tiap minggu selamanya.

---

## 13. KOREKSI — ketiga yang saya batalkan ternyata bisa dibangun

Founder, 2026-08-16: *"kenapa dibatalin? emang gabisa banget dibangun?"*

Pertanyaan itu benar, dan §11 di atas **terlalu absolut**. Ketiganya dibangun
hari itu juga. Yang saya temukan bukan kemustahilan teknis melainkan data dev
yang tak mewakili — dan untuk satu di antaranya, alasannya salah sama sekali.

### 13a. 2.9 — alasan pembatalannya SALAH

Saya menulis: `project_expenses` nol baris sementara Rp 545 juta ada di
`kasbons`, jadi otomasi melaporkan 0% untuk proyek yang 45%.

Diukur ulang:

```
trg_kasbon_approved_create_expense
  AFTER UPDATE ... IF NEW.status='approved' AND OLD.status<>'approved'
  → INSERT INTO project_expenses
```

**Kasbon yang disetujui MEMANG membuat baris pengeluaran.** Tabelnya kosong
karena data seed disisipkan LANGSUNG berstatus `approved`, sehingga trigger
`AFTER UPDATE` tak pernah menyala. Artefak seed, bukan cacat rancangan.

Dibuktikan di test: sisipkan satu pengeluaran nyata → otomasi berbunyi dengan
serapan 95%. Diam karena tak ada belanja ≠ diam karena rusak, dan satu-satunya
cara membedakannya adalah mencobanya.

> **Pelajaran:** "tabel sumbernya kosong" bukan alasan yang cukup. Yang harus
> ditanyakan adalah KENAPA kosong.

### 13b. 6.3 — separuh benar, dan separuh yang salah itu yang berguna

Sebagai tuduhan kepada PEKERJA memang tak berguna: 60 dari 60 berjarak ≥7 hari
karena seed beku.

Tetapi sebagai peringatan operasional per **LINGKUP KERJA** ia tepat, dan
terbukti: 17 lingkup, pesan yang bisa langsung ditindaklanjuti —

```
Proyek "Pembangunan Rumah Bu Sari — Dago", lingkup "Struktur Lantai 1":
absensi terakhir 7 hari lalu (2026-08-08). Tanyakan ke mandornya —
tanpa absensi, upah tak bisa dihitung.
```

Dua dimensi lain memang tak bisa, dan itu tetap berlaku: "jam kerja tak masuk
akal" mustahil (tak ada jam masuk/keluar, CHECK sudah mengunci), "absen tanpa
penugasan" 85% baris.

### 13c. 3.6 — alasannya bertahan, bentuknya yang diganti

Tren tetap tak bisa: identitas pihak lewat teks bebas takkan sembuh sendiri.

Tetapi `bolehDipakai` adalah keadaan SATU baris — tak butuh periode kedua, tak
butuh identitas stabil. Terukur 2 dari 5 memenuhi, dan otomasinya berbunyi:

```
CV Karya Mandiri tak boleh dipakai berdasar evaluasi 2026-07-18:
1 kecelakaan kerja.
```

Dan ia **lebih mendesak** daripada tren: subkon yang tak boleh dipakai tetapi
masih diundang adalah risiko yang berjalan hari ini.

### 13d. Satu cacat yang HANYA ketahuan saat dijalankan

`work_scopes` kategori C lewat **`assignment_id`**, bukan `project_id`. Bentuk
pertama 6.3 menulis `viaProject('work_scopes', pid)` — mengoper id PROYEK ke
tempat yang menunggu id PENUGASAN.

Hasilnya nol baris, rute balas 200, nol notifikasi, **tanpa satu pun galat**.
Terukur 17 lingkup memenuhi syarat; otomasinya mengirim nol.

Typecheck tak bisa menangkapnya — keduanya `string`. Hanya menjalankannya
sungguhan yang bisa.

Rantai sesungguhnya tiga lapis:

```
absensi_harian.scope_id → work_scopes.assignment_id
                        → mandor_assignments.project_id
```

### 13e. Dan satu mutasi yang LOLOS

Assertion `pihak_dinilai <= jumlah baris` terlalu longgar: mengubah kunci
pengelompokan supaya tiap baris jadi kelompoknya sendiri tetap lolos (5 ≤ 5).
Diperkuat jadi kesamaan dengan jumlah pihak berbeda yang dihitung terpisah.

Kedua kalinya dalam sesi ini mutasi menemukan test yang terlihat menyeluruh
tetapi lulus karena kebetulan.

