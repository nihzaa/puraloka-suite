-- Migration 095: DROP tabel workflow yatim (keputusan founder, AUDIT OPEN-2 ditutup)
--
-- KEPUTUSAN FOUNDER (2026-07-24): drop tabel workflow_* yang yatim pasca fase CONTRACT.
-- Alasan founder: "tabel yatim tanpa pembaca = anti-pattern yang kamu sendiri temukan
-- (kasbon_limit_pct)". Desain aman tersimpan di ADR-006 + migration 081 (idempoten) →
-- revival tetap mungkin bila kebutuhan approval multi-langkah muncul (dgn ADR baru).
--
-- Ini migration TERSENDIRI (bukan diselipkan ke migration lain) — sesuai syarat founder,
-- dan sesuai proses yang ia jelaskan sendiri: "drop lewat migration terpisah setelah
-- temuan yatim dilaporkan + rekomendasi" (bukan seperti 092 yang menggabungkan drop ke
-- fase CONTRACT tanpa keputusan eksplisit).
--
-- PRASYARAT DIVERIFIKASI sebelum drop (nol asumsi):
--   • Kode dual-write + 7 modul workflow sudah dihapus (PR #34).
--   • Grep ulang 2026-07-24: NOL pembaca/penulis tabel/fungsi workflow di apps/api & apps/web
--     (hanya 2 komentar tersisa, dibersihkan di PR ini).
--   • Tabel dipulihkan sementara oleh 093 hanya untuk mengembalikan keputusan ke founder.
--
-- BEHAVIOR-PRESERVING: kolom status tabel sumber (kasbons/change_orders) = sumber kebenaran;
-- tabel ini nol dampak. Reversible: `git revert` + re-apply 081-083.

DROP TABLE IF EXISTS workflow_instances   CASCADE;
DROP TABLE IF EXISTS workflow_transitions CASCADE;
DROP TABLE IF EXISTS approval_delegations CASCADE;
DROP TABLE IF EXISTS workflow_states      CASCADE;
DROP TABLE IF EXISTS workflow_definitions CASCADE;
