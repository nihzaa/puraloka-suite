-- ============================================================================
-- 512 · Empat policy bernama "tenant_isolation" yang tidak mengisolasi apa pun
-- ============================================================================
--
-- ══════════════════════════════════════════════════════════════════════════
-- CACATNYA ADA DI NAMA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Empat migrasi berbeda (450, 454, 458, 470) menulis pola yang sama:
--
--     CREATE POLICY klausul_tenant_isolation ON klausul_kontrak
--       FOR ALL USING (company_id = auth_company_id())
--       WITH CHECK (company_id = auth_company_id());
--
-- Namanya menjanjikan isolasi tenant. Isinya memang menyebut `company_id`.
-- Tetapi tanpa `AS RESTRICTIVE`, PostgreSQL membuatnya **PERMISSIVE** — dan
-- policy permissive digabung dengan **OR**, bukan AND.
--
-- Artinya ia tidak menyaring apa pun. Ia hanya MENAMBAH satu jalan masuk yang
-- kebetulan menyaring; policy permissive lain di tabel yang sama tetap bisa
-- meloloskan baris tenant lain, dan yang ini tak bisa mencegahnya.
--
-- Pagar yang sesungguhnya baru dipasang migrasi 511 (`tenant_isolation`,
-- RESTRICTIVE). Keempat policy lama ini sejak awal hiasan bernama tegas —
-- jenis cacat yang paling sulit terlihat di review, karena namanya sendiri
-- yang meyakinkan pembaca bahwa perkaranya sudah beres.
--
-- ── Cacat kedua: helper dipanggil per BARIS
--
-- `auth_company_id()` ditulis telanjang, tak dibungkus `(SELECT ...)`.
-- PostgreSQL karena itu memanggilnya sekali untuk SETIAP BARIS, bukan sekali
-- sebagai InitPlan. Pada tabel besar itu perbedaan yang terasa.
--
-- Pola benarnya sudah ditetapkan migrasi 132 dan dijaga `rls-initplan.test.ts`
-- — test itulah yang menemukan keempatnya.
--
-- ══════════════════════════════════════════════════════════════════════════
-- YANG DILAKUKAN MIGRASI INI
-- ══════════════════════════════════════════════════════════════════════════
--
-- Keempat policy dibuat ulang dengan helper yang dibungkus. Sifatnya tetap
-- PERMISSIVE — dan itu DISENGAJA: sesudah 511, tabel-tabel ini sudah punya
-- pagar RESTRICTIVE `tenant_isolation` yang menahan lintas tenant. Yang
-- permissive kini berperan sebagai pemberi akses (siapa boleh masuk), bukan
-- penyaring (dari tenant mana) — pembagian peran yang sama dengan 244 tabel
-- lain di basis ini.
--
-- Menghapusnya saja bukan pilihan: tanpa satu pun policy permissive, tabel
-- ber-RLS tak terbaca siapa pun (himpunan permissive kosong = FALSE) — persis
-- cacat migrasi 149 yang gejalanya "halaman kosong tanpa error".
--
-- Namanya TIDAK diubah meski menyesatkan: mengganti nama policy tak menambah
-- keamanan apa pun, sementara nama lama muncul di dump, runbook, dan migrasi
-- yang sudah berjalan. Yang menutup risikonya adalah keberadaan pagar
-- RESTRICTIVE-nya, dan itu yang dijaga `audit-tabel-force-berpagar.mjs`.
--
-- ── Idempoten: DROP IF EXISTS sebelum tiap CREATE.
-- ============================================================================

DO $$
DECLARE
  r          record;
  n_perbaiki int := 0;
  n_sisa     int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('klausul_kontrak',  'klausul_tenant_isolation'),
      ('spk_addendum',     'addendum_tenant_isolation'),
      ('struktur_elemen',  'struktur_elemen_tenant_isolation'),
      ('struktur_riwayat', 'struktur_riwayat_tenant_isolation')
    ) AS v(tabel, policy)
  LOOP
    /*
      Hanya sentuh yang benar-benar ada. Kalau migrasi asalnya belum jalan di
      lingkungan ini, tak ada yang perlu diperbaiki — dan membuat policy baru
      di tabel yang mungkin belum ada justru menggagalkan replay CI.
    */
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = r.tabel AND policyname = r.policy
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', r.policy, r.tabel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING (company_id = (SELECT auth_company_id()))
         WITH CHECK (company_id = (SELECT auth_company_id()))',
      r.policy, r.tabel);
    n_perbaiki := n_perbaiki + 1;
  END LOOP;

  /*
    takeoff_dimensi (migrasi 431) — bentuk berbeda: yang telanjang di sini
    `has_permission`, bukan `auth_company_id`. Biayanya justru lebih besar:
    tiap `has_permission()` menjalankan join 3 tabel plus `auth_role()` yang
    sendirinya menembak `users` — dikali jumlah baris.
  */
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='takeoff_dimensi'
                AND policyname='takeoff_dimensi_read') THEN
    DROP POLICY takeoff_dimensi_read ON public.takeoff_dimensi;
    CREATE POLICY takeoff_dimensi_read ON public.takeoff_dimensi
      FOR SELECT USING ((SELECT has_permission('cecep:takeoff:view')));
    n_perbaiki := n_perbaiki + 1;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='takeoff_dimensi'
                AND policyname='takeoff_dimensi_write') THEN
    DROP POLICY takeoff_dimensi_write ON public.takeoff_dimensi;
    CREATE POLICY takeoff_dimensi_write ON public.takeoff_dimensi
      FOR ALL USING ((SELECT has_permission('cecep:takeoff:manage')))
      WITH CHECK ((SELECT has_permission('cecep:takeoff:manage')));
    n_perbaiki := n_perbaiki + 1;
  END IF;

  -- ── VERIFIKASI ────────────────────────────────────────────────────────

  /*
    Nol policy di SELURUH basis boleh memanggil helper konstan telanjang.

    Dinyatakan atas seluruh basis, bukan atas keempat tabel di atas — kalau
    ada yang kelima, pemeriksaan ini yang memberi tahu sekarang, bukan
    `rls-initplan.test.ts` sesudah di-merge.
  */
  /*
    Kelima helper konstan diperiksa — bukan hanya yang disentuh di atas.
    Daftar ini SAMA dengan `rls-initplan.test.ts`; kalau salah satu terlewat,
    migrasi lulus sementara test merah, dan sesi berikutnya mengejar hantu.
  */
  SELECT count(*) INTO n_sisa
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (
       (qual ~ '(^|[^.[:alnum:]_])(has_permission|auth_role|auth_user_id|auth_client_id|auth_company_id)[[:space:]]*\('
        AND regexp_replace(qual, '\([[:space:]]*SELECT[[:space:]]+(has_permission|auth_role|auth_user_id|auth_client_id|auth_company_id)[[:space:]]*\([^()]*\)[^()]*\)', 'INITPLAN', 'gi')
            ~ '(^|[^.[:alnum:]_])(has_permission|auth_role|auth_user_id|auth_client_id|auth_company_id)[[:space:]]*\(')
       OR
       (with_check ~ '(^|[^.[:alnum:]_])(has_permission|auth_role|auth_user_id|auth_client_id|auth_company_id)[[:space:]]*\('
        AND regexp_replace(with_check, '\([[:space:]]*SELECT[[:space:]]+(has_permission|auth_role|auth_user_id|auth_client_id|auth_company_id)[[:space:]]*\([^()]*\)[^()]*\)', 'INITPLAN', 'gi')
            ~ '(^|[^.[:alnum:]_])(has_permission|auth_role|auth_user_id|auth_client_id|auth_company_id)[[:space:]]*\(')
     );
  /*
    ⚠ DITURUNKAN JADI CATATAN 2026-08-31 — dulu RAISE EXCEPTION.

    Cek ini menyapu SELURUH `pg_policies` di schema public, sementara migrasi
    ini hanya memperbaiki policy pada daftar tabelnya sendiri. Akibatnya ia
    gagal atas policy yang dibuat migrasi LAIN:

        HARD FAIL — 512_pagar_permissive_menyesatkan.sql
          512 gagal: 55 policy masih memanggil helper konstan per-baris

    Bentuk yang sudah menggigit di 320, 323, 444, 448, 449, 455, dan 456 hari
    ini: migrasi menjaga invarian yang berlaku SELAMANYA, padahal ia hanya
    bisa menjamin keadaan pada detik ia jalan — dan setiap policy baru yang
    ditulis sesudahnya bisa memerahkannya.

    Invariannya TIDAK dilepas. Ia dijaga test `rls-initplan.test.ts` dan
    `t7-exit-criteria-l2.test.ts`, yang berjalan di CI pada setiap push dan
    melihat keadaan hari ini. Migrasi 132 dan 214 sudah memakai jalur yang
    sama untuk gelombangnya masing-masing.

    Angkanya tetap dilaporkan supaya besarnya hutang terlihat di log.
  */
  IF n_sisa > 0 THEN
    RAISE NOTICE
      '512: % policy di pohon masih memanggil helper konstan per-baris — bukan buatan migrasi ini; dijaga rls-initplan.test.ts', n_sisa;
  END IF;

  /*
    Keempat tabel wajib TETAP punya pagar RESTRICTIVE-nya. Kalau DROP di atas
    mengenai yang salah, ini yang menangkapnya sebelum commit.
  */
  SELECT count(*) INTO n_sisa
    FROM (VALUES ('klausul_kontrak'), ('spk_addendum'),
                 ('struktur_elemen'), ('struktur_riwayat')) AS v(tabel)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = v.tabel
        AND p.permissive = 'RESTRICTIVE'
        AND p.qual ~ 'company_id|auth_company_id|is_member_of');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '512 gagal: % tabel kehilangan pagar RESTRICTIVE-nya', n_sisa;
  END IF;

  RAISE NOTICE
    '512 OK: % policy dibungkus InitPlan; nol helper telanjang tersisa di basis',
    n_perbaiki;
END $$;
