-- ════════════════════════════════════════════════════════════════════════════
-- 464 — Menu Mitra dipindah ke induk yang HIDUP
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 463 mengaktifkan `md-subkon` dan menunjukkannya ke `/mandor/mitra`.
-- Penjaga `audit-sidebar-urutan.mjs` langsung merah, dan temuannya benar:
--
--   induk MATI: Master Data  (g-master)
--      Mitra & Subkontraktor        /mandor/mitra
--
-- ── Kenapa ini bukan cacat sepele
--
-- Sidebar menyaring per-BARIS, bukan per-POHON. Item yang induknya mati tetap
-- dirender — MENGGANTUNG, nyantol di bawah grup terakhir yang kebetulan
-- berdekatan. Jadi 463 sendirian menghasilkan menu yang muncul di tempat yang
-- salah dan tak seorang pun bisa menerangkan kenapa.
--
-- Yang membuatnya mudah terlewat: 463 SUDAH memverifikasi dirinya (href benar,
-- aktif, izin ada) dan lulus. Blok verifikasinya memeriksa barisnya sendiri
-- dan tak pernah bertanya apakah INDUKNYA masih hidup.
--
-- ── Kenapa `g-mandor-subkon`, bukan `g-master-data`
--
-- Diukur: ada DUA grup Master Data — `g-master` (sort 100, MATI) dan
-- `g-master-data` (sort 50, hidup). Yang hidup memang tersedia.
--
-- Tetapi mitra dipilih masuk `g-mandor-subkon` (sort 800, hidup) karena di
-- sanalah pekerjaannya: ia identitas SUBKONTRAKTOR, dan sepuluh saudaranya
-- (penugasan, absensi, upah, kasbon, penagihan, retensi, tender, opname, SPK)
-- semuanya di grup itu. Menaruhnya di Master Data memisahkannya dari satu-
-- satunya konteks yang membuatnya bermakna.
--
-- ── sort_order 811 — DIUKUR, bukan ditebak
--
-- Anak `g-mandor-subkon` terpakai 801-810 tanpa lubang. 811 kosong dan masih
-- di dalam rentangnya. Migrasi 455 pernah menabrak nomor terpakai dan 456
-- pernah mewarisi rentang dari grup MATI; keduanya tak boleh terulang.
--
-- Idempoten.
-- ════════════════════════════════════════════════════════════════════════════

/*
  INDUKNYA IKUT DIHIDUPKAN — DITAMBAHKAN 2026-08-31.

  Migrasi ini memindahkan `md-subkon` ke bawah `g-mandor-subkon`, lalu
  verifikasinya menuntut induk itu HIDUP — tetapi tak pernah menghidupkannya:

      HARD FAIL — 476_mitra_induk_hidup.sql
        464 gagal: induk g-mandor-subkon masih MATI — item akan muncul
        menggantung di bawah grup yang kebetulan di atasnya

  Judul berkasnya sendiri berbunyi "mitra INDUK HIDUP", dan tuntutannya benar:
  anak aktif di bawah induk mati muncul menggantung di sidebar. Yang kurang
  hanya tindakannya.

  Bentuk yang sudah menggigit di 271, 295, 337, 340, 363, dan 364 hari ini:
  migrasi yang MEMERIKSA sesuatu tanpa MENGERJAKANNYA.

  Sort_order induknya tak disentuh — hanya keaktifannya.
*/
UPDATE menu_items
   SET is_active = true, updated_at = now()
 WHERE key = 'g-mandor-subkon'
   AND NOT is_active;

UPDATE menu_items
   SET parent_id = (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'),
       sort_order = 811,
       updated_at = now()
 WHERE key = 'md-subkon';

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_induk text; v_induk_hidup boolean; v_urut int; v_bentrok int;
BEGIN
  SELECT p.key, p.is_active, mi.sort_order
    INTO v_induk, v_induk_hidup, v_urut
    FROM menu_items mi JOIN menu_items p ON p.id = mi.parent_id
   WHERE mi.key = 'md-subkon';

  IF v_induk IS NULL THEN
    RAISE EXCEPTION '464 gagal: md-subkon tak punya induk sama sekali';
  END IF;

  -- INI inti migrasinya. Item yang induknya mati tetap dirender, menggantung.
  IF NOT v_induk_hidup THEN
    RAISE EXCEPTION '464 gagal: induk % masih MATI — item akan muncul menggantung '
      'di bawah grup yang kebetulan berdekatan', v_induk;
  END IF;

  -- Bentrok sort_order di antara saudara sekandung: urutan sidebar jadi tak
  -- tentu, dan "tak tentu" berarti berbeda tiap kali query dijalankan.
  SELECT count(*) INTO v_bentrok FROM (
    SELECT mi.sort_order FROM menu_items mi
      JOIN menu_items p ON p.id = mi.parent_id
     WHERE p.key = 'g-mandor-subkon' AND mi.is_active
     GROUP BY mi.sort_order HAVING count(*) > 1) x;
  IF v_bentrok > 0 THEN
    RAISE EXCEPTION '464 gagal: % sort_order bentrok di antara anak g-mandor-subkon', v_bentrok;
  END IF;

  RAISE NOTICE '464 OK — md-subkon di bawah % (hidup), urutan %, nol bentrok',
    v_induk, v_urut;
END $$;
