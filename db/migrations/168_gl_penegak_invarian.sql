-- ============================================================
-- PURALOKA SUITE — Migration 168
-- GL-1b: dua invarian buku besar, ditegakkan DATABASE
-- ============================================================
--
-- ── Kenapa di database, bukan di API
--
-- Pelajaran termahal repo ini (2026-08-02): `fn_update_cash_balance_on_payment`
-- ada di `pg_proc` tapi trigger-nya hilang, dan Rp 627 juta tak pernah masuk
-- saldo tanpa satu pun gejala. Yang menyelamatkan bukan review — melainkan
-- kesadaran bahwa **siapa pun** bisa menulis ke tabel: API, skrip migrasi,
-- perbaikan manual lewat SQL, seed.
--
-- Dua invarian di bawah adalah definisi buku besar. Kalau salah satunya bisa
-- dilanggar dari jalur mana pun, angka di neraca berhenti berarti — dan
-- itulah yang tak boleh bergantung pada kode aplikasi yang bisa lupa.
--
-- ── Invarian 1 — jurnal POSTED wajib seimbang
--
-- Σ debit = Σ kredit. Diperiksa saat POSTING, bukan saat insert baris: jurnal
-- dibangun baris demi baris, dan menuntut seimbang di tengah pembangunan
-- membuat baris pertama selalu ditolak.
--
-- ── Invarian 2 — jurnal POSTED tak boleh diubah
--
-- Inti buku besar: yang sudah dicatat tak disunting. Koreksi dilakukan lewat
-- jurnal balik (reversing entry) yang dicatat sendiri, sehingga jejaknya utuh.
-- Yang boleh berubah pada baris posted HANYA `status` → 'void' (pembatalan
-- resmi, tercatat).
-- ============================================================

-- ── 1. Jurnal posted wajib seimbang ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_gl_wajib_seimbang()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_debit   NUMERIC(18,2);
  v_credit  NUMERIC(18,2);
  v_baris   INT;
BEGIN
  -- Hanya saat MENJADI posted. Draft boleh tak seimbang — itu memang keadaan
  -- setengah jadi.
  IF NEW.status <> 'posted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    RETURN NEW;   -- sudah posted sebelumnya, bukan transisi
  END IF;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
    INTO v_debit, v_credit, v_baris
    FROM journal_entry_lines
   WHERE entry_id = NEW.id;

  -- Jurnal tanpa baris yang "berhasil" di-posting adalah jurnal kosong yang
  -- terlihat sah di daftar — persis kelas cacat "berhasil tanpa melakukan
  -- apa-apa" yang berulang di repo ini.
  IF v_baris < 2 THEN
    RAISE EXCEPTION
      'Jurnal % tak bisa di-posting: hanya % baris (double-entry butuh minimal 2)',
      NEW.entry_number, v_baris;
  END IF;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION
      'Jurnal % tak seimbang: debit % ≠ kredit % (selisih %)',
      NEW.entry_number, v_debit, v_credit, (v_debit - v_credit);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_gl_wajib_seimbang ON journal_entries;
CREATE TRIGGER trg_gl_wajib_seimbang
  BEFORE INSERT OR UPDATE OF status ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION fn_gl_wajib_seimbang();

COMMENT ON FUNCTION fn_gl_wajib_seimbang() IS
  'Menolak posting jurnal yang debit≠kredit atau berbaris <2. Diperiksa saat '
  'TRANSISI ke posted, bukan saat insert baris — jurnal dibangun bertahap.';

-- ── 2. Jurnal posted tak boleh diubah ───────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_gl_posted_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'posted' THEN
    RETURN NEW;   -- draft bebas disunting
  END IF;

  -- Satu-satunya perubahan yang sah pada jurnal posted: membatalkannya.
  -- Pembatalan tercatat (status 'void'), jadi jejaknya tetap ada.
  IF NEW.status = 'void' THEN
    RETURN NEW;
  END IF;

  IF NEW.entry_date  IS DISTINCT FROM OLD.entry_date
  OR NEW.description IS DISTINCT FROM OLD.description
  OR NEW.entry_number IS DISTINCT FROM OLD.entry_number
  OR NEW.company_id  IS DISTINCT FROM OLD.company_id
  OR NEW.source      IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION
      'Jurnal % sudah di-posting dan tak bisa diubah. Koreksi lewat jurnal balik, '
      'bukan menyunting yang lama.', OLD.entry_number;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_gl_posted_immutable ON journal_entries;
CREATE TRIGGER trg_gl_posted_immutable
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION fn_gl_posted_immutable();

-- ── 3. Baris jurnal posted juga terkunci ────────────────────────────────────
-- Tanpa ini, invarian #2 bocor lewat pintu belakang: kepala jurnal tak bisa
-- diubah, tapi barisnya bisa — dan angka di buku besar berubah tanpa satu pun
-- perubahan pada kepalanya.
CREATE OR REPLACE FUNCTION fn_gl_baris_posted_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
  v_id     UUID;
  v_nomor  TEXT;
BEGIN
  v_id := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT status, entry_number INTO v_status, v_nomor
    FROM journal_entries WHERE id = v_id;

  IF v_status = 'posted' THEN
    RAISE EXCEPTION
      'Baris jurnal % tak bisa diubah/dihapus: jurnalnya sudah di-posting. '
      'Koreksi lewat jurnal balik.', v_nomor;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_gl_baris_posted_immutable ON journal_entry_lines;
CREATE TRIGGER trg_gl_baris_posted_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION fn_gl_baris_posted_immutable();

-- ── 4. Akun & baris jurnal wajib satu company ───────────────────────────────
-- Celah yang mudah terlewat: baris jurnal company A menunjuk akun milik
-- company B. Tenancy kepala jurnal benar, tapi angkanya masuk ke bagan akun
-- tenant lain. Tak ada FK yang bisa menyatakan ini — butuh trigger.
CREATE OR REPLACE FUNCTION fn_gl_akun_satu_company()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_company_jurnal UUID;
  v_company_akun   UUID;
BEGIN
  SELECT company_id INTO v_company_jurnal FROM journal_entries WHERE id = NEW.entry_id;
  SELECT company_id INTO v_company_akun   FROM accounts        WHERE id = NEW.account_id;

  IF v_company_jurnal IS DISTINCT FROM v_company_akun THEN
    RAISE EXCEPTION
      'Baris jurnal menunjuk akun milik badan usaha lain — jurnal % vs akun %.',
      v_company_jurnal, v_company_akun;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_gl_akun_satu_company ON journal_entry_lines;
CREATE TRIGGER trg_gl_akun_satu_company
  BEFORE INSERT OR UPDATE OF account_id, entry_id ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION fn_gl_akun_satu_company();

-- ── Verifikasi: keempat trigger benar-benar terpasang ───────────────────────
DO $$
DECLARE
  r RECORD;
  hilang TEXT := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('trg_gl_wajib_seimbang',        'journal_entries'),
    ('trg_gl_posted_immutable',      'journal_entries'),
    ('trg_gl_baris_posted_immutable','journal_entry_lines'),
    ('trg_gl_akun_satu_company',     'journal_entry_lines')
  ) AS t(nama, tabel) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname = r.nama
         AND tgrelid = to_regclass(current_schema() || '.' || r.tabel)
    ) THEN
      hilang := hilang || r.nama || ' ';
    END IF;
  END LOOP;

  IF hilang <> '' THEN
    RAISE EXCEPTION 'Trigger GL TIDAK terpasang sesudah migrasi 168: %', hilang;
  END IF;
END $$;
