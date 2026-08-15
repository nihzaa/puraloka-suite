-- ============================================================================
-- 393 — Kredensial boleh DIWARISI dari induk grup (per anak, bisa dimatikan)
-- ============================================================================
--
-- ── Yang ditanyakan founder
--
-- *"biar api key nya bisa terpisah untuk masing-masing tenant gimana? dan yg
-- ada sekarang api key nya untuk puraloka saja dan perusahaan dibawah grup
-- nya"* — lalu, saat ditawari pilihan: *"bisa di aktifkan jika ditanggung grup
-- bisa juga anak grup pake api sendiri"*.
--
-- Jawabannya menentukan bentuk migrasi ini: pewarisan harus punya SAKLAR,
-- bukan otomatis mutlak.
--
-- ── Apa yang sudah ada, dan apa yang belum
--
-- Diukur 2026-08-14:
--
--     app_credentials  UNIQUE(company_id, kunci)  → sudah per-tenant
--     UI Pengaturan → Kredensial                  → sudah ada
--     companies.parent_company_id                 → sudah ada
--     kredensial mewarisi dari induk              → TIDAK ADA
--
-- Jadi kunci per-tenant memang sudah didukung sejak awal. Yang belum: anak
-- perusahaan yang belum mengisi kunci sendiri tidak melihat kunci induknya.
--
-- ── Kenapa itu penting, padahal hari ini "kebetulan jalan"
--
-- Hari ini anak perusahaan tanpa kunci sendiri jatuh ke `.env` server — dan
-- karena `.env` itu milik founder, hasilnya kebetulan benar untuk grup
-- Puraloka.
--
-- Tetapi mekanismenya salah. Jatuhan `.env` berlaku untuk SEMUA tenant,
-- termasuk perusahaan lain yang kelak jadi pelanggan SaaS — mereka pun akan
-- memakai kunci founder tanpa pernah menjadi bagian grupnya. Grup harus
-- berbagi kunci KARENA SATU GRUP, bukan karena kebetulan satu server.
--
-- ── Urutan pencarian sesudah migrasi ini
--
--     1. kunci milik tenant sendiri        → SELALU MENANG
--     2. kunci induk (bila saklar ON)      → tagihan ke induk
--     3. jatuhan `.env` (hanya grup AI)    → jaring pengaman satu-instalasi
--
-- Langkah 1 di atas segalanya: anak yang mengisi kuncinya sendiri langsung
-- berhenti memakai kunci induk, tanpa perlu saklar apa pun diubah. Itu yang
-- membuat "anak grup pake api sendiri" bekerja tanpa konfigurasi tambahan.
--
-- ── Kenapa default TRUE
--
-- Founder menyatakan keadaan grupnya hari ini: satu kunci menanggung Puraloka
-- dan perusahaan di bawahnya. Default `false` akan MEMATIKAN AI untuk seluruh
-- anak perusahaan begitu jatuhan `.env` kelak dicabut — perubahan perilaku
-- yang diselundupkan lewat migrasi.
--
-- Yang memilih `false` adalah anak perusahaan yang ingin menanggung tagihannya
-- sendiri, lewat UI, sadar.
--
-- ⚠ Kolom ini TIDAK berlaku untuk perusahaan induk (parent_company_id NULL) —
-- tak ada yang bisa diwarisi. Disimpan tetap TRUE di sana supaya tak ada yang
-- menafsirkannya sebagai "induk mewarisi dari suatu tempat".
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS warisi_kredensial_induk boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.warisi_kredensial_induk IS
  'Anak grup memakai kredensial induk bila belum punya sendiri. Kunci milik '
  'tenant sendiri SELALU menang. Diatur per anak lewat UI — false berarti '
  'perusahaan ini menanggung kuncinya sendiri.';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_kolom  int;
  n_null   int;
  n_anak   int;
BEGIN
  SELECT count(*) INTO n_kolom
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'companies'
     AND column_name = 'warisi_kredensial_induk';
  IF n_kolom = 0 THEN
    RAISE EXCEPTION '393 gagal: kolom warisi_kredensial_induk tidak terbentuk';
  END IF;

  /*
    NOT NULL diperiksa lewat DATANYA, bukan lewat definisi kolomnya.

    Kolom nullable membuat pewarisan punya keadaan KETIGA — "belum
    diputuskan" — dan kode yang membacanya harus menebak artinya. Tebakan itu
    yang menentukan apakah tagihan jatuh ke induk atau AI mati; tak boleh ada
    yang menebaknya.
  */
  SELECT count(*) INTO n_null
    FROM public.companies WHERE warisi_kredensial_induk IS NULL;
  IF n_null > 0 THEN
    RAISE EXCEPTION '393 gagal: % baris ber-NULL — pewarisan tak boleh punya keadaan "belum diputuskan"', n_null;
  END IF;

  SELECT count(*) INTO n_anak
    FROM public.companies WHERE parent_company_id IS NOT NULL;

  RAISE NOTICE '393: kolom terpasang · nol NULL · % perusahaan anak (default mewarisi induk)', n_anak;
END $$;
