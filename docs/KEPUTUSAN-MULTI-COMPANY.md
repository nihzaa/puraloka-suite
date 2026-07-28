# Keputusan Arsitektur: Multi-Company (dan Arsip Multi-Currency)

**Tanggal:** 2026-07-26 · **Status:** REKOMENDASI — menunggu ack Nizar; bila di-ack,
dipromosikan jadi ADR resmi di Engineering-Constitution.
**Konteks:** sesi perencanaan verifikasi taksonomi ERP. Pemicu: dua near-miss sumbu
data (`unit`, `edisi AHSP`) — owner tidak mau kecolongan ketiga.

---

## 0. Prinsip uji yang dipakai (pelajaran unit/edisi, dirumuskan eksplisit)

> **Sebuah sumbu data WAJIB ada SEBELUM data masuk HANYA JIKA ketiadaannya membuat
> data lama tidak dapat ditafsirkan ulang secara mekanis.**

- `unit` **lolos uji** (wajib duluan): "koefisien 0,7" — 0,7 *apa*? Tanpa satuan,
  angka lama tak terbaca. Backfill mustahil tanpa menebak.
- `edisi AHSP` **lolos uji**: item dari SNI 2013 vs SE 47/2026 tercampur dalam satu
  katalog tak bisa dipisahkan lagi setelah seed.
- `currency` **TIDAK lolos uji**: semua baris existing tak-ambigu IDR. Backfill
  `DEFAULT 'IDR'` kapan pun = lossless.
- `company_id` **TIDAK lolos uji (hari ini)**: semua data tak-ambigu milik satu
  entitas (Puraloka Persada). Backfill kapan pun = lossless. **TAPI lihat §2
  tripwire — ada satu titik di masa depan di mana uji ini berbalik.**

---

## 1. Multi-currency — DICORET (keputusan owner 2026-07-26)

Owner menetapkan: semua proyek Rupiah; jangan rekomendasikan kolom kurs/mata uang;
cukup pastikan tipe data uang benar.

**Verifikasi tuntas — syarat terpenuhi:**
- Seluruh kolom uang: **NUMERIC/DECIMAL, nol FLOAT/REAL/DOUBLE** (grep seluruh
  `supabase/migrations/`, 96 kolom moneter di 44 tabel).
- Bonus terverifikasi: timestamp **100% TIMESTAMPTZ** (224 kolom, nol TIMESTAMP polos).
- 3 kolom `currency` yang telanjur ada (`cash_accounts` 016, `price_book_entries` 104,
  `lesson_propagation_proposals` 114) semuanya `DEFAULT 'IDR'` dan tidak dipakai untuk
  konversi — **biarkan, jangan diperluas, jangan dihapus** (harmless; menghapus =
  migration destruktif tanpa manfaat).

Ini sekaligus menyelesaikan kontradiksi dokumen: taksonomi versi awal ("murah
sekarang, mahal nanti") vs Never Build List roadmap 04 ("Multi-currency di L1/L2 —
tidak relevan"). **Resolusi: Never Build List benar; entri taksonomi sudah dikoreksi.**

---

## 2. Multi-company — REKOMENDASI TEGAS

### Fakta terverifikasi

| Fakta | Nilai |
|---|---|
| Tabel butuh `company_id` LANGSUNG | **±37** (≈36 master/config/RBAC/knowledge-base + `projects` sebagai akar) |
| Tabel mewarisi via `project_id → projects.company_id` | ±62 |
| Tabel `companies` hari ini | **Tidak ada** |
| Jejak yang sudah ada | 1 kolom yatim `feature_flags.company_id` (077, tanpa FK, komentar "terisi mulai L2") |
| Desain retrofit | **Sudah lengkap**: `companies` (+parent self-ref), dual-axis RLS (role × company), readiness checklist 6 item — `Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md` + `01-application-and-data-architecture.md` §Entity Strategy |
| Posisi roadmap | Phase 7 (Program D). ADR-009 meng-exclude `company_id` dari 17 tabel CECEP secara sadar, 17× |
| Konteks isolasi | RLS table **dormant** (API pakai service_role) → menambah kolom sekarang TIDAK memberi isolasi apa pun; isolasi nyata harus lewat layer API |

### ⚠️ STATUS: KEDUA TRIPWIRE AKTIF — keputusan di bawah SUDAH DIGANTI (2026-07-28)

> **Rekomendasi "JANGAN tambahkan `company_id` sekarang" di bawah TIDAK LAGI
> BERLAKU.** Kedua tripwire §2 di bawah terpicu pada 2026-07-28:
>
> - **Tripwire #2 terjawab founder:** sistem akan dijual sebagai SaaS (**calon
>   pelanggan konkret sudah ada**) DAN founder akan membentuk badan usaha kedua.
> - **Tripwire #1 akan tersentuh:** CECEP langkah 7 (RAP/Pagu) = commitment ledger.
>
> Keputusan pengganti: **`docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md`** (ACCEPTED).
> Mandat "tuntaskan CECEP dulu" **ditunda founder 2026-07-28**: CECEP DITUNDA
> (bukan dibekukan — hasil langkah 1–6 tetap utuh & dipakai), multi-tenant
> dikerjakan **tuntas** dulu (ADR-011 §2 D1). Rasionalisasi: sistem belum dipakai
> operasional nyata → nol data produksi = waktu termurah untuk retrofit pondasi.
>
> Dokumen ini **tidak salah** — kondisinya berubah persis lewat mekanisme tripwire
> yang ia rancang sendiri. Bagian di bawah dipertahankan sebagai jejak alasan
> historis; **jangan diikuti sebagai instruksi.**

### ~~Keputusan yang direkomendasikan~~ (SUPERSEDED — lihat kotak di atas)

~~**JANGAN tambahkan `company_id` sekarang.**~~ Tetap Phase 7 sesuai ADR-009/roadmap.
Alasan historis: (a) tidak lolos uji ambiguitas §0 — retrofit lossless; (b) bukan
blind-spot, melainkan keputusan sadar terdokumentasi dengan jalur retrofit yang sudah
dirancang; (c) tanpa RLS live, kolomnya kosmetik; (d) keputusan founder 2026-07-26 di
ERP_MASTER_PLAN: tuntaskan CECEP dulu sebelum modul besar lain — menyisipkan
migrasi ±37 tabel sekarang menabrak mandat itu.

### DUA TRIPWIRE — kondisi yang MEWAJIBKAN keputusan ini dibuka ulang lebih awal

1. **SEBELUM modul finansial ber-ledger berikutnya dibangun** — WIP/laporan
   persentase penyelesaian (PSAK), commitment ledger, apalagi GL/jurnal.
   Inilah titik di mana uji §0 **berbalik**: begitu ledger berisi jurnal/laporan
   per-entitas, backfill `company_id` tidak lagi lossless (angka gabungan dua
   entitas tak bisa dipisah mekanis). **Ledger = "knowledge base yang mau di-seed"
   versi keuangan.** Kecolongan-ketiga yang paling realistis ada DI SINI, bukan di
   kolom mata uang. Aturan praktis: *tiket pertama modul ber-ledger wajib diawali
   keputusan company (cukup keputusan + ADR, belum tentu implementasi penuh).*
2. **Entitas hukum kedua (PT/CV) menjadi rencana nyata** — pola lazim kontraktor
   Indonesia yang tumbuh: pecah entitas untuk tender/pajak/risiko (alasan owner
   sendiri mempertahankan topik ini). ❓ **Pertanyaan terbuka untuk Nizar:** apakah
   entitas kedua realistis dalam 1–2 tahun? Jika ya, Phase 7 sebaiknya dimajukan
   ke posisi segera setelah CECEP siap-pakai.

### Guardrail murah yang BERLAKU SEKARANG (tanpa menunggu Phase 7)

1. **Dilarang tabel single-row baru** (pola `company_profile` jangan ditiru).
2. **Config baru wajib scope-able** — pola `company_settings` (key UNIQUE global)
   jangan ditiru; desain key baru harus bisa diberi dimensi company nanti tanpa
   ubah bentuk.
3. **Numbering series baru dirancang scope-able** (nomor PO/MR/GR/CO/invoice per
   entitas adalah kebutuhan hari-1 multi-company; hari ini mayoritas hardcoded —
   sudah tercatat sebagai utang di taksonomi §1).
4. **Jangan hardcode "Puraloka Persada" di logic** (aturan roadmap 04 baris 90,
   ditegaskan ulang).
5. Kolom yatim `feature_flags.company_id` **dibiarkan** — jangan diberi FK sebelum
   tabel `companies` lahir.

---

## 3. Rekonsiliasi dokumen (kewajiban AUTOPILOT §2 — tidak ada yang dipilih diam-diam)

| Kontradiksi | Resolusi |
|---|---|
| Taksonomi (awal) "multi-currency & company murah sekarang" vs roadmap/ADR-009 "tunda" | Roadmap menang, dengan alasan §0; taksonomi sudah dikoreksi; currency dicoret owner |
| "Phase 7" bermakna ganda: roadmap EA = multi-company; ERP_MASTER_PLAN = GL | Ditandai sebagai tabrakan penomoran sumbu ke-4 — didokumentasikan di PETA-PRIORITAS; penulisan wajib menyebut sumber ("Phase 7 EA" vs "Fase 7 MASTER_PLAN") sampai NUMBERING-GLOSSARY diperluas |
| ADR-009 exclude company_id vs kebutuhan jangka panjang | Tetap berlaku + 2 tripwire di §2 sebagai amendemen yang diusulkan |
