# SDD ledger — plan: docs/superpowers/plans/2026-08-06-sumbu-ui-roadmap.md

Branch: feat/sumbu-ui-roadmap (dari main @ 9c26160)
CATATAN: ledger ini DIPULIHKAN 2 kali — sesi/agent lain menghapus .superpowers/ dan docs/superpowers/ dari disk (isinya aman di git).

Task 1: complete (commit 3cc9803) — 6 baris status dikoreksi setelah verifikasi ke kode. Review bersih, 0 findings.
Task 2: complete (commit 869bc608) — penjaga F8-1, lantai takDipetakan=33. Mutasi terbukti MERAH lalu HIJAU.
Task 2: catatan — 6 modul Task 1 kini 🟡 sehingga tak bisa memicu `basi`. Perlindungan nyata di ratchet takDipetakan.
Task 3: complete (commit 7a58e7e) — 6 item INTI ditambahkan, 102 insertions.
Task 3: KOREKSI — controller instruksikan F5-INTI-1=wip; implementer mengukur dan menemukan `done` (neraca-laba-rugi.tsx dirender di akuntansi/page.tsx:257). Controller verifikasi: implementer BENAR.
Task 4: complete (commit defb8c5) — penjaga F8-2, lantai tanpaUi=1 (sisa #2 IPC). Mutasi NCR terbukti MERAH lalu HIJAU.
Task 4: KOREKSI — pola '#8 Geotag foto' di rencana salah (latitude/longitude); kode pakai lintang/bujur. Controller verifikasi: perbaikan implementer BENAR.
Catatan sesi: sesi/agent LAIN aktif di checkout yang sama (commit 3d5a38b, 2d34616, migrasi 193/194 muncul sendiri).
Task 5: complete (commit 4b7df3b) — penjaga F8-3, lantai routeNol=27 DIUKUR SUNGGUHAN (coverage run terhadap DB nyata). Mutasi 27->26 terbukti MERAH, dipulihkan HIJAU.
Task 5: catatan — implementer menambah --coverage.reportOnFailure karena vitest tak menulis coverage-summary.json bila ada test gagal. Test yang gagal (tenancy-ratchet) berasal dari kerja sesi lain yang belum di-commit, bukan dari task ini.
Task 6: BELUM — docs/ hilang total dari disk saat hendak menulis JOURNAL (sesi lain sedang beroperasi). Ditunda, bukan gagal. Pulihkan: git checkout HEAD -- docs/
