-- ============================================================================
-- 569 — satu entri menu baru: Komitmen Biaya
-- ============================================================================
--
-- ── Kenapa migrasi BARU, bukan meregenerasi 153
--
-- `gen-migrasi-menu.mjs` meregenerasi `153_peta_menu_penuh.sql` dari
-- `apps/web/lib/peta-menu.ts`. Dijalankan 2026-09-12, ia menghasilkan diff
-- **260 sisipan / 174 hapusan** pada migrasi yang SUDAH TERCATAT JALAN di
-- `supabase_migrations.schema_migrations` (entri `153`, terverifikasi).
--
-- Menyuntingnya adalah Gerbang Keras G-2: replay CI akan menghasilkan
-- keadaan yang BERBEDA dari produksi, dan selisihnya tak berbunyi di mana
-- pun. Perubahannya dibatalkan (`git checkout`), dan yang baru ditulis
-- sebagai migrasi maju — pola yang sudah ditetapkan CLAUDE.md §5.5.
--
-- ⚠ Generator itu berguna untuk memasang peta menu dari NOL (basis baru).
-- Ia BUKAN alat untuk menambah satu entri ke basis yang sudah hidup.
-- Siapa pun yang menjalankannya di basis berjalan wajib membuang hasilnya.
--
-- ── Yang ditambahkan
--
-- Satu sub-menu di grup **Estimasi & Anggaran** (`g-anggaran`) — grup yang
-- sama dengan saudaranya `keu-cvr`, BUKAN `g-keuangan`.
--
-- ⚠ Versi pertama berkas ini menulis `g-keuangan` dari dugaan (nama
-- entrinya berawalan `keu-`). Diperiksa ke `peta-menu.ts`: `keu-cvr` ada
-- di `g-anggaran`. Awalan kunci BUKAN penanda grup — dan menempatkannya
-- di grup yang salah menghasilkan menu yang ada tetapi tak ditemukan
-- orang yang mencarinya di sebelah CVR.
--
-- Komitmen per-proyek sudah ada sejak lama (`cost-control.ts` →
-- `/estimasi/varians`). Yang belum: pandangan seluruh perusahaan —
-- `/cost-analytics/portfolio` tak memuat komitmen sama sekali, sehingga
-- "berapa total uang yang sedang terikat PO" hanya bisa dijawab dengan
-- membuka proyek satu per satu.
--
-- ── Izin
--
-- `projects:view`, disalin dari gerbang rutenya
-- (`GET /api/v1/komitmen/*` memakai `requirePermission('projects:view')`).
-- Menu yang lebih longgar daripada rutenya menghasilkan pintu yang
-- terlihat lalu menolak — dan itu lebih buruk daripada pintu yang tak ada.
-- ============================================================================

-- Idempoten: dijalankan ulang tak menggandakan apa pun.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT
  'keu-komitmen',
  'Komitmen Biaya',
  '/keuangan/komitmen',
  'Dot',
  induk.id,
  ARRAY['projects:view']::text[],
  /*
    Ditaruh TEPAT SESUDAH saudara terdekatnya (CVR), bukan di akhir daftar.
    Keduanya menjawab pertanyaan yang bertetangga — "pekerjaan mana yang
    merugi" dan "uang mana yang sudah terikat" — dan menu yang
    mengelompokkan hal serupa lebih cepat dipindai daripada menu yang
    menambahkan di ekor.
  */
  COALESCE(saudara.sort_order, 0) + 1,
  COALESCE(saudara.section, 'main'),
  true
FROM menu_items induk
LEFT JOIN menu_items saudara ON saudara.key = 'keu-cvr'
WHERE induk.key = 'g-anggaran'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'keu-komitmen');

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_entri  INT;
  n_induk  INT;
  n_izin   INT;
BEGIN
  SELECT count(*) INTO n_induk FROM menu_items WHERE key = 'g-anggaran';
  IF n_induk = 0 THEN
    /*
      Basis bersih/CI belum tentu punya peta menu. Itu bukan kegagalan —
      migrasi 153 yang memasangnya, dan urutan replay menjamin ia lebih
      dulu. Kalau toh tak ada, lebih baik dilewati daripada menggagalkan
      seluruh rantai karena satu baris menu.
    */
    RAISE NOTICE '569 dilewati — grup g-anggaran belum ada (basis bersih)';
    RETURN;
  END IF;

  SELECT count(*) INTO n_entri FROM menu_items WHERE key = 'keu-komitmen';
  IF n_entri <> 1 THEN
    RAISE EXCEPTION '569 gagal: entri keu-komitmen ada % baris, seharusnya 1', n_entri;
  END IF;

  /*
    Arah KEDUA: izinnya wajib benar-benar terpasang.

    Entri menu tanpa `required_permissions` terlihat oleh SEMUA orang —
    termasuk klien. Memeriksa barisnya ada tanpa memeriksa izinnya adalah
    verifikasi yang lolos pada keadaan yang salah.
  */
  SELECT count(*) INTO n_izin
    FROM menu_items
   WHERE key = 'keu-komitmen'
     AND 'projects:view' = ANY(required_permissions);

  IF n_izin <> 1 THEN
    RAISE EXCEPTION '569 gagal: keu-komitmen tak berizin projects:view';
  END IF;

  RAISE NOTICE '569 OK — menu Komitmen Biaya terpasang di grup Estimasi & Anggaran';
END $$;
