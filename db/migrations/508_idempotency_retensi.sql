-- ============================================================================
-- 508 — RETENSI KUNCI IDEMPOTENSI
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA MIGRASI INI, DAN KENAPA BUKAN YANG SEMULA DIRENCANAKAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- Rencana awal (2026-08-27) adalah menambah constraint unik ke `progress_logs`
-- supaya antrean offline mobile tak bisa menggandakan log progres.
--
-- Diukur sebelum ditulis: constraint itu TIDAK PERLU. `idempotency_keys`
-- (migrasi 177) sudah punya `UNIQUE (company_id, operasi, kunci)`, dan sejak
-- 2026-08-27 rute `progress-logs` serta `kasbons` memakai gerbangnya. Kunci
-- unik pada `progress_logs` sendiri malah SALAH secara bisnis, dengan alasan
-- yang sama seperti dicatat 177 untuk `payments`: dua log sah bisa punya isi
-- yang sama persis pada hari yang sama (dua mandor, dua shift), dan menolaknya
-- berarti menolak kejadian nyata.
--
-- Yang BENAR-BENAR kurang, dan baru terlihat saat memeriksa 177: tabel itu
-- **tak pernah dibersihkan**. Komentarnya sendiri berbunyi *"Pembersihan:
-- kunci lama tak berguna, dan tabel ini tumbuh terus"* dan menyiapkan
-- `idx_idempotency_umur` untuk itu — lalu tak ada satu pun kode yang
-- menghapus. Disisir 2026-08-27: nol DELETE terhadap `idempotency_keys` di
-- seluruh apps/api.
--
-- Itu bukan cacat mendesak sampai sekarang, karena hanya transfer kas yang
-- memakainya. Begitu setiap kiriman progres & kasbon dari tiap HP mandor
-- menulis satu baris, pertumbuhannya berubah sifat.
--
-- ── Kenapa 7 hari
--
-- Kunci hanya berguna selama pengiriman ulang masih mungkin. Antrean offline
-- mobile menyimpan kiriman sampai berhasil, dan kasus terburuk yang realistis
-- adalah HP yang ditinggal mati sepanjang akhir pekan panjang. Tujuh hari
-- menutup itu dengan lapang; lebih lama hanya menyimpan baris yang tak akan
-- pernah dicocokkan lagi.
--
-- ── Kenapa fungsi, bukan pg_cron
--
-- Repo ini menjalankan tugas terjadwal lewat rute `otomasi/jalankan/*` yang
-- dipicu penjadwal aplikasi, bukan lewat pg_cron (tak terpasang di Supabase
-- basis ini — diukur). Fungsi ini karena itu dibuat agar bisa dipanggil dari
-- mana saja, dan pemanggilnya menyusul sebagai pekerjaan tersendiri.
--
-- Idempoten: aman dijalankan berkali-kali.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_bersihkan_idempotency_kadaluarsa(
  p_umur_hari INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path dipaku: SECURITY DEFINER tanpa ini bisa dibajak lewat skema
-- yang dikendalikan pemanggil. Skema `test` di basis ini MEMBAYANGI 9 tabel
-- public bernama sama, jadi ini bukan kehati-hatian teoretis.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_terhapus INTEGER;
BEGIN
  IF p_umur_hari < 1 THEN
    RAISE EXCEPTION 'p_umur_hari minimal 1, diterima %', p_umur_hari;
  END IF;

  DELETE FROM idempotency_keys
   WHERE created_at < now() - make_interval(days => p_umur_hari);

  GET DIAGNOSTICS v_terhapus = ROW_COUNT;
  RETURN v_terhapus;
END $$;

COMMENT ON FUNCTION fn_bersihkan_idempotency_kadaluarsa(INTEGER) IS
  'Hapus kunci idempotensi yang lebih tua dari p_umur_hari (bawaan 7). '
  'Kunci hanya berguna selama pengiriman ulang masih mungkin; sesudah itu ia '
  'hanya menambah ukuran tabel. Memulangkan jumlah baris terhapus.';

-- ── Verifikasi: migrasi yang "sukses" tanpa menghasilkan apa pun adalah cacat
DO $$
DECLARE
  v_ada BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'fn_bersihkan_idempotency_kadaluarsa'
  ) INTO v_ada;

  IF NOT v_ada THEN
    RAISE EXCEPTION '508 GAGAL: fn_bersihkan_idempotency_kadaluarsa tak terbentuk';
  END IF;

  -- Dijalankan sungguhan dengan umur sangat panjang: membuktikan fungsinya
  -- BISA DIEKSEKUSI (tipe cocok, search_path sah), tanpa menghapus apa pun.
  -- Fungsi yang terbentuk tetapi meledak saat dipanggil sama tak bergunanya
  -- dengan yang tak terbentuk.
  PERFORM fn_bersihkan_idempotency_kadaluarsa(36500);

  RAISE NOTICE '508 OK: fn_bersihkan_idempotency_kadaluarsa terbentuk & bisa dijalankan';
END $$;
