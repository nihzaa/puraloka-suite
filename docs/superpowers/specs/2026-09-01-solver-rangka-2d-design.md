# Solver Rangka 2D — Design Spec

> Status: DRAFT — menunggu review founder sebelum ditransisikan ke
> implementation plan.
>
> Ditulis 2026-09-01, sesudah mesin rekomendasi tulangan (`4e9c3a9d`), rutenya
> (`6558c7cc`), layarnya (`c19563c9`), dan mode "hitungkan dari beban"
> (`5b43d275`) selesai dan hidup di produksi (VPS `34187433`).

## 0. Kenapa dokumen ini ada

Repo ini punya 40 modul struktur yang menghitung KAPASITAS penampang, dan
**tak satu pun menghitung gaya dalam**. Diukur, bukan diingat:

```
analisaBalok(…)        menerima  muKnm, vuKn      ← angka jadi
analisaKolom(…)        menerima  puKn, muKnm      ← angka jadi
analisaRangka(…)       menerima  batang[].gayaKn  ← angka jadi
```

Bahkan modul rangka batang — yang namanya paling menjanjikan analisa — meminta
gaya tiap batang sebagai masukan. Pencarian `kLocal|matriks kekakuan|stiffness`
di seluruh `lib/`: **nol hasil**.

Yang menutup sebagian celah itu 2026-09-01 adalah `struktur-beban-balok.ts`
lewat **koefisien perkiraan** SNI 2847 §6.5 (wL²/8, /10, /11). Itu sah untuk
perencanaan awal dan sudah dipakai layar Rekomendasi Pembesian. Tetapi modul itu
menyatakan sendiri batasnya:

> *"Yang TIDAK: analisa rangka statis tak tentu yang sesungguhnya — distribusi
> momen antar-batang, kekakuan relatif kolom-balok, goyangan portal. Itu
> pekerjaan pemodelan rangka, dan modul ini TIDAK berpura-pura
> menggantikannya."*

Dokumen ini merancang pekerjaan itu.

### Kenapa sekarang, dan apa yang MEMBATASINYA

Pemicunya iklan Instagram: **PortalRC** (`portal-lp.ratukarya.my.id`, Rp99.000)
menjual analisa portal 2D + rekomendasi pembesian. Isi aplikasinya dibaca
langsung dari HTML-nya, bukan dari halaman jualannya:

| | PortalRC | Kita hari ini |
|---|---|---|
| Solver | ✅ direct stiffness, matriks 6×6 | ❌ nihil |
| Elemen | balok & kolom saja | 34 jenis |
| Lantai / kolom | 1–3 / 2–5 (dari `<select>`-nya) | — |
| Gempa & angin | ❌ (dinyatakan sendiri) | ✅ `struktur-beban-lateral.ts` |
| Pondasi, tangga, baja, sambungan | ❌ | ✅ |
| BBS & tembus RAB | ❌ | ✅ |

Jadi yang mereka punya dan kita tidak **cuma solvernya**. Sisanya kita jauh di
depan — dan gempa/angin yang mereka nyatakan "belum termasuk" justru sudah kita
punya, siap dipakai solver ini.

---

## 1. Tujuan & non-tujuan

### Tujuan

Menghitung gaya dalam (M, V, N), lendutan, dan diagramnya untuk rangka 2D, lalu
menyambungkannya ke modul kapasitas yang SUDAH ADA — sehingga pertanyaan
lapangan bisa dijawab dari nol tanpa pemakainya menghitung momen sendiri.

Empat kemampuan, semuanya dalam lingkup spec ini:

1. **Balok menerus** — beberapa bentang di atas beberapa tumpuan
2. **Portal 2D gravitasi** — kolom + balok, kekakuan relatif ikut terhitung
3. **Beban lateral** — gempa & angin, memakai `analisaGempaStatik` yang ada
4. **Rangka batang (truss)** — mengisi `gayaKn` yang selama ini masukan

### Non-tujuan (dan alasannya)

| Di luar lingkup | Kenapa |
|---|---|
| Analisa 3D | Portal 2D per-arah sudah menjawab bangunan beraturan; 3D menuntut pemodelan pelat sebagai diafragma |
| Non-linier / P-Δ | Butuh iterasi; `struktur-beban-lateral.ts` sudah menghitung θ dan MENYATAKAN kapan P-Δ jadi penting |
| Analisa dinamik (ragam) | Statik ekuivalen sudah tersedia dan sah sampai 40 m (`TINGGI_MAKS_STATIK_M`) |
| Torsi | Tak satu pun modul kapasitas kita memeriksanya; menghitungnya tanpa pemeriksanya adalah angka tanpa pemakai |
| Pelat sebagai elemen | Tetap sumber beban lewat tributari, seperti sekarang |

**Batas yang WAJIB ikut di `catatan` tiap hasil** — bukan disembunyikan:
elastis linier, sambungan dianggap kaku sempurna (portal) atau sendi (truss),
tanpa P-Δ, tanpa torsi, tanpa penurunan tumpuan.

---

## 2. Arsitektur — empat berkas, satu arah ketergantungan

Prinsip yang menentukan segalanya: **solver murni numerik, BUTA terhadap SNI.**

```
rangka-matriks.ts    matriks 6×6 · transformasi · penyelesai linier
       ↑             tak tahu apa itu balok, gempa, atau kombinasi
rangka-model.ts      simpul · batang · tumpuan · beban → gaya dalam + lendutan
       ↑             masih buta SNI
rangka-portal.ts     merakit portal/balok menerus dari geometri,
       │             kombinasi 1,4D dan 1,2D+1,6L, beban lateral
rangka-truss.ts      merakit truss → mengisi gayaKn
       ↓
sarankanBalok · analisaKolom · analisaRangka   ← SUDAH ADA, tak disentuh
```

### Kenapa dipisah begitu

Bukan kerapian. **Solver yang salah tidak mengeluarkan galat** — ia memberi
momen yang terlihat wajar, dipakai memilih tulangan, lalu dicor. Satu-satunya
cara tahu ia benar adalah membandingkan dengan jawaban yang sudah pasti.

Kalau keempat kemampuan ditulis bercampur lalu hasilnya meleset 15%, tersangkanya
empat: matriksnya, perakitannya, kombinasi bebannya, atau penerapan gempanya —
dan tak ada cara memisahkannya. Berlapis membuat tiap lapis punya kasus tangan
yang menutupnya sebelum lapis berikutnya menumpang di atasnya.

### Yang TIDAK dihitung ulang

`analisaGempaStatik` sudah memulangkan `GayaTingkat` per lantai (`struktur-beban-lateral.ts`).
Solver menerimanya sebagai beban titik — **nol rumus gempa baru**. Pola yang
sama dengan `sarankanBalokDariBeban`, dan alasannya sama: dua sumber kebenaran
untuk besaran yang sama akan menyimpang tanpa satu pun galat, kelas cacat yang
dijaga `audit-takeoff-kembar-sepakat.mjs`.

---

## 3. Lima lapis, tiap lapis punya bukti penutup

Dibangun berurutan. Tiap lapis WAJIB hijau terhadap kasus tangannya sebelum
lapis berikutnya dimulai.

| # | Lapis | Kasus tangan penutup (jawaban EKSAK) |
|---|---|---|
| 1 | matriks + penyelesai | kantilever ujung bebas **wL²/2** · balok jepit-jepit **wL²/12** (tumpuan), **wL²/24** (tengah) |
| 2 | balok menerus | dua bentang sama, beban merata: M tumpuan tengah **wL²/8**, M lapangan **wL²/14,22** di x=0,375L |
| 3 | portal gravitasi | portal satu bentang berkaki jepit — nilai buku teks |
| 4 | lateral | portal beban titik P di atap, kolom sama: M kaki tiap kolom **P·h/4** |
| 5 | truss | rangka segitiga beban puncak P: batang tekan **P/(2 sin θ)** |

Semua angka di kolom kanan **eksak**, bukan pendekatan — jadi selisih 1% pun
berarti solver salah, bukan "wajar berbeda". Itu sebabnya kasus-kasus ini
dipilih: yang jawabannya pendekatan tak bisa membedakan salah dari beda.

⚠ **Status verifikasinya BERBEDA-BEDA, dan itu jangan disamarkan.** Baru
LAPIS 2 yang dihitung ulang secara numerik saat spec ini ditulis (persamaan
tiga momen → wL²/8,0000 tepat, dengan momen lapangan wL²/14,22 di x=0,375L
sebagai pemeriksaan kedua). Sisanya dikutip sebagai rumus baku dari ingatan.

Konsekuensinya mengikat implementasi: **tiap kasus tangan WAJIB dihitung
ulang dan sumbernya ditulis di komentar test sebelum dipakai sebagai
kebenaran.** Kasus tangan yang salah kutip lebih berbahaya daripada tak ada
kasus tangan — ia membuat solver yang BENAR terlihat salah, atau sebaliknya,
dan tak ada yang memeriksa angka yang sudah tertulis di dokumen desain.

### Lendutan — lapis 1, diuji terpisah

Lendutan ikut dihitung (keputusan founder). Kasus penutupnya:

- balok sederhana beban merata: **5wL⁴/384EI**
- kantilever beban ujung: **PL³/3EI**

Ini menutup lubang nyata: kontrol lendutan tercatat sebagai batas yang BELUM
diperiksa modul mana pun (`analisaBalok` menyatakannya di komentar dan catatan).

### Pemeriksaan kewarasan (bukan pengganti kasus tangan)

Hasil solver dibandingkan dengan `analisaBebanBalok`. Di luar rentang
**0,5–1,5×** berarti ada yang salah di salah satunya. Ini TIDAK bisa
membuktikan solver benar — keduanya memang seharusnya berbeda, dan itu justru
alasan solver dibangun — tapi menangkap kesalahan besar dengan murah.

---

## 4. Dua bahaya yang ditutup di desain, bukan ditemukan nanti

### 4.1 Matriks singular = struktur yang bisa bergerak bebas

Tumpuan yang kurang membuat matriks kekakuan singular. Itu **bukan galat
matematika**: penyelesai akan memulangkan angka raksasa yang terlihat seperti
hasil, dan angka itu akan dipakai memilih tulangan.

Solver WAJIB mendeteksi dan **menolak dengan menyebut sebabnya** ("struktur
labil: simpul 3 bisa bergerak arah X — tambahkan tumpuan"), bukan memulangkan
`Infinity` atau `NaN`. Diuji dengan struktur yang sengaja dibuat labil.

### 4.2 Konvensi tanda

Momen positif di satu buku bisa negatif di buku lain. Tanda yang tertukar
menghasilkan tulangan **di sisi yang salah** — tulangan tumpuan dipasang di
bawah, dan balok gagal pada beban yang seharusnya aman.

Satu konvensi ditetapkan di header `rangka-matriks.ts`, ditulis eksplisit,
dan diuji: momen positif = serat bawah tertarik (lazim di praktik Indonesia).

---

## 5. Keluaran

Per batang:

```
momenKnm      { maks, min, di: [{ x, nilai }] }   ← untuk diagram M
geserKn       { maks, min, di: [{ x, nilai }] }   ← diagram V
aksialKn      { maks, min }                        ← diagram N
lendutanMm    { maks, di: [{ x, nilai }] }
```

Nilai kritis dipakai menyambung ke modul kapasitas; deret `di[]` dipakai
menggambar diagram. Repo sudah punya penggambar SVG untuk 34 jenis elemen
(`struktur-gambar.ts`), jadi diagram M/V/N menumpang mekanisme yang ada.

**Jumlah titik per batang: 11** (interval 0,1·L). Cukup untuk diagram yang
terbaca, dan momen maksimum pada beban merata jatuh di titik yang terwakili.

---

## 6. Yang menyambung ke modul yang sudah ada

```
rangka-portal  →  Mu, Vu per balok      →  sarankanBalok / analisaBalok
               →  Pu, Mu per kolom      →  sarankanKolom / analisaKolom
rangka-truss   →  gayaKn per batang     →  analisaRangka (mengisi yang selama
                                            ini diminta sebagai masukan)
```

Di layar Rekomendasi Pembesian, ini menjadi **lapis ketelitian ketiga**:

```
angka langsung  →  koefisien pendekatan  →  analisa rangka
    (ada)             (5b43d275)              (spec ini)
```

Ketiganya tetap ada. Yang punya momen dari ETABS tetap bisa memakainya; yang
butuh perkiraan cepat tetap punya koefisien; yang butuh ketelitian punya solver.

---

## 7. Testing

Mengikuti disiplin repo (CLAUDE.md §8a.2): TDD, dan penjaga baru WAJIB
dibuktikan bisa merah lewat mutasi sengaja.

- **Kasus tangan** (§3) — sumber kebenaran, satu berkas test per lapis
- **Mutasi wajib**: tanda momen dibalik · satu suku matriks kekakuan digeser ·
  deteksi singular dimatikan. Ketiganya HARUS memerahkan test; yang tidak
  berarti testnya tak menjaga apa-apa
- **Pemeriksaan kewarasan** terhadap `analisaBebanBalok` (rentang 0,5–1,5×)
- **Pelajaran 5b43d275 diterapkan**: fixture dipilih supaya besaran yang diuji
  BENAR-BENAR menentukan hasilnya. Test kemarin hijau terhadap dua mutasi karena
  pemeriksaan kritisnya ternyata batas geometri yang tak memuat Mu sama sekali.
  Tiap test kepekaan WAJIB punya assertion prasyarat yang merah bila fixture-nya
  berhenti peka.

---

## 8. Risiko

| Risiko | Penanganan |
|---|---|
| Solver benar tapi lambat | Portal 3 lantai × 5 kolom = matriks kecil (< 100 DOF). Ukur, jangan optimalkan lebih dulu |
| Kasus tangan salah kutip | Tiap kasus disertai rumus DAN sumbernya di komentar test, bisa diperiksa ulang |
| Lingkup melebar saat implementasi | Non-tujuan §1 mengikat. Menambahnya butuh spec baru |
| Hasil beda dari koefisien pendekatan lalu dikira salah | Keduanya ditampilkan berdampingan; selisih itu WAJAR dan justru alasan solver ada |

---

## 9. Urutan kerja

1. `rangka-matriks.ts` + test kasus tangan lapis 1 (termasuk lendutan)
2. `rangka-model.ts` + deteksi singular + konvensi tanda
3. balok menerus (lapis 2) — menyambung ke `sarankanBalok`
4. portal gravitasi (lapis 3)
5. beban lateral (lapis 4) — memakai `analisaGempaStatik`
6. truss (lapis 5) — menyambung ke `analisaRangka`
7. rute + layar (lapis ketelitian ketiga) + diagram SVG

Tiap langkah: test dulu, mutasi untuk membuktikan testnya bisa merah, penjaga
terkait dijalankan, ringkasannya ditempel.
