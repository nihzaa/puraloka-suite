-- ============================================================================
-- 538 — Katalog fitur paket di ERP: BATASNYA, bukan HARGANYA
-- ============================================================================
--
-- ── Yang ditutup
--
-- `utils/batas-paket.ts` (commit 46212e46) menegakkan batas paket, dan gerbang
-- kuota sudah terpasang di pembuatan proyek. Tetapi diukur 2026-08-31:
--
--     plans                  0 baris
--     plan_features          0 baris
--     plan_feature_values    0 baris
--     subscriptions          0 baris
--
-- Gerbangnya ada, yang dijaganya tidak. Tiap pemeriksaan jatuh ke cabang
-- "tak dibatasi" dan pulang tanpa melihat apa pun.
--
-- ══════════════════════════════════════════════════════════════════════════
-- YANG DI-SEED DI SINI, DAN YANG SENGAJA TIDAK
-- ══════════════════════════════════════════════════════════════════════════
--
--   DI-SEED     `plan_features` — DAFTAR batas yang bisa ditegakkan.
--               Ini pertanyaan TEKNIS: kuota apa yang kodenya sanggup
--               menghitung, modul apa yang bisa dibuka-tutup. Jawabannya ada
--               di kode, bukan di kepala founder.
--
--   TIDAK       `plans` dan `plan_feature_values` — paket apa saja yang
--               dijual, seharga berapa, dan tiap paket dapat berapa.
--               Ini keputusan KOMERSIAL.
--
-- ⚠ Kenapa harga TIDAK boleh ikut, meski akan membuat gerbangnya "hidup"
-- hari ini juga.
--
-- Preseden di repo ini sudah dibayar mahal: migrasi 297 (peta akun jurnal)
-- GAGAL bila ada satu baris tertanam, dengan alasan yang berlaku persis di
-- sini — *"bawaan yang terisi sendiri tak pernah ditanyakan siapa pun karena
-- hasilnya terlihat wajar."*
--
-- Paket "Dasar Rp 500.000, 3 proyek" yang saya karang akan terlihat masuk
-- akal, lalu dipakai, lalu jadi harga resmi tanpa seorang pun memutuskannya.
-- Dan begitu satu pelanggan berlangganan di angka itu, mengubahnya bukan lagi
-- soal menyunting baris.
--
-- Founder menetapkannya lewat konsol vendor (admin-saas), tempat paket, harga,
-- kuota, dan penayangannya memang sudah bisa diatur dari layar.
--
-- ── Kunci fitur DISAMAKAN dengan konsol vendor
--
-- `admin-saas/db/seeds/007_fitur_bawaan.sql` sudah memakai kunci ini persis
-- (`modul.proyek`, `kuota.proyek_aktif`, …). Dua sistem yang memakai kunci
-- BERBEDA untuk hal yang sama akan diam-diam tak sepakat soal apa yang
-- didapat pelanggan: konsol menjanjikan `kuota.proyek`, ERP menegakkan
-- `kuota.proyek_aktif`, dan yang menang adalah yang tak pernah ketemu — jadi
-- batasnya tak pernah berlaku.
--
-- Kunci di sini karena itu disalin, bukan disusun ulang.
-- ============================================================================

INSERT INTO plan_features (key, label, description, value_type) VALUES
  -- ── Kuota: satu-satunya jenis yang KODENYA sudah bisa menghitung ─────────
  --
  -- `kuota.proyek_aktif` sudah ditegakkan di POST /api/v1/projects. Dua
  -- lainnya BELUM punya penegak — sengaja tetap didaftarkan supaya konsol
  -- vendor bisa menawarkannya dan angkanya tersimpan; yang kurang tinggal
  -- pemanggilan `masihMuat()` di rutenya masing-masing.
  ('kuota.proyek_aktif',   'Batas proyek aktif',     'Berapa proyek boleh berjalan bersamaan. Kosong = tak terbatas.', 'integer'),
  ('kuota.pengguna',       'Batas pengguna',         'Berapa akun boleh dibuat. Kosong = tak terbatas.',               'integer'),
  ('kuota.penyimpanan_gb', 'Batas penyimpanan (GB)', 'Total dokumen & foto yang boleh disimpan.',                      'integer'),

  -- ── Modul: buka/tutup ────────────────────────────────────────────────────
  --
  -- Kunci dan nama disalin dari katalog konsol vendor (seed 007 admin-saas).
  ('modul.proyek',    'Proyek',              'Daftar proyek, progres, dan status.',              'boolean'),
  ('modul.estimasi',  'Estimasi & Anggaran', 'RAB, AHSP, dan versi estimasi.',                   'boolean'),
  ('modul.kontrak',   'Kontrak',             'Kontrak, addendum, dan termin.',                   'boolean'),
  ('modul.jadwal',    'Perencanaan & Jadwal','Kurva-S, baseline, dan lintasan kritis.',          'boolean'),
  ('modul.lapangan',  'Lapangan',            'Progres harian, foto, dan instruksi lapangan.',    'boolean'),
  ('modul.keuangan',  'Keuangan',            'Invoice, pembayaran, kas, dan arus kas.',          'boolean'),
  ('modul.akuntansi', 'Akuntansi',           'Buku besar, jurnal, dan tutup buku.',              'boolean'),
  ('modul.rap',       'RAP & Kendali Biaya', 'Rencana anggaran pelaksanaan dan serapannya.',     'boolean'),
  ('modul.pengadaan', 'Pengadaan',           'Permintaan material, PO, dan penerimaan.',         'boolean'),
  ('modul.gudang',    'Gudang & Material',   'Stok, transfer, dan rekonsiliasi material.',       'boolean'),
  ('modul.mandor',    'Mandor & Subkon',     'Penugasan, opname, dan pembayaran progres.',       'boolean'),
  ('modul.mitra',     'Mitra & Vendor',      'Data mitra, kualifikasi, dan daftar hitam.',       'boolean'),
  ('modul.mutu',      'Mutu & K3',           'NCR, inspeksi, dan punch list.',                   'boolean'),
  ('modul.uji_mutu',  'Rencana & Uji Mutu',  'ITP, rencana mutu, dan hasil uji.',                'boolean'),
  ('modul.k3_lingkungan','K3 & Lingkungan',  'Kepatuhan K3 dan pelaporan insiden.',              'boolean'),
  ('modul.risiko',    'Risiko & Kepatuhan',  'Register risiko, mitigasi, dan audit internal.',   'boolean'),
  ('modul.sdm',       'SDM & Payroll',       'Pegawai, absensi, timesheet, dan payroll.',        'boolean'),
  ('modul.crm',       'CRM & Tender',        'Prospek, tender, dan penawaran.',                  'boolean'),
  ('modul.alat',      'Alat & Aset',         'Alat operasional, sewa, dan pemeliharaan.',        'boolean'),
  ('modul.dokumen',   'Dokumen',             'Kendali dokumen, surat, dan submittal.',           'boolean'),
  ('modul.bi',        'Pelaporan & BI',      'Laporan tersusun, dasbor, dan ekspor.',            'boolean'),
  ('modul.ai',        'AI & Otomasi',        'Asisten, otomasi terjadwal, dan WhatsApp.',        'boolean')
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  -- `value_type` IKUT diperbarui dengan sengaja: jenis yang salah membuat
  -- `bolehPakaiFitur()`/`masihMuat()` pulang "boleh" tanpa memeriksa apa pun,
  -- karena keduanya menyaring menurut jenis. Membiarkannya berarti membiarkan
  -- gerbang yang diam.
  value_type  = EXCLUDED.value_type;

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE
  v_kuota INT; v_modul INT; v_paket INT; v_nilai INT; v_jenis INT;
BEGIN
  SELECT count(*) INTO v_kuota FROM plan_features WHERE value_type = 'integer';
  SELECT count(*) INTO v_modul FROM plan_features WHERE value_type = 'boolean';

  IF v_kuota < 3 THEN
    RAISE EXCEPTION '538 gagal: harap >= 3 fitur kuota, ada %', v_kuota;
  END IF;
  IF v_modul < 22 THEN
    RAISE EXCEPTION '538 gagal: harap >= 22 fitur modul, ada %', v_modul;
  END IF;

  -- Jenis di luar yang dikenal `batas-paket.ts` membuat fiturnya tak pernah
  -- ditegakkan — kedua fungsinya menyaring `jenis`, dan yang tak cocok pulang
  -- "boleh". Diam, bukan galat.
  SELECT count(*) INTO v_jenis FROM plan_features
   WHERE value_type NOT IN ('integer', 'boolean', 'text');
  IF v_jenis <> 0 THEN
    RAISE EXCEPTION '538 gagal: % fitur ber-value_type tak dikenal', v_jenis;
  END IF;

  -- ⚠ Pagar yang menjaga migrasi ini tetap TEKNIS.
  --
  -- Kalau suatu hari ada yang menambahkan paket & harga di sini "supaya
  -- gerbangnya hidup", migrasi ini MENOLAK jalan. Harga adalah keputusan
  -- founder; migrasi yang menetapkannya diam-diam melewati orang yang
  -- seharusnya memutuskan.
  SELECT count(*) INTO v_paket FROM plans;
  SELECT count(*) INTO v_nilai FROM plan_feature_values;
  IF v_paket <> 0 OR v_nilai <> 0 THEN
    RAISE EXCEPTION
      '538 gagal: % paket + % nilai fitur ter-seed. Katalog fitur TEKNIS; paket & harga KOMERSIAL — tetapkan lewat konsol vendor, jangan lewat migrasi.',
      v_paket, v_nilai;
  END IF;
END $$;
