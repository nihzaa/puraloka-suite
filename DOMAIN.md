# DOMAIN.md — Model Domain Jasa Konstruksi (Puraloka Suite)

Sumber otoritas domain untuk keputusan produk. Aturan tulis: tiap konsep menyertakan **IMPLIKASI SISTEM** (tabel/field/alur yang terpengaruh), bukan definisi kamus.

**Legenda keyakinan:**
- **[repo]** — dipastikan dari kode/migration/dokumen repo (tegas).
- **❓** — disimpulkan dari praktik umum jasa konstruksi Indonesia (perlu konfirmasi bila mahal salah).

> Nilai finansial (tarif, retensi, denda, %) = **selalu effective-dated** setelah AKTA 3. Perhitungan dokumen memakai nilai yang berlaku saat dokumen **diterbitkan**, bukan nilai terkini.

---

## 1. Siklus Proyek

**Alur:** kontrak/SPK → (uang muka) → pelaksanaan + opname progres → penagihan termin → serah terima (BAST) → retensi + masa pemeliharaan → pelunasan retensi.

| Konsep | Implikasi sistem |
|---|---|
| **SPK / Kontrak** [repo] | `projects` (contract_value, contract_model, tax_scheme, retention_pct). Kontrak PDF di-generate `contracts.ts`. |
| **Uang Muka (DP)** ❓ | Belum ada field khusus DP. Bisa dimodelkan sebagai termin `trigger_type='on_sign'` [repo] (`013`). DP % = keputusan per-kontrak (Q4). |
| **Termin / Progress Claim** [repo] | `termin_schedules` (pct_of_contract, trigger_type ∈ {on_sign, on_progress, on_retention}, trigger_pct, due_days). Penagihan → `invoices` → `payments`. |
| **Opname / Progress** [repo] | `progress_logs` (mode daily/detail), `rab_items.progress_pct` → bubble-up ke `projects.progress_pct`. Opname memicu termin `on_progress` saat `progress ≥ trigger_pct`. |
| **MC-0 / MC-100** ❓ | Tidak ada entity eksplisit "Monthly Certificate". Diperkirakan direpresentasikan oleh progress_logs + termin. Tidak wajib dibangun kecuali diminta. |
| **BAST (serah terima)** ❓ | Ada `document_type` + foto kategori `serah_terima` [repo]. Tidak ada state proyek "handed_over" formal. Kandidat: status/tanggal BAST memicu mulai masa pemeliharaan. |
| **Retensi** [repo] | `projects.retention_pct DEFAULT 5%` + `retention_amount` (trigger DB `value*pct/100`). Ditahan sampai akhir masa pemeliharaan, lalu dibayar via termin `on_retention` (`due_days` setelah serah terima). |
| **Masa Pemeliharaan** [repo-partial] | `termin_schedules.due_days` = hari setelah serah terima untuk on_retention. Panjang masa pemeliharaan = per-kontrak (Q3). |

## 2. Model Harga & Kontrak

| Konsep | Implikasi sistem |
|---|---|
| **Lump sum vs Unit price** ❓ | Tidak ada field `pricing_type` eksplisit. RAB (`rab_items`) mendukung volume×harga (unit price). Lump sum = nilai kontrak tetap. Saat ini implisit via contract_value + RAB. |
| **Termin vs Komisi** [repo] | `contract_model ∈ {termin, komisi}`. **termin** = tagih per tahap (`termin_schedules`). **komisi** = lapor pengeluaran (`expense_reports`) + tagih total + `commission_pct`. Alur invoice berbeda per model (kode). |
| **Addendum / CCO (Change Order)** [repo] | `change_orders` + items; approve → update `contract_value` + baseline snapshot. Workflow: draft→submitted→approved/rejected (1C dual-write). |

## 3. Pajak

| Konsep | Implikasi sistem |
|---|---|
| **PPh final 4(2) 2%** [repo] | `tax_scheme='pph_final'`, tarif effective-dated `financial_config.tax.pph_final_rate`. **Default untuk klien perorangan** [repo CLAUDE.md]. |
| **PPN 11%** [repo] | `tax_scheme='ppn'`, `financial_config.tax.ppn_rate`. Untuk B2B/badan. |
| **Kapan pakai apa** [repo+❓] | **KEPUTUSAN (tak ditanya):** default `pph_final` karena klien Puraloka mayoritas perorangan [repo]. `ppn` dipilih manual saat klien badan. Rumus = kode ber-test [C3]; tarif = config effective-dated (migration 086). |

### ❓ Anchor Date Pajak (perlu konfirmasi owner — C2)

Effective-dating perlu tahu **tanggal mana** yang menentukan tarif berlaku (`atDate`).

**Asumsi sistem saat ini (mudah diubah — `getTaxRate(scheme, atDate)` menerima parameter):**
- **atDate = `issued_date` invoice** untuk KEDUA skema. Dalam sistem ini invoice di-generate **saat pembayaran termin** (`termin-payment.ts`), jadi `issued_date = paid_at` — praktis titik pembayaran.

**❓ Yang perlu dikonfirmasi (jangan ditebak — perbedaan pajak nyata):**
- **PPN**: tax point lazimnya **tanggal faktur pajak** (saat penyerahan/invoice). Dalam sistem = `issued_date`. ✅ kemungkinan benar.
- **PPh final 4(2)** (jasa konstruksi): lazimnya dipotong **saat PEMBAYARAN**, bukan saat faktur. Dalam sistem, karena invoice = saat bayar, `issued_date ≈ payment date` → praktis sama. TAPI kalau kelak invoice bisa dibuat sebelum bayar, anchor pph_final mungkin perlu = **tanggal pembayaran** terpisah.

**Karena itu:** `getTaxRate` menerima `atDate` eksplisit → mengubah anchor per-skema = ganti satu argumen, bukan refactor. Owner konfirmasi bila anchor per-skema perlu dibedakan.

## 4. Tenaga Kerja & Upah

| Konsep | Implikasi sistem |
|---|---|
| **Struktur tenaga** ❓ | Hierarki umum: mandor → kepala tukang → tukang → kenek/laden. Sistem: `users` role mandor + `workers` (global, `skills TEXT[]`). Field `tipe` (tukang/laden/kenek) direncanakan, **belum diimplementasi** [repo CLAUDE.md]. |
| **Mandor borong tenaga vs bahan+tenaga** ❓ | Tercermin di `payment_system` + fund_source kasbon (`owner_advance` vs `client_fund`). Tidak ada flag eksplisit "borong bahan". |
| **Sistem upah** [repo] | `payment_system ∈ {harian, borongan, progress_pct}`. harian=`weekly_wage_reports`, borongan=`borongan_settlements`, progress_pct=`progress_payments`. |
| **Worker mobility** [repo] | `workers` global lintas-scope [repo CLAUDE.md]. Worker bisa pindah scope. |

## 5. Kasbon

| Konsep | Implikasi sistem |
|---|---|
| **Kasbon Mandor** [repo] | `kasbons` — operasional mandor. project_id wajib, work_scope_id opsional (056). purpose ∈ 5 nilai [A4]. Dilunasi dari settlement scope/borongan (**mekanisme belum dibangun — AUDIT_REPORT OPEN-1**). |
| **Kasbon Tukang** [repo] | `worker_kasbons` — advance pekerja, dilunasi via potongan upah. |
| **Batas kasbon 80%** [repo-dead] | `projects.kasbon_limit_pct DEFAULT 80` masih ada tapi enforcement dihapus (056). Status = keputusan (Q2). |

## 6. RAB & Monitoring

| Konsep | Implikasi sistem |
|---|---|
| **RAB / AHSP / Bobot** [repo] | `rab_items` (level category/subcategory/item, weight_pct, 4 komponen biaya material/upah/alat/other). Bobot → bubble-up progress. |
| **Kurva S / EVM** [repo] | `kurva-s.ts` (BAC/AC/EV/PV/CPI/SPI/EAC...). AC = kasbon+expenses+wage+progress_payment+borongan. |
| **Gantt / dependency** [repo] | `rab_items` planned_start/end + gantt_dep_rules (threshold-based). |

## 7. Denda & Jaminan

| Konsep | Implikasi sistem |
|---|---|
| **Denda keterlambatan** ✅ DIBANGUN (migration 091, default OFF) | Mesin denda config-first, effective-dated. **Puraloka SAAT INI TIDAK menerapkan denda** — mesin dibangun agar bisa DINYALAKAN tanpa deploy. Lihat § Denda di bawah. |
| **Jaminan pelaksanaan/uang muka** ❓ | Belum ada. Umumnya bank guarantee %. Tidak dibangun kecuali diminta. |

### § Denda Keterlambatan — keputusan mengikat (founder ack 2026-07-24, DANGER GATE Red-Line §5#2)

**Status Puraloka: DEFAULT OFF.** Klien mayoritas perorangan, hubungan personal → denda belum diterapkan. Mesin dibangun penuh supaya bisa dinyalakan dari UI tanpa deploy. Saat OFF: nol perubahan perilaku.

**Rumus:** `denda = min(base × rate_per_day × hari_telat, base × cap_pct)`.

**5 parameter — SEMUA config effective-dated** (financial_config, reuse EXCLUDE anti-overlap):
- `penalty.enabled` (default false), `penalty.basis` (default `invoice_telat`), `penalty.rate_per_day` (default 0.001 = 1‰/hari), `penalty.cap_pct` (default 0.05 = 5%), `penalty.grace_days` (default 0 = H+1).

**Basis (enum):** `invoice_telat` (default — base = total_amount invoice) · `outstanding_proyek` (Σ amount_due invoice proyek belum lunas) · `kontrak_total` (contract_value).

**Override per proyek (WAJIB):** kolom `projects.penalty_*` nullable — null = pakai global effective. Denda = syarat kontrak, beda per klien → override menang per-field (pola COALESCE seperti retensi).

**Waiver per invoice (WAJIB):** `invoices.penalty_waived` + reason wajib + `penalty_waived_by/at`. Gated `finance:penalty:waive` + audit_logs (severity critical). Tujuan: cegah "akali dengan ubah tanggal".

**Otoritatif vs estimasi:**
- **Otoritatif** (angka resmi): dihitung SEKALI saat invoice **lunas telat**, dipersist immutable di `invoice_penalties` (UNIQUE per invoice). Event-driven — tidak butuh cron.
- **Estimasi** (tampilan): compute-on-read saat invoice belum lunas (menutup lubang "belum bayar = tak ada angka untuk menagih"). **Dilabeli `estimate` + `as_of`, TIDAK dipersist, BUKAN dasar pembukuan/invoice** → tidak melanggar C5 (bukan compute-on-read untuk angka resmi).

**❓ ANCHOR (C2):** Terms (rate/cap/grace/basis/enabled) = override proyek ?? global effective **pada `due_date` invoice** (= "sesuai kontrak", bukan global terkini — syarat founder #2). Hari telat = tanggal WIB (Asia/Jakarta) `anchor − due_date − grace`; anchor = `paid_date` (otoritatif) / today WIB (estimasi). Bila founder ingin terms di-anchor ke tanggal kontrak proyek (start_date) alih-alih due_date, ganti satu argumen di `resolveProjectPenaltyTerms` — tanpa refactor.

## 8. Realita Puraloka [repo]

- Mandor lapor via WhatsApp (otomasi WA di roadmap Program F).
- Klien **mayoritas perorangan** → default pph_final.
- Worker pindah scope → `workers` global.

---

## Yang DIPUTUSKAN sendiri (tidak ditanya — praktik umum/dokumen jelas)

1. **Default tax scheme = pph_final** (klien perorangan mayoritas [repo]). ppn manual untuk badan.
2. **Tarif pajak 0.11/0.02** = hukum, bukan pilihan. Sudah config, tambah effective dating (AKTA 3).
3. **Struktur upah (harian/borongan/progress_pct)** = pertahankan; label/aktif = config, alur = kode.
4. **Kasbon purposes** = pertahankan 5 nilai, jadikan tabel lookup extensible (bisa nambah tanpa deploy) — tak perlu nambah nilai baru sekarang.
5. **Units** = satukan dua daftar divergen (mandor + procurement) jadi satu master `units` (union), editable via config.
6. **Default contract model UX** = termin (jalur paling kaya). Cheap to change; bukan pertanyaan.
7. **Rumus finansial** (pajak, retensi, EVM) = tetap kode ber-test [C]; hanya angka yang config.

Konsep ber-❓ yang **mahal salah** → masuk kuesioner AKTA 2. Sisanya diputuskan di atas.

---

## Jawaban kuesioner owner (2026-07-24) — MENGIKAT

**Prinsip utama:** SEMUA praktik bisnis/operasional/permission ember [A] **HARUS bisa diubah dari UI** (halaman pengaturan web). "Ada kolom DB" = BELUM SELESAI. Ini DoD tiap item [A]. Ember [C] tetap di kode.

1. **Retensi** = **5% sebagai NILAI AWAL** (bukan konstanta). Global default 5% diatur di UI, override per proyek, effective-dated.
2. **kasbon_limit_pct** = **HIDUPKAN sebagai config, JANGAN drop**. Default enforcement **MATI** (perilaku hari ini tak berubah). UI: toggle on/off + input % + scope (global/override per proyek). Additive-first.
3. **Denda keterlambatan** = Puraloka **SAAT INI TIDAK PAKAI** (fakta domain). Tapi **bangun penuh sebagai config, DEFAULT OFF**: toggle + besaran (mis. 1‰/hari) + plafon (mis. 5%), UI, effective-dated. Nyalakan tanpa deploy saat praktik berubah.
4. **Uang muka (DP)** = per kontrak via termin on_sign, dengan **default % disetel di UI** (auto-terisi proyek baru, override per proyek, boleh kosong).
5. **Masa pemeliharaan** = per kontrak, dengan **default hari disetel di UI** (auto-terisi, override).
6. **Approve/Reject Change Order** = derive `change_order:approve`, seed awal admin (perilaku tak berubah), **grantable ke role custom via UI role editor**, hapus role-literal. **Pola sama untuk SEMUA lockout AKTA 0 (F1-F4)** — jangan tambal beda-beda.
7. **Ubah tarif finansial** = permission terpisah **`settings:finance:manage`** (assignable via UI), lebih ketat dari settings biasa.

**ANTI SELF-LOCKOUT (wajib):** permission kritikal (pengelola role/permission, `settings:finance:manage`) **tak boleh dicabut dari pemegang terakhir** (sistem tolak dgn pesan jelas); role admin bawaan tak bisa dihapus/dilucuti; semua perubahan permission → audit_logs; test buktikan self-lockout ditolak.

**Arahan census:** satukan 2 daftar unit → 1 lookup UI-managed; kasbon purposes + kategori pekerjaan → lookup extensible UI; RAB cap 100MB → turunkan wajar (config [B]); tax effective-dating prioritas tinggi + test (ubah tarif → invoice lama tak berubah).
