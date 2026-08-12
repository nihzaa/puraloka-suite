-- ════════════════════════════════════════════════════════════════════════════
-- 329 — Menu SPK (E1) + memulihkan href opname yang hilang
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Dua hal, satu migrasi, karena keduanya soal yang sama
--
-- 1. `sk-wo` ("Work Order") sudah ada sejak lama: `is_active = false`,
--    `href = '/mandor'`. Halaman yang dijanjikannya tak pernah dibuat —
--    pola yang sama dengan `sk-opname` (D1) dan tabel `field_opname_reports`.
--
-- 2. `sk-opname` yang dihidupkan migrasi 326 kini ber-`href` NULL. Migrasi
--    itu lulus verifikasinya sendiri, jadi nilainya hilang SESUDAHNYA.
--
-- Yang kedua patut dicatat: item aktif ber-href null tetap dirender sidebar
-- sebagai tautan yang tak menuju ke mana pun. Tak ada galat, tak ada halaman
-- 404 — hanya menu yang diam saat diklik, dan itu terbaca sebagai "fitur
-- rusak" oleh yang mencobanya.
--
-- Verifikasi di bawah karena itu menuntut href NOT NULL untuk kedua menu,
-- bukan hanya keberadaan barisnya.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. SPK ──────────────────────────────────────────────────────────────────
UPDATE menu_items
   SET href = '/mandor/spk',
       label = 'Surat Perintah Kerja',
       icon = 'FileSignature',
       is_active = TRUE,
       required_permissions = ARRAY['mandor:view']::text[],
       parent_id = (SELECT parent_id FROM menu_items WHERE key = 'mandor-penugasan' LIMIT 1),
       -- 810: grup terisi 801-809 (mandor … sk-opname). Diukur, bukan ditebak
       -- — migrasi 326 sempat memakai 804 dan bentrok dengan `mandor-upah`.
       sort_order = 810
 WHERE key = 'sk-wo';

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'sk-wo',
       'Surat Perintah Kerja',
       '/mandor/spk',
       'FileSignature',
       (SELECT parent_id FROM menu_items WHERE key = 'mandor-penugasan' LIMIT 1),
       ARRAY['mandor:view']::text[],
       810,
       (SELECT section FROM menu_items WHERE key = 'mandor-penugasan' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'sk-wo');

-- ── 2. Pulihkan href opname ─────────────────────────────────────────────────
UPDATE menu_items
   SET href = '/mandor/opname'
 WHERE key = 'sk-opname' AND (href IS NULL OR href <> '/mandor/opname');

-- ── 3. `sk-kontrak` — dinonaktifkan dengan sadar ────────────────────────────
--
-- Entri lama "Kontrak & BOQ Subkon" menunjuk `/mandor` (halaman induk) dan
-- sudah nonaktif. Sekarang SPK memuat isi kontraknya, jadi entri itu
-- DIBIARKAN nonaktif — bukan diarahkan ke /mandor/spk.
--
-- Dua menu aktif ke satu rute melanggar aturan 232 (satu rute = satu tautan),
-- dan penjaga `audit-menu-berbagi-href` menabraknya. Yang tersisa dari
-- entri itu — BOQ subkon berharga-satuan — memang belum dibangun.
UPDATE menu_items SET is_active = FALSE WHERE key = 'sk-kontrak';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  -- href NOT NULL untuk KEDUANYA. Item aktif ber-href null dirender sidebar
  -- sebagai tautan yang diam saat diklik — terbaca sebagai fitur rusak.
  FOR n IN
    SELECT 1 FROM menu_items
     WHERE key IN ('sk-wo', 'sk-opname') AND is_active AND href IS NULL
  LOOP
    RAISE EXCEPTION '329 gagal: ada menu aktif ber-href NULL — tautan yang diam saat diklik';
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM menu_items WHERE key = 'sk-wo' AND is_active AND href = '/mandor/spk'
  ) THEN
    RAISE EXCEPTION '329 gagal: menu sk-wo tak aktif atau href-nya salah';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM menu_items WHERE key = 'sk-opname' AND is_active AND href = '/mandor/opname'
  ) THEN
    RAISE EXCEPTION '329 gagal: href sk-opname tak pulih';
  END IF;

  -- Induk WAJIB aktif (pelajaran 326: dua grup berlabel sama, satu mati).
  FOR n IN
    SELECT 1 FROM menu_items m
      LEFT JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key IN ('sk-wo', 'sk-opname')
       AND (p.id IS NULL OR NOT p.is_active)
  LOOP
    RAISE EXCEPTION '329 gagal: induk menu nonaktif — itemnya akan menggantung di sidebar';
  END LOOP;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/mandor/spk';
  IF n <> 1 THEN
    RAISE EXCEPTION '329 gagal: % menu aktif menunjuk /mandor/spk (harus 1)', n;
  END IF;

  -- `sort_order` tak boleh bentrok dalam satu grup.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.is_active
     AND m.parent_id = (SELECT parent_id FROM menu_items WHERE key = 'sk-wo' LIMIT 1)
     AND m.sort_order = (SELECT sort_order FROM menu_items WHERE key = 'sk-wo' LIMIT 1);
  IF n <> 1 THEN
    RAISE EXCEPTION '329 gagal: % item aktif ber-sort_order sama di grup itu (harus 1)', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'spk:tandatangan') THEN
    RAISE EXCEPTION '329 gagal: izin spk:tandatangan tak ada — jalankan migrasi 328 lebih dulu';
  END IF;

  RAISE NOTICE '329 OK — /mandor/spk punya menunya; href sk-opname dipulihkan';
END $$;
