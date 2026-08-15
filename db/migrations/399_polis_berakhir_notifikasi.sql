-- ============================================================================
-- 399 — AUTOMATION 5.7 + 9.2: POLIS BERAKHIR & PROYEK TANPA ASURANSI
-- ============================================================================
--
-- `ROADMAP-WORKFLOW.md` §2 menulis modul Insurance & Surety "nol halaman, nol
-- rute (diukur 2026-08-15)", dan menandai 5.7 serta 9.2 sebagai menunggu modul
-- yang belum dibangun.
--
-- Diukur ulang 2026-08-16 — SALAH pada ketiganya:
--
--   tabel  `polis_asuransi`             ada
--   rute   `/api/v1/asuransi`           ada (GET + POST)
--   layar  `/kontrak/asuransi`          ada
--   fungsi `hitungRegisterAsuransi()`   ada, MURNI, sudah menghitung status
--                                       kedaluwarsa DAN celah pertanggungan
--
-- Pengukuran pertama saya mencari berkas ber-kata "insurance" — bahasa
-- Inggris, di repo yang menamai berkasnya bahasa Indonesia. Nol hasil terbaca
-- sebagai "belum ada", padahal artinya "saya mencari kata yang salah".
--
-- Yang hilang cuma pengirimnya. Migrasi ini memasang bagian data-nya.
--
-- ── Dua jenis notifikasi, bukan satu
--
-- Digabung akan terlihat lebih ringkas dan salah:
--
--   polis_segera_berakhir  → tindakannya MEMPERPANJANG polis yang ada
--   proyek_tanpa_asuransi  → tindakannya MENGASURANSIKAN proyek
--
-- Dan dedup harian bekerja per (jenis, record). Satu jenis untuk keduanya
-- membuat proyek yang sudah dikirimi peringatan polis tak lagi bisa dikirimi
-- peringatan "tak punya polis" di hari yang sama — padahal keduanya benar.
--
-- ── Target: PERMISSION, dan diukur
--
-- `projects:contract` dan `risiko:view` DIVERIFIKASI ada di tabel
-- `permissions`. Migrasi 398 gagal keras pada tebakan `projects:manage` yang
-- tak ada; FK yang menahannya. Kali ini diukur lebih dulu.
--
-- ── Target DITULIS DI MIGRASI YANG SAMA — pelajaran 398
--
-- Migrasi 398 versi pertama membuat aturan TANPA target. Gejalanya: rute balas
-- 200, nol notifikasi tercipta, tak ada galat sama sekali — persis kegagalan
-- senyap yang komentar migrasi itu sendiri peringatkan, satu lapis lebih
-- dalam. Ditemukan test, bukan pembacaan ulang.
-- ============================================================================

-- ── Aturan notifikasi ───────────────────────────────────────────────────────
INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.jenis, v.label, v.keterangan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('polis_segera_berakhir', 'Polis Asuransi Segera Berakhir',
     'Polis yang mendekati akhir masa berlaku atau sudah kadaluarsa'),
    ('proyek_tanpa_asuransi', 'Proyek Tanpa Asuransi',
     'Proyek berjalan yang belum punya satu polis pun tercatat')
  ) AS v(jenis, label, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_active = true;

-- ── Penerimanya ─────────────────────────────────────────────────────────────
--
--   projects:contract → yang mengurus dokumen kontraktual. Polis adalah
--                       dokumen kontraktual, dan merekalah yang memperpanjang.
--   risiko:view       → yang memantau risiko. Proyek tanpa pertanggungan
--                       adalah risiko sebelum menjadi persoalan administrasi.
INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('projects:contract'), ('risiko:view')) AS v(izin)
 WHERE r.event_type IN ('polis_segera_berakhir', 'proyek_tanpa_asuransi')
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin
   );

-- ── Ambang ──────────────────────────────────────────────────────────────────
--
-- 30 hari — SAMA dengan `AMBANG_SEGERA_HARI` di `lib/register-asuransi.ts`.
-- Kalau keduanya berbeda, layar Register Asuransi menandai polis "segera
-- berakhir" pada hari yang berbeda dari hari notifikasinya dikirim, dan yang
-- membuka layar sesudah menerima pesan menemukan status yang tak cocok.
INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.polis_berakhir.hari', '30'::jsonb, 'number', 'otomasi',
       'Hari sebelum polis asuransi berakhir mulai diperingatkan.'
  FROM companies c
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_perusahaan INT;
  n_aturan     INT;
  n_target     INT;
  n_ambang     INT;
  tipe         TEXT;
BEGIN
  -- Perusahaan AKTIF saja — migrasi ini hanya menulis untuk mereka.
  -- Bentuk pertama menghitung SELURUH baris `companies` dan menulis untuk
  -- seluruhnya juga; 597 di antaranya tenant sisa test yang sudah nonaktif.
  -- Lihat migrasi 402.
  SELECT count(*) INTO n_perusahaan FROM companies WHERE is_active;

  SELECT count(*) INTO n_aturan FROM notification_rules
   WHERE event_type IN ('polis_segera_berakhir', 'proyek_tanpa_asuransi')
     AND is_active;
  IF n_aturan <> n_perusahaan * 2 THEN
    RAISE EXCEPTION '399 gagal: % aturan aktif, harus % (2 per perusahaan)',
      n_aturan, n_perusahaan * 2;
  END IF;

  -- Aturan TANPA target = otomasi yang sukses tanpa memberi tahu siapa pun.
  -- Diperiksa terpisah karena itu persis cacat yang lolos di migrasi 398.
  SELECT count(*) INTO n_target
    FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type IN ('polis_segera_berakhir', 'proyek_tanpa_asuransi');
  IF n_target <> n_perusahaan * 4 THEN
    RAISE EXCEPTION '399 gagal: % target, harus % (2 aturan x 2 izin per perusahaan)',
      n_target, n_perusahaan * 4;
  END IF;

  SELECT count(*) INTO n_ambang FROM company_settings
   WHERE key = 'otomasi.polis_berakhir.hari';
  IF n_ambang <> n_perusahaan THEN
    RAISE EXCEPTION '399 gagal: % baris ambang, harus %', n_ambang, n_perusahaan;
  END IF;

  SELECT string_agg(DISTINCT value_type, ', ') INTO tipe
    FROM company_settings WHERE key = 'otomasi.polis_berakhir.hari';
  IF tipe IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '399 gagal: value_type ambang polis = "%", harus "number"', tipe;
  END IF;
END $$;
