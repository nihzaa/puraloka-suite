-- ============================================================================
-- 335 — aturan routing untuk automation 3.5 (stok menipis)
-- ============================================================================
--
-- Tanpa baris di `notification_rules`, `resolveRecipients()` mengembalikan
-- daftar KOSONG: automation berjalan sukses tanpa mengirim apa pun. Kelas
-- cacat "hijau di log, mati di kenyataan".
--
-- ── Penerimanya PENGADAAN, bukan PM proyek
--
-- Stok menipis ditindaklanjuti dengan membuat Material Request dan memesan —
-- pekerjaan pengadaan. Sama alasannya dengan `gr_tak_cocok` (migrasi 334).
--
-- Dipakai `permission`, bukan `role` (ADR-004): peran adalah data konfigurasi
-- per-tenant, kapabilitasnya yang tetap.
--
-- `procurement:mr:manage` — bukan `po:manage` — karena tindakan pertamanya
-- membuat MR, bukan PO. Yang boleh memesan belum tentu yang boleh mengajukan
-- kebutuhan, dan di perusahaan yang memisahkannya, notifikasi ini harus
-- sampai ke yang mengajukan.
--
-- ── ON CONFLICT dua kolom
--
-- Migrasi 332 mengganti constraint uniknya jadi (company_id, event_type).
-- Migrasi bernomor lebih besar wajib memakai bentuk itu.
-- ============================================================================

INSERT INTO notification_rules (event_type, label, description, company_id)
SELECT 'stok_menipis',
       'Stok Menipis',
       'Material yang sisanya turun di bawah ambang pesan-ulang (min_stock)',
       c.id
FROM (SELECT company_id AS id FROM notification_rules ORDER BY created_at LIMIT 1) c
ON CONFLICT (company_id, event_type) DO NOTHING;

INSERT INTO notification_rule_targets (rule_id, target_type, permission_key, company_id)
SELECT r.id, 'permission', 'procurement:mr:manage', r.company_id
FROM notification_rules r
WHERE r.event_type = 'stok_menipis'
  AND EXISTS (SELECT 1 FROM permissions p WHERE p.key = 'procurement:mr:manage')
ON CONFLICT DO NOTHING;

-- ─── Verifikasi: ada DAN punya penerima ─────────────────────────────────────

DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies) THEN
    RAISE NOTICE '335: basis tanpa company — dilewati';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM notification_rules WHERE event_type = 'stok_menipis';
  IF n < 1 THEN
    RAISE EXCEPTION '335 gagal: aturan stok_menipis tak terbentuk';
  END IF;

  SELECT count(*) INTO n
  FROM notification_rules r
  WHERE r.event_type = 'stok_menipis'
    AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t WHERE t.rule_id = r.id);
  IF n > 0 THEN
    RAISE EXCEPTION '335 gagal: aturan stok_menipis TANPA penerima — notifikasi hilang senyap';
  END IF;

  RAISE NOTICE '335 OK — aturan stok_menipis ada dan punya penerima';
END $$;
