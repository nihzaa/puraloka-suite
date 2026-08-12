-- ════════════════════════════════════════════════════════════════════════════
-- 350 — Pelajaran proyek punya pintunya
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang diukur 2026-08-13
--
-- Modul lessons-learned punya:
--
--     tabel `lessons_learned_records` + `root_cause_analyses`
--                                     + `lesson_propagation_proposals`
--     empat trigger  immutable · no-delete · transisi status · touch
--     fungsi         `fn_propagate_lesson` (propagasi ATOMIK)
--     alur           draft → under_review → approved → propagated,
--                    lewat engine approval ADR-007
--     lima test      terhadap Postgres nyata
--
-- Dan rutenya HANYA tiga PATCH: submit, approve, reject.
--
-- Tak ada GET. Tak ada POST. Nol menu, nol halaman, nol entri Peta Modul.
--
-- Artinya pelajaran hanya bisa DISETUJUI — kalau ada yang menyisipkannya lewat
-- SQL. Mesin belajarnya lengkap sampai ke propagasi atomik; pintunya tak
-- pernah dipasang.
--
-- ── Kenapa ini menutup `qc-capa`, bukan sekadar menambah halaman
--
-- Taksonomi menandai `qc-capa` "sebagian": yang hidup baru sisi KOREKTIF —
-- memperbaiki cacat yang sudah terjadi, lewat NCR. Sisi PREVENTIF, yang
-- membedakan CAPA dari sekadar perbaikan, adalah mengubah cara MERENCANAKAN
-- supaya cacat sejenis tak lahir lagi.
--
-- Itulah yang dilakukan modul ini: pelajaran yang disetujui menerbitkan VERSI
-- BARU di price book dan tabel produktivitas — angka yang dipakai menyusun
-- estimasi berikutnya. Ia sudah ada, hanya tak terjangkau.
--
-- ── Penempatan
--
-- Grup "Mutu & K3" (`g-mutu-kepatuhan`, sort_order 1000), sesudah NCR (1001).
-- Berdampingan karena keduanya menjawab dua sisi kejadian yang sama: NCR
-- memperbaiki yang terjadi, pelajaran mengubah yang direncanakan.
--
-- 1002–1005 sudah terisi, jadi entri baru mengambil 1006 — tanpa menggeser
-- saudaranya. Menggeser menu yang sudah dihafal orang untuk merapikan urutan
-- adalah biaya yang tak sepadan.
--
-- Idempoten (ON CONFLICT); verifikasi GAGAL KERAS.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions,
                        sort_order, section, is_active, kesiapan)
SELECT 'mutu-pelajaran',
       'Pelajaran Proyek',
       '/mutu/pelajaran',
       'sprout',
       p.id,
       -- Sama dengan rutenya: `cecep:lessons:view`. Menu yang lebih longgar
       -- daripada rutenya hanya memajang tautan yang berujung 403.
       ARRAY['cecep:lessons:view'],
       1006,
       (SELECT section FROM menu_items WHERE key = 'mutu-ncr'),
       TRUE,
       'hidup'
  FROM menu_items p
 WHERE p.key = 'g-mutu-kepatuhan'
    ON CONFLICT (key) DO UPDATE
   SET href       = EXCLUDED.href,
       label      = EXCLUDED.label,
       parent_id  = EXCLUDED.parent_id,
       sort_order = EXCLUDED.sort_order,
       is_active  = TRUE,
       kesiapan   = 'hidup',
       updated_at = now();

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_href  TEXT;
  v_aktif BOOLEAN;
  v_urut  INT;
  v_gso   INT;
  v_izin  TEXT[];
  v_ganda INT;
BEGIN
  SELECT href, is_active, sort_order, required_permissions
    INTO v_href, v_aktif, v_urut, v_izin
    FROM menu_items WHERE key = 'mutu-pelajaran';

  IF v_href IS NULL THEN
    RAISE EXCEPTION '350: menu mutu-pelajaran tidak terbentuk';
  END IF;
  IF v_href <> '/mutu/pelajaran' THEN
    RAISE EXCEPTION '350: menunjuk % — bukan halamannya', v_href;
  END IF;

  -- Diperiksa dari sisi PEMBACA, pelajaran migrasi 345→346: baris yang benar
  -- tapi tak tampil sama saja dengan tak ada.
  IF NOT v_aktif THEN
    RAISE EXCEPTION '350: mutu-pelajaran nonaktif — tautannya tak akan tampil';
  END IF;

  SELECT sort_order INTO v_gso FROM menu_items WHERE key = 'g-mutu-kepatuhan';
  IF v_urut <= v_gso OR v_urut > v_gso + 99 THEN
    RAISE EXCEPTION '350: sort_order % di luar rentang %..%', v_urut, v_gso + 1, v_gso + 99;
  END IF;

  IF v_izin IS NULL OR NOT ('cecep:lessons:view' = ANY(v_izin)) THEN
    RAISE EXCEPTION '350: izin menu tak cocok dengan izin rutenya (cecep:lessons:view)';
  END IF;

  -- Aturan 232: satu rute = satu tautan aktif. Dan sort_order tak boleh kembar
  -- di antara saudara — dua pemeriksaan yang lahir dari penjaga yang
  -- memerahkan migrasi 346 dan 349.
  SELECT count(*) INTO v_ganda
    FROM (SELECT href FROM menu_items WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) t;
  IF v_ganda > 0 THEN
    RAISE EXCEPTION '350: % href dipakai lebih dari satu tautan aktif', v_ganda;
  END IF;

  SELECT count(*) INTO v_ganda
    FROM (SELECT sort_order FROM menu_items
           WHERE is_active AND parent_id = (SELECT id FROM menu_items WHERE key = 'g-mutu-kepatuhan')
           GROUP BY sort_order HAVING count(*) > 1) t;
  IF v_ganda > 0 THEN
    RAISE EXCEPTION '350: % sort_order kembar di grup Mutu & K3', v_ganda;
  END IF;

  RAISE NOTICE '350 OK — Pelajaran Proyek aktif di /mutu/pelajaran, izin sejalan dengan rutenya';
END $$;
