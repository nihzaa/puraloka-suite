-- ============================================================================
-- 412 — PENGELUARAN KEMBAR (2.7) · PENGELUARAN BERULANG (2.14)
-- ============================================================================
--
-- ── DUA OTOMASI YANG MEMBACA POLA YANG SAMA DAN MENYIMPULKAN HAL BERLAWANAN
--
-- Keduanya mencari "vendor sama, nominal sama, berulang". Yang membedakannya
-- HANYA jarak hari:
--
--   2.7   berselang ≤3 hari   → satu nota tercatat dua kali
--   2.14  berselang ~30 hari  → biaya tetap bulanan
--
-- Kalau jendela 2.7 dilebarkan sampai sebulan, seluruh sewa dan langganan
-- akan dilaporkan sebagai pencatatan ganda — dan orang yang memeriksa
-- beberapa di antaranya lalu menemukan semuanya wajar berhenti memeriksa.
--
-- ── DATA UJINYA DISEMAI, DAN ITU DINYATAKAN
--
-- `project_expenses` NOL BARIS sebelum ini, dan tabel kosong tak punya pola.
-- Riwayat enam bulan disemai `scripts/db/_seed-biaya-proyek.mjs` — 88 baris,
-- bertanda `ref_type = 'seed-riwayat'`, dan penyemainya MEMERIKSA hasilnya
-- sendiri sebelum selesai.
--
-- Penyemai itu sengaja TIDAK memakai sumber dana `petty_cash`/`main_cash`:
-- dua trigger (`fn_update_petty_cash_on_expense`, `fn_update_main_cash_on_
-- expense`) mengurangi `cash_accounts.balance` saat baris `approved` masuk
-- dengan kolom kasnya terisi. Data dummy tak boleh memindahkan saldo yang
-- dilihat orang di layar.
--
-- Diukur sebelum dan sesudah menyemai: total saldo kas Rp 222.475.000, TIDAK
-- BERGESER.
--
-- ── Yang memicu HARI INI
--
--   biaya_kembar     2 pasang — "Besi beton D13 20 batang" / "BESI BETON D13
--                    20 BATANG" Rp 2.150.000 berselang 1 hari, dan "Beton
--                    readymix K-250 8 m3" / "K250 8m3" Rp 7.400.000 hari sama
--   biaya_berulang   4 pola (2 jenis × 2 proyek), masing-masing 6 bulan:
--                    sewa direksi keet Rp 21 jt, langganan internet Rp 5,1 jt
--
-- ── IZIN DIUKUR: `finance:manage` (tak ada kunci `expense:*` bermakna kelola)
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('biaya_kembar',   'Dua Pengeluaran Kembar',
     'Satu nota yang kemungkinan tercatat dua kali: vendor & nominal sama, tanggal berdekatan'),
    ('biaya_berulang', 'Pengeluaran Berulang Tiap Bulan',
     'Biaya tetap yang dicatat satu-satu tiap bulan, dengan perkiraan setahunnya')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('biaya_kembar',   'finance:manage'),
    ('biaya_berulang', 'finance:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.biaya_kembar.hari', '3',
     'Jarak hari maksimum dua pengeluaran disebut kembar. Sengaja pendek supaya biaya bulanan tak ikut tertuduh.'),
    ('otomasi.biaya_berulang.bulan', '3',
     'Jumlah BULAN BERBEDA sebelum pengeluaran disebut berulang.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- `biaya-kembar` HARIAN: nota ganda paling murah dibatalkan pada hari ia
-- masuk. Sesudah disetujui dan dijurnal, membatalkannya menuntut jurnal
-- koreksi — pekerjaan yang jauh lebih mahal daripada menghapus satu baris.
--
-- `biaya-berulang` BULANAN: polanya berubah dalam hitungan bulan, dan
-- menanyakan "kita masih butuh langganan ini?" tiap minggu hanya melatih
-- orang mengabaikannya.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, hari_bulan, aktif)
SELECT c.id, v.tugas, v.jenis, v.jam, v.pekan, v.tgl, true
  FROM companies c
  CROSS JOIN (VALUES
    ('biaya-kembar',   'harian',  '06:45', NULL::int, NULL::int),
    ('biaya-berulang', 'bulanan', '08:50', NULL::int, 2)
  ) AS v(tugas, jenis, jam, pekan, tgl)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan,
      hari_bulan = EXCLUDED.hari_bulan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT; t_nama TEXT;
  TIPE_BARU TEXT[] := ARRAY['biaya_kembar', 'biaya_berulang'];
  KUNCI_BARU TEXT[] := ARRAY[
    'otomasi.biaya_kembar.hari', 'otomasi.biaya_berulang.bulan'];
  TUGAS_BARU TEXT[] := ARRAY['biaya-kembar', 'biaya-berulang'];
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY TIPE_BARU LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '412 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('biaya_kembar',   'finance:manage'),
      ('biaya_berulang', 'finance:manage')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '412 gagal: target %→% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM (VALUES ('finance:manage')) AS v(k)
   WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.k);
  IF n > 0 THEN
    RAISE EXCEPTION '412 gagal: kunci izin finance:manage tak ada di permissions';
  END IF;

  FOREACH kunci IN ARRAY KUNCI_BARU LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '412 gagal: ambang % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  FOREACH t_nama IN ARRAY TUGAS_BARU LOOP
    SELECT count(*) INTO n FROM jadwal_tugas j WHERE j.tugas = t_nama AND j.aktif;
    IF n <> n_ang THEN
      RAISE EXCEPTION '412 gagal: jadwal % ada % baris, harus %', t_nama, n, n_ang;
    END IF;
  END LOOP;

  /*
    Jendela kembar WAJIB lebih pendek daripada sebulan.

    Ini bukan sekadar nilai bawaan yang enak — ia yang memisahkan 2.7 dari
    2.14. Dilebarkan sampai 28 hari, seluruh sewa dan langganan bulanan akan
    dilaporkan sebagai pencatatan ganda, dan otomasi kembar berhenti berarti.
  */
  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.biaya_kembar.hari' AND (value #>> '{}')::numeric >= 28;
  IF n > 0 THEN
    RAISE EXCEPTION '412 gagal: % tenant memasang jendela kembar >= 28 hari — '
      'seluruh biaya bulanan akan tertuduh sebagai nota ganda', n;
  END IF;

  RAISE NOTICE '412 OK — 2 jenis notifikasi, 2 ambang, 2 jadwal untuk % tenant beranggota', n_ang;
END $$;
