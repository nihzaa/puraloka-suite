# Rencana Menuntaskan Entri `sebagian`

> Disusun 2026-08-17. Peta Modul saat pemutakhiran terakhir (2026-08-18): **224 hidup / 9 sebagian / 0 rencana**.
>
> **Golongan D sudah dikerjakan saat dokumen ini ditulis** — lihat bagian D.
>
> Dokumen ini menjawab satu pertanyaan: **dari 11 yang tersisa, mana yang
> benar-benar pekerjaan kode?** Jawabannya **tiga**. Sisanya menunggu keputusan
> founder, kredensial pihak ketiga, atau rilis — dan menyebutnya "belum
> dikerjakan" menciptakan hutang yang tak ada.
>
> Cara mengukur ulang:
> ```bash
> node -e "const s=require('fs').readFileSync('apps/web/lib/peta-menu.ts','utf8');
> const c={};for(const m of s.matchAll(/status: '(\w+)'/g))c[m[1]]=(c[m[1]]||0)+1;console.log(c)"
> ```

---

## Ringkasan

| Golongan | Jumlah | Artinya |
|---|---:|---|
| **A. Pekerjaan kode** | ~~3~~ → 2 | A1 SELESAI 2026-08-18; sisa A2 (addendum SPK) & A3 (versi dokumen) |
| **B. Menunggu keputusan founder** | 2 | masuk `RATIFIKASI.md`, bukan antrean kerja |
| **C. Menunggu pihak ketiga / rilis** | 3 | kredensial, kontrak komersial, atau distribusi aplikasi |
| ~~D. Status BASI~~ | ~~1~~ → **0** | **SELESAI** — `tg-tambah` diverifikasi lalu jadi `hidup` |
| **E. Sengaja `sebagian` selamanya** | 2 | batasnya keputusan sadar, bukan kekurangan |

---

## A. Pekerjaan kode — 1 selesai, 2 tersisa

### A1. ✅ SELESAI 2026-08-18 — `sy-import` sudah `hidup`

Ekspor dibangun persis seperti rencana di bawah: memakai `SKEMA` yang sama
dengan impor, memakai `lib/ekspor-tabel.ts` yang sudah ada, dan diuji
round-trip.

Yang **tidak** terduga: mutasi pertama LOLOS. Test round-trip versi pertama
cuma memeriksa nama kolom dikenali — dan `usulkanPemetaan` juga mencocokkan
nama kolom basis, jadi menggeser judul dari `label` ke `kunci` tetap hijau.
Dipertajam ke NILAI, lalu mutasi kedua (angka jadi teks ber-pemisah ribuan)
MERAH dengan `expected 65 to be 65000` — kesalahan seribu kali lipat.

Sisa yang tetap dicatat: impor **pegawai** belum bisa (`pegawai.user_id`
NOT NULL — perubahan rancangan, bukan penambahan skema).

<details><summary>Rencana asli (dipertahankan sebagai catatan)</summary>

#### `sy-import` — ekspor belum ada sama sekali

**Masalahnya bukan fitur kurang, melainkan menu yang berbohong.** Namanya
"Impor & Ekspor Data"; yang ada cuma impor. Orang yang membuka halaman ini
mencari tombol ekspor, tak menemukannya, lalu menyimpulkan aplikasinya rusak —
bukan menyimpulkan fiturnya memang belum ada.

Empat skema impor sudah hidup (material, pemasok, cost code, pekerja) dan
halaman `/sistem/impor` sudah generik.

**Rencana:**
1. `lib/ekspor-tabel.ts` SUDAH ada (dibangun untuk ekspor pajak) — pakai itu,
   jangan tulis ulang. Ia sudah menangani csv/xlsx/pdf/json plus kop tenant.
2. Ekspor memakai skema yang SAMA dengan impor, supaya berkas hasil ekspor
   bisa langsung diimpor kembali. Ekspor yang bentuknya berbeda dari impor
   menghasilkan berkas yang tak bisa dipakai untuk apa pun kecuali dibaca.
3. Urutan kolom mengikuti template impor. Kalau berbeda, orang yang menyunting
   hasil ekspor lalu mengimpornya akan memetakan kolom secara manual — dan
   salah petakan pada harga tak menimbulkan galat.

**Ukuran selesai:** `GET /sistem/ekspor?skema=<x>&format=<y>` untuk keempat
skema, test yang membuktikan hasil ekspor bisa diimpor kembali utuh (round-trip),
dan tombolnya di `/sistem/impor`.

**Yang TIDAK termasuk:** impor pegawai. `pegawai.user_id` NOT NULL, jadi tiap
baris menuntut akun pengguna lebih dulu — itu perubahan rancangan, bukan
penambahan skema. Kalau dipaksakan, importer akan membuat akun diam-diam untuk
tiap baris, dan akun yang lahir tanpa ada yang memutuskan adalah lubang izin.

</details>

---

### A2. `kt-subkon` — addendum SPK belum punya alur

SPK sudah bisa diterbitkan, ditandatangani, dan **dicetak** (2026-08-17).
Yang belum: mengubah lingkup SPK yang SUDAH ditandatangani.

**Kenapa ini bukan sekadar tombol edit.** SPK bertanda tangan terkunci —
nilai, lingkup, jangka waktu, dan denda tak boleh berubah. Itu benar. Tapi
lingkup pekerjaan di lapangan memang berubah, dan tanpa jalur addendum yang
sah, orang akan:

- menerbitkan SPK KEDUA untuk lingkup yang sama (layar sudah memperingatkan
  "SPK ganda", tapi memperingatkan bukan menyediakan jalan), atau
- menyunting basis langsung.

Keduanya lebih buruk daripada addendum yang dirancang.

**Rencana:**
1. `spk_addendum` ber-FK ke SPK induk, menyimpan DELTA (bukan salinan penuh) —
   nilai tambah/kurang, perubahan tanggal, alasan.
2. SPK induk TETAP tak berubah. Yang berubah hanya nilai efektif = induk +
   seluruh addendum sah. Mengubah induknya berarti kertas yang ditandatangani
   dan kertas yang tersimpan berbeda bunyi.
3. Cetak addendum memakai `lib/gambar-kop.ts` yang sama.
4. Trigger: addendum hanya boleh pada SPK berstatus `ditandatangani`.

**Ukuran selesai:** migrasi ber-verifikasi, endpoint CRUD, PDF, test yang
membuktikan nilai efektif berubah sementara nilai induk TIDAK.

---

### A3. `dk-register` — versi dokumen tak bisa dibandingkan

`documents.version` bertipe TEKS ber-default `"1.0"` dengan **nol constraint**,
dan unggahan baru MENIMPA yang lama.

**Yang membuat ini layak dikerjakan, dan yang membuatnya tidak mendesak:**
riwayat revisi yang benar-benar menentukan — gambar kerja — SUDAH punya
jalurnya sendiri (`register_gambar`: revisi bernomor, `digantikan_oleh`, tiga
status, dijaga migrasi 343). Jadi yang bocor bukan dokumen yang paling
berbahaya salah versi.

**Rencana:**
1. Ikuti pola `register_gambar`, jangan karang yang baru. Ia sudah terbukti:
   satu baris `berlaku` per (proyek, nomor) lewat index parsial, plus trigger
   yang menuntut pengganti bernomor sama & berevisi lebih baru.
2. `documents.version` → integer + kolom `digantikan_oleh`.
3. Migrasi backfill: seluruh baris yang ada jadi revisi 1 berstatus berlaku.

**⚠ Ini menyentuh data yang sudah ada** — masuk §8a.5, butuh konfirmasi
sebelum dijalankan.

---

## B. Menunggu keputusan founder (2) → `RATIFIKASI.md`

### B1. `md-subkon` — identitas subkon terpecah TIGA tabel

`workers` yang menawar · `users` (via `mandor_assignments`) yang mengerjakan ·
`suppliers` yang dievaluasi. **Tanpa FK penghubung.**

Satu orang bisa muncul di ketiganya sebagai tiga entitas yang tak saling
mengenal — dan evaluasi buruk di `suppliers` tak menghalangi orang yang sama
menang tender lewat `workers`.

**Kenapa ini keputusan, bukan tugas:** menyatukannya berarti memilih SATU
tabel sebagai identitas utama, dan ketiganya sudah dirujuk banyak modul.
Salah pilih berarti migrasi besar kedua. Founder perlu memutuskan: subkon itu
**perusahaan** (→ `suppliers`) atau **orang** (→ `workers`)?

### B2. `cc-cvr` — cakupan masih upah borongan

Nilai terpasang dihitung `borongan × progres`, bukan nilai kontrak penuh.
Melengkapinya menuntut tiap lingkup kerja punya `rab_category_id` — kolomnya
kini bisa diisi dari UI (2026-08-13), tapi **pengisiannya pekerjaan data**,
bukan kode.

**Yang perlu diputuskan:** apakah 20 lingkup kerja yang ada akan diisi
kategorinya, atau CVR memang cukup pada cakupan upah borongan.

---

## C. Menunggu pihak ketiga / rilis (3)

| Entri | Yang ditunggu | Catatan |
|---|---|---|
| `dk-esign` | e-meterai tersertifikasi **Peruri** | kontrak komersial. Verifikasi sidik SHA-256 + layarnya sudah jalan — yang kurang hanya materai berkekuatan hukum. |
| `bi-terjadwal` | kredensial **SMTP** tiap tenant | pemicunya sudah terdaftar (2026-08-17). Begitu SMTP diisi lewat Pengaturan, ia jalan tanpa perubahan kode. |
| `mb-progres` | **build & sebar** aplikasi mobile | kodenya lengkap (357 baris, dua mode, foto+izin runtime). Belum pernah dipakai mandor sungguhan. |

`mb-progres` sengaja TETAP `sebagian` walau kodenya lengkap: fitur yang tak
pernah dipakai orang sungguhan belum terbukti bekerja di tangan penggunanya —
dan mandor di lapangan punya HP lama, sinyal buruk, dan kebiasaan yang tak
bisa ditebak dari kode.

---

## D. ✅ SELESAI — `tg-tambah` sudah `hidup` (2026-08-17)

Catatannya sendiri menulis "SELESAI 2026-08-16" sementara statusnya masih
`sebagian`. Klaim itu **tidak** diterima begitu saja — diukur ke kode, dan
hasilnya berliku. Layak dicatat karena kesalahannya ada di ALAT, bukan di
modulnya.

**Pemeriksaan pertama saya menyimpulkan modulnya rusak.** Dua sebab:

```bash
grep -rn "…" apps/api/src --include=*.ts    # .tsx TIDAK ikut terjaring
grep -rln "penagihan" "apps/web/app/(dashboard)/keuangan/**"   # components/ di luar jangkauan
```

Keduanya memulangkan nol, dan saya membacanya sebagai "kodenya tak ada" —
lalu sempat menulis "koreksi" yang justru salah, dan mencabutnya kembali.
**Nol hasil bukan bukti ketiadaan**, pelajaran yang sama dengan jebakan grep
CR-saja di `CLAUDE.md` §7.

**Yang sebenarnya ada, dan terbukti:**

| Bagian | Tempat |
|---|---|
| Endpoint | `GET /api/v1/change-orders/siap-tagih` (`change-orders.ts:138`) |
| Komponen | `components/tagihan-co.tsx` + 8 test |
| Pemanggil | tombol & modal di `/keuangan/invoice` |

Endpoint yang disebut catatan lama (`POST /change-orders/:id/tagihan`) memang
**tak ada** — itu rancangan saya yang **dipensiunkan** merge R-013 butir 4
(`8933d438`), yang memilih rancangan branch lain.

**Ke-8 test-nya sempat MERAH**, dan itu pun bukan salah modulnya:
`d.showModal is not a function` — jsdom tak mengimplementasikan
`<dialog>.showModal()`, sementara SELURUH modal aplikasi ini memakainya lewat
`DialogBersama`. Ditutup dengan polyfill di `vitest.setup.ts` (dibuktikan
load-bearing lewat mutasi).

**Hasil:** 649 test web hijau di 50 berkas — naik dari 641, karena polyfill itu
membuka 8 test yang selama ini merah tanpa ada yang menyadarinya.

---

## E. Sengaja `sebagian` (2)

### `md-template-dok`
Klausul kontrak sudah bisa disunting per tenant (migrasi 450 + layar 453).
Sisa: template untuk dokumen SELAIN kontrak (berita acara, dsb). SPK sendiri
sudah bisa dicetak lewat `kt-subkon`.

Ini penambahan wajar, bukan cacat — dan tak mendesak sampai ada yang
benar-benar meminta berita acara ber-template.

### `fn-efaktur`
Ekspor DJP (e-Faktur FK/LT/OF + bukti potong) sudah jalan, PKP per tenant
sudah ada. Yang tersisa berkaitan dengan **integrasi langsung ke sistem DJP**
— itu wilayah pihak ketiga, bukan format berkas.

---

## Urutan yang disarankan

1. ~~**D**~~ ✅ selesai 2026-08-17.
2. **A1** (`sy-import` ekspor) — menu yang berbohong tentang isinya, dan
   fondasinya (`lib/ekspor-tabel.ts`) sudah ada.
3. **A2** (addendum SPK) — mencegah orang menerbitkan SPK ganda.
4. **B** ke `RATIFIKASI.md`, jangan dikerjakan sendiri.
5. **A3** terakhir — menyentuh data yang ada, dan jalur revisi yang paling
   menentukan sudah aman lewat `register_gambar`.

**C dan E tidak masuk antrean** sampai yang ditunggunya datang.
