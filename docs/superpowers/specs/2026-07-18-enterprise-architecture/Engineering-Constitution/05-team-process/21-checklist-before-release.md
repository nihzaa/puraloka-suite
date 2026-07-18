# 21 — Checklist Before Release

> **Maturity:** 🔵 Designed — belum ada proses release formal terpisah dari merge hari ini (deployment langsung mengikuti `main` tanpa gate release eksplisit). Kontrak masa depan, relevan begitu ada environment staging/production terpisah dari development.

**Kedudukan:** Batch 5 — Proses Tim. Batch 5 selesai di file ini. Melengkapi [20-checklist-before-merge.md](20-checklist-before-merge.md) — merge masuk `main` adalah satu gate, deploy `main` ke production adalah gate terpisah dengan kriteria tambahan.

---

## 1. Purpose

Membedakan "kode sudah di-merge ke `main`" dari "kode siap dijalankan pengguna nyata di production" — dua kondisi yang berbeda begitu Puraloka Suite punya environment staging/production terpisah dari development.

## 2. Background

Hari ini, tidak ada pemisahan environment eksplisit — pengembangan dan "produksi" secara efektif sama (database Supabase `puraloka-suite-dev` dipakai untuk keduanya, sesuai catatan RLS "DISABLED sengaja untuk development" di CLAUDE.md). File ini menyiapkan kriteria release begitu pemisahan environment dilakukan, terutama relevan menjelang L1→L2 evolution ([GLOSSARY.md — L1/L2/L3/L4](../GLOSSARY.md)) atau saat aplikasi mulai dipakai operasional harian oleh tim non-teknis Puraloka Persada.

## 3. Principles

1. **Release adalah keputusan sadar, bukan efek samping otomatis dari merge.** Kode di `main` boleh dan lumrah menumpuk beberapa PR sebelum benar-benar di-release — release adalah checkpoint terpisah dengan verifikasi tambahan.
2. **Rollback plan MUST ada sebelum release, bukan didesain saat insiden sedang terjadi.** Kepanikan bukan waktu yang baik untuk pertama kali memikirkan cara mundur.

## 4. Mandatory Rules

1. Sebelum release yang menyentuh migration database, migration **MUST** sudah diverifikasi berjalan bersih di environment staging (begitu staging tersedia) — **MUST NOT** migration pertama kali dijalankan langsung di production.
2. Release yang menyentuh RLS atau permission scope **MUST** disertai rencana rollback eksplisit (migration pembalik atau prosedur manual) — konsisten [03-core-implementation/34-schema-migration-policy.md Mandatory Rule #5](../03-core-implementation/34-schema-migration-policy.md#4-mandatory-rules).
3. Environment variable/secret baru yang dibutuhkan release **MUST** dikonfirmasi sudah ada di environment target sebelum deploy — **MUST NOT** deploy yang gagal start karena env var hilang (preseden: VAPID keys sengaja lazy-init untuk menghindari crash, tapi ini exception yang disengaja, bukan pola default untuk semua config).
4. Release yang berdampak pada data finansial pengguna aktif **MUST** dijadwalkan di luar jam kerja tim lapangan/PM jika memungkinkan, atau dikomunikasikan sebelumnya — **MUST NOT** deploy tanpa pertimbangan dampak operasional saat pengguna sedang aktif memakai sistem untuk pekerjaan finansial.

## 5. Recommended Rules

1. Release **SHOULD** disertai catatan ringkas perubahan yang dikomunikasikan ke pengguna internal (Nizar, PM, mandor) jika ada perubahan perilaku yang terlihat — bukan hanya commit log teknis.

## 6. Anti-Pattern

**Migration Pertama Kali Dijalankan di Production** — melewatkan verifikasi staging karena "staging belum ada, langsung saja ke production." Ini sudah menjadi risiko yang diterima sadar hari ini (belum ada staging), tapi **MUST** berhenti begitu staging environment tersedia — dicatat eksplisit sebagai gap yang harus ditutup, bukan pola yang boleh dipertahankan selamanya.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode — lihat Bagian 4 sebagai kriteria konkret.

## 9. Migration Strategy

🔵 Designed murni — N/A untuk migrasi mundur karena belum ada environment staging/production terpisah hari ini. Berlaku penuh begitu pemisahan environment dilakukan (di luar scope Phase 1, kemungkinan trigger di L2 evolution — lihat [00-vision-and-business-architecture.md § Long-Term SaaS Vision](../../00-vision-and-business-architecture.md#long-term-saas-vision-l1--l4-evolution-model)).

## 10. Checklist

- [ ] Migration terverifikasi di staging sebelum production (begitu staging tersedia)
- [ ] Rencana rollback eksplisit untuk perubahan RLS/permission
- [ ] Environment variable/secret baru sudah dikonfirmasi ada di environment target
- [ ] Dampak operasional pada pengguna aktif dipertimbangkan/dikomunikasikan

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Release yang menyebabkan downtime tidak direncanakan | 0 | Incident log (begitu ada) |
| Migration gagal di production tanpa terverifikasi staging dulu | 0 (setelah staging ada) | Audit deployment |

## 12. References

- [20-checklist-before-merge.md](20-checklist-before-merge.md)
- [03-core-implementation/34-schema-migration-policy.md](../03-core-implementation/34-schema-migration-policy.md)
- [00-vision-and-business-architecture.md § Long-Term SaaS Vision](../../00-vision-and-business-architecture.md#long-term-saas-vision-l1--l4-evolution-model)

---

*Batch 5 selesai. File selanjutnya (Batch 6 — Governance): [06-governance/18-never-build-list.md](../06-governance/18-never-build-list.md)*
