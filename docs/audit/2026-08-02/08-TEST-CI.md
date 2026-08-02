# 08 — TEST, CI, DX

## 8.1 Hasil run sesungguhnya

Perintah: `npx vitest run` di `apps/api`, 2026-08-02.

```
 Test Files  1 failed | 128 passed (129)
      Tests  1276 passed | 24 skipped (1300)
   Start at  22:16:47
   Duration  213.92s (transform 966ms, collect 7.30s, tests 186.36s, prepare 8.11s)
```

**1276 lulus, 24 di-skip, 1 suite gagal, 213,9 detik.**

### Satu-satunya kegagalan

```
FAIL src/routes/v1/__tests__/multitenant-t3-rollback.test.ts
error: relation "assembly_components" does not exist
  ❯ bootstrap …/multitenant-t3-rollback.test.ts:81:3
```

> ## ⚠️ KOREKSI 2026-08-02 (Fase 0, F0-4) — analisis di bawah ini SALAH
>
> Laporan ini menyimpulkan "cacat urutan bootstrap harness". **Itu hipotesis yang
> ditulis sebagai kesimpulan, dan setelah diukur ternyata salah.**
>
> Bukti:
> - Dijalankan sendirian, suite ini **LULUS 23/23, tiga kali berturut-turut** →
>   `bootstrap()` memang membentuk `assembly_components` dengan benar.
> - Suite penuh dijalankan ulang: **129/129 berkas, 1299 lulus, 0 gagal, 217,4 s**.
>   Kegagalannya **tidak reproduksi**.
> - Akar sebenarnya sudah terdokumentasi di `apps/api/src/test-utils/test-db.ts`:
>   27 berkas test berbagi satu schema `test`, dan `resetTestSchema()` menjalankan
>   `DROP SCHEMA … CASCADE` yang butuh ACCESS EXCLUSIVE lock. Koneksi berkas
>   sebelumnya kadang belum lepas (pooler session-mode menutup asinkron) → DROP
>   menunggu → hook timeout menembak duluan. Komentar di kode menyebutnya
>   "intermiten, ~30-50% run penuh".
>
> Jadi ini **flake infrastruktur test yang sudah dikenal**. Verdict "bukan cacat
> produksi" kebetulan benar, tetapi lewat alasan yang berbeda — dan kebetulan-benar
> adalah kegagalan metode, bukan keberhasilan.
>
> Status: `F0-4` **tidak ditutup**. Kriteria diperketat: suite penuh harus lulus
> **3 run berturut-turut** + isolasi schema per-berkas. Lihat `QUEUE.yaml` F0-4.

### Angka "24 skipped" juga menyesatkan

Run kedua menghasilkan **1 skipped**, bukan 24. Selisih 23 adalah test milik berkas
yang gagal — dihitung "skipped" karena berkasnya tak jadi berjalan, bukan karena
sengaja di-skip. Yang benar-benar di-skip secara sengaja hanya **1**
(`golden-cibuluh`, pasangan `describe.skipIf` yang memang mati saat berkas golden ada).

### Test jangkar angka — dijalankan terpisah, LULUS

```
✓ src/lib/ahsp-engine.test.ts (10 tests) 3ms
✓ src/lib/__tests__/golden-cibuluh.test.ts (6 tests | 1 skipped) 5ms
 Test Files  2 passed (2)
      Tests  15 passed | 1 skipped (16)
   Duration  938ms
```

## 8.2 Cakupan

- **211 file test** total; **81** di `routes/v1/__tests__`.
- **12 file** menguji jalur **403** eksplisit.
- Ada test untuk area yang biasanya tak diuji siapa pun:
  `trigger-yatim.test.ts` (trigger yang menggantung), `tak-ada-test-nol.test.ts`
  (menolak test yang tak meng-assert apa pun), `created-at-immutable.test.ts`,
  `rls-initplan.test.ts` (performa policy), `t5b-kill-switch.test.ts`,
  `alur-uang-kas.test.ts` / `alur-uang-mandor.test.ts` / `alur-uang-pembayaran.test.ts`.

**Coverage numerik per area: `BELUM DIVERIFIKASI`** — `--coverage` tidak dijalankan
(durasi suite sudah 3,5 menit; menambah instrumentasi berisiko melewati batas sesi).

## 8.3 Test yang di-skip

Brief menyebut "2 test sengaja di-skip"; kenyataannya **24 test skipped**. Yang
teridentifikasi:

| Lokasi | Mekanisme | Alasan | Masih valid? |
|---|---|---|---|
| `golden-cibuluh.test.ts:58` | `describe.skipIf(!ada)` | lewati bila berkas XLSX absen | **Tidak aktif** — berkasnya ADA, jadi test ini **berjalan** |
| `golden-cibuluh.test.ts:117` | `describe.skipIf(ada)` | pasangan kebalikannya | Ya — sengaja mati saat berkas ada |
| `search-tenant-isolation.test.ts:153` | komentar | "tanpa `.skip` menunjukkan 4 dari 5 LULUS" | Perlu ditinjau — `[FIX-LATER]` |

Sisanya (`~21`) **BELUM DIVERIFIKASI** satu per satu.

## 8.4 CI — jauh di atas rata-rata

`.github/workflows/`: `ci.yml`, `ci-isolation.yml`, `ci-keepalive.yml`.

`ci.yml` menjalankan, selain lint/typecheck/test/build, **penjaga arsitektural khusus**:

| Langkah | Skrip | Yang dijaga |
|---|---|---|
| Lint ratchet | `pnpm lint:ratchet` | nol error; warning **tak boleh bertambah** |
| Gerbang tenancy | `audit-gerbang-tenancy.mjs` | rute tanpa saringan tenant tak boleh bertambah |
| Kegagalan senyap | `audit-kegagalan-senyap.mjs` | query yang errornya tak pernah dilihat |
| Penulisan senyap | `audit-tulis-tanpa-periksa.mjs` | update/delete/insert tanpa cek hasil |
| Catch senyap | `audit-catch-senyap.mjs` | error ditelan tanpa jejak |
| Migrasi sadar-schema | `audit-migrasi-skema-dipaku.mjs` | skema tak boleh dipaku |
| Rancangan sub-menu | `audit-rancangan-submenu.mjs` | sub-menu berisiko wajib punya rancangan |
| Indeks dokumen | `gen-indeks-docs.mjs --check` | indeks docs wajib mutakhir |

Ini adalah **ratchet anti-regresi kelas industri**. Sangat sedikit codebase seukuran ini
punya penjaga "kegagalan senyap" dan "penulisan tanpa periksa" yang dieksekusi CI.

**`BELUM DIVERIFIKASI`:** apakah branch protection benar-benar aktif di GitHub, dan
apakah PR bisa merge dengan CI merah. Butuh akses setting repo.

## 8.5 DX

- `.env.example` **ada** untuk `apps/api` dan `apps/web`. ✅
- `pnpm audit`: 1 moderate, nol high/critical.
- Cold-start dev time: `BELUM DIVERIFIKASI` (tidak menjalankan dev server).
- Kualitas README: **tidak ada `README.md` di root** — hanya `CLAUDE.md`. Untuk repo
  privat satu-pengembang ini wajar, tapi menjadi hambatan saat developer kedua masuk.
