# Implementation Kickoff — 08. Day One Checklist

**Tujuan:** Checklist presisi yang harus tercentang **sebelum** baris kode Sub-Fase 1A pertama ditulis. Ini bukan Definition of Ready (kondisi task individual — lihat [09-definition-of-ready.md](09-definition-of-ready.md)) — ini adalah **satu kali**, di hari pertama saja.

---

## Bagian 1 — Governance Gate (Wajib Pertama, Sebelum Apa Pun di Bawah)

- [ ] **Architecture Review Gate dijalankan dan didokumentasikan** — [Phase1/09-definition-of-done.md:12](../Phase1/09-definition-of-done.md#architecture-review-gate-v11--item-baru): dokumentasi tertulis singkat (bisa berupa entry di dokumen ini sendiri atau catatan terpisah) + jeda minimal 1 hari sebelum eksekusi kode dimulai. **Ini item yang paling mungkin terlewat** karena tidak ada artefak teknis yang memaksanya — murni disiplin proses. Dicatat sebagai entry terpisah (tanggal + ringkasan keputusan), bukan diasumsikan otomatis terpenuhi oleh checklist teknis di bawah.
- [ ] **Keputusan founder:** apakah trigger append-only untuk `audit_logs` (F5.5 di [05-feature-implementation-order.md](05-feature-implementation-order.md)) masuk cakupan 1A atau dicatat terpisah — [Phase1/07-security-review.md:59](../Phase1/07-security-review.md) merekomendasikan masuk 1A, tapi tetap butuh keputusan eksplisit, bukan default.

## Bagian 2 — Backup & Environment Verification

- [ ] **Verifikasi status PITR Supabase** — cek dashboard Supabase langsung, murni administratif (hitungan menit), belum pernah dikonfirmasi statusnya sampai hari ini.
- [ ] **Verifikasi `NODE_ENV`** di environment yang relevan (meski 1D observability belum dikerjakan di 1A, prinsip "verifikasi eksplisit, jangan asumsi" berlaku sejak awal — cek nilai apa yang sebenarnya diset hari ini sebagai baseline).
- [ ] **Verifikasi `.env` lokal lengkap** — `apps/api/.env` (SUPABASE_URL, SUPABASE_SECRET_KEY, JWT_SECRET, VAPID keys) dan `apps/web/.env.local` sesuai [CLAUDE.md § Environment Variables](../../../../../CLAUDE.md#environment-variables) — bukan diasumsikan sudah benar karena "biasanya jalan."

## Bagian 3 — Git & Branch Setup

- [ ] **Buat branch pertama:** `feature/1a-test-infra-setup` dari `main` (HEAD saat ini: `43ad54d`).
- [ ] **Konfirmasi `git status` bersih** sebelum mulai — tidak ada uncommitted changes yang bercampur dengan Task pertama.

## Bagian 4 — Baseline Snapshot (Sebelum Perubahan Apa Pun)

- [ ] **Generate schema snapshot** — `pg_dump --schema-only` atau ekspor struktur tabel saat ini sebagai referensi pembanding pasca-migrasi (terutama untuk membuktikan migration 059+ benar-benar additive, bukan asumsi).
- [ ] **Generate permission snapshot** — hasil query `SELECT * FROM role_permissions` (atau setara) hari ini, sebagai baseline untuk memverifikasi migrasi Epic 3/4 tidak mengubah *hasil* otorisasi, hanya *mekanismenya*.
- [ ] **Verifikasi RLS snapshot** — `049_rls_policies.sql` sudah tersimpan sebagai referensi rollback (dikonfirmasi ada, tidak perlu langkah tambahan — hanya verifikasi file ini tidak pernah diedit sejak di-apply, sesuai Prinsip Non-Negotiable #4).
- [ ] **Verifikasi audit log baseline** — konfirmasi `change-orders.ts:576` adalah satu-satunya insert point aktif hari ini (baseline untuk membuktikan Epic 5 benar-benar menambah, bukan menduplikasi).
- [ ] **Jalankan baseline test manual** — login sebagai admin/PM/mandor/client di web app, konfirmasi behavior hari ini (sebelum ada perubahan apa pun) sebagai baseline pembanding pasca-migrasi Epic 3/4.

## Bagian 5 — Tooling Verification (Menutup Gap F2)

- [ ] **Konfirmasi `apps/api` belum punya ESLint config/script `lint`** — ini bukan asumsi, ini fakta yang harus diverifikasi ulang di hari eksekusi (dokumen ini ditulis 18 Juli 2026, keadaan bisa berubah jika ada kerja lain di antaranya).
- [ ] **Konfirmasi `pnpm` versi sesuai** `devEngines.packageManager` di root `package.json` (`11.5.2`).

## Bagian 5B — Migration Number Reverification (Menutup Gap F3, Wajib Sebelum Epic 3)

**Konteks:** Draft awal [04-database-migration-plan.md](04-database-migration-plan.md) sempat keliru mengklaim `db/migrations/` dan `supabase/migrations/` sinkron 58/58 file. Verifikasi ulang mengonfirmasi keduanya **tidak sinkron** (`db/migrations/`=57, `supabase/migrations/`=58, `supabase/migrations/059_seed_dummy_data.sql` tanpa pasangan) — kesalahan sudah dikoreksi di dokumen tersebut, tapi karena kesalahan serupa (`ls | wc -l` yang keliru) sudah terjadi sekali, langkah ini **MUST** dijalankan ulang tepat sebelum menulis migration pertama, bukan dipercaya dari dokumen manapun termasuk dokumen ini.

- [ ] Jalankan `diff <(cd db/migrations && ls *.sql | sort) <(cd supabase/migrations && ls *.sql | sort)` — konfirmasi hasil terkini (bisa berbeda dari yang tercatat di dokumen ini jika ada pekerjaan lain di antaranya).
- [ ] **Jika masih ada gap** (mis. `059_seed_dummy_data.sql` masih tanpa pasangan): putuskan dan laporkan — apakah file itu di-backfill ke `db/migrations/` (memulihkan sinkron) atau memang sengaja supabase-only — **jangan diasumsikan, ini keputusan founder**, bukan sesuatu yang diselesaikan sepihak oleh siapa pun yang mengeksekusi.
- [ ] Tentukan nomor migration pertama Sub-Fase 1A yang sebenarnya berdasarkan hasil verifikasi ini (bisa jadi 059 jika gap sudah diselesaikan sebagai backfill, atau 060 jika 059 tetap milik `supabase/migrations/` saja) — **bukan** mengikuti angka di [04-database-migration-plan.md](04-database-migration-plan.md) secara membabi buta.

## Bagian 6 — Mulai Coding

- [ ] **File pertama yang disentuh:** `apps/api/package.json` — tambah dependency `vitest` + `@vitest/coverage-v8` (T1.1.1 di [05-feature-implementation-order.md](05-feature-implementation-order.md)).
- [ ] **Commit pertama:** `feat(api): setup vitest test infrastructure` — bukan langsung menyentuh Permission Engine/RLS, konsisten urutan wajib di [02-phase-1a-sequence.md](02-phase-1a-sequence.md).

---

## Bagian Ini TIDAK Boleh Dilewati untuk Mempercepat

Setiap item Bagian 1 dan Bagian 4 (governance gate + baseline snapshot) terasa seperti overhead administratif untuk solo developer yang ingin cepat mulai — tapi keduanya adalah **satu-satunya** bukti pembanding yang akan dipakai untuk memverifikasi "migrasi ini benar-benar tidak mengubah behavior yang sudah bekerja," bukan hanya "tidak error saat dijalankan." Tanpa baseline, klaim "RLS sync tidak mengubah akses siapa pun" tidak bisa dibuktikan, hanya diasumsikan — persis pola yang berulang kali ditandai sebagai risiko di seluruh Phase1 set (R1, R2, R9).

---

*Dokumen selanjutnya: [09 — Definition of Ready](09-definition-of-ready.md) — kondisi startable untuk setiap task individual.*
