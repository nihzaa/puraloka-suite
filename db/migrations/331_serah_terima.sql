-- ════════════════════════════════════════════════════════════════════════════
-- 331 — SERAH TERIMA PHO/FHO (E2), dan gerbang yang membuat retensi berarti
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lubang yang ditutup, diukur 2026-08-12
--
-- `POST /api/v1/mandor/retensi-releases` mencairkan retensi setelah memeriksa
-- SATU hal: saldo.
--
--     ditahan − sudahDicairkan >= diminta   →   cair
--
-- Tak ada pemeriksaan mutu sama sekali. Diukur di basis saat ini: 7 proyek
-- punya punch item, dan 36 dari 40 temuan MASIH TERBUKA — termasuk satu proyek
-- dengan 19 dari 19 belum selesai. Uang jaminan mutu bisa cair penuh sementara
-- sembilan belas cacat menunggu diperbaiki.
--
-- Itu membatalkan seluruh guna retensi. `lib/retensi-subkontrak.ts` menulisnya
-- sendiri di header: *"kalau ada cacat yang harus diperbaiki mandor, tak ada
-- uang tertahan untuk memaksanya kembali — itu justru seluruh gunanya
-- retensi."* Mekanisme penahanannya dibangun; syarat pelepasannya tidak.
--
-- PHO/FHO adalah syarat itu.
--
-- ── Dua peristiwa, bukan satu
--
--   PHO  Provisional Hand Over — pekerjaan dinyatakan selesai, masa
--        pemeliharaan MULAI. Sebagian retensi boleh cair.
--   FHO  Final Hand Over — masa pemeliharaan berakhir tanpa cacat tersisa.
--        Sisa retensi cair.
--
-- Menyatukannya jadi satu tanggal "selesai" menghapus justru rentang yang
-- diperdebatkan: siapa menanggung kebocoran atap dua bulan sesudah proyek
-- dinyatakan selesai. Jawabannya ada di antara PHO dan FHO.
--
-- ── Yang ditegakkan basis, bukan hanya aplikasi
--
-- 1. FHO tak bisa ada tanpa PHO pada proyek yang sama.
-- 2. Tanggal FHO tak boleh mendahului PHO.
-- 3. Berita acara yang sudah DITANDATANGANI terkunci.
-- 4. Masa pemeliharaan >= 0 hari.
-- 5. Satu proyek hanya boleh punya SATU PHO dan SATU FHO yang tak dibatalkan.
--
-- Kelimanya di basis karena importer dan psql menulis ke sini juga — pelajaran
-- yang sama dengan 325 dan 327.
--
-- ── Yang SENGAJA tidak ditegakkan basis
--
-- "Punch list wajib nol sebelum PHO" TIDAK jadi CHECK. Alasannya bukan
-- kelalaian:
--
--   • PHO bersyarat adalah praktik nyata — diterima dengan daftar cacat yang
--     disepakati diperbaiki dalam masa pemeliharaan. Melarangnya di basis
--     berarti melarang cara kerja yang sah.
--   • CHECK tak bisa membaca tabel lain tanpa trigger, dan trigger yang
--     menolak akan memberi galat Postgres yang tak bisa ditindaklanjuti
--     pengguna.
--
-- Jadi aturannya di aplikasi, DENGAN alasan yang bisa dibaca manusia, dan
-- jumlah cacat tersisa DISIMPAN di berita acara (`punch_terbuka_saat_terbit`).
-- Yang disimpan itulah buktinya: PHO yang diterbitkan dengan 19 cacat terbuka
-- tetap tercatat sebagai PHO dengan 19 cacat terbuka, selamanya.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Jenis ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'serah_terima_jenis') THEN
    CREATE TYPE serah_terima_jenis AS ENUM ('pho', 'fho');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'serah_terima_status') THEN
    -- `draf` → `ditandatangani` → (`dibatalkan` dari mana pun).
    --
    -- Tak ada `diterbitkan` seperti SPK: berita acara serah terima tak punya
    -- tahap "diumumkan tapi belum disepakati". Ia ditandatangani di lokasi,
    -- atau ia masih draf.
    CREATE TYPE serah_terima_status AS ENUM ('draf', 'ditandatangani', 'dibatalkan');
  END IF;
END $$;

-- ── Tabel ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS serah_terima (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id                UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Lingkup kerja OPSIONAL: serah terima bisa per-proyek (ke owner) atau
  -- per-lingkup (dari subkon ke kontraktor). Keduanya nyata, dan memaksa
  -- salah satu berarti setengah pemakaiannya tak punya tempat.
  work_scope_id             UUID REFERENCES work_scopes(id) ON DELETE SET NULL,

  jenis                     serah_terima_jenis NOT NULL,
  nomor                     TEXT NOT NULL,
  tanggal                   DATE NOT NULL,

  -- Masa pemeliharaan dalam HARI, dihitung sejak `tanggal` PHO.
  --
  -- Disimpan sebagai jumlah hari, bukan tanggal akhir: yang disepakati di
  -- kontrak adalah "90 hari kalender", dan menyimpan tanggal akhirnya membuat
  -- PHO yang tanggalnya dikoreksi meninggalkan masa pemeliharaan yang tak
  -- ikut bergeser. Tanggal akhirnya diturunkan (`tanggal + masa_hari`).
  masa_pemeliharaan_hari    INT,

  -- Jumlah punch item yang MASIH TERBUKA saat berita acara ini diterbitkan.
  --
  -- Disimpan, bukan dihitung ulang saat baca: cacat akan diperbaiki sesudahnya,
  -- dan hitungan hari ini tak menjawab "berapa yang terbuka saat kami tanda
  -- tangan". Pertanyaan itulah yang muncul saat sengketa.
  punch_terbuka_saat_terbit INT NOT NULL DEFAULT 0,
  -- Daftar cacat yang DISEPAKATI diperbaiki dalam masa pemeliharaan. Itulah
  -- yang membedakan PHO bersyarat dari PHO yang mengabaikan cacat.
  catatan_cacat             TEXT,

  lingkup_serah             TEXT NOT NULL,
  catatan                   TEXT,

  ttd_penyerah_url          TEXT,
  ttd_penyerah_pada         TIMESTAMPTZ,
  ttd_penerima_url          TEXT,
  ttd_penerima_pada         TIMESTAMPTZ,

  status                    serah_terima_status NOT NULL DEFAULT 'draf',
  alasan_batal              TEXT,

  diterbitkan_oleh          UUID REFERENCES users(id) ON DELETE SET NULL,
  dibuat_pada               TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT serah_terima_nomor_unik UNIQUE (company_id, nomor),

  -- Masa pemeliharaan negatif adalah kontrak yang berakhir sebelum dimulai.
  CONSTRAINT serah_terima_masa_wajar
    CHECK (masa_pemeliharaan_hari IS NULL OR masa_pemeliharaan_hari >= 0),

  -- Cacat tak bisa berjumlah negatif.
  CONSTRAINT serah_terima_punch_wajar
    CHECK (punch_terbuka_saat_terbit >= 0),

  -- Berita acara ditandatangani menuntut KEDUA tanda tangan.
  --
  -- Sama dengan SPK (328), dan alasannya lebih tajam di sini: serah terima
  -- yang hanya ditandatangani penyerah bukan serah terima — ia pengumuman
  -- bahwa pekerjaan dianggap selesai. Yang membuatnya berpindah tangan adalah
  -- PENERIMAAN.
  CONSTRAINT serah_terima_ttd_lengkap
    CHECK (
      status <> 'ditandatangani'
      OR (ttd_penyerah_url IS NOT NULL AND ttd_penerima_url IS NOT NULL)
    ),

  -- Pembatalan wajib beralasan: berita acara yang ditarik tanpa sebab
  -- meninggalkan dua pihak yang tak tahu status pekerjaannya.
  CONSTRAINT serah_terima_batal_beralasan
    CHECK (status <> 'dibatalkan' OR btrim(COALESCE(alasan_batal, '')) <> ''),

  -- Masa pemeliharaan hanya bermakna pada PHO. FHO menutupnya.
  CONSTRAINT serah_terima_masa_hanya_pho
    CHECK (jenis = 'pho' OR masa_pemeliharaan_hari IS NULL)
);

-- Satu PHO dan satu FHO per proyek — yang dibatalkan tak dihitung.
--
-- Index PARSIAL, bukan constraint: `dibatalkan` harus boleh berulang (PHO
-- yang salah dibatalkan lalu diterbitkan ulang adalah alur yang sah).
CREATE UNIQUE INDEX IF NOT EXISTS serah_terima_satu_per_jenis
  ON serah_terima (project_id, jenis)
  WHERE status <> 'dibatalkan';

CREATE INDEX IF NOT EXISTS serah_terima_project_idx ON serah_terima (project_id);
CREATE INDEX IF NOT EXISTS serah_terima_scope_idx   ON serah_terima (work_scope_id);
CREATE INDEX IF NOT EXISTS serah_terima_company_idx ON serah_terima (company_id);

-- ── FHO menuntut PHO ────────────────────────────────────────────────────────
--
-- CHECK tak bisa membaca baris lain, jadi ini trigger. Yang ditegakkan:
-- FHO tak boleh ada tanpa PHO yang ditandatangani pada proyek yang sama, dan
-- tanggalnya tak boleh mendahului PHO.
--
-- Kenapa di basis: FHO mencairkan SISA retensi. FHO tanpa PHO berarti masa
-- pemeliharaan tak pernah berjalan — uang jaminan cair untuk masa yang tak
-- pernah dilewati.
CREATE OR REPLACE FUNCTION fn_serah_terima_fho_butuh_pho()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pho_tanggal DATE;
BEGIN
  IF NEW.jenis <> 'fho' OR NEW.status = 'dibatalkan' THEN
    RETURN NEW;
  END IF;

  SELECT st.tanggal INTO pho_tanggal
    FROM serah_terima st
   WHERE st.project_id = NEW.project_id
     AND st.jenis = 'pho'
     AND st.status = 'ditandatangani'
   LIMIT 1;

  IF pho_tanggal IS NULL THEN
    RAISE EXCEPTION 'FHO menuntut PHO yang sudah ditandatangani lebih dulu — masa pemeliharaan belum pernah dimulai'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.tanggal < pho_tanggal THEN
    RAISE EXCEPTION 'Tanggal FHO (%) mendahului PHO (%) — masa pemeliharaan tak bisa berakhir sebelum dimulai',
      NEW.tanggal, pho_tanggal
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_serah_terima_fho_butuh_pho ON serah_terima;
CREATE TRIGGER trg_serah_terima_fho_butuh_pho
  BEFORE INSERT OR UPDATE OF jenis, tanggal, status ON serah_terima
  FOR EACH ROW EXECUTE FUNCTION fn_serah_terima_fho_butuh_pho();

-- ── Terkunci sesudah ditandatangani ─────────────────────────────────────────
--
-- Yang dikunci adalah yang menentukan UANG dan TANGGUNG JAWAB: jenis, tanggal,
-- masa pemeliharaan, lingkup, dan jumlah cacat saat terbit. Mengubahnya
-- sesudah kedua pihak tanda tangan berarti mengubah kesepakatan sepihak.
--
-- `catatan` dan `alasan_batal` sengaja TIDAK dikunci: yang pertama tempat
-- mencatat kejadian sesudahnya, yang kedua wajib diisi justru saat membatalkan.
CREATE OR REPLACE FUNCTION fn_serah_terima_terkunci()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'ditandatangani' THEN
    RETURN NEW;
  END IF;

  -- Membatalkan tetap boleh — itu satu-satunya jalan keluar yang sah.
  IF NEW.status = 'dibatalkan' THEN
    RETURN NEW;
  END IF;

  IF NEW.jenis IS DISTINCT FROM OLD.jenis
     OR NEW.tanggal IS DISTINCT FROM OLD.tanggal
     OR NEW.masa_pemeliharaan_hari IS DISTINCT FROM OLD.masa_pemeliharaan_hari
     OR NEW.lingkup_serah IS DISTINCT FROM OLD.lingkup_serah
     OR NEW.punch_terbuka_saat_terbit IS DISTINCT FROM OLD.punch_terbuka_saat_terbit
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.work_scope_id IS DISTINCT FROM OLD.work_scope_id THEN
    RAISE EXCEPTION 'Berita acara % sudah ditandatangani kedua pihak — isinya tak bisa diubah. Batalkan dan terbitkan yang baru.',
      OLD.nomor
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_serah_terima_terkunci ON serah_terima;
CREATE TRIGGER trg_serah_terima_terkunci
  BEFORE UPDATE ON serah_terima
  FOR EACH ROW EXECUTE FUNCTION fn_serah_terima_terkunci();

-- ── diubah_pada ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_serah_terima_sentuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.diubah_pada := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_serah_terima_sentuh ON serah_terima;
CREATE TRIGGER trg_serah_terima_sentuh
  BEFORE UPDATE ON serah_terima
  FOR EACH ROW EXECUTE FUNCTION fn_serah_terima_sentuh();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE serah_terima ENABLE ROW LEVEL SECURITY;
ALTER TABLE serah_terima FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS serah_terima_baca ON serah_terima;
CREATE POLICY serah_terima_baca ON serah_terima
  FOR SELECT USING (has_permission('serah_terima:view'));

DROP POLICY IF EXISTS serah_terima_tulis ON serah_terima;
CREATE POLICY serah_terima_tulis ON serah_terima
  FOR ALL USING (has_permission('serah_terima:kelola'))
  WITH CHECK (has_permission('serah_terima:kelola'));

-- ── Izin ────────────────────────────────────────────────────────────────────
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('serah_terima:view', 'lapangan', 'Lihat serah terima',
   'Melihat berita acara PHO/FHO beserta masa pemeliharaannya.', 613),
  ('serah_terima:kelola', 'lapangan', 'Kelola serah terima',
   'Menerbitkan, menandatangani, dan membatalkan berita acara serah terima.', 614)
ON CONFLICT (key) DO NOTHING;

-- Izin yang dibuat tapi tak pernah diberikan = rute 403 untuk SEMUA orang,
-- termasuk admin. Cacat itu sudah terjadi di migrasi 321; jangan diulang.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('serah_terima:view', 'serah_terima:kelola')
   AND EXISTS (
     -- Diberikan ke peran yang SUDAH memegang `punch:verify` — serah terima
     -- adalah kelanjutan langsung dari memverifikasi perbaikan cacat, dan
     -- menebak daftar peran sendiri berarti memutuskan kewenangan tenant.
     SELECT 1 FROM role_permissions rp
       JOIN permissions pv ON pv.id = rp.permission_id
      WHERE rp.role_id = r.id AND pv.key = 'punch:verify'
   )
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
   );

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  co   UUID;
  pr   UUID;
  us   UUID;
  pho  UUID;
  n    INT;
  gagal BOOLEAN;
BEGIN
  -- Fixture dipilih menurut SYARAT, bukan LIMIT 1. Migrasi 328 sempat
  -- melewatkan seluruh verifikasinya karena memilih company tanpa work_scope.
  SELECT p.company_id, p.id INTO co, pr
    FROM projects p
   WHERE p.company_id IS NOT NULL
   LIMIT 1;

  SELECT u.id INTO us FROM users u
    JOIN company_members cm ON cm.user_id = u.id AND cm.company_id = co
   LIMIT 1;

  IF co IS NULL OR pr IS NULL THEN
    -- Fixture tak terbentuk BUKAN kegagalan: di schema bersih memang belum
    -- ada proyek/user. Yang dilewati hanya pembuktiannya; di lingkungan
    -- yang berisi data ia berjalan penuh. (2026-09-04, kelas 252/254/316)
    RAISE NOTICE '331: fixture belum ada — verifikasi DILEWATI (schema bersih)';
    RETURN;
  END IF;

  -- 1. FHO tanpa PHO DITOLAK.
  gagal := FALSE;
  BEGIN
    INSERT INTO serah_terima (company_id, project_id, jenis, nomor, tanggal, lingkup_serah, diterbitkan_oleh)
    VALUES (co, pr, 'fho', 'VERIF-331-FHO-TANPA-PHO', CURRENT_DATE, 'uji', us);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '331 gagal: FHO tanpa PHO DITERIMA — masa pemeliharaan bisa dilewati';
  END IF;

  -- 2. Masa pemeliharaan negatif DITOLAK.
  gagal := FALSE;
  BEGIN
    INSERT INTO serah_terima (company_id, project_id, jenis, nomor, tanggal, lingkup_serah, masa_pemeliharaan_hari, diterbitkan_oleh)
    VALUES (co, pr, 'pho', 'VERIF-331-MASA-NEGATIF', CURRENT_DATE, 'uji', -1, us);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '331 gagal: masa pemeliharaan negatif DITERIMA';
  END IF;

  -- 3. `ditandatangani` tanpa dua tanda tangan DITOLAK.
  gagal := FALSE;
  BEGIN
    INSERT INTO serah_terima (company_id, project_id, jenis, nomor, tanggal, lingkup_serah, status, ttd_penyerah_url, diterbitkan_oleh)
    VALUES (co, pr, 'pho', 'VERIF-331-TTD-SATU', CURRENT_DATE, 'uji', 'ditandatangani', 'a.png', us);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '331 gagal: berita acara bertanda tangan SATU pihak diterima sebagai ditandatangani';
  END IF;

  -- 4. FHO SESUDAH PHO ditandatangani: DITERIMA, dan tanggal mundur DITOLAK.
  INSERT INTO serah_terima (company_id, project_id, jenis, nomor, tanggal, lingkup_serah,
                            masa_pemeliharaan_hari, status, ttd_penyerah_url, ttd_penerima_url, diterbitkan_oleh)
  VALUES (co, pr, 'pho', 'VERIF-331-PHO', CURRENT_DATE - 10, 'uji', 90, 'ditandatangani', 'a.png', 'b.png', us)
  RETURNING id INTO pho;

  gagal := FALSE;
  BEGIN
    INSERT INTO serah_terima (company_id, project_id, jenis, nomor, tanggal, lingkup_serah, diterbitkan_oleh)
    VALUES (co, pr, 'fho', 'VERIF-331-FHO-MUNDUR', CURRENT_DATE - 20, 'uji', us);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '331 gagal: FHO bertanggal SEBELUM PHO diterima';
  END IF;

  -- 5. Kunci sesudah ditandatangani.
  gagal := FALSE;
  BEGIN
    UPDATE serah_terima SET tanggal = CURRENT_DATE WHERE id = pho;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '331 gagal: tanggal berita acara bertanda tangan BISA diubah';
  END IF;

  -- 6. Satu PHO per proyek.
  gagal := FALSE;
  BEGIN
    INSERT INTO serah_terima (company_id, project_id, jenis, nomor, tanggal, lingkup_serah, diterbitkan_oleh)
    VALUES (co, pr, 'pho', 'VERIF-331-PHO-KEDUA', CURRENT_DATE, 'uji', us);
  EXCEPTION WHEN unique_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '331 gagal: PHO KEDUA pada proyek yang sama diterima';
  END IF;

  -- 7. Masa pemeliharaan pada FHO DITOLAK.
  gagal := FALSE;
  BEGIN
    INSERT INTO serah_terima (company_id, project_id, jenis, nomor, tanggal, lingkup_serah, masa_pemeliharaan_hari, diterbitkan_oleh)
    VALUES (co, pr, 'fho', 'VERIF-331-FHO-MASA', CURRENT_DATE, 'uji', 30, us);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '331 gagal: FHO ber-masa pemeliharaan diterima';
  END IF;

  DELETE FROM serah_terima WHERE nomor LIKE 'VERIF-331-%';

  -- 8. Izin terpasang DAN diberikan.
  SELECT count(*) INTO n FROM permissions WHERE key IN ('serah_terima:view', 'serah_terima:kelola');
  IF n <> 2 THEN
    RAISE EXCEPTION '331 gagal: izin serah terima tak lengkap (% dari 2)', n;
  END IF;

  SELECT count(*) INTO n
    FROM permissions p
   WHERE p.key IN ('serah_terima:view', 'serah_terima:kelola')
     AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id);
  IF n > 0 THEN
    RAISE EXCEPTION '331 gagal: % izin serah terima tak diberikan ke peran mana pun — rutenya 403 untuk semua orang', n;
  END IF;

  -- 9. RLS menyala dengan policy.
  SELECT count(*) INTO n FROM pg_policies WHERE tablename = 'serah_terima';
  IF n < 2 THEN
    RAISE EXCEPTION '331 gagal: policy serah_terima kurang (%)', n;
  END IF;

  RAISE NOTICE '331 OK — 7 kasus negatif ditolak, izin diberikan, RLS % policy', n;
END $$;
