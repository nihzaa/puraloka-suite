-- ============================================================================
-- 580 — R-010: tenant baru lahir TANPA rantai approval — dan 2 tenant yang ada
-- ============================================================================
--
-- ── Cacat produksi, dan cakupannya lebih luas dari yang tercatat
--
-- R-010 (dibuka 2026-08-05) mencatat `submittal` lahir tanpa rantai di tenant
-- baru, dan menutup entrinya dengan peringatan jujur: *"Perlu diperiksa mana
-- saja yang di-seed per-company lewat migrasi… BELUM diperiksa — jangan
-- diasumsikan hanya submittal."*
--
-- Diperiksa 2026-09-14. Peringatan itu benar:
--
--     entity_type          company punya rantai
--     submittal                787
--     back_charge              786
--     klaim_perjalanan         786
--     opname_bersama           786
--     change_order               1   <-- hanya tenant pertama
--     cuti_karyawan              1
--     estimate_version           1
--     kasbon                     1
--     lessons_learned            1
--     material_request           1
--     project_expense            1
--     purchase_order             1
--     rencana_mutu               1
--
-- **Sembilan dari tiga belas jenis hanya ada di tenant pertama.** Dua tenant
-- nyata lain (`PT Puraloka Nusantara`, `PT Puraloka Properti`) punya 4 dari
-- 13.
--
-- ── Akibatnya, dan kenapa tak bergejala sebagai "kurang konfigurasi"
--
-- `canParticipateInChain()` fail-closed (approval.ts:199):
--
--     if (steps.length === 0) return { ok: false }
--
-- Fail-closed itu BENAR — ember [C], jangan dilonggarkan. Tetapi rantai yang
-- TAK ADA karena itu berarti **nol orang** bisa menyetujui: kasbon, PO,
-- estimasi, cuti, change order di dua tenant itu tak bisa diputuskan
-- siapa pun, termasuk pemiliknya sendiri. Gejalanya `403` untuk semua orang,
-- bukan pesan yang menjelaskan konfigurasinya kurang.
--
-- ── Dua hal yang dikerjakan berkas ini
--
-- 1. TRIGGER `AFTER INSERT ON companies` — tenant BARU otomatis dapat
--    ketiga belas rantai + langkahnya. Menutup lubangnya untuk SEMUA jalur
--    pembuatan (UI, skrip, seed, test), bukan hanya jalur aplikasi.
-- 2. BACKFILL untuk company yang sudah ada dan kekurangan.
--
-- Ini usul (1) dari R-010, dan alasannya dipilih di atas (2) tertulis di
-- sana: *"jalur pembuatan lain (skrip, seed) bisa melewatinya"*. Usul (3)
-- — penjaga CI — dipasang terpisah sebagai `audit-rantai-approval-lengkap`.
--
-- ── ⚠ Cetakannya DIBACA dari tenant lengkap, bukan ditulis tangan
--
-- Menulis ulang 13 pasangan (entity_type, izin) dari ingatan adalah cara
-- paling mudah membuat tenant baru punya rantai yang MIRIP tapi tak sama —
-- dan izin yang meleset satu huruf menghasilkan rantai yang tak seorang pun
-- bisa penuhi, gejalanya identik dengan rantai yang hilang.
--
-- Karena itu cetakannya dibaca dari `approval_chains` + `approval_steps`
-- milik tenant yang lengkap, lewat tabel CETAKAN yang dibuat di sini.
-- ============================================================================

/*
  Tabel cetakan: sumber kebenaran untuk rantai bawaan tenant baru.

  Dibuat sebagai TABEL, bukan dikeraskan di badan trigger — supaya menambah
  jenis approval baru kelak cukup satu INSERT, tak perlu mengganti fungsi
  yang dipakai seluruh tenant.
*/
CREATE TABLE IF NOT EXISTS public.approval_chain_template (
  entity_type          text PRIMARY KEY,
  label                text NOT NULL,
  level                int  NOT NULL DEFAULT 1,
  required_permission  text NOT NULL,
  step_label           text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.approval_chain_template IS
  'Cetakan rantai approval untuk tenant BARU (R-010, migrasi 580). '
  'Dipakai trigger trg_company_rantai_approval. Menambah jenis approval '
  'baru: INSERT ke sini, bukan mengubah fungsi triggernya.';

/* Diisi dari tenant yang rantainya LENGKAP — bukan ditulis tangan. */
INSERT INTO public.approval_chain_template
  (entity_type, label, level, required_permission, step_label)
SELECT ch.entity_type, ch.label, s.level, s.required_permission, s.label
  FROM public.approval_chains ch
  JOIN public.approval_steps s ON s.chain_id = ch.id
 WHERE ch.company_id = (
   SELECT id FROM public.companies WHERE code = 'puraloka-persada'
 )
ON CONFLICT (entity_type) DO NOTHING;

-- ─── Fungsi + trigger ───────────────────────────────────────────────────────
/*
  ⚠ TANPA `public.` — skema yang dipaku membuat perbaikan tak pernah sampai
  ke schema `test`, sehingga tak bisa diverifikasi test apa pun (pelajaran
  migrasi 165, dan dijaga `audit-migrasi-skema-dipaku.mjs`).
*/
CREATE OR REPLACE FUNCTION fn_company_rantai_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  t   RECORD;
  cid UUID;
BEGIN
  FOR t IN SELECT * FROM public.approval_chain_template LOOP
    INSERT INTO public.approval_chains (company_id, entity_type, label, is_active)
    VALUES (NEW.id, t.entity_type, t.label, true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO cid;

    /*
      `cid` NULL berarti rantainya sudah ada (ON CONFLICT) — ambil id-nya,
      supaya langkahnya tetap terpasang. Tanpa ini, tenant yang sudah punya
      rantai tapi belum punya LANGKAH tetap fail-closed: rantai kosong dan
      rantai tak ada memberi hasil yang sama.
    */
    IF cid IS NULL THEN
      SELECT id INTO cid FROM public.approval_chains
       WHERE company_id = NEW.id AND entity_type = t.entity_type;
    END IF;

    INSERT INTO public.approval_steps
      (chain_id, level, required_permission, min_amount, label, company_id)
    VALUES (cid, t.level, t.required_permission, NULL, t.step_label, NEW.id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_company_rantai_approval ON public.companies;
CREATE TRIGGER trg_company_rantai_approval
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION fn_company_rantai_approval();

-- ─── Backfill company yang sudah ada ────────────────────────────────────────
--
-- Trigger hanya menutup yang LAHIR sesudahnya. Dua tenant nyata sudah
-- terlanjur kekurangan 9 jenis, dan membiarkannya berarti cacatnya tetap
-- hidup di tempat yang justru dipakai.
DO $$
DECLARE
  co  RECORD;
  t   RECORD;
  cid UUID;
BEGIN
  FOR co IN SELECT id FROM public.companies WHERE is_active LOOP
    FOR t IN SELECT * FROM public.approval_chain_template LOOP
      INSERT INTO public.approval_chains (company_id, entity_type, label, is_active)
      VALUES (co.id, t.entity_type, t.label, true)
      ON CONFLICT DO NOTHING;

      SELECT id INTO cid FROM public.approval_chains
       WHERE company_id = co.id AND entity_type = t.entity_type;

      INSERT INTO public.approval_steps
        (chain_id, level, required_permission, min_amount, label, company_id)
      VALUES (cid, t.level, t.required_permission, NULL, t.step_label, co.id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa TIGA arah. Yang pertama saja tak cukup: rantai yang ADA tetapi
-- tanpa LANGKAH tetap fail-closed — `steps.length === 0` memberi hasil yang
-- sama persis dengan rantai yang hilang.
DO $$
DECLARE
  n_jenis   INT;
  n_kurang  INT;
  n_kosong  INT;
BEGIN
  SELECT count(*) INTO n_jenis FROM public.approval_chain_template;
  IF n_jenis = 0 THEN
    RAISE NOTICE '580: cetakan kosong (tenant utama tak ada) — DILEWATI';
    RETURN;
  END IF;

  /* 1. Tiap company aktif punya SELURUH jenis. */
  SELECT count(*) INTO n_kurang
    FROM public.companies co
    CROSS JOIN public.approval_chain_template t
   WHERE co.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.approval_chains ch
        WHERE ch.company_id = co.id AND ch.entity_type = t.entity_type);

  IF n_kurang > 0 THEN
    RAISE EXCEPTION '580 gagal: % (company × jenis) masih tanpa rantai', n_kurang;
  END IF;

  /* 2. Tiap rantai punya minimal SATU langkah — rantai kosong = fail-closed. */
  SELECT count(*) INTO n_kosong
    FROM public.approval_chains ch
    JOIN public.companies co ON co.id = ch.company_id
   WHERE co.is_active
     AND NOT EXISTS (SELECT 1 FROM public.approval_steps s WHERE s.chain_id = ch.id);

  IF n_kosong > 0 THEN
    RAISE EXCEPTION
      '580 gagal: % rantai TANPA langkah — nol orang bisa menyetujui, dan '
      'gejalanya sama persis dengan rantai yang hilang.', n_kosong;
  END IF;

  /* 3. Triggernya terpasang — tanpa ini tenant BERIKUTNYA lahir cacat lagi. */
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.companies'::regclass
       AND tgname = 'trg_company_rantai_approval' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '580 gagal: trigger trg_company_rantai_approval tak terpasang';
  END IF;

  RAISE NOTICE '580 OK — % jenis rantai · seluruh company aktif lengkap · trigger terpasang', n_jenis;
END $$;
