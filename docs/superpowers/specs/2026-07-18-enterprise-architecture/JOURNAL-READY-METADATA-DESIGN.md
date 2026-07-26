# Journal-Ready Metadata — Rancangan (REPORT ONLY, belum diterapkan)

> **Status:** rancangan untuk ditinjau founder. **Tidak ada kode/skema yang diubah.**
> Menjawab permintaan: definisikan field, register event uang existing + coverage,
> dan kompatibilitas dengan CoA/PSAK yang kelak dipakai GL (Modul 10).
> Tujuan: memastikan tiap event pemindah-uang ke depan cukup termetadata untuk
> **merekonstruksi jurnal** nanti — tanpa membangun GL sekarang.

---

## A. Prinsip penentu (menyelaraskan dengan Zero-Invention + No-Data-Duplication)

**Keputusan inti: akun + arah debit/kredit TIDAK distempel per-baris.** Alasannya:

1. **Akun & arah adalah ATURAN (config), bukan FAKTA per-transaksi.** "Kasbon approved → Debit 1122, Kredit 1112" berlaku untuk SEMUA kasbon — itu satu rule, bukan data tiap baris.
2. Menstempel debit/kredit ke tiap baris = **menduplikasi rule ribuan kali** → langgar prinsip No-Data-Duplication (contoh "Harga Beton Rp1.230.000 ditelusuri ke Price Book, bukan disalin") dan **ADR-009** (persistence derived, not invented).
3. **Salah-beku:** kalau CoA berubah (akun di-refine, tarif pajak ganti), stempel per-baris jadi usang; rule ber-effective-date tidak.

**Konsekuensi:** yang WAJIB tertangkap per-event adalah **FAKTA yang dibutuhkan untuk MENERAPKAN rule** — tanggal-akuntansi, nominal, dimensi (proyek, klasifikasi biaya, lawan-transaksi), dan referensi stabil. Akun/arah diturunkan dari **posting-rule registry** saat GL dibangun.

Ini juga sejalan pola yang sudah dipakai: **PPN effective-date** (rate × dpp_factor sebagai rule, bukan angka beku) dan **hsp_raw vs hsp_rounded** (presisi penuh internal; pembulatan hanya di dokumen).

---

## B. Envelope field — apa yang "cukup untuk merekonstruksi jurnal"

| Field | Peran di jurnal | Status sekarang |
|---|---|---|
| `event_type` (kanonik) | memilih posting-rule | **implisit** dari nama tabel → perlu kanonikalisasi (registry) |
| `source_table` + `source_id` | jejak ke dokumen sumber | **ada** (identitas baris) |
| `effective_date` (**tanggal akuntansi**) | periode jurnal | **sebagian** pakai `*_date`; sebagian hanya `created_at` (bukan tgl akuntansi) → **gap** |
| `amount` (nominal) + konvensi tanda | nilai debit/kredit | **ada di semua** (nama kolom beragam) |
| `currency` | mata uang | **tak ada** — implisit IDR (dokumentasikan; tambah bila multi-currency) |
| `project_id` (segment) | P&L per proyek | **ada di mayoritas** |
| `cost_code_id` / klasifikasi | akun beban 5xxx mana | **sebagian** (kategori expense/RAB) → **gap** di beberapa |
| counterparty (klien/supplier/mandor/worker) | sub-ledger AR/AP/uang muka | **ada** via `*_id` |
| `cash_account_id` | akun kas 111x mana | **ada** di event yang menyentuh kas |
| status/lifecycle | kapan event "posted" | **ada di mayoritas** (approved/paid/confirmed) |

**Temuan besar:** input rekonstruksi (nominal, tanggal, referensi, dimensi kas, lifecycle) **sudah ada** di hampir semua tabel. Yang kurang bukan "akun/arah" (memang by-design tidak per-baris) melainkan **konsistensi**: tanggal-akuntansi eksplisit + dimensi klasifikasi biaya di beberapa event.

---

## C. Register event pemindah-uang existing + coverage

Legenda: ✓ ada · ◐ sebagian/perlu dipastikan · ✗ tak ada (by-design untuk kolom akun).

| Tabel event | nominal | tgl-akuntansi | status/lifecycle | referensi | dimensi kas | akun GL |
|---|---|---|---|---|---|---|
| `kasbons` | ✓ amount | ✓ kasbon/approved/settled_at | ✓ status+approved_by | ✓ project/scope | ✓ cash_account_id | ✗ (rule) |
| `worker_kasbons` | ✓ amount, amount_settled | ◐ kasbon_date (tanpa status kol) | ◐ tak ada `status` | ✓ worker/mandor/project | ✓ cash_account_id | ✗ |
| `payments` (invoice dibayar) | ✓ amount_paid | ✓ paid_at | ✓ paid_at | ✓ invoice_id/ref | ✓ cash_account_id | ✗ |
| `invoices` | ✓ total/base/tax/retensi/due | ✓ issued/due/paid_date | ✓ status | ✓ project/termin/invoice_no | ✗ (bukan kas langsung) | ✗ |
| `supplier_payments` (PO lunas) | ✓ amount | ✓ payment_date | ◐ tak ada `status` | ✓ supplier/ref | ✓ cash_account_id | ✗ |
| `project_expenses` | ✓ total/billed | ✓ expense/reviewed_at | ✓ status | ✓ project/category | ◐ petty/main_cash_id | ✗ |
| `cash_transfers` | ✓ amount | ✓ transfer/confirmed_at | ✓ status+confirmed_by | ✓ from/to/ref | ✓ from/to_account_id | ✗ |
| `borongan_settlements` | ✓ borongan/kasbon/progress/other | ✓ settled_at | ◐ approved_by | ✓ scope | ✓ cash_account_id | ✗ |
| `progress_payments` | ✓ earned_value | ✓ paid_at | ✓ status+approved_by | ✓ scope/ref | ✓ cash_account_id | ✗ |
| `daily_wage_logs` | ✓ total_amount | ✓ work_date | ✗ tak ada | ◐ scope only | ✗ | ✗ |
| `weekly_wage_reports` | ✓ subtotal/deduction/net | ✓ submitted/reviewed/paid_at | ✓ status | ✓ assignment/scope | ✓ cash_account_id | ✗ |
| `tax_records` | ✓ base/tax_amount | ◐ hanya created_at | ✓ status | ✓ invoice/efaktur | ✗ | ✗ |
| `termin_schedules` | ✓ amount | ✓ target_date | ✓ status | ✓ project/termin_no | ✗ | ✗ |
| `expense_reports` (komisi) | ✓ material/labor/…/total | ✓ report/approved_at | ✓ status | ✓ project | ✗ | ✗ |
| `expense_items` | ✓ subtotal | ✓ receipt_date | ✗ | ✓ report/category | ✗ | ✗ |
| `supplier_invoices` (utang) | ✓ total/paid/due | ✓ invoice/due_date | ✓ status | ✓ supplier/project/GR | ✗ | ✗ |
| `stock_movements` (material dipakai) | ✗ (qty, bukan Rp) | ◐ created_at | ✗ | ✓ project/material/ref | ✗ | ✗ |

**Gap yang perlu ditutup untuk journal-ready (bukan sekarang — daftar keputusan):**
- **Tanggal-akuntansi eksplisit** di `tax_records`, `stock_movements`, `worker_kasbons` (kini hanya `created_at`).
- **Lifecycle/status** di `worker_kasbons`, `supplier_payments`, `daily_wage_logs`, `expense_items` (kapan "posted").
- **Nilai rupiah** untuk `stock_movements` (material dipakai perlu nilai persediaan → dari FIFO cost, sudah ada di procurement; tinggal ditautkan saat GL).
- **Klasifikasi biaya (`cost_code_id`)** konsisten agar map ke 5xxx.

---

## D. Posting-rule registry (dibangun saat GL / Modul 10 — bukan sekarang)

Menjadikan tabel "Auto-Jurnal per Event Bisnis" (Modul 10) sebagai **config first-class + effective-dated**:

```
posting_rules (
  event_type            text,      -- 'kasbon.approved', 'invoice.paid', ...
  effective_from        date,      -- rule ber-effective-date (CoA/tarif berubah aman)
  debit_account_code    text,      -- FK CoA (1122, 5110, ...)
  credit_account_code   text,      -- FK CoA
  amount_source         text,      -- kolom nominal di event
  effective_date_source text,      -- kolom tgl-akuntansi di event
  dimension_map         jsonb      -- {segment: project_id, cost: cost_code_id, party: ...}
)
```

Rekonstruksi jurnal = `event × posting_rule(event_type, effective_date)` → `journal_entry_lines`. **Nol angka akun disalin ke event.**

---

## E. Yang CUKUP dilakukan sekarang (asuransi murah — TETAP tunggu keputusan founder)

Behavior-preserving, tidak menyentuh angka:
1. **Pastikan tiap event uang punya tanggal-akuntansi eksplisit** (bukan hanya `created_at`) — kolom baru berdefault dari tgl dokumen yang sudah ada, atau derivasi terdokumentasi.
2. **Isi dimensi** (`project_id` + klasifikasi biaya) konsisten di tiap event.
3. **(Opsional, direkomendasikan)** satu ledger korelasi append-only `financial_events`:
   `{event_type, source_table, source_id, effective_date, amount, currency, project_id, cost_code_id, counterparty_type/id, cash_account_id, status, occurred_at}` — **TANPA akun/arah**. Ditulis fire-and-forget saat event commit (pola sama `audit_logs`/`notifications`). Inilah "stempel" yang dimaksud: tipis, faktual, **tak menduplikasi rule**, dan menjadi satu titik-baca saat GL dibangun.

Opsi (3) vs "tambah kolom di tiap tabel": ledger tunggal lebih murah dirawat, satu skema, tak menyentuh 17 tabel, dan aman di-backfill.

---

## F. Kompatibilitas CoA / PSAK

- **Dimensi proyek = segment** untuk P&L per proyek + **percentage-of-completion** (PSAK kontrak konstruksi) — sudah tertangkap via `project_id`.
- **Klasifikasi biaya** (material/upah/alat/subkon) selaras **5000 Beban Langsung** CoA Modul 10.
- **Counterparty** (klien/supplier/mandor) memberi sub-ledger **AR (1121)/AP (2110)/Uang Muka (1122)**.
- **Effective-date pada posting-rule** menahan perubahan CoA/tarif (pola sama PPN effective-date) — jurnal historis tak pernah dihitung ulang (selaras invariant D10).
- **Nominal full-precision** (pola `hsp_raw`) → jurnal presisi; pembulatan hanya lapis dokumen.

---

## G. Rekomendasi keputusan (untuk founder)

1. **Setujui prinsip:** stempel **fakta** (ledger `financial_events` tipis) + **rule** (`posting_rules` effective-dated) — **BUKAN** debit/kredit per-baris. (Menjaga Zero-Invention + No-Duplication.)
2. **Pilih waktu (3) di E:** buat `financial_events` **sekarang** (asuransi, sebelum lebih banyak event terakumulasi) **atau** tunda sampai GL. Rekomendasi saya: **sekarang**, karena biaya backfill naik seiring waktu (persis risiko "paling berisiko kalau ditunda = GL" yang sudah dibahas).
3. Sisanya (tanggal-akuntansi eksplisit, dimensi, nilai stock) → checklist yang dikerjakan saat masuk fase GL, bukan sekarang.

**Belum ada yang diimplementasikan. Menunggu keputusan Anda pada G1 & G2 sebelum menyentuh kode/skema mana pun.**

---

## H. REKONSILIASI dengan `047_general_ledger.sql` (ditemukan via schema-diff 4a) — G1 & G2 LARUT

Schema-diff 4a mengungkap **migrasi GL sudah ada** sebagai forward-draft (belum diterapkan ke dev,
sesuai header "jalankan HANYA setelah modul 1-12 stabil"). Isinya sudah mengunci desain ini:

- `accounts` — CoA (code, name, account_type, normal_balance, parent hierarki, `project_id` per-proyek).
- `journal_entries` — header dengan **`reference_type` + `reference_id`** (korelasi ke event sumber:
  kasbon/invoice/payment/po/mr/manual) + reversal.
- `journal_entry_lines` — `account_id`, `debit_amount`/`credit_amount`, `project_id`, **CHECK debit XOR credit**.
- Header 047: *"auto-jurnal (GL-2) di application layer (AccountingEngine class), BUKAN di DB."*

**Akibatnya kedua pertanyaan saya larut — tak ada yang perlu diputuskan/diimplementasikan sekarang:**

- **G1 (fakta vs rule) — SUDAH jadi desain 047.** Debit/kredit ada di `journal_entry_lines` (diturunkan),
  di-key ke sumber via `reference_type`/`reference_id`; **rule** hidup di `AccountingEngine` app-layer.
  Tidak ada stempel debit/kredit di baris sumber. Prinsip yang saya usulkan = yang sudah ada. **Tak perlu approval.**
- **G2 (`financial_events` sekarang?) — MOOT, saya CABUT.** Karena `journal_entries.reference_type/reference_id`
  + fakta yang sudah ada di tabel sumber (amount/tanggal/referensi — terbukti di register §C) sudah cukup
  bagi `AccountingEngine` untuk **backfill** jurnal saat GL dinyalakan, **ledger `financial_events` terpisah
  TIDAK diperlukan.** Menambahkannya = duplikasi.

**Yang benar-benar tersisa (dikerjakan saat fase GL, bukan sekarang, bukan keputusan):** tutup 3-4 gap
konsistensi di §C — tanggal-akuntansi eksplisit (`tax_records`, `stock_movements`, `worker_kasbons`),
nilai-rupiah `stock_movements` (dari FIFO cost). Itu checklist GL-time, bukan asuransi mendesak.

**Kesimpulan:** tak ada kode/skema metadata-jurnal yang perlu ditulis sekarang. Desain sudah benar & sudah
ada di 047. Saya tidak menunggu jawaban lagi untuk item ini.
