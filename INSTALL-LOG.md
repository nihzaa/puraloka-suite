# Install Log — Skill & MCP

File yang diwajibkan `AUTOPILOT.md` §8 baris 125 tapi belum pernah dibuat — dibuat
sesi ini. Catat SETIAP install skill/MCP baru: nama, versi/sumber, alasan, tanggal.

| Tanggal | Nama | Sumber | Alasan | Catatan |
|---|---|---|---|---|
| 2026-07-29 | `fastify-typescript` | `mindrally/skills@fastify-typescript` (GitHub, Apache-2.0, 204★, org publik, 1 file SKILL.md — dibaca penuh sebelum instal) | Owner minta skill backend Fastify — stack API proyek ini | ⚠️ **Skill mengasumsikan Prisma+Jest — proyek pakai Supabase client + Vitest.** Pola struktur route/plugin/schema/error-handling/security tetap berlaku; ABAIKAN contoh kode Prisma/Jest di dalamnya, ganti pola query dengan `supabase.from()` dan test dengan `vitest`. Jangan ikuti sarannya untuk migrasi ke Prisma. |
