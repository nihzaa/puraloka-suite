-- ============================================================================
-- 395 — Aturan notifikasi untuk empat otomasi Phase 3-5
-- ============================================================================
--
-- Founder: *"saya mau semua list workflow dikerjakan semua"*.
--
-- Empat otomasi dibangun di commit yang sama, dan tiga di antaranya butuh
-- aturan notifikasi yang BELUM ADA:
--
--     2.11  Cash Position Alert       → saldo_menipis
--     2.2   Vendor Payment Reminder   → hutang_supplier_jatuh_tempo
--     4.9   Material Price Trend      → harga_material_naik
--
-- Yang keempat (3.7 Milestone Risk) memakai `milestone_approaching` yang sudah
-- ada — diukur, bukan diasumsikan.
--
-- ── Kenapa aturannya HARUS ada sebelum rutenya berguna
--
-- `resolveRecipients()` gagal-tertutup: jenis peristiwa yang tak punya aturan
-- memulangkan NOL penerima, mencatat satu baris log, lalu diam.
--
-- Perilakunya benar — otomasi yang tak tahu harus mengabari siapa sebaiknya
-- diam daripada menebak. Tetapi akibatnya automation-nya jalan, membalas 200,
-- melaporkan "0 notifikasi dibuat", dan terlihat sehat sementara ia tak pernah
-- mengabari siapa pun.
--
-- Itu bentuk kegagalan yang sudah berulang di repo ini: bukan galat, melainkan
-- diam yang menyerupai keberhasilan.
--
-- ── Kenapa penerimanya PERMISSION, bukan peran
--
-- ADR-004: peran adalah data konfigurasi per-tenant. Tenant yang menamai
-- perannya "Kepala Keuangan" alih-alih "finance" tetap menerima notifikasi
-- selama orangnya memegang izin yang benar.
--
-- Pola dan verifikasinya menyalin migrasi 355 (`aturan_stok_menipis`) yang
-- sudah terbukti — termasuk tuntutan bahwa tiap aturan WAJIB punya penerima.
-- Aturan tanpa target adalah aturan yang tak pernah mengabari siapa pun, dan
-- itu lebih buruk daripada tak ada aturan: ia terlihat terpasang.
-- ============================================================================

-- ── 2.11 — Saldo kas menipis ───────────────────────────────────────────────
INSERT INTO notification_rules (event_type, label, description, company_id)
SELECT 'saldo_menipis',
       'Saldo Kas Menipis',
       'Rekening kas yang saldonya turun di bawah ambang aman',
       c.id
FROM (SELECT company_id AS id FROM notification_rules ORDER BY created_at LIMIT 1) c
ON CONFLICT (company_id, event_type) DO NOTHING;

INSERT INTO notification_rule_targets (rule_id, target_type, permission_key, company_id)
SELECT r.id, 'permission', 'cash:manage', r.company_id
FROM notification_rules r
WHERE r.event_type = 'saldo_menipis'
  AND EXISTS (SELECT 1 FROM permissions p WHERE p.key = 'cash:manage')
ON CONFLICT DO NOTHING;

-- ── 2.2 — Hutang supplier jatuh tempo ──────────────────────────────────────
INSERT INTO notification_rules (event_type, label, description, company_id)
SELECT 'hutang_supplier_jatuh_tempo',
       'Hutang Supplier Jatuh Tempo',
       'Tagihan supplier yang mendekati atau melewati jatuh tempo dan belum lunas',
       c.id
FROM (SELECT company_id AS id FROM notification_rules ORDER BY created_at LIMIT 1) c
ON CONFLICT (company_id, event_type) DO NOTHING;

INSERT INTO notification_rule_targets (rule_id, target_type, permission_key, company_id)
SELECT r.id, 'permission', 'procurement:payment:manage', r.company_id
FROM notification_rules r
WHERE r.event_type = 'hutang_supplier_jatuh_tempo'
  AND EXISTS (SELECT 1 FROM permissions p WHERE p.key = 'procurement:payment:manage')
ON CONFLICT DO NOTHING;

-- ── 4.9 — Harga material naik signifikan ───────────────────────────────────
INSERT INTO notification_rules (event_type, label, description, company_id)
SELECT 'harga_material_naik',
       'Harga Material Naik',
       'Harga aktif sebuah material naik signifikan dibanding harga sebelumnya',
       c.id
FROM (SELECT company_id AS id FROM notification_rules ORDER BY created_at LIMIT 1) c
ON CONFLICT (company_id, event_type) DO NOTHING;

INSERT INTO notification_rule_targets (rule_id, target_type, permission_key, company_id)
SELECT r.id, 'permission', 'procurement:mr:manage', r.company_id
FROM notification_rules r
WHERE r.event_type = 'harga_material_naik'
  AND EXISTS (SELECT 1 FROM permissions p WHERE p.key = 'procurement:mr:manage')
ON CONFLICT DO NOTHING;

-- ── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_aturan  INT;
  n_yatim   INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM notification_rules) THEN
    RAISE NOTICE '395: basis tanpa aturan notifikasi — dilewati';
    RETURN;
  END IF;

  SELECT count(*) INTO n_aturan
    FROM notification_rules
   WHERE event_type IN ('saldo_menipis', 'hutang_supplier_jatuh_tempo', 'harga_material_naik');

  IF n_aturan < 3 THEN
    RAISE EXCEPTION '395 gagal: hanya % dari 3 aturan terpasang', n_aturan;
  END IF;

  /*
    Aturan TANPA penerima adalah yang paling menyesatkan.

    `resolveRecipients` memulangkan nol, automation membalas 200, dan
    laporannya berbunyi "0 notifikasi dibuat" — persis seperti hari yang
    memang tak ada masalahnya. Tak ada cara membedakan "sehat" dari "tak
    pernah mengabari siapa pun" kecuali memeriksanya di sini.
  */
  SELECT count(*) INTO n_yatim
    FROM notification_rules r
   WHERE r.event_type IN ('saldo_menipis', 'hutang_supplier_jatuh_tempo', 'harga_material_naik')
     AND NOT EXISTS (
       SELECT 1 FROM notification_rule_targets t WHERE t.rule_id = r.id
     );

  IF n_yatim > 0 THEN
    RAISE EXCEPTION '395 gagal: % aturan tanpa penerima — automation-nya akan diam '
                    'sambil melaporkan 200', n_yatim;
  END IF;

  RAISE NOTICE '395: 3 aturan terpasang, semuanya punya penerima';
END $$;
