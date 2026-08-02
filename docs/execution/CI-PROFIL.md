# CI-PROFIL — Durasi Nyata, Diukur Bukan Diperkirakan

**Diukur:** 2026-08-03 · **Run rujukan:** `30762875751` (kelima job hijau)
**Metode:** `gh api …/actions/runs/<id>/jobs` (timestamp per step), `vitest --reporter=json`
(durasi per berkas), dan pengukuran latensi round-trip langsung ke Postgres.

---

## 1. SEBELUM — profil per job

| Job | Durasi | Bagian terbesar |
|---|---:|---|
| **API — lint, typecheck, test, build** | **1317s (21,9 mnt)** | `Test + coverage` **1203s** |
| Web — lint, typecheck, build | 135s | Build 38s · Lint 36s |
| Browser — middleware & gulir virtual | 69s | Uji browser 23s · Pasang Chromium 20s |
| Keamanan — dependency audit + secret scan | 52s | Dependency audit 18s |
| Dokumentasi — tautan tidak boleh rusak | 5s | — |

**Wall-clock = 21,9 menit**, ditentukan sepenuhnya oleh job API.

Rincian step job API:

| Step | Durasi | % dari job |
|---|---:|---:|
| **Test + coverage** | **1203s** | **91,3%** |
| Prepare CI project (migrasi + seed) | 36s | 2,7% |
| Typecheck | 18s | 1,4% |
| Build | 18s | 1,4% |
| Install dependencies | 14s | 1,1% |
| Setup node | 9s | 0,7% |
| Lint ratchet | 5s | 0,4% |

**Kesimpulan langkah 1:** semua target optimasi selain test suite bernilai
gabungan **< 2 menit**. Cache dependensi, `tsbuildinfo` inkremental, dan filter
path — semuanya benar secara prinsip — tak akan menggeser angka 21,9 menit secara
berarti. **91% masalahnya ada di satu step.**

---

## 2. Hipotesis mandat: DIUJI, lalu GUGUR

Mandat menduga: *"flake lock `DROP SCHEMA` menandakan schema dibongkar-pasang per
berkas"*, dan menyarankan template database / transaksi-rollback.

### Bukti yang menggugurkannya

**a. Overhead setup/teardown ≈ NOL.** Dari `vitest --reporter=json` atas 130 berkas:

```
TOTAL waktu berkas   : 125,6s
  eksekusi assertion : 125,5s  (100%)
  overhead hook      :   0,2s  (0%)
```

**b. DDL schema memang murah** — diukur langsung ke Postgres yang sama:

```
DROP SCHEMA … CASCADE     0,03s
CREATE SCHEMA             0,02s
```

Kalau tiap berkas membayar DDL, 130 berkas × 0,05s = **6,5 detik**. Itu 0,5% dari
1203s. Menggantinya dengan template database akan menghemat **detik**, bukan menit.

### Yang SEBENARNYA mahal: latensi round-trip

```
1 round-trip   SELECT 1  →  0,02s
100 round-trip SELECT 1  →  2,12s   (≈21 ms/query)
```

125,6s ÷ 21ms ≈ **~6.000 query round-trip** dalam satu suite. Test di repo ini
adalah **integration test terhadap Postgres nyata** (keputusan sadar, tercatat di
`vitest.config.ts`) — jadi jumlah query itu wajar. Yang tak wajar adalah **jarak**.

### Kenapa CI 10× lebih lambat dari lokal

| | Lokal | CI |
|---|---|---|
| Durasi suite | ~230s | **1203s** |
| Region DB | `ap-southeast-1` (Singapura) | **`ap-northeast-1` (Tokyo)** |
| Lokasi klien | Indonesia | **runner GitHub (US-East)** |

**Setiap dari ~6.000 round-trip di CI menyeberangi Pasifik.** Itulah faktor 10×.

**Ini temuan terpenting profil ini**, dan tak satu pun butir di rencana mandat
(cache, tsbuildinfo, filter path, template DB) menyentuhnya.

---

## 3. Konsekuensi terhadap rencana

Empat butir mandat tetap dikerjakan karena benar, meski dampaknya kecil:

| Butir | Dampak terukur | Tetap dikerjakan? |
|---|---|---|
| 2.1 `cancel-in-progress` | tak mengurangi durasi satu run, **tapi menghapus antrean menumpuk** — dan itu persis keluhan "terlalu sering" | **YA — prioritas 1** |
| 2.4 Cache pnpm + tsbuildinfo | hemat ≤ 20s dari 1317s | ya, murah |
| 2.5 Filter path | job Web/Browser (204s) dilewati saat hanya API berubah | ya, dengan pengecualian keras |
| 2.3 Shard matrix | **membagi 1203s jadi ~4×300s** — satu-satunya butir yang menyentuh 91% | **YA — prioritas 2** |
| 2.2 Template database | hemat ~6,5s (0,5%) | **TIDAK** — biaya kompleksitas > manfaat |

Dan satu butir yang **tidak ada di mandat** tetapi berdampak terbesar:

| Butir baru | Dampak |
|---|---|
| **Pindahkan project CI Supabase ke region dekat runner** (mis. `us-east-1`) | berpotensi memangkas 1203s → ~250s **tanpa mengubah satu baris test pun** |

Itu perubahan infrastruktur di luar repo (butuh tindakan founder di dashboard
Supabase), jadi dicatat di `RATIFIKASI.md`, bukan dikerjakan diam-diam.

---

## 4. Catatan tentang F0-4 (flake `DROP SCHEMA`)

Mandat menyebut butir 2.2 "sekaligus menutup F0-4". F0-4 **sudah ditutup lebih
dulu**, dengan kesimpulan yang konsisten dengan profil ini: DDL bukan sumber
kelambatan, dan flake lock-nya sudah dimitigasi `lock_timeout 10s` + 3 retry di
`test-db.ts` (diuji stres 45/45 dua putaran, plus 5 run suite penuh berturut hijau).

Profil ini memperkuatnya dari sisi angka: DDL schema = 0,05s/berkas. Membangun
mekanisme template database untuk menghemat 6,5 detik, pada suite yang menghabiskan
1203 detik menunggu jaringan, adalah optimasi yang salah sasaran.

---

## 5. SESUDAH — hasil terukur

### 5.1 Sharding: BERHASIL secara durasi, DITAHAN karena isolasi

Shard 4× dijalankan sungguhan (run `30764532516`):

| Job | Durasi | Hasil |
|---|---:|---|
| API — test (shard 1) | 376s | **gagal** |
| API — test (shard 2) | 434s | hijau |
| API — test (shard 3) | 264s | hijau |
| API — test (shard 4) | 396s | hijau |

**Wall-clock 1317s → 434s (3× lebih cepat).** Target ≤8 menit **tercapai**.

Tetapi shard 1 gagal, dan penyebabnya bukan sharding:

```
error 23502 — projects.company_id NOT NULL dilanggar
  di lessons-writeback.test.ts
```

`fn_isi_company_id()` (migrasi 127) mengisi `company_id` otomatis **hanya bila
`companies` berisi tepat satu baris**; saat ambigu ia menolak menebak. Itu
perilaku yang **benar** dan sengaja.

Yang salah ada di test: **46 berkas memakai `createRlsClient` → schema `public`
BERSAMA**, dan 9 di antaranya membuat company tambahan, tersebar di keempat shard:

| Shard | Berkas pembuat company |
|---|---|
| 1 | `t10-peran-per-company`, `t6-penomoran-per-company`, `tenant-isolation-nyata` |
| 2 | `t5b-kill-switch` |
| 3 | `search-tenant-isolation`, `submittal-aturan`, `t7-menu-per-company`, `t9-kelola-badan-usaha` |
| 4 | `t7-company-switcher` |

Berurutan mereka tak pernah bertabrakan — tiap berkas membersihkan miliknya.
**Paralel**, company milik shard lain terlihat di tengah jalan → trigger melihat
>1 company → menolak mengisi → NOT NULL menolak.

**Keputusan: shard ditahan di 1.** Menaikkannya sekarang berarti CI merah acak
yang gejalanya tampak seperti "test flaky". Dan memperbaikinya dengan
melonggarkan `fn_isi_company_id()` berarti melemahkan penjaga tenancy **tepat
sebelum Fase 2** — Gerbang Keras G-5.

Struktur matrix dipertahankan; menaikkannya kembali cukup perubahan kecil setelah
**F0-14** (memindahkan 46 berkas dari `public` ke schema terisolasi).

### 5.2 Yang tetap terpasang dan berdampak

| Perubahan | Dampak |
|---|---|
| `concurrency` per-ref + `cancel-in-progress` | **Antrean menumpuk hilang.** Sebelumnya seluruh branch antre di satu barisan konstan — terukur satu run tertahan `pending` belasan menit menunggu run usang. Inilah sumber keluhan "terlalu sering". |
| Job `coverage` terpisah (`needs: api`) | Ratchet dinilai atas gabungan shard, bukan per-shard. Siap dipakai begitu shard dinaikkan. |
| `gabung-coverage.mjs` | Terverifikasi: statements gabungan **6794/21241 identik** dengan run tak ter-shard. |
| Penjaga literal peran API (ADR-004) | Menutup lubang yang lolos 14 penjaga lain. |

### 5.3 Perbaikan akar yang belum dikerjakan

Latensi lintas-Pasifik (§2) tetap penyebab terbesar. Memindahkan project CI
Supabase ke region dekat runner berpotensi memangkas 1203s → ~250s **tanpa
menyentuh satu baris test pun** — lebih besar dari seluruh hasil sharding, dan
tanpa risiko isolasi. Di luar repo → `RATIFIKASI.md` **B-3**.
