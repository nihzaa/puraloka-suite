# Phase 1 — 06. Test Strategy

**Upstream:** Menutup [Gap 5 — Financial Test Suite](01-gap-analysis.md#gap-5--financial-test-suite-nol-infrastruktur), prasyarat untuk [Migration Strategy](03-migration-strategy.md) berjalan aman.
**Status:** Planning only.

---

## Realisme Target Coverage 90% — Pembahasan Jujur

Brief meminta *"minimum 90% coverage"* untuk modul finansial-kritis. Sebelum menerima angka ini mentah-mentah, perlu dipisahkan dua hal yang sering tercampur:

| Jenis Coverage | Realistis 90%? | Kenapa |
|---|---|---|
| **Coverage untuk logic kalkulasi murni** (EVM formula, tax calculation, retention calculation, RAB bubble-up) | **Ya, realistis dan bernilai tinggi** — ini pure function, mudah diuji lengkap | Target 90% **untuk kategori ini** masuk akal dan harus dikejar |
| **Coverage untuk seluruh route handler** (termasuk error handling Supabase, edge case HTTP, dst.) | **Tidak realistis di Phase 1 untuk tim kecil** — effort naik tajam untuk marginal value yang menurun | Target ini **bukan** fokus Phase 1; test integration untuk *golden path* + *kasus kegagalan finansial paling mungkin* lebih bernilai dari coverage persentase tinggi yang menyertakan boilerplate error handling |

**Keputusan yang direkomendasikan:** Target **90% untuk pure calculation function** yang diekstrak dari 6 file finansial-kritis, **bukan** 90% blanket coverage untuk seluruh codebase atau seluruh route handler. Ini konsisten dengan [04 — Engineering Standards](../04-roadmap-governance-and-delivery.md#engineering-standards): "prioritas coverage: business logic finansial dan authorization checks dulu, UI component testing belakangan" — prinsip yang sudah disepakati, bukan usulan baru.

**Kenapa ini bukan "menurunkan standar":** Coverage persentase yang tinggi untuk kode yang banyak boilerplate (try-catch generik, validasi request shape) memberi rasa aman palsu — angka besar tapi tidak menguji hal yang benar-benar berisiko. Fokus 90% ke *pure function* kalkulasi finansial memastikan angka itu benar-benar berarti "logic uang dihitung dengan benar," bukan "banyak baris ter-cover oleh test trivial."

---

## Arsitektur Test

### Framework: Vitest

| Pertimbangan | Vitest | Jest (alternatif) |
|---|---|---|
| Kompatibilitas ESM native | ✅ Native | Butuh konfigurasi tambahan |
| Startup time | Lebih cepat (esbuild) | Lebih lambat |
| Kompatibilitas TypeScript + Fastify modern | Native | Butuh `ts-jest` tambahan |
| Ekosistem/familiaritas | Lebih baru, dokumentasi baik | Lebih matang, ekosistem lebih besar |

**Keputusan: Vitest.** Rationale: stack Puraloka Suite sudah modern (Next.js 16, React 19, TypeScript strict) — Vitest selaras dengan arah stack ini tanpa lapisan kompatibilitas tambahan yang dibutuhkan Jest untuk ESM.

### Dua Lapis Test

```
apps/api/src/
├── lib/                          # BARU — pure function diekstrak dari route handler
│   ├── evm-calculation.ts        # dari kurva-s.ts
│   ├── tax-calculation.ts        # dari termin-payment.ts
│   ├── retention-calculation.ts  # dari termin-payment.ts + finance.ts
│   └── rab-aggregation.ts        # dari rab.ts + progress.ts (bubble-up)
├── lib/__tests__/                # Unit test — pure function, tanpa DB/HTTP
│   ├── evm-calculation.test.ts
│   ├── tax-calculation.test.ts
│   ├── retention-calculation.test.ts
│   └── rab-aggregation.test.ts
└── routes/v1/__tests__/          # Integration test — end-to-end lewat test DB
    ├── kasbons.test.ts
    ├── change-orders.test.ts
    └── procurement.test.ts
```

**Prinsip arsitektur kunci — ekstraksi pure function bukan sekadar "cara testing," ini perbaikan desain:** Route handler `kurva-s.ts` (388 baris) hari ini mencampur kalkulasi EVM dengan query Supabase dan response formatting dalam satu fungsi besar. Mengekstrak kalkulasi murni ke `lib/evm-calculation.ts` (input: angka/array, output: angka — nol I/O) adalah penerapan konkret **Dependency Inversion** dan **Testability** yang sudah dijanjikan sebagai standar rekayasa Phase 1 — bukan pekerjaan tambahan di luar filosofi Phase 1, ini **adalah** filosofi Phase 1 diterapkan.

### Unit Test — Target 90% (Pure Function)

**Prioritas ekstraksi (berdasar risiko finansial dari [00-current-state-audit.md § 4.1](00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)):**

1. **Tax calculation** (`termin-payment.ts:175`) — Prioritas tertinggi: formula sederhana (`0.11` vs `0.02`), tapi salah hitung = masalah legal/klien. Test case: PPN scheme, PPh-final scheme, edge case nominal nol/negatif (harus reject, bukan hitung salah diam-diam).
2. **EVM/Kurva-S calculation** (`kurva-s.ts`) — Formula CDF normal untuk distribusi rencana + agregasi serapan aktual. Test case: proyek baru mulai (0% progress), proyek selesai (100%), distribusi tidak simetris, kasbon/payment dengan status campuran (approved vs pending — hanya approved yang masuk hitungan AC).
3. **RAB bubble-up** (`rab.ts` + `progress.ts`) — Weighted average 2 lapis (item → kategori → project). Test case: kategori dengan 1 item vs banyak item, weight yang tidak menjumlah tepat 100% (constraint 99.9-100.1% dari migration 052 — verifikasi test menangkap kasus di luar rentang ini).
4. **Retention calculation** — Trigger `calc_retention_amount` (migration 010) — meski ini logic di level database trigger, bukan TypeScript, tetap perlu test **integration** (bukan unit) yang memverifikasi trigger menghasilkan angka benar untuk berbagai `retention_pct`.

### Integration Test — Golden Path + Kegagalan Finansial Paling Mungkin

**Bukan mencoba menguji setiap kombinasi HTTP status** — fokus pada skenario yang benar-benar berisiko finansial:

| Modul | Golden Path | Kegagalan yang Wajib Ditest |
|---|---|---|
| Kasbon | Mandor ajukan → PM approve → status berubah, notifikasi terkirim | Approve ganda (race condition — dua approval bersamaan untuk kasbon yang sama tidak boleh menghasilkan dua kali pencairan) |
| Change Order | Draft → submit → admin approve → contract_value ter-update + audit log | Approve pada CO yang sudah di-reject sebelumnya (state transition invalid harus ditolak, bukan diproses diam-diam) |
| Procurement | MR → PO → GR → stock bertambah sesuai FIFO | GR dengan kuantitas melebihi PO (over-receipt) — harus ter-flag, bukan diterima diam-diam |

**Setup test database:** Skema terisolasi (Supabase local via `supabase start`, atau schema Postgres terpisah) — **tidak pernah** test menyentuh database development/production yang berisi data seed asli. Ini prasyarat keras yang harus dipenuhi sebelum test integration pertama ditulis.

---

## Test untuk RLS (Bukan Bagian dari "Financial Test Suite" secara Harfiah, Tapi Prasyarat Migrasi 1A.2)

Disebutkan eksplisit di [03-migration-strategy.md § Migrasi 1A.2](03-migration-strategy.md#migrasi-1a2--rls-sinkronisasi-migrasi-paling-berisiko-di-seluruh-phase-1) — test ini **berbeda karakter** dari unit/integration test di atas: bukan menguji logic aplikasi, tapi menguji **policy database langsung**.

```
Pola test RLS (per tabel yang dimigrasikan):
1. Buat 4 test user (satu per role built-in) + 1 role kustom (skenario yang RLS lama GAGAL menangani)
2. Untuk setiap kombinasi (user, operasi CRUD), assert hasil sesuai permission yang seharusnya
3. Test KHUSUS untuk role kustom — ini yang membuktikan Gap 2 benar tertutup, bukan cuma "role lama masih jalan"
```

**Kenapa ini kategori test terpisah dan wajib, bukan opsional:** Tanpa test ini, tidak ada cara memverifikasi Gap 2 ([RLS tidak sinkron RBAC v2](01-gap-analysis.md#gap-2--rls-tidak-sinkron-dengan-rbac-v2)) benar tertutup — bug di area ini secara desain **tidak akan terlihat lewat API** (API bypass RLS via `service_role`), hanya muncul lewat akses langsung ke database. Test otomatis adalah **satu-satunya** cara mendeteksi regresi di sini sebelum insiden nyata terjadi.

---

## CI Integration

```yaml
# Bagian dari .github/workflows/ci.yml (desain, lihat 02-target-architecture.md § 1A.5)
- name: Unit tests (pure function, target 90%)
  run: pnpm vitest run --coverage lib/
- name: Integration tests (golden path + kegagalan finansial)
  run: pnpm vitest run routes/
- name: RLS policy tests
  run: pnpm vitest run rls/
```

**Coverage gate di CI:** Hanya untuk direktori `lib/` (pure function) — bukan blanket threshold untuk seluruh `apps/api/src`, konsisten dengan pembahasan realisme di atas.

---

*Dokumen selanjutnya: [07 — Security Review](07-security-review.md) — verifikasi bahwa desain Phase 1 memenuhi standar [02 — Security Architecture](../02-security-and-compliance-architecture.md) yang sudah ditetapkan.*
