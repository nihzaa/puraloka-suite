-- ============================================================================
-- 268 — Menu induk "Mutu & K3" punya IKHTISAR — grup TERAKHIR
-- ============================================================================
--
-- ── Lantai turun ke NOL
--
-- `uji-induk-punya-ikhtisar` menandai `g-mutu-kepatuhan` sebagai SATU-SATUNYA
-- grup induk yang tersisa tanpa halaman ikhtisar (lantai 1). Dengan migrasi
-- ini setiap menu induk punya tempat untuk melihat gambaran modulnya, dan
-- lantainya jadi NOL — kemunduran berikutnya langsung merah.
--
-- ── Kenapa `/mutu`, bukan `/mutu/ikhtisar`
--
-- `/mutu` belum dipakai halaman mana pun: anak-anaknya di `/mutu/ncr`,
-- `/mutu/insiden`, dan `/kepatuhan?bagian=*`. Memakai path induk yang kosong
-- itu membuat URL-nya sejajar dengan grup lain (`/keuangan`, `/gudang`,
-- `/otomasi`) — dan keseragaman URL adalah hal yang orang pelajari sekali
-- lalu pakai selamanya.
--
-- ── Permission: TIDAK ada, dan itu disengaja
--
-- Seluruh sub-menu grup ini punya `required_permissions` array KOSONG (diukur
-- dari basis 2026-08-10). Menuntut izin di ikhtisarnya berarti halaman induk
-- lebih ketat daripada isinya: orang melihat "akses ditolak" untuk RINGKASAN
-- dari data yang boleh ia buka satu per satu.
--
-- Tenancy tetap dijaga `request.db` di tiap query rutenya.
-- ============================================================================

UPDATE menu_items
   SET href = '/mutu'
 WHERE key = 'g-mutu-kepatuhan' AND parent_id IS NULL;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items WHERE key = 'g-mutu-kepatuhan' AND href = '/mutu'
  ) THEN
    RAISE EXCEPTION '268 gagal: grup mutu tak punya href ikhtisar';
  END IF;

  -- R-1: satu href tepat satu menu AKTIF. `/mutu` tak boleh bentrok dengan
  -- anak mana pun — kalau bentrok, sidebar menyorot dua baris sekaligus.
  SELECT count(*) INTO n FROM menu_items WHERE href = '/mutu' AND is_active;
  IF n <> 1 THEN
    RAISE EXCEPTION '268 gagal: href /mutu dipakai % menu aktif (R-1)', n;
  END IF;

  -- TIDAK diperiksa: "semua grup induk wajib punya href".
  --
  -- Versi pertama blok ini memeriksanya dan langsung merah — 16 grup ber-href
  -- NULL. Ternyata itu bukan cacat: `lib/tujuan-grup.ts` MENYIMPULKAN tujuan
  -- grup dari anak-anaknya (`/kontrak` menaungi `/kontrak/rfi`), dan 16 grup
  -- itu memang punya halaman ikhtisar yang bekerja tanpa href tersimpan.
  --
  -- Href eksplisit hanya dibutuhkan grup yang halamannya BERDIRI SENDIRI —
  -- anaknya tak bersarang di bawahnya. Baru dua: `g-ai` (anaknya di bawah
  -- pengaturan) dan grup ini (anaknya terbelah antara mutu dan kepatuhan).
  --
  -- Yang mengukur kelengkapan ikhtisar adalah `uji-induk-punya-ikhtisar`,
  -- yang tahu kedua jalur itu. Blok verifikasi migrasi tak boleh menuntut
  -- sesuatu yang LEBIH KETAT daripada aturan sesungguhnya — ia akan menolak
  -- keadaan yang benar.
  --
  -- Catatan tambahan: komentar blok /* … */ di SQL TIDAK bersarang, dan versi
  -- pertama catatan ini memuat path ber-tanda-bintang yang menutupnya lebih
  -- awal. Galatnya "unterminated comment", yang menunjuk ke tempat yang salah.
  PERFORM 1;
END $$;
