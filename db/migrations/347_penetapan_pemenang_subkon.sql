-- ════════════════════════════════════════════════════════════════════════════
-- 347 — Penetapan pemenang tender subkon: satu, beralasan, dan tak bisa dibalik
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lubang yang ditutup, diukur 2026-08-13
--
-- `penawaran_subkon.status` menerima 'menang' lewat CHECK, dan DUA halaman
-- web membacanya —
--
--     apps/web/app/(dashboard)/mandor/spk/page.tsx:610,745   "· PEMENANG"
--     apps/web/app/(dashboard)/mandor/tender/page.tsx:81      tipe status
--
-- — tetapi **tak satu pun rute API menulisnya**. Diukur dengan menyisir
-- seluruh apps/api/src/routes/: `'menang'` hanya muncul di `bids.ts` (tender
-- PROYEK, entitas lain). Status 'menang' pada data hari ini masuk lewat seed.
--
-- Akibatnya bukan sekadar fitur kurang: tender subkon bisa dibuat, penawaran
-- bisa masuk, perbandingannya bisa dilihat — lalu berhenti. Keputusannya
-- diambil di luar sistem, dan yang tercatat cuma angka-angka tanpa hasil.
-- Halaman SPK yang mencari pemenang untuk menerbitkan surat perintah kerja
-- tak akan pernah menemukannya.
--
-- ── Yang dijamin basis (bukan hanya rute)
--
-- 1. Pemenang wajib beralasan. `tender_subkon.alasan_pilih` sudah ada dan
--    dipakai dengan baik pada TND-2026-001 ("dipilih meski bukan termurah…").
--    Tapi tak ada yang MENUNTUTNYA. Tender yang memenangkan penawar termahal
--    tanpa keterangan adalah temuan audit, dan alasannya paling mudah ditulis
--    saat keputusannya diambil — bukan enam bulan kemudian.
--
-- 2. Pemenang tak boleh yang `tidak_menawar`. Sudah dijaga CHECK lama
--    `penawaran_subkon_tak_menawar_tak_menang`; disebut di sini karena
--    trigger baru harus tidak bertabrakan dengannya.
--
-- 3. Sesudah tender `selesai`, penawaran TERKUNCI. Mengubah nilai penawaran
--    di belakang keputusan membuat perbandingan yang tersimpan berbohong
--    tentang dasar keputusan yang sudah diambil.
--
-- ── FORCE RLS
--
-- Keduanya `relforcerowsecurity = false`. Tanpa FORCE, pemilik tabel melewati
-- RLS sepenuhnya — dan nilai penawaran adalah informasi komersial paling
-- sensitif di modul ini: bocor antar-tenant berarti satu perusahaan melihat
-- harga penawaran pesaingnya.
--
-- ── Yang TIDAK dilakukan
--
-- Tender yang selesai TIDAK otomatis membuat `work_scopes`. Menyambungkan
-- keduanya adalah keputusan tersendiri: work_scope menuntut `assignment_id`
-- (mandor sudah ditugaskan ke proyek), dan memenangkan tender tidak dengan
-- sendirinya berarti penugasan itu sudah ada. Menebaknya di sini akan
-- membuat baris penugasan hantu. Kolom `tender_subkon.work_scope_id` sudah
-- ada dan tetap bisa diisi kemudian.
--
-- Idempoten; verifikasi di akhir GAGAL KERAS, bukan NOTICE.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Satu pemenang per tender — SUDAH ADA, tidak dibuat ulang ─────────────
--
-- Migrasi 201:157 sudah memasang `idx_penawaran_subkon_satu_pemenang` dengan
-- bentuk yang persis sama. Rancangan awal berkas ini hendak membuatnya lagi
-- dengan nama berbeda — dan `IF NOT EXISTS` tidak menolongnya, karena yang
-- diperiksa adalah NAMA, bukan BENTUK. Hasilnya dua indeks unik identik atas
-- kolom yang sama: satu penulisan ganda pada setiap insert, selamanya.
--
-- Pelajaran yang sama dengan migrasi 333 (DROP indeks berdasarkan nama tebakan
-- yang tak pernah cocok) dan 343 (trigger duplikat). Verifikasi di langkah 5
-- karena itu memeriksa indeks BERDASARKAN BENTUKNYA.

-- ── 2. Penawaran terkunci sesudah tendernya diputuskan ──────────────────────
CREATE OR REPLACE FUNCTION fn_penawaran_subkon_terkunci()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status_tender TEXT;
BEGIN
  SELECT status INTO v_status_tender
    FROM tender_subkon WHERE id = OLD.tender_id;

  -- Tender masih berjalan: bebas diubah.
  IF v_status_tender IS DISTINCT FROM 'selesai' THEN
    RETURN NEW;
  END IF;

  -- Sesudah 'selesai', yang mengubah DASAR keputusan ditolak. `status` dan
  -- `catatan` tetap boleh berubah: koreksi kalah/gugur sesudah penetapan
  -- adalah pekerjaan administratif yang sah, dan catatan justru sering baru
  -- ditulis setelah keputusan diambil.
  IF NEW.nilai_penawaran IS DISTINCT FROM OLD.nilai_penawaran
     OR NEW.waktu_kerja_hari IS DISTINCT FROM OLD.waktu_kerja_hari
     OR NEW.tidak_menawar IS DISTINCT FROM OLD.tidak_menawar
     OR NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
    RAISE EXCEPTION
      'Tender ini sudah diputuskan — nilai, waktu, dan penawarnya tak bisa diubah lagi. '
      'Mengubahnya membuat perbandingan yang tersimpan berbohong tentang dasar keputusan.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_penawaran_subkon_terkunci ON penawaran_subkon;
CREATE TRIGGER trg_penawaran_subkon_terkunci
  BEFORE UPDATE ON penawaran_subkon
  FOR EACH ROW EXECUTE FUNCTION fn_penawaran_subkon_terkunci();

-- ── 3. Tender 'selesai' wajib punya pemenang DAN alasannya ──────────────────
--
-- Dijaga dari sisi TENDER, bukan sisi penawaran: yang berpindah ke 'selesai'
-- adalah tendernya, dan di detik itulah kedua syarat harus sudah terpenuhi.
CREATE OR REPLACE FUNCTION fn_tender_subkon_selesai_beralasan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pemenang INT;
BEGIN
  IF NEW.status <> 'selesai' OR OLD.status = 'selesai' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_pemenang
    FROM penawaran_subkon
   WHERE tender_id = NEW.id AND status = 'menang';

  IF v_pemenang <> 1 THEN
    RAISE EXCEPTION
      'Tender tak bisa diselesaikan dengan % pemenang — tetapkan tepat satu penawaran sebagai pemenang lebih dulu.',
      v_pemenang;
  END IF;

  IF NEW.alasan_pilih IS NULL OR btrim(NEW.alasan_pilih) = '' THEN
    RAISE EXCEPTION
      'Alasan pemilihan wajib diisi. Tender yang tak memilih penawar termurah adalah '
      'temuan audit bila alasannya tak tercatat — dan alasannya paling mudah ditulis sekarang.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tender_subkon_selesai_beralasan ON tender_subkon;
CREATE TRIGGER trg_tender_subkon_selesai_beralasan
  BEFORE UPDATE ON tender_subkon
  FOR EACH ROW EXECUTE FUNCTION fn_tender_subkon_selesai_beralasan();

-- ── 4. FORCE RLS — harga penawaran tak boleh menyeberang tenant ─────────────
ALTER TABLE penawaran_subkon FORCE ROW LEVEL SECURITY;
ALTER TABLE tender_subkon    FORCE ROW LEVEL SECURITY;

-- ── 5. Verifikasi ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_idx     INT;
  v_trg     INT;
  v_force   INT;
  v_ganda   INT;
BEGIN
  -- Diperiksa BERDASARKAN BENTUK, bukan nama: satu indeks unik parsial atas
  -- (tender_id) dengan syarat status='menang'. Nama boleh apa saja; yang
  -- menentukan adalah jaminannya. Kalau kelak ada DUA, itu juga cacat —
  -- karena itu `<> 1`, bukan `< 1`.
  SELECT count(*) INTO v_idx FROM pg_indexes
   WHERE tablename = 'penawaran_subkon'
     AND indexdef ILIKE '%UNIQUE%'
     AND indexdef ILIKE '%(tender_id)%'
     AND indexdef ILIKE '%status = ''menang''%';
  IF v_idx <> 1 THEN
    RAISE EXCEPTION '347: ada % indeks satu-pemenang (harus tepat 1)', v_idx;
  END IF;

  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgname IN ('trg_penawaran_subkon_terkunci', 'trg_tender_subkon_selesai_beralasan')
     AND NOT tgisinternal;
  IF v_trg <> 2 THEN
    RAISE EXCEPTION '347: hanya % dari 2 trigger terpasang', v_trg;
  END IF;

  SELECT count(*) INTO v_force FROM pg_class
   WHERE relname IN ('penawaran_subkon', 'tender_subkon') AND relforcerowsecurity;
  IF v_force <> 2 THEN
    RAISE EXCEPTION '347: FORCE RLS hanya aktif di % dari 2 tabel', v_force;
  END IF;

  -- Data lama tak boleh sudah melanggar aturan baru. Kalau ada, indeks di
  -- langkah 1 gagal lebih dulu — pemeriksaan ini menangkap keadaan yang
  -- tersisa setelahnya, dan menyatakannya alih-alih membiarkannya senyap.
  SELECT count(*) INTO v_ganda FROM (
    SELECT tender_id FROM penawaran_subkon WHERE status = 'menang'
     GROUP BY tender_id HAVING count(*) > 1) t;
  IF v_ganda > 0 THEN
    RAISE EXCEPTION '347: % tender masih punya lebih dari satu pemenang', v_ganda;
  END IF;

  RAISE NOTICE '347 OK — satu pemenang per tender, penawaran terkunci sesudah putusan, FORCE RLS 2/2';
END $$;
