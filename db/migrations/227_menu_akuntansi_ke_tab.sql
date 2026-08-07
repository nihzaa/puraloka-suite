-- ════════════════════════════════════════════════════════════════════════════
-- 227 — "Buku Besar" dan "Jurnal Umum" mendarat di tab yang SAMA
--
-- ── Cacat yang diperbaiki
--
-- Keduanya menunjuk `/akuntansi`, dan halaman itu selalu membuka tab **Jurnal
-- Umum**. Jadi yang mengklik "Buku Besar" melihat jurnal — isinya ada, satu klik
-- lagi, tapi ia harus menebak tab mana. Cukup untuk membuat sub-menu terasa tak
-- bisa dipercaya.
--
-- ── Kenapa baru sekarang
--
-- Migrasi 223 sengaja TIDAK menyentuh keduanya, dengan alasan tertulis: tab
-- `/akuntansi` disimpan di `useState`, jadi `?tab=` akan MENJANJIKAN sesuatu
-- yang tak dibaca kode. Menunjuk parameter yang diabaikan lebih buruk daripada
-- tidak menunjuknya sama sekali.
--
-- Alasan itu sekarang tak berlaku: `lib/use-tab-url.ts` membuat tab dibaca dari
-- URL, dan `/akuntansi` sudah memakainya. Dibuktikan di peramban — `?tab=besar`
-- membuka judul "Buku Besar", `?tab=laporan` membuka "Neraca & Laba-Rugi".
--
-- ── Nilai `tab` diambil dari kode, bukan ditebak
--
-- `TAB_SAH` di `akuntansi/page.tsx`: jurnal · akun · neraca · besar · laporan.
-- Nilai di luar itu diabaikan halaman (sengaja — URL datang dari luar), jadi
-- salah ketik di sini akan diam-diam membuka tab pertama. Verifikasi di bawah
-- yang menahannya.
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items SET href = '/akuntansi?tab=besar'   WHERE key = 'fn-gl';
UPDATE menu_items SET href = '/akuntansi?tab=jurnal'  WHERE key = 'fn-jurnal';
UPDATE menu_items SET href = '/akuntansi?tab=akun'    WHERE key = 'md-coa';
UPDATE menu_items SET href = '/akuntansi?tab=laporan' WHERE key = 'fn-laporan';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_salah  TEXT;
  v_kunci  TEXT[] := ARRAY['fn-gl','fn-jurnal','md-coa','fn-laporan'];
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);
  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '227 gagal: key menu tidak ada: %', v_hilang;
  END IF;

  -- Tab di luar TAB_SAH akan DIABAIKAN halaman tanpa satu pun galat, dan
  -- menunya diam-diam kembali membuka tab pertama — persis cacat yang
  -- migrasi ini perbaiki.
  SELECT string_agg(key || ' -> ' || href, ', ' ORDER BY key) INTO v_salah
    FROM menu_items
   WHERE key = ANY(v_kunci)
     AND split_part(href, 'tab=', 2) NOT IN ('jurnal','akun','neraca','besar','laporan');
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION '227 gagal: nilai tab di luar TAB_SAH: %', v_salah;
  END IF;
END $$;
