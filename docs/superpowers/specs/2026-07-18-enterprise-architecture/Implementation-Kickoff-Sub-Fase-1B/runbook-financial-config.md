# Runbook — Financial Config Engine (effective-dated)

Config finansial (tarif pajak, retensi, denda) effective-dated. Perhitungan dokumen memakai tarif **yang berlaku saat dokumen diterbitkan**, bukan tarif terkini.

## Prinsip
- Tabel `financial_config` (migration 086): `(key, value, effective_from, effective_to)`, half-open `[from, to)`.
- **Anti-overlap** = EXCLUDE constraint DB (`no_overlap_financial_config`). **Anti-gap** = close-then-insert di app (`setFinancialConfig` menutup rentang lama tepat di tanggal mulai baru).
- **Timezone**: `effective_from/to` = tanggal **WIB** (Asia/Jakarta). `todayWIB()` + perbandingan string 'YYYY-MM-DD' menghindari pitfall UTC.
- **Anchor date**: tarif dipilih pada `issued_date` invoice — lihat `DOMAIN.md § Anchor Date Pajak` (❓ konfirmasi PPN vs PPh final).
- **Governance**: tulis via permission `settings:finance:manage` (Q7). Setiap perubahan → `audit_logs` severity critical (from→to). Validasi tarif fraksi 0..1.
- **Fallback BERISIK** (C6): config hilang/korup → `console.error` level error + fallback statis. Tarif salah = masalah kepatuhan, tak boleh senyap.

## Mengapa dokumen historis aman
Tarif pajak dihitung **sekali** saat dokumen dibuat lalu **di-persist** (`invoices.tax_amount`/`total_amount`, `tax_records`). Diverifikasi (AKTA 3): **nol tempat** menghitung ulang tarif saat baca (laporan pajak meng-agregasi `tax_records` persisted). Mengubah tarif hanya kena invoice **baru**.

## ⚠️ CATATAN ROLLBACK (penting)
- `DROP TABLE financial_config` **hanya bersih SELAMA belum ada tarif diubah lewat UI**.
- **Setelah** ada perubahan tarif (baris effective-dated baru), rollback = **kehilangan riwayat config itu**. Bila perlu rollback pasca-perubahan: ekspor `financial_config` dulu, atau kembalikan `getTaxRate` ke pembacaan `company_settings` (versi 1B.1) TANPA drop tabel.
- Invoice historis **tak terpengaruh** rollback (angka sudah persisted).

## Prosedur ubah tarif (produksi nanti)
1. Pastikan pemegang `settings:finance:manage` (default admin; grantable via UI role editor).
2. `PUT /api/v1/settings/finance` `{ key, value, effective_from: 'YYYY-MM-DD', note }` — atau via UI `/pengaturan/keuangan`.
3. Verifikasi: `GET /api/v1/settings/finance` menampilkan rentang lama tertutup + rentang baru terbuka, nol overlap.
4. Audit: cek `audit_logs` action `finance.config` mencatat from→to.
