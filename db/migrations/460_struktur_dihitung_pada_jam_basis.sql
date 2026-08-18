-- 460 — `dihitung_pada` diisi jam BASIS, bukan jam aplikasi.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CACAT YANG DIPERBAIKI: `basi` tak pernah padam
--
-- Kolom `basi` (migrasi 458) adalah:
--
--     dihitung_pada IS NULL OR dihitung_pada < updated_at
--
-- `updated_at` diisi trigger memakai `clock_timestamp()` — jam BASIS.
-- Rute mengisi `dihitung_pada` dengan `new Date().toISOString()` — jam
-- APLIKASI. Kedua jam itu tidak sama.
--
-- Diukur di mesin ini pada 2026-08-19: jam basis **1.648 ms DI DEPAN** jam
-- aplikasi (Supabase pooler di ap-southeast-1). Artinya setiap `dihitung_pada`
-- lahir sudah lebih tua dari `updated_at` baris yang sama, `basi` menyala
-- selamanya, dan rekap — yang sengaja MENGECUALIKAN elemen basi — memulangkan
-- NOL untuk proyek yang seluruh elemennya baru saja dihitung.
--
-- Tak ada galat di mana pun pada jalur itu. Rute membalas 200, layar
-- menampilkan "tersimpan", dan totalnya nol.
--
-- ── Kenapa diperbaiki di BASIS, bukan di rute
--
-- Rute bisa saja mengirim `clock_timestamp()` lewat SQL mentah, tetapi itu
-- menaruh syarat kebenaran di pemanggil: penulis rute berikutnya harus INGAT
-- bahwa kolom ini tak boleh diisi dari jam aplikasi. Yang harus diingat akan
-- terlupa. Trigger membuat aturannya berlaku untuk semua penulis, termasuk
-- skrip seed, impor massal, dan psql manual.
--
-- Nilai kiriman diabaikan sepenuhnya: bila `dihitung_pada` diisi (bukan NULL),
-- ia DITIMPA jam basis. Yang dimaksudkan pemanggil adalah "sekarang", dan
-- "sekarang" versi basis adalah satu-satunya yang sebanding dengan
-- `updated_at`.
--
-- Menyetelnya NULL tetap dihormati — itu cara sah menandai "belum dihitung".
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_struktur_elemen_dihitung_jam_basis()
RETURNS trigger AS $fn$
BEGIN
  -- Hanya saat kolomnya benar-benar diisi. NULL = "belum dihitung", dan itu
  -- pernyataan yang sah — jangan diubah jadi timestamp.
  IF NEW.dihitung_pada IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.dihitung_pada IS DISTINCT FROM OLD.dihitung_pada) THEN
    NEW.dihitung_pada := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_struktur_elemen_dihitung_jam_basis ON struktur_elemen;

/*
  URUTAN TRIGGER PENTING. Postgres menjalankan trigger BEFORE per-baris
  menurut abjad namanya. `fn_struktur_elemen_sentuh` menyetel `updated_at`
  saat input berubah; trigger ini menyetel `dihitung_pada`. Keduanya memanggil
  `clock_timestamp()`, yang MAJU di dalam satu transaksi — jadi yang berjalan
  belakangan mendapat nilai lebih besar.

  Nama `trg_struktur_elemen_dihitung_jam_basis` berada SESUDAH
  `trg_struktur_elemen_sentuh`?  Tidak: 'd' < 's', jadi ia berjalan LEBIH
  DULU. Itu justru yang diinginkan — `updated_at` yang ditulis belakangan
  akan sama-besar-atau-lebih-besar, dan `dihitung_pada < updated_at` menyala
  BENAR saat input memang baru diubah pada UPDATE yang sama.

  Untuk UPDATE yang HANYA menghitung (input tak berubah), trigger `sentuh`
  tak menyentuh `updated_at` sama sekali, sehingga `dihitung_pada` yang baru
  melampaui `updated_at` lama → `basi` padam. Itulah perilaku yang dituju.
*/
CREATE TRIGGER trg_struktur_elemen_dihitung_jam_basis
  BEFORE INSERT OR UPDATE ON struktur_elemen
  FOR EACH ROW EXECUTE FUNCTION fn_struktur_elemen_dihitung_jam_basis();

-- ── Verifikasi: BUKTIKAN cacatnya benar-benar tertutup ─────────────────────
DO $$
DECLARE
  v_proyek uuid;
  v_company uuid;
  v_id uuid;
  v_basi boolean;
BEGIN
  SELECT p.id, p.company_id INTO v_proyek, v_company
    FROM projects p WHERE p.company_id IS NOT NULL LIMIT 1;

  IF v_proyek IS NULL THEN
    RAISE NOTICE '460 — tak ada proyek untuk diuji, verifikasi dilewati';
    RETURN;
  END IF;

  INSERT INTO struktur_elemen (company_id, project_id, kode, jenis, jumlah, input)
  VALUES (v_company, v_proyek, '[MIG-460] uji', 'balok', 1, '{}'::jsonb)
  RETURNING id INTO v_id;

  /*
    Inilah keadaan yang dulu gagal: menulis `dihitung_pada` dengan timestamp
    dari LUAR basis yang tertinggal. Sebelum migrasi ini, `basi` tetap true.
  */
  UPDATE struktur_elemen
     SET dihitung_pada = now() - interval '10 seconds'
   WHERE id = v_id;

  SELECT basi INTO v_basi FROM struktur_elemen WHERE id = v_id;

  DELETE FROM struktur_elemen WHERE id = v_id;

  IF v_basi THEN
    RAISE EXCEPTION '460 GAGAL — `basi` masih menyala sesudah dihitung; jam aplikasi masih menang';
  END IF;

  RAISE NOTICE '460 OK — dihitung_pada dipaksa ke jam basis, `basi` padam sesudah dihitung';
END $$;
