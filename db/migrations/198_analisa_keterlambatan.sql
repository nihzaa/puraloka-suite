-- ════════════════════════════════════════════════════════════════════════════
-- 198 — Analisa Keterlambatan menunjuk halaman nyata
--
-- ── Kenapa TIDAK ada tabel baru
--
-- Ketiga bahannya sudah ada dan tak pernah diadu:
--
--   milestones.target_date / completed_at   kapan seharusnya vs kapan nyata
--   contract_eot.days_approved              perpanjangan waktu yang DISETUJUI
--   projects.penalty_*                      tarif denda/hari + grace + cap
--
-- Diukur 2026-08-06: 16 milestone telat (4 selesai-terlambat, 12 masih
-- berjalan), terparah 67 hari. Yang kurang bukan datanya — melainkan satu
-- layar yang mengadu ketiganya.
--
-- Menyimpan hasil analisanya sebagai tabel akan menciptakan angka yang bisa
-- basi diam-diam saat EOT disetujui atau milestone ditutup. Ia dihitung tiap
-- kali diminta.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/proyek/keterlambatan'
 WHERE key = 'jd-delay';
