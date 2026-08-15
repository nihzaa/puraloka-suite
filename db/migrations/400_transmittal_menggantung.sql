-- ============================================================================
-- 400 — AUTOMATION 5.11: TRANSMITTAL BELUM DIKONFIRMASI
-- ============================================================================
--
-- `ROADMAP-WORKFLOW.md` menandai modul Transmittal sebagai belum dibangun.
-- Diukur 2026-08-16 — salah, sama seperti modul Insurance: tabel
-- `transmittal` + `transmittal_item` ada (3 baris), rute
-- `/api/v1/kendali-dokumen/transmittal` ada lengkap dengan aksi kirim dan
-- terima, dan layar `/dokumen/kendali` ada.
--
-- ── Yang dibangun BUKAN "auto-log"
--
-- Katalog menamainya *Transmittal Auto-Log*, yang menyiratkan otomasi mencatat
-- transmittal sendiri. Ditolak dengan alasan yang sama dengan 3.5 (draft MR
-- otomatis): transmittal menyatakan dokumen APA dikirim ke SIAPA untuk maksud
-- apa, dan tak satu pun bisa disimpulkan dari perubahan dokumen. Catatan yang
-- lahir sendiri menumpuk, dan yang menumpuk tak dibaca.
--
-- Yang dibangun bagian yang benar-benar hilang: transmittal yang sudah dikirim
-- tetapi tak pernah dikonfirmasi diterima. Gambar revisi terakhir yang tak
-- sampai TIDAK memunculkan galat apa pun — pekerjaan berjalan dengan gambar
-- lama, dan selisihnya baru terlihat di lapangan.
--
-- ── Penerimanya
--
--   documents:manage   → yang mengelola kendali dokumen; merekalah yang
--                        menagih konfirmasi. Kunci yang SAMA dengan gerbang
--                        rute transmittal itu sendiri (`kendali-dokumen.ts`).
--   projects:edit      → yang memimpin proyek. Dokumen yang menggantung
--                        menahan pekerjaan sebelum ia jadi persoalan arsip.
--
-- ⚠ Tebakan pertama saya `dokumen:kendali` TAK ADA — tabel `permissions` tak
-- punya satu pun kunci ber-kata "dokumen". Keempat kalinya dalam dua sesi saya
-- mengarang kunci izin, dan kali ini terbalik arahnya: saya menebak bahasa
-- Indonesia untuk kunci yang ternyata bahasa Inggris, sesudah sebelumnya
-- menebak bahasa Inggris untuk berkas yang ternyata bahasa Indonesia.
--
-- Pelajarannya bukan tentang bahasa melainkan tentang menebak. Cara mengukur
-- yang benar, dan yang seharusnya saya pakai sejak awal:
--
--     grep -n "requirePermission(" apps/api/src/routes/v1/<berkas>.ts
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'transmittal_menggantung', 'Transmittal Belum Dikonfirmasi',
       'Transmittal yang sudah dikirim tetapi belum dikonfirmasi diterima',
       true
  FROM companies c
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_active = true;

-- Target ditulis di migrasi yang SAMA — pelajaran 398, di mana aturan tanpa
-- target menghasilkan otomasi yang balas 200 dan nol notifikasi, tanpa galat.
INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('documents:manage'), ('projects:edit')) AS v(izin)
 WHERE r.event_type = 'transmittal_menggantung'
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin
   );

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.transmittal_menggantung.hari', '7'::jsonb, 'number', 'otomasi',
       'Hari transmittal terkirim tanpa konfirmasi sebelum ditegur.'
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
   WHERE event_type = 'transmittal_menggantung' AND is_active;
  IF n_aturan <> n_perusahaan THEN
    RAISE EXCEPTION '400 gagal: % aturan aktif, harus %', n_aturan, n_perusahaan;
  END IF;

  SELECT count(*) INTO n_target
    FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type = 'transmittal_menggantung';
  IF n_target <> n_perusahaan * 2 THEN
    RAISE EXCEPTION '400 gagal: % target, harus % (2 izin per perusahaan)',
      n_target, n_perusahaan * 2;
  END IF;

  SELECT count(*) INTO n_ambang FROM company_settings
   WHERE key = 'otomasi.transmittal_menggantung.hari';
  IF n_ambang <> n_perusahaan THEN
    RAISE EXCEPTION '400 gagal: % baris ambang, harus %', n_ambang, n_perusahaan;
  END IF;

  SELECT string_agg(DISTINCT value_type, ', ') INTO tipe
    FROM company_settings WHERE key = 'otomasi.transmittal_menggantung.hari';
  IF tipe IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '400 gagal: value_type = "%", harus "number"', tipe;
  END IF;
END $$;
