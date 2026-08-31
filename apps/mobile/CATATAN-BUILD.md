# Build & sebar aplikasi mobile

> Catatan ini dulu tinggal di dalam `eas.json` sebagai kunci `"//"`.
> **EAS menolaknya** — `eas.json is not valid: "//" is not allowed` — jadi
> `eas build` tak pernah bisa jalan selama komentar itu ada di sana.
>
> Dipindah ke sini 2026-09-01, saat `eas init` dijalankan pertama kali dan
> galat itu akhirnya terlihat. Isinya tak diubah sedikit pun; hanya
> tempatnya.

══════════════════════════════════════════════════════════════════════
BUILD & SEBAR — berkas yang hilang, dan itulah yang menahan mb-progres
══════════════════════════════════════════════════════════════════════

Diukur 2026-08-19: kode input progres LENGKAP (357 baris, dua mode,
foto + izin runtime), app.json lengkap (slug, package, bundleIdentifier
com.puraloka.suite) — tetapi eas.json TIDAK ADA. Tanpa berkas ini
`eas build` menolak jalan, jadi tak ada satu pun cara membuat APK yang
bisa dipasang di HP mandor.

Itu sebabnya mb-progres bernilai `sebagian` dengan alasan 'menunggu
rilis': bukan kodenya yang kurang, melainkan jalan keluarnya.

── Kenapa `env` DINYATAKAN di tiap profil

`EXPO_PUBLIC_*` dipanggang ke dalam bundel saat build, bukan dibaca saat
aplikasi jalan. Profil tanpa `env` akan memakai apa pun yang kebetulan
ada di .env mesin yang membuild — dan .env di repo ini berisi
http://localhost:3001, yang di HP mandor berarti HP-nya sendiri.

Alamat produksi SENGAJA dikosongkan di berkas ini, bukan ditebak:
`lib/api.ts` melempar saat modul dimuat kalau ia kosong, jadi build yang
salah konfigurasi GAGAL DI TANGAN PEMBUILD — bukan di tangan mandor.

── `development` juga DIKOSONGKAN (2026-08-27)

Profil itu semula berisi http://localhost:3001 — dua kesalahan sekaligus:
port salah (API melayani 3007) DAN localhost, yang di HP menunjuk HP itu
sendiri. Persis yang diperingatkan komentar di atas, di berkas yang sama.

Build `development` TETAP dipasang di HP (hanya dengan dev-client), jadi
ia butuh alamat LAN yang sama seperti profil lain. Dikosongkan supaya
`lib/api.ts` melempar saat modul dimuat — gagal di tangan pembuild, bukan
di tangan mandor.

Dijaga `apps/api/scripts/audit-port-api-cocok.mjs`, yang sejak hari itu
ikut membaca berkas INI — bukan hanya .env. Bedanya menentukan:
`EXPO_PUBLIC_*` dipanggang saat BUILD, jadi .env yang benar tidak
menyelamatkan eas.json yang salah.

── Urutan pakai

  1. isi `EXPO_PUBLIC_API_URL` profil `preview` & `production` di bawah
  2. npx eas-cli build -p android --profile preview   (APK, bagikan link)
  3. mandor pasang, coba satu proyek nyata
  4. baru `production` (AAB) kalau hendak ke Play Store

APK dipilih untuk `preview` karena bisa dipasang langsung dari tautan —
AAB tak bisa, ia hanya untuk Play Store, dan mandor tak akan menunggu

---

## Yang berubah 2026-09-01

### `development.env` tak lagi kosong

Profil itu semula dikosongkan supaya `lib/api.ts` melempar saat modul
dimuat — gagal di tangan pembuild, bukan di tangan mandor. Niatnya benar,
tetapi **EAS menolak nilai kosong**:

```
"build.development.env.EXPO_PUBLIC_API_URL" is not allowed to be empty
```

Jadi pagar itu tak pernah berfungsi sebagai pagar — ia hanya membuat
seluruh `eas.json` tak sah, dan SEMUA profil ikut mati bersamanya.

Sekarang diisi alamat LAN mesin pembuild (`192.168.50.114:3007`, diukur
dari `Get-NetIPAddress` + `PORT` di `apps/api/.env`). Build `development`
memang hanya dipasang lewat dev-client di jaringan yang sama.

⚠ **Alamat itu akan basi begitu jaringan berubah.** Ia bukan konstanta —
ukur ulang sebelum membuat build development:

```bash
powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | \n  Where-Object { \$_.IPAddress -like '192.168.*' }).IPAddress"
grep -E '^PORT' apps/api/.env
```

`preview` dan `production` TIDAK terpengaruh — keduanya memakai
`https://api.puraloka-suite.duckdns.org`, yang terbukti hidup (200 OK).

### `projectId` akhirnya ada

```
slug      puraloka-suite
owner     nihzaas-team
projectId 36f74196-874f-4fbb-b061-e971c87c2cd4
```

Project pertama sempat dibuat dengan slug salah ketik (`puraloka-suie`,
kurang `t`) dan dibuang — slug di Expo WAJIB sama dengan `app.json`, dan
membiarkan salah ketik itu akan membawanya ke setiap tautan build
selamanya.
