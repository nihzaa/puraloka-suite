# RATIFIKASI — Satu-satunya Berkas yang Perlu Dibaca Founder

**Cara membaca:** tiap entri adalah keputusan yang sudah diambil dan/atau sudah
dijalankan. **Diam berarti setuju.** Untuk membatalkan, tulis `TOLAK` + alasan di
bawah entrinya.

---

# 🚨 BUTUH TINDAKAN ANDA — dua hal yang tidak bisa saya kerjakan

Keduanya di luar jangkauan kode. Selama belum beres, **tidak ada verifikasi
otomatis apa pun yang berjalan di repo ini** — semua yang saya laporkan hijau
berasal dari run lokal, bukan CI.

## ⛔ B-1 · GitHub Actions tidak menjalankan job sama sekali

**Gejalanya:** setiap workflow run gagal, termasuk push ke `main`. Bukan kode yang
salah — job-nya **tidak pernah mulai**:

| Bukti | Nilai |
|---|---|
| Durasi job | 3–12 detik (terlalu cepat untuk pekerjaan nyata) |
| Langkah yang berjalan | **0** (`steps: []`) |
| Runner yang ditugaskan | **kosong** (`runner_name: ""`) |
| Berkas log | **22 byte** — zip kosong |

Ini pola khas **kuota / spending limit GitHub Actions habis** pada repo privat.

**Yang perlu Anda lakukan:** buka
`github.com/settings/billing` → cek sisa menit Actions & spending limit.
Kalau habis, naikkan limit atau tunggu siklus tagihan berikutnya.

**Dampak selama belum beres:** 14 penjaga arsitektural (gerbang tenancy, kegagalan
senyap, catch senyap, tabrakan definisi tabel, ratchet coverage, …) **tidak
menjaga apa pun**. Saya menjalankannya manual tiap sesi dan menempel hasilnya,
tapi itu bergantung pada saya ingat — bukan mekanisme.

## ⛔ B-2 · Branch protection tidak tersedia di paket ini

Anda meminta saya "verifikasi status check benar-benar wajib". **Tidak bisa** —
dan alasannya penting:

```
gh api repos/nihzaa/puraloka-suite/branches/main/protection
→ 403: "Upgrade to GitHub Pro or make this repository public"
```

Sama untuk `rulesets`. Repo **privat** pada paket GitHub Free **tidak mendukung**
branch protection maupun rulesets.

Terbukti akibatnya: PR #133 berstatus `mergeStateStatus: UNSTABLE` (check gagal)
tetapi tetap `mergeable: MERGEABLE`. **Tidak ada yang mencegah merge dengan CI merah.**

**Pilihan Anda — ketiganya sah, ini keputusan produk bukan teknis:**

| Opsi | Konsekuensi |
|---|---|
| **A. GitHub Pro** (~$4/bln) | Branch protection aktif; repo tetap privat. Paling langsung. |
| **B. Jadikan repo publik** | Branch protection gratis, tapi seluruh kode & histori terbuka. Untuk produk yang akan dijual, ini keputusan besar. |
| **C. Terima tanpa gerbang** | Disiplin bergantung pada kebiasaan, bukan mekanisme. Untuk sistem yang akan memegang uang pelanggan, saya tidak menyarankannya. |

Sampai Anda memilih, saya memperlakukan "CI hijau" sebagai **belum terverifikasi**
dan tidak akan mengklaimnya.

---

# ✅ SUDAH DIJALANKAN — tinggal dikonfirmasi

## R-001 · P0 · SELESAI (opsi A + ketiga syarat)

**Migrasi 047 dipensiunkan** menjadi no-op berkomentar. Berkasnya sengaja tidak
dihapus — nomor 047 sudah tercatat di buku migrasi, menghapusnya membuat buku
menunjuk ke sesuatu yang tak ada.

**Syarat 1 — periksa DB CI lebih dulu.** Dibuat `ci-periksa-bentuk-gl.mjs`
(read-only, verdict A/B/C) + action `periksa-gl` di `ci-isolation.yml`.
**Belum bisa dijalankan** karena B-1. Maka fallback yang Anda tetapkan berlaku:
**reset CI dari nol setelahnya** (`-f action=setup-clean`), begitu Actions hidup.

**Syarat 2 — migrasi penegas bentuk.** `175_gl_penegas_bentuk.sql`: gagal keras
bila `accounts` tanpa `company_id` atau masih punya `account_type`. Sengaja
**tidak menambal sendiri** — bila tabel sudah berisi baris dua perusahaan, tidak
ada cara mekanis memisahkannya (ADR-011).

Membangunnya menemukan **tiga cacat pada penegas itu sendiri**, semuanya ketahuan
karena diuji, bukan karena dibaca ulang:
1. Terlalu ketat — menuntut `company_id` di `journal_entry_lines`, padahal 167
   sengaja memberinya tenancy lewat induk. Penjaga yang salah melatih orang
   mengabaikan kegagalannya.
2. Buta schema — `to_regclass('public.…')` selalu memeriksa `public`. Uji negatif
   membuktikan ia **lolos** padahal bentuknya 047.
3. Pesan galat rusak (`malformed array literal`) sehingga diagnosisnya tertutup.

Uji akhir: positif (dev) LULUS · negatif (bentuk 047 di schema sementara) MENOLAK.

**Syarat 3 — sapu seluruh 171 migrasi.** `audit-tabrakan-definisi-tabel.mjs`
menemukan **13 tabel bertabrakan**. Kabar baiknya: **047↔167 satu-satunya yang
tak terjaga**. Yang lain sudah aman — dan `assets` (045↔149) menarik: repo ini
**sudah pernah** menyelesaikan cacat yang sama persis, lengkap dengan komentarnya.
Perbaikan R-001 mengikuti preseden itu.

Penjaga baru terpasang di CI: `CREATE TABLE IF NOT EXISTS` pada tabel yang punya
lebih dari satu pendefinisi wajib disertai penegas bentuk.

**Cara membatalkan:** `git revert` — hanya menyentuh berkas migrasi & skrip.
Belum ada data produksi, biaya pembatalan **nol**.

## R-003 · Rebase diterima; TIDAK merge ke main sebelum R-001 tuntas

Dipatuhi. Urutan yang Anda tetapkan (perbaiki pemicu CI → R-001 → baru merge)
diikuti. Rantai PR belum di-merge.

Catatan: langkah "baru merge" **tertahan B-1** — tanpa Actions, merge ke `main`
berarti menggabungkan tanpa verifikasi apa pun.

## R-004 · Penarikan rekomendasi `rekonsiliasi --tulis`

Berlaku. Penggantinya `ledger-diff.mjs` tanpa kemampuan menulis sama sekali.

## R-005 · TERJAWAB — saya salah, Anda benar menyuruh menyapu lebih luas

Sesi lalu saya menyimpulkan ketiga angka "hampir pasti bukan dari Cibuluh" lalu
berhenti. Kesimpulan yang benar: **belum saya cari di berkas lain.**

Disapu ke seluruh `_source/ahsp/`. **Ketiganya ketemu**, di
`Format RAB Control 2026 NOMOR 47_SE_Dk_2026.xlsm`:

| Angka | Lokasi | Makna |
|---|---|---|
| `1.657.839.590,39` | `REKAPITULASI!E15` | **TOTAL BIAYA** proyek (sebelum PPN) |
| `109,5` | `LAPORAN RAB!H114` | **volume m²** bata merah ½ batu |
| `7875` | `DINDING BATA MERAH!L41` | **jumlah buah** bata merah |

Terverifikasi silang: `109,5 × 146.308,162 = 16.020.743,74` ✅

**Kenapa berbeda dari Cibuluh:** dua proyek yang berbeda. Cibuluh = RAB gudang
nyata (Rp 3,63 M, 9 divisi). RAB Control = Engineering Estimate template SE-47
(Rp 1,66 M, 8 divisi). Bukan beda edisi, bukan subtotal-vs-total, bukan PPN.

**Temuan sampingan yang berguna:** baris PPN di dokumen itu berlabel **"PPN 11%"**
tapi pengalinya **0,12**, dan hasilnya cocok. Jadi model dua-angka yang dipakai
sistem memang **berasal dari praktik dokumen nyata** — bukan karangan.

Assertion belum ditambahkan (butuh harness `.xlsm` 117 sheet) → antrean F0-10.

## R-006 · `companies.ts` masuk gerbang Fase 1

Perintah Anda dilaksanakan: `F1-8` di `QUEUE.yaml`. **Fase 2 tidak dimulai
sebelum `companies.ts` punya coverage nyata**, termasuk uji 403 lintas-tenant.

---

# ⏸️ MENUNGGU — R-002

## R-002 · Catat 12 migrasi ke buku, HANYA yang terbukti fisik

Anda setujui, **setelah R-001**. Belum saya jalankan karena R-001 baru tuntas di
sisi kode — bagian CI-nya (`periksa-gl` → mungkin `setup-clean`) masih tertahan B-1.

Mencatat 167 sebagai "sudah jalan" sebelum lingkungan CI dipastikan bersih justru
mengunci cacat P0 yang baru saja diperbaiki. Urutan Anda benar; saya menunggu.
