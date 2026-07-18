# 18 — Never Build List

> **Maturity:** 🟢 Enforced — daftar ini adalah keputusan arsitektur yang sudah dibuat dan disepakati di [04-roadmap-governance-and-delivery.md § Never Build List](../../04-roadmap-governance-and-delivery.md#never-build-list), dirujuk ulang di sini sebagai aturan mengikat kode, bukan hanya catatan strategi.

**Kedudukan:** Batch 6 — Governance. Mengoperasionalkan keputusan strategis di [04-roadmap-governance-and-delivery.md](../../04-roadmap-governance-and-delivery.md) menjadi larangan konkret yang **MUST** dicek sebelum implementasi apa pun dimulai. Melengkapi [19-architecture-decision-record-guide.md](19-architecture-decision-record-guide.md) — mengubah item di daftar ini butuh ADR.

---

## 1. Purpose

Mencegah kerja terbuang membangun kapabilitas yang sudah diputuskan sadar untuk **tidak** dibangun — daftar ini bukan "belum sempat," tapi keputusan aktif dengan alasan eksplisit, supaya tidak ada yang mengusulkan ulang tanpa membaca dulu kenapa sudah ditolak.

## 2. Background

[04-roadmap-governance-and-delivery.md § Never Build List](../../04-roadmap-governance-and-delivery.md#never-build-list) mendaftar kapabilitas yang secara sadar dikeluarkan dari roadmap — baik karena kompleksitas tidak sepadan manfaat pada skala Puraloka Suite hari ini, atau karena bertentangan dengan strategi arsitektur inti (modular monolith, bukan microservices). Ini bukan larangan permanen absolut — item bisa dipindah keluar dari daftar ini lewat ADR jika konteks berubah signifikan (lihat Migration Strategy).

## 3. Principles

1. **"Never" berarti "tidak sekarang, dan alasan penolakannya masih berlaku" — bukan "tidak pernah dalam kondisi apa pun."** Setiap item punya kondisi eksplisit yang, jika berubah, membuka jalan untuk ADR baru.
2. **Menambah item ke Never Build List sama validnya dengan membangun fitur.** Mencegah scope creep adalah pekerjaan arsitektur yang sah, bukan pekerjaan "negatif."
3. **Saga Pattern, Event Sourcing penuh, dan microservices ekstraksi dini adalah contoh konkret yang sudah ditolak** ([01-application-and-data-architecture.md § Service Extraction Strategy](../../01-application-and-data-architecture.md#service-extraction-strategy)) — kompleksitas operasionalnya (compensating transaction, eventual consistency) tidak sepadan manfaat pada modular monolith single-database hari ini.

## 4. Mandatory Rules

1. Implementasi yang termasuk kategori Never Build List **MUST NOT** dimulai tanpa ADR baru yang secara eksplisit membalikkan keputusan tersebut — **MUST NOT** diimplementasikan diam-diam dengan alasan "kali ini beda konteksnya" tanpa dokumentasi formal.
2. Saga Pattern atau distributed transaction **MUST NOT** diimplementasikan selama arsitektur tetap modular monolith dengan single database — transaksi lintas domain **MUST** memakai Postgres transaction biasa.
3. Ekstraksi service/microservice baru **MUST NOT** dilakukan tanpa driver operasional konkret yang didokumentasikan (skala trafik nyata, kebutuhan scaling independen) — **MUST NOT** diekstrak preventif "supaya lebih modern" tanpa bukti kebutuhan.

## 5. Recommended Rules

1. Ide fitur yang berpotensi masuk kategori Never Build List **SHOULD** dicek terhadap daftar ini sebelum diusulkan ke user — menghemat waktu diskusi untuk hal yang sudah ada jawabannya.

## 6. Anti-Pattern

**Mengimplementasikan Item Never Build List "Untuk Belajar" atau "Best Practice"** — menambahkan distributed tracing lengkap, atau memulai ekstraksi microservice, dengan alasan "ini kan best practice industri," tanpa mempertimbangkan bahwa keputusan menolaknya sudah dibuat sadar berdasarkan konteks skala dan arsitektur Puraloka Suite spesifik — bukan ketidaktahuan akan best practice tersebut.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode — daftar konkret item ada di [04-roadmap-governance-and-delivery.md § Never Build List](../../04-roadmap-governance-and-delivery.md#never-build-list), tidak diduplikasi di sini untuk menghindari dua sumber kebenaran (single source of truth tetap di doc 04, file ini hanya menegakkannya sebagai aturan kode).

## 9. Migration Strategy

N/A untuk migrasi mundur — daftar ini adalah larangan ke depan, tidak ada kode existing yang melanggarnya untuk dimigrasikan. Item bisa dikeluarkan dari daftar hanya lewat ADR baru yang menjelaskan perubahan konteks (mis. trafik bertambah signifikan sehingga horizontal scaling benar-benar dibutuhkan) — **MUST** mengikuti proses ADR penuh ([19-architecture-decision-record-guide.md](19-architecture-decision-record-guide.md)), bukan keputusan sepihak dalam satu PR implementasi.

## 10. Checklist

- [ ] Fitur/pattern yang diusulkan dicek dulu terhadap Never Build List
- [ ] Jika termasuk daftar, ADR baru dibuat sebelum implementasi dimulai
- [ ] Saga pattern/distributed transaction tidak diimplementasikan tanpa perubahan arsitektur dasar

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Implementasi item Never Build List tanpa ADR | 0 | Review PR + arsitektur |

## 12. References

- [04-roadmap-governance-and-delivery.md § Never Build List](../../04-roadmap-governance-and-delivery.md#never-build-list)
- [01-application-and-data-architecture.md § Service Extraction Strategy](../../01-application-and-data-architecture.md#service-extraction-strategy)
- [19-architecture-decision-record-guide.md](19-architecture-decision-record-guide.md)

---

*File selanjutnya: [19-architecture-decision-record-guide.md](19-architecture-decision-record-guide.md)*
