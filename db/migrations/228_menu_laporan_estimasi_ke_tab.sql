-- ════════════════════════════════════════════════════════════════════════════
-- 228 — 19 menu mendarat di tab pertama, bukan tab yang mereka janjikan
--
-- ── Cacat yang diperbaiki (sisa T-3 terbesar)
--
-- `/laporan` dipakai 8 item menu, `/estimasi` dipakai 11 — dan keduanya selalu
-- membuka tab pertamanya. Jadi yang mengklik "WIP / PSAK" melihat Ringkasan
-- Proyek; yang mengklik "Price Book" melihat Komposer.
--
-- Isinya ADA, satu klik lagi. Tapi orang harus menebak tab mana dari sembilan
-- yang tersedia — dan sesudah dua-tiga kali menebak salah, ia berhenti memakai
-- sub-menu sama sekali.
--
-- ── Kenapa baru sekarang bisa
--
-- Sampai hari ini tab disimpan di `useState`, jadi `?tab=` akan MENJANJIKAN
-- sesuatu yang tak dibaca kode — lebih buruk daripada tidak menunjuknya.
-- `lib/use-tab-url.ts` mengubahnya, dan kedua halaman sudah memakainya.
--
-- Dibuktikan di peramban (`uji-tab-dari-url.mjs`), bukan diasumsikan:
-- `?tab=wip` memilih tab WIP, `?tab=varians` memilih Varians Biaya, dan
-- `?tab=ngawur` tak merusak halaman.
--
-- ── Pemetaan dibaca dari kode, bukan ditebak dari nama
--
-- Tab `/laporan`  : ringkasan · keuangan · cashflow · mandor · pengeluaran ·
--                   progress · pajak · portofolio · wip
-- Tab `/estimasi` : komposer · katalog · harga · rap · cashflow · varians
--
-- Yang TIDAK punya tab yang cocok dibiarkan menunjuk halaman induknya —
-- menebak tab hanya memindahkan tebakan dari pengguna ke saya.
--
--   bi-export      "Ekspor Excel & PDF"   → tombol di tiap tab, bukan tab
--   bi-kpi         "KPI Perusahaan"       → belum ada tabnya
--   cc-acl         "Actual Cost Ledger"   → belum ada tabnya
--   cc-commitment  "Commitment Tracking"  → belum ada tabnya
--   crm-boq        "Quantity Takeoff"     → bagian dari Komposer, tanpa tab
--   md-cost-code   "Cost Code / CBS"      → tersebar, bukan satu tab
--   sy-import      "Impor & Ekspor Data"  → tombol, bukan tab
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── /laporan ────────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/laporan?tab=wip'        WHERE key = 'cc-wip';
UPDATE menu_items SET href = '/laporan?tab=wip'        WHERE key = 'fn-wip';
UPDATE menu_items SET href = '/laporan?tab=pajak'      WHERE key = 'fn-pajak';
UPDATE menu_items SET href = '/laporan?tab=pajak'      WHERE key = 'fn-efaktur';
UPDATE menu_items SET href = '/laporan?tab=portofolio' WHERE key = 'bi-portofolio';

-- ── /estimasi ───────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/estimasi?tab=harga'    WHERE key = 'md-price-book';
UPDATE menu_items SET href = '/estimasi?tab=katalog'  WHERE key = 'md-resource';
UPDATE menu_items SET href = '/estimasi?tab=katalog'  WHERE key = 'crm-estimating';
UPDATE menu_items SET href = '/estimasi?tab=rap'      WHERE key = 'cc-rap';
UPDATE menu_items SET href = '/estimasi?tab=cashflow' WHERE key = 'cc-cashflow';
UPDATE menu_items SET href = '/estimasi?tab=varians'  WHERE key = 'cc-varians';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_salah  TEXT;
  v_kunci  TEXT[] := ARRAY[
    'cc-wip','fn-wip','fn-pajak','fn-efaktur','bi-portofolio',
    'md-price-book','md-resource','crm-estimating','cc-rap','cc-cashflow','cc-varians'];
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);
  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '228 gagal: key menu tidak ada: %', v_hilang;
  END IF;

  -- Tab di luar daftar sah DIABAIKAN halaman tanpa galat, dan menunya diam-diam
  -- kembali ke tab pertama — persis cacat yang migrasi ini perbaiki.
  SELECT string_agg(key || ' -> ' || href, ', ' ORDER BY key) INTO v_salah
    FROM menu_items
   WHERE key = ANY(v_kunci)
     AND NOT (
       (href LIKE '/laporan?tab=%'  AND split_part(href, 'tab=', 2) IN
          ('ringkasan','keuangan','cashflow','mandor','pengeluaran','progress','pajak','portofolio','wip'))
       OR
       (href LIKE '/estimasi?tab=%' AND split_part(href, 'tab=', 2) IN
          ('komposer','katalog','harga','rap','cashflow','varians')));
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION '228 gagal: tab di luar daftar sah: %', v_salah;
  END IF;
END $$;
