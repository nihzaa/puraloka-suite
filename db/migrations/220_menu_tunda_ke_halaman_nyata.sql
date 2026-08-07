-- ════════════════════════════════════════════════════════════════════════════
-- 220 — 20 menu masih menunjuk "segera hadir" padahal halamannya SUDAH JADI
--
-- ── Cacat yang diperbaiki
--
-- Seluruh 25 item TUNDA diselesaikan 2026-08-07 (F5-1 §5): halaman, endpoint,
-- pustaka, test, penjaga invarian — semuanya. Yang TIDAK dikerjakan: memindahkan
-- entri menunya dari `/m/<key>` (halaman placeholder "belum digarap") ke halaman
-- yang baru dibangun itu.
--
-- Akibatnya empat halaman jadi menjadi YATIM — tak bisa dicapai kecuali dengan
-- mengetik URL langsung:
--
--     /jadwal            ← jd-cpm, jd-histogram, jd-method, md-kalender
--     /kepatuhan         ← sk-evaluasi, sk-kepatuhan, lp-permit
--     /aset/operasional  ← lp-alat, as-maintenance, as-opex, as-gl
--     /dokumen/kendali   ← dk-transmittal, dk-gambar, dk-notulen,
--                          dk-distribusi, dk-esign, bi-terjadwal
--     /procurement/lanjutan ← pr-blanket, pr-expediting, tg-nota-kredit
--
-- Dan lebih buruk daripada sekadar tak terjangkau: pengguna yang mengklik
-- "Jalur Kritis (CPM)" di sidebar mendarat di halaman yang **menyatakan fitur
-- itu belum ada** — padahal ada. Fitur yang sudah dibayar tampak belum dibangun.
--
-- ── Kenapa ini bukan kelalaian sekali-dua kali
--
-- Pola migrasi ini sudah dipakai 14 kali (156, 157, 159, 174, 188, 189, 192,
-- 193, 195, 197, 198, 199, 200, 203) — jadi caranya diketahui betul. Yang tak
-- ada adalah PENJAGA yang menanyakan "halaman ini bisa dicapai dari mana?".
--
-- `gen-migrasi-menu.mjs` bahkan sudah meramalkan kelas cacat ini secara harfiah:
--   "menu bisa muncul tanpa halaman atau sebaliknya."
-- Risikonya diprediksi, generatornya ditulis, penjaganya tidak.
--
-- Penjaga itu ditambahkan bersama migrasi ini: `audit-nav-yatim.mjs`.
--
-- ── Idempoten
--
-- `UPDATE ... WHERE key = ...` menetapkan nilai akhir, bukan menambah. Dijalankan
-- berapa kali pun hasilnya sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Jadwal & kalender ───────────────────────────────────────────────────────
UPDATE menu_items SET href = '/jadwal' WHERE key = 'jd-cpm';
UPDATE menu_items SET href = '/jadwal' WHERE key = 'jd-histogram';
UPDATE menu_items SET href = '/jadwal' WHERE key = 'jd-method';
UPDATE menu_items SET href = '/jadwal' WHERE key = 'md-kalender';

-- ── Kepatuhan & K3 ──────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/kepatuhan' WHERE key = 'sk-evaluasi';
UPDATE menu_items SET href = '/kepatuhan' WHERE key = 'sk-kepatuhan';
UPDATE menu_items SET href = '/kepatuhan' WHERE key = 'lp-permit';

-- ── Operasional alat ────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/aset/operasional' WHERE key = 'lp-alat';
UPDATE menu_items SET href = '/aset/operasional' WHERE key = 'as-maintenance';
UPDATE menu_items SET href = '/aset/operasional' WHERE key = 'as-opex';
UPDATE menu_items SET href = '/aset/operasional' WHERE key = 'as-gl';

-- ── Kendali dokumen ─────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/dokumen/kendali' WHERE key = 'dk-transmittal';
UPDATE menu_items SET href = '/dokumen/kendali' WHERE key = 'dk-gambar';
UPDATE menu_items SET href = '/dokumen/kendali' WHERE key = 'dk-notulen';
UPDATE menu_items SET href = '/dokumen/kendali' WHERE key = 'dk-distribusi';
UPDATE menu_items SET href = '/dokumen/kendali' WHERE key = 'dk-esign';
UPDATE menu_items SET href = '/dokumen/kendali' WHERE key = 'bi-terjadwal';

-- ── Pengadaan lanjutan (kontrak payung, expediting, nota kredit) ────────────
--
-- Key-nya TIDAK seragam dengan yang lain: `pr-blanket` (bukan `pr-payung`), dan
-- nota kredit hidup di kelompok Tagihan (`tg-`), bukan Pengadaan. Versi pertama
-- migrasi ini memakai key tebakan `pg-payung`/`pg-expediting`/`pg-nota-kredit`
-- yang TAK SATU PUN ADA — UPDATE-nya akan mengenai nol baris, tanpa galat, dan
-- `/procurement/lanjutan` tetap yatim. Key di bawah dibaca dari DB, bukan
-- ditebak dari nama halaman; blok verifikasi di akhir yang membuktikannya.
UPDATE menu_items SET href = '/procurement/lanjutan' WHERE key = 'pr-blanket';
UPDATE menu_items SET href = '/procurement/lanjutan' WHERE key = 'pr-expediting';
UPDATE menu_items SET href = '/procurement/lanjutan' WHERE key = 'tg-nota-kredit';

-- ------------------------------------------------------------
-- Verifikasi — gagal keras kalau masih ada yang tertinggal.
--
-- Tanpa blok ini, satu key salah ketik akan lolos senyap dan meninggalkan
-- satu halaman tetap yatim — persis cacat yang migrasi ini perbaiki.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_masih_placeholder TEXT;
  v_key_hilang        TEXT;
  -- Satu daftar, dipakai dua pemeriksaan. Menyalinnya dua kali mengundang
  -- keduanya menyimpang diam-diam saat salah satu disunting.
  v_kunci TEXT[] := ARRAY[
    'jd-cpm','jd-histogram','jd-method','md-kalender',
    'sk-evaluasi','sk-kepatuhan','lp-permit',
    'lp-alat','as-maintenance','as-opex','as-gl',
    'dk-transmittal','dk-gambar','dk-notulen','dk-distribusi','dk-esign',
    'bi-terjadwal','pr-blanket','pr-expediting','tg-nota-kredit'];
BEGIN
  -- 1. Key yang TIDAK ADA tak akan pernah muncul di pemeriksaan (2): UPDATE
  --    terhadap key karangan mengenai nol baris TANPA galat. Inilah yang
  --    menangkap tebakan `pg-payung`/`pg-expediting`/`pg-nota-kredit` di versi
  --    pertama migrasi ini — ketiganya tak ada, dan tanpa pemeriksaan ini
  --    `/procurement/lanjutan` akan tetap yatim sambil migrasi melapor sukses.
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_key_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);

  IF v_key_hilang IS NOT NULL THEN
    RAISE EXCEPTION '220 gagal: key menu tidak ada di menu_items: %', v_key_hilang;
  END IF;

  -- 2. Tak satu pun boleh tersisa menunjuk halaman "segera hadir".
  SELECT string_agg(key || ' -> ' || href, ', ' ORDER BY key)
    INTO v_masih_placeholder
    FROM menu_items
   WHERE is_active AND href LIKE '/m/%' AND key = ANY(v_kunci);

  IF v_masih_placeholder IS NOT NULL THEN
    RAISE EXCEPTION '220 gagal: masih menunjuk halaman "segera hadir": %', v_masih_placeholder;
  END IF;
END $$;
