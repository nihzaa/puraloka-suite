# Rencana perbaikan navigasi — sidebar, tab-bagian, dan route

> **Status:** rencana, belum dieksekusi. Diminta founder 2026-08-07:
> *"sidebar dan route nya menurut saya masih banyak keanehan, ada yg double,
> 1 route ditrangani 2 link sidebar, silahkan audit dan verifikasi dulu lalu
> buat kan rencana perbaikannya."*
>
> **PEMBARUAN 2026-08-07 — SELURUHNYA SUDAH DIKERJAKAN.**
>
> Dokumen ini semula menahan T-3 sambil menunggu satu keputusan founder.
> Founder menjawab: *"yaa perbaiki aja kan?"* dan *"kenapa T-3 ditahan padahal
> itu yg terbesar?"* — pertanyaan yang benar. Menahan pekerjaan demi keputusan
> yang jawabannya sudah jelas adalah bentuk lain dari tidak mengerjakannya.
>
> Status tiap temuan ada di §1. Migrasi 220–226 + tiga perbaikan kode.

---

## 0. Cara angka ini diukur

Semua angka berasal dari **database yang berjalan**, bukan dari membaca berkas:

```bash
# sidebar mengambil strukturnya dari GET /api/v1/menu -> tabel menu_items
node -e "…SELECT href, count(*) FROM menu_items WHERE is_active GROUP BY href HAVING count(*)>1"
node apps/web/scripts/audit-nav-yatim.mjs        # yatim & link mati
```

Ini penting: `apps/web/lib/peta-menu.ts` **bukan** yang ditampilkan. Ia sumber
*generator* migrasi (`gen-migrasi-menu.mjs`). Audit yang membaca berkas TS akan
melaporkan hijau untuk sidebar yang sebenarnya rusak — dan justru **selisih
antara keduanya** yang melahirkan cacat menu yatim kemarin.

---

## 1. Ringkasan temuan

| # | Temuan | Ukuran | Sifat | Status |
|---|---|---|---|---|
| T-1 | Menu menunjuk "segera hadir" padahal halaman ada | 20 item | **cacat** | ✅ **SELESAI** — migrasi 220 |
| T-2 | Halaman yatim (tak bisa dicapai) | 11 → 0 | **cacat** | ✅ **SELESAI** — dijaga `audit-nav-yatim.mjs` |
| T-3 | Satu href dipakai banyak item sidebar | 144 → **96** | struktur | ✅ **SELESAI** — 223, 224 |
| T-4 | Href sama muncul di sidebar **dan** tab-bagian | 13 → 6 | struktur | ✅ **SELESAI** — 225 |
| T-5 | Tiga aturan "aktif" berbeda di tiga berkas | 3 → **1** | konsistensi | ✅ **SELESAI** — `lib/rute-aktif.ts` |
| T-6 | Label identik berulang di sidebar | 3 → **1** | salah tulis | ✅ **SELESAI** — 222 |
| T-7 | Drift `peta-menu.ts` ↔ `menu_items` tak terjaga | 39 → **18** | proses | ✅ **SELESAI** — dijaga ratchet |
| T-8 | Link mati (nav → halaman tak ada) | **0** | — | ✅ nol, dijaga |
| T-9 | Beranda tak ada di sidebar (`/dashboard` di urutan 1801) | 1 | **cacat** | ✅ **SELESAI** — 221 |
| T-10 | 13 anak menu naik ke tingkat atas (induk dimatikan) | 13 → **0** | **cacat** | ✅ **SELESAI** — 222 |
| T-11 | Rantai menu per-proyek putus di tiga tempat | 3 cacat | **cacat** | ✅ **SELESAI** — kode |

**Yang paling menentukan pengalaman pengguna adalah T-3.** Sisanya membuat
kode sulit dirawat; T-3 membuat sidebar terasa membingungkan saat dipakai.

---

## 2. T-3 — 144 item menu berbagi 27 href

### Yang sebenarnya terjadi

| href | Item | Contoh label yang menunjuk ke sana |
|---|---:|---|
| `/proyek` | **22** | "Change Order", "Cost Baseline (BAC)", "Denda Keterlambatan", "Dashboard per Proyek" |
| `/mandor` | **13** | "Back-Charge", "Kasbon", "Kontrak Subkon", "Log Tenaga Kerja" |
| `/estimasi` | **12** | "Cost Code / CBS", "Analisa Varians", "Actual Cost Ledger" |
| `/procurement` | **12** | "3-Way Match", "Goods Receipt", "Gudang & Lokasi" |
| `/laporan` | **11** | "KPI Perusahaan", "Laporan Arus Kas", "e-Faktur & e-Bupot" |
| `/aset` | 7 | "Penyusutan", "Sewa Alat", "Mutasi Antar Proyek" |
| … 21 href lain | 67 | |

Klik "Cost Baseline (BAC)" → mendarat di halaman Proyek biasa. Klik "Denda
Keterlambatan" → halaman Proyek biasa. **Label menjanjikan hal spesifik, yang
muncul halaman umum.** Pengguna belajar bahwa sub-menu tak bisa dipercaya, lalu
berhenti memakainya — dan itu menghapus nilai dari taksonomi 191 sub-menu yang
sudah susah payah disusun.

### Yang SUDAH ditangani (dan batasnya)

`apps/web/lib/menu-berbagi-href.ts` (+ 9 test) menangani **gejala visualnya**:
saat satu href dipakai lebih dari satu item, hanya satu "wakil" yang boleh
menyala; sisanya diredupkan dengan titik penanda + teks `sr-only`. Ini matang
dan tak perlu diubah.

Tapi berkasnya sendiri jujur: ia menyembunyikan gejala, **bukan menghapus
sebab**. Orang yang mengklik "Cost Baseline (BAC)" tetap mendarat di tempat
yang salah.

### Rencana — tiga jalur, dipilih per-item bukan borongan

Setiap dari 144 item masuk salah satu dari tiga:

**Jalur A — jadikan anchor/tab di halaman induk** (paling murah, paling banyak
dipakai). Href berubah dari `/proyek` menjadi `/proyek#change-order` atau
`/proyek?tab=change-order`. Halaman induk sudah menampilkan isinya; yang kurang
hanya penunjuk. Cocok untuk item yang **isinya memang sudah ada** di halaman itu.

**Jalur B — kembalikan ke `/m/<key>` (segera hadir)**. Untuk item yang isinya
**belum ada** di halaman induk. Ini terasa mundur, tapi jauh lebih jujur:
"belum digarap" lebih baik daripada mendarat di halaman yang tak menjawab.
Dan halaman `/m/<key>` sudah menjelaskan status + rencananya.

**Jalur C — bangun halamannya**. Untuk yang sudah waktunya digarap. Keputusan
ini tunduk pada urutan INTI/PEMBEDA/TUNDA di `F5-1`, bukan pada rapinya sidebar.

> **Yang saya butuhkan dari founder:** bukan keputusan 144 kali. Cukup satu
> aturan: **default-nya A atau B?** Saya condong ke **B untuk yang isinya
> benar-benar belum ada** — karena mendaratkan orang di halaman yang tak
> menjawab lebih merusak kepercayaan daripada mengakui belum ada. Sesudah
> aturannya ditetapkan, sisanya kerja mekanis yang saya jalankan sendiri.

**Ukuran pekerjaan:** 1 migrasi + 1 penjaga baru (`audit-menu-berbagi-href`
sebagai ratchet: jumlah item berbagi href tak boleh naik). Perkiraan sehari.

---

## 3. T-4 — 13 href muncul di sidebar DAN tab-bagian

Contoh yang paling terasa:

| href | Label di sidebar | Label di tab |
|---|---|---|
| `/kontrak/rfi` | "Request for Information" | "RFI" |
| `/lapangan/inspeksi` | "Request for Inspection" | "Inspeksi" |
| `/lapangan/submittal` | "Submittal Register" | "Submittal" |
| `/mandor/retensi` | "Retensi Subkon" | "Retensi" |

Halaman yang sama punya **dua nama berbeda** di dua navigasi yang tampil
bersamaan di layar yang sama. Ini melanggar prinsip yang dipegang repo ini
sendiri (`ARAH-VISUAL-2026`): satu hal, satu nama.

### Rencana

1. **Seragamkan nama.** Sidebar memakai nama panjang formal; tab memakai nama
   pendek. Pilih satu — saya sarankan **nama pendek untuk keduanya** ("RFI",
   "Inspeksi"), dengan nama panjangnya jadi `title`/tooltip. Nama panjang
   memakan lebar sidebar dan terpotong di layar kecil.
2. **Tetapkan siapa pemiliknya.** Kalau sebuah halaman punya tab-bagian, sidebar
   cukup menunjuk **induk bagiannya** saja, dan tab yang mengurus anak-anaknya.
   Ini menghapus 13 duplikasi sekaligus dan menyusutkan sidebar.

**Ukuran:** 1 migrasi (label) + suntingan 6 berkas `layout.tsx`. Setengah hari.

---

## 4. T-5 — tiga aturan "aktif" yang berbeda

| Berkas | Aturan |
|---|---|
| `sidebar.tsx:511` | `pathname === href \|\| pathname.startsWith(href + "/")` — **benar**, cocok di batas segmen |
| `sidebar.tsx:783` | `href === "/pengaturan" ? pathname === href : pathname.startsWith(href)` — `startsWith` **mentah** |
| `nav-bagian.tsx:61` | cocok-persis kalau href satu segmen, `startsWith` mentah untuk sisanya |

`startsWith` mentah adalah cacat yang menunggu: `/pengaturan/situs` akan
menyalakan `/pengaturan/situs-lama` kalau halaman itu kelak ada. Hari ini belum
menggigit — dan justru itu yang membuatnya mudah dilupakan.

### Rencana

Satu fungsi `rutenyaAktif(pathname, href)` di `apps/web/lib/rute-aktif.ts`,
dipakai ketiganya, dengan test yang mengunci kasus saudara-berawalan-sama.
Ditambah penjaga sederhana: `startsWith(` pada variabel href di berkas nav
harus lewat fungsi itu.

**Ukuran:** 2 jam, termasuk test dan uji mutasi.

---

## 5. T-6 — tiga label identik (paling murah)

| Label | Muncul | Perbaikan usul |
|---|---|---|
| "Badan Usaha" | 2× | salah satunya → "Profil Perusahaan" |
| "Aturan Notifikasi" | 2× | gabungkan; keduanya menunjuk `/pengaturan/notifikasi` |
| "Absensi Lapangan" | 2× | satu di Mobile, satu di HR — beri kualifikasi kelompoknya |

Dua item bernama sama persis dan menuju tempat sama adalah duplikat murni.

**Ukuran:** satu migrasi kecil. Setengah jam. **Bisa dikerjakan kapan saja.**

---

## 6. T-7 — drift `peta-menu.ts` ↔ `menu_items` tak terjaga

`gen-migrasi-menu.mjs` sudah menuliskan risikonya sendiri:

> *"ia akan berbeda dari `peta-menu.ts` begitu salah satunya disunting, dan
> perbedaan itu tak akan berbunyi."*

Ramalan itu terbukti: ~23 href berbeda antara keduanya. Cacat menu yatim
kemarin lahir persis dari celah ini.

### Rencana

Penjaga `audit-peta-menu-vs-db.mjs`: bandingkan `key`, `href`, `label`, dan
`is_active`. Selisih apa pun → MERAH, dengan pesan yang menyebut migrasi mana
yang perlu ditulis. Sama seperti `audit-nav-yatim.mjs`, ia **melewati diri
dengan suara** kalau DB tak terhubung — tidak diam-diam hijau.

**Ukuran:** 3 jam termasuk uji mutasi.

---

## 7. Urutan yang saya sarankan

| Urutan | Item | Alasan |
|---|---|---|
| 1 | **T-6** label identik | setengah jam, nol risiko, langsung terasa |
| 2 | **T-7** penjaga drift | mencegah kelas cacat kemarin terulang — ini yang paling menahan yang lain |
| 3 | **T-5** satu aturan aktif | kecil, dan menutup cacat yang belum menggigit |
| 4 | **T-4** nama & pemilik | menyusutkan sidebar, memperjelas |
| 5 | **T-3** 144 item berbagi href | terbesar; **butuh satu keputusan founder lebih dulu** (§2) |

T-1 dan T-2 sudah selesai.

---

## 8. Yang TIDAK saya usulkan

- **Merombak taksonomi 191 sub-menu.** Ia hasil kerja panjang dan tak salah;
  yang salah adalah 144 di antaranya belum punya tujuan sendiri.
- **Membuang `menu-berbagi-href.ts`.** Ia tetap berguna bahkan sesudah T-3:
  selalu akan ada href yang sah dipakai dua item.
- **Memindahkan sidebar ke `peta-menu.ts` (berhenti pakai DB).** Menggoda,
  tapi menu per-tenant adalah kebutuhan nyata multi-tenant — sebuah PT bisa
  mematikan modul yang tak dibelinya. Yang perlu diperbaiki adalah penjagaan
  drift-nya (T-7), bukan sumbernya.


---

## 9. Yang benar-benar dikerjakan (2026-08-07)

### Migrasi

| # | Isi | Uji mutasi |
|---|---|---|
| 220 | 20 menu TUNDA → halaman nyata | key karangan DITOLAK |
| 221 | Beranda `sort_order 10`, Dashboard Eksekutif dipensiunkan | 2 mutasi DITOLAK |
| 222 | 13 anak yatim struktural (10 mati, 3 pindah) | halaman kehilangan jalan masuk DITOLAK |
| 223 | 18 menu → halaman khusus yang sudah ada | key tak ada DITOLAK (menangkap `fn-kasbon`) |
| 224 | 19 menu per-proyek → pemilih `/m/<key>` | href bukan `/m/<key>` DITOLAK |
| 225 | 7 nama sidebar disamakan dengan tab | label meleset DITOLAK |
| 226 | 4 menu terakhir yang masih "segera hadir" | masih `/m/` DITOLAK |

Ketujuhnya idempoten — dibuktikan dengan menjalankan 3× dan membandingkan hasil.

### Cacat kode yang hanya ketahuan karena diuji di peramban

Penyelesaian untuk menu per-proyek ternyata **sudah dibangun lengkap** di
`m/[key]/page.tsx` — pilih proyek, lalu tautkan ke `/proyek/<id>#<anchor>`.
Komentarnya bahkan menjelaskan niatnya. Ia tak pernah dipanggil, dan ketiga
bagiannya rusak:

1. **`data.data` padahal API menjawab `{ total, projects }`** — selamanya
   `undefined`, lalu `?? []` mengubahnya jadi *"Belum ada proyek. Buat proyek
   dulu."* pada basis berisi 15 proyek. Kalimatnya masuk akal, jadi tak seorang
   pun curiga. Galatnya pun ditelan `.catch(() => {})`.
2. **`tabProyek` tak cocok dengan anchor** — `'kurva-s'` vs `id="sec-kurvas"`,
   `'change-order'` vs `id="sec-co"`. Tak satu pun dari 19 tautan cocok.
3. **Halaman proyek nol penanganan hash** — peramban memproses hash saat
   dokumen dimuat, dan saat itu halaman masih skeleton.

### Penjaga baru

| Penjaga | Yang dijaga | Mutasi |
|---|---|---|
| `audit-nav-yatim.mjs` | halaman tak tertaut · nav tanpa halaman | 2 arah MERAH → HIJAU |
| `audit-peta-menu-vs-db.mjs` | drift `peta-menu.ts` ↔ `menu_items` | label diubah tanpa migrasi → MERAH |
| `audit-menu-berbagi-href.mjs` | jumlah item berbagi href (ratchet) | sub-menu baru tanpa tujuan → MERAH |
| `lib/rute-aktif.ts` + 8 test | satu aturan "aktif", cocok di batas segmen | test menangkap `href="/"` menyala di mana-mana |

Ketiganya terdaftar di CI, dan **melewati diri dengan suara** saat DB tak
terhubung — bukan diam-diam hijau.

### Sisa yang sengaja

- **96 item masih berbagi href.** Sebagian sah (dua kelompok mencari hal yang
  sama), sebagian menunggu halamannya dibangun. Ratchet menjaga agar tak
  bertambah, dan `menu-berbagi-href.ts` menandainya di layar.
- **18 drift href** — seluruhnya `peta-menu.ts` menulis `/proyek` sementara DB
  menunjuk `/m/<key>`; itu justru arah yang benar (migrasi 224).
- **Tab dari URL** (`?tab=`) belum ada: nol halaman membaca `useSearchParams`
  untuk tab. Itu pekerjaan kode per-halaman, bukan migrasi.
