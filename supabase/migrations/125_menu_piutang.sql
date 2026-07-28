-- Migration 125 — Menu "Piutang" (Register Piutang, PETA §3 #3)
--
-- ADDITIVE-FIRST: satu entri child dropdown Keuangan (pola 076), DB-driven
-- (1B.2). Gated finance:view:all (admin+pm, seeded 085) — sama dengan
-- endpoint /finance/ar-aging /retention-register /dp-register.
-- sort 15 = antara Invoice & Bayar (10) dan Kas & Pengeluaran (20).

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'keuangan-piutang', 'Piutang', '/piutang', 'Coins', m.id, ARRAY['finance:view:all'], 15, 'main'
FROM menu_items m WHERE m.key = 'keuangan'
ON CONFLICT (key) DO NOTHING;
