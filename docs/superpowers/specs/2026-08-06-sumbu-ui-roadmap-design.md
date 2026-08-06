# Sumbu UI/UX + penjaga status — desain

**Tanggal:** 2026-08-06 · **Status:** menunggu review founder

---

## 0. Ringkasan satu paragraf

Roadmap Puraloka matang pada satu sumbu (fondasi, DB, penjaga arsitektural) dan
buta pada sumbu lain (produk yang dilihat orang). Tiga item ditambahkan untuk
menutup itu. Tetapi pengukuran saat merancang dokumen ini **membalik premisnya**:
cacat yang aktif merugikan bukan "modul dibangun tanpa UI" — itu terjadi sekali
dan sudah diperbaiki — melainkan **status dokumen membusuk sementara kode maju**.
Penjaga utama karena itu adalah `audit-status-vs-kode`, bukan `audit-modul-tanpa-ui`.

---

## 1. Bukti yang mengubah rancangan

Rancangan awal mengasumsikan tiga INTI tanpa UI (#7 NCR, #8 geotag, #9 absensi),
diturunkan dari kolom Status `F5-1-TRIASE-SUBMENU.md`. **Asumsi itu salah.**
Diukur terhadap kode 2026-08-06:

| # | INTI | Triase | Kenyataan kode |
|---|---|---|---|
| 1 | Laporan keuangan | 🟡 sebagian | ✅ `components/neraca-laba-rugi.tsx` + `buku-besar.tsx` |
| 2 | IPC | 🔴 nol | ⚠️ **benar belum** — `routes/v1/termin-payment.ts` nol endpoint terdaftar |
| 3 | Retensi subkontrak | 🔴 nol | ✅ `app/(dashboard)/mandor/retensi/page.tsx` + `retensi-section.tsx` |
| 4 | Klaim | 🔴 nol | ✅ `klaim-section.tsx` → `/api/v1/projects/{id}/claims` |
| 5 | Surat | 🔴 nol | ✅ `surat-section.tsx` → `/api/v1/projects/{id}/letters` |
| 6 | Instruksi lapangan | 🔴 nol | ✅ `instruksi-lapangan-section.tsx` → `/field-instructions` |
| 7 | NCR | 🔴 nol | ✅ `app/(dashboard)/mutu/ncr/page.tsx` |
| 8 | Geotag foto | 🔴 nol | ✅ migrasi `190_geotag_foto.sql` + `penanda-lokasi.tsx` dipakai `photo-gallery.tsx` |
| 9 | Absensi lapangan | 🔴 nol | ✅ `app/(dashboard)/mandor/absensi/page.tsx` |

**8 dari 9 INTI sudah punya UI.** Enam baris dokumen (#3–#9 selain #8 yang 🟡)
menyatakan "🔴 nol" untuk modul yang hidup.

### 1a. Ini kelas cacat yang dokumen itu sendiri sudah catat

`F5-1-TRIASE-SUBMENU.md` §3a berjudul *"INTI #1 TIDAK terblokir — koreksi, saya
salah menyatakannya"*. Cacat yang sama kini terbukti pada **enam item lagi**.
Sekali adalah kekeliruan; tujuh kali adalah **cacat sistemik tanpa penjaga**.

`audit-triase-submenu.mjs` memeriksa tiap sub-menu 🔴 muncul tepat sekali di
salah satu golongan triase. **Tak satu pun penjaga memeriksa apakah 🔴 masih
benar.** Kebusukan status tidak terjaga.

### 1b. Kesalahan saya sendiri saat merancang — sumber syarat desain

Pola deteksi pertama saya, `/api/v1/<modul>`, gagal menemukan #4/#5/#6 karena
endpoint-nya bersarang: `/api/v1/projects/{id}/claims`. Penjaga yang memakai
pola naif itu akan **merah palsu pada empat modul sehat** — mekanisme persis
yang membunuh kepercayaan pada penjaga.

Ini menegaskan preseden yang sudah tertulis di header
`audit-taksonomi-vs-kode.mjs`: versi keyword-matching-nya dibuang karena memberi
skor 1.00 pada modul ber-kode nol. **Peta ditulis tangan bukan preferensi gaya —
ia wajib.**

---

## 2. Tiga item

### F8-1 — `audit-status-vs-kode` (penjaga utama)

**Yang dijaga:** sub-menu bertanda 🔴 yang buktinya sudah ada di kode.

**Cara kerja:** memperluas `audit-taksonomi-vs-kode.mjs` yang sudah ada —
skrip itu sudah melaporkan "status BASI (ada bukti)", tetapi **tak punya satu
pun panggilan `exit` dan tidak terdaftar di `ci.yml`** (diverifikasi 2026-08-06).
Ia alat diagnosa yang harus dijalankan manual, bukan penjaga. Itu sebabnya enam
baris basi §1 bisa bertahan tanpa ada yang menabraknya. F8-1 menaikkannya jadi
penjaga ber-ratchet yang berjalan di CI.

- Bukti yang dipakai: berkas route/lib · tabel ber-`CREATE TABLE` · path endpoint
  terdaftar · **(baru)** endpoint dipanggil dari `apps/web/**`
- Peta modul → bukti **ditulis tangan**, meneruskan `PETA` yang sudah ada
- Modul belum terpetakan dilaporkan terpisah, **bukan** diam-diam dihitung hijau

**Lantai:** `status-lantai.json`, diukur saat implementasi. Naik → merah.
Turun → lantai ikut turun otomatis (pola `coverage-lantai.json`).

**Kriteria selesai:**
- penjaga merah bila satu sub-menu 🔴 diberi bukti baru tanpa status diperbarui
- terbukti bisa merah lewat mutasi sengaja (pola wajib repo ini)
- terpasang di `.github/workflows/ci.yml`

### F8-2 — `audit-modul-tanpa-ui` (pelengkap)

**Yang dijaga:** modul INTI yang endpoint-nya tak pernah dipanggil dari
`apps/web/**` — cacat yang tercatat di commit `db463d9`: *"Endpoint
`retensi-register` yang saya banggakan tak pernah dipanggil dari mana pun."*

**Lantai: 1** (INTI #2 IPC). Nilainya **pencegahan regresi**, bukan pekerjaan
mendesak — 8 dari 9 INTI sudah lolos hari ini.

**Syarat mengikat:** peta modul → endpoint ditulis tangan, **wajib** menampung
endpoint bersarang `/projects/{id}/…` (§1b).

### F8-3 — coverage: kurangi berkas route ber-coverage NOL

**Bukan** mengejar 70% global. `COVERAGE-BASELINE.md` sudah mendiagnosis dengan
benar: branches 68%, functions 82%, lines 32% → masalahnya **sebaran, bukan
kedalaman**.

**Target:** jumlah berkas `routes/v1/*.ts` ber-coverage nol, dengan lantai
ratchet sendiri. Daftar 27 di baseline **wajib diukur ulang** saat eksekusi
(F1-8 sudah menutup `companies.ts`), bukan disalin.

### F5-2 — 9 INTI jadi item QUEUE

Tiap INTI jadi satu entri ber-`kriteria_selesai` yang menyebut UI eksplisit.
Delapan berstatus sesuai kenyataan §1; #2 (IPC) `wip`. Sekaligus **mengoreksi
dokumen triase** — enam baris 🔴 yang sudah tidak benar.

---

## 3. Urutan eksekusi

```
1. Koreksi F5-1-TRIASE-SUBMENU.md   ← angka §1, tanpa ini semua turunannya salah
2. F8-1 audit-status-vs-kode        ← penjaga cacat yang aktif
3. F5-2 turunkan 9 INTI ke QUEUE
4. F8-2 audit-modul-tanpa-ui
5. F8-3 coverage sebaran
```

Koreksi dokumen didahulukan karena **penyebut roadmap bergantung padanya** —
angka "% selesai" dihitung dari status taksonomi.

---

## 4. Yang sengaja TIDAK masuk (YAGNI)

| Ditolak | Alasan |
|---|---|
| Penjaga navigasi/sidebar (opsi C) | Ditunda sampai F8-1/F8-2 stabil. Dua penjaga baru yang serentak merah = ambang dilonggarkan, penjaga jadi hiasan. |
| Coverage 70% global | Target salah — lihat F8-3. |
| Menyambungkan `ukur-layar-kosong.mjs` | Sudah ada dan jalan; bukan pekerjaan baru. |
| Penjaga diturunkan dari nama modul | Terbukti gagal dua kali (§1b + header `audit-taksonomi-vs-kode.mjs`). |

---

## 5. Risiko

**Penjaga yang merah palsu akan dimatikan.** Mitigasi: peta ditulis tangan,
lantai diukur bukan diasumsikan, tiap penjaga dibuktikan bisa merah lewat mutasi
sengaja sebelum dianggap selesai.

**Koreksi dokumen bisa ikut basi.** Itu justru yang F8-1 jaga — koreksi tanpa
penjaga hanya memindahkan tanggal kebusukan berikutnya.
