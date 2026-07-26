-- Migration 119 — Menu "Estimasi" (CECEP M4): entri sidebar DB-driven (1B.2)
--
-- ADDITIVE-FIRST, tanpa menyentuh guard apa pun. Satu entri main-section
-- (pola procurement: satu halaman ber-tab, bukan parent-child dropdown).
-- Gated cecep:estimate:view (admin/pm — seeded 110). sort 25 = antara
-- proyek (20) dan klien (30): estimasi hidup paling dekat dengan proyek.

INSERT INTO menu_items (key, label, href, icon, required_permissions, sort_order, section)
VALUES ('estimasi', 'Estimasi', '/estimasi', 'Calculator',
        ARRAY['cecep:estimate:view'], 25, 'main')
ON CONFLICT (key) DO NOTHING;
