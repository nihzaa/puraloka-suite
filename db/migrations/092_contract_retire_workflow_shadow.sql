-- Migration 092: CONTRACT — pensiunkan dual-write shadow workflow (Sub-Fase 1C)
--
-- FASE CONTRACT dari expand-contract (Red-Line terpisah, disetujui founder 2026-07-24).
-- Kriteria kontrak founder TERPENUHI sebelum migrasi ini:
--   (1) engine workflow tak butuh perubahan selama 2 migrasi modul (kasbon 082 + change_order 083);
--   (2) rekonsiliasi NOL divergensi — dibuktikan: kasbon 56/56 cocok, change_order 2/2 cocok,
--       nol orphan dua arah (source status == shadow state, fungsi mapping nyata vs DB nyata);
--   (3) belum ada deployment produksi (dev only).
--
-- BEHAVIOR-PRESERVING: tabel sumber (kasbons.status, change_orders.status) SELALU otoritatif
-- selama dual-write; workflow_instances hanya BAYANGAN fire-and-forget yang tak pernah
-- menjatuhkan/menggerakkan operasi bisnis. NOL pembaca bisnis pada tabel workflow_*
-- (diverifikasi: hanya kode dual-write + rekonsiliasi yang menyentuhnya, semuanya dihapus
-- di PR ini). Karena itu men-drop scaffolding ini TIDAK mengubah perilaku apa pun.
--
-- Ini mempensiunkan eksperimen workflow-engine 1C; sumber tabel jadi SATU-SATUNYA sumber
-- kebenaran status. Reversible: `git revert` mengembalikan 081-083 + kode dual-write.
-- Procurement (AKTA 5) menyusul SETELAH shadow bersih (keputusan founder).

-- Drop CASCADE menuntaskan FK/policy/index turunan. Urutan dependent → definisi.
DROP TABLE IF EXISTS workflow_instances   CASCADE;  -- shadow instances (yang di-dual-write)
DROP TABLE IF EXISTS workflow_transitions CASCADE;  -- definisi transisi (config engine, kini tanpa instance)
DROP TABLE IF EXISTS approval_delegations CASCADE;  -- scaffold delegasi (tak pernah dipakai bisnis)
DROP TABLE IF EXISTS workflow_states      CASCADE;  -- state machine states (seed 082/083)
DROP TABLE IF EXISTS workflow_definitions CASCADE;  -- definisi workflow
