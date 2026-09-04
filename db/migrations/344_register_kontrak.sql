-- ════════════════════════════════════════════════════════════════════════════
-- 344 — Register kontrak (kt-register): dokumen kontrak sebagai entitas
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lubang yang ditutup, diukur 2026-08-12
--
-- Data kontrak menempel di `projects`: `contract_value`, `contract_model`,
-- `retention_pct`, `tax_scheme`, `start_date`, `end_date`. Nol tabel kontrak.
--
-- Akibatnya tiga hal hilang, dan ketiganya baru terasa saat dibutuhkan:
--
--   1. NILAI AWAL tak bisa dibedakan dari nilai berjalan. Satu change order
--      senilai Rp 50 juta sudah disetujui, dan `contract_value` kini memuat
--      hasilnya — tak ada tempat mencatat berapa kontraknya SEBELUM addendum.
--      Yang bertanya "berapa pembengkakan proyek ini" tak punya pembanding.
--
--   2. ADDENDUM tak punya dokumennya sendiri. `change_orders` mencatat
--      perubahan LINGKUP; addendum kontrak adalah dokumen hukum bernomor
--      dengan tanggal tanda tangan sendiri, dan keduanya tak sama.
--
--   3. SATU KLIEN BANYAK KONTRAK tak terlacak. Diukur: satu klien punya 3
--      proyek, empat klien punya 2 — dan tak ada satu pun tempat yang
--      menunjukkan hubungan kontraktualnya.
--
-- ── Kenapa `projects` TIDAK dikurangi
--
-- `contract_value` dibaca 104 tempat: invoice & PPN, retensi klien & subkon,
-- EVM, kurva S, dashboard, sertifikat IPC, termin, CVR. Memindahkannya
-- berarti menyentuh seluruhnya, dan satu pembaca yang terlewat membuat nilai
-- kontrak terbaca NOL — invoice terbit dengan angka salah, tanpa satu pun
-- galat.
--
-- Keputusan founder (2026-08-12): tabel kontrak MERUJUK proyek, kolom lama
-- tetap sebagai NILAI BERJALAN. Nol perubahan pada jalur uang yang sudah jalan.
--
-- Pembagian tugasnya jadi jelas:
--
--     kontrak.nilai_awal       apa yang DITANDATANGANI
--     projects.contract_value  apa yang BERLAKU sekarang
--
-- ── Kenapa nilai berjalan TIDAK dihitung ulang oleh trigger
--
-- Menghitungnya dari (kontrak induk + Σ addendum) akan menimpa
-- `contract_value` yang kini diisi jalur change order — dan dua penulis untuk
-- satu kolom pasti berselisih. Yang disediakan hanya PEMBANDING: rute
-- melaporkan selisihnya, dan yang membacanya memutuskan.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Jenis ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kontrak_jenis') THEN
    CREATE TYPE kontrak_jenis AS ENUM ('induk', 'addendum');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kontrak_status') THEN
    -- `draf` → `berlaku` → `selesai`, dan `dibatalkan` dari mana pun kecuali
    -- yang sudah selesai. Tak ada "ditandatangani" terpisah: kontrak yang
    -- berlaku ADALAH kontrak yang sudah ditandatangani, dan memisahkannya
    -- membuat dua keadaan yang tak pernah bisa dibedakan orang.
    CREATE TYPE kontrak_status AS ENUM ('draf', 'berlaku', 'selesai', 'dibatalkan');
  END IF;
END $$;

-- ── Tabel ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kontrak (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  -- Klien DISALIN dari proyek saat dibuat, bukan dirujuk lewat proyek.
  --
  -- Kontrak adalah dokumen hukum: pihak yang menandatanganinya tak berubah
  -- meski proyeknya kelak dipindahkan ke klien lain (akuisisi, pengalihan).
  -- Merujuk lewat proyek membuat kontrak lama seolah ditandatangani pihak
  -- yang tak pernah menandatanganinya.
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,

  jenis               kontrak_jenis NOT NULL DEFAULT 'induk',
  -- Addendum menunjuk induknya. Induk ber-`kontrak_induk_id` NULL.
  kontrak_induk_id    UUID REFERENCES kontrak(id) ON DELETE RESTRICT,

  nomor               TEXT NOT NULL,
  judul               TEXT NOT NULL,
  tanggal_tanda_tangan DATE NOT NULL,
  tanggal_mulai       DATE,
  tanggal_selesai     DATE,

  -- Nilai yang DITANDATANGANI. Untuk addendum: SELISIHnya (boleh negatif —
  -- pengurangan lingkup nyata adanya), bukan nilai total setelahnya.
  nilai               NUMERIC(15,2) NOT NULL,
  retensi_pct         NUMERIC(5,2),
  syarat_pembayaran   TEXT,
  lingkup             TEXT,

  status              kontrak_status NOT NULL DEFAULT 'draf',
  alasan_batal        TEXT,
  file_url            TEXT,
  catatan             TEXT,

  dibuat_oleh         UUID REFERENCES users(id) ON DELETE SET NULL,
  dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT kontrak_nomor_unik UNIQUE (company_id, nomor),

  -- Induk TIDAK boleh menunjuk induk lain; addendum WAJIB menunjuk.
  --
  -- Tanpa ini, addendum yatim tak pernah masuk hitungan nilai berjalan
  -- proyeknya — dan selisihnya baru ketahuan saat pembayaran terakhir
  -- ternyata kurang.
  CONSTRAINT kontrak_induk_jelas CHECK (
    (jenis = 'induk'    AND kontrak_induk_id IS NULL) OR
    (jenis = 'addendum' AND kontrak_induk_id IS NOT NULL)
  ),

  -- Nilai INDUK harus positif; addendum boleh negatif (pengurangan lingkup)
  -- tetapi tak boleh nol — addendum bernilai nol yang tak mengubah apa pun
  -- adalah dokumen yang tak perlu ada.
  CONSTRAINT kontrak_nilai_wajar CHECK (
    (jenis = 'induk'    AND nilai > 0) OR
    (jenis = 'addendum' AND nilai <> 0)
  ),

  CONSTRAINT kontrak_retensi_wajar
    CHECK (retensi_pct IS NULL OR (retensi_pct >= 0 AND retensi_pct <= 100)),

  CONSTRAINT kontrak_tanggal_wajar
    CHECK (tanggal_selesai IS NULL OR tanggal_mulai IS NULL
           OR tanggal_selesai >= tanggal_mulai),

  CONSTRAINT kontrak_batal_beralasan
    CHECK (status <> 'dibatalkan' OR btrim(COALESCE(alasan_batal, '')) <> '')
);

CREATE INDEX IF NOT EXISTS kontrak_project_idx ON kontrak (project_id);
CREATE INDEX IF NOT EXISTS kontrak_client_idx  ON kontrak (client_id);
CREATE INDEX IF NOT EXISTS kontrak_induk_idx   ON kontrak (kontrak_induk_id);

-- Satu kontrak INDUK berlaku per proyek.
--
-- Index PARSIAL: draf boleh berulang (menyusun beberapa rancangan sah), dan
-- yang dibatalkan/selesai juga — riwayat yang tak boleh berulang bukan
-- riwayat. Yang dijaga: dua kontrak induk yang SAMA-SAMA berlaku, karena itu
-- membuat "berapa nilai kontrak proyek ini" tak punya jawaban tunggal.
CREATE UNIQUE INDEX IF NOT EXISTS kontrak_satu_induk_berlaku
  ON kontrak (project_id)
  WHERE jenis = 'induk' AND status = 'berlaku';

-- ── Addendum WAJIB sebidang dengan induknya ─────────────────────────────────
--
-- CHECK tak bisa membaca baris lain, jadi trigger. Yang ditegakkan: addendum
-- menunjuk induk di PROYEK yang sama, milik company yang sama, dan induknya
-- bukan addendum lain (rantai berlapis membuat "nilai kontrak" jadi
-- penelusuran rekursif yang tak pernah dimaksudkan siapa pun).
CREATE OR REPLACE FUNCTION fn_kontrak_addendum_sebidang()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_project UUID;
  v_company UUID;
  v_jenis   kontrak_jenis;
  v_tgl     DATE;
BEGIN
  IF NEW.kontrak_induk_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.kontrak_induk_id = NEW.id THEN
    RAISE EXCEPTION 'Kontrak tak bisa jadi addendum atas dirinya sendiri'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT project_id, company_id, jenis, tanggal_tanda_tangan
    INTO v_project, v_company, v_jenis, v_tgl
    FROM kontrak WHERE id = NEW.kontrak_induk_id;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Kontrak induk tidak ditemukan'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_project <> NEW.project_id OR v_company <> NEW.company_id THEN
    RAISE EXCEPTION
      'Addendum menunjuk kontrak induk di proyek atau perusahaan LAIN — nilai addendumnya akan terhitung ke proyek yang salah'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_jenis <> 'induk' THEN
    RAISE EXCEPTION
      'Addendum hanya boleh menunjuk kontrak INDUK, bukan addendum lain — rantai berlapis membuat nilai kontrak jadi penelusuran rekursif'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Addendum yang ditandatangani SEBELUM induknya adalah urutan yang tak
  -- pernah terjadi — dan biasanya salah ketik tahun.
  IF NEW.tanggal_tanda_tangan < v_tgl THEN
    RAISE EXCEPTION
      'Addendum bertanggal % mendahului kontrak induknya (%)', NEW.tanggal_tanda_tangan, v_tgl
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kontrak_addendum_sebidang ON kontrak;
CREATE TRIGGER trg_kontrak_addendum_sebidang
  BEFORE INSERT OR UPDATE OF kontrak_induk_id, project_id, company_id, tanggal_tanda_tangan ON kontrak
  FOR EACH ROW EXECUTE FUNCTION fn_kontrak_addendum_sebidang();

-- ── Kontrak BERLAKU terkunci isinya ─────────────────────────────────────────
--
-- Yang dikunci adalah yang menentukan UANG dan KEWAJIBAN: nomor, nilai,
-- tanggal tanda tangan, retensi, dan pihaknya. Mengubahnya sesudah berlaku
-- berarti mengubah dokumen yang sudah ditandatangani dua pihak — dan salinan
-- kertasnya tak ikut berubah.
--
-- `catatan`, `file_url`, `lingkup`, dan tanggal mulai/selesai TIDAK dikunci:
-- yang pertama tempat mencatat kejadian sesudahnya, yang kedua sering baru
-- diunggah belakangan, dan jangka waktu bisa bergeser lewat addendum yang
-- memperbaruinya di sini.
CREATE OR REPLACE FUNCTION fn_kontrak_terkunci()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'draf' THEN RETURN NEW; END IF;

  -- Membatalkan tetap boleh — itu satu-satunya jalan keluar yang sah.
  IF NEW.status = 'dibatalkan' AND OLD.status <> 'dibatalkan' THEN RETURN NEW; END IF;

  IF NEW.nomor IS DISTINCT FROM OLD.nomor
     OR NEW.nilai IS DISTINCT FROM OLD.nilai
     OR NEW.tanggal_tanda_tangan IS DISTINCT FROM OLD.tanggal_tanda_tangan
     OR NEW.retensi_pct IS DISTINCT FROM OLD.retensi_pct
     OR NEW.jenis IS DISTINCT FROM OLD.jenis
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.kontrak_induk_id IS DISTINCT FROM OLD.kontrak_induk_id THEN
    RAISE EXCEPTION
      'Kontrak % sudah berstatus % — isinya tak bisa diubah. Terbitkan addendum.',
      OLD.nomor, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kontrak_terkunci ON kontrak;
CREATE TRIGGER trg_kontrak_terkunci
  BEFORE UPDATE ON kontrak
  FOR EACH ROW EXECUTE FUNCTION fn_kontrak_terkunci();

-- ── diubah_pada ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_kontrak_sentuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.diubah_pada := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_kontrak_sentuh ON kontrak;
CREATE TRIGGER trg_kontrak_sentuh
  BEFORE UPDATE ON kontrak
  FOR EACH ROW EXECUTE FUNCTION fn_kontrak_sentuh();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE kontrak ENABLE ROW LEVEL SECURITY;
ALTER TABLE kontrak FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kontrak_baca ON kontrak;
CREATE POLICY kontrak_baca ON kontrak
  FOR SELECT USING (has_permission('projects:view'));

DROP POLICY IF EXISTS kontrak_tulis ON kontrak;
CREATE POLICY kontrak_tulis ON kontrak
  FOR ALL USING (has_permission('projects:contract'))
  WITH CHECK (has_permission('projects:contract'));

-- ── Izin ────────────────────────────────────────────────────────────────────
--
-- `projects:contract` SUDAH ADA, dipakai `asuransi.ts` dan `contingency.ts`,
-- dan diberikan ke 3 peran. Tak dibuat yang baru: dua izin untuk hal yang
-- sama menghasilkan dua kebenaran tentang siapa berwenang (pelajaran 289).
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM permissions WHERE key = 'projects:contract';
  IF n = 0 THEN
    RAISE EXCEPTION '344 gagal: izin projects:contract tak ada — asumsi migrasi ini runtuh';
  END IF;
END $$;

-- ── Change order boleh menunjuk addendum yang mengesahkannya ────────────────
--
-- Opsional dan longgar dengan sengaja: change order yang sudah disetujui
-- BELUM tentu langsung berkontrak — sebagian dikerjakan lebih dulu dan
-- diaddendumkan belakangan, dan itu praktik nyata. Yang disediakan hanya
-- tempat mencatatnya saat addendumnya terbit.
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS kontrak_addendum_id UUID REFERENCES kontrak(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS change_orders_addendum_idx
  ON change_orders (kontrak_addendum_id)
  WHERE kontrak_addendum_id IS NOT NULL;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  co    UUID;
  pr    UUID;
  cl    UUID;
  pr2   UUID;
  k1    UUID;
  k2    UUID;
  n     INT;
  gagal BOOLEAN;
BEGIN
  -- Fixture dipilih menurut SYARAT, bukan LIMIT 1 (pelajaran migrasi 328).
  SELECT p.company_id, p.id, p.client_id INTO co, pr, cl
    FROM projects p WHERE p.client_id IS NOT NULL LIMIT 1;
  SELECT p.id INTO pr2 FROM projects p WHERE p.id <> pr AND p.company_id = co LIMIT 1;
  IF pr IS NULL OR pr2 IS NULL THEN
    -- Di schema bersih nol proyek, jadi fixture ini mustahil terbentuk.
    -- Yang dilewati hanya pembuktiannya; di lingkungan berisi data ia
    -- berjalan penuh. (2026-09-04, kelas 252/254/316/331)
    --
    -- ⚠ Fungsi trigger di berkas yang SAMA ("Kontrak induk tidak ditemukan",
    -- baris ~175) TIDAK disentuh — itu validasi runtime untuk data sungguhan.
    RAISE NOTICE '344: belum ada dua proyek berklien — verifikasi DILEWATI (schema bersih)';
    RETURN;
  END IF;

  -- 1. Kontrak induk terbentuk.
  INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                       tanggal_tanda_tangan, nilai, status)
  VALUES (co, pr, cl, 'induk', 'VERIF344-001', 'uji induk',
          CURRENT_DATE - 30, 100000000, 'berlaku')
  RETURNING id INTO k1;

  -- 2. Induk KEDUA yang berlaku pada proyek yang sama DITOLAK.
  gagal := FALSE;
  BEGIN
    INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                         tanggal_tanda_tangan, nilai, status)
    VALUES (co, pr, cl, 'induk', 'VERIF344-002', 'induk kedua',
            CURRENT_DATE, 50000000, 'berlaku');
  EXCEPTION WHEN unique_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: dua kontrak induk BERLAKU pada satu proyek — nilai kontraknya tak punya jawaban tunggal';
  END IF;

  -- 3. Induk ber-nilai NOL ditolak.
  gagal := FALSE;
  BEGIN
    INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                         tanggal_tanda_tangan, nilai)
    VALUES (co, pr2, cl, 'induk', 'VERIF344-NOL', 'uji', CURRENT_DATE, 0);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: kontrak induk bernilai NOL diterima';
  END IF;

  -- 4. Addendum TANPA induk ditolak.
  gagal := FALSE;
  BEGIN
    INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                         tanggal_tanda_tangan, nilai)
    VALUES (co, pr, cl, 'addendum', 'VERIF344-YATIM', 'addendum yatim',
            CURRENT_DATE, 10000000);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: addendum TANPA induk diterima — nilainya tak pernah masuk hitungan';
  END IF;

  -- 5. Induk yang MENUNJUK induk lain ditolak.
  gagal := FALSE;
  BEGIN
    INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                         tanggal_tanda_tangan, nilai, kontrak_induk_id)
    VALUES (co, pr, cl, 'induk', 'VERIF344-INDUK2', 'induk menunjuk induk',
            CURRENT_DATE, 1000, k1);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: kontrak INDUK boleh menunjuk induk lain';
  END IF;

  -- 6. Addendum sah — dan boleh BERNILAI NEGATIF (pengurangan lingkup).
  INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                       tanggal_tanda_tangan, nilai, kontrak_induk_id, status)
  VALUES (co, pr, cl, 'addendum', 'VERIF344-ADD1', 'addendum tambah',
          CURRENT_DATE - 10, 25000000, k1, 'berlaku')
  RETURNING id INTO k2;

  INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                       tanggal_tanda_tangan, nilai, kontrak_induk_id, status)
  VALUES (co, pr, cl, 'addendum', 'VERIF344-ADD2', 'addendum kurang',
          CURRENT_DATE - 5, -5000000, k1, 'berlaku');

  -- 7. Addendum ber-nilai NOL ditolak.
  gagal := FALSE;
  BEGIN
    INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                         tanggal_tanda_tangan, nilai, kontrak_induk_id)
    VALUES (co, pr, cl, 'addendum', 'VERIF344-ADD0', 'addendum nol',
            CURRENT_DATE, 0, k1);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: addendum bernilai NOL diterima — dokumen yang tak mengubah apa pun';
  END IF;

  -- 8. Addendum atas ADDENDUM ditolak.
  gagal := FALSE;
  BEGIN
    INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                         tanggal_tanda_tangan, nilai, kontrak_induk_id)
    VALUES (co, pr, cl, 'addendum', 'VERIF344-ADD3', 'addendum berlapis',
            CURRENT_DATE, 1000000, k2);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: addendum atas ADDENDUM diterima — nilai kontrak jadi penelusuran rekursif';
  END IF;

  -- 9. Addendum di proyek LAIN ditolak.
  gagal := FALSE;
  BEGIN
    INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                         tanggal_tanda_tangan, nilai, kontrak_induk_id)
    VALUES (co, pr2, cl, 'addendum', 'VERIF344-BEDA', 'addendum proyek lain',
            CURRENT_DATE, 1000000, k1);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: addendum menunjuk induk di proyek LAIN — nilainya terhitung ke proyek yang salah';
  END IF;

  -- 10. Addendum MENDAHULUI induknya ditolak.
  gagal := FALSE;
  BEGIN
    INSERT INTO kontrak (company_id, project_id, client_id, jenis, nomor, judul,
                         tanggal_tanda_tangan, nilai, kontrak_induk_id)
    VALUES (co, pr, cl, 'addendum', 'VERIF344-MUNDUR', 'addendum mundur',
            CURRENT_DATE - 60, 1000000, k1);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: addendum bertanggal SEBELUM induknya diterima';
  END IF;

  -- 11. Kontrak BERLAKU terkunci nilainya.
  gagal := FALSE;
  BEGIN
    UPDATE kontrak SET nilai = 999000000 WHERE id = k1;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '344 gagal: nilai kontrak BERLAKU bisa diubah — dokumen bertanda tangan berubah sepihak';
  END IF;

  -- 12. Catatan & lingkup TETAP boleh diubah.
  UPDATE kontrak SET catatan = 'uji catatan', lingkup = 'uji lingkup' WHERE id = k1;

  -- 13. Nilai BERJALAN bisa dihitung dari kontrak — inti gunanya.
  SELECT sum(nilai)::INT INTO n
    FROM kontrak
   WHERE project_id = pr AND status = 'berlaku'
     AND (jenis = 'induk' OR kontrak_induk_id IS NOT NULL);
  IF n <> 120000000 THEN
    RAISE EXCEPTION '344 gagal: nilai berjalan terhitung % (harus 120000000 = 100jt + 25jt − 5jt)', n;
  END IF;

  DELETE FROM kontrak WHERE nomor LIKE 'VERIF344-%';

  -- 14. RLS berpolicy.
  SELECT count(*) INTO n FROM pg_policies WHERE tablename = 'kontrak';
  IF n < 2 THEN
    RAISE EXCEPTION '344 gagal: policy kontrak kurang (%)', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'kontrak' AND relforcerowsecurity) THEN
    RAISE EXCEPTION '344 gagal: FORCE RLS mati — tabel ini memuat NILAI KONTRAK';
  END IF;

  RAISE NOTICE '344 OK — register kontrak: 10 kasus negatif ditolak, nilai berjalan terhitung benar';
END $$;
