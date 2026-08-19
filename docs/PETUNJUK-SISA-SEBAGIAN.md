# Lima sisa `sebagian` — apa yang harus founder lakukan

> Ditulis 2026-08-19 menjawab pertanyaan founder: *"jadi saya harus ngapain?
> coba tiap sisa yang masih sebagian kasih saya petunjuk detailnya, dan jika
> ada alternatif lebih mudah juga coba kasih tau."*
>
> Konteksnya: founder **belum punya domain** dan ingin menyelesaikan semua
> dulu sebelum bersiap deploy.
>
> **Semua yang di bawah bisa dikerjakan TANPA domain**, kecuali yang ditandai.

---

## Ringkasan — mana yang murah, mana yang mahal

| # | Entri | Biaya | Waktu | Bisa tanpa domain? |
|---|---|---|---|---|
| 1 | `bi-terjadwal` | **Rp 0** | ~15 menit | ✅ ya |
| 2 | `mb-progres` | **Rp 0** | ~1 jam + uji lapangan | ✅ ya (lihat §2b) |
| 3 | `cc-cvr` | **Rp 0** | keputusan, bukan waktu | ✅ ya |
| 4 | `fn-efaktur` | Rp 0 | — | ✅ sudah maksimal |
| 5 | `dk-esign` | **berbayar** | kontrak | ❌ butuh badan usaha |

**Yang paling saya sarankan dikerjakan lebih dulu: nomor 1.** Satu kunci
gratis, 15 menit, dan ia menghidupkan **tujuh jenis surel** yang sekarang
diam — bukan satu.

---

## 1. `bi-terjadwal` — Rp 0, ~15 menit ⭐ MULAI DARI SINI

### Apa yang sebenarnya mati sekarang

Diukur 2026-08-19, `apps/api/src/utils/email.ts` punya **tujuh** pengirim,
dan **semuanya diam**:

| Fungsi | Yang tak pernah sampai |
|---|---|
| `sendWelcomeEmail` | surel sambutan saat akun dibuat |
| `sendMilestoneReminderEmail` | pengingat milestone proyek |
| `sendTerminReminderEmail` | pengingat termin jatuh tempo |
| `sendInvoiceOverdueEmail` | tagihan lewat jatuh tempo |
| `sendKasbonPendingEmail` | kasbon menunggu persetujuan |
| `sendProjectEndingEmail` | proyek mendekati selesai |
| `kirimLaporanTerjadwal` | laporan berkala |

⚠ **Dan diamnya TIDAK menimbulkan galat.** `sendEmail()` memulangkan `null`
lebih dulu bila kuncinya kosong. Jadwal tetap berjalan, `terakhir_dikirim`
tetap ter-update — **nol surel terkirim**. Layar akan menunjukkan "terakhir
dikirim: hari ini" dan Anda menyimpulkan laporannya sampai.

### Langkahnya

1. Buka **resend.com** lalu daftar (gratis, tanpa kartu kredit).
   Kuota gratis: **3.000 surel/bulan, 100/hari** — jauh di atas kebutuhan
   belasan mandor + beberapa klien.

2. Menu **API Keys** → **Create API Key** → salin (bentuknya `re_xxxxx…`).

3. Buka `apps/api/.env`, tambahkan **dua baris**:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=Puraloka Suite <onboarding@resend.dev>
```

⚠ **`onboarding@resend.dev` adalah alamat pengirim GRATIS milik Resend** —
tak perlu domain sendiri. Nanti saat domain sudah ada, ganti jadi
`noreply@puraloka.id` dan verifikasi domainnya di Resend.

4. **Kalau nanti sudah punya domain**, tambahkan juga:

```
APP_URL=https://app.puraloka.id
```

Sebelum itu **jangan diisi** — bawaannya `http://localhost:3000`, dan ada
**8 tombol** di badan surel yang memakainya. Terkirim ke klien sekarang
berarti klien mengklik tombol yang menunjuk ke komputernya sendiri.

👉 **Karena itu: pakai kunci Resend sekarang untuk menguji ke surel ANDA
SENDIRI, jangan dulu ke klien.** Baru sesudah domain siap, aktifkan jadwal
yang mengirim ke luar.

### Multi-tenant: kunci ini dipakai perusahaan lain juga?

**Pertanyaan founder 2026-08-19, dan ia menemukan cacat yang nyata.**

Sampai hari itu `utils/email.ts` membaca `process.env.RESEND_API_KEY`
LANGSUNG. Artinya seluruh tenant berkirim lewat **satu akun Resend milik
operator**:

- kuota 3.000/bulan dibagi tanpa ada yang tahu siapa memakai berapa
- satu tenant kena batas → surel tenant **lain** ikut mati
- penerima melihat domain **operator**, bukan domain perusahaan pengirim
- satu tenant di-spam-report → reputasi domain semua tenant kena

Sudah diperbaiki. Urutannya sekarang:

    1. kunci TENANT  (app_credentials, terenkripsi)  ← menang
    2. env server    (process.env)                   ← jaring pengaman
    3. tidak ada                                     → tak mengirim

**Untuk Anda hari ini (satu perusahaan):** isi di `.env` saja, seperti langkah
di atas. Itu jaring pengamannya, dan sah.

**Nanti saat menjual ke PT lain:** tiap tenant memasang kuncinya sendiri lewat
layar **Pengaturan → Kredensial** — tanpa menyentuh `.env` dan tanpa restart.
Ada tombol ujinya di layar itu.

⚠ **Alamat pengirim (`EMAIL_FROM`) SENGAJA tak punya jatuhan env.** Kunci API
boleh diwarisi dari server — yang "bocor" cuma kuota operator. Tapi alamat
pengirim yang diwarisi berarti tenant mengirim **tagihan dan berita acara dari
domain operator**, dan penerimanya melihat pengirim yang tak ia kenal. Untuk
dokumen yang meminta uang, itu terbaca seperti penipuan. Jadi tiap tenant
memasang alamatnya sendiri, atau memakai bawaan operator secara sadar.

### Alternatif lebih mudah?

**Tak ada yang lebih mudah dari ini** — Resend gratis, tanpa kartu, tanpa
domain. Tapi kalau Anda sudah punya Gmail dan lebih suka memakainya: kodenya
hanya menyentuh Resend di **satu berkas** (`utils/email.ts`, 9 rujukan), jadi
menggantinya dengan SMTP Gmail adalah perubahan kecil. Bilang saja kalau mau
saya kerjakan.

---

## 2. `mb-progres` — Rp 0, tapi butuh alamat API

### Kenapa ini tersendat

Kodenya **lengkap** (357 baris, dua mode, foto + izin runtime). `eas.json`
sudah saya buat 2026-08-19. Yang tersisa: aplikasi di HP mandor harus tahu
**ke mana mengirim data**, dan itu alamat yang bisa dijangkau dari kuota
seluler.

⚠ Alamat LAN kantor (`192.168.x.x`) **tidak cukup** — ia bekerja saat mandor
di kantor lalu mati begitu ia sampai di proyek. Persis di tempat aplikasi ini
dipakai. (Sudah ditolak penjaga.)

### 2a. Kalau Anda ingin menunggu domain — itu wajar

Tak ada yang rusak dengan menunggu. Semua sudah siap; tinggal isi alamat dan
build.

### 2b. Alternatif lebih mudah: uji lapangan TANPA domain

Kalau Anda ingin mandor mulai mencoba **sekarang**, ada dua jalan gratis.

**Pilihan A — Expo Go (paling cepat, ~10 menit)**

Tak perlu build APK sama sekali:

```bash
cd apps/api && npx tsx src/index.ts        # API jalan di komputer Anda
cd apps/mobile && npx expo start --tunnel
```

`--tunnel` membuat Expo menyediakan alamat publik sementara. Mandor memasang
aplikasi **Expo Go** dari Play Store, memindai QR, dan langsung mencoba.

- ✅ gratis, tanpa domain, tanpa build
- ❌ hanya jalan selama komputer Anda menyala dan perintah itu berjalan
- ❌ bukan aplikasi terpasang — ini untuk **uji coba**, bukan pemakaian harian

**Pilihan B — tunnel gratis + APK sungguhan**

Pakai **Cloudflare Tunnel** (gratis, tanpa domain):

```bash
cloudflared tunnel --url http://localhost:3001
```

Ia memberi alamat seperti `https://acak-kata-1234.trycloudflare.com`. Isi
alamat itu ke `apps/mobile/eas.json` bagian `preview`, lalu:

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build -p android --profile preview
```

- ✅ gratis, APK sungguhan yang bisa dipasang
- ❌ alamatnya **berubah tiap kali** `cloudflared` dijalankan ulang, jadi
  APK-nya mati dan harus dibuild ulang
- 👉 cocok untuk **uji seminggu**, bukan untuk seterusnya

### Sudah saya periksa: CORS-nya TIDAK menghalangi

Diukur di `apps/api/src/index.ts:185-198` — dan ini penting karena CORS
adalah tempat rencana semacam ini biasanya gagal di menit terakhir:

- `https://*.trycloudflare.com` **sudah masuk daftar izin** (pilihan B aman
  tanpa mengubah kode apa pun)
- aplikasi React Native **tidak mengirim header `Origin`**, dan baris 187
  meloloskan permintaan tanpa Origin — jadi pilihan A juga aman

Yang **tidak** diizinkan cuma peramban yang membuka alamat `*.exp.direct`.
Itu tak relevan: mandor memakai aplikasi, bukan peramban.

### Rekomendasi saya

**Pilihan A (Expo Go)** kalau tujuannya melihat apakah mandor mau memakainya.
Itu pertanyaan yang paling penting dan paling murah dijawab — dan jawabannya
menentukan apakah membangun sisanya sepadan.

Langkah lengkap: `docs/RILIS-MOBILE.md`.

---

## 3. `cc-cvr` — Rp 0, tapi ini keputusan Anda, bukan pekerjaan saya

### Kenapa saya tak bisa menyelesaikannya sendiri

CVR sekarang menghitung untung-rugi dari **upah borongan** saja. Untuk
mencakup material, sistem harus tahu **satu pembelian untuk pekerjaan apa**.

Diukur, dan datanya **tak pernah ditangkap di mana pun**:

| Tabel | Kolom "untuk pekerjaan apa" |
|---|---|
| `purchase_order_items` | ❌ nol |
| `material_request_items` | ❌ nol |
| `goods_receipt_items` | ❌ nol |
| `project_expenses` | ❌ nol |

Dan tak bisa ditebak dari kategori, karena keduanya **sumbu berbeda**:

```
kategori biaya = JENIS MATERIAL     Besi & Baja · Cat & Pelapis · Semen
kategori RAB   = PAKET PEKERJAAN    PEKERJAAN BAJA · PEKERJAAN CAT
```

Satu sak semen dipakai pondasi, kolom, **dan** lantai. Yang bisa memecahnya
cuma orang yang memesannya.

### Yang harus Anda putuskan

> **Apakah orang yang mengajukan permintaan material bersedia menyebut untuk
> pekerjaan apa (memilih dari daftar RAB)?**

- **Ya** → saya tambahkan satu dropdown di form permintaan material, dan CVR
  jadi mencakup material. Biayanya: **satu isian tambahan tiap permintaan.**
- **Tidak** → CVR tetap seperti sekarang, dan itu **sudah jujur**: layarnya
  menyatakan Rp 263,5 juta ada di luar hitungan, lengkap per kategori. Bukan
  kekurangan yang disembunyikan.

### Alternatif lebih mudah

**Jangan diapa-apakan.** Ini pilihan yang sah, dan alasannya kuat: menambah
isian yang tak diisi orang menghasilkan kolom kosong — lalu CVR tetap tak
lengkap, sekarang ditambah form yang lebih merepotkan.

Kalau ragu, tunda sampai ada mandor yang benar-benar memakai sistem
sehari-hari. Keputusan tentang beban isian paling baik diambil sesudah tahu
siapa yang mengisinya.

---

## 4. `fn-efaktur` — tak ada yang perlu dilakukan

Sudah maksimal untuk apa yang DJP izinkan:

- ✅ ekspor CSV e-Faktur (FK/LT/OF) siap unggah
- ✅ ekspor CSV bukti potong siap unggah ke e-Bupot Unifikasi
- ❌ pengambilan jatah nomor seri (NSFP) **tetap manual lewat e-Nofa**

DJP **tidak membuka API publik** untuk itu. Bukan kekurangan sistem ini — tak
ada aplikasi mana pun yang bisa mengotomatiskannya.

**Yang Anda lakukan: tetap ambil NSFP lewat situs e-Nofa seperti biasa**, lalu
masukkan nomornya ke sistem. Sisanya sudah otomatis.

---

## 5. `dk-esign` — satu-satunya yang berbayar

### Yang sudah jalan tanpa biaya apa pun

- ✅ sidik SHA-256 isi dokumen, **dihitung di server** (bukan dikirim klien)
- ✅ layar verifikasi: tempel isi dokumen, sistem menyatakan cocok/tidak
- ✅ kecocokan ditampilkan **per tanda tangan**, bukan cuma kesimpulan gabungan

Artinya Anda **sudah bisa membuktikan** dokumen tak berubah sesudah
ditandatangani. Untuk sengketa internal dan dengan subkontraktor, ini
biasanya cukup.

### Yang butuh biaya

**e-Meterai tersertifikasi** (Peruri) — hanya diperlukan bila dokumennya harus
punya kekuatan hukum penuh di pengadilan atau diminta pemberi kerja
pemerintah.

- Butuh **badan usaha berbadan hukum** + kontrak dengan distributor resmi
  Peruri
- e-Meterai Rp 10.000 dibeli per keping

### Alternatif lebih mudah

**Meterai tempel biasa.** Cetak dokumennya (sistem sudah bisa mencetak PDF
ber-kop dan ber-logo), tempel meterai Rp 10.000, tanda tangan basah, lalu
pindai dan unggah kembali.

Sah secara hukum, tanpa kontrak apa pun, dan itu yang dipakai hampir semua
kontraktor menengah di Indonesia hari ini.

👉 **Saran saya: lewati `dk-esign` sampai ada pemberi kerja yang memintanya.**

---

## Urutan yang saya sarankan

1. **Sekarang, 15 menit:** kunci Resend (§1) — tujuh jenis surel hidup. Uji ke
   surel Anda sendiri dulu.
2. **Kalau ingin mandor mencoba:** Expo Go tunnel (§2b pilihan A) — jawab
   pertanyaan "apakah mandor mau memakainya".
3. **Renungkan tanpa terburu-buru:** §3 — beban isian material.
4. **Abaikan** §4 dan §5 sampai ada yang memintanya.

Sesudah itu tak ada lagi yang menahan. Persiapan deploy tinggal mengikuti
`docs/SIAP-DEPLOY.md`.
