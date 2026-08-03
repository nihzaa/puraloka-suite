# Runbook Pemulihan Bencana

> **Dokumen ini untuk dibaca saat panik.** Karena itu ia dimulai dari tindakan,
> bukan dari penjelasan. Latar belakang ada di bagian bawah.
>
> Angka RTO di sini **terukur**, bukan janji. Sumbernya jalannya workflow
> `Uji Pemulihan (DR drill)` — kalau angkanya tak cocok dengan jalan terakhir,
> **yang benar adalah jalan terakhir**, dan dokumen ini yang harus diperbaiki.

---

## 0. Hal pertama: JANGAN memulihkan dulu

Pemulihan adalah operasi yang **menimpa**. Kalau salah sasaran atau salah
titik waktu, ia mengubah kerusakan yang bisa diperbaiki menjadi kerusakan yang
tidak bisa.

Sebelum menyentuh apa pun:

1. **Hentikan penulisan.** Matikan API (atau tutup akses) supaya kerusakan
   tidak bertambah dan titik pemulihan tidak bergerak.
2. **Catat jamnya.** Jam kejadian menentukan titik pemulihan yang benar. Kalau
   ini tidak dicatat sekarang, satu jam lagi tidak akan ada yang ingat.
3. **Jangan hapus apa pun.** Termasuk yang "jelas rusak". Basis data yang rusak
   masih berisi data; basis data yang sudah ditimpa tidak.

---

## 1. Pilih jalur

| Keadaan | Jalur |
|---|---|
| Data salah/terhapus, database sehat | **A — PITR Supabase** |
| Database tak bisa diakses / project hilang | **B — restore dari dump** |
| Ragu | **A** dulu; ia tidak merusak apa pun bila dibatalkan |

---

## 2. Jalur A — Point-in-Time Recovery (Supabase)

Supabase menyimpan riwayat dan bisa memulihkan ke satu titik waktu. Ini jalur
**tercepat** dan **paling tepat**, karena ia tidak kehilangan apa pun antara
cadangan terakhir dan detik kejadian.

1. Supabase Dashboard → project → **Database → Backups**.
2. Pilih **Point in Time**, isi jam dari langkah 0 (dikurangi 1 menit).
3. Jalankan. Tunggu sampai project kembali `ACTIVE_HEALTHY`.
4. Lanjut ke **§4 Verifikasi** — jangan lewati.

> ⚠️ PITR tersedia pada paket berbayar. Kalau menu itu tidak ada, jalur ini
> tertutup dan Anda harus memakai jalur B. Ketahui ini **sekarang**, bukan saat
> keadaan darurat: buka dashboard dan pastikan.

---

## 3. Jalur B — Restore dari dump

### Prasyarat

`pg_dump`/`pg_restore` dengan versi **≥ versi server** (server saat ini:
PostgreSQL 17). Klien yang lebih tua bisa kehilangan objek yang belum
dikenalinya, dan kerusakannya baru ketahuan saat restore.

```bash
# Windows — pasang PostgreSQL 17 (butuh hak admin)
#   https://www.postgresql.org/download/windows/
# Linux/WSL
sudo apt-get install -y postgresql-client-17
```

Kalau perkakas tidak tersedia di mesin Anda, **jangan buang waktu memasangnya
saat darurat** — jalankan workflow `Uji Pemulihan (DR drill)` di GitHub
Actions, yang runner-nya sudah membawa semuanya.

### Membuat cadangan

```bash
node scripts/db/cadangkan.mjs
```

Menolak berjalan bila `pg_dump` lebih tua dari server. Hasilnya di `cadangan/`
beserta berkas `.info.txt`. Skrip ini **tidak pernah menulis** ke basis data.

### Memulihkan

```bash
# ⚠️ TARGET harus basis data KOSONG. Restore MENIMPA.
pg_restore --no-owner --no-privileges \
  --dbname "postgresql://…TARGET…" \
  cadangan/puraloka-….dump
```

`pg_restore` sering keluar dengan kode non-nol karena peran yang tidak ada di
target. **Itu bukan kegagalan.** Yang menentukan adalah §4.

---

## 4. Verifikasi — jangan pernah dilewati

Restore yang "selesai" belum tentu restore yang berhasil. Empat hal ini
diperiksa berurutan, dan yang ketiga adalah yang paling sering terlupa.

```bash
node scripts/db/introspect.mjs tables      # 1. jumlah tabel
node scripts/db/introspect.mjs rls         # 2. RLS + policy
node scripts/db/ledger-diff.mjs            # 3. buku migrasi vs artefak fisik
cd apps/api && npx vitest run              # 4. test integrasi
```

1. **Jumlah tabel** cocok dengan sebelum kejadian.
2. **RLS dan policy ikut pulih.** ⚠️ **Ini yang paling penting.** Memulihkan
   data tanpa memulihkan RLS di sistem multi-tenant **bukan pemulihan,
   melainkan kebocoran** — tenant akan saling melihat data, dan semua
   pemeriksaan jumlah baris tetap hijau. Kalau angka RLS/policy tidak cocok,
   **jangan buka akses**, apa pun tekanannya.
3. **Buku migrasi cocok dengan artefak fisik.**
4. **Test integrasi hijau.** Ini menjalankan isolasi tenant terhadap data yang
   baru dipulihkan.

Baru setelah keempatnya: nyalakan kembali akses.

---

## 5. Setelah pulih

- Tulis di `docs/execution/JOURNAL.md`: apa yang terjadi, jam berapa, berapa
  lama, data apa yang hilang antara titik pemulihan dan kejadian.
- Kalau ada langkah di dokumen ini yang ternyata salah atau kurang,
  **perbaiki hari itu juga.** Runbook yang keliru lebih berbahaya daripada
  tidak ada runbook, karena ia dipercaya saat tak ada waktu untuk meragukannya.

---

## 6. Latihan berkala

Workflow **`Uji Pemulihan (DR drill)`** berjalan **setiap Senin 02:00 UTC** dan
bisa dijalankan manual kapan saja (Actions → Run workflow).

Ia melakukan siklus penuh terhadap **database CI** (bukan produksi): dump →
restore ke Postgres sekali-pakai → bandingkan tabel, isi, RLS, dan policy.
Waktunya dicatat di ringkasan setiap jalan.

Kalau drill ini merah, **kemampuan memulihkan sedang rusak** — dan itu perlu
diperbaiki sebelum ada pelanggan yang membutuhkannya, bukan sesudah.

### Kenapa drill-nya di CI, bukan di mesin pengembang

Karena mesin pengembang belum tentu bisa: yang dipakai menulis runbook ini
tidak punya hak admin, dan WSL-nya tanpa distro sehingga Docker tak bisa hidup.
Kemampuan memulihkan tidak boleh bergantung pada satu laptop tertentu.

---

## 6a. Insiden 2026-08-03 — kredensial sempat tampil di log publik

**Apa yang terjadi.** Drill pertama gagal karena sandi database mengandung `@`.
Di URL koneksi, `@` memisahkan sandi dari nama server — `pg_dump` salah membaca
dan gagal dengan `could not translate host name "…sandi…@aws-0-…"`.

**Kenapa itu berbahaya, bukan sekadar merepotkan.** Pesan galat itu **mencetak
potongan sandi ke log**, dan repo ini publik. GitHub me-mask nilai secret yang
*persis sama*, tetapi potongan hasil parsing yang keliru bukan nilai yang sama —
jadi lolos dari mask.

**Tindakan.** Run beserta log-nya dihapus (terverifikasi HTTP 404). Pemilik
memutuskan **tidak** mengganti sandi setelah menimbang risikonya.

**Perbaikan permanen.** Kedua workflow kini:

1. menyusun ulang URL dengan `encodeURIComponent` pada bagian user & sandi —
   diuji terhadap sandi ber-`@`, `:`, `/`, `?`, `#`;
2. mendaftarkan URL hasil susunan lewat `::add-mask::`;
3. **membungkam stderr** `pg_dump`/`psql`. Biasanya praktik buruk — di sini
   kebalikannya: yang hilang cuma teks galat yang bisa didiagnosis ulang dari
   kode keluar, sedangkan yang dicegah adalah kebocoran permanen di repo publik.

**Pelajaran yang berlaku ke depan:** di repo publik, **pesan galat adalah
permukaan kebocoran.** Perkakas yang menerima kredensial lewat URL harus
dianggap bocor sampai terbukti dibungkam.

---

## 6b. Cadangan harian terenkripsi (pengganti PITR paket free)

Paket Supabase **free tidak punya Point-in-Time Recovery**. Cadangan bawaannya
harian: kalau data rusak jam 3 sore, titik pemulihan terdekat adalah tengah
malam — **pekerjaan sehari hilang**.

Workflow **`Cadangan Harian (terenkripsi)`** menutup sebagian risiko itu: dump
harian, dikunci AES-256, disimpan sebagai artifact 30 hari. Ia memberi salinan
kedua yang hidup **di luar akun Supabase** — menutup risiko yang tak ditutup
cadangan penyedia mana pun: kalau yang hilang justru *akses ke akunnya*.

> ⚠️ **Ia TIDAK menggantikan PITR.** Kehilangan maksimalnya tetap ~1 hari.

### Prasyarat: secret `SANDI_CADANGAN`

Workflow **menolak berjalan** tanpa ini — cadangan tak terenkripsi di repo
publik lebih berbahaya daripada tidak ada cadangan, karena ia terasa seperti
keamanan padahal justru kebocoran.

```bash
# 1. Buat sandi acak
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# 2. GitHub → Settings → Secrets and variables → Actions → New secret
#    Nama: SANDI_CADANGAN
# 3. SIMPAN JUGA DI PASSWORD MANAGER.
```

> ⚠️ Tanpa sandi itu, cadangan **tidak bisa dibuka selamanya**. Tak ada
> pemulihan sandi — itulah gunanya enkripsi.

### Membuka cadangan

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in puraloka-YYYY-MM-DD.dump.enc -out puraloka.dump
```

### 🔴 Tripwire — naikkan ke PITR sebelum pelanggan pertama

Keputusan pemilik 2026-08-03: cadangan harian **cukup untuk sekarang** karena
belum ada pelanggan dan isinya data percobaan.

**Begitu ada data pelanggan sungguhan, ini tidak lagi memadai.** Kehilangan
sehari kerja milik orang lain bukan hal yang bisa diminta maaf. Naikkan ke
paket Pro dan aktifkan PITR **sebelum** pelanggan pertama masuk, bukan sesudah.

---

## 6c. 🔴 SEKARANG: `pg_dump` mati, cadangan lewat jalur darurat

**R-006 aktif.** `pg_dump` tidak bisa dipakai di database produksi — satu
fungsi yatim menunjuk schema terhapus, dan lima varian `pg_dump` gagal identik.
Hanya Supabase Support yang bisa membersihkannya.

Selama itu belum beres, cadangan berjalan lewat **jalur darurat berbasis
`COPY`**, yang tak menyentuh katalog rusak itu:

```bash
node scripts/db/cadangan-darurat.mjs      # lokal, READ-ONLY
```

Di CI ia berjalan otomatis (`if: failure()`) begitu `pg_dump` gagal.
**Terbukti bekerja** — run 30841608809:

```
123 tabel · 48.426 baris · 43,6 dtk
terbukti bisa dibuka kembali — 123 tabel di dalamnya
```

### Apa yang tercakup, dan apa yang tidak

| | |
|---|---|
| ✅ seluruh **isi** tiap tabel (CSV) | dari `COPY` |
| ✅ urutan muat sesuai ketergantungan FK | di `MANIFES.json` |
| ❌ struktur, index, RLS, policy, trigger | **dipulihkan dari `db/migrations/`** |

Yang tak tercakup **bukan kehilangan permanen**: seluruh struktur hidup di
178 berkas migrasi bernomor di git. Justru itu gunanya migrasi disimpan
sebagai berkas, bukan sekadar dijalankan sekali.

### Memulihkan dari cadangan darurat

```bash
# 1. buka arsipnya
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in darurat-YYYY-MM-DD.tar.gz.enc -out darurat.tar.gz
tar -xzf darurat.tar.gz

# 2. bangun STRUKTUR dari migrasi (bukan dari cadangan)
#    jalankan db/migrations/*.sql berurutan ke database kosong

# 3. muat DATA mengikuti urutan `urutan` menaik di MANIFES.json
#    \copy <tabel> FROM '<tabel>.csv' WITH CSV HEADER
```

> ⚠️ Jalur ini **lebih lambat dan lebih manual** daripada `pg_restore`. Ia
> jaring pengaman, bukan pengganti. **Jangan biarkan keberadaannya jadi alasan
> menunda R-006.**

---

## 7. Yang BELUM terbukti — jujur

| Hal | Status |
|---|---|
| Dump + restore + verifikasi otomatis | ✅ terbukti lewat DR drill (CI) |
| Restore ke **project Supabase baru** | ❌ **belum pernah dicoba** |
| PITR sungguhan | ❌ **belum pernah dicoba** |

Dua yang terakhir butuh kredensial dan tindakan pemilik akun — keduanya
menyentuh dasbor berbayar dan membuat sumber daya baru. **Sampai keduanya
pernah dijalankan sungguhan, anggap keduanya belum terbukti**, dan jangan
mencantumkan RTO untuk keduanya.
