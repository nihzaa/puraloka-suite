# Sub-Fase 1B — Completion Audit

**Batas fase** (AUTOPILOT §7). Semua bukti di bawah **diverifikasi ulang saat audit ini ditulis** (2026-07-23), bukan disalin dari klaim commit/PR sebelumnya. Angka yang tidak bisa diverifikasi ulang ditandai eksplisit.

**Scope:** 1B.1 Configuration Engine · 1B.2 Menu Registry · 1B.3 Module Registry & Feature Flags · 1B.4 users.role enum→FK (Red-Line #1).

---

## 1. Tabel bukti objektif

| # | Kriteria | Metode verifikasi | Hasil | Verdict |
|---|---|---|---|---|
| 1 | Test suite | `vitest run` lokal terhadap dev DB | **130 passed / 0 failed / 0 skipped** (18 file) | ✅ |
| 2 | Typecheck | `tsc --noEmit` di `apps/api` | exit 0, nol error | ✅ |
| 3 | Lint | `pnpm lint` | **0 error**, 46 warning (`no-explicit-any` pre-existing) | ✅ |
| 4 | Build | job CI "API — lint, typecheck, test, build" | hijau di #15/#16/#18; #17 lihat §4 | ✅ |
| 5 | Gap authorization: `requireRole` | grep `src` (exclude test) | **0 kemunculan** | ✅ |
| 6 | Permission gating | grep | `requirePermission(` = **111** · `hasPermission(` = **5** | ✅ |
| 7 | Role-literal di kode | grep `currentUser.role ===` | **52** — semua **data-scoping/ownership isolation**, bukan permission gate (diizinkan ADR-004 Rule #1) | ⚠️ lihat §3 |
| 8 | RLS coverage | `pg_class.relrowsecurity` | **63/63 tabel** RLS enabled | ✅ |
| 9 | RLS policy total | `pg_policies` | **137 policy** |  ✅ |
| 10 | RLS literal-role | regex `auth_role() = '...'` di qual/with_check | **0** | ✅ |
| 11 | RLS berbasis permission | `pg_policies ILIKE '%has_permission%'` | **27 policy** | ✅ |
| 12 | Migration verified column-level | `pg_attribute` (bukan table-exists) | lihat §2 | ✅ |
| 13 | Drift check 080 | fresh-replay + diff struktural | **NOL DRIFT** — lihat §2 | ✅ |
| 14 | Tracking migration | `supabase_migrations.schema_migrations` | **77 tercatat**; 075-080 lengkap (6/6) | ✅ |
| 15 | Smoke test per-role live | impersonasi RLS (`request.jwt.claims`) | 4/4 role benar + fail-closed — lihat §5 | ✅ |
| 16 | Role custom `direktur` | INSERT user + `get_role_permissions` | **assignable**, 45 permission | ✅ |
| 17 | Audit append-only (F5.5) | `pg_trigger` pada `audit_logs` | **2/2** trigger aktif | ✅ |
| 18 | Tabel 1B + RLS | `pg_class` + row count | company_settings(2)/menu_items(15)/modules(14)/feature_flags(0), semua RLS=true | ✅ |

---

## 2. Drift check migration 080 (wajib — §permintaan founder)

**Kenapa diaudit khusus:** file `080_users_role_contract.sql` **diedit setelah** sempat di-apply ke `public`, dan apply pertamanya kena quirk pooler (view `critical_audit_events` ter-DROP tapi CREATE tidak persist; sempat di-recreate lewat script ad-hoc, bukan lewat migration). Jadi state `public` dicapai lewat jalur berbeda dari file migration — wajib dibuktikan tidak menyimpang.

### Metode
1. Replay **set migration scoped** (001, 002, 009, 046, 050, 072, 075-080) ke schema kosong → 12/12 sukses, 0 gagal.
2. Diff struktural fresh vs `public` untuk objek 1B: kolom (column-level via `pg_attribute`), tipe, NOT NULL, index, view, function, keberadaan type.

### Hasil — **NOL DRIFT**

| Objek | Fresh (dari file migration) | Public (state aktual) | Verdict |
|---|---|---|---|
| kolom tabel 1B + `users` | — | — | **beda tipe/NN: 0** · **hanya-fresh: 0** · hanya-public: 1 (`users.push_subscription`, dari migration di luar set scoped — bukan drift) | ✅ |
| `critical_audit_events` | ada | ada | definisi **identik karakter-per-karakter** setelah normalisasi kualifikasi schema & cast | ✅ |
| `auth_role()` | ada | ada | **identik** (murni FK: `JOIN roles r ON r.id = u.role_id`) | ✅ |
| type `user_role` | tidak ada | tidak ada | ✅ konsisten (di-drop di kedua sisi) | ✅ |
| `users.role` (kolom enum) | tidak ada | tidak ada | ✅ | ✅ |
| `users.role_id` | uuid NOT NULL + FK `users_role_id_fkey → roles(id)` | sama | ✅ | ✅ |
| index tabel 1B | — | — | hanya-public: 0 · hanya-fresh: 0 | ✅ |
| tracking `schema_migrations` | — | 075,076,077,078,079,080 | **6/6 tercatat** | ✅ |

**Kesimpulan:** recreate view lewat script ad-hoc menghasilkan definisi **identik** dengan yang diproduksi file migration 080. Tidak ada perbaikan yang diperlukan.

### Temuan tambahan (jujur, di luar scope 1B — TIDAK diperbaiki di fase ini)

1. **Set migration penuh (001-080) TIDAK replay bersih ke schema kosong** — 10 migration gagal saat percobaan full-replay:
   - `012/014/015/016` — policy pada `storage.objects` (objek **global lintas-schema**, bukan per-schema) → "already exists" saat replay kedua.
   - `024/036` — seed data melanggar FK (data seed bergantung urutan/ketersediaan row lain).
   - `034/070` — constraint/policy "already exists".
   - `049/065` — `column "is_deleted" does not exist` (efek berantai dari `036` yang gagal).

   **Sifat:** pre-existing, **bukan** disebabkan 1B. Artinya migration set saat ini **tidak idempotent/replayable dari nol** — hanya "forward-apply dari state yang sudah ada". Ini utang teknis nyata untuk provisioning environment baru (staging/production).
   **Rekomendasi:** jadikan item tersendiri (kandidat 1C/1D atau pekerjaan infrastruktur) — bukan tambalan di 1B.

2. **Migration 043-047 belum pernah di-apply ke `public`** (modul akuntansi/aset: `accounts`, `journal_entries`, `assets`, dst — 122 kolom hanya ada di fresh-replay). Ini **sudah diketahui & terdokumentasi** sejak Gate 1A ("apply 043-047 saat fitur dibangun"), 0 referensi kode. Bukan regresi 1B.

---

## 3. Catatan kriteria #7 — 52 role-literal

Grep `currentUser.role === '...'` menemukan **52** kemunculan. Klasifikasi (konsisten dengan Remediation 3.5 di Sub-Fase 1A):

- **Bukan authorization gate.** Semua endpoint sudah dijaga `requirePermission(...)` di `preHandler`.
- Kemunculan ini adalah **data-scoping** (mis. `if (currentUser.role === 'pm') query.eq('pm_id', currentUser.id)`) dan **ownership isolation** (mis. `if (role==='pm' && project.pm_id !== user.id) → 403`).
- ADR-004 Rule #1 mengizinkan ini: permission menentukan **boleh/tidak**, scoping menentukan **baris mana**.

**Sikap jujur:** angka 52 lebih tinggi dari sebelumnya karena 1B.4 tidak mengurangi data-scoping (memang bukan tujuannya). Mengubah data-scoping menjadi berbasis capability = pekerjaan tersendiri (kandidat 1C/1D), **bukan** kegagalan 1B.

---

## 4. Insiden & lesson learned

### 4.1 Quirk pooler pada DDL destruktif (080) — **berulang, sudah pernah kena di F5.5**

**Apa yang terjadi:** apply 080 lewat `pg` client (DIRECT_URL, pooler transaction-mode) melaporkan `COMMIT OK`, tetapi `DROP COLUMN users.role`, `DROP TYPE user_role`, dan `CREATE VIEW critical_audit_events` **tidak persist**. Lebih menyesatkan lagi: `information_schema.columns` mengembalikan metadata **stale** (bilang kolom masih ada), sementara `ALTER TABLE ... DROP COLUMN role` gagal dengan "column does not exist" — dua sumber saling bertentangan dalam satu sesi.

**Bagaimana ketahuan:** verifikasi memakai `pg_attribute` (katalog otoritatif) dari **koneksi baru**, bukan `information_schema` dari koneksi yang sama.

**Dampak:** view sempat hilang dari `public` (ter-DROP tanpa ter-CREATE) dan baru ketahuan saat verifikasi lanjutan; di-recreate manual, lalu **dibuktikan identik** dengan output file migration (§2).

**Lesson (berlaku seterusnya):**
1. DDL destruktif → jalankan **autocommit**, jangan bungkus BEGIN manual.
2. Verifikasi **selalu dari koneksi baru**.
3. Cek kolom pakai `pg_attribute` (`NOT attisdropped`), **jangan** `information_schema` — bisa stale di pooler.
4. Cek type/objek **per-schema** (`pg_namespace`), jangan by-name saja — schema `test` punya salinan bernama sama (`test.user_role` sempat membuat hasil cek "type masih ada" yang menyesatkan).
5. Setelah DDL destruktif, **jalankan drift check** sebelum menutup fase.

### 4.2 Sequencing: migration destruktif di-apply ke dev DB saat PR lain masih terbuka — **kesalahan proses**

**Apa yang terjadi:** 080 (drop `users.role`) di-apply ke **dev DB bersama** sementara PR #17 masih terbuka. CI #17 berjalan terhadap dev DB itu, sedangkan kodenya masih query `users.role` → **CI #17 merah** setelah merge main, dan sebagian test RLS **skip diam-diam** (kehilangan coverage tanpa gagal — lebih berbahaya daripada merah).

**Perbaikan:** ambil perbaikan test berbasis FK dari branch 1B.4 ke #17 (`audit-integration.test.ts`, `rls-harness.ts` — keduanya tidak bergantung file migration). Hasil: **130 test hijau, 0 skip** (coverage RLS pulih).

**Lesson:** untuk migration **destruktif** pada DB bersama, urutannya harus: merge PR kodenya **lebih dulu** (atau bersamaan), baru apply ke DB bersama. Meng-apply lebih dulu membuat semua PR terbuka lain tidak konsisten dengan DB.

**Catatan tambahan:** "test skip" harus diperlakukan sebagai sinyal bahaya. Test RLS di-skip saat `authIdForRole()` mengembalikan null — tampak "hijau" padahal nol coverage.

---

## 5. Smoke test per-role (live, dev DB)

Metode: impersonasi lewat `set_config('request.jwt.claims', ...)` di transaksi rollback-safe — persis jalur yang dievaluasi RLS.

| Role | `auth_role()` | Sesuai? | `has_permission('projects:view')` | Permission tak dikenal |
|---|---|---|---|---|
| admin | `admin` | ✅ | true | false ✅ fail-closed |
| pm | `pm` | ✅ | true | false ✅ fail-closed |
| mandor | `mandor` | ✅ | true | false ✅ fail-closed |
| client | `client` | ✅ | true | false ✅ fail-closed |

**Role custom `direktur` (bukti tujuan 1B.4):**
- INSERT user dengan `role_id → direktur` **berhasil** — sebelum 1B.4 ditolak enum. ✅
- `get_role_permissions('direktur')` = **45 permission** (termasuk `finance:view`, `users:manage`).
- Belum ada user `direktur` nyata di dev (0 terdaftar) — user smoke dibuat lalu dihapus. **Jujur:** verifikasi login end-to-end via Supabase Auth untuk `direktur` **belum** dilakukan (butuh pembuatan akun auth; di luar scope & menyentuh kredensial).

| Role | permission | user terdaftar |
|---|---|---|
| admin | 51 | 1 |
| pm | 40 | 3 |
| mandor | 10 | 7 |
| client | 3 | 12 |
| direktur | 45 | 0 |

---

## 6. Verdict

**Sub-Fase 1B: LULUS.**

Seluruh kriteria terpenuhi dengan bukti terverifikasi ulang. Dua insiden proses (§4) ditemukan, diperbaiki, dan dicatat sebagai lesson learned — keduanya **tidak meninggalkan drift** pada state akhir (§2).

**Utang teknis yang dicatat (tidak diperbaiki di 1B, bukan blocker):**
1. Migration set tidak replayable dari schema kosong (10 migration gagal) — penting untuk provisioning environment baru.
2. Migration 043-047 belum di-apply (fitur belum dibangun) — sudah diketahui sejak Gate 1A.
3. 52 role-literal data-scoping — kandidat konversi ke capability-based scoping.

---

*Ditulis 2026-07-23 pada penutupan Sub-Fase 1B. Semua angka diverifikasi ulang saat penulisan.*
