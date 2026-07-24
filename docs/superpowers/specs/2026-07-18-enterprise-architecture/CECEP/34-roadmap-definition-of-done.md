# CECEP Roadmap V2 — Definition of Done

**Kedudukan:** Satu Definition of Done untuk SELURUH Roadmap V2 ([`32`](32-cecep-roadmap-v2.md)) — bukan DoD per fase. Setiap fase (3 dan seterusnya) merujuk dokumen ini sebagai kriteria kelulusan, bukan menulis ulang kriterianya sendiri. Lahir dari [`33-roadmap-integrity-audit.md`](33-roadmap-integrity-audit.md) yang membuktikan roadmap sendiri sudah lolos audit struktural — dokumen ini adalah checklist eksekusi supaya kelulusan struktural itu tidak percuma karena isinya ditulis longgar.
**Status:** Efektif sejak Roadmap V2 Approved and Frozen (`33`). Berlaku untuk Fase 3 dan seterusnya. Fase 1/2/4/6 (sudah selesai, `01`/`02`/`03`/`03b`) tidak perlu diuji ulang terhadap DoD ini — mereka sudah lolos lewat `29`.

---

## Sebuah fase dianggap SELESAI hanya jika:

1. ✓ **Memperkuat minimal satu capability Construction Cost Engineering** (Article 2, `30`) — Tender, BOQ, AHSP, RAB, RAP, Procurement Planning, Cost Control, Cashflow, Forecasting, AI Estimation, Historical Cost Intelligence, dst.
2. ✓ **Mengurangi implementation uncertainty** (Article 7, `30`) — ada pertanyaan konkret yang sebelumnya tidak terjawab, sekarang terjawab dengan cukup detail untuk mulai desain skema/API/UI.
3. ✓ **Menghasilkan artefak arsitektur konkret** — bukan hanya narasi/filosofi. Artefak harus bisa ditunjuk sebagai objek nyata (Capability Map, Strategy pattern, skema konseptual), bukan sekadar "pemahaman lebih dalam".
4. ✓ **Tidak memperkenalkan konsep Enterprise Framework yang reusable sebagai FOKUS dokumen** (Article 4/8, `30`) — boleh dipakai sebagai alat (persis pola Fase 6/`03b` memakai DDD), tidak boleh jadi subjek.
5. ✓ **Lolos Construction Removal Test** — hapus semua kata "construction/konstruksi" dari dokumen; kalau isinya masih masuk akal berdiri sendiri, fase itu terlalu generik dan belum selesai.
6. ✓ **Memenuhi CECEP Constitution** (`30`, delapan Artikel) secara penuh, bukan sebagian.
7. ✓ **Meningkatkan implementation readiness** — seseorang yang belum terlibat proses penemuan bisa membaca dokumen fase ini dan langsung tahu apa yang harus dibangun selanjutnya, tanpa perlu ikut proses penalarannya.
8. ✓ **Menyertakan Derivation Trace dengan Trace Status per keputusan** *(berlaku Fase 4 dan seterusnya, per [`39-phase-transition-notice-discovery-closed.md`](39-phase-transition-notice-discovery-closed.md) dan [`40-architecture-derivation-constitution.md`](40-architecture-derivation-constitution.md))* — setiap keputusan dalam dokumen ditelusuri eksplisit ke Mission/Principles/Confirmed Domain/Frozen Capability/Interaction Map, format baku:
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
   **Ditambah, per keputusan desain (Aggregate Root/Entity/Value Object) yang muncul di dokumen — kolom Trace Status wajib, dihitung lewat 10-Level Evidence Hierarchy** ([`41-evidence-hierarchy.md`](41-evidence-hierarchy.md)):
   ```
   Entity/Root Name    → ✓ Fully Derived / ⚠️ Requires ADR (level X) / ❌ Invented (level X)
   ```
   ❌ Invented DILARANG bertahan di versi Freeze — kalau ditemukan, diubah jadi ⚠️ dengan ADR diajukan atau dihapus. Kalau ada baris ✓/⚠️/❌ yang tidak bisa ditentukan jujur: BUKAN dihapus diam-diam — ditandai eksplisit sebagai Open ADR, fase berhenti sampai ADR diputuskan.

## Cara Memakai DoD Ini

- Setiap fase (3 dan seterusnya) WAJIB menjalankan poin 1-7 (dan poin 8 mulai Fase 4) sebagai self-check di akhir dokumennya sendiri — bagian penutup fase memuat tabel kecil ✓/✗ per poin, bukan narasi panjang.
- Kalau ada satu poin ✗: fase BELUM selesai, direvisi di tempat sebelum lanjut ke fase berikutnya (siklus **Phase → Review → Freeze** yang founder tetapkan, bukan "lanjut dulu, perbaiki nanti").
- DoD ini TIDAK memicu audit tambahan terpisah (`29`/`33` sudah cukup sebagai lapis metodologi) — ini murni checklist eksekusi per fase, dijalankan oleh penulis fase itu sendiri sebagai bagian dari definisi "selesai".
- Kalau DoD ini sendiri ternyata perlu direvisi di kemudian hari, itu perlu bukti konkret dari eksekusi fase nyata yang gagal salah satu poin dengan cara yang menunjukkan poinnya sendiri salah — bukan preferensi gaya.

---

## 🔒 FREEZE

DoD ini berlaku efektif untuk Fase 3 dan seterusnya, mulai sekarang.
