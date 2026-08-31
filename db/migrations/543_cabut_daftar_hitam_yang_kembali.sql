-- ============================================================================
-- 543 — `mitra:daftar_hitam` KEMBALI di basis CI sesudah 540 mencabutnya
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Penjaga `audit-peran-tak-kelebihan.mjs` MERAH di CI:
--
--     ❌ 1 pelanggaran:
--        · mitra:daftar_hitam dipegang 1 peran — seharusnya NOL
--          menutup penghidupan orang — lewat proses, bukan satu klik
--
-- Izin ini memutuskan apakah sebuah mitra boleh berbisnis sama sekali —
-- menutup tender, SPK, dan PO sekaligus. Migrasi 462 SENGAJA tak
-- mewariskannya ("tak boleh muncul di tangan seseorang sebagai efek
-- samping"), dan 539 + 540 mencabutnya dari SIAPA PUN.
--
-- ── Kenapa ia ada lagi, dan kenapa migrasi maju yang benar
--
-- Diukur:
--
--     dev          0 peran memegangnya   ← 539/540 bekerja di sini
--     basis CI     1 peran memegangnya   ← tidak
--
-- Rantai migrasi di CI melaporkan `applied=0 · sudah-ada=517`: 539 dan 540
-- SUDAH TERCATAT, jadi keduanya tak akan pernah berjalan lagi di sana.
-- Apa pun yang memberikan izin itu terjadi SESUDAH keduanya tercatat, dan
-- pencabutan yang sudah tercatat tak bisa membatalkannya.
--
-- Ini bentuk Gerbang Keras G-2 yang sama dengan `template_rab` (541) dan
-- `template_penerapan` (542) hari ini: perbaikan yang tercatat tidak berlaku
-- surut, dan satu-satunya jalan adalah migrasi maju bernomor baru.
--
-- ⚠ SUMBER PEMBERINYA BELUM DIKETAHUI. Diperiksa dan TIDAK ditemukan:
--   · nol migrasi bernomor > 540 yang menyentuh `role_permissions`
--   · 462 sengaja tak mewariskannya (komentarnya menyatakan itu)
--   · 536 memberi borongan TAPI nomornya di bawah 539/540 yang mencabut
--   · seed `ci-project-setup.mjs` hanya MEMBACA role_permissions
--
-- Karena sumbernya belum pasti, migrasi ini tak cuma mencabut — ia juga
-- MEMVERIFIKASI hasilnya dan gagal keras bila masih tersisa. Kalau sumbernya
-- masih hidup, yang merah adalah migrasi ini (dekat sebabnya), bukan penjaga
-- di CI besok (jauh dari sebabnya).
--
-- ── Yang TIDAK dilakukan
--
-- Izin ini tidak dihapus dari tabel `permissions`. Ia tetap SAH dan tetap
-- bisa diberikan lewat UI pengaturan peran bila founder memutuskan begitu —
-- yang dijaga hanya BAWAANNYA, sama persis dengan alasan 540.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

DO $cabut_hitam$
DECLARE
  n_cabut INT;
BEGIN
  WITH dibuang AS (
    DELETE FROM role_permissions rp
     USING permissions p
     WHERE rp.permission_id = p.id
       AND p.key IN ('mitra:daftar_hitam', 'approval:override_sod')
    RETURNING 1
  )
  SELECT count(*) INTO n_cabut FROM dibuang;

  RAISE NOTICE '543: % pemberian dicabut (daftar_hitam + override_sod)', n_cabut;
END $cabut_hitam$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_sisa   INT;
  v_pelaku TEXT;
BEGIN
  SELECT count(*), string_agg(DISTINCT r.name || '/' || p.key, ', ')
    INTO n_sisa, v_pelaku
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    JOIN roles r       ON r.id = rp.role_id
   WHERE p.key IN ('mitra:daftar_hitam', 'approval:override_sod');

  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '543 gagal: % pemegang tersisa (%) — sumber pemberinya masih hidup, '
      'dan pencabutan saja tak cukup', n_sisa, v_pelaku;
  END IF;

  /*
    Izinnya sendiri HARUS tetap ada di katalog. Kalau ia ikut terhapus,
    `requirePermission('mitra:daftar_hitam')` jadi kunci HANTU yang menolak
    semua orang tanpa gejala — persis yang dijaga `audit-izin-benar-ada`.
  */
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'mitra:daftar_hitam') THEN
    RAISE EXCEPTION '543 gagal: izin mitra:daftar_hitam HILANG dari katalog';
  END IF;

  RAISE NOTICE '543 OK: nol pemegang, izinnya tetap ada di katalog';
END $$;
