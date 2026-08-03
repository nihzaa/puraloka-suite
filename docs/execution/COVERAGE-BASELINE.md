# Coverage Baseline — Angka Sesungguhnya (C-6)

**Diukur:** 2026-08-02 · **Cara:** `npx vitest run --coverage --coverage.include='src/**/*.ts'`
**Suite:** 129 berkas, 1299 test lulus, 1 skipped, 221,4 detik.

## 1. Angka

| Metrik | Nilai |
|---|---:|
| Statements | **31,98%** (6.794 / 21.241) |
| Branches | **68,49%** (1.735 / 2.533) |
| Functions | **81,96%** (259 / 316) |
| Lines | **31,98%** (6.794 / 21.241) |

Audit 2026-08-02 memberi skor Testing **80** tanpa mengukur ini sama sekali —
skor yang tidak dibayar (cacat C-6). Sekarang dibayar.

## 2. Kenapa 31,98% BUKAN berarti test-nya buruk

Dua hal harus dipisahkan supaya angka ini tidak disalahbaca:

1. **Gate lama memang sengaja sempit.** `vitest.config.ts` membatasi coverage gate
   ke `src/lib/**` (pure function finansial) dengan ambang 90% — keputusan sadar
   yang terdokumentasi, merujuk `Phase1/06-test-strategy.md § Realisme Target
   Coverage 90%`. Yang belum pernah terukur adalah `src/routes/**` dan `src/utils/**`.
2. **Branches 68% jauh di atas Lines 32%.** Pola ini khas integration test: jalur
   utama tereksekusi, tetapi banyak berkas route tidak tersentuh sama sekali.
   Functions 82% memperkuatnya — fungsi yang diuji, diuji cukup dalam.

Jadi masalahnya bukan kedalaman, melainkan **sebaran**.

## 3. Yang benar-benar mengkhawatirkan: 27 route file ber-coverage NOL

| Route tanpa coverage sama sekali |
|---|
| `assets.ts`, `audit.ts`, `bids.ts`, `clients.ts`, `companies.ts`, `contracts.ts`, `cost-control.ts`, `dashboard.ts`, `documents.ts`, `inspeksi.ts`, `kasbon-purposes.ts`, `menu.ts`, `milestones.ts`, `modules.ts`, `notifications.ts`, `punch-list.ts`, `rab-schedule.ts`, `rab.ts`, `rantai-kontrak.ts`, `rfi.ts`, `submittal.ts`, `termin-payment.ts`, `units.ts`, `users.ts`, `wip.ts`, `work-categories.ts` |

Plus `src/index.ts` (bootstrap Fastify) dan dua util (`rantai-kontrak.ts`, `terbilang.ts`).

**Yang paling penting dari daftar itu**, mengingat RLS di-bypass API (service_role)
sehingga preHandler adalah pertahanan efektif:

- **`users.ts`** — manajemen pengguna & peran. Nol coverage.
- **`notifications.ts`** — jalur aksi interaktif (approve/reject kasbon). Nol coverage.
- **`documents.ts`** — filter dokumen per peran & visibilitas klien. Nol coverage.
- **`audit.ts`** — pembacaan jejak audit (admin only). Nol coverage.
- **`companies.ts`** — pengelolaan badan usaha, **inti multi-tenant**. Nol coverage.

Catatan penting supaya tidak menakut-nakuti secara salah: nol coverage **bukan**
berarti nol pengujian perilaku. Banyak aturan otorisasi diuji lewat
`authz-endpoints.test.ts` dan berkas RLS yang memanggil DB langsung, bukan lewat
handler route. Tetapi jalur **handler**-nya sendiri memang tidak pernah dieksekusi
dalam pengukuran ini.

## 4. Coverage < 20% (tersentuh, tapi tipis)

`cash.ts` 13,9% · `kasbons.ts` 11,8% · `mandor.ts` 8,3% · `projects.ts` 12,5% ·
`reports.ts` 16,3% · `utils/config.ts` 17,0% · `utils/email.ts` 2,6% ·
`utils/kasbon-limit.ts` 5,3% · `utils/penalty.ts` 4,2% · `utils/user-role.ts` 9,1%

`penalty.ts` (4,2%) dan `kasbon-limit.ts` (5,3%) menonjol: keduanya **jalur uang**.

## 5. Mekanisme: ratchet, bukan target

`apps/api/scripts/coverage-ratchet.mjs` + `coverage-lantai.json`.

**Angka hari ini menjadi lantai. Boleh naik, tidak boleh turun.**

Menetapkan target aspirasional (mis. 80%) akan membuat CI merah sejak hari pertama
dan mendorong orang mematikan gate-nya — kegagalan yang lebih buruk daripada tidak
punya gate sama sekali.

Dua perlindungan yang dibangun setelah menemukan cacatnya sendiri:

- **Toleransi 0,5%** — v8 bergoyang antar-run (terbukti: branches 68,49 → 68,48).
  Tanpa toleransi, penjaga jadi cerewet dan kehilangan wibawa.
- **Penjaga apel-vs-jeruk** — ratchet MENOLAK membandingkan bila ringkasan berasal
  dari sebagian test saja. Ditemukan lewat percobaan: run `src/lib` saja
  menghasilkan statements 8,57% terhadap lantai 31,98% — vonis "TURUN" yang palsu.
  Sidik cakupan yang dipakai adalah **jumlah baris tereksekusi** (1.821 vs 6.794),
  bukan jumlah berkas, karena v8 tetap mendaftar semua berkas yang di-`include`
  walau nol tercakup.

## 6. Menaikkan lantai

```bash
npx vitest run --coverage --coverage.include='src/**/*.ts' \
  --coverage.exclude='src/**/*.test.ts' --coverage.exclude='src/**/__tests__/**' \
  --coverage.reporter=json-summary --coverage.reportsDirectory=./coverage
node scripts/coverage-ratchet.mjs --naikkan
```

Menurunkan lantai **tidak disediakan sebagai perintah**. Kalau coverage turun,
yang benar adalah menambah test.

## 7. Bukti run

```
 Test Files  129 passed (129)
      Tests  1299 passed | 1 skipped (1300)
   Duration  221.36s

Statements   : 31.98% ( 6794/21241 )
Branches     : 68.49% ( 1735/2533 )
Functions    : 81.96% ( 259/316 )
Lines        : 31.98% ( 6794/21241 )
```

Ratchet terhadap lantai: **✅ tidak ada metrik yang turun** (exit 0).
