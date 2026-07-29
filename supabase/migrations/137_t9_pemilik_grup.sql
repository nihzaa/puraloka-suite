-- ============================================================
-- 137 — T9: PEMILIK GRUP (group owner)
--
-- Keputusan founder 2026-07-29 (ADR-011-T9 §3, Opsi B): yang boleh mendirikan
-- badan usaha baru HANYA pemilik grup — bukan siapa pun pemegang permission
-- tertentu.
--
-- ------------------------------------------------------------
-- KENAPA BUKAN PERMISSION BIASA
-- ------------------------------------------------------------
-- Seluruh 89 permission di sistem ini dievaluasi DALAM KONTEKS company aktif
-- (`has_permission()` → role user di company itu). Modelnya menjawab "boleh apa
-- orang ini DI PERUSAHAAN INI".
--
-- Mendirikan badan usaha baru bukan tindakan DI DALAM sebuah perusahaan — ia
-- tindakan DI ATAS semua perusahaan, satu-satunya yang berkarakter demikian di
-- sistem ini. Memaksakannya ke model permission per-company berarti pertanyaan
-- "di perusahaan mana Anda boleh mendirikan perusahaan?" — yang tidak punya
-- jawaban bermakna.
--
-- Diperiksa sebelum memutuskan: `settings:manage` (satu-satunya kandidat yang
-- ada) dipegang `admin` DAN `direktur`. Memakainya berarti direktur di PT anak
-- bisa mendirikan badan usaha baru atas nama grup. Itu bukan yang dimaksud.
--
-- ------------------------------------------------------------
-- MODEL
-- ------------------------------------------------------------
-- Grup TIDAK diberi tabel sendiri. `companies.parent_company_id` sudah ada
-- (migrasi 126) dan sudah bermakna "induk"; grup = satu pohon yang akarnya
-- adalah company dengan `parent_company_id IS NULL`.
--
-- Kepemilikan ditaruh di akar pohon itu: `companies.owner_user_id`. Perusahaan
-- anak mewarisi pemilik dari akarnya, jadi tak ada dua sumber kebenaran yang
-- bisa berbeda.
--
-- Alternatif "tabel group_owners" ditolak: ia memperkenalkan entitas 'grup'
-- yang tak punya atribut lain selain daftar pemilik — tabel yang hanya berisi
-- relasi, sementara relasinya sudah terwakili pohon `parent_company_id`.
--
-- ------------------------------------------------------------
-- YANG SENGAJA TIDAK DILAKUKAN
-- ------------------------------------------------------------
-- Tidak ada policy RLS yang membaca `owner_user_id`. Kepemilikan grup adalah
-- gerbang PENDIRIAN badan usaha, bukan gerbang akses data — akses data tetap
-- dijaga `company_id` + permission seperti sebelumnya. Mencampur keduanya akan
-- membuat pemilik grup diam-diam bisa membaca data seluruh badan usaha, dan itu
-- perubahan model keamanan yang tidak diminta.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kolom pemilik pada akar grup.
-- ------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;

COMMENT ON COLUMN companies.owner_user_id IS
  'T9: pemilik GRUP, diisi hanya pada akar pohon (parent_company_id IS NULL). '
  'Perusahaan anak mewarisi lewat akarnya. Menentukan siapa yang boleh '
  'mendirikan badan usaha baru — BUKAN gerbang akses data.';

-- ON DELETE RESTRICT, bukan SET NULL: grup tanpa pemilik berarti tak seorang
-- pun bisa mendirikan badan usaha di dalamnya, dan tak ada jalan memperbaikinya
-- dari UI. Lebih baik penghapusan user-nya yang ditolak.

CREATE INDEX IF NOT EXISTS idx_companies_owner ON companies (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Backfill: akar yang sudah ada → pembuatnya.
--
-- Dipakai `created_by` karena itu satu-satunya jejak kepemilikan yang ada.
-- Kalau kosong (tak seharusnya, tapi jangan berasumsi), jatuh ke admin aktif
-- tertua — orang yang sama yang dipakai migrasi 126 saat menciptakan tenant
-- pertama, jadi konsisten dengan asal-usul datanya.
-- ------------------------------------------------------------
UPDATE companies c
   SET owner_user_id = COALESCE(
     c.created_by,
     (SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'admin' AND u.is_active ORDER BY u.created_at LIMIT 1)
   )
 WHERE c.parent_company_id IS NULL
   AND c.owner_user_id IS NULL;

-- ------------------------------------------------------------
-- 3. Fungsi: apakah user ini pemilik grup?
--
-- SECURITY DEFINER — membaca `companies` yang ber-RLS. Tanpa ini ia gagal
-- begitu service_role dilepas (T5c).
--
-- Menerima user_id eksplisit, bukan membaca auth.uid(): endpoint memanggilnya
-- untuk user yang SEDANG diperiksa, dan API masih memakai service_role sehingga
-- auth.uid() belum tentu terisi. Membuatnya bergantung auth.uid() berarti
-- fungsi ini diam-diam mengembalikan false di seluruh jalur API hari ini.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_group_owner(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM companies c
     WHERE c.parent_company_id IS NULL
       AND c.owner_user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION is_group_owner(UUID) IS
  'T9: true bila user adalah pemilik setidaknya satu grup (akar pohon company). '
  'Gerbang pendirian badan usaha baru. Fail-closed: NULL/tak ketemu → false.';

-- ------------------------------------------------------------
-- 4. Fungsi: akar grup dari sebuah company.
--
-- Dipakai endpoint untuk menentukan "badan usaha baru ini masuk grup mana" dan
-- untuk memeriksa apakah pemanggil pemilik grup TERSEBUT — bukan sekadar
-- pemilik grup mana pun.
--
-- Rekursif dengan batas kedalaman: `parent_company_id` bisa membentuk siklus
-- kalau ada yang salah menyetelnya, dan CTE rekursif tanpa batas akan berputar
-- selamanya. 10 tingkat jauh melebihi struktur grup usaha nyata.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION company_group_root(p_company_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH RECURSIVE naik AS (
    SELECT c.id, c.parent_company_id, 1 AS tingkat
      FROM companies c WHERE c.id = p_company_id
    UNION ALL
    SELECT p.id, p.parent_company_id, n.tingkat + 1
      FROM companies p JOIN naik n ON p.id = n.parent_company_id
     WHERE n.tingkat < 10
  )
  SELECT id FROM naik WHERE parent_company_id IS NULL LIMIT 1;
$$;

COMMENT ON FUNCTION company_group_root(UUID) IS
  'T9: akar grup dari sebuah company (naik lewat parent_company_id, batas 10 '
  'tingkat agar siklus tidak membuat query berputar selamanya).';

-- ------------------------------------------------------------
-- 5. Menu "Badan Usaha" di bawah Pengaturan.
--
-- CATATAN OTORISASI YANG PERLU DIBACA SEBELUM MENYUNTING:
-- `required_permissions` di sini SENGAJA memakai `settings:manage` — bukan
-- karena permission itu yang menjaga halamannya, melainkan karena sidebar
-- hanya bisa memfilter dengan permission, sementara gerbang sebenarnya adalah
-- KEPEMILIKAN GRUP (yang bukan permission).
--
-- Konsekuensinya disadari: pemegang `settings:manage` yang BUKAN pemilik grup
-- akan melihat menunya, lalu mendapat penjelasan "halaman ini khusus pemilik
-- grup" saat membukanya. Itu diterima — menu memang bukan lapis keamanan
-- (lihat migrasi 136), dan API tetap membalas 403.
--
-- Alternatifnya adalah membuat sidebar bisa memfilter dengan sesuatu selain
-- permission — perubahan pada mekanisme menu yang jauh lebih besar dari
-- nilainya di sini, dan menambah cara kedua untuk menyembunyikan menu.
-- ------------------------------------------------------------
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'pengaturan-perusahaan', 'Badan Usaha', '/pengaturan/perusahaan', 'Building2',
       p.id, ARRAY['settings:manage'], 11, p.section, true
  FROM menu_items p WHERE p.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 6. Verifikasi.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_yatim INT;
  v_pemilik UUID;
BEGIN
  -- Setiap akar grup HARUS punya pemilik. Akar tanpa pemilik = grup yang tak
  -- seorang pun bisa menambah badan usaha di dalamnya, dan tak ada jalan
  -- memperbaikinya lewat UI.
  SELECT count(*) INTO v_yatim FROM companies
   WHERE parent_company_id IS NULL AND owner_user_id IS NULL;
  IF v_yatim > 0 THEN
    RAISE EXCEPTION
      '137: % akar grup tanpa owner_user_id. Grup itu tak akan bisa menambah '
      'badan usaha baru dari UI.', v_yatim;
  END IF;

  -- Fungsi harus benar-benar bekerja untuk pemilik yang baru di-backfill —
  -- bukan sekadar ada. Fungsi yang selalu memulangkan false akan mengunci
  -- founder dari fiturnya sendiri, dan gejalanya cuma "tombolnya tidak muncul".
  SELECT owner_user_id INTO v_pemilik FROM companies
   WHERE parent_company_id IS NULL LIMIT 1;
  IF v_pemilik IS NOT NULL AND NOT is_group_owner(v_pemilik) THEN
    RAISE EXCEPTION
      '137: is_group_owner() memulangkan false untuk pemilik yang baru '
      'di-backfill. Gerbang pendirian badan usaha akan menolak semua orang.';
  END IF;

  RAISE NOTICE '137: pemilik grup ter-set; is_group_owner() terverifikasi.';
END $$;
