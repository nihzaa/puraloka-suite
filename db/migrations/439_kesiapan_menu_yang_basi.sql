-- ════════════════════════════════════════════════════════════════════════════
-- 439 — Titik kesiapan yang berbohong: `rencana` untuk halaman yang HIDUP
-- ════════════════════════════════════════════════════════════════════════════
--
-- Founder membuka sidebar 2026-08-17 dan bertanya soal tiga sub-menu terbawah
-- grup Master Data yang bertitik abu:
--
--     Template WBS ●   Data Kepegawaian ●   Penomoran Dokumen ●
--
-- Titik itu datang dari `menu_items.kesiapan` (migrasi 241), dan ketiganya
-- tertulis `rencana`. Diukur, ketiganya JUSTRU sudah hidup:
--
--     /master/wbs        718 baris
--     /master/karyawan   760 baris
--     /master/penomoran  404 baris
--
-- `peta-menu.ts` bahkan mencatat ketiganya `hidup` sejak 2026-08-12, lengkap
-- dengan nomor migrasinya (335/336, 340/341, 333/334).
--
-- ── Kenapa ini bukan sekadar kosmetik
--
-- Titik kesiapan ADA supaya orang tak membuang waktu mengeklik menu yang
-- belum jadi. Ketika ia salah ke arah ini, akibatnya kebalikannya: halaman
-- yang sudah bisa dipakai terlihat seperti belum siap, dan orang berhenti
-- membukanya.
--
-- Itu kelas cacat yang sama persis dengan yang CLAUDE.md §8a.4 catat — tujuh
-- sub-menu ditandai 🔴 padahal UI-nya sudah hidup berbulan-bulan. Bedanya
-- kali ini sumbernya BASIS, bukan dokumen, jadi penjaga `audit-taksonomi-vs-
-- kode` tak pernah melihatnya.
--
-- ── Kenapa `hidup`, bukan dihapus titiknya
--
-- `TitikKesiapan` memang tak menggambar apa pun untuk `hidup` (komentarnya
-- sendiri: "Halaman yang HIDUP tak diberi titik sama sekali"). Jadi menyetel
-- `hidup` = titiknya hilang, dan itu memang yang benar.
--
-- Yang TIDAK dilakukan: menyapu semua `rencana` jadi `hidup` sekaligus.
-- Hanya tiga baris ini yang halamannya sudah diverifikasi ada. Menyapu
-- rata akan mengubah titik yang JUJUR jadi bohong ke arah sebaliknya.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET kesiapan = 'hidup', updated_at = now()
 WHERE href IN ('/master/wbs', '/master/karyawan', '/master/penomoran')
   AND is_active = true
   AND kesiapan IS DISTINCT FROM 'hidup';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_sisa INT;
  v_hidup INT;
BEGIN
  -- 1. Ketiganya kini `hidup`.
  SELECT count(*) INTO v_hidup
    FROM menu_items
   WHERE href IN ('/master/wbs', '/master/karyawan', '/master/penomoran')
     AND is_active = true AND kesiapan = 'hidup';
  IF v_hidup <> 3 THEN
    RAISE EXCEPTION '439 gagal: hanya % dari 3 menu yang jadi hidup', v_hidup;
  END IF;

  -- 2. Menu LAIN tidak ikut tersapu — inti kehati-hatian migrasi ini.
  --    Kalau angka ini jadi nol, berarti UPDATE-nya kelebaran dan titik
  --    kesiapan berhenti berarti apa pun.
  SELECT count(*) INTO v_sisa
    FROM menu_items
   WHERE is_active = true AND kesiapan = 'rencana';
  IF v_sisa = 0 THEN
    RAISE EXCEPTION
      '439 gagal: TAK ADA lagi menu ber-kesiapan rencana — UPDATE kelebaran, '
      'titik kesiapan kehilangan maknanya';
  END IF;

  RAISE NOTICE '439 OK — 3 menu Master Data jadi hidup; % menu lain tetap rencana', v_sisa;
END $$;
