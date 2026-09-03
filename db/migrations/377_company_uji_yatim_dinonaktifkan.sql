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

UPDATE public.companies
   SET is_active = false
 WHERE is_active
   AND NOT EXISTS (
     SELECT 1 FROM public.company_members m WHERE m.company_id = companies.id
   );

DO $$
DECLARE
  n_aktif   int;
  n_yatim   int;
  n_nyata   int;
BEGIN
  SELECT count(*) INTO n_aktif FROM public.companies WHERE is_active;

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
    /*
      "Nol company beranggota" bukan berarti terlalu banyak dimatikan — di
      schema bersih memang tak pernah ada satu pun anggota (nol user → nol
      company_members). Yang dilaporkan bukan akibat migrasi ini.

      Diperbaiki 2026-09-04 bersama 372, sesudah keduanya terkonfirmasi lewat
      CI — bukan lewat penyaring pola, yang sempat menandai 22 kandidat dan
      terbukti memuat palsu. Di sini sumbernya dibaca langsung: `n_nyata`
      menghitung company yang PUNYA ANGGOTA, jadi ia memang bergantung
      fixture. Bandingkan 378/379 (menghitung role template yang dibuat
      migrasinya sendiri) dan 381 (approval_chains miliknya sendiri) —
      ketiganya AMAN dan tak disentuh.

      Penonaktifan company yatim di atas TETAP berjalan; yang dilewati hanya
      pemeriksaan sesudahnya. (kelas 245/250/252/…/366/368/372)
    */
    RAISE NOTICE '377: belum ada company beranggota — pemeriksaan DILEWATI (schema bersih)';
    RETURN;
  END IF;

  RAISE NOTICE '377: % company aktif tersisa (semuanya beranggota) · nol yatim', n_aktif;
END $$;
