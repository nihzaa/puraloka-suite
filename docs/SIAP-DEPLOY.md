# Siap deploy — apa yang harus diputuskan, dan apa yang gagal DIAM-DIAM

> Ditulis 2026-08-19 menjawab founder: *"kalo saya blm punya domain karna
> belum deploy gimana? saya maunya selesai semua dulu baru persiapan deploy"*.
>
> **Urutan itu benar.** Alamat produksi adalah keputusan deploy, bukan
> keputusan fitur — menebaknya sekarang hanya menghasilkan nilai yang harus
> diganti nanti, dan nilai yang salah lebih berbahaya daripada yang kosong.
>
> Dokumen ini memastikan satu hal: **saat deploy tiba, tak ada kejutan.**

---

## 0. Yang TIDAK terhalang sama sekali

Belum punya domain **tidak menghalangi apa pun** yang bisa dikerjakan
sekarang. Diukur 2026-08-19:

- CI hijau — penjaga alamat mobile sengaja dua tingkat (kosong = peringatan)
- seluruh test jalan — mereka memakai basis lokal, bukan alamat produksi
- keempat pekerjaan kode selesai tanpa menyentuh satu pun alamat publik

Yang tertahan cuma **dua**, dan keduanya memang tak bisa dikerjakan tanpa
alamat:

| Tertahan | Butuh |
|---|---|
| build APK mandor (`mb-progres`) | alamat API yang terjangkau seluler |
| pengiriman surel terjadwal (`bi-terjadwal`) | `RESEND_API_KEY` |

---

## 1. Yang paling berbahaya: bawaan yang TERLIHAT benar

Ini inti dokumen ini. Variabel env yang hilang di repo ini **tidak melempar
galat**. Ia jatuh ke bawaan yang masuk akal — dan itulah yang membuatnya
mahal.

| Variabel | Kalau kosong | Yang terlihat |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Empat tombol di surel **ke klien** menunjuk ke komputer penerimanya sendiri. Kliennya mengklik, tak terjadi apa-apa, lalu menyimpulkan aplikasinya rusak |
| `RESEND_API_KEY` | `sendEmail()` jadi no-op **tanpa melempar** | Jadwal berjalan, `terakhir_dikirim` ter-update, **nol surel terkirim**. Diam yang terbaca seperti berhasil |
| `EXPO_PUBLIC_API_URL` | dipanggang `localhost:3001` ke APK | Di HP mandor, localhost adalah **HP-nya sendiri**. Galat jaringan yang menuduh SERVER |
| `VAPID_*` | notifikasi push mati | Tak ada galat. Orang mengira notifikasinya memang belum dibuat |
| `COOKIE_SECRET` | jatuh ke `JWT_SECRET` | Bekerja — tapi dua rahasia yang seharusnya bisa dirotasi sendiri-sendiri jadi satu |
| `KURS_USD_IDR` | `16.000` | Biaya token AI tercatat pada kurs yang mungkin sudah jauh berbeda |

**`SUPABASE_PUBLISHABLE_KEY` adalah pengecualian yang baik**: ia dipakai
dengan `!` di `routes/v1/keamanan.ts:70`, jadi kosong = **crash**, bukan
degradasi diam-diam. Kegagalan yang berisik jauh lebih murah.

Yang dijaga otomatis:

```bash
node apps/api/scripts/audit-env-siap-deploy.mjs   # ambang NOL, di CI
```

Ia menolak variabel yang dibaca kode tetapi tak pernah disebut
`.env.example`. Bukan menuntut `.env` Anda terisi — mesin pengembang memang
tak perlu kunci Resend. Yang dituntut: **namanya ada**, supaya saat deploy
tiba daftarnya lengkap.

---

## 2. Urutan saat deploy tiba

### Langkah 1 — putuskan alamat

Dua alamat, dan keduanya boleh subdomain dari satu domain:

```
https://app.puraloka.id     ← web (Next.js)
https://api.puraloka.id     ← API (Fastify)
```

### Langkah 2 — isi env

```bash
cp apps/api/.env.example apps/api/.env      # lalu isi
node apps/api/scripts/audit-env-siap-deploy.mjs
```

Yang **wajib** diisi, bukan sekadar disebut:

- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `DIRECT_URL`
- `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`
- `APP_URL` ← **jangan dilewat**, lihat §1
- `RESEND_API_KEY` + `EMAIL_FROM` kalau surel dipakai

### Langkah 3 — alamat mobile

Sunting `apps/mobile/eas.json`, bagian `env` profil `preview` &
`production`, lalu:

```bash
node apps/mobile/scripts/audit-alamat-api-terisi.mjs
```

Penjaga itu **otomatis jadi tegas** begitu diisi — dan menolak `localhost`,
`192.168.x`, maupun `10.x`. Alamat LAN kantor bekerja saat mandor di kantor
lalu berhenti bekerja begitu ia sampai di proyek: kegagalan yang muncul
justru di tempat aplikasi ini dipakai.

Langkah selengkapnya: `docs/RILIS-MOBILE.md`.

### Langkah 4 — port

⚠ `NEXT_PUBLIC_API_URL` di web dan `PORT` di API **wajib sepadan**. Sudah
dijaga, dan penjaganya lahir karena cacat ini terjadi DUA KALI:

```bash
cd apps/api && node scripts/audit-port-api-cocok.mjs
```

### Langkah 5 — migrasi

```bash
node scripts/db/ledger-diff.mjs     # buku migrasi vs ARTEFAK FISIK
```

Verdict "sudah jalan" hanya sah bila artefak fisiknya terbukti ada
(CHARTER G-2) — bukan dari menebak nama.

---

## 3. Cara mengukur ulang seluruh isi dokumen ini

```bash
# Env yang dibaca kode tapi tak terdokumentasi
node apps/api/scripts/audit-env-siap-deploy.mjs

# Alamat build mobile
node apps/mobile/scripts/audit-alamat-api-terisi.mjs

# Seluruh penjaga CI sekaligus
cd apps/api && node scripts/jalankan-semua-penjaga.mjs
```

⚠ Jangan menyalin daftar variabel dari dokumen ini ke tempat lain. Ia akan
basi, dan daftar env yang basi adalah cara termudah kehilangan satu variabel
saat deploy. Jalankan penjaganya — ia membaca kode, bukan ingatan.
