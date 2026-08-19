-- ════════════════════════════════════════════════════════════════════════════
-- 465 — Klausul per JENIS DOKUMEN: SPK dan berita acara ikut milik tenant
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 450 memindahkan klausul KONTRAK ke tenant, dan itu benar. Yang
-- tertinggal: dokumen lain yang juga ditandatangani orang.
--
-- ── Cacat yang ditutup, DIUKUR bukan diduga
--
-- Diukur 2026-08-19 ke kode pencetaknya:
--
--   contracts.ts  membaca `klausul_kontrak` (4 tempat)  ✅ milik tenant
--   spk.ts        NOL rujukan ke klausul                ❌ dipaku di kode
--
-- SPK punya `syarat_khusus` per-baris, dan itu bagus untuk hal yang memang
-- berbeda tiap pekerjaan. Tapi SYARAT UMUM — bunyi denda, kewajiban K3,
-- tata cara pemutusan — sama untuk semua SPK sebuah perusahaan, dan
-- sekarang tak ada tempatnya sama sekali. Akibatnya tiap perusahaan
-- menerbitkan SPK dengan syarat yang ditulis pembuat aplikasi, bukan
-- penasihat hukumnya.
--
-- Itu persis alasan migrasi 450 ada. Yang berubah cuma jenis kertasnya.
--
-- ── Kenapa MEMPERLUAS tabel yang ada, bukan membuat `klausul_spk`
--
-- Tabel kedua berarti: dua CHECK yang harus tetap sama, dua index parsial
-- "satu aktif per nomor", dua layar, dua tempat lupa. Dan saat berita acara
-- menyusul, jadi tiga.
--
-- Yang membedakan klausul kontrak dari klausul SPK bukan STRUKTURNYA —
-- keduanya: nomor, judul, isi, urutan, versi, aktif. Yang membedakan cuma
-- untuk kertas apa ia dicetak. Itu sebuah KOLOM, bukan sebuah tabel.
--
-- ── Kenapa `kontrak` jadi bawaan, dan kenapa itu aman
--
-- Seluruh baris yang ada lahir sebagai klausul kontrak (tak ada jenis lain
-- saat itu). DEFAULT 'kontrak' membuat backfill-nya tak perlu menebak, dan
-- `contracts.ts` yang menyaring `jenis_dokumen='kontrak'` tetap memulangkan
-- persis baris yang sama seperti sebelum migrasi ini.
--
-- Diukur lebih dulu: `klausul_kontrak` berisi **0 baris**, jadi backfill-nya
-- kosong hari ini. Kolom ber-DEFAULT tetap dipasang supaya baris yang masuk
-- lewat jalur lain (importer, psql) tak pernah lahir tanpa jenis.
--
-- ⚠ Index unik lama HARUS diganti. `(company_id, nomor) WHERE aktif`
-- membuat "Pasal 1" SPK bertabrakan dengan "Pasal 1" kontrak — dua kertas
-- berbeda yang wajar punya penomoran yang sama.
--
-- Idempoten.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Jenis dokumen ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jenis_dokumen_klausul') THEN
    -- ENUM, bukan teks bebas: tiap jenis menuntut pencetaknya sendiri di kode.
    -- Nilai yang tak punya pencetak menghasilkan klausul yang tersimpan rapi
    -- lalu tak pernah muncul di kertas mana pun — kegagalan tanpa gejala.
    CREATE TYPE jenis_dokumen_klausul AS ENUM ('kontrak', 'spk', 'berita_acara');
  END IF;
END $$;

ALTER TABLE klausul_kontrak
  ADD COLUMN IF NOT EXISTS jenis_dokumen jenis_dokumen_klausul NOT NULL DEFAULT 'kontrak';

-- ── 2. Keunikan per JENIS, bukan lintas jenis ───────────────────────────────
DROP INDEX IF EXISTS klausul_nomor_aktif_per_company;
CREATE UNIQUE INDEX IF NOT EXISTS klausul_nomor_aktif_per_jenis
  ON klausul_kontrak (company_id, jenis_dokumen, nomor) WHERE aktif;

DROP INDEX IF EXISTS idx_klausul_company_urutan;
CREATE INDEX IF NOT EXISTS idx_klausul_company_jenis_urutan
  ON klausul_kontrak (company_id, jenis_dokumen, urutan) WHERE aktif;

-- ── 3. VERIFIKASI ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_co uuid; v_lolos boolean; v_a uuid; v_b uuid;
BEGIN
  SELECT id INTO v_co FROM companies ORDER BY created_at, id LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE '465 — tak ada company, verifikasi dilewati';
    RETURN;
  END IF;

  -- (a) Nomor yang SAMA pada JENIS BERBEDA harus BOLEH. Ini inti migrasi:
  --     "Pasal 1" SPK dan "Pasal 1" kontrak adalah dua hal berbeda, dan
  --     index lama membuat yang kedua mustahil disimpan.
  BEGIN
    INSERT INTO klausul_kontrak (company_id, jenis_dokumen, nomor, judul, isi, urutan)
    VALUES (v_co, 'kontrak', '[465-1]', 'Uji kontrak', 'isi uji', 900)
    RETURNING id INTO v_a;
    INSERT INTO klausul_kontrak (company_id, jenis_dokumen, nomor, judul, isi, urutan)
    VALUES (v_co, 'spk', '[465-1]', 'Uji SPK', 'isi uji', 900)
    RETURNING id INTO v_b;
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM klausul_kontrak WHERE nomor LIKE '[465-%';
    RAISE EXCEPTION '465 gagal: nomor sama pada jenis berbeda DITOLAK — '
      'penomoran SPK jadi terkunci oleh penomoran kontrak';
  END;

  -- (b) Nomor kembar pada jenis yang SAMA tetap ditolak.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO klausul_kontrak (company_id, jenis_dokumen, nomor, judul, isi, urutan)
    VALUES (v_co, 'spk', '[465-1]', 'Kembar', 'isi uji', 901);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM klausul_kontrak WHERE nomor LIKE '[465-%';
    RAISE EXCEPTION '465 gagal: dua klausul aktif bernomor sama pada jenis yang sama — '
      'kertas memuat dua Pasal dengan nomor identik';
  END IF;

  -- (c) Jenis yang tak dikenal ditolak oleh enum, bukan disimpan diam-diam.
  v_lolos := FALSE;
  BEGIN
    EXECUTE format(
      'INSERT INTO klausul_kontrak (company_id, jenis_dokumen, nomor, judul, isi, urutan)
       VALUES (%L, %L, %L, %L, %L, %s)',
      v_co, 'invoice', '[465-X]', 'Jenis hantu', 'isi uji', 902);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM klausul_kontrak WHERE nomor LIKE '[465-%';
    RAISE EXCEPTION '465 gagal: jenis dokumen tak dikenal diterima — klausulnya '
      'tersimpan rapi lalu tak pernah muncul di kertas mana pun';
  END IF;

  -- (d) Baris lama tetap terbaca sebagai klausul KONTRAK.
  IF EXISTS (SELECT 1 FROM klausul_kontrak WHERE jenis_dokumen IS NULL) THEN
    DELETE FROM klausul_kontrak WHERE nomor LIKE '[465-%';
    RAISE EXCEPTION '465 gagal: ada klausul tanpa jenis — ia tak akan tercetak '
      'di kertas mana pun, dan tak ada yang memberi tahu siapa pun';
  END IF;

  DELETE FROM klausul_kontrak WHERE nomor LIKE '[465-%';

  RAISE NOTICE '465 OK — klausul per jenis dokumen: nomor sama beda jenis SAH, '
    'kembar pada jenis sama ditolak, jenis hantu ditolak, nol baris tanpa jenis';
END $$;
