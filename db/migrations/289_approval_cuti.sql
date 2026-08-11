-- ════════════════════════════════════════════════════════════════════════════
-- 289 — Rantai persetujuan untuk CUTI KARYAWAN (G2d)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- Versi pertama `POST /sdm/cuti/:id/putuskan` menulis `diputuskan_oleh`
-- langsung, dan `audit-approval-satu-pintu.mjs` merahkannya.
--
-- Penjaga itu benar, dan alasannya lebih tajam daripada RMP (G1e): **cuti
-- TANPA GAJI memotong gaji**, dan sebagian perusahaan menuntut cuti panjang
-- disetujui berjenjang — atasan langsung lalu HRD. Menulis kolomnya langsung
-- membuat rantai dua langkah lolos dengan satu ketukan, sementara halaman
-- pengaturannya tetap menampilkan dua.
--
-- ── Kenapa `min_amount` NULL
--
-- Cuti tak bernominal rupiah. Yang berjenjang adalah KEWENANGAN atas hak
-- karyawan, bukan besaran — pola yang sama dengan `submittal`,
-- `lessons_learned`, dan `rencana_mutu`.
--
-- ── Kenapa `sdm:cuti:approve`, bukan permission baru
--
-- Permission itu sudah dibuat migrasi 288 dan sudah dipakai `requirePermission`
-- di rutenya. Membuat permission kedua untuk hal yang sama menghasilkan dua
-- kebenaran tentang siapa berwenang — dan dua kebenaran cepat atau lambat
-- berbeda.
--
-- ── Idempoten
--
-- `WHERE NOT EXISTS` pada keduanya. `JOIN companies` mencegah kegagalan FK
-- dari `approval_chains` yang menunjuk company terhapus (pelajaran 282).
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO approval_chains (entity_type, label, is_active, company_id)
SELECT DISTINCT 'cuti_karyawan', 'Cuti Karyawan', TRUE, ch.company_id
  FROM approval_chains ch
  JOIN companies co ON co.id = ch.company_id
 WHERE NOT EXISTS (
   SELECT 1 FROM approval_chains x
    WHERE x.entity_type = 'cuti_karyawan' AND x.company_id = ch.company_id
 );

INSERT INTO approval_steps (chain_id, level, required_permission, min_amount, label, company_id)
SELECT ch.id, 1, 'sdm:cuti:approve', NULL, 'Persetujuan cuti', ch.company_id
  FROM approval_chains ch
 WHERE ch.entity_type = 'cuti_karyawan'
   AND NOT EXISTS (
     SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id AND st.level = 1
   );

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_rantai INT;
  n_langkah INT;
  n_kosong INT;
BEGIN
  SELECT count(*) INTO n_rantai FROM approval_chains WHERE entity_type = 'cuti_karyawan';
  IF n_rantai = 0 THEN
    RAISE EXCEPTION '289 gagal: tak ada rantai approval cuti_karyawan terbentuk';
  END IF;

  SELECT count(*) INTO n_langkah
    FROM approval_steps st JOIN approval_chains ch ON ch.id = st.chain_id
   WHERE ch.entity_type = 'cuti_karyawan';
  IF n_langkah = 0 THEN
    RAISE EXCEPTION '289 gagal: rantai cuti_karyawan ada tapi NOL langkah';
  END IF;

  -- Rantai tanpa langkah = `evaluateEntityApproval` mengembalikan `no_steps`,
  -- dan SETIAP persetujuan ditolak dengan pesan konfigurasi. Halaman terlihat
  -- rusak padahal yang kurang cuma satu baris seed (pelajaran 282).
  SELECT count(*) INTO n_kosong
    FROM approval_chains ch
   WHERE ch.entity_type = 'cuti_karyawan'
     AND NOT EXISTS (SELECT 1 FROM approval_steps st WHERE st.chain_id = ch.id);
  IF n_kosong > 0 THEN
    RAISE EXCEPTION '289 gagal: % rantai cuti_karyawan tanpa satu pun langkah', n_kosong;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'sdm:cuti:approve') THEN
    RAISE EXCEPTION '289 gagal: permission sdm:cuti:approve tak ada (migrasi 288 belum jalan?)';
  END IF;

  RAISE NOTICE '289 OK — % rantai cuti_karyawan, % langkah', n_rantai, n_langkah;
END $$;
