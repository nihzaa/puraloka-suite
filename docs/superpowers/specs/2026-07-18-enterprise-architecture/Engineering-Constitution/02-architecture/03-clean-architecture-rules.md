# 03 — Clean Architecture Rules

> **Maturity:** 🔵 Designed — belum ada kode yang mengikuti pemisahan layer ini secara sengaja hari ini (route handler Fastify saat ini bicara langsung ke Supabase client tanpa lapisan abstraksi). Kontrak masa depan, berlaku penuh begitu domain manapun mulai di-refactor atau dibangun baru mengikuti Sub-Fase 1A ke atas.

**Kedudukan:** Batch 2 — Prinsip Arsitektur. Dirujuk oleh [01-coding-standards.md](../01-foundations/01-coding-standards.md), [02-folder-architecture.md](../01-foundations/02-folder-architecture.md), dan seluruh file `03-core-implementation/`. Melengkapi [04-domain-driven-design-rules.md](04-domain-driven-design-rules.md) — file ini mengatur *pemisahan layer teknis*, DDD mengatur *pemodelan domain*.

---

## 1. Purpose

Menetapkan batas tanggung jawab antar lapisan kode (HTTP → business logic → data access) supaya logic finansial-kritis bisa **diuji tanpa server HTTP menyala dan tanpa database nyata** — prasyarat langsung untuk [08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md) mencapai target coverage pada fungsi kalkulasi murni.

## 2. Background

Route handler Puraloka Suite hari ini (`apps/api/src/routes/v1/*.ts`, 25 file, 159 endpoint) menyatukan tiga tanggung jawab dalam satu fungsi: parsing request, kalkulasi bisnis, dan query Supabase — pola yang [Phase1/06-test-strategy.md § Arsitektur Test](../../Phase1/06-test-strategy.md#arsitektur-test) mengidentifikasi sebagai alasan `kurva-s.ts` (388 baris, kalkulasi EVM) sulit ditest: kalkulasi CPI/SPI/EAC tercampur dengan pemanggilan Supabase dalam fungsi yang sama, sehingga unit test kalkulasi terpaksa ikut mem-mock database. Folder `apps/api/src/services/` sudah ada secara fisik tapi kosong ([02-folder-architecture.md § Background](../01-foundations/02-folder-architecture.md)) — kandidat lokasi kanonik untuk layer yang didefinisikan file ini.

## 3. Principles

1. **Business logic tidak boleh tahu cara HTTP bekerja.** Fungsi yang menghitung `progress_pct` atau CPI/SPI **MUST** bisa dipanggil dari unit test langsung dengan argumen biasa (angka, object), bukan lewat `FastifyRequest`/`FastifyReply`.
2. **Dependency Inversion, bukan dependency langsung.** Layer business logic bergantung pada abstraksi akses data (fungsi/interface), bukan pada Supabase client secara langsung — pola yang sudah ada presedennya di `requirePermission(key)` sebagai abstraksi otorisasi ([GLOSSARY.md — Dependency Inversion](../GLOSSARY.md)).
3. **Pemisahan bertahap, bukan big-bang rewrite.** Sesuai [00-principles/00-engineering-principles.md Prinsip 5 (YAGNI)](../00-principles/00-engineering-principles.md#3-principles), ekstraksi layer dilakukan saat file disentuh untuk perubahan lain atau saat menulis test untuknya — **MUST NOT** ada PR yang isinya murni refactor 952 baris `rab.ts` tanpa perubahan fungsional yang menyertainya.

## 4. Mandatory Rules

1. Fungsi kalkulasi murni (menerima input, mengembalikan output, tanpa I/O — mis. kalkulasi EVM, bubble-up `progress_pct`, kalkulasi pajak) **MUST** diekstrak ke `apps/api/src/services/<domain>.ts` sebagai fungsi standalone yang tidak menerima `FastifyRequest`/`FastifyReply` sebagai parameter.
2. Route handler **MUST** tetap bertanggung jawab hanya untuk: parsing/validasi request, memanggil fungsi service, memanggil query data access, membentuk response — **MUST NOT** mengandung kalkulasi bisnis multi-langkah inline di dalam handler begitu domain tersebut disentuh untuk pekerjaan Sub-Fase 1A ke atas.
3. Fungsi service **MUST NOT** meng-import apa pun dari `fastify` atau memanggil Supabase client secara langsung — akses data **MUST** lewat parameter yang disuntikkan (function injection) atau layer data access terpisah, bukan import langsung ke modul koneksi database.
4. Setiap fungsi service baru yang diekstrak **MUST** disertai minimal satu unit test pada PR yang sama (lihat [08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md)) — ekstraksi tanpa test menghilangkan alasan utama pemisahan ini dilakukan.

## 5. Recommended Rules

1. Layer data access (query Supabase) **SHOULD** dikonsolidasi per domain di `apps/api/src/routes/v1/<domain>.ts` bagian atas file atau modul terpisah jika kompleksitas query bertambah — belum ada keharusan file terpisah selama modular monolith masih fase awal ([01 — Modular Monolith Strategy](../../01-application-and-data-architecture.md#modular-monolith-strategy)).
2. Prioritas ekstraksi **SHOULD** mengikuti urutan yang sama dengan [Phase1/06-test-strategy.md § Unit Test Target 90%](../../Phase1/06-test-strategy.md#unit-test--target-90-pure-function) — dimulai dari `kurva-s.ts` (kalkulasi EVM) dan `rab.ts` (bubble-up progress), bukan domain yang risikonya lebih rendah.

## 6. Anti-Pattern

**Layer Palsu** — membuat folder `services/` lalu mengisinya dengan fungsi yang tetap menerima `FastifyRequest` sebagai parameter atau tetap memanggil Supabase langsung — secara teknis ada file baru, tapi tidak ada pemisahan tanggung jawab nyata, dan test masih butuh mock HTTP/database. Ini melanggar semangat Mandatory Rule #1 dan #3 meski secara harfiah "ada folder services."

**Ekstraksi Prematur Tanpa Test** — memindahkan kode ke `services/` sebagai refactor kosmetik tanpa menambahkan test yang memanfaatkan testability barunya — kehilangan seluruh manfaat pemisahan ini, hanya menambah indirection tanpa nilai (bertentangan [00-principles/00-engineering-principles.md Prinsip Strict YAGNI](../00-principles/00-engineering-principles.md#3-principles)).

## 7. Example Good

```ts
// apps/api/src/services/kurva-s.ts (target, belum ada — kontrak Designed)
export function calculateEVM(input: {
  bac: number; ac: number; progressPct: number; plannedPct: number;
}): { ev: number; pv: number; cpi: number; spi: number; eac: number } {
  const ev = (input.progressPct / 100) * input.bac;
  const pv = (input.plannedPct / 100) * input.bac;
  const cpi = input.ac > 0 ? ev / input.ac : 0;
  const spi = pv > 0 ? ev / pv : 0;
  const eac = cpi > 0 ? input.bac / cpi : input.bac;
  return { ev, pv, cpi, spi, eac };
}
```
Fungsi murni — bisa ditest dengan `expect(calculateEVM({...})).toEqual({...})` tanpa server, tanpa database, tanpa mock. Konsisten Mandatory Rule #1 dan #3.

```ts
// apps/api/src/routes/v1/kurva-s.ts (setelah ekstraksi)
fastify.get('/projects/:id/kurva-s', async (request, reply) => {
  const raw = await fetchKurvaSInputs(request.params.id); // data access
  const evm = calculateEVM(raw);                          // service, testable
  return reply.send({ data: raw.points, meta: { evm } });  // response shaping
});
```
Handler hanya orchestrate — parsing, panggil service, bentuk response. Konsisten Mandatory Rule #2.

## 8. Example Bad

Pola hari ini di `kurva-s.ts` (388 baris) — kalkulasi CPI/SPI/EAC ditulis inline di dalam handler yang sama dengan pemanggilan Supabase berulang kali, sehingga test kalkulasi EVM terpaksa mem-mock seluruh chain Supabase hanya untuk memverifikasi rumus matematika sederhana. Ini persis kondisi yang membuat [Phase1/06-test-strategy.md](../../Phase1/06-test-strategy.md#arsitektur-test) menyimpulkan test coverage 90% pada file ini tidak realistis tanpa ekstraksi terlebih dahulu.

## 9. Migration Strategy

Tidak ada migrasi mundur paksa — file yang belum disentuh untuk pekerjaan lain **boleh** tetap dalam bentuk saat ini tanpa pelanggaran (selaras Prinsip #3 di atas). Migrasi berlaku **per file, dipicu oleh event**: begitu sebuah route file finansial-kritis (`kurva-s.ts`, `rab.ts`, `kasbons.ts`, `termin-payment.ts`, `progress.ts`, `finance.ts` — enam file yang sama dengan [Phase1/00 § 4.1](../../Phase1/00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)) disentuh untuk perubahan fungsional apa pun di Sub-Fase 1A ke atas, ekstraksi Mandatory Rule #1-#4 **MUST** dilakukan sebagai bagian dari PR yang sama, tidak ditunda ke PR terpisah "nanti."

## 10. Checklist

- [ ] Fungsi kalkulasi murni baru ditulis tanpa parameter `FastifyRequest`/`FastifyReply`
- [ ] Fungsi service tidak meng-import Supabase client langsung
- [ ] Fungsi service baru punya minimal satu unit test di PR yang sama
- [ ] Route handler yang disentuh untuk domain finansial-kritis sudah diekstrak sesuai Migration Strategy

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Fungsi kalkulasi EVM/progress di `services/` dengan unit test | 100% dari yang diekstrak | Coverage report per file service |
| Enam file finansial-kritis yang sudah diekstrak sebagian | Meningkat tiap Sub-Fase disentuh | Audit manual per akhir sub-fase |
| PR yang menambah `services/` tanpa test menyertai | 0 | Code review checklist |

## 12. References

- [Phase1/06-test-strategy.md § Arsitektur Test](../../Phase1/06-test-strategy.md#arsitektur-test)
- [Phase1/00-current-state-audit.md § 4.1](../../Phase1/00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)
- [01-application-and-data-architecture.md § Modular Monolith Strategy](../../01-application-and-data-architecture.md#modular-monolith-strategy)
- [01-foundations/02-folder-architecture.md § Migration Strategy](../01-foundations/02-folder-architecture.md#9-migration-strategy)
- [04-domain-driven-design-rules.md](04-domain-driven-design-rules.md)
- [04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md)

---

*File selanjutnya: [04-domain-driven-design-rules.md](04-domain-driven-design-rules.md)*
