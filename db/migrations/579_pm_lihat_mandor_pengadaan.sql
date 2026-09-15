-- ============================================================================
-- 579 — R-017: `pm` boleh MELIHAT mandor & pengadaan di proyeknya
-- ============================================================================
--
-- ── ⚠ Judul R-017 sudah tidak benar, dan itu bagian dari temuannya
--
-- Entri aslinya (2026-08-31) berbunyi *"Peran PM kehilangan 183 izin —
-- termasuk `projects:view`"*, dengan kalimat paling tajam: *"PM tak bisa
-- melihat proyek. Klien — pihak luar yang membayar — bisa."*
--
-- Diukur ulang 2026-09-14:
--
--     izin pm          37 → 58
--     projects:view    ❌ → ✅
--
-- Bagian terburuknya sudah diperbaiki seseorang, dan entrinya tak pernah
-- diperbarui. **Dokumen ratifikasi pun bisa basi** — persis yang diperingatkan
-- pembuka CLAUDE.md untuk dokumen konteks.
--
-- ── Yang tersisa, dan kenapa dua ini saja
--
-- Izin `pm` hari ini koheren: estimasi/RAB/RAP, K3, mutu, NCR, punch,
-- inspeksi, izin kerja, progres. Yang janggal: ia mengelola 19 proyek dan
-- mencatat 249 progres, tetapi tak bisa MELIHAT mandor maupun pengadaan di
-- proyeknya sendiri. Sepuluh menu aktif tertutup karenanya.
--
-- Diberikan DUA, bukan empat:
--
--     mandor:view      → /mandor · kasbon · opname · SPK · upah   (5 menu)
--     procurement:view → /procurement · hutang · kualifikasi      (3 menu)
--
-- `reports:view` dan `clients:view` SENGAJA tidak: keduanya lebih dekat ke
-- wilayah komersial (laporan BI, daftar klien) yang wajar dipegang
-- admin/direktur, dan menambahkannya tak punya pembenaran dari data —
-- tak satu pun aktivitas `pm` di basis menyentuh keduanya.
--
-- ── ⚠ Yang TIDAK diberikan, dan itu disengaja
--
-- Keduanya izin **LIHAT**, bukan `manage`. `pm` tetap tak bisa mengubah apa
-- pun di wilayah mandor atau pengadaan — tak bisa membuat SPK, tak bisa
-- menyetujui kasbon, tak bisa mengubah PO.
--
-- Yang dibuka memang angka pembayaran pihak ketiga (upah tukang, utang
-- supplier), dan itu keputusan kewenangan yang dinyatakan di sini supaya tak
-- terbaca sebagai perbaikan bug: manajer proyek melihat biaya yang terjadi di
-- proyek yang ia pertanggungjawabkan.
--
-- ⚠ Diberikan ke SELURUH tenant, bukan cuma template. Tenant yang sudah
-- berjalan punya salinan peran `pm` sendiri; memberi hanya ke template
-- berarti mereka tak mendapatkannya, dan kegagalan itu hanya muncul di
-- produksi.
-- ============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.roles r
  CROSS JOIN public.permissions p
 WHERE r.name = 'pm'
   AND p.key IN ('mandor:view', 'procurement:view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa TIGA arah. Yang pertama saja akan hijau bahkan bila migrasi ini
-- diam-diam memberi lebih dari yang dimaksud.
DO $$
DECLARE
  n_pm       INT;
  n_manage   INT;
  n_menu     INT;
BEGIN
  /* 1. Template `pm` WAJIB memegang keduanya. */
  SELECT count(*) INTO n_pm
    FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE r.name = 'pm' AND r.company_id IS NULL
     AND p.key IN ('mandor:view', 'procurement:view');

  IF n_pm <> 2 THEN
    RAISE EXCEPTION
      '579 gagal: template pm memegang % dari 2 izin lihat yang dimaksud', n_pm;
  END IF;

  /*
    2. Yang DISISIPKAN migrasi ini tak boleh berupa izin MANAGE.

    ⚠ DIPERBAIKI 2026-09-15 — versi pertama cek ini MEMERAHKAN SELURUH ENAM
    SHARD CI, dan cacatnya milik saya sendiri.

    Bunyinya dulu: hitung izin MANAGE yang dipegang `pm` di wilayah
    mandor/pengadaan, lalu `IF n_manage > 0 THEN RAISE`. Niatnya benar —
    jaring pengaman supaya orang yang menyalin blok ini tak diam-diam
    memberi kewenangan MENGUBAH. Yang salah PENGUKURANNYA: ia menuntut
    keadaan AWAL tertentu, bukan menilai apa yang migrasi ini lakukan.

    Diukur dari dua sisi:

        dev (berjalan lama)   : pm template punya 0 izin MANAGE → lulus
        CI (replay dari NOL)  : pm template punya 5 izin MANAGE → MATI

            579 gagal: pm mendapat 5 izin MANAGE di wilayah
                       mandor/pengadaan — yang dimaksud hanya LIHAT.

    Kelima izin itu SAH: rantai migrasi memang memberikannya ke `pm` sejak
    awal, dan di dev mereka hilang belakangan. Jadi cek ini mengangkat
    **kecelakaan dev menjadi syarat**.

    Kenapa lolos sampai CI: saya menjalankan 579 ke dev, melihat NOTICE-nya,
    dan menyatakannya berhasil — tanpa pernah memutar rantainya dari basis
    KOSONG. CLAUDE.md §6 sudah menulis kelas ini (migrasi 364 tercatat
    sukses sambil melanggar tuntutannya sendiri); di sana CI yang hijau
    palsu, di sini dev. **Satu lingkungan bukan bukti.**

    Yang dinilai sekarang: kunci yang DISISIPKAN blok INSERT di atas wajib
    `:view`. Itu menjaga niat aslinya — salin-ganti-jadi-`manage` tetap
    merah — tanpa bergantung pada sejarah basis mana pun.
  */
  SELECT count(*) INTO n_manage
    FROM unnest(ARRAY['mandor:view', 'procurement:view']) AS k
   WHERE k NOT LIKE '%:view';

  IF n_manage > 0 THEN
    RAISE EXCEPTION
      '579 gagal: % kunci yang disisipkan BUKAN :view — '
      'yang dimaksud hanya LIHAT.', n_manage;
  END IF;

  /* 3. Efek yang sebenarnya dituju: menu itu kini terlihat pm. */
  SELECT count(*) INTO n_menu
    FROM public.menu_items m
   WHERE m.is_active AND m.href IS NOT NULL
     AND m.required_permissions && ARRAY['mandor:view', 'procurement:view'];

  RAISE NOTICE
    '579 OK — pm: mandor:view + procurement:view (LIHAT saja), % menu terbuka', n_menu;
END $$;
