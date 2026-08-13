-- ============================================================================
-- 334 — aturan routing untuk automation 4.10 (PO/GR tak cocok)
-- ============================================================================
--
-- Tanpa baris di `notification_rules`, `resolveRecipients()` mengembalikan
-- daftar KOSONG — automation berjalan sukses dan tak mengirim apa pun kepada
-- siapa pun. Kelas cacat "hijau di log, mati di kenyataan" yang sama dengan
-- yang dijaga L-4.
--
-- ── Penerimanya tim PENGADAAN, bukan PM proyek
--
-- Ketidakcocokan PO/GR ditindaklanjuti dengan memeriksa gudang dan menghubungi
-- supplier — pekerjaan pengadaan. PM proyek tak bisa berbuat apa-apa selain
-- meneruskannya, dan notifikasi yang hanya bisa diteruskan adalah kebisingan.
--
-- Dipakai `permission`, bukan `role`: ADR-004 menyatakan peran adalah data
-- konfigurasi per-tenant. Yang tetap sama lintas tenant adalah KAPABILITASNYA
-- — siapa pun yang boleh mengelola PO adalah yang perlu tahu PO-nya bermasalah.
--
-- ── ON CONFLICT memakai (company_id, event_type)
--
-- Migrasi 332 mengganti constraint uniknya jadi per-tenant. Migrasi bernomor
-- LEBIH BESAR dari 332 wajib memakai bentuk dua kolom — yang lama akan gagal
-- karena daftar kolom inferensinya tak lagi cocok dengan indeks yang ada.
-- ============================================================================

INSERT INTO notification_rules (event_type, label, description, company_id)
SELECT 'gr_tak_cocok',
       'PO & Penerimaan Tak Cocok',
       'Status PO berbeda dari barang yang benar-benar diterima, atau PO menggantung lewat tenggat',
       c.id
FROM (SELECT company_id AS id FROM notification_rules ORDER BY created_at LIMIT 1) c
ON CONFLICT (company_id, event_type) DO NOTHING;

-- Penerima: pemegang kapabilitas kelola PO.
INSERT INTO notification_rule_targets (rule_id, target_type, permission_key, company_id)
SELECT r.id, 'permission', 'procurement:po:manage', r.company_id
FROM notification_rules r
WHERE r.event_type = 'gr_tak_cocok'
  AND EXISTS (SELECT 1 FROM permissions p WHERE p.key = 'procurement:po:manage')
ON CONFLICT DO NOTHING;

-- ─── Verifikasi: aturan ADA dan PUNYA PENERIMA ──────────────────────────────

DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies) THEN
    RAISE NOTICE '334: basis tanpa company — dilewati';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM notification_rules WHERE event_type = 'gr_tak_cocok';
  IF n < 1 THEN
    RAISE EXCEPTION '334 gagal: aturan gr_tak_cocok tak terbentuk';
  END IF;

  -- Aturan tanpa target = notifikasi hilang senyap. Inilah yang benar-benar
  -- perlu dijaga, bukan sekadar keberadaan barisnya.
  SELECT count(*) INTO n
  FROM notification_rules r
  WHERE r.event_type = 'gr_tak_cocok'
    AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t WHERE t.rule_id = r.id);
  IF n > 0 THEN
    RAISE EXCEPTION '334 gagal: aturan gr_tak_cocok TANPA penerima — notifikasi akan hilang senyap';
  END IF;

  RAISE NOTICE '334 OK — aturan gr_tak_cocok ada dan punya penerima';
END $$;
