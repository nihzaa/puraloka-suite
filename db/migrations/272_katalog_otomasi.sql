-- ============================================================================
-- 272 — KATALOG OTOMASI: workflow n8n terlihat dari UI, beserta jejaknya (S7)
-- ============================================================================
--
-- ── Yang diminta founder
--
-- "bahkan bisa punya workflow yang bisa dibuat di ui, dan semua workflow yang
-- ada di n8n juga di ui bisa dilihat statusnya dan log aktifitasnya."
--
-- ── Yang DIUKUR di TJS lebih dulu, bukan dikarang
--
-- `automation-tjs/admin-dashboard` punya 6 endpoint (registry, executions,
-- health, health/sync, toggle, trigger, replay) dan 3 halaman. 43 berkas
-- workflow JSON. Dua keputusan strukturnya ditiru karena keduanya terbukti:
--
--   1. KATALOG TERPISAH DARI n8n. `WorkflowRegistry` adalah tabel sendiri,
--      bukan bayangan langsung isi n8n. Akibatnya katalog tetap terbaca saat
--      n8n mati — dan halaman yang kosong total ketika n8n tak terjangkau
--      adalah halaman yang tak bisa dipakai justru pada saat paling dibutuhkan.
--
--   2. KESEHATAN TERPISAH DARI KATALOG, dan diselaraskan berkala. TJS menulis
--      alasannya: callback per-eksekusi "rawan drift kalau n8n gagal
--      memanggilnya karena network blip". Jadi ada rekonsiliasi yang menghitung
--      ULANG dari log, bukan menambah counter.
--
-- ── Yang TIDAK ditiru, dan kenapa
--
-- TJS menjembatani DUA NAMESPACE yang tak bisa di-join: `AutomationLog`
-- memakai nama event ERP ("PR_SUBMITTED"), `WorkflowHealth` memakai n8n
-- workflow id ("9Vi0KbXPOuGvxQWk"). Jembatannya peta event→webhook yang
-- ditulis tangan di kode, dan event yang tak ter-map dilewati.
--
-- Itu utang bentuk, bukan keputusan — dan TJS sendiri harus menulis 27 baris
-- komentar untuk menjelaskannya. Di sini SATU namespace: `otomasi_jalan`
-- menunjuk `otomasi_alur(id)` lewat foreign key. Tak ada yang perlu
-- dijembatani, jadi tak ada yang bisa gagal dijembatani.
--
-- Konsekuensinya jujur: jalannya workflow yang BELUM terdaftar di katalog tak
-- bisa dicatat. Itu disengaja — baris jalan tanpa induk adalah persis
-- "unmapped" yang TJS laporkan, hanya saja ditolak di pintu masuk alih-alih
-- ditemukan sesudahnya.
-- ============================================================================

CREATE TABLE IF NOT EXISTS otomasi_alur (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  /*
   * Kode stabil milik KITA, bukan id milik n8n.
   *
   * Id n8n berubah saat workflow di-impor ulang ke instance lain — dan kalau
   * kode kita ikut berubah, seluruh jejak jalannya terputus dari induknya.
   * Kode ini yang dipakai memanggil dan mencatat; `n8n_id` hanya alamat.
   */
  kode        TEXT NOT NULL,
  nama        TEXT NOT NULL,
  keterangan  TEXT,

  /** Alamat di n8n. Boleh NULL: alur bisa didaftarkan sebelum dibuat di sana. */
  n8n_id      TEXT,
  /** Path webhook, kalau pemicunya webhook. */
  jalur_webhook TEXT,

  /** 'webhook' | 'jadwal' | 'manual'. Bebas teks, alasan sama dengan 266. */
  pemicu      TEXT NOT NULL DEFAULT 'manual',
  jadwal_cron TEXT,

  kategori    TEXT NOT NULL DEFAULT 'umum',
  aktif       BOOLEAN NOT NULL DEFAULT true,

  /*
   * Kesehatan disimpan DI SINI, bukan di tabel terpisah seperti TJS.
   *
   * TJS memisahkannya karena `WorkflowHealth` di sana dipakai lintas sumber
   * (callback n8n, sync, trigger manual) dengan namespace berbeda-beda. Di
   * sini sumbernya satu — `otomasi_jalan` — jadi memisahkannya hanya menambah
   * tabel yang harus dijaga tetap sinkron dengan tabel lain.
   *
   * Nilainya TURUNAN, dihitung ulang dari `otomasi_jalan` (lihat
   * `segarkanKesehatanAlur` di kode). Turunan yang disimpan bisa basi, jadi
   * `kesehatan_pada` ikut disimpan supaya BASINYA TERLIHAT — angka tanpa
   * waktu-ukur menyuruh orang memercayainya tanpa cara memeriksa.
   */
  kesehatan       TEXT NOT NULL DEFAULT 'belum_diketahui',
  kesehatan_pada  TIMESTAMPTZ,
  jalan_terakhir  TIMESTAMPTZ,
  sukses_terakhir TIMESTAMPTZ,
  gagal_terakhir  TIMESTAMPTZ,
  pesan_gagal     TEXT,

  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_oleh UUID REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE (company_id, kode)
);

CREATE INDEX IF NOT EXISTS idx_otomasi_alur_cari
  ON otomasi_alur (company_id, aktif, kategori);

COMMENT ON TABLE otomasi_alur IS
  'Katalog workflow otomasi. TERPISAH dari n8n supaya katalognya tetap '
  'terbaca saat n8n tak terjangkau — halaman yang kosong total justru saat '
  'n8n mati adalah halaman yang gagal pada saat paling dibutuhkan.';

-- ── Jejak jalan ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otomasi_jalan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- SATU namespace. Lihat kepala berkas: inilah yang membuat rekonsiliasi
  -- TJS (peta event→webhook, plus daftar "unmapped") tak diperlukan di sini.
  alur_id     UUID NOT NULL REFERENCES otomasi_alur(id) ON DELETE CASCADE,

  /** 'jalan' | 'sukses' | 'gagal'. */
  status      TEXT NOT NULL CHECK (status IN ('jalan', 'sukses', 'gagal')),
  /** 'manual' | 'jadwal' | 'peristiwa'. Siapa yang memicunya. */
  sumber      TEXT NOT NULL DEFAULT 'manual',
  /** Id eksekusi di n8n — untuk membuka jejaknya di sana. */
  n8n_jalan_id TEXT,

  dimulai_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  selesai_pada TIMESTAMPTZ,
  durasi_ms    INTEGER,
  pesan        TEXT,

  /** Siapa yang menekan tombolnya, kalau manual. */
  oleh        UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_otomasi_jalan_alur
  ON otomasi_jalan (alur_id, dimulai_pada DESC);

COMMENT ON TABLE otomasi_jalan IS
  'Jejak tiap jalannya alur otomasi. Menunjuk otomasi_alur lewat FK — SATU '
  'namespace, tak seperti TJS yang harus menjembatani nama event ERP dengan '
  'n8n workflow id lewat peta yang ditulis tangan.';

-- ── RLS: pola yang sama dengan 260/263/266/269/270 ─────────────────────────
ALTER TABLE otomasi_alur  ENABLE ROW LEVEL SECURITY;
ALTER TABLE otomasi_jalan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS otomasi_alur_dasar ON otomasi_alur;
CREATE POLICY otomasi_alur_dasar ON otomasi_alur FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_isolation ON otomasi_alur;
CREATE POLICY tenant_isolation ON otomasi_alur
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS otomasi_jalan_dasar ON otomasi_jalan;
CREATE POLICY otomasi_jalan_dasar ON otomasi_jalan FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_isolation ON otomasi_jalan;
CREATE POLICY tenant_isolation ON otomasi_jalan
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── Permission ─────────────────────────────────────────────────────────────
--
-- MELIHAT dan MENJALANKAN dipisah. Yang boleh memeriksa kenapa notifikasi tak
-- terkirim bukan otomatis yang boleh memicu ulang pengirimannya — dan memicu
-- alur yang mengirim pesan ke pelanggan adalah tindakan yang terlihat keluar.
INSERT INTO permissions (key, label, description, module, sort_order)
VALUES
  ('otomasi:alur:lihat', 'Lihat Alur Otomasi',
   'Melihat katalog workflow, status, dan jejak jalannya', 'ai', 40),
  ('otomasi:alur:kelola', 'Kelola Alur Otomasi',
   'Menambah/mengubah katalog alur dan menyalakan-mematikannya', 'ai', 41),
  ('otomasi:alur:jalankan', 'Jalankan Alur Otomasi',
   'Memicu alur secara manual dari UI', 'ai', 42)
ON CONFLICT (key) DO NOTHING;

-- Diberikan ke `admin` DI MIGRASI INI — pelajaran 271: permission yang dibuat
-- tanpa pemegang membuat fiturnya mati tanpa satu pun galat, dan ketahuannya
-- baru dari tangkapan layar.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE r.name = 'admin'
   AND p.key IN ('otomasi:alur:lihat', 'otomasi:alur:kelola', 'otomasi:alur:jalankan')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int; v_comp UUID; v_alur UUID;
BEGIN
  IF to_regclass('public.otomasi_alur') IS NULL
     OR to_regclass('public.otomasi_jalan') IS NULL THEN
    RAISE EXCEPTION '272 gagal: tabel tidak terbentuk';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('otomasi_alur', 'otomasi_jalan')
     AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE';
  IF n <> 2 THEN
    RAISE EXCEPTION '272 gagal: tenant_isolation belum RESTRICTIVE di kedua tabel';
  END IF;

  SELECT c.id INTO v_comp FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1;

  IF v_comp IS NOT NULL THEN
    INSERT INTO otomasi_alur (company_id, kode, nama)
    VALUES (v_comp, 'uji-272', 'Uji 272') RETURNING id INTO v_alur;

    -- Kode ganda per tenant WAJIB ditolak: dua alur berkode sama membuat
    -- pemanggil menjalankan yang mana saja.
    BEGIN
      INSERT INTO otomasi_alur (company_id, kode, nama) VALUES (v_comp, 'uji-272', 'Ganda');
      RAISE EXCEPTION '272 gagal: kode alur ganda tidak ditolak';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    -- Status di luar tiga nilai WAJIB ditolak. Status karangan membuat
    -- hitungan sukses/gagal diam-diam salah.
    BEGIN
      INSERT INTO otomasi_jalan (company_id, alur_id, status)
      VALUES (v_comp, v_alur, 'entah');
      RAISE EXCEPTION '272 gagal: status jalan karangan tidak ditolak';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- Jejak jalan TANPA induk WAJIB ditolak — inilah "unmapped" TJS,
    -- ditolak di pintu masuk alih-alih ditemukan belakangan.
    BEGIN
      INSERT INTO otomasi_jalan (company_id, alur_id, status)
      VALUES (v_comp, gen_random_uuid(), 'sukses');
      RAISE EXCEPTION '272 gagal: jejak jalan tanpa induk tidak ditolak';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- Menghapus alur WAJIB membawa jejaknya (ON DELETE CASCADE) — jejak
    -- yatim tak bisa dibaca siapa pun dan hanya menumpuk.
    INSERT INTO otomasi_jalan (company_id, alur_id, status)
    VALUES (v_comp, v_alur, 'sukses');
    DELETE FROM otomasi_alur WHERE id = v_alur;
    SELECT count(*) INTO n FROM otomasi_jalan WHERE alur_id = v_alur;
    IF n <> 0 THEN
      RAISE EXCEPTION '272 gagal: jejak jalan tak ikut terhapus (% tersisa)', n;
    END IF;
  END IF;

  -- Ketiga permission WAJIB punya pemegang — pelajaran 271.
  SELECT count(DISTINCT p.key) INTO n
    FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
   WHERE p.key IN ('otomasi:alur:lihat', 'otomasi:alur:kelola', 'otomasi:alur:jalankan');
  IF n <> 3 THEN
    RAISE EXCEPTION '272 gagal: izin otomasi masih yatim (% dari 3 punya pemegang)', n;
  END IF;
END $$;
