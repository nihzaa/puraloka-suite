-- ════════════════════════════════════════════════════════════════════════════
-- 226 — Empat menu terakhir yang masih bilang "segera hadir"
--
-- ── Bagaimana ini ditemukan
--
-- Penjaga baru `audit-peta-menu-vs-db.mjs` membandingkan `peta-menu.ts` dengan
-- `menu_items`, dan menemukan empat key yang **peta-nya sudah menyebut halaman
-- nyata** sementara DB masih menunjuk `/m/<key>`:
--
--     md-coa             peta: /akuntansi                 DB: /m/md-coa
--     md-prakualifikasi  peta: /procurement/kualifikasi   DB: /m/md-prakualifikasi
--     pr-evaluasi        peta: /procurement/kualifikasi   DB: /m/pr-evaluasi
--     tg-ipc             peta: /keuangan/ipc              DB: /m/tg-ipc
--
-- Kelas cacat yang sama dengan migrasi 220: halamannya jadi, menunya masih
-- menyatakan fiturnya belum digarap. `md-coa` paling parah — catatannya bahkan
-- berbunyi "migrasi 047 sengaja belum di-apply", padahal 047 DIPENSIUNKAN
-- lewat R-001 dan bagan akun hidup dengan 38 baris.
--
-- Empat kali sisa ini lolos migrasi 220 karena 220 bekerja dari daftar TUNDA,
-- bukan dari perbandingan menyeluruh. Penjaga inilah yang menutup celahnya —
-- dan ia sekarang berjalan di CI.
--
-- ── Yang TIDAK ikut
--
-- Sisa selisih (19 key ber-`/proyek` di peta, `/m/<key>` di DB) SENGAJA:
-- migrasi 224 mengarahkannya ke pemilih proyek justru karena `/proyek` adalah
-- daftar, bukan isinya. Peta-nya yang akan menyusul, bukan sebaliknya.
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items SET href = '/akuntansi'                WHERE key = 'md-coa';
UPDATE menu_items SET href = '/procurement/kualifikasi'  WHERE key = 'md-prakualifikasi';
UPDATE menu_items SET href = '/procurement/kualifikasi'  WHERE key = 'pr-evaluasi';
UPDATE menu_items SET href = '/keuangan/ipc'             WHERE key = 'tg-ipc';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_sisa   TEXT;
  v_kunci  TEXT[] := ARRAY['md-coa','md-prakualifikasi','pr-evaluasi','tg-ipc'];
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);
  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '226 gagal: key menu tidak ada: %', v_hilang;
  END IF;

  SELECT string_agg(key || ' -> ' || href, ', ' ORDER BY key) INTO v_sisa
    FROM menu_items
   WHERE is_active AND key = ANY(v_kunci) AND href LIKE '/m/%';
  IF v_sisa IS NOT NULL THEN
    RAISE EXCEPTION '226 gagal: masih "segera hadir": %', v_sisa;
  END IF;
END $$;
