# Epic 4 — Contract Phase Gate (RLS)

**Status:** Menunggu keputusan founder. Ini satu-satunya bagian Epic 4 yang **tidak** dieksekusi otonom — sesuai policy (production + operasional + verifikasi eksternal).

## Apa yang sudah selesai (expand phase, otonom)

Keempat kelompok tabel RLS sudah di-**expand**: policy baru berbasis `has_permission()` + ownership helper (ADR-005) hidup **berdampingan** dengan policy lama (literal role). Karena Postgres meng-OR policy, sistem berjalan normal — tidak ada yang rusak. 103 test membuktikan RLS baru bekerja (scope-preserving, zero-leak, no recursion).

Migration 062-070 sudah applied ke **dev**. Belum ke production.

## Apa itu contract phase

Menghapus policy lama (`*_admin_pm`, `*_mandor_select`, dst yang pakai `auth_role() IN (...)` literal) sehingga RLS **hanya** mengenal `has_permission()` — menuntaskan tujuan ADR-004 di level database. Setelah contract, tidak ada lagi literal role di RLS.

## Kenapa ini GATE (tidak otonom)

Per Definition of Ready kelompok Finansial ([09-definition-of-ready.md](09-definition-of-ready.md)) dan Risk Register R7:
1. **Maintenance window** — dijadwalkan di jam operasional rendah (bukan "nanti dicari waktunya").
2. **Independent review** logika policy — sesi terpisah / pembacaan manual founder sebelum drop policy lama.
3. **PITR (Point-In-Time Recovery) Supabase verified** — Go/No-Go item 22, **masih belum dicek** terhadap dashboard Supabase. Butuh akses dashboard (kredensial founder).
4. **Interim detection query harian** — row-count per role selama masa observasi.
5. Apply ke **production** — operasi produksi, wajib berhenti per Autonomous Execution Policy.

## Yang dibutuhkan dari founder

1. **Verifikasi PITR** di dashboard Supabase (Project Settings → Database → Backups) — konfirmasi PITR aktif / tentukan retensi. Ini prasyarat sebelum menyentuh tabel finansial di production.
2. **Jadwalkan maintenance window** untuk apply migration expand + contract ke production.
3. **Independent review** policy `has_permission()` (bisa sesi terpisah).

Begitu ketiga hal itu siap, contract migration (drop policy lama, per kelompok, dengan observasi) bisa disiapkan dan dieksekusi — dengan rollback plan: re-create policy lama dari `049_rls_policies.sql` (disimpan sebagai referensi).

## Rekomendasi urutan

Expand sudah aman di production kapan saja (additive, tidak breaking). Contract menyusul setelah observasi beberapa hari + PITR confirmed — bukan di sesi yang sama dengan expand.
