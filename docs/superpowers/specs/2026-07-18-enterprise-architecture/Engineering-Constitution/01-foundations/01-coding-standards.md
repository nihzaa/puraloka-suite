# 01 — Coding Standards

> **Maturity:** 🟡 Partial — TypeScript strict mode sudah aktif di kedua app; linter hanya terpasang di `apps/web`, `apps/api` belum punya konfigurasi ESLint sama sekali (gap nyata, bukan asumsi — lihat Migration Strategy).

**Kedudukan:** Batch 1 — Fondasi. Dirujuk oleh hampir seluruh file lain di Engineering Constitution (Clean Architecture, DDD, API Standard, Testing, dst.) sebagai baseline konvensi kode. Istilah teknis merujuk [GLOSSARY.md](../GLOSSARY.md).

---

## 1. Purpose

Menetapkan standar penulisan kode TypeScript (backend Fastify, frontend Next.js) yang **dapat diverifikasi otomatis** — mencegah *coding style drift* seiring tim bertambah dan implementasi meluas ke Phase 2-9. Standar ini bukan preferensi estetika, tapi prasyarat untuk kode yang bisa direview cepat dan dipelihara jangka panjang oleh siapa pun.

## 2. Background

Puraloka Suite hari ini adalah 100% TypeScript di kedua layer (`apps/api` Fastify, `apps/web` Next.js) — `strict: true` **sudah aktif** di kedua `tsconfig.json` (diverifikasi langsung: `apps/api/tsconfig.json`, `apps/web/tsconfig.json`), artinya sebagian besar disiplin type-safety yang diminta constitution ini **sudah berjalan** sejak awal proyek, bukan target baru. Yang belum ada: **ESLint sama sekali tidak terpasang di `apps/api`** (hanya `apps/web/eslint.config.mjs` ditemukan) — kesenjangan konkret yang perlu ditutup, bukan diasumsikan sudah ada.

## 3. Principles

1. **Type safety adalah baris pertahanan pertama, bukan pengganti test.** `strict: true` menangkap kelas bug tertentu (null/undefined mismatch, argument shape salah) — tapi tidak menangkap logic error (lihat [04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md) untuk lapisan verifikasi berikutnya).
2. **Linter menegakkan konvensi, bukan preferensi personal.** Aturan gaya (indentasi, quote style) diselesaikan alat otomatis (Prettier/ESLint), bukan diperdebatkan di code review — energi review dihemat untuk logic, bukan format.
3. **Konsistensi lintas file lebih penting dari "cara terbaik" versi satu orang.** Pola yang sudah dominan di codebase (mis. `kebab-case` untuk nama file) dipertahankan sebagai standar, bukan diganti karena preferensi individual berbeda.

## 4. Mandatory Rules

1. Kode backend dan frontend **MUST** ditulis TypeScript, **MUST NOT** ada file `.js` baru di source (kecuali file konfigurasi yang secara inheren butuh CommonJS).
2. Setiap fungsi/method publik (diekspor dari modul) **MUST** punya return type eksplisit — tidak mengandalkan inference untuk API permukaan modul (inference tetap boleh untuk variabel lokal). *Verifikasi: ESLint rule `@typescript-eslint/explicit-module-boundary-types`.*
3. `any` implisit maupun eksplisit **MUST NOT** dipakai kecuali dengan komentar `// eslint-disable-next-line` yang menjelaskan kenapa tidak terhindarkan. *Verifikasi: `strict: true` (sudah aktif) + ESLint rule `@typescript-eslint/no-explicit-any`.*
4. Nama file **MUST** memakai `kebab-case` — konsisten dengan pola dominan yang sudah ada (`change-orders.ts`, `absorption-log-table.tsx`, 100% file existing yang diperiksa mengikuti pola ini). *Verifikasi: code review manual, kandidat linter rule custom di masa depan.*
5. Nama variabel/fungsi TypeScript **MUST** memakai `camelCase`; nama komponen React dan Type/Interface **MUST** memakai `PascalCase`. *Verifikasi: ESLint `@typescript-eslint/naming-convention`.*
6. `apps/api` **MUST** memiliki konfigurasi ESLint aktif sebelum akhir Sub-Fase 1A — ini adalah gap eksplisit, bukan pengecualian yang diterima permanen. Lihat Migration Strategy.
7. Setiap PR **MUST** lolos `tsc --noEmit` tanpa error sebelum diajukan untuk review — ini gate otomatis, bukan tanggung jawab reviewer manusia.

## 5. Recommended Rules

1. Fungsi **SHOULD** dijaga di bawah ~50 baris — fungsi yang lebih panjang biasanya menandakan lebih dari satu tanggung jawab (lihat [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md) untuk prinsip Single Responsibility). Deviasi diterima untuk fungsi dengan banyak percabangan kondisional yang secara alami tidak bisa dipecah tanpa kehilangan kejelasan (mis. parser Excel RAB yang kompleks).
2. Komentar kode **SHOULD** menjelaskan *kenapa*, bukan *apa* — kode yang butuh komentar "apa" biasanya sebaiknya ditulis ulang lebih jelas, bukan diberi komentar tambahan.
3. Import **SHOULD** diurutkan: built-in Node → dependency eksternal → import internal (path alias) — memudahkan pemindaian visual cepat.

## 6. Anti-Pattern

**"Any dulu, benerin nanti."** — Memakai `any` untuk melewati error TypeScript dengan niat memperbaiki nanti, yang nyaris selalu tidak pernah terjadi (pola yang sama dengan Anti-Pattern #1 di [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md#6-anti-pattern)). Bahayanya: `any` menghilangkan seluruh manfaat `strict: true` untuk baris kode itu, dan menyebar — kode yang memanggil fungsi ber-`any` ikut kehilangan type safety.

**God Function** — Satu fungsi yang menangani validasi, query database, transformasi data, dan formatting response sekaligus (pola yang teramati di [Phase1/06-test-strategy.md](../../Phase1/06-test-strategy.md#arsitektur-test) sebagai alasan `kurva-s.ts` sulit ditest — kalkulasi EVM tercampur dengan I/O dalam satu fungsi besar).

## 7. Example Good

```ts
// apps/api/src/plugins/auth.ts:76 (paraphrase pola yang sudah ada)
export async function requirePermission(
  permissionKey: string
): Promise<(request: FastifyRequest, reply: FastifyReply) => Promise<void>> {
  // return type eksplisit, permissionKey bertipe eksplisit — bukan any
}
```
Ini konsisten dengan Mandatory Rule #2 dan #3 — sudah menjadi pola dominan di codebase hari ini (diverifikasi [Phase1/00-current-state-audit.md](../../Phase1/00-current-state-audit.md) — seluruh 103 pemanggilan `requirePermission` konsisten dengan signature bertipe).

## 8. Example Bad

Pola inline `.role === 'admin'` yang tersebar di 57 lokasi ([Phase1/00 § 1.5](../../Phase1/00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file)) — bukan pelanggaran type safety (string comparison tetap type-safe), tapi pelanggaran Recommended Rule #1 semangatnya: logic otorisasi yang seharusnya terpusat tersebar berulang di banyak file, menyulitkan verifikasi konsistensi (lihat [Phase1/01-gap-analysis.md — Gap 1](../../Phase1/01-gap-analysis.md#gap-1--permission-engine-tiga-mekanisme-paralel) untuk rencana konsolidasinya).

## 9. Migration Strategy

**Untuk Mandatory Rule #6 (ESLint di `apps/api`)** — satu-satunya aturan di file ini yang benar-benar butuh migrasi (bukan sudah berjalan): tambahkan `eslint.config.mjs` di `apps/api` mengikuti pola `apps/web/eslint.config.mjs` yang sudah ada, jalankan sekali untuk mengidentifikasi pelanggaran existing, perbaiki bertahap per route file (bukan big-bang), prioritas dimulai dari file finansial-kritis yang sama dengan [Phase1/06-test-strategy.md § Prioritas Ekstraksi](../../Phase1/06-test-strategy.md#unit-test--target-90-pure-function) — konsisten urutan prioritas yang sudah ditetapkan di Phase 1 Planning.

**Untuk Mandatory Rule #1-5, #7** — N/A untuk migrasi mundur, karena `strict: true` sudah aktif sejak awal dan konvensi penamaan sudah 100% konsisten di file existing yang diperiksa. Aturan ini **berlaku penuh sejak commit pertama** yang menyentuh file mana pun, tanpa masa transisi.

## 10. Checklist

- [ ] `tsc --noEmit` lolos tanpa error
- [ ] Tidak ada `any` implisit/eksplisit baru tanpa justifikasi eksplisit
- [ ] Nama file baru memakai `kebab-case`
- [ ] Fungsi publik baru punya return type eksplisit
- [ ] (Setelah Mandatory Rule #6 tertutup) ESLint lolos tanpa error di `apps/api`

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Error `tsc --noEmit` di `main` branch | 0 | CI check ([05-team-process/11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)) |
| File `apps/api` tercakup ESLint | 100% | Jalankan `eslint apps/api/src` setelah Mandatory Rule #6 tertutup |
| Pemakaian `any` tanpa justifikasi | 0 baris baru per PR | Review manual + linter rule setelah aktif |

## 12. References

- [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md)
- [Phase1/00-current-state-audit.md § 1](../../Phase1/00-current-state-audit.md#1-permission-engine--current-state) — bukti pola penamaan dan struktur existing
- [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md)
- `apps/api/tsconfig.json`, `apps/web/tsconfig.json` (internal, diverifikasi langsung)

---

*File selanjutnya: [02-folder-architecture.md](02-folder-architecture.md)*
