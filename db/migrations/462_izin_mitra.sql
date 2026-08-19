-- ════════════════════════════════════════════════════════════════════════════
-- 462 — Izin untuk modul Mitra (migrasi 461)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 461 membuat tabel `mitra`; rutenya butuh kunci izin, dan **kunci
-- izin yang tak ada di tabel `permissions` MENOLAK SEMUA ORANG tanpa gejala.**
-- Bukan galat, bukan 500 — cuma 403 untuk setiap pengguna termasuk pemilik,
-- dan tak satu pun pesan menyebut sebabnya. Dijaga penjaga CI
-- `audit-izin-benar-ada.mjs` (ambang NOL).
--
-- Cacat itu nyaris terjadi: rancangan pertama memakai `master:view` /
-- `master:manage`, dan diukur ke basis — **keduanya tak ada**. Tak ada satu
-- pun kunci berawalan `master`.
--
-- ── Kenapa `mitra:*`, bukan menumpang `workers:manage`
--
-- `workers:manage` bermakna "kelola registry tukang". Mitra melampauinya:
-- ia juga pemasok, juga badan usaha, dan yang terpenting ia memegang
-- **keputusan daftar hitam**. Menumpangkan keputusan itu ke izin registry
-- tukang berarti siapa pun yang boleh menambah tukang otomatis boleh
-- melarang sebuah PT berbisnis dengan perusahaan ini.
--
-- ── Kenapa daftar hitam punya izin SENDIRI
--
-- Menambah mitra adalah pekerjaan administrasi. Mem-blacklist adalah
-- keputusan yang menghentikan seseorang mencari nafkah dari perusahaan ini,
-- dan menyamakan keduanya berarti tak ada tempat untuk memisahkannya kelak.
-- Peran boleh memberi keduanya sekaligus — tetapi itu keputusan tenant,
-- bukan bawaan yang tak bisa dicabut.
--
-- ── sort_order 962-964
--
-- Diukur lebih dulu (`SELECT sort_order FROM permissions WHERE module='mandor'`):
-- rentang tinggi modul ini terpakai 956-961, dan 962 ke atas kosong. Migrasi
-- 455 sudah pernah menabrak nomor yang terpakai; jangan diulang.
--
-- Idempoten.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('mitra:view',   'mandor', 'Lihat Mitra',
   'Melihat daftar identitas mitra (subkontraktor orang maupun badan usaha) beserta perannya', 962),
  ('mitra:manage', 'mandor', 'Kelola Mitra',
   'Menambah dan menyunting identitas mitra beserta data badan usahanya', 963),
  ('mitra:daftar_hitam', 'mandor', 'Putuskan Daftar Hitam Mitra',
   'Memasukkan atau mencabut mitra dari daftar hitam — keputusan yang menutup SEMUA pintu '
   || '(tender, SPK, PO) sekaligus', 964)
ON CONFLICT (key) DO UPDATE
  SET module = EXCLUDED.module,
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order;

-- ── Peran yang SUDAH boleh mengelola tukang ikut mendapat mitra:view/manage ──
--
-- Tanpa ini, layar Mitra lahir kosong untuk SEMUA orang dan terbaca sebagai
-- fitur yang rusak. Yang diwarisi hanya dua yang setara pekerjaannya;
-- `mitra:daftar_hitam` SENGAJA TIDAK ikut — keputusan melarang pihak lain
-- berbisnis tak boleh muncul di tangan seseorang sebagai efek samping
-- migrasi. Itu diberikan sadar lewat layar Peran.
INSERT INTO role_permissions (role_id, permission_id, company_id)
SELECT rp.role_id, p.id, rp.company_id
  FROM role_permissions rp
  JOIN permissions sumber ON sumber.id = rp.permission_id AND sumber.key = 'workers:manage'
  CROSS JOIN permissions p
 WHERE p.key IN ('mitra:view', 'mitra:manage')
ON CONFLICT DO NOTHING;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n int; v_hitam int; v_warisan int;
BEGIN
  SELECT count(*) INTO v_n FROM permissions
   WHERE key IN ('mitra:view', 'mitra:manage', 'mitra:daftar_hitam');
  IF v_n <> 3 THEN
    RAISE EXCEPTION '462 gagal: % dari 3 izin mitra terpasang — kunci yang hilang '
      'menolak SEMUA orang tanpa satu pun gejala', v_n;
  END IF;

  -- sort_order tak boleh bentrok — migrasi 455 pernah menabrak nomor terpakai.
  SELECT count(*) INTO v_n FROM (
    SELECT sort_order FROM permissions WHERE module = 'mandor'
     GROUP BY sort_order HAVING count(*) > 1) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION '462 gagal: % sort_order bentrok di modul mandor — '
      'urutan layar Peran jadi tak tentu', v_n;
  END IF;

  -- Daftar hitam TIDAK boleh terwarisi otomatis.
  SELECT count(*) INTO v_hitam FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'mitra:daftar_hitam';
  IF v_hitam > 0 THEN
    RAISE EXCEPTION '462 gagal: % peran mendapat mitra:daftar_hitam dari migrasi — '
      'keputusan melarang pihak lain berbisnis muncul tanpa ada yang memutuskan', v_hitam;
  END IF;

  SELECT count(*) INTO v_warisan FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'mitra:view';
  RAISE NOTICE '462 OK — 3 izin mitra terpasang, % peran mewarisi mitra:view, '
    'daftar_hitam TIDAK diwariskan', v_warisan;
END $$;
