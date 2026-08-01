-- Migration 157: DUA modul RFI — Inspeksi & Informasi — ROADMAP #24
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA DUA, BUKAN SATU
-- ══════════════════════════════════════════════════════════════════════════
--
-- Dokumen proyek konflik soal apa itu "RFI", dan keduanya dokumen resmi:
--   · `ERP-KONTRAKTOR-TAKSONOMI-MENU.md` + peta menu → Request for INSPECTION
--   · `Master-Delivery-Blueprint` + `00-vision`      → Request for INFORMATION
--
-- Ini bukan salah ketik di salah satu pihak: dalam praktik konstruksi KEDUANYA
-- nyata, dan alur kerjanya berbeda sama sekali —
--
--   INSPEKSI  — kontraktor minta pengawas MEMERIKSA pekerjaan sebelum ditutup
--               (sebelum cor, sebelum plester). Hasil: lolos / tidak lolos.
--               Harian, di lapangan, dari HP. Yang tidak lolos jadi temuan
--               punch list — modul yang baru selesai (156).
--
--   INFORMASI — kontraktor BERTANYA resmi ke konsultan/owner soal gambar atau
--               spesifikasi yang ambigu. Hasil: jawaban tertulis yang mengikat.
--               Mingguan, di kantor, dan jawabannya jadi bukti saat ada klaim.
--               Jawaban yang telat MENGHENTIKAN pekerjaan → dasar klaim EOT.
--
-- Memaksa keduanya jadi satu tabel berarti satu dari dua alur kerja kehilangan
-- kolom yang menentukan artinya: inspeksi butuh "lolos/tidak", informasi butuh
-- "berapa hari menggantung". Founder memilih membangun keduanya, menu dipisah.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KATEGORI TENANCY: C (lewat `project_id`) — sama seperti punch_items (156)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Baik permintaan inspeksi maupun pertanyaan ke konsultan SELALU milik satu
-- proyek. Tak ada katalog bersama, tak ada yang lintas proyek.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- BAGIAN 1 — REQUEST FOR INSPECTION (izin cor / izin tutup)
-- ══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE inspeksi_status AS ENUM (
    'diminta',      -- mandor mengajukan, pengawas belum datang
    'dijadwalkan',  -- pengawas menetapkan waktu
    'lolos',        -- boleh dilanjutkan / ditutup
    'tidak_lolos',  -- harus diperbaiki dulu
    'dibatalkan'    -- permintaan ditarik (mis. pekerjaan belum siap)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inspection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor TEXT NOT NULL,

  judul TEXT NOT NULL,              -- "Pengecoran kolom lantai 2"
  lokasi TEXT,
  catatan TEXT,

  -- Apa yang akan terjadi kalau ini lolos. Inilah yang membuat inspeksi
  -- MENDESAK — bukan tanggalnya, tapi bahwa pekerjaan berikutnya menunggu.
  pekerjaan_lanjutan TEXT,

  status inspeksi_status NOT NULL DEFAULT 'diminta',
  rab_item_id UUID REFERENCES rab_items(id) ON DELETE SET NULL,
  work_scope_id UUID REFERENCES work_scopes(id) ON DELETE SET NULL,

  diminta_oleh UUID NOT NULL REFERENCES users(id),
  diminta_untuk TIMESTAMPTZ,        -- kapan pemohon berharap diperiksa

  -- Pemeriksa TERPISAH dari pemohon — alasan yang sama dengan punch:verify
  -- (156 keputusan #4): yang mengerjakan tak menyatakan pekerjaannya lolos.
  diperiksa_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  diperiksa_pada TIMESTAMPTZ,
  hasil_catatan TEXT,

  -- Yang TIDAK LOLOS melahirkan temuan punch list. Tautannya disimpan supaya
  -- rantainya bisa ditelusuri: inspeksi gagal → cacat apa → sudah ditutup belum.
  punch_item_id UUID REFERENCES punch_items(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Hasil pemeriksaan harus punya PEMERIKSA dan WAKTU. Tanpa itu "lolos"
  -- cuma berarti seseorang mengubah dropdown — dan izin cor adalah keputusan
  -- yang dipertanggungjawabkan, bukan penanda administratif.
  CONSTRAINT inspeksi_hasil_berpemeriksa CHECK (
    status NOT IN ('lolos', 'tidak_lolos')
    OR (diperiksa_oleh IS NOT NULL AND diperiksa_pada IS NOT NULL)
  ),
  -- Tidak lolos WAJIB beralasan: pemohon harus tahu apa yang diperbaiki.
  CONSTRAINT inspeksi_gagal_beralasan CHECK (
    status <> 'tidak_lolos'
    OR (hasil_catatan IS NOT NULL AND length(trim(hasil_catatan)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inspection_project_nomor
  ON inspection_requests (project_id, nomor);
CREATE INDEX IF NOT EXISTS idx_inspection_project_status
  ON inspection_requests (project_id, status);
CREATE INDEX IF NOT EXISTS idx_inspection_menunggu
  ON inspection_requests (project_id, diminta_untuk)
  WHERE status IN ('diminta', 'dijadwalkan');

-- ══════════════════════════════════════════════════════════════════════════
-- BAGIAN 2 — REQUEST FOR INFORMATION (pertanyaan resmi ke konsultan/owner)
-- ══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE rfi_status AS ENUM (
    'draft',
    'terkirim',     -- sudah dilayangkan, menunggu jawaban
    'dijawab',      -- jawaban diterima
    'ditutup',      -- jawaban diterima DAN dampaknya sudah ditindaklanjuti
    'dibatalkan'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS information_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor TEXT NOT NULL,

  perihal TEXT NOT NULL,
  pertanyaan TEXT NOT NULL,
  ditujukan_ke TEXT,                -- "Konsultan struktur PT X" — pihak LUAR,
                                    -- jadi teks, bukan FK ke users.
  referensi_gambar TEXT,            -- "Gambar S-04 rev.2, detail B3"

  status rfi_status NOT NULL DEFAULT 'draft',

  -- Tanggal-tanggal ini yang membuat modul ini berbeda dari kotak surat:
  -- selisih `dikirim_pada` → `dijawab_pada` adalah berapa lama pekerjaan
  -- menggantung, dan itulah angka yang dibawa ke klaim EOT.
  dikirim_pada TIMESTAMPTZ,
  jawaban_diharapkan DATE,
  dijawab_pada TIMESTAMPTZ,
  jawaban TEXT,
  dijawab_oleh TEXT,                -- nama orang di pihak luar

  -- Apakah pertanyaan ini benar-benar menghentikan pekerjaan. Dibedakan dari
  -- severity: pertanyaan bisa penting tapi tidak memblokir, dan hanya yang
  -- MEMBLOKIR yang layak jadi dasar klaim waktu.
  menghentikan_pekerjaan BOOLEAN NOT NULL DEFAULT false,
  pekerjaan_terdampak TEXT,

  -- Tautan ke klaim EOT yang lahir dari keterlambatan jawaban. Nullable:
  -- sebagian besar RFI dijawab tepat waktu dan tak melahirkan klaim apa pun.
  eot_id UUID REFERENCES contract_eot(id) ON DELETE SET NULL,

  diajukan_oleh UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Terkirim harus punya TANGGAL KIRIM. Tanpa itu lama-menggantung tak bisa
  -- dihitung, dan seluruh nilai modul ini hilang — ia jadi kotak surat biasa.
  CONSTRAINT rfi_terkirim_bertanggal CHECK (
    status = 'draft' OR status = 'dibatalkan' OR dikirim_pada IS NOT NULL
  ),
  -- Dijawab harus punya ISI JAWABAN dan tanggalnya.
  CONSTRAINT rfi_dijawab_berisi CHECK (
    status NOT IN ('dijawab', 'ditutup')
    OR (dijawab_pada IS NOT NULL AND jawaban IS NOT NULL AND length(trim(jawaban)) > 0)
  ),
  -- Jawaban tak boleh mendahului pengiriman. Urutan terbalik membuat
  -- lama-menggantung NEGATIF, dan angka negatif di berkas klaim adalah cacat
  -- yang baru ketahuan di meja arbitrase.
  CONSTRAINT rfi_urutan_waktu CHECK (
    dijawab_pada IS NULL OR dikirim_pada IS NULL OR dijawab_pada >= dikirim_pada
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_information_project_nomor
  ON information_requests (project_id, nomor);
CREATE INDEX IF NOT EXISTS idx_information_project_status
  ON information_requests (project_id, status);
-- Yang menggantung DAN memblokir — pertanyaan yang paling mahal.
CREATE INDEX IF NOT EXISTS idx_information_menggantung
  ON information_requests (project_id, jawaban_diharapkan)
  WHERE status = 'terkirim';

-- ── Trigger updated_at ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_inspection_updated ON inspection_requests;
CREATE TRIGGER trg_inspection_updated BEFORE UPDATE ON inspection_requests
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_information_updated ON information_requests;
CREATE TRIGGER trg_information_updated BEFORE UPDATE ON information_requests
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Kategori C. RESTRICTIVE tanpa PERMISSIVE = tabel MATI TOTAL (pelajaran
-- 149/150). Nama policy WAJIB `tenant_isolation` (dijaga t5a/t7).
ALTER TABLE inspection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE information_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON inspection_requests;
CREATE POLICY tenant_isolation ON inspection_requests AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = inspection_requests.project_id
                   AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = inspection_requests.project_id
                        AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON information_requests;
CREATE POLICY tenant_isolation ON information_requests AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = information_requests.project_id
                   AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = information_requests.project_id
                        AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS inspeksi_baca ON inspection_requests;
CREATE POLICY inspeksi_baca ON inspection_requests FOR SELECT TO authenticated
  USING ((SELECT has_permission('inspeksi:view')));
DROP POLICY IF EXISTS inspeksi_kelola ON inspection_requests;
CREATE POLICY inspeksi_kelola ON inspection_requests FOR ALL TO authenticated
  USING ((SELECT has_permission('inspeksi:manage')))
  WITH CHECK ((SELECT has_permission('inspeksi:manage')));

DROP POLICY IF EXISTS rfi_baca ON information_requests;
CREATE POLICY rfi_baca ON information_requests FOR SELECT TO authenticated
  USING ((SELECT has_permission('rfi:view')));
DROP POLICY IF EXISTS rfi_kelola ON information_requests;
CREATE POLICY rfi_kelola ON information_requests FOR ALL TO authenticated
  USING ((SELECT has_permission('rfi:manage')))
  WITH CHECK ((SELECT has_permission('rfi:manage')));

-- ── Permission ──────────────────────────────────────────────────────────────
-- `inspeksi:periksa` TERPISAH dari `inspeksi:manage` — pola yang sama dengan
-- `punch:verify` (156). Mandor mengajukan permintaan; yang MEMUTUSKAN lolos
-- harus orang lain. Kalau satu permission, mandor memberi izin cor pada
-- pekerjaannya sendiri.
--
-- RFI-Informasi TIDAK punya pemisahan serupa: yang menjawab adalah pihak LUAR
-- (konsultan), jadi pemisahannya sudah terjadi di luar sistem. Menambah
-- capability ketiga di sini hanya akan jadi gerbang yang tak menjaga apa pun.
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('inspeksi:view',    'lapangan', 'Lihat Permintaan Inspeksi',
   'Melihat daftar permintaan pemeriksaan dan hasilnya', 620),
  ('inspeksi:manage',  'lapangan', 'Ajukan Permintaan Inspeksi',
   'Mengajukan permintaan pemeriksaan sebelum pekerjaan ditutup', 621),
  ('inspeksi:periksa', 'lapangan', 'Putuskan Hasil Inspeksi',
   'Menyatakan pekerjaan lolos atau tidak lolos — sengaja terpisah dari '
   'pengajuan, supaya pemohon tidak memberi izin pada pekerjaannya sendiri', 622),
  ('rfi:view',   'kontrak', 'Lihat RFI',
   'Melihat pertanyaan resmi ke konsultan/pemberi kerja beserta jawabannya', 630),
  ('rfi:manage', 'kontrak', 'Kelola RFI',
   'Mengajukan pertanyaan resmi, mencatat jawaban, dan menautkannya ke klaim waktu', 631)
ON CONFLICT (key) DO NOTHING;

-- Penerima DITURUNKAN dari capability yang sudah berlaku (ADR-004), bukan
-- disebut per nama role — kalau tidak, role kustom yang founder buat lewat UI
-- tak kebagian dan tak ada yang tahu sampai orangnya mengeluh.
--
-- ⚠️ Capability sumber diverifikasi ADA lebih dulu; `INSERT … SELECT` yang tak
-- cocok menghasilkan NOL BARIS tanpa satu pun error (pelajaran 156, di mana
-- `progress:approve` ternyata tak pernah ada). Blok verifikasi di bawah
-- MENGHITUNG hasilnya.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'inspeksi:view'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'projects:view')
ON CONFLICT DO NOTHING;

-- Mengajukan = pekerjaan orang lapangan (sama seperti `punch:manage`).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'inspeksi:manage'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'mandor:view')
ON CONFLICT DO NOTHING;

-- Memutuskan lolos = wewenang menyetujui pekerjaan lapangan.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'inspeksi:periksa'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'mandor:wage:approve')
ON CONFLICT DO NOTHING;

-- RFI ke konsultan = urusan kontrak, bukan lapangan. Diturunkan dari
-- `projects:contract` supaya lingkupnya sama dengan EOT/bond/CO yang sudah ada.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('rfi:view', 'rfi:manage')
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'projects:contract')
ON CONFLICT DO NOTHING;

-- Melihat RFI lebih luas daripada mengelolanya: mandor perlu tahu jawaban
-- konsultan atas gambar yang sedang ia kerjakan.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'rfi:view'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'mandor:view')
ON CONFLICT DO NOTHING;

-- ── Menu ────────────────────────────────────────────────────────────────────
-- `lp-rfi` sudah terdaftar (153) dan memang berarti INSPEKSI di taksonomi.
UPDATE menu_items
   SET href = '/lapangan/inspeksi', required_permissions = ARRAY['inspeksi:view']
 WHERE key = 'lp-rfi';

-- RFI-Informasi entri BARU, di grup Kontrak — bukan Lapangan. Tempatnya
-- mengikuti siapa yang memakainya dan apa akibatnya: ia bertetangga dengan
-- Claims dan EOT, karena ke situlah jawaban yang telat bermuara.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'kt-rfi', 'Request for Information', '/kontrak/rfi', 'MessageSquareQuote',
       (SELECT id FROM menu_items WHERE key = 'g-kontrak'),
       ARRAY['rfi:view'],
       COALESCE((SELECT sort_order FROM menu_items WHERE key = 'kt-claims'), 50) + 1,
       (SELECT section FROM menu_items WHERE key = 'g-kontrak'), true
ON CONFLICT (key) DO UPDATE
   SET href = EXCLUDED.href, required_permissions = EXCLUDED.required_permissions;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE n INT; k TEXT;
BEGIN
  IF to_regclass(current_schema() || '.inspection_requests') IS NULL THEN
    RAISE EXCEPTION '157 GAGAL: inspection_requests tak terbentuk';
  END IF;
  IF to_regclass(current_schema() || '.information_requests') IS NULL THEN
    RAISE EXCEPTION '157 GAGAL: information_requests tak terbentuk';
  END IF;

  -- RESTRICTIVE tanpa PERMISSIVE = tabel mati total (149/150).
  FOR k IN SELECT unnest(ARRAY['inspection_requests', 'information_requests']) LOOP
    IF (SELECT count(*) FROM pg_policies
         WHERE schemaname = current_schema() AND tablename = k
           AND permissive = 'PERMISSIVE') = 0 THEN
      RAISE EXCEPTION '157 GAGAL: % nol policy permissive — tabel mati total', k;
    END IF;
  END LOOP;

  -- Keunikan nomor PER PROYEK, bukan global (cacat 045/145/146/155).
  FOR k IN SELECT unnest(ARRAY['uq_inspection_project_nomor', 'uq_information_project_nomor']) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname = current_schema() AND indexname = k) THEN
      RAISE EXCEPTION '157 GAGAL: indeks % tak terbentuk', k;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM permissions WHERE key LIKE 'inspeksi:%' OR key LIKE 'rfi:%';
  IF n <> 5 THEN
    RAISE EXCEPTION '157 GAGAL: permission inspeksi/rfi = % (harus 5)', n;
  END IF;

  -- Seed turunan GAGAL DIAM-DIAM kalau capability sumbernya salah nama.
  FOR k IN
    SELECT v.k FROM (VALUES ('inspeksi:view'), ('inspeksi:manage'), ('inspeksi:periksa'),
                            ('rfi:view'), ('rfi:manage')) v(k)
     WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp
                         JOIN permissions p ON p.id = rp.permission_id WHERE p.key = v.k)
  LOOP
    RAISE EXCEPTION '157 GAGAL: permission % NOL role memegangnya — capability '
      'sumber turunannya kemungkinan salah nama', k;
  END LOOP;

  -- Pemohon tak boleh memutuskan hasil pemeriksaannya sendiri.
  IF EXISTS (SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
               JOIN permissions p ON p.id = rp.permission_id
              WHERE r.name = 'mandor' AND p.key = 'inspeksi:periksa') THEN
    RAISE EXCEPTION '157 GAGAL: mandor mendapat inspeksi:periksa — pemohon memberi izin sendiri';
  END IF;

  -- Tapi mandor HARUS bisa mengajukan — kalau tidak, modulnya tanpa pengguna.
  IF NOT EXISTS (SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
                   JOIN permissions p ON p.id = rp.permission_id
                  WHERE r.name = 'mandor' AND p.key = 'inspeksi:manage') THEN
    RAISE EXCEPTION '157 GAGAL: mandor tak bisa mengajukan inspeksi — modul tanpa penggunanya';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'lp-rfi' AND href = '/lapangan/inspeksi') THEN
    RAISE EXCEPTION '157 GAGAL: menu lp-rfi tak menunjuk rute inspeksi';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'kt-rfi' AND href = '/kontrak/rfi') THEN
    RAISE EXCEPTION '157 GAGAL: menu kt-rfi tak terbentuk';
  END IF;

  RAISE NOTICE '157 OK: inspection_requests + information_requests, kategori C, 5 capability';
END $$;

COMMIT;
