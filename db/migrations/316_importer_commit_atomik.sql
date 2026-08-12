-- ════════════════════════════════════════════════════════════════════════════
-- 316 — Commit importer: ALL-OR-NOTHING dalam SATU transaksi (TJS-P3)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa fungsi basis, bukan perulangan di aplikasi
--
-- Supabase client tak punya transaksi. Menulis 500 baris berarti 500
-- permintaan terpisah, dan kalau gagal di baris ke-300 maka 299 baris
-- terlanjur masuk — sisanya tidak.
--
-- Itu persis bentuk yang sudah ada di repo ini: `routes/v1/rab.ts` menghapus
-- data lama LEBIH DULU lalu insert bertahap. Kalau gagal di tengah, data lama
-- sudah hilang dan yang baru belum masuk. Item TJS-P3 menyebutnya sendiri:
-- *"TJS punya dua importer … ambil transaksinya dari yang Universal."*
--
-- Satu pemanggilan fungsi = satu pernyataan = satu transaksi. Berhasil
-- seluruhnya, atau tak ada yang berubah sama sekali.
--
-- ── Kenapa hanya `materials` yang didukung
--
-- Fungsi ini menerima nama tabel, dan nama tabel dari luar adalah SQL
-- injection kalau disambung ke query. Karena itu ia memakai `CASE` atas
-- daftar tertutup — bukan `format('%I', p_tabel)` yang menerima apa pun yang
-- lolos quoting.
--
-- Konsekuensinya jujur: menambah tabel impor menuntut menyentuh fungsi ini.
-- Itu batas yang disengaja — sama dengan sumber laporan (G6d) dan registry
-- recycle bin (TJS-P1): keputusan "tabel mana yang boleh ditulis massal" tak
-- boleh bisa diubah dari luar.
--
-- ── Kenapa `SECURITY INVOKER` (bawaan), bukan DEFINER
--
-- Fungsi ini MENULIS data tenant. Dijalankan sebagai pemanggil berarti RLS
-- tetap berlaku — baris yang tak boleh ditulisnya tetap ditolak basis, bukan
-- hanya oleh pemeriksaan rute.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION impor_commit(
  p_tabel      TEXT,
  p_company_id UUID,
  p_baris      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  n INT := 0;
BEGIN
  IF p_baris IS NULL OR jsonb_typeof(p_baris) <> 'array' THEN
    RAISE EXCEPTION 'impor_commit: p_baris harus array JSON';
  END IF;

  IF jsonb_array_length(p_baris) = 0 THEN
    RAISE EXCEPTION 'impor_commit: tak ada baris untuk diimpor';
  END IF;

  -- Batas yang sama dengan `lib/importer.ts` (BATAS_BARIS). Satu transaksi
  -- raksasa mengunci tabel dan membuat seluruh aplikasi menunggu.
  IF jsonb_array_length(p_baris) > 5000 THEN
    RAISE EXCEPTION 'impor_commit: % baris melebihi batas 5000',
      jsonb_array_length(p_baris);
  END IF;

  -- Daftar TERTUTUP. Nama tabel dari luar yang disambung ke query adalah SQL
  -- injection; `CASE` membuat yang tak dikenal jatuh ke ELSE dan ditolak.
  CASE p_tabel
    WHEN 'materials' THEN
      -- `company_id` WAJIB diisi meski kolomnya nullable.
      --
      -- Diukur: `materials.company_id` boleh NULL, dan tabelnya kategori AB
      -- (katalog bersama). Material impor yang company_id-nya kosong akan
      -- terlihat oleh SELURUH tenant — kebocoran yang tak menghasilkan satu
      -- pun galat, dan baru ketahuan saat pelanggan lain menemukan barang
      -- yang tak pernah mereka daftarkan.
      INSERT INTO materials (company_id, code, name, unit, unit_price, min_stock, is_active)
      SELECT
        p_company_id,
        x.code, x.name,
        COALESCE(x.unit, 'unit'),
        COALESCE(x.unit_price, 0),
        COALESCE(x.min_stock, 0),
        COALESCE(x.is_active, TRUE)
      FROM jsonb_to_recordset(p_baris) AS x(
        code TEXT, name TEXT, unit TEXT,
        unit_price NUMERIC, min_stock NUMERIC, is_active BOOLEAN);
      GET DIAGNOSTICS n = ROW_COUNT;

    ELSE
      RAISE EXCEPTION 'impor_commit: tabel "%" tidak didukung importer', p_tabel;
  END CASE;

  RETURN jsonb_build_object('masuk', n);
END;
$function$;

COMMENT ON FUNCTION impor_commit(TEXT, UUID, JSONB) IS
  'Commit importer ALL-OR-NOTHING. Satu pemanggilan = satu transaksi: '
  'berhasil seluruhnya, atau tak ada yang berubah. Daftar tabel TERTUTUP '
  '(CASE, bukan format %I) — nama tabel dari luar adalah SQL injection.';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_co UUID;
  v_awal INT;
  v_akhir INT;
  v_hasil JSONB;
  v_lolos BOOLEAN := FALSE;
BEGIN
  SELECT company_id INTO v_co FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  SELECT count(*) INTO v_awal FROM materials;

  -- 1. Tabel tak dikenal DITOLAK — bukan diterima lalu gagal di query.
  BEGIN
    PERFORM impor_commit('users', v_co, '[{"code":"X"}]'::jsonb);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '316 gagal: tabel sembarang DITERIMA importer';
  END IF;

  -- 2. Array kosong ditolak.
  v_lolos := FALSE;
  BEGIN
    PERFORM impor_commit('materials', v_co, '[]'::jsonb);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '316 gagal: array kosong DITERIMA';
  END IF;

  -- 3. ALL-OR-NOTHING: dua baris, yang kedua melanggar NOT NULL.
  --    Yang PERTAMA tidak boleh tersisa.
  v_lolos := FALSE;
  BEGIN
    PERFORM impor_commit('materials', v_co,
      '[{"code":"[316-A]","name":"Sah"},{"code":"[316-B]","name":null}]'::jsonb);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT count(*) INTO v_akhir FROM materials;
  IF v_akhir <> v_awal THEN
    DELETE FROM materials WHERE code LIKE '[316-%';
    RAISE EXCEPTION '316 gagal: % baris tersisa dari impor yang GAGAL — '
      'all-or-nothing tidak bekerja', v_akhir - v_awal;
  END IF;
  IF v_lolos THEN
    RAISE EXCEPTION '316 gagal: baris ber-name NULL LOLOS';
  END IF;

  -- 4. Impor yang SAH benar-benar masuk, dan jumlahnya dilaporkan.
  v_hasil := impor_commit('materials', v_co,
    '[{"code":"[316-OK1]","name":"Uji 1"},{"code":"[316-OK2]","name":"Uji 2"}]'::jsonb);
  IF (v_hasil->>'masuk')::INT <> 2 THEN
    DELETE FROM materials WHERE code LIKE '[316-%';
    RAISE EXCEPTION '316 gagal: melaporkan % baris masuk (harus 2)', v_hasil->>'masuk';
  END IF;

  SELECT count(*) INTO v_akhir FROM materials;
  IF v_akhir <> v_awal + 2 THEN
    DELETE FROM materials WHERE code LIKE '[316-%';
    RAISE EXCEPTION '316 gagal: basis berisi % baris (harus %)', v_akhir, v_awal + 2;
  END IF;

  -- 5. `company_id` BENAR-BENAR terisi. Kolomnya nullable, jadi lupa
  --    mengisinya tak menghasilkan galat apa pun — material impor hanya
  --    akan terlihat oleh SELURUH tenant, dan baru ketahuan saat pelanggan
  --    lain menemukan barang yang tak pernah mereka daftarkan.
  IF EXISTS (SELECT 1 FROM materials WHERE code LIKE '[316-OK%' AND company_id IS NULL) THEN
    DELETE FROM materials WHERE code LIKE '[316-%';
    RAISE EXCEPTION '316 gagal: material impor ber-company_id NULL — bocor ke semua tenant';
  END IF;
  IF EXISTS (SELECT 1 FROM materials WHERE code LIKE '[316-OK%' AND company_id <> v_co) THEN
    DELETE FROM materials WHERE code LIKE '[316-%';
    RAISE EXCEPTION '316 gagal: material impor masuk ke company yang salah';
  END IF;

  DELETE FROM materials WHERE code LIKE '[316-%';

  RAISE NOTICE '316 OK — all-or-nothing terbukti: baris pertama TIDAK tersisa '
    'saat baris kedua gagal; tabel sembarang & array kosong ditolak';
END $$;
