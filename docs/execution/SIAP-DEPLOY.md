# Siap Deploy — daftar yang harus benar sebelum produksi hidup

> **Dokumen ini sengaja tidak memuat angka yang bisa basi.**
>
> Tiap baris di bawah punya **perintah pengukurnya sendiri**. Kalau angka di
> dokumen ini berbeda dengan hasil perintahnya, **hasil perintahnya yang benar**
> — perbarui dokumennya, jangan percaya tulisannya.
>
> Aturan yang sama dengan pembuka `CLAUDE.md`, dan alasannya sama: versi
> sebelumnya dari dokumen semacam ini selalu membusuk lebih cepat daripada
> yang menulisnya menduga.

---

## 0. Kenapa dokumen ini ada

Diukur **2026-08-20**, dan ini yang ditemukan:

```
tugas terjadwal aktif di basis     72
jumlah yang pernah dipanggil        0
```

Tujuh puluh dua tugas berstatus `aktif = true`, migrasinya lulus verifikasi,
katalog di layar menampilkannya sebagai terpasang — dan **tak satu pun pernah
berjalan.**

Sebabnya satu baris rahasia yang tak pernah disetel (`SCHEDULER_URL`), dan
satu berkas workflow yang tak pernah ter-*push*. Tak ada galat, tak ada CI
merah, tak ada satu pun baris log. Satu-satunya gejalanya adalah **sesuatu
yang tidak terjadi** — dan hal yang tidak terjadi tak menimbulkan tiket.

Dokumen ini supaya itu tak terulang saat deploy sungguhan.

---

## 1. Rahasia GitHub Actions

Ukur apa yang **dipakai** dan apa yang **sudah ada**:

```bash
# Yang dipakai seluruh workflow
grep -ohE "secrets\.[A-Z_][A-Z0-9_]*" .github/workflows/*.yml | sed 's/secrets\.//' | sort -u

# Yang sudah terpasang di GitHub
gh secret list | awk '{print $1}' | sort
```

Selisih di antara keduanya adalah pekerjaan yang tersisa.

| Rahasia | Untuk apa | Kalau kosong |
|---|---|---|
| `SCHEDULER_URL` | alamat API produksi, `https://<api>/api/v1/jadwal/jalankan` | **seluruh tugas terjadwal diam** — inilah cacat 2026-08-20 |
| `SCHEDULER_SECRET` | rahasia bersama cron ↔ API, harus **sama persis** dengan `apps/api/.env` | penjadwal ditolak 401 |
| `DATABASE_URL` · `DIRECT_URL` | basis produksi | cadangan & DR drill gagal |
| `JWT_SECRET` | sesi | — |
| `SANDI_CADANGAN` | kunci enkripsi berkas cadangan | cadangan gagal terbuat |
| `CI_*` | basis khusus CI, terpisah dari produksi | CI merah, produksi aman |

> ⚠ `SCHEDULER_SECRET` **bukan** satu-satunya yang dibutuhkan penjadwal.
> API-nya juga menuntut akun layanan — lihat §2.

---

## 2. Env di server API

```bash
# Daftar lengkap yang wajib terdokumentasi (penjaga, ambang NOL)
cd apps/api && node scripts/audit-env-siap-deploy.mjs

# Port yang dipakai web WAJIB sama dengan port API
cd apps/api && node scripts/audit-port-api-cocok.mjs
```

Tiga yang paling mudah terlewat, dan ketiganya bergejala menyesatkan:

| Env | Kalau kosong |
|---|---|
| `SCHEDULER_EMAIL` · `SCHEDULER_PASSWORD` | penjadwal terautentikasi sebagai *tak seorang pun*; tugas balas 403, dan 403 itu tak dibaca siapa pun |
| `APP_URL` | jatuh ke `http://localhost:3000`. Tombol di surel ke **klien** menunjuk komputer penerimanya sendiri; kliennya menyimpulkan aplikasinya rusak |
| `RESEND_API_KEY` | `sendEmail()` jadi no-op **tanpa melempar**. Jadwal jalan, penanda terkirim ter-update, nol surel keluar |

Ketiganya punya bawaan yang *terlihat benar*. Itu yang membuatnya bertahan.

---

## 3. Buku migrasi

**Verdict yang bisa dipercaya cuma satu**, dan bukan dari menghitung berkas:

```bash
node scripts/db/ledger-diff.mjs
```

Menghitung `ls db/migrations/*.sql` lalu membandingkannya dengan `count(*)` di
`schema_migrations` **selalu menyesatkan** — sebagian migrasi memakai DDL
dinamis yang tak bisa diverifikasi otomatis, dan sebagian lain memang tak
menjanjikan objek apa pun.

Yang menentukan: **artefak fisiknya ada atau tidak.** Menulis ke
`supabase_migrations.schema_migrations` adalah **Gerbang Keras G-2** — entri
palsu berarti migrasi dilewati senyap **selamanya**.

Ukur juga apa yang belum tercatat:

```bash
node scripts/db/introspect.mjs migration-ledger
```

---

## 4. Push

```bash
git rev-list --count origin/main..HEAD    # commit lokal yang belum sampai
git cat-file -e origin/main:.github/workflows/jadwal-tugas.yml \
  && echo "workflow ADA di origin" || echo "workflow BELUM ter-push"
```

⚠ **Workflow yang belum ter-push tak muncul di `gh workflow list`, dan tak
pernah berjalan.** Itu bagian kedua dari cacat 2026-08-20: berkasnya
ter-*commit* di lokal sejak lama, tetapi tak pernah sampai ke GitHub — jadi
`gh workflow list` tak menyebutnya sama sekali, dan tak ada yang menyadari.

Sesudah push, buktikan penjadwalnya benar-benar terdaftar dan jalan:

```bash
gh workflow list | grep -i jadwal
gh run list --workflow=jadwal-tugas.yml -L 5
```

---

## 5. Bukti bahwa penjadwal benar-benar hidup

Jangan berhenti di "workflow-nya hijau" — hijau juga terjadi saat langkahnya
**dilewati**. Yang membuktikan: tugasnya benar-benar dipanggil.

```sql
-- lewat psql/Supabase SQL editor
SELECT tugas, jenis, aktif, terakhir_jalan, jumlah_jalan
  FROM jadwal_tugas
 ORDER BY terakhir_jalan NULLS FIRST
 LIMIT 20;
```

`terakhir_jalan` yang tetap NULL berjam-jam sesudah deploy berarti penjadwalnya
**tidak** hidup, apa pun warna CI-nya.

Penjaga yang menjaga sisi repo-nya:

```bash
cd apps/api && node scripts/audit-penjadwal-hidup.mjs
```

Ia menuntut cabang "dilewati" di workflow memakai `::warning::`, bukan
`::notice::` — supaya tiap denyut meninggalkan jejak kuning yang terbaca
"penjadwal sedang mati". Dengan `::notice::` jejaknya praktis tak terlihat,
dan itu persis yang membuat cacat 2026-08-20 bertahan berhari-hari.

⚠ Penjaga itu **tidak bisa** memeriksa GitHub — ia berjalan di CI tanpa
kewenangan membaca daftar rahasia. Yang dijamin: kalau penjadwalnya mati,
keadaannya **terlihat**. Bukan bahwa ia hidup.

---

## 6. n8n & Evolution — TIDAK memblokir deploy

Ukur:

```bash
netstat -ano | grep -E ':(5680|5681|8081).*LISTENING'
```

Kalau kosong, keduanya mati. **Itu tidak menghentikan otomasi mana pun.**

```bash
# Buktikan: nol rute otomasi memanggil n8n
cd apps/api && grep -c "jalankanAlur\|N8N_\|webhook" src/routes/v1/otomasi-terjadwal.ts
```

Seluruh otomasi terjadwal berjalan lewat penjadwal internal, murni aturan
`if-then`, tanpa AI dan tanpa n8n. n8n hanya melayani alur yang **mengirim
keluar** — WhatsApp dan surel. Ukur mana yang terdaftar:

```sql
SELECT kode, aktif, kesehatan, jalan_terakhir FROM otomasi_alur ORDER BY aktif DESC, kode;
```

Port Puraloka **5680** (n8n) dan **8081** (Evolution) — bukan 5678/8080, yang
milik proyek lain di mesin yang sama. Mengarahkannya ke port yang salah membuat
pesan masuk Puraloka dikirim ke webhook proyek lain, dan riwayat chat dua
perusahaan bercampur **tanpa satu pun galat**. Rinciannya di `CLAUDE.md` §7.

---

## 7. Urutan yang disarankan

1. **Push** — tanpa ini, workflow-nya tak ada di GitHub sama sekali (§4)
2. **Pasang `SCHEDULER_URL`** setelah alamat API produksi diketahui (§1)
3. **Isi env server**, terutama tiga yang berbawaan menyesatkan (§2)
4. **Catat migrasi** ke buku — G-2, keputusan founder (§3)
5. **Buktikan penjadwal hidup** lewat `terakhir_jalan`, bukan warna CI (§5)
6. n8n menyusul kapan saja — tak memblokir apa pun (§6)

---

## 8. Rujukan

| Kebutuhan | Berkas |
|---|---|
| Kewenangan, fase, Gerbang Keras | `docs/execution/CHARTER.md` |
| Menunggu keputusan founder | `docs/execution/RATIFIKASI.md` |
| Buku migrasi vs kenyataan | `docs/execution/LEDGER-DIFF.md` |
| Port, n8n, Evolution, jebakan `.env` | `CLAUDE.md` §7 |
| Katalog otomasi & jadwalnya | `apps/api/src/lib/katalog-otomasi.ts` |
