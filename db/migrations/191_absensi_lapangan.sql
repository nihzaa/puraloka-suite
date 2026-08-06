-- ════════════════════════════════════════════════════════════════════════════
-- 191 — ABSENSI LAPANGAN (F5-1 INTI #9)
--
-- ── Masalah yang diselesaikan
--
-- `wage_items.days_worked` adalah angka yang DIKETIK MANDOR saat menyusun
-- laporan upah mingguan. Tidak ada catatan harian di baliknya. Triase F5-1
-- menyebutnya terus terang: "upah harian dihitung dari ingatan mandor; ini
-- sumber selisih paling sering".
--
-- Selisihnya bukan soal kejujuran. Seorang mandor menyusun laporan hari
-- Sabtu untuk pekerjaan enam hari sebelumnya, untuk 5–15 tukang. Angka yang
-- diingat akan meleset, dan ketika owner menanyakannya tak ada apa pun yang
-- bisa dibuka — hanya dua orang yang sama-sama yakin.
--
-- Tabel ini memberi catatan HARIAN yang menjadi sumber `days_worked`.
--
-- ── Kenapa per (scope, worker, tanggal)
--
-- Satu tukang bisa bekerja di beberapa lingkup dalam satu proyek, dan upah
-- hariannya BERBEDA per lingkup (tukang batu vs pembantu). Kunci uniknya
-- karena itu bertiga, bukan (worker, tanggal): memaksa satu baris per hari
-- akan menghapus kemampuan menghitung upah yang benar.
--
-- ── Kenapa `porsi_hari` numeric, bukan boolean hadir/tidak
--
-- Setengah hari adalah keadaan biasa di lapangan — hujan, tukang datang
-- siang, atau pulang awal karena material habis. Boolean memaksa mandor
-- membulatkan, dan pembulatan itu justru selisih yang hendak dihilangkan.
--
-- 0 (tidak hadir) tetap DICATAT, bukan dihapus. Baris "tidak hadir" adalah
-- keterangan; ketiadaan baris hanya berarti belum diisi. Dua hal itu berbeda
-- dan tak boleh terlihat sama.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS absensi_harian (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kategori C: tenancy DIWARISI lewat work_scopes → mandor_assignments →
  -- projects.company_id. Tak ada `company_id` di sini, dan itu disengaja —
  -- kolom yang bisa berbeda dari induknya adalah kolom yang suatu hari akan
  -- berbeda dari induknya.
  scope_id        UUID NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,
  worker_id       UUID NOT NULL REFERENCES workers(id)     ON DELETE RESTRICT,

  tanggal         DATE NOT NULL,

  -- 0 = tidak hadir · 0.5 = setengah hari · 1 = penuh.
  -- Di atas 1 TIDAK diizinkan: lembur punya kolomnya sendiri, dan
  -- mencampurnya ke sini membuat "berapa hari kerja" jadi angka yang tak bisa
  -- dibaca siapa pun.
  porsi_hari      NUMERIC(3,2) NOT NULL DEFAULT 1,

  -- Jam lembur hari itu. Terpisah dari `porsi_hari` karena tarifnya berbeda
  -- dan perhitungannya berbeda (per jam, bukan per hari).
  jam_lembur      NUMERIC(4,2) NOT NULL DEFAULT 0,

  keterangan      TEXT,

  dicatat_oleh    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu tukang, satu lingkup, satu hari — satu baris.
--
-- Tanpa ini, absen ganda (mandor mengisi dua kali, atau dua orang mengisi
-- untuk tukang yang sama) menggandakan upahnya tanpa satu pun gejala. Itu
-- kebocoran uang yang hanya ketahuan saat seseorang menjumlahkan ulang.
CREATE UNIQUE INDEX IF NOT EXISTS uq_absensi_scope_worker_tanggal
  ON absensi_harian (scope_id, worker_id, tanggal);

CREATE INDEX IF NOT EXISTS idx_absensi_scope_tanggal
  ON absensi_harian (scope_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_absensi_worker_tanggal
  ON absensi_harian (worker_id, tanggal DESC);

-- ── Batas yang bermakna ─────────────────────────────────────────────────────

ALTER TABLE absensi_harian DROP CONSTRAINT IF EXISTS absensi_porsi_masuk_akal;
ALTER TABLE absensi_harian ADD CONSTRAINT absensi_porsi_masuk_akal
  CHECK (porsi_hari >= 0 AND porsi_hari <= 1);

ALTER TABLE absensi_harian DROP CONSTRAINT IF EXISTS absensi_lembur_masuk_akal;
-- 16 jam, bukan 24: lembur melebihi itu bukan data, itu salah ketik. Batas
-- yang longgar tak menolong siapa pun — angka 240 yang lolos akan muncul di
-- laporan upah sebagai nominal yang mustahil.
ALTER TABLE absensi_harian ADD CONSTRAINT absensi_lembur_masuk_akal
  CHECK (jam_lembur >= 0 AND jam_lembur <= 16);

ALTER TABLE absensi_harian DROP CONSTRAINT IF EXISTS absensi_tanggal_masuk_akal;
-- Absensi untuk tanggal yang belum terjadi tak punya arti. Batas bawahnya
-- longgar (2020) supaya migrasi data lama tak terhalang.
ALTER TABLE absensi_harian ADD CONSTRAINT absensi_tanggal_masuk_akal
  CHECK (tanggal >= DATE '2020-01-01' AND tanggal <= CURRENT_DATE + 1);

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Pola punch_items / ncr_items: RESTRICTIVE untuk isolasi tenant, lalu
-- PERMISSIVE untuk izin baca/tulis.
--
-- ⚠️ RESTRICTIVE SAJA MEMBUNUH TABEL: ia di-AND-kan dengan PERMISSIVE, dan
-- tanpa satu pun PERMISSIVE hasilnya selalu nol baris. Gejalanya "tabelnya
-- kosong", bukan "akses ditolak" — jadi mudah disimpulkan sebagai data yang
-- belum diisi.
ALTER TABLE absensi_harian ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON absensi_harian;
CREATE POLICY tenant_isolation ON absensi_harian AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM work_scopes ws
      JOIN mandor_assignments ma ON ma.id = ws.assignment_id
      JOIN projects p            ON p.id  = ma.project_id
     WHERE ws.id = absensi_harian.scope_id
       AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM work_scopes ws
      JOIN mandor_assignments ma ON ma.id = ws.assignment_id
      JOIN projects p            ON p.id  = ma.project_id
     WHERE ws.id = absensi_harian.scope_id
       AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS absensi_baca ON absensi_harian;
CREATE POLICY absensi_baca ON absensi_harian
  FOR SELECT USING (true);

DROP POLICY IF EXISTS absensi_kelola ON absensi_harian;
CREATE POLICY absensi_kelola ON absensi_harian
  FOR ALL USING (true) WITH CHECK (true);

-- ── updated_at ──────────────────────────────────────────────────────────────
--
-- Namanya `trigger_set_updated_at`, BUKAN `set_updated_at` — diverifikasi ke
-- `pg_proc`, bukan ditebak. Migrasi 189 mencatat jebakan yang sama; basis ini
-- punya 25 fungsi bernama mirip dan hanya satu yang generik.
DROP TRIGGER IF EXISTS trg_absensi_updated_at ON absensi_harian;
CREATE TRIGGER trg_absensi_updated_at
  BEFORE UPDATE ON absensi_harian
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── Menu ────────────────────────────────────────────────────────────────────
--
-- Ditaruh di grup "Mandor & Subkon" (`g-subkon`), bukan Mobile: yang mencatat
-- absensi adalah mandor lewat portalnya, tapi yang MEMERIKSA adalah admin/PM
-- dari dashboard — dan pemeriksaan itu yang menentukan pembayaran.
--
-- Ditaruh SEBELUM "Upah Harian & Borongan" (813), karena absensi adalah
-- sumber angka yang dipakai halaman itu — urutan menunya mengikuti urutan
-- kerjanya: absensi → upah → settlement.
--
-- Kunci, prefiks, ikon, dan `required_permissions` mengikuti 14 saudaranya —
-- diverifikasi dengan MEMBACA barisnya, bukan menebak polanya. Percobaan
-- pertama memakai induk `grp-mandor` yang tidak ada; menu itu akan hilang
-- tanpa satu pun galat, dan fiturnya jadi tak bisa ditemukan siapa pun.
UPDATE menu_items SET sort_order = sort_order + 1
 WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-subkon')
   AND sort_order >= 813
   AND NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'sk-absensi');

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'sk-absensi', 'Absensi Lapangan', '/mandor/absensi', 'Dot',
       (SELECT id FROM menu_items WHERE key = 'g-subkon' LIMIT 1),
       ARRAY[]::text[], 813, 'main', true
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'sk-absensi')
   AND EXISTS (SELECT 1 FROM menu_items WHERE key = 'g-subkon');
