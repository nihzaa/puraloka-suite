# 10 — Observability Standard

> **Maturity:** 🟡 Partial — Logs pillar sudah ada tapi dev-config di production ([Phase1/01-gap-analysis.md Gap 7](../../Phase1/01-gap-analysis.md#gap-7--observability-logger-dev-config-di-production)); Metrics baru kontrak (RED metrics didefinisikan, belum diimplementasikan); Traces sengaja ditunda, bukan diabaikan.

**Kedudukan:** Batch 4 — Kualitas & Observability. Detail implementasi dari [Phase1/08-observability-plan.md](../../Phase1/08-observability-plan.md). Melengkapi [09-performance-budget.md](09-performance-budget.md) (metrics adalah cara memverifikasi budget) dan [29-logging-standard.md](29-logging-standard.md) (format log spesifik).

---

## 1. Purpose

Menjamin setiap request finansial-kritis bisa **ditelusuri end-to-end** — dari log HTTP, ke audit trail, ke workflow instance — lewat satu Correlation ID, tanpa perlu menebak-nebak urutan kejadian saat debugging insiden produksi.

## 2. Background

[Phase1/08-observability-plan.md § Tiga Pilar](../../Phase1/08-observability-plan.md#tiga-pilar--status-target-phase-1d) mengonfirmasi status hari ini: **Logs** sudah ada (Fastify built-in logger) tapi konfigurasinya masih level development bahkan saat berjalan di production — gap konkret, bukan ketiadaan total. **Metrics** baru kontrak (RED metrics: Rate, Errors, Duration — didefinisikan strukturnya, belum diimplementasikan). **Traces** sengaja ditunda ke luar Phase 1D, bukan diabaikan — kompleksitas distributed tracing tidak sepadan manfaatnya selama modular monolith single-process ([01-application-and-data-architecture.md § Modular Monolith Strategy](../../01-application-and-data-architecture.md#modular-monolith-strategy)).

## 3. Principles

1. **Correlation ID per-request, dibagikan lintas log-audit-workflow.** Satu UUID (Fastify `genReqId`) mengikuti satu request dari masuk sampai selesai, muncul di setiap log line, setiap audit_logs entry, dan setiap workflow_instance yang dipicu request tersebut — memungkinkan `grep <correlation-id>` menceritakan seluruh kisah satu request.
2. **Log level environment-aware, bukan satu konfigurasi untuk semua environment.** Development boleh verbose (`debug`), production **MUST** minimal `info` untuk operasi normal, dengan `error`/`warn` untuk kondisi bermasalah — konfigurasi ini adalah gap konkret hari ini yang sedang diperbaiki, bukan target baru dari nol.
3. **Metrics dulu, traces belakangan — sesuai skala nyata.** RED metrics cukup untuk mendeteksi *bahwa* ada masalah (rate error naik, durasi p95 melonjak); distributed tracing baru dibutuhkan saat modular monolith benar-benar dipecah jadi service terpisah ([Service Extraction Strategy](../../01-application-and-data-architecture.md#service-extraction-strategy)).

## 4. Mandatory Rules

1. Setiap request HTTP **MUST** memiliki Correlation ID (Fastify `request.id` via `genReqId`) yang **MUST** disertakan di setiap log line yang dihasilkan selama pemrosesan request tersebut — **MUST NOT** ada log finansial-kritis yang tidak bisa ditelusuri balik ke request asalnya.
2. Log level di environment production **MUST** minimal `info`, **MUST NOT** `debug` atau `trace` — ini gap eksplisit hari ini ([Phase1/01-gap-analysis.md Gap 7](../../Phase1/01-gap-analysis.md#gap-7--observability-logger-dev-config-di-production)) yang **MUST** ditutup sebagai bagian awal Sub-Fase 1D.
3. Log untuk operasi finansial (kasbon, invoice, pembayaran, RAB) **MUST** menyertakan field terstruktur wajib: `correlation_id`, `user_id`, `action`, `entity_type`, `entity_id` — **MUST NOT** berupa string bebas tanpa struktur yang tidak bisa di-query/di-filter (lihat [29-logging-standard.md](29-logging-standard.md) untuk skema lengkap).
4. Data sensitif (password, token, API key, nomor rekening lengkap) **MUST NOT** pernah muncul di log dalam bentuk plaintext — **MUST** di-mask atau dikecualikan dari serialisasi log.
5. Correlation ID yang sama **MUST** dipakai untuk menghubungkan `audit_logs` entry dan `workflow_instances` yang dipicu oleh request yang sama, begitu kedua sistem tersebut aktif — **MUST NOT** membuat identifier terpisah per subsistem yang tidak bisa disilangkan.

## 5. Recommended Rules

1. RED Metrics (Rate, Errors, Duration) per endpoint **SHOULD** diimplementasikan begitu infrastruktur metrics tersedia (target Sub-Fase 1D) — belum ada keharusan sebelum infrastruktur tersedia.
2. Distributed tracing **SHOULD NOT** diimplementasikan sebelum Service Extraction Strategy benar-benar mengekstrak domain pertama menjadi service terpisah — menghindari kompleksitas operasional tanpa manfaat pada arsitektur modular monolith hari ini.

## 6. Anti-Pattern

**Log Tanpa Correlation ID** — log line yang hanya berisi pesan bebas (`console.log('kasbon approved')`) tanpa identifier yang bisa menghubungkannya ke request/user/entity spesifik. Saat insiden terjadi (mis. kasbon ter-approve dua kali), log seperti ini tidak bisa membedakan kejadian mana yang menyebabkan masalah.

**Production Berjalan dengan Debug Logging** — kondisi hari ini yang sedang diperbaiki: logger environment-agnostic yang menghasilkan volume log besar di production tanpa manfaat tambahan, sekaligus berisiko membocorkan detail internal (query, payload) yang seharusnya tidak perlu di-log di level itu.

## 7. Example Good

```ts
// Target Sub-Fase 1D — log terstruktur dengan correlation ID
fastify.log.info({
  correlation_id: request.id,
  user_id: request.user.id,
  action: 'kasbon:approve',
  entity_type: 'kasbons',
  entity_id: kasbonId,
}, 'Kasbon approved');
```
Konsisten Mandatory Rule #1 dan #3 — setiap field terstruktur, bisa di-query, terhubung ke request asal.

## 8. Example Bad

```ts
// Pola hari ini (existing, contoh generik) — tanpa struktur, tanpa correlation ID
console.log('kasbon approved: ' + kasbonId);
```
Tidak ada `correlation_id`, tidak ada `user_id` yang melakukan approve, tidak bisa di-query terstruktur — melanggar Mandatory Rule #1 dan #3 begitu domain ini disentuh untuk pekerjaan Sub-Fase 1D.

## 9. Migration Strategy

**Untuk Mandatory Rule #2 (log level production)** — 🟡 Partial, migrasi aktif: perubahan konfigurasi (bukan migrasi library — Fastify logger sudah cukup) ([Phase1/08 § Perubahan Konfigurasi](../../Phase1/08-observability-plan.md#perubahan-konfigurasi-bukan-migrasi-library)), **MUST** ditutup sebagai prioritas pertama Sub-Fase 1D karena risikonya (kebocoran detail internal) sudah ada hari ini, bukan hanya gap fitur.

**Untuk Mandatory Rule #1, #3, #5 (Correlation ID terstruktur)** — 🔵 Designed, kontrak lintas sub-sistem ([Phase1/08 § Correlation ID](../../Phase1/08-observability-plan.md#correlation-id--kontrak-lintas-sub-sistem)) berlaku penuh begitu diimplementasikan di Sub-Fase 1D — N/A untuk migrasi mundur karena tidak ada Correlation ID system yang perlu dimigrasikan dari kondisi hari ini (belum ada sama sekali).

**Untuk Mandatory Rule #4 (data sensitif tidak di-log)** — N/A, berlaku penuh sejak commit pertama, tidak ada pengecualian transisi.

## 10. Checklist

- [ ] Log finansial-kritis menyertakan `correlation_id`, `user_id`, `action`, `entity_type`, `entity_id`
- [ ] Tidak ada data sensitif (password/token/API key) di log
- [ ] Log level production minimal `info`, tidak `debug`/`trace`
- [ ] (Setelah audit trail v2 aktif) Correlation ID sama dipakai lintas log-audit-workflow

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Log level production | `info` minimum | Audit config per environment |
| Log finansial-kritis tanpa `correlation_id` | 0 | Audit sampling log production |
| Data sensitif ditemukan di log | 0 | Audit sampling + log scanning otomatis (target) |

## 12. References

- [Phase1/08-observability-plan.md](../../Phase1/08-observability-plan.md)
- [Phase1/01-gap-analysis.md § Gap 7](../../Phase1/01-gap-analysis.md#gap-7--observability-logger-dev-config-di-production)
- [09-performance-budget.md](09-performance-budget.md)
- [29-logging-standard.md](29-logging-standard.md)
- [GLOSSARY.md — Correlation ID](../GLOSSARY.md)

---

*File selanjutnya: [28-error-handling-standard.md](28-error-handling-standard.md)*
