-- ════════════════════════════════════════════════════════════════════════════
-- 306 — Penghitung pemakaian kunci API, dinaikkan ATOMIK (G6c, lanjutan 305)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa fungsi, bukan UPDATE dari aplikasi
--
-- Aplikasi bisa saja menulis:
--
--     SELECT jumlah_pakai FROM api_key WHERE id = $1     -- baca
--     UPDATE api_key SET jumlah_pakai = $2 WHERE id = $1  -- tulis
--
-- Itu read-modify-write, dan integrasi berarti permintaan BERSAMAAN. Dua
-- permintaan yang membaca 100 lalu sama-sama menulis 101 menghasilkan
-- penghitung yang selalu lebih kecil dari kenyataan — tanpa satu pun galat.
--
-- `jumlah_pakai = jumlah_pakai + 1` di dalam satu pernyataan tak punya celah
-- itu: Postgres mengunci barisnya selama pernyataan berjalan.
--
-- ── Kenapa penghitungnya penting
--
-- Ia menjawab satu pertanyaan yang tak bisa dijawab dari mana pun lagi:
-- "kunci mana yang sudah lama tak dipakai?" Kunci yang menganggur berbulan-
-- bulan adalah kunci yang lebih baik dicabut, dan tanpa angka ini tak ada
-- yang berani mencabut apa pun karena tak ada yang tahu apa yang akan rusak.
--
-- ── Kenapa `SECURITY DEFINER`
--
-- Pemanggilnya adalah jalur autentikasi yang berjalan SEBELUM tenant
-- diketahui — RLS `api_key` belum bisa menyaring apa pun di titik itu.
-- Fungsi ini sengaja sempit: ia hanya menaikkan penghitung pada satu id, tak
-- mengembalikan data apa pun, dan tak bisa dipakai membaca kunci.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api_key_catat_pakai(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE api_key
     SET jumlah_pakai = jumlah_pakai + 1,
         dipakai_terakhir = now()
   WHERE id = p_id
     -- Kunci yang sudah dicabut tak menaikkan penghitung: percobaan memakai
     -- kunci mati bukan "pemakaian", dan mencampurnya membuat angka
     -- "dipakai_terakhir" berbohong tentang kunci yang sebenarnya mati.
     AND dicabut_pada IS NULL;
END;
$function$;

COMMENT ON FUNCTION api_key_catat_pakai(UUID) IS
  'Menaikkan penghitung pemakaian kunci API secara ATOMIK. '
  'Read-modify-write dari aplikasi kehilangan hitungan saat permintaan '
  'bersamaan — dan integrasi berarti permintaan bersamaan.';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_co UUID;
  v_id UUID;
  v_n  BIGINT;
BEGIN
  SELECT company_id INTO v_co FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE '306 — tak ada company; verifikasi perilaku dilewati';
    RETURN;
  END IF;

  INSERT INTO api_key (company_id, nama, keperluan, hash_kunci, awalan, kedaluwarsa_pada)
  VALUES (v_co, '[306-VERIFIKASI]', 'blok verifikasi migrasi 306',
          repeat('d', 64), 'pk_ver06', now() + INTERVAL '1 day')
  RETURNING id INTO v_id;

  -- 1. Penghitung naik.
  PERFORM api_key_catat_pakai(v_id);
  PERFORM api_key_catat_pakai(v_id);
  SELECT jumlah_pakai INTO v_n FROM api_key WHERE id = v_id;
  IF v_n <> 2 THEN
    DELETE FROM api_key WHERE nama LIKE '[306-%';
    RAISE EXCEPTION '306 gagal: jumlah_pakai = % sesudah 2 panggilan (harus 2)', v_n;
  END IF;

  -- 2. `dipakai_terakhir` terisi.
  IF NOT EXISTS (SELECT 1 FROM api_key WHERE id = v_id AND dipakai_terakhir IS NOT NULL) THEN
    DELETE FROM api_key WHERE nama LIKE '[306-%';
    RAISE EXCEPTION '306 gagal: dipakai_terakhir tak terisi';
  END IF;

  -- 3. Kunci DICABUT tak menaikkan penghitung — percobaan memakai kunci mati
  --    bukan pemakaian.
  UPDATE api_key SET dicabut_pada = now(), alasan_cabut = 'verifikasi 306'
   WHERE id = v_id;
  PERFORM api_key_catat_pakai(v_id);
  SELECT jumlah_pakai INTO v_n FROM api_key WHERE id = v_id;
  IF v_n <> 2 THEN
    DELETE FROM api_key WHERE nama LIKE '[306-%';
    RAISE EXCEPTION '306 gagal: kunci dicabut MASIH menaikkan penghitung (jadi %)', v_n;
  END IF;

  -- 4. Id yang tak ada tidak melempar — jalur autentikasi tak boleh runtuh
  --    karena kunci sudah dihapus di tengah permintaan.
  PERFORM api_key_catat_pakai('00000000-0000-0000-0000-0000000000ff');

  DELETE FROM api_key WHERE nama LIKE '[306-%';

  RAISE NOTICE '306 OK — penghitung atomik, kunci dicabut tak dihitung, id hilang tak melempar';
END $$;
