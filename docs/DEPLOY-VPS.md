# Deploy ke VPS — runbook

> Ditulis 2026-08-29 untuk deploy perdana ke `187.52.124.41`.
>
> **Tiap langkah menyebut cara membuktikannya berhasil.** Langkah tanpa bukti
> adalah harapan, dan harapan gagal diam-diam — itu kelas cacat yang paling
> mahal di repo ini.

---

## 0. Apa yang di-deploy

| Layanan | Alamat | Port dalam | Image |
|---|---|---|---|
| Web (Next.js) | `https://puraloka-suite.duckdns.org` | 127.0.0.1:3102 | dibangun dari `apps/web/Dockerfile` |
| API (Fastify) | `https://api.puraloka-suite.duckdns.org` | 127.0.0.1:3101 | dibangun dari `apps/api/Dockerfile` |
| nginx (host) | :80 / :443 | — | sudah ada, melayani 4 situs lain |

**Basis data TIDAK ikut** — ia tetap di Supabase. Yang di-deploy hanya proses
aplikasi.

`admin-saas` adalah repo terpisah dengan compose-nya sendiri
(`E:\Project\admin-saas`, lihat `docs/DEPLOY.md` di sana).

---

## 1. Prasyarat DNS — buktikan DULU, sebelum menyentuh VPS

```bash
nslookup puraloka-suite.duckdns.org
nslookup api.puraloka-suite.duckdns.org
```

Keduanya WAJIB memulangkan IP VPS. Diverifikasi 2026-08-29: keduanya
→ `187.52.124.41`. DuckDNS meneruskan sub-subdomain otomatis, jadi
`api.` tak perlu didaftarkan terpisah.

⚠ Kalau DNS belum menyebar, Caddy gagal menerbitkan sertifikat dan **mencatat
kegagalan itu ke rate limit Let's Encrypt**. Periksa dulu, jangan coba-coba.

---

## 2. Di VPS — sekali seumur hidup

```bash
ssh root@187.52.124.41

# Docker
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version    # bukti: keduanya menyebut versi

# Firewall: hanya 22/80/443. Port aplikasi TIDAK dibuka —
# mereka hanya dijangkau lewat Caddy di dalam jaringan compose.
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
ufw status                                    # bukti: tepat tiga baris ALLOW
```

---

## 3. Ambil kode

```bash
mkdir -p /srv && cd /srv
git clone https://github.com/nihzaa/puraloka-suite.git
cd puraloka-suite
git checkout deploy/vps-perdana
git log --oneline -1                          # bukti: commit yang Anda harapkan
```

---

## 4. Isi rahasia

```bash
cp .env.deploy.example .env.deploy
nano .env.deploy
```

Yang **wajib** terisi (sisanya sudah bernilai bawaan yang benar):

- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`
- `DATABASE_URL`, `DIRECT_URL`
- `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `SCHEDULER_SECRET`, `WA_WEBHOOK_SECRET`
- `SCHEDULER_EMAIL`, `SCHEDULER_PASSWORD`

Bangkitkan tiap rahasia dengan `openssl rand -base64 32` — **jangan** memakai
nilai dari laptop pengembangan.

```bash
# Bukti tak ada yang kosong:
grep -E "^[A-Z_]+=$" .env.deploy && echo "⚠ MASIH ADA YANG KOSONG" || echo "✓ semua terisi"
```

---

## 5. Migrasi basis — SEBELUM aplikasi menyala

Aplikasi yang menyala di atas skema yang belum lengkap akan gagal dengan galat
yang menuduh kode.

```bash
# Dari LAPTOP (bukan VPS), menunjuk basis produksi:
CI_DIRECT_URL="<DIRECT_URL produksi>" node apps/api/scripts/ci-project-setup.mjs
```

Buktinya, dan ini yang menentukan sah-tidaknya seluruh deploy:

```bash
node apps/api/scripts/audit-replay-bersih.mjs   # WAJIB: 493/493, 0 dilewati
node scripts/db/ledger-diff.mjs                 # buku vs artefak FISIK
```

⚠ `audit-replay-bersih.mjs` lahir dari cacat nyata: 13 migrasi **tak pernah
jalan di lingkungan baru** karena nomornya bertabrakan, tanpa satu pun galat.
Di basis pengembangan semuanya tampak sehat. Yang rusak justru server baru —
dan itu persis yang sedang Anda buat.

---

## 5b. Vhost nginx — SEBELUM menyalakan

⚠ Mesin ini **sudah menjalankan nginx** untuk empat situs: `tjs`, `n8n`,
`brilliante-next-chapter`, dan `admin-saas`. Caddy TIDAK dipakai — ia akan
gagal bind di :80/:443 dan berisiko menjatuhkan TJS.

```bash
cp infra/nginx-puraloka.conf /etc/nginx/sites-available/puraloka-suite
ln -sf /etc/nginx/sites-available/puraloka-suite /etc/nginx/sites-enabled/
nginx -t                       # WAJIB hijau sebelum reload
systemctl reload nginx

# Bukti situs lain tak terganggu — jalankan SETIAP kali sesudah reload:
for h in tjs-command-center.duckdns.org n8n.tjs-command-center.duckdns.org          admin.puraloka-suite.duckdns.org; do
  printf '%s → ' $h; curl -s -o /dev/null -w '%{http_code}
' --max-time 8 https://$h/
done
```

Lalu sertifikatnya:

```bash
certbot --nginx -d puraloka-suite.duckdns.org -d api.puraloka-suite.duckdns.org   --non-interactive --agree-tos --register-unsafely-without-email --redirect
```

## 5c. ⚠ `next build` GAGAL di Windows — dan itu BUKAN cacat

Diukur 2026-08-30 di laptop:

```
✓ Compiled successfully in 7.9s
  Finished TypeScript in 22.9s
  Generating static pages (275) …
> Build error occurred
Error: EPERM: operation not permitted, symlink '..\client-only@0.0.1\…'
```

Semua tahap NYATA lulus — kompilasi, TypeScript, 275 halaman. Yang gagal
langkah TERAKHIR `output: standalone`: ia menyalin `node_modules` dengan
symlink, dan Windows menolaknya tanpa hak administrator.

Linux di dalam container tak punya batasan itu. Jangan "memperbaiki" ini
dengan mematikan `output: standalone` — tanpanya image memuat seluruh
node_modules monorepo (ratusan MB dependensi build yang tak pernah dipakai
runtime).

Untuk membuktikan build web di laptop, pakai Docker-nya langsung:

```bash
docker build -f apps/web/Dockerfile   --build-arg NEXT_PUBLIC_API_URL=https://api.puraloka-suite.duckdns.org   -t puraloka-web .
```

## 6. Nyalakan

```bash
docker compose up -d --build      # build pertama ±5-10 menit
docker compose ps                 # bukti: api & web "healthy", caddy "running"
```

`healthy` datang dari healthcheck yang menembak rute NYATA (`/health` dan
`/login`), bukan sekadar port terbuka.

---

## 7. Buktikan dari luar

Dijalankan dari **laptop**, bukan dari VPS — yang diuji adalah jalur yang
dilewati pengguna sungguhan.

```bash
curl -I https://puraloka-suite.duckdns.org/login       # 200, dan skema https
curl -I https://api.puraloka-suite.duckdns.org/health  # 200
curl -I http://puraloka-suite.duckdns.org              # 308 → https
```

Lalu buka `https://puraloka-suite.duckdns.org` di peramban dan **masuk**.
Sampai ada yang benar-benar login, deploy ini belum terbukti.

⚠ Kalau halaman terbuka **tanpa CSS**: `.next/static` atau `public/` tak
tersalin. Lihat komentar di `apps/web/Dockerfile`.

⚠ Kalau login gagal dengan galat jaringan: `NEXT_PUBLIC_API_URL` salah
dipanggang. Ia **build-time**, jadi mengubahnya di `.env.deploy` saja tidak
cukup — harus `docker compose up -d --build web`.

---

## 8. Memperbarui nanti

```bash
ssh root@187.52.124.41 "/srv/puraloka-suite/infra/perbarui-vps.sh"
```

### ⚠ VPS men-deploy `main`. Bukan cabang lain. Sebutkan ini, jangan diasumsikan.

Dokumen ini semula menulis `git pull` tanpa menyebut cabang sama sekali, dan
celah itu menggigit 2026-09-01: 52 commit menumpuk di `deploy/vps-perdana`
sementara VPS melacak `main`. Deploy dijalankan, **seluruh langkahnya hijau** —
`api=healthy`, `web=healthy`, ketiga URL 200 — dan versi terpasang **tidak
berubah sama sekali**.

Skripnya jujur: ia menarik cabang yang benar menurut setelannya. Yang salah
adalah asumsi bahwa "cabang tempat saya bekerja" = "cabang yang di-deploy".

Gejalanya paling berbahaya justru karena TAK ADA gejala: nol galat, nol
container tak sehat, nol URL merah. Satu-satunya yang menunjukkannya adalah
baris terakhir skrip (`Versi terpasang: <hash>`) — dan hash yang tak berubah
mudah terbaca sebagai "memang tak ada perubahan".

**Sebelum menyimpulkan deploy berhasil, BANDINGKAN hash-nya:**

```bash
git rev-parse --short origin/main                                   # yang seharusnya
ssh root@187.52.124.41 "cd /srv/puraloka-suite && git rev-parse --short HEAD"
```

Kalau kerjamu ada di cabang lain, naikkan dulu ke `main` (fast-forward bila
tak ada divergensi — ukur: `git rev-list --count origin/<cabang>..origin/main`
harus 0), baru deploy.

**Dan "container healthy" TIDAK membuktikan kode barunya termuat.** Uji
PERILAKU yang hanya ada di versi baru — mis. rute yang baru ditambahkan harus
membalas 200/401, bukan 404.

Ganti domain (saat nama fix): ubah `DOMAIN_WEB`/`DOMAIN_API`/`API_URL_PUBLIK`
di `.env.deploy`, lalu `docker compose up -d --build`. Tak ada alamat yang
dipaku di kode.

---

## 8b. CAKUPAN PENUH — semua yang harus naik

Diminta founder 2026-08-30: *"deploy semuanya, beserta n8n, evo, dan semuanya
yang ada di repo lokal ini."*

Diukur dari repo, bukan diingat:

| Komponen | Sumber | Port lokal | Status rencana |
|---|---|---|---|
| API (Fastify) | `apps/api` | 3007 | ✅ di `docker-compose.yml` → 127.0.0.1:3101 |
| Web ERP (Next) | `apps/web` | 3000 | ✅ di `docker-compose.yml` → 127.0.0.1:3102 |
| **Web publik** | `apps/web-publik` | 3002 | ⬜ BELUM ada di compose |
| **n8n Puraloka** | `scripts/jalankan-n8n.cmd` | 5680 (+5681 broker) | ⬜ BELUM |
| **Evolution API** | `scripts/jalankan-evolution.cmd` | 8081 | ⬜ BELUM |
| **Penjadwal** | `scripts/jalankan-penjadwal.cmd` | — (denyut 15 mnt) | ⬜ BELUM — di VPS jadi cron |
| Mobile (Expo) | `apps/mobile` | — | ❌ bukan server; rilis lewat EAS |

⚠ **n8n & Evolution: JANGAN pakai instance TJS.** CLAUDE.md §7 mencatat mesin
ini punya DUA pasang, dan tertukarnya sudah pernah terjadi:

    :5678 n8n  → TJS        :8080 Evolution → TJS  (clientName evolution_tjs)
    :5680 n8n  → PURALOKA   :8081 Evolution → PURALOKA

Mengarahkan Puraloka ke :5678/:8080 membuat pesan masuk Puraloka dikirim ke
webhook TJS, dan riwayat chat dua perusahaan bercampur di satu database —
tanpa satu pun galat.

⚠ **Penjadwal jadi cron, bukan proses.** `jalankan-penjadwal.cmd` adalah
denyut 15 menit untuk mesin pengembangan. Di VPS, pola yang sudah terbukti
adalah cron — persis seperti `/api/cron/otomasi` milik admin-saas yang sudah
live. Prosesnya tak perlu ikut naik.

## 9. Yang TIDAK ikut deploy ini — dan itu disengaja

| Hal | Sebab |
|---|---|
| APK mandor | butuh `EXPO_PUBLIC_API_URL` + rilis EAS (`docs/RILIS-MOBILE.md`) |
| Surel terjadwal | butuh `RESEND_API_KEY`; tanpa itu `sendEmail()` **no-op TANPA melempar** — jadwal jalan, `terakhir_dikirim` ter-update, nol surel terkirim |
| Notifikasi push | butuh `VAPID_*` |
| n8n & Evolution | instance terpisah, lihat CLAUDE.md §7 |

Ketiganya gagal **diam-diam**, bukan berisik. Itu sebabnya didaftarkan di sini
alih-alih ditemukan nanti.
