# CECEP — Phase Transition Notice: Discovery Closed, Derivation Mode Begins

**Kedudukan:** Bukan fase, bukan ADR — ini adalah perubahan MODE OPERASI yang mengikat seluruh pekerjaan CECEP mulai Fase 4 dan seterusnya. Ditulis sebagai dokumen permanen (bukan hanya instruksi dalam percakapan) karena aturannya harus bisa dirujuk balik oleh siapa pun, kapan pun, termasuk sesi kerja yang berbeda — sama alasan Constitution (`30`) ditulis sebagai file, bukan sekadar disepakati lisan.
**Dipicu oleh:** Keputusan founder pasca-Freeze Phase 3 ([`38`](38-phase3-domain-readiness-assessment.md)).
**Berlaku untuk:** Fase 4 (Domain Model) sampai Fase 12 (Documentation Package) — seluruh sisa Roadmap V2 ([`32`](32-cecep-roadmap-v2.md)).

---

## Pernyataan Inti

> Discovery is permanently closed. Phase 4 onward is a derivation exercise. You are no longer allowed to invent. You are only allowed to derive. Every design decision must be traceable to the frozen architecture. If a decision cannot be derived, stop and open an ADR. Do not continue.

## Apa yang Berubah

| Sebelum (Fase 1-3, Discovery/Capability) | Sesudah (Fase 4-12, Derivation) |
|---|---|
| "Mungkin ada capability baru di sini" diperbolehkan sebagai hipotesis yang diuji | **DILARANG.** Capability sudah Frozen (`35`-`38`) — tidak ada capability baru muncul di Fase 4+ |
| "Menurut saya X adalah desain yang tepat" sah sebagai penilaian arsitek | **DILARANG** sebagai justifikasi tunggal. Setiap keputusan harus punya rantai turunan eksplisit dari Mission→Principles→Domain→Capability→Interaction |
| Menemukan domain baru = hasil kerja yang valid (`03b` § B Candidate Domain) | Menemukan "domain baru" di Fase 4+ = **sinyal berhenti**, bukan temuan yang diteruskan diam-diam |
| Scope boleh melebar kalau bukti kuat mendukung | Scope TIDAK BOLEH melebar — pelebaran scope hanya lewat ADR eksplisit, tidak pernah sebagai bagian rutin satu dokumen fase |

## Aturan Operasional

1. **Tidak ada Discovery baru.** Tidak mendefinisikan ulang capability, domain, atau business concept apa pun yang sudah ada di `01`/`02`/`03`/`03b`/`35`-`38`.
2. **Tidak memperluas scope.** Kalau sebuah kebutuhan implementasi terasa butuh sesuatu yang tidak ada di baseline Frozen, itu BUKAN alasan untuk menambahkannya langsung — itu sinyal untuk STOP.
3. **Setiap keputusan desain harus DIDERIVASI, bukan diusulkan.** Pola wajib:
   ```
   Capability (35) → Interaction Map (37) → Business Output → Aggregate Root/Entity/Value Object
   ```
   Bukan:
   ```
   "Menurut saya struktur yang masuk akal adalah..."
   ```
4. **Kalau sebuah keputusan TIDAK BISA diderivasi** dari Mission/Principles/Confirmed Domain/Frozen Capability/Interaction Map — berhenti. Ajukan sebagai ADR (pola `31`/ACR-004 di `04a`), jangan diam-diam diteruskan sebagai "penyempurnaan kecil".
5. **Objective Fase 4 diganti kata kuncinya:** bukan "Design Domain Model", tapi **"Derive Domain Model"** — satu kata, filosofi berbeda total. Desain menyiratkan pilihan bebas; derivasi menyiratkan hasil yang sudah ditentukan oleh lapisan di atasnya, tinggal dibuat eksplisit.

## Kewajiban Struktural — Derivation Trace

**Mulai Fase 4, setiap dokumen WAJIB membuka atau menutup dengan bagian ini:**

```
## Derivation Trace

This document derives from:
✓ Mission (01/02)
✓ Principles (04)
✓ Confirmed Domain (03b)
✓ Frozen Capability (35-38)
✓ Capability Interaction (37)

No new business concepts introduced.
```

Kalau ada baris yang TIDAK bisa dicentang — itu bukan alasan menghapus baris itu diam-diam. Itu artinya dokumen tersebut memuat sesuatu yang belum lolos derivasi, dan harus ditandai eksplisit sebagai **Open ADR**, bukan diloloskan sebagai bagian normal dokumen.

**Nilai jangka panjang:** Kalau reviewer bertanya "kenapa ada Aggregate Root `Estimate Version`?", jawabannya harus berupa rantai yang bisa ditelusuri (Mission → Capability → Interaction → Output → Aggregate Root), bukan "karena masuk akal secara desain". Ini pembeda CECEP dari kebanyakan Enterprise Architecture — bukan hanya Mission→Capability→Domain→Implementation, tapi rantai penuh dengan Derivation Trace yang membuat setiap keputusan bisa dipertanggungjawabkan bertahun-tahun kemudian.

## Hubungan dengan Dokumen Governance Lain

- **Tidak menggantikan** [`30-cecep-constitution.md`](30-cecep-constitution.md) — Constitution tetap mengatur BATAS domain (apa yang boleh masuk CECEP). Notice ini mengatur MODE KERJA (bagaimana keputusan dalam batas itu diambil).
- **Memperkuat** [`34-roadmap-definition-of-done.md`](34-roadmap-definition-of-done.md) — Derivation Trace ditambahkan sebagai kriteria ke-8 DoD, berlaku Fase 4 ke atas (lihat `34` yang sudah diperbarui).
- **Konsisten dengan** pola ACR-004 (`04a`) — kalau derivasi gagal dan sebuah konsep baru genuinely dibutuhkan, jalurnya adalah ADR resmi, bukan revisi diam-diam.

---

## 🔒 STATUS: EFEKTIF SEGERA

Berlaku mulai Fase 4. Tidak memerlukan Freeze terpisah — ini adalah mode operasi permanen untuk sisa roadmap, bukan artefak fase yang dihasilkan sekali lalu selesai.
