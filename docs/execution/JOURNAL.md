# JOURNAL — Catatan Sesi

Satu blok per sesi. **Ditambahkan, tidak pernah ditulis ulang.**
Entri terbaru di ATAS.

---

## 2026-08-06 (lanjutan) — Transfer stok, dan cacat yang saya buat sendiri kemarin

### Transfer stok antar proyek selesai (PEMBEDA 2/12)

`stock_movements` punya SATU `project_id`. Material yang pindah dari proyek A
ke B hanya bisa dicatat sebagai dua baris yang tak saling mengenal — tak ada
yang menjamin sisi lawannya ada, apalagi sama besar.

Selesai: migrasi 193 (`stock_transfers`, RLS RESTRICTIVE dua sisi), endpoint
POST/GET, halaman `/gudang/transfer`, uji invarian 11 hijau.

`transfer_in`/`transfer_out` ternyata **sudah ada** di CHECK `movement_type`
sejak awal — nol baris, tak pernah dipakai. Kosakatanya sudah ada; yang belum
ada kepalanya.

### Cacat yang saya BUAT SENDIRI kemarin, dan baru terlihat hari ini

Rekonsiliasi material (commit `3d5a38b`) menghitung susut dari
`dibeli − dipakai − sisa`. Transfer tak masuk hitungan, jadi material yang
PINDAH terbaca sebagai **hilang**.

Dibuktikan dengan angka, bukan dikira-kira — memindahkan 10 batang besi:

```
sebelum transfer : selisih  0  susut 0,0%  wajar
sesudah transfer : selisih 10  susut 5,0%  ← satu batang lagi = "Susut tinggi"
sesudah diperbaiki: selisih 0  susut 0,0%  pindah 10 "ke proyek lain"
```

Ini kesalahan paling mahal yang bisa dibuat layar itu: **menuduh mandor atas
barang yang ia kirim ke proyek sebelah atas perintah kantor.** Fiturnya sudah
"selesai" kemarin, ber-test, ber-mutasi, nol pelanggaran a11y — dan tetap
salah, karena yang belum ada bukan kodenya melainkan konsep "material bisa
pindah".

Perbaikannya di lapis perhitungan (`selisih` ikut mengurangi
`transfer_keluar`), + 6 test, + 4 mutasi seluruhnya tertangkap — termasuk
mutasi `Math.abs` pada transfer, yang akan membuat proyek bocor bisa
menyembunyikan susutnya cukup dengan MEMINTA kiriman dari proyek sebelah.

Kolom **Pindah** ditulis terpisah di tabel, bukan diam-diam dikurangkan:
pembaca yang menjumlah sendiri harus mendapat angka yang sama.

### Tracking Waste DITUNDA — diukur dulu, bukan dibangun dulu

Rencananya melengkapi rekonsiliasi dengan "rencana susut vs susut nyata".
Diukur lebih dulu:

```
assemblies                            3.043 baris
  waste_factor > 0                        1 baris   ← 1 dari 3.043
tabel ber-assembly_id DAN material_id  (tak ada)    ← tak ada jalur
```

Layar "rencana vs nyata" di atas kolom yang kosong pada 3.042 dari 3.043 baris
akan tampak berwibawa dan tak mengatakan apa-apa. Alasan + pemicunya dicatat
di `F5-1-TRIASE-SUBMENU.md`.

### Tiga penjaga menangkap saya hari ini

| Penjaga | Yang ditangkap |
|---|---|
| `gen-tenant-map check` | tabel baru lahir tanpa kategori tenancy |
| ratchet T4f | 9 akses `supabase` mentah baru (366 → 375) |
| `lint:ratchet` | `setState` sinkron di badan efek |

Ratchet T4f saya perbaiki dengan **memindahkan penulisan ke wrapper
sadar-tenant**, bukan menaikkan ambang — dan satu query yang memang tak bisa
(`viaProject` menyaring satu kolom, daftar transfer butuh dua) memakai
`unsafe()` dengan alasan tertulis di tempat kejadian.

### Saya salah — dan penjaganya yang benar

Saya sempat menulis `requirePermission('procurement:stock:manage')`. Permission
itu **tidak ada**. Gerbang gagal-tertutup akan menolak SEMUA orang, dan
endpoint yang sudah jadi tak bisa dipakai siapa pun tanpa satu pun pesan.
Ketahuan karena saya periksa ke tabel `permissions` sebelum lanjut, bukan
karena ada yang gagal.

Saya juga sempat memakai `s.material_id` untuk hasil `/procurement/stocks` —
endpoint itu tak mengembalikan kolom tersebut. Daftar material akan tetap
tampil, tapi tak satu pun bisa dipilih.

Keduanya jenis yang sama: **menebak bentuk sesuatu yang bisa dibaca.**

### Peta tenancy: tiga tabel berpindah `lewat` tanpa saya sentuh

`expense_items`, `journal_entry_lines`, `punch_item_photos` berganti kolom
`lewat` saat di-regenerate. Diperiksa: ketiganya punya DUA jalur FK yang
sama-sama NOT NULL, jadi generator memang punya dua pilihan sah tanpa pemecah
seri yang stabil. Nol kode memakai `viaProject` pada ketiganya, jadi tak ada
perilaku yang berubah. Dicatat di sini supaya diff-nya tak dikira kelalaian.

---

## 2026-08-06 — Halaman jadi yang tak bisa dibuka siapa pun, dan "Wajar" sebagai jawaban bawaan

### Rekonsiliasi material selesai (F5 PEMBEDA — pembeda terlemah, 1,5/5)

`PETA-PRIORITAS-ERP.md` menyebutnya "titik kebocoran terbesar kontraktor".
Keempat angkanya sudah tersimpan di basis bertahun-tahun dan **tak pernah
sekali pun diadu**: kebutuhan RAB, penerimaan barang, pemakaian lapangan,
sisa gudang.

Selesai: fungsi murni + 22 test, endpoint read-only bergerbang tenancy,
halaman `/gudang/rekonsiliasi`. Suite penuh **159 berkas, 1619 lulus, 2
dilewati**; a11y **41 halaman, nol pelanggaran, kedua mode**; 11 penjaga
hijau.

### Cacat kelas baru: halaman selesai yang diarahkan diam-diam ke home

Halaman rekonsiliasi selesai — endpoint jalan, tenancy terjaga, typecheck
hijau, menu terarah. Dibuka di browser: yang muncul `/dashboard`.

`middleware.ts` menyaring per-prefiks lewat daftar tulis-tangan, dan
`/gudang` tak pernah ditambahkan. **Tak ada 404, tak ada pesan, tak ada
log.** Membuat halaman baru menuntut menyentuh dua berkas berjauhan, dan
yang kedua tak punya satu pun sinyal kalau terlewat.

Diukur: 24 direktori rute, 23 sudah terdaftar — hanya `/gudang` yang
tertinggal. Bukan kelalaian besar, tapi **tak ada apa pun yang mencegahnya**.
Penjaga baru `uji-izin-rute-lengkap.mjs` (3 mutasi disuntik, 3 tertangkap)
menukar "harus ingat" dengan "tak bisa lupa".

### "Wajar" sebagai nilai bawaan — arah gagal yang salah

Pada data sungguhan: Batu Split direncanakan 200 m3, tak pernah dibeli
sebutir pun, dan laporan menyebutnya **"Wajar"**. Begitu pula material yang
nol di keempat sumber.

Sebabnya `wajar` adalah nilai awal yang dipakai kalau tak ada satu cabang pun
cocok. Pada laporan yang gunanya **memunculkan masalah**, gagal ke arah
"beres" berarti setiap keadaan yang tak dikenali kode tampil sebagai
sudah-diperiksa. Ditambah status `belum_dibeli` (label UI "Belum ada
transaksi" — sebab ia menampung dua keadaan, dan label yang menyebut RAB
akan berbohong untuk separuhnya).

### Kartu ringkasan yang menjumlahkan satuan tak sebanding

Versi pertama memajang "Total dibeli 437" — hasil menjumlahkan m3, batang,
sak, dan buah jadi satu angka. Angkanya berubah kalau semen dijual per ton,
tanpa ada yang berubah di lapangan. Diganti jadi **cacahan material per
keadaan**; kuantitas tetap ada di tabel, di samping satuannya.

Selisih negatif juga berhenti diwarnai merah: "-92" merah terbaca sebagai
"92 hilang", persis salah-baca yang kolom status berusaha cegah.

### Saya salah — dua kali

**Satu.** Saya jalankan audit a11y "mode gelap" lewat `colorScheme: 'dark'`
Playwright dan melaporkan nol pelanggaran. Aplikasi ini memakai kelas
`.dark` (next-themes), **bukan** `prefers-color-scheme` — jadi yang dipindai
adalah halaman terang. Ketahuan hanya karena potret "gelap"-nya identik
dengan yang terang. Penjaga resmi `audit-a11y-runtime.mjs` sejak awal sudah
benar (ia menyetel `localStorage.theme`); yang cacat skrip sekali-pakai saya.
**Angka dari alat yang saya rakit sendiri di tempat bukan bukti** — itulah
gunanya penjaga yang sudah ada.

**Dua.** Uji urutan `belum_dibeli` saya tulis dengan pembanding
`susut_tinggi`. Mutasi "naikkan `belum_dibeli` ke peringkat 0" **lolos** —
keduanya jadi seri, dan pemecah seri kebetulan mempertahankan urutan yang
sama. Testnya menegaskan hal yang benar tapi tak bisa membedakan dua
peringkat. Diganti pembanding `lebih_beli`; mutasi langsung tertangkap.

Dua mutasi lain yang lolos **diperiksa, bukan ditambal**: keduanya mutan
setara (membuangnya tak mengubah keluaran apa pun), dan alasannya ditulis di
kode supaya tak diperdebatkan ulang.

---

## 2026-08-04 — INTI #2–#4, dan CI yang membuat saya hampir salah diagnosis

### Tiga INTI selesai

| # | Isi | Celah yang ditutup |
|---|---|---|
| **#2** IPC | gerbang progres termin | `trigger_pct` tersimpan bertahun **tanpa pernah dibaca** — termin syarat 40% bisa ditagih di progres 0% |
| **#3** Retensi | potongan jaminan mandor | retensi rapi di sisi klien, **nol** di sisi mandor: `net_payment = gross_payment` |
| **#4** Klaim | biaya tambahan tanpa ubah lingkup | pilar ketiga rantai kontrak; memaksakannya ke `change_orders` membuat `baseline_contract_value` berbohong |

Semuanya: fungsi murni + endpoint + mutation test. **13 mutasi disuntikkan
seluruhnya, 13 tertangkap.**

### Yang paling berharga bukan fiturnya

**Alat mutasi saya berbohong, dan saya hampir mempercayainya.**

Mutasi pertama di INTI #3 "lolos". Kesimpulan cepatnya: test-nya lemah. Yang
benar: **mutasinya tak pernah tersuntik** — berkasnya CRLF, string pencarian
saya LF. Diulang dengan regex sadar-CRLF: langsung merah.

> Mutation test yang tak memverifikasi suntikannya sendiri adalah teater.

Sejak itu tiap suntikan saya cetak `tersuntik: true/false` lebih dulu.

### CI: empat PR terbuka, semuanya merah, dan penyebabnya bukan kodenya

Hampir saja saya mendiagnosis empat PR satu per satu. Yang menyelamatkan: F5-1
ikut merah — padahal ia **hijau dua jam sebelumnya dengan commit yang sama
persis**.

| Waktu | Branch | Hasil |
|---|---|---|
| 11:00 | `f5-1` | **HIJAU** (sendirian) |
| 12:03 | `f5-1` lagi | **MERAH** ← commit identik |

Test yang merah pun bukan milik saya: `role-guard`, `ppn-dpp-guardrail`,
`modules` — semuanya jauh lebih tua dari PR-PR ini.

**Akarnya: sebuah klaim yang tak akurat di komentar kode.**

Header `rls-harness.ts` berbunyi *"read-safe, tidak pernah mengubah data
public"*. Benar untuk `asUser()` (selalu ROLLBACK). **Salah sebagai
kesimpulan**: `createRlsClient()` mengembalikan client mentah, dan **42 berkas
test menulis lewatnya di luar transaksi**.

Klaim itu bukan sekadar salah tulis — **ia dipakai sebagai dasar** mengubah
`concurrency.group` CI jadi per-ref. Empat PR sekaligus = 24 job menulis ke
`public` yang sama.

Diperbaiki dua-duanya: serialisasi dikembalikan (PR #141), dan header yang
menyesatkan itu ditulis ulang beserta riwayat biayanya.

### Utang R-009: yang diasumsikan mahal ternyata murah

Catatan Fase 0 menolak "Postgres lokal per shard" karena *"butuh shim
`auth.*`"* — diterima bertahun **tanpa pernah diukur**. Saya ukur:

```
auth.role()   60x — HANYA dibanding 'authenticated' & 'service_role'
auth.uid()    13x
auth.users    NOL query — hanya disebut di komentar
```

**Dua fungsi.** Shim ditulis, diuji terhadap Postgres nyata, dan **dua cacat
ketahuan justru karena diuji**:

1. `''::json` melempar galat — `NULLIF(...,'')` harus dulu.
2. `current_setting('role')` mengembalikan **`'none'`**, bukan NULL. Tanpa
   ditangani, `auth.role() = 'authenticated'` putus dan **seluruh policy
   menolak** — tabel terlihat kosong **tanpa satu pun galat**.

Yang kedua persis kelas cacat paling berbahaya di repo ini: gagal senyap.

**Tapi saya berhenti membangunnya.** Shim murah; **datanya** yang mahal — 32
berkas test bergantung pada user seed nyata. Menurut disiplin TUNDA yang
diratifikasi sendiri (R-010), ini belum punya pemicu. Pemicunya ditulis supaya
tak perlu ditebak lagi: **antrean CI melewati 30 menit, atau dua orang
mengerjakan repo bersamaan.**

Shim disimpan sebagai `auth-shim.sql` — saat pemicunya tiba, mulai dari yang
teruji, bukan dari nol.

### Penjaga yang menangkap saya sesi ini

| Penjaga | Yang ditangkap |
|---|---|
| gerbang tenancy | 3× — `work_scopes` & `contract_claims` kategori C di-query langsung, di endpoint yang **memutuskan uang** |
| `audit-kegagalan-senyap` | 2× — dan sekali ikut membongkar **cacat lama**: mandor melihat ringkasan pendapatan kosong karena query gagal menyamar jadi "nol scope" |
| `lint:ratchet` | 2× — `no-explicit-any`, diperbaiki dengan tipe eksplisit |
| `audit-docs-vs-roadmap` | 1× — dokumen triase baru tak tersambung ROADMAP |

Nol ambang dinaikkan untuk melewatinya. Satu-satunya kenaikan (R-011) diajukan
ke founder lebih dulu, disetujui, dan langsung **dikunci tripwire**.

---

## 2026-08-04 — F5-1: triase sub-menu, dan saya mengulangi kesalahan yang saya kutip

### Saya salah

Versi pertama dokumen triase menghitung **64 sub-menu merah**. Angka yang benar
**54**.

Skrip hitung saya memakai `baris.includes('🔴')` — mencari tanda merah **di mana
pun di baris**, termasuk kolom *Catatan*. Taksonomi sendiri memperingatkan ini
di badan dokumennya:

> *"Dihitung dari kolom Status, bukan dari semua tanda yang muncul di baris —
> banyak baris memuat tanda tambahan di kolom Catatan sebagai keterangan
> ('Foto ✅, geotag 🔴'), dan ikut menghitungnya menggelembungkan angka ±12%."*

**Saya menyalin peringatan itu ke dokumen saya, lalu melanggarnya di skrip yang
saya tulis tepat di bawahnya.** Selisihnya 19%, bukan 12%.

Yang tertangkap hanya karena saya menjumlahkan ulang: 9 + 12 + 26 = 47, tapi
64 − 12 − 3 − 2 = 47 sementara detektor melaporkan 63. Dua angka tak cocok, dan
memeriksa selisihnya membuka sembilan baris 🟡 yang salah dihitung.

Kenapa ini penting, bukan sekadar salah ketik: sembilan baris itu berstatus
**🟡 sebagian sudah hidup**. `Laporan keuangan` — item **paling penting** di
seluruh daftar — punya arus kas yang sudah jalan; hanya neraca & L/R yang
merah. Menghitungnya "belum dimulai" membuat bobotnya XL padahal L, dan itu
persis jenis kesalahan yang membuat urutan kerja salah.

### Yang dibangun

`docs/execution/F5-1-TRIASE-SUBMENU.md` — 54 sub-menu, tiap satu punya
golongan, alasan, prasyarat data, dan bobot.

| Golongan | Jml | Definisinya |
|---|---|---|
| **INTI** | 7 (+2 penyempurnaan 🟡) | Calon pelanggan **pergi** kalau demo berhenti di sini |
| **PEMBEDA** | 11 (+1 penyempurnaan 🟡) | Menaikkan salah satu Lima Pembeda ERP kontraktor |
| **TUNDA** | 25 | Berguna, tapi **tak ada yang menunggunya**; tiap satu punya pemicu tertulis |
| **JANGAN DIBANGUN** | 11 | Keputusan 2026-08-01, tak dibuka ulang |

**54 — nol hilang, nol ganda.**

### Kenapa dokumen ini tetap perlu padahal triase 2026-08-01 sudah ada

Keduanya menjawab pertanyaan **berbeda**:

| Dokumen | Menjawab |
|---|---|
| Taksonomi §KEPUTUSAN (2026-08-01) | *Apakah ini layak dibangun sama sekali?* |
| F5-1 | *Dari yang layak, mana yang harus habis **lebih dulu**?* |

Risiko C-7 bukan salah memilih fitur. Ia adalah **mengerjakan fitur yang benar
dalam urutan yang salah sampai kehabisan tenaga sebelum produknya bisa dijual**.

### Penjaganya, dan bukti ia bisa merah

`apps/api/scripts/audit-triase-submenu.mjs` — tiap sub-menu 🔴 di taksonomi
wajib muncul **tepat satu kali** di salah satu golongan.

| Mutasi | Hasil |
|---|---|
| Satu item dihapus dari TUNDA | ❌ exit 1 — "Nota kredit BELUM ditriase" |
| Satu item ditaruh di dua golongan | ❌ exit 1 — "PEMBEDA + TUNDA, urutannya ambigu" |
| Dipulihkan | ✅ exit 0 |

Penjaganya memeriksa **sel Status**, dan header skripnya memuat peringatan
tentang kesalahan `includes()` di atas — supaya orang berikutnya (termasuk saya)
tak mengulanginya.

### Tiga status taksonomi ternyata basi — dikoreksi, bukan didiamkan

Kenyataan menang atas dokumen (CLAUDE.md §0):

| Item | Sebelum | Sesudah | Bukti |
|---|---|---|---|
| Backup & restore | 🔴 | ✅ | RTO terukur **61 detik**, 124/124 tabel, 377/377 policy |
| Mode offline | 🔴 | 🟡 | F4-3 — antrean 6 jalur, mutation-test 6/6 |
| Multi-tenant | 🔴 | 🟡 | 45/123 tabel ber-`company_id`, RLS 123/123, 5 kebocoran ditutup |

### Saya salah untuk kedua kalinya di sesi yang sama

Setelah triase selesai saya melaporkan tiga hal "menunggu founder". Founder
bertanya *"apa yang harus saya lakukan sebelum lanjut?"* — dan memeriksanya
membuktikan **dua dari tiga itu tidak menunggu apa-apa**.

**INTI #1 saya nyatakan terblokir R-001. Salah.** `RATIFIKASI.md` mencatat
R-001 **SELESAI** — 047 dipensiunkan jadi no-op, penegas bentuk `175`
terpasang dan terbukti bekerja di lingkungan bersih. Saya menulis "terblokir"
dari ingatan tentang cacat itu, tanpa membuka status penyelesaiannya.

Diukur, bukan dibaca:

| Yang diperiksa | Hasil |
|---|---|
| `accounts` · `journal_entries` · `journal_entry_lines` | **ketiganya punya `company_id`** — bentuk 167 yang menang, bukan 047 |
| `apps/api/src/routes/v1/gl.ts` | **7 endpoint hidup** — bagan akun · jurnal · posting · void · buku besar · neraca saldo |
| `app/(dashboard)/akuntansi/page.tsx` | halaman hidup: Bagan Akun · Jurnal · **Neraca Saldo** dengan pemeriksaan seimbang |

Yang benar-benar belum ada hanya **neraca** dan **laba/rugi** — dua laporan
turunan di atas fondasi yang sudah sehat dan sudah dipakai. Bobot INTI #1 turun
**L → M**, dan **tak ada satu pun INTI yang terblokir**.

Kesalahan ini lebih mahal daripada salah hitung 64-vs-54 di atas: yang itu
menggeser bobot satu item, yang ini membuat item **paling penting** tampak tak
bisa disentuh sama sekali — dan founder hampir mengejar tiket yang tak perlu.

**Butir ketiga juga meleset**: saya menulis "judul QUEUE menyebut 93,
kenyataannya 64" — padahal 64 itu sendiri angka yang salah. Yang benar 54.

### Yang menunggu founder — hanya satu

**Definisi INTI/PEMBEDA/TUNDA belum diratifikasi.** CHARTER menyebut ketiganya
tanpa mendefinisikan; §1 dokumen triase adalah usulan saya. Kalau ditolak, isi
ketiga daftar berubah.

R-006 (`pg_dump` rusak oleh fungsi yatim) tetap butuh tiket Supabase, tapi ia
**tidak memblokir apa pun** — cadangan darurat berbasis `COPY` sudah jalan
harian dan latihan pemulihannya hijau dengan RTO 61 detik.

---

## 2026-08-04 — F4-3: jalur lapangan berhenti kehilangan pekerjaan mandor

### Masalah yang sebenarnya

Enam jalur tulis di portal mandor memanggil `api.post` langsung. Bila sinyal
putus — **norma di lokasi proyek, bukan pengecualian** — mandor melihat pesan
galat dan pekerjaannya HILANG. Laporan upah 30 tukang diketik ulang dari nol.

Yang lebih merugikan lagi: ia mencoba berkali-kali, dan saat sinyal akhirnya
kembali, **kasbon terbayar dua kali**.

### Yang dibangun

| Berkas | Peran |
|---|---|
| `lib/antrean-offline.ts` | antrean localStorage + sinkron berurutan |
| `lib/kirim-lapangan.ts` | menerjemahkan 4 hasil → 2 keputusan halaman |
| `components/StatusAntrean.tsx` | pemicu sinkron + status yang terlihat mandor |

Terpasang di **enam** jalur: progress · kasbon · kasbon-tukang · laporan-upah ·
penagihan · tukang.

### Empat jaminan — semuanya dibuktikan bisa gagal

Mutation test: **6 mutasi disuntikkan, 6 tertangkap.**

| Mutasi | Tertangkap oleh |
|---|---|
| Idempotency-Key lahir baru tiap kirim | "kasbon terbayar dua kali" |
| `sinkronkan` abaikan kunci company | "data masuk perusahaan yang salah" |
| `penuh` dilaporkan aman | "isian mandor HILANG tanpa tersimpan" |
| `diantre` dilaporkan terkirim | "mandor mengirim ulang, jadinya DOBEL" |
| respons server dibuang | "foto tak bisa dilampirkan, id hilang" |
| `diantre` ikut membawa id | "foto dilampirkan ke id yang tak pernah dibuat" |

### Tiga kesalahan saya sendiri, dan yang menangkapnya

**1. Mock bocor ke tiga test berikutnya.** Saya mengganti `mockImplementation`
di tengah berkas untuk satu skenario. Tiga test sesudahnya gagal dengan
`Cannot read properties of undefined` — galat yang sama sekali tak
berhubungan dengan sebabnya. Diganti antrean status per-panggilan.

**2. `set-state-in-effect` 70 > ambang 69 — `lint:ratchet` menolak saya.**
`StatusAntrean` versi pertama memakai `useState` + `useEffect` untuk membaca
antrean. Penjaganya benar: pola itu merender dua kali tiap perubahan. Diganti
`useSyncExternalStore` — hook yang memang dirancang untuk sumber data di luar
React. **Ambangnya tidak saya naikkan.** Percobaan sinkron awal juga ditunda
satu tick, dan itu ternyata lebih benar perilakunya: render pertama tak perlu
tertahan menunggu jaringan yang mungkin memang mati.

**3. Saya hampir melewatkan halaman progress** — padahal ia disebut PERTAMA di
judul F4-3. Saya sudah menyambungkan lima halaman dan nyaris menutup item ini
saat memeriksa ulang kriteria dan menemukan kata "foto". `progress/page.tsx`
punya bentuk berbeda (upload storage lalu buat log), jadi ia tak muncul di
pencarian `api.post` yang saya pakai untuk menemukan jalur lain.

### Yang sengaja TIDAK dikerjakan — dinyatakan, bukan disembunyikan

**Foto tidak ikut diantre.** Halaman progress sudah punya jalur coba-ulang
sendiri untuk foto yang gagal, dan kegagalan foto memang tak membatalkan
laporan. Yang bocor selama ini adalah teks laporannya — itu yang ditutup.
Mengantrekan berkas butuh IndexedDB; batasnya ditulis di `BATAS_BYTE`.

**"Resolusi konflik" tidak diimplementasikan sebagai penggabungan versi.**
Kriteria F4-3 menyebutnya, tapi keenam jalur lapangan seluruhnya INSERT —
tak ada dua pihak yang menyunting baris yang sama. Yang benar-benar dibutuhkan
adalah pencegahan DUPLIKAT, dan itu tugas Idempotency-Key. Menulis mesin
resolusi konflik untuk konflik yang tak ada berarti menambah kerumitan yang
harus dirawat selamanya tanpa melindungi apa pun.

**`navigator.onLine` hanya untuk hiasan, tak pernah untuk memutuskan.**
Nilainya berbohong justru dalam keadaan yang paling lazim di lokasi
konstruksi: perangkat tersambung ke Wi-Fi proyek yang sendirinya tak punya
internet. Satu-satunya bukti sah bahwa jaringan hidup adalah percobaan kirim
yang berhasil.

### Bukti

```
Test Files  9 passed (9)
     Tests  88 passed (88)      ← 22 di antaranya F4-3
tsc --noEmit                    exit 0
lint:ratchet   ✅ 0 error, 528 warning (semua di bawah/sama dengan ambang)
hex-ratchet · catch-senyap · adr004 · modal-esc · medan-hantu · a11y ·
tata-letak · kontras-hex · sidebar   — semua hijau
build          ✓ Compiled successfully in 3.4s
```

---

## 2026-08-03 · Sesi 5 — FASE 0 SELESAI PENUH

### F0-8 — schema `mut6` dihapus (diratifikasi founder)

29 tabel salinan berisi 149 baris data uji, sisa sesi mutation testing.
`aktivitas terakhir: -Infinity` — tak pernah disentuh sejak dibuat.

Ketergantungan objek `public` ke `mut6` diperiksa **lebih dulu** (hasilnya 0),
baru `DROP SCHEMA CASCADE` dijalankan. Sesudahnya: `mut6` hilang, `public` tetap
122 tabel, dan **`schema_hash` TIDAK BERUBAH** (`7a4be5d7d87d9892`) — bukti
`public` tak tersentuh sama sekali, bukan sekadar klaim.

### 🎉 GERBANG FASE 0 HIJAU PENUH

Seluruh 18 item selesai: F0-1…F0-16, R-001, R-002. Nol yang menunggu.

| Ukuran | Hasil |
|---|---|
| CI | **11/11 check hijau**, 21,9 → **5,4 menit (4,1×)** |
| Suite | 131 berkas, 1313 lulus |
| Penjaga arsitektural | 16, dan **8 TERBUKTI bisa merah** |
| Branch protection | aktif & terbukti memblokir |
| Buku migrasi | selaras artefak fisik |
| Cacat P0 GL | diperbaiki & diverifikasi di CI sungguhan |

Yang paling berharga bukan angkanya, melainkan **empat cacat isolasi tenancy**
yang tersingkap saat sharding — semuanya kelas yang sama (test menulis ke schema
`public` bersama sambil berasumsi global), dan semuanya **nyata untuk
multi-tenant**, bukan sekadar penghalang CI. Satu di antaranya ada di **kode
produksi** (`utils/notifications.ts` tenant-blind).

Dan `fn_isi_company_id()` **tidak pernah dilonggarkan** — padahal itu jalan
pintas yang akan menghapus keempat gejala dalam satu baris.

**Fase 1 dibuka.** Delapan item, dan F1-8 (`companies.ts` coverage nol) adalah
gerbang yang founder tetapkan sebelum Fase 2 boleh dimulai.

---

## 2026-08-03 · Sesi 4 — CI dipercepat 2,7×, dan satu aturan ternyata tak dijaga

### Diukur dulu — dan hipotesis mandat gugur

Mandat menduga schema dibongkar-pasang per berkas, lalu menyarankan template
database. **Diukur, salah:** overhead hook **0,2s dari 125,6s (0%)**, `DROP
SCHEMA` 0,03s. Template DB akan menghemat ~6,5s dari 1203s.

Yang sebenarnya mahal: **~6.000 round-trip × 21ms**. Dan CI 10× lebih lambat
dari lokal karena **DB project CI di Tokyo, runner GitHub di US-East** — tiap
query menyeberangi Pasifik. Tak satu pun butir rencana mandat menyentuh ini.

Pelajaran yang layak diulang: optimasi tanpa pengukuran akan menghabiskan waktu
pada 0,5% masalah sambil merasa produktif.

### Temuan terpenting — ADR-004 tak dijaga sama sekali di sisi API

Langkah 5 mandat ("buktikan penjaga bisa merah") dimulai sebagai formalitas.
Menyisipkan `u.role === 'admin'` ke berkas route **lolos seluruh 14 penjaga**.

Penyebabnya: `apps/web/scripts/adr004-ratchet.mjs` memang ada, tapi hanya
mencakup **web**, dan header-nya menyatakan *"Sisi API sudah patuh
(requirePermission di mana-mana)"* — pengukuran membuktikan itu **tidak benar**:
**52 pelanggaran** di `apps/api/src`.

Aturan yang membuat SaaS multi-perusahaan mungkin, selama ini hanya konvensi.
Penjaga baru terpasang (ratchet, lantai 52), terbukti dua arah.

### F0-14 — sharding menyingkap cacat isolasi, lalu diperbaiki di tempat benar

Shard 4× memangkas 1317s → 434s, tapi shard 1 gagal: `projects.company_id`
NOT NULL dilanggar.

Akarnya **bukan** sharding dan **bukan** trigger. `fn_isi_company_id()` mengisi
otomatis hanya bila ada TEPAT SATU company, dan menolak menebak saat ambigu —
perilaku yang benar. Yang salah: belasan berkas test meng-INSERT ke tabel
ber-tenant tanpa menyebut `company_id`, mengandalkan fallback itu.

Berurutan, asumsinya kebetulan selalu benar. Paralel,
`search-tenant-isolation` meng-**commit** company kedua selama ~2 detik (ia
harus commit — memakai `app.inject` lewat koneksi terpisah), dan setiap INSERT
di shard lain dalam jendela itu ditolak.

Diperbaiki di test: **16 INSERT di 14 berkas** kini menyatakan `company_id`
eksplisit. **Trigger tidak disentuh sama sekali** — melemahkannya demi CI cepat
adalah G-5, tepat sebelum Fase 2.

**Satu berkas nyaris dirusak sapuan otomatis.** `tenant-isolation-nyata`
menghilangkan `company_id` sebagai **inti ujinya** (membuktikan trigger menolak
menebak). Sapuan ikut mengubahnya, test langsung merah, dipulihkan — dan diberi
peringatan eksplisit. Kalau lolos, ia akan hijau selamanya tanpa menguji apa pun.

Verifikasi: seluruh berkas terdampak **lulus saat ada dua company** — kondisi
persis yang menggagalkan shard 1.

### F0-16 — cacat tenancy NYATA di kode produksi

Yang paling berharga dari seluruh pekerjaan CI hari ini bukan kecepatannya,
melainkan **apa yang tersingkap saat mengejarnya**.

`utils/notifications.ts` meng-insert notifikasi **tanpa `company_id` sama
sekali** — nol kemunculan di seluruh berkas. Bekerja hari ini semata karena
fallback satu-tenant. Artinya pada hari perusahaan kedua lahir, **setiap
notifikasi ditolak** — dan kalau trigger dilonggarkan supaya "jalan", notifikasi
diam-diam masuk ke perusahaan yang salah.

Ditemukan lewat sharding, **bukan** lewat review dan bukan lewat test yang ada.

**Diperbaiki di tipe, bukan di trigger.** `company_id` jadi kolom **wajib** di
`NotificationParams` — sengaja bukan opsional-dengan-default. Satu user bisa
jadi anggota beberapa perusahaan (ADR-011 D5), jadi nilainya tak bisa diturunkan
dari penerima; ia harus datang dari **peristiwa** yang melahirkan notifikasi.
Default apa pun akan salah untuk sebagian kasus.

Hasilnya: TypeScript menemukan **38 error → 31 pemanggil** di 10 berkas route.
Dan ternyata konteksnya **sudah ada di tangan pemanggil selama ini** —
`request.companyId` diisi `authenticate()` tiap request, `resolveRecipients()`
bahkan sudah menerimanya. Hanya notifikasinya yang tak pernah diberi tahu.

Terverifikasi: notifikasi + kasbon + punch-list lulus **saat ada dua company**.

### Hasil akhir: 21,9 → 6,3 menit (3,5×), 11/11 hijau — TARGET TERCAPAI

Jalannya tidak lurus, dan itu bagian pentingnya. Tiga kali CI merah, tiga kali
akarnya **cacat isolasi nyata** — bukan cacat sharding:

| Kali | Gejala | Akar |
|---|---|---|
| 1 | `projects.company_id` NOT NULL | 16 INSERT di test tak menyatakan `company_id` (F0-14) |
| 2 | `notifications.company_id` NOT NULL | **kode aplikasi** `utils/notifications.ts` tenant-blind (F0-16) |
| 3 | "ada akar grup tanpa pemilik" | `iso-test-b` di-commit tanpa `owner_user_id` |

Polanya sama ketiga kalinya: **test menulis ke schema `public` bersama sambil
membuat asumsi global tentang isinya.** Paralelisme tak menciptakan cacatnya —
ia hanya membuatnya terlihat. Itu latihan yang tepat menjelang Fase 2, karena
kebocoran antar-test adalah versi kecil dari kebocoran antar-tenant.

Dan sekali pun trigger `fn_isi_company_id()` **tidak disentuh**. Melonggarkannya
akan membuat ketiga gejala hilang dalam satu baris — sambil menukar cacat yang
terlihat dengan cacat yang senyap, tepat sebelum migrasi tenancy 80 tabel (G-5).

**6 shard dicoba dan gagal** — bukan karena keseimbangan melainkan karena
menyingkap F0-16. Jadi 4 shard adalah angka tertinggi yang **terbukti**, bukan
angka optimal. F0-15 menunggu F0-16.

---

## 2026-08-03 · Sesi 3 — repo dibuka, CI hidup, P0 terbukti nyata

Founder memutuskan repo dijadikan **publik**. Dua blokir yang sesi lalu saya
laporkan di luar jangkauan (B-1 Actions mati, B-2 branch protection tak tersedia)
**keduanya langsung teratasi**.

### Pemeriksaan keamanan sebelum membuka repo

Membuka repo tak bisa dibatalkan secara praktis, dan audit sebelumnya hanya
memindai berkas ter-track di HEAD — **belum pernah `git log -p`**. Jadi itu
dijalankan lebih dulu atas SELURUH histori: `.env` tak pernah ter-commit, nol
kunci `eyJ…`, nol `sb_secret_`, nol token GitHub/AWS/Slack/OpenAI, connection
string hanya placeholder.

Satu hal memang terbuka: ref project Supabase dev di 13 berkas. Itu **bukan
kredensial** — anon key tak pernah ter-commit dan RLS aktif 122/122, jadi yang
terekspos hanya *nama* infrastruktur, bukan aksesnya. Risiko rendah, dicatat.

### B-1 & B-2 — terbukti bekerja, bukan diasumsikan

- **Actions hidup.** Sebelum: 2–12 detik, `steps: []`, `runner_name: ""`, log 22 byte.
  Sesudah: ~2,5 menit, runner ditugaskan, **32 langkah** dieksekusi.
  **4 dari 5 job HIJAU.**
- **Branch protection aktif**: 5 check wajib, `strict: true`, force-push & deletion
  ditutup. Buktinya bekerja: PR #133 (CI merah) berubah `MERGEABLE` → **`BLOCKED`**.

### R-001 — cacat P0 TERBUKTI NYATA di lingkungan sesungguhnya

Ini bagian terpenting sesi ini. Sesi lalu saya menyimpulkan cacatnya dari membaca
kode; hari ini **diukur langsung** di project CI:

```
accounts  ADA · 0 baris · company_id=TIDAK · ⚠️ penanda 047 (account_type)
buku migrasi: 047=TERCATAT · 167=tidak
VERDICT: C — GL TENANT-BLIND
```

Dan CI utama gagal dengan akar yang sama:
`HARD FAIL 167_gl_chart_of_accounts.sql — column "company_id" does not exist`.

Persis skenario yang saya perkirakan: **047 menang, 167 dilewati diam-diam.**
Prediksi dari pembacaan kode terkonfirmasi oleh pengukuran — dan andai repo tak
dibuka, ini tak akan pernah terlihat.

Fallback founder dijalankan: `setup-clean` (aman, ketiga tabel 0 baris). Hasilnya
**047 + 167 + 175 lulus seluruhnya** di replay bersih. Perbaikan R-001 bekerja di
lingkungan kosong, bukan hanya di dev.

### F0-13 SELESAI — CI HIJAU PENUH untuk pertama kalinya

163 test merah di CI, akarnya **satu** dan tak terlihat dari pesan mana pun:

```
"User belum terdaftar sebagai anggota perusahaan manapun"   (auth.ts:82)
```

`resolveCompanyId()` menolak SETIAP request dari user tanpa baris di
`company_members`, jadi seluruh endpoint ber-`preHandler` membalas 403 dan test
yang mengharapkan 200/201/400/422 gagal berjamaah. Gejalanya (`daftar admin
kosong`, `admin tidak menerima notifikasi`, puluhan `expected 403 to be 200`)
menyesatkan ke arah RBAC, padahal soalnya keanggotaan.

Kenapa barisnya tak ada: migrasi 126 mendaftarkan "semua user existing" ke tenant
pertama — tapi di CI yang di-wipe, migrasi jalan **sebelum** seed, jadi saat 126
berjalan belum ada user untuk didaftarkan.

**Ini kelas cacat yang sama persis dengan 047 dan 137** — ketiga kalinya dalam
rangkaian sesi ini. Semuanya: urutan seed-vs-migrasi, hanya muncul di lingkungan
yang dibangun dari nol, tak pernah terlihat di dev yang tumbuh bertahap.

Seed kini mendaftarkan seluruh user ber-`role_id` ke company akar (meniru persis
126) **dan memverifikasi hasilnya** — seed yang "berhasil" tapi nol baris adalah
kegagalan senyap yang paling lama didiagnosis.

**Hasil: run 30761368609 — KELIMA job CI HIJAU.**
Job API **130/130 berkas, 1301 lulus, 5 skipped, 0 gagal** (sebelumnya 1132/163).
Ratchet coverage lulus (31,76% vs lantai 31,98%, dalam toleransi 0,5%).

Ini juga yang akhirnya menutup **F0-3**: penjaga `docs-freshness` dan
`no-stale-docs-path` kini benar-benar menjaga, bukan sekadar terpasang.

### R-002 SELESAI — 12 migrasi dicatat, buku 160 → 172

Tiap baris dibuktikan kueri katalog yang ditulis & diperiksa **manusia**, satu per
satu, terhadap nama objek nyata di berkas migrasinya. Bukan regex — dan itu
memang perlu, karena seluruh 163–176 memakai DDL dinamis, penyebab verdict palsu
pada cacat C-3.

Prosesnya menangkap **dua kesalahan tebakan saya sendiri**: artefak 164 dan 174
sempat saya laporkan "tak ada" karena saya menebak nama objeknya salah. Kalau
saya percaya tebakan pertama, dua migrasi yang nyata sudah berjalan akan tercatat
sebagai belum — kebalikan dari cacat C-3, tapi sama-sama merusak buku.

**175 & 176 sengaja tidak dicatat**: 175 tak membuat objek apa pun (penegas
bentuk), 176 belum pernah dijalankan ke dev. Alatnya menolak menulis bila ada
satu saja baris tak terbukti.

### F0-4 SELESAI — tipe migrasi ke-4 (policy) akhirnya terjaga

Dua kriteria yang tersisa ditutup, satu dikerjakan dan satu **sengaja ditolak**.

**Rollback policy — dikerjakan.** `t5a-policy-rollback.test.ts` (6 test). Ini
tipe migrasi terakhir yang belum punya jaring: tiga lainnya (tambah kolom,
backfill, NOT NULL) sudah terjaga `multitenant-t3-rollback.test.ts`. Migrasi
131 menjanjikan di komentarnya *"Rollback granular & instan: DROP POLICY
tenant_isolation ON <tabel>"* — janji yang tak pernah diuji siapa pun, padahal
Fase 2 akan menambah policy tenant ke ~80 tabel. Janji rollback yang tak diuji
baru ketahuan salah pada saat ia paling dibutuhkan.

Yang dibuktikan: katalog kembali persis · policy PERMISSIVE existing **tidak**
ikut terhapus (inti komposisi ADR-011 §7) · tabel **hidup kembali**, bukan mati
total seperti peringatan T1-F3 di migrasi 131 · idempoten · bisa dipasang ulang.

**Dan test-nya sendiri di-mutation-test**: saat `DROP POLICY` sengaja dilewati,
test GAGAL (1 failed / 5 passed). Jadi ia benar-benar bisa gagal — bukan hijau
kosong. Disiplin itu datang dari repo ini sendiri (`tak-ada-test-nol.test.ts`).

**Isolasi schema per-berkas — DITOLAK, dan ini keputusan sadar.** Kriteria awal
menuntutnya, tapi setelah diukur arahnya keliru: `fileParallelism: false` membuat
berkas berjalan sequential, dan `test-db.ts` SUDAH memasang `lock_timeout 10s`
+ 3 retry + pesan diagnostik eksplisit. Diuji stres (5 berkas ber-`resetTestSchema`,
2 putaran): 45/45 lulus dua-duanya. Menambah schema unik per-berkas berarti 129
CREATE/DROP SCHEMA per run — memperlambat suite demi masalah yang mitigasinya
sudah terbukti bekerja. Dicatat supaya kalau flake muncul lagi, catatan ini yang
ditinjau lebih dulu, bukan diputuskan dari nol.

**Verifikasi:** suite penuh **130/130 berkas, 1305 lulus, 228,5s** — run hijau
**kelima berturut-turut**. Coverage tak bergerak. 7 penjaga + tsc exit 0.

### F0-12 SELESAI + F0-13 tersingkap

**F0-12 diperbaiki dan diverifikasi di CI sungguhan.** Penjaga 137 kini
membedakan "ada user tapi akar yatim" (cacat nyata → tetap melempar) dari
"belum ada user sama sekali" (sah → lanjut), dan migrasi **176** memasang trigger
yang mengisi kepemilikan begitu user aktif pertama lahir. Jaminannya ditegakkan
mesin, bukan harapan.

Perbaikannya sendiri sempat cacat, dan hanya ketahuan karena diuji: fungsi
SECURITY DEFINER-nya memakai `SET search_path = pg_catalog, public`, sehingga
trigger **diam-diam menulis ke `public`** alih-alih ke schema tempat migrasi
berjalan. Uji tiga langkah di schema sementara menangkapnya. Konvensi repo
(64 fungsi SECURITY DEFINER, **nol** memakai `SET search_path`) ternyata memang
sengaja demikian supaya migrasi portabel untuk test harness — diikuti.

**Hasilnya: replay dari nol BERHASIL untuk pertama kalinya.**
WIPE → 150+ migrasi → seluruh seed OK → `success`.

Dan `periksa-gl` sesudahnya membuktikan R-001 tuntas end-to-end:

| | Sebelum | Sesudah |
|---|---|---|
| `accounts` | `company_id=TIDAK`, penanda 047 | **`company_id=YA`, penanda 167, 38 akun** |
| Buku migrasi | 047=TERCATAT, **167=tidak** | **047 & 167 keduanya tercatat** |
| Verdict | **C — GL TENANT-BLIND** | **B — AMAN** |

**F0-13 (P1 baru) tersingkap justru karena replay berhasil.** CI utama: 4 dari 5
job **hijau**; job API gagal dengan **1132 lulus / 163 gagal** — padahal lokal
**1299 lulus / 0 gagal**.

Selisihnya **lingkungan, bukan kode**: DB CI baru di-wipe, jadi fixture yang
selama ini menumpuk di dev tidak ada. Pola kegagalannya konsisten dengan itu —
`expected 403 to be 200` berulang (permission belum ter-seed), "daftar admin
kosong", "admin tidak menerima notifikasi".

Ini utang yang **selama ini tersembunyi** karena tak seorang pun pernah berhasil
me-replay dari nol. Tiga cacat kelas ini dalam satu sesi (047, 137, seed CI),
dan ketiganya punya sifat sama: tak terlihat di lingkungan yang tumbuh bertahap.

### F0-12 — cacat kedua dari kelas yang sama, ditemukan karena replay bersih

Replay berhenti di migrasi **137**: *"1 akar grup tanpa owner_user_id"*.

Akarnya: migrasi **126** mengisi `created_by` dari admin-aktif-tertua, tetapi di
DB yang baru di-wipe **belum ada user sama sekali** (seed berjalan SETELAH semua
migrasi) → NULL. Lalu **137** mem-backfill `owner_user_id` dari
`COALESCE(created_by, admin-tertua)` — keduanya NULL — dan penjaganya melempar.

**Penjaga 137 benar dan tidak boleh dilemahkan.** Yang salah urutan seed-vs-migrasi.

Yang perlu dicatat: **ini kedua kalinya dalam satu sesi** pola yang sama muncul —
cacat yang hanya kelihatan saat sistem dibangun dari nol, tak pernah di dev yang
tumbuh bertahap. Belum diperbaiki: di luar cakupan ratifikasi, dan ada ≥2
pendekatan sah. Masuk antrean F0-12.

---

## 2026-08-03 · Sesi 2 — ratifikasi dieksekusi

Founder meratifikasi R-001 (opsi A + 3 syarat), R-002, R-003, R-004, memerintahkan
sapuan ulang untuk R-005, dan menaikkan dua item baru ke P0/gerbang.

### BARU-1 (P0) — CI tidak menjaga apa pun. Lebih buruk dari dugaan.

Founder benar: `ci.yml` disaring `branches: [main]`, sehingga **setiap PR bertumpuk
berjalan tanpa satu pun check**. 13 penjaga arsitektural yang dibangun sesi lalu
tidak menjaga apa pun pada rantai PR mana pun yang belum menyentuh `main`. Pemicu
sudah diubah ke `pull_request` tanpa filter.

Tetapi saat memverifikasi "status check benar-benar wajib", ditemukan dua hal yang
**lebih besar** dari cacat pemicunya:

1. **Branch protection TIDAK BISA diaktifkan.** `gh api …/branches/main/protection`
   → **403: "Upgrade to GitHub Pro or make this repository public"**. Begitu pula
   `…/rulesets`. Repo privat pada paket saat ini tidak mendukung keduanya. Artinya
   **tak ada mekanisme apa pun yang mewajibkan CI hijau sebelum merge** —
   diverifikasi: PR #133 `mergeStateStatus: UNSTABLE` tetapi `mergeable: MERGEABLE`.
2. **GitHub Actions tidak menjalankan job sama sekali.** Seluruh run terakhir gagal,
   termasuk push ke `main`. Bukti: job selesai dalam 3–12 detik, `steps: []` (nol
   langkah), `runner_name: ""` (runner tak pernah ditugaskan), dan zip log berukuran
   22 byte alias kosong. Ini bukan cacat kode — melainkan blokir tingkat akun
   (kuota/spending limit Actions).

Konsekuensi jujur: **CI belum bisa dipulihkan dari sisi saya.** Yang bisa saya
lakukan sudah dilakukan (pemicu diperbaiki); dua sisanya butuh tindakan founder di
setelan akun GitHub. Sampai itu beres, satu-satunya verifikasi yang nyata adalah
run lokal — dan itu yang saya tempel, bukan klaim CI hijau.

### R-001 — dieksekusi penuh, dengan ketiga syarat

**Syarat 1 — periksa DB CI sebelum eksekusi.** Kredensial `CI_*` memang write-only
di GitHub Secrets, jadi jalur "periksa dulu" hanya mungkin lewat workflow. Dibuat
`apps/api/scripts/ci-periksa-bentuk-gl.mjs` (read-only, tiga verdict A/B/C) +
action `periksa-gl` di `ci-isolation.yml`. **Belum dijalankan** karena Actions mati
(BARU-1) → maka fallback founder berlaku: **reset CI dari nol setelahnya**.

**047 dipensiunkan.** Isinya diganti no-op + penjelasan panjang. Berkasnya sengaja
TIDAK dihapus: nomor 047 sudah tercatat di buku migrasi, dan menghapusnya membuat
buku menunjuk ke sesuatu yang tak ada.

**Syarat 2 — migrasi penegas bentuk (175).** Gagal keras bila `accounts` tanpa
`company_id` atau masih punya `account_type`. **Membangunnya menemukan tiga cacat
pada penegas itu sendiri**, dan ketiganya hanya ketahuan karena diuji:

- **Terlalu ketat.** Versi pertama menuntut `company_id` di `journal_entry_lines`.
  Diuji ke dev → langsung melempar. Ternyata **penegasnya yang salah**: 167 sengaja
  memberi baris jurnal tenancy lewat induknya (`entry_id` → `journal_entries`),
  dinyatakan eksplisit di komentar 167 baris 155-156. Penjaga yang salah lebih
  berbahaya daripada tak ada penjaga — ia melatih orang mengabaikan kegagalannya.
  Diganti: cek FK ke induk, yang memang jalur tenancy sesungguhnya.
- **Buta schema.** Memakai `to_regclass('public.accounts')`, jadi selalu memeriksa
  `public` apa pun `search_path`-nya. **Uji negatif membuktikannya lolos padahal
  bentuknya 047.** Diganti `current_schema()` — idiom yang sudah dipakai 167 & 154.
- **Pesan galat rusak.** `array || text` yang teksnya memuat tanda kurung ditafsir
  Postgres sebagai array literal → `malformed array literal`, menutupi pesan
  sebenarnya. Dibungkus `ARRAY[...]`.

Uji akhir: **positif** (dev, bentuk 167) → LULUS; **negatif** (bentuk 047 dibangun
di schema sementara, transaksi di-ROLLBACK) → MENOLAK dengan pesan yang benar.

**Syarat 3 — sapu SELURUH 171 migrasi.** Dibuat
`audit-tabrakan-definisi-tabel.mjs`. Hasil sapuan: **13 tabel bertabrakan**, dan
ternyata **047↔167 bukan satu-satunya kelasnya** — tetapi satu-satunya yang tak
terjaga:

| Tabrakan | Status |
|---|---|
| `assets`, `asset_movements`, `asset_depreciation_logs` (045↔149) | **sudah terjaga** — 149 MEMBUANG bentuk 045 lebih dulu, dengan komentar yang menjelaskan cacat yang sama persis (baris 50-73) |
| `project_rab_materials` (043↔142), `po_delivery_log` (043↔143) | aman — definisi identik / ada `to_regclass` guard |
| 5 tabel workflow (081↔093) | aman — bentuk identik kolom demi kolom, dan ADR-006 sudah memensiunkannya (tabelnya nihil di dev) |
| **`accounts`, `journal_entries`, `journal_entry_lines` (047↔167)** | **satu-satunya yang tak terjaga → diperbaiki** |

Penemuan migrasi 149 penting: repo ini **sudah pernah** menyelesaikan cacat kelas
ini dengan benar. Jadi perbaikan R-001 mengikuti preseden yang ada (CHARTER §4
aturan 2), bukan mengarang pendekatan baru.

Penjaganya sendiri juga salah dua kali sebelum benar: (a) mendeteksi "penegas"
hanya dari ada-tidaknya `RAISE EXCEPTION` di berkas — terlalu longgar; (b) menuduh
**semua** pendefinisi, bukan yang **terakhir** — menghasilkan 18 tuduhan yang
hampir semuanya salah sasaran. Yang menanggung beban penjagaan adalah migrasi yang
datang belakangan; yang pertama tak punya apa pun untuk dijaga.

### R-005 — saya salah, dan founder benar menyuruh menyapu lebih luas

Sesi lalu saya menyimpulkan `1.657.839.590,39`, `109,5`, `7875` "hampir pasti bukan
dari berkas Cibuluh" lalu berhenti. Kesimpulan yang benar adalah **"belum saya cari
di berkas lain"** — sapuan saya hanya menyentuh `_source/ahsp/golden/`.

Disapu ke seluruh `_source/ahsp/`. **Ketiganya ketemu**, semuanya di
`Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm` (117 sheet):

- `1.657.839.590,39` = **TOTAL BIAYA** proyek (`REKAPITULASI!E15`, juga di
  `LAPORAN RAB!J239` dan `KURVA S!F19`)
- `109,5` = **volume m²** pasangan bata merah ½ batu (`LAPORAN RAB!H114`);
  terverifikasi silang: `109,5 × 146.308,162 = 16.020.743,74` = J114 ✅
- `7875` = **jumlah buah** bata merah (`DINDING BATA MERAH!L41`, satuan "Buah")

Jawaban atas pertanyaan mandat "kenapa 3.629.860.295,31 ≠ 1.657.839.590,39":
**dua proyek yang berbeda.** Cibuluh = RAB gudang nyata (9 divisi, 55 item);
RAB Control 2026 = Engineering Estimate template SE-47 (8 divisi A–H). Bukan beda
edisi, bukan subtotal-vs-total, bukan sudah/belum PPN.

**Temuan sampingan bernilai:** baris PPN di dokumen itu berlabel **"PPN 11%"**
tetapi pengalinya **0,12** (`F16`), dan hasilnya cocok
(`1.657.839.590,39 × 0,12 = 198.940.750,85`). Ini membuktikan model dua-angka yang
dijaga `ppn-dpp-guardrail.test.ts` **berasal dari praktik dokumen nyata**, bukan
karangan — dan menjadi kandidat kuat untuk mengisi guardrail yang selama ini
melaporkan dirinya *vacuous*.

Assertion belum ditambahkan → **F0-10**, karena butuh harness pembaca `.xlsm`
tersendiri. Itu pekerjaan, bukan keraguan.

### Yang belum & kenapa

- **R-002** (catat 12 migrasi ke buku) — menunggu R-001 benar-benar tuntas di
  lingkungan CI, sesuai urutan yang founder tetapkan.
- **F0-11** — pemeriksaan bentuk GL di project CI: terblokir BARU-1.
- **F1-8** — `companies.ts` coverage nol dinaikkan ke **gerbang Fase 1** sesuai
  perintah founder. Fase 2 tidak dimulai sebelum ini hijau.

### Verifikasi sesi ini

Suite penuh **129/129 berkas, 1299 lulus, 1 skipped, 228,9 s** — run hijau
**keempat berturut-turut**. Coverage tak berubah (31,98% / 68,49% / 81,96%).
**14 penjaga arsitektural exit 0.** `tsc --noEmit` exit 0.
`gen-indeks-docs --check` exit 0.

---

## 2026-08-02 · Sesi 1 — Fase 0 dimulai

### Pengakuan tujuh koreksi (tanpa pembelaan)

**C-1 — Introspeksi DB tidak stabil. Saya salah.**
Saya membalik kesimpulan soal GL empat kali dan membiarkan `process.cwd()`
melayang ke `apps/api` tanpa menyadarinya. Akar teknisnya saya temukan hari ini
dan lebih memalukan dari dugaan: setiap alat menulis ulang logika baca-`.env`
sendiri, dan salah satunya **tidak melucuti tanda kutip** pembungkus nilai
`DIRECT_URL` (`"postgresql://…"`). Driver `pg` gagal mem-parsing string berawalan
`"`, jatuh ke variabel lingkungan, lalu memakai `HOST=` dari `.env` sebagai
hostname — menghasilkan galat menyesatkan `getaddrinfo ENOTFOUND base`. Angka DB
di laporan audit saya **memang layak dicurigai**. Sudah diverifikasi ulang (§0.2).

**C-2 — Urutan kerja saya terbalik. Saya salah.**
Saya menaruh `company_id` di #7 dan keputusan grup/holding di #9. Bentuk grup
menentukan bentuk CoA dan jumlah tingkat kolom tenancy; mengerjakan `company_id`
lebih dulu berarti menyentuh 122 tabel dua kali. Urutan sudah dibalik di
`CHARTER.md` §3: **keputusan struktural mendahului migrasi struktural.**

**C-3 — Rekomendasi saya berbahaya. Saya salah, dan ini yang paling serius.**
Saya membuktikan sendiri parser `rekonsiliasi-schema-migrations.mjs` buta terhadap
DDL dinamis, lalu tetap merekomendasikan `--tulis` ke buku migrasi. Buku itu
menentukan apa yang di-replay CI; satu entri palsu = migrasi dilewati senyap
selamanya, tanpa gejala. Rekomendasi **ditarik**. Alat baru `ledger-diff.mjs`
dibuat, **tanpa flag tulis sama sekali**, dan menandai migrasi ber-DDL-dinamis
sebagai `PERLU-MATA-MANUSIA` alih-alih menghijaukannya.

**C-4 — Saya memvonis tanpa bukti. Saya salah.**
"Cacat bootstrap harness, bukan produksi" adalah hipotesis yang saya tulis sebagai
kesimpulan. Belum diselesaikan sesi ini; masuk antrean sebagai `F0-4` dan
**tidak** akan saya tutup sebelum ada bukti.

**C-5 — Golden file tidak cocok. Saya salah.**
`1.657.839.590,39`, `109,5`, `7875` tidak saya temukan, dan saya melaporkannya
sebagai "kemungkinan dari dokumen lain" alih-alih menyelidikinya. Ditemukan hari
ini: ada **dua** berkas Cibuluh (`.xls` 6,9 MB dan `.xlsx` 3,5 MB) — kandidat
penjelasan yang belum saya buka. Masuk antrean `F0-7`.

**C-6 — Skor Testing 80 belum dibayar. Saya salah.**
Coverage tidak diukur, jadi angka itu tidak punya dasar. Masuk antrean `F0-5`
sebagai ratchet, bukan target aspirasional.

**C-7 — Temuan terpenting saya kubur. Saya salah.**
93 dari 119 sub-menu tanpa rancangan saya taruh sebagai catatan kaki §10.6,
padahal itu risiko yang paling mungkin membunuh proyek. Dinaikkan menjadi Fase 5
tersendiri di `CHARTER.md`.

### Yang dikerjakan

- **0.1 SELESAI** — `scripts/db/introspect.mjs` + `scripts/db/_koneksi.mjs`.
  Satu metode koneksi (driver `pg`, alasan ditulis di header), identitas +
  `schema_hash` dicetak tiap run, penjaga cwd menolak jalan dari luar root repo.
- **0.2 SELESAI** — tujuh angka kepala diverifikasi ulang → `KOREKSI.md`.
- **0.6 SEBAGIAN** — `ledger-diff.mjs` jadi, `LEDGER-DIFF.md` terbit.
  Penulisan ke buku **tidak** dilakukan (G-2) → `RATIFIKASI.md` R-001.

### Yang ditemukan (tidak ada di audit kemarin)

1. **🔴 P0 — tabrakan definisi GL 047 ↔ 167.** Migrasi 047 **tercatat sudah jalan**
   dan mendefinisikan `accounts` **single-tenant** (`account_type`, nol `company_id`).
   Migrasi 167 mendefinisikan `accounts` **tenant-aware** (`company_id` 18×, kolom
   `type`) dengan `CREATE TABLE IF NOT EXISTS`. Dev memakai desain 167 (terverifikasi
   `introspect columns`). Di lingkungan baru, `ci-project-setup.mjs` menjalankan 047
   lebih dulu (SQL-nya valid → tidak error → tidak masuk `SKIP_ALLOWLIST` → tidak
   HARD FAIL), lalu 167 **no-op senyap**. Hasil: **GL tenant-blind di CI/produksi**
   tanpa satu pun pesan galat. Diajukan sebagai R-001.
2. **Seluruh seri GL (167–174) belum ter-merge ke `main`** — hanya ada di branch
   `fix/search-proyek-gagal-senyap` (8 commit, 3.890 baris), padahal tabelnya sudah
   di-apply ke DB dev bersama. Branch Fase 0 saya rebase ke sana agar tidak
   membangun di atas baseline palsu.
3. **Jumlah trigger: 156 (`public`), 175 (semua schema).** Angka 192 di audit saya
   tidak cocok dengan keduanya. Ada schema `mut6` berisi 14 trigger — sisa
   mutation-test yang menggantung di DB dev.
4. `.env` diawali **BOM** dan nilainya dibungkus tanda kutip — dua jebakan parser
   yang kini ditangani terpusat di `_koneksi.mjs`.

### Yang berubah dari rencana

Fase 0 ternyata harus mencakup **rebase ke branch yang benar** — tidak terduga,
tapi wajib: tanpa itu seluruh pengukuran Fase 0 dilakukan atas pohon kode yang
tidak memuat GL, sementara DB-nya memuat GL. Persis kelas kesalahan C-1.

### F0-4 — jaring pengaman rollback: saya salah DUA KALI, dengan cara berbeda

Audit saya menulis "cacat bootstrap harness, bukan produksi" sebagai kesimpulan
padahal itu hipotesis (C-4). Hari ini saya mengukurnya, dan hipotesis itu **salah** —
tapi kesimpulan turunannya ("bukan cacat produksi") ternyata **benar karena alasan
yang berbeda**. Keduanya perlu dicatat supaya tidak diklaim sebagai tebakan beruntung.

**Bukti yang dikumpulkan:**

1. Dijalankan sendirian, `multitenant-t3-rollback.test.ts` **LULUS 23/23**, tiga kali
   berturut-turut. Jadi bukan cacat bootstrap: tabel `assembly_components` memang
   terbentuk dengan benar oleh `bootstrap()`.
2. Dijalankan sebagai bagian suite penuh hari ini: **129/129 berkas lulus,
   1299 lulus, 0 gagal, 217,4 detik.** Kegagalan kemarin **tidak reproduksi**.
3. Akarnya ada di `test-utils/test-db.ts` dan **sudah terdokumentasi di sana**:
   27 berkas test berbagi satu schema `test`, dan `resetTestSchema()` melakukan
   `DROP SCHEMA … CASCADE` yang butuh ACCESS EXCLUSIVE lock. Koneksi berkas test
   sebelumnya kadang belum lepas di sisi server (pooler session-mode menutup
   asinkron), sehingga DROP menunggu dan hook timeout menembak duluan. Komentar di
   kode menyebut frekuensinya "intermiten, ~30-50% run penuh".

**Jadi:** ini **flake infrastruktur test yang sudah dikenal**, bukan cacat produksi
dan bukan cacat bootstrap. Yang salah dari audit saya bukan verdict akhirnya,
melainkan **saya menyatakannya tanpa mengukur** — dan kebetulan-benar adalah
kegagalan metode, bukan keberhasilan.

**Konsekuensi yang belum selesai:** `F0-4` TIDAK saya tutup. Suite yang lulus
sekali tidak membuktikan flake-nya hilang; ia hanya tidak muncul hari ini. Kriteria
selesainya diperketat menjadi: *lulus 3 run penuh berturut-turut* + *test rollback
untuk tiap tipe migrasi tenancy*. Sisanya dikerjakan sebelum Fase 2, karena Fase 2
justru yang paling bergantung pada jaring ini.

**Temuan turunan:** jumlah "skipped" ikut berubah antar-run (24 → 1). Dua puluh tiga
di antaranya adalah test milik berkas yang gagal, bukan test yang sengaja di-skip.
Angka "24 skipped" di laporan audit karenanya menyesatkan; yang benar-benar
di-skip secara sengaja hanya **1** (`golden-cibuluh` — pasangan `skipIf` yang memang
mati saat berkas golden-nya ada).

### F0-5 — coverage: skor Testing 80 akhirnya dibayar (C-6)

Diukur pertama kali: **statements/lines 31,98%**, branches 68,49%, functions 81,96%.
Yang mengkhawatirkan bukan angkanya melainkan **sebarannya**: 27 berkas route
ber-coverage NOL, termasuk `users.ts`, `notifications.ts`, `documents.ts`,
`audit.ts`, dan `companies.ts` (inti multi-tenant). Jalur uang tipis:
`penalty.ts` 4,2%, `kasbon-limit.ts` 5,3%.

Membangun ratchet-nya justru menemukan dua cacat pada penjaga itu sendiri:

1. **Tanpa toleransi, penjaga jadi cerewet.** v8 bergoyang antar-run
   (branches 68,49 → 68,48). Penjaga yang berteriak untuk 0,01% akan dimatikan orang.
2. **Penjaga bisa berbohong.** Run `src/lib` saja menghasilkan statements 8,57%
   terhadap lantai 31,98% → vonis "TURUN" **palsu**. Sidik cakupan yang benar
   adalah **baris tereksekusi** (1.821 vs 6.794), bukan jumlah berkas — v8 tetap
   mendaftar semua berkas yang di-`include` walau nol tercakup, sehingga jumlah
   berkas nyaris tak berubah. Ratchet kini MENOLAK membandingkan (exit 2) alih-alih
   memberi vonis palsu.

### F0-7 — golden file: hipotesis saya sendiri gugur (C-5)

Saya menduga selisih angka berasal dari "dua berkas Cibuluh berbeda". **Salah.**
`.xls` dan `.xlsx` isinya identik — 22 sheet sama, nilai di sel sama; `.xlsx` hanya
hasil simpan-ulang. Jadi bukan itu penjelasannya.

`1.657.839.590,39` **tidak ada** di kedua berkas, seluruh 22 sheet. Semua angka
1–9 miliar disapu; terdekat `1.642.531.571` (subtotal Pekerjaan Beton), selisih
15,3 juta — bukan PPN, bukan PPh, bukan pembulatan. `109,5` dan `7875` juga nihil.

**Yang sengaja tidak saya lakukan:** menambahkan assertion untuk ketiganya.
Mengunci angka yang sumbernya tak diketahui = menjadikan tebakan sebagai kebenaran,
persis kelas kesalahan yang Fase 0 ada untuk memberantasnya. → R-005.

### F0-9 — penjaga penomoran migrasi

171 berkas, nomor tertinggi 174, lompatan lama 30/59/64 (059 = `seed_dummy_data`;
030 & 064 tak pernah ada di histori git). Lompatan lama dikecualikan **beserta
alasannya**; yang dijaga lompatan baru dan nomor ganda. Diuji dua arah.

Alasan nomor ganda berbahaya bukan estetika: `ci-project-setup` mencatat keduanya
sebagai satu versi, sehingga yang kedua **dilewati senyap selamanya** — mekanisme
yang sama persis dengan cacat P0 047↔167.

### Temuan proses: CI tidak berjalan untuk PR bertumpuk

PR #134 dibuat menargetkan `fix/search-proyek-gagal-senyap` (PR #133), bukan `main`,
karena seri GL 167–174 belum ter-merge. Akibatnya **nol check berjalan**:
`ci.yml` hanya ter-trigger pada `pull_request.branches: [main]`.

Ini konsekuensi nyata dari R-003 yang tak saya antisipasi. Selama rantai PR belum
sampai ke `main`, **CI tidak memverifikasi apa pun** — dan mengklaim "CI hijau"
dalam kondisi itu akan jadi persis jenis klaim tak berdasar yang CHARTER §7 larang.

Sebagai ganti, seluruh langkah CI dijalankan **lokal**, dan hasilnya ditempel:
13 penjaga exit 0 · api `lint:ratchet` 0 error / `tsc` exit 0 / `build` exit 0 ·
web `lint:ratchet` 0 error / `tsc` exit 0 · suite penuh 3 run berturut hijau.

`F0-3` karenanya tetap **wip**, bukan done: kriteria "penjaga CI hijau" baru
benar-benar terpenuhi saat rantai PR di-merge ke `main`.

### Status gerbang Fase 0 — BELUM hijau penuh (dinyatakan jujur)

Selesai: F0-1, F0-2, F0-5, F0-6, F0-7, F0-9.
Belum: **F0-3** (penjaga docs jalan, CI penuh belum diverifikasi end-to-end),
**F0-4** (3 run berturut hijau, tapi isolasi schema per-berkas + rollback tiap
tipe migrasi tenancy belum dibangun).

Sesuai CHARTER §3, Fase 1 **tidak** dimulai sebelum keduanya tuntas.

### Menunggu di RATIFIKASI

- **R-001** 🔴 P0 — tabrakan GL 047↔167 (G-2). Memblokir pekerjaan GL apa pun.
- **R-002** — pencatatan 12 migrasi ke buku (G-2; harus SETELAH R-001).
- **R-003** — bekerja di atas `fix/search-proyek-gagal-senyap`, bukan `main`.
- **R-004** — penarikan rekomendasi `rekonsiliasi --tulis`.
- **R-005** — 3 angka jangkar golden file tak dikenali sumbernya (pertanyaan, tidak memblokir).
- **F0-8** — pembersihan schema `mut6` dari DB dev (G-2).

## 2026-08-03 — F1-1, F1-5, F1-4 (sebagian), + akar tujuh kegagalan shard

**F1-1 SELESAI.** Idempotency terpasang di tiga endpoint yang benar-benar
memindahkan kas. Endpointnya dipilih dari `pg_trigger` — tabel mana yang punya
trigger pengubah saldo — bukan dari nama. PATCH status sengaja tidak dipasangi:
sudah idempoten by state. Memasang di mana-mana akan membuat mekanismenya
terlihat seperti formalitas, dan yang benar-benar butuh jadi tak menonjol.

**F1-5 SELESAI, dan pengukurannya lebih berharga daripada hasilnya.** F1-5
mengharuskan waktu klon→siap DIUKUR. Pengukuran itu menyingkap tiga cacat yang
NOL-nya bergejala di mesin yang repo-nya sudah berjalan:

1. `apps/web/.env.example` **tak pernah ada di repo** — `.gitignore` punya
   `.env*` yang ikut menelannya. Setiap orang yang pernah mengklon tak menerima
   satu pun petunjuk konfigurasi web. Tak ada yang sadar karena di mesin lama
   berkasnya tertinggal secara lokal.
2. Klon di Windows **gagal checkout** — path absolut > 260 char. Klon dilaporkan
   BERHASIL, checkout-nya yang gagal: repo terlihat ada tapi tak lengkap.
3. Bootstrap saya sendiri **menuduh tersangka yang salah** — `pg` tak ada di
   root, tapi galatnya dilaporkan sebagai "koneksi DB gagal, periksa
   DIRECT_URL". DIRECT_URL tak bersalah.

Pelajarannya: cacat yang hanya muncul di lingkungan bersih tak akan pernah
ditemukan dengan membaca. Ia harus dijalankan di lingkungan bersih.

**Saya salah tentang cara membuktikan.** Dua kali hari ini saya menjalankan
mutation test yang mutasinya TIDAK PERNAH TERPASANG (escaping shell merusak
regex, 0 kecocokan) — dan dua kali saya nyaris menerima hijaunya sebagai bukti.
Hijau dari mutasi yang gagal terpasang adalah hijau palsu. Sejak itu saya
selalu menghitung kecocokan mutasi sebelum mempercayai hasilnya.

**Akar tujuh kegagalan shard, akhirnya ditutup.** CI merah lagi (t5b:
"expected 5 to be 6"). Bacaan pertama menuduh RLS bocor — bukan. Test
menghitung proyek company AKAR lewat dua jalur pada dua DETIK BERBEDA; satu
baris lahir di antaranya.

Ini kelas KETUJUH yang sama (F0-14, F0-16, iso-test-b, purge `[TEST]%` ×2,
cecep-rap `LIMIT 1`, t5b). Setelah keenam saya menambal satu per satu. Setelah
ketujuh jelas menambal bukan jawabannya, dan saya menulis penjaga yang
menolaknya otomatis — plus memperbaiki t5a yang memuat cacat laten yang sama
atas tiga tabel yang TERUKUR disisipi test lain.

RLS tidak disentuh sekali pun, walau melonggarkan satu predikat akan
menghijaukan semuanya dalam sepuluh detik. Itu G-5.

**F1-4 SEBAGIAN — dan blokirnya bukan pekerjaan yang kurang.** Perkakas,
runbook, dan drill terjadwal selesai. Kriteria "restore nyata" belum terpenuhi
karena GitHub menolak `workflow_dispatch` untuk workflow yang belum ada di
branch default (HTTP 404, diverifikasi lewat API). Drill baru bisa dijalankan
setelah rantai ini di-merge — dan R-003 melarang merge sebelum R-001 selesai.

Mesin lokal tak bisa menggantikan, dan itu diukur bukan ditebak: nol perkakas
klien Postgres, tanpa hak admin, WSL tanpa distro sehingga Docker tak bisa
hidup. Saya TIDAK menandai F1-4 selesai. Runbook §7 mencantumkan apa yang belum
terbukti dengan jujur, tanpa RTO untuk keduanya.

## 2026-08-03 (lanjutan) — F1-4 TERBUKTI. Delapan cacat sebelum sampai ke sana.

Merge ke `main` selesai, dan itu membuka drill pemulihan. Run 30832665736
hijau dengan bukti yang bisa dibaca:

    dump 60 dtk / 1,2 MB · restore 1 dtk · RTO siklus penuh 61 detik
    tabel 124/124 · RLS 123/123 · policy 377/377 · isi 124 tabel cocok

**Saya salah soal PR #134.** Saya merge tanpa memeriksa targetnya lebih dulu;
ternyata ia menunjuk branch perantara, bukan `main`. Tidak ada yang rusak, dan
saya lanjutkan lewat PR #133 — tapi memeriksa tujuan sebelum menekan merge itu
hal yang seharusnya otomatis.

**Kredensial pemilik sempat terbit di log publik.** Sandi mengandung `@`, yang
memecah URL di tempat salah; pesan galat `pg_dump` lalu MENCETAK potongannya.
GitHub me-mask nilai secret yang persis sama — potongan hasil parsing keliru
bukan nilai yang sama, jadi lolos. Run + log dihapus (terverifikasi 404).
Pemilik menimbang risikonya dan memilih tidak ganti sandi; itu keputusannya,
dan saya sudah menyampaikan konsekuensinya sebelum ia diambil.

Pelajaran yang berlaku seterusnya: **di repo publik, pesan galat adalah
permukaan kebocoran.**

### Delapan cacat, dan yang paling menakutkan bukan yang paling rumit

1. sandi ber-`@` merusak URL → kredensial bocor
2. `pg_dump` 17 terpasang tapi 16 yang jalan — **memasang bukan berarti memakai**
3. schema `extensions` tak ada → 753 galat berantai
4. schema `auth` tak ada → tepat 21 policy hilang
5. `btree_gist` tak ada → constraint anti-tumpang-tindih gagal
6. dump diambil sambil database bergerak → pelanggaran FK
7. membandingkan target dengan sumber yang berubah → alarm palsu
8. **`pg_restore` butuh `-f -`** → daftar kosong → **drill HIJAU tanpa memeriksa apa pun**

Nomor 8 yang paling berbahaya, dan ia yang paling sederhana. Run 30832061986
melaporkan `success` atas perbandingan yang tak pernah terjadi. Kalau saya
menerimanya, F1-4 akan ditandai selesai dengan bukti kosong — persis yang
CHARTER §7 larang. Sekarang dua penjaga terpisah membuat "tak ada yang
diperiksa" menjadi merah.

**Saya juga hampir salah dua kali karena memotong keluaran di ujung yang
salah.** `tail -20` atas 753 galat membuat saya melihat gejala (policy gagal
karena tabelnya tak ada) selama dua putaran, bukan sebab (schema `extensions`
hilang). Galat PERTAMA hampir selalu penyebab; sisanya akibat berantai.

Dan saat drill akhirnya hijau tetapi masih mencatat 5 pelanggaran FK pada
tabel inti, saya tidak menyimpulkan "berarti aman" — saya cetak angkanya.
`projects` 5=5, `scenarios` 4=4, `lesson_propagation_proposals` 192=192.
Hijau + galat FK adalah kombinasi yang harus dicurigai, bukan diterima.

### Cadangan harian terenkripsi

Paket Supabase free tak punya PITR, jadi kehilangan maksimal ~1 hari. Cadangan
harian AES-256 (artifact 30 hari) menutup risiko lain: cadangan yang hanya
hidup di dalam akun ikut hilang bila yang hilang justru AKSES ke akunnya.

Job MENOLAK jalan tanpa `SANDI_CADANGAN` — cadangan tak terenkripsi di repo
publik lebih berbahaya daripada tidak ada cadangan, karena ia terasa seperti
keamanan padahal justru kebocoran.

🔴 **Tripwire:** naikkan ke PITR SEBELUM pelanggan pertama.

## 2026-08-04 — FASE 2 SELESAI 6/6. Empat kebocoran ditemukan, semuanya ditutup.

Fase 2 dirancang sebagai "sapuan tenancy". Yang sebenarnya terjadi: ia jadi
audit yang menemukan **empat kebocoran lintas-tenant nyata** — dan tak satu
pun terlihat dari membaca kode.

| Ditemukan | Kebocoran | Bukti |
|---|---|---|
| F2-3 b2 | `audit_logs` — admin PT A membaca jejak PT B | 13.691 baris, mutation-tested |
| F2-3 b3 | `permission_scopes` — pembatasan izin terbaca semua tenant | policy `auth.role() IN (authenticated,…)` |
| F2-5 | `expense-receipts` — anon TANPA LOGIN membaca bukti pengeluaran | anon 1 baris terbaca |
| F2-5 | `project-photos` — anon membaca DAN MENGHAPUS foto proyek | sisa era anon-key |

**Alat saya sendiri meloloskan dua di antaranya.** Klasifikasi F2-2 punya dua
cacat berturut: (1) rantai berhenti di tabel SHARED yang kebetulan punya
`company_id`, (2) rantai MENEMBUS `users` yang global. Perbaikan pertama hanya
melarang users jadi UJUNG; `permission_scopes → users → roles` tetap lolos.

**Temuan struktural terbesar F2-2:** dari 80 tabel tanpa `company_id`, hanya
**4** yang perlu keputusan. 66 sudah punya tenancy lewat rantai FK — memberi
mereka kolom kedua akan menciptakan dua sumber kebenaran yang bisa
bertentangan.

**Pelajaran yang berulang, dan akhirnya jadi kebiasaan:** setiap test isolasi
harus punya assertion "penjaga berdaya" — memeriksa bahwa ia bisa MELIHAT
sesuatu sebelum menyimpulkan tak ada kebocoran. Tiga uji `audit_logs` saya
melaporkan "tertahan" padahal sesinya tak bisa melihat apa pun. Pola yang sama
menyelamatkan F2-4 (tiga percobaan penyamaran salah berturut-turut).

**F2-5 menyingkap arah cacat yang terbalik.** Tujuh kali di Fase 0, test
mengotori produksi. Kali ini MIGRASI LAMA mengotori hasil test:
`storage.objects` tabel GLOBAL, jadi migrasi 012/016 ikut ter-replay tiap
suite membangun schema `test` dan menghidupkan kembali policy yang baru
dihapus. Gejalanya "test kadang merah" — diperbaiki di sumbernya, bukan
ditambal di migrasi baru.

**F2-6 diputuskan dengan bukti, bukan selera.** `FORCE ROW LEVEL SECURITY`
menghasilkan NOL perubahan perilaku (diuji: 15 proyek sebelum & sesudah)
karena `postgres` ber-`rolbypassrls`. Memaksanya akan menambah properti yang
TERLIHAT seperti perlindungan tetapi tidak bekerja — dan itu lebih berbahaya
daripada tak ada perlindungan. Dua tripwire dijaga otomatis.

Fase 2: 6/6. 142 berkas / 1400 test hijau. 11 penjaga arsitektural.

---

## 2026-08-05 — Fixture test mengungkap cacat produksi multi-tenant (R-010)

**Saya salah dua kali di sesi ini, dan cara salahnya sama: fixture uji yang
tidak menganggap dirinya berbagi basis dengan 157 berkas lain.**

Fixture `menu-etag` membuat perusahaan kedua (dev hanya punya satu, jadi
pemeriksaan isolasi tenant tak akan pernah benar-benar berjalan tanpa itu).
Fixture itu lalu menjatuhkan `submittal-aturan` dan `t9-kelola-badan-usaha`
— dua kali, di CI, dengan pesan yang tak ada hubungannya dengan yang mereka uji.

Perbaikan pertama saya keliru arah: saya membersihkan fixture. Yang benar
adalah membuat fixture-nya **sah menurut invariant** — diberi `owner_user_id`
dan rantai approval — sehingga tertinggal pun tak melanggar apa pun.
Diverifikasi dengan sengaja meninggalkannya: 29 test hijau.

**Dan di situ cacat sungguhannya muncul.** `submittal-aturan` merah karena
perusahaan baru tak punya rantai approval `submittal`. Migrasi 159 mengisinya
untuk company yang ADA saat migrasi jalan; tak ada trigger untuk yang lahir
sesudahnya (diverifikasi ke `pg_trigger`, bukan dibaca dari migrasi).

Artinya: **pelanggan kedua dan seterusnya lahir tanpa rantai approval.**
Fail-closed (ADR-007) bekerja persis sebagaimana mestinya — nol orang bisa
menyetujui — jadi gejalanya `403` untuk semua orang termasuk pemilik
perusahaannya, tanpa satu pun pesan yang menjelaskan. Ini ERP yang sedang
dijual ke banyak perusahaan; cacat ini menunggu pelanggan kedua.

Satu-satunya alasan invariant itu selama ini terpenuhi: **tak pernah ada
company baru.** Test yang hijau karena keadaan, bukan karena kodenya benar.

Dicatat sebagai **R-010** (menyentuh skema → butuh ratifikasi). Cakupannya
mungkin lebih luas dari submittal — `approval_chains` punya beberapa
`entity_type`, dan belum diperiksa mana saja yang punya lubang yang sama.
Jangan diasumsikan hanya submittal.

**Pelajaran yang sama muncul tiga kali hari ini:** penjaga yang tak pernah
dibuat merah adalah teater. Tiga penjaga ternyata hijau tanpa memeriksa apa
pun — satu `exit(0)` saat tak menemukan targetnya, satu buta terhadap bentuk
ternary, satu membaca komentar sebagai kode. Semuanya ditemukan dengan
mencoba membuatnya merah, bukan dengan membaca kodenya.

---

## 2026-08-05 (lanjutan) — Audit yang melewati halaman terpenting, lalu melaporkan nol

**Akun uji portal dibuat**, dan 19 halaman portal akhirnya terlihat untuk
pertama kalinya. Temuan pertamanya sepele tapi tiap hari: `split(" ")[0]`
menyapa **lima dari enam mandor** dengan "Halo, Pak". Cacat yang sama ada di
lima tempat, termasuk dashboard utama.

**Yang lebih besar: penjaga a11y saya sendiri melewati rute dinamis.**
`/proyek/[id]` — 20 bagian, 12.554px, halaman terkaya di aplikasi — tak
pernah sekali pun dipindai, sementara laporan berbunyi "39 halaman, nol
pelanggaran". Begitu disertakan: **141 pelanggaran**, termasuk 85 input tanpa
label dan 19 tombol tanpa nama.

Saya sudah menulis "nol pelanggaran" tiga kali hari ini. Angka itu benar
untuk halaman yang dipindai, dan menyesatkan tentang aplikasinya. Audit yang
melewati halaman terpenting lalu melaporkan nol memberi rasa aman yang tidak
dibayar dengan pemeriksaan apa pun.

**`opacity` pada teks muncul EMPAT kali lagi** — lencana EVM, kartu
finansial, garis Gantt, judul milestone. Kelas yang dulu menyumbang 227 dari
235 pelanggaran lewat sidebar. Semuanya lolos setiap pemindai statis, karena
kontras hanya terlihat pada nilai terhitung.

**`--bg-rgb` yang tidak pernah didefinisikan.** Bilah navigasi memakai
`rgba(var(--bg-rgb, 248,249,250), 0.92)` — fallback nilai mode TERANG selalu
yang dipakai, jadi bilah tetap putih di mode gelap. 20 pelanggaran dari satu
baris, semuanya hanya terlihat di mode gelap.

**Fixture company yatim: tiga kali dalam satu hari.** `t9` menuntut setiap
akar grup punya pemilik. Ia memeriksa SELURUH tabel, dan enam shard berbagi
satu basis — jadi fixture berkas A menjatuhkan test berkas B. Dua kali saya
"memperbaikinya" dengan membersihkan fixture. Itu salah: `afterAll` tak
berjalan kalau prosesnya mati. Yang benar adalah membuat fixture SAH SEJAK
LAHIR, dan sekarang ada penjaga yang menolak yang ke-16.

**Saya salah menomori R-010.** Nomor itu sudah dipakai untuk definisi
INTI/PEMBEDA/TUNDA yang diratifikasi 2026-08-04; R-011 dan R-012 juga
terpakai. Temuan rantai approval kini **R-013**. Kesalahan yang sama persis
dengan yang berkali-kali saya temukan di kode hari ini: menulis angka tanpa
mengukur dulu.

**Dan INTI #1 ternyata sudah selesai.** QUEUE menyatakannya belum digarap.
Diukur di HEAD: `/gl/laporan` hidup, tab "Neraca & Laba-Rugi" ada di
`/akuntansi`, lengkap dengan penanda seimbang dan ekspor CSV. Dokumen yang
menyatakan pekerjaan penting "belum ada" sama merusaknya dengan yang
menyatakan pekerjaan "sudah selesai" padahal belum — keduanya membuat orang
mengerjakan hal yang salah.

---

## 2026-08-06 — INTI 9/9 selesai, dan dua kelas cacat akhirnya berpenjaga

**INTI #9 absensi lapangan dibangun dari nol.** `wage_items.days_worked` dulu
angka yang diketik mandor dari ingatan — triase menyebutnya "sumber selisih
paling sering". Sekarang ada catatan harian di baliknya, dan formulir upah
punya tombol "Ambil dari absensi". Diuji di peramban: Agung 2,5 hari
(setengah hari Selasa terbawa persis), subtotal terhitung sendiri.

Yang dijaga bukan sekadar tabelnya: 14 invarian, dan yang paling mahal adalah
**dobel-absen** — satu hari tercatat dua kali berarti upah ganda yang tak
terlihat di layar mana pun sampai seseorang menjumlahkan ulang. Mutasi
membuktikan constraint-nya nyata: mencopot CHECK + unique index → 4 bocor.

**INTI #8 geotag ternyata hanya butuh disambungkan.** Kolom, endpoint, dan
komponen `PenandaLokasi` semuanya sudah ada sejak migrasi 190. Yang hilang:
`select` tak mengambil kolomnya, dan komponennya tak pernah dipasang. Jadi
koordinat tersimpan rapi dan tak pernah sampai ke layar — bentuk paling halus
dari "kolom DB sudah ada bukan berarti selesai".

**Dua kelas cacat kontras akhirnya berpenjaga.** Token deret grafik dipakai
sebagai warna teks: LIMA kali. `opacity` pada teks: ENAM kali. Tiap perbaikan
benar, dan tiap kali yang berikutnya lahir lagi — karena tak ada yang
menolaknya di pintu masuk. Dua penjaga baru menemukan 16 pemakaian lagi yang
belum terlihat, termasuk di portal mandor yang baru bisa diperiksa kemarin.

**Yang paling saya ingat dari hari ini:** `--warning` lolos 5,02:1 di putih
dan 4,84:1 di `--warning-bg`, lalu GAGAL 4,46:1 di baris RAB berlatar biru
muda. Kurang 0,04, dan itu 95 pelanggaran di satu halaman. Latar yang benar
harus diukur, bukan diasumsikan putih — dan saya baru tahu itu setelah
meminta axe menyebutkan warna latar yang sebenarnya ia hitung.

**Dua dari sembilan INTI ternyata sudah selesai sebelum diperiksa.** Dokumen
yang menyatakan pekerjaan penting "belum ada" sama merusaknya dengan yang
menyatakan "sudah selesai" padahal belum. Ukur di HEAD sebelum mulai.
