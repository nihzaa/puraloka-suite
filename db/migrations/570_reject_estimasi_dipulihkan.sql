-- ============================================================================
-- 570 — Jalur REJECT estimasi dipulihkan: migrasi 111 tercatat jalan, isinya tak ada
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Diukur 2026-09-13, menelusuri dua test merah `estimate-approval`:
--
--   estimate-versions.ts:35    diagram: under_review --reject--> draft
--   estimate-versions.ts:1628  rute /reject ADA dan terdaftar
--   migrasi 111 baris 45-77    "relaksasi: izinkan under_review→draft"
--   schema_migrations          111 TERCATAT SUDAH JALAN
--   pg_proc (public DAN test)  baris reject TIDAK ADA
--
-- Empat sumber menyatakan jalur reject seharusnya ada; hanya basisnya yang
-- tidak. Migrasi 111 memakai `CREATE OR REPLACE FUNCTION` polos — tanpa
-- syarat, tanpa penjaga — jadi ia seharusnya berlaku. Ia tidak.
--
-- Akibatnya di layar: estimasi yang ditolak reviewer TAK BISA kembali ke
-- draft. Rutenya menjawab 500, dan pesannya menuduh transisi tak sah —
-- padahal transisi itu memang dirancang ada. Estimasi yang perlu direvisi
-- tersangkut di `under_review` selamanya.
--
-- ── Kenapa migrasi BARU, bukan mengedit 111
--
-- Mengedit migrasi yang sudah tercatat di `supabase_migrations` adalah
-- Gerbang Keras G-2 (CHARTER): buku itu menentukan apa yang di-replay CI,
-- dan mengubah isinya membuat basis lama & basis baru menyimpang tanpa
-- gejala. Migrasi maju bernomor baru berlaku di keduanya.
--
-- ── Kenapa tak ada yang tahu selama ini
--
-- `ledger-diff.mjs` menyatakan 111 TERCATAT-KONSISTEN. Sebabnya baris 106:
--
--     const adaFungsi = … SELECT 1 FROM pg_proc WHERE proname=$1 …
--
-- Ia memeriksa NAMA fungsi ada, bukan ISI-nya. `CREATE OR REPLACE` yang tak
-- pernah berlaku tetap meninggalkan fungsi bernama sama dari migrasi
-- sebelumnya, jadi verdict "TERBUKTI-FISIK" diberikan atas artefak berisi
-- versi LAMA.
--
-- ⚠ Cakupan cacat pemeriksa itu BELUM diukur: berapa dari 569 migrasi lain
-- yang mengganti ISI fungsi tanpa mengubah namanya, dan karenanya tak
-- terperiksa, adalah pengukuran tersendiri. Dicatat di R-015.
--
-- ── Isi fungsi di bawah DISALIN VERBATIM dari migrasi 111
--
-- Bukan ditulis ulang. Menulis ulang dari ingatan adalah cara paling mudah
-- membuat dua basis yang keduanya "sudah dimigrasi" berperilaku berbeda.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_estimate_version_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'draft'        AND NEW.status = 'under_review')
    OR (OLD.status = 'under_review' AND NEW.status = 'approved')
    OR (OLD.status = 'under_review' AND NEW.status = 'draft')          -- REJECT
    OR (OLD.status = 'approved'     AND NEW.status = 'frozen')
    OR (OLD.status = 'frozen'       AND NEW.status = 'superseded')
    OR (OLD.status = 'approved'     AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'Transisi status Estimate Version tidak sah: % → %. Alur sah: '
      'draft→under_review→approved→frozen→superseded, under_review→draft (reject).',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  IF NEW.status = 'frozen'   AND NEW.frozen_at   IS NULL THEN NEW.frozen_at   := now(); END IF;
  -- Reject: bersihkan jejak approval + metadata approver di baris (jejak level di
  -- approval_progress dibersihkan di layer aplikasi via clearApprovalProgress).
  IF NEW.status = 'draft' THEN
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $function$;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa ISI fungsi, bukan keberadaannya — persis cacat yang membuat
-- migrasi 111 lolos tanpa berlaku. Verifikasi yang cuma menanyakan "fungsinya
-- ada?" akan hijau pada keadaan yang sama salahnya.
DO $$
DECLARE
  n_reject INT;
BEGIN
  SELECT count(*) INTO n_reject
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = current_schema()
     AND p.proname = 'fn_estimate_version_status_transition'
     AND p.prosrc LIKE '%OLD.status = ''under_review'' AND NEW.status = ''draft''%';

  IF n_reject <> 1 THEN
    RAISE EXCEPTION
      '570 gagal: fn_estimate_version_status_transition TIDAK memuat jalur reject '
      '(under_review→draft). Ditemukan % fungsi cocok, seharusnya 1.', n_reject;
  END IF;

  RAISE NOTICE '570 OK — jalur reject estimasi (under_review→draft) pulih di public';
END $$;
