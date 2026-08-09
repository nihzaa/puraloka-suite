-- ============================================================================
-- 247 — `progress_payments.approved_by` BOLEH NULL (TJS-A3a)
-- ============================================================================
--
-- Ditemukan saat menulis test untuk perbaikan self-approval: kolomnya
-- **NOT NULL**, jadi kode LAMA sebenarnya TERPAKSA mengisinya saat membuat
-- pembayaran — dan satu-satunya nilai yang tersedia saat itu adalah pemohonnya
-- sendiri.
--
-- Itu menjelaskan kenapa `mandor.ts` dulu menulis:
--
--     requested_by: user.id,
--     approved_by:  user.id,     ← basis tak memberi pilihan lain
--
-- Jadi cacatnya bukan cuma di kode. Skemanya sendiri merancang pembayaran
-- sebagai "sudah disetujui sejak lahir":
--
--     approved_by   NOT NULL,  tanpa default
--     requested_by  NULL       ← justru yang ini boleh kosong
--     status        NOT NULL DEFAULT 'approved'
--
-- Ketiganya menuju arah yang sama: pembayaran yang belum diputuskan siapa pun
-- tak punya cara direpresentasikan. Memperbaiki kode tanpa memperbaiki ini
-- akan membuat insert-nya GAGAL — dan itu ketahuan lewat test, bukan lewat
-- pengguna yang tak bisa mengajukan pembayaran.
--
-- ── Yang diubah, dan yang TIDAK
--
--   ✓ `approved_by` jadi nullable — pembayaran `pending` kini bisa jujur
--     menyatakan belum ada yang menyetujuinya.
--
--   ✗ Default `status` TIDAK diubah. Mengubahnya dari `'approved'` ke
--     `'pending'` menyentuh perilaku tiap penulisan yang tak menyebut status
--     eksplisit — termasuk jalur yang belum ditelusuri. Pekerjaan tersendiri.
--     Yang sudah aman: `mandor.ts` menyebut `status: 'pending'` eksplisit.
--
--   ✗ Lima baris yang sudah ada TIDAK disentuh. Semuanya `approved_by` terisi,
--     dan mengosongkannya berarti mengarang keadaan yang tak pernah terjadi.
--
-- ── Kenapa melonggarkan constraint bukan pelemahan
--
-- NOT NULL di sini tak pernah menjaga apa pun — ia justru MEMAKSA data palsu.
-- Yang menjaga adalah SoD di `mandor.ts` (pemohon ≠ penyetuju, 403) dan klaim
-- status atomik. Constraint yang memaksa kebohongan lebih buruk daripada
-- ketiadaannya.
-- ============================================================================

ALTER TABLE progress_payments ALTER COLUMN approved_by DROP NOT NULL;

COMMENT ON COLUMN progress_payments.approved_by IS
  'NULL selama status pending — pembayaran yang belum diputuskan siapa pun. '
  'Diisi saat approval SUNGGUHAN, dan pemohonnya sendiri ditolak 403 (SoD).';

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_nullable TEXT;
  v_hilang   INT;
BEGIN
  SELECT is_nullable INTO v_nullable
  FROM information_schema.columns
  WHERE table_name = 'progress_payments' AND column_name = 'approved_by';

  IF v_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION '247 gagal: approved_by masih NOT NULL (%)', v_nullable;
  END IF;

  -- Data lama utuh: tak satu pun approval yang hilang.
  SELECT count(*) INTO v_hilang FROM progress_payments WHERE approved_by IS NULL;
  IF v_hilang > 0 THEN
    RAISE EXCEPTION '247 gagal: % baris kehilangan approved_by — migrasi ini tak boleh mengosongkan apa pun', v_hilang;
  END IF;
END $$;
