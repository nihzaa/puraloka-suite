-- ============================================================================
-- 513 · Dua tabel yang migrasi 511 buat jadi tak terbaca siapa pun
-- ============================================================================
--
-- ══════════════════════════════════════════════════════════════════════════
-- SAYA MENGULANGI CACAT YANG SAYA SENDIRI TULIS PERINGATANNYA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Migrasi 510 memuat paragraf panjang tentang cacat migrasi 149: policy
-- RESTRICTIVE tanpa satu pun PERMISSIVE membuat tabel tak terbaca SIAPA PUN,
-- karena himpunan permissive yang kosong bernilai FALSE. Gejalanya "halaman
-- kosong tanpa error" — kegagalan yang paling lama dilacak di repo ini.
--
-- Lalu migrasi 511 melakukannya lagi, pada dua tabel:
--
--     penawaran           0 baris terbaca (0 baris isi)
--     pengingat_asisten   0 baris terbaca (1 baris isi)
--
-- Sebabnya halus, dan layak dicatat supaya tak terulang ketiga kalinya.
-- Keduanya SUDAH punya policy bernama `tenant_isolation`, tetapi dibuat
-- **tanpa `AS RESTRICTIVE`** — jadi ia PERMISSIVE:
--
--     -- migrasi 442, tabel `penawaran`
--     CREATE POLICY tenant_isolation ON penawaran
--       FOR ALL USING (company_id = (SELECT auth_company_id()))
--
--     -- migrasi 414, tabel `pengingat_asisten`
--     CREATE POLICY pengingat_dasar   ON pengingat_asisten FOR ALL USING (true)
--     CREATE POLICY tenant_isolation  ON pengingat_asisten
--       USING (company_id = auth_company_id())
--
-- Migrasi 511 melakukan `DROP POLICY IF EXISTS tenant_isolation` lalu membuat
-- ulang dengan nama yang SAMA sebagai RESTRICTIVE. Untuk `penawaran` itu
-- menghapus satu-satunya permissive yang ada; untuk `pengingat_asisten` ia
-- menghapus salah satu dari dua, dan `pengingat_dasar`… ternyata juga sudah
-- tak ada di basis ini.
--
-- Pemeriksaan 511 tidak menangkapnya karena ia hanya bertanya *"apakah tiap
-- tabel FORCE punya pagar RESTRICTIVE?"* — pertanyaan yang jawabannya YA
-- justru karena kerusakannya. Ia tak pernah bertanya *"apakah masih ada yang
-- bisa membacanya?"*
--
-- ── Pelajaran yang lebih umum
--
-- `DROP POLICY` berdasarkan NAMA berbahaya ketika nama yang sama dipakai untuk
-- dua maksud berbeda di tabel berbeda. `tenant_isolation` dipakai 244 tabel
-- sebagai RESTRICTIVE, dan di sedikit tabel sebagai PERMISSIVE — dan nama itu
-- tak memberi tahu yang mana.
--
-- ══════════════════════════════════════════════════════════════════════════
-- YANG DILAKUKAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- Kedua tabel diberi policy PERMISSIVE pemberi-akses, sementara pagar
-- RESTRICTIVE dari 511 tetap di tempatnya. Pembagian perannya sama dengan
-- 244 tabel lain di basis ini:
--
--     PERMISSIVE  → siapa boleh masuk       (digabung OR)
--     RESTRICTIVE → dari tenant mana        (digabung AND)
--
-- Bentuk permissive-nya sengaja `true`, bukan pemeriksaan izin. Alasannya:
-- keduanya TIDAK punya gerbang izin sebelum ini (`pengingat_dasar` memang
-- `USING (true)`), jadi menambahkan pemeriksaan izin di sini bukan memulihkan
-- keadaan semula melainkan mengubah perilaku — dan perubahan otorisasi harus
-- lahir dari keputusan, bukan dari perbaikan cacat. Isolasi tenant-nya tetap
-- dijamin lapis RESTRICTIVE.
--
-- ── Idempoten: DROP IF EXISTS sebelum CREATE.
-- ============================================================================

DO $$
DECLARE
  t        text;
  n_pasang int := 0;
  n_buntu  int;
BEGIN
  FOREACH t IN ARRAY ARRAY['penawaran', 'pengingat_asisten'] LOOP
    /* Lewati kalau tabelnya belum ada — replay CI di basis lain. */
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_akses', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
      t || '_akses', t);
    n_pasang := n_pasang + 1;
  END LOOP;

  -- ── VERIFIKASI ────────────────────────────────────────────────────────

  /*
    Pertanyaan yang 511 LUPA tanyakan: adakah tabel di-FORCE yang tak bisa
    dibaca siapa pun?

    Dinyatakan atas SELURUH basis, bukan atas dua tabel di atas — kalau ada
    yang ketiga, ini yang memberi tahu sekarang.
  */
  SELECT count(*) INTO n_buntu
    FROM pg_class cl
   WHERE cl.relnamespace = 'public'::regnamespace
     AND cl.relkind = 'r'
     AND cl.relforcerowsecurity
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = cl.relname
          AND p.permissive = 'PERMISSIVE');
  IF n_buntu > 0 THEN
    RAISE EXCEPTION
      '513 gagal: % tabel di-FORCE tanpa satu pun policy PERMISSIVE — tak terbaca siapa pun (cacat 149)',
      n_buntu;
  END IF;

  /*
    Dan pagar tenant-nya WAJIB tetap ada. Memulihkan keterbacaan tak boleh
    dibayar dengan membuka isolasi.
  */
  SELECT count(*) INTO n_buntu
    FROM pg_class cl
   WHERE cl.relnamespace = 'public'::regnamespace
     AND cl.relkind = 'r'
     AND cl.relforcerowsecurity
     AND EXISTS (SELECT 1 FROM information_schema.columns co
                  WHERE co.table_schema = 'public' AND co.table_name = cl.relname
                    AND co.column_name = 'company_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = cl.relname
                        AND p.permissive = 'RESTRICTIVE'
                        AND p.qual ~ 'company_id|auth_company_id|is_member_of');
  IF n_buntu > 0 THEN
    RAISE EXCEPTION '513 gagal: % tabel kehilangan pagar tenant', n_buntu;
  END IF;

  RAISE NOTICE
    '513 OK: % policy akses dipasang; nol tabel FORCE buntu, nol tanpa pagar',
    n_pasang;
END $$;
