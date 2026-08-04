# F5-1 — Triase sub-menu: INTI / PEMBEDA / TUNDA

> **Dokumen hidup.** Diperbarui saat status sub-menu berubah, bukan ditulis
> sekali lalu ditinggalkan. Cara mengukurnya ada di §6 — jangan menyalin angka
> dari sini ke dokumen lain tanpa mengukur ulang.

| | |
|---|---|
| Item QUEUE | F5-1 (Fase 5) |
| Risiko yang dijawab | **C-7 — yang paling mungkin membunuh proyek** |
| Ditulis | 2026-08-04 |
| Sumber data | `docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md`, diukur ulang §6 |

---

## 0. Dua koreksi terhadap judul item ini

**Angkanya bukan 93, melainkan 54.** Judul F5-1 menyebut "93 sub-menu". Hitung
ulang dari **kolom Status** taksonomi (§6) menghasilkan **57 baris 🔴**, dan
**54** sesudah tiga koreksi status di §2b.

> **Saya salah dulu di dokumen ini.** Versi pertama menulis **64**, karena
> skrip hitungnya memakai `baris.includes('🔴')` — mencari tanda merah **di
> mana pun di baris**, termasuk kolom *Catatan*. Itu persis kesalahan yang
> taksonomi peringatkan sendiri ("ikut menghitungnya menggelembungkan angka
> ±12%"), dan saya mengulanginya sambil mengutip peringatannya.
>
> Sembilan baris 🟡 memuat 🔴 di Catatan sebagai keterangan *sebagian sudah
> hidup* — misalnya `Laporan keuangan` (arus kas ✅, neraca & L/R 🔴) dan
> `KPI` (CPI/SPI/margin ✅, DSO/backlog 🔴). Menghitungnya sebagai "belum
> dimulai" akan membuat dua item INTI di §3 tampak jauh lebih besar daripada
> kenyataannya. Skrip di §6 sudah diperbaiki agar memeriksa kolom Status saja.

**Triase "kerjakan / tidak" SUDAH ADA dan tidak diulang.** Bagian *"KEPUTUSAN
ATAS 68 SUB-MENU MERAH — 2026-08-01"* di taksonomi menjawab pertanyaan itu
(🟢 kerjakan 23 · 🟡 tahan 18 · 🔴 jangan bangun 12 · ⚪ tercakup 5).

Dokumen ini menjawab pertanyaan **yang berbeda**, dan itulah kenapa ia tetap
perlu ada:

| Dokumen | Menjawab |
|---|---|
| Taksonomi §KEPUTUSAN (2026-08-01) | *Apakah ini layak dibangun sama sekali?* |
| **F5-1 (dokumen ini)** | *Dari yang layak, mana yang harus habis LEBIH DULU?* |

Menjawab yang kedua tanpa yang pertama akan mengurutkan barang yang seharusnya
tak dibangun. Menjawab yang pertama saja meninggalkan 41 item layak-bangun
tanpa urutan — dan itulah bentuk nyata risiko C-7: bukan salah memilih fitur,
melainkan **mengerjakannya dalam urutan yang salah sampai kehabisan tenaga
sebelum produknya bisa dijual**.

---

## 1. Definisi tiga golongan

CHARTER menyebut INTI / PEMBEDA / TUNDA tanpa mendefinisikannya. Definisi di
bawah **sudah diratifikasi founder 2026-08-04** — `RATIFIKASI.md` **R-010** —
dan karenanya mengikat, bukan lagi usulan.

### INTI — tanpa ini produk tidak bisa dijual

Sub-menu yang ketiadaannya membuat **calon pelanggan pertama menolak**, bukan
sekadar mengeluh. Ujinya satu kalimat:

> *Kalau demo berhenti di sini, apakah calon pelanggan pergi?*

INTI **bukan** "yang paling banyak dipakai". Fitur yang dipakai tiap hari tapi
punya jalan memutar (ekspor Excel, WhatsApp) bukan INTI — ia menyakitkan, tapi
tak mematikan transaksi.

### PEMBEDA — alasan memilih kita, bukan pesaing

Sub-menu yang menaikkan salah satu dari **Lima Pembeda ERP kontraktor**
(`PETA-PRIORITAS-ERP.md` §6): cost control berlapis · EVM · WIP/PSAK ·
rekonsiliasi material · rantai kontrak.

Tanpa PEMBEDA produk **tetap bisa dijual**, tapi bersaing pada harga melawan
software akuntansi umum — pertarungan yang tak bisa dimenangkan aplikasi baru.

### TUNDA — berguna, tapi tak ada yang menunggunya

Berguna dan mungkin diminta suatu hari, tapi **belum ada pemakai nyata yang
menunggunya sekarang**. Membangunnya berarti menebak bentuknya, dan bentuk yang
salah lebih mahal daripada belum ada — ia harus dirawat selamanya sambil
menghalangi bentuk yang benar.

> **Aturan urutan (CHARTER):** INTI habis dulu, baru PEMBEDA. TUNDA tak
> dikerjakan sampai ada pemicu tertulis.

---

## 2. Yang dikeluarkan lebih dulu — 11 dari 54

Ketiga golongan hanya berlaku untuk yang **layak dibangun**. Berikut yang sudah
diputuskan tidak, atau ternyata sudah hidup.

### 2a. Sudah diputuskan JANGAN DIBANGUN — 11 item

Keputusan 2026-08-01 menyebut **12**; satu di antaranya (`multi-tenant`) sudah
tak berstatus 🔴 lagi setelah koreksi §2b, jadi yang tersisa di daftar merah
adalah 11.

Keputusan 2026-08-01, tidak dibuka ulang di sini:

| Item | Alasan singkat |
|---|---|
| Payroll staf · Potongan statutori (BPJS) · PPh 21 | Aturan pajak berubah tiap tahun; salah hitung = urusan hukum, bukan bug |
| Rekonsiliasi bank · Tutup buku periode | Software akuntansi mengerjakannya lebih baik; integrasi lebih murah |
| Report builder | Taksonomi sendiri menandainya "jangan dibangun" — membangun Excel di dalam ERP |
| Rekrutmen & onboarding · Cuti & izin · Penilaian kinerja · Sertifikasi & kompetensi | Ini HRIS, bukan ERP kontraktor |
| Absensi & timesheet (staf kantor) | Sama — beda dari absensi LAPANGAN, yang tetap dihitung |

### 2b. Status taksonomi ternyata sudah basi — 3 item, dikoreksi 2026-08-04

Ketiganya **sudah dikeluarkan** dari angka 54 di atas (57 → 54).

Kenyataan diukur, dokumen menyesuaikan (CLAUDE.md §0):

| Item | Sebelum | Sesudah | Bukti |
|---|---|---|---|
| Backup & restore | 🔴 | ✅ | F0-13/F0-14 · latihan pemulihan mingguan, **RTO terukur 61 detik**, 124/124 tabel · 377/377 policy |
| Mode offline | 🔴 | 🟡 | F4-3 · antrean di 6 jalur tulis mandor · 4 jaminan + mutation-test 6/6 |
| Multi-tenant | 🔴 | 🟡 | 45/123 tabel ber-`company_id` (sisanya lewat rantai FK, klasifikasi F2-2) · RLS 123/123 · 5 kebocoran nyata ditutup di Fase 2 · ADR-010 |

### 2c. Sembilan baris 🟡 yang sebagian sudah hidup — TIDAK dihitung merah

Ini yang membuat versi pertama dokumen ini salah (§0). Kesembilannya berstatus
🟡, jadi **tak masuk angka 54** — tapi bagian yang masih 🔴 di dalamnya tetap
pekerjaan nyata, dan diperlakukan sebagai **penyempurnaan item hidup**, bukan
item baru:

| Baris 🟡 | Yang sudah hidup | Yang masih 🔴 |
|---|---|---|
| Laporan keuangan | Arus kas | Neraca & L/R — **INTI #1** |
| KPI: CPI, SPI, margin, DSO, backlog | CPI/SPI per proyek · margin | DSO · backlog |
| Profitabilitas per proyek / cost code | per proyek (`/finance/profitability`) | per cost code — **PEMBEDA** |
| Foto + geotag | Foto | geotag (0 kolom GPS) — **INTI #8** |
| Dokumentasi foto | Migrasi 097/098, bucket privat | geotag (sama dengan di atas) |
| Master Subkontraktor | Sistem mandor (padanan lokal) | subkon formal ber-kontrak |
| e-Faktur / e-Bupot | Pencatatan nomor · rekap pajak · status | generate → pakai Coretax (jangan dibangun) |
| Mode offline | Antrean tulis 6 jalur (F4-3) | foto · pembacaan offline |
| Multi-tenant | Isolasi data · RLS · ADR-010 | penyediaan tenant · langganan (F7-1) |

**Sisa yang ditriase: 54 − 11 = 43 item merah**, ditambah bagian-🔴 dari
sembilan baris 🟡 di atas yang masuk INTI/PEMBEDA sebagai penyempurnaan.

Pembagiannya: **INTI 7 · PEMBEDA 11 · TUNDA 25** = 43. Ditambah dua
penyempurnaan 🟡 di INTI (laporan keuangan, geotag) dan satu di PEMBEDA
(profitabilitas per cost code), daftar kerjanya menjadi **INTI 9 · PEMBEDA 12 ·
TUNDA 25**.

---

## 3. INTI — 9 item

Diurutkan sesuai ketergantungan, bukan besarnya pekerjaan.

Kolom **Mulai dari** menjelaskan apakah item ini dibangun dari nol atau
menyempurnakan yang sudah hidup — dua item INTI ternyata yang kedua (§2c).

| # | Sub-menu | Kelompok | Rusak kalau tak ada | Mulai dari | Prasyarat data | Bobot |
|---|---|---|---|---|---|---|
| 1 | **Laporan keuangan** — neraca & L/R | 14 Keuangan | Owner tak bisa melihat posisi perusahaan; ini pertanyaan pertama tiap calon pelanggan | 🟡 arus kas ✅ · **GL sudah sehat** (§3a) | akun diklasifikasi neraca/L-R | **M** |
| 2 | **Interim Payment Certificate (IPC)** | 15 Penagihan | Termin tak bisa ditagih secara formal ke owner proyek; ini pintu masuk UANG | 🔴 nol | progress terverifikasi + retensi | L |
| 3 | **Retensi subkontrak** | 8 Subkontraktor | Retensi mandor/subkon tak terlacak → dibayar penuh padahal harus ditahan; kebocoran uang langsung | 🔴 nol | kontrak subkon + termin | M |
| 4 | **Claims management** | 3 Kontrak | Klaim tambah-kurang tak punya jejak; saat sengketa, tak ada bukti | 🔴 nol | kontrak + variation order | L |
| 5 | **Surat masuk/keluar (correspondence)** | 3 Kontrak | Korespondensi kontraktual tak terdaftar → notifikasi keterlambatan tak bisa dibuktikan | 🔴 nol | register dokumen | M |
| 6 | **Instruksi lapangan** | 9 Lapangan | Perintah lisan tak berjejak; dasar klaim biaya tambahan hilang | 🔴 nol | proyek + scope | S |
| 7 | **Non-Conformance Report (NCR)** | 9 Lapangan | Ketidaksesuaian mutu tak punya siklus tutup; tender pemerintah mensyaratkannya | 🔴 nol | punch list (✅ ada) | M |
| 8 | **Geotag foto** | 20 Mobile | Foto tanpa koordinat tak membuktikan pekerjaan dilakukan **di lokasi itu** — dasar sengketa progres | 🟡 foto sudah hidup (097/098) | kolom GPS (0 kolom hari ini) | S |
| 9 | **Absensi lapangan** | 20 Mobile | Upah harian dihitung dari ingatan mandor; ini sumber selisih paling sering | 🔴 nol | worker + assignment (✅ ada) | M |

### 3a. INTI #1 TIDAK terblokir — koreksi, saya salah menyatakannya

Versi pertama dokumen ini menulis bahwa laporan keuangan **terblokir R-001**
(cacat P0 migrasi 047 vs 167). **Itu salah, dan salahnya cukup besar untuk
mengubah rencana kerja** — ia membuat item paling penting tampak tak bisa
disentuh sama sekali.

Diukur 2026-08-04, bukan dibaca dari dokumen:

| Yang diperiksa | Hasil |
|---|---|
| `RATIFIKASI.md` R-001 | **SELESAI** — 047 dipensiunkan jadi no-op berkomentar, penegas bentuk `175` terpasang, terbukti bekerja di lingkungan bersih |
| `accounts` · `journal_entries` · `journal_entry_lines` | ketiganya **punya `company_id`** (`introspect.mjs`) — bentuk 167 yang menang, bukan 047 |
| `apps/api/src/routes/v1/gl.ts` | **7 endpoint hidup**: bagan akun · jurnal · posting · void · buku besar · **neraca saldo** |
| `apps/web/app/(dashboard)/akuntansi/page.tsx` | halaman hidup: Bagan Akun · Jurnal · Neraca Saldo (dengan pemeriksaan seimbang) |

**Fondasinya sehat dan sudah dipakai.** Yang benar-benar belum ada hanya dua
laporan turunan di atasnya — **neraca (balance sheet)** dan **laba/rugi** —
plus klasifikasi akun mana masuk neraca dan mana masuk L/R.

Karena itu bobotnya turun **L → M**, dan tak ada satu pun INTI yang terblokir.

**Kenapa hanya 9.** Uji "calon pelanggan pergi" sengaja ketat. Item seperti
CPM, resource histogram, atau tanda tangan elektronik memang membuat produk
lebih baik — tapi tak ada kontraktor yang membatalkan pembelian karena
ketiadaannya. Menaruhnya di INTI membuat kata "INTI" kehilangan arti, dan
daftar yang semuanya prioritas sama dengan tidak punya prioritas.

---

## 4. PEMBEDA — 12 item

Tiap item dipetakan ke pembeda yang dinaikkannya. Angka dalam kurung adalah
skor hari ini (`PETA-PRIORITAS-ERP.md` §6).

### Cost control berlapis (3/5) — 5 item

| Sub-menu | Yang dinaikkan | Bobot |
|---|---|---|
| **Cost Value Reconciliation (CVR)** | Membandingkan biaya terpakai vs nilai terpasang; inilah yang membedakan ERP kontraktor dari pencatat biaya | L |
| **Profitabilitas per cost code** (🟡 per proyek sudah hidup di `/finance/profitability`) | Laba per **cost code**, bukan hanya per proyek — inilah yang menunjukkan pekerjaan mana yang merugi | S |
| **Manajemen contingency** | Cadangan risiko terlacak, bukan hilang ke dalam "biaya lain-lain" | M |
| **Analisa keterlambatan** | Menghubungkan keterlambatan ke biaya — dasar klaim EOT | M |
| **Eskalasi harga** | Kenaikan harga material terhadap kontrak lama | S |

### Rekonsiliasi material (1,5/5 — paling lemah) — 3 item

| Sub-menu | Yang dinaikkan | Bobot |
|---|---|---|
| **Tracking waste / susut** | Selisih material dibeli vs terpasang — kebocoran terbesar di proyek konstruksi | M |
| **Transfer stok antar proyek** | Material pindah proyek tanpa jejak = selisih yang tak pernah terjelaskan | M |
| **Material milik klien (free issue)** | Material owner tercampur material sendiri | S |

### Rantai kontrak (4/5) — 2 item

| Sub-menu | Yang dinaikkan | Bobot |
|---|---|---|
| **Tender & award subkontraktor** | Menutup rantai owner → kontraktor → subkon | L |
| **Register asuransi** | Bukti pertanggungan saat klaim; sering disyaratkan kontrak | S |

### Procurement berbasis penawaran — 2 item

| Sub-menu | Yang dinaikkan | Bobot |
|---|---|---|
| **RFQ ke vendor** | Harga dari perbandingan, bukan dari satu vendor langganan | M |
| **Perbandingan penawaran (bid tabulation)** | Bukti pemilihan vendor — dasar audit pengadaan | M |

**Kenapa EVM dan WIP/PSAK tak muncul di sini.** Keduanya sudah 3,5/5 dan 4/5 —
sudah hidup, tinggal disempurnakan (WIP menunggu GL yang sama dengan INTI #1).
Yang butuh item baru adalah tiga pembeda yang masih rendah.

---

## 5. TUNDA — 25 item, dengan pemicunya

Tak dikerjakan sampai pemicunya nyata. **Kalau pemicu terjadi, item pindah ke
INTI atau PEMBEDA — bukan langsung dikerjakan** dari daftar ini.

| Sub-menu | Jml | Pemicu yang membangunkannya |
|---|---|---|
| Prakualifikasi vendor · Dokumen prakualifikasi | 2 | Vendor > 30, atau ada tender yang mensyaratkan |
| Evaluasi kinerja subkontraktor · Kepatuhan (izin, asuransi, pajak) | 2 | Subkon formal ber-kontrak mulai dipakai (hari ini sistemnya mandor) |
| Kalender kerja & hari libur | 1 | Penjadwalan mulai dipakai untuk komitmen kontraktual |
| Critical path (CPM) · Resource histogram / leveling · Method statement | 3 | Proyek dengan jadwal yang benar-benar dinegosiasikan owner |
| Kontrak payung / blanket order · Expediting & logistik · Evaluasi kinerja vendor | 3 | Volume pengadaan berulang dari vendor yang sama |
| Log pemakaian alat · Maintenance terjadwal · Biaya operasional per alat (BBM, operator) | 3 | Alat **milik sendiri** > 5 unit (hari ini mayoritas sewa) |
| Integrasi penyusutan → GL | 1 | Register aset terisi — GL-nya sendiri **sudah sehat** (§3a), yang belum ada asetnya |
| Izin kerja (work permit) | 1 | Proyek dengan syarat K3 formal dari owner |
| Transmittal · Register gambar · Notulen rapat · Matriks distribusi | 4 | Proyek dengan pertukaran dokumen formal berlapis |
| Tanda tangan elektronik | 1 | Dokumen mulai ditolak karena butuh tanda tangan sah |
| Distribusi laporan terjadwal | 1 | Ada penerima tetap yang memintanya |
| Nota kredit | 1 | Ada retur/koreksi tagihan pertama |
| Material request (mobile) · Checklist inspeksi (mobile) | 2 | Setelah mode offline penuh — F4-3 baru menutup jalur TULIS |
| | **25** | |

### Tiga yang TIDAK dihitung di sini — sudah 🟡, bukan merah

Ketiganya punya bagian yang masih 🔴 (§2c), tapi karena sebagian sudah hidup,
ia berjalan sebagai penyempurnaan — bukan item baru yang menunggu pemicu:

| Baris 🟡 | Pemicu penyempurnaannya |
|---|---|
| **KPI** (DSO · backlog) | Setelah PEMBEDA cost control jalan — KPI tanpa data di belakangnya adalah angka hiasan |
| **e-Faktur / e-Bupot** (generate) | Tidak ada — generate diputuskan pakai Coretax |
| **Master Subkontraktor** (subkon formal) | Subkon > 10 aktif bersamaan |

---

## 6. Cara mengukur ulang — jangan salin angka dari sini

```bash
# ⚠️ Perhatikan `sel[2] === '🔴'` — kolom Status, BUKAN `b.includes('🔴')`.
# Versi pertama dokumen ini memakai includes() dan mendapat 64, bukan 54:
# sembilan baris 🟡 memuat 🔴 di kolom Catatan sebagai keterangan "sebagian
# sudah hidup". Selisih 19% — cukup untuk salah memprioritaskan.
node --input-type=module - <<'JS'
import {readFileSync} from 'node:fs'
const t = readFileSync('docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md','utf8').replace(/\r/g,'')
const atas = t.split('## KEPUTUSAN ATAS')[0]
let bagian = '?'; const merah = []
for (const b of atas.split('\n')) {
  const h = b.match(/^## (\d+\..+)$/); if (h) { bagian = h[1]; continue }
  if (!b.startsWith('|')) continue
  const sel = b.split('|').map(s => s.trim())
  if (sel[2] === '🔴') merah.push({ bagian, nama: sel[1] })   // ← kolom Status
}
console.log('MERAH (kolom Status):', merah.length)
JS

# Sub-menu yang digarap TANPA jejak rancangan (penjaga terpisah, item lain)
node apps/api/scripts/audit-rancangan-submenu.mjs
```

Dua alat itu menjawab pertanyaan berbeda: yang pertama *"apa yang belum
dikerjakan"*, yang kedua *"apa yang dikerjakan tanpa dirancang"*. Jangan
menukarnya.

---

## 7. Yang menunggu founder

**Nihil — semuanya sudah terjawab.**

1. ~~Definisi tiga golongan (§1) belum diratifikasi.~~
   ✅ **DIRATIFIKASI 2026-08-04** — founder: *"okee setujuuu"*.
   Tercatat sebagai **R-010** di `RATIFIKASI.md`. Definisi §1 sekarang
   **mengikat**, dan dokumen ini adalah penerapannya. Membatalkannya: tulis
   `TOLAK R-010` + definisi pengganti; isi ketiga daftar disusun ulang,
   penjaganya tak perlu diubah.

### Yang SUDAH terjawab — tak perlu ditunggu

| Butir versi pertama | Kenyataan |
|---|---|
| *"INTI #1 terblokir R-001"* | **SALAH.** R-001 sudah SELESAI; GL sehat dan tenant-aware; 7 endpoint + halaman akuntansi hidup. Yang belum hanya neraca & L/R. Bukti: §3a |
| *"Angka judul QUEUE (93) tak cocok kenyataan (64)"* | Angka **64 itu pun salah** (§0). Yang benar 54. Judul QUEUE sengaja **tidak** diubah — biar terlihat angkanya pernah salah dan kapan dikoreksi |
