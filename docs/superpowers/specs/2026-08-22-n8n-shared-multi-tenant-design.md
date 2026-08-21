# Spec: n8n Shared Multi-Tenant

> Sub-project A dari brainstorming "integrasi pihak ketiga multi-tenant"
> (n8n, AI/Claude, dan pola umum lainnya). Sub-project B (AI shared-key +
> kuota) dan C (pola umum pihak ketiga lain) menyusul di spec terpisah —
> **tidak dibahas di sini**.

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
produksi. **Tidak perlu infrastruktur scheduler baru** untuk memindah
cron dari n8n ke aplikasi — tinggal menambah baris `jadwal_tugas` untuk
tiap resep yang sebelumnya dijadwalkan n8n.

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

### 5.1 Bentuk workflow baru — seragam untuk semua resep

Satu bentuk untuk seluruh resep (jadwal maupun peristiwa), turun dari
4 node (jadwal) + 3 node (peristiwa) yang berbeda hari ini menjadi satu
bentuk:

```
Webhook (path = resep.kode, SATU untuk semua tenant, tidak berubah)
  → Susun pesan (Code node — baca $json.teks yang sudah disusun
     aplikasi; TIDAK ada panggilan balik ke API dari node ini)
  → Kirim WhatsApp (HTTP Request — url/apikey/instance/nomor SEMUA
     dibaca dari $json.wa.*, tidak ada satu pun dipatok ke parameter
     node)
```

Perubahan konkret dari bentuk hari ini (§3.3):
- Node **"Ambil umpan" dihapus** dari resep jadwal. Logika "cari data →
  susun kalimat" (yang sekarang di node Code n8n dan endpoint umpan)
  pindah sepenuhnya ke handler aplikasi yang dipicu `jadwal_tugas` —
  memakai **kode TypeScript yang sama** dengan yang sudah ada
  (`LANGKAH_KIRIM` di `katalog-otomasi.ts` sudah mendeskripsikan urutan
  ini: lewati yang sudah dikirim hari ini → tentukan penerima → susun
  kalimat; hanya langkah terakhir "kirim lewat WhatsApp" yang pindah
  tujuan panggilannya dari notifikasi in-app ke webhook n8n).
- **`X-API-Key` per-tenant di n8n dihapus total.** n8n tidak lagi
  memanggil balik API Puraloka untuk data apa pun — payload webhook yang
  diterima sudah lengkap.
- **Cron `scheduleTrigger` di n8n dihapus** bersamaan dengan node "Ambil
  umpan" — jadwalnya sepenuhnya pindah ke `jadwal_tugas`.
- Webhook trigger (`httpMethod: POST`, `responseMode: onReceived`) yang
  sudah ada **dipertahankan** — pola `onReceived` (bukan `lastNode`)
  sudah benar untuk kasus alur yang berhenti sebelum node terakhir
  (mis. "tidak ada data hari ini").

### 5.2 `jalankanAlur()` — kontrak tak berubah, payload diperluas

`otomasi-n8n.ts` **tidak direstrukturisasi**. `opsi.muatan` yang sudah
ada sekarang membawa field bisnis (`jenis`, `kode`, `judul`, `pesan`,
dst) — diperluas pemanggil untuk menyertakan kredensial WA yang **sudah
dibaca aplikasi sebelum memanggil**:

```ts
// Pemanggil (terbit-peristiwa.ts untuk peristiwa, handler baru untuk
// jadwal_tugas untuk resep yang sebelumnya dijadwalkan n8n) membaca
// kredensial WA lewat jalur yang SUDAH ADA — ambilKredensial() atau
// ambilKredensialTanpaRequest() — sebelum memanggil jalankanAlur().
const wa = {
  url: await bacaKredensial('WA_BASE_URL'),
  apiKey: await bacaKredensial('WA_API_KEY'),
  instance: await bacaKredensial('WA_INSTANCE'),
  nomorTujuan: /* nomor penerima notifikasi, bukan kredensial —
                  ditentukan logika resolveRecipients() yang sudah ada */,
}

await jalankanAlur({
  db, companyId, cfg, alur, sumber, oleh,
  muatan: {
    companyId,   // eksplisit di payload, untuk tag tenant_id di n8n (§3.4.2)
    teks,        // pesan yang sudah disusun aplikasi
    wa,          // BARU
  },
})
```

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

**Bukan** clone-workflow-per-tenant, **bukan** juga "1 workflow
parameterized yang dipanggil beda cara per tenant" — workflow-nya sudah
generik sejak resep pertama dibangun (§5.1). Menambah tenant baru jadi
migrasi data biasa, bukan operasi n8n:

```sql
INSERT INTO otomasi_alur (company_id, kode, nama, n8n_id, jalur_webhook, ...)
SELECT :tenant_baru, kode, nama, n8n_id, jalur_webhook, ...
FROM otomasi_alur
WHERE company_id = :tenant_existing_mana_pun;
```

`scripts/n8n/bangun-alur.mjs` berubah peran: dari "build workflow per
company" menjadi "build/update workflow SEKALI secara global, lalu
pastikan tiap tenant yang butuh resep ini punya baris `otomasi_alur`
yang menunjuk ke situ". Dijalankan ulang hanya saat ada resep BARU atau
bentuk node berubah — **bukan** langkah onboarding tenant baru.

### 5.4 Rencana migrasi tanpa downtime

Karena instance `:5680` **menjadi** instance shared (bukan berpindah
server) dan Puraloka adalah satu-satunya tenant hari ini, migrasi ini
murni mengubah bentuk workflow yang sudah ada, di tempat yang sama:

1. **Tulis workflow baru** (bentuk seragam §5.1) di samping workflow
   lama, berstatus nonaktif. Uji dengan payload sintetis (curl langsung
   ke webhook n8n) sebelum disambungkan ke apa pun.
2. **Alihkan satu resep dulu** — rekomendasi mulai dari yang paling
   jarang jalan (mis. `sertifikat-berakhir`, jadwal bulanan). Update
   baris `otomasi_alur` Puraloka untuk resep itu agar menunjuk workflow
   baru, aktifkan, matikan node/workflow lama untuk resep itu saja.
   Amati minimal satu siklus jadwal penuh.
3. **Ulangi per resep.** `otomasi_jalan` (jejak eksekusi yang sudah ada)
   jadi bukti tiap langkah — kalau `kesehatan` alur itu jatuh ke
   `'gagal'` pasca migrasi, itu sinyal berhenti dan revert baris
   `otomasi_alur` resep tersebut saja, bukan seluruh migrasi.
4. **Hapus workflow lama & X-API-Key n8n lama** setelah SEMUA resep
   berhasil pindah dan diamati minimal satu siklus penuh masing-masing
   (harian penuh untuk resep harian, dst).
5. Cron di sisi n8n untuk satu resep dinonaktifkan **bersamaan** dengan
   node "Ambil umpan"-nya dihapus dan `jadwal_tugas` untuk resep itu
   diaktifkan — satu langkah atomik per resep, bukan fase terpisah untuk
   "matikan cron n8n" vs "nyalakan jadwal_tugas".

Tidak ada big-bang cutover — tiap resep berpindah independen, dan
`otomasi_jalan` yang sudah ada menjadi instrumen verifikasi tiap langkah
tanpa alat baru yang perlu dibangun.

## 6. Yang Tidak Berubah (batas scope eksplisit)

- Skema tabel `otomasi_alur`/`otomasi_jalan` — tidak berubah.
- Kontrak fungsi `jalankanAlur()`/`konfigurasiN8n()` — tidak berubah,
  hanya isi `muatan` yang diperluas oleh pemanggil.
- Registry adaptor WhatsApp (`wa-kirim.ts`, `AdaptorWa`) — tidak
  disentuh. Node "Kirim WhatsApp" di n8n tetap bicara langsung ke
  Evolution/Fonnte HTTP API seperti sekarang; hanya sumber
  kredensialnya yang berubah dari dipatok jadi dari payload.
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
