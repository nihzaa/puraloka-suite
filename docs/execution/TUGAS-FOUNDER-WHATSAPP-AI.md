# Tugas yang HARUS dikerjakan founder sendiri — WhatsApp & AI

**Dibuat:** 2026-08-09 · **Konteks:** founder bertanya *"emang apa yg harus saya
kerjakan sendiri? kan n8n dan evolution udh terinstall"*

> **Jawaban singkat: empat hal, dan tiga di antaranya sekali seumur hidup.**
>
> Sisanya bisa saya kerjakan sendiri. Dokumen ini sengaja pendek — kalau ada
> yang bisa dipindahkan ke saya, ia sudah dipindahkan.

---

## 0. Keadaan terukur (2026-08-09)

Diukur, bukan diasumsikan.

| Hal | Keadaan |
|---|---|
| Evolution API | **terpasang** di `E:/Project/automation-tjs\evolution-api` — v2.3.7, **Node asli, BUKAN Docker** (konsisten dengan WSL yang bermasalah). Sudah ter-build (`dist/main.js`) |
| n8n | terpasang global lewat npm; datanya di **Postgres** (`tjs_ai`, schema `n8n`) |
| Postgres 16 | **SEDANG BERJALAN** (servis `postgresql-16`, port 5432) — prasyarat Evolution sudah hidup |
| Redis | **tidak dibutuhkan** — tak ada konfigurasi cache di `.env` Evolution |
| Keduanya saat ini | **mati** — nol proses mendengarkan di 8080/5678 |

**Penting:** Anda sudah menulis skrip penyalanya sendiri di
`E:/Project/automation-tjs/infra/`:

| Skrip | Isi |
|---|---|
| `start-evolution.ps1` | Evolution saja |
| `start-n8n.ps1` | n8n saja |
| `start-all.ps1` | Evolution + dashboard + sync + n8n sekaligus |

Riwayat PowerShell menunjukkan keduanya pernah dijalankan, terakhir
**2026-08-02**.

Dan dua hal yang menghemat kerja:

- **Evolution memilih instance dari basis data**, bukan dari env
  (`lib/wa/providers/evolution.ts:162`). Satu server bisa melayani TJS dan
  Puraloka sekaligus — cukup instance berbeda.
- **Sesi WhatsApp lama kemungkinan masih ter-pair.** Folder
  `evolution-api/instances/` masih menyimpan kunci auth Baileys, dan
  `DEL_INSTANCE=false`. Log terakhir (2026-07-07) berakhir sehat: instance
  `tjs-owner`, `CONNECTED TO WHATSAPP`.

---

## 1. Nyalakan Evolution (dan n8n)

Sekali per boot komputer.

```powershell
& "E:/Project/automation-tjs/infra/start-evolution.ps1"
& "E:/Project/automation-tjs/infra/start-n8n.ps1"
```

Berhasil kalau kedua perintah ini membalas `200`:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
curl -s -o /dev/null -w "%{http_code}" http://localhost:5678/
```

⚠️ `start-all.ps1` menuntut `infra\.env` berisi `N8N_ENCRYPTION_KEY`,
`N8N_BASIC_AUTH_PASSWORD`, `DB_POSTGRESDB_PASSWORD`, `ANTHROPIC_API_KEY` —
kalau tidak, ia berhenti di awal. Berkasnya ada (gitignored).

⚠️ `WEBHOOK_GLOBAL_ENABLED=false` sementara `WEBHOOK_GLOBAL_URL` menunjuk
`http://localhost:5678/webhook/whatsapp`. Kalau alur n8n tampak mati sesudah
Evolution menyala, **flag itu tempat pertama yang diperiksa.**

---

## 2. Buat instance Evolution untuk Puraloka + pindai QR

**Satu-satunya tugas yang benar-benar tak bisa saya kerjakan** — memindai QR
menuntut ponsel di tangan Anda.

- Nama instance: **`puraloka-bot`** (jangan pakai `tjs-bot`/`tjs-owner`).
- Nomor: boleh baru, boleh nomor perusahaan yang sudah ada.

> ### ⚠️ Jangan pakai instance TJS untuk Puraloka
>
> Satu instance = satu nomor = satu antrean pesan masuk. Kalau berbagi, pesan
> pelanggan TJS masuk ke asisten Puraloka dan sebaliknya — dan karena keduanya
> punya tool yang membaca data, itu **kebocoran lintas-perusahaan**, bukan
> sekadar salah alamat.
>
> Server-nya boleh sama. **Instance-nya harus beda.**

Setelah dipindai, saya butuh satu hal: **nomor WhatsApp yang dipakai**.

---

## 2b. Rotasi kunci Evolution — disarankan, bukan mendesak

Ditemukan saat menelusuri: `start-evolution.ps1` memuat komentar bahwa API key
dulu ditulis literal di berkas itu dan baru dihapus 2026-07-08. Artinya kunci
`tjs_…` yang **masih dipakai hari ini** pernah masuk riwayat git repo TJS.

Risikonya terbatas (repo privat, Evolution hanya `localhost`), tapi kalau
Evolution kelak diekspos ke internet untuk webhook, kunci itu harus diganti
lebih dulu.

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
| Memasang n8n / Evolution | ✅ sudah, tak perlu diulang |
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
