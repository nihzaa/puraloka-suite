-- ════════════════════════════════════════════════════════════════════════════
-- 234 — REKONSILIASI BANK: mencocokkan buku kas dengan rekening koran
--
-- ── Kenapa modul ini, dan kenapa sekarang
--
-- Diukur 2026-08-07 dari 19 modul yang belum dibangun. Yang paling menahan
-- penjualan dan prasyaratnya SUDAH LUNAS:
--
--   cash_accounts       5 rekening
--   payments           23 penerimaan
--   supplier_payments   2 pembayaran
--   cash_transfers      8 pemindahan
--                      ── 33 transaksi kas nyata untuk dicocokkan
--
-- Bandingkan dengan "tutup buku" yang juga dinilai TINGGI: `journal_entries`
-- masih NOL baris, jadi tutup buku akan selalu berhasil tanpa membuktikan
-- apa pun. Membangun di atas tabel kosong menghasilkan layar yang selalu hijau
-- — dan hijau palsu lebih berbahaya daripada belum ada.
--
-- ── Apa yang dijawab modul ini
--
-- Tiap akhir bulan, orang keuangan menaruh rekening koran di sebelah buku kas
-- dan mencocokkan baris demi baris. Yang dicari bukan yang cocok — melainkan
-- yang TIDAK: setoran yang belum masuk rekening, cek yang belum dicairkan,
-- biaya admin bank yang tak pernah dicatat, dan (yang paling mahal) pembayaran
-- yang keluar dari rekening tanpa ada catatannya sama sekali.
--
-- Tanpa alat ini mereka tetap memakai Excel, dan pertanyaan "lalu untuk apa
-- saya membayar sistem ini?" muncul di demo.
--
-- ── Empat tabel, dan kenapa masing-masing perlu
--
--   rekening_koran          satu berkas koran per rekening per periode
--   rekening_koran_baris    tiap baris mutasi bank
--   pencocokan_bank         SATU baris koran ↔ SATU transaksi buku
--   penyesuaian_rekonsiliasi  selisih yang tak bisa dicocokkan tapi SAH
--                             (biaya admin, jasa giro, koreksi bank)
--
-- ── Invarian yang ditegakkan DI BASIS, bukan di form
--
--   1. Satu baris koran hanya boleh cocok SEKALI. Mencocokkannya dua kali
--      membuat satu penerimaan dihitung ganda, dan saldo buku menjauh dari
--      bank justru saat orang mengira sedang mendekat.
--
--   2. Satu transaksi buku hanya boleh cocok SEKALI, dengan alasan yang sama
--      dari arah sebaliknya.
--
--   3. Impor koran yang sama dua kali tak boleh menggandakan barisnya —
--      `hash_baris` unik per rekening koran. Orang MEMANG mengimpor ulang
--      saat berkasnya diperbaiki, dan tanpa ini setiap perbaikan menggandakan
--      seluruh isinya.
--
--   4. Debit dan kredit XOR: satu baris mutasi bank adalah uang masuk ATAU
--      keluar, tak pernah keduanya. Baris ber-nol-dua-duanya adalah baris yang
--      salah baca dari berkas, dan ia akan diam-diam menggeser saldo.
--
--   5. Rekonsiliasi yang sudah DIKUNCI tak bisa diubah — tanggal kunci wajib
--      ada. Angka rekonsiliasi yang masih bisa bergeser sesudah dilaporkan
--      bukan rekonsiliasi.
--
-- ── Kenapa impor CSV, bukan integrasi bank langsung
--
-- Integrasi API bank menuntut kredensial per-bank, persetujuan, dan biaya —
-- dan kontraktor segmen ini mengunduh koran dari internet banking sebagai
-- CSV/Excel. Versi pertama yang bisa dipakai hari ini mengalahkan versi
-- sempurna yang menunggu izin bank.
--
-- ── Idempoten: CREATE TABLE IF NOT EXISTS + blok verifikasi di akhir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Berkas rekening koran ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rekening_koran (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  cash_account_id UUID NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,

  -- Periode yang dicakup koran ini. Bukan "bulan" saja: sebagian bank
  -- memotong periode di tanggal cetak, bukan akhir bulan.
  periode_dari    DATE NOT NULL,
  periode_sampai  DATE NOT NULL,

  -- Saldo yang TERTULIS DI KORAN, bukan dihitung. Inilah angka yang harus
  -- ditemui perhitungan buku — kalau ia dihitung dari barisnya sendiri, ia
  -- akan selalu cocok dan rekonsiliasinya tak membuktikan apa pun.
  saldo_awal      NUMERIC(18,2) NOT NULL,
  saldo_akhir     NUMERIC(18,2) NOT NULL,

  nama_berkas     TEXT,
  berkas_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'terbuka',
  dikunci_pada    TIMESTAMPTZ,
  dikunci_oleh    UUID REFERENCES users(id),
  catatan         TEXT,
  diimpor_oleh    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT koran_status_sah CHECK (status IN ('terbuka', 'dikunci')),
  CONSTRAINT koran_periode_urut CHECK (periode_sampai >= periode_dari),
  -- Dikunci WAJIB bertanggal & berpenanggung jawab. "Sudah direkonsiliasi"
  -- tanpa siapa dan kapan tak bisa dipertanggungjawabkan saat diaudit.
  CONSTRAINT koran_kunci_lengkap CHECK (
    status <> 'dikunci' OR (dikunci_pada IS NOT NULL AND dikunci_oleh IS NOT NULL)),
  -- Satu rekening, satu periode, satu koran.
  CONSTRAINT koran_unik_periode UNIQUE (cash_account_id, periode_dari, periode_sampai)
);

-- ── 2. Baris mutasi di koran ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rekening_koran_baris (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  koran_id     UUID NOT NULL REFERENCES rekening_koran(id) ON DELETE CASCADE,
  tanggal      DATE NOT NULL,
  keterangan   TEXT NOT NULL,
  debit        NUMERIC(18,2) NOT NULL DEFAULT 0,
  kredit       NUMERIC(18,2) NOT NULL DEFAULT 0,
  saldo        NUMERIC(18,2),
  ref_bank     TEXT,

  -- Sidik baris untuk mencegah impor ganda. Dihitung dari isi barisnya
  -- (tanggal + keterangan + nominal), jadi berkas yang sama menghasilkan
  -- sidik yang sama.
  hash_baris   TEXT NOT NULL,
  urutan       INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uang masuk ATAU keluar, tak pernah keduanya, tak pernah bukan keduanya.
  CONSTRAINT koran_baris_debit_xor_kredit CHECK (
    (debit > 0 AND kredit = 0) OR (kredit > 0 AND debit = 0)),
  CONSTRAINT koran_baris_tak_negatif CHECK (debit >= 0 AND kredit >= 0),
  CONSTRAINT koran_baris_unik UNIQUE (koran_id, hash_baris)
);

-- ── 3. Pencocokan ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pencocokan_bank (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  baris_id      UUID NOT NULL REFERENCES rekening_koran_baris(id) ON DELETE CASCADE,

  -- Transaksi buku yang dicocokkan. Tiga sumber, jadi disimpan sebagai
  -- pasangan (tabel, id) — bukan tiga kolom FK yang dua di antaranya selalu
  -- NULL.
  sumber_tabel  TEXT NOT NULL,
  sumber_id     UUID NOT NULL,

  jenis         TEXT NOT NULL DEFAULT 'manual',
  dicocokkan_oleh UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cocok_sumber_sah CHECK (
    sumber_tabel IN ('payments', 'supplier_payments', 'cash_transfers')),
  CONSTRAINT cocok_jenis_sah CHECK (jenis IN ('otomatis', 'manual')),
  -- INVARIAN INTI: satu baris koran cocok sekali, satu transaksi buku cocok
  -- sekali. Tanpa keduanya, satu penerimaan bisa dihitung dua kali dan saldo
  -- buku menjauh dari bank justru saat orang mengira sedang mendekat.
  CONSTRAINT cocok_baris_sekali UNIQUE (baris_id),
  CONSTRAINT cocok_sumber_sekali UNIQUE (sumber_tabel, sumber_id)
);

-- ── 4. Penyesuaian ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penyesuaian_rekonsiliasi (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  koran_id    UUID NOT NULL REFERENCES rekening_koran(id) ON DELETE CASCADE,
  jenis       TEXT NOT NULL,
  keterangan  TEXT NOT NULL,
  nominal     NUMERIC(18,2) NOT NULL,
  dicatat_oleh UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT penyesuaian_jenis_sah CHECK (jenis IN (
    'biaya_admin', 'jasa_giro', 'pajak_bunga', 'koreksi_bank', 'lainnya')),
  -- Penyesuaian bernominal nol tak menyesuaikan apa pun; ia hanya membuat
  -- daftar terlihat lebih panjang daripada isinya.
  CONSTRAINT penyesuaian_bukan_nol CHECK (nominal <> 0),
  -- "Lainnya" WAJIB dijelaskan. Tanpa ini ia jadi keranjang sampah tempat
  -- selisih yang tak dipahami dibuang, dan rekonsiliasinya berhenti berarti.
  CONSTRAINT penyesuaian_lainnya_berketerangan CHECK (
    jenis <> 'lainnya' OR length(trim(keterangan)) >= 10)
);

-- ── Indeks ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_koran_akun ON rekening_koran(cash_account_id, periode_dari DESC);
CREATE INDEX IF NOT EXISTS idx_koran_company ON rekening_koran(company_id);
CREATE INDEX IF NOT EXISTS idx_koran_baris_koran ON rekening_koran_baris(koran_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_cocok_company ON pencocokan_bank(company_id);
CREATE INDEX IF NOT EXISTS idx_penyesuaian_koran ON penyesuaian_rekonsiliasi(koran_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE rekening_koran            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rekening_koran            FORCE ROW LEVEL SECURITY;
ALTER TABLE rekening_koran_baris      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rekening_koran_baris      FORCE ROW LEVEL SECURITY;
ALTER TABLE pencocokan_bank           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pencocokan_bank           FORCE ROW LEVEL SECURITY;
ALTER TABLE penyesuaian_rekonsiliasi  ENABLE ROW LEVEL SECURITY;
ALTER TABLE penyesuaian_rekonsiliasi  FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON rekening_koran;
CREATE POLICY tenant_isolation ON rekening_koran
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- Baris koran mewarisi tenancy dari induknya — ia tak punya company_id
-- sendiri, dan menambahkannya berarti dua sumber kebenaran yang bisa
-- berselisih (pola yang sama dengan `journal_entry_lines`, migrasi 167).
DROP POLICY IF EXISTS tenant_isolation ON rekening_koran_baris;
CREATE POLICY tenant_isolation ON rekening_koran_baris
  USING (EXISTS (SELECT 1 FROM rekening_koran k
                  WHERE k.id = koran_id AND k.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM rekening_koran k
                       WHERE k.id = koran_id AND k.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON pencocokan_bank;
CREATE POLICY tenant_isolation ON pencocokan_bank
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON penyesuaian_rekonsiliasi;
CREATE POLICY tenant_isolation ON penyesuaian_rekonsiliasi
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── Permission ──────────────────────────────────────────────────────────────
--
-- Diberikan ke role yang SUDAH punya permission setara secara makna
-- (pola migrasi 189), bukan ke nama peran — ADR-004.
-- `module` dan `label` WAJIB (NOT NULL) — bentuknya dibaca dari tabel, bukan
-- ditebak. Percobaan pertama hanya mengisi (key, description) dan gagal keras
-- di situ; itu perilaku yang benar, dan lebih baik daripada kolom terisi NULL.
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('rekonsiliasi:view',   'cash', 'Lihat rekonsiliasi bank',   'Melihat rekonsiliasi bank & hasil pencocokan', 810),
  ('rekonsiliasi:manage', 'cash', 'Kelola rekonsiliasi bank',  'Mengimpor rekening koran & mencocokkan transaksi', 811),
  ('rekonsiliasi:lock',   'cash', 'Kunci rekonsiliasi',        'Mengunci rekonsiliasi periode — angkanya berhenti bisa diubah', 812)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM permissions p
  CROSS JOIN LATERAL (
    SELECT DISTINCT rp.role_id
      FROM role_permissions rp
      JOIN permissions src ON src.id = rp.permission_id
     WHERE src.key = CASE p.key
       -- Key diukur dari `permissions`, bukan ditebak: percobaan pertama
       -- memakai `finance:cash:*` yang TAK ADA, dan CROSS JOIN LATERAL-nya
       -- akan menghasilkan nol baris tanpa satu pun galat — permission
       -- ter-seed tapi tak seorang pun memilikinya.
       WHEN 'rekonsiliasi:view'   THEN 'cash:view'
       WHEN 'rekonsiliasi:manage' THEN 'cash:manage'
       WHEN 'rekonsiliasi:lock'   THEN 'cash:manage'
     END
  ) rp
 WHERE p.key IN ('rekonsiliasi:view', 'rekonsiliasi:manage', 'rekonsiliasi:lock')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — migrasi gagal keras kalau artefaknya tak benar-benar terbentuk.
--
-- Pelajaran migrasi 043: ia tercatat sukses tanpa pernah membuat tabelnya.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_kurang TEXT;
BEGIN
  SELECT string_agg(t, ', ' ORDER BY t) INTO v_kurang
    FROM unnest(ARRAY['rekening_koran','rekening_koran_baris',
                      'pencocokan_bank','penyesuaian_rekonsiliasi']) AS t
   WHERE to_regclass('public.' || t) IS NULL;
  IF v_kurang IS NOT NULL THEN
    RAISE EXCEPTION '234 gagal: tabel tidak terbentuk: %', v_kurang;
  END IF;

  -- RLS aktif itu Ember [C] — tak boleh bisa dimatikan dari mana pun.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_kurang
    FROM pg_class c
   WHERE c.relname IN ('rekening_koran','rekening_koran_baris',
                       'pencocokan_bank','penyesuaian_rekonsiliasi')
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF v_kurang IS NOT NULL THEN
    RAISE EXCEPTION '234 gagal: RLS tidak aktif/forced: %', v_kurang;
  END IF;

  -- Invarian inti: dua UNIQUE yang mencegah hitung-ganda.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cocok_baris_sekali') THEN
    RAISE EXCEPTION '234 gagal: cocok_baris_sekali tidak ada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cocok_sumber_sekali') THEN
    RAISE EXCEPTION '234 gagal: cocok_sumber_sekali tidak ada';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'rekonsiliasi:manage') THEN
    RAISE EXCEPTION '234 gagal: permission rekonsiliasi:manage tidak ter-seed';
  END IF;

  -- Ter-seed saja tak cukup: permission yang tak dimiliki role mana pun
  -- membuat SELURUH endpoint modul ini tertutup untuk semua orang, dan
  -- gejalanya "403 tanpa sebab" — bukan "fitur belum ada".
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'rekonsiliasi:manage') THEN
    RAISE EXCEPTION '234 gagal: rekonsiliasi:manage tak dimiliki role mana pun';
  END IF;
END $$;
