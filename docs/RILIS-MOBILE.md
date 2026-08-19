# Merilis aplikasi mobile ke HP mandor

> Ditulis 2026-08-19. Menutup satu-satunya hal yang menahan `mb-progres`:
> **bukan kodenya, melainkan jalan keluarnya.**
>
> Angka & keadaan di sini bisa basi. Cara mengukurnya ikut ditulis.

---

## 0. Apa yang sebenarnya menahan

Diukur 2026-08-19:

| Yang diperiksa | Keadaan |
|---|---|
| Layar input progres | ✅ `app/(app)/progress/input.tsx`, 357 baris, dua mode |
| Konfigurasi aplikasi | ✅ `app.json` — slug, `com.puraloka.suite` (Android & iOS) |
| Berkas build | ❌ **`eas.json` TIDAK ADA** |

Tanpa `eas.json`, `eas build` menolak jalan — jadi tak pernah ada satu pun
APK yang bisa dipasang siapa pun. Itulah sebabnya `mb-progres` bernilai
`sebagian` dengan alasan "menunggu rilis".

`eas.json` sekarang ada. Yang tersisa **satu isian**, dan hanya founder yang
tahu jawabannya: alamat API yang bisa dijangkau dari jaringan seluler.

---

## 1. Jebakan yang paling mahal — baca sebelum membuild

`apps/mobile/.env` berisi:

```
EXPO_PUBLIC_API_URL=http://localhost:3001
```

**`EXPO_PUBLIC_*` DIPANGGANG ke dalam bundel saat build**, bukan dibaca saat
aplikasi jalan. Jadi APK yang dibuild tanpa menyetel ulang alamatnya akan
membawa `localhost:3001` ke HP mandor — dan di sana, `localhost` adalah
**HP-nya sendiri**.

Akibatnya bukan galat yang menunjuk sebabnya. Tiap permintaan gagal dengan
galat jaringan yang **menuduh server**, di tangan orang yang tak punya cara
memeriksanya, sesudah aplikasinya telanjur disebar.

Dua lapis menahannya sekarang:

1. `lib/api.ts` **melempar saat modul dimuat** bila alamatnya kosong pada
   build rilis — aplikasi menolak berjalan, alih-alih gagal diam-diam di
   layar ketiga.
2. `scripts/audit-alamat-api-terisi.mjs` menolak `eas.json` yang profil
   rilisnya masih kosong atau masih menunjuk localhost.

```bash
node apps/mobile/scripts/audit-alamat-api-terisi.mjs
```

---

## 2. Urutan merilis

### Langkah 1 — isi alamat API

Sunting `apps/mobile/eas.json`, bagian `build.preview.env` dan
`build.production.env`:

```json
"EXPO_PUBLIC_API_URL": "https://api.puraloka.id"
```

⚠ Harus alamat yang **bisa dijangkau dari jaringan seluler**. Alamat LAN
kantor (`192.168.x.x`) bekerja saat mandor di kantor lalu berhenti bekerja
begitu ia sampai di proyek — kegagalan yang muncul justru di tempat aplikasi
ini dipakai.

Jalankan penjaganya untuk memastikan:

```bash
node apps/mobile/scripts/audit-alamat-api-terisi.mjs
```

### Langkah 2 — build APK untuk uji coba

```bash
cd apps/mobile
npx eas-cli login              # sekali, akun Expo
npx eas-cli build -p android --profile preview
```

Hasilnya tautan unduhan APK. **APK, bukan AAB** — APK bisa dipasang langsung
dari tautan; AAB hanya untuk Play Store, dan mandor tak akan menunggu proses
peninjauan toko untuk mencoba satu fitur.

### Langkah 3 — satu mandor, satu proyek, satu minggu

Jangan sebar ke semua sekaligus. Yang dicari di tahap ini bukan bug kode
(itu sudah ditest) melainkan hal yang **tak bisa ditebak dari kode**:

- HP lama — apakah kameranya membuat aplikasi tertutup sendiri?
- sinyal buruk di proyek — apa yang terjadi saat unggahan foto putus di
  tengah?
- kebiasaan — apakah mandor mengisi tiap hari, atau menumpuk seminggu lalu
  mengisi sekaligus?

Ukur yang benar-benar masuk, jangan tanya "sudah dipakai belum":

```sql
SELECT count(*) AS lewat_mobile, max(created_at) AS terakhir
  FROM progress_logs
 WHERE created_at > now() - interval '7 days';
```

### Langkah 4 — baru sebar luas

`mb-progres` boleh jadi `hidup` **sesudah ada progres nyata yang masuk lewat
jalur ini**, bukan sesudah APK-nya jadi.

Alasannya tertulis di catatan entri itu sendiri, dan tetap berlaku: *fitur
yang tak pernah dipakai orang sungguhan belum terbukti bekerja di tangan
penggunanya.*

---

## 3. Yang TIDAK dikerjakan di sini, dan kenapa

- **Play Store.** Butuh akun pengembang berbayar, kebijakan privasi, dan
  peninjauan. Untuk aplikasi internal yang dipakai belasan mandor, sebar APK
  lewat tautan lebih cepat dan tak menambah pihak yang harus dipercaya.
- **iOS.** `bundleIdentifier` sudah ada, tetapi build iOS menuntut akun Apple
  Developer berbayar. Ukur dulu: berapa mandor yang benar-benar memakai
  iPhone?
- **Push notification.** Belum ada di aplikasi mobile, dan menambahkannya
  sebelum ada yang memakai aplikasinya adalah menebak kebutuhan.
