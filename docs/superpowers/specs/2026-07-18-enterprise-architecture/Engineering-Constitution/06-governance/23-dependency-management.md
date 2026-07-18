# 23 — Dependency Management

> **Maturity:** 🟡 Partial — pnpm workspace monorepo sudah konsisten diterapkan, tapi proses formal audit dependency (`pnpm audit`) baru terjadwal sebagai gate CI ([05-team-process/11-devsecops-standard.md Mandatory Rule #5](../05-team-process/11-devsecops-standard.md#4-mandatory-rules)), belum diimplementasikan karena CI/CD sendiri belum ada.

**Kedudukan:** Batch 6 — Governance. Melengkapi [32-library-selection-policy.md](32-library-selection-policy.md) (memilih dependency baru) dengan aturan **memelihara** dependency yang sudah ada.

---

## 1. Purpose

Menjaga dependency tree tetap sehat (bebas kerentanan diketahui, tidak menumpuk versi usang) tanpa proses upgrade yang mengganggu stabilitas — keseimbangan antara "selalu terbaru" (berisiko breaking change) dan "tidak pernah diupgrade" (berisiko kerentanan keamanan menumpuk).

## 2. Background

Puraloka Suite memakai pnpm workspace monorepo (CLAUDE.md § Tech Stack, internal) dengan `packages/shared` untuk types/constants bersama antar `apps/api` dan `apps/web`. Belum ada insiden kerentanan dependency tercatat, dan belum ada proses `npm audit`/`pnpm audit` terjadwal — file ini menyiapkan proses tersebut sebelum menjadi masalah nyata, bukan bereaksi terhadap insiden yang sudah terjadi.

## 3. Principles

1. **Dependency baru adalah komitmen jangka panjang, bukan keputusan sekali pakai.** Setiap package yang ditambahkan menjadi tanggung jawab maintenance (update keamanan, kompatibilitas versi Node/TypeScript) selama dipakai.
2. **Kerentanan keamanan pada dependency ditangani berdasarkan severity, bukan diabaikan sampai insiden.** Critical/High severity **MUST** direspons lebih cepat daripada Low/Moderate.
3. **Package internal (`packages/shared`) mengurangi duplikasi, bukan menjadi dependency eksternal tersembunyi.** Perubahan pada `packages/shared` berdampak ke kedua app — perubahan breaking di sana **MUST** dikoordinasikan dengan kedua konsumen.

## 4. Mandatory Rules

1. Dependency baru **MUST** melalui review [32-library-selection-policy.md](32-library-selection-policy.md) sebelum ditambahkan — **MUST NOT** ditambahkan ad-hoc tanpa pertimbangan (lihat file tersebut untuk kriteria lengkap).
2. Kerentanan Critical/High severity yang terdeteksi (`pnpm audit`) **MUST** direspons (upgrade, patch, atau mitigasi terdokumentasi) dalam waktu wajar setelah terdeteksi — **MUST NOT** dibiarkan tanpa batas waktu tanpa keputusan eksplisit untuk menerima risikonya.
3. Perubahan breaking pada `packages/shared` **MUST** memperbarui kedua konsumen (`apps/api`, `apps/web`) dalam PR yang sama — **MUST NOT** meninggalkan salah satu app dengan tipe/konstanta yang sudah tidak sinkron.
4. Versi dependency **MUST** dikunci lewat lockfile (`pnpm-lock.yaml`) yang **MUST** ikut di-commit — **MUST NOT** di-gitignore atau dibiarkan tidak konsisten antar environment.

## 5. Recommended Rules

1. `pnpm audit` **SHOULD** dijalankan periodik (mis. tiap penambahan dependency baru, atau berkala bulanan) sampai gate otomatis CI ([11-devsecops-standard.md Mandatory Rule #5](../05-team-process/11-devsecops-standard.md#4-mandatory-rules)) diimplementasikan — begitu pipeline aktif, gate otomatis menggantikan kebutuhan menjalankan manual periodik untuk kasus yang sudah tercakup pipeline (PR yang mengubah `package.json`/`pnpm-lock.yaml`), audit manual berkala tetap bernilai untuk kerentanan yang baru diumumkan setelah dependency sudah lama terpasang.
2. Dependency yang sudah lama tidak di-maintain oleh upstream (tidak ada update >1 tahun tanpa alasan jelas seperti "sudah stabil dan lengkap") **SHOULD** dievaluasi ulang penggantinya saat disentuh untuk pekerjaan lain.

## 6. Anti-Pattern

**Lockfile Tidak Konsisten Antar Environment** — `pnpm-lock.yaml` tidak di-commit atau di-gitignore, menyebabkan versi dependency berbeda antara environment development berbeda — sumber bug "jalan di komputer saya" yang sulit didiagnosis.

**Kerentanan Diketahui Dibiarkan Tanpa Batas** — menemukan kerentanan Critical lewat `pnpm audit` lalu tidak melakukan apa pun karena "belum ada insiden," tanpa keputusan sadar untuk menerima risikonya atau rencana mitigasi.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode spesifik — lihat Bagian 4 sebagai kriteria konkret.

## 9. Migration Strategy

**Untuk Mandatory Rule #1, #3, #4** — N/A, sudah konsisten diterapkan (monorepo pnpm sudah berjalan, `packages/shared` sudah dipakai kedua app).

**Untuk Mandatory Rule #2 (respons kerentanan)** — 🟡 Partial, belum ada proses audit terjadwal. **SHOULD** mulai dijalankan segera sebagai Recommended Rule #1 (manual periodik); menjadi Mandatory sepenuhnya *sebagai gate otomatis* begitu [11-devsecops-standard.md Mandatory Rule #5](../05-team-process/11-devsecops-standard.md#4-mandatory-rules) diimplementasikan di pipeline CI — aturan itu sendiri sudah Mandatory sejak file ini ditulis (respons kerentanan yang terdeteksi wajib, terlepas dari apakah deteksinya manual atau otomatis), yang menunggu infrastruktur adalah *mekanisme deteksinya*, bukan kewajiban meresponsnya.

## 10. Checklist

- [ ] Dependency baru sudah melalui review [32-library-selection-policy.md](32-library-selection-policy.md)
- [ ] `pnpm-lock.yaml` ikut di-commit dan konsisten
- [ ] Perubahan breaking `packages/shared` update kedua konsumen sekaligus
- [ ] Kerentanan Critical/High yang diketahui punya rencana respons

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Kerentanan Critical/High tanpa respons >30 hari | 0 | `pnpm audit` periodik |
| `packages/shared` breaking change tanpa update kedua konsumen | 0 | Code review checklist |

## 12. References

- [32-library-selection-policy.md](32-library-selection-policy.md)
- [33-package-approval-policy.md](33-package-approval-policy.md)
- [05-team-process/11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)
- CLAUDE.md § Tech Stack, Monorepo Structure (internal)

---

*File selanjutnya: [24-documentation-standard.md](24-documentation-standard.md)*
