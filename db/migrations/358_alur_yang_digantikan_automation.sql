-- ============================================================================
-- 338 — 14 alur n8n bertanda AKTIF padahal NOL yang tersambung
-- ============================================================================
--
-- ── Keadaan yang diukur 2026-08-13
--
--   otomasi_alur          14 baris, SEMUANYA `aktif = true`
--   yang punya `n8n_id`   NOL
--   workflow di n8n       NOL (database.sqlite Puraloka: 0 workflow)
--
-- Jadi keempat belasnya adalah DAFTAR NIAT yang menyamar sebagai daftar
-- automation yang berjalan. Halaman `/otomasi/alur` menampilkan 14 baris
-- hijau; tak satu pun bisa dijalankan, karena `jalankanAlur()` menuntut
-- `n8n_id` dan n8n tak punya workflow-nya.
--
-- Kredensial n8n SUDAH dipasang founder (`N8N_BASE_URL` :5680, `N8N_API_KEY`,
-- keduanya 2026-08-10) — jadi yang hilang bukan sambungannya, melainkan
-- workflow-nya sendiri.
--
-- ── TIGA di antaranya kini DIGANTIKAN automation internal
--
-- Automation Phase 2 (2026-08-12) mengerjakan pekerjaan yang sama, di dalam
-- aplikasi, tanpa n8n:
--
--   peringatan-stok-menipis     → 3.5  /otomasi/jalankan/stok-menipis
--   tagih-invoice-jatuh-tempo   → 5.1  /otomasi/jalankan/invoice-termin
--                                       + `check-deadlines` #1 (invoice_due)
--   peringatan-milestone-mendekat → `cek-milestone` (sudah sejak lama)
--
-- Membiarkan ketiganya bertanda AKTIF berbahaya bukan karena mereka jalan —
-- justru karena mereka TIDAK jalan. Begitu seseorang membuat workflow n8n
-- untuk salah satunya dan menyambungkannya, SATU peristiwa menghasilkan DUA
-- notifikasi dari dua jalur berbeda, dan tak ada yang tahu mana yang benar.
--
-- ── Yang dilakukan migrasi ini
--
-- 1. Ketiganya dinonaktifkan, dengan sebabnya ditulis di `keterangan`.
-- 2. Sebelas sisanya TETAP aktif — mereka memang niat yang belum digarap,
--    dan tak ada automation internal yang menggantikannya. Yang diperbaiki
--    hanya keterangannya: dinyatakan bahwa belum ada workflow-nya.
--
-- Tidak DIHAPUS: daftar niat itu bernilai — ia mencatat apa yang direncanakan.
-- Yang tak boleh adalah niat yang menyamar sebagai kenyataan.
-- ============================================================================

-- ─── 1. Tiga alur yang digantikan automation internal ───────────────────────

UPDATE otomasi_alur
SET aktif = false,
    keterangan = COALESCE(keterangan, '') ||
      ' [DIGANTIKAN 2026-08-13] Pekerjaan ini kini dilakukan automation ' ||
      'internal Puraloka (tanpa n8n). Dinonaktifkan supaya satu peristiwa ' ||
      'tak menghasilkan dua notifikasi bila workflow n8n-nya kelak dibuat.',
    diperbarui_pada = now()
WHERE kode IN (
  'peringatan-stok-menipis',
  'tagih-invoice-jatuh-tempo',
  'peringatan-milestone-mendekat'
)
AND aktif = true;

-- ─── 2. Sisanya: nyatakan bahwa workflow-nya BELUM ADA ──────────────────────

UPDATE otomasi_alur
SET keterangan = COALESCE(keterangan, '') ||
      ' [BELUM TERSAMBUNG] Belum ada workflow n8n untuk alur ini (n8n_id ' ||
      'kosong). Baris ini mencatat NIAT, bukan automation yang berjalan.',
    diperbarui_pada = now()
WHERE n8n_id IS NULL
  AND keterangan NOT LIKE '%[BELUM TERSAMBUNG]%'
  AND keterangan NOT LIKE '%[DIGANTIKAN%';

-- ─── Verifikasi ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM otomasi_alur) THEN
    RAISE NOTICE '338: katalog alur kosong — dilewati';
    RETURN;
  END IF;

  -- Ketiga alur yang digantikan TIDAK boleh tersisa aktif.
  SELECT count(*) INTO n FROM otomasi_alur
  WHERE kode IN ('peringatan-stok-menipis', 'tagih-invoice-jatuh-tempo',
                 'peringatan-milestone-mendekat')
    AND aktif = true;
  IF n > 0 THEN
    RAISE EXCEPTION '338 gagal: % alur yang digantikan masih aktif — risiko notifikasi ganda', n;
  END IF;

  -- Alur AKTIF yang tak punya n8n_id wajib menyatakan dirinya belum tersambung.
  SELECT count(*) INTO n FROM otomasi_alur
  WHERE aktif = true AND n8n_id IS NULL
    AND COALESCE(keterangan, '') NOT LIKE '%[BELUM TERSAMBUNG]%';
  IF n > 0 THEN
    RAISE EXCEPTION '338 gagal: % alur aktif tanpa n8n_id yang tak menyatakan statusnya', n;
  END IF;

  SELECT count(*) INTO n FROM otomasi_alur WHERE aktif = true;
  RAISE NOTICE '338 OK — % alur aktif, semuanya menyatakan status sambungannya', n;
END $$;
