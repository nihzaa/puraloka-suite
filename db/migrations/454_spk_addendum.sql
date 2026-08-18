-- ════════════════════════════════════════════════════════════════════════════
-- 454 — Addendum SPK: mengubah lingkup yang SUDAH ditandatangani, secara sah
-- ════════════════════════════════════════════════════════════════════════════
--
-- SPK sudah bisa diterbitkan, ditandatangani, dan dicetak (2026-08-17). Yang
-- belum ada: jalan untuk mengubahnya sesudah ditandatangani.
--
-- ── Kenapa ini bukan sekadar "tombol edit"
--
-- SPK bertanda tangan memang TERKUNCI — nilai, lingkup, jangka waktu, dan
-- denda tak boleh berubah, dan layarnya sudah menyatakan itu. Aturan itu
-- benar dan tidak dicabut migrasi ini.
--
-- Tapi lingkup pekerjaan di lapangan MEMANG berubah. Tanpa jalur addendum
-- yang sah, yang terjadi bisa ditebak:
--
--   1. orang menerbitkan SPK KEDUA untuk lingkup yang sama — layar sudah
--      memperingatkan "SPK ganda", tetapi memperingatkan bukan menyediakan
--      jalan; atau
--   2. seseorang menyunting basis langsung.
--
-- Keduanya lebih buruk daripada addendum yang dirancang. Yang pertama
-- menghasilkan dua kertas yang sama-sama terlihat sah untuk satu pekerjaan;
-- yang kedua membuat kertas yang ditandatangani berbeda bunyi dari yang
-- tersimpan.
--
-- ── Kenapa DELTA, bukan salinan penuh SPK
--
-- Addendum menyimpan SELISIH (nilai tambah/kurang, perpanjangan hari), bukan
-- nilai baru. Alasannya:
--
--   • SPK induk TETAP tak berubah, jadi ia masih bisa dicetak ulang PERSIS
--     seperti saat ditandatangani. Itu syarat yang sama dengan klausul
--     kontrak (migrasi 450) dan alasannya sama: PDF di-generate ulang tiap
--     kali diunduh.
--   • Nilai efektif = induk + seluruh addendum sah. Satu rumus, satu tempat.
--   • Salinan penuh menciptakan kebenaran kedua tentang satu fakta — dan yang
--     menemukan perbedaannya adalah orang yang membayar dua kali.
--
-- ── Kenapa nilai_delta boleh NEGATIF, tapi hasil akhirnya tidak
--
-- Pekerjaan KURANG itu nyata: lingkup dicoret, nilainya turun. Jadi delta
-- negatif harus sah.
--
-- Yang TIDAK boleh: total efektif jatuh ke nol atau minus. SPK bernilai nol
-- bukan "SPK yang dikurangi habis" — ia SPK yang seharusnya DIBATALKAN, dan
-- kedua hal itu berbeda di mata hukum maupun pembukuan. Dijaga trigger di
-- bawah, bukan CHECK: CHECK tak bisa membaca baris tabel lain.
--
-- ── Kenapa hanya pada SPK `ditandatangani`
--
-- Draf dan yang baru diterbitkan masih bisa disunting langsung — addendum di
-- atasnya cuma menambah kerumitan tanpa melindungi apa pun. Yang dibatalkan
-- jelas tak bisa ditambahi.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS spk_addendum (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  spk_id      UUID NOT NULL REFERENCES surat_perintah_kerja(id) ON DELETE RESTRICT,

  -- Nomor urut PER SPK, bukan global: "Addendum ke-2 dari SPK-2026-0007"
  -- adalah cara orang menyebutnya di lapangan.
  urutan      INTEGER NOT NULL,
  nomor       TEXT NOT NULL,
  tanggal     DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Alasan WAJIB dan tak boleh kosong. Addendum tanpa alasan adalah
  -- perubahan nilai kontrak yang tak seorang pun bisa pertanggungjawabkan
  -- enam bulan kemudian.
  alasan      TEXT NOT NULL,
  lingkup_tambahan TEXT,

  -- DELTA, bukan nilai baru. Boleh negatif (pekerjaan kurang), boleh nol
  -- (addendum yang hanya memperpanjang waktu tanpa mengubah nilai).
  nilai_delta      NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Perpanjangan hari kalender. Boleh negatif (dipercepat).
  hari_delta       INTEGER NOT NULL DEFAULT 0,

  status      TEXT NOT NULL DEFAULT 'draf',

  ttd_penerbit_pada  TIMESTAMPTZ,
  ttd_pelaksana_pada TIMESTAMPTZ,

  dibuat_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT addendum_alasan_tak_kosong CHECK (btrim(alasan) <> ''),
  CONSTRAINT addendum_urutan_wajar CHECK (urutan >= 1),
  CONSTRAINT addendum_status_dikenal
    CHECK (status IN ('draf', 'diterbitkan', 'ditandatangani', 'dibatalkan')),
  -- Addendum yang tak mengubah APA PUN tak punya alasan untuk ada. Ia
  -- menambah kertas tanpa menambah kejelasan.
  CONSTRAINT addendum_mengubah_sesuatu
    CHECK (nilai_delta <> 0 OR hari_delta <> 0 OR btrim(COALESCE(lingkup_tambahan, '')) <> '')
);

-- Satu urutan per SPK. Yang dibatalkan DIKECUALIKAN: addendum ke-2 yang
-- dibatalkan boleh digantikan addendum ke-2 yang baru — pola yang sama
-- dipakai indeks tagihan CO (migrasi 348).
CREATE UNIQUE INDEX IF NOT EXISTS addendum_urutan_per_spk
  ON spk_addendum (spk_id, urutan) WHERE status <> 'dibatalkan';

CREATE INDEX IF NOT EXISTS idx_addendum_spk ON spk_addendum (spk_id);
CREATE INDEX IF NOT EXISTS idx_addendum_company ON spk_addendum (company_id);

COMMENT ON TABLE spk_addendum IS
  'Addendum SPK (454). Menyimpan DELTA, bukan nilai baru — SPK induk tetap '
  'bisa dicetak ulang persis seperti saat ditandatangani. Nilai efektif = '
  'induk + seluruh addendum yang tidak dibatalkan.';

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE spk_addendum ENABLE ROW LEVEL SECURITY;
ALTER TABLE spk_addendum FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addendum_tenant_isolation ON spk_addendum;
CREATE POLICY addendum_tenant_isolation ON spk_addendum
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ─── Trigger: syarat yang tak bisa dijaga CHECK ─────────────────────────────
--
-- CHECK hanya melihat SATU baris. Tiga aturan di bawah menuntut membaca baris
-- lain (SPK induk, dan sesama addendum), jadi harus trigger.
CREATE OR REPLACE FUNCTION fn_addendum_sah()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status    TEXT;
  v_company   UUID;
  v_nilai     NUMERIC;
  v_total     NUMERIC;
BEGIN
  SELECT status::text, company_id, nilai_kontrak
    INTO v_status, v_company, v_nilai
    FROM surat_perintah_kerja WHERE id = NEW.spk_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Addendum menunjuk SPK yang tak ada';
  END IF;

  -- 1. Tenant addendum WAJIB sama dengan tenant SPK-nya.
  --
  --    Tanpa ini, addendum tenant A bisa menempel pada SPK tenant B: RLS
  --    menyaring pembacaan, tetapi baris yang terlanjur tertulis akan ikut
  --    dihitung saat SPK itu dibaca pemiliknya — dan nilai kontraknya
  --    berubah tanpa ada yang tahu dari mana.
  IF NEW.company_id <> v_company THEN
    RAISE EXCEPTION 'Addendum milik tenant lain dari SPK-nya';
  END IF;

  -- 2. Hanya SPK yang SUDAH ditandatangani.
  --
  --    Draf dan yang baru diterbitkan masih bisa disunting langsung —
  --    addendum di atasnya cuma menambah kerumitan tanpa melindungi apa pun.
  IF v_status <> 'ditandatangani' THEN
    RAISE EXCEPTION 'Addendum hanya untuk SPK yang sudah ditandatangani (status sekarang: %)', v_status;
  END IF;

  -- 3. Nilai efektif tak boleh jatuh ke nol atau minus.
  --
  --    SPK bernilai nol bukan "SPK yang dikurangi habis" — ia SPK yang
  --    seharusnya DIBATALKAN, dan kedua hal itu berbeda di mata hukum maupun
  --    pembukuan. Yang dibatalkan tak ikut dihitung.
  SELECT v_nilai + COALESCE(SUM(a.nilai_delta), 0)
    INTO v_total
    FROM spk_addendum a
   WHERE a.spk_id = NEW.spk_id
     AND a.status <> 'dibatalkan'
     AND a.id <> NEW.id;

  v_total := v_total + CASE WHEN NEW.status = 'dibatalkan' THEN 0 ELSE NEW.nilai_delta END;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Addendum membuat nilai SPK jadi % — batalkan SPK-nya, jangan dikurangi habis', v_total;
  END IF;

  NEW.diubah_pada := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_addendum_sah ON spk_addendum;
CREATE TRIGGER trg_addendum_sah
  BEFORE INSERT OR UPDATE ON spk_addendum
  FOR EACH ROW EXECUTE FUNCTION fn_addendum_sah();

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_co     UUID;
  v_co2    UUID;
  v_proj   UUID;
  v_scope  UUID;
  v_user   UUID;
  v_spk    UUID;
  v_add    UUID;
  v_lolos  BOOLEAN;
  n        INT;
BEGIN
  -- RLS aktif DAN dipaksa.
  SELECT count(*) INTO n FROM pg_class
   WHERE relname = 'spk_addendum' AND relrowsecurity AND relforcerowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION '454 gagal: RLS/FORCE tidak aktif — service-role akan melewatinya';
  END IF;

  -- Fixture: SPK bertanda tangan, dibuat sendiri.
  SELECT p.company_id, p.id, ws.id
    INTO v_co, v_proj, v_scope
    FROM work_scopes ws
    JOIN mandor_assignments ma ON ma.id = ws.assignment_id
    JOIN projects p ON p.id = ma.project_id
   ORDER BY ws.created_at LIMIT 1;

  IF v_co IS NULL THEN
    RAISE NOTICE '454 — tak ada work_scope untuk fixture; verifikasi perilaku DILEWATI';
    RETURN;
  END IF;

  SELECT user_id INTO v_user FROM company_members WHERE company_id = v_co LIMIT 1;

  INSERT INTO surat_perintah_kerja
    (company_id, project_id, work_scope_id, nomor, lingkup_kerja, nilai_kontrak,
     tanggal_terbit, tanggal_mulai, tanggal_selesai, status,
     ttd_penerbit_url, ttd_pelaksana_url, diterbitkan_oleh)
  VALUES (v_co, v_proj, v_scope, '[454-UJI]', 'Lingkup uji migrasi', 100000000,
          CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 30, 'ditandatangani',
          'a.png', 'b.png', v_user)
  RETURNING id INTO v_spk;

  -- 1. Addendum yang tak mengubah apa pun DITOLAK.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO spk_addendum (company_id, spk_id, urutan, nomor, alasan)
    VALUES (v_co, v_spk, 1, '[454-A]', 'Tak mengubah apa-apa');
    v_lolos := TRUE;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM spk_addendum WHERE nomor LIKE '[454-%';
    DELETE FROM surat_perintah_kerja WHERE id = v_spk;
    RAISE EXCEPTION '454 gagal: addendum tanpa perubahan apa pun diterima';
  END IF;

  -- 2. Delta NEGATIF sah — pekerjaan kurang itu nyata.
  INSERT INTO spk_addendum (company_id, spk_id, urutan, nomor, alasan, nilai_delta)
  VALUES (v_co, v_spk, 1, '[454-B]', 'Lingkup dikurangi', -20000000)
  RETURNING id INTO v_add;

  -- 3. …tapi yang membuat total <= 0 DITOLAK.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO spk_addendum (company_id, spk_id, urutan, nomor, alasan, nilai_delta)
    VALUES (v_co, v_spk, 2, '[454-C]', 'Dikurangi habis', -95000000);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM spk_addendum WHERE nomor LIKE '[454-%';
    DELETE FROM surat_perintah_kerja WHERE id = v_spk;
    RAISE EXCEPTION '454 gagal: addendum yang mengosongkan nilai SPK diterima — '
      'itu pembatalan yang menyamar jadi pengurangan';
  END IF;

  -- 4. Urutan kembar per SPK ditolak.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO spk_addendum (company_id, spk_id, urutan, nomor, alasan, nilai_delta)
    VALUES (v_co, v_spk, 1, '[454-D]', 'Urutan kembar', 5000000);
    v_lolos := TRUE;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM spk_addendum WHERE nomor LIKE '[454-%';
    DELETE FROM surat_perintah_kerja WHERE id = v_spk;
    RAISE EXCEPTION '454 gagal: dua addendum ber-urutan sama diterima';
  END IF;

  -- 5. SPK yang BELUM ditandatangani tak boleh ditambahi addendum.
  UPDATE surat_perintah_kerja SET status = 'diterbitkan',
         ttd_penerbit_url = NULL, ttd_pelaksana_url = NULL WHERE id = v_spk;
  v_lolos := FALSE;
  BEGIN
    INSERT INTO spk_addendum (company_id, spk_id, urutan, nomor, alasan, nilai_delta)
    VALUES (v_co, v_spk, 9, '[454-E]', 'Belum ditandatangani', 1000000);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM spk_addendum WHERE nomor LIKE '[454-%';
    DELETE FROM surat_perintah_kerja WHERE id = v_spk;
    RAISE EXCEPTION '454 gagal: addendum diterima pada SPK yang belum ditandatangani';
  END IF;

  -- 6. Tenant LAIN tak bisa menempelkan addendum ke SPK ini.
  SELECT id INTO v_co2 FROM companies WHERE id <> v_co LIMIT 1;
  IF v_co2 IS NOT NULL THEN
    UPDATE surat_perintah_kerja SET status = 'ditandatangani',
           ttd_penerbit_url = 'a.png', ttd_pelaksana_url = 'b.png' WHERE id = v_spk;
    v_lolos := FALSE;
    BEGIN
      INSERT INTO spk_addendum (company_id, spk_id, urutan, nomor, alasan, nilai_delta)
      VALUES (v_co2, v_spk, 8, '[454-F]', 'Tenant lain', 1000000);
      v_lolos := TRUE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM spk_addendum WHERE nomor LIKE '[454-%';
      DELETE FROM surat_perintah_kerja WHERE id = v_spk;
      RAISE EXCEPTION '454 gagal: addendum tenant lain menempel pada SPK ini — '
        'nilai kontrak berubah tanpa jejak dari mana';
    END IF;
  END IF;

  DELETE FROM spk_addendum WHERE nomor LIKE '[454-%';
  DELETE FROM surat_perintah_kerja WHERE id = v_spk;

  RAISE NOTICE '454 OK — addendum SPK: perubahan wajib ada, delta negatif sah, '
    'nilai tak boleh habis, urutan unik per SPK, hanya pada SPK bertanda tangan, '
    'tenant lain ditolak';
END $$;
