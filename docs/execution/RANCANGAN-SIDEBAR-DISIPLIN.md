# Rancangan sidebar disiplin — satu route, satu link

> **Status:** rancangan, menunggu dilihat founder sebelum dieksekusi.
> Diminta 2026-08-07: *"rombak lagi aja sidebar dan routingnya biar disiplin.
> ketika 1 halaman dibuka, link di sidebarnya harus aktif dan menu induknya
> terbuka, tapi kalo link sidebar yg aktifnya 2 kan jadi aneh. jadi menurut
> saya lebih baik rombak aja semuanya, gapapa untuk tidak mengikuti aturan
> sebelumnya."*

---

## 1. Kenapa tambalan sebelumnya tak akan pernah cukup

Sepanjang hari ini menu diperbaiki dari 144 item berbagi href menjadi 23.
Sisa 23 itu dipertahankan dengan alasan yang masuk akal: *"staf HR mencari upah
di kelompok SDM, pelaksana di kelompok Mandor."*

**Alasan itu benar, tapi ia menyelesaikan masalah yang salah.** Selama satu
route bisa dicapai dari dua tempat di sidebar, penanda aktif tak punya jawaban
tunggal — dan `menu-berbagi-href.ts` hanya memilih salah satu untuk disorot
sambil meredupkan yang lain. Itu menyembunyikan gejala, bukan menghapus sebab.

Founder menunjuk tepat ke akarnya: **dua link menyala itu aneh, dan tak ada
penjelasan yang membuatnya tidak aneh.**

---

## 2. Aturan baru — tiga, tanpa pengecualian

### R-1. Satu route = tepat satu link sidebar

Tidak ada sinonim. Tidak ada "dua kelompok mencari hal yang sama". Kalau dua
peran mencari halaman yang sama, **halaman itu diletakkan di satu tempat**, dan
peran lain menemukannya lewat pencarian (`⌘K`) atau lewat tautan di halaman
yang mereka pakai sehari-hari.

Konsekuensi yang saya terima: staf HR yang mencari "Upah" di kelompok SDM tak
akan menemukannya, karena ia hidup di kelompok Mandor. Itu biaya nyata — tapi
lebih kecil daripada sidebar yang penanda aktifnya tak bisa dipercaya.

### R-2. Kelompok adalah WADAH, bukan tujuan

Kelompok induk tidak punya `href`. Mengkliknya membuka/menutup daftar anaknya,
titik. Sebelumnya sebagian kelompok punya href sendiri, dan itu melahirkan
pertanyaan "kapan induk menyala, kapan anaknya?" yang tak pernah tuntas.

### R-3. Menu hanya untuk halaman yang ADA

Menu yang halamannya belum dibangun **tidak muncul di sidebar**. Saat ini 108
dari 228 menu menunjuk `/m/<key>` — hampir separuh sidebar adalah janji.

Rencananya tetap terbaca: halaman `/m/<key>` tetap hidup dan tetap menjelaskan
apa yang akan dibangun, tapi jalan masuknya dari **satu halaman "Peta Modul"**
di kelompok Administrasi — bukan tersebar sebagai 108 item yang mengecewakan
satu per satu.

---

## 3. Sidebar baru — 74 route, 74 link, 13 kelompok

Disusun dari route yang BENAR-BENAR ADA (`find apps/web/app -name page.tsx`),
bukan dari taksonomi ideal.

```
Beranda                          /dashboard

Proyek                    (5)
  Daftar Proyek                  /proyek
  Keterlambatan                  /proyek/keterlambatan
  Jadwal & Jalur Kritis          /jadwal
  Kalender Kerja                 /kalender
  Klien                          /klien

Kontrak                   (4)
  Register Kontrak               /kontrak
  RFI                            /kontrak/rfi
  Asuransi                       /kontrak/asuransi
  Tender                         /tender

Estimasi & Biaya          (3)
  Estimasi & RAB                 /estimasi
  Akuntansi                      /akuntansi
  Laporan & BI                   /laporan

Keuangan                  (8)
  Ringkasan Keuangan             /keuangan
  Invoice                        /keuangan/invoice
  Pembayaran Masuk               /keuangan/pembayaran
  Sertifikat IPC                 /keuangan/ipc
  Kasbon                         /keuangan/kasbon
  Arus Kas                       /keuangan/arus-kas
  Profitabilitas                 /keuangan/profitabilitas
  Contingency                    /keuangan/contingency

Kas & Bank                (4)
  Ringkasan Kas                  /kas
  Akun Kas                       /kas/akun
  Pengeluaran                    /kas/pengeluaran
  Transfer                       /kas/transfer

Piutang                   (1)
  Piutang & Retensi              /piutang

Pengadaan                 (13)
  Ringkasan Pengadaan            /procurement
  Permintaan Material            /procurement/permintaan
  Purchase Order                 /procurement/pesanan
  Penerimaan Barang              /procurement/penerimaan
  Supplier                       /procurement/supplier
  Kualifikasi Vendor             /procurement/kualifikasi
  RFQ & Tabulasi                 /procurement/rfq
  Riwayat Harga                  /procurement/riwayat-harga
  Kontrak Payung & Logistik      /procurement/lanjutan
  Utang Supplier                 /procurement/hutang
  Pagu Material                  /procurement/material
  Stok                           /procurement/stok
  Laporan Pengadaan              /procurement/laporan

Gudang                    (3)
  Rekonsiliasi Material          /gudang/rekonsiliasi
  Transfer Antar Proyek          /gudang/transfer
  Material Milik Klien           /gudang/material-klien

Mandor & Subkon           (9)
  Ringkasan Mandor               /mandor
  Penugasan                      /mandor/penugasan
  Daftar Tukang                  /mandor/tukang
  Absensi                        /mandor/absensi
  Upah                           /mandor/upah
  Kasbon Tukang                  /mandor/kasbon
  Penagihan Progress             /mandor/penagihan
  Retensi Subkon                 /mandor/retensi
  Tender Subkon                  /mandor/tender

Lapangan                  (4)
  Ringkasan Lapangan             /lapangan
  Punch List                     /lapangan/punch-list
  Inspeksi                       /lapangan/inspeksi
  Submittal                      /lapangan/submittal

Mutu & Kepatuhan          (2)
  NCR                            /mutu/ncr
  Kepatuhan & K3                 /kepatuhan

Alat & Dokumen            (3)
  Aset & Alat                    /aset
  Operasional Alat               /aset/operasional
  Kendali Dokumen                /dokumen/kendali

Administrasi              (15)
  Pengguna & Role                /users
  Matriks Izin                   /pengaturan/roles
  Peta Modul                     /peta-modul        ← BARU
  Notifikasi                     /notifications
  Audit Log                      /audit
  Pemeliharaan Sistem            /sistem
  Profil Perusahaan              /pengaturan
  Badan Usaha                    /pengaturan/perusahaan
  Konfigurasi Keuangan           /pengaturan/keuangan
  Satuan                         /pengaturan/satuan
  Kategori Pekerjaan             /pengaturan/kategori-pekerjaan
  Tujuan Kasbon                  /pengaturan/kasbon-purposes
  Rantai Approval                /pengaturan/approval
  Aturan Notifikasi              /pengaturan/notifikasi
  Situs Publik                   /pengaturan/situs
```

**74 link, 74 route, nol duplikat.**

---

## 4. Yang HILANG dari sidebar, dan ke mana perginya

**108 menu berstatus "belum dibangun" tidak lagi muncul.** Sidebar menyusut
dari 228 item jadi 74 — dan yang hilang seluruhnya adalah janji, bukan fitur.

Rencananya tetap terbaca lewat halaman baru **`/peta-modul`**: daftar seluruh
modul beserta statusnya (hidup · sebagian · rencana · eksternal · gerbang),
persis isi `peta-menu.ts` yang selama ini hanya bisa dilihat satu per satu
lewat `/m/<key>`.

Itu justru lebih berguna: satu halaman yang menjawab *"apa saja yang ada dan
belum ada di produk ini"* mengalahkan 108 item sidebar yang masing-masing
mengecewakan saat diklik.

---

## 5. Kode yang ikut berubah

| Berkas | Perubahan |
|---|---|
| `lib/menu-berbagi-href.ts` | **DIHAPUS** — tak ada lagi href yang dibagi |
| `components/sidebar.tsx` | penanda "belum ada halaman" dihapus; `isActive` cukup satu aturan |
| `lib/rute-aktif.ts` | tetap, sudah benar |
| `audit-menu-berbagi-href.mjs` | ratchet → **larangan mutlak** (harus 0) |
| penjaga baru | tepat 1 link aktif + induknya terbuka, diuji di peramban |

---

## 6. Yang saya minta Anda periksa sebelum saya eksekusi

1. **Pengelompokan** di §3 — ada yang terasa salah tempat?
2. **R-1 tanpa pengecualian**: "Upah" hanya di kelompok Mandor, tidak di SDM.
   Anda setuju biaya ini?
3. **Kelompok "SDM & Payroll" hilang** — isinya (karyawan, payroll, BPJS, PPh21)
   seluruhnya belum dibangun, jadi tak ada route untuk ditaut. Ia kembali saat
   halamannya ada.
4. **`/peta-modul`** sebagai pengganti 108 item — cukup?

Kalau tak ada yang perlu diubah, saya jalankan seluruhnya beserta penjaganya.
