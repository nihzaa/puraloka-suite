# 29 — Logging Standard

> **Maturity:** 🟡 Partial — Fastify logger sudah aktif dan dipakai konsisten, tapi skema field terstruktur wajib (§4) dan level environment-aware belum ditegakkan seragam (lihat [10-observability-standard.md § Migration Strategy](10-observability-standard.md#9-migration-strategy)).

**Kedudukan:** Batch 4 — Kualitas & Observability. Detail skema konkret dari kontrak yang didefinisikan [10-observability-standard.md § Structured Logging](10-observability-standard.md#4-mandatory-rules). Melengkapi [28-error-handling-standard.md](28-error-handling-standard.md) — error handling menentukan *apakah* error di-log, file ini menentukan *bagaimana bentuknya*.

---

## 1. Purpose

Menetapkan skema field wajib untuk log finansial-kritis sehingga log bisa **di-query dan difilter** (mis. "tampilkan semua log kasbon yang di-approve user X minggu ini") lewat log aggregation tool di masa depan, bukan hanya dibaca manual satu-satu sebagai teks bebas.

## 2. Background

[Phase1/08-observability-plan.md § Structured Logging — Field Wajib](../../Phase1/08-observability-plan.md#structured-logging--field-wajib-untuk-log-finansial) mendefinisikan field wajib untuk log finansial secara spesifik — file ini mengadopsinya sebagai standar mengikat, konsisten dengan Correlation ID kontrak di [10-observability-standard.md](10-observability-standard.md).

## 3. Principles

1. **Log terstruktur (JSON), bukan string bebas berformat manusia.** `fastify.log.info({ field: value }, 'pesan')` bukan `console.log('pesan dengan ' + value)` — struktur memungkinkan query, string bebas hanya bisa dibaca.
2. **Field wajib konsisten lintas domain, field tambahan bebas per konteks.** Setiap log finansial punya `correlation_id`, `user_id`, `action`, `entity_type`, `entity_id` sebagai baseline — di atas itu, field spesifik domain (mis. `amount` untuk kasbon) ditambahkan sesuai konteks.
3. **Log adalah audit trail sekunder, bukan pengganti `audit_logs` table.** Log membantu debugging teknis real-time; `audit_logs` adalah catatan permanen untuk kepatuhan dan investigasi bisnis — keduanya saling melengkapi, tidak saling menggantikan ([GLOSSARY.md — Audit Trail](../GLOSSARY.md)).

## 4. Mandatory Rules

1. Log untuk operasi pada entitas finansial (`kasbons`, `invoices`, `payments`, `progress_payments`, `borongan_settlements`, `expense_reports`) **MUST** menyertakan field: `correlation_id`, `user_id` (siapa yang melakukan aksi), `action` (format `<domain>:<verb>`, mis. `kasbon:approve`), `entity_type`, `entity_id` — **MUST NOT** hanya berupa pesan string tanpa field terstruktur ini.
2. Level log **MUST** dipilih sesuai severity: `error` untuk kegagalan yang butuh perhatian (operasi inti gagal), `warn` untuk kegagalan yang ditoleransi (fire-and-forget gagal), `info` untuk operasi normal yang penting dicatat (approve/reject, pembayaran), `debug` untuk detail yang hanya relevan saat development — **MUST NOT** semua log dipukul rata `info` atau `error`.
3. Log **MUST NOT** menyertakan nilai kolom sensitif secara utuh: password (tidak pernah, dalam kondisi apa pun), token/API key (tidak pernah), nomor rekening (boleh 4 digit terakhir saja jika perlu untuk debugging).
4. Pesan log (bagian string, bukan field terstruktur) **MUST** deskriptif dalam Bahasa Indonesia atau Inggris konsisten per file — **MUST NOT** dicampur bebas dalam satu file yang sama (konsistensi bahasa per file, bukan larangan bahasa tertentu).

## 5. Recommended Rules

1. Field `duration_ms` **SHOULD** disertakan pada log operasi yang diketahui berat (query kompleks, agregasi laporan) begitu infrastruktur timing sederhana tersedia — mendukung [09-performance-budget.md](09-performance-budget.md) tanpa perlu observability tool penuh.

## 6. Anti-Pattern

**Log String Bebas untuk Operasi Finansial** — `fastify.log.info('User approved kasbon ' + kasbonId + ' amount ' + amount)`. Tidak bisa di-query ("tampilkan semua approve kasbon di atas 5 juta minggu ini" butuh parsing string manual), rentan salah format, tidak konsisten antar developer.

**Level Log Seragam Semua `info`** — menandai kegagalan (`error` seharusnya) sebagai `info` karena "masih jalan kok" — menyembunyikan sinyal penting di antara noise operasi normal, membuat monitoring/alerting (begitu ada) tidak bisa membedakan kondisi bermasalah dari kondisi normal.

## 7. Example Good

```ts
fastify.log.info({
  correlation_id: request.id,
  user_id: request.user.id,
  action: 'kasbon:approve',
  entity_type: 'kasbons',
  entity_id: kasbonId,
  amount: kasbon.amount,
}, 'Kasbon disetujui');
```

## 8. Example Bad

```ts
console.log(`Kasbon ${kasbonId} approved by ${request.user.id}, amount: ${kasbon.amount}`);
```
String bebas, tidak ada `correlation_id`, tidak bisa di-query terstruktur, tidak melewati Fastify logger (sehingga tidak ikut konfigurasi level/output terpusat) — melanggar Mandatory Rule #1 dan Principle #1.

## 9. Migration Strategy

Sama dengan [10-observability-standard.md § Migration Strategy](10-observability-standard.md#9-migration-strategy) — skema field wajib berlaku penuh sejak commit pertama untuk log baru pada domain finansial-kritis; log existing yang belum terstruktur **SHOULD** dimigrasikan bertahap saat file yang bersangkutan disentuh untuk pekerjaan lain (event-driven migration, konsisten pola di seluruh Engineering Constitution ini), bukan proyek retrofit big-bang terpisah.

## 10. Checklist

- [ ] Log operasi finansial menyertakan `correlation_id`, `user_id`, `action`, `entity_type`, `entity_id`
- [ ] Level log dipilih sesuai severity (bukan default `info` untuk semua)
- [ ] Tidak ada password/token/API key di log
- [ ] Log terstruktur (object field), bukan string concatenation

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Log finansial baru dengan skema field lengkap | 100% | Code review checklist |
| Log level `error` dipakai untuk kegagalan operasi inti | 100% dari kejadian | Audit sampling |
| Data sensitif ditemukan di log | 0 | Audit sampling |

## 12. References

- [Phase1/08-observability-plan.md § Structured Logging](../../Phase1/08-observability-plan.md#structured-logging--field-wajib-untuk-log-finansial)
- [10-observability-standard.md](10-observability-standard.md)
- [28-error-handling-standard.md](28-error-handling-standard.md)
- [GLOSSARY.md — Audit Trail, Correlation ID](../GLOSSARY.md)

---

*Batch 4 selesai. File selanjutnya (Batch 5 — Proses Tim): [05-team-process/11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)*
