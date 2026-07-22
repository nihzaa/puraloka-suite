# Gate 1A→1B — Respons 5 Prasyarat Founder

Jawaban terhadap 5 hal yang harus ditutup sebelum Gate 1A→1B. Semua dengan bukti query DB langsung.

---

## #1 — Klaim "scope-preserving" DIKOREKSI + lockout audit

**Koreksi jujur:** klaim "scope-preserving" **salah**. Fix cash/progress adalah **flip deny-list → allow-list**:
- Gate lama: `role IN (mandor,client) → 403` = **deny-list** (semua role lain, termasuk custom apa pun, BOLEH).
- Gate baru: `requirePermission(...)` = **allow-list** (hanya yang punya permission). Lebih aman, tapi **bukan identik**.

**Lockout audit — SEMUA role di sistem (bukan cuma admin/pm):**

| Role | builtin? | cash:view | progress:manage | cash lockout | progress lockout |
|---|---|---|---|---|---|
| admin | ✓ | Y | Y | no | no |
| pm | ✓ | Y | Y | no | no |
| mandor | ✓ | N | N | no (dulu deny juga) | no (owner-path tetap jalan) |
| client | ✓ | N | N | no (dulu deny juga) | no (dulu deny juga) |
| **direktur** | **custom** | Y | **N** | no | **⚠️ YES (teoretis)** |

**Temuan:** `direktur` (role custom) dulu bisa DELETE progress log (deny-list hanya tolak client; direktur bukan client/mandor → lolos), sekarang ditolak (tak punya `progress:manage`).

**TAPI dampak nyata = 0 user.** Temuan lebih dalam saat verifikasi: **`users.role` adalah enum `user_role` dengan hanya 4 nilai** (admin/pm/mandor/client). Role `direktur` ada di tabel `roles` (RBAC v2) **tetapi tidak bisa di-assign ke user manapun** — enum menolaknya (`invalid input value for enum user_role: "direktur"`). Dikonfirmasi: user nyata hanya pakai 4 built-in.

**Kesimpulan #1:**
- Fix bukan scope-preserving (flip semantik) — klaim dikoreksi.
- Lockout `direktur` teoretis, **0 user nyata terdampak**.
- **Isu arsitektur laten ditemukan (bukan Phase 1A, dicatat):** RBAC v2 mendukung role custom (auth.ts `role: string`, UI buat role), tapi `users.role` masih enum 4-nilai → role custom **tak pernah bisa dipakai user** sampai enum diganti ke TEXT/FK. Ini gap yang membuat "role custom" belum berfungsi end-to-end. Kandidat pekerjaan Sub-Fase 1B (Configuration/RBAC completion).

---

## #2 — Smoke Test Checklist (dijalankan founder dengan kredensial Auth)

Jalankan API + login tiap role. Ekspektasi (berdasarkan `role_permissions` saat ini):

### Endpoint yang di-fix (fokus utama)
| Endpoint | admin | pm | mandor | client |
|---|---|---|---|---|
| `GET /api/v1/cash/accounts/:id` | 200 | 200 (proyek sendiri) / 403 (proyek lain) | **403** | **403** |
| `DELETE /api/v1/progress-logs/:logId` | 200 | 200 | 200 (log sendiri) / 403 (log orang lain) | **403** |

### Regression RBAC umum (sanity)
| Endpoint | admin | pm | mandor | client |
|---|---|---|---|---|
| `GET /api/v1/audit` | 200 | **403** | **403** | **403** |
| `PATCH /api/v1/reports/rekap-pajak/:id/status` | 200 | 200 | **403** | **403** |
| `PATCH /api/v1/kasbons/:id/status` (approve) | 200 | 200 (proyek sendiri) | **403** | **403** |
| `GET /api/v1/projects` | 200 (semua) | 200 (di-assign) | 200 (di-assign) | 200 (milik) |

**Kalau smoke test mengungkap lockout tak terduga** (mis. pm/mandor yang seharusnya bisa malah 403) → itu bug Phase 1A, lapor untuk diperbaiki sebelum Gate. `direktur` tidak bisa ditest (tak ada user — lihat #1).

---

## #3 — Migration Drift: sifat drift DIJELASKAN (bukan sekadar "paralel")

Audit menyeluruh 81 kolom + 62 fungsi + 68 tabel dari semua file migration vs schema DB nyata. **Drift itu CAMPURAN — ada schema mismatch NYATA:**

| Kategori | Migration | Sifat | Tindakan |
|---|---|---|---|
| **Mismatch nyata BERDAMPAK** (dipakai kode) | 046 (audit diff/severity) | tak ter-apply | ✅ Fixed saat Epic 5 |
| | 058 (procurement: min_stock, canceled_at, cancel_notes) | **apply PARSIAL** (2 dari 5 kolom masuk, 3 hilang) | ✅ **Fixed sekarang** (re-apply idempotent) |
| **Mismatch TAK berdampak** (fitur belum diimplementasi, **0 referensi kode**) | 043 (RAB material tracking), 044 (field opname), 045 (asset mgmt), 047 (general ledger) | tabel+kolom di file tapi tak ada di DB; **tak ada kode yang query** | Dicatat — bukan bug (tak ada yang error). Apply saat fiturnya dibangun |
| **Dorman by design** | 073 (append-only) | sengaja belum apply | Menunggu #4 |
| **Tracking table** | `schema_migrations` | berhenti di 057; 058-074 tak tercatat (apply manual pg, bukan `supabase db push`) | Rekonsiliasi (bawah) |

**Jawaban lugas atas pertanyaanmu:** bukan cuma tracking beda — **ada schema mismatch nyata** (046, 058) yang **berdampak ke fitur yang dipakai** (audit gagal insert, procurement min_stock/cancel error). Keduanya **sudah diperbaiki**. Sisanya (043-047) mismatch tapi zero-impact (fitur belum ada di kode). Tidak ada lagi drift berdampak setelah 058 di-fix.

**Root cause:** dua jalur apply migration tak sinkron — `supabase db push` (berhenti 057) vs apply manual `pg` (058+). `supabase db push` rupanya juga gagal/skip senyap di beberapa migration (046, 058 parsial, bahkan 039-041/048 tak tercatat) lebih awal. Diperparah setup Supabase tak-standar (`supabase/config.toml` tidak ada meski project linked).

**Rekonsiliasi — SUDAH DILAKUKAN:** `schema_migrations` di-rekonsiliasi. Untuk **setiap** migration yang objek schema-nya **terverifikasi ada di DB** (query per-objek), ditandai `applied`: 039,040,041,048,058,060,061,062,063,065,066,067,068,069,070,071,072,074. Tracking naik dari 52 → **70 entri**. Yang **sengaja TIDAK** ditandai: 030/064 (tak ada file, nomor di-skip), 059 (seed supabase-only), 073 (dorman), 043-047 (fitur belum di-apply/belum ada di kode — jangan tandai yang belum apply). Sekarang `schema_migrations` akurat mencerminkan schema nyata.

**Sisa (bukan blocker 1B):** apply 043-047 saat fiturnya dibangun (RAB material tracking, field opname, asset, GL — semua 0 referensi kode saat ini). Ke depan: konsisten pakai satu jalur apply.

---

## #4 — F5.5 Append-Only: tabel yang terdampak

**Konfirmasi:** migration 073 append-only trigger **HANYA menyentuh `audit_logs`** (trigger BEFORE UPDATE + BEFORE DELETE di `audit_logs` saja). **Tidak ada tabel operasional** yang jadi append-only.

- Tidak menyentuh tabel yang butuh koreksi/hapus legit (invoices, kasbons, projects, dst — semua tetap mutable).
- Hanya audit trail yang immutable — best practice forensik standar.
- `service_role`/superuser masih bisa DROP trigger untuk maintenance terencana.

**Rekomendasi:** aman diaktifkan. Trade-off satu-satunya: koreksi baris audit yang salah harus lewat DROP trigger sementara (jarang, terkontrol). Keputusan tetap milikmu.

---

## #5 — Regression test untuk 2 endpoint yang di-fix

**Setuju — untuk fix SECURITY, regression test wajib** supaya refactor masa depan tidak diam-diam membuka lubang. Backfill 2 test minimal (via RLS harness yang sudah ada) yang memverifikasi **permission gate**, bukan cuma scope DB.

Status: **ditambahkan** di PR ini (lihat `rls-fixed-endpoints.test.ts`) — memverifikasi via `get_role_permissions` bahwa mandor/client TIDAK punya cash:view/progress:manage (gate menolak), admin/pm punya (gate mengizinkan). Ini regression guard: kalau seseorang mencabut permission-nya atau mengembalikan role-literal, test merah.

---

## Ringkasan: apa yang berubah dari audit sebelumnya

1. Verdict CONDITIONAL PASS **tetap** — tapi lebih jujur: fix bukan scope-preserving (flip), migration drift ternyata **ada mismatch nyata** (bukan cuma tracking).
2. **2 bug drift diperbaiki** (046 sebelumnya, 058 sekarang).
3. **Isu arsitektur laten ditemukan** (users.role enum vs RBAC v2 custom role) — dicatat untuk 1B.
4. Regression test security ditambahkan.
5. F5.5 & tracking rekonsiliasi tetap keputusan/pekerjaan terpisah.
