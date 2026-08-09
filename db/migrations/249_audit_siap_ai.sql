-- ============================================================================
-- 249 — AUDIT SIAP-AI: record_key, kanal, dan percobaan tanpa tenant (TJS-A4)
-- ============================================================================
--
-- Tiga halangan yang membuat P-5 (spec lapisan AI §5.0b) tak bisa dibangun.
-- Yang pertama ternyata bukan halangan masa depan — ia CACAT YANG SUDAH AKTIF.
--
-- ── 1. `record_id` bertipe UUID, dan enam modul memakainya untuk yang bukan UUID
--
-- Diukur 2026-08-09, bukan dibaca dari dokumen:
--
--     kasbon_purposes    recordId: code           -> NOL baris audit
--     notification_rules recordId: eventType      -> NOL baris audit
--     approval_chains    recordId: entityType     -> NOL baris audit
--     app_credentials    recordId: kunci          -> NOL baris audit
--     jadwal_tugas       recordId: tugas          -> NOL baris audit
--
-- Dibuktikan langsung: `INSERT … record_id = 'ANTHROPIC_API_KEY'` ditolak
-- `invalid input syntax for type uuid`. `logAuditEvent` menangkapnya dan
-- MENCATAT galatnya ke log aplikasi — jadi tak sepenuhnya senyap — tetapi
-- barisnya tak pernah sampai ke `audit_logs`.
--
-- Akibatnya: seluruh riwayat "siapa mengubah konfigurasi approval", "siapa
-- mengganti aturan notifikasi", "siapa memasang kredensial" TIDAK ADA. Dan
-- ketiganya justru perubahan yang paling perlu ditelusuri, karena mereka
-- mengubah cara sistem memutuskan.
--
-- Perbaikannya BUKAN melonggarkan `record_id` jadi TEXT: kolom itu punya FK
-- semantik ke baris nyata di 25.191 baris yang sudah ada, dan mengubah tipenya
-- membuang jaminan itu untuk seluruh riwayat. Yang ditambahkan kolom KEDUA,
-- `record_key`, untuk identitas yang memang bukan UUID.
--
-- ── 2. Kolom `via` — kanal asal tindakan
--
-- Tanpa ini, approval lewat WhatsApp tak bisa dibedakan dari approval lewat
-- dashboard. Pertanyaan "berapa approval lewat WA bulan ini" tak terjawab, dan
-- lebih penting: kalau satu kanal ternyata disalahgunakan, tak ada cara
-- mengetahui tindakan mana yang berasal darinya.
--
-- ── 3. `ai_akses_ditolak` — TANPA company_id, dan itu disengaja
--
-- `audit_logs.company_id` NOT NULL. Nomor WhatsApp yang tak dikenal TAK PUNYA
-- tenant — itu justru sebabnya ia ditolak. Memaksanya masuk `audit_logs`
-- berarti mengarang pemilik jejak.
--
-- Isinya sengaja miskin: nomor, waktu, kanal, alasan. TIDAK ada isi pesan —
-- pesan dari orang tak dikenal bisa memuat apa saja, dan menyimpannya berarti
-- menyimpan data orang yang tak pernah setuju apa pun.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Kolom baru di audit_logs
-- ------------------------------------------------------------
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS record_key TEXT,
  ADD COLUMN IF NOT EXISTS via        TEXT;

COMMENT ON COLUMN audit_logs.record_key IS
  'Identitas record yang BUKAN UUID (kode, kunci konfigurasi, entity_type). '
  'Dipakai saat `record_id` tak berlaku — bukan sebagai penggantinya.';

COMMENT ON COLUMN audit_logs.via IS
  'Kanal asal tindakan: web (bawaan) · ai_whatsapp · penjadwal · api. '
  'Tanpa ini, approval lewat WhatsApp tak bisa dibedakan dari lewat dashboard.';

-- Salah satu WAJIB ada. Baris audit tanpa penunjuk record sama sekali adalah
-- jejak yang tak bisa ditelusuri — persis yang audit log ada untuk cegah.
--
-- NOT VALID: 25.191 baris lama tak diperiksa ulang (semuanya punya record_id,
-- tapi memvalidasi tabel sebesar itu mengunci tulis lebih lama daripada yang
-- pantas untuk jaminan yang sudah dipenuhi).
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_punya_penunjuk;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_punya_penunjuk
  CHECK (record_id IS NOT NULL OR record_key IS NOT NULL) NOT VALID;

ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_via_sah;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_via_sah
  CHECK (via IS NULL OR via IN ('web', 'ai_whatsapp', 'penjadwal', 'api'));

CREATE INDEX IF NOT EXISTS idx_audit_logs_record_key
  ON audit_logs(table_name, record_key) WHERE record_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_via
  ON audit_logs(via, created_at DESC) WHERE via IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Percobaan akses yang ditolak — TANPA tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_akses_ditolak (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nomor WhatsApp / pengenal pemanggil. Tak diverifikasi milik siapa —
  -- justru itu intinya.
  pengenal    TEXT NOT NULL,
  kanal       TEXT NOT NULL DEFAULT 'ai_whatsapp',
  alasan      TEXT NOT NULL,

  -- SENGAJA TIDAK ADA kolom isi pesan. Lihat catatan di kepala berkas.
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ai_akses_ditolak_kanal_sah
    CHECK (kanal IN ('ai_whatsapp', 'api', 'web'))
);

CREATE INDEX IF NOT EXISTS idx_ai_akses_ditolak_waktu
  ON ai_akses_ditolak(dibuat_pada DESC);
CREATE INDEX IF NOT EXISTS idx_ai_akses_ditolak_pengenal
  ON ai_akses_ditolak(pengenal, dibuat_pada DESC);

COMMENT ON TABLE ai_akses_ditolak IS
  'Percobaan akses dari pengenal tak dikenal. TANPA company_id — yang ditolak '
  'memang tak punya tenant, dan memaksanya masuk audit_logs (company_id NOT '
  'NULL) berarti mengarang pemilik jejak. Tak menyimpan isi pesan.';

-- RLS: tabel ini LINTAS TENANT secara hakikat — percobaan yang ditolak belum
-- terhubung ke perusahaan mana pun. Dibatasi permission di lapisan API, bukan
-- oleh tenancy.
ALTER TABLE ai_akses_ditolak ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_akses_ditolak_baca ON ai_akses_ditolak;
CREATE POLICY ai_akses_ditolak_baca ON ai_akses_ditolak FOR SELECT USING (true);

DROP POLICY IF EXISTS ai_akses_ditolak_kelola ON ai_akses_ditolak;
CREATE POLICY ai_akses_ditolak_kelola ON ai_akses_ditolak FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3. Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'record_key'
  ) THEN
    RAISE EXCEPTION '249 gagal: kolom record_key tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'via'
  ) THEN
    RAISE EXCEPTION '249 gagal: kolom via tidak terbentuk';
  END IF;

  IF to_regclass('public.ai_akses_ditolak') IS NULL THEN
    RAISE EXCEPTION '249 gagal: ai_akses_ditolak tidak terbentuk';
  END IF;

  -- Yang paling penting: audit dengan record_key (BUKAN UUID) kini DITERIMA.
  -- Inilah cacat yang membuat lima modul kehilangan jejaknya.
  --
  -- Barisnya TIDAK dihapus sesudah diuji: `trg_audit_logs_no_delete` melarang
  -- penghapusan, dan larangan itu adalah Gerbang Keras G-3 (immutability audit
  -- log) yang tak boleh dilonggarkan demi kenyamanan verifikasi.
  --
  -- Jadi barisnya sengaja ditandai `uji.249` pada tabel `__uji_249__` — jejak
  -- yang jujur bahwa migrasi ini pernah menguji dirinya sendiri, bukan sampah
  -- yang menyamar sebagai data nyata.
  INSERT INTO audit_logs (company_id, table_name, record_key, action, severity, via)
  VALUES ((SELECT id FROM companies LIMIT 1), '__uji_249__',
          'ANTHROPIC_API_KEY', 'uji.249', 'info', 'web')
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION '249 gagal: audit ber-record_key tidak tersimpan';
  END IF;

  -- Dan baris TANPA penunjuk apa pun tetap DITOLAK.
  BEGIN
    INSERT INTO audit_logs (company_id, table_name, action, severity)
    VALUES ((SELECT id FROM companies LIMIT 1), '__uji_249__', 'uji.tanpa.penunjuk', 'info');
    RAISE EXCEPTION '249 gagal: audit TANPA record_id/record_key tidak ditolak';
  EXCEPTION
    WHEN check_violation THEN NULL;   -- yang diharapkan
  END;

  -- Kanal asing ditolak.
  BEGIN
    INSERT INTO audit_logs (company_id, table_name, record_key, action, severity, via)
    VALUES ((SELECT id FROM companies LIMIT 1), '__uji_249__', 'x', 'uji.kanal', 'info', 'telepati');
    RAISE EXCEPTION '249 gagal: kanal asing tidak ditolak';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END $$;
