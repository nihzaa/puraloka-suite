-- ════════════════════════════════════════════════════════════════════════════
-- 303 — Baseline jadwal: rencana yang TIDAK ikut bergeser (G6b)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat yang ditemukan dengan mengukur, dan kenapa ia yang paling halus
--
-- `rab_items.planned_start` / `planned_end` sudah ada dan HIDUP — dipakai
-- Gantt, Kurva-S, look-ahead, dan portal klien (6 berkas, 15 item berjadwal
-- pada 2 proyek). Yang tak ada: **nol kolom baseline** di seluruh skema.
--
-- Artinya jadwal boleh digeser kapan saja tanpa meninggalkan jejak. Sendirian
-- itu terdengar seperti keleluasaan yang wajar. Yang membuatnya berbahaya
-- adalah apa yang bergantung padanya:
--
--     lib/evm-calculation.ts:44   spi = ev / pv
--     lib/rencana-dari-gantt.ts   PV diturunkan dari planned_start/end
--
-- **SPI dihitung terhadap jadwal yang bisa ikut bergeser.** Setiap kali
-- tanggal rencana dimundurkan, PV ikut mundur, dan SPI kembali mendekati 1.
-- Proyek yang terlambat tiga bulan menampilkan SPI 0,98 — dan tak ada satu
-- pun galat, tak ada baris merah, tak ada yang bisa membantahnya karena
-- rencana pembandingnya sudah tidak ada.
--
-- Ini bentuk kegagalan yang paling mahal di modul jadwal: **bukan angka yang
-- salah, melainkan angka yang selalu benar.**
--
-- ── Yang dibangun: baseline TERPISAH, bukan kolom di rab_items
--
-- Menaruh `baseline_start` di `rab_items` akan bekerja untuk satu baseline
-- saja. Kenyataan konstruksi punya lebih dari satu: kontrak awal, lalu
-- adendum karena perubahan lingkup, lalu perpanjangan waktu yang disetujui.
-- Masing-masing SAH sebagai pembanding untuk periodenya, dan pertanyaan
-- "terlambat terhadap yang mana?" harus punya jawaban.
--
-- Karena itu: `baseline_jadwal` (kepala, satu per penetapan) +
-- `baseline_jadwal_item` (salinan tanggal saat itu).
--
-- ── Kenapa salinan, bukan rujukan
--
-- Baseline adalah PERNYATAAN tentang apa yang dijanjikan pada suatu tanggal.
-- Kalau ia hanya merujuk `rab_items`, ia ikut berubah saat itemnya disunting
-- — dan pembanding yang ikut berubah bukan pembanding.
--
-- Pelajaran yang sama sudah dibayar dua kali: slip gaji menyimpan hasilnya
-- (G2c), dan markup tersalin ke `estimate_versions` (G6a).
--
-- ── Ember [C]? TIDAK, tapi mendekat
--
-- Baseline yang bisa diubah diam-diam sama saja dengan tak ada baseline.
-- Karena itu item baseline dibuat **append-only lewat trigger** — sama
-- polanya dengan `periode_akuntansi_riwayat` (296). Yang boleh: menetapkan
-- baseline BARU. Yang tidak: menyunting yang lama.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Kepala baseline
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseline_jadwal (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Nomor urut per proyek. Ditulis aplikasi, dijaga UNIQUE — "Baseline #2"
  -- lebih bisa dirujuk dalam rapat daripada UUID.
  nomor         INT NOT NULL,

  nama          TEXT NOT NULL,

  -- Kenapa baseline ini ditetapkan. WAJIB dan minimal 10 huruf: baseline
  -- tanpa sebab membuat "kenapa jadwalnya berubah?" tak terjawab, dan
  -- justru itu pertanyaan yang muncul saat klaim keterlambatan dibahas.
  alasan        TEXT NOT NULL,

  -- Rujukan ke dokumen yang mengesahkan (adendum, surat perpanjangan waktu).
  -- Tidak wajib: baseline pertama biasanya kontrak itu sendiri.
  dasar_dokumen TEXT,

  ditetapkan_oleh UUID REFERENCES users(id),
  ditetapkan_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Baseline AKTIF = yang dipakai menghitung SPI. Hanya satu per proyek.
  -- Yang lama tidak dihapus; ia tetap ada sebagai riwayat.
  aktif         BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT chk_baseline_alasan_berisi CHECK (length(trim(alasan)) >= 10),
  CONSTRAINT chk_baseline_nama_berisi   CHECK (length(trim(nama)) > 0),
  CONSTRAINT uq_baseline_nomor UNIQUE (project_id, nomor)
);

-- Tepat SATU baseline aktif per proyek. Indeks parsial, bukan constraint
-- biasa: dua baseline aktif membuat "terlambat terhadap yang mana?" kembali
-- tak punya jawaban tunggal — persis masalah yang tabel ini perbaiki.
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseline_satu_aktif
  ON baseline_jadwal (project_id) WHERE aktif;

CREATE INDEX IF NOT EXISTS idx_baseline_proyek
  ON baseline_jadwal (project_id, ditetapkan_pada DESC);

ALTER TABLE baseline_jadwal ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseline_jadwal FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Salinan tanggal
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseline_jadwal_item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id   UUID NOT NULL REFERENCES baseline_jadwal(id) ON DELETE CASCADE,

  -- Rujukan dipertahankan supaya bisa dibandingkan, tetapi tanggalnya
  -- DISALIN — lihat kepala berkas.
  rab_item_id   UUID NOT NULL REFERENCES rab_items(id) ON DELETE CASCADE,

  -- Salinan `rab_items.name` saat baseline dibuat — nama kolomnya DIUKUR,
  -- bukan `description` yang saya tebak lebih dulu. Item bisa di-rename;
  -- laporan keterlambatan yang menyebut nama BARU untuk baseline LAMA
  -- membingungkan pembacanya.
  uraian        TEXT,

  planned_start DATE,
  planned_end   DATE,

  -- Bobot saat itu — dipakai menghitung PV terhadap baseline.
  weight_pct    NUMERIC(9,4),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_baseline_item UNIQUE (baseline_id, rab_item_id),

  -- Selesai sebelum mulai adalah data rusak, dan ia menghasilkan durasi
  -- negatif yang membuat PV kacau tanpa satu pun galat.
  CONSTRAINT chk_baseline_urutan_tanggal
    CHECK (planned_start IS NULL OR planned_end IS NULL OR planned_end >= planned_start)
);

CREATE INDEX IF NOT EXISTS idx_baseline_item_baseline
  ON baseline_jadwal_item (baseline_id);
CREATE INDEX IF NOT EXISTS idx_baseline_item_rab
  ON baseline_jadwal_item (rab_item_id);

ALTER TABLE baseline_jadwal_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseline_jadwal_item FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Append-only — baseline yang bisa disunting bukan baseline
--
-- Pola sama dengan `periode_akuntansi_riwayat` (296): UPDATE ditolak selalu;
-- DELETE ditolak KECUALI datang lewat CASCADE (`pg_trigger_depth() > 1`),
-- supaya menghapus baseline induknya tetap mungkin.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_baseline_item_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'Item baseline tak bisa diubah. Baseline adalah pernyataan tentang apa '
      'yang dijanjikan pada tanggal penetapannya — menyuntingnya membuat '
      'perbandingan keterlambatan tak berarti. Tetapkan baseline BARU.';
  END IF;

  -- CASCADE dari penghapusan kepala baseline: diizinkan.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Item baseline tak bisa dihapus satu per satu. Hapus baseline-nya '
    'sekalian, atau tetapkan baseline baru.';
END;
$function$;

DROP TRIGGER IF EXISTS trg_baseline_item_append_only ON baseline_jadwal_item;
CREATE TRIGGER trg_baseline_item_append_only
  BEFORE UPDATE OR DELETE ON baseline_jadwal_item
  FOR EACH ROW EXECUTE FUNCTION fn_baseline_item_append_only();

-- ------------------------------------------------------------
-- 4. Izin
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description)
VALUES
  ('projects:baseline:view',   'projects', 'Lihat baseline jadwal',
   'Melihat baseline jadwal dan penyimpangan terhadapnya'),
  ('projects:baseline:manage', 'projects', 'Tetapkan baseline jadwal',
   'Menetapkan baseline jadwal baru — menentukan dasar perhitungan SPI')
ON CONFLICT (key) DO NOTHING;

-- Menetapkan baseline = menentukan terhadap apa keterlambatan diukur.
-- Yang wajar memilikinya: peran yang sudah boleh mengelola proyek.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions px ON px.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE px.key = 'projects:edit'
   AND p.key IN ('projects:baseline:view', 'projects:baseline:manage')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions px ON px.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE px.key = 'projects:view'
   AND p.key = 'projects:baseline:view'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  v_proj UUID;
  v_item UUID;
  v_bl UUID;
  v_bi UUID;
  v_lolos BOOLEAN := FALSE;
BEGIN
  -- 1. Nol baseline ter-seed. Baseline yang dibuat migrasi berarti sistem
  --    menyatakan janji yang tak pernah dibuat siapa pun.
  SELECT count(*) INTO n FROM baseline_jadwal;
  IF n > 0 THEN
    RAISE EXCEPTION '303 gagal: % baseline ter-seed', n;
  END IF;

  SELECT r.project_id, r.id INTO v_proj, v_item
    FROM rab_items r WHERE r.planned_start IS NOT NULL LIMIT 1;

  IF v_proj IS NOT NULL THEN
    INSERT INTO baseline_jadwal (project_id, nomor, nama, alasan)
    VALUES (v_proj, 9999, '[303-VERIFIKASI]', 'blok verifikasi migrasi 303')
    RETURNING id INTO v_bl;

    INSERT INTO baseline_jadwal_item
      (baseline_id, rab_item_id, uraian, planned_start, planned_end, weight_pct)
    VALUES (v_bl, v_item, '[303] uji', '2026-01-01', '2026-02-01', 1.0)
    RETURNING id INTO v_bi;

    -- 2. UPDATE item baseline DITOLAK.
    BEGIN
      UPDATE baseline_jadwal_item SET planned_end = '2027-01-01' WHERE id = v_bi;
      v_lolos := TRUE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM baseline_jadwal WHERE id = v_bl;
      RAISE EXCEPTION '303 gagal: item baseline BISA diubah — pembanding yang '
        'ikut berubah bukan pembanding';
    END IF;

    -- 3. DELETE langsung DITOLAK …
    v_lolos := FALSE;
    BEGIN
      DELETE FROM baseline_jadwal_item WHERE id = v_bi;
      v_lolos := TRUE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM baseline_jadwal WHERE id = v_bl;
      RAISE EXCEPTION '303 gagal: item baseline bisa dihapus satu per satu';
    END IF;

    -- 4. … tetapi CASCADE dari kepala HARUS bisa. Kalau tidak, baseline
    --    yang salah ketik tak bisa dihapus sama sekali, dan orang akan
    --    mengubah basis lewat jalan lain.
    DELETE FROM baseline_jadwal WHERE id = v_bl;
    SELECT count(*) INTO n FROM baseline_jadwal_item WHERE baseline_id = v_bl;
    IF n > 0 THEN
      RAISE EXCEPTION '303 gagal: CASCADE terblokir — % item tertinggal', n;
    END IF;

    -- 5. Dua baseline AKTIF pada satu proyek DITOLAK.
    INSERT INTO baseline_jadwal (project_id, nomor, nama, alasan)
    VALUES (v_proj, 9998, '[303-A]', 'verifikasi satu aktif per proyek')
    RETURNING id INTO v_bl;
    v_lolos := FALSE;
    BEGIN
      INSERT INTO baseline_jadwal (project_id, nomor, nama, alasan)
      VALUES (v_proj, 9997, '[303-B]', 'verifikasi satu aktif per proyek');
      v_lolos := TRUE;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM baseline_jadwal WHERE nama LIKE '[303-%';
      RAISE EXCEPTION '303 gagal: DUA baseline aktif LOLOS — "terlambat '
        'terhadap yang mana?" kembali tak punya jawaban';
    END IF;

    -- 6. Alasan terlalu pendek ditolak.
    v_lolos := FALSE;
    BEGIN
      INSERT INTO baseline_jadwal (project_id, nomor, nama, alasan, aktif)
      VALUES (v_proj, 9996, '[303-C]', 'adendum', FALSE);
      v_lolos := TRUE;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM baseline_jadwal WHERE nama LIKE '[303-%';
      RAISE EXCEPTION '303 gagal: alasan 7 huruf LOLOS';
    END IF;

    DELETE FROM baseline_jadwal WHERE nama LIKE '[303-%';
  END IF;

  -- 7. Izin sampai ke peran — kalau tidak, halamannya 403 untuk semua orang.
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'projects:baseline:manage';
  IF n = 0 THEN
    RAISE EXCEPTION '303 gagal: projects:baseline:manage tak dimiliki peran mana pun';
  END IF;

  SELECT count(*) INTO n FROM baseline_jadwal;
  IF n > 0 THEN
    RAISE EXCEPTION '303 gagal: % baris verifikasi tertinggal', n;
  END IF;

  RAISE NOTICE '303 OK — baseline append-only, satu aktif per proyek, CASCADE jalan';
END $$;
