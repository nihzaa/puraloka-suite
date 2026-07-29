-- ============================================================
-- 141 — KOREKSI KOEFISIEN: CIB-BGK-B.3 (1 M2 BONGKARAN KERAMIK)
--
-- TEMUAN (audit 2026-07-30, dipicu pertanyaan founder terhadap selisih HSP):
--
--   Parser `extract-ahsp-cibuluh.py` mendeteksi awal blok analisa lewat regex
--   yang mensyaratkan SPASI WAJIB antara angka "1" dan kode satuan
--   (mis. "1 M2 ..."). Tiga baris di workbook diketik TANPA spasi:
--     "1 M1BONGKARAN TALANG/LISPLANG"        (ANALBONGKAR no.B.4)
--     "1M3 PASANGAN BALOK GORDING KY.KRUING" (ANALISA STANDAR no.58)
--     "1M3 PASANGAN BALOK GORDING KY.BORNEO" (ANALISA STANDAR no.59)
--
--   Regex lama gagal cocok pada ketiganya. Parser tak pernah melihat blok baru
--   dimulai, sehingga komponen milik B.4 (Pekerja 0,043 OH; Mandor 0,02 OH)
--   jatuh ke blok B.3 SEBELUMNYA yang belum ditutup, dan logika dedup resource
--   (nama+satuan sama → jumlahkan koefisien) menggabungkannya:
--     Pekerja: 0,05 + 0,043 = 0,093   (SEHARUSNYA 0,05 — milik B.3 saja)
--     Mandor : 0,025 + 0,02 = 0,045   (SEHARUSNYA 0,025 — milik B.3 saja)
--
--   Diverifikasi manual terhadap baris mentah workbook (ANALBONGKAR baris
--   24-31): blok B.3 hanya 2 baris komponen (Pekerja 0,05; Mandor 0,025),
--   ditutup "JUMLAH A.8" sebelum blok B.4 dimulai di baris 32.
--
-- PERBAIKAN AKAR: regex `HDR_RE`/`OUT_UNIT_RE` di
-- `db/seeds/tools/extract-ahsp-cibuluh.py` diganti agar tak mensyaratkan
-- spasi. Diuji terhadap SELURUH 7 sheet analisa (2026-07-30): menangkap PERSIS
-- 3 blok yang tadinya hilang, NOL regresi pada 433 blok yang sudah benar
-- terdeteksi sebelumnya. Dataset diregenerasi: 417→420 analisa. Dibandingkan
-- baris-per-baris (by nama+satuan komponen, bukan urutan array): HANYA
-- CIB-BGK-B.3 yang koefisiennya berubah — 416 analisa lain identik persis.
--
-- KENAPA MIGRASI, BUKAN RE-SEED PENUH: 420 analisa dataset baru berarti 3
-- ANALISA BARU (B.4, 58, 59) yang belum ada di database sama sekali — itu
-- masuk akal sebagai INSERT biasa via seeder (tak menyentuh guard apa pun,
-- baris baru bukan mutasi). Yang butuh migrasi KHUSUS hanyalah B.3, karena
-- assembly-nya sudah `status='active'` DAN `is_import_baseline=true`:
--   - fn_assembly_component_parent_draft menolak UPDATE assembly_components
--     bila parent bukan 'draft' (107 §6).
--   - fn_assembly_baseline_immutable menolak UPDATE metadata assemblies bila
--     is_import_baseline=true (117).
-- Keduanya SENGAJA — "Estimate Item yang memakainya tak boleh berubah
-- retroaktif. Buat versi baru." Pola resmi yang disediakan untuk kasus ini
-- adalah edit_type='correction' (117, komentar kolom: "perbaikan agar COCOK
-- SE (tetap berlabel SE)") — persis kasus ini: koefisien salah karena bug
-- PARSER, bukan perubahan cara kerja Cibuluh yang sesungguhnya.
--
-- BENTUK: baris LAMA ditandai 'superseded' (arsip, tetap ada — audit trail
-- utuh); baris BARU dibuat dengan koefisien BENAR, `edited_from` menunjuk baris
-- lama, `edit_type='correction'`. estimate_items yang SUDAH memakai baris lama
-- (nol per pengecekan 2026-07-30) tidak terpengaruh — kalaupun ada nanti,
-- RAB lama tetap menunjuk assembly_id lama yang datanya sudah diverifikasi
-- salah, sesuai prinsip "RAB yang sudah diteken tak berubah retroaktif".
-- ============================================================

DO $$
DECLARE
  v_lama_id     UUID;
  v_baru_id     UUID;
  v_dipakai     INT;
  v_pekerja_id  UUID;
  v_mandor_id   UUID;
BEGIN
  SELECT id INTO v_lama_id FROM assemblies WHERE code = 'CIB-BGK-B.3' AND source = 'company';
  IF v_lama_id IS NULL THEN
    RAISE NOTICE '141: CIB-BGK-B.3 tidak ditemukan — migrasi dilewati (mungkin sudah dikoreksi).';
    RETURN;
  END IF;

  -- Pengecekan keamanan: pastikan asumsi migrasi ("belum dipakai RAB") masih
  -- berlaku SAAT DIJALANKAN, bukan hanya saat ditulis. Kalau sudah dipakai,
  -- migrasi berhenti dan minta keputusan manusia — bukan diam-diam menimpa
  -- baris yang mendasari dokumen RAB nyata.
  SELECT count(*) INTO v_dipakai FROM estimate_items WHERE assembly_id = v_lama_id;
  IF v_dipakai > 0 THEN
    RAISE EXCEPTION
      '141: CIB-BGK-B.3 (id=%) sudah dipakai % estimate_items. Migrasi berhenti — '
      'koreksi retroaktif pada assembly yang sudah dipakai RAB butuh keputusan '
      'eksplisit (pengaruh ke RAB yang sudah ada), bukan migrasi otomatis.',
      v_lama_id, v_dipakai;
  END IF;

  -- Resource "Pekerja" dan "Mandor" dipakai analisa ini — id-nya sudah ada,
  -- diambil dari komponen lama supaya baris baru menunjuk resource yang SAMA
  -- (bukan membuat resource duplikat).
  SELECT resource_id INTO v_pekerja_id FROM assembly_components
   WHERE assembly_id = v_lama_id AND coefficient = 0.093 LIMIT 1;
  SELECT resource_id INTO v_mandor_id FROM assembly_components
   WHERE assembly_id = v_lama_id AND coefficient = 0.045 LIMIT 1;

  IF v_pekerja_id IS NULL OR v_mandor_id IS NULL THEN
    RAISE EXCEPTION
      '141: koefisien lama (0.093/0.045) tidak ditemukan pada CIB-BGK-B.3 — '
      'kemungkinan sudah dikoreksi sebelumnya atau datanya berbeda dari yang '
      'diverifikasi. Migrasi berhenti, tidak menebak.';
  END IF;

  -- Baris lama diarsipkan, bukan dihapus: jejak "begini yang pernah di-seed,
  -- dan ini kenapa salah" tetap tersedia untuk audit di masa depan.
  UPDATE assemblies SET status = 'superseded', updated_at = now()
   WHERE id = v_lama_id;

  INSERT INTO assemblies (
    code, name, description, cost_code_id, source, reference_standard,
    version_number, waste_factor, sequence, status, activated_at,
    created_by, updated_by, output_unit_code, edition_id, is_import_baseline,
    edited_from, edit_type, edit_reason, company_id
  )
  SELECT
    -- version_number + 1: constraint assembly_identity UNIQUE
    -- (code, edition_id, source, version_number) menolak baris kembar persis.
    -- Ditemukan lewat dry-run BEGIN/ROLLBACK sebelum menyentuh dev — bukan
    -- ditebak: percobaan pertama menyalin version_number apa adanya dan
    -- ditolak DB dengan "duplicate key value".
    code, name, description, cost_code_id, source, reference_standard,
    version_number + 1, waste_factor,
    jsonb_build_array(jsonb_build_object(
      'note',
      'KOREKSI 2026-07-30 (migrasi 141): koefisien Pekerja/Mandor semula ' ||
      'bengkak (0,093/0,045) karena bug parser — regex header blok gagal ' ||
      'mendeteksi "1 M1BONGKARAN TALANG/LISPLANG" (B.4) tanpa spasi, sehingga ' ||
      'komponennya (Pekerja 0,043; Mandor 0,02) tercampur ke blok B.3 ini. ' ||
      'Dikoreksi ke nilai asli workbook (ANALBONGKAR baris 26-27): ' ||
      'Pekerja 0,05 OH; Mandor 0,025 OH. Baris asal: id=' || v_lama_id::text
    )),
    'draft',           -- lahir draft: correction tetap melalui gerbang aktivasi normal
    NULL,              -- activated_at kosong sampai diaktifkan lewat jalur biasa
    created_by, created_by, output_unit_code, edition_id, false,  -- BUKAN baseline (ini correction)
    v_lama_id, 'correction',
    'Koefisien Pekerja/Mandor dikoreksi ke nilai asli workbook — versi sebelumnya ' ||
    'tercemar komponen milik blok B.4 akibat bug parser (lihat migrasi 141).',
    company_id
  FROM assemblies WHERE id = v_lama_id
  RETURNING id INTO v_baru_id;

  INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order, notes, company_id)
  SELECT v_baru_id, resource_id,
         CASE resource_id WHEN v_pekerja_id THEN 0.05 WHEN v_mandor_id THEN 0.025 ELSE coefficient END,
         sort_order, notes, company_id
    FROM assembly_components WHERE assembly_id = v_lama_id;

  -- Correction langsung diaktifkan: ini bukan draft yang menunggu review manusia
  -- — paritasnya sudah diverifikasi manual (Rp 4.400 dari 0,025×176.000, cocok
  -- baris "JUMLAH A.8"=4400 di workbook) sebelum migrasi ini ditulis.
  UPDATE assemblies SET status = 'active', activated_at = now(), updated_at = now()
   WHERE id = v_baru_id;

  RAISE NOTICE '141: CIB-BGK-B.3 dikoreksi. Lama (superseded)=%, Baru (active)=%',
    v_lama_id, v_baru_id;
END $$;

-- ------------------------------------------------------------
-- Verifikasi.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_baru RECORD;
  v_koef_pekerja NUMERIC;
  v_koef_mandor NUMERIC;
BEGIN
  SELECT id, status, edit_type INTO v_baru FROM assemblies
   WHERE code = 'CIB-BGK-B.3' AND status = 'active' AND edit_type = 'correction';

  IF v_baru IS NULL THEN
    RAISE NOTICE '141: tak ada baris correction aktif (migrasi mungkin dilewati sebelumnya).';
    RETURN;
  END IF;

  SELECT coefficient INTO v_koef_pekerja FROM assembly_components ac
    JOIN resources r ON r.id = ac.resource_id
   WHERE ac.assembly_id = v_baru.id AND r.name = 'Pekerja';
  SELECT coefficient INTO v_koef_mandor FROM assembly_components ac
    JOIN resources r ON r.id = ac.resource_id
   WHERE ac.assembly_id = v_baru.id AND r.name = 'Mandor';

  IF v_koef_pekerja <> 0.05 OR v_koef_mandor <> 0.025 THEN
    RAISE EXCEPTION
      '141: koefisien hasil koreksi tidak sesuai — Pekerja=% (harus 0.05), Mandor=% '
      '(harus 0.025).', v_koef_pekerja, v_koef_mandor;
  END IF;

  RAISE NOTICE '141: verifikasi lulus — Pekerja=0.05, Mandor=0.025 (sesuai workbook).';
END $$;
