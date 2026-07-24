# HARDCODE CENSUS — Puraloka Suite

Inventarisasi aturan bisnis/operasional yang tertanam di kode (AKTA 1). Sumber perencanaan config-first (AKTA 3).

**Ember:**
- **[A] WAJIB CONFIG** — aturan bisnis yang berubah sesuai praktik kerja.
- **[B] BOLEH CONFIG** — teknis/UX; ubah kalau murah.
- **[C] HARUS TETAP DI KODE** — keamanan, invariant finansial, integritas relasional, struktur rumus. **Tidak boleh dijadikan config apa pun permintaannya.**

> Konvensi kolom "dampak salah config" = apa yang rusak kalau nilai ini salah diubah lewat UI.

---

## [A] WAJIB CONFIG — aturan bisnis

| # | Lokasi | Nilai | Ember | Alasan | Dampak salah config |
|---|---|---|---|---|---|
| A1 | `lib/tax-calculation.ts:3-5` + `company_settings` | PPN 0.11 / PPh final 0.02 | [A] ✅ **SUDAH** (1B.1) | Tarif pajak berubah regulasi. Sudah config + effective... **BELUM** (lihat catatan) | Salah tarif → invoice salah hitung |
| A2 | `003_projects...:20` `retention_pct DEFAULT 5.00` | Retensi 5% | [A] | Persentase retensi = kebijakan/negosiasi per proyek. Kolom per-proyek ADA, tapi **DEFAULT hardcode** + tak ada tabel kebijakan default perusahaan | Salah → retensi & pembayaran akhir salah |
| A3 | `003_projects...:22` `kasbon_limit_pct DEFAULT 80.00` | Kasbon max 80% earned | [A] ⚠️ **DEAD** | Migration 056 hapus enforcement (kolom work_scopes di-drop) TAPI `projects.kasbon_limit_pct` **masih ada, tak dipakai**. Aturan bisnis "batas kasbon" hilang diam-diam | Bila dihidupkan lagi → harus config, bukan 80 hardcode. Sekarang: kolom yatim |
| A4 | ~~`kasbons.ts:88` `validPurposes` + enum `kasbon_purpose`~~ ✅ **SELESAI** (migration 096) | 5 tujuan → master `kasbon_purposes` | [A] | Taksonomi tujuan kasbon bisa nambah | ~~enum + hardcode~~ → `kasbons.purpose` di-konversi enum→TEXT; validasi via lookup aktif; kelola di `/pengaturan/kasbon-purposes` (`kasbon_purposes:manage`). Tujuan baru langsung valid tanpa deploy |
| A5 | enum `expense_category_type` (5) + `expense_category_templates` | material, labor, equipment, operational, other | [A] | Kategori pengeluaran = taksonomi akuntansi operasional | Sama — nambah kategori butuh deploy |
| A6 | ~~`mandor/page.tsx:3258` `UNITS_GROUPED` (~15) **vs** `procurement/page.tsx` `UNITS` (13)~~ ✅ **SELESAI** (migration 090, PR #32) | **DUA daftar satuan divergen** → satu master `units` | [A] | Satuan pekerjaan/material = master data. Dua sumber kebenaran berbeda = bug konsistensi | ~~Item mandor & procurement pakai satuan beda~~ → sumber tunggal, kelola di `/pengaturan/satuan` |
| A7 | ~~`mandor/page.tsx` item kategori (CATEGORY_LABELS 12)~~ ✅ **SELESAI** (migration 094) | Kategori pekerjaan → master `work_categories` | [A] | Klasifikasi pekerjaan = master data | ~~Hardcode di UI~~ → sumber tunggal, kelola di `/pengaturan/kategori-pekerjaan` (`work_categories:manage`), pola sama units #32 |
| A8 | enum `payment_system` (3) | harian, borongan, progress_pct | [A]/[C] batas | Model bayar mandor = aturan bisnis. TAPI tiap nilai punya alur kalkulasi khusus di kode → nambah nilai butuh kode | Struktur = [C], daftar aktif/label = [A]. Jangan jadikan nilai baru "auto" tanpa kode |
| A9 | enum `contract_model` (2: termin, komisi) | Model kontrak | [A]/[C] batas | Tiap model punya alur invoice berbeda. Sama seperti A8 | idem |
| A10 | enum `tax_scheme` (2: pph_final, ppn) | Skema pajak | [A]/[C] batas | Kapan pph_final vs ppn = aturan pajak (perorangan vs badan). Struktur di kode, "kapan pakai apa" = domain rule | idem — lihat DOMAIN.md |
| A11 | **Role-literal gates F1-F4** (AKTA 0) | admin-only di register/CO approve/reject/MR delete | [A] | Otorisasi = capability config (ADR-004). Lockout role custom `direktur` | Sudah bug lockout. Fix AKTA 3 = derive-capability |
| A12 | **Soft capability filter F5-F8** (AKTA 0) | reports finance, search clients/invoices/users = admin\|\|pm | [A] | idem — kategori data disembunyikan by role literal | direktur tak lihat data yg berhak |
| A13 | `cash.ts:473` `autoApprove = admin\|\|pm` | Auto-approve expense | [A] → workflow | Aturan bisnis "siapa auto-approve" = kandidat Workflow Engine (1C), bukan konstanta | Pindah ke workflow, bukan permission murni |
| A14 | `contracts.ts:~518` klausa kontrak (dispute, dst) | Teks boilerplate kontrak | [A]/[B] | Klausa kontrak = kebijakan hukum perusahaan, idealnya template editable | Salah teks → kontrak keliru secara hukum |

---

## [B] BOLEH CONFIG — teknis/UX

| # | Lokasi | Nilai | Alasan | Dampak salah config |
|---|---|---|---|---|
| B1 | `index.ts:114`, `cash.ts:393`, `termin-payment.ts:121`, `documents.ts:96` (`MAX_SIZE_MB`), `settings.ts:245` | 5MB (multipart/doc/proof), 2MB (logo) | Cap upload; UX/biaya storage | Terlalu kecil → upload nota gagal |
| B2 | `rab.ts:585` `fileSize: 100 * 1024 * 1024` | **100MB** RAB import | Inkonsisten dgn cap lain (5MB). Kemungkinan kelupaan | 100MB = risiko DoS/memori |
| B3 | `cash.ts:177/348`, `finance.ts:170/512/717`, `kasbons.ts:17` | pagination cap **200** | Cap query; performa | Terlalu besar → query berat |
| B4 | `audit.ts:19`, `notifications.ts:16` | cap **100** | idem | idem |
| B5 | `notification-panel.tsx:235` `setInterval(tick, 30000)` | Polling notif 30s | Frekuensi refresh badge | Terlalu sering → beban server |
| B6 | `notifications.ts:287` dedup | 24 jam | Cegah notif duplikat | Terlalu pendek → spam notif |
| B7 | `mandor.ts:852/1721` rolling window | 30 hari "Tukang Aktif" | Definisi metrik KPI | Ubah window → angka KPI beda |
| B8 | `auth.ts:12` cookie `maxAge` | 7 hari | Umur sesi | Terlalu lama → risiko keamanan sesi |
| B9 | `documents.ts:122` signed URL | 10 tahun | Umur URL dokumen | Terlalu lama → link bocor selamanya |
| B10 | `dashboard.ts:31` period mapping | last_6_months → 24 (minggu) | Rentang chart | UX saja |

---

## [C] HARUS TETAP DI KODE — jangan pernah jadi config

| # | Lokasi | Hal | Alasan (kenapa config = bahaya) |
|---|---|---|---|
| C1 | RLS policies (049+), `has_permission()`, `hasPermission()` fail-closed | On/off RLS, default deny | **Config yang bisa melonggarkan keamanan = permukaan serangan.** RLS on/off atau "default allow" tidak boleh bisa diubah dari UI |
| C2 | `073_audit_append_only.sql` trigger | Immutability `audit_logs` | Audit yang bisa dimatikan lewat config = audit tak berguna sebagai bukti |
| C3 | `lib/tax-calculation.ts` STRUKTUR rumus (`base*rate`, `toFixed(2)`) | Rumus pajak (bukan tarif) | Tarif = config [A1]; **rumus = kode ber-test**. Rumus config = risiko salah hitung tak terkontrol |
| C4 | `lib/retention-calculation.ts` / trigger `value*pct/100` | Rumus retensi | idem — persentase config [A2], rumus kode |
| C5 | FK/constraint/`CHECK` (mis. `chk_termin_pct`, append-only, `rab_items_pct_sum`) | Integritas relasional | Integritas DB tidak boleh bisa dilonggarkan dari UI |
| C6 | `utils/mime.ts` magic-bytes | Validasi tipe file | Validasi keamanan; bypass = upload berbahaya |
| C7 | Double-entry `debit=kredit` (bila modul akuntansi 043-047 di-apply) | Invariant pembukuan | Invariant akuntansi; config = pembukuan rusak |
| C8 | `utils/workflow-sync.ts` fail-closed, `canTransition` fail-closed | Default tolak transisi | Melonggarkan = transisi approval liar |

---

## Status penutupan [A] (assessment 2026-07-24, penutupan Phase 1)

**SELESAI config-first:** A1 (tax effective-dated), A2 (retensi), A3 (kasbon limit toggle), A4 (kasbon purposes), A6 (units), A7 (work categories), A11 (F1-F4 derive-capability), A12 (F5-F8 derive-capability). Denda (baru) juga selesai.

**DITUNDA — dengan alasan eksplisit (bukan digantung):**
- **A5 (expense category types + templates):** Taksonomi pengeluaran SUDAH berbasis TABEL (`expense_category_templates`, di-clone per proyek) — bukan hardcode divergen seperti units. Yang tersisa: (1) enum `expense_category_type` (material/labor/equipment/operational/other) = klasifikasi akuntansi STABIL (jarang berubah, borderline [B]); (2) belum ada UI kelola template. **Ditunda** — bukan "business practice yang sering berubah", infrastruktur config sudah ada. Kandidat: UI kelola template (nice-to-have), bukan urgensi §12.
- **A8/A9/A10 (enum payment_system / contract_model / tax_scheme):** [A]/[C] **batas → tetap [C] untuk nilai enum-nya.** Tiap nilai punya ALUR KALKULASI/INVOICE khusus di kode (harian vs borongan vs progress_pct; termin vs komisi; pph_final vs ppn). Menjadikan nilai baru "config" = membuat nilai yang tak punya code path = rusak (panduan founder: "jangan jadikan nilai baru auto tanpa kode"). Tarif (yang [A] asli) SUDAH config (A1). Struktur tetap kode = benar. **Ditunda permanen kecuali ada model bayar/kontrak/pajak baru (butuh kode + ADR).**
- **A13 (cash autoApprove admin||pm):** BUKAN authorization gate — business rule "siapa auto-approve expense" (didokumentasikan ADR-004 Rule #6 di cash.ts:473). Rumahnya = **Workflow Engine Phase 2 (Program B)**, bukan permission murni. Retire 1C (ADR-006) tidak mengubah ini — Phase 2 = engine sebenarnya. **Ditunda ke Phase 2.**
- **A14 (klausa kontrak boilerplate):** Template teks hukum editable = fitur "contract template editor" tersendiri (lebih besar dari lookup). **Ditunda** sebagai fitur produk, bukan lookup config sederhana.

## Catatan lintas-ember

- **A1 (tax) belum tuntas:** tarif SUDAH di `company_settings` (1B.1) TAPI **tanpa effective dating**. Ubah PPN sekarang → invoice historis ikut berubah angkanya (bencana pembukuan). **AKTA 3 wajib tambah `berlaku_dari/berlaku_sampai`** + test "ubah tarif → invoice lama tak berubah". Ini menjembatani [A1] ke lengkap.
- **A3 (kasbon 80%) yatim:** kolom `projects.kasbon_limit_pct` masih ada tapi enforcement dihapus 056. Keputusan produk: hidupkan sebagai config, atau drop kolom. Angkat ke owner (DOMAIN.md ❓).
- **A6 unit divergen:** ✅ SELESAI — master `units` (migration 090, PR #32), dipakai mandor + procurement via `useUnits`, dikelola di `/pengaturan/satuan` (`units:manage`). Behavior-preserving: mandor simpan `code`, procurement simpan `symbol`; nol migrasi data lama.
- **Governance (AKTA 3):** semua [A] finansial (A1, A2, A3) wajib: effective dating + audit_logs perubahan + validasi range + permission khusus ubah tarif + fail-closed default.
- **Tabel workflow_* yatim (pasca CONTRACT 1C):** ✅ **DITUTUP** — founder memutuskan DROP, dieksekusi migration **095** tersendiri (092 sempat drop → 093 restore utk kembalikan keputusan → 095 drop resmi). Lihat AUDIT_REPORT OPEN-2 + ADR-006.
