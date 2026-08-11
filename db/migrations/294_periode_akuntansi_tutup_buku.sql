-- ════════════════════════════════════════════════════════════════════════════
-- 294 — PERIODE AKUNTANSI & TUTUP BUKU (G5)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠ EMBER [C] — CLAUDE.md §5.3. Invariant pembukuan berpasangan dan
--   penguncian periode TIDAK BOLEH dibuat bisa dikonfigurasi dari UI,
--   sekalipun diminta. Yang boleh diatur: KAPAN periode ditutup dan siapa
--   yang boleh menutupnya. Yang TIDAK boleh: apakah penguncian berlaku.
--
-- ── Yang DIUKUR lebih dulu, dan bagaimana hasilnya mengubah rencana
--
-- RATIFIKASI menempatkan G5 sebagai "Tutup Buku + jurnal · accounts 38 ada,
-- journal_entries 0 · paling berisiko". Diukur ke basis 2026-08-12:
--
--   accounts              38 baris, bagan lengkap & tertata (aset→beban)
--   journal_entries        0 baris — TAPI strukturnya sudah ada
--   journal_entry_lines    0 baris
--   trigger GL             6 buah SUDAH TERPASANG:
--                            trg_gl_wajib_seimbang      (debit = kredit)
--                            trg_gl_posted_immutable    (posted tak berubah)
--                            trg_gl_baris_posted_immutable
--                            trg_gl_akun_satu_company
--                            trg_journal_entries_isi_company
--   constraint             jel_debit_xor_credit · jel_tak_negatif
--   test                   48 (gl-api · gl-invarian · gl-coa-seed)
--   routes/v1/gl.ts        10 endpoint · /akuntansi + 2 komponen
--
-- Jadi **fondasi GL sudah kokoh dan sudah dipikirkan matang.** Yang belum ada
-- justru satu-satunya hal yang jadi nama kelompok ini: PERIODE dan
-- PENGUNCIANNYA. Tak ada satu pun kolom `terkunci`/`closed` di seluruh basis
-- yang berkaitan akuntansi (`rap_budget.locked_at` adalah anggaran, bukan
-- pembukuan).
--
-- ── §1. Kenapa penguncian ditegakkan TRIGGER, bukan pemeriksaan di rute
--
-- Tutup buku yang hanya diperiksa di lapisan aplikasi bukan tutup buku. Yang
-- menembusnya bukan penyerang, melainkan hal biasa: skrip impor, migrasi
-- data, rute lain yang kelak menulis ke tabel yang sama, atau perbaikan
-- manual lewat SQL "sekali saja".
--
-- Dan akibatnya tak terlihat: laporan yang sudah dicetak, dikirim ke bank,
-- atau dipakai menghitung pajak berubah angkanya SETELAH dikirim. Yang
-- menemukan bukan sistemnya — melainkan orang lain yang memegang cetakan
-- lama.
--
-- ── §2. Yang dikunci: TANGGAL, bukan waktu pembuatan
--
-- Penguncian memakai `entry_date`, bukan `created_at`. Jurnal yang dibuat
-- hari ini untuk transaksi bulan lalu HARUS ditolak bila bulan lalu sudah
-- ditutup — justru itulah yang dijaga. Mengunci berdasarkan waktu pembuatan
-- akan meloloskan tepat kasus yang paling merusak.
--
-- ── §3. Kenapa `posted` yang dijaga, dan draft dibiarkan
--
-- Draft belum masuk laporan mana pun (`gl.ts` menyaring `status = 'posted'`).
-- Menahan draft di periode terkunci hanya menghalangi orang menyiapkan
-- koreksi, tanpa menjaga apa pun.
--
-- Yang ditolak:
--   · POSTING jurnal ber-`entry_date` di dalam periode terkunci
--   · MENGUBAH baris jurnal yang sudah posted di periode terkunci
--   · MEMINDAHKAN tanggal jurnal posted KE DALAM periode terkunci
--
-- ── §4. Kenapa periode bisa DIBUKA lagi, dan kenapa itu berjejak
--
-- Larangan mutlak terdengar lebih aman, tetapi menghasilkan hal yang lebih
-- buruk: saat koreksi benar-benar diperlukan (audit menemukan salah posting),
-- orang akan mengubah basis lewat SQL langsung — dan itu TIDAK berjejak sama
-- sekali.
--
-- Karena itu membuka kembali DIIZINKAN, dengan syarat yang membuatnya mahal
-- dan terlihat: wajib beralasan >= 20 huruf, tercatat siapa dan kapan, dan
-- riwayatnya disimpan permanen di `periode_akuntansi_riwayat` yang
-- append-only. Periode yang pernah dibuka ulang tak bisa berpura-pura tak
-- pernah dibuka.
--
-- ── §5. Yang TIDAK dibangun, dan kenapa dinyatakan
--
-- JURNAL OTOMATIS dari invoice/pembayaran/upah TIDAK dibangun di sini,
-- meskipun `journal_entries.source`/`ref_type`/`ref_id` sudah menunggu diisi.
--
-- Alasannya bukan kemalasan: pemetaan akun adalah KEBIJAKAN AKUNTANSI, bukan
-- keputusan teknis. Contoh yang tak bisa saya putuskan sendiri:
--
--   · pendapatan diakui saat invoice terbit (akrual) atau saat dibayar (kas)?
--   · retensi 5% masuk `4130 Retensi` atau `1124 Retensi Belum Ditagih`?
--   · uang muka klien: `2150 Uang Muka Klien` lalu diakui bertahap, atau
--     langsung pendapatan?
--   · PPN keluaran belum punya akunnya sendiri di bagan yang ada
--
-- Menebaknya menghasilkan laporan keuangan yang SALAH DENGAN MEYAKINKAN —
-- kelas cacat terburuk di repo ini, dan di sini korbannya bukan layar
-- melainkan SPT tahunan.
--
-- Yang dibangun: mesin penguncian yang siap dipakai begitu kebijakannya turun,
-- dan `RATIFIKASI.md` mencatat empat pertanyaan di atas untuk founder.
--
-- ── §6. Yang dijaga constraint & trigger
--
--  1. periode tak boleh tumpang tindih dalam satu company
--  2. tanggal akhir tak boleh mendahului tanggal mulai
--  3. periode `tertutup` wajib bertanggal & berpenutup
--  4. membuka kembali wajib beralasan >= 20 huruf
--  5. posting jurnal ke periode tertutup DITOLAK (trigger)
--  6. mengubah baris jurnal posted di periode tertutup DITOLAK (trigger)
--  7. memindahkan tanggal jurnal posted ke periode tertutup DITOLAK
--  8. riwayat append-only — tak bisa di-UPDATE maupun di-DELETE
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_periode_akuntansi') THEN
    CREATE TYPE status_periode_akuntansi AS ENUM ('terbuka', 'tertutup');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Periode akuntansi
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS periode_akuntansi (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nama           TEXT NOT NULL,
  tanggal_mulai  DATE NOT NULL,
  tanggal_akhir  DATE NOT NULL,
  status         status_periode_akuntansi NOT NULL DEFAULT 'terbuka',
  ditutup_pada   TIMESTAMPTZ,
  ditutup_oleh   UUID REFERENCES users(id) ON DELETE SET NULL,
  catatan_tutup  TEXT,
  -- Berapa kali periode ini pernah DIBUKA KEMBALI. Angka yang tak bisa
  -- disembunyikan: periode yang dibuka tiga kali menceritakan sesuatu tentang
  -- kualitas pembukuannya, dan itu memang harus terlihat.
  dibuka_ulang   INTEGER NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'periode_tanggal_urut') THEN
    ALTER TABLE periode_akuntansi ADD CONSTRAINT periode_tanggal_urut
      CHECK (tanggal_akhir >= tanggal_mulai);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'periode_nama_tak_kosong') THEN
    ALTER TABLE periode_akuntansi ADD CONSTRAINT periode_nama_tak_kosong
      CHECK (length(trim(nama)) > 0);
  END IF;

  -- Periode tertutup wajib berjejak. Tanpa ini, "siapa yang menutup Juli?"
  -- tak bisa dijawab — dan pertanyaan itu selalu muncul saat angkanya
  -- dipersoalkan.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'periode_tertutup_berjejak') THEN
    ALTER TABLE periode_akuntansi ADD CONSTRAINT periode_tertutup_berjejak
      CHECK (status <> 'tertutup'
             OR (ditutup_pada IS NOT NULL AND ditutup_oleh IS NOT NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'periode_dibuka_ulang_wajar') THEN
    ALTER TABLE periode_akuntansi ADD CONSTRAINT periode_dibuka_ulang_wajar
      CHECK (dibuka_ulang >= 0);
  END IF;
END $$;

-- Periode TIDAK BOLEH tumpang tindih: satu tanggal harus jatuh di tepat satu
-- periode, kalau tidak "apakah tanggal ini terkunci?" punya dua jawaban.
--
-- `daterange` + EXCLUDE, bukan pemeriksaan aplikasi — dua permintaan
-- bersamaan bisa lolos pemeriksaan aplikasi dan keduanya tersimpan.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'periode_tak_tumpang_tindih') THEN
    ALTER TABLE periode_akuntansi ADD CONSTRAINT periode_tak_tumpang_tindih
      EXCLUDE USING gist (
        company_id WITH =,
        daterange(tanggal_mulai, tanggal_akhir, '[]') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_periode_company ON periode_akuntansi(company_id, tanggal_mulai DESC);

-- ------------------------------------------------------------
-- 3. Riwayat — APPEND-ONLY (§4)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS periode_akuntansi_riwayat (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_id   UUID NOT NULL REFERENCES periode_akuntansi(id) ON DELETE CASCADE,
  tindakan     TEXT NOT NULL,
  alasan       TEXT,
  oleh         UUID REFERENCES users(id) ON DELETE SET NULL,
  pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Jumlah jurnal posted saat tindakan terjadi. Disimpan supaya bisa
  -- dibandingkan: periode yang ditutup dengan 40 jurnal lalu dibuka dan
  -- ditutup lagi dengan 37 kehilangan tiga — dan itu harus bisa dilihat.
  jurnal_posted INTEGER
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riwayat_tindakan_sah') THEN
    ALTER TABLE periode_akuntansi_riwayat ADD CONSTRAINT riwayat_tindakan_sah
      CHECK (tindakan IN ('dibuat', 'ditutup', 'dibuka_ulang'));
  END IF;

  -- Membuka kembali WAJIB beralasan panjang (§4). Alasan pendek ("koreksi",
  -- "salah") tak menjelaskan apa pun saat dibaca setahun kemudian.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riwayat_buka_beralasan') THEN
    ALTER TABLE periode_akuntansi_riwayat ADD CONSTRAINT riwayat_buka_beralasan
      CHECK (tindakan <> 'dibuka_ulang'
             OR (alasan IS NOT NULL AND length(trim(alasan)) >= 20));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_riwayat_periode ON periode_akuntansi_riwayat(periode_id, pada DESC);

-- Append-only: pola yang sama dengan `audit_logs` (migrasi 073). Riwayat
-- penguncian yang bisa disunting adalah riwayat yang tak menjaga apa pun.
CREATE OR REPLACE FUNCTION fn_riwayat_periode_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'periode_akuntansi_riwayat bersifat append-only: % ditolak', TG_OP;
END $$;

DROP TRIGGER IF EXISTS trg_riwayat_periode_no_update ON periode_akuntansi_riwayat;
CREATE TRIGGER trg_riwayat_periode_no_update
  BEFORE UPDATE ON periode_akuntansi_riwayat
  FOR EACH ROW EXECUTE FUNCTION fn_riwayat_periode_append_only();

DROP TRIGGER IF EXISTS trg_riwayat_periode_no_delete ON periode_akuntansi_riwayat;
CREATE TRIGGER trg_riwayat_periode_no_delete
  BEFORE DELETE ON periode_akuntansi_riwayat
  FOR EACH ROW EXECUTE FUNCTION fn_riwayat_periode_append_only();

-- ------------------------------------------------------------
-- 4. PENGUNCIAN — inti G5 (§1, §2, §3)
-- ------------------------------------------------------------

-- Apakah tanggal ini berada di periode yang TERTUTUP?
--
-- Dipisah jadi fungsi supaya dipakai trigger DAN rute (untuk memberi pesan
-- yang bisa dibaca manusia sebelum trigger menolaknya dengan bahasa Postgres).
CREATE OR REPLACE FUNCTION gl_periode_tertutup(p_company UUID, p_tanggal DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM periode_akuntansi
     WHERE company_id = p_company
       AND status = 'tertutup'
       AND p_tanggal BETWEEN tanggal_mulai AND tanggal_akhir
  );
$$;

-- Menolak POSTING ke periode tertutup, dan menolak memindahkan tanggal
-- jurnal posted KE DALAM periode tertutup (§2).
CREATE OR REPLACE FUNCTION fn_gl_hormati_periode_tertutup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nama TEXT;
BEGIN
  -- Draft dibiarkan (§3): ia belum masuk laporan mana pun, dan menahannya
  -- hanya menghalangi orang menyiapkan koreksi.
  IF NEW.status <> 'posted' THEN
    RETURN NEW;
  END IF;

  -- Yang diperiksa: transisi MENJADI posted, ATAU perubahan tanggal pada
  -- jurnal yang sudah posted.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'posted'
     AND OLD.entry_date = NEW.entry_date THEN
    RETURN NEW;
  END IF;

  SELECT nama INTO v_nama
    FROM periode_akuntansi
   WHERE company_id = NEW.company_id
     AND status = 'tertutup'
     AND NEW.entry_date BETWEEN tanggal_mulai AND tanggal_akhir
   LIMIT 1;

  IF v_nama IS NOT NULL THEN
    RAISE EXCEPTION
      'Periode "%" sudah ditutup — jurnal bertanggal % tak bisa diposting. Buka kembali periodenya (berjejak) atau posting di periode berjalan.',
      v_nama, NEW.entry_date;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gl_hormati_periode_tertutup ON journal_entries;
CREATE TRIGGER trg_gl_hormati_periode_tertutup
  BEFORE INSERT OR UPDATE OF status, entry_date ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION fn_gl_hormati_periode_tertutup();

-- Baris jurnal: `trg_gl_baris_posted_immutable` sudah melarang mengubah baris
-- jurnal yang posted. Yang BELUM dijaga: MENAMBAH baris ke jurnal posted di
-- periode tertutup, dan menghapusnya.
--
-- Tanpa ini, jurnal posted yang seimbang bisa ditambahi baris baru sehingga
-- tak seimbang lagi — dan `trg_gl_wajib_seimbang` hanya berjalan saat
-- TRANSISI menjadi posted, jadi ia tak akan melihatnya.
CREATE OR REPLACE FUNCTION fn_gl_baris_hormati_periode()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry   UUID;
  v_company UUID;
  v_tanggal DATE;
  v_status  TEXT;
  v_nama    TEXT;
BEGIN
  v_entry := COALESCE(NEW.entry_id, OLD.entry_id);

  SELECT company_id, entry_date, status
    INTO v_company, v_tanggal, v_status
    FROM journal_entries WHERE id = v_entry;

  -- Jurnal draft boleh diubah bebas.
  IF v_status IS DISTINCT FROM 'posted' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT nama INTO v_nama
    FROM periode_akuntansi
   WHERE company_id = v_company
     AND status = 'tertutup'
     AND v_tanggal BETWEEN tanggal_mulai AND tanggal_akhir
   LIMIT 1;

  IF v_nama IS NOT NULL THEN
    RAISE EXCEPTION
      'Periode "%" sudah ditutup — baris jurnal bertanggal % tak bisa diubah.',
      v_nama, v_tanggal;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_gl_baris_hormati_periode ON journal_entry_lines;
CREATE TRIGGER trg_gl_baris_hormati_periode
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION fn_gl_baris_hormati_periode();

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------
ALTER TABLE periode_akuntansi         ENABLE ROW LEVEL SECURITY;
ALTER TABLE periode_akuntansi_riwayat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON periode_akuntansi;
CREATE POLICY tenant_isolation ON periode_akuntansi AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON periode_akuntansi_riwayat;
CREATE POLICY tenant_isolation ON periode_akuntansi_riwayat AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM periode_akuntansi p
                  WHERE p.id = periode_akuntansi_riwayat.periode_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM periode_akuntansi p
                       WHERE p.id = periode_akuntansi_riwayat.periode_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 6. Capability
--
-- Menutup dan MEMBUKA KEMBALI sengaja dipisah. Menutup periode adalah
-- pekerjaan rutin akhir bulan; membuka kembali adalah keputusan yang
-- mengubah angka yang sudah dilaporkan — dan itu bukan kewenangan yang sama.
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('gl:periode:view',   'gl', 'Lihat periode akuntansi',
   'Melihat daftar periode dan status penguncian'),
  ('gl:periode:manage', 'gl', 'Kelola & tutup periode',
   'Membuat periode akuntansi dan menutupnya'),
  ('gl:periode:reopen', 'gl', 'Buka kembali periode tertutup',
   'Membuka periode yang sudah ditutup — mengubah angka yang mungkin sudah dilaporkan')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('gl:periode:view', 'gl:periode:manage')
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- Membuka kembali: DIREKTUR saja. Bukan karena admin tak dipercaya,
-- melainkan karena keputusan ini mengubah laporan yang mungkin sudah dikirim
-- ke bank atau dipakai menghitung pajak — dan yang menandatanganinya direktur.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'gl:periode:reopen'
   AND r.name = 'direktur'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7. Menu
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/akuntansi/periode', is_active = TRUE,
       required_permissions = ARRAY['gl:periode:view']::text[]
 WHERE key = 'fn-tutup-buku';

-- ------------------------------------------------------------
-- 8. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  FOR n IN
    SELECT 1 FROM unnest(ARRAY['periode_akuntansi', 'periode_akuntansi_riwayat']) t
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = t)
  LOOP
    RAISE EXCEPTION '294 gagal: ada tabel G5 yang tak terbentuk';
  END LOOP;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY[
      'periode_tanggal_urut', 'periode_nama_tak_kosong', 'periode_tertutup_berjejak',
      'periode_dibuka_ulang_wajar', 'periode_tak_tumpang_tindih',
      'riwayat_tindakan_sah', 'riwayat_buka_beralasan']) c
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c)
  LOOP
    RAISE EXCEPTION '294 gagal: ada constraint G5 yang tak terpasang';
  END LOOP;

  -- Penguncian WAJIB ditegakkan trigger (§1). Kalau triggernya hilang,
  -- seluruh alasan migrasi ini batal tanpa satu pun galat.
  FOR n IN
    SELECT 1 FROM unnest(ARRAY[
      'trg_gl_hormati_periode_tertutup', 'trg_gl_baris_hormati_periode',
      'trg_riwayat_periode_no_update', 'trg_riwayat_periode_no_delete']) t
     WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t)
  LOOP
    RAISE EXCEPTION '294 gagal: ada trigger penguncian yang tak terpasang';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gl_periode_tertutup') THEN
    RAISE EXCEPTION '294 gagal: fungsi gl_periode_tertutup tak ada';
  END IF;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY['periode_akuntansi', 'periode_akuntansi_riwayat']) t
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation')
  LOOP
    RAISE EXCEPTION '294 gagal: ada tabel G5 tanpa RLS tenant_isolation';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'gl:periode:reopen') THEN
    RAISE EXCEPTION '294 gagal: capability gl:periode:reopen tak ter-seed';
  END IF;

  -- Trigger GL yang SUDAH ADA tak boleh hilang gara-gara migrasi ini.
  FOR n IN
    SELECT 1 FROM unnest(ARRAY[
      'trg_gl_wajib_seimbang', 'trg_gl_posted_immutable',
      'trg_gl_baris_posted_immutable', 'trg_gl_akun_satu_company']) t
     WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t)
  LOOP
    RAISE EXCEPTION '294 gagal: trigger GL yang sudah ada justru hilang';
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'fn-tutup-buku' AND (href LIKE '/m/%' OR is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION '294 gagal: menu fn-tutup-buku belum menunjuk halaman nyata';
  END IF;

  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/akuntansi/periode';
  IF n <> 1 THEN
    RAISE EXCEPTION '294 gagal: % menu aktif menunjuk /akuntansi/periode (harus 1)', n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('periode_akuntansi', 'periode_akuntansi_riwayat')
       AND (data_type = 'timestamp without time zone'
            OR data_type IN ('double precision', 'real'))
  ) THEN
    RAISE EXCEPTION '294 gagal: ada kolom float atau timestamp tanpa zona waktu';
  END IF;

  RAISE NOTICE '294 OK — periode_akuntansi + penguncian ditegakkan trigger';
END $$;
