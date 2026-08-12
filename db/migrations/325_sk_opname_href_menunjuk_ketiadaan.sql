-- ============================================================================
-- 325 — `sk-opname` menunjuk halaman yang TIDAK ADA
-- ============================================================================
--
-- `menu_items.href` untuk `sk-opname` berisi `/mandor/opname`, dan halaman itu
-- TIDAK ADA:
--
--   ls apps/web/app/(dashboard)/mandor/opname   → tidak ada
--
-- Jadi item ini tampil sebagai tautan hidup di sidebar, dan siapa pun yang
-- mengkliknya mendapat 404. Menu yang menjanjikan halaman lalu gagal
-- membukanya lebih buruk daripada menu yang jujur menyatakan "belum ada":
-- yang pertama membuat orang mengira aplikasinya rusak, yang kedua membuat
-- mereka tahu fiturnya memang belum digarap.
--
-- ── Sisi mana yang salah, dan kenapa DB yang dikoreksi
--
-- `apps/web/lib/peta-menu.ts:207` menyatakan item ini `status: 'rencana'`
-- TANPA href — dan itu yang BENAR, lengkap dengan catatan panjang bahwa
-- `POST /procurement/stocks/opname` yang muncul saat mencari kata "opname"
-- adalah opname STOK MATERIAL, bukan opname pekerjaan bersama subkon.
--
-- DB-nya yang menyimpang. `updated_at` = 2026-08-10, dan href-nya diisi tanpa
-- halaman yang menyertainya.
--
-- ── Kenapa ini ketahuan sekarang
--
-- `audit-peta-menu-vs-db.mjs` merah dengan "hrefBeda naik 0 -> 1". Penjaga itu
-- membaca basis HIDUP, jadi ia merah untuk perubahan yang tak ada di kode mana
-- pun — termasuk untuk sesi yang tak pernah menyentuh menu. Diverifikasi:
-- merah juga pada commit 36581478 dengan `peta-menu.ts` versi lama.
--
-- Sesuai pesan penjaganya sendiri: *"Sunting peta-menu.ts DAN tulis migrasinya
-- — jangan salah satu saja."* Di sini `peta-menu.ts` sudah benar, jadi yang
-- perlu ditulis hanya migrasinya.
-- ============================================================================

UPDATE menu_items
SET href = NULL,
    updated_at = now()
WHERE key = 'sk-opname'
  AND href IS NOT NULL;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  h TEXT;
BEGIN
  SELECT href INTO h FROM menu_items WHERE key = 'sk-opname';

  IF NOT FOUND THEN
    RAISE NOTICE '325: sk-opname tak ada di menu_items — dilewati';
    RETURN;
  END IF;

  IF h IS NOT NULL THEN
    RAISE EXCEPTION '325 gagal: sk-opname masih ber-href % — sidebar tetap menautkan halaman yang tak ada', h;
  END IF;

  RAISE NOTICE '325 OK — sk-opname tak lagi menautkan halaman yang tak ada';
END $$;
