# ARAH VISUAL 2026 — Puraloka Suite

> **Status: SEBAGIAN DIRATIFIKASI — 2026-08-07.**
>
> | §10 | Keputusan founder | Status |
> |---|---|---|
> | 1. Aksen indigo `#6366F1` | **DISETUJUI** | boleh dipakai |
> | 2. Kerapatan (§4) | **sedang dikerjakan di SESI LAIN** | ⚠️ jangan disentuh dari sini |
> | 3. Dashboard per menu induk (§5) | ditunda — PEMBEDA didahulukan | menunggu |
> | 4. Halaman contoh | menyusul sesudah §5 diputuskan | menunggu |
>
> **⚠️ Peringatan bentrok:** token kerapatan (`--pad-kartu`, `--gap-grid`,
> `--teks-*`) sedang diubah di sesi lain. Mengubahnya dari sini akan menimpa
> pekerjaan yang sedang berjalan. Sesi ini HANYA memakai aksen indigo, dan
> hanya pada halaman baru.
>
> Sisa dokumen di bawah tetap USULAN sampai keputusan §10 nomor 3 dan 4 turun.
>
> ### ⚠️ Temuan 2026-08-07 — `--aksen` SUDAH ADA, dan isinya navy
>
> Diukur di `globals.css`:
>
> ```
> --aksen:         #003366   ← navy, BUKAN indigo
> --aksen-terang:  #0059B3   ← biru
> --aksen-pekat:   #001F3D
> --aksen-lembut:  #E8F0F8
> ```
>
> Inilah "biru-di-atas-biru" yang §3a sebut sebagai penyebab monoton — token
> bernama *aksen* yang nilainya sama keluarga dengan warna merek.
>
> **Belum diubah, dan itu disengaja.** `--aksen*` dipakai di 8+ halaman
> (dashboard 9×, kas 4×, kalender 3×, arus kas, kasbon, laporan, audit),
> sebagian sebagai gradien grafik. Menukarnya jadi indigo akan mengubah
> seluruh halaman itu sekaligus — dan token kerapatan di berkas yang SAMA
> sedang digarap sesi lain.
>
> **Cara menerapkannya nanti** (satu perubahan, satu sesi, tanpa bentrok):
>
> 1. tukar keempat nilai `--aksen*` ke indigo (§3b)
> 2. jalankan `uji-token-grafik-bukan-teks.mjs` — indigo `#6366F1` adalah
>    token DATA (ambang 3:1), bukan warna teks (4,5:1)
> 3. audit a11y kedua mode: 47 halaman harus tetap nol pelanggaran
> 4. periksa gradien dashboard secara visual — di sanalah aksen paling terlihat
>
> Dokumen ini menjawab keluhan founder 2026-08-04:
> *"kurang dapet wah-nya, kurang punya taste desain"* dan
> *"tiap halaman terasa padat dan tidak kosong"*.
>
> Kalau arah di sini ditolak, biayanya nol — belum ada yang dibangun di atasnya.

---

## 0. Ringkasan satu halaman

| | |
|---|---|
| **Masalahnya** | Bukan "jelek". Halaman **2× lebih longgar** dari standar data-dense, font justru **lebih kecil**, dan **20 dari 22 menu induk hanya punya satu halaman** — langsung tabel, tanpa lapisan |
| **Yang dipertahankan** | Navy `#003366` (brand), Bricolage Grotesque + Plus Jakarta Sans (sudah bagus, bukan Inter), 105 token ber-riwayat WCAG |
| **Yang berubah** | Kerapatan (padding 24→12), sidebar gelap, satu aksen berani, **dashboard per menu induk**, tab dipecah jadi halaman |
| **Cara mengukurnya** | §8 — tiap klaim di dokumen ini punya perintahnya |

---

## 1. Diagnosis — angka, bukan perasaan

Semua diukur 2026-08-04 dari kode yang berjalan.

### 1a. Terlalu longgar, bukan kurang taste

| | Standar data-dense | Puraloka hari ini |
|---|---|---|
| Padding kartu | **12px** | **24px** ← 2× |
| Gap grid | **8px** | 16–20px |
| Tinggi baris tabel | **36px** | tak seragam |
| Font tabel | **12–14px** | **9–11px** ← terlalu kecil |

Padding besar mendorong konten menjauh; font mengecil supaya muat. Hasilnya:
**banyak ruang putih dengan tulisan kecil** — persis kebalikan dari "padat".

Data-dense yang benar: **padding rapat, font lebih besar, informasi lebih
banyak per layar**. Itu yang membuat Linear dan Ramp terasa mahal.

### 1b. Monoton karena tak ada lapisan

```
20 dari 22 menu induk = 1 halaman saja
```

Klik "Keuangan" → langsung tabel. Klik "Kas" → langsung tabel. Tak ada
ringkasan, tak ada grafik, tak ada "keadaan hari ini". Tiap menu terasa sama
karena **memang** sama bentuknya.

### 1c. Tab menyembunyikan aplikasi di dalam halaman

| Halaman | Rujukan tab | Baris |
|---|---|---|
| **keuangan** | 26 | **3.449** |
| **mandor** | 15 | **3.667** |
| laporan | 14 | 1.713 |
| kas | 14 | 1.447 |
| procurement | — | 2.448 |
| proyek/[id] | — | 2.006 |

Halaman 3.400 baris bukan halaman — itu aplikasi yang disembunyikan di balik
tab. Orang tak tahu ada apa di dalamnya sampai mengklik, dan mesin pencari
internal tak bisa menemukannya.

---

## 2. Yang DIPERTAHANKAN — dan kenapa

Merombak bukan berarti membuang. Tiga hal ini sudah benar, dan menggantinya
akan membuang kerja yang berharga:

**Navy `#003366`.** Ini identitas Puraloka — logonya (grafik batang naik)
memakai warna ini. Mengubahnya berarti mengubah merek, bukan UI.

**Bricolage Grotesque + Plus Jakarta Sans.** Diperiksa terhadap rekomendasi
mesin desain (Fira/Outfit/Poppins): pasangan yang ada **setara atau lebih
berkarakter**. Yang penting: **ini bukan Inter**. Font default AI-slop justru
yang dihindari, dan repo ini sudah lolos.

**105 token dengan riwayat WCAG tertulis.** Contohnya di `globals.css`:

> *`#9CA3AF` sampai 2026-07-31 — GAGAL WCAG AA: kontras 2,53:1 di atas putih…
> ditemukan axe-core pada halaman LOGIN, layar pertama yang dilihat setiap
> pengguna.*

Disiplin seperti itu jarang ada bahkan di produk berbayar. Arah baru
**menambah** di atasnya, bukan menghapusnya.

---

## 3. Palet — navy tetap raja, satu aksen berani

### 3a. Kenapa butuh aksen baru

Riset palet (mesin `ui-ux-pro-max`, domain `color`) mengembalikan empat
kandidat untuk "construction navy professional". **Semuanya biru-di-atas-biru**
— dan itu persis penyebab kesan monoton hari ini: navy untuk merek, biru untuk
info, biru untuk tautan, biru untuk grafik. Tak ada yang menonjol karena
semuanya menonjol.

Referensi Buildify yang founder kirim menyelesaikannya dengan cara berbeda:
**satu ungu pekat, sisanya abu-abu diam**. Keberaniannya dibelanjakan di SATU
tempat.

### 3b. Palet usulan

```
IDENTITAS (tak berubah)
  --navy            #003366   merek Puraloka, sidebar, tombol utama
  --navy-mid        #0050A0
  --navy-light      #EBF2FF

AKSEN BARU — dipakai HEMAT, hanya untuk yang paling penting di layar
  --aksen           #6366F1   indigo
  --aksen-terang    #818CF8
  --aksen-lembut    #EEF0FF
  --aksen-pekat     #4338CA

DATA (grafik & visualisasi — deret yang bisa dibedakan buta warna)
  --data-1          #003366   navy      (nilai utama)
  --data-2          #6366F1   indigo    (pembanding)
  --data-3          #0891B2   cyan      (deret ketiga)
  --data-4          #B45309   amber     (perhatian)
  --data-5          #7C3AED   ungu      (deret kelima)

SEMANTIK (tak berubah — sudah lolos WCAG)
  --success #15803d · --warning #B45309 · --danger #B91C1C · --info #1D4ED8
```

### 3c. Kenapa indigo, bukan ungu seperti Buildify

Tiga alasan, dan yang ketiga menentukan:

1. **Bertetangga dengan navy** di roda warna — terasa satu keluarga, bukan
   tempelan.
2. **Cukup berbeda** untuk menonjol: navy pekat gelap, indigo terang berjenuh.
3. **Ungu Buildify (`#7C3AED`) terlalu jauh dari navy** — dipakai bersama, ia
   membuat navy terlihat kusam. Indigo menaikkan navy, bukan menenggelamkannya.

### 3d. Aturan pemakaian aksen — ini yang paling mudah dilanggar

> **Satu aksen per layar.** Kalau tiga hal berwarna indigo, tak ada yang
> menonjol — dan halaman kembali monoton dengan warna yang berbeda.

| Boleh indigo | Tidak boleh |
|---|---|
| angka KPI **paling penting** di halaman | semua angka KPI |
| tombol aksi utama (satu per layar) | semua tombol |
| garis grafik **nilai utama** | seluruh deret grafik |
| indikator navigasi aktif | seluruh item navigasi |

---

## 4. Kerapatan — token spasi baru

Ini perubahan **paling berdampak** dan **paling murah**: ubah token, 59 halaman
ikut rapat sekaligus, tanpa menyentuh struktur.

```
                          SEKARANG    USULAN     ALASAN
--pad-kartu                 24px      12px       standar data-dense
--pad-kartu-longgar          —        16px       kartu KPI (butuh napas)
--gap-grid                16-20px      8px       standar data-dense
--gap-bagian                20px      16px
--tinggi-baris              auto      36px       baris tabel seragam
--radius-kartu              12px      14px       lebih lega, melunakkan rapat

TIPOGRAFI — NAIK, bukan turun
--teks-tabel              9-11px    12.5px       yang paling sering dibaca
--teks-label                11px      12px
--teks-badan                13px      14px
--teks-angka-kpi            17px      28px       angka besar = hierarki tegas
--teks-delta                 —        12px       "+2.3%" kecil di sebelahnya
```

**Yang mengejutkan:** font **naik** sementara padding **turun**. Itu bukan
kontradiksi — itu justru rahasianya. Ruang yang dihemat dari padding dipakai
untuk teks yang lebih terbaca.

---

## 5. Layout — dashboard per menu induk

### 5a. Gagasan founder, dan kenapa saya setuju

> *"tiap menu induk kayanya bagus ada semacam dashboard masing-masing gasii,
> dan punya KPI card, grafik, chart nya juga"*

**Ya.** Ini menyelesaikan §1b sekaligus §1c: halaman jadi padat (KPI + chart +
tabel, bukan tabel saja), dan orang tahu **keadaan** sebelum menyelam ke detail.

### 5b. Pola baku — tiga lapis

```
┌─────────────────────────────────────────────────────────────┐
│ LAPIS 1 — KEADAAN     4 kartu KPI                           │
│ "apa yang terjadi?"   angka besar + delta + spark kecil      │
├─────────────────────────────────────────────────────────────┤
│ LAPIS 2 — POLA        1-2 grafik                            │
│ "ke mana arahnya?"    tren waktu · perbandingan kategori     │
├─────────────────────────────────────────────────────────────┤
│ LAPIS 3 — DETAIL      tabel / daftar                        │
│ "apa yang harus       yang bisa disaring & diurutkan         │
│  saya kerjakan?"                                             │
└─────────────────────────────────────────────────────────────┘
```

Urutannya **bukan selera**: ia mengikuti pertanyaan yang dibawa orang saat
membuka halaman. Menaruh tabel di atas memaksa mereka memindai 40 baris untuk
menjawab pertanyaan yang bisa dijawab satu angka.

### 5c. KPI per menu induk — usulan konkret

| Menu | KPI 1 | KPI 2 | KPI 3 | KPI 4 |
|---|---|---|---|---|
| **Dashboard** | proyek aktif | nilai kontrak | kas hari ini | yang perlu keputusan |
| **Proyek** | aktif | progres rata-rata | telat | selesai bulan ini |
| **Keuangan** | kas | piutang | retensi tertahan | klaim terbuka |
| **Kas** | saldo total | masuk bulan ini | keluar bulan ini | selisih |
| **Mandor** | mandor aktif | kasbon beredar | penagihan menunggu | retensi tertahan |
| **Procurement** | PO terbuka | menunggu terima | nilai bulan ini | vendor aktif |
| **Lapangan** | RFI terbuka | punch belum tutup | instruksi belum konfirmasi | NCR aktif |
| **Kontrak** | kontrak aktif | EOT menggantung | klaim terbuka | jaminan mau habis |

Tiap angka di sini **sudah ada API-nya** — tak ada yang perlu dibangun dari nol.

### 5d. Sidebar gelap

Dari referensi Buildify: sidebar gelap + konten terang menciptakan **dua zona**
— navigasi "mundur", konten "maju". Itu yang membuat kontennya terasa naik ke
depan tanpa perlu bayangan tebal.

```
--sidebar-bg        #0B1220   navy nyaris hitam (bukan hitam murni)
--sidebar-teks      #94A3B8
--sidebar-aktif-bg  #1E293B
--sidebar-aktif-tx  #FFFFFF
--sidebar-aktif-bar #6366F1   ← garis aksen 3px di kiri item aktif
```

Bukan hitam murni: `#0B1220` menahan rona navy, jadi sidebar terasa satu
keluarga dengan merek — bukan tema gelap generik.

---

## 6. Tab vs halaman — aturan yang bisa diuji

### 6a. Aturannya

> **Tab** = sudut pandang berbeda atas **data yang sama**
> **Halaman** = **entitas berbeda**

Uji cepat: *"kalau saya kirim tautan ini ke rekan, apa yang ia lihat?"* Kalau
jawabannya bergantung tab mana yang terakhir dibuka, itu **seharusnya halaman**.

### 6b. Penerapan

| Halaman | Sekarang | Usulan |
|---|---|---|
| **keuangan** (3.449 baris) | ~8 tab | **dashboard** + `/keuangan/invoice` `/piutang` `/retensi` `/klaim` |
| **mandor** (3.667 baris) | 7 tab | **dashboard** + `/mandor/penugasan` `/upah` `/kasbon` `/penagihan` `/retensi` |
| **kas** (1.447 baris) | ~4 tab | **dashboard** + `/kas/transaksi` `/transfer` |
| **laporan** (1.713 baris) | ~5 tab | tetap tab — semuanya **laporan yang sama, periode berbeda** ✅ |
| **estimasi** | 7 tab | tetap tab — tahapan satu alur kerja ✅ |

Dua yang terakhir **sengaja tak dipecah**: tab di sana memang benar.

### 6c. Yang didapat

- Tautan bisa dibagikan (`/mandor/retensi` langsung terbuka)
- Halaman 3.667 baris jadi 5 berkas ±600 baris — bisa dibaca manusia
- Tiap halaman punya judul sendiri → mesin pencari internal menemukannya
- Muat lebih cepat: tak lagi memuat data 7 tab sekaligus

---

## 7. Gerak — hemat, dan tiap gerakan punya sebab

Skill `frontend-design` memperingatkan: animasi berlebih justru membuat desain
terasa **dihasilkan AI**. Karena itu daftarnya pendek dan tiap satunya menjawab
pertanyaan "apa yang berubah?".

| Di mana | Apa | Durasi |
|---|---|---|
| Baris tabel di-hover | latar `--surface-hover` | 150ms |
| Kartu KPI muncul | naik 8px + fade, bertahap 40ms antar-kartu | 300ms |
| Angka KPI berubah | hitung naik dari nilai lama | 400ms |
| Tab/halaman pindah | crossfade | 200ms |
| Tombol ditekan | skala 0.98 | 100ms |

**Tak ada** parallax, blob bergerak, gradient beranimasi, atau hero besar.
`prefers-reduced-motion` mematikan semuanya.

---

## 8. Cara mengukur — jangan percaya angka di dokumen ini

Tiap klaim di atas punya perintahnya. Jalankan ulang; kalau berbeda, **dokumen
ini yang salah**.

```bash
# Kerapatan yang dipakai sekarang
grep -ohE "padding: [0-9]+" "apps/web/app/(dashboard)/proyek/[id]/page.tsx" \
  | sort | uniq -c | sort -rn | head -5

# Ukuran font
grep -ohE "fontSize: [0-9]+" "apps/web/app/(dashboard)/proyek/[id]/page.tsx" \
  | sort | uniq -c | sort -rn | head -5

# Menu induk & jumlah halamannya
for d in "apps/web/app/(dashboard)"/*/; do
  echo "$(basename $d) $(find $d -name page.tsx | wc -l)"
done

# Halaman terbesar
wc -l "apps/web/app/(dashboard)"/*/page.tsx | sort -rn | head -6

# Penjaga visual yang sudah ada (semuanya harus tetap hijau)
cd apps/web && for g in a11y-ratchet kontras-hex-ratchet hex-ratchet \
  tata-letak-ratchet modal-esc-ratchet; do node scripts/$g.mjs; done
```

---

## 9. Risiko — dan kenapa saya tetap mengusulkannya

| Risiko | Mitigasi |
|---|---|
| **Rombak 59 halaman berhenti di tengah** → aplikasi setengah lama setengah baru, lebih buruk dari sekarang | Kerjakan **per token dulu** (§4). Ubah token = semua halaman ikut rapat serentak. Baru sesudahnya per-halaman |
| **Arah visualnya ternyata tak disukai** | **Satu halaman contoh dulu.** Biaya kalau salah: satu halaman, bukan 59 |
| **Penjaga WCAG jadi merah** | 9 penjaga visual sudah ada dan wajib tetap hijau — termasuk `kontras-hex-ratchet` yang memeriksa pasangan warna sebaris |
| **Fitur berhenti dibangun** selama rombak | Roadmap UI **terpisah** (`QUEUE-UI.yaml`), dikerjakan berselang dengan roadmap utama — bukan menggantikannya |

---

## 10. Yang menunggu keputusan founder

1. **Palet aksen indigo `#6366F1`** — setuju, atau ingin warna lain?
2. **Sidebar gelap `#0B1220`** — setuju?
3. **Tab dipecah jadi halaman** untuk keuangan/mandor/kas — setuju? (laporan &
   estimasi sengaja tetap tab)
4. **Halaman contoh mana dulu?** Usul saya: **Dashboard** — paling sering
   dilihat, dan pola tiga lapisnya paling jelas terlihat di sana.

Sesudah keempatnya dijawab, saya bangun **satu halaman**, tunjukkan, dan
Anda putuskan apakah disebarkan.
