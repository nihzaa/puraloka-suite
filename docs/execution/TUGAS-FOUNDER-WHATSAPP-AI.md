# Tugas yang HARUS dikerjakan founder sendiri — WhatsApp & AI

**Dibuat:** 2026-08-09 · **Konteks:** founder bertanya *"emang apa yg harus saya
kerjakan sendiri? kan n8n dan evolution udh terinstall"*

> **Jawaban singkat: empat hal, dan tiga di antaranya sekali seumur hidup.**
>
> Sisanya bisa saya kerjakan sendiri. Dokumen ini sengaja pendek — kalau ada
> yang bisa dipindahkan ke saya, ia sudah dipindahkan.

---

## 0. Keadaan terukur (2026-08-09)

Founder bertanya: *"evolutionnya harus masuk ke folder tjs? bisa disimpan juga
di puraloka ga?"* — **bisa, dan sudah dikerjakan.** Puraloka kini punya
Evolution sendiri, terpisah total dari TJS.

| | TJS | **Puraloka** |
|---|---|---|
| Lokasi | `E:/Project/automation-tjs/evolution-api` | **`E:/Project/puraloka-wa`** |
| Port | 8080 | **8081** |
| Database | `tjs_ai` | **`puraloka_wa`** |
| `clientName` | `evolution_tjs` | **`evolution_puraloka`** |
| API key | `tjs_…` | **`plk_…` (baru, bukan salinan)** |
| Instance | tjs-owner, tjs-alert, tjs-bot, tjs-staff | *(kosong — menunggu QR)* |

Keduanya boleh hidup bersamaan. **Diverifikasi:** Evolution Puraloka merespons
`200` dengan `clientName: evolution_puraloka`, dan keempat instance TJS utuh —
nol yang tersentuh.

### Kenapa terpisah, bukan menumpang instance TJS

Founder memilih ini, dan alasannya terbukti benar saat diperiksa: **semua sesi,
pesan, dan kontak Evolution tersimpan di Postgres**, bukan di folder. Menumpang
berarti data WhatsApp Puraloka mendarat di database `tjs_ai` bersama data TJS —
aman selama satu pemilik, tapi jadi masalah begitu Puraloka dijual ke
perusahaan lain.

### Kenapa instalasinya di LUAR repo

751 MB. Di dalam repo, satu-satunya yang mencegahnya ikut ter-commit adalah
`.gitignore` — dan itu bisa salah edit. Di luar repo, kesalahan itu mustahil.

### Kenapa Docker tak dibutuhkan

Founder: *"memang tidak pakai docker karena di pc saya WSL nya masalah"*. Benar,
dan tak perlu: Evolution jalan sebagai proses Node biasa. Prasyarat satu-satunya
adalah **Postgres 16**, yang sudah berjalan sebagai servis Windows. Redis tidak
dipakai.

---

## 1. Nyalakan

```powershell
& "E:\Project\puraloka-suite\scripts\wa\start-evolution.ps1"
```

Skrip itu menolak jalan kalau Postgres mati atau Evolution belum ter-build —
jadi ia gagal dengan pesan jelas, bukan diam-diam.

Berhasil kalau ini membalas `200`:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/
```

n8n (kalau dibutuhkan) tetap dari TJS — satu n8n bisa melayani banyak alur:

```powershell
& "E:/Project/automation-tjs/infra/start-n8n.ps1"
```

---

## 2. Buat instance `puraloka-bot` + pindai QR

**Satu-satunya tugas yang benar-benar tak bisa saya kerjakan** — memindai QR
menuntut ponsel di tangan Anda.

Buka **http://localhost:8081/manager**, buat instance bernama `puraloka-bot`,
lalu pindai QR-nya. API key-nya ada di `E:/Project/puraloka-wa/.env`
(`AUTHENTICATION_API_KEY`).

Nomornya boleh baru, boleh nomor perusahaan yang sudah ada — asal **bukan**
nomor yang sedang dipakai instance TJS.

Sesudah dipindai, saya butuh satu hal: **nomor WhatsApp yang dipakai**, untuk
didaftarkan sebagai kontak pertama yang berwenang.

---

## 2b. Rotasi kunci Evolution TJS — disarankan, bukan mendesak

**Puraloka tidak terdampak** — kuncinya dibangkitkan baru (`plk_…`), bukan
salinan milik TJS.

Tapi ditemukan saat menelusuri: `start-evolution.ps1` di TJS memuat komentar
bahwa API key-nya dulu ditulis literal di berkas itu dan baru dihapus
2026-07-08. Artinya kunci `tjs_…` yang **masih dipakai hari ini** pernah masuk
riwayat git repo TJS.

Risikonya terbatas selama Evolution hanya `localhost`. Kalau kelak diekspos ke
internet untuk webhook, kunci itu harus diganti lebih dulu.

---

## 2c. Penjadwal — BELUM ada yang perlu diisi (2026-08-09)

Penjadwal tugas sudah dibangun (TJS-A2): notifikasi tenggat & milestone kini
terbit sendiri, tanpa ada yang menekan tombol di `/sistem`.

Menghidupkannya di produksi butuh dua secret di
**https://github.com/nihzaa/puraloka-suite/settings/secrets/actions** —

| Name | Secret |
|---|---|
| `SCHEDULER_SECRET` | lihat `apps/api/.env`, baris `SCHEDULER_SECRET=` |
| `SCHEDULER_URL` | `https://<alamat-api>/api/v1/jadwal/jalankan` |

**Tapi keduanya belum bisa diisi sekarang, dan itu bukan kelalaian.**

Diukur 2026-08-09: API Puraloka berjalan di `localhost:3001` dan **belum
di-deploy ke mana pun** — tak ada `vercel.json`, `fly.toml`, `railway.*`,
maupun workflow deploy. GitHub Actions berjalan di server Microsoft; ia tak
bisa menjangkau komputer Anda.

Mengisi `SCHEDULER_SECRET` saja tak berguna: workflow menuntut **keduanya**,
dan tanpa salah satunya ia dilewati dengan pesan — sengaja begitu, supaya
tidak merah tiap 15 menit dan melatih orang mengabaikan notifikasi CI.

**Sampai API punya alamat publik:** penjadwal tetap bisa dipicu manual dari
`/sistem`, dan halaman `/pengaturan/jadwal` menunjukkan kapan tiap tugas
terakhir jalan beserta hasilnya.

**Begitu API di-deploy:** isi kedua secret sekaligus, lalu jalankan workflow
"Pemicu Jadwal Tugas" sekali lewat *Run workflow* untuk membuktikannya —
jangan menunggu 15 menit untuk tahu apakah tebakannya benar.

---

## 3. Putuskan: nomor siapa yang boleh memerintah asisten

Bukan tugas teknis — tugas keputusan.

Daftar nomor yang boleh mengirim perintah ke asisten. Nomor di luar daftar ini
**ditolak tanpa memanggil AI sama sekali** (jadi tak ada biaya, dan tak ada
kebocoran).

Untuk tiap nomor, tiga hal yang perlu Anda tentukan:

| Yang diputuskan | Contoh | Catatan |
|---|---|---|
| Milik siapa | Nizar | Wajib terhubung ke akun pengguna yang sudah ada — supaya jejak audit menyebut **orang**, bukan nomor |
| Boleh apa saja | baca semua · baca + siapkan approval | Tahap pertama semua nomor **baca saja**, sesuai rencana |
| Batas nominal approval | mis. Rp 50 juta | Di atas itu, WhatsApp menolak dan mengarahkan ke dashboard |

Belum mendesak — baru dibutuhkan saat Tahap D. Tapi memikirkannya sekarang
lebih murah daripada memutuskannya terburu-buru nanti.

---

## 4. Kunci API penyedia AI

Anthropic sudah ada di `apps/api/.env`. **Tak perlu tindakan** kecuali Anda
ingin menambah penyedia lain (OpenAI, Gemini, OpenRouter, atau yang
OpenAI-compatible).

Kalau ingin: cukup siapkan kuncinya. **Jangan kirimkan lewat chat** — nanti
ditempel sendiri lewat halaman Pengaturan, dan tersimpan terenkripsi
(`TJS-A1`). Halaman itu punya tombol "Uji Koneksi" yang memverifikasi kunci
**tanpa menyimpannya**, jadi Anda bisa mencoba dulu.

---

## Yang TIDAK perlu Anda kerjakan

Supaya jelas batasnya:

| Hal | Siapa |
|---|---|
| Memasang Evolution untuk Puraloka | ✅ **sudah saya kerjakan** — clone, .env, database, build, skrip penyala, dan diverifikasi merespons 200 |
| Memasang n8n | ✅ sudah ada dari TJS, dipakai bersama |
| Membuat workflow n8n untuk Puraloka | saya |
| Menulis adaptor Evolution di Puraloka | saya |
| Endpoint webhook + verifikasi rahasia | saya |
| Tabel kredensial terenkripsi + UI-nya | saya |
| Pendaftaran kontak & batas nominal (mekanismenya) | saya |
| Katalog tool, agent loop, pelacakan biaya | saya |

---

## Kenapa daftarnya sependek ini

Karena arsitektur TJS memang bagus di titik ini, dan langsung dipakai ulang:

- **n8n cuma "thin bridge"** — ia menerima pesan WhatsApp dan meneruskannya ke
  aplikasi. Nol logika bisnis di n8n (`app/api/owner-ai/webhook/route.ts:9-13`
  menjelaskan alasannya: versi lama memakai routing regex di n8n dan itu
  ditinggalkan). Artinya workflow n8n untuk Puraloka hampir sama persis, dan
  saya yang membuatnya.
- **Evolution memilih instance dari DB**, bukan env. Satu server, banyak
  instance, nol konflik.

Yang tersisa untuk Anda hanyalah hal-hal yang butuh **ponsel** (pindai QR) atau
**wewenang** (siapa boleh approve berapa) — dan keduanya memang seharusnya di
tangan Anda.

---

## Rujukan

| Untuk | Berkas |
|---|---|
| Rencana lengkap | `docs/superpowers/specs/2026-08-09-lapisan-ai-dan-platform-design.md` |
| Antrean kerja | `docs/execution/QUEUE.yaml` — item `TJS-*` |
| Kode rujukan | `E:/Project/automation-tjs/admin-dashboard` |
