-- ════════════════════════════════════════════════════════════════════════════
-- 345 — Menu Register Kontrak menunjuk halamannya sendiri
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang diukur 2026-08-13
--
-- Grup "Kontrak" punya DUA entri berlabel "Register Kontrak", sort_order sama
-- (301), keduanya `kesiapan = 'hidup'`:
--
--     key `kt-register`  →  /kontrak    (dashboard RINGKASAN modul)
--     key `kontrak`      →  /kontrak    (dashboard RINGKASAN modul)
--
-- Sebelum migrasi ini `kt-register` menunjuk `/proyek` — daftar proyek. Tak
-- satu pun dari keduanya membuka register kontrak, karena registernya memang
-- belum pernah dibangun. Peta Modul menandainya "sebagian"; yang lebih tepat:
-- menunya menjanjikan sesuatu yang tak ada di ujung tautannya.
--
-- ── Dua label sama di satu grup bukan cuma tak rapi
--
-- Aturan 232: satu rute = satu tautan menu aktif. Dua baris dengan label
-- identik membuat penanda "Anda di sini" menyala di dua tempat sekaligus,
-- dan pengguna yang mengklik yang "salah" menyimpulkan halamannya rusak —
-- padahal ia memang sengaja membuka halaman lain.
--
-- Yang dilakukan:
--
--   `kt-register`  →  /kontrak/register   register sesungguhnya (BARU)
--   `kontrak`      →  /kontrak            dilabeli ulang "Ringkasan Kontrak"
--                                          sesuai isi halamannya
--
-- Entri `kontrak` TIDAK dihapus. Halamannya nyata, dipakai, dan menghapus
-- baris menu memutus tautan yang mungkin sudah di-bookmark orang. Yang salah
-- selama ini labelnya, bukan keberadaannya.
--
-- ── Kenapa sort_order digeser
--
-- Register adalah pintu masuk modul; ringkasan adalah lapisan di atasnya.
-- Menaruh ringkasan lebih dulu (300) menempatkannya sebagai beranda grup,
-- persis seperti kedudukannya di modul lain.
--
-- Idempoten: dijalankan berkali-kali menghasilkan keadaan yang sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Register kontrak menunjuk halamannya sendiri ─────────────────────────
UPDATE menu_items
   SET href = '/kontrak/register',
       label = 'Register Kontrak',
       sort_order = 301,
       kesiapan = 'hidup',
       updated_at = now()
 WHERE key = 'kt-register';

-- ── 2. Dashboard modul dilabeli sesuai isinya ───────────────────────────────
UPDATE menu_items
   SET label = 'Ringkasan Kontrak',
       href = '/kontrak',
       sort_order = 300,
       updated_at = now()
 WHERE key = 'kontrak';

-- ── 3. Verifikasi — GAGAL KERAS, bukan NOTICE ───────────────────────────────
--
-- Migrasi 326 lulus verifikasinya sendiri sambil meninggalkan `href` NULL,
-- karena yang diperiksa hanya keberadaan barisnya. Di sini yang diperiksa
-- adalah NILAINYA.
DO $$
DECLARE
  v_href       TEXT;
  v_kesiapan   TEXT;
  v_label_ring TEXT;
  v_kembar     INT;
BEGIN
  SELECT href, kesiapan INTO v_href, v_kesiapan
    FROM menu_items WHERE key = 'kt-register';

  IF v_href IS NULL THEN
    RAISE EXCEPTION '345: menu kt-register tidak ada atau href-nya NULL';
  END IF;
  IF v_href <> '/kontrak/register' THEN
    RAISE EXCEPTION '345: kt-register masih menunjuk % — halaman registernya tak terjangkau', v_href;
  END IF;
  IF v_kesiapan <> 'hidup' THEN
    RAISE EXCEPTION '345: kt-register berkesiapan % padahal halamannya sudah ada', v_kesiapan;
  END IF;

  SELECT label INTO v_label_ring FROM menu_items WHERE key = 'kontrak';
  IF v_label_ring IS DISTINCT FROM 'Ringkasan Kontrak' THEN
    RAISE EXCEPTION '345: menu `kontrak` masih berlabel % — dua entri berlabel sama di satu grup', v_label_ring;
  END IF;

  -- Label yang DISENTUH migrasi ini tak boleh kembar lagi.
  --
  -- Sengaja tidak memeriksa SELURUH grup: diukur 2026-08-13, grup Kontrak
  -- punya dua pasang kembar LAIN yang bukan urusan kt-register —
  --
  --     "RFI"                    kt-rfi     ↔ kontrak-rfi
  --     "Kontrak Subkontraktor"  kt-subkon  ↔ kontrak-subkon
  --
  -- Keduanya menunjuk halaman yang sama-sama nyata, jadi memperbaikinya
  -- berarti memutuskan mana yang menang — keputusan tentang menu yang tak
  -- diminta oleh pekerjaan ini. Dicatat di JOURNAL.md, bukan diselundupkan
  -- ke migrasi yang judulnya bicara soal hal lain.
  -- Dihitung dari yang AKTIF saja — diperbaiki 2026-09-01.
  --
  -- Versi asli menghitung SEMUA baris berlabel sama, termasuk yang sudah
  -- dipensiunkan. Diukur ke basis:
  --
  --     kontrak           Register Kontrak  /kontrak           aktif=true
  --     kontrak-register  Register Kontrak  /kontrak/register  aktif=false
  --     kt-register       Register Kontrak  /m/kt-register     aktif=false
  --
  -- Tiga baris, SATU yang menyala. Itu bukan kembar di sidebar — dua sisanya
  -- tak dirender sama sekali. Menuntut nol baris berlabel sama berarti
  -- melarang menu lama disimpan dalam keadaan nonaktif, dan itu justru cara
  -- penataan menu di repo ini bekerja.
  --
  -- Yang sesungguhnya dijaga: pengguna tak melihat dua pintu berlabel sama.
  SELECT count(*) INTO v_kembar
    FROM menu_items
   WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-kontrak')
     AND label IN ('Register Kontrak', 'Ringkasan Kontrak')
     AND is_active
   GROUP BY label HAVING count(*) > 1;

  IF COALESCE(v_kembar, 0) > 0 THEN
    RAISE EXCEPTION '345: dua menu AKTIF berlabel sama di grup Kontrak';
  END IF;

  RAISE NOTICE '345 OK — Register Kontrak → /kontrak/register; ringkasan dilabeli ulang; nol label kembar';
END $$;
