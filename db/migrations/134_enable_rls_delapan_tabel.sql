-- ============================================================
-- 134 — AKTIFKAN RLS pada 8 tabel yang policy-nya sudah ada tapi tak berlaku
--
-- BUG NYATA, ditemukan CI — bukan kerapian. Di database yang dibangun BERSIH
-- dari migrasi (yaitu: produksi masa depan), kedelapan tabel ini punya policy
-- lengkap (dari 130 & 131) tetapi `relrowsecurity = false`. Policy yang
-- terpasang di tabel tanpa RLS **tidak dievaluasi sama sekali** — ia terlihat
-- ada di `pg_policies`, terbaca benar saat review, dan menjaga persis nol.
--
-- Gejalanya di CI: uji kill-switch melaporkan `rab_items` milik tenant lain
-- BOCOR — dan itu memang benar-benar bocor. Bukan test yang rewel.
--
-- KENAPA TIDAK KETAHUAN DI DEV: dev punya `rls_auto_enable()` (fungsi yang
-- hanya ada di dev, terkonfirmasi schema-diff) sehingga tabel-tabel ini sudah
-- ter-RLS sejak lama lewat jalur di luar migrasi. Migrasi 130 karena itu
-- MENGASUMSIKAN RLS sudah menyala dan hanya menambahkan policy. Asumsi itu
-- benar di dev dan salah di mana pun selain dev.
--
-- Inilah alasan CI dijalankan terhadap database yang dibangun bersih dari
-- migrasi: perbedaan antara "berlaku di dev" dan "berlaku dari migrasi" adalah
-- persis kelas bug yang tak bisa dilihat dari dev.
--
-- AMAN dijalankan di dev (idempoten — `ENABLE` pada tabel yang sudah aktif
-- tidak berefek) dan di database bersih (di situlah ia bekerja).
--
-- URUTAN PENTING: policy-nya sudah ada lebih dulu (130 & 131). Menyalakan RLS
-- pada tabel TANPA policy permissive akan mematikan tabelnya total (T1-F3),
-- jadi migrasi ini WAJIB sesudah 130 — bukan sebelum.
-- ============================================================

ALTER TABLE rab_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rab_schedule          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rab_absorption_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_scope_item_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profile       ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Verifikasi 1 — tak ada tabel ber-policy yang RLS-nya mati.
--
-- Ini generalisasi dari bug di atas: policy tanpa RLS = penjaga yang tampak ada
-- tapi tak pernah bertugas. Diperiksa untuk SELURUH tabel, bukan hanya delapan
-- ini, supaya kasus berikutnya ketahuan di migrasi — bukan di CI, apalagi
-- di produksi.
-- ------------------------------------------------------------
DO $$
DECLARE v_mati TEXT;
BEGIN
  SELECT string_agg(DISTINCT p.tablename, ', ' ORDER BY p.tablename) INTO v_mati
    FROM pg_policies p
    JOIN pg_class ct   ON ct.relname = p.tablename
    JOIN pg_namespace n ON n.oid = ct.relnamespace AND n.nspname = 'public'
   WHERE p.schemaname = 'public' AND ct.relkind = 'r' AND NOT ct.relrowsecurity;

  IF v_mati IS NOT NULL THEN
    RAISE EXCEPTION
      '134: tabel ini punya policy tapi RLS-nya MATI, jadi policy-nya tidak '
      'dievaluasi sama sekali: %. Nyalakan RLS-nya, atau buang policy-nya bila '
      'memang tak dimaksudkan berlaku.', v_mati;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Verifikasi 2 — kebalikannya: tak ada tabel ber-RLS tanpa policy permissive.
--
-- Dijaga di sini juga karena migrasi ini MENYALAKAN RLS: kalau salah satu dari
-- delapan tabel di atas ternyata tak punya policy permissive, ia berubah dari
-- "terbuka" menjadi "mati total" — kegagalan yang justru diakibatkan perbaikan
-- ini. Lebih baik migrasinya batal daripada tabelnya senyap tak terbaca.
-- ------------------------------------------------------------
DO $$
DECLARE v_sisa TEXT;
BEGIN
  SELECT string_agg(ct.relname, ', ' ORDER BY ct.relname) INTO v_sisa
    FROM pg_class ct JOIN pg_namespace n ON n.oid = ct.relnamespace
   WHERE n.nspname = 'public' AND ct.relkind = 'r' AND ct.relrowsecurity
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = ct.relname
          AND p.permissive = 'PERMISSIVE');

  IF v_sisa IS NOT NULL THEN
    RAISE EXCEPTION
      '134: RLS menyala tapi tanpa policy PERMISSIVE di: %. Restrictive di-AND '
      'dengan OR himpunan kosong = FALSE — tabelnya tak terbaca siapa pun '
      '(T1-F3).', v_sisa;
  END IF;
  RAISE NOTICE '134: RLS aktif di seluruh tabel ber-policy.';
END $$;
