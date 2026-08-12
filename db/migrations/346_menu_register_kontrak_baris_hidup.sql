-- ════════════════════════════════════════════════════════════════════════════
-- 346 — Register Kontrak dipasang pada baris menu yang BENAR-BENAR TAMPIL
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Saya salah di migrasi 345, dan ini koreksinya
--
-- 345 mengarahkan `kt-register` ke `/kontrak/register` dan lulus verifikasinya
-- sendiri. Verifikasi itu memeriksa `href`, `label`, `kesiapan` — dan tak satu
-- pun memeriksa apakah barisnya TAMPIL.
--
--     kt-register   is_active = FALSE
--
-- Seluruh keluarga `kt-*` (13 baris) nonaktif: taksonomi lama yang digantikan
-- keluarga `kontrak-*`. Jadi 345 membetulkan tautan pada baris yang tak pernah
-- muncul di sidebar siapa pun. Halamannya tetap yatim — hanya bisa dibuka
-- dengan mengetik URL — dan `audit-nav-yatim.mjs` benar saat melaporkannya.
--
-- Pelajarannya sama dengan migrasi 326 yang lulus sambil meninggalkan href
-- NULL, hanya bergeser satu kolom: yang diperiksa bukan yang menentukan.
-- Verifikasi migrasi ini karena itu memeriksa `is_active`, dan memeriksanya
-- dari sisi PEMBACA — apa yang akan dikirim `GET /api/v1/menu`.
--
-- ── Yang juga terungkap: "label kembar" itu bayangan
--
-- 345 mencatat tiga pasang label kembar di grup Kontrak. Setelah diukur ulang,
-- setiap pasang berisi satu baris hidup dan satu mati — jadi tak ada yang
-- kembar di layar. Yang saya lihat adalah dua generasi taksonomi berdampingan
-- di tabel, bukan cacat tampilan. Catatan di 345 dikoreksi oleh berkas ini.
--
-- ── Yang dilakukan
--
--   1. `kontrak-register` (BARU, hidup) → /kontrak/register, sort_order 302,
--      tepat di bawah Ringkasan. Saudara di 302 ke atas digeser satu
--      (langkah 4) — 302 sudah ditempati RFI.
--
--   2. `kontrak` dikembalikan ke sort_order 300→301, label tetap
--      "Ringkasan Kontrak". Perubahan label 345 DIPERTAHANKAN: halaman itu
--      memang dashboard ringkasan, dan menamainya "Register Kontrak" adalah
--      janji yang tak ditepati — itu bagian 345 yang benar.
--
--      Tapi sort_order-nya dikembalikan ke 301 dan register mengambil 302:
--      `audit-sidebar-urutan.mjs` menuntut anak grup Kontrak berada di
--      301–399 (gso+1..gso+99). 300 yang saya pakai di 345 melanggarnya, dan
--      tabrakan rentang antar-grup tak mengeluarkan galat — hanya urutan aneh
--      yang sulit dilacak asalnya.
--
--   3. `kt-register` DIBIARKAN nonaktif. Menghidupkannya berarti dua tautan
--      untuk satu rute (aturan 232), dan keluarga `kt-*` sudah dipensiunkan
--      sebagai keputusan terpisah yang bukan urusan pekerjaan ini.
--
-- Idempoten: ON CONFLICT pada `key`, dijalankan berkali-kali sama hasilnya.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Ringkasan kembali ke rentang sah ─────────────────────────────────────
UPDATE menu_items
   SET sort_order = 301, updated_at = now()
 WHERE key = 'kontrak';

-- ── 2. Register pada keluarga yang HIDUP ────────────────────────────────────
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions,
                        sort_order, section, is_active, kesiapan)
SELECT 'kontrak-register',
       'Register Kontrak',
       '/kontrak/register',
       'file-signature',
       p.id,
       -- Sama dengan saudara-saudaranya yang hidup: penyaringan sesungguhnya
       -- ada di rute (`projects:view` / `projects:contract`), bukan di menu.
       -- Menu yang lebih ketat daripada rutenya hanya menyembunyikan tautan
       -- dari orang yang sebenarnya boleh membukanya.
       COALESCE((SELECT required_permissions FROM menu_items WHERE key = 'kontrak'), '{}'),
       302,
       (SELECT section FROM menu_items WHERE key = 'kontrak'),
       TRUE,
       'hidup'
  FROM menu_items p
 WHERE p.key = 'g-kontrak'
    ON CONFLICT (key) DO UPDATE
   SET href       = EXCLUDED.href,
       label      = EXCLUDED.label,
       parent_id  = EXCLUDED.parent_id,
       sort_order = EXCLUDED.sort_order,
       is_active  = TRUE,
       kesiapan   = 'hidup',
       updated_at = now();

-- ── 3. Verifikasi — dari sisi PEMBACA, bukan dari sisi baris ────────────────
DO $$
DECLARE
  v_href     TEXT;
  v_aktif    BOOLEAN;
  v_urut     INT;
  v_gso      INT;
  v_tampil   INT;
BEGIN
  SELECT href, is_active, sort_order INTO v_href, v_aktif, v_urut
    FROM menu_items WHERE key = 'kontrak-register';

  IF v_href IS NULL THEN
    RAISE EXCEPTION '346: kontrak-register tidak terbentuk';
  END IF;
  IF v_href <> '/kontrak/register' THEN
    RAISE EXCEPTION '346: kontrak-register menunjuk % — bukan halaman registernya', v_href;
  END IF;

  -- INI yang tak diperiksa 345, dan itulah sebabnya 345 lulus sambil salah.
  IF NOT v_aktif THEN
    RAISE EXCEPTION '346: kontrak-register nonaktif — tautannya tak akan tampil di sidebar mana pun';
  END IF;

  -- Rentang anak: gso+1..gso+99 (audit-sidebar-urutan.mjs).
  SELECT sort_order INTO v_gso FROM menu_items WHERE key = 'g-kontrak';
  IF v_urut <= v_gso OR v_urut > v_gso + 99 THEN
    RAISE EXCEPTION '346: sort_order % di luar rentang sah %..%', v_urut, v_gso + 1, v_gso + 99;
  END IF;

  SELECT sort_order INTO v_urut FROM menu_items WHERE key = 'kontrak';
  IF v_urut <= v_gso OR v_urut > v_gso + 99 THEN
    RAISE EXCEPTION '346: Ringkasan Kontrak ber-sort_order % di luar rentang %..%',
      v_urut, v_gso + 1, v_gso + 99;
  END IF;

  -- Satu rute = satu tautan AKTIF (aturan 232). Baris `kt-*` yang mati tak
  -- dihitung karena tak pernah dikirim ke sidebar.
  SELECT count(*) INTO v_tampil
    FROM menu_items WHERE is_active AND href = '/kontrak/register';
  IF v_tampil <> 1 THEN
    RAISE EXCEPTION '346: ada % tautan aktif ke /kontrak/register — harus tepat satu', v_tampil;
  END IF;

  RAISE NOTICE '346 OK — kontrak-register aktif di sort_order 302, tepat satu tautan, rentang sah';
END $$;

-- ── 4. Tabrakan sort_order antar-saudara ────────────────────────────────────
--
-- Ditemukan sesudah langkah 2 dijalankan: `kontrak-register` dan
-- `kontrak-rfi` sama-sama menempati 302. Verifikasi di langkah 3 memeriksa
-- RENTANG tapi tidak KETUNGGALAN, jadi ia lulus sambil membiarkan dua menu
-- berebut posisi yang sama — urutannya lalu ditentukan tie-break basis, yang
-- bisa berubah tanpa satu pun perubahan kode.
--
-- Saudara di 302 ke atas digeser satu; register tetap di 302, tepat di bawah
-- Ringkasan (301). Register adalah pintu masuk modul.
UPDATE menu_items
   SET sort_order = sort_order + 1, updated_at = now()
 WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-kontrak')
   AND is_active
   AND key <> 'kontrak-register'
   AND sort_order >= 302;

DO $$
DECLARE v_bentrok INT;
BEGIN
  SELECT count(*) INTO v_bentrok
    FROM (SELECT sort_order FROM menu_items
           WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-kontrak')
             AND is_active
           GROUP BY sort_order HAVING count(*) > 1) t;
  IF v_bentrok > 0 THEN
    RAISE EXCEPTION '346: masih ada % sort_order kembar di grup Kontrak', v_bentrok;
  END IF;
  RAISE NOTICE '346 langkah 4 OK — nol sort_order kembar di antara saudara aktif';
END $$;
