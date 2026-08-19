-- ════════════════════════════════════════════════════════════════════════════
-- 461 — Mitra: SATU identitas, banyak peran, dua BENTUK
-- ════════════════════════════════════════════════════════════════════════════
--
-- Founder menjawab R-017 pada 2026-08-19. Saya bertanya *"subkon itu
-- perusahaan ATAU orang?"* dan jawabannya menolak pilihan itu: **bisa
-- dua-duanya**.
--
-- Jawaban itu benar, dan pertanyaan sayalah yang salah. Praktik konstruksi
-- Indonesia memang campuran: mandor borongan diikat ORANGNYA (yang dipercaya
-- adalah orangnya, bukan CV-nya), sementara spesialis ME/lift/waterproofing
-- diikat BADAN USAHANYA (yang dituntut kalau gagal adalah PT-nya). Memaksa
-- salah satu berarti memaksa separuh mitra dicatat dengan cara yang salah.
--
-- ── Cacat yang ditutup, DIUKUR bukan diduga
--
-- Identitas mitra hari ini terpecah tiga tabel yang tak saling mengenal:
--
--   workers                        yang MENAWAR   (60 baris)
--   users via mandor_assignments   yang MENGERJAKAN
--   suppliers                      yang DIEVALUASI ( 5 baris)
--
-- Yang membuatnya berbahaya bukan kerapian, melainkan **gerbang kelayakan
-- yang cuma menutup satu pintu**. Diukur 2026-08-19:
--
--   evaluasi_subkon.supplier_id      → suppliers   (5 evaluasi)
--   prakualifikasi_vendor.supplier_id → suppliers   (5 prakualifikasi)
--   penawaran_subkon.worker_id        → workers     (8 penawaran)
--
-- **Kedelapan penawaran tender datang lewat `workers`.** Sementara
-- `evaluasi_subkon.masuk_daftar_hitam` — satu-satunya penanda daftar hitam —
-- hanya bisa menunjuk `suppliers`. Dan `tender-subkon.ts` maupun `spk.ts`
-- TIDAK memeriksanya sama sekali (nol rujukan `masuk_daftar_hitam` di kedua
-- berkas).
--
-- Jadi pihak yang di-blacklist tetap bisa menawar dan menang, karena ia masuk
-- lewat pintu yang tak dijaga. Bukan karena penjaganya lalai — karena
-- penjaganya berdiri di pintu yang lain.
--
-- ── Kenapa TABEL INDUK, bukan menggabung ketiganya
--
-- Menggabungkan berarti memilih satu tabel sebagai pemenang lalu memindahkan
-- puluhan FK. Diukur: 8 tabel merujuk `workers`, 14 merujuk `suppliers`.
-- Dua puluh dua FK yang harus dipindah, di modul yang sudah hidup.
--
-- Yang dilakukan migrasi ini justru sebaliknya: **nol tabel dihapus, nol FK
-- dipindah, nol rute berubah.** Ketiga tabel lama tetap jadi tempat datanya;
-- yang ditambahkan cuma satu kolom `mitra_id` di masing-masing, menunjuk
-- identitas bersama. Modul yang tak peduli identitas tak perlu tahu tabel ini
-- ada.
--
-- ── Kenapa SEKARANG waktu termurah
--
-- Diukur 2026-08-19: `workers` 60 baris, `suppliers` 5 baris, dan **NOL nama
-- yang sama** di antara keduanya (dicocokkan `lower(btrim(name))`). Artinya
-- backfill tak perlu menebak satu pun pasangan — tiap baris jadi satu mitra,
-- titik.
--
-- Tiap bulan menunggu berarti lebih banyak baris yang harus dicocokkan
-- tangan, dan pencocokan tangan pada identitas adalah tempat lahirnya
-- duplikat yang tak pernah ketahuan.
--
-- ── Yang migrasi ini SENGAJA belum lakukan
--
-- Ia TIDAK memasang gerbang blacklist di rute tender. Itu perubahan perilaku
-- yang butuh test perilakunya sendiri, dan mencampurnya ke migrasi skema
-- membuat keduanya sulit dibaca maupun dibalik. Migrasi ini menyediakan
-- JALANNYA; gerbangnya dipasang di lapisan kode.
--
-- Idempoten. Aman dijalankan berulang.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Bentuk mitra: orang atau badan usaha ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mitra_bentuk') THEN
    CREATE TYPE mitra_bentuk AS ENUM ('orang', 'badan_usaha');
  END IF;
END $$;

-- ── 2. Tabel induk ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mitra (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Bentuk menentukan kolom mana yang bermakna, dan dijaga CHECK di bawah.
  bentuk      mitra_bentuk NOT NULL,
  nama        text NOT NULL,

  -- Hanya bermakna untuk badan usaha. Dibiarkan NULL untuk orang, bukan
  -- diisi string kosong: "tak punya NPWP" dan "NPWP-nya kosong" adalah dua
  -- pernyataan berbeda, dan yang kedua bohong.
  npwp        text,
  bentuk_badan text,          -- PT / CV / UD / Firma — teks bebas, bukan enum:
                              -- bentuk badan usaha Indonesia bertambah, dan
                              -- enum yang salah menolak mitra yang sah.

  telepon     text,
  email       text,
  alamat      text,
  catatan     text,

  -- Daftar hitam hidup DI SINI, bukan di salah satu tabel peran. Itu inti
  -- migrasi ini: penanda yang menutup SEMUA pintu sekaligus.
  --
  -- `evaluasi_subkon.masuk_daftar_hitam` TIDAK dihapus — ia catatan penilaian
  -- per-periode, dan tetap berguna sebagai riwayat. Yang di sini adalah
  -- KEADAAN SEKARANG: satu jawaban untuk "boleh berbisnis dengan pihak ini?"
  daftar_hitam        boolean NOT NULL DEFAULT false,
  alasan_daftar_hitam text,
  daftar_hitam_sejak  timestamptz,

  aktif       boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Badan usaha WAJIB punya bentuk badan. "PT" tanpa tahu PT atau CV membuat
  -- kop surat dan kontrak salah sebut, dan itu cacat hukum, bukan kosmetik.
  CONSTRAINT chk_mitra_badan_punya_bentuk CHECK (
    bentuk <> 'badan_usaha' OR nullif(btrim(coalesce(bentuk_badan, '')), '') IS NOT NULL
  ),
  -- Orang TIDAK punya bentuk badan. Mengisinya berarti datanya bicara dua hal
  -- yang bertentangan tentang satu pihak.
  CONSTRAINT chk_mitra_orang_tanpa_bentuk_badan CHECK (
    bentuk <> 'orang' OR bentuk_badan IS NULL
  ),
  -- Daftar hitam TANPA alasan tak bisa ditinjau ulang, tak bisa dibantah, dan
  -- tak bisa dicabut oleh siapa pun yang tak ada saat itu. Ia jadi hukuman
  -- seumur hidup karena alasan yang tak seorang pun ingat.
  CONSTRAINT chk_mitra_hitam_beralasan CHECK (
    daftar_hitam = false OR nullif(btrim(coalesce(alasan_daftar_hitam, '')), '') IS NOT NULL
  ),
  CONSTRAINT chk_mitra_nama_tak_kosong CHECK (btrim(nama) <> '')
);

-- Satu nama per tenant per bentuk. Bukan unique global: dua tenant boleh
-- punya mitra bernama sama, dan orang bernama sama dengan sebuah CV pun sah.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mitra_nama_per_tenant
  ON mitra (company_id, bentuk, lower(btrim(nama)));

CREATE INDEX IF NOT EXISTS idx_mitra_company ON mitra (company_id);
CREATE INDEX IF NOT EXISTS idx_mitra_hitam   ON mitra (company_id) WHERE daftar_hitam;

-- ── 3. Tiga tabel peran menunjuk induknya ───────────────────────────────────
-- ON DELETE SET NULL, bukan CASCADE: menghapus identitas tak boleh
-- menghapus riwayat upah, PO, atau absensi. Yang hilang cukup tautannya.
ALTER TABLE workers   ADD COLUMN IF NOT EXISTS mitra_id uuid REFERENCES mitra(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS mitra_id uuid REFERENCES mitra(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_mitra   ON workers   (mitra_id) WHERE mitra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_mitra ON suppliers (mitra_id) WHERE mitra_id IS NOT NULL;

-- ── 4. RLS — sama ketatnya dengan tabel tenant lain ─────────────────────────
ALTER TABLE mitra ENABLE ROW LEVEL SECURITY;
ALTER TABLE mitra FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON mitra;
CREATE POLICY tenant_isolation ON mitra
  -- RESTRICTIVE, bukan PERMISSIVE. Policy permissive di-OR: satu policy
  -- `USING(true)` di kemudian hari akan MEMBATALKAN saringan ini tanpa satu
  -- pun galat. Sudah terjadi di repo ini (migrasi 457, `pengingat_dasar`).
  --
  -- `(SELECT auth_company_id())` — subselect DISENGAJA, mengikuti pola
  -- `suppliers`/`workers`. Tanpa pembungkus itu fungsinya dipanggil sekali
  -- PER BARIS; dengan pembungkus ia jadi InitPlan yang dievaluasi sekali.
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS mitra_akses ON mitra;
CREATE POLICY mitra_akses ON mitra
  FOR ALL USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── 5. Backfill — sekarang, selagi nol nama bertabrakan ─────────────────────
DO $$
DECLARE
  v_w int; v_s int;
BEGIN
  -- Tukang → mitra berbentuk ORANG.
  INSERT INTO mitra (company_id, bentuk, nama, telepon, catatan, aktif)
  SELECT w.company_id, 'orang', btrim(w.name), w.phone, w.notes, w.is_active
    FROM workers w
   WHERE w.company_id IS NOT NULL
     AND btrim(coalesce(w.name, '')) <> ''
     AND w.mitra_id IS NULL
  ON CONFLICT (company_id, bentuk, lower(btrim(nama))) DO NOTHING;

  UPDATE workers w SET mitra_id = m.id
    FROM mitra m
   WHERE w.mitra_id IS NULL
     AND m.company_id = w.company_id
     AND m.bentuk = 'orang'
     AND lower(btrim(m.nama)) = lower(btrim(w.name));
  GET DIAGNOSTICS v_w = ROW_COUNT;

  -- Pemasok → mitra berbentuk BADAN USAHA.
  --
  -- `bentuk_badan` diisi 'PT' sebagai NILAI SEMENTARA yang HARUS ditinjau,
  -- bukan sebagai tebakan yang dianggap benar. CHECK menuntut kolom itu
  -- terisi untuk badan usaha, dan menolak backfill hanya karena bentuk
  -- badannya belum diketahui akan membuat 5 pemasok tak punya identitas sama
  -- sekali — keadaan yang lebih buruk. Catatannya ditandai supaya bisa
  -- dicari dan diperbaiki dari UI.
  INSERT INTO mitra (company_id, bentuk, nama, bentuk_badan, telepon, email,
                     alamat, catatan, aktif)
  SELECT s.company_id, 'badan_usaha', btrim(s.name), 'PT', s.phone, s.email,
         s.address,
         concat_ws(E'\n', s.notes, '[PERLU-TINJAU] bentuk badan diisi otomatis '
           || 'saat migrasi 461 — pastikan PT/CV/UD-nya benar sebelum dipakai '
           || 'di kontrak.'),
         s.is_active
    FROM suppliers s
   WHERE s.company_id IS NOT NULL
     AND btrim(coalesce(s.name, '')) <> ''
     AND s.mitra_id IS NULL
  ON CONFLICT (company_id, bentuk, lower(btrim(nama))) DO NOTHING;

  UPDATE suppliers s SET mitra_id = m.id
    FROM mitra m
   WHERE s.mitra_id IS NULL
     AND m.company_id = s.company_id
     AND m.bentuk = 'badan_usaha'
     AND lower(btrim(m.nama)) = lower(btrim(s.name));
  GET DIAGNOSTICS v_s = ROW_COUNT;

  RAISE NOTICE '461 backfill — % tukang, % pemasok tertaut ke mitra', v_w, v_s;
END $$;

-- ── 6. VERIFIKASI — migrasi ini membuktikan dirinya sendiri ─────────────────
DO $$
DECLARE
  v_co uuid; v_co2 uuid; v_m uuid; v_lolos boolean;
  v_yatim int;
BEGIN
  SELECT id INTO v_co FROM companies ORDER BY created_at, id LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE '461 — tak ada company, verifikasi dilewati';
    RETURN;
  END IF;

  -- (a) Badan usaha WAJIB punya bentuk badan.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO mitra (company_id, bentuk, nama) VALUES (v_co, 'badan_usaha', '[461-A]');
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM mitra WHERE nama LIKE '[461-%';
    RAISE EXCEPTION '461 gagal: badan usaha tanpa bentuk badan diterima — '
      'kop surat dan kontrak akan salah sebut PT/CV';
  END IF;

  -- (b) Orang TIDAK boleh punya bentuk badan.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO mitra (company_id, bentuk, nama, bentuk_badan)
    VALUES (v_co, 'orang', '[461-B]', 'PT');
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM mitra WHERE nama LIKE '[461-%';
    RAISE EXCEPTION '461 gagal: orang berbentuk badan diterima — '
      'satu pihak dicatat sebagai dua hal yang bertentangan';
  END IF;

  -- (c) Daftar hitam TANPA alasan ditolak.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO mitra (company_id, bentuk, nama, daftar_hitam)
    VALUES (v_co, 'orang', '[461-C]', true);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM mitra WHERE nama LIKE '[461-%';
    RAISE EXCEPTION '461 gagal: daftar hitam tanpa alasan diterima — '
      'hukuman yang tak seorang pun ingat sebabnya, dan tak bisa dicabut';
  END IF;

  -- (d) Nama kembar per tenant per bentuk DITOLAK.
  INSERT INTO mitra (company_id, bentuk, nama) VALUES (v_co, 'orang', '[461-D]')
  RETURNING id INTO v_m;
  v_lolos := FALSE;
  BEGIN
    INSERT INTO mitra (company_id, bentuk, nama) VALUES (v_co, 'orang', '  [461-d]  ');
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM mitra WHERE nama ILIKE '%[461-%';
    RAISE EXCEPTION '461 gagal: nama kembar diterima (beda spasi/huruf besar) — '
      'satu pihak jadi dua identitas, dan daftar hitam cuma menutup salah satunya';
  END IF;

  -- (e) Bentuk BERBEDA dengan nama sama tetap boleh — orang dan CV boleh
  --     senama, dan menolaknya akan memaksa salah satu dicatat keliru.
  BEGIN
    INSERT INTO mitra (company_id, bentuk, nama, bentuk_badan)
    VALUES (v_co, 'badan_usaha', '[461-D]', 'CV');
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM mitra WHERE nama ILIKE '%[461-%';
    RAISE EXCEPTION '461 gagal: nama sama beda BENTUK ditolak — '
      'orang dan badan usaha senama itu sah';
  END;

  -- (f) Tenant LAIN tak bisa melihat/menyentuh (dijaga RLS, diperiksa di
  --     lapisan test; di sini cukup dipastikan kolom tenancy-nya WAJIB).
  SELECT id INTO v_co2 FROM companies WHERE id <> v_co ORDER BY id LIMIT 1;
  v_lolos := FALSE;
  BEGIN
    INSERT INTO mitra (company_id, bentuk, nama) VALUES (NULL, 'orang', '[461-F]');
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM mitra WHERE nama ILIKE '%[461-%';
    RAISE EXCEPTION '461 gagal: mitra tanpa company_id diterima — '
      'baris yang tak dimiliki siapa pun lolos SEMUA saringan tenant';
  END IF;

  DELETE FROM mitra WHERE nama ILIKE '%[461-%';

  -- (g) Backfill benar-benar menaut, bukan cuma menambah baris.
  SELECT count(*) INTO v_yatim FROM workers
   WHERE company_id IS NOT NULL AND btrim(coalesce(name,'')) <> '' AND mitra_id IS NULL;
  IF v_yatim > 0 THEN
    RAISE EXCEPTION '461 gagal: % tukang tak tertaut mitra sesudah backfill — '
      'identitas tetap terpecah, dan gerbang kelayakan tetap bocor', v_yatim;
  END IF;

  SELECT count(*) INTO v_yatim FROM suppliers
   WHERE company_id IS NOT NULL AND btrim(coalesce(name,'')) <> '' AND mitra_id IS NULL;
  IF v_yatim > 0 THEN
    RAISE EXCEPTION '461 gagal: % pemasok tak tertaut mitra sesudah backfill', v_yatim;
  END IF;

  RAISE NOTICE '461 OK — mitra: dua bentuk, badan wajib berbentuk badan, '
    'orang tidak, daftar hitam wajib beralasan, nama unik per tenant per bentuk, '
    'nama sama beda bentuk tetap sah, company_id wajib, backfill nol yatim';
END $$;
