# DESIGN BRIEF — Redesign Web Puraloka Suite ("Command Center")

> **Fase 0 — Discovery & Brainstorm. Belum ada kode.**
> Dokumen ini menjawab megaprompt redesign 2026-08-08 §12 (bagian A–H).
>
> **Status: DIRATIFIKASI 2026-08-08 — GERBANG 1 TERTUTUP.**
> Kelima keputusan sudah turun (§C.0). Jangan tanyakan ulang; yang tersisa
> adalah pekerjaan, bukan pertanyaan.
>
> ⚠️ **Aturan angka.** Setiap angka di dokumen ini punya perintah untuk
> mengukurnya ulang, sesuai `CLAUDE.md` §1. Matriks §F **tidak ditulis tangan** —
> ia digenerate `apps/web/scripts/peta-redesign.mjs`. Kalau angkanya berbeda saat
> Anda menjalankannya, **dokumen ini yang salah.**

---

## Ringkasan untuk founder (1 menit)

Brief-nya bagus, dan sebagian besar arahnya saya pakai. Tapi begitu diukur ke
kode, **empat premisnya tidak cocok dengan kenyataan** — dan kalau diikuti
mentah-mentah, tiga di antaranya akan membatalkan keputusan Anda sendiri atau
merusak kerja yang sudah berjalan.

| Brief bilang | Terukur hari ini | Akibatnya kalau diikuti |
|---|---|---|
| 12 halaman (§8) | **105 halaman**, 22 grup | Rencana 14 PR meleset ~9× |
| `/clients`, `/pengaturan`, `/estimasi` "halaman baru" | ketiganya **sudah ada**; `/estimasi` 3.954 baris (terbesar di repo) | Menu kembar `/klien` vs `/clients` |
| "bangun ~40 primitif di `components/ui/`" (§6) | primitifnya **sudah ada** & adopsinya baru naik tajam berkat ratchet | Pustaka primitif **ketiga** — cacat yang sudah tercatat di `dasar.tsx:419` |
| padding kartu 20px, palet chart baru (§4) | `--pad-kartu` **12px** (dijaga CI), aksen non-navy **sudah ditolak** (`a38cb0d`) | `kerapatan-ratchet` merah + keputusan founder dibatalkan diam-diam |

**Yang brief benar dan memang celah nyata:** tidak ada `lib/format.ts`.
Terukur **83 panggilan format ad-hoc di 51 halaman**. Ini gap asli, berdampak
besar, dan jadi PR pertama.

**Satu temuan yang brief tak tahu:** aplikasi ini punya **empat shell berbeda**,
bukan satu — dashboard + tiga portal (`/mandor-portal` 11 halaman, `/pm-portal`
5, `/portal` 4) yang sengaja **tidak** memakai Sidebar/Topbar dashboard.
Memaksakan satu AppShell 3 kolom ke semuanya akan merusak portal mandor —
justru pengguna yang paling rapuh (HP, layar kecil, sinyal buruk).

---

## A. Bedah Referensi

### A.1 Yang saya baca dari kelima gambar

Pembacaan §3 brief **sebagian besar tepat**. Yang saya koreksi ada empat, dan
semuanya soal ukuran/rasio, bukan konsep.

| §3 brief | Koreksi saya dari gambar |
|---|---|
| Sidebar 232px | Terukur ~205–215px pada lebar kanvas 1490px. Angka 232 terlalu lebar untuk ikon 18px + label 13px |
| Rail kanan 300px | Benar (~295–305px). **Tapi** di BuildAxis rail **ikut menggulung bersama konten**, bukan `sticky` penuh — yang sticky hanya dock AI di dasar |
| KPI strip "5–6 kartu setara" | Gambar Materials memakai **6**, Site Progress **5**, Cost Reports **6**. Yang tetap bukan jumlahnya melainkan **tinggi kartu** (~92px) |
| Card padding 20px | Terukur ~16px untuk kartu widget, ~14px untuk kartu KPI. Yang 20px hanya panel besar |

### A.2 Apa yang membuatnya terasa "enterprise", bukan template

Empat hal, dan hanya satu yang soal warna:

1. **Satu bahasa kartu, nol pengecualian.** Semua widget — donut, tabel, bar
   list, timeline — dibungkus kartu identik: radius sama, border sama, tinggi
   header sama, kontrol di kanan header. Mata belajar sekali, lalu memindai
   sisanya tanpa berpikir. **Inilah 80% kesan "satu tangan".**
2. **Angka besar, label kecil, satuan lebih kecil lagi.** Hierarki di dalam
   satu kartu KPI dikerjakan tipografi, bukan warna atau garis.
3. **Warna dipakai untuk MENGKATEGORIKAN, bukan menghias.** Icon tile berwarna
   menandai domain; garis chart menandai seri. Tak ada gradient dekoratif.
4. **Kepadatan tinggi tanpa sesak** — dicapai lewat padding rapat + tipografi
   naik, persis diagnosis `ARAH-VISUAL-2026.md` §4.

### A.3 Yang TIDAK saya ambil, dan alasannya

- **Ilustrasi hero orang berhelm** (gambar 3). Ini stock illustration; §11a
  `ARAH-VISUAL-2026.md` sudah menetapkan foto lapangan asli sebagai bahan
  desain, dan kartun helm justru merusak kredibilitas yang sedang dijual.
- **Lokalisasi India** (₹, "Cr", "L"). Diganti §5 brief (rb/jt/M/T) — benar.
- **Densitas AI**: gambar 1 punya 6 badge AI dalam satu layar. §7 brief sudah
  membatasi 2, dan saya tegakkan lebih keras: label **"Peringatan Sistem"**
  untuk yang deterministik, "AI" hanya untuk yang benar-benar model.
- **Angka karangan** — inilah yang paling berbahaya untuk ditiru. Lihat §9
  Aturan Emas brief; saya perkuat jadi penjaga CI (§H).

---

## B. Tiga Arah Desain

Ketiganya memakai navy `#003366` dan Bricolage+Jakarta (tak dinegosiasikan —
`ARAH-VISUAL-2026.md` §2). Yang berbeda: **struktur & kepadatan**, bukan warna.

### Arah 1 — "Command Center" (mengikuti referensi)

**Tesis:** tiga kolom permanen; rail kanan jadi kokpit yang selalu terlihat.

```
┌────────┬───────────────────────────┬──────────┐
│sidebar │ header + KPI strip        │ kalender │
│ 216    │ ┌────────┐ ┌────────────┐ │ tugas    │
│        │ │ donut  │ │ area chart │ │ alert    │
│        │ └────────┘ └────────────┘ │ ────────  │
│        │ tabel detail              │ AI dock  │
└────────┴───────────────────────────┴──────────┘
```

**Signature:** rail kanan "Yang Perlu Keputusan" — antrean approval lintas modul
(kasbon, PO, invoice) dengan aksi setuju/tolak inline, di setiap halaman.

**Trade-off jujur:** butuh ≥1440px untuk bernapas. Di 1280px rail memakan 23%
lebar; konten tengah tinggal ~700px — lebih sempit dari halaman hari ini.
Dan **tiga portal tak bisa memakainya sama sekali.**

### Arah 2 — "Rapat & Fokus" (menyimpang di satu sumbu: **rail kanan dibuang**)

**Tesis:** ERP kontraktor dipakai untuk *menyelesaikan tugas*, bukan memantau.
Rail permanen adalah pajak lebar tetap demi informasi yang 90% waktu tidak
dilihat. Buang rail; kembalikan lebarnya ke tabel.

```
┌────────┬────────────────────────────────────────┐
│sidebar │ header + KPI strip (6, penuh lebar)    │
│ 216    │ ┌──────────────┐ ┌───────────────────┐ │
│        │ │ donut        │ │ area chart        │ │
│        │ └──────────────┘ └───────────────────┘ │
│        │ tabel detail — LEBAR PENUH             │
└────────┴────────────────────────────────────────┘
        rail jadi DRAWER, dipanggil tombol / ⌘J
```

**Signature:** **"Bilah Keputusan"** — satu baris tipis di bawah header yang
hanya muncul kalau ada yang menunggu Anda ("3 kasbon · 2 invoice jatuh tempo"),
sekali klik membuka drawer. Nol lebar saat tak ada kerjaan.

**Kenapa ini bisa lebih baik untuk kontraktor Indonesia:** halaman terpadat di
repo ini adalah tabel (RAB, buku besar, daftar upah tukang). Tabel 12 kolom di
layar 1366px — laptop kantor yang sebenarnya — **tidak muat** kalau 300px
disandera rail. Arah ini menukar "kokpit yang selalu terlihat" dengan
"tabel yang benar-benar terbaca".

**Trade-off jujur:** kalah "wah" saat demo. Layar pertama lebih sepi daripada
referensi, dan founder pernah mengeluh justru soal itu ("kurang dapet wah-nya").

### Arah 3 — "Padat Bertingkat"

**Tesis:** pertahankan 3 kolom, tapi rail **kontekstual dan bisa diciutkan**,
dengan kepadatan mengikuti tipe halaman (dashboard longgar, tabel rapat).

**Signature:** kepadatan sebagai **mode pengguna** (Nyaman / Rapat), disimpan
per-user. Admin kantor pilih Rapat, mandor di HP dapat Nyaman.

**Trade-off jujur:** dua mode = dua kali permukaan uji, dan tiap penjaga visual
harus hijau di keduanya. Ini biaya nyata di repo yang sudah punya 9 penjaga
visual × 2 mode tema — mode ketiga menjadikannya 4 kombinasi.

---

## C. Rekomendasi — dan keputusan founder yang mengoreksinya

### C.0 KEPUTUSAN FOUNDER 2026-08-08 (mengikat)

> **Gerbang 1 TERTUTUP.** Kelimanya sudah dijawab. Yang tertulis di §C.1 ke
> bawah adalah usul saya **sebelum** keputusan turun — disimpan sebagai catatan
> alasan, bukan instruksi. **Kalau §C.1 dan §C.0 berbeda, §C.0 yang berlaku.**

| # | Keputusan | Bunyi |
|---|---|---|
| 1 | **Shell** | ❌ Bukan Arah 1 **atau** 2 — **satu AppShell dengan slot rail opsional** |
| 2 | **Portal** | ✅ Ikut dirombak, **shell sendiri**; dikerjakan **sesudah** grup dashboard |
| 3 | **`kerapatan-ratchet`** | ✅ **Perbaiki dulu, PR tersendiri, sebelum PR 1** |
| 4 | **Mode kepadatan** (Arah 3) | ❌ **DITOLAK** — 4 kombinasi penjaga, tak sebanding |
| 5 | **Sparkline** | ✅ **Tambah endpoint deret historis — 6 KPI beranda saja** |

### C.0d Aturan tetap 2026-08-08 — dokumen mengikuti referensi, bukan sebaliknya

Founder: *"untuk dokumen dokumen dan kalo sekarang menabrak, ubah aja
dokumennya mengikuti referensi yg ada."*

Ini **rombak total, bukan poles**. Kalau sebuah aturan lama menghalangi arah
referensi, yang direvisi adalah **aturannya** — ditulis ulang beserta alasan
pencabutannya, bukan didiamkan dan bukan jadi alasan menolak pekerjaan.
Preseden: §C.0c mencabut "ikhtisar vs tabel" karena premisnya sudah runtuh.

**Dua hal yang TETAP tidak dicabut**, dan alasannya bukan selera:

1. **Aturan yang lahir dari pengukuran.** Ambang kontras WCAG, `--pad-kartu`
   yang dijaga ratchet, larangan float untuk nominal. Referensi tidak
   mengukurnya; kita mengukurnya. Menyamakan diri di sini berarti memerahkan
   CI dan/atau merugikan pengguna nyata.

2. **Aturan Emas §9 — nol data karangan.** Ini pembeda yang paling menentukan,
   dan perlu dinyatakan terus terang: **referensi terlihat "penuh" sebagian
   besar karena angkanya karangan.** Menirunya berarti membangun demo, bukan
   alat kerja. Widget tanpa data tampil sebagai keadaan kosong yang jujur, dan
   celahnya dicatat di `API-GAPS.md`.

Di luar dua itu: **referensi menang atas dokumen lama.**

### C.0a Keputusan 1 — kenapa usul saya keliru, dan ini perbaikannya

Founder: *"Argumen 1366px itu nyata, tapi hanya berlaku untuk halaman tabel.
Dashboard, detail proyek, dan ringkasan laporan tidak punya tabel 12 kolom —
di sana rail 300px tidak mengorbankan apa pun."*

**Benar, dan ini mengoreksi cacat nyata di §C.1.** Saya mencampur dua pertanyaan
berbeda: *"tata letak mana"* dengan *"halaman jenis apa"*. Lalu saya memakai
kendala halaman **tabel** (1366px, 12 kolom) untuk membuang rail di halaman
**ikhtisar** — yang justru tak punya kendala itu, dan justru di situlah kesan
"mirip referensi" dinilai.

**Yang dibangun: satu `AppShell`, satu prop.**

```
<AppShell rail={<RailIkhtisar/>}>   ← halaman IKHTISAR
<AppShell>                          ← halaman TABEL: rail mati,
                                       Bilah Keputusan + drawer
```

> ### ⚠️ ATURAN INI DIREVISI 2026-08-08 — baca §C.0c sebelum memakainya
>
> Pembedaan "ikhtisar vs tabel" di bawah **sudah dicabut**. Penggantinya:
> **dashboard vs daftar** (§C.0c). Tabel di bawah disimpan sebagai catatan
> alasan, bukan instruksi.

| ~~Rail AKTIF (ikhtisar)~~ | ~~Rail MATI (tabel)~~ |
|---|---|
| `/dashboard` | RAB, buku besar, daftar upah |
| `/proyek/[id]` | 16 halaman Administrasi |
| ringkasan `/laporan` | daftar transaksi, tabel padat |
| dashboard per grup | halaman pengaturan |

### C.0c Revisi 2026-08-08 — "dashboard vs daftar", bukan "ikhtisar vs tabel"

Founder: *"anggap aja aturan yg sebelumnya itu gaada… ini rombak total bukan
hanya poles make up, dan setiap menu induk kan akan punya semacam dashboard
sendiri-sendiri."*

**Aturan lama saya turunkan dari argumen 1366px**, dan argumen itu lahir dari
Arah 2 — yang mengandaikan halaman ERP = tabel besar. Begitu setiap menu induk
punya **dashboard sendiri** (`ARAH-VISUAL-2026.md` §5a–§5c, gagasan founder yang
sudah diratifikasi), premisnya runtuh: halamannya bukan lagi "tabel 12 kolom",
melainkan **KPI → grafik → tabel** (pola tiga lapis §5b). Di bentuk itu rail
300px tak memotong apa pun.

Pembedaan lama juga terbukti **tak bisa dipakai**: diukur, `/laporan` punya
25 tabel + 5 tab, jadi ia jatuh ke kategori "tabel" — padahal ia **dashboard
grup Laporan & BI**, salah satu layar utama produk.

```
RAIL AKTIF    beranda + dashboard tiap menu induk
              /dashboard · /keuangan · /mandor · /kas · /laporan
              /proyek · /proyek/[id] · /procurement · /lapangan · …

RAIL MATI     halaman DAFTAR/DETAIL di bawahnya
              /keuangan/invoice · /mandor/upah · /kas/transaksi
              /pengaturan/* · halaman formulir
```

**Ini juga lebih dekat ke referensi, bukan lebih jauh.** Di keempat gambar
BuildAxis rail muncul di *setiap* layar utama — termasuk "Cost Reports &
Analytics", yang penuh tabel. Yang membedakan bukan ada-tidaknya tabel,
melainkan apakah halaman itu **pintu masuk sebuah wilayah** atau **daftar di
dalamnya**.

Yang **tidak** berubah: rail tetap **slot per halaman**, bukan mode global —
alasan penolakan mode kepadatan (§C.0a) berlaku utuh.

**Kenapa ini bukan "mode ketiga"** — dan kenapa itu penting: mode kepadatan
(Arah 3) berarti **satu halaman punya dua tampilan**, jadi tiap penjaga visual
harus hijau di 2 kepadatan × 2 tema = 4 kombinasi. Slot rail tidak begitu:
satu halaman selalu punya satu bentuk, ditentukan saat halaman ditulis.
**Nol permukaan uji tambahan.** Itu sebabnya nomor 1 diterima dan nomor 4 tidak.

**Bilah Keputusan tetap dibangun** — founder: *"ide itu bagus dan memang lebih
baik dari referensi"*. Di halaman ikhtisar ia hidup **di dalam rail**; di
halaman tabel ia jadi bilah tipis + drawer.

### C.0b Keputusan 5 — sparkline: DIUKUR, dan datanya ADA

Founder benar menyebut ini **celah API, bukan keputusan desain**. Saya sempat
membuangnya dengan alasan "endpoint KPI hanya mengembalikan satu angka" — itu
benar tentang **endpoint**, dan diam-diam saya perlakukan seolah benar tentang
**data**. Dua hal berbeda.

Diukur langsung ke basis (kolom tanggal **bisnis**, bukan `created_at` yang
hanya jejak seeding):

| KPI beranda | Baris | Bulan berbeda | Rentang |
|---|---|---|---|
| Proyek aktif | 15 | **9** | 2025-09 → 2026-05 |
| Nilai kontrak | 15 | **9** | 2025-09 → 2026-05 |
| Invoice outstanding | 26 | **8** | 2025-10 → 2026-06 |
| Kas (payments) | 23 | **8** | 2025-10 → 2026-06 |
| Kasbon | 56 | **8** | 2025-11 → 2026-06 |
| Progres fisik | 271 | **8** | 2025-11 → 2026-06 |

**Keenam-enamnya punya 8–9 bulan riwayat nyata.** Jadi sparkline di beranda
**bukan** garis karangan — ia riwayat yang memang ada dan belum pernah
ditanyakan. Aturan Emas §9 brief tetap utuh.

> **Batas yang tetap saya pegang:** 6 endpoint deret **hanya untuk beranda**.
> Di halaman lain, kartu KPI tanpa riwayat tampil **tanpa** sparkline —
> bukan dengan garis datar hiasan. Kalau nanti sebuah KPI ternyata tak punya
> deret, yang dihapus adalah sparkline-nya, bukan kejujurannya.

### C.1 Usul saya sebelum keputusan turun (catatan sejarah)

> Bagian ini **sudah dilampaui** oleh §C.0. Disimpan karena alasannya masih
> menjelaskan kenapa Bilah Keputusan ada, dan kenapa rail permanen ditolak
> untuk halaman tabel.

**Alasan terhadap pengguna nyata:**

1. **Admin kantor & PM** bekerja di tabel lebar. Rail permanen memotong 300px
   dari pekerjaan utama mereka demi widget yang dilihat sekali di pagi hari.
2. **Mandor di lapangan** memakai `/mandor-portal` di HP. Rail tak pernah
   tampil di sana, jadi membangunnya sebagai struktur wajib berarti membangun
   sesuatu yang 11 dari 105 halaman tak akan pernah pakai.
3. **Layar nyata**, bukan layar demo: 1366px masih umum di laptop kantor.
   Arah 1 baru enak di ≥1440px.

**Yang saya BUANG dari referensi, eksplisit:**

| Dibuang | Alasan |
|---|---|
| Rail kanan permanen | Pajak 300px; diganti drawer + Bilah Keputusan |
| Ilustrasi hero | Stock art merusak kredibilitas (§11a ARAH-VISUAL) |
| Sparkline **di semua** kartu KPI | Hanya di tempat yang datanya ada. ⚠️ **Dikoreksi §C.0b:** alasan awal saya ("endpoint cuma satu angka") benar tentang *endpoint*, salah tentang *data* — 6 KPI beranda terbukti punya riwayat 8–9 bulan, jadi sparkline beranda **DIBANGUN** |
| Badge "✨ AI" bertebaran | Maks 2/halaman; deterministik dilabeli "Peringatan Sistem" |
| Segmented Weekly/Monthly/Quarterly/Yearly di semua halaman | Hanya `/laporan` yang datanya benar-benar berperiode |

---

## D. Sistem Token Final

**Prinsip: menambah di atas 193 token yang ada, bukan menggantinya.** Repo ini
punya riwayat WCAG tertulis per token (`ARAH-VISUAL` §2) — membuang itu berarti
membuang bukti, dan `kontras-ratchet` menguji 38 pasangan di **kedua** mode.

### D.1 Yang TIDAK berubah (dan kenapa)

| Token | Nilai | Kenapa dikunci |
|---|---|---|
| `--navy` | `#003366` | Identitas merek (§2) |
| `--aksen*` | navy | Non-navy **ditolak sesudah dilihat**, `a38cb0d` |
| `--pad-kartu` | `12px` | Dijaga `kerapatan-ratchet`; brief §4.3 (20px) = **mundur** |
| `--gap-grid` | `8px` | idem |
| `--teks-tabel` | `12.5px` | idem |
| Font | Bricolage + Jakarta | §2 — bukan Inter, sudah lolos |

> **Saya menolak §4.3 brief (padding 20px) secara terbuka.** Menerapkannya
> memerahkan CI dan membatalkan UI-0-1 yang sedang berjalan. Kalau Anda tetap
> menginginkannya, itu **Gerbang Keras G-5** dan butuh ratifikasi terpisah.

### D.2 Yang DITAMBAH

**a) Deret kategorikal `--data-6..8`** — sesuai pengecualian yang Anda berikan.

Saya sudah memverifikasi kondisi yang Anda syaratkan: **`a38cb0d` TIDAK menolak
warna seri chart.** Yang ditolak adalah `--aksen` (tombol/nav/link/lencana), dan
alasannya spesifik untuk aksen — indigo hanya menyentuh 4 tempat sementara
sekelilingnya tetap navy. Dua bukti bahwa seri chart multi-warna sudah jadi
praktik repo ini:

- `--data-1..5` **sudah ada di kedua mode** dan memang multi-rona
  (`globals.css:353` & `:669`) — termasuk hijau, amber, oranye.
- `ARAH-VISUAL` §3d menulis aksen boleh mewarnai *"garis grafik nilai utama"*
  tapi **bukan** *"seluruh deret grafik"* — pemisahan yang Anda minta memang
  sudah jadi aturan tertulis.

**Karena itu: tidak perlu banding visual, dan Fase 1 tidak terblokir.**

Satu koreksi atas usul Anda: saya **tidak** membuat keluarga `--chart-1..8` baru,
melainkan **memperpanjang `--data-*` jadi 8**. Dua keluarga paralel untuk satu
pekerjaan akan mengulang persis cacat "pustaka kedua/ketiga" yang jadi alasan
kita menolak §6 brief.

```
                    TERANG      GELAP     catatan
--data-6            (usul)      (usul)    perlu lolos kontras-ratchet
--data-7            (usul)      (usul)    idem
--data-8            (usul)      (usul)    idem
```

> **Batas jujur:** 8 rona yang saling dibedakan **dan** lolos WCAG AA di kedua
> mode itu sempit. Kalau `--data-7/8` tak lolos, saya **berhenti di angka yang
> lolos** dan memakai pembeda non-warna (pola garis, penanda titik, label
> langsung) — bukan mengirim warna yang memerahkan penjaga. Nilai hex-nya
> sengaja belum saya tulis di sini: menulis hex dari kepala persis kesalahan
> yang sudah tercatat tiga kali (§11d).

**b) Format & tipografi angka**

```
lib/format.ts          satu-satunya sumber format (menggantikan 83 panggilan ad-hoc)
font-variant-numeric: tabular-nums   pada semua sel angka
```

**c) Layout shell**

```
--sidebar-w        216px      (koreksi dari 232 — §A.1)
--sidebar-w-ciut    64px
--drawer-w         320px      rail sebagai drawer, bukan kolom tetap
--topbar-h          56px
```

---

## E. Peta Komponen

**Aturan: perluas yang ada; tulis baru hanya kalau benar-benar belum ada.**

### E.1 Sudah ada — DIPAKAI ULANG, tidak ditulis ulang

| Komponen | Lokasi | Adopsi hari ini |
|---|---|---|
| `Tabel<T>` | `components/dasar.tsx:334` | **41 / 105** halaman |
| `KartuKPI` | `components/ui-dasar.tsx:123` | **11 / 105** |
| `KepalaHalaman` | `components/dasar.tsx:82` | **0 / 105** ← lihat E.3 |
| Panel + grafik | `components/ui-dasar.tsx:260,382,448` | dipakai |
| `command-palette` | `components/command-palette.tsx` | ada (⌘K sudah jalan) |
| `sidebar` / `topbar` | `components/` | ada |

### E.2 Benar-benar belum ada — DITULIS BARU

| Komponen | Kenapa perlu |
|---|---|
| `lib/format.ts` | **83 panggilan ad-hoc di 51 halaman** — celah terbesar |
| `bilah-keputusan.tsx` | Signature Arah 2 |
| `rail-drawer.tsx` | Pengganti rail permanen |
| `keadaan-kosong.tsx` (terpadu) | Sudah ada **dua** `Kosong` beda prop (`dasar.tsx:419`) — disatukan |
| `chart-tema.ts` | Satu sumber warna/tooltip/axis chart |

### E.3 Temuan yang mengubah prioritas

> **`KepalaHalaman` dipakai 0 dari 105 halaman** — padahal komponennya ada dan
> bagus. Artinya **setiap** halaman menulis judulnya sendiri, dan itulah sumber
> paling langsung dari "tiap halaman terasa buatan sendiri".
>
> Ini juga temuan **termurah** di seluruh dokumen: memasangnya menyeragamkan
> tinggi header di 105 halaman tanpa menyentuh isi satu pun.

---

## F. Matriks Konsistensi — 105 Halaman

**Digenerate, bukan ditulis.** Sesuai pilihan Anda (opsi "penuh per-halaman,
digenerate"), matriksnya diukur dari kode supaya tidak membusuk:

```bash
node apps/web/scripts/peta-redesign.mjs --markdown   # tabel 105 baris
node apps/web/scripts/peta-redesign.mjs --ringkas    # agregat saja
```

### F.1 Agregat (diukur 2026-08-08)

| Ukuran | Angka |
|---|---|
| Halaman (`page.tsx`) | **105** |
| Grup menu | 22 |
| Memakai `KepalaHalaman` | **0 / 105** |
| Memakai `KartuKPI` | 11 / 105 |
| Memakai `<Tabel>` | 41 / 105 |
| Masih ada `<table>` mentah | 6 halaman (8 tabel) |
| Masih ada hex mentah | 10 halaman (20 hex) |
| Format angka ad-hoc | **51 halaman (83 panggilan)** |
| Halaman > 700 baris | 16 |
| Halaman < 200 baris | 18 |

### F.2 Sebaran per grup

| Grup | Halaman | Warna kategori |
|---|---|---|
| Administrasi | 16 | `--text-muted` |
| Keuangan | 15 | `--success` |
| Pengadaan | 13 | `--data-4` |
| **Portal Mandor** | 11 | `--warning` |
| Mandor & Subkon | 10 | `--warning` |
| Perencanaan | 5 | `--data-2` |
| **Portal PM** | 5 | `--data-1` |
| Operasi Lapangan | 4 | `--data-2` |
| Sistem (login/auth) | 4 | `--text-muted` |
| **Portal Klien** | 4 | `--data-2` |
| Gudang & Material | 3 | `--data-4` |
| Kontrak | 3 | `--data-1` |
| Alat & Aset · Beranda | 2 each | `--data-4` · `--navy` |
| 9 grup lain | 1 each | lihat keluaran skrip |

**Semua token warna di atas sudah diverifikasi ada di `globals.css`** (kedua
mode) — bukan token karangan.

### F.3 Koreksi penting: warna kategori per **GRUP**, bukan per halaman

§3.3 brief meminta satu warna kategori per halaman. Dengan 105 halaman itu
berarti 105 warna — mustahil dibedakan mata dan justru **merusak** konsistensi
yang jadi tujuan brief. Yang saya pakai: warna melekat pada **grup menu (22)**,
halaman mewarisi induknya. Orang belajar "hijau = uang" sekali, lalu berlaku di
15 halaman keuangan.

### F.4 Dua hal yang matriks ini temukan, dan brief tak tahu

**a) Empat shell, bukan satu.**

```
/(dashboard)/*     84 halaman   Sidebar + Topbar
/mandor-portal/*   11 halaman   layout SENDIRI, tanpa sidebar dashboard
/pm-portal/*        5 halaman   layout SENDIRI
/portal/*           4 halaman   layout SENDIRI (klien)
```

Diverifikasi: ketiga portal punya `layout.tsx` sendiri dan **nol** referensi ke
Sidebar/Topbar dashboard. AppShell 3 kolom **tidak boleh** dipaksakan ke sana.

**b) Nol tautan mati.** Sempat terbaca 24, **semuanya keliru** — `peta-menu.ts`
menunjuk tab lewat query (`/laporan?tab=wip`) dan halamannya memang ada.
Saya perbaiki pembanding rutenya sebelum angka itu masuk dokumen; kalau tidak,
sesi berikutnya akan membangun 24 halaman yang sudah ada.

---

## G. Sepuluh Ide UX Khusus Konstruksi Indonesia

| # | Ide | Masalah nyata | Effort |
|---|---|---|---|
| 1 | **Dua ring: Serapan vs Progres Fisik** + selisih | Proyek "80% terpakai, 55% jadi" = rugi berjalan, hari ini harus dihitung manual | **M** |
| 2 | **Kasbon vs Earned Value dengan garis limit 80%** | Limit sudah ada di `pengaturan/keuangan`, tapi tak pernah *terlihat* — mandor lewat limit baru ketahuan saat settlement | **S** |
| 3 | **Bilah Keputusan** (signature Arah 2) | Approval tersebar di 5 modul; tak ada satu tempat "apa yang menunggu saya" | **M** |
| 4 | **Mode Lapangan** — kontras tinggi, target ≥44px, font +2 | Mandor: HP murah, layar tergores, matahari langsung, tangan kotor | **M** |
| 5 | **Ringkasan ke WhatsApp** (teks + angka, bukan gambar) | WA adalah kanal nyata kontraktor Indonesia; hari ini progres disalin manual | **S** |
| 6 | **Foto before/after bersanding** — hanya bila proyek & titik sama | Bukti visual progres. **Syarat ketat** karena §11e sudah menolak versi palsunya | **M** |
| 7 | **Badge sumber AHSP** (nasional / perusahaan / edisi) | CECEP punya multi-edisi; tanpa badge, harga dari edisi berbeda tercampur diam-diam | **S** |
| 8 | **Cuaca vs progres cor** | Pekerjaan cor batal karena hujan; keterlambatan jadi sengketa tanpa catatan | **L** |
| 9 | **Retensi & jatuh tempo sebagai garis waktu** | Retensi 5% tertahan tahunan, sering terlupa ditagih | **M** |
| 10 | **Jejak "angka ini dari mana"** — klik angka KPI → sumbernya | Kepercayaan. Founder pernah menemukan laporan membaca tabel nol baris (`d66956d`) | **M** |

Ide 1, 2, 3, 7 memakai data yang **sudah ada endpoint-nya**. Ide 8 butuh
integrasi cuaca → `API-GAPS.md`.

---

## H. Rencana Eksekusi

### H.1 Rantai PR (koreksi atas §11 brief)

| PR | Isi | Gate |
|---|---|---|
| 0 | Dokumen ini + ADR-011 + `peta-redesign.mjs` | ✅ **Gerbang 1 TERTUTUP** |
| **0b** | **`kerapatan-ratchet` dihijaukan** — PR tersendiri *(keputusan 3)* | — |
| 1 | `lib/format.ts` + penjaga `format-ratchet` (lantai 83) | — |
| 2 | `KepalaHalaman` disebar ke 105 halaman + penjaga | — |
| 3 | `--data-6..8` (kalau lolos kontras) + `chart-tema.ts` | — |
| 4 | `AppShell` + **slot rail opsional** + Bilah Keputusan + drawer | — |
| 4b | **6 endpoint deret historis KPI beranda** + `Sparkline` *(keputusan 5)* | — |
| 5 | **Pilot `/dashboard`** (rail AKTIF) + screenshot 1440/1180/768/390 | **Gerbang 2** |
| 6+ | Rollout per grup dashboard (18 grup, terbesar dulu) | — |
| akhir-1 | **Tiga portal** — shell sendiri, token & komponen sama *(keputusan 2)* | — |
| akhir | QA konsistensi + `DESIGN-SYSTEM.md` | — |

**PR 0b didahulukan atas segalanya** *(keputusan 3)*. Alasannya bukan kerapian:
penjaga itu persis yang melindungi `--pad-kartu` 12px — token paling
diperdebatkan di redesign ini. Masuk redesign dengan penjaga itu merah berarti
kehilangan sinyal untuk membedakan kerusakan **baru** dari yang **lama**.

**Portal dikerjakan di akhir, bukan paralel** *(keputusan 2)* — supaya token dan
komponen sudah stabil saat shell portal disentuh.

**PR 1 & 2 didahulukan** karena keduanya menyentuh 105 halaman sekaligus dengan
risiko paling rendah — dan PR 2 langsung menjawab "tiap halaman terasa buatan
sendiri" tanpa menyentuh isi halaman.

### H.2 Estimasi jujur

Anda memilih **rombak penuh satu per satu untuk 105 halaman**. Dengan ~16
halaman >700 baris, itu realistis **puluhan sesi** — bukan 14 PR. Saya
menuliskannya di sini supaya tidak ada kejutan di tengah jalan.

### H.3 Risiko

| Risiko | Mitigasi |
|---|---|
| Rombak berhenti di tengah → aplikasi setengah lama setengah baru | PR 1–3 menyentuh semua halaman serentak lewat token/komponen. Kalau berhenti sesudahnya, aplikasi tetap konsisten |
| Arah visual ditolak sesudah dibangun | Pilot satu halaman (PR 5) — persis pola UI-1-1 yang sudah terbukti |
| `--data-6..8` gagal kontras | Berhenti di jumlah yang lolos + pembeda non-warna. **Tidak** menurunkan ambang |
| Portal ikut terseret AppShell | Shell portal **eksplisit di luar** cakupan PR 4 |
| Bentrok sesi lain di `globals.css` | UI-0-1 masih `berjalan` — PR 3 dikoordinasikan, bukan paralel |

### H.4 Temuan yang perlu Anda tahu sebelum memutuskan

> **`kerapatan-ratchet` sudah MERAH di `feat/sumbu-ui-roadmap` sebelum sesi ini.**
>
> Dibuktikan: berkas baru saya dipindahkan keluar sampai `git status` bersih
> persis HEAD, penjaga tetap `exit 1` ("BERTAMBAH 1"). Penjaga hanya memindai
> `.tsx`, jadi bukan berkas saya penyebabnya.
>
> Ini **bukan** saya perbaiki diam-diam di Fase 0 — memperbaikinya menyentuh
> halaman produksi dan itu pekerjaan Fase 1. Tapi Anda perlu tahu bahwa CI
> cabang ini sedang merah, terlepas dari redesign.

---

## Keputusan — SEMUA SUDAH TURUN

> **Nol pertanyaan terbuka.** Gerbang 1 tertutup 2026-08-08.

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Primitif: perluas vs bangun baru | ✅ **Perluas yang ada** |
| 2 | Token bentrok | ✅ **Hormati keputusan lama**; kategorikal chart token terpisah |
| 3 | Cakupan | ✅ **Semua 105 halaman** |
| 4 | Bentuk & kedalaman matriks | ✅ **Digenerate; rombak penuh per halaman** |
| 5 | Arah shell | ✅ **Satu AppShell, slot rail opsional** — bukan Arah 1/2/3 |
| 6 | Tiga portal | ✅ **Ikut, shell sendiri, sesudah grup dashboard** |
| 7 | `kerapatan-ratchet` merah | ✅ **Perbaiki dulu — PR 0b** |
| 8 | Mode kepadatan (Arah 3) | ❌ **DITOLAK** — 4 kombinasi penjaga |
| 9 | Sparkline | ✅ **6 endpoint deret, beranda saja** — data terbukti ada |

---

## RATIFIKASI — Gerbang 1 ✅ TERTUTUP 2026-08-08

**Yang disetujui:**

1. ✅ **Satu `AppShell` dengan slot rail opsional** — rail aktif di halaman
   ikhtisar, mati di halaman tabel. Bilah Keputusan tetap dibangun.
2. ✅ **Menolak §4.3 brief** (padding 20px) — `--pad-kartu` 12px dipertahankan.
3. ✅ **Menolak §6 brief** (~40 primitif baru) — memperluas `Tabel`/`KartuKPI`/
   `KepalaHalaman` yang sudah ada.
4. ✅ **Menolak §8.10–8.12 brief** sebagai "halaman baru" — `/klien`,
   `/pengaturan`, `/estimasi` sudah ada; yang dikerjakan merombaknya.
5. ✅ **Memperpanjang `--data-*` jadi 8**, dengan hak berhenti di jumlah yang
   lolos kontras.
6. ✅ **Menolak mode kepadatan** Nyaman/Rapat — biaya 4 kombinasi penjaga.
7. ✅ **Sparkline dibangun** untuk 6 KPI beranda; riwayat 8–9 bulan terbukti ada.
8. ✅ **Portal ikut dirombak dengan shell sendiri**, sesudah grup dashboard.
9. ✅ **Urutan PR**: 0b kerapatan → format → KepalaHalaman → token → shell →
   deret KPI → pilot → grup → portal.

**Yang TIDAK diratifikasi baris-per-baris:** nilai hex `--data-6..8` (diusulkan
sesudah diuji kontras, bukan dari kepala) dan detail 105 halaman (digenerate).

**Fase 1 boleh dimulai dari PR 0b.**

---

### Cara memverifikasi seluruh dokumen ini

```bash
node apps/web/scripts/peta-redesign.mjs --ringkas      # semua angka §F
find apps/web/app -name page.tsx | wc -l               # 105
grep -rl "KepalaHalaman" apps/web/app --include=page.tsx | wc -l   # 0
grep -rlE "toLocaleString|Intl\.(NumberFormat|DateTimeFormat)" \
  apps/web/app --include=page.tsx | wc -l              # 51
grep -nE "^\s*--data-[0-9]" apps/web/app/globals.css   # deret yang berlaku
git show a38cb0d --stat                                # apa yang BENAR ditolak
```
