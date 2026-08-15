-- ============================================================================
-- 398 — AUTOMATION 3.18: KINERJA PROYEK MENURUN (SPI/CPI)
-- ============================================================================
--
-- Automation 3.18 ditunda 2026-08-15 dengan alasan yang tercatat di
-- `ROADMAP-WORKFLOW.md` §3: EVM tidak disimpan di tabel mana pun, dan merakit
-- ulang BAC/AC/EV/PV di dalam otomasi butuh ~25 baris salinan dari handler
-- `kurva-s.ts`.
--
-- Alasan itu tetap berlaku. Yang berubah: jalan keluarnya bukan menyalin
-- rumusnya, melainkan **memanggil rute yang sama** lewat `server.inject` —
-- pola yang sudah ada dan sudah beralasan di `lib/ai-setujui.ts` dan
-- `routes/v1/jadwal.ts`. Dengan begitu SPI yang muncul di notifikasi dan SPI
-- yang muncul di layar Kurva-S dijamin angka yang sama, karena keduanya
-- lahir dari perhitungan yang sama persis.
--
-- Dua sumber untuk satu angka adalah cara paling sunyi membuat laporan dan
-- notifikasi berselisih; menyalin rumusnya akan menciptakan persis itu.
--
-- ── Ambang: DUA, bukan satu
--
-- SPI dan CPI mengukur hal yang berbeda dan gagal secara berbeda:
--
--   SPI < 1  → pekerjaan lebih lambat dari rencana
--   CPI < 1  → biaya lebih besar dari nilai yang diperoleh
--
-- Proyek bisa tepat waktu tapi boros (SPI baik, CPI buruk) atau hemat tapi
-- tertinggal. Satu ambang gabungan akan menyembunyikan salah satunya, dan
-- yang tersembunyi selalu yang tidak diduga.
--
-- Bawaannya 0.90 — bukan 1.00. SPI persis 1.00 hampir tak pernah terjadi pada
-- proyek nyata, dan ambang di 1.00 berarti hampir setiap proyek memicu pesan
-- setiap hari. Notifikasi yang selalu menyala berhenti dibaca, dan itu lebih
-- buruk daripada tak ada notifikasi sama sekali.
-- ============================================================================

-- ── Aturan notifikasi ───────────────────────────────────────────────────────
--
-- Tanpa baris ini, `resolveRecipients()` memulangkan daftar kosong dan
-- otomasinya berjalan sukses sambil tak memberi tahu siapa pun — kegagalan
-- senyap yang terlihat persis seperti "tidak ada yang bermasalah".
INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'evm_kinerja_menurun', 'Kinerja Proyek Menurun',
       'Proyek yang indeks jadwal (SPI) atau indeks biayanya (CPI) turun di bawah ambang',
       true
  FROM companies c
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_active = true;

-- ── Penerimanya — dan kenapa ini BUKAN baris tambahan ───────────────────────
--
-- Bentuk pertama migrasi ini hanya membuat `notification_rules` dan berhenti.
-- Komentar di atas sudah memperingatkan bahwa tanpa aturan, `resolveRecipients`
-- memulangkan daftar kosong dan otomasinya "berjalan sukses sambil tak memberi
-- tahu siapa pun" — lalu saya melakukan persis kesalahan itu satu lapis lebih
-- dalam: aturannya ada, TARGETNYA tidak.
--
-- Gejalanya identik. Rute balas 200, `evm_terhitung` naik, nol notifikasi
-- tercipta, dan tak ada satu pun galat. Ditemukan test `otomasi-evm`, bukan
-- pembacaan ulang migrasi.
--
-- Dua target, bukan satu:
--
--   projects:edit  → yang bisa mengubah proyek. Merekalah yang bisa berbuat
--                    sesuatu terhadap jadwal yang tertinggal.
--   finance:view   → yang memantau biaya. CPI buruk adalah persoalan uang
--                    sebelum menjadi persoalan jadwal.
--
-- Berbasis PERMISSION, bukan nama peran — ADR-004. Peran adalah data
-- konfigurasi per-tenant; tenant yang menamai perannya "Site Manager"
-- alih-alih "PM" tetap menerima pesannya.
--
-- ⚠ `projects:edit` DIUKUR ke tabel `permissions`. Tebakan pertama saya
-- `projects:manage` tak ada — ketiga kalinya dalam sesi ini saya mengarang
-- kunci izin. Di sini FK yang menahannya (migrasi gagal keras); di rute,
-- `audit-izin-benar-ada` yang menahan. Keduanya ada justru karena kunci hantu
-- tak punya gejala sendiri.
INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('projects:edit'), ('finance:view')) AS v(izin)
 WHERE r.event_type = 'evm_kinerja_menurun'
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin
   );

-- ── Ambang, bisa diatur per tenant ──────────────────────────────────────────
--
-- `value_type = 'number'` supaya `PUT /api/v1/settings/config` menerimanya —
-- rute itu memvalidasi tipe terhadap kolom ini, dan tipe yang salah membuat
-- halaman Ambang Otomasi menolak simpan dengan pesan yang tak menyebut
-- sebabnya.
INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.key, v.value::jsonb, 'number', 'otomasi', v.keterangan
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.evm_spi.minimum', '0.90',
     'Batas bawah indeks jadwal (SPI). Di bawah ini proyek ditandai tertinggal.'),
    ('otomasi.evm_cpi.minimum', '0.90',
     'Batas bawah indeks biaya (CPI). Di bawah ini proyek ditandai boros.')
  ) AS v(key, value, keterangan)
ON CONFLICT (company_id, key) DO NOTHING;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
--
-- Bukan formalitas: migrasi 396 memasang lima ambang yang benar dan tetap
-- setengah jadi tanpa satu pun penjaga menandainya. Blok ini memastikan
-- setidaknya bentuk datanya tak bisa lolos separuh.
DO $$
DECLARE
  n_perusahaan INT;
  n_aturan     INT;
  n_target     INT;
  n_ambang     INT;
  contoh       TEXT;
BEGIN
  SELECT count(*) INTO n_perusahaan FROM companies;

  SELECT count(*) INTO n_aturan FROM notification_rules
   WHERE event_type = 'evm_kinerja_menurun' AND is_active;
  IF n_aturan <> n_perusahaan THEN
    RAISE EXCEPTION '398 gagal: aturan evm_kinerja_menurun ada di % dari % perusahaan',
      n_aturan, n_perusahaan;
  END IF;

  -- Aturan TANPA target = otomasi yang sukses tanpa memberi tahu siapa pun.
  -- Diperiksa terpisah karena itu persis cacat yang lolos di bentuk pertama
  -- migrasi ini.
  SELECT count(*) INTO n_target
    FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type = 'evm_kinerja_menurun';
  IF n_target <> n_perusahaan * 2 THEN
    RAISE EXCEPTION '398 gagal: % target notifikasi EVM, harus % (2 per perusahaan)',
      n_target, n_perusahaan * 2;
  END IF;

  SELECT count(*) INTO n_ambang FROM company_settings
   WHERE key IN ('otomasi.evm_spi.minimum', 'otomasi.evm_cpi.minimum');
  IF n_ambang <> n_perusahaan * 2 THEN
    RAISE EXCEPTION '398 gagal: % baris ambang EVM, harus % (2 per perusahaan)',
      n_ambang, n_perusahaan * 2;
  END IF;

  -- Tipe WAJIB `number`. Kalau ia tersimpan sebagai `string`, halaman Ambang
  -- Otomasi memuatnya (Number("0.9") = 0.9) tetapi rute PUT menolak
  -- menyimpannya — cacat yang hanya muncul saat seseorang mencoba mengubah.
  SELECT string_agg(DISTINCT value_type, ', ') INTO contoh
    FROM company_settings
   WHERE key IN ('otomasi.evm_spi.minimum', 'otomasi.evm_cpi.minimum');
  IF contoh IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '398 gagal: value_type ambang EVM = "%", harus "number"', contoh;
  END IF;
END $$;
