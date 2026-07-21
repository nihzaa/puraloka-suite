# Implementation Kickoff — 03. Folder and Module Order

**Tujuan:** Urutan presisi folder/modul/helper/lib yang dibuat atau disentuh selama Sub-Fase 1A, sehingga tidak ada pertanyaan "file mana duluan" saat coding dimulai.
**Sumber:** [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md) (struktur `lib/`), [Phase1/02-target-architecture.md](../Phase1/02-target-architecture.md) (struktur `utils/`), ground-truth struktur folder `apps/api/src/` per 18 Juli 2026.

---

## Struktur `apps/api/src/` Saat Ini (Ground Truth, Bukan Asumsi)

```
apps/api/src/
├── plugins/       ← ADA (auth.ts di sini)
├── routes/        ← ADA (v1/*.ts, 20+ file)
├── services/       ← ADA (sudah ada — TIDAK perlu dibuat baru)
├── types/          ← ADA (sudah ada — TIDAK perlu dibuat baru)
├── utils/          ← ADA (supabase.ts, notifications.ts, webpush.ts, terbilang.ts)
└── index.ts
```

**Koreksi penting terhadap asumsi implisit di beberapa dokumen Phase1:** `services/` dan `types/` **sudah ada** di repo — dikonfirmasi via pengecekan langsung (`test -d apps/api/src/services && apps/api/src/types`). Tidak ada dokumen Phase1 yang secara eksplisit mengklaim keduanya tidak ada, tapi penting dicatat di sini karena Sub-Fase 1A **tidak perlu** membuat folder ini — hanya `lib/` yang baru.

**Folder yang BELUM ada dan akan dibuat di Sub-Fase 1A:**
- `apps/api/src/lib/` (baru — 1A.4)
- `apps/api/src/lib/__tests__/` (baru — 1A.4)
- `apps/api/src/routes/v1/__tests__/` (baru — 1A.4)
- `.github/workflows/` (baru — 1A.5)

---

## Urutan Implementasi Folder/File — Sub-Fase 1A

Urutan ini mengikuti urutan eksekusi di [02-phase-1a-sequence.md](02-phase-1a-sequence.md) (1A.4 → 1A.5 → 1A.1 → 1A.2 → 1A.3 paralel), diterjemahkan ke unit file konkret.

### Tahap 1 — Fondasi Test (1A.4)

| Urutan | Path | Aksi | Alasan Urutan |
|---|---|---|---|
| 1 | `apps/api/package.json` | Tambah dependency `vitest` + `@vitest/coverage-v8` | Prasyarat semua yang di bawah |
| 2 | `apps/api/vitest.config.ts` | Buat baru | Konfigurasi test runner sebelum ada test untuk dijalankan |
| 3 | `apps/api/src/lib/tax-calculation.ts` | Ekstrak dari `termin-payment.ts:175` | Prioritas tertinggi per [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md#unit-test--target-90-pure-function) — formula sederhana, risiko legal/klien tinggi |
| 4 | `apps/api/src/lib/__tests__/tax-calculation.test.ts` | Buat baru | Test langsung menyertai ekstraksi, bukan menyusul |
| 5 | `apps/api/src/lib/evm-calculation.ts` | Ekstrak dari `kurva-s.ts` | Prioritas kedua |
| 6 | `apps/api/src/lib/__tests__/evm-calculation.test.ts` | Buat baru | |
| 7 | `apps/api/src/lib/rab-aggregation.ts` | Ekstrak dari `rab.ts` + `progress.ts` | Prioritas ketiga |
| 8 | `apps/api/src/lib/__tests__/rab-aggregation.test.ts` | Buat baru | |
| 9 | `apps/api/src/lib/retention-calculation.ts` | Ekstrak dari `termin-payment.ts` + `finance.ts` | Prioritas keempat (trigger DB, butuh integration test tambahan) |
| 10 | `apps/api/src/lib/__tests__/retention-calculation.test.ts` | Buat baru | |
| 11 | Verifikasi test database terisolasi (`supabase start` atau schema terpisah) | Konfigurasi | **MUST** sebelum langkah 12 — [Phase1/06-test-strategy.md:77](../Phase1/06-test-strategy.md) eksplisit "prasyarat keras" |
| 12 | `apps/api/src/routes/v1/__tests__/kasbons.test.ts` | Buat baru | Golden path + approve ganda |
| 13 | `apps/api/src/routes/v1/__tests__/change-orders.test.ts` | Buat baru | Golden path + approve pada CO ter-reject |
| 14 | `apps/api/src/routes/v1/__tests__/procurement.test.ts` | Buat baru | Golden path + over-receipt GR |

### Tahap 2 — Fondasi CI (1A.5, paralel dengan Tahap 1)

| Urutan | Path | Aksi | Alasan Urutan |
|---|---|---|---|
| 1 | `apps/api/.eslintrc.json` (atau `eslint.config.js` sesuai versi ESLint) + script `lint` di `apps/api/package.json` | Buat baru | **Prasyarat tersembunyi** — lihat F2 di [02-phase-1a-sequence.md](02-phase-1a-sequence.md#f2--desain-ci-mengasumsikan-script-lint-yang-tidak-ada-di-appsapi); tanpa ini step lint CI gagal | 
| 2 | `apps/api/package.json` script `test` | Ubah dari tidak-ada menjadi `vitest run` | Prasyarat CI step 3 |
| 3 | `.github/workflows/ci.yml` | Buat baru | Terakhir — butuh lint + test script keduanya siap agar pipeline tidak merah karena tooling hilang, bukan karena kode salah |

### Tahap 3 — Permission Engine (1A.1, setelah Tahap 1 & 2 hijau)

| Urutan | Path | Aksi | Alasan Urutan |
|---|---|---|---|
| 1 | `db/migrations/059_permission_scopes.sql` + copy ke `supabase/migrations/059_permission_scopes.sql` | Buat baru | Additive, nol risiko — lihat [04-database-migration-plan.md](04-database-migration-plan.md) |
| 2 | `apps/api/src/routes/v1/users.ts` | Migrasi 1 authorization-gate inline | Risiko finansial terendah — file pembuktian pola |
| 3 | `apps/api/src/routes/v1/clients.ts` | Migrasi 1 authorization-gate inline | |
| 4 | `apps/api/src/routes/v1/progress.ts` | Migrasi 2 authorization-gate inline (baris 288, 292) | |
| 5 | `apps/api/src/routes/v1/projects.ts` | Migrasi 1 authorization-gate inline (baris 123) | |
| 6 | `apps/api/src/routes/v1/reports.ts` | Migrasi 1 authorization-gate inline (baris 82) | |
| 7 | `apps/api/src/routes/v1/search.ts` | Migrasi 2 authorization-gate inline (baris 21, 154) | |
| 8 | `apps/api/src/routes/v1/mandor.ts` | Migrasi 8 authorization-gate inline (baris 179, 699, 702, 747, 750, 775, 778, 1277) | File terbesar, dikerjakan setelah pola matang di file lebih kecil |
| 9 | `apps/api/src/routes/v1/cash.ts` | Migrasi 2 authorization-gate inline (baris 94, 473) | Risiko finansial tinggi — mendekati akhir |
| 10 | `apps/api/src/routes/v1/finance.ts` | Migrasi 3 authorization-gate inline (baris 273, 1186, 1238) | Risiko finansial tertinggi — terakhir sebelum hapus `requireRole` |
| 11 | `apps/api/src/routes/v1/audit.ts` (baris 10, 59) | Ganti `requireRole` → `requirePermission` | Setelah langkah 2-10 selesai semua |
| 12 | `apps/api/src/routes/v1/reports.ts` (baris 967, 1038) | Ganti `requireRole` → `requirePermission` | |
| 13 | `apps/api/src/plugins/auth.ts` | Hapus fungsi `requireRole` (baris 60-72) | **Terakhir** — hanya setelah grep mengonfirmasi nol pemanggilan tersisa |

**Catatan tentang 36 baris data-scoping:** Baris-baris ini (lihat [Phase1/00-current-state-audit.md § 1.5](../Phase1/00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file)) **tidak dipindah** ke `requirePermission` — mereka mendapat komentar eksplisit menandai jenisnya (`// data scoping, bukan authorization gate`) di file yang sama saat file itu disentuh untuk migrasi authorization-gate-nya (tahap 3 di atas), bukan pekerjaan file terpisah.

### Tahap 4 — RLS Sinkronisasi (1A.2, setelah Tahap 3 selesai)

Urutan file migration SQL — lihat detail lengkap di [04-database-migration-plan.md](04-database-migration-plan.md). Tidak ada file `apps/api/src/` yang berubah di tahap ini kecuali test RLS baru.

| Urutan | Path | Aksi |
|---|---|---|
| 1 | `apps/api/src/lib/__tests__/rls/` (baru) | Folder test RLS — kategori terpisah dari unit/integration test |
| 2-N | `db/migrations/06X_*.sql` | Satu file per tabel/kelompok tabel — lihat [04-database-migration-plan.md](04-database-migration-plan.md) |

### Tahap 5 — Audit Trail Helper (1A.3, paralel kapan saja setelah Tahap 1 dimulai)

| Urutan | Path | Aksi |
|---|---|---|
| 1 | `db/migrations/06X_audit_trail_columns.sql` | 3 kolom nullable baru |
| 2 | `apps/api/src/utils/audit.ts` | Buat baru — `logAuditEvent` helper |
| 3 | `apps/api/src/routes/v1/change-orders.ts:576` | Migrasi ke helper baru |
| 4-9 | 6 route file (instrumentasi `kasbon.status`, `payment.deleted`, `user.role`, `project.status`, `invoice.amount`, `rab_materials.override`) | Satu event per commit |

---

## Prinsip Urutan yang Mengikat Tabel di Atas

1. **Test dan CI selalu mendahului kode berisiko** — tidak ada file di Tahap 3/4 yang boleh disentuh sebelum Tahap 1 & 2 hijau di CI.
2. **Risiko finansial terendah ke tertinggi** dalam satu tahap — `users.ts`/`clients.ts` sebelum `cash.ts`/`finance.ts`, konsisten di Tahap 3 (Permission Engine) dan Tahap 4 (RLS per kelompok tabel).
3. **Satu file/tabel per commit** — bukan batch besar, memungkinkan rollback presisi tanpa mengorbankan pekerjaan lain.
4. **Fungsi lama (`requireRole`) dihapus paling akhir**, bukan di awal — mencegah dua definisi otorisasi berubah bersamaan.

---

*Dokumen selanjutnya: [04 — Database Migration Plan](04-database-migration-plan.md) — penomoran dan urutan migration file presisi.*
