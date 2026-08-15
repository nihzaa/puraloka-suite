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
* Yang **belum di-deploy** (`SCHEDULER_URL` kosong) berarti bagian n8n-nya
  menunggu — bukan berarti bagian sistemnya belum ada.

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
| Transmittal | 5.11 Transmittal Auto-Log | ⚠ **tabel + rute SUDAH ADA** — `transmittal`, `transmittal_item`, `/api/v1/kendali-dokumen/transmittal` |
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

**Tidak dibersihkan tanpa konfirmasi** (CHARTER §8a.5: menghapus data yang sudah
ada butuh persetujuan, "dummy" bukan izin merusak). Yang perlu diputuskan:
apakah harness test membersihkan tenant buatannya di `afterAll`, dan apakah
570 baris yang ada sekarang dihapus.

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

