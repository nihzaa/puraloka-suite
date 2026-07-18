# 35 — Event-Driven Guideline

> **Maturity:** 🔵 Designed — Event Bus & Event Store didesain di [06-agentic-ai-and-automation-architecture.md](../../06-agentic-ai-and-automation-architecture.md) untuk mendukung platform otomasi AI, belum diimplementasikan. Pola fire-and-forget notifikasi existing adalah bentuk paling dekat dengan event-driven yang sudah berjalan hari ini, tapi bukan event bus sesungguhnya.

**Kedudukan:** Batch 7 — Domain Spesifik. Detail penggunaan dari desain [06-agentic-ai-and-automation-architecture.md § Event Bus & Event Store](../../06-agentic-ai-and-automation-architecture.md#event-bus--event-store). Berhubungan dengan [04-quality-and-observability/28-error-handling-standard.md](../04-quality-and-observability/28-error-handling-standard.md) (pola fire-and-forget yang sudah ada sebagai preseden).

---

## 1. Purpose

Menyiapkan aturan pemakaian event-driven architecture sebelum benar-benar dibutuhkan luas — terutama untuk mendukung 140 katalog automation ([06-agentic-ai-and-automation-architecture.md § Automation Catalog](../../06-agentic-ai-and-automation-architecture.md)) yang butuh titik pemicu (trigger) berbasis event, bukan hanya polling atau pemanggilan langsung.

## 2. Background

Sistem notifikasi Puraloka Suite hari ini sudah memakai pola mirip event (insert notifikasi dipicu oleh aksi lain — approve kasbon memicu notifikasi ke mandor) tapi diimplementasikan sebagai pemanggilan fungsi langsung (`createNotification(...)`), bukan event yang dipublikasikan ke bus dan dikonsumsi independen oleh banyak listener. [06-agentic-ai-and-automation-architecture.md § Event Bus & Event Store](../../06-agentic-ai-and-automation-architecture.md#event-bus--event-store) mendesain infrastruktur event sesungguhnya untuk mendukung automation platform yang lebih luas — file ini menyiapkan aturan pemakaiannya.

## 3. Principles

1. **Event merepresentasikan fakta yang sudah terjadi (past tense), bukan perintah.** `KasbonApproved`, bukan `ApproveKasbon` — event adalah catatan sesuatu yang sudah terjadi, konsumen memutuskan sendiri bagaimana bereaksi.
2. **Event-driven dipakai saat ada lebih dari satu konsumen independen yang perlu bereaksi terhadap satu kejadian, atau saat automation platform butuh titik pemicu generik.** Untuk komunikasi langsung satu-ke-satu, pemanggilan fungsi biasa tetap lebih sederhana dan sudah cukup (selaras YAGNI — tidak semua notifikasi perlu jadi event bus).
3. **Event Store menjadi sumber kebenaran historis, bukan hanya mekanisme pengiriman sesaat.** Event yang tersimpan permanen memungkinkan replay/audit — beda dari pesan queue yang hilang setelah dikonsumsi.

## 4. Mandatory Rules

1. Event yang dipublikasikan **MUST** dinamai past-tense mendeskripsikan fakta (`kasbon.approved`, `progress.updated`) — **MUST NOT** dinamai sebagai perintah (`approve.kasbon`).
2. Event yang berkaitan dengan operasi finansial **MUST** disimpan ke Event Store secara permanen (bukan hanya lewat sekali di message queue) begitu infrastruktur tersedia — mendukung audit trail dan kemampuan replay untuk debugging insiden.
3. Konsumen event **MUST** idempotent — memproses event yang sama dua kali (karena retry) **MUST NOT** menghasilkan efek ganda (mis. notifikasi terkirim dua kali, saldo berkurang dua kali) — konsisten [GLOSSARY.md — Idempotency](../GLOSSARY.md).
4. Migrasi dari pemanggilan fungsi langsung existing (`createNotification()`) ke event bus **MUST NOT** dilakukan sebagai refactor besar-besaran tanpa driver konkret — **MUST** hanya dimulai untuk domain yang benar-benar butuh multiple independent consumer (mis. automation platform butuh memicu banyak automation dari satu event yang sama).

## 5. Recommended Rules

1. Skema payload event **SHOULD** didokumentasikan (minimal komentar TypeScript interface) begitu event bus diimplementasikan — konsumen baru bisa memahami struktur tanpa membaca kode publisher.

## 6. Anti-Pattern

**Event Non-Idempotent** — konsumen yang memproses `kasbon.approved` dua kali (karena retry jaringan) menyebabkan notifikasi terkirim dua kali atau, lebih parah, saldo terupdate dua kali — bertentangan Mandatory Rule #3, risiko finansial nyata jika terjadi pada domain pembayaran.

**Event Bus untuk Semua Komunikasi Internal** — mengonversi seluruh pemanggilan fungsi internal menjadi event bahkan untuk kasus satu pemanggil-satu penerima yang sudah cukup sederhana sebagai function call langsung — menambah kompleksitas tanpa manfaat, bertentangan Principle #2.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode konkret — Event Bus belum diimplementasikan (🔵 Designed murni).

## 9. Migration Strategy

🔵 Designed murni — N/A untuk migrasi mundur. Sistem notifikasi existing (fire-and-forget function call) **tetap valid** dan **tidak wajib** dikonversi ke event bus kecuali domain tersebut benar-benar butuh multiple independent consumer (trigger otomatis untuk beberapa automation berbeda dari satu kejadian yang sama) — keputusan konversi per-domain, bukan migrasi menyeluruh otomatis.

## 10. Checklist

- [ ] Event dinamai past-tense (fakta, bukan perintah)
- [ ] Event finansial-kritis disimpan permanen ke Event Store
- [ ] Konsumen event idempotent
- [ ] Konversi ke event bus punya driver konkret (multiple consumer), bukan preventif

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Event non-idempotent yang menyebabkan efek ganda | 0 | Test + monitoring produksi |
| Domain dikonversi ke event bus tanpa driver konkret | 0 | Review ADR terkait |

## 12. References

- [06-agentic-ai-and-automation-architecture.md § Event Bus & Event Store](../../06-agentic-ai-and-automation-architecture.md#event-bus--event-store)
- [06-agentic-ai-and-automation-architecture.md § Queue Strategy](../../06-agentic-ai-and-automation-architecture.md#queue-strategy-retry-strategy-dead-letter-queue-idempotency-strategy)
- [04-quality-and-observability/28-error-handling-standard.md](../04-quality-and-observability/28-error-handling-standard.md)
- [GLOSSARY.md — Idempotency](../GLOSSARY.md)

---

*File selanjutnya: [36-ai-coding-guideline.md](36-ai-coding-guideline.md)*
