# Spec: n8n Shared Multi-Tenant

> Sub-project A dari brainstorming "integrasi pihak ketiga multi-tenant"
> (n8n, AI/Claude, dan pola umum lainnya). Sub-project B (AI shared-key +
> kuota) dan C (pola umum pihak ketiga lain) menyusul di spec terpisah —
> **tidak dibahas di sini**.

## 0. Koreksi — saya salah soal cakupan "otomasi jadwal" (dicatat, bukan disembunyikan)

Draf pertama spec ini (§3.3 lama) menyimpulkan bahwa **seluruh** otomasi
terjadwal ERP mengirim WhatsApp lewat n8n, dan bahwa 8 resep di
`scripts/n8n/bangun-alur.mjs` (`eskalasi-invoice-terlambat`, dst.) adalah
representasi otomasi jadwal yang hidup. **Itu salah**, ditemukan lewat
agent Explore yang membaca `otomasi-terjadwal.ts` (516KB, ~62 rute) secara
langsung setelah spec pertama ditulis dari sampel yang lebih kecil.

Kenyataan yang diukur:

- `apps/api/src/routes/v1/otomasi-terjadwal.ts` berisi **~62 rute**
  `/api/v1/otomasi/jalankan/<kode>` — jauh lebih banyak dari 8 resep di
  `bangun-alur.mjs`, dan **namanya TIDAK BERTUMPANG TINDIH SAMA SEKALI**
  dengan 13 `kode` di `bangun-alur.mjs` (diverifikasi: `comm -12` dua
  daftar terurut, hasil kosong).
- Setiap rute di `otomasi-terjadwal.ts` berhenti di `createNotification()`
  — menulis ke tabel `notifications`. **Tidak satu pun memanggil
  `jalankanAlur()` atau `konfigurasiN8n()`.**
- Jembatan ke WhatsApp untuk notifikasi ini adalah `terbitkanPeristiwa()`
  (`utils/terbit-peristiwa.ts`), dipanggil otomatis dari
  `createNotifications()` (jamak) untuk **SETIAP** `type` notifikasi —
  tetapi hanya diteruskan ke n8n kalau `type`-nya ada di `PETA_PERISTIWA`.
  **`PETA_PERISTIWA` hanya berisi 5 entri**
  (`kasbon_submitted`, `wage_report_submitted`, `invoice_paid`,
  `project_status_changed`, `stok_menipis`) — tak satu pun dari ~62 tipe
  notifikasi terjadwal ada di sana. Jadi hari ini, **otomasi terjadwal
  TIDAK mengirim WhatsApp sama sekali** — hanya notifikasi in-app.
- `bangun-alur.mjs` (13 resep: 8 "jadwal" ber-cron-n8n + Ambil-umpan, 5
  "peristiwa" 3-node) adalah mekanisme **generasi lebih lama**, terpisah,
  memakai `otomasi-umpan.ts` (endpoint `/api/v1/otomasi/umpan/:jenis`,
  hanya 7 jenis) — bukan representasi dari 62 automation yang didaftarkan
  `katalog-otomasi.ts`.
- Ditemukan juga: `apps/api/src/lib/wa-kirim.ts` — abstraksi pengiriman WA
  LANGSUNG (registry adaptor Evolution/Fonnte/Meta Cloud, idempoten,
  tercatat ke `wa_pesan_log`, sudah tenant-scoped lewat
  `konfigurasiKanal()`) yang **sama sekali tidak melalui n8n**. Ini jalur
  yang lebih pendek dan sudah ada untuk "baca data → susun teks → kirim
  WA" — dan TIDAK dipakai satu pun dari ~62 rute otomasi terjadwal hari
  ini.

**Keputusan susulan** (diputuskan lewat riset kode sendiri, bukan
ditanyakan — sesuai arahan founder 2026-08-22 mode "serahkan semuanya"):

Otomasi terjadwal yang PERLU mengirim WhatsApp memakai **`kirimWa()`
langsung**, BUKAN `jalankanAlur()`/n8n. Alasan:
1. Nol infrastruktur baru — `wa-kirim.ts` sudah tenant-scoped, idempoten,
   dan tercatat.
2. Menghindari SELURUH masalah "rahasia transit lewat payload n8n"
   (§5.2/§7.1 lama) untuk jalur ini — tak ada rahasia yang perlu
   transit ke sistem pihak ketiga sama sekali.
3. Konsisten dengan pelajaran TJS yang sudah ditulis di kepala
   `wa-kirim.ts` sendiri: format pesan yang tersebar (di n8n, di luar
   kendali versi API) adalah persis cacat yang membuat alert TJS gagal
   terkirim tanpa gejala.

**Yang TIDAK berubah dari keputusan ini**: scope inti spec — migrasi n8n
ke instance shared — **tetap valid dan tetap dibutuhkan**, karena jalur
`terbitkanPeristiwa()`/`PETA_PERISTIWA` (5 event notification, dipakai
`kasbon_submitted` dkk.) **sungguhan memakai n8n hari ini** dan sungguhan
mengalami masalah "1 workflow per tenant yang kebetulan bernama sama"
yang didesain ulang di §5. Yang berubah hanya **cakupannya**: migrasi ini
mencakup 5 alur peristiwa yang sudah hidup, BUKAN 8 resep jadwal
`bangun-alur.mjs` yang generasi lama — 8 resep itu **dipensiunkan**
sebagai bagian dari pekerjaan ini (§5.5, baru).

Detail lengkap arsitektur `otomasi-terjadwal.ts`/`jadwal.ts` (dispatcher,
`KATALOG_TUGAS`, audit CI terkait) ada di §3.6 (baru, di bawah).

## 1. Konteks & Masalah

Puraloka Suite bertransformasi jadi ERP konstruksi SaaS multi-tenant.
Salah satu integrasi kritis adalah n8n — dipakai untuk mengirim
notifikasi WhatsApp dari otomasi terjadwal maupun berbasis peristiwa.

n8n **secara desain bukan software multi-tenant asli**: kredensialnya
diikat saat *design time* di dalam workflow, dan tidak bisa di-switch
dinamis per eksekusi (dikonfirmasi lewat riset komunitas n8n, §3).
Kondisi hari ini secara implisit adalah "1 instance per tenant" — instance
Puraloka di `:5680` (`scripts/jalankan-n8n.cmd`) dipakai sebagai
satu-satunya tenant, terpisah dari instance TJS (proyek lain di mesin
yang sama, `:5678`).

Tujuan spec ini: merancang migrasi ke **satu instance n8n shared** yang
melayani semua tenant SaaS, tanpa mematikan otomasi Puraloka yang sudah
hidup di produksi, dan tanpa membuka jalur kebocoran data/kredensial
antar tenant.

## 2. Keputusan yang Sudah Diambil (given, tidak didebat ulang di spec ini)

1. Instance `:5680` yang ada **menjadi** instance shared itu sendiri —
   bukan instance baru terpisah untuk tenant berbayar. Puraloka jadi
   tenant pertama di instance yang sama.
2. Redesain bentuk node webhook/HTTP request di workflow n8n **termasuk
   scope** — bukan cuma didokumentasikan untuk nanti. Tanpa redesain
   node, "instance shared" hanya memindahkan lokasi server tanpa
   benar-benar multi-tenant.
3. Kredensial pihak ketiga tenant (mis. WhatsApp Evolution:
   url/key/instance/nomor tujuan) **dikirim langsung di payload webhook
   oleh aplikasi** — bukan node n8n yang query balik ke API. Aplikasi
   tetap satu-satunya pembaca `app_credentials`; n8n hanya eksekutor
   pengiriman, tidak pernah pemilik kredensial.
4. Jadwal (cron) **dipindah dari n8n ke `jadwal_tugas`** — mekanisme
   penjadwal aplikasi yang sudah ada dan terbukti jalan di produksi
   (`sapa-proaktif`, dll). n8n berhenti berperan sebagai scheduler atau
   pengambil data (menghapus node "Ambil umpan"), dan hanya jadi lapis
   pengiriman (WhatsApp, dst.) + riwayat eksekusi/observability.
   ⚠ Direalisasikan lewat **pensiun** 8 resep jadwal lama, bukan migrasi
   — lihat koreksi §0 dan detail §5.5. `jadwal_tugas` itu sendiri sudah
   dipakai penuh oleh ~62 automation lain sejak sebelum spec ini ditulis
   (§3.6); tak ada "pemindahan" yang perlu terjadi di sana.

## 3. Temuan dari Eksplorasi Kode & Riset (fakta, bukan asumsi)

### 3.1 Satu pintu ke n8n sudah ada dan baik — dipertahankan

`apps/api/src/lib/otomasi-n8n.ts`:
- `konfigurasiN8n()` membaca kredensial n8n **per-panggilan**, bukan
  di-cache di level modul — karena nilainya milik tenant, dan modul
  Node hidup lintas request (kepala berkas menjelaskan ini eksplisit).
- `jalankanAlur()` sudah menerima `companyId` + `alur` + `muatan`
  eksplisit sebagai parameter, dan mencatat jejak ke `otomasi_jalan`
  **sebelum** memanggil n8n (menghindari status "menggantung senyap"
  kalau proses mati di tengah panggilan).

Kedua mekanisme ini **tidak diubah** oleh spec ini — hanya isi `muatan`
yang diperluas oleh pemanggil (§5.2).

### 3.2 Skema `otomasi_alur` sudah cocok untuk model shared

`db/migrations/272_katalog_otomasi.sql`: `otomasi_alur` adalah tabel
per-tenant (`UNIQUE(company_id, kode)`), tiap baris punya `n8n_id`/
`jalur_webhook` sendiri. **Skema ini sudah mendukung** banyak baris
tenant menunjuk ke `n8n_id`/`jalur_webhook` yang **sama** — tidak perlu
migrasi skema. Yang perlu diperbaiki hanya cara provisioning-nya (§5.3).

### 3.3 Cacat inti yang ditemukan: workflow hari ini bukan benar-benar shared

`scripts/n8n/bangun-alur.mjs` (dibaca lengkap, bukan ditebak dari nama):

- Fungsi `simpul()` (resep jadwal) membangun node **"Ambil umpan"** yang
  memanggil balik `${cfg.apiUrl}/api/v1/otomasi/umpan/...` dengan header
  `X-API-Key: cfg.apiKey` — **kunci API satu tenant, dipatok ke dalam
  JSON workflow saat build**, bukan dibaca dari payload.
- Node **"Kirim WhatsApp"** mematok `cfg.waUrl`/`cfg.waApiKey`/
  `cfg.waInstance`/`cfg.nomorTujuan` — kredensial WhatsApp **satu
  tenant**, tertanam permanen di parameter node.
- Payload webhook yang masuk (yang seharusnya membawa data) **tidak
  dipakai sama sekali** oleh kedua node ini.
- Skrip provisioning-nya sendiri hardcode
  `SELECT id FROM companies ... LIMIT 1` — mengambil tenant pertama
  yang ditemukan, bukan iterasi per tenant.

Kesimpulan: bentuk hari ini adalah **"1 workflow per tenant yang
kebetulan bernama sama"**, bukan "1 workflow shared yang tenant-aware
lewat payload". Ini sebabnya menambah tenant baru mustahil tanpa
membangun ulang seluruh workflow untuk tenant itu — dan kalau dipaksakan
dengan skrip yang ada sekarang, akan menimpa/menduplikasi workflow milik
tenant lain karena pencocokan by-name (`peta.get(resep.nama)`), bukan
by-tenant.

### 3.4 Riset kapabilitas n8n (WebSearch + WebFetch, 2026)

Sumber: [n8n Multi-Tenant: Teams Split, Security Intact](https://medium.com/@jickpatel611/n8n-multi-tenant-teams-split-security-intact-b1183bfa0997),
[Multi-Tenant n8n Without the Security Hangover](https://medium.com/@connect.hashblock/multi-tenant-n8n-without-the-security-hangover-dd861fab05f8),
[Multi-Tenant n8n Workflows with Shared Logic but Isolated State — n8n Community](https://community.n8n.io/t/multi-tenant-n8n-workflows-with-shared-logic-but-isolated-state/295495),
[Dynamic Credential Management in n8n: One Workflow, Many Clients](https://five.co/uncategorized/n8n-dynamic-credential-management/).

Temuan yang menentukan desain:

1. **Kredensial n8n diikat saat design time**, bukan runtime. Tidak ada
   mekanisme native untuk "pilih credential berdasarkan data eksekusi
   ini". Konsensus komunitas: **jangan simpan rahasia tenant di n8n
   Credential Store sama sekali** untuk skenario multi-tenant — pakai
   HTTP Request node dengan token/URL diinjeksikan dari data yang masuk
   (payload webhook atau hasil query awal-eksekusi ke config store
   eksternal).
2. **Tag `tenant_id` di node pertama** setiap eksekusi, untuk ketertelusuran
   audit lintas eksekusi.
3. **Jangan pernah simpan state per-tenant di n8n Workflow Variables** —
   "bleeds between executions unpredictably" (mengutip diskusi komunitas).
   Ini relevan karena n8n punya fitur Variables yang menggoda dipakai
   untuk ini, dan harus dihindari eksplisit.
4. Queue mode (`EXECUTIONS_MODE=queue` + Redis) adalah rekomendasi
   *production-hardening* untuk isolasi beban antar tenant besar — bukan
   syarat untuk desain dasar ini, dicatat sebagai kandidat penguatan
   nanti (§8).

### 3.5 `jadwal_tugas` — scheduler aplikasi yang sudah terbukti

`db/migrations/244_jadwal_tugas.sql`: tabel per-tenant, melacak
`terakhir_jalan`/`terakhir_status`/`terakhir_galat`/`jumlah_jalan`,
dicatat saat **mulai** (bukan saat berhasil) supaya tugas gagal tidak
diulang tiap tick. Sudah dipakai `sapa-proaktif` dan otomasi lain di
produksi — mekanisme ini sudah lengkap dan tidak butuh perubahan.

### 3.6 Mekanisme dispatcher `jadwal_tugas` — lengkap, tiga berkas

Ditemukan lewat pembacaan agent Explore atas `otomasi-terjadwal.ts` dan
`jadwal.ts` (§0). Rantainya TIGA berkas, bukan satu dispatcher tunggal:

1. **`otomasi-terjadwal.ts`** — bukan dispatcher; berisi ~62 registrasi
   `app.get('/api/v1/otomasi/jalankan/<kode>', ...)` independen, satu
   fungsi Fastify per automation. Tiap handler baca data via
   `request.db` (tenant-scoped otomatis), tentukan penerima lewat
   `resolveRecipients(eventType, { companyId, projectId })`
   (`utils/notification-routing.ts`), lalu `createNotification()` per
   penerima. Dedup memakai `pembuatDedup()` (didefinisikan di berkas
   yang sama) yang membaca tabel `notifications` sendiri sebagai ledger
   dedup — TIDAK ada tabel dedup terpisah.
2. **`apps/api/src/routes/v1/jadwal.ts`** — dispatcher SUNGGUHAN:
   - `KATALOG_TUGAS: Record<string, {label, keterangan, jalur}>` —
     peta `tugas` (nama di baris `jadwal_tugas`) → path rute HTTP.
     Tugas yang tak ada di peta ini ditandai `'tak-dikenal'` dan
     dilewati SELAMANYA — tanpa galat, tanpa gejala (persis kelas
     cacat yang riwayat berkasnya sendiri catat berulang).
   - `POST /api/v1/jadwal/jalankan` — dipanggil cron GitHub Actions
     (bukan n8n). Diautentikasi `x-scheduler-secret`
     (`timingSafeEqual`). Membuat token akun layanan SEKALI per run,
     lalu iterasi SEMUA baris `jadwal_tugas` aktif lintas tenant.
   - Klaim atomik: `UPDATE jadwal_tugas SET terakhir_jalan = now(), ...
     WHERE id = ... AND terakhir_jalan = <nilai lama>` — mencegah dua
     tick cron menjalankan tugas yang sama dua kali.
   - Eksekusi: `request.server.inject({ method: 'GET', url:
     meta.jalur, headers: { authorization: 'Bearer <token>',
     'x-company-id': companyId } })` — panggilan HTTP INTERNAL
     (bukan jaringan), menyamar sebagai akun layanan, disaring ke SATU
     company per panggilan.
   - `terakhir_status`/`terakhir_galat`/`terakhir_durasi_ms` ditulis
     balik oleh `jadwal.ts` sesudah `inject()` selesai — BUKAN oleh
     handler di `otomasi-terjadwal.ts`.
3. **`apps/api/src/lib/katalog-otomasi.ts`** — katalog deskriptif untuk
   UI (`KATALOG_OTOMASI`), disilangkan CI (`audit-katalog-otomasi-nyata.mjs`)
   terhadap rute yang benar-benar terdaftar. Tidak ikut dispatch.

**Penjaga CI yang mengunci arah kedua peta ini** (wajib tetap hijau
sesudah pekerjaan ini):
- `audit-tugas-punya-rute.mjs` — tiap `KATALOG_TUGAS[...].jalur` wajib
  cocok rute yang benar-benar terdaftar DAN berkasnya ter-register di
  `index.ts`.
- `audit-rute-penjadwal-punya-tugas.mjs` — arah sebaliknya: tiap rute
  berprefiks `/api/v1/otomasi/jalankan/` (atau berkomentar
  "dijalankan PENJADWAL") wajib punya entri `KATALOG_TUGAS` yang
  menunjuknya. Ambang NOL, bukan ratchet.
- `audit-peristiwa-punya-alur.mjs` — KHUSUS jalur peristiwa (§3.3),
  membaca `bangun-alur.mjs` sebagai TEKS (regex `kode:\s*'([^']+)'`),
  bukan meng-impor-nya. **Konsekuensi mengikat untuk §5**: bentuk
  resep di `bangun-alur.mjs` HARUS tetap punya literal `kode: '...'`
  per entri — redesain apa pun pada berkas itu tidak boleh mengubah
  pola tekstual ini, atau penjaga ini berhenti bisa membacanya.

## 4. Pendekatan yang Dipertimbangkan

Dua pendekatan dibandingkan sebelum desain final dipilih:

**A. n8n tetap scheduler + Variables per-tenant untuk kredensial** —
ditolak. Bertentangan langsung dengan temuan riset §3.4.3 (state
per-tenant di Variables bocor antar eksekusi), dan tidak menghapus
X-API-Key yang dipatok — hanya memindahkannya ke tempat penyimpanan n8n
lain yang permukaan kebocorannya sama besar.

**B. Aplikasi jadi scheduler + pemasok data, n8n murni lapis pengiriman
(dipilih)** — payload-driven penuh, sesuai keputusan founder §2.3-2.4.
Konsisten dengan pola yang **sudah terbukti jalan** untuk resep peristiwa
hari ini (Webhook → Susun → Kirim, 3 node, tanpa kredensial dipatok
untuk logika bisnisnya) — pendekatan ini menyamakan bentuk resep jadwal
dengan resep peristiwa, bukan menciptakan pola ketiga.

## 5. Desain

> ⚠ Cakupan bagian ini DIPERBAIKI oleh §0: hanya mencakup **5 resep
> peristiwa** (`RESEP_PERISTIWA` di `bangun-alur.mjs` — `kasbon_submitted`
> dkk.) yang benar-benar dipakai `terbitkanPeristiwa()` hari ini. 8 resep
> "jadwal" generasi lama **dipensiunkan**, bukan dimigrasikan — lihat §5.5.

### 5.1 Bentuk workflow — dipertahankan, DIPERKUAT tag tenant

5 resep peristiwa yang ada HARI INI sudah berbentuk 3-node yang benar
(Webhook → Susun pesan → Kirim WhatsApp) — TIDAK perlu redesain
struktural. Yang diperkuat:

```
Webhook (path = resep.kode, SATU per resep, dipakai bersama SEMUA
  tenant setelah migrasi §5.4 — hari ini masih 1:1 ke Puraloka karena
  baru satu tenant yang ada)
  → Susun pesan (Code node — baca $json.judul/$json.pesan yang sudah
     disusun aplikasi, TIDAK berubah dari hari ini)
  → Kirim WhatsApp (HTTP Request — url/apikey/instance/nomor tujuan
     SEMUA dibaca dari $json.wa.*, BARU — hari ini dipatok ke
     parameter node saat build, lihat §3.3)
```

Perubahan konkret dari bentuk hari ini:
- **Node "Kirim WhatsApp" diubah**: `cfg.waUrl`/`cfg.waApiKey`/
  `cfg.waInstance`/`cfg.nomorTujuan` yang dipatok saat build (§3.3)
  diganti pembacaan `$json.wa.url`/`$json.wa.apiKey`/`$json.wa.instance`/
  `$json.wa.nomorTujuan` — nilai datang dari payload webhook, disuplai
  `terbitkanPeristiwa()` (§5.2).
- **Tag `tenant_id`** ditambahkan sebagai field pertama yang dibaca node
  "Susun pesan" dari `$json.companyId` (sudah ada di payload hari ini
  secara implisit lewat parameter fungsi, kini eksplisit di body) —
  memenuhi rekomendasi riset §3.4.2, dan jadi dasar filter saat
  memeriksa riwayat eksekusi n8n per tenant kalau dibutuhkan.
- **Tidak ada perubahan pada webhook trigger** (`httpMethod: POST`,
  `responseMode: onReceived`) — bentuknya sudah benar.
- **Tidak ada cron/scheduleTrigger untuk dihapus** — 5 resep peristiwa
  ini TIDAK PERNAH punya cron; pemicunya murni webhook dari
  `terbitkanPeristiwa()`. (Cron hanya ada di 8 resep jadwal yang
  dipensiunkan, §5.5.)

### 5.2 `jalankanAlur()` — kontrak tak berubah, `terbitkanPeristiwa()` diperluas

`otomasi-n8n.ts` **tidak direstrukturisasi** — `jalankanAlur()` dan
`konfigurasiN8n()` sudah punya bentuk yang benar (§3.1). Satu-satunya
pemanggil produksi yang perlu diubah adalah `terbitkanPeristiwa()`
(`utils/terbit-peristiwa.ts:91-209`, §3.3 lama/kutipan Q2 laporan
Explore) — `opsi.muatan`-nya diperluas untuk menyertakan kredensial WA
yang **sudah dibaca aplikasi sebelum memanggil**, memakai
`ambilKredensialTanpaRequest()` yang SUDAH diimpor di berkas itu (baris
51):

```ts
// terbit-peristiwa.ts — di dalam terbitkanPeristiwa(), SEBELUM
// jalankanAlur() dipanggil (menggantikan blok baris ~194-209 saat ini).
// ambilKredensialTanpaRequest sudah diimpor (baris 51); WA_* dibaca
// dengan companyId yang sudah jadi parameter fungsi ini.
const wa = {
  url: await ambilKredensialTanpaRequest(companyId, 'WA_BASE_URL'),
  apiKey: await ambilKredensialTanpaRequest(companyId, 'WA_API_KEY'),
  instance: await ambilKredensialTanpaRequest(companyId, 'WA_INSTANCE'),
}
// nomor tujuan BUKAN kredensial — sudah ada di alur resolveRecipients()
// yang dipanggil createNotifications() sebelum terbitkanPeristiwa();
// diteruskan sebagai parameter tambahan fungsi ini kalau belum ada.

const hasil = await jalankanAlur({
  db: createTenantDb(companyId),
  companyId,
  cfg,
  alur: alurRow as never,
  sumber: 'peristiwa',
  oleh: null,
  muatan: {
    companyId,   // BARU, eksplisit — untuk tag tenant_id di n8n (§5.1)
    jenis, kode, judul: contoh.title, pesan: contoh.message,
    proyek_id: contoh.project_id ?? null, penerima: jumlahPenerima,
    wa,          // BARU
  },
})
```

Komentar kepala berkas `terbit-peristiwa.ts` baris 44-49 ("Kenapa
muatannya tipis") menyebut alasan lama: *"n8n punya kunci API untuk
mengambil sendiri apa yang ia butuhkan lewat `/api/v1/otomasi/umpan/*`"*
— alasan itu **basi** setelah perubahan ini (n8n tak lagi memanggil
balik apa pun) dan HARUS diperbarui di commit yang sama, atau ia
menyesatkan pembaca berikutnya persis seperti peringatan basi yang
dikeluhkan `CLAUDE.md` di bagian pembukanya sendiri.

Prinsip "satu pintu baca kredensial" **tidak dilanggar**: n8n tidak
pernah membaca `app_credentials` sendiri. Nilai yang diterimanya sudah
melalui jalur yang diaudit CI (`audit-kredensial-tak-bocor.mjs`,
K-4) di sisi aplikasi.

⚠ **Konsekuensi keamanan yang diterima secara sadar**: rahasia WA tenant
kini transit dalam body HTTP request ke n8n. Mitigasi:
- Koneksi API→n8n tetap di jaringan tepercaya/localhost (sudah begitu
  hari ini, tidak berubah).
- Kebijakan retensi log eksekusi n8n — DIPUTUSKAN di §7.1
  (`EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` + prune 72 jam), supaya body
  berisi rahasia tidak menumpuk selamanya di database n8n.

### 5.3 Provisioning tenant baru

**Bukan** clone-workflow-per-tenant — workflow 5 resep peristiwa sudah
generik sejak dibangun (tak pernah membawa kredensial tenant di
node-nya sendiri kecuali "Kirim WhatsApp" yang diperbaiki §5.1).
Menambah tenant baru jadi migrasi data biasa, bukan operasi n8n:

```sql
INSERT INTO otomasi_alur (company_id, kode, nama, n8n_id, jalur_webhook, ...)
SELECT :tenant_baru, kode, nama, n8n_id, jalur_webhook, ...
FROM otomasi_alur
WHERE company_id = :tenant_existing_mana_pun
  AND kode IN ('teruskan-kasbon-diajukan', 'teruskan-laporan-upah',
               'konfirmasi-invoice-dibayar', 'lapor-status-proyek-berubah',
               'peringatan-stok-menipis');
```

`scripts/n8n/bangun-alur.mjs` (bagian `RESEP_PERISTIWA`) berubah peran:
dari "build 5 workflow untuk SATU company (`LIMIT 1`, §3.3)" menjadi
"build/update 5 workflow SEKALI secara global (tanpa parameter company
sama sekali — node-nya sudah tak berisi kredensial tenant apa pun sejak
§5.1), lalu tiap tenant yang perlu dapat baris `otomasi_alur` lewat
query di atas". Dijalankan ulang hanya saat bentuk node berubah —
**bukan** langkah onboarding tenant baru.

### 5.4 Rencana migrasi tanpa downtime

Karena instance `:5680` **menjadi** instance shared (bukan berpindah
server) dan Puraloka adalah satu-satunya tenant hari ini, migrasi ini
murni mengubah SATU node ("Kirim WhatsApp") di 5 workflow yang sudah
ada, di tempat yang sama — jauh lebih kecil dari draf pertama spec ini
mengira (yang menghitung 8 workflow jadwal yang ternyata tak perlu
disentuh, §5.5):

1. **Ubah node "Kirim WhatsApp"** di satu workflow peristiwa dulu
   (rekomendasi: `peringatan-stok-menipis` — volume rendah, dampak
   kecil bila salah) supaya membaca `$json.wa.*`, sambil workflow tetap
   AKTIF. Uji dengan payload sintetis (curl langsung ke webhook n8n,
   menyertakan `wa: {...}` palsu) sebelum menyentuh kode aplikasi.
2. **Ubah `terbitkanPeristiwa()`** (§5.2) untuk menyertakan `wa: {...}`
   di `muatan` — HANYA untuk `kode === 'peringatan-stok-menipis'`
   dulu kalau ingin bertahap, atau langsung untuk kelimanya sekaligus
   karena perubahannya satu blok kode yang sama untuk semua kode alur
   (lebih sederhana, dan kelima alur toh berbagi fungsi yang sama).
3. **Amati `otomasi_jalan`** (jejak eksekusi yang sudah ada) untuk
   kode itu sesudah satu peristiwa asli terjadi (mis. picu manual lewat
   UI Alur Otomasi). `kesehatan` harus tetap `'sehat'`.
4. **Ulangi untuk 4 kode sisanya** kalau dipilih jalur bertahap di
   langkah 2 — masing-masing independen, `otomasi_jalan` per-kode jadi
   bukti tiap langkah.
5. **Hapus X-API-Key/kredensial WA lama yang dipatok** dari kelima
   node n8n setelah SEMUA kode diamati sehat minimal sekali — ini
   membuat node-nya benar-benar tak lagi menyimpan rahasia tenant.

Tidak ada big-bang cutover, dan tidak ada downtime untuk `jadwal_tugas`
sama sekali karena mekanisme itu **tidak disentuh** — perubahan §5.4
murni pada jalur peristiwa.

### 5.5 Pensiunkan 8 resep "jadwal" generasi lama (BARU, dari §0)

8 resep di `RESEP` (`bangun-alur.mjs`) — `eskalasi-invoice-terlambat`,
`ingatkan-persetujuan-tertahan`, `eskalasi-ncr-belum-ditutup`,
`eskalasi-milestone-terlambat`, `ringkasan-harian-pemilik`,
`tagih-invoice-jatuh-tempo`, `peringatan-milestone-mendekat`,
`laporan-mingguan-klien` — TIDAK dimigrasikan. Diukur (§0): namanya tak
tumpang tindih dengan satu pun dari ~62 automation aktif di
`otomasi-terjadwal.ts`, dan mekanismenya (cron n8n + `X-API-Key` +
`/api/v1/otomasi/umpan/:jenis`) adalah generasi arsitektur yang lebih
tua dari `jadwal_tugas`/`terbitkanPeristiwa()` yang sekarang jadi jalur
utama.

**Keputusan: pensiunkan, jangan migrasikan.** Alasan:
- Memigrasikannya berarti membangun ULANG 8 handler tenant-scoped di
  `otomasi-terjadwal.ts` (baca data → format pesan) yang FUNGSINYA
  kemungkinan besar sudah tercakup otomasi lain di 62 rute yang ada
  (mis. `invoice-terlambat`/`invoice-jatuh-tempo` overlap konsep dengan
  automation yang sudah didaftarkan `katalog-otomasi.ts`) — investasi
  besar untuk kemungkinan duplikasi.
- Mempertahankannya sebagai mekanisme paralel berarti DUA pola berbeda
  untuk hal yang sama hidup bersamaan tanpa alasan, dan salah satu akan
  membusuk diam-diam (persis kelas cacat yang CLAUDE.md §1 sudah
  peringatkan berulang kali di repo ini).

**Langkah pensiun** (bagian dari scope implementasi ini, BUKAN
penghapusan liar):
1. ✅ **DIUKUR 2026-08-22** (query langsung ke `otomasi_alur`/
   `otomasi_jalan`, bukan ditebak): kedelapan kode PUNYA baris
   `otomasi_alur` aktif (6 dari 8 `aktif=true`, 2 — `peringatan-milestone-mendekat`
   dan `tagih-invoice-jatuh-tempo` — sudah `aktif=false`), dan
   **6 dari 8 punya NOL eksekusi seumur hidup**. Dua sisanya
   (`eskalasi-ncr-belum-ditutup`, `laporan-mingguan-klien`) masing-masing
   tereksekusi TEPAT SEKALI, keduanya 2026-08-10/13 — bukan pola
   pemakaian berkelanjutan, terbaca sebagai uji-coba saat resepnya
   dibuat. **Kesimpulan: aman dipensiunkan tanpa perlu melibatkan
   founder lebih dulu** — tak ada eksekusi hidup yang akan terputus.
2. Nonaktifkan workflow-nya di n8n (jangan hapus dulu — bisa diperiksa
   ulang bila ternyata masih dipakai).
3. Hapus 8 entri `RESEP` (bukan `RESEP_PERISTIWA`) dari
   `bangun-alur.mjs`, dan hapus 7 jenis dari `JENIS_TERSEDIA` di
   `otomasi-umpan.ts` SERTA fungsi `bangunUmpan()`-nya — kalau
   dikonfirmasi tak dipakai. Endpoint `/api/v1/otomasi/umpan/*` itu
   sendiri TETAP ADA (dipakai `requireApiKey('otomasi:umpan:baca')`,
   masih valid sebagai mekanisme untuk masa depan) — hanya isi
   `JENIS_TERSEDIA` yang dikosongkan atau dikurangi.
4. Setelah workflow dihapus permanen di n8n, hapus baris `otomasi_alur`
   yang menunjuk 8 `kode` itu.

## 6. Yang Tidak Berubah (batas scope eksplisit)

- Skema tabel `otomasi_alur`/`otomasi_jalan` — tidak berubah.
- Kontrak fungsi `jalankanAlur()`/`konfigurasiN8n()` — tidak berubah,
  hanya isi `muatan` yang diperluas oleh pemanggil (§5.2).
- `jadwal_tugas`, `KATALOG_TUGAS`, dan seluruh dispatcher di `jadwal.ts`
  (§3.6) — TIDAK disentuh sama sekali oleh spec ini. ~62 automation di
  `otomasi-terjadwal.ts` tetap berhenti di `createNotification()`;
  apakah dan bagaimana mereka nanti mengirim WhatsApp (via `kirimWa()`
  langsung, per keputusan §0) adalah scope TERPISAH, bukan bagian dari
  migrasi n8n ini.
- Registry adaptor WhatsApp (`wa-kirim.ts`, `AdaptorWa`) — tidak
  disentuh, dan TIDAK berhubungan dengan n8n sama sekali (dikoreksi
  §0: ini jalur pengiriman WA LANGSUNG, terpisah total dari node "Kirim
  WhatsApp" di workflow n8n yang memanggil Evolution/Fonnte lewat HTTP
  Request node-nya sendiri, bukan lewat `wa-kirim.ts`).
- Kredensial `N8N_BASE_URL`/`N8N_API_KEY` tetap ada sebagai baris per
  tenant di skema `app_credentials` — secara praktik hanya baris tenant
  operator (Puraloka) yang benar-benar relevan karena instance-nya
  shared. Keputusan UI — DIPUTUSKAN §7.2: perbarui teks `keterangan`,
  kotaknya tetap tampil.

## 7. Keputusan Susulan (diputuskan lewat riset, founder menyerahkan ke agen — dicatat di sini, bukan diam-diam)

> Founder 2026-08-22: *"saya serahkan ke kamu semuanya... kalo semuanya
> pertanyaan teknis silahkan kamu riset aja mana yg terbaik"*. Ketiga
> item berikut tadinya "terbuka" di draf pertama spec ini; diputuskan
> lewat riset di bawah, bukan ditinggal sebagai TBD.

### 7.1 Retensi log eksekusi n8n — DIPUTUSKAN

Riset (dokumentasi resmi n8n + komunitas, 2026): pola yang direkomendasikan
untuk workflow yang membawa data sensitif adalah memisah kebijakan sukses
vs gagal, bukan satu angka retensi untuk keduanya.

**Ditetapkan:**
- `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` — eksekusi sukses (mayoritas
  volume, dan rahasia WA di dalamnya sudah "selesai tugas" begitu
  terkirim) tidak disimpan sama sekali.
- `EXECUTIONS_DATA_SAVE_ON_ERROR=all` — eksekusi gagal tetap disimpan
  penuh, karena itu satu-satunya kasus yang butuh payload utuh untuk
  didebug.
- `EXECUTIONS_DATA_PRUNE=true` dengan `EXECUTIONS_DATA_MAX_AGE=72`
  (jam) — lebih ketat dari default umum "produksi tipikal" 168 jam
  (dokumentasi n8n), karena payload di sini membawa kredensial hidup,
  bukan sekadar data bisnis. Kegagalan yang perlu didebug lebih dari
  3 hari sudah cukup lama untuk direkonstruksi dari `otomasi_jalan` +
  log aplikasi, bukan dari body eksekusi n8n.
- `otomasi_jalan` (sudah ada, tidak menyimpan payload rahasia — hanya
  status/durasi/pesan galat terpotong 300 karakter, lihat
  `otomasi-n8n.ts`) tetap jadi jejak UI utama dan TIDAK bergantung pada
  retensi n8n di atas.

Diterapkan sebagai variabel environment di `scripts/jalankan-n8n.cmd`
(bagian implementasi, §Implementasi Sub-Langkah D di rencana kerja).

### 7.2 Kotak kredensial N8N_BASE_URL/N8N_API_KEY di halaman tenant biasa — DIPUTUSKAN

**Ditetapkan: perbarui teks `keterangan`, JANGAN sembunyikan kotaknya.**

Alasan menolak opsi "sembunyikan": itu berarti cabang UI baru yang
bergantung pada "apakah tenant ini operator" — kategori keputusan yang
mudah dilupakan dan tak diuji (persis pola `EVOLUTION_*` yang sudah
dibersihkan dari katalog karena dua kotak untuk satu nilai, satu di
antaranya bohong — lihat komentar `kredensial.ts` baris ~167-193).
Cukup ikuti pola yang SUDAH ada di berkas yang sama: tulis kejujurannya
di `keterangan`, seperti yang sudah dilakukan untuk `EMAIL_FROM`.

Teks baru untuk kedua entri (diterapkan di `KATALOG_KREDENSIAL`,
`kredensial.ts`): jelaskan bahwa instance n8n adalah milik
operator/shared sejak migrasi ini, dan mengisi kotak ini di tenant
bukan-operator tidak berpengaruh apa pun. Tidak ada logika baru, tidak
ada permission baru — murni perubahan salinan teks.

### 7.3 Sub-project B & C — tetap di luar scope

AI shared-key + kuota (sub-project B) dan pola umum integrasi pihak
ketiga lain — WA/Fonnte, email, storage (sub-project C) — sengaja tidak
dibahas di spec ini, menyusul di spec terpisah sesuai keputusan founder
di awal brainstorming. Bukan item yang perlu diriset di sini karena
sudah eksplisit di-declare dari awal, bukan ambiguitas yang muncul saat
menulis spec.

## 8. Penguatan Lanjutan (di luar scope, dicatat sebagai kandidat masa depan)

- **Queue mode** (`EXECUTIONS_MODE=queue` + Redis) untuk isolasi beban
  antar tenant besar — relevan saat jumlah tenant/volume eksekusi
  bertambah signifikan, tidak diperlukan untuk desain dasar ini.
- Tag `tenant_id` eksplisit di node pertama tiap workflow (§3.4.2) —
  disarankan diimplementasikan sekalian saat redesain node (§5.1),
  bukan penguatan terpisah, karena `companyId` sudah ada di payload.

## 9. Verifikasi Desain (bagaimana membuktikan migrasi ini benar saat diimplementasikan)

- Tiap resep yang dipindah: bandingkan `otomasi_jalan` sebelum/sesudah
  — `kesehatan` harus tetap `'sehat'` melewati minimal satu siklus
  jadwal penuh pasca migrasi.
- Uji sengaja: kirim payload dengan `wa.apiKey` sengaja salah ke webhook
  workflow baru — pastikan `jalankanAlur()` mencatat `status: 'gagal'`
  di `otomasi_jalan` dengan pesan yang bisa dibaca (bukan silent
  failure), sama seperti perilaku hari ini untuk kegagalan jaringan.
- Uji isolasi: dua company dummy dengan `WA_INSTANCE`/nomor tujuan
  berbeda, jalankan resep yang sama untuk keduanya nyaris bersamaan,
  pastikan pesan yang terkirim ke masing-masing nomor sesuai
  company-nya (tidak tertukar) — ini bukti langsung bahwa payload-driven
  benar-benar mengisolasi, bukan asumsi dari desain di atas kertas.
- ✅ Sudah diukur (§5.5 langkah 1, 2026-08-22): 6/8 resep jadwal lama
  nol eksekusi seumur hidup, 2/8 tepat sekali di 2026-08-10/13. Aman
  dipensiunkan langsung — tak perlu diulang saat implementasi kecuali
  ada keraguan angkanya sudah basi (query ulang murah, lihat §5.5).
