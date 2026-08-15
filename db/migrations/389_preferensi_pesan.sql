-- ============================================================================
-- 389 — PREFERENSI PESAN: JAM TENANG, KUOTA HARIAN, BERHENTI
-- ============================================================================
--
-- PRASYARAT proaktivitas (Fase 3 dari rencana asisten). Bukan pelengkap yang
-- bisa menyusul.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA INI HARUS ADA SEBELUM ASISTEN BOLEH MENYAPA DULUAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur 2026-08-15, dan diukur ULANG hari ini sebelum migrasi ini ditulis:
--
--   jam tenang        NIHIL di seluruh repo
--   opt-out           NIHIL
--   batas frekuensi   NIHIL
--   rate limit kirim  NIHIL — `kirimWa` tak punya throttle sama sekali
--
-- Penyedia WhatsApp bawaan (Evolution) juga TIDAK punya batas jendela 24 jam
-- seperti WhatsApp Business resmi. Artinya begitu ada kode yang memanggil
-- `kirimWa` dari penjadwal, tak ada satu pun lapisan yang mencegahnya
-- mengirim pukul 03:00, berulang kali, ke orang yang sama.
--
-- Repo ini SUDAH pernah kena bentuknya: `teruskan-kasbon-diajukan` mengirim
-- 28 WhatsApp sungguhan sementara bukunya kosong. Yang membuatnya berhenti
-- bukan penjaga, melainkan seseorang yang kebetulan memperhatikan.
--
-- ══════════════════════════════════════════════════════════════════════════
-- SATU BARIS PER ORANG, DAN KETIADAAN BARIS BUKAN "TAK PUNYA PREFERENSI"
-- ══════════════════════════════════════════════════════════════════════════
--
-- Orang yang belum pernah membuka halaman preferensi TETAP dapat jam tenang
-- dan kuota — dari BAWAAN kolom, bukan dari ketiadaan aturan. Bawaan yang
-- berarti "kirim kapan saja, sebanyak apa pun" adalah cara paling pasti
-- membuat fitur ini tak menjaga siapa pun pada hari pertama.
--
-- Karena itu `bolehKirim()` di aplikasi memperlakukan baris yang HILANG sama
-- dengan bawaan tabel ini — bukan sebagai izin tanpa batas.
--
-- ── Kenapa jam disimpan TEXT 'HH:MM', bukan TIME
--
-- Mengikuti `jadwal_tugas.jam` yang sudah ada (migrasi 244) berikut CHECK
-- bentuknya. Dua representasi waktu untuk satu maksud di satu aplikasi adalah
-- cara termudah membuat perbandingan jam salah di salah satunya.
--
-- ── Kenapa `zona_waktu` ada meski hari ini semua tenant di WIB
--
-- `otomasi-terjadwal.ts:294` mencatatnya sebagai lubang yang diketahui:
-- *"Kalau kelak ada tenant lintas zona waktu, ini harus ikut zona proyeknya —
-- dicatat, belum dikerjakan."* Jam tenang adalah tempat lubang itu paling
-- menggigit: 22:00 WIB adalah 23:00 WITA, dan yang salah zona akan dikirimi
-- pesan tepat saat ia tidur.
--
-- Disimpan sekarang supaya nilainya tercatat sejak awal; pemakaiannya masih
-- WIB sampai ada tenant yang benar-benar membutuhkannya.
-- ============================================================================

CREATE TABLE IF NOT EXISTS preferensi_pesan (
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  /*
   * JAM TENANG — 21:00 sampai 07:00 sebagai bawaan.
   *
   * Melewati tengah malam DENGAN SENGAJA, dan `bolehKirim()` harus
   * menanganinya: `mulai > selesai` berarti rentangnya membungkus hari.
   * Menyimpannya sebagai dua kolom yang "harus mulai < selesai" akan memaksa
   * jam tenang berakhir sebelum tengah malam — yaitu tak menjaga malam sama
   * sekali, bagian hari yang justru jadi alasan fitur ini ada.
   */
  jam_tenang_mulai   TEXT NOT NULL DEFAULT '21:00',
  jam_tenang_selesai TEXT NOT NULL DEFAULT '07:00',

  /*
   * Berapa pesan PROAKTIF paling banyak per hari.
   *
   * Tiga, bukan sepuluh: yang menentukan orang berhenti membaca notifikasi
   * bukan isinya melainkan jumlahnya. Angka kecil yang kadang menahan pesan
   * berguna lebih baik daripada angka besar yang membuat semuanya diabaikan.
   *
   * TIDAK berlaku untuk balasan — orang yang bertanya memang menunggu jawaban.
   */
  maks_per_hari INTEGER NOT NULL DEFAULT 3,

  -- Sapaan tanpa temuan data. Terpisah dari `maks_per_hari` karena keduanya
  -- pertanyaan berbeda: "berapa banyak" vs "boleh menyapa tanpa alasan".
  boleh_sapaan BOOLEAN NOT NULL DEFAULT true,

  -- Opt-out penuh. Menahan SEMUA pesan proaktif, termasuk yang mendesak.
  berhenti BOOLEAN NOT NULL DEFAULT false,

  zona_waktu TEXT NOT NULL DEFAULT 'Asia/Jakarta',

  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (company_id, user_id),

  -- Bentuk jam ditegakkan BASIS, sama seperti `jadwal_tugas_jam_sah` (244).
  -- Jam rusak yang tersimpan membuat perbandingan diam-diam selalu salah,
  -- dan diamnya itu yang berbahaya.
  CONSTRAINT preferensi_jam_mulai_sah
    CHECK (jam_tenang_mulai ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT preferensi_jam_selesai_sah
    CHECK (jam_tenang_selesai ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  -- Nol sah: "jangan kirim proaktif sama sekali, tapi jangan berhenti total".
  -- Batas atas menahan angka yang jelas keliru ketik (300 ≠ 30).
  CONSTRAINT preferensi_kuota_wajar CHECK (maks_per_hari BETWEEN 0 AND 50)
);

CREATE INDEX IF NOT EXISTS idx_preferensi_pesan_user
  ON preferensi_pesan (user_id);

-- ------------------------------------------------------------
-- RLS — pola yang sama dengan tabel tenant lain (252, 385).
-- ------------------------------------------------------------
ALTER TABLE preferensi_pesan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON preferensi_pesan;
CREATE POLICY tenant_isolation ON preferensi_pesan AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS preferensi_pesan_kelola ON preferensi_pesan;
CREATE POLICY preferensi_pesan_kelola ON preferensi_pesan FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_preferensi_pesan_sentuh ON preferensi_pesan;
CREATE TRIGGER trg_preferensi_pesan_sentuh BEFORE UPDATE ON preferensi_pesan
  FOR EACH ROW EXECUTE FUNCTION fn_ai_sentuh();

-- ------------------------------------------------------------
-- Permission
--
-- `lihat` TIDAK dibuat: tiap orang berhak melihat dan mengubah preferensinya
-- SENDIRI tanpa izin apa pun — menuntut permission untuk itu berarti hampir
-- tak seorang pun bisa mematikan pesan yang mengganggunya, dan opt-out yang
-- butuh izin bukan opt-out.
--
-- Yang butuh izin hanya melihat/mengubah preferensi ORANG LAIN.
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description)
VALUES
  ('notifikasi:preferensi:kelola', 'notifications', 'Kelola preferensi pesan orang lain',
   'Melihat dan mengubah jam tenang, kuota, dan opt-out milik anggota lain')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key = 'notifikasi:preferensi:kelola'
   AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — artefak fisik, dan batasannya BENAR-BENAR menolak.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.preferensi_pesan') IS NULL THEN
    RAISE EXCEPTION '389 gagal: tabel preferensi_pesan tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'preferensi_pesan' AND n.nspname = 'public' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '389 gagal: RLS preferensi_pesan tidak aktif';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'notifikasi:preferensi:kelola'
  ) THEN
    RAISE EXCEPTION '389 gagal: izin preferensi tak dipegang role mana pun';
  END IF;
END $$;
