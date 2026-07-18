# 02 — Folder Architecture

> **Maturity:** 🟡 Partial — struktur folder backend sudah konsisten untuk `routes/`/`plugins`/`utils`, tapi `services/` dan `types/` ada secara fisik namun kosong (disiapkan, belum dipakai) — temuan jujur, bukan diasumsikan sudah terisi.

**Kedudukan:** Batch 1 — Fondasi. Melengkapi [01-coding-standards.md](01-coding-standards.md); dirujuk [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md) sebagai pemetaan folder-ke-layer.

---

## 1. Purpose

Menetapkan **di mana** kode baru harus ditempatkan — mencegah *organizational drift* di mana fungsi serupa berakhir di lokasi berbeda-beda tergantung siapa yang menulis, menyulitkan navigasi codebase seiring skala bertambah.

## 2. Background

Struktur folder `apps/api/src/` terverifikasi hari ini: `plugins/` (middleware seperti `auth.ts`), `routes/v1/` (25 route file, 159 endpoint — [Phase1/00 § 1.4](../../Phase1/00-current-state-audit.md#14-call-site-inventory--requirepermission-103-pemanggilan-20-route-file)), `utils/` (helper seperti `supabase.ts`, `notifications.ts`), dan dua folder yang **ada secara fisik tapi kosong**: `services/` dan `types/`. Struktur `apps/web/` mengikuti konvensi Next.js App Router (`app/`, `components/`, `lib/`) — ditemukan juga `pm-portal/` sebagai portal ketiga (selain `portal/` untuk klien dan `mandor-portal/`) yang belum tercatat di CLAUDE.md, dicatat di sini sebagai temuan yang perlu diverifikasi/didokumentasikan, bukan diabaikan.

## 3. Principles

1. **Folder mencerminkan domain, bukan tipe teknis semata.** `routes/v1/kasbons.ts` mengelompokkan berdasarkan domain bisnis (kasbon), bukan `controllers/`, `models/` terpisah generik — pola ini dipertahankan karena selaras prinsip modular monolith ([01 — Modular Monolith Strategy](../../01-application-and-data-architecture.md#modular-monolith-strategy)).
2. **Folder kosong yang disiapkan tanpa isi adalah sinyal, bukan kesalahan** — tapi harus dijelaskan tujuannya secara eksplisit, bukan dibiarkan ambigu (`services/`, `types/` hari ini ambigu — lihat Migration Strategy).
3. **Satu lokasi kanonik per jenis artefak.** Primitive UI di `components/ui/` (rencana [Warm Clay §2A](../../../2026-07-15-warm-clay-redesign-design.md#2a-konvensi-kode-komponen-arsitektur-bukan-cuma-visual)), komponen domain-spesifik tetap di `components/` root — pemisahan ini sudah diputuskan di Warm Clay redesign, dipertahankan di sini sebagai referensi silang, bukan didesain ulang.

## 4. Mandatory Rules

1. Route handler baru **MUST** ditempatkan di `apps/api/src/routes/v1/<domain>.ts` mengikuti pola satu file per domain bisnis (kasbon, procurement, dst) — **MUST NOT** membuat file generik seperti `misc.ts` atau `helpers.ts` yang mencampur banyak domain.
2. Primitive komponen UI (button, card, badge — tanpa logic domain) **MUST** ditempatkan di `apps/web/components/ui/`, konsisten [Warm Clay §2A](../../../2026-07-15-warm-clay-redesign-design.md#2a-konvensi-kode-komponen-arsitektur-bukan-cuma-visual). Komponen spesifik domain (mis. `mandor-section.tsx`) **MUST** tetap di `apps/web/components/` root.
3. Folder `apps/api/src/services/` dan `apps/api/src/types/`, jika dipakai, **MUST** diisi sesuai tujuan yang dituliskan di Migration Strategy bagian ini — **MUST NOT** dibiarkan kosong tanpa keterangan lebih lama dari satu Sub-Fase Phase 1 tanpa keputusan eksplisit (hapus atau isi).

## 5. Recommended Rules

1. Ketika satu route file melewati ~500 baris (mis. `rab.ts` sudah 952 baris — [Phase1/00 § 4.1](../../Phase1/00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)), **SHOULD** dipertimbangkan pemecahan berdasarkan sub-domain (mis. parsing Excel vs CRUD tree RAB) — deviasi diterima jika logic benar-benar kohesif dan pemecahan justru menyulitkan navigasi.
2. Folder baru di level teratas (`apps/api/src/<baru>/`) **SHOULD** didiskusikan lewat ADR jika mengubah pola yang sudah mapan (routes/plugins/services/types/utils) — bukan ditambah ad-hoc.

## 6. Anti-Pattern

**Folder Generik Serba-Guna** — `utils/`, `helpers/`, `misc/` yang jadi tempat sampah untuk kode yang "tidak tahu taruh di mana." Risiko: `utils/` di Puraloka Suite hari ini sudah berisi campuran (`supabase.ts` — koneksi database, `notifications.ts` — business logic notifikasi, `terbilang.ts` — konversi angka ke teks) — masih dapat diterima karena jumlahnya kecil, tapi **SHOULD NOT** terus bertambah tanpa batas tanpa pemisahan lebih lanjut.

**Folder Kosong Tanpa Penjelasan** — `services/` dan `types/` hari ini adalah contoh langsung pola ini (temuan Background di atas) — folder ada, tidak ada isi, tidak ada dokumentasi kenapa disiapkan. Ini adalah bentuk *ambiguitas terdokumentasi* yang harus ditutup (lihat Migration Strategy).

## 7. Example Good

```
apps/api/src/routes/v1/kasbons.ts     ← domain kasbon, satu file, 341 baris
apps/api/src/routes/v1/procurement.ts ← domain procurement, terpisah jelas
```
Pola ini konsisten Mandatory Rule #1 — setiap route file punya domain bisnis jelas, terverifikasi [Phase1/00-current-state-audit.md](../../Phase1/00-current-state-audit.md) (25 route file, semuanya dinamai sesuai domain, nol file generik ditemukan).

## 8. Example Bad

`apps/api/src/services/` dan `apps/api/src/types/` — dua folder kosong tanpa file `.gitkeep` beserta keterangan, tanpa referensi di CLAUDE.md, tanpa ADR yang menjelaskan tujuannya. Pembaca baru (manusia atau AI agent) yang menemukan folder ini tidak punya cara mengetahui apakah ini "belum dipakai" atau "sisa refactor yang lupa dihapus" — ambiguitas yang harus dihindari sesuai Principle #2.

## 9. Migration Strategy

**Untuk `services/` dan `types/` (folder kosong):** Keputusan eksplisit dibutuhkan pada awal Sub-Fase 1A (bukan ditunda tanpa batas) — dua opsi valid: (a) hapus jika memang sisa yang tidak lagi relevan, atau (b) definisikan tujuannya secara eksplisit — kandidat kuat: `types/` untuk shared TypeScript interface lintas-route (mengurangi duplikasi tipe yang mungkin sudah terjadi di beberapa route file), `services/` untuk business logic yang diekstrak dari route handler (selaras [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md) — pemisahan logic dari HTTP layer). **Keputusan ini dicatat sebagai item terbuka, bukan diasumsikan di dokumen ini** — butuh konfirmasi founder atau ADR terpisah sebelum eksekusi.

**Untuk `pm-portal/` (ditemukan, belum terdokumentasi):** **MUST** diverifikasi statusnya (aktif dipakai atau sisa eksperimen) dan didokumentasikan di CLAUDE.md sebelum Sub-Fase 1A dianggap selesai — gap dokumentasi, bukan gap kode.

## 10. Checklist

- [ ] File baru ditempatkan di folder yang sesuai domain, bukan folder generik
- [ ] Primitive UI di `components/ui/`, domain-spesifik di `components/` root
- [ ] (Item terbuka) Keputusan `services/`/`types/` sudah dibuat dan didokumentasikan
- [ ] (Item terbuka) `pm-portal/` sudah diverifikasi dan didokumentasikan

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Folder kosong tanpa keterangan tujuan | 0 | Audit manual struktur folder per awal fase baru |
| File di folder generik (`utils/`, dst) yang sebenarnya business logic murni | Menurun dari baseline hari ini | Review manual saat menyentuh `utils/` |

## 12. References

- [01-coding-standards.md](01-coding-standards.md)
- [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md)
- [Warm Clay Redesign §2A](../../../2026-07-15-warm-clay-redesign-design.md#2a-konvensi-kode-komponen-arsitektur-bukan-cuma-visual)
- CLAUDE.md (internal, struktur folder terdokumentasi — perlu update untuk `pm-portal/`)

---

*File selanjutnya: [22-project-conventions.md](22-project-conventions.md)*
