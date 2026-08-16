-- ============================================================================
-- 417 — KESIAPAN AUDIT (9.9) · OPNAME BERSAMA MENGGANTUNG (tanpa nomor)
-- ============================================================================
--
-- ── DATA UJINYA DISEMAI, DAN BENTUKNYA SENGAJA TIDAK RATA
--
-- `documents` dan `opname_bersama` sama-sama NOL BARIS sebelum ini. Disemai
-- `scripts/db/_seed-dokumen-opname.mjs`, bertanda `SEED-`:
--
--   dokumen  bertingkat 4 / 3 / 1 jenis pada tiga proyek pertama
--   opname   empat keadaan: diverifikasi · diajukan lama · diajukan baru ·
--            disengketakan
--
-- Menyemai semuanya lengkap membuat otomasinya melaporkan nol, dan nol tak
-- membuktikan apa pun — ia sama saja dengan otomasi yang rusak. Menyemai
-- semuanya kosong sama buruknya: semua tertuduh, tak ada yang bisa dibedakan.
--
-- Saldo kas diukur sebelum dan sesudah: Rp 222.475.000, tidak bergeser.
--
-- ── DUA INVARIAN SCHEMA YANG DITEMUKAN SAAT MENYEMAI, KEDUANYA BENAR
--
--   `opname_bersama_check2`        pemverifikasi tak boleh sama dengan
--                                  pengukur. Opname bersama menentukan berapa
--                                  mandor dibayar; kalau keduanya orang yang
--                                  sama, "bersama"-nya tinggal nama.
--   `fn_opname_item_terkunci`      item tak bisa disisipkan sesudah berita
--                                  acaranya diverifikasi. Kalau bisa, tanda
--                                  tangan pengawas melekat pada dokumen yang
--                                  isinya masih berubah.
--
-- Penyemainya menulis header `diajukan` dulu, item masuk, BARU statusnya
-- dinaikkan — persis urutan yang terjadi di lapangan.
--
-- ── OPNAME TANPA NOMOR KATALOG, DAN ITU DIPERIKSA
--
-- Kandidat terdekat 4.8 *Stock Opname Discrepancy* adalah opname STOK GUDANG.
-- `opname_bersama` mengukur VOLUME PEKERJAAN bersama mandor. Satu menghitung
-- barang di rak, satu menentukan berapa orang dibayar. Menempelkan 4.8 padanya
-- akan membuat katalog mengklaim modul gudang yang tak dikerjakan — kesalahan
-- yang sama persis dengan menempelkan 7.10 pada kontrak pemasok (migrasi 407).
--
-- ── IZIN DIUKUR: `documents:manage` · `mandor:scope:manage`
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('kesiapan_audit',      'Kesiapan Audit Berkas Proyek',
     'Proyek yang jenis berkas wajibnya belum lengkap'),
    ('opname_menggantung',  'Opname Bersama Belum Diverifikasi',
     'Opname yang menggantung — mandor sudah bekerja tetapi belum bisa menagih'),
    ('opname_disengketakan','Opname Bersama Disengketakan',
     'Pengukur dan mandor tidak sepakat; butuh orang ketiga yang memutuskan')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('kesiapan_audit',       'documents:manage'),
    ('opname_menggantung',   'mandor:scope:manage'),
    ('opname_disengketakan', 'mandor:scope:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.opname_menggantung.hari', '7'::jsonb, 'number', 'otomasi',
       'Hari sebelum opname yang belum diverifikasi ditegur. Tak berlaku untuk yang disengketakan.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- `opname-menggantung` HARIAN: yang tertahan upah orang yang sudah bekerja.
-- `kesiapan-audit` MINGGUAN: kelengkapan arsip bergerak dalam hitungan minggu,
-- dan menagihnya tiap pagi hanya melatih orang mengabaikannya.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, v.tugas, v.jenis, v.jam, v.pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('opname-menggantung', 'harian',   '06:55', NULL::int),
    ('kesiapan-audit',     'mingguan', '09:10', 1)
  ) AS v(tugas, jenis, jam, pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT;
  TIPE_BARU TEXT[] := ARRAY['kesiapan_audit', 'opname_menggantung', 'opname_disengketakan'];
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY TIPE_BARU LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '417 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('kesiapan_audit',       'documents:manage'),
      ('opname_menggantung',   'mandor:scope:manage'),
      ('opname_disengketakan', 'mandor:scope:manage')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '417 gagal: target %->% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  FOREACH kunci IN ARRAY ARRAY['documents:manage', 'mandor:scope:manage'] LOOP
    IF NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = kunci) THEN
      RAISE EXCEPTION '417 gagal: kunci izin % tak ada di tabel permissions', kunci;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.opname_menggantung.hari';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '417 gagal: ambang ada % baris, harus %', n, n_aktif;
  END IF;

  /*
    Opname WAJIB harian.

    Yang tertahan di sini upah orang yang sudah bekerja. Jadwal mingguan
    berarti mandor bisa menunggu enam hari tambahan sebelum ada yang tahu
    tagihannya belum bisa diproses.
  */
  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'opname-menggantung' AND jenis = 'harian' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '417 gagal: jadwal opname bukan harian di % tenant', n_ang - n;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'kesiapan-audit' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '417 gagal: jadwal kesiapan-audit ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '417 OK — 3 jenis notifikasi, 1 ambang, 2 jadwal untuk % tenant', n_ang;
END $$;
