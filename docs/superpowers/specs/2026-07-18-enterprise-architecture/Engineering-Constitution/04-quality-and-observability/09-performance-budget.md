# 09 — Performance Budget

> **Maturity:** 🔵 Designed — belum ada budget performa terukur atau gate otomatis hari ini; 207 index existing menunjukkan disiplin performa ad-hoc, bukan budget formal dengan target angka.

**Kedudukan:** Batch 4 — Kualitas & Observability. Melengkapi [03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md) (indexing) dengan target performa terukur. Dirujuk oleh [10-observability-standard.md](10-observability-standard.md) (metrics untuk memverifikasi budget terpenuhi).

---

## 1. Purpose

Mencegah *performance drift* — penurunan performa bertahap yang tidak terasa per-PR tapi terasa signifikan setelah puluhan PR — dengan menetapkan target angka konkret yang bisa diverifikasi, bukan perasaan subjektif "masih cukup cepat."

## 2. Background

[03-platform-and-intelligence-architecture.md § Performance Architecture](../../03-platform-and-intelligence-architecture.md#performance-architecture) mencatat Current State: 207 index sudah ada, caching dan queue architecture masih Designed (belum diimplementasikan — trafik hari ini belum membutuhkannya). File ini tidak menciptakan target baru dari nol, tapi memformalkan ambang yang **akan** dipakai untuk memutuskan kapan caching/queue benar-benar dibutuhkan, mencegah premature optimization sekaligus mencegah pembiaran tanpa batas saat trafik bertambah.

## 3. Principles

1. **Budget diukur, bukan diasumsikan.** Klaim "endpoint ini cepat" harus didukung angka p95/p99 dari observability nyata ([10-observability-standard.md](10-observability-standard.md)), bukan pengalaman subjektif development lokal dengan data kecil.
2. **Optimisasi dipicu oleh bukti, bukan spekulasi.** Caching, queue, horizontal scaling ([03-platform-and-intelligence-architecture.md § Caching Strategy](../../03-platform-and-intelligence-architecture.md#caching-strategy)) ditambahkan **setelah** budget dilanggar dengan bukti metrik, bukan diimplementasikan preventif "untuk jaga-jaga" — selaras [00-principles/00-engineering-principles.md Prinsip Strict YAGNI](../00-principles/00-engineering-principles.md#3-principles).
3. **Query N+1 adalah pelanggaran arsitektur, bukan detail implementasi kecil.** Loop yang memanggil query database per-item alih-alih satu query batch adalah kelas bug performa paling umum dan paling mudah dicegah lewat review.

## 4. Mandatory Rules

1. Endpoint API **MUST** menargetkan p95 response time di bawah 500ms untuk operasi baca (GET), dan di bawah 1000ms untuk operasi tulis (POST/PATCH/DELETE) pada beban data setara skala hari ini (67 tabel, ratusan-ribuan baris per tabel) — target ini **MUST** ditinjau ulang naik seiring skala data bertambah signifikan (order of magnitude), bukan dipertahankan statis selamanya.
2. Query yang memanggil database di dalam loop (N+1 pattern) **MUST NOT** ditulis untuk operasi yang memproses lebih dari ~10 item — **MUST** diganti query batch tunggal (`IN` clause, join, atau `Promise.allSettled` untuk paralelisasi jika batch tidak memungkinkan).
3. Endpoint list yang query-nya melibatkan `JOIN` ke lebih dari 2 tabel **MUST** diverifikasi memakai index yang sesuai (`EXPLAIN ANALYZE` manual) sebelum dianggap selesai — **MUST NOT** diasumsikan cukup cepat tanpa verifikasi saat volume data bertambah.
4. Response payload endpoint list **MUST NOT** menyertakan kolom yang tidak dipakai klien (mis. `SELECT *` pada tabel dengan kolom besar seperti JSON blob) — **MUST** eksplisit memilih kolom yang dibutuhkan.

## 5. Recommended Rules

1. Endpoint yang diketahui berat (dashboard aggregation, laporan Excel export) **SHOULD** memakai `Promise.allSettled` untuk paralelisasi query independen — pola yang sudah diterapkan di `dashboard.ts` hari ini.
2. Caching (Redis atau in-memory) **SHOULD** hanya dipertimbangkan setelah Mandatory Rule #1 dilanggar dengan bukti metrik nyata, bukan spekulasi.

## 6. Anti-Pattern

**N+1 Query dalam Loop** — pola `for (const item of items) { await supabase.from('x').select().eq('id', item.id) }` alih-alih satu query `IN (...)`. Untuk list dengan 50 item, ini berarti 50 round-trip database alih-alih 1 — degradasi performa yang skalanya linear terhadap jumlah data, menjadi katastrofik pada data besar.

**Optimisasi Prematur Tanpa Bukti** — mengimplementasikan Redis caching untuk endpoint yang belum pernah diukur lambat, menambah kompleksitas operasional (cache invalidation, konsistensi) tanpa manfaat terukur — bertentangan Principle #2.

## 7. Example Good

```ts
// Pola batch query, bukan N+1
const projectIds = kasbons.map(k => k.project_id);
const { data: projects } = await supabase.from('projects').select('id, name').in('id', projectIds);
// satu query untuk semua project, bukan satu query per kasbon
```

## 8. Example Bad

```ts
// Anti-pattern N+1 — hipotetis, dicantumkan sebagai pencegahan
for (const kasbon of kasbons) {
  const { data: project } = await supabase.from('projects').select('name').eq('id', kasbon.project_id).single();
  kasbon.projectName = project?.name;
}
```
Melanggar Mandatory Rule #2 — satu query per iterasi, bukan batch tunggal.

## 9. Migration Strategy

**Untuk Mandatory Rule #1 (target p95/p99)** — 🔵 Designed, N/A untuk migrasi mundur karena belum ada observability metrics untuk mengukur baseline hari ini (bergantung [10-observability-standard.md](10-observability-standard.md) Metrics pillar tersedia). Target berlaku penuh sebagai acuan begitu metrics tersedia di Sub-Fase 1D.

**Untuk Mandatory Rule #2, #3, #4 (N+1, index, payload)** — berlaku penuh sejak commit pertama untuk kode baru; kode existing yang melanggar (jika ditemukan saat file disentuh) **SHOULD** diperbaiki sebagai bagian PR yang sama, tidak wajib audit retroaktif menyeluruh di luar itu.

## 10. Checklist

- [ ] Tidak ada query database di dalam loop untuk >10 item
- [ ] Query list dengan JOIN kompleks diverifikasi pakai index sesuai
- [ ] Response tidak menyertakan kolom yang tidak dipakai klien
- [ ] (Setelah Sub-Fase 1D) endpoint baru diverifikasi terhadap target p95/p99

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Endpoint p95 response time (baca) | < 500ms | Observability metrics ([10-observability-standard.md](10-observability-standard.md)), setelah Sub-Fase 1D |
| Pola N+1 baru ditemukan review | 0 | Code review checklist |
| Query list tanpa index sesuai (>2 JOIN) | 0 | `EXPLAIN ANALYZE` manual per PR relevan |

## 12. References

- [03-platform-and-intelligence-architecture.md § Performance Architecture](../../03-platform-and-intelligence-architecture.md#performance-architecture)
- [03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md)
- [10-observability-standard.md](10-observability-standard.md)
- [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md)

---

*File selanjutnya: [10-observability-standard.md](10-observability-standard.md)*
