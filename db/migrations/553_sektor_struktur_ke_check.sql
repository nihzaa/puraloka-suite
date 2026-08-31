-- ============================================================================
-- 553 — `bored_pile` & `baja_profil` masuk CHECK; kode & basis bertemu
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Penjaga `audit-sektor-takeoff-cocok.mjs` MERAH di CI, dan arahnya
-- KEBALIKAN dari sebelumnya:
--
--     di kode  : 11
--     di basis :  9
--     ❌ Ada di KODE tetapi TIDAK di basis: baja_profil, bored_pile
--
--     → rute menghitung volumenya, basis menolak dengan pesan constraint
--       MENTAH yang tak menyebut sektor apa yang salah.
--
-- Ini sisa dari R-018. Dua sektor itu dulu ADA di basis dev tanpa migrasi
-- apa pun yang membuatnya (tercatat sebagai temuan sendiri), lalu rumusnya
-- ditambahkan ke kode dari AHSP resmi. Yang belum: memasukkannya ke CHECK
-- lewat jalur migrasi, supaya basis BARU ikut menerimanya.
--
-- ── Kenapa satuannya bukan tebakan
--
-- Diambil dari `_source/ahsp/` — SE Bina Konstruksi No. 47 Tahun 2026:
--
--     bored_pile  → m'   "Pengeboran 1 m' lubang bored pile φ 20 cm ..."
--                        volume = kedalaman × jumlah titik
--                        (sel Excel "Hitungan Volume" M100: =H100*J100)
--     baja_profil → kg   "1 kg Pabrikasi dan Ereksi Baja Profil" (2.3.1.1)
--                        volume = panjang × berat/m × batang
--
-- Kode sudah memakai keduanya (`SEKTOR_SAH`, `SATUAN_SEKTOR`, cabang di
-- `hitungBarisSektor`, dan kalkulator layar). Migrasi ini menyamakan basis.
--
-- ── Kenapa migrasi maju, bukan menyunting 477
--
-- 477 sudah tercatat di lingkungan mana pun yang memutarnya (G-2). Dan
-- CHECK tak bisa "ditambahi" — ia harus dijatuhkan lalu dibuat ulang utuh.
--
-- Idempoten: DROP IF EXISTS + ADD. Verifikasi di blok akhir (pola 142).

DO $sektor_struktur$
BEGIN
  IF to_regclass('public.takeoff_dimensi') IS NULL THEN
    RAISE NOTICE '553 dilewati: tabel takeoff_dimensi tak ada di basis ini';
    RETURN;
  END IF;

  ALTER TABLE takeoff_dimensi DROP CONSTRAINT IF EXISTS takeoff_sektor_sah;
  ALTER TABLE takeoff_dimensi ADD CONSTRAINT takeoff_sektor_sah CHECK (
    sektor IS NULL OR sektor = ANY (ARRAY[
      -- sembilan sektor arsitektur (migrasi 477)
      'atap', 'plafon', 'dinding', 'lantai', 'kusen', 'daun',
      'sanitair', 'mep_pipa', 'mep_titik',
      -- dua sektor STRUKTUR (R-018) — satuan dari AHSP SE-47/2026
      'bored_pile', 'baja_profil'
    ])
  );
END $sektor_struktur$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  v_def TEXT;
BEGIN
  IF to_regclass('public.takeoff_dimensi') IS NULL THEN RETURN; END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint WHERE conname = 'takeoff_sektor_sah';

  IF v_def IS NULL THEN
    RAISE EXCEPTION '553 gagal: constraint takeoff_sektor_sah tak terbentuk';
  END IF;

  /*
    Kedua sektor baru WAJIB ada — dan sembilan yang lama TAK BOLEH hilang.
    Membuat ulang CHECK adalah operasi ganti-utuh: salah ketik satu nama
    membuang sektor yang sudah dipakai, dan barisnya jadi tak bisa disimpan
    tanpa ada yang tahu sebabnya.
  */
  IF position('bored_pile' IN v_def) = 0 OR position('baja_profil' IN v_def) = 0 THEN
    RAISE EXCEPTION '553 gagal: sektor struktur tak masuk CHECK: %', left(v_def, 200);
  END IF;

  IF position('mep_titik' IN v_def) = 0 OR position('sanitair' IN v_def) = 0
     OR position('atap' IN v_def) = 0 THEN
    RAISE EXCEPTION '553 gagal: sektor LAMA hilang dari CHECK: %', left(v_def, 200);
  END IF;

  RAISE NOTICE '553 OK: 11 sektor di CHECK — sembilan arsitektur + dua struktur';
END $$;
