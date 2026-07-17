# Phase 1 — 03. Migration Strategy

**Upstream:** Mengeksekusi desain [02 — Target Architecture](02-target-architecture.md) untuk menutup gap di [01 — Gap Analysis](01-gap-analysis.md).
**Status:** Planning only.
**Prinsip governing:** Mewarisi penuh [04 — Migration Strategy (prinsip lintas-fase)](../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase) — backward-compatible dalam satu deploy cycle, strangler-fig untuk penggantian engine, feature flag untuk perubahan authorization berisiko tinggi. Dokumen ini **menerapkan** prinsip itu ke setiap gap spesifik, bukan mengulanginya.

---

## Prinsip Non-Negotiable untuk Seluruh Migrasi Phase 1

1. **Tidak ada migration yang mengubah data existing secara destruktif tanpa backup terverifikasi lebih dulu** (lihat [Risk Register](04-risk-register.md) risiko #3).
2. **Setiap migration schema baru bersifat additive dalam satu deploy** — kolom baru selalu nullable dulu, `NOT NULL` constraint (jika diperlukan) adalah migration terpisah setelah backfill selesai dan diverifikasi.
3. **Perubahan RLS/authorization di belakang feature flag** yang bisa dimatikan cepat tanpa deploy — karena inilah kategori perubahan dengan risiko regresi silent tertinggi (salah konfigurasi = kebocoran data ATAU user terkunci dari data sendiri, dua arah kesalahan yang sama-sama serius).
4. **Migrasi 049/050 yang sudah di-apply TIDAK di-edit** — migration baru ditambahkan yang menggantikan/memperluas, bukan mengubah file migration lama (praktik standar: migration adalah append-only log, mengedit yang sudah di-apply merusak integritas riwayat migrasi terlepas dari lingkungan mana pun).

---

## Migrasi 1A.1 — Permission Engine Konsolidasi

**Urutan eksekusi (bukan big-bang):**

| Langkah | Aksi | Verifikasi Sebelum Lanjut |
|---|---|---|
| 1 | Tambah skema `permission_scopes` (additive, tabel baru — nol risiko ke sistem existing) | Migration jalan tanpa error di staging |
| 2 | Migrasikan 21 baris authorization-gate inline **satu file per commit**, dimulai dari file dengan risiko finansial terendah (`users.ts`, `clients.ts`) menuju tertinggi (`cash.ts`, `finance.ts`) | Test manual: login sebagai tiap role, verifikasi behavior identik sebelum/sesudah |
| 3 | Hapus 4 pemanggilan `requireRole` — SETELAH langkah 2 selesai semua (supaya tidak ada dua definisi otorisasi berubah bersamaan) | Test: role admin masih bisa akses `/audit`, `/reports` |
| 4 | Hapus fungsi `requireRole` dari `auth.ts` | Grep codebase — pastikan nol pemanggilan tersisa sebelum hapus definisi |

**Kenapa urutan "risiko terendah dulu":** File seperti `users.ts` (1 authorization-gate) adalah kandidat pembuktian pola migrasi dengan blast radius kecil jika ada kesalahan — bukan lompat langsung ke `cash.ts` yang menyentuh approval finansial.

**Rollback per langkah:** Setiap commit di langkah 2 adalah revert Git murni (kode aplikasi, bukan schema) — rollback instan tanpa downtime. Langkah 1 (schema) di-rollback dengan `DROP TABLE permission_scopes` (aman karena tabel baru, tidak ada foreign key masuk ke dalamnya dari tabel lain).

## Migrasi 1A.2 — RLS Sinkronisasi (Migrasi Paling Berisiko di Seluruh Phase 1)

**Strategi: per-tabel, bukan per-migration-file monolitik.** 45 tabel di `049_rls_policies.sql` **tidak** dimigrasikan dalam satu migration SQL besar — setiap tabel (atau kelompok tabel terkait erat) adalah migration file terpisah.

### Urutan Migrasi per Kelompok Tabel

| Kelompok | Tabel Contoh | Risiko | Urutan |
|---|---|---|---|
| Referensi read-mostly | `material_categories`, `materials` | 🟢 Rendah — sudah `USING (true)`, minim perubahan | 1 (pertama, validasi pola) |
| Operasional non-finansial | `milestones`, `documents`, `project_photos` | 🟡 Sedang | 2 |
| Field ops | `progress_logs`, `work_scopes`, `workers` | 🟡 Sedang | 3 |
| **Finansial** | `kasbons`, `invoices`, `payments`, `cash_accounts`, `expense_reports` | 🔴 Tinggi | 4 (terakhir, setelah pola terbukti di 3 kelompok sebelumnya) |
| RBAC v2 sendiri | `roles`, `permissions`, `role_permissions` | 🔴 Tinggi (meta-risk) | Sudah benar dari migration 050, **tidak disentuh** |

### Prosedur per Tabel (Berulang untuk Setiap Kelompok)

1. **Migration baru** — buat `has_permission()` function (sekali saja, migration terpisah paling awal) dan `CREATE POLICY` baru untuk tabel target, **tanpa menghapus policy lama**.
2. **Kedua policy hidup berdampingan sementara** (lama = literal role, baru = `has_permission()`) — Postgres RLS mengevaluasi **OR** antar semua policy yang cocok, jadi policy baru yang lebih permisif tidak akan memblokir apa pun yang sudah bekerja (safe untuk deploy).
3. **Verifikasi:** Test otomatis ([06-test-strategy.md](06-test-strategy.md)) memastikan role kustom baru sekarang mendapat akses yang benar via policy baru.
4. **Hapus policy lama** — migration terpisah, **hanya setelah** langkah 3 lulus dan berjalan stabil beberapa hari di staging/production tanpa insiden.

**Rationale "dua policy hidup berdampingan":** Ini adalah pola **expand-contract** klasik untuk migrasi skema berisiko tinggi — expand (tambah baru), verifikasi, contract (hapus lama). Menghapus policy lama di step yang sama dengan menambah yang baru berarti tidak ada jaring pengaman jika policy baru salah desain.

### Rollback

- **Sebelum step 4 (hapus policy lama):** Rollback = `DROP POLICY` pada policy baru saja — sistem kembali ke behavior lama sepenuhnya, nol risiko karena policy lama tidak pernah disentuh.
- **Setelah step 4:** Rollback = re-create policy lama dari `049_rls_policies.sql` (disimpan sebagai referensi) sebagai migration baru — bukan `git revert` schema (Postgres tidak versioned seperti Git), tapi menulis ulang `CREATE POLICY` yang sama persis.

**Enumerasi ~17 tabel tanpa RLS:** Dikerjakan sebagai **task terpisah** sebelum kelompok manapun di atas dimulai — setiap tabel diputuskan sadar (butuh RLS atau memang read-all yang disengaja), didokumentasikan di [09-definition-of-done.md](09-definition-of-done.md) sebagai checklist eksplisit, bukan diasumsikan aman karena "belum pernah jadi masalah."

## Migrasi 1A.3 — Audit Trail Helper

**Tidak destruktif** — pembuatan file baru (`audit.ts`) dan penambahan kolom nullable (`correlation_id`, `workflow_id`, `reason`). Urutan:

1. Migration: tambah 3 kolom baru ke `audit_logs`, semua nullable (aman, additive).
2. Bangun `apps/api/src/utils/audit.ts`.
3. Migrasikan `change-orders.ts:576` ke helper baru — **file pertama karena sudah ada precedent-nya**, risiko rendah.
4. Instrumentasi 6 event yang belum tercatat, **satu event per commit**, prioritas: `kasbon.status` dan `payment.deleted` dulu (paling finansial-kritis), diikuti sisanya.

**Rollback:** Setiap penambahan instrumentasi adalah kode aplikasi murni (insert tambahan) — revert Git, nol risiko ke data existing (audit log yang sudah tercatat tidak terpengaruh rollback kode).

## Migrasi 1A.4/1A.5 — Test Suite & CI/CD

Tidak ada migrasi data — murni penambahan infrastruktur baru (dependency `vitest`, file `.github/workflows/ci.yml`). **Nol risiko terhadap sistem production** karena tidak menyentuh runtime aplikasi sama sekali sampai CI benar-benar dipakai sebagai gate merge (keputusan branch protection adalah langkah terpisah, opsional, butuh persetujuan founder eksplisit karena mengubah workflow kerja tim).

## Migrasi 1B — Configuration, Menu, Module Registry

**Pola sama untuk ketiganya:** tabel baru (additive) → seed data dari nilai hardcoded existing → **kode lama tetap berjalan** sampai kode baru terverifikasi → switch kode untuk baca dari tabel → hapus hardcode lama.

**Contoh konkret untuk tax rate (satu-satunya hardcode nyata):**
```
1. CREATE TABLE company_settings (migration additive)
2. Seed: INSERT INTO company_settings (key, value) VALUES ('tax.ppn_rate', '0.11'), ('tax.pph_final_rate', '0.02')
3. Kode termin-payment.ts:175 diubah baca dari company_settings, DENGAN fallback ke hardcode lama jika query gagal (defensive selama masa transisi)
4. Setelah stabil, fallback dihapus
```

## Migrasi 1C — Workflow Registry (Strangler-Fig)

Mewarisi pola yang **sudah didesain eksplisit** di [04 — Migration Strategy](../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase): kasbon dulu (paling sederhana) → validasi dengan test suite dari 1A → change-orders → procurement (paling kompleks, banyak status). Setiap modul yang bermigrasi adalah **deploy terpisah**, modul lain yang belum bermigrasi terus berjalan dengan logic hardcoded lama tanpa terganggu.

## Migrasi 1D — Observability

**Perubahan config, bukan migrasi data.** Risiko utama: mengubah logger dari `pino-pretty` selalu-aktif ke environment-conditional bisa **memutus visibility log di suatu environment** jika `NODE_ENV` tidak diset dengan benar di server yang menjalankan app hari ini — mitigasi: verifikasi eksplisit nilai `NODE_ENV` di environment production/staging **sebelum** deploy perubahan ini (bukan asumsi sudah benar).

---

## Compatibility Strategy — Mobile App

**Perhatian khusus yang tidak boleh terlewat:** Puraloka Suite punya mobile app (Expo, Fase 1 selesai) yang memanggil API yang sama. Setiap perubahan endpoint/permission **harus** diverifikasi tidak merusak alur mobile app (auth, role nav, kasbon, notifikasi, progress) — mobile app tidak selalu update bersamaan dengan API (release cycle app store lebih lambat). Migrasi permission/RLS di atas **tidak mengubah kontrak endpoint** (request/response shape tetap sama) — hanya *siapa yang boleh mengakses* yang berubah sumber kebenarannya, sehingga risiko breaking mobile app secara struktural rendah, **tapi tetap wajib ditest manual di app mobile**, bukan diasumsikan aman karena "kontrak endpoint tidak berubah."

---

*Dokumen selanjutnya: [04 — Risk Register](04-risk-register.md) — daftar risiko lengkap dengan mitigasi, termasuk risiko yang disinggung di atas dikonsolidasikan formal.*
