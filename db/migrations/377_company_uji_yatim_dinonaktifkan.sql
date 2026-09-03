-- ============================================================================
-- 377 — Company uji tanpa anggota: dinonaktifkan, bukan dihapus
-- ============================================================================
--
-- ── Ketahuan dari `submittal-aturan` yang merah
--
--     ada company tanpa rantai submittal — pengajuannya tak bisa diputuskan
--     expected 2 to be 0
--
-- Kedua company itu:
--
--     [UJI-RUTE] Tenant Lain     anggota=false
--     [UJI-S1] Tenant Lain       anggota=false
--
-- Sampah dari test isolasi tenant yang membuat company baru tiap jalan lalu
-- tak membersihkannya. Diukur 2026-08-14: `companies` berisi 291 baris, dan
-- yang punya anggota **satu**.
--
-- ── Kenapa ini bukan sekadar berisik
--
-- Penjaga seperti `submittal-aturan` bertanya "adakah company AKTIF tanpa
-- rantai persetujuan?" — pertanyaan yang benar, karena company aktif tanpa
-- rantai berarti pengajuannya tak bisa diputuskan siapa pun. Sampah uji
-- membuatnya menjawab "ada 2" selamanya, dan penjaga yang selalu merah
-- berhenti dibaca.
--
-- Itu pola yang sudah muncul dua kali hari ini: `rls-initplan` yang merah
-- berbulan-bulan tanpa ada yang membacanya, dan sepuluh policy per-baris yang
-- lolos karenanya.
--
-- ── DINONAKTIFKAN, bukan DIHAPUS
--
-- CLAUDE.md §8a.5: "dummy bukan izin untuk merusak" — menghapus data yang
-- sudah ada tetap butuh konfirmasi founder. Menonaktifkan mencapai tujuan yang
-- sama (penjaga berhenti melihatnya) tanpa membuang apa pun yang tak bisa
-- dikembalikan.
--
-- Syaratnya "tak punya anggota", BUKAN "namanya diawali [UJI". Menyaring
-- berdasarkan nama berarti test berikutnya yang memakai pola nama lain akan
-- lolos — keanggotaan adalah fakta, nama hanya kebiasaan. Alasan yang sama
-- sudah dipakai migrasi 365 saat memilih tenant penerima salinan role.
--
-- ⚠ Company `Puraloka Persada` (26 anggota) TIDAK tersentuh — syaratnya
-- menjamin itu, dan blok verifikasi membuktikannya.
-- ============================================================================

-- ⚠ TIDAK berbuat apa-apa bila basis belum punya SATU PUN anggota.
--
-- Maksud migrasi ini menyapu company UJI yang yatim — dan itu hanya bermakna
-- bila ada company NYATA sebagai pembandingnya. Di schema bersih tak ada
-- anggota sama sekali (nol user → nol company_members), sehingga `NOT EXISTS`
-- benar untuk SEMUA company, termasuk satu-satunya yang dibuat migrasi 126.
--
-- Akibatnya beruntun dan sulit dilacak: `companies WHERE is_active` jadi 0,
-- migrasi 398 tak menyemai ambang EVM, dan pagarnya gagal dengan
--
--     398 gagal: value_type ambang EVM = "<NULL>", harus "number"
--
-- — galat yang menuduh TIPE DATA, dua puluh migrasi jauhnya dari sebabnya.
--
-- Ini berbeda dari pagar-pagar yang diperbaiki sebelumnya: yang itu salah
-- MELAPOR, yang ini MENGUBAH KEADAAN. Diperbaiki 2026-09-04 atas keputusan
-- founder; menyempitkan, tak mengubah perilaku di basis berisi data.
UPDATE public.companies
   SET is_active = false
 WHERE is_active
   AND NOT EXISTS (
     SELECT 1 FROM public.company_members m WHERE m.company_id = companies.id
   )
   AND EXISTS (SELECT 1 FROM public.company_members);

DO $$
DECLARE
  n_aktif   int;
  n_yatim   int;
  n_nyata   int;
BEGIN
  SELECT count(*) INTO n_aktif FROM public.companies WHERE is_active;

  -- Penonaktifan di atas SENGAJA tak berjalan bila basis nol anggota, jadi
  -- pemeriksaan di bawah pun tak berlaku: company yatim memang masih ada,
  -- dan itu yang diinginkan. Syaratnya dibuat SAMA PERSIS dengan syarat
  -- penonaktifannya — dua syarat berbeda untuk satu hal adalah cacat yang
  -- baru saja diperbaiki di migrasi 250 dan 252.
  IF NOT EXISTS (SELECT 1 FROM public.company_members) THEN
    RAISE NOTICE '377: basis belum punya anggota — penyapuan & pemeriksaan DILEWATI (schema bersih)';
    RETURN;
  END IF;

  -- Nol company aktif tanpa anggota.
  SELECT count(*) INTO n_yatim
    FROM public.companies co
   WHERE co.is_active
     AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = co.id);
  IF n_yatim > 0 THEN
    RAISE EXCEPTION '377 gagal: masih % company aktif tanpa anggota', n_yatim;
  END IF;

  -- Company NYATA wajib tetap aktif. Kalau syaratnya sampai salah dan ia ikut
  -- dimatikan, seluruh aplikasi berhenti — dan gejalanya "tak ada data"
  -- alih-alih galat.
  SELECT count(*) INTO n_nyata
    FROM public.companies co
   WHERE co.is_active
     AND EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = co.id);
  IF n_nyata = 0 THEN
    -- Tak terjangkau bila basis nol anggota — blok itu sudah RETURN di
    -- atas. Pagar ini tetap utuh untuk basis berisi data, yang justru
    -- keadaan yang ingin dijaganya.
    RAISE EXCEPTION '377 gagal: NOL company beranggota yang masih aktif — terlalu banyak dimatikan';
  END IF;

  RAISE NOTICE '377: % company aktif tersisa (semuanya beranggota) · nol yatim', n_aktif;
END $$;
