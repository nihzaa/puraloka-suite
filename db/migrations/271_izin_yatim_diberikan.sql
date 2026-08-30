-- ============================================================================
-- 271 — IZIN YATIM: permission yang dibuat tapi tak dipegang siapa pun
-- ============================================================================
--
-- ── Cacat yang ditemukan lewat TANGKAPAN LAYAR, bukan lewat test
--
-- Panel template WhatsApp (S4) selesai, typecheck bersih, test hijau. Lalu
-- gambarnya dilihat: saklar "Aktif" tak ada di satu pun template.
--
-- Sebabnya bukan CSS. Migrasi 270 MEMBUAT `settings:wa:template` tetapi tak
-- memberikannya ke peran mana pun. Akibatnya:
--
--   · UI menyembunyikan seluruh kontrol ubah (`bolehUbah` false)
--   · API membalas 403 untuk tiap PUT
--   · dan TAK ADA satu pun galat yang menunjuk sebabnya
--
-- Fiturnya utuh, teruji, terdokumentasi — dan mati. Termasuk untuk founder.
-- Inilah bentuk "kolom DB sudah ada bukan berarti selesai" (CLAUDE.md §8)
-- pada lapisan izin.
--
-- ── Yang kedua, dan lebih berbahaya karena TAK TERLIHAT DI SINI
--
-- `ai:tulis` (migrasi 269) juga tak pernah diberikan lewat migrasi. Ia
-- berfungsi di mesin ini hanya karena saya memberikannya DENGAN TANGAN saat
-- menguji. Di lingkungan bersih — CI, mesin lain, deploy — ia yatim juga, dan
-- gejalanya akan muncul jauh dari sebabnya: "tombol Catat tak pernah ada".
--
-- Pelajaran yang sama dengan buku migrasi (§5.5): keadaan yang lahir dari
-- tindakan manual di satu mesin bukan keadaan sistem. Kalau ia perlu ada,
-- migrasi yang harus membuatnya.
--
-- ── Kenapa hanya ke peran `admin`
--
-- Peran adalah data konfigurasi per-tenant (ADR-004). Migrasi tak boleh
-- memutuskan siapa yang boleh apa untuk selamanya — yang dilakukan di sini
-- hanya memastikan izin baru punya SATU pemegang awal, supaya fiturnya bisa
-- dicapai dan sisanya diatur lewat UI peran.
--
-- `admin` dipilih karena ia satu-satunya peran yang sudah memegang
-- `settings:wa:manage` — yang bisa mendaftarkan nomor sudah pasti perlu bisa
-- mengubah teks yang dikirim ke nomor itu.
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
 CROSS JOIN permissions p
 WHERE r.name = 'admin'
   AND p.key IN ('settings:wa:template', 'ai:tulis')
ON CONFLICT DO NOTHING;

/*
  PEMBERIAN MENYELURUH — ditambahkan 2026-08-31.

  ── Kenapa dua baris di atas tidak cukup

  Verifikasi di bawah memeriksa SELURUH modul `ai` dan `settings`, sementara
  pemberian di atas menyebut dua kunci. Selama ini keduanya tampak sepakat
  karena di basis dev izin lain sudah diberikan LEWAT UI — tindakan manual di
  satu mesin, persis yang kepala berkas ini peringatkan.

  Di CI, tempat tak ada yang pernah mengklik apa pun, jaraknya terlihat:

      HARD FAIL — 271_izin_yatim_diberikan.sql
        masih ada izin yatim di modul ai/settings: ai:setujui,
        settings:ai:batas, settings:penyedia:view, settings:penyedia:manage

  Keempatnya lahir dari migrasi 260 dan 266 — sebelum berkas ini — dan tak
  satu pun migrasi memberikannya ke peran mana pun.

  Jadi migrasi ini menuntut sesuatu yang tak ia kerjakan sendiri. Yang benar
  bukan melonggarkan verifikasinya, melainkan menyamakan pemberiannya dengan
  apa yang ia periksa.

  ── Tetap tunduk ADR-004

  Yang diberikan hanya SATU pemegang awal, ke peran `admin`, supaya fiturnya
  bisa dicapai; sisanya diatur lewat UI peran. Migrasi tidak memutuskan siapa
  boleh apa untuk selamanya — alasan lengkapnya di kepala berkas.
*/
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
 CROSS JOIN permissions p
 WHERE r.name = 'admin'
   AND p.module IN ('ai', 'settings')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int; yatim TEXT;
BEGIN
  -- Keduanya WAJIB punya pemegang. Kalau tidak, fiturnya mati diam-diam.
  SELECT count(*) INTO n
    FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
   WHERE p.key IN ('settings:wa:template', 'ai:tulis');
  IF n < 2 THEN
    RAISE EXCEPTION '271 gagal: izin baru masih yatim (% pemberian dari minimal 2)', n;
  END IF;

  /*
   * Dan TAK BOLEH ADA yatim lain di modul yang izinnya lahir sesi ini.
   *
   * Diperiksa menyeluruh, bukan hanya dua kunci di atas: cacat ini bentuknya
   * "lupa satu baris di migrasi", dan yang lupa sekali akan lupa lagi. Kalau
   * pemeriksaannya hanya menyebut nama yang sudah diketahui, ia tak akan
   * pernah menemukan yang berikutnya.
   */
  SELECT string_agg(p.key, ', ') INTO yatim
    FROM permissions p
   WHERE p.module IN ('ai', 'settings')
     AND NOT EXISTS (
       SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id);
  IF yatim IS NOT NULL THEN
    RAISE EXCEPTION '271 gagal: masih ada izin yatim di modul ai/settings: %', yatim;
  END IF;
END $$;
