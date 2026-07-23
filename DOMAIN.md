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
| **PPh final 4(2) 2%** [repo] | `tax_scheme='pph_final'`, tarif `company_settings.tax.pph_final_rate=0.02`. **Default untuk klien perorangan** [repo CLAUDE.md]. |
| **PPN 11%** [repo] | `tax_scheme='ppn'`, `tax.ppn_rate=0.11`. Untuk B2B/badan. |
| **Kapan pakai apa** [repo+❓] | **KEPUTUSAN (tak ditanya):** default `pph_final` karena klien Puraloka mayoritas perorangan [repo]. `ppn` dipilih manual saat klien badan. Rumus = kode ber-test [C3]; tarif = config effective-dated [A1]. |

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
| **Denda keterlambatan** ❓ | **Belum ada** field/logika denda. Standar Indonesia: 1‰/hari, cap 5% nilai kontrak. Kebijakan Puraloka = Q5. Bila diaktifkan → field per-kontrak + config default effective-dated. |
| **Jaminan pelaksanaan/uang muka** ❓ | Belum ada. Umumnya bank guarantee %. Tidak dibangun kecuali diminta. |

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
